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
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) {
            btn.className = "flex-1 py-2 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-800 transition-all bg-transparent";
        }
    });

    // Show active
    document.getElementById(`tab-content-${tab}`).classList.remove('hidden');
    const activeBtn = document.getElementById(`tab-btn-${tab}`);
    if (activeBtn) {
        activeBtn.className = "flex-1 py-2 text-xs font-bold rounded-lg bg-white text-slate-800 shadow-sm transition-all";
    }

    // Trigger loads
    if (tab === 'generate') {
        resetGenerateUI();
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
        document.getElementById('btn-generate-code').classList.add('hidden');
        document.getElementById('generated-code-input').value = code;
        
        // Hide unselected templates
        const allCheckboxes = document.querySelectorAll('.share-template-cb');
        allCheckboxes.forEach(cb => {
            if (!cb.checked) {
                const label = cb.closest('label');
                if (label) label.classList.add('hidden');
            }
        });
        
        UI.showToast('Share code generated successfully', 'success');
        
        // Uncheck all so they are ready for next time
        checkboxes.forEach(cb => cb.checked = false);
    } catch (error) {
        UI.showToast(error.message || 'Failed to generate share code', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function resetGenerateUI() {
    const codeContainer = document.getElementById('generated-code-container');
    const genBtn = document.getElementById('btn-generate-code');
    if (codeContainer) codeContainer.classList.add('hidden');
    if (genBtn) genBtn.classList.remove('hidden');
    
    const allCheckboxes = document.querySelectorAll('.share-template-cb');
    allCheckboxes.forEach(cb => {
        const label = cb.closest('label');
        if (label) label.classList.remove('hidden');
    });
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
            
            // Templates list HTML
            const templatesHtml = b.templateIds && b.templateIds.length > 0 
                ? b.templateIds.map(t => `<li class="text-xs text-slate-700 flex items-center py-1 border-b border-slate-50 last:border-0"><i class="fas fa-file-alt text-brand-400 mr-2"></i>${t.templateName} <span class="text-[10px] text-slate-400 ml-2 bg-slate-100 px-1.5 py-0.5 rounded">${t.department}</span></li>`).join('')
                : '<li class="text-xs text-slate-500 italic">No templates available.</li>';
                
            // Imported by HTML
            const importedByHtml = b.importedBy && b.importedBy.length > 0 
                ? b.importedBy.map(imp => {
                    const impDate = new Date(imp.importedAt).toLocaleString();
                    const userName = imp.user ? imp.user.name : 'Unknown User';
                    const lab = imp.user ? imp.user.labName : (imp.labName || 'Unknown Lab');
                    return `
                    <li class="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
                        <div class="text-xs font-bold text-slate-800">${userName} <span class="text-slate-400 font-normal px-1">from</span> ${lab}</div>
                        <div class="text-[10px] text-slate-500 mt-1"><i class="far fa-clock mr-1"></i>${impDate}</div>
                    </li>
                    `;
                }).join('')
                : '<div class="text-xs text-slate-500 italic bg-white p-3 rounded border border-slate-100">No one has imported this bundle yet.</div>';

            return `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                    <td class="p-3 font-mono font-bold text-slate-800 align-middle">${b.shareCode}</td>
                    <td class="p-3 align-middle">
                        <span class="inline-flex items-center justify-center px-2 py-1 text-[10px] font-bold bg-brand-100 text-brand-700 rounded-lg">
                            ${b.templateIds ? b.templateIds.length : 0} Items
                        </span>
                    </td>
                    <td class="p-3 text-xs text-slate-500 align-middle">${date}</td>
                    <td class="p-3 text-right align-middle">
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="toggleShareDetails('${b._id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors">
                                View More
                            </button>
                            <button onclick="revokeShare('${b._id}')" class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition-colors">
                                Stop Sharing
                            </button>
                        </div>
                    </td>
                </tr>
                <tr id="details-${b._id}" class="hidden bg-slate-50/50 border-b border-slate-100 shadow-inner">
                    <td colspan="4" class="p-0">
                        <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 class="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2 flex items-center"><i class="fas fa-layer-group text-brand-500 mr-2"></i> Shared Templates</h4>
                                <ul class="bg-white border border-slate-200 rounded-lg p-2 shadow-sm">
                                    ${templatesHtml}
                                </ul>
                            </div>
                            <div>
                                <h4 class="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2 flex items-center"><i class="fas fa-download text-green-500 mr-2"></i> Import History</h4>
                                <ul class="space-y-2">
                                    ${importedByHtml}
                                </ul>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        UI.showToast('Failed to load active shares', 'error');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-red-500 text-sm">Error loading active shares.</td></tr>';
    }
}

window.toggleShareDetails = function(id) {
    const detailsRow = document.getElementById(`details-${id}`);
    if (detailsRow) {
        if (detailsRow.classList.contains('hidden')) {
            detailsRow.classList.remove('hidden');
        } else {
            detailsRow.classList.add('hidden');
        }
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
        document.getElementById('preview-template-count').textContent = bundle.templateIds.length;
        
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
