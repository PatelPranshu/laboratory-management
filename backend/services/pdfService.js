const pdfmake = require('pdfmake');
const https = require('https');
const http = require('http');
const { evaluatePatientResult } = require('../utils/resultEvaluator');

const path = require('path');
const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../fonts/Roboto/Roboto-Regular.ttf'),
    bold: path.join(__dirname, '../fonts/Roboto/Roboto-Bold.ttf'),
    italics: path.join(__dirname, '../fonts/Roboto/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, '../fonts/Roboto/Roboto-BoldItalic.ttf')
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
  
  // Font sizes
  const baseFontSize = lp.fontSize || 12;
  const patientInfoFontSize = lp.patientInfoFontSize || baseFontSize;
  const templateInfoFontSize = lp.templateInfoFontSize || baseFontSize;
  const signatureFontSize = lp.signatureFontSize || baseFontSize;

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
  const reportId = report._id ? report._id.toString().slice(-12).toUpperCase() : '--';

  let reportIdBarcodeBase64 = null;
  if (reportId !== '--') {
    try {
      const bwipjs = require('bwip-js');
      const buffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: reportId,
        scale: 3,
        height: 10,
        includetext: false,
      });
      reportIdBarcodeBase64 = 'data:image/png;base64,' + buffer.toString('base64');
    } catch (err) {
      console.warn("Failed to generate barcode:", err);
    }
  }

  const appendices = [];

  for (let blockIdx = 0; blockIdx < groupedBlocks.length; blockIdx++) {
    const block = groupedBlocks[blockIdx];
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
      fontSize: patientInfoFontSize,
      table: {
        widths: ['10%', '10%', '15%', '15%', '20%', '30%'],
        body: [
          [
            { text: 'Patient Name:', colSpan: 2, bold: true, color: '#334155' },
            {},
            { text: (patient.name || '--').toUpperCase(), colSpan: 3, bold: true },
            {},
            {},
            reportIdBarcodeBase64 
              ? { image: reportIdBarcodeBase64, width: 120, height: 14, alignment: 'center' } 
              : { text: reportId, alignment: 'center' }
          ],
          [
            { text: 'Age:', bold: true, color: '#334155' },
            { text: patient.age || '--' },
            { text: 'Gender:', bold: true, color: '#334155' },
            { text: patient.gender || '--' },
            { text: 'Report Date:', bold: true, color: '#334155' },
            { text: reportDate }
          ],
          [
            { text: 'Phone:', colSpan: 2, bold: true, color: '#334155' },
            {},
            { text: patient.phone || '--', colSpan: 2 },
            {},
            { text: 'Referred By:', bold: true, color: '#334155' },
            { text: (report.referredBy || 'Self').toUpperCase(), bold: true }
          ],
          [
            { text: 'Test Name:', colSpan: 2, bold: true, color: '#334155' },
            {},
            { text: currentTemplateName, colSpan: 4, bold: true, color: '#0f172a' },
            {}, {}, {}
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

    for (let sIdx = 0; sIdx < block.sections.length; sIdx++) {
      const sec = block.sections[sIdx];
      const isFirstSection = (sIdx === 0);
      const isLastSection = (sIdx === block.sections.length - 1);
      const sectionTableBody = [];

      if (isFirstSection) {

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
            fontSize: Math.max(6, templateInfoFontSize - 4),
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
        for (const p of params) {
          const resultStr = p.result || '';
          const unitsStr = p.units || '';

          const evaluation = evaluatePatientResult(resultStr, p, patient.gender);
          const normalRangeStr = evaluation.rangeDisplay;
          const isAbnormal = evaluation.isAbnormal;

          let resultCell = {
            text: resultStr,
            bold: isAbnormal,
            margin: [0, 0, 0, 0]
          };
          
          if (p.dataType === 'DATETIME' && resultStr) {
              const d = new Date(resultStr);
              if (!isNaN(d.getTime())) {
                  const opts = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
                  resultCell = { text: d.toLocaleString('en-US', opts).replace(/,/g, '') }; // 15 May 2024 02:30 PM
              }
          } else if (p.dataType === 'CULTURE_SENSITIVITY' && resultStr) {
            try {
                const parsed = JSON.parse(resultStr);
                const cultureStack = [];
                parsed.forEach(org => {
                    cultureStack.push({ text: `Organism: ${org.organism}`, bold: true, fontSize: templateInfoFontSize - 1, margin: [0, 2, 0, 0] });
                    if (org.colonyCount) cultureStack.push({ text: `Colony Count: ${org.colonyCount}`, fontSize: templateInfoFontSize - 2, italics: true, color: '#475569', margin: [0, 0, 0, 2] });
                    
                    if (org.sensitivities && org.sensitivities.length > 0) {
                        const sList = org.sensitivities.filter(s => s.interpretation === 'Sensitive').map(s => s.antibiotic).join(', ');
                        const iList = org.sensitivities.filter(s => s.interpretation === 'Intermediate').map(s => s.antibiotic).join(', ');
                        const rList = org.sensitivities.filter(s => s.interpretation === 'Resistant').map(s => s.antibiotic).join(', ');
                        
                        const innerTableBody = [];
                        if (sList) innerTableBody.push([{ text: 'Sensitive:', bold: true, color: '#15803d', fontSize: templateInfoFontSize - 2 }, { text: sList, fontSize: templateInfoFontSize - 2, color: '#15803d' }]);
                        if (iList) innerTableBody.push([{ text: 'Intermediate:', bold: true, color: '#b45309', fontSize: templateInfoFontSize - 2 }, { text: iList, fontSize: templateInfoFontSize - 2, color: '#b45309' }]);
                        if (rList) innerTableBody.push([{ text: 'Resistant:', bold: true, color: '#b91c1c', fontSize: templateInfoFontSize - 2 }, { text: rList, fontSize: templateInfoFontSize - 2, color: '#b91c1c' }]);
                        
                        if (innerTableBody.length > 0) {
                            cultureStack.push({
                                margin: [5, 2, 0, 5],
                                table: {
                                    widths: [75, '*'],
                                    body: innerTableBody
                                },
                                layout: 'noBorders'
                            });
                        }
                    } else {
                        cultureStack.push({ text: '', margin: [0, 2, 0, 2] });
                    }
                });
                resultCell = { stack: cultureStack, margin: [0, 0, 0, 0] };
            } catch(e) {}
          } else if (p.dataType === 'ATTACHMENT' && resultStr && (resultStr.startsWith('http') || resultStr.startsWith('data:'))) {
            try {
                let imgUrl = resultStr;
                if (imgUrl.endsWith('.pdf')) {
                    imgUrl = imgUrl.replace('.pdf', '.jpg');
                }
                const b64 = imgUrl.startsWith('data:') ? imgUrl : await downloadImageAsBase64(imgUrl);
                if (b64) {
                    appendices.push({ image: b64, title: p.name });
                    resultCell = { text: `See Appendix ${appendices.length}`, italics: true, color: '#2563eb', bold: true, margin: [0, 5, 0, 5] };
                } else {
                    resultCell = { text: '[Image Unavailable]', italics: true, color: '#64748b' };
                }
            } catch(e) {
                resultCell = { text: '[Image Error]', italics: true, color: '#64748b' };
            }
          }

          if (evaluation.critical && !resultCell.stack && !resultCell.image) {
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
              fontSize: Math.max(6, templateInfoFontSize - 4),
              italics: true,
              color: '#64748b'
            });
          }

          if (p.dataType === 'DEFAULT_VALUE') {
            resultCell.colSpan = 3;
            sectionTableBody.push([
              { text: paramTextChunks, margin: [0, 0, 0, 0] },
              resultCell,
              {},
              {}
            ]);
          } else {
            sectionTableBody.push([
              { text: paramTextChunks, margin: [0, 0, 0, 0] },
              resultCell,
              { text: unitsStr, margin: [0, 0, 0, 0] },
              { text: normalRangeStr, fontSize: templateInfoFontSize - 2, margin: [0, 0, 0, 0] }
            ]);
          }
        }
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
            { text: normalRangeStr, fontSize: templateInfoFontSize - 3, margin: [0, 0, 0, 0] }
          ]);
        }
      }

      content.push({
        stack: [
          {
            fontSize: templateInfoFontSize - 1,
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
    }

    const blockRemarks = remarksByTemplate[block.templateId];
    if (blockRemarks && blockRemarks.length > 0) {
      const remarksContent = [];
      remarksContent.push({ canvas: [{ type: 'line', x1: 0, y1: 5, x2: contentWidth, y2: 5, lineWidth: 0.5, lineColor: '#cbd5e1' }] });
      remarksContent.push({ text: 'REMARKS / OBSERVATIONS', style: 'subheader', margin: [0, 8, 0, 4], fontSize: templateInfoFontSize - 2, color: '#64748b' });
      
      blockRemarks.forEach(rem => {
        const textParts = [];
        if (rem.title) {
          textParts.push({ text: `${rem.title}: `, bold: true, fontSize: templateInfoFontSize - 1 });
        }
        textParts.push({ text: rem.text, fontSize: templateInfoFontSize - 1 });

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
        margin: [0, 0, 0, 15],
        fontSize: signatureFontSize - 2,
        color: '#475569'
    });

    const hasSignatureData = signatureImageData && report.performedByLabTechId;
    const hasSignerName = report.performedBy || (report.performedByLabTechId && (report.performedByLabTechId.fullName || report.performedByLabTechId.doctorName));

    if (hasSignatureData || hasSignerName) {
        const signerName = (report.performedBy || (report.performedByLabTechId && (report.performedByLabTechId.fullName || report.performedByLabTechId.doctorName)) || 'Authorized Signatory').toUpperCase();
        
        const sigStack = [];
        if (signatureImageData) {
            sigStack.push({ image: signatureImageData, fit: [120, 60], alignment: 'center' });
        } else {
            // Leave vertical space for a physical signature if image is deleted or unavailable
            sigStack.push({ text: '\n\n\n', fontSize: signatureFontSize });
        }
        
        sigStack.push({ text: signerName, fontSize: signatureFontSize, bold: true, color: '#1e293b' });
        sigStack.push({ text: 'PERFORMED BY / AUTHORIZED SIGNATORY', fontSize: signatureFontSize - 4, color: '#64748b', margin: [0, 2, 0, 0], bold: true, characterSpacing: 0.5 });

        endOfReportBlock.push({
            columns: [
                { 
                    width: '*', 
                    text: '*Please correlate clinically. Partial reproduction of this report is not permitted.\nThis is an electronically generated and authenticated document.',
                    fontSize: signatureFontSize - 4,
                    color: '#64748b',
                    italics: true,
                    margin: [0, 20, 10, 0]
                }, 
                {
                    width: 200,
                    alignment: 'center',
                    margin: [0, 10, 0, 0],
                    stack: sigStack
                }
            ]
        });
    } else {
        endOfReportBlock.push({
            text: '*Please correlate clinically. Partial reproduction of this report is not permitted.\nThis is an electronically generated document.',
            fontSize: signatureFontSize - 4,
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

  }

  if (appendices.length > 0) {
    appendices.forEach((app, idx) => {
      content.push({
        text: `APPENDIX ${idx + 1}: ${app.title.toUpperCase()}`,
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 20],
        pageBreak: 'before'
      });
      content.push({
        image: app.image,
        fit: [contentWidth, 700],
        alignment: 'center'
      });
    });
  }

  const docDefinition = {
    content: content,
    pageMargins: [ml, mt, mr, mb + 20], 
    styles: {
      header: { fontSize: baseFontSize + 6, bold: true },
      subheader: { fontSize: baseFontSize + 2, bold: true },
      patientInfo: { lineHeight: 1.4 }
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: baseFontSize
    }
  };

  const pdfDoc = pdfmake.createPdf(docDefinition);
  const buffer = await pdfDoc.getBuffer();
  return buffer;
};