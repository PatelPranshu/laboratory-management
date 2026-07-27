const pdfmake = require('pdfmake');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const QRCode = require('qrcode');
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

function getImageDimensionsFromBase64(base64Str) {
  if (!base64Str) return null;
  try {
      const parts = base64Str.split(',');
      if (parts.length < 2) return null;
      const buffer = Buffer.from(parts[1], 'base64');
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
          return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
      } else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
          let i = 4;
          while (i < buffer.length - 8) {
              let marker = buffer[i - 1] << 8 | buffer[i];
              let len = buffer.readUInt16BE(i + 1);
              if (marker >= 0xFFC0 && marker <= 0xFFC3) {
                  return { height: buffer.readUInt16BE(i + 4), width: buffer.readUInt16BE(i + 6) };
              }
              i += len + 2;
          }
      }
  } catch(e) {}
  return null;
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
  const parseMargin = (val, def) => (val !== undefined && val !== null && val !== '') ? Number(val) : def;
  const ml = parseMargin(lp.marginLeft, 40);
  const mt = parseMargin(lp.marginTop, 40);
  const mr = parseMargin(lp.marginRight, 40);
  const mb = parseMargin(lp.marginBottom, 40);
  
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
    const hasAdvSetup = !!(sec.methodology || sec.sampleType || sec.kitUsed);
    return params.length > 0 || legacyCount > 0 || hasAdvSetup;
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

  // Generate QR code linking to patient profile page
  let qrCodeBase64 = null;
  if (patient._id) {
    try {
      const frontendQrUrl = process.env.FRONTEND_URL_QR || process.env.FRONTEND_URL;
      const secret = process.env.JWT_SECRET;
      const hash = crypto.createHmac('sha256', secret).update(patient._id.toString()).digest('hex').substring(0, 16);
      const patientProfileUrl = `${frontendQrUrl}/patient-profile?id=${patient._id}&hash=${hash}`;
      qrCodeBase64 = await QRCode.toDataURL(patientProfileUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 140,
        color: { dark: '#1e293b', light: '#ffffff' }
      });
    } catch (err) {
      console.warn('Failed to generate QR code:', err);
    }
  }



  for (let blockIdx = 0; blockIdx < groupedBlocks.length; blockIdx++) {
    const block = groupedBlocks[blockIdx];
    let currentTemplateName = 'TEST RESULTS';
    if (block.templateId !== 'unassigned') {
      const tmpl = (report.templateIds || []).find(t => t && typeof t === 'object' && t._id && t._id.toString() === block.templateId);
      if (tmpl && tmpl.templateName) {
        currentTemplateName = tmpl.templateName.toUpperCase();
      }
    }



    const qrCell = qrCodeBase64
      ? { image: qrCodeBase64, width: 45, height: 45, alignment: 'center' }
      : { text: '' };

    const patientInfoTable = {
      fontSize: patientInfoFontSize,
      table: {
        widths: ['*', 75],
        body: [
          [
            {
              margin: [0, 0, 0, 0],
              table: {
                widths: ['20%', '40%', '18%', '22%'],
                body: [
                  [
                    { text: 'Patient Name:', bold: true, color: '#334155' },
                    { text: (patient.name || '--').toUpperCase(), colSpan: 3, bold: true },
                    {},
                    {}
                  ],
                  [
                    { text: 'Age / Gender:', bold: true, color: '#334155' },
                    { text: patient.age ? `${patient.age} ${patient.ageUnit || 'Years'}. / ${patient.gender || '--'}` : `-- / ${patient.gender || '--'}` },
                    { text: 'Report Date:', bold: true, color: '#334155' },
                    { text: reportDate }
                  ],
                  [
                    { text: 'Referred By:', bold: true, color: '#334155' },
                    { text: (report.referredBy || 'Self').toUpperCase(), colSpan: 3, bold: true },
                    {},
                    {}
                  ]
                ]
              },
              layout: {
                hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 0 : 0.5,
                vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length) ? 0 : 0.5,
                hLineColor: () => '#cbd5e1',
                vLineColor: () => '#cbd5e1',
                paddingLeft: () => 5,
                paddingRight: () => 5,
                paddingTop: () => 2,
                paddingBottom: () => 2
              }
            },
            {
              stack: [qrCell],
              margin: [0, 2, 0, 2],
              alignment: 'center'
            }
          ]
        ]
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#cbd5e1',
        vLineColor: () => '#cbd5e1',
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin: [0, 0, 0, (lp.spacePatientTemplate !== undefined ? lp.spacePatientTemplate : 2)]
    };

    if (blockIdx > 0) {
      patientInfoTable.pageBreak = 'before';
    }

    content.push(patientInfoTable);

    const sectionTableBody = [];

    sectionTableBody.push([
      { 
        text: currentTemplateName, 
        colSpan: 4, 
        alignment: 'center', 
        bold: true, 
        fillColor: '#e2e8f0', 
        color: '#0f172a',
        margin: [0, 1, 0, 1],
        fontSize: templateInfoFontSize
      },
      {}, {}, {}
    ]);
    
    sectionTableBody.push([
      { text: 'TEST DESCRIPTION', bold: true, fillColor: '#f1f5f9', margin: [0, 1, 0, 1] },
      { text: 'RESULT', bold: true, fillColor: '#f1f5f9', margin: [0, 1, 0, 1] },
      { text: 'UNITS', bold: true, fillColor: '#f1f5f9', margin: [0, 1, 0, 1] },
      { text: 'NORMAL VALUES', bold: true, fillColor: '#f1f5f9', margin: [0, 1, 0, 1] }
    ]);

    for (let sIdx = 0; sIdx < block.sections.length; sIdx++) {
      const sec = block.sections[sIdx];

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
            margin: [0, (sIdx === 0) ? 1 : 2, 0, 1] 
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

          const hasUnits = unitsStr && unitsStr.trim() !== '';
          const hasRange = normalRangeStr && normalRangeStr.trim() !== '';
          const isThreshold = p.ruleType === 'THRESHOLD_COMPARISON' || (p.comparisons && p.comparisons.length > 0);
          const rangeFontSize = isThreshold ? (templateInfoFontSize - 3) : (templateInfoFontSize - 1);

          if (!hasUnits && !hasRange) {
            resultCell.colSpan = 3;
            sectionTableBody.push([
              { text: paramTextChunks, margin: [0, 0, 0, 0] },
              resultCell,
              {},
              {}
            ]);
          } else if (!hasUnits && hasRange) {
              resultCell.colSpan = 2;
              sectionTableBody.push([
                { text: paramTextChunks, margin: [0, 0, 0, 0] },
                resultCell,
                {},
                { text: normalRangeStr, fontSize: rangeFontSize, margin: [0, 0, 0, 0] }
              ]);
            } else if (hasUnits && !hasRange) {
              sectionTableBody.push([
                { text: paramTextChunks, margin: [0, 0, 0, 0] },
                resultCell,
                { text: unitsStr, margin: [0, 0, 0, 0], colSpan: 2 },
                {}
              ]);
            } else {
              sectionTableBody.push([
                { text: paramTextChunks, margin: [0, 0, 0, 0] },
                resultCell,
                { text: unitsStr, margin: [0, 0, 0, 0] },
                { text: normalRangeStr, fontSize: rangeFontSize, margin: [0, 0, 0, 0] }
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

          const hasRange = normalRangeStr && normalRangeStr.trim() !== '';

          if (!hasRange) {
            sectionTableBody.push([
              { text: String(key), margin: [0, 0, 0, 0] },
              { text: resultStr, bold: isAbnormal, margin: [0, 0, 0, 0], colSpan: 3 },
              {},
              {}
            ]);
          } else {
            const legacyRangeFontSize = normalRangeStr.includes('\n') ? (templateInfoFontSize - 3) : (templateInfoFontSize - 1);
            sectionTableBody.push([
              { text: String(key), margin: [0, 0, 0, 0] },
              { text: resultStr, bold: isAbnormal, margin: [0, 0, 0, 0], colSpan: 2 },
              {},
              { text: normalRangeStr, fontSize: legacyRangeFontSize, margin: [0, 0, 0, 0] }
            ]);
          }
        }
      }
    }

    content.push({
      stack: [
        {
          fontSize: templateInfoFontSize - 1,
          table: {
            headerRows: 2, 
            // widths: ['38%', '15%', '15%', '32%'],
            widths: ['32%', '22%', '14%', '32%'], 
            body: sectionTableBody
          },
          layout: {
            hLineWidth: function (i, node) {
              if (i === 0) return 1.5;
              if (i === 1) return 1.5;
              if (i === node.table.body.length) return 1.5;
              return 0.5;
            },
            vLineWidth: () => 0,
            hLineColor: function (i, node) {
              if (i === 0) return '#475569';
              if (i === 1) return '#475569';
              if (i === node.table.body.length) return '#475569';
              return '#e2e8f0';
            },
            paddingLeft: () => 5,
            paddingRight: () => 5,
            paddingTop: () => 2,
            paddingBottom: () => 2
          }
        }
      ],
      margin: [0, 10, 0, 10]
    });

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



    const endOfReportBlock = [];

    endOfReportBlock.push({
        text: `*** END OF ${currentTemplateName} ***`,
        alignment: 'center',
        bold: true,
        margin: [0, 0, 0, (lp.spaceTemplateSignature !== undefined ? lp.spaceTemplateSignature : 5)],
        fontSize: signatureFontSize - 2,
        color: '#475569'
    });

    const hasSignatureData = signatureImageData && report.performedByLabTechId;
    const hasSignerName = report.performedBy || (report.performedByLabTechId && (report.performedByLabTechId.fullName || report.performedByLabTechId.doctorName));

    if (hasSignatureData || hasSignerName) {
        const signerName = (report.performedBy || (report.performedByLabTechId && (report.performedByLabTechId.fullName || report.performedByLabTechId.doctorName)) || 'Authorized Signatory').toUpperCase();
        
        const sigStack = [];
        if (signatureImageData) {
            const sigWidth = lp.signatureImageWidth || 120;
            const sigHeight = lp.signatureImageHeight || 60;
            sigStack.push({ image: signatureImageData, fit: [sigWidth, sigHeight], alignment: 'center' });
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
                    margin: [0, 5, 10, 0]
                }, 
                {
                    width: 200,
                    alignment: 'center',
                    margin: [0, 0, 0, 0],
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


  const headerContentWidth = lp.differentHFMargins ? (595.28 - parseMargin(lp.headerLeftMargin, 0) - parseMargin(lp.headerRightMargin, 0)) : contentWidth;
  const footerContentWidth = lp.differentHFMargins ? (595.28 - parseMargin(lp.footerLeftMargin, 0) - parseMargin(lp.footerRightMargin, 0)) : contentWidth;

  // Calculate safe margins for header and footer
  let headerHeightVal = Number(lp.headerHeight) || 0;
  if (headerImageData && headerHeightVal === 0) {
      const dim = getImageDimensionsFromBase64(headerImageData);
      if (dim && dim.width > 0) {
          headerHeightVal = (dim.height / dim.width) * headerContentWidth;
      } else {
          headerHeightVal = 80;
      }
  }

  let footerHeightVal = Number(lp.footerHeight) || 0;
  if (footerImageData && footerHeightVal === 0) {
      const dim = getImageDimensionsFromBase64(footerImageData);
      if (dim && dim.width > 0) {
          footerHeightVal = (dim.height / dim.width) * footerContentWidth;
      } else {
          footerHeightVal = 80;
      }
  }

  const safeTopMargin = headerImageData ? mt + headerHeightVal + (lp.spaceHeaderPatient !== undefined ? lp.spaceHeaderPatient : 2) : mt;
  const safeBottomMargin = footerImageData ? mb + footerHeightVal + (lp.spaceSignatureFooter !== undefined ? lp.spaceSignatureFooter : 10) : mb + 20;

  const docDefinition = {
    header: headerImageData ? function(currentPage, pageCount) {
      const headerConfig = {
        image: headerImageData,
        alignment: 'center'
      };
      if (lp.headerHeight && lp.headerHeight > 0) {
        headerConfig.fit = [headerContentWidth, lp.headerHeight];
      } else {
        headerConfig.width = headerContentWidth;
      }
      const hLeft = lp.differentHFMargins ? parseMargin(lp.headerLeftMargin, 0) : ml;
      const hRight = lp.differentHFMargins ? parseMargin(lp.headerRightMargin, 0) : mr;
      return {
        columns: [
          { width: hLeft, text: '' },
          { width: '*', stack: [headerConfig] },
          { width: hRight, text: '' }
        ],
        margin: [0, mt, 0, 0]
      };
    } : null,
    footer: footerImageData ? function(currentPage, pageCount) {
      const footerConfig = {
        image: footerImageData,
        alignment: 'center'
      };
      if (lp.footerHeight && lp.footerHeight > 0) {
        footerConfig.fit = [footerContentWidth, lp.footerHeight];
      } else {
        footerConfig.width = footerContentWidth;
      }
      const fLeft = lp.differentHFMargins ? parseMargin(lp.footerLeftMargin, 0) : ml;
      const fRight = lp.differentHFMargins ? parseMargin(lp.footerRightMargin, 0) : mr;
      return {
        columns: [
          { width: fLeft, text: '' },
          { width: '*', stack: [footerConfig] },
          { width: fRight, text: '' }
        ],
        margin: [0, 0, 0, mb]
      };
    } : null,
    content: content,
    pageMargins: [ml, safeTopMargin, mr, safeBottomMargin], 
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