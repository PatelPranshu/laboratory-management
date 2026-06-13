const pdfmake = require('pdfmake');
const https = require('https');
const http = require('http');
const { evaluatePatientResult } = require('../utils/resultEvaluator');

const path = require('path');
const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../node_modules/pdfmake/fonts/Roboto/Roboto-Regular.ttf'),
    bold: path.join(__dirname, '../node_modules/pdfmake/fonts/Roboto/Roboto-Medium.ttf'),
    italics: path.join(__dirname, '../node_modules/pdfmake/fonts/Roboto/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, '../node_modules/pdfmake/fonts/Roboto/Roboto-MediumItalic.ttf')
  }
};

pdfmake.setFonts(fonts);
pdfmake.setUrlAccessPolicy(function () { return false; });

/**
 * Downloads an image from a URL and returns it as a base64 data URI.
 * Only PNG and JPEG are supported by pdfkit.
 * Returns null if download fails or format is unsupported.
 */
function downloadImageAsBase64(url) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      // Strictly whitelist Cloudinary to prevent SSRF vulnerabilities
      if (parsedUrl.hostname !== 'res.cloudinary.com') {
        console.warn(`[SECURITY] Blocked SSRF attempt: URL domain not whitelisted: ${parsedUrl.hostname}`);
        return resolve(null);
      }
    } catch (err) {
      console.warn(`Invalid image URL format: ${url}`);
      return resolve(null);
    }

    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      // Follow redirects, but the recursive call will automatically validate the new location against the whitelist
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImageAsBase64(response.headers.location).then(resolve);
      }
      if (response.statusCode !== 200) {
        console.warn(`Failed to download image: HTTP ${response.statusCode} for ${url}`);
        return resolve(null);
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);

        // Detect actual image format from magic bytes (don't trust content-type header)
        let mimeType = null;
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
          mimeType = 'image/png';
        } else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
          mimeType = 'image/jpeg';
        } else {
          console.warn(`Unsupported image format for PDF (only PNG/JPEG supported). URL: ${url}`);
          return resolve(null);
        }

        const base64 = buffer.toString('base64');
        resolve(`data:${mimeType};base64,${base64}`);
      });
      response.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

/**
 * Robust numeric check for abnormality using structured bounds.
 * Returns true if result is outside [min, max].
 */
function checkNumericAbnormal(resultStr, min, max) {
  if (min === null || max === null || !resultStr) return false;
  const match = resultStr.match(/([\d.]+)/);
  if (!match) return false;
  const val = parseFloat(match[1]);
  return val < min || val > max;
}

/**
 * Checks if a numeric result string falls outside a normal range string.
 * Legacy support for old string-based normal ranges.
 */
function isOutsideRangeLegacy(resultStr, normalRangeStr) {
  if (!resultStr || !normalRangeStr) return false;

  // Extract the first numeric value from the result string
  const resultMatch = resultStr.match(/([\d.]+)/);
  if (!resultMatch) return false; // Non-numeric result

  const resultNum = parseFloat(resultMatch[1]);
  if (isNaN(resultNum)) return false;

  // Try "min - max" pattern
  const rangeMatch = normalRangeStr.match(/([\d.]+)\s*[-–—]\s*([\d.]+)/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    return resultNum < min || resultNum > max;
  }

  // Try "< value" or "<= value"
  const ltMatch = normalRangeStr.match(/^\s*(<[=]?)\s*([\d.]+)/);
  if (ltMatch) {
    const threshold = parseFloat(ltMatch[2]);
    return ltMatch[1] === '<=' ? resultNum > threshold : resultNum >= threshold;
  }

  // Try "> value" or ">= value"
  const gtMatch = normalRangeStr.match(/^\s*(>[=]?)\s*([\d.]+)/);
  if (gtMatch) {
    const threshold = parseFloat(gtMatch[2]);
    return gtMatch[1] === '>=' ? resultNum < threshold : resultNum <= threshold;
  }

  return false;
}

exports.generateReportPdf = async (report, patient, settings) => {
  const content = [];
  
  // Layout preferences setup
  const lp = settings?.layoutPreferences || {};
  const ml = lp.marginLeft || 40;
  const mt = lp.marginTop || 40;
  const mr = lp.marginRight || 40;
  const mb = lp.marginBottom || 40;
  const fontSize = lp.fontSize || 12;

  const contentWidth = 595.28 - ml - mr;

  let headerImageData = null;
  let footerImageData = null;
  let signatureImageData = null;

  if (settings && settings.headerImageURL) {
    headerImageData = await downloadImageAsBase64(settings.headerImageURL);
  }
  if (settings && settings.footerImageURL) {
    footerImageData = await downloadImageAsBase64(settings.footerImageURL);
  }
  
  if (report.performedByLabTechId && report.performedByLabTechId.signatureUrl) {
    signatureImageData = await downloadImageAsBase64(report.performedByLabTechId.signatureUrl);
  }

  const sections = report.sections || [];
  const remarksByTemplate = {};

  const filteredSections = sections.filter((sec, sIdx) => {
    if (sec.text && sec.text.trim()) {
      const tid = sec.templateId ? sec.templateId.toString() : 'unassigned';
      if (!remarksByTemplate[tid]) remarksByTemplate[tid] = [];
      remarksByTemplate[tid].push({
        title: sec.sectionName ? sec.sectionName.trim().toUpperCase() : '',
        text: sec.text
      });
    }

    const params = sec.parameters || [];
    const valuesObj = (sec.values && typeof sec.values.toJSON === 'function') 
      ? sec.values.toJSON() 
      : (typeof sec.values === 'object' && sec.values !== null ? sec.values : {});
    
    const legacyCount = Object.keys(valuesObj).filter(k => k !== '_id' && k !== '$__' && k !== '$isNew' && k !== 'parameters').length;
    return params.length > 0 || legacyCount > 0;
  });

  const groupedBlocks = [];
  let currentBlock = null;

  filteredSections.forEach((sec) => {
    const currentTid = sec.templateId ? sec.templateId.toString() : 'unassigned';
    if (!currentBlock || currentBlock.templateId !== currentTid) {
      currentBlock = {
        templateId: currentTid,
        sections: []
      };
      groupedBlocks.push(currentBlock);
    }
    currentBlock.sections.push(sec);
  });

  if (groupedBlocks.length === 0) {
    groupedBlocks.push({ templateId: 'unassigned', sections: [] });
  }

  const reportDate = report.date ? new Date(report.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
  const reportId = report._id ? report._id.toString().slice(-6).toUpperCase() : 'N/A';

  groupedBlocks.forEach((block, blockIdx) => {
    let currentTemplateName = 'TEST RESULTS';
    if (block.templateId !== 'unassigned') {
      const tmpl = (report.templateIds || []).find(t => t && typeof t === 'object' && t._id && t._id.toString() === block.templateId);
      if (tmpl && tmpl.templateName) {
        currentTemplateName = tmpl.templateName.toUpperCase();
      }
    }

    if (headerImageData) {
      const headerConfig = {
        image: headerImageData,
        alignment: 'center',
        margin: [0, 0, 0, 20]
      };
      if (lp.headerHeight && lp.headerHeight > 0) {
        headerConfig.fit = [contentWidth, lp.headerHeight];
      } else {
        headerConfig.width = contentWidth;
      }
      if (blockIdx > 0) headerConfig.pageBreak = 'before';
      content.push(headerConfig);
    }

    const patientInfoTable = {
      table: {
        widths: ['20%', '30%', '20%', '30%'],
        body: [
          [
            { text: 'Patient Name:', bold: true, color: '#334155' },
            { text: (patient.name || 'N/A').toUpperCase(), bold: true },
            { text: 'Report ID:', bold: true, color: '#334155' },
            { text: reportId }
          ],
          [
            { text: 'Age / Gender:', bold: true, color: '#334155' },
            { text: `${patient.age || 'N/A'} / ${patient.gender || 'N/A'}` },
            { text: 'Report Date:', bold: true, color: '#334155' },
            { text: reportDate }
          ],
          [
            { text: 'Phone:', bold: true, color: '#334155' },
            { text: patient.phone || 'N/A' },
            { text: 'Referred By:', bold: true, color: '#334155' },
            { text: (report.referredBy || 'Self').toUpperCase(), bold: true }
          ],
          [
            { text: 'Test Name:', bold: true, color: '#334155' },
            { text: currentTemplateName, colSpan: 3, bold: true, color: '#0f172a' },
            {}, {}
          ]
        ]
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#cbd5e1',
        vLineColor: () => '#cbd5e1',
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 4,
        paddingBottom: () => 4
      },
      margin: [0, 5, 0, 15]
    };

    if (!headerImageData && blockIdx > 0) {
      patientInfoTable.pageBreak = 'before';
    }

    content.push(patientInfoTable);
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: 2, lineColor: '#1e293b' }] });
    content.push({text: '\n', fontSize: 5});

    block.sections.forEach((sec, sIdx) => {
      const isFirstSection = (sIdx === 0);
      const isLastSection = (sIdx === block.sections.length - 1);
      const sectionTableBody = [];

      if (isFirstSection) {
        sectionTableBody.push([
          { 
            text: currentTemplateName, 
            colSpan: 4, 
            alignment: 'center', 
            bold: true, 
            fillColor: '#e2e8f0', 
            color: '#0f172a',
            margin: [0, 4, 0, 4],
            fontSize: fontSize
          },
          {}, {}, {}
        ]);
        
        sectionTableBody.push([
          { text: 'TEST DESCRIPTION', bold: true, fillColor: '#f1f5f9', margin: [0, 2, 0, 2] },
          { text: 'RESULT', bold: true, fillColor: '#f1f5f9', margin: [0, 2, 0, 2] },
          { text: 'UNITS', bold: true, fillColor: '#f1f5f9', margin: [0, 2, 0, 2] },
          { text: 'NORMAL VALUES', bold: true, fillColor: '#f1f5f9', margin: [0, 2, 0, 2] }
        ]);
      }

      if (sec.sectionName || sec.methodology || sec.sampleType || sec.kitUsed) {
        const sectionTextChunks = [];
        if (sec.sectionName) {
          sectionTextChunks.push({ text: sec.sectionName.toUpperCase() });
        }
        
        const advSetup = [];
        if (sec.methodology) advSetup.push(`Methodology: ${sec.methodology}`);
        if (sec.sampleType) advSetup.push(`Sample: ${sec.sampleType}`);
        if (sec.kitUsed) advSetup.push(`Kit: ${sec.kitUsed}`);
        
        if (advSetup.length > 0) {
          sectionTextChunks.push({
            text: (sec.sectionName ? '\n  ' : '  ') + advSetup.join(', '),
            fontSize: Math.max(6, fontSize - 4),
            italics: true,
            color: '#64748b',
            bold: false
          });
        }

        sectionTableBody.push([
          { 
            text: sectionTextChunks, 
            colSpan: 4, 
            bold: true, 
            fillColor: '#f8fafc',
            color: '#0f172a',
            margin: [0, isFirstSection ? 2 : 6, 0, 2] 
          },
          {}, {}, {}
        ]);
      }

      const params = sec.parameters || [];
      if (params.length > 0) {
        params.forEach(p => {
          const resultStr = p.result || '';
          const unitsStr = p.units || '';

          const evaluation = evaluatePatientResult(resultStr, p, patient.gender);
          const normalRangeStr = evaluation.rangeDisplay;
          const isAbnormal = evaluation.isAbnormal;

          const resultCell = {
            text: resultStr,
            bold: isAbnormal,
            margin: [0, 0, 0, 0]
          };

          if (evaluation.critical) {
            resultCell.color = '#dc2626';
          }

          const paramTextChunks = [];
          paramTextChunks.push({ text: p.name || '' });
          
          const paramAdv = [];
          if (p.methodology) paramAdv.push(`Methodology: ${p.methodology}`);
          if (p.sampleType) paramAdv.push(`Sample: ${p.sampleType}`);
          if (p.kitUsed || p.kit) paramAdv.push(`Kit: ${p.kitUsed || p.kit}`);
          
          if (paramAdv.length > 0) {
            paramTextChunks.push({
              text: '\n  ' + paramAdv.join(', '),
              fontSize: Math.max(6, fontSize - 4),
              italics: true,
              color: '#64748b'
            });
          }

          sectionTableBody.push([
            { text: paramTextChunks, margin: [0, 0, 0, 0] },
            resultCell,
            { text: unitsStr, margin: [0, 0, 0, 0] },
            { text: normalRangeStr, fontSize: fontSize - 3, margin: [0, 0, 0, 0] }
          ]);
        });
      } else if (sec.values) {
        const valuesObj = (sec.values && typeof sec.values.toJSON === 'function') 
          ? sec.values.toJSON() 
          : (typeof sec.values === 'object' && sec.values !== null ? sec.values : {});

        for (const [key, val] of Object.entries(valuesObj)) {
          if (key === '_id' || key === '$__' || key === '$isNew' || key === 'parameters') continue;

          let resultStr = '';
          let normalRangeStr = '';

          if (typeof val === 'object' && val !== null) {
            resultStr = String(val.value || '');
            normalRangeStr = String(val.normalRange || '');
          } else {
            resultStr = String(val);
          }

          const isAbnormal = isOutsideRangeLegacy(resultStr, normalRangeStr);

          sectionTableBody.push([
            { text: String(key), margin: [0, 0, 0, 0] },
            { text: resultStr, bold: isAbnormal, margin: [0, 0, 0, 0] },
            { text: '', margin: [0, 0, 0, 0] },
            { text: normalRangeStr, fontSize: fontSize - 3, margin: [0, 0, 0, 0] }
          ]);
        }
      }

      content.push({
        stack: [
          {
            fontSize: fontSize - 1,
            table: {
              headerRows: isFirstSection ? 1 : 0, 
              widths: ['38%', '15%', '15%', '32%'], 
              body: sectionTableBody
            },
            layout: {
              hLineWidth: function (i, node) {
                if (isFirstSection && i === 0) return 1.5;
                if (isFirstSection && i === 1) return 1.5;
                if (!isFirstSection && i === 0) return 0;
                if (isLastSection && i === node.table.body.length) return 1.5;
                return 0.5;
              },
              vLineWidth: () => 0,
              hLineColor: function (i, node) {
                if (isFirstSection && i === 0) return '#475569';
                if (isFirstSection && i === 1) return '#475569';
                if (!isFirstSection && i === 0) return '#e2e8f0';
                if (isLastSection && i === node.table.body.length) return '#475569';
                return '#e2e8f0';
              },
              paddingLeft: () => 5,
              paddingRight: () => 5,
              paddingTop: () => 2,
              paddingBottom: () => 2
            }
          }
        ],
        margin: [0, isFirstSection ? 10 : 0, 0, isLastSection ? 10 : 0], 
        unbreakable: true
      });
    });

    const blockRemarks = remarksByTemplate[block.templateId];
    if (blockRemarks && blockRemarks.length > 0) {
      const remarksContent = [];
      remarksContent.push({ canvas: [{ type: 'line', x1: 0, y1: 5, x2: contentWidth, y2: 5, lineWidth: 0.5, lineColor: '#cbd5e1' }] });
      remarksContent.push({ text: 'REMARKS / OBSERVATIONS', style: 'subheader', margin: [0, 8, 0, 4], fontSize: fontSize - 2, color: '#64748b' });
      
      blockRemarks.forEach(rem => {
        const textParts = [];
        if (rem.title) {
          textParts.push({ text: `${rem.title}: `, bold: true, fontSize: fontSize - 1 });
        }
        textParts.push({ text: rem.text, fontSize: fontSize - 1 });

        remarksContent.push({
          text: textParts,
          margin: [0, 2, 0, 4]
        });
      });

      content.push({
        stack: remarksContent,
        unbreakable: true,
        margin: [0, 0, 0, 10]
      });
    }

    if (footerImageData) {
      const footerConfig = {
        image: footerImageData,
        alignment: 'center',
        margin: [0, 30, 0, 0]
      };
      if (lp.footerHeight && lp.footerHeight > 0) {
        footerConfig.fit = [contentWidth, lp.footerHeight];
      } else {
        footerConfig.width = contentWidth;
      }
      content.push(footerConfig);
    }

    const endOfReportBlock = [];

    endOfReportBlock.push({
        text: `*** END OF ${currentTemplateName} ***`,
        alignment: 'center',
        bold: true,
        margin: [0, 25, 0, 15],
        fontSize: fontSize - 2,
        color: '#475569'
    });

    if (signatureImageData && report.performedByLabTechId) {
        const signerName = (report.performedByLabTechId.fullName || report.performedByLabTechId.doctorName || report.performedBy || 'Authorized Signatory').toUpperCase();
        
        endOfReportBlock.push({
            columns: [
                { 
                    width: '*', 
                    text: 'Please correlate clinically. Partial reproduction of this report is not permitted.\nThis is an electronically generated and authenticated document.',
                    fontSize: fontSize - 4,
                    color: '#64748b',
                    italics: true,
                    margin: [0, 30, 10, 0]
                }, 
                {
                    width: 200,
                    alignment: 'center',
                    margin: [0, 10, 0, 0],
                    stack: [
                        { image: signatureImageData, fit: [120, 60], alignment: 'center' },
                        { text: signerName, fontSize: fontSize + 1, bold: true, color: '#1e293b' },
                        { text: 'PERFORMED BY / AUTHORIZED SIGNATORY', fontSize: fontSize - 4, color: '#64748b', margin: [0, 4, 0, 0], bold: true, characterSpacing: 0.5 }
                    ]
                }
            ]
        });
    } else {
        endOfReportBlock.push({
            text: 'Please correlate clinically. Partial reproduction of this report is not permitted.\nThis is an electronically generated document.',
            fontSize: fontSize - 4,
            color: '#64748b',
            italics: true,
            margin: [0, 10, 0, 0]
        });
    }

    content.push({
      stack: endOfReportBlock,
      unbreakable: true,
      margin: [0, 10, 0, 0]
    });

  });

  const docDefinition = {
    content: content,
    pageMargins: [ml, mt, mr, mb + 20], 
    footer: function(currentPage, pageCount) {
      return {
        columns: [
          { text: `Printed on: ${new Date().toLocaleString('en-IN')}`, alignment: 'left', fontSize: 8, color: '#94a3b8', margin: [ml, 0, 0, 0] },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 8, color: '#94a3b8', margin: [0, 0, mr, 0] }
        ],
        margin: [0, 10, 0, 0]
      };
    },
    styles: {
      header: { fontSize: fontSize + 6, bold: true },
      subheader: { fontSize: fontSize + 2, bold: true },
      patientInfo: { lineHeight: 1.4 }
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: fontSize
    }
  };

  const pdfDoc = pdfmake.createPdf(docDefinition);
  const buffer = await pdfDoc.getBuffer();
  return buffer;
};