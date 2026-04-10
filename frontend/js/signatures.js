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
        
        if (!res.data || res.data.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center py-12 px-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50"><i class="fas fa-signature text-4xl text-slate-300 mb-3 block"></i><p class="text-slate-500 font-bold">No signatures found.</p></div>`;
            
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
            <div class="border border-slate-200 rounded-xl p-5 relative group hover:border-brand-300 transition-colors bg-white shadow-sm flex flex-col justify-between">
                <div>
                    <h4 class="font-bold text-slate-800 text-lg mb-4 flex items-center"><i class="fas fa-user-md text-slate-400 mr-2 text-sm"></i>${escapeHtml(sig.doctorName)}</h4>
                    <div class="h-20 flex items-center justify-center p-2 border border-slate-100 rounded-lg bg-slate-50 mb-4 relative overflow-hidden group-hover:bg-white transition-colors">
                        <img src="${escapeHtml(sig.signatureUrl)}" alt="Signature" class="max-h-16 object-contain" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'text-xs text-red-500\\'>Invalid Image URL</span>';">
                    </div>
                </div>
                ${user.role === 'Admin' ? `
                <button onclick="deleteSignature('${sig._id}')" class="w-full flex items-center justify-center px-4 py-2 border border-red-100 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-bold text-sm mt-auto">
                    <i class="fas fa-trash-alt mr-2"></i> Delete
                </button>
                ` : ''}
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
    if (!confirm('Are you sure you want to delete this signature?')) return;
    
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
