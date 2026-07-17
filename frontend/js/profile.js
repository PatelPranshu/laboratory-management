document.addEventListener('DOMContentLoaded', async () => {
    // Enforce authentication
    if (typeof checkAuth === 'function') {
        checkAuth();
    }

    // Load common layout
    if (typeof loadCommonLayout === 'function') {
        loadCommonLayout();
    }

    const forms = {
        profile: document.getElementById('profile-form'),
        password: document.getElementById('password-form')
    };

    const elements = {
        name: document.getElementById('profile-name'),
        role: document.getElementById('profile-role'),
        initials: document.getElementById('profile-initials'),
        labNameDisplay: document.getElementById('display-labName'),
        idDisplay: document.getElementById('display-id'),
        joinedDisplay: document.getElementById('display-joined'),
        editName: document.getElementById('edit-name'),
        editEmail: document.getElementById('edit-email'),
        editLabName: document.getElementById('edit-labName'),
        newPassword: document.getElementById('new-password'),
        confirmPassword: document.getElementById('confirm-password'),
        currentPassword: document.getElementById('current-password')
    };

    // Initialize Page Data
    async function init() {
        try {
            const res = await api.getMe();
            const user = res.data;

            // Update Header & Sidebar display
            const displayName = user.name || user.email.split('@')[0];
            elements.name.textContent = user.name || user.email;
            elements.role.textContent = user.role === 'Admin' ? 'System Administrator' : (user.role === 'Doctor' ? 'Medical Director / Lab Owner' : 'Laboratory Technician');
            elements.initials.textContent = displayName.substring(0, 2).toUpperCase();
            
            // Side details
            elements.labNameDisplay.textContent = user.labName;
            elements.idDisplay.textContent = `ID: ${user._id}`;
            const joinedDate = new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            elements.joinedDisplay.textContent = `Member since ${joinedDate}`;

            // Form inputs
            elements.editName.value = user.name || '';
            elements.editEmail.value = user.email;
            elements.editLabName.value = user.labName;

            if (user.role !== 'Admin') {
                elements.editLabName.readOnly = true;
                elements.editLabName.classList.add('bg-slate-100', 'cursor-not-allowed', 'opacity-70');
                elements.editLabName.title = "Only Administrators can change the Laboratory Name";
            }

            // Sync with local storage user object
            localStorage.setItem('lis_user', JSON.stringify({
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                labName: user.labName,
                parentAdminId: user.parentAdminId
            }));

            // Show danger zone and data portability only for Admins
            if (user.role === 'Admin') {
                document.getElementById('danger-zone').classList.remove('hidden');
                document.getElementById('data-portability-zone').classList.remove('hidden');
                loadExports();
            }

        } catch (err) {
            UI.showToast('Failed to load profile data', 'error');
        }
    }

    // Profile Form Handler
    forms.profile.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-profile');
        const originalHtml = btn.innerHTML;

        try {
            UI.toggleLoader('btn-save-profile', true, '<i class="fas fa-circle-notch fa-spin mr-2"></i> Saving...');
            
            const data = {
                name: elements.editName.value.trim(),
                email: elements.editEmail.value.trim(),
                labName: elements.editLabName.value.trim()
            };

            const res = await api.updateProfile(data);
            
            UI.showToast('Profile updated successfully!', 'success');
            
            // Refresh UI data
            await init();

            // Specifically trigger sidebar refresh
            const navUserName = document.getElementById('nav-user-name');
            if (navUserName) {
                navUserName.textContent = `Dr. ${data.name || data.email.split('@')[0]}`;
            }

        } catch (err) {
            UI.showToast(err.message || 'Failed to update profile', 'error');
        } finally {
            UI.toggleLoader('btn-save-profile', false, originalHtml);
        }
    });

    // Password Form Handler
    forms.password.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPwd = elements.currentPassword.value;
        const pwd = elements.newPassword.value;
        const confirm = elements.confirmPassword.value;

        if (!currentPwd || currentPwd.trim() === '') {
            return UI.showToast('Please enter your current password', 'error');
        }

        if (!pwd || pwd.trim() === '') {
            return UI.showToast('Please enter a new password', 'error');
        }

        if (pwd !== confirm) {
            return UI.showToast('Passwords do not match', 'error');
        }

        const btn = document.getElementById('btn-save-password');
        const originalHtml = btn.innerHTML;

        try {
            UI.toggleLoader('btn-save-password', true, '<i class="fas fa-circle-notch fa-spin mr-2"></i> Updating...');
            
            await api.updateProfile({ password: pwd, currentPassword: currentPwd });
            
            UI.showToast('Password updated successfuly', 'success');
            forms.password.reset();

        } catch (err) {
            UI.showToast(err.message || 'Failed to update password', 'error');
        } finally {
            UI.toggleLoader('btn-save-password', false, originalHtml);
        }
    });

    init();
});

// Global deleteLab function for the danger zone button
window.deleteLab = async function() {
    let reasons = ['Other'];
    try {
        const res = await api.request('/auth/deletion-reasons');
        if (res.data && Array.isArray(res.data)) {
            reasons = res.data;
            if (!reasons.includes('Other')) {
                reasons.push('Other');
            }
        }
    } catch (err) {
        console.warn('Failed to load dynamic reasons, using fallback.');
    }

    // 2. Map to UI options
    const options = reasons.map(r => ({ value: r, label: r }));
    
    // 3. Prompt for Reason
    const selectedReason = await UI.showSelectPrompt(
        'Delete Laboratory', 
        'Why are you deleting your laboratory? This will suspend all staff accounts and permanently delete your lab after 30 days.', 
        options,
        reasons[0]
    );
    
    if (!selectedReason) return; // Cancelled

    let finalReason = selectedReason;

    // 4. If 'Other', prompt for custom reason
    if (selectedReason === 'Other') {
        const customReason = await UI.showPrompt(
            'Custom Reason',
            'Please briefly explain why you are leaving:',
            'Enter reason...'
        );
        if (!customReason) return; // Cancelled
        finalReason = customReason;
    }

    // 5. Final Confirmation
    const confirmed = await UI.showConfirm(
        'Final Warning', 
        'Are you ABSOLUTELY sure you want to delete your laboratory right now?', 
        'Yes, Delete Lab', 
        'danger'
    );
    
    if (confirmed) {
        try {
            await api.request('/auth/delete-lab', 'DELETE', { reason: finalReason });
            UI.showToast('Lab deleted. Logging out...', 'success');
            setTimeout(() => {
                api.clearLocalData();
                window.location.href = 'index.html';
            }, 2000);
        } catch (err) {
            UI.showToast(err.message || 'Failed to delete lab', 'error');
        }
    }
};

    // Load exports list
    async function loadExports() {
        const listDiv = document.getElementById('exports-list');
        try {
            const res = await api.request('/settings/exports', 'GET');
            const jobs = res.data;
            if (!jobs || jobs.length === 0) {
                listDiv.innerHTML = '<div class="text-xs text-slate-500 italic">No recent exports found.</div>';
                return;
            }

            let html = '';
            let isProcessing = false;

            jobs.forEach(job => {
                const date = new Date(job.createdAt).toLocaleString();
                let statusBadge = '';
                let downloadBtn = '';

                if (job.status === 'PENDING' || job.status === 'PROCESSING') {
                    isProcessing = true;
                    statusBadge = `<span class="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-[10px] font-bold uppercase tracking-wider"><i class="fas fa-spinner fa-spin mr-1"></i> ${job.status}</span>`;
                } else if (job.status === 'COMPLETED') {
                    statusBadge = `<span class="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-bold uppercase tracking-wider"><i class="fas fa-check mr-1"></i> COMPLETED</span>`;
                    downloadBtn = `
                        <div class="flex gap-2 mt-2">
                            <button onclick="downloadExport('${job._id}', 0)" class="text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded shadow-sm font-semibold transition-colors flex items-center">
                                <i class="fas fa-file-excel mr-1 text-green-600"></i> Patients
                            </button>
                            <button onclick="downloadExport('${job._id}', 1)" class="text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded shadow-sm font-semibold transition-colors flex items-center">
                                <i class="fas fa-file-excel mr-1 text-green-600"></i> Reports
                            </button>
                        </div>
                    `;
                } else {
                    statusBadge = `<span class="px-2 py-1 bg-red-100 text-red-700 rounded-md text-[10px] font-bold uppercase tracking-wider"><i class="fas fa-times mr-1"></i> FAILED</span>`;
                }

                html += `
                    <div class="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex flex-col items-start justify-between">
                        <div class="flex items-center justify-between w-full mb-1">
                            <span class="text-xs font-bold text-slate-700">Export Requested</span>
                            ${statusBadge}
                        </div>
                        <div class="text-[10px] text-slate-400 mb-1">${date}</div>
                        ${downloadBtn}
                    </div>
                `;
            });

            listDiv.innerHTML = html;

            // Auto refresh if processing
            if (isProcessing) {
                setTimeout(loadExports, 10000);
            }
        } catch (err) {
            console.error('Error loading exports', err);
            listDiv.innerHTML = '<div class="text-xs text-red-500 italic">Failed to load exports.</div>';
        }
    }

    // Request data export
    window.requestDataExport = async function() {
        const btn = document.getElementById('request-export-btn');
        const originalHtml = btn.innerHTML;
        try {
            UI.toggleLoader('request-export-btn', true, 'Requesting...');
            await api.request('/settings/request-export', 'POST');
            UI.showToast('Data export requested. You will receive an email when it is ready.', 'success');
            loadExports();
        } catch (err) {
            UI.showToast(err.message || 'Failed to request export', 'error');
        } finally {
            UI.toggleLoader('request-export-btn', false, originalHtml);
        }
    };

    // Download export via AJAX blob
    window.downloadExport = async function(jobId, index) {
        try {
            UI.showToast('Starting download...', 'info');
            const res = await api.request(`/settings/exports/download/${jobId}/${index}`, 'GET');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = index === 0 ? 'Patients_Export.xlsx' : 'Reports_Export.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            UI.showToast('Download complete', 'success');
        } catch (err) {
            UI.showToast(err.message || 'Failed to download file', 'error');
        }
    };


