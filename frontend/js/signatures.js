document.addEventListener('DOMContentLoaded', () => {
    loadCommonLayout();
    checkAccess();
    fetchSignatures();
});

const user = JSON.parse(localStorage.getItem('lis_user') || '{}');

function checkAccess() {
    if (user.role === 'LabTech') {
        window.location.href = 'dashboard.html'; // Techs can't manage this UI
        return;
    }
    
    // Doctor restrictions
    if (user.role === 'Doctor') {
        const nameInput = document.getElementById('doctor-name');
        nameInput.value = user.name;
        nameInput.disabled = true; // Lock their name
    }
}

async function fetchSignatures() {
    try {
        const res = await api.request('/signatures');
        const grid = document.getElementById('signatures-grid');
        const countBadge = document.getElementById('signatures-count-badge');
        
        if (countBadge) {
            countBadge.textContent = `${res.data ? res.data.length : 0} Members`;
        }

        if (!res.data || res.data.length === 0) {
            grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                <div class="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4 text-slate-300">
                    <i class="fas fa-signature text-2xl"></i>
                </div>
                <p class="text-sm font-bold text-slate-500">No authorized signatures yet</p>
                <p class="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Start by adding your first verifier</p>
            </div>`;
            
            if (user.role === 'Doctor') {
                 document.getElementById('add-signature-container').classList.remove('hidden');
            }
            return;
        }

        let hasOwnSignature = false;

        grid.innerHTML = res.data.map(sig => {
            if (user.role === 'Doctor' && sig.doctorId === user.id) {
                hasOwnSignature = true;
            }

            return `
            <div class="glass-card p-6 flex flex-col group/card relative overflow-hidden">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-lg shadow-brand-500/20 mr-3">
                            ${sig.doctorName.charAt(0)}
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-800 tracking-tight">${escapeHtml(sig.doctorName)}</h4>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Medical Officer</p>
                        </div>
                    </div>
                    ${user.role === 'Admin' ? `
                    <button onclick="deleteSignature('${sig._id}')" class="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover/card:opacity-100" title="Revoke Access">
                        <i class="fas fa-trash-alt text-xs"></i>
                    </button>
                    ` : ''}
                </div>
                
                <div class="bg-white border border-slate-100 rounded-2xl p-4 h-24 flex items-center justify-center shadow-inner relative overflow-hidden group/sig">
                    <img src="${escapeHtml(sig.signatureUrl)}" alt="Signature" class="max-h-full object-contain transition-transform group-hover/sig:scale-110" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'text-[10px] font-bold text-red-400 uppercase tracking-widest\\'>Invalid Image</span>';">
                    <div class="absolute inset-0 bg-slate-900/5 opacity-0 group-hover/sig:opacity-100 transition-opacity"></div>
                </div>
            </div>
            `;
        }).join('');

        // Hide add form for Doctor if they already uploaded one
        if (user.role === 'Doctor' && hasOwnSignature) {
            document.getElementById('add-signature-container').classList.add('hidden');
        } else if (user.role === 'Doctor') {
            document.getElementById('add-signature-container').classList.remove('hidden');
        }

    } catch (err) {
        document.getElementById('signatures-grid').innerHTML = `<div class="col-span-full text-center text-red-500">Error loading signatures</div>`;
    }
}

async function uploadSignature() {
    const input = document.getElementById('signature-file');
    const file = input.files[0];
    if (!file) return;

    const btn = document.getElementById('btn-upload-trigger');
    const originalText = btn.innerHTML;
    UI.toggleLoader('btn-upload-trigger', true, '<i class="fas fa-circle-notch fa-spin mr-2"></i> Uploading...');

    const formData = new FormData();
    formData.append('image', file);

    try {
        const res = await api.request('/settings/upload', 'POST', formData);
        const url = res.data.url;
        document.getElementById('signature-url').value = url;
        updateSignatureUI(url);
        UI.showToast('Signature uploaded successfully', 'success');
    } catch (err) {
        UI.showToast(err.message, 'error');
        input.value = ''; // Reset
    } finally {
        UI.toggleLoader('btn-upload-trigger', false, originalText);
    }
}

function updateSignatureUI(url) {
    const preview = document.getElementById('signature-preview');
    const placeholder = document.getElementById('signature-placeholder');
    const uploadBtn = document.getElementById('btn-upload-trigger');
    const clearBtn = document.getElementById('btn-clear-signature');

    if (url) {
        preview.src = url;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
        uploadBtn.classList.add('hidden');
        clearBtn.classList.remove('hidden');
    } else {
        preview.src = '';
        preview.classList.add('hidden');
        placeholder.classList.remove('hidden');
        uploadBtn.classList.remove('hidden');
        clearBtn.classList.add('hidden');
        document.getElementById('signature-file').value = '';
    }
}

async function clearSignatureImage() {
    const url = document.getElementById('signature-url').value;
    if (!url) return;

    // Optional: Delete from cloud
    try {
        await api.request('/settings/delete-image', 'POST', { imageUrl: url });
    } catch (err) {
        console.warn('Failed to delete from Cloudinary, clearing UI anyway');
    }

    document.getElementById('signature-url').value = '';
    updateSignatureUI(null);
    UI.showToast('Signature cleared', 'success');
}

async function addSignature(e) {
    if (e) e.preventDefault();
    
    let doctorName = document.getElementById('doctor-name').value;
    if (user.role === 'Doctor') doctorName = user.name; // Enforce
    
    const signatureUrl = document.getElementById('signature-url').value;

    if (!doctorName) return UI.showToast('Please enter doctor name', 'error');
    if (!signatureUrl) return UI.showToast('Please upload a signature image first', 'error');
    
    UI.toggleLoader('btn-add-sign', true);
    
    try {
        const payload = { doctorName, signatureUrl };
        const data = await api.request('/signatures', 'POST', payload);
        
        if (data.success) {
            UI.showToast('Signature saved and linked successfully', 'success');
            
            // UI Cleanup
            document.getElementById('doctor-name').value = user.role === 'Doctor' ? user.name : '';
            document.getElementById('signature-url').value = '';
            document.getElementById('signature-file').value = '';
            updateSignatureUI(null);

            fetchSignatures();
        } else {
            UI.showToast(data.error || 'Failed to add signature', 'error');
        }
    } catch (err) {
        UI.showToast(err.message || 'Network error', 'error');
    } finally {
        UI.toggleLoader('btn-add-sign', false, 'Save Signature');
    }
}

// Global scope
window.uploadSignature = uploadSignature;
window.clearSignatureImage = clearSignatureImage;
window.addSignature = addSignature;

window.deleteSignature = async function(id) {
    const confirmed = await UI.showConfirm('Revoke Signature', 'Are you sure you want to delete this signature? This action cannot be undone.', 'Revoke', 'danger');
    if (!confirmed) return;
    
    try {
        const data = await api.request(`/signatures/${id}`, 'DELETE');
        if (data.success) {
            UI.showToast('Signature removed', 'success');
            fetchSignatures();
        } else {
            UI.showToast(data.error || 'Failed to delete', 'error');
        }
    } catch (err) {
        UI.showToast(err.message || 'Network error', 'error');
    }
};
