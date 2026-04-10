// Global App logic and UI helpers

class DraftManager {
    static save(key, data) {
        localStorage.setItem(`lis_draft_${key}`, JSON.stringify(data));
    }
    static load(key) {
        const data = localStorage.getItem(`lis_draft_${key}`);
        return data ? JSON.parse(data) : null;
    }
    static clear(key) {
        localStorage.removeItem(`lis_draft_${key}`);
    }
    static debounce(func, wait = 300) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
}

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

  static async showConfirm(title, message, confirmText = 'Confirm', type = 'danger') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-slate-900/40 z-[100] flex items-center justify-center opacity-0 transition-opacity duration-300';
      overlay.id = 'ui-confirm-modal';
      
      const modal = document.createElement('div');
      modal.className = 'bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden transform scale-95 transition-transform duration-300 border border-slate-100';
      
      const iconClass = type === 'danger' ? 'text-red-500 bg-red-50' : 'text-brand-500 bg-brand-50';
      const icon = type === 'danger' ? 'fa-exclamation-triangle' : 'fa-info-circle';
      const btnClass = type === 'danger' ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500 shadow-red-500/30' : 'bg-brand-500 hover:bg-brand-600 focus:ring-brand-500 shadow-brand-500/30';
      
      modal.innerHTML = `
        <div class="p-6">
            <div class="flex items-center justify-center w-14 h-14 rounded-full ${iconClass} mb-5 mx-auto ring-4 ring-white shadow-sm">
                <i class="fas ${icon} text-2xl"></i>
            </div>
            <h3 class="text-xl font-bold text-center text-slate-800 mb-2">${escapeHtml(title)}</h3>
            <p class="text-center text-slate-500 mb-6 text-sm">${escapeHtml(message)}</p>
            <div class="flex space-x-3">
                <button id="ui-btn-cancel" class="flex-1 py-2.5 px-4 rounded-xl text-sm text-slate-700 font-bold bg-slate-100 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 transition-all duration-200">Cancel</button>
                <button id="ui-btn-confirm" class="flex-1 py-2.5 px-4 rounded-xl text-sm text-white font-bold ${btnClass} focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg transform hover:-translate-y-0.5 transition-all duration-200">${escapeHtml(confirmText)}</button>
            </div>
        </div>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Trigger animation
      requestAnimationFrame(() => {
          overlay.classList.remove('opacity-0');
          modal.classList.remove('scale-95');
      });

      const close = (result) => {
          overlay.classList.add('opacity-0');
          modal.classList.add('scale-95');
          setTimeout(() => {
              overlay.remove();
              resolve(result);
          }, 300);
      };

      modal.querySelector('#ui-btn-cancel').addEventListener('click', () => close(false));
      modal.querySelector('#ui-btn-confirm').addEventListener('click', () => close(true));
    });
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
    let u;
    if (user) {
      try {
        u = JSON.parse(user);
        
        // Security check for password reset enforcement
        if (u.mustChangePassword && !window.location.pathname.endsWith('reset-password.html')) {
          window.location.href = 'reset-password.html';
          return;
        }

        if (userNameEl) {
          const displayName = u.email ? u.email.split('@')[0] : 'User';
          userNameEl.textContent = `Dr. ${displayName}`;
        }
      } catch(e) {
        if (userNameEl) userNameEl.textContent = 'User';
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
