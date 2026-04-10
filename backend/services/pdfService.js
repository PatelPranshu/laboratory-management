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
pdfmake.setUrlAccessPolicy(function() { return false; });

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
  
  if (report.referredByDoctorId && report.referredByDoctorId.signatureUrl) {
    signatureImageData = await downloadImageAsBase64(report.referredByDoctorId.signatureUrl);
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
  const reportDate = report.date ? new Date(report.date).toLocaleDateString() : new Date().toLocaleDateString();
  const reportId = report._id ? report._id.toString().slice(-6).toUpperCase() : 'N/A';
  content.push({
    columns: [
      { text: `Patient Name: ${patient.name || 'N/A'}\nAge/Gender: ${patient.age || 'N/A'} / ${patient.gender || 'N/A'}\nPhone: ${patient.phone || 'N/A'}`, width: '*', style: 'patientInfo' },
      { text: `Date: ${reportDate}\nReport ID: ${reportId}\nReferred By: ${report.referredBy || 'N/A'}`, width: '*', alignment: 'right', style: 'patientInfo' }
    ],
    margin: [0, 0, 0, 20]
  });

  content.push({ canvas: [{ type: 'line', x1: 0, y1: 5, x2: contentWidth, y2: 5, lineWidth: 1 }] });
  content.push({text: '\n'});

  // Initialize Master Table Body and Remarks Collection
  const masterTableBody = [
    [
      { text: 'TEST', bold: true, decoration: 'underline', margin: [0, 2, 0, 2] },
      { text: 'RESULT', bold: true, decoration: 'underline', margin: [0, 2, 0, 2] },
      { text: 'UNITS', bold: true, decoration: 'underline', margin: [0, 2, 0, 2] },
      { text: 'NORMAL VALUES', bold: true, decoration: 'underline', margin: [0, 2, 0, 2] }
    ]
  ];

  const allRemarks = [];

  const sections = report.sections || [];
  sections.forEach((sec, sIdx) => {
    // 1. Add Section Title as a spanning row
    if (sec.sectionName) {
      masterTableBody.push([
        { 
          text: sec.sectionName.toUpperCase(), 
          colSpan: 4, 
          bold: true, 
          decoration: 'underline', 
          margin: [0, sIdx === 0 ? 5 : 15, 0, 5] 
        },
        {}, {}, {}
      ]);
    }

    // 2. Collect Remarks (Description) for the end of the report
    if (sec.text) {
      allRemarks.push({
        title: (sec.sectionName || `Section ${sIdx + 1}`).toUpperCase(),
        text: sec.text
      });
    }
    
    // 3. Process Parameters (Structured Array)
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
          const maleRange = `Male: ${m?.min ?? '?'}-${m?.max ?? '?'} ${unitsStr}`;
          const femaleRange = `Female: ${f?.min ?? '?'}-${f?.max ?? '?'} ${unitsStr}`;
          normalRangeStr = `${maleRange}\n${femaleRange}`;

          const gender = (patient.gender || '').toLowerCase();
          if (gender === 'male' && m) {
            isAbnormal = checkNumericAbnormal(resultStr, m.min, m.max);
          } else if (gender === 'female' && f) {
            isAbnormal = checkNumericAbnormal(resultStr, f.min, f.max);
          }
        } else if (p.normalRange) {
          const nr = p.normalRange;
          normalRangeStr = `${nr.min ?? '?'}-${nr.max ?? '?'} ${unitsStr}`;
          isAbnormal = checkNumericAbnormal(resultStr, nr.min, nr.max);
        }

        masterTableBody.push([
          { text: p.name || '', margin: [0, 2, 0, 2] },
          { text: resultStr, bold: isAbnormal, margin: [0, 2, 0, 2] },
          { text: unitsStr, margin: [0, 2, 0, 2] },
          { text: normalRangeStr, fontSize: fontSize - 2, margin: [0, 2, 0, 2] }
        ]);
      });
    } else if (sec.values) {
      // Backward compatibility for old format
      const valuesObj = sec.values.toJSON ? sec.values.toJSON() : (typeof sec.values === 'object' ? sec.values : {});
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

        masterTableBody.push([
          { text: String(key), margin: [0, 2, 0, 2] },
          { text: resultStr, bold: isAbnormal, margin: [0, 2, 0, 2] },
          { text: '', margin: [0, 2, 0, 2] },
          { text: normalRangeStr, fontSize: fontSize - 2, margin: [0, 2, 0, 2] }
        ]);
      }
    }
  });

  // Push the Master Table to content
  if (masterTableBody.length > 1) {
    content.push({
      table: {
        headerRows: 1,
        // Using proportional widths to ensure fit regardless of content length
        widths: ['38%', '15%', '15%', '32%'], 
        body: masterTableBody
      },
      layout: {
        hLineWidth: function (i, node) {
          // Lines: Top, Below Header, and Bottom
          return (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0;
        },
        vLineWidth: () => 0,
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 4,
        paddingBottom: () => 4
      },
      margin: [0, 10, 0, 10]
    });
  }

  // Adding Remarks / Description at the end
  if (allRemarks.length > 0) {
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 5, x2: contentWidth, y2: 5, lineWidth: 0.5, lineColor: '#cbd5e1' }] });
    content.push({ text: 'REMARKS / OBSERVATIONS', style: 'subheader', margin: [0, 10, 0, 5], fontSize: fontSize - 2, color: '#64748b' });
    
    allRemarks.forEach(rem => {
      content.push({
        text: [
          { text: `${rem.title}: `, bold: true, fontSize: fontSize - 1 },
          { text: rem.text, fontSize: fontSize - 1 }
        ],
        margin: [0, 2, 0, 4]
      });
    });
  }

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
  
  // Verify & Sign Section
  if (signatureImageData) {
      content.push({
          columns: [
              { width: '*', text: '' }, // spacer 
              {
                  width: 150,
                  alignment: 'center',
                  margin: [0, 20, 0, 0],
                  stack: [
                      { image: signatureImageData, fit: [150, 60], alignment: 'center' },
                      { text: `Referred By / Verified By\n${report.referredByDoctorId.doctorName}`, fontSize: fontSize - 2, bold: true, margin: [0, 5, 0, 0], color: '#334155' }
                  ]
              }
          ]
      });
  }

  const docDefinition = {
    content: content,
    pageMargins: [ml, mt, mr, mb],
    styles: {
      header: { fontSize: fontSize + 6, bold: true },
      subheader: { fontSize: fontSize + 2, bold: true },
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
