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
    if ((e.key === 'lis_exp' || e.key === 'lis_user') && e.newValue === null) {
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
    toast.className = `toast ${type} shadow-lg py-3.5 px-5 rounded-2xl flex items-start gap-3 animate-slide-in max-w-md w-[calc(100vw-2rem)] sm:w-auto z-[9999] border border-slate-100/10`;
    
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    
    const sanitizedMsg = sanitizeHTML(message);
    const msgHtml = sanitizedMsg.includes('\n') 
      ? `<div class="flex flex-col gap-1 mt-0.5">` + sanitizedMsg.split('\n').map(line => `<span class="text-sm font-bold leading-snug break-words">${line}</span>`).join('') + `</div>`
      : `<span class="text-sm font-bold mt-0.5 leading-snug break-words">${sanitizedMsg}</span>`;

    toast.innerHTML = `<i class="fas ${icon} text-lg opacity-80 mt-0.5 shrink-0"></i>${msgHtml}`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3500);
  }

  static showSetupGuide(missingItems) {
    if (document.getElementById('ui-setup-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'ui-setup-modal';
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0 opacity-0 transition-opacity duration-300';
    
    let listHTML = '';
    
    if (missingItems.includes('signature')) {
        listHTML += `
            <div class="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl hover:border-brand-300 transition-colors shadow-sm group">
                <div class="flex items-center gap-3.5">
                    <div class="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center group-hover:bg-rose-100 transition-colors">
                        <i class="fas fa-file-signature text-sm"></i>
                    </div>
                    <div class="text-left">
                        <p class="text-sm font-bold text-slate-800">Add Performed By Sign</p>
                        <p class="text-xs text-slate-500 font-medium">Required for signing reports</p>
                    </div>
                </div>
                <button onclick="window.location.href='add-sign.html?tab=signatures'" class="px-4 py-2 bg-brand-50 border border-brand-100 text-brand-700 text-xs font-bold rounded-lg hover:bg-brand-600 hover:text-white transition-all shadow-sm">Add</button>
            </div>
        `;
    }
    
    if (missingItems.includes('referral')) {
        listHTML += `
            <div class="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl hover:border-brand-300 transition-colors shadow-sm group mt-3">
                <div class="flex items-center gap-3.5">
                    <div class="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                        <i class="fas fa-hospital-user text-sm"></i>
                    </div>
                    <div class="text-left">
                        <p class="text-sm font-bold text-slate-800">Add Referred By</p>
                        <p class="text-xs text-slate-500 font-medium">Required for generating reports</p>
                    </div>
                </div>
                <button onclick="window.location.href='add-sign.html?tab=referrals'" class="px-4 py-2 bg-brand-50 border border-brand-100 text-brand-700 text-xs font-bold rounded-lg hover:bg-brand-600 hover:text-white transition-all shadow-sm">Add</button>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm modal-backdrop transition-opacity"></div>
        <div class="relative bg-slate-50 rounded-2xl text-left overflow-hidden shadow-2xl transform scale-95 transition-all duration-300 sm:max-w-md w-full border border-slate-200/60 flex flex-col modal-content">
            <div class="px-6 py-6 border-b border-slate-100 bg-white">
                <div class="flex items-center gap-3 mb-1.5">
                    <div class="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center">
                        <i class="fas fa-rocket text-sm"></i>
                    </div>
                    <h3 class="text-xl font-extrabold text-slate-800 tracking-tight">Initial Setup Required</h3>
                </div>
                <p class="text-slate-500 text-sm font-medium mt-2 leading-relaxed">Please complete the following requirements to proceed.</p>
            </div>
            
            <div class="p-6 bg-slate-50/50">
                ${listHTML}
            </div>
            
            <div class="px-6 py-4 bg-white border-t border-slate-100 flex justify-end">
                <button id="ui-setup-cancel" class="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-slate-200">I'll do this later</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('.modal-content').classList.remove('scale-95');
    });

    const close = () => {
        modal.classList.add('opacity-0');
        modal.querySelector('.modal-content').classList.add('scale-95');
        setTimeout(() => modal.remove(), 300);
    };

    modal.querySelector('#ui-setup-cancel').onclick = close;
    modal.querySelector('.modal-backdrop').onclick = close;
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
        modal.className = 'bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4 transform scale-95 transition-transform duration-200 border border-slate-200/60';
        
        const iconStyles = type === 'error' ? 'text-red-500 bg-red-50' : 'text-brand-500 bg-brand-50';
        const icon = type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle';
        
        modal.innerHTML = `
        <div class="p-6">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full ${iconStyles} flex items-center justify-center shrink-0">
                    <i class="fas ${icon} text-lg"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-900 tracking-tight">${sanitizeHTML(title)}</h3>
            </div>
            <p class="text-slate-600 mb-6 text-sm leading-relaxed">${sanitizeHTML(message)}</p>
            <div class="flex justify-end">
                <button id="ui-alert-ok" class="px-5 py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-black transition-all shadow-sm text-sm">Got it</button>
            </div>
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
      modal.className = 'bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4 transform scale-95 transition-transform duration-200 border border-slate-200/60';
      
      const iconStyles = type === 'danger' ? 'text-red-500 bg-red-50' : 'text-brand-500 bg-brand-50';
      const icon = type === 'danger' ? 'fa-exclamation-triangle' : 'fa-question-circle';
      const confirmBtnClass = type === 'danger' ? 'bg-red-500 text-white' : 'bg-brand-600 text-white';
      
      modal.innerHTML = `
        <div class="p-6">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full ${iconStyles} flex items-center justify-center shrink-0">
                    <i class="fas ${icon} text-lg"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-900 tracking-tight">${sanitizeHTML(title)}</h3>
            </div>
            <p class="text-slate-600 mb-6 text-sm leading-relaxed">${sanitizeHTML(message)}</p>
            <div class="flex justify-end gap-3 mt-2">
                <button id="ui-btn-cancel" class="px-5 py-2 bg-white border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all text-sm">Cancel</button>
                <button id="ui-btn-confirm" class="px-5 py-2 ${confirmBtnClass} font-semibold rounded-xl shadow-sm hover:opacity-90 transition-opacity text-sm">${sanitizeHTML(confirmText)}</button>
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
          modal.className = 'bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4 transform scale-95 transition-transform duration-200 border border-slate-200/60';
          
          const iconStyles = 'text-brand-500 bg-brand-50';
          
          modal.innerHTML = `
              <div class="p-6">
                  <div class="flex items-center gap-3 mb-4">
                      <div class="w-10 h-10 rounded-full ${iconStyles} flex items-center justify-center shrink-0">
                          <i class="fas fa-edit text-lg"></i>
                      </div>
                      <h3 class="text-lg font-bold text-slate-900 tracking-tight">${sanitizeHTML(title)}</h3>
                  </div>
                  <p class="text-slate-600 mb-4 text-sm leading-relaxed">${sanitizeHTML(message)}</p>
                  
                  <input type="text" id="ui-prompt-input" placeholder="${sanitizeHTML(placeholder)}" class="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-medium text-slate-800 outline-none mb-6 transition-all shadow-sm">

                  <div class="flex justify-end gap-3 mt-2">
                      <button id="ui-prompt-cancel" class="px-5 py-2 bg-white border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all text-sm">Cancel</button>
                      <button id="ui-prompt-confirm" class="px-5 py-2 bg-brand-600 text-white font-semibold rounded-xl shadow-sm hover:bg-brand-700 transition-all text-sm">Submit</button>
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

  static async showSelectPrompt(title, message, options = [], defaultValue = '') {
      return new Promise((resolve) => {
          const overlay = document.createElement('div');
          overlay.className = 'fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center opacity-0 transition-opacity duration-200 backdrop-blur-sm';
          
          const modal = document.createElement('div');
          modal.className = 'bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4 transform scale-95 transition-transform duration-200 border border-slate-200/60';
          
          const iconStyles = 'text-brand-500 bg-brand-50';
          
          let optionsHtml = options.map(opt => `<option value="${sanitizeHTML(opt.value)}" ${opt.value === defaultValue ? 'selected' : ''}>${sanitizeHTML(opt.label)}</option>`).join('');

          modal.innerHTML = `
              <div class="p-6">
                  <div class="flex items-center gap-3 mb-4">
                      <div class="w-10 h-10 rounded-full ${iconStyles} flex items-center justify-center shrink-0">
                          <i class="fas fa-list text-lg"></i>
                      </div>
                      <h3 class="text-lg font-bold text-slate-900 tracking-tight">${sanitizeHTML(title)}</h3>
                  </div>
                  <p class="text-slate-600 mb-4 text-sm leading-relaxed">${sanitizeHTML(message)}</p>
                  
                  <select id="ui-prompt-select" class="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-medium text-slate-800 outline-none mb-6 transition-all shadow-sm cursor-pointer">
                      ${optionsHtml}
                  </select>

                  <div class="flex justify-end gap-3 mt-2">
                      <button id="ui-prompt-cancel" class="px-5 py-2 bg-white border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all text-sm">Cancel</button>
                      <button id="ui-prompt-confirm" class="px-5 py-2 bg-brand-600 text-white font-semibold rounded-xl shadow-sm hover:bg-brand-700 transition-all text-sm">Select</button>
                  </div>
              </div>
          `;
          
          overlay.appendChild(modal);
          document.body.appendChild(overlay);

          const select = modal.querySelector('#ui-prompt-select');

          requestAnimationFrame(() => {
              overlay.classList.remove('opacity-0');
              modal.classList.remove('scale-95');
              setTimeout(() => select.focus(), 100);
          });

          const close = (val) => {
              overlay.classList.add('opacity-0');
              modal.classList.add('scale-95');
              setTimeout(() => { overlay.remove(); resolve(val); }, 200);
          };

          modal.querySelector('#ui-prompt-cancel').onclick = () => close(null);
          modal.querySelector('#ui-prompt-confirm').onclick = () => close(select.value);
      });
  }

  static initCustomSelects() {
      // Find all selects that haven't been wrapped yet
      const selects = document.querySelectorAll('select:not([data-custom-select])');
      
      selects.forEach(select => {
          // Mark as processed
          select.setAttribute('data-custom-select', 'true');
          
          // Hide original select
          select.style.display = 'none';
          
          // Create wrapper
          const wrapper = document.createElement('div');
          const isFullWidth = select.classList.contains('w-full') || (!Array.from(select.classList).some(c => c.startsWith('w-')));
          wrapper.className = `relative custom-select-wrapper ${isFullWidth ? 'w-full' : 'inline-block'}`;
          
          // Insert wrapper right after the select
          select.parentNode.insertBefore(wrapper, select.nextSibling);
          // Move select inside wrapper (optional but helps keep DOM organized)
          wrapper.appendChild(select);

          // Get selected option text
          let selectedText = '';
          if (select.options.length > 0) {
              const selectedOption = select.options[select.selectedIndex];
              selectedText = selectedOption ? selectedOption.text : select.options[0].text;
          }

          // Create trigger
          const trigger = document.createElement('div');
          // Copy relevant classes from original select to trigger (padding, bg, border, rounded, text size, font-weight)
          const classesToCopy = Array.from(select.classList).filter(c => 
              c.startsWith('w-') || c.startsWith('px-') || c.startsWith('py-') || 
              c.startsWith('bg-') || c.startsWith('border') || c.startsWith('rounded') || 
              c.startsWith('text-') || c.startsWith('font-') || c.startsWith('shadow-')
          );
          trigger.className = `custom-select-trigger flex items-center justify-between cursor-pointer select-none transition-all ${classesToCopy.join(' ')}`;
          if (!classesToCopy.some(c => c.startsWith('bg-'))) trigger.classList.add('bg-white');
          if (!classesToCopy.some(c => c.startsWith('border'))) trigger.classList.add('border', 'border-slate-200');
          if (!classesToCopy.some(c => c.startsWith('rounded'))) trigger.classList.add('rounded-xl');
          if (!classesToCopy.some(c => c.startsWith('px-'))) trigger.classList.add('px-4');
          if (!classesToCopy.some(c => c.startsWith('py-'))) trigger.classList.add('py-2.5');

          // Trigger hover/focus states
          trigger.classList.add('hover:border-brand-300');
          
          trigger.innerHTML = `<span class="truncate pr-2">${escapeHtml(selectedText)}</span><i class="fas fa-chevron-down text-slate-400 text-[10px] transition-transform duration-200"></i>`;
          wrapper.appendChild(trigger);

          // Create options container
          const optionsContainer = document.createElement('div');
          optionsContainer.className = 'custom-select-options absolute z-[100] min-w-full w-max whitespace-nowrap bg-white border border-slate-100 rounded-xl shadow-lg mt-1 hidden max-h-60 overflow-y-auto custom-scrollbar transform opacity-0 scale-95 transition-all duration-200 origin-top';
          wrapper.appendChild(optionsContainer);

          // Populate options
          const renderOptions = () => {
              optionsContainer.innerHTML = '';
              Array.from(select.options).forEach((option, index) => {
                  const optionDiv = document.createElement('div');
                  optionDiv.className = `px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors ${select.selectedIndex === index ? 'bg-brand-50 text-brand-600' : 'text-slate-600 hover:bg-slate-50 hover:text-brand-500'}`;
                  optionDiv.textContent = option.text;
                  optionDiv.addEventListener('click', (e) => {
                      e.stopPropagation();
                      select.selectedIndex = index;
                      trigger.querySelector('span').textContent = option.text;
                      // Update active state class
                      Array.from(optionsContainer.children).forEach(c => c.className = 'px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors text-slate-600 hover:bg-slate-50 hover:text-brand-500');
                      optionDiv.className = 'px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors bg-brand-50 text-brand-600';
                      
                      closeDropdown();
                      // Fire change event
                      select.dispatchEvent(new Event('change', { bubbles: true }));
                      // Also fire input event for broader compatibility
                      select.dispatchEvent(new Event('input', { bubbles: true }));
                  });
                  optionsContainer.appendChild(optionDiv);
              });
          };
          renderOptions();

          // Sync if original select changes externally
          select.addEventListener('change', () => {
              const selectedOption = select.options[select.selectedIndex];
              if (selectedOption) {
                  trigger.querySelector('span').textContent = selectedOption.text;
                  Array.from(optionsContainer.children).forEach((c, i) => {
                      c.className = i === select.selectedIndex ? 'px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors bg-brand-50 text-brand-600' : 'px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors text-slate-600 hover:bg-slate-50 hover:text-brand-500';
                  });
              }
          });

          // Toggle dropdown
          const toggleDropdown = () => {
              const isHidden = optionsContainer.classList.contains('hidden');
              // Close all other open dropdowns first
              document.querySelectorAll('.custom-select-options:not(.hidden)').forEach(el => {
                  if (el !== optionsContainer) {
                      el.classList.remove('opacity-100', 'scale-100');
                      el.classList.add('opacity-0', 'scale-95');
                      setTimeout(() => el.classList.add('hidden'), 200);
                      const otherIcon = el.previousElementSibling.querySelector('i');
                      if (otherIcon) otherIcon.classList.remove('rotate-180');
                      el.previousElementSibling.classList.remove('ring-2', 'ring-brand-500/20', 'border-brand-400');
                  }
              });

              if (isHidden) {
                  // Re-render in case options changed dynamically
                  renderOptions();
                  optionsContainer.classList.remove('hidden');
                  trigger.classList.add('ring-2', 'ring-brand-500/20', 'border-brand-400');
                  trigger.querySelector('i').classList.add('rotate-180');
                  // Trigger animation
                  requestAnimationFrame(() => {
                      optionsContainer.classList.remove('opacity-0', 'scale-95');
                      optionsContainer.classList.add('opacity-100', 'scale-100');
                  });
              } else {
                  closeDropdown();
              }
          };

          const closeDropdown = () => {
              optionsContainer.classList.remove('opacity-100', 'scale-100');
              optionsContainer.classList.add('opacity-0', 'scale-95');
              trigger.querySelector('i').classList.remove('rotate-180');
              trigger.classList.remove('ring-2', 'ring-brand-500/20', 'border-brand-400');
              setTimeout(() => {
                  optionsContainer.classList.add('hidden');
              }, 200);
          };

          trigger.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleDropdown();
          });

          // Close when clicking outside
          document.addEventListener('click', (e) => {
              if (!wrapper.contains(e.target) && !optionsContainer.classList.contains('hidden')) {
                  closeDropdown();
              }
          });
      });
  }
}

// Map of explicit page path to allowed roles. If a page isn't listed, it assumes public/all authenticated access.
const PAGE_PERMISSIONS = {
    'staff.html': ['Admin'],
    'register-staff.html': ['Admin'],
    'design.html': ['Admin'],
    'templates.html': ['Admin', 'Doctor'],
    'super-admin.html': ['SuperAdmin'],
    'lab-details.html': ['SuperAdmin']
};

/**
 * Strips out restricted navigation links based on the user's role.
 */
function enforceRBACUI(role) {
    const navLinks = document.querySelectorAll('a[href]');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        // Find the base page name ignoring query parameters or hashes
        const page = href.split('?')[0].split('#')[0].split('/').pop();
        
        if (PAGE_PERMISSIONS[page]) {
            if (!PAGE_PERMISSIONS[page].includes(role)) {
                // Completely remove the element to prevent DOM tampering
                if (link.parentElement && link.parentElement.tagName.toLowerCase() === 'li') {
                    link.parentElement.remove();
                } else {
                    link.remove();
                }
            }
        }
    });

    // Also hide any inline element marked with a data attribute explicitly
    const explicitRestricted = document.querySelectorAll('[data-role-restricted]');
    explicitRestricted.forEach(el => {
        const allowedRoles = el.getAttribute('data-role-restricted').split(',').map(r => r.trim());
        if (!allowedRoles.includes(role)) {
            el.remove();
        }
    });
}

// Check Authentication logic (run on every protected page)
// Note: Actual redirection is now handled by auth-guard.js in the head. This function only initializes the UI.
function checkAuth() {
  const user = localStorage.getItem('lis_user');
  
  // Populate user info in nav — use textContent to prevent XSS
  const userNameEl = document.getElementById('nav-user-name');
  if (user) {
    try {
      const u = JSON.parse(user);
      
      // Apply UI Security to strip restricted DOM elements natively
      enforceRBACUI(u.role);

      if (userNameEl) {
        const displayName = u.name || (u.email ? u.email.split('@')[0] : 'User');
        userNameEl.textContent = displayName;
      }
    } catch(e) {
      if (userNameEl) userNameEl.textContent = 'User';
    }
  }
}

function handleLogout() {
  if (typeof api !== 'undefined' && api.logout) {
    api.logout();
  } else {
    localStorage.removeItem('lis_exp');
    localStorage.removeItem('lis_user');
    window.location.href = 'index.html';
  }
}

// Add logout listener if button exists
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Initialize custom selects globally
    UI.initCustomSelects();

    // Auto-init custom selects on dynamically added elements
    const observer = new MutationObserver((mutations) => {
        let shouldInit = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                        if (node.tagName === 'SELECT' && !node.dataset.customSelect) {
                            shouldInit = true;
                            break;
                        }
                        if (node.querySelector && node.querySelector('select:not([data-custom-select])')) {
                            shouldInit = true;
                            break;
                        }
                    }
                }
            }
            if (shouldInit) break;
        }
        if (shouldInit) {
            UI.initCustomSelects();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initialize Cookie Consent Banner
    initCookieBanner();
    
    // Initialize Session Inactivity Timeout for authenticated pages
    SessionTimeoutTracker.init();
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

function downloadPdfGlobal(id, event) {
    if (event) event.preventDefault();
    
    const existing = document.getElementById('hf-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'hf-modal';
    overlay.className = 'fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] backdrop-blur-sm animate-fade-in';
    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 overflow-hidden transform transition-all">
            <div class="p-6">
                <div class="w-12 h-12 bg-brand-50 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <i class="fas fa-file-pdf text-brand-600 text-xl"></i>
                </div>
                <h3 class="text-lg font-bold text-center text-slate-800 mb-2">Download PDF</h3>
                <p class="text-sm text-center text-slate-500 mb-6">Do you want to include the lab's header and footer in this PDF?</p>
                <div class="flex flex-col gap-3">
                    <button id="hf-btn-with" class="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors">
                        With Header & Footer
                    </button>
                    <button id="hf-btn-without" class="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors">
                        Without Header & Footer
                    </button>
                    <button id="hf-btn-cancel" class="w-full py-2 px-4 text-slate-400 hover:text-slate-600 font-medium rounded-xl transition-colors mt-1">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    const openPdf = async (withHF) => {
        let url = `${BASE_URL}/reports/${id}/pdf`;
        if (!withHF) {
            url += '?withHeaderFooter=false';
        }
        
        const btnId = withHF ? 'hf-btn-with' : 'hf-btn-without';
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Generating...';
            btn.disabled = true;
        }

        try {
            const response = await fetch(url, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to generate PDF');
            }
            
            let filename = `Diagnostic_Report_${id.slice(-12)}.pdf`;
            const disposition = response.headers.get('content-disposition');
            if (disposition) {
                const match = disposition.match(/filename="?([^";\n]+)"?/);
                if (match && match[1]) {
                    filename = match[1];
                }
            }
            
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            close();
        } catch (err) {
            console.error(err);
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(err.message, 'error');
            } else {
                alert(err.message);
            }
            if (btn) {
                btn.innerHTML = btn.dataset.originalText;
                btn.disabled = false;
            }
        }
    };

    document.getElementById('hf-btn-with').onclick = () => openPdf(true);
    document.getElementById('hf-btn-without').onclick = () => openPdf(false);
    document.getElementById('hf-btn-cancel').onclick = close;
}

// ---------- Legal Compliance Features ----------

function initCookieBanner() {
    if (localStorage.getItem('lis_cookie_consent')) return;

    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.className = 'fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 sm:p-6 z-[9999] shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-700 transform transition-all duration-300';
    banner.innerHTML = `
        <div class="text-sm text-slate-300">
            <h4 class="text-base font-bold text-white mb-1">We value your privacy</h4>
            <p>We use cookies to enhance your browsing experience and monitor application health. By clicking "Accept All", you consent to our use of cookies. <a href="privacy-policy.html" target="_blank" class="text-brand-400 hover:underline">Read more</a>.</p>
        </div>
        <div class="flex gap-3 shrink-0">
            <button id="cookie-decline" class="px-5 py-2.5 text-sm font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700">Decline Essential Only</button>
            <button id="cookie-accept" class="px-5 py-2.5 text-sm font-semibold rounded-xl bg-brand-600 hover:bg-brand-500 text-white transition-colors">Accept All</button>
        </div>
    `;
    document.body.appendChild(banner);

    const applyConsent = (status) => {
        if (typeof window.applyCookieConsent === 'function') {
            window.applyCookieConsent(status);
        } else {
            localStorage.setItem('lis_cookie_consent', status);
        }
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(100%)';
        setTimeout(() => banner.remove(), 300);
    };

    document.getElementById('cookie-accept').onclick = () => applyConsent('accepted');
    document.getElementById('cookie-decline').onclick = () => applyConsent('declined');
}

class SessionTimeoutTracker {
    static init() {
        // Only run on authenticated pages, skip public ones
        const path = window.location.pathname;
        if (path.endsWith('/') || path.endsWith('/') || path.endsWith('register-staff') || path.endsWith('privacy-policy') || path.endsWith('terms-condition')) return;
        
        const TIMEOUT_MS = 15 * 60 * 1000; // 15 mins
        const WARNING_MS = 14 * 60 * 1000; // 14 mins
        let timeoutId;
        let warningId;
        let warningModalOpen = false;

        const resetTimer = DraftManager.debounce(() => {
            if (warningModalOpen) return;
            clearTimeout(timeoutId);
            clearTimeout(warningId);

            warningId = setTimeout(showWarning, WARNING_MS);
            timeoutId = setTimeout(enforceLogout, TIMEOUT_MS);
        }, 2000); // Throttle heavily to max once every 2 seconds

        const showWarning = async () => {
            warningModalOpen = true;
            const res = await UI.showConfirm('Session Expiring', 'You will be logged out in 60 seconds due to inactivity. Click to stay logged in.', 'Stay Logged In', 'brand');
            warningModalOpen = false;
            if (res) {
                // User clicked stay logged in
                resetTimer();
            } else {
                // User clicked cancel
                enforceLogout();
            }
        };

        const enforceLogout = () => {
            console.warn('[HIPAA] Automatically logging out due to 15m inactivity.');
            handleLogout();
        };

        // Attach throttled listeners
        ['mousemove', 'keypress', 'scroll', 'click', 'touchstart'].forEach(evt => {
            document.addEventListener(evt, resetTimer, { passive: true });
        });

        // Initial start
        resetTimer();
    }
}


