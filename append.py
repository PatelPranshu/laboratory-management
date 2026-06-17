import codecs

path = r'd:\lab management\lab-management-1.2.0 ud\frontend\js\app.js'
with codecs.open(path, 'a', 'utf-8') as f:
    f.write('''
function downloadPdfGlobal(id, event) {
    if (event) event.preventDefault();
    
    const existing = document.getElementById('hf-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'hf-modal';
    overlay.className = 'fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] backdrop-blur-sm animate-fade-in';
    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 overflow-hidden transform transition-all">
            <div class="p-6">
                <div class="w-12 h-12 bg-brand-50 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <i class="fas fa-file-pdf text-brand-600 text-xl"></i>
                </div>
                <h3 class="text-lg font-bold text-center text-slate-800 mb-2">Download PDF</h3>
                <p class="text-sm text-center text-slate-500 mb-6">Do you want to include the lab's header and footer in this PDF?</p>
                <div class="flex flex-col gap-3">
                    <button id="hf-btn-with" class="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors">
                        With Header & Footer
                    </button>
                    <button id="hf-btn-without" class="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors">
                        Without Header & Footer
                    </button>
                    <button id="hf-btn-cancel" class="w-full py-2 px-4 text-slate-400 hover:text-slate-600 font-medium rounded-xl transition-colors mt-1">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    const openPdf = (withHF) => {
        const token = localStorage.getItem('lis_token');
        let url = `${BASE_URL}/reports/${id}/pdf?token=${token}`;
        if (!withHF) {
            url += '&withHeaderFooter=false';
        }
        window.open(url, '_blank');
        close();
    };

    document.getElementById('hf-btn-with').onclick = () => openPdf(true);
    document.getElementById('hf-btn-without').onclick = () => openPdf(false);
    document.getElementById('hf-btn-cancel').onclick = close;
}
''')
