document.addEventListener('DOMContentLoaded', () => {
    // Only init if layout coordinator didn't already
    if (!window.tabSwitcherInitialized) {
        checkAccess();
        fetchSignatures();
    }
});

const user = JSON.parse(localStorage.getItem('lis_user') || '{}');

function checkAccess() {
    // If Admin, they can manage any signature
    if (user.role === 'Admin') return;
    
    // For staff (Doctor/LabTech), lock their name
    const nameInput = document.getElementById('doctor-name');
    nameInput.value = user.name;
    nameInput.disabled = true;
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
            
            if (user.role !== 'Admin') {
                  const form = document.getElementById('form-signatures');
                  if (form) form.classList.remove('hidden');
             }
            return;
        }

        let hasOwnSignature = false;

        grid.innerHTML = res.data.map(sig => {
            const name = sig.fullName || sig.doctorName || 'Unknown';
            const signatureUserId = sig.userId || sig.doctorId;

            if (user.role !== 'Admin' && signatureUserId === user.id) {
                hasOwnSignature = true;
            }

            return `
            <div class="group/card relative bg-white border border-slate-100 p-4 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col gap-4 overflow-hidden">
                <div class="flex items-start justify-between">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500/10 to-brand-600/5 text-brand-600 flex items-center justify-center font-black text-sm border border-brand-100/50">
                            ${name.charAt(0).toUpperCase()}
                        </div>
                        <div class="min-w-0">
                            <h4 class="font-bold text-slate-800 text-[13px] leading-tight break-words" title="${sanitizeHTML(name)}">${sanitizeHTML(name)}</h4>
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Authorized Verifier</p>
                        </div>
                    </div>
                    ${(user.role === 'Admin' || signatureUserId === user.id) ? `
                    <button onclick="deleteSignature('${sig._id}')" class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-all opacity-0 group-hover/card:opacity-100" title="Revoke Access">
                        <i class="fas fa-trash-alt text-[10px]"></i>
                    </button>
                    ` : ''}
                </div>
                
                <div class="bg-slate-50 border border-slate-100 rounded-lg p-3 h-20 flex items-center justify-center relative overflow-hidden group/sig grayscale-[0.5] hover:grayscale-0 transition-all">
                    <img src="${sanitizeHTML(sig.signatureUrl)}" alt="Signature" class="max-h-full object-contain transition-transform group-hover/sig:scale-105" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'text-[9px] font-bold text-red-400 uppercase tracking-widest\\'>Invalid Image</span>';">
                </div>
            </div>
            `;
        }).join('');

         // Hide add form for staff if they already uploaded one
         const formSign = document.getElementById('form-signatures');
         if (formSign) {
             if (user.role !== 'Admin' && hasOwnSignature) {
                 formSign.classList.add('hidden');
             } else {
                 formSign.classList.remove('hidden');
             }
         }

    } catch (err) {
        document.getElementById('signatures-grid').innerHTML = `<div class="col-span-full text-center text-red-500">Error loading signatures</div>`;
    }
}

async function uploadSignature() {
    const input = document.getElementById('signature-file');
    const file = input.files[0];
    if (!file) return;

    const loader = document.getElementById('upload-loader');
    
    try {
        if (loader) loader.classList.remove('hidden');
        const formData = new FormData();
        formData.append('image', file);

        const res = await api.request('/settings/upload', 'POST', formData);
        const url = res.data.url;
        document.getElementById('signature-url').value = url;
        updateSignatureUI(url);
        UI.showToast('Signature uploaded successfully', 'success');
    } catch (err) {
        UI.showToast(err.message, 'error');
        input.value = ''; // Reset
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

function updateSignatureUI(url) {
    const preview = document.getElementById('signature-preview');
    const placeholder = document.getElementById('signature-placeholder');
    const clearBtn = document.getElementById('btn-clear-signature');
    
    if (url) {
        preview.src = url;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
        if (clearBtn) clearBtn.classList.remove('hidden');
    } else {
        preview.src = '';
        preview.classList.add('hidden');
        placeholder.classList.remove('hidden');
        if (clearBtn) clearBtn.classList.add('hidden');
        document.getElementById('signature-file').value = '';
    }
    
    // Always hide the specialized hover overlay when an image is first set
    const overlay = document.getElementById('preview-hover-overlay');
    if (url && overlay) overlay.classList.remove('hidden');
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
    
    let fullName = document.getElementById('doctor-name').value;
    if (user.role !== 'Admin') fullName = user.name; // Enforce
    
    const signatureUrl = document.getElementById('signature-url').value;

    if (!fullName) return UI.showToast('Please enter your official name', 'error');
    if (!signatureUrl) return UI.showToast('Please upload a signature image first', 'error');
    
    UI.toggleLoader('btn-add-sign', true);
    
    try {
        const payload = { fullName, signatureUrl };
        const data = await api.request('/signatures', 'POST', payload);
        
        if (data.success) {
            UI.showToast('Signature saved and linked successfully', 'success');
            
            // UI Cleanup
            document.getElementById('doctor-name').value = user.role !== 'Admin' ? user.name : '';
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
