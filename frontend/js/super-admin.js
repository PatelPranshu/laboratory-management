document.addEventListener('DOMContentLoaded', () => {
    // Check if user is SuperAdmin
    const userStr = localStorage.getItem('lis_user');
    if (!userStr) {
        window.location.href = 'index.html';
        return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== 'SuperAdmin') {
        window.location.href = 'dashboard.html';
        return;
    }

    document.getElementById('admin-name').textContent = user.name || user.email;

    window.loadDashboard = async () => {
        try {
            const statsRes = await api.request('/superadmin/stats');
            const labsRes = await api.request('/superadmin/labs');
            
            updateStatsCards(statsRes.data);
            renderLabsTable(labsRes.data);
            loadDeletionReasons();
        } catch (err) {
            UI.showToast(err.message || 'Failed to load dashboard data', 'error');
        }
    };

    function updateStatsCards(stats) {
        document.getElementById('stat-labs').textContent = stats.totalLabs;
        document.getElementById('stat-users').textContent = stats.totalUsers;
        document.getElementById('stat-reports').textContent = stats.totalReports;
        document.getElementById('stat-deleted').textContent = stats.deletedLabs;
    }

    function renderLabsTable(labs) {
        const activeTbody = document.getElementById('labs-tbody');
        const deletedTbody = document.getElementById('deleted-labs-tbody');

        const activeLabs = labs.filter(l => !l.isDeleted);
        const deletedLabs = labs.filter(l => l.isDeleted);

        // Render Active/Suspended
        if (activeLabs.length === 0) {
            activeTbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500 font-medium">No active or suspended laboratories.</td></tr>';
        } else {
            activeTbody.innerHTML = activeLabs.map(lab => {
                const isSuspended = lab.accountStatus === 'Suspended';
                const statusBadge = isSuspended 
                    ? `<span class="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg uppercase tracking-wide">Suspended</span>`
                    : `<span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg uppercase tracking-wide">Active</span>`;

                return `
                    <tr class="hover:bg-slate-50/50 transition-colors pointer-events-auto">
                        <td class="p-4 pl-6">
                            <div class="font-bold text-slate-800">${lab.labName || 'N/A'}</div>
                            <div class="text-xs text-slate-500 mt-0.5">Joined ${new Date(lab.createdAt).toLocaleDateString()}</div>
                        </td>
                        <td class="p-4">
                            <div class="font-bold text-slate-700">${lab.name}</div>
                            <div class="text-xs text-slate-500 mt-0.5">${lab.email}</div>
                        </td>
                        <td class="p-4">
                            ${statusBadge}
                        </td>
                        <td class="p-4 text-center">
                            <button onclick="window.location.href='lab-details.html?id=${lab._id}'" class="px-3 py-1.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-lg text-xs font-bold transition-colors mr-2">
                                <i class="fas fa-eye mr-1"></i> View Lab
                            </button>
                            <button onclick="toggleStatus('${lab._id}', '${isSuspended ? 'Active' : 'Suspended'}')" class="px-3 py-1.5 ${isSuspended ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'} rounded-lg text-xs font-bold transition-colors">
                                <i class="fas ${isSuspended ? 'fa-play' : 'fa-pause'} mr-1"></i> ${isSuspended ? 'Activate' : 'Suspend'}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Render Deleted Labs
        if (deletedLabs.length === 0) {
            deletedTbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500 font-medium">No deleted laboratories in recycle bin.</td></tr>';
        } else {
            deletedTbody.innerHTML = deletedLabs.map(lab => {
                const isHeld = lab.holdDeletion;
                let statusBadge = `<span class="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg uppercase tracking-wide">Soft Deleted</span>`;
                if (isHeld) {
                    statusBadge += `<span class="ml-2 px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg uppercase tracking-wide">Held</span>`;
                }

                return `
                    <tr class="hover:bg-red-50/20 transition-colors pointer-events-auto">
                        <td class="p-4 pl-6">
                            <div class="font-bold text-slate-800">${lab.labName || 'N/A'}</div>
                            <div class="text-xs text-slate-500 mt-0.5">${statusBadge}</div>
                        </td>
                        <td class="p-4">
                            <div class="font-bold text-slate-700">${lab.name}</div>
                            <div class="text-xs text-slate-500 mt-0.5">${lab.email}</div>
                        </td>
                        <td class="p-4">
                            <div class="font-bold text-red-600">${new Date(lab.deletedAt).toLocaleDateString()}</div>
                            <div class="text-xs text-slate-500 mt-0.5 max-w-[200px] truncate" title="${escapeHtml(lab.deletionReason || '')}">Reason: ${escapeHtml(lab.deletionReason || 'None given')}</div>
                        </td>
                        <td class="p-4 text-center">
                            <button onclick="restoreLab('${lab._id}')" class="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors mr-2">
                                <i class="fas fa-undo mr-1"></i> Restore
                            </button>
                            <button onclick="toggleHold('${lab._id}')" class="px-3 py-1.5 ${isHeld ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'} rounded-lg text-xs font-bold transition-colors">
                                <i class="fas fa-hand-paper mr-1"></i> ${isHeld ? 'Release Hold' : 'Hold Deletion'}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Global Actions
    window.toggleStatus = async (id, newStatus) => {
        try {
            await api.request(`/superadmin/labs/${id}/status`, 'PUT', { status: newStatus });
            UI.showToast(`Lab marked as ${newStatus}`, 'success');
            loadDashboard();
        } catch (err) {
            UI.showToast(err.message, 'error');
        }
    };

    window.restoreLab = async (id) => {
        const confirmed = await UI.showConfirm('Restore Lab', 'Are you sure you want to restore this lab from deletion?', 'Restore', 'brand');
        if (!confirmed) return;

        try {
            await api.request(`/superadmin/labs/${id}/restore`, 'PUT');
            UI.showToast('Lab restored successfully', 'success');
            loadDashboard();
        } catch (err) {
            UI.showToast(err.message, 'error');
        }
    };

    window.toggleHold = async (id) => {
        try {
            await api.request(`/superadmin/labs/${id}/hold`, 'PUT');
            UI.showToast('Hold status updated', 'success');
            loadDashboard();
        } catch (err) {
            UI.showToast(err.message, 'error');
        }
    };

    // Deletion Reasons Management
    let currentReasons = [];

    window.loadDeletionReasons = async () => {
        try {
            const res = await api.request('/superadmin/settings/deletion-reasons');
            currentReasons = res.data || [];
            renderDeletionReasons();
        } catch (err) {
            UI.showToast('Failed to load deletion reasons', 'error');
        }
    };

    function renderDeletionReasons() {
        const list = document.getElementById('deletion-reasons-list');
        if (!currentReasons || currentReasons.length === 0) {
            list.innerHTML = '<div class="text-sm text-slate-500">No reasons defined. Default "Other" will be used.</div>';
            return;
        }

        list.innerHTML = currentReasons.map((reason, index) => `
            <div class="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                <span class="text-sm font-medium text-slate-700">${typeof escapeHtml === 'function' ? escapeHtml(reason) : reason}</span>
                <button onclick="removeDeletionReason(${index})" class="text-red-500 hover:text-red-700 transition-colors" title="Remove">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('');
    }

    window.addDeletionReason = async () => {
        const input = document.getElementById('new-reason-input');
        const val = input.value.trim();
        if (!val) return;

        if (currentReasons.includes(val)) {
            UI.showToast('Reason already exists', 'error');
            return;
        }

        const newReasons = [...currentReasons, val];
        try {
            UI.toggleLoader('add-reason-btn', true); 
            await api.request('/superadmin/settings/deletion-reasons', 'PUT', { reasons: newReasons });
            currentReasons = newReasons;
            input.value = '';
            renderDeletionReasons();
            UI.showToast('Reason added', 'success');
        } catch (err) {
            UI.showToast(err.message || 'Failed to add reason', 'error');
        } finally {
            UI.toggleLoader('add-reason-btn', false, '<i class="fas fa-plus mr-1"></i> Add Option');
        }
    };

    window.removeDeletionReason = async (index) => {
        const newReasons = [...currentReasons];
        newReasons.splice(index, 1);
        
        try {
            await api.request('/superadmin/settings/deletion-reasons', 'PUT', { reasons: newReasons });
            currentReasons = newReasons;
            renderDeletionReasons();
            UI.showToast('Reason removed', 'success');
        } catch (err) {
            UI.showToast(err.message || 'Failed to remove reason', 'error');
        }
    };

    // Initial load
    loadDashboard();
});
