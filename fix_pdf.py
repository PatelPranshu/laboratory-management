import re

with open('backend/services/pdfService.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Line 231
content = re.sub(
    r"\{\s*text:\s*/\s*\},",
    r"{ text: `${patient.age || 'N/A'} / ${patient.gender || 'N/A'}` },",
    content
)
content = re.sub(
    r"\{\s*text:\s*\$\{patient\.age\s*\|\|\s*'N/A'\}\s*/\s*\},",
    r"{ text: `${patient.age || 'N/A'} / ${patient.gender || 'N/A'}` },",
    content
)

# Fix Line 486 (End of Report marker)
content = re.sub(
    r"text:\s*\*\*\*\s*END\s*OF\s*\*\*\*,",
    r"text: `*** END OF ${currentTemplateName} ***`,",
    content
)

# Fix Line 541 (Footer)
content = re.sub(
    r"\{\s*text:\s*Printed\s*on:\s*,\s*alignment:\s*'left'",
    r"{ text: `Printed on: ${new Date().toLocaleString('en-IN')}`, alignment: 'left'",
    content
)

# Fix Line 542 (Footer Page)
content = re.sub(
    r"\{\s*text:\s*Page\s*of\s*,\s*alignment:\s*'right'",
    r"{ text: `Page ${currentPage} of ${pageCount}`, alignment: 'right'",
    content
)

with open('backend/services/pdfService.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fix applied.")
