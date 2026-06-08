/**
 * templates.js
 * Contains frontend logic for Batch Sharing and Importing templates.
 */

// Global state for sharing
let userTemplates = [];

function openShareModal() {
    const modal = document.getElementById('share-modal');
    if (modal) {
        modal.classList.remove('hidden');
        switchShareTab('generate');
    }
}

function closeShareModal() {
    const modal = document.getElementById('share-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    // Reset inputs
    document.getElementById('generated-code-container').classList.add('hidden');
    document.getElementById('import-code-input').value = '';
    document.getElementById('import-preview-container').classList.add('hidden');
}

function switchShareTab(tab) {
    // Hide all
    ['generate', 'manage', 'import'].forEach(t => {
        document.getElementById(`tab-content-${t}`).classList.add('hidden');
        document.getElementById(`tab-btn-${t}`).classList.remove('border-brand-500', 'text-brand-600');
        document.getElementById(`tab-btn-${t}`).classList.add('border-transparent', 'text-slate-500');
    });

    // Show active
    document.getElementById(`tab-content-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-btn-${tab}`).classList.remove('border-transparent', 'text-slate-500');
    document.getElementById(`tab-btn-${tab}`).classList.add('border-brand-500', 'text-brand-600');

    // Trigger loads
    if (tab === 'generate') {
        loadTemplatesForShare();
    } else if (tab === 'manage') {
        loadActiveShares();
    }
}

async function loadTemplatesForShare() {
    const container = document.getElementById('share-template-list');
    container.innerHTML = '<div class="text-center p-4 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Loading templates...</div>';
    
    try {
        const res = await api.request('/templates');
        userTemplates = res.data || [];
        
        if (userTemplates.length === 0) {
            container.innerHTML = '<div class="text-center p-4 text-slate-500 text-sm">No templates available to share.</div>';
            return;
        }

        container.innerHTML = userTemplates.map(t => `
            <label class="flex items-center gap-3 p-2 hover:bg-slate-100 rounded cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <input type="checkbox" value="${t._id}" class="share-template-cb w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500">
                <div>
                    <span class="text-sm font-medium text-slate-800 block">${t.templateName}</span>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">${t.department} • ${t.sections.length} Sections</span>
                </div>
            </label>
        `).join('');
    } catch (error) {
        UI.showToast('Failed to load templates for sharing', 'error');
        container.innerHTML = '<div class="text-center p-4 text-red-500 text-sm">Error loading templates.</div>';
    }
}

async function generateShareCode() {
    const checkboxes = document.querySelectorAll('.share-template-cb:checked');
    const templateIds = Array.from(checkboxes).map(cb => cb.value);

    if (templateIds.length === 0) {
        return UI.showToast('Please select at least one template to share', 'warning');
    }

    const btn = document.getElementById('btn-generate-code');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Generating...';
    btn.disabled = true;

    try {
        const res = await api.request('/templates/share/generate', 'POST', { templateIds });
        const code = res.data.shareCode;

        document.getElementById('generated-code-container').classList.remove('hidden');
        document.getElementById('generated-code-input').value = code;
        
        UI.showToast('Share code generated successfully', 'success');
        
        // Uncheck all
        checkboxes.forEach(cb => cb.checked = false);
    } catch (error) {
        UI.showToast(error.message || 'Failed to generate share code', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function copyShareCode() {
    const input = document.getElementById('generated-code-input');
    input.select();
    document.execCommand('copy');
    UI.showToast('Code copied to clipboard', 'success');
}

async function loadActiveShares() {
    const tbody = document.getElementById('active-shares-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Loading active shares...</td></tr>';

    try {
        const res = await api.request('/templates/share/active');
        const bundles = res.data || [];

        if (bundles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-slate-500 text-sm"><i class="fas fa-inbox text-2xl text-slate-300 block mb-2"></i>No active share bundles.</td></tr>';
            return;
        }

        tbody.innerHTML = bundles.map(b => {
            const date = new Date(b.createdAt).toLocaleString();
            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3 font-mono font-bold text-slate-800">${b.shareCode}</td>
                    <td class="p-3">
                        <span class="inline-flex items-center justify-center px-2 py-1 text-xs font-bold bg-brand-100 text-brand-700 rounded-full">
                            ${b.templateIds.length} Items
                        </span>
                    </td>
                    <td class="p-3 text-xs text-slate-500">${date}</td>
                    <td class="p-3 text-right">
                        <button onclick="revokeShare('${b._id}')" class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs font-bold transition-colors">
                            Stop Sharing
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        UI.showToast('Failed to load active shares', 'error');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-red-500 text-sm">Error loading active shares.</td></tr>';
    }
}

async function revokeShare(bundleId) {
    if (!await UI.showConfirm('Stop Sharing', 'Are you sure you want to delete this share code? Anyone attempting to use it will be denied.', 'Stop Sharing', 'danger')) {
        return;
    }

    try {
        await api.request(`/templates/share/${bundleId}`, 'DELETE');
        UI.showToast('Share revoked successfully', 'success');
        loadActiveShares();
    } catch (error) {
        UI.showToast(error.message || 'Failed to revoke share', 'error');
    }
}

async function previewShareCode() {
    const code = document.getElementById('import-code-input').value.trim();
    if (!code) return UI.showToast('Please enter a share code', 'warning');

    const btn = document.getElementById('btn-preview-share');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    const previewContainer = document.getElementById('import-preview-container');
    previewContainer.classList.add('hidden');

    try {
        const res = await api.request(`/templates/share/preview/${code}`);
        const bundle = res.data;

        document.getElementById('preview-sender-name').textContent = bundle.senderId.name;
        document.getElementById('preview-lab-name').textContent = bundle.senderId.labName || 'N/A';
        
        const ul = document.getElementById('preview-template-list');
        ul.innerHTML = bundle.templateIds.map(t => `<li>${t.templateName} <span class="text-slate-400 text-xs ml-1">(${t.department})</span></li>`).join('');

        previewContainer.classList.remove('hidden');
    } catch (error) {
        UI.showToast(error.message || 'Invalid or expired share code', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function confirmImport() {
    const code = document.getElementById('import-code-input').value.trim();
    if (!code) return;

    const btn = document.getElementById('btn-confirm-import');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Importing...';
    btn.disabled = true;

    try {
        const res = await api.request('/templates/share/import', 'POST', { shareCode: code });
        UI.showToast(`Successfully imported ${res.count} templates!`, 'success');
        
        closeShareModal();
        
        // Refresh the main templates list to show newly imported templates
        if (typeof loadTemplates === 'function') {
            loadTemplates();
        }
    } catch (error) {
        UI.showToast(error.message || 'Failed to import templates', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
