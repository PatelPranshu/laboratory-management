// Global App logic and UI helpers

// Automatically inject microscope favicon to all pages
(function injectUniversalFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/svg+xml';
    // Clean microscope SVG data URI
    favicon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath fill='%230284c7' d='M416 0C398.3 0 384 14.3 384 32v83.6l-50.5 60.6c-17.7 21.2-17.7 51.6 0 72.8l50.5 60.6V448c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32zM192 128V32c0-17.7-14.3-32-32-32s-32 14.3-32 32v96H96c-17.7 0-32 14.3-32 32v64c0 17.7 14.3 32 32 32h32v48c0 17.7 14.3 32 32 32h64c17.7 0 32-14.3 32-32V256h32c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32H192zM64 480c0 17.7 14.3 32 32 32h320c17.7 0 32-14.3 32-32s-14.3-32-32-32H96c-17.7 0-32 14.3-32 32z'/%3E%3C/svg%3E";
    document.head.appendChild(favicon);
})();

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
    /**
     * Returns the context-aware draft key for report-create.
     * Uses the patient ID if available, otherwise 'new'.
     */
    static getReportKey(patientId) {
        return patientId ? `report_draft_${patientId}` : 'report_draft_new';
    }
    static debounce(func, wait = 300) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
}

// ---------- Cross-Tab Authentication Sync ----------
// If another tab logs out (removes lis_token/lis_user), this tab
// immediately redirects to the login page to prevent stale sessions.
window.addEventListener('storage', (e) => {
    if ((e.key === 'lis_token' || e.key === 'lis_user') && e.newValue === null) {
        // Token/user was removed in another tab — force logout here
        window.location.href = 'index.html';
    }
});

// ---------- Tab Focus Refresh Utility ----------
// Throttled data reload when the user switches back to a stale tab.
// Pages register their reload function via TabFocusRefresh.register().
class TabFocusRefresh {
    static _handlers = [];
    static _lastRefresh = 0;
    static _cooldownMs = 10000; // 10-second throttle
    static _initialized = false;

    /**
     * Register a callback to be called when the tab regains focus.
     * Typically called once per page during DOMContentLoaded.
     * @param {Function} fn - The data-fetching function to re-run.
     */
    static register(fn) {
        if (typeof fn !== 'function') return;
        TabFocusRefresh._handlers.push(fn);

        if (!TabFocusRefresh._initialized) {
            TabFocusRefresh._initialized = true;
            window.addEventListener('focus', () => {
                const now = Date.now();
                if (now - TabFocusRefresh._lastRefresh < TabFocusRefresh._cooldownMs) return;
                TabFocusRefresh._lastRefresh = now;
                TabFocusRefresh._handlers.forEach(handler => {
                    try { handler(); } catch (err) { console.warn('[TabFocusRefresh]', err); }
                });
            });
        }
    }
}

/**
 * Escape HTML entities to prevent XSS when injecting user content into the DOM.
 * Standardized to use sanitizeHTML from api.js.
 */
function escapeHtml(str) {
  return typeof sanitizeHTML === 'function' ? sanitizeHTML(str) : str;
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
    toast.className = `toast ${type} shadow-lg !font-bold py-3.5 px-6 rounded-2xl flex items-center gap-3 animate-slide-in`;
    
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon} text-lg opacity-80"></i><span>${sanitizeHTML(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3500);
  }

  static toggleLoader(btnId, isLoading, originalText = 'Submit') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.classList.add('opacity-70', 'cursor-not-allowed');
      btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> Processing...`;
    } else {
      btn.disabled = false;
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
      btn.innerHTML = originalText;
    }
  }

  static async showAlert(title, message, type = 'success') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center opacity-0 transition-opacity duration-200 backdrop-blur-sm';
        
        const modal = document.createElement('div');
        modal.className = 'bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4 overflow-hidden transform scale-95 transition-transform duration-200 border border-slate-200/60';
        
        const iconColor = type === 'error' ? 'text-red-500 bg-red-50' : 'text-brand-500 bg-brand-50';
        const icon = type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle';
        
        modal.innerHTML = `
            <div class="p-8">
                <div class="w-16 h-16 rounded-2xl ${iconColor} flex items-center justify-center mx-auto mb-6">
                    <i class="fas ${icon} text-3xl"></i>
                </div>
                <h3 class="text-xl font-bold text-center text-slate-900 mb-2 tracking-tight">${sanitizeHTML(title)}</h3>
                <p class="text-center text-slate-500 mb-8 text-sm font-medium leading-relaxed">${sanitizeHTML(message)}</p>
                <button id="ui-alert-ok" class="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-black transition-all shadow-sm">Got it</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.classList.remove('opacity-0');
            modal.classList.remove('scale-95');
        });

        modal.querySelector('#ui-alert-ok').onclick = () => {
            overlay.classList.add('opacity-0');
            modal.classList.add('scale-95');
            setTimeout(() => { overlay.remove(); resolve(); }, 200);
        };
    });
  }

  static async showConfirm(title, message, confirmText = 'Confirm', type = 'danger') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center opacity-0 transition-opacity duration-200 backdrop-blur-sm';
      
      const modal = document.createElement('div');
      modal.className = 'bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4 overflow-hidden transform scale-95 transition-transform duration-200 border border-slate-200/60';
      
      const iconStyles = type === 'danger' ? 'text-red-500 bg-red-50' : 'text-brand-500 bg-brand-50';
      const icon = type === 'danger' ? 'fa-exclamation-triangle' : 'fa-question-circle';
      const confirmBtnClass = type === 'danger' ? 'bg-red-500 text-white' : 'bg-brand-600 text-white';
      
      modal.innerHTML = `
        <div class="p-8">
            <div class="w-16 h-16 rounded-2xl ${iconStyles} flex items-center justify-center mx-auto mb-6">
                <i class="fas ${icon} text-3xl"></i>
            </div>
            <h3 class="text-xl font-bold text-center text-slate-900 mb-2 tracking-tight">${sanitizeHTML(title)}</h3>
            <p class="text-center text-slate-500 mb-8 text-sm font-medium leading-relaxed">${sanitizeHTML(message)}</p>
            <div class="flex gap-3">
                <button id="ui-btn-cancel" class="flex-1 py-4 bg-slate-50 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all">Cancel</button>
                <button id="ui-btn-confirm" class="flex-1 py-4 ${confirmBtnClass} font-bold rounded-2xl shadow-sm transition-all">${sanitizeHTML(confirmText)}</button>
            </div>
        </div>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
          overlay.classList.remove('opacity-0');
          modal.classList.remove('scale-95');
      });

      const close = (result) => {
          overlay.classList.add('opacity-0');
          modal.classList.add('scale-95');
          setTimeout(() => { overlay.remove(); resolve(result); }, 200);
      };

      modal.querySelector('#ui-btn-cancel').onclick = () => close(false);
      modal.querySelector('#ui-btn-confirm').onclick = () => close(true);
    });
  }

  static async showPrompt(title, message, placeholder = '', type = 'brand') {
      return new Promise((resolve) => {
          const overlay = document.createElement('div');
          overlay.className = 'fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center opacity-0 transition-opacity duration-200 backdrop-blur-sm';
          
          const modal = document.createElement('div');
          modal.className = 'bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4 overflow-hidden transform scale-95 transition-transform duration-200 border border-slate-200/60';
          
          const iconStyles = 'text-brand-500 bg-brand-50';
          
          modal.innerHTML = `
              <div class="p-8">
                  <div class="w-16 h-16 rounded-2xl ${iconStyles} flex items-center justify-center mx-auto mb-6">
                      <i class="fas fa-edit text-3xl"></i>
                  </div>
                  <h3 class="text-xl font-bold text-center text-slate-900 mb-2 tracking-tight">${sanitizeHTML(title)}</h3>
                  <p class="text-center text-slate-500 mb-6 text-sm font-medium leading-relaxed">${sanitizeHTML(message)}</p>
                  
                  <input type="text" id="ui-prompt-input" placeholder="${sanitizeHTML(placeholder)}" class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-brand-500/10 text-base font-bold text-slate-800 outline-none mb-6 transition-all">

                  <div class="flex gap-3">
                      <button id="ui-prompt-cancel" class="flex-1 py-4 bg-slate-50 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all">Cancel</button>
                      <button id="ui-prompt-confirm" class="flex-1 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-sm hover:bg-black transition-all">Submit</button>
                  </div>
              </div>
          `;
          
          overlay.appendChild(modal);
          document.body.appendChild(overlay);

          const input = modal.querySelector('#ui-prompt-input');

          requestAnimationFrame(() => {
              overlay.classList.remove('opacity-0');
              modal.classList.remove('scale-95');
              setTimeout(() => input.focus(), 100);
          });

          const close = (val) => {
              overlay.classList.add('opacity-0');
              modal.classList.add('scale-95');
              setTimeout(() => { overlay.remove(); resolve(val); }, 200);
          };

          modal.querySelector('#ui-prompt-cancel').onclick = () => close(null);
          modal.querySelector('#ui-prompt-confirm').onclick = () => close(input.value);
          input.onkeypress = (e) => { if(e.key === 'Enter') close(input.value); };
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

function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}
