document.addEventListener('DOMContentLoaded', async () => {
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
        confirmPassword: document.getElementById('confirm-password')
    };

    // Initialize Page Data
    async function init() {
        try {
            const res = await api.getMe();
            const user = res.data;

            // Update Header & Sidebar display
            const displayName = user.name || user.email.split('@')[0];
            elements.name.textContent = user.name || user.email;
            elements.role.textContent = user.role === 'Doctor' ? 'Medical Director / Lab Owner' : 'Laboratory Technician';
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

            // Sync with local storage user object
            localStorage.setItem('lis_user', JSON.stringify({
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                labName: user.labName,
                parentAdminId: user.parentAdminId
            }));

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
        
        const pwd = elements.newPassword.value;
        const confirm = elements.confirmPassword.value;

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
            
            await api.updateProfile({ password: pwd });
            
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
