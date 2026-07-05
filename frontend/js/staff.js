document.addEventListener('DOMContentLoaded', () => {
    loadCommonLayout();
    fetchStaff();
});

const headers = {
    'Content-Type': 'application/json'
};

const fetchConfig = {
    headers,
    credentials: 'include'
};

async function fetchStaff() {
    try {
        const res = await fetch(`${API_URL}/staff`, fetchConfig);
        const data = await res.json();
        
        const tbody = document.getElementById('staff-table-body');
        if (!data.success) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-500">Failed to load staff</td></tr>`;
            return;
        }

        if (data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500 border border-dashed border-slate-300 bg-slate-50/50 rounded-xl m-4 block">No team members found.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.data.map(user => `
            <tr class="hover:bg-slate-50/80 transition-colors group block sm:table-row p-4 sm:p-0 border-b border-slate-100 sm:border-0 last:border-0">
                <td class="px-0 sm:px-6 py-2 sm:py-4 whitespace-nowrap flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase">Staff Member</span>
                    <div class="flex items-center">
                        <div class="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center text-indigo-500 font-bold shadow-inner uppercase shrink-0">
                            ${sanitizeHTML(user.name.substring(0, 2))}
                        </div>
                        <div class="ml-4">
                            <div class="text-sm font-bold text-slate-800 text-right sm:text-left">${sanitizeHTML(user.name)}</div>
                        </div>
                    </div>
                </td>
                <td class="px-0 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-sm text-slate-500 flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase">Email</span>
                    <span>${sanitizeHTML(user.email)}</span>
                </td>
                <td class="px-0 sm:px-6 py-2 sm:py-4 whitespace-nowrap flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase">Role</span>
                    <span class="px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-md bg-slate-100 text-slate-700">
                        ${sanitizeHTML(user.role)}
                    </span>
                </td>
                <td class="px-0 sm:px-6 py-2 sm:py-4 whitespace-nowrap flex sm:table-cell justify-between items-center">
                    <span class="sm:hidden text-[10px] font-bold text-slate-400 uppercase">Status</span>
                    <span class="px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-md ${user.accountStatus === 'Active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                        ${sanitizeHTML(user.accountStatus || 'Unknown')}
                    </span>
                </td>
                <td class="px-0 sm:px-6 pt-3 sm:pt-4 pb-2 sm:pb-4 whitespace-nowrap text-right text-sm font-medium block sm:table-cell border-t border-slate-100 sm:border-0 mt-2 sm:mt-0">
                    <div class="flex items-center justify-end gap-2 w-full sm:w-auto">
                        <button onclick="resetStaffPassword('${user._id}', '${sanitizeHTML(user.name)}')" class="flex-1 sm:flex-none px-3 py-2 sm:p-0 bg-slate-100 hover:bg-slate-200 sm:bg-transparent text-indigo-600 sm:hover:text-indigo-900 rounded-lg sm:rounded-none transition-colors sm:mr-3 flex items-center justify-center" title="Reset Password"><i class="fas fa-key sm:mr-0 mr-2"></i><span class="sm:hidden">Reset Pass</span></button>
                        ${user.role !== 'Admin' ? `<button onclick="deleteStaff('${user._id}', '${sanitizeHTML(user.name)}')" class="flex-1 sm:flex-none px-3 py-2 sm:p-0 bg-red-50 hover:bg-red-100 sm:bg-transparent text-red-500 sm:hover:text-red-700 rounded-lg sm:rounded-none transition-colors flex items-center justify-center" title="Remove User"><i class="fas fa-trash sm:mr-0 mr-2"></i><span class="sm:hidden">Remove</span></button>` : `<span class="flex-1 sm:flex-none px-3 py-2 sm:p-0 bg-slate-50 sm:bg-transparent text-slate-300 pointer-events-none rounded-lg sm:rounded-none text-center flex items-center justify-center" title="Cannot delete root admin"><i class="fas fa-trash sm:mr-0 mr-2"></i><span class="sm:hidden">Admin</span></span>`}
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        document.getElementById('staff-table-body').innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-500">Error loading staff</td></tr>`;
    }
}

// Actions
window.deleteStaff = async function(id, name) {
    const confirmed = await UI.showConfirm('Remove Team Member', `Are you extremely sure you want to delete ${name}? This action cannot be undone.`, 'Remove', 'danger');
    if(!confirmed) return;
    try {
        const res = await fetch(`${API_URL}/staff/${id}`, { method: 'DELETE', ...fetchConfig });
        const data = await res.json();
        if(data.success) {
            UI.showToast(`Removed ${name}`, 'success');
            fetchStaff();
        } else {
            UI.showToast(data.error || 'Failed to remove', 'error');
        }
    } catch(err) {
        UI.showToast('Network Error', 'error');
    }
};

window.resetStaffPassword = async function(id, name) {
    const newPass = await UI.showPrompt('Reset Password', `Enter a new temporary password for ${name}.\n(Requirement: 8+ chars, Uppercase, Number)`, 'Enter new password');
    if(!newPass) return;
    
    try {
        const res = await fetch(`${API_URL}/staff/${id}/reset-password`, { 
            method: 'PUT', 
            ...fetchConfig,
            body: JSON.stringify({ password: newPass })
        });
        const data = await res.json();
        if(data.success) {
            UI.showToast(`Password updated. The user must change it on their next login.`, 'success');
        } else {
            UI.showToast(data.error || 'Validation Failed', 'error');
        }
    } catch(err) {
        UI.showToast('Network Error', 'error');
    }
};

// Modals
function openInviteModal() {
    const modal = document.getElementById('invite-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild.classList.remove('scale-95');
    });
}

function closeInviteModal() {
    const modal = document.getElementById('invite-modal');
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.getElementById('invite-form').reset();
    }, 300);
}

function openTechModal() {
    const modal = document.getElementById('tech-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild.classList.remove('scale-95');
    });
    generateTempPassword();
}

function closeTechModal() {
    const modal = document.getElementById('tech-modal');
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.getElementById('tech-form').reset();
    }, 300);
}

function generateTempPassword() {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nums = "0123456789";
    const special = "!@#$%*";
    
    // Ensure at least 1 uppercase, 1 special, 2 numbers
    let pwd = upper[Math.floor(Math.random() * upper.length)] + 
              special[Math.floor(Math.random() * special.length)] + 
              nums[Math.floor(Math.random() * nums.length)] + 
              nums[Math.floor(Math.random() * nums.length)];
              
    // Fill the rest with random lowercase letters up to 10 chars total
    while (pwd.length < 10) {
        pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    
    document.getElementById('tech-password').value = pwd;
}

// Handlers
async function handleInvite(e) {
    e.preventDefault();
    const email = document.getElementById('invite-email').value;
    UI.toggleLoader('btn-invite', true);

    try {
        const res = await fetch(`${API_URL}/staff/invite`, {
            method: 'POST',
            ...fetchConfig,
            body: JSON.stringify({ email, role: 'Doctor' })
        });
        const data = await res.json();
        
        if (data.success) {
            UI.showToast('Invitation sent successfully! (Check server console)');
            closeInviteModal();
        } else {
            UI.showToast(data.error || 'Failed to invite', 'error');
        }
    } catch (err) {
        UI.showToast('Network error', 'error');
    } finally {
        UI.toggleLoader('btn-invite', false, 'Send Invitation');
    }
}

async function handleTechAdd(e) {
    e.preventDefault();
    const name = document.getElementById('tech-name').value;
    const email = document.getElementById('tech-email').value;
    const password = document.getElementById('tech-password').value;
    UI.toggleLoader('btn-tech', true);

    try {
        const res = await fetch(`${API_URL}/staff/create-tech`, {
            method: 'POST',
            ...fetchConfig,
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        
        if (data.success) {
            UI.showToast('Technician created! Tell them to login and reset their password.');
            closeTechModal();
            fetchStaff();
        } else {
            UI.showToast(data.error || 'Failed to create technician', 'error');
        }
    } catch (err) {
        UI.showToast('Network error', 'error');
    } finally {
        UI.toggleLoader('btn-tech', false, 'Create Technician');
    }
}
