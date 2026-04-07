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

  if (settings && settings.headerImageURL) {
    headerImageData = await downloadImageAsBase64(settings.headerImageURL);
  }
  if (settings && settings.footerImageURL) {
    footerImageData = await downloadImageAsBase64(settings.footerImageURL);
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
  } else {
    content.push({ text: 'Laboratory Report', style: 'header', alignment: 'center', margin: [0, 0, 0, 20] });
  }

  // Patient Info
  const reportDate = report.date ? new Date(report.date).toLocaleDateString() : new Date().toLocaleDateString();
  const reportId = report._id ? report._id.toString().slice(-6).toUpperCase() : 'N/A';
  content.push({
    columns: [
      { text: `Patient Name: ${patient.name || 'N/A'}\nAge/Gender: ${patient.age || 'N/A'} / ${patient.gender || 'N/A'}\nPhone: ${patient.phone || 'N/A'}`, width: '*' },
      { text: `Date: ${reportDate}\nReport ID: ${reportId}`, width: '*', alignment: 'right' }
    ],
    margin: [0, 0, 0, 20]
  });

  content.push({ canvas: [{ type: 'line', x1: 0, y1: 5, x2: contentWidth, y2: 5, lineWidth: 1 }] });
  content.push({text: '\n'});

  // Report Sections
  const sections = report.sections || [];
  sections.forEach(sec => {
    if (sec.sectionName) {
      content.push({ text: sec.sectionName, style: 'subheader', margin: [0, 10, 0, 5] });
    }
    if (sec.text) {
      content.push({ text: sec.text, margin: [0, 0, 0, 5] });
    }
    if (sec.values) {
      const tableBody = [];
      // Convert to plain object in case it's a Mongoose Map or document
      const valuesObj = sec.values.toJSON ? sec.values.toJSON() : (typeof sec.values === 'object' ? sec.values : {});
      for (const [key, val] of Object.entries(valuesObj)) {
        if (key !== '_id' && key !== '$__' && key !== '$isNew') {
          tableBody.push([String(key), String(val)]);
        }
      }
      if (tableBody.length > 0) {
        content.push({
          table: {
            widths: ['*', '*'],
            body: tableBody
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 10]
        });
      }
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
