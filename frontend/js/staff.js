/**
 * Enterprise Team Management
 * Optimized, lightweight, and aligned with standard site UI theme.
 */

let staffMembers = [];
let pendingInvitations = [];
let activeTab = 'team';
let currentSearch = '';
let selectedRole = '';
let selectedStatus = '';

document.addEventListener('DOMContentLoaded', () => {
    loadCommonLayout();
    initStaffModule();
});

function initStaffModule() {
    setupTabSwitching();
    setupSearchAndFilters();
    setupEventDelegation();
    setupModals();

    loadStaff();
    loadInvitations();

    if (typeof TabFocusRefresh !== 'undefined') {
        TabFocusRefresh.register(() => {
            loadStaff();
            loadInvitations();
        });
    }
}

// ---------------- Data Loading ---------------- //

async function loadStaff() {
    const tbody = document.getElementById('staff-table-body');
    try {
        const res = await api.request('/staff');
        if (res && res.success) {
            staffMembers = Array.isArray(res.data) ? res.data : [];
            updateKPIs();
            renderTeamTable();
        } else {
            tbody.innerHTML = `<tr><td colspan="5" class="py-16 text-center text-red-500 font-semibold text-sm">Failed to load team members</td></tr>`;
        }
    } catch (err) {
        console.error('[Staff] loadStaff error:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="py-16 text-center text-red-500 font-semibold text-sm">Error connecting to server</td></tr>`;
    }
}

async function loadInvitations() {
    const tbody = document.getElementById('invitations-table-body');
    try {
        const res = await api.request('/staff/invitations');
        if (res && res.success) {
            pendingInvitations = Array.isArray(res.data) ? res.data : [];
            updateKPIs();
            renderInvitationsTable();
        } else {
            tbody.innerHTML = `<tr><td colspan="5" class="py-16 text-center text-red-500 font-semibold text-sm">Failed to load pending invitations</td></tr>`;
        }
    } catch (err) {
        console.error('[Staff] loadInvitations error:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="py-16 text-center text-red-500 font-semibold text-sm">Error loading invitations</td></tr>`;
    }
}

function updateKPIs() {
    const teamBadge = document.getElementById('badge-team-count');
    const inviteBadge = document.getElementById('badge-invite-count');
    if (teamBadge) teamBadge.textContent = staffMembers.length;
    if (inviteBadge) inviteBadge.textContent = pendingInvitations.length;
}

// ---------------- Rendering ---------------- //

function renderTeamTable() {
    const tbody = document.getElementById('staff-table-body');
    const summaryText = document.getElementById('table-summary-text');
    if (!tbody) return;

    const filtered = staffMembers.filter(member => {
        const name = (member.name || '').toLowerCase();
        const email = (member.email || '').toLowerCase();
        const query = currentSearch.toLowerCase();
        const matchesQuery = !query || name.includes(query) || email.includes(query);
        const matchesRole = !selectedRole || member.role === selectedRole;
        const matchesStatus = !selectedStatus || member.accountStatus === selectedStatus;
        return matchesQuery && matchesRole && matchesStatus;
    });

    if (summaryText && activeTab === 'team') {
        summaryText.textContent = `Showing ${filtered.length} of ${staffMembers.length} staff members`;
    }

    if (filtered.length === 0) {
        const emptyMsg = staffMembers.length === 0
            ? 'No team members registered yet. Click "Add Staff" to invite a doctor or technician.'
            : 'No staff members match the selected search or filter criteria.';
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-16 text-center text-slate-500 block sm:table-cell">
                    <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                        <i class="fas fa-users-slash text-lg"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-700">No staff members found</p>
                    <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">${emptyMsg}</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(user => {
        const safeName = escapeHtml(user.name || 'Unnamed Staff');
        const safeEmail = escapeHtml(user.email || '');
        const role = user.role || 'Doctor';
        const isRootAdmin = role === 'Admin';
        const status = user.accountStatus || 'Active';
        const isSuspended = status === 'Suspended';

        // Safe 2-letter initials
        const rawInitials = (user.name || user.email || 'ST').trim();
        const initials = escapeHtml(rawInitials.substring(0, 2).toUpperCase());

        const roleBadgeClass = role === 'Doctor'
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : role === 'LabTech'
            ? 'bg-teal-50 text-teal-700 border-teal-200'
            : 'bg-purple-50 text-purple-700 border-purple-200';

        const roleIcon = role === 'Doctor' ? 'fa-user-md' : (role === 'LabTech' ? 'fa-vial' : 'fa-user-shield');

        const statusBadgeClass = isSuspended
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200';

        return `
            <tr class="hover:bg-slate-50/80 transition-colors block sm:table-row p-4 sm:p-0 border-b border-slate-100 sm:border-0 last:border-0">
                <td class="px-0 sm:px-7 py-2 sm:py-4 whitespace-nowrap flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase tracking-widest">Staff Member</span>
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 font-bold text-xs shrink-0 shadow-sm">
                            ${initials}
                        </div>
                        <div class="ml-3.5">
                            <div class="text-sm font-bold text-slate-800">${safeName}</div>
                            <div class="text-[11px] text-slate-400 font-medium sm:hidden">${safeEmail}</div>
                        </div>
                    </div>
                </td>
                <td class="px-0 sm:px-7 py-2 sm:py-4 whitespace-nowrap text-sm font-medium text-slate-600 hidden sm:table-cell">
                    ${safeEmail}
                </td>
                <td class="px-0 sm:px-7 py-2 sm:py-4 whitespace-nowrap flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role</span>
                    <span class="px-2.5 py-1 inline-flex text-xs leading-4 font-bold rounded-lg border ${roleBadgeClass} items-center gap-1.5">
                        <i class="fas ${roleIcon} text-[10px]"></i>
                        <span>${escapeHtml(role === 'Doctor' ? 'Doctor / Pathologist' : (role === 'LabTech' ? 'Lab Technician' : role))}</span>
                    </span>
                </td>
                <td class="px-0 sm:px-7 py-2 sm:py-4 whitespace-nowrap flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
                    <span class="px-2.5 py-1 inline-flex text-xs leading-4 font-bold rounded-lg border ${statusBadgeClass} items-center">
                        <i class="fas fa-circle text-[6px] mr-1.5 ${isSuspended ? 'text-rose-500' : 'text-emerald-500'}"></i>
                        <span>${escapeHtml(status)}</span>
                    </span>
                </td>
                <td class="px-0 sm:px-7 pt-3 sm:pt-4 pb-2 sm:pb-4 whitespace-nowrap text-right text-sm font-medium block sm:table-cell border-t border-slate-100 sm:border-0 mt-2 sm:mt-0">
                    <div class="flex items-center justify-end space-x-2">
                        ${!isRootAdmin ? `
                            <button data-action="edit" data-id="${user._id}" data-name="${safeName}" data-role="${user.role}" data-status="${status}" class="p-2 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none" title="Edit Staff Member">
                                <i class="fas fa-pen text-xs"></i>
                            </button>
                            <button data-action="toggle-status" data-id="${user._id}" data-name="${safeName}" data-status="${status}" class="p-2 text-slate-400 ${isSuspended ? 'hover:text-emerald-600 hover:bg-emerald-50' : 'hover:text-amber-600 hover:bg-amber-50'} rounded-lg transition-colors focus:outline-none" title="${isSuspended ? 'Activate Account' : 'Suspend Account'}">
                                <i class="fas ${isSuspended ? 'fa-user-check text-emerald-600' : 'fa-user-slash'} text-xs"></i>
                            </button>
                            <button data-action="delete" data-id="${user._id}" data-name="${safeName}" class="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors focus:outline-none" title="Remove Staff Member">
                                <i class="fas fa-trash-alt text-xs"></i>
                            </button>
                        ` : `
                            <span class="text-xs text-slate-400 font-semibold px-2.5 py-1 bg-slate-100 rounded-md">Primary Admin</span>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderInvitationsTable() {
    const tbody = document.getElementById('invitations-table-body');
    const summaryText = document.getElementById('table-summary-text');
    if (!tbody) return;

    if (summaryText && activeTab === 'invitations') {
        summaryText.textContent = `Showing ${pendingInvitations.length} pending invitations`;
    }

    if (pendingInvitations.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-16 text-center text-slate-500 block sm:table-cell">
                    <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                        <i class="fas fa-envelope-open-text text-lg"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-700">No pending invitations</p>
                    <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">All sent invitations have been accepted, or no invitations have been issued.</p>
                </td>
            </tr>
        `;
        return;
    }

    const now = Date.now();

    tbody.innerHTML = pendingInvitations.map(inv => {
        const safeEmail = escapeHtml(inv.email);
        const role = inv.role || 'Doctor';
        const createdDate = inv.createdAt ? new Date(inv.createdAt) : new Date();
        const expiresDate = inv.expiresAt ? new Date(inv.expiresAt) : new Date(createdDate.getTime() + 24 * 60 * 60 * 1000);
        const isExpired = now > expiresDate.getTime();

        const hoursLeft = Math.max(0, Math.round((expiresDate.getTime() - now) / (1000 * 60 * 60)));
        const expiryText = isExpired ? 'Expired' : `Expires in ~${hoursLeft}h`;
        const expiryBadgeClass = isExpired
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-amber-50 text-amber-700 border-amber-200';

        const roleBadgeClass = role === 'Doctor'
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-teal-50 text-teal-700 border-teal-200';

        return `
            <tr class="hover:bg-slate-50/80 transition-colors block sm:table-row p-4 sm:p-0 border-b border-slate-100 sm:border-0 last:border-0">
                <td class="px-0 sm:px-7 py-2 sm:py-4 whitespace-nowrap flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase tracking-widest">Invited Recipient</span>
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 text-sm shrink-0 shadow-sm">
                            <i class="fas fa-envelope"></i>
                        </div>
                        <div class="ml-3.5">
                            <div class="text-sm font-bold text-slate-800">${safeEmail}</div>
                        </div>
                    </div>
                </td>
                <td class="px-0 sm:px-7 py-2 sm:py-4 whitespace-nowrap flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role</span>
                    <span class="px-2.5 py-1 inline-flex text-xs leading-4 font-bold rounded-lg border ${roleBadgeClass}">
                        ${escapeHtml(role === 'Doctor' ? 'Doctor / Pathologist' : 'Lab Technician')}
                    </span>
                </td>
                <td class="px-0 sm:px-7 py-2 sm:py-4 whitespace-nowrap text-xs text-slate-500 font-medium hidden sm:table-cell">
                    ${createdDate.toLocaleDateString()} ${createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td class="px-0 sm:px-7 py-2 sm:py-4 whitespace-nowrap flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
                    <span class="px-2.5 py-1 inline-flex text-xs leading-4 font-bold rounded-lg border ${expiryBadgeClass} items-center">
                        <i class="fas fa-clock text-[9px] mr-1.5"></i>
                        <span>${expiryText}</span>
                    </span>
                </td>
                <td class="px-0 sm:px-7 pt-3 sm:pt-4 pb-2 sm:pb-4 whitespace-nowrap text-right text-sm font-medium block sm:table-cell border-t border-slate-100 sm:border-0 mt-2 sm:mt-0">
                    <div class="flex items-center justify-end space-x-2">
                        <button data-action="resend-invite" data-id="${inv._id}" data-email="${safeEmail}" class="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-600 border border-brand-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 focus:outline-none" title="Resend invitation email">
                            <i class="fas fa-redo-alt text-[10px]"></i>
                            <span>Resend</span>
                        </button>
                        <button data-action="cancel-invite" data-id="${inv._id}" data-email="${safeEmail}" class="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors focus:outline-none" title="Revoke invitation">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ---------------- Event Delegation ---------------- //

function setupEventDelegation() {
    const teamTbody = document.getElementById('staff-table-body');
    if (teamTbody) {
        teamTbody.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const name = btn.dataset.name;

            if (action === 'edit') {
                const member = staffMembers.find(m => String(m._id) === String(id));
                const targetRole = (member && member.role) || btn.dataset.role || 'Doctor';
                const targetStatus = (member && (member.accountStatus || (member.isSuspended ? 'Suspended' : 'Active'))) || btn.dataset.status || 'Active';
                const targetName = (member && member.name) || name;
                openEditModal(id, targetName, targetRole, targetStatus);
            } else if (action === 'toggle-status') {
                const member = staffMembers.find(m => String(m._id) === String(id));
                const currentStatus = (member && (member.accountStatus || (member.isSuspended ? 'Suspended' : 'Active'))) || btn.dataset.status || 'Active';
                const targetName = (member && member.name) || name;
                const nextStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
                const confirmed = await UI.showConfirm(
                    `${nextStatus === 'Suspended' ? 'Suspend' : 'Activate'} Team Member`,
                    `Are you sure you want to change ${targetName}'s status to ${nextStatus}? ${nextStatus === 'Suspended' ? 'Active login sessions will be revoked.' : 'Access will be restored.'}`,
                    nextStatus === 'Suspended' ? 'Suspend' : 'Activate',
                    nextStatus === 'Suspended' ? 'danger' : 'info'
                );
                if (!confirmed) return;

                try {
                    const res = await api.request(`/staff/${id}`, 'PUT', { accountStatus: nextStatus });
                    if (res && res.success) {
                        UI.showToast(`Updated ${targetName} status to ${nextStatus}`);
                        if (member) {
                            member.accountStatus = nextStatus;
                            member.isSuspended = nextStatus === 'Suspended';
                        }
                        renderTeamTable();
                        loadStaff();
                    } else {
                        UI.showToast((res && res.error) || 'Failed to update status', 'error');
                    }
                } catch (err) {
                    UI.showToast(err.message || 'Error updating status', 'error');
                }
            } else if (action === 'delete') {
                const member = staffMembers.find(m => String(m._id) === String(id));
                const targetName = (member && member.name) || name;
                const confirmed = await UI.showConfirm(
                    'Remove Team Member',
                    `Are you sure you want to remove ${targetName}? Historical reports verified by this staff member will remain intact, but their account will be deactivated.`,
                    'Remove Staff',
                    'danger'
                );
                if (!confirmed) return;

                try {
                    const res = await api.request(`/staff/${id}`, 'DELETE');
                    if (res && res.success) {
                        UI.showToast(`Removed ${targetName}`, 'success');
                        staffMembers = staffMembers.filter(m => String(m._id) !== String(id));
                        updateKPIs();
                        renderTeamTable();
                        loadStaff();
                    } else {
                        UI.showToast((res && res.error) || 'Failed to remove staff', 'error');
                    }
                } catch (err) {
                    UI.showToast(err.message || 'Error removing staff', 'error');
                }
            }
        });
    }

    const invitesTbody = document.getElementById('invitations-table-body');
    if (invitesTbody) {
        invitesTbody.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const email = btn.dataset.email;

            if (action === 'resend-invite') {
                try {
                    btn.disabled = true;
                    btn.classList.add('opacity-60');
                    const res = await api.request(`/staff/invitations/${id}/resend`, 'POST');
                    if (res && res.success) {
                        UI.showToast(`Invitation resent to ${email}`);
                        loadInvitations();
                    } else {
                        UI.showToast((res && res.error) || 'Failed to resend invitation', 'error');
                    }
                } catch (err) {
                    UI.showToast(err.message || 'Error resending invitation', 'error');
                } finally {
                    btn.disabled = false;
                    btn.classList.remove('opacity-60');
                }
            } else if (action === 'cancel-invite') {
                const confirmed = await UI.showConfirm(
                    'Revoke Invitation',
                    `Are you sure you want to revoke the pending invitation for ${email}? The onboarding link will immediately become invalid.`,
                    'Revoke',
                    'danger'
                );
                if (!confirmed) return;

                try {
                    const res = await api.request(`/staff/invitations/${id}`, 'DELETE');
                    if (res && res.success) {
                        UI.showToast('Invitation revoked');
                        loadInvitations();
                    } else {
                        UI.showToast((res && res.error) || 'Failed to revoke invitation', 'error');
                    }
                } catch (err) {
                    UI.showToast(err.message || 'Error revoking invitation', 'error');
                }
            }
        });
    }
}

// ---------------- Tabs & Filters ---------------- //

function setupTabSwitching() {
    const tabTeam = document.getElementById('tab-team');
    const tabInvites = document.getElementById('tab-invitations');
    const panelTeam = document.getElementById('panel-team');
    const panelInvites = document.getElementById('panel-invitations');
    const summaryText = document.getElementById('table-summary-text');

    if (!tabTeam || !tabInvites) return;

    tabTeam.addEventListener('click', () => {
        activeTab = 'team';
        tabTeam.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white text-brand-600 shadow-sm border border-slate-200/80 flex items-center gap-2';
        tabInvites.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-600 hover:text-slate-900 border border-transparent flex items-center gap-2';
        panelTeam.classList.remove('hidden');
        panelInvites.classList.add('hidden');
        if (summaryText) summaryText.textContent = `Showing ${staffMembers.length} staff members`;
        renderTeamTable();
    });

    tabInvites.addEventListener('click', () => {
        activeTab = 'invitations';
        tabInvites.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white text-brand-600 shadow-sm border border-slate-200/80 flex items-center gap-2';
        tabTeam.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-600 hover:text-slate-900 border border-transparent flex items-center gap-2';
        panelInvites.classList.remove('hidden');
        panelTeam.classList.add('hidden');
        if (summaryText) summaryText.textContent = `Showing ${pendingInvitations.length} pending invitations`;
        loadInvitations();
    });
}

function setupSearchAndFilters() {
    const searchInput = document.getElementById('staff-search-input');
    const roleFilter = document.getElementById('staff-role-filter');
    const statusFilter = document.getElementById('staff-status-filter');
    const resetBtn = document.getElementById('btn-reset-filters');

    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            currentSearch = e.target.value.trim();
            debounceTimer = setTimeout(() => {
                renderTeamTable();
            }, 180);
        });
    }

    if (roleFilter) {
        roleFilter.addEventListener('change', (e) => {
            selectedRole = e.target.value;
            renderTeamTable();
        });
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            selectedStatus = e.target.value;
            renderTeamTable();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            syncSelectValue('staff-role-filter', '');
            syncSelectValue('staff-status-filter', '');
            currentSearch = '';
            selectedRole = '';
            selectedStatus = '';
            renderTeamTable();
        });
    }
}

// ---------------- Modals Management ---------------- //

function setupModals() {
    const btnOpenInvite = document.getElementById('btn-open-invite');
    const btnMobileInvite = document.getElementById('btn-mobile-invite');
    if (btnOpenInvite) btnOpenInvite.addEventListener('click', openInviteModal);
    if (btnMobileInvite) btnMobileInvite.addEventListener('click', openInviteModal);

    const btnCloseInvite = document.getElementById('btn-close-invite');
    const btnCancelInvite = document.getElementById('btn-cancel-invite');
    if (btnCloseInvite) btnCloseInvite.addEventListener('click', closeInviteModal);
    if (btnCancelInvite) btnCancelInvite.addEventListener('click', closeInviteModal);

    const btnCloseEdit = document.getElementById('btn-close-edit-modal');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    if (btnCloseEdit) btnCloseEdit.addEventListener('click', closeEditModal);
    if (btnCancelEdit) btnCancelEdit.addEventListener('click', closeEditModal);

    const inviteForm = document.getElementById('invite-form');
    if (inviteForm) inviteForm.addEventListener('submit', handleInviteSubmit);

    const editForm = document.getElementById('edit-staff-form');
    if (editForm) editForm.addEventListener('submit', handleEditSubmit);

    const copyBtn = document.getElementById('btn-copy-invite-link');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const input = document.getElementById('invite-link-input');
            if (input && input.value) {
                navigator.clipboard.writeText(input.value).then(() => {
                    UI.showToast('Invitation link copied to clipboard!');
                }).catch(() => {
                    input.select();
                    document.execCommand('copy');
                    UI.showToast('Link copied!');
                });
            }
        });
    }
}

function syncSelectValue(selectId, value) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.value = value;
    for (let i = 0; i < select.options.length; i++) {
        select.options[i].selected = (select.options[i].value === value);
    }
    select.dispatchEvent(new Event('change', { bubbles: true }));

    // Seamless sync with app.js custom-select UI wrapper if present
    const wrapper = select.closest('.custom-select-wrapper');
    if (wrapper) {
        const triggerSpan = wrapper.querySelector('.custom-select-trigger span');
        const selectedOpt = select.options[select.selectedIndex];
        if (triggerSpan && selectedOpt) {
            triggerSpan.textContent = selectedOpt.text;
        }
        const optionsContainer = wrapper.querySelector('.custom-select-options');
        if (optionsContainer && optionsContainer.children.length) {
            Array.from(optionsContainer.children).forEach((child, idx) => {
                child.className = idx === select.selectedIndex
                    ? 'px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors bg-brand-50 text-brand-600'
                    : 'px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors text-slate-600 hover:bg-slate-50 hover:text-brand-500';
            });
        }
    }
}

function openInviteModal() {
    const modal = document.getElementById('invite-modal');
    const content = document.getElementById('invite-modal-content');
    const linkCard = document.getElementById('invite-link-card');
    if (linkCard) linkCard.classList.add('hidden');
    document.getElementById('invite-form').reset();
    syncSelectValue('invite-role', 'Doctor');

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    });
}

function closeInviteModal() {
    const modal = document.getElementById('invite-modal');
    const content = document.getElementById('invite-modal-content');
    if (!modal || !content) return;

    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('invite-form').reset();
        syncSelectValue('invite-role', 'Doctor');
    }, 200);
}

async function handleInviteSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('invite-email').value.trim();
    const role = document.getElementById('invite-role').value;

    UI.toggleLoader('btn-invite-submit', true, 'Send Invitation');

    try {
        const res = await api.request('/staff/invite', 'POST', { email, role });
        if (res && res.success) {
            UI.showToast('Invitation sent successfully!');
            loadInvitations();

            if (res.inviteLink) {
                const linkCard = document.getElementById('invite-link-card');
                const linkInput = document.getElementById('invite-link-input');
                if (linkCard && linkInput) {
                    linkInput.value = res.inviteLink;
                    linkCard.classList.remove('hidden');
                }
            } else {
                closeInviteModal();
            }
        } else {
            UI.showToast((res && res.error) || 'Failed to send invitation', 'error');
        }
    } catch (err) {
        UI.showToast(err.message || 'Error sending invitation', 'error');
    } finally {
        UI.toggleLoader('btn-invite-submit', false, 'Send Invitation');
    }
}

function openEditModal(id, name, role, status) {
    const modal = document.getElementById('edit-staff-modal');
    const content = document.getElementById('edit-staff-modal-content');
    modal.classList.remove('hidden');

    document.getElementById('edit-staff-id').value = id;
    document.getElementById('edit-staff-name').value = name || '';

    const targetRole = (role === 'LabTech' || String(role).toLowerCase().includes('tech')) ? 'LabTech' : 'Doctor';
    syncSelectValue('edit-staff-role', targetRole);

    const targetStatus = status === 'Suspended' ? 'Suspended' : 'Active';
    syncSelectValue('edit-staff-status', targetStatus);

    requestAnimationFrame(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    });
}

function closeEditModal() {
    const modal = document.getElementById('edit-staff-modal');
    const content = document.getElementById('edit-staff-modal-content');
    if (!modal || !content) return;

    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-staff-id').value;
    const name = document.getElementById('edit-staff-name').value.trim();
    const role = document.getElementById('edit-staff-role').value;
    const accountStatus = document.getElementById('edit-staff-status').value;

    UI.toggleLoader('btn-save-staff', true, 'Save Changes');

    try {
        const res = await api.request(`/staff/${id}`, 'PUT', { name, role, accountStatus });
        if (res && res.success) {
            UI.showToast('Staff member updated successfully');
            closeEditModal();
            const idx = staffMembers.findIndex(m => String(m._id) === String(id));
            if (idx !== -1) {
                staffMembers[idx].name = name;
                staffMembers[idx].role = role;
                staffMembers[idx].accountStatus = accountStatus;
                staffMembers[idx].isSuspended = accountStatus === 'Suspended';
            }
            loadStaff();
        } else {
            UI.showToast((res && res.error) || 'Failed to update staff member', 'error');
        }
    } catch (err) {
        UI.showToast(err.message || 'Error updating staff', 'error');
    } finally {
        UI.toggleLoader('btn-save-staff', false, 'Save Changes');
    }
}
