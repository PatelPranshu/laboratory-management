document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        showError('No invitation token provided in URL.');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/staff/verify-invite/${token}`);
        const data = await res.json();

        if (data.success) {
            document.getElementById('loader').classList.add('hidden');
            document.getElementById('register-form').classList.remove('hidden');
            
            document.getElementById('title-text').textContent = 'Welcome Aboard!';
            document.getElementById('subtitle-text').textContent = 'Please complete your staff profile to continue.';
            
            document.getElementById('invite-email-display').textContent = data.data.email;
            document.getElementById('invite-role-display').textContent = data.data.role;
            document.getElementById('invite-token').value = token;

            if (data.data.role === 'Doctor') {
                document.getElementById('signature-container').classList.remove('hidden');
            }
        } else {
            showError(data.error || 'Invalid or expired invitation token.');
        }
    } catch (err) {
        showError('A network error occurred while verifying the invitation.');
    }
});

function showError(msg) {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('error-container').classList.remove('hidden');
    document.getElementById('error-msg').textContent = msg;
    document.getElementById('title-text').textContent = 'Link Expired';
    document.getElementById('subtitle-text').textContent = 'Please ask your Lab Administrator for a new invite.';
}

async function handleRegistration(e) {
    e.preventDefault();
    const token = document.getElementById('invite-token').value;
    const name = document.getElementById('name').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const signatureUrl = document.getElementById('signature-url') ? document.getElementById('signature-url').value : null;

    if (password !== confirmPassword) {
        UI.showToast('Passwords do not match.', 'error');
        return;
    }

    UI.toggleLoader('btn-submit', true);

    try {
        const payload = { token, name, password };
        if (signatureUrl) payload.signatureUrl = signatureUrl;

        const res = await fetch(`${API_URL}/staff/complete-registration`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            // Save to localStorage
            localStorage.setItem('lis_token', data.token);
            localStorage.setItem('lis_user', JSON.stringify(data.user));
            
            UI.showToast('Account created successfully! Redirecting...');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            UI.showToast(data.error || 'Failed to complete registration', 'error');
        }
    } catch (err) {
        UI.showToast('Network error', 'error');
    } finally {
        UI.toggleLoader('btn-submit', false, 'Create Account <i class="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform"></i>');
    }
}
