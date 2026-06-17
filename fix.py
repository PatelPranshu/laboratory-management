import codecs

def fix_file():
    path = r'd:\lab management\lab-management-1.2.0 ud\frontend\js\app.js'
    with codecs.open(path, 'r', 'utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    keep_lines = []
    for line in lines:
        keep_lines.append(line)
        if 'function downloadPdfGlobal' in line or 'f u n c t i o n' in line:
            keep_lines.pop()
            break
            
    with codecs.open(path, 'w', 'utf-8') as f:
        f.writelines(keep_lines)

fix_file()
