/**
 * ProfileController Module — Enterprise UI State Management
 */
const ProfileController = (() => {
    let currentUser = null;

    const getElements = () => ({
        forms: {
            profile: document.getElementById('profile-form'),
            password: document.getElementById('password-form')
        },
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
        currentPassword: document.getElementById('current-password'),
        mfaBadge: document.getElementById('mfa-status-badge'),
        mfaEnableBtn: document.getElementById('btn-mfa-enable'),
        mfaDisableBtn: document.getElementById('btn-mfa-disable')
    });

    function updateMfaUI(mfa) {
        const { mfaBadge, mfaEnableBtn, mfaDisableBtn } = getElements();
        if (mfa && mfa.enabled) {
            mfaBadge.textContent = 'Enabled';
            mfaBadge.className = 'px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase rounded-full';
            mfaEnableBtn.classList.add('hidden');
            mfaDisableBtn.classList.remove('hidden');
        } else {
            mfaBadge.textContent = 'Disabled';
            mfaBadge.className = 'px-2.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold uppercase rounded-full';
            mfaEnableBtn.classList.remove('hidden');
            mfaDisableBtn.classList.add('hidden');
        }
    }

    async function loadData() {
        try {
            const res = await api.getMe();
            currentUser = res.data;
            const els = getElements();

            const displayName = currentUser.name || currentUser.email.split('@')[0];
            els.name.textContent = currentUser.name || currentUser.email;
            els.role.textContent = currentUser.role === 'Admin' ? 'System Administrator' : (currentUser.role === 'Doctor' ? 'Medical Director / Lab Owner' : 'Laboratory Technician');
            els.initials.textContent = displayName.substring(0, 2).toUpperCase();

            els.labNameDisplay.textContent = currentUser.labName;
            els.idDisplay.textContent = `ID: ${currentUser._id}`;
            const joinedDate = new Date(currentUser.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            els.joinedDisplay.textContent = `Member since ${joinedDate}`;

            updateMfaUI(currentUser.mfa);

            els.editName.value = currentUser.name || '';
            els.editEmail.value = currentUser.email;
            els.editLabName.value = currentUser.labName;

            if (currentUser.role !== 'Admin') {
                els.editLabName.readOnly = true;
                els.editLabName.classList.add('bg-slate-100', 'cursor-not-allowed', 'opacity-70');
                els.editLabName.title = "Only Administrators can change the Laboratory Name";
            }

            localStorage.setItem('lis_user', JSON.stringify({
                id: currentUser._id,
                email: currentUser.email,
                name: currentUser.name,
                role: currentUser.role,
                labName: currentUser.labName,
                parentAdminId: currentUser.parentAdminId
            }));

            if (currentUser.role === 'Admin') {
                document.getElementById('danger-zone')?.classList.remove('hidden');
                document.getElementById('data-portability-zone')?.classList.remove('hidden');
                if (typeof loadExports === 'function') loadExports();
            }
        } catch (err) {
            UI.showToast('Failed to load profile data', 'error');
        }
    }

    return {
        loadData,
        openMfaSetup: async () => {
            try {
                UI.showToast('Generating 2FA Setup Key...', 'info');
                const res = await api.mfaSetup();
                const { qrCode, secret, backupCodes } = res.data;

                document.getElementById('mfa-qr-container').innerHTML = `<img src="${qrCode}" alt="2FA QR Code" class="w-40 h-40 rounded-xl shadow-inner border border-slate-100">`;
                document.getElementById('mfa-secret-key').textContent = secret.match(/.{1,4}/g).join(' ');

                const grid = document.getElementById('mfa-backup-codes-grid');
                grid.innerHTML = backupCodes.map(c => `<span class="bg-slate-50 p-1.5 rounded border border-slate-200 select-all">${c}</span>`).join('');

                document.getElementById('mfa-setup-code-input').value = '';
                document.getElementById('mfa-setup-modal').classList.remove('hidden');
                setTimeout(() => document.getElementById('mfa-setup-code-input').focus(), 100);
            } catch (err) {
                UI.showToast(err.message || 'Failed to initiate 2FA setup', 'error');
            }
        },
        closeMfaSetup: () => {
            document.getElementById('mfa-setup-modal').classList.add('hidden');
        },
        verifyMfaSetup: async (e) => {
            e.preventDefault();
            const code = document.getElementById('mfa-setup-code-input').value.trim();
            if (!code) return;

            try {
                UI.toggleLoader('btn-mfa-setup-submit', true, 'Verifying...');
                await api.mfaVerifySetup(code);
                UI.showToast('Two-Factor Authentication enabled successfully!', 'success');
                ProfileController.closeMfaSetup();
                await ProfileController.loadData();
            } catch (err) {
                UI.showToast(err.message || 'Failed to enable 2FA', 'error');
            } finally {
                UI.toggleLoader('btn-mfa-setup-submit', false, 'Verify & Enable 2FA');
            }
        },
        openMfaDisable: () => {
            document.getElementById('mfa-disable-password').value = '';
            document.getElementById('mfa-disable-code').value = '';
            document.getElementById('mfa-disable-modal').classList.remove('hidden');
            setTimeout(() => document.getElementById('mfa-disable-password').focus(), 100);
        },
        closeMfaDisable: () => {
            document.getElementById('mfa-disable-modal').classList.add('hidden');
        },
        disableMfa: async (e) => {
            e.preventDefault();
            const password = document.getElementById('mfa-disable-password').value;
            const code = document.getElementById('mfa-disable-code').value.trim();
            if (!password || !code) return;

            try {
                UI.toggleLoader('btn-mfa-disable-submit', true, 'Disabling...');
                await api.mfaDisable(password, code);
                UI.showToast('Two-Factor Authentication has been disabled', 'success');
                ProfileController.closeMfaDisable();
                await ProfileController.loadData();
            } catch (err) {
                UI.showToast(err.message || 'Failed to disable 2FA', 'error');
            } finally {
                UI.toggleLoader('btn-mfa-disable-submit', false, 'Disable Two-Factor Authentication');
            }
        }
    };
})();

// Legacy global aliases for backward compatibility with inline HTML event triggers
window.openMfaSetupModal = () => ProfileController.openMfaSetup();
window.closeMfaSetupModal = () => ProfileController.closeMfaSetup();
window.handleMfaSetupVerify = (e) => ProfileController.verifyMfaSetup(e);
window.openMfaDisableModal = () => ProfileController.openMfaDisable();
window.closeMfaDisableModal = () => ProfileController.closeMfaDisable();
window.handleMfaDisableSubmit = (e) => ProfileController.disableMfa(e);
window.refreshProfilePage = () => ProfileController.loadData();

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkAuth === 'function') checkAuth();
    if (typeof loadCommonLayout === 'function') loadCommonLayout();

    const profileForm = document.getElementById('profile-form');
    const passwordForm = document.getElementById('password-form');

    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-profile');
            const originalHtml = btn.innerHTML;
            try {
                UI.toggleLoader('btn-save-profile', true, '<i class="fas fa-circle-notch fa-spin mr-2"></i> Saving...');
                const data = {
                    name: document.getElementById('edit-name').value.trim(),
                    email: document.getElementById('edit-email').value.trim(),
                    labName: document.getElementById('edit-labName').value.trim()
                };
                const res = await api.updateProfile(data);
                UI.showToast('Profile updated successfully', 'success');
                if (res.user) {
                    document.getElementById('profile-name').textContent = res.user.name;
                    document.getElementById('display-labName').textContent = res.user.labName;
                }
            } catch (err) {
                UI.showToast(err.message || 'Failed to update profile', 'error');
            } finally {
                UI.toggleLoader('btn-save-profile', false, originalHtml);
            }
        });
    }

    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pwd = document.getElementById('new-password').value;
            const confirmPwd = document.getElementById('confirm-password').value;
            const currentPwd = document.getElementById('current-password').value;

            if (pwd !== confirmPwd) {
                UI.showToast('New passwords do not match', 'error');
                return;
            }
            const btn = document.getElementById('btn-save-password');
            const originalHtml = btn.innerHTML;
            try {
                UI.toggleLoader('btn-save-password', true, '<i class="fas fa-circle-notch fa-spin mr-2"></i> Updating...');
                await api.updateProfile({ password: pwd, currentPassword: currentPwd });
                UI.showToast('Password updated successfully', 'success');
                passwordForm.reset();
            } catch (err) {
                UI.showToast(err.message || 'Failed to update password', 'error');
            } finally {
                UI.toggleLoader('btn-save-password', false, originalHtml);
            }
        });
    }

    ProfileController.loadData();
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
