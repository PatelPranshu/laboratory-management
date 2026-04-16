const pdfmake = require('pdfmake');
const https = require('https');
const http = require('http');

const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
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
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      // Follow redirects
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

  // The default A4 width is 595.28 pt. We calculate available content width.
  const contentWidth = 595.28 - ml - mr;

  // Pre-download images as base64 (pdfmake can't reliably fetch remote URLs)
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

  // Header Image
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
    content.push(headerConfig);
  } 

  // Patient Info
  const reportDate = report.date ? new Date(report.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
  const reportId = report._id ? report._id.toString().slice(-6).toUpperCase() : 'N/A';
  
  // Template names for "Test Name" section
  const templateNames = (report.templateIds || [])
    .map(t => typeof t === 'object' && t.templateName ? t.templateName : null)
    .filter(name => name !== null)
    .join(', ') || 'N/A';

  content.push({
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
          { text: templateNames, colSpan: 3, bold: true, color: '#0f172a' },
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
  });

  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: 2, lineColor: '#1e293b' }] });
  content.push({text: '\n', fontSize: 5});

  const sections = report.sections || [];
  const remarksByTemplate = {};

  // 1. Filter out completely empty sections so they don't break our grouping logic
  const filteredSections = sections.filter((sec, sIdx) => {
    if (sec.text && sec.text.trim()) {
      const tid = sec.templateId ? sec.templateId.toString() : 'unassigned';
      if (!remarksByTemplate[tid]) remarksByTemplate[tid] = [];
      remarksByTemplate[tid].push({
        title: (sec.sectionName || `Section ${sIdx + 1}`).toUpperCase(),
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

  // 2. Group sections strictly by template ID
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

  // 3. Render blocks: Each block is a separate Test Type (Template)
  groupedBlocks.forEach((block, blockIdx) => {

    // Extract the actual template/test name from report data
    let currentTemplateName = 'TEST RESULTS';
    if (block.templateId !== 'unassigned') {
      const tmpl = (report.templateIds || []).find(t => t && typeof t === 'object' && t._id && t._id.toString() === block.templateId);
      if (tmpl && tmpl.templateName) {
        currentTemplateName = tmpl.templateName.toUpperCase();
      }
    }

    block.sections.forEach((sec, sIdx) => {
      const isFirstSection = (sIdx === 0);
      const isLastSection = (sIdx === block.sections.length - 1);
      const sectionTableBody = [];

      // Add the master header ONLY on the very first section of this test type
      if (isFirstSection) {
        // NEW: Test Type Title Row
        sectionTableBody.push([
          { 
            text: currentTemplateName, 
            colSpan: 4, 
            alignment: 'center', 
            bold: true, 
            fillColor: '#e2e8f0', // Slightly darker to distinguish from column headers
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

      // Add Section Title row
      if (sec.sectionName) {
        sectionTableBody.push([
          { 
            text: sec.sectionName.toUpperCase(), 
            colSpan: 4, 
            bold: true, 
            fillColor: '#f8fafc',
            color: '#0f172a',
            margin: [0, isFirstSection ? 2 : 6, 0, 2] 
          },
          {}, {}, {}
        ]);
      }

      // Process Parameters (Structured Array)
      const params = sec.parameters || [];
      if (params.length > 0) {
        params.forEach(p => {
          const resultStr = p.result || '';
          const unitsStr = p.units || '';
          let normalRangeStr = '';
          let isAbnormal = false;

          if (p.isGenderSpecific) {
            const m = p.normalRange?.male;
            const f = p.normalRange?.female;
            const maleRange = (m && m.min != null && m.max != null) ? `Male: ${m.min}-${m.max} ${unitsStr}` : '';
            const femaleRange = (f && f.min != null && f.max != null) ? `Female: ${f.min}-${f.max} ${unitsStr}` : '';
            normalRangeStr = [maleRange, femaleRange].filter(r => r).join('\n');

            const gender = (patient.gender || '').toLowerCase();
            if (gender === 'male' && m) {
              isAbnormal = checkNumericAbnormal(resultStr, m.min, m.max);
            } else if (gender === 'female' && f) {
              isAbnormal = checkNumericAbnormal(resultStr, f.min, f.max);
            }
          } else if (p.normalRange) {
            const nr = p.normalRange;
            normalRangeStr = (nr && nr.min != null && nr.max != null) ? `${nr.min}-${nr.max} ${unitsStr}` : '';
            isAbnormal = checkNumericAbnormal(resultStr, nr.min, nr.max);
          }

          sectionTableBody.push([
            { text: p.name || '', margin: [0, 0, 0, 0] },
            { text: resultStr, bold: isAbnormal, margin: [0, 0, 0, 0] },
            { text: unitsStr, margin: [0, 0, 0, 0] },
            { text: normalRangeStr, fontSize: fontSize - 3, margin: [0, 0, 0, 0] }
          ]);
        });
      } else if (sec.values) {
        // Backward compatibility for old format
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

      // Add to content within an unbreakable stack (per section)
      content.push({
        stack: [
          {
            fontSize: fontSize - 1,
            table: {
              headerRows: isFirstSection ? 2 : 0, // UPDATED: Now pinning 2 rows (Title + Columns)
              widths: ['38%', '15%', '15%', '32%'], 
              body: sectionTableBody
            },
            layout: {
              hLineWidth: function (i, node) {
                if (isFirstSection && i === 0) return 1.5; // Top line of template
                if (isFirstSection && i === 1) return 1.5; // Line under Test Type title
                if (isFirstSection && i === 2) return 1.5; // Line under column headers
                if (!isFirstSection && i === 0) return 0;  // Connects seamlessly to previous section
                if (isLastSection && i === node.table.body.length) return 1.5; // Bottom line of template
                return 0.5; // Internal dividing lines
              },
              vLineWidth: () => 0,
              hLineColor: function (i, node) {
                if (isFirstSection && i === 0) return '#475569';
                if (isFirstSection && i === 1) return '#475569';
                if (isFirstSection && i === 2) return '#475569';
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
        unbreakable: true,
        pageBreak: (isFirstSection && blockIdx > 0) ? 'before' : undefined 
      });

    });

  // NEW: Append Remarks specific to this Test Type (Template)
    const blockRemarks = remarksByTemplate[block.templateId];
    if (blockRemarks && blockRemarks.length > 0) {
      const remarksContent = [];
      remarksContent.push({ canvas: [{ type: 'line', x1: 0, y1: 5, x2: contentWidth, y2: 5, lineWidth: 0.5, lineColor: '#cbd5e1' }] });
      remarksContent.push({ text: 'REMARKS / OBSERVATIONS', style: 'subheader', margin: [0, 8, 0, 4], fontSize: fontSize - 2, color: '#64748b' });
      
      blockRemarks.forEach(rem => {
        remarksContent.push({
          text: [
            { text: `${rem.title}: `, bold: true, fontSize: fontSize - 1 },
            { text: rem.text, fontSize: fontSize - 1 }
          ],
          margin: [0, 2, 0, 4]
        });
      });

      content.push({
        stack: remarksContent,
        unbreakable: true,
        margin: [0, 0, 0, 10]
      });
    }
  });

  // Footer Image (at the end of content)
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

  // End of Report Marker
  endOfReportBlock.push({
      text: '*** END OF REPORT ***',
      alignment: 'center',
      bold: true,
      margin: [0, 25, 0, 15],
      fontSize: fontSize - 2,
      color: '#475569'
  });

  // Verify & Sign Section with Legal Disclaimer
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
      // Fallback Disclaimer if no signature
      endOfReportBlock.push({
          text: 'Please correlate clinically. Partial reproduction of this report is not permitted.\nThis is an electronically generated document.',
          fontSize: fontSize - 4,
          color: '#64748b',
          italics: true,
          margin: [0, 10, 0, 0]
      });
  }

  // Group everything into an unbreakable wrapper
  content.push({
    stack: endOfReportBlock,
    unbreakable: true, // Prevents elements separating across multiple pages
    margin: [0, 10, 0, 0]
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