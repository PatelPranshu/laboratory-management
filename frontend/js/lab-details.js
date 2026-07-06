document.addEventListener('DOMContentLoaded', () => {
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

    const urlParams = new URLSearchParams(window.location.search);
    const labId = urlParams.get('id');

    if (!labId) {
        UI.showToast('No lab ID provided', 'error');
        setTimeout(() => window.location.href = 'super-admin.html', 1500);
        return;
    }

    window.loadLabDetails = async () => {
        try {
            const res = await api.request(`/superadmin/labs/${labId}/details`);
            const { labName, status, isDeleted, stats, staff } = res.data;

            // Render Header
            document.getElementById('lab-name-header').textContent = labName || 'Unnamed Lab';
            
            let statusBadge = '';
            if (isDeleted) {
                statusBadge = `<span class="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg uppercase tracking-wide">Soft Deleted</span>`;
            } else if (status === 'Suspended') {
                statusBadge = `<span class="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg uppercase tracking-wide">Suspended</span>`;
            } else {
                statusBadge = `<span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg uppercase tracking-wide">Active</span>`;
            }
            document.getElementById('lab-status-badge').innerHTML = statusBadge;

            // Render Stats
            document.getElementById('stat-total-reports').textContent = stats.totalReports;
            document.getElementById('stat-pending-reports').textContent = stats.pendingReports;
            document.getElementById('stat-patients').textContent = stats.totalPatients;

            // Render Staff
            renderStaffTable(staff);

        } catch (err) {
            UI.showToast(err.message || 'Failed to load lab details', 'error');
        }
    };

    function renderStaffTable(staff) {
        const tbody = document.getElementById('staff-tbody');
        if (staff.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500 font-medium">No staff found.</td></tr>';
            return;
        }

        tbody.innerHTML = staff.map(member => {
            const isOwner = member.role === 'Admin';
            let roleBadge = '';
            switch(member.role) {
                case 'Admin': roleBadge = `<span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold uppercase tracking-wider border border-indigo-100">Lab Admin</span>`; break;
                case 'Doctor': roleBadge = `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100">Doctor</span>`; break;
                case 'LabTech': roleBadge = `<span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-100">Lab Tech</span>`; break;
            }

            const isDeleted = member.isDeleted;
            const statusBadge = isDeleted
                ? `<span class="text-xs font-bold text-red-500"><i class="fas fa-trash-alt mr-1"></i> Deleted</span>`
                : `<span class="text-xs font-bold text-emerald-500"><i class="fas fa-check-circle mr-1"></i> Active</span>`;

            let actionButtons = '';
            if (!isOwner) {
                actionButtons = `
                    <button onclick="editRole('${member._id}', '${member.role}')" class="px-3 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-brand-600 rounded-lg text-xs font-bold transition-colors mr-2 border border-slate-200">
                        <i class="fas fa-edit mr-1"></i> Edit Role
                    </button>
                    <div class="inline-flex rounded-lg border border-red-200 divide-x divide-red-200 overflow-hidden">
                        <button onclick="removeStaff('${member._id}', false)" class="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-colors" title="Soft Delete">
                            Remove
                        </button>
                        <button onclick="removeStaff('${member._id}', true)" class="px-2 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white text-xs font-bold transition-colors" title="Hard Delete Permanently">
                            <i class="fas fa-ban"></i>
                        </button>
                    </div>
                `;
            } else {
                actionButtons = `<span class="text-xs font-medium text-slate-400">Lab Owner (Immutable)</span>`;
            }

            return `
                <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="p-4 pl-6">
                        <div class="font-bold text-slate-700">${member.name}</div>
                    </td>
                    <td class="p-4">
                        <div class="text-sm text-slate-600">${member.email}</div>
                    </td>
                    <td class="p-4">
                        ${roleBadge}
                    </td>
                    <td class="p-4">
                        ${statusBadge}
                    </td>
                    <td class="p-4 text-right pr-6">
                        ${actionButtons}
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.editRole = async (staffId, currentRole) => {
        const newRole = await UI.showSelectPrompt(
            'Change Staff Role', 
            'Select new role for staff member:', 
            [
                { value: 'Doctor', label: 'Doctor' },
                { value: 'LabTech', label: 'Lab Tech' }
            ],
            currentRole
        );
        if (!newRole || newRole === currentRole) return;

        if (!['Doctor', 'LabTech'].includes(newRole)) {
            UI.showToast('Invalid role. Must be Doctor or LabTech', 'error');
            return;
        }

        try {
            await api.request(`/superadmin/labs/${labId}/staff/${staffId}`, 'PUT', { role: newRole });
            UI.showToast('Staff role updated', 'success');
            loadLabDetails();
        } catch (err) {
            UI.showToast(err.message, 'error');
        }
    };

    window.removeStaff = async (staffId, hardDelete) => {
        const msg = hardDelete 
            ? 'WARNING: This will permanently delete this user from the database instantly! Are you sure?'
            : 'Are you sure you want to remove (soft delete) this staff member?';

        const confirmed = await UI.showConfirm(
            hardDelete ? 'Permanent Deletion' : 'Soft Delete Staff', 
            msg, 
            'Yes, Remove', 
            'danger'
        );
        if (!confirmed) return;

        try {
            await api.request(`/superadmin/labs/${labId}/staff/${staffId}?hard=${hardDelete}`, 'DELETE');
            UI.showToast(hardDelete ? 'Staff permanently deleted' : 'Staff removed (soft deleted)', 'success');
            loadLabDetails();
        } catch (err) {
            UI.showToast(err.message, 'error');
        }
    };

    loadLabDetails();
});
