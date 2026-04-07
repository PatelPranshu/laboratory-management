// Global App logic and UI helpers

/**
 * Escape HTML entities to prevent XSS when injecting user content into the DOM.
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

class UI {
  static showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message; // textContent is safe — no HTML injection

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  static toggleLoader(btnId, isLoading, originalText = 'Submit') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.textContent = 'Processing...';
    } else {
      btn.disabled = false;
      // Use innerHTML here since original button text may contain icons
      btn.innerHTML = originalText;
    }
  }
}

// Check Authentication logic (run on every protected page)
function checkAuth() {
  const token = localStorage.getItem('lis_token');
  const user = localStorage.getItem('lis_user');
  
  if (!token || !user) {
    window.location.href = 'index.html';
  } else {
    // Populate user info in nav — use textContent to prevent XSS
    const userNameEl = document.getElementById('nav-user-name');
    if (userNameEl) {
      try {
        const u = JSON.parse(user);
        const displayName = u.email ? u.email.split('@')[0] : 'User';
        userNameEl.textContent = `Dr. ${displayName}`;
      } catch(e) {
        userNameEl.textContent = 'User';
      }
    }
  }
}

function handleLogout() {
  localStorage.removeItem('lis_token');
  localStorage.removeItem('lis_user');
  window.location.href = 'index.html';
}

// Add logout listener if button exists
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});
