document.addEventListener('DOMContentLoaded', () => {
    const userStr = localStorage.getItem('lis_user');
    const user = JSON.parse(userStr || '{}');

    document.getElementById('admin-name').textContent = user.name || user.email;

    // ==================== Tab Management ====================
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabLoaded = { dashboard: false, labs: false, audit: false, announcements: false, settings: false };

    window.switchTab = (tabName) => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        const content = document.getElementById(`tab-${tabName}`);
        if (btn) btn.classList.add('active');
        if (content) content.classList.add('active');

        // Lazy load tab data
        if (!tabLoaded[tabName]) {
            tabLoaded[tabName] = true;
            if (tabName === 'labs') window.loadLabs();
            if (tabName === 'audit') window.loadAuditLogs(1);
            if (tabName === 'announcements') window.loadAnnouncements();
            if (tabName === 'settings') window.loadDeletionReasons();
        }

        window.location.hash = tabName;
    };

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Restore tab from URL hash
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById(`tab-${hash}`)) {
        switchTab(hash);
    }

    // Search on Enter key
    const searchInput = document.getElementById('lab-search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.loadLabs();
        });
    }

    // ==================== Dashboard ====================
    async function loadDashboard() {
        try {
            const res = await api.request('/superadmin/stats');
            const s = res.data;

            document.getElementById('stat-labs').textContent = s.totalLabs;
            document.getElementById('stat-users').textContent = s.totalUsers;
            document.getElementById('stat-users-breakdown').textContent = `${s.totalDoctors} Doctors, ${s.totalLabTechs} Lab Techs`;
            document.getElementById('stat-reports').textContent = s.totalReports;
            document.getElementById('stat-new-week').textContent = s.newLabsThisWeek;
            document.getElementById('stat-suspended').textContent = s.suspendedLabs;
            document.getElementById('stat-deleted').textContent = s.deletedLabs;
            document.getElementById('stat-pending').textContent = s.pendingLabs;
        } catch (err) {
            UI.showToast(err.message || 'Failed to load dashboard', 'error');
        }
    }

    // ==================== Lab Management ====================
    let labsCurrentPage = 1;

    window.loadLabs = async (page = 1) => {
        labsCurrentPage = page;
        const search = document.getElementById('lab-search-input')?.value?.trim() || '';
        const status = document.getElementById('lab-status-filter')?.value || '';

        let endpoint = `/superadmin/labs?page=${page}&limit=20`;
        if (search) endpoint += `&search=${encodeURIComponent(search)}`;
        if (status) endpoint += `&status=${status}`;

        try {
            const res = await api.request(endpoint);
            renderLabsTable(res.data, res.pagination);
        } catch (err) {
            UI.showToast(err.message || 'Failed to load labs', 'error');
        }
    };

    function renderLabsTable(labs, pagination) {
        const tbody = document.getElementById('labs-tbody');
        const label = document.getElementById('labs-count-label');
        label.textContent = `Showing ${labs.length} of ${pagination.total} labs (Page ${pagination.page}/${pagination.pages || 1})`;

        if (labs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500 font-medium">No labs found matching your criteria.</td></tr>';
            renderPagination('labs-pagination-container', pagination, window.loadLabs);
            return;
        }

        tbody.innerHTML = labs.map(lab => {
            const isDeleted = lab.isDeleted;
            const isSuspended = lab.accountStatus === 'Suspended';
            const isPending = lab.accountStatus === 'Pending';

            let statusBadge;
            if (isDeleted) {
                statusBadge = `<span class="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg uppercase tracking-wide">Deleted</span>`;
                if (lab.holdDeletion) statusBadge += ` <span class="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded uppercase">Held</span>`;
            } else if (isSuspended) {
                statusBadge = `<span class="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg uppercase tracking-wide">Suspended</span>`;
            } else if (isPending) {
                statusBadge = `<span class="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg uppercase tracking-wide">Pending</span>`;
            } else {
                statusBadge = `<span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg uppercase tracking-wide">Active</span>`;
            }

            // Build action buttons based on state
            let actions = `<button onclick="window.location.href='lab-details?id=${lab._id}'" class="px-2.5 py-1.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-lg text-xs font-bold transition-colors" title="View Details"><i class="fas fa-eye"></i></button>`;

            if (isDeleted) {
                actions += ` <button onclick="restoreLab('${lab._id}')" class="px-2.5 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors" title="Restore"><i class="fas fa-undo"></i></button>`;
                actions += ` <button onclick="toggleHold('${lab._id}')" class="px-2.5 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg text-xs font-bold transition-colors" title="${lab.holdDeletion ? 'Release Hold' : 'Hold Deletion'}"><i class="fas fa-hand-paper"></i></button>`;
                actions += ` <button onclick="permanentDeleteLab('${lab._id}', '${escapeHtml(lab.email)}')" class="px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors" title="Permanent Delete"><i class="fas fa-skull-crossbones"></i></button>`;
            } else {
                actions += ` <button onclick="toggleStatus('${lab._id}', '${isSuspended ? 'Active' : 'Suspended'}')" class="px-2.5 py-1.5 ${isSuspended ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'} rounded-lg text-xs font-bold transition-colors" title="${isSuspended ? 'Activate' : 'Suspend'}"><i class="fas ${isSuspended ? 'fa-play' : 'fa-pause'}"></i></button>`;
                actions += ` <button onclick="forcePasswordReset('${lab._id}', '${escapeHtml(lab.labName || lab.email)}')" class="px-2.5 py-1.5 bg-violet-50 text-violet-600 hover:bg-violet-100 rounded-lg text-xs font-bold transition-colors" title="Force Password Reset"><i class="fas fa-key"></i></button>`;
            }

            return `
                <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="p-4 pl-6">
                        <div class="font-bold text-slate-800">${escapeHtml(lab.labName || 'N/A')}</div>
                        <div class="text-xs text-slate-500 mt-0.5">ID: ${lab._id}</div>
                    </td>
                    <td class="p-4">
                        <div class="font-bold text-slate-700">${escapeHtml(lab.name)}</div>
                        <div class="text-xs text-slate-500 mt-0.5">${escapeHtml(lab.email)}</div>
                    </td>
                    <td class="p-4">${statusBadge}</td>
                    <td class="p-4">
                        <div class="text-xs text-slate-600">${new Date(lab.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td class="p-4 text-center">
                        <div class="flex items-center justify-center gap-1.5 flex-wrap">${actions}</div>
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination('labs-pagination-container', pagination, window.loadLabs);
    }

    // ==================== Lab Actions ====================
    window.toggleStatus = async (id, newStatus) => {
        try {
            await api.request(`/superadmin/labs/${id}/status`, 'PUT', { status: newStatus });
            UI.showToast(`Lab marked as ${newStatus}`, 'success');
            window.loadLabs(labsCurrentPage);
            loadDashboard();
        } catch (err) { UI.showToast(err.message, 'error'); }
    };

    window.restoreLab = async (id) => {
        const confirmed = await UI.showConfirm('Restore Lab', 'Are you sure you want to restore this lab from deletion?', 'Restore', 'brand');
        if (!confirmed) return;
        try {
            await api.request(`/superadmin/labs/${id}/restore`, 'PUT');
            UI.showToast('Lab restored successfully', 'success');
            window.loadLabs(labsCurrentPage);
            loadDashboard();
        } catch (err) { UI.showToast(err.message, 'error'); }
    };

    window.toggleHold = async (id) => {
        try {
            await api.request(`/superadmin/labs/${id}/hold`, 'PUT');
            UI.showToast('Hold status updated', 'success');
            window.loadLabs(labsCurrentPage);
        } catch (err) { UI.showToast(err.message, 'error'); }
    };

    window.forcePasswordReset = async (id, labName) => {
        const confirmed = await UI.showConfirm(
            'Force Password Reset',
            `This will force ALL users in "${labName}" (admin + staff) to change their password on next login. Continue?`,
            'Force Reset', 'danger'
        );
        if (!confirmed) return;
        try {
            const res = await api.request(`/superadmin/labs/${id}/force-password-reset`, 'POST');
            UI.showToast(res.message, 'success');
        } catch (err) { UI.showToast(err.message, 'error'); }
    };

    window.permanentDeleteLab = async (id, labEmail) => {
        const confirmed = await UI.showConfirm(
            '⚠️ PERMANENT DELETION',
            'This will permanently delete this lab, ALL staff, ALL patients, and ALL reports. This action CANNOT be undone. Are you absolutely sure?',
            'Yes, Delete Everything', 'danger'
        );
        if (!confirmed) return;

        const typedEmail = await UI.showPrompt(
            'Confirm Permanent Deletion',
            `Type the lab admin email to confirm: ${labEmail}`,
            labEmail
        );
        if (!typedEmail) return;

        try {
            const res = await api.request(`/superadmin/labs/${id}/permanent`, 'DELETE', { confirmEmail: typedEmail });
            UI.showToast(res.message, 'success');
            window.loadLabs(labsCurrentPage);
            loadDashboard();
        } catch (err) { UI.showToast(err.message, 'error'); }
    };

    // ==================== Audit Logs ====================
    let auditCurrentPage = 1;

    window.loadAuditLogs = async (page = 1) => {
        auditCurrentPage = page;
        const action = document.getElementById('audit-action-filter')?.value || '';
        const startDate = document.getElementById('audit-start-date')?.value || '';
        const endDate = document.getElementById('audit-end-date')?.value || '';

        let endpoint = `/superadmin/audit-logs?page=${page}&limit=25`;
        if (action) endpoint += `&action=${action}`;
        if (startDate) endpoint += `&startDate=${startDate}`;
        if (endDate) endpoint += `&endDate=${endDate}`;

        try {
            const res = await api.request(endpoint);
            renderAuditLogs(res.data, res.pagination);
        } catch (err) {
            UI.showToast(err.message || 'Failed to load audit logs', 'error');
        }
    };

    function renderAuditLogs(logs, pagination) {
        const tbody = document.getElementById('audit-tbody');

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500 font-medium">No audit logs found for the selected filters.</td></tr>';
            renderPagination('audit-pagination-container', pagination, window.loadAuditLogs);
            return;
        }

        const actionColors = {
            'LAB_SUSPENDED': 'bg-amber-100 text-amber-700',
            'LAB_ACTIVATED': 'bg-emerald-100 text-emerald-700',
            'LAB_RESTORED': 'bg-blue-100 text-blue-700',
            'LAB_HOLD_TOGGLED': 'bg-slate-100 text-slate-700',
            'LAB_PERMANENTLY_DELETED': 'bg-red-100 text-red-700',
            'STAFF_ROLE_CHANGED': 'bg-indigo-100 text-indigo-700',
            'STAFF_REMOVED': 'bg-orange-100 text-orange-700',
            'STAFF_HARD_DELETED': 'bg-red-100 text-red-700',
            'PASSWORD_RESET_FORCED': 'bg-violet-100 text-violet-700',
            'ANNOUNCEMENT_CREATED': 'bg-purple-100 text-purple-700',
            'ANNOUNCEMENT_DELETED': 'bg-pink-100 text-pink-700',
            'DELETION_REASONS_UPDATED': 'bg-slate-100 text-slate-700',
            'DATA_EXPORTED': 'bg-emerald-100 text-emerald-700'
        };

        tbody.innerHTML = logs.map(log => {
            const colorClass = actionColors[log.action] || 'bg-slate-100 text-slate-700';
            const performer = log.performedBy ? (log.performedBy.name || log.performedBy.email || 'Unknown') : 'System';
            const timestamp = new Date(log.createdAt);
            const dateStr = timestamp.toLocaleDateString();
            const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
                <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="p-4 pl-6">
                        <div class="text-sm font-bold text-slate-700">${dateStr}</div>
                        <div class="text-xs text-slate-400">${timeStr}</div>
                    </td>
                    <td class="p-4">
                        <span class="audit-action px-2 py-1 ${colorClass} rounded-md font-bold uppercase tracking-wider">${log.action.replace(/_/g, ' ')}</span>
                    </td>
                    <td class="p-4">
                        <div class="text-sm font-medium text-slate-700">${escapeHtml(performer)}</div>
                    </td>
                    <td class="p-4">
                        <div class="text-sm text-slate-600 max-w-xs truncate" title="${escapeHtml(log.details)}">${escapeHtml(log.details)}</div>
                    </td>
                    <td class="p-4">
                        <span class="text-xs font-mono text-slate-400">${escapeHtml(log.ipAddress || 'N/A')}</span>
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination('audit-pagination-container', pagination, window.loadAuditLogs);
    }

    // ==================== Announcements ====================
    window.createAnnouncement = async () => {
        const title = document.getElementById('announcement-title')?.value?.trim();
        const message = document.getElementById('announcement-message')?.value?.trim();
        const type = document.getElementById('announcement-type')?.value || 'info';

        if (!title || !message) {
            UI.showToast('Title and message are required', 'error');
            return;
        }

        try {
            UI.toggleLoader('send-announcement-btn', true);
            await api.request('/superadmin/announcements', 'POST', { title, message, type });
            document.getElementById('announcement-title').value = '';
            document.getElementById('announcement-message').value = '';
            UI.showToast('Announcement sent to all users', 'success');
            window.loadAnnouncements();
        } catch (err) {
            UI.showToast(err.message || 'Failed to send announcement', 'error');
        } finally {
            UI.toggleLoader('send-announcement-btn', false, '<i class="fas fa-paper-plane mr-1.5"></i> Send Announcement');
        }
    };

    window.loadAnnouncements = async () => {
        try {
            const res = await api.request('/superadmin/announcements');
            renderAnnouncements(res.data);
        } catch (err) {
            UI.showToast(err.message || 'Failed to load announcements', 'error');
        }
    };

    function renderAnnouncements(announcements) {
        const container = document.getElementById('announcements-list');

        if (!announcements || announcements.length === 0) {
            container.innerHTML = '<div class="p-8 text-center text-slate-400">No announcements yet. Create one above.</div>';
            return;
        }

        const typeIcons = { info: 'fa-info-circle text-blue-500', warning: 'fa-exclamation-triangle text-amber-500', critical: 'fa-exclamation-circle text-red-500' };
        const typeBg = { info: 'border-l-blue-400', warning: 'border-l-amber-400', critical: 'border-l-red-400' };

        container.innerHTML = announcements.map(a => `
            <div class="p-4 sm:p-5 flex items-start gap-3 border-l-4 ${typeBg[a.type] || typeBg.info} hover:bg-slate-50/50 transition-colors">
                <i class="fas ${typeIcons[a.type] || typeIcons.info} text-lg mt-0.5 shrink-0"></i>
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <h4 class="text-sm font-bold text-slate-800">${escapeHtml(a.title)}</h4>
                            <p class="text-sm text-slate-600 mt-1">${escapeHtml(a.message)}</p>
                        </div>
                        <button onclick="deleteAnnouncement('${a.id}')" class="text-slate-400 hover:text-red-500 transition-colors shrink-0 p-1" title="Delete">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                    <p class="text-xs text-slate-400 mt-2">${new Date(a.createdAt).toLocaleString()}</p>
                </div>
            </div>
        `).join('');
    }

    window.deleteAnnouncement = async (id) => {
        const confirmed = await UI.showConfirm('Delete Announcement', 'Remove this announcement?', 'Delete', 'danger');
        if (!confirmed) return;
        try {
            await api.request(`/superadmin/announcements/${id}`, 'DELETE');
            UI.showToast('Announcement deleted', 'success');
            window.loadAnnouncements();
        } catch (err) { UI.showToast(err.message, 'error'); }
    };

    // ==================== Data Export ====================
    window.exportLabsCsv = async () => {
        try {
            const response = await fetch(`${BASE_URL}/superadmin/export/labs`, { credentials: 'include' });
            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `labs-export-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            UI.showToast('CSV exported successfully', 'success');
        } catch (err) {
            UI.showToast(err.message || 'Failed to export CSV', 'error');
        }
    };

    // ==================== Deletion Reasons ====================
    let currentReasons = [];

    window.loadDeletionReasons = async () => {
        try {
            const res = await api.request('/superadmin/settings/deletion-reasons');
            currentReasons = res.data || [];
            renderDeletionReasons();
        } catch (err) { UI.showToast('Failed to load deletion reasons', 'error'); }
    };

    function renderDeletionReasons() {
        const list = document.getElementById('deletion-reasons-list');
        if (!currentReasons || currentReasons.length === 0) {
            list.innerHTML = '<div class="text-sm text-slate-500">No reasons defined. Default "Other" will be used.</div>';
            return;
        }
        list.innerHTML = currentReasons.map((reason, index) => `
            <div class="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                <span class="text-sm font-medium text-slate-700">${escapeHtml(reason)}</span>
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
        if (currentReasons.includes(val)) { UI.showToast('Reason already exists', 'error'); return; }

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
        } catch (err) { UI.showToast(err.message || 'Failed to remove reason', 'error'); }
    };

    // ==================== Pagination Helper ====================
    function renderPagination(containerId, pagination, loadFn) {
        const container = document.getElementById(containerId);
        if (!container || !pagination) return;

        const { page, pages, total } = pagination;
        if (pages <= 1) {
            container.innerHTML = `<span class="text-xs text-slate-400">${total} total</span><span></span>`;
            return;
        }

        let buttons = '';
        const maxVisible = 5;
        let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
        let endPage = Math.min(pages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

        if (page > 1) {
            buttons += `<button onclick="${loadFn.name}(${page - 1})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"><i class="fas fa-chevron-left"></i></button>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === page;
            buttons += `<button onclick="${loadFn.name}(${i})" class="px-3 py-1.5 ${isActive ? 'bg-brand-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'} rounded-lg text-xs font-bold transition-colors">${i}</button>`;
        }

        if (page < pages) {
            buttons += `<button onclick="${loadFn.name}(${page + 1})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"><i class="fas fa-chevron-right"></i></button>`;
        }

        container.innerHTML = `
            <span class="text-xs text-slate-400">${total} total</span>
            <div class="flex gap-1">${buttons}</div>
        `;
    }

    // ==================== Initial Load ====================
    loadDashboard();
});

