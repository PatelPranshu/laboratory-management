/**
 * Shared UI Component Generator
 * Automatically injects the sidebar and applies active states based on the current URL.
 */

/**
 * Sanitize a string for safe HTML insertion — prevents stored XSS from labName etc.
 */
function sanitizeForHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function loadCommonLayout() {
    let labName = 'CureLIS';
    const userStr = localStorage.getItem('lis_user');
    if (userStr) {
        try {
            const u = JSON.parse(userStr);
            if (u.labName) labName = u.labName;
        } catch(e) {}
    }

    // Sanitize labName to prevent stored XSS via malicious lab names
    const safeLabName = sanitizeForHtml(labName);

    const sidebarHTML = `
        <aside class="w-72 bg-gradient-sidebar text-white flex flex-col shadow-2xl relative z-20 shrink-0">
            <!-- Decorative blur -->
            <div class="absolute top-0 left-0 w-full h-32 bg-white/5 backdrop-blur-3xl -z-10"></div>
            
            <div class="h-20 flex items-center justify-start border-b border-white/10 px-6">
                <div class="bg-white/10 p-2 rounded-xl backdrop-blur-md shadow-sm border border-white/20 mr-3 shrink-0">
                    <i class="fa-solid fa-flask text-xl text-brand-100"></i>
                </div>
                <span class="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-brand-100 truncate leading-tight" title="${safeLabName}">${safeLabName}</span>
            </div>
            
            <nav class="flex-1 px-4 py-8 space-y-3 overflow-y-auto custom-scrollbar">
                <a href="dashboard.html" data-page="dashboard" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-home w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Dashboard</span>
                </a>
                <a href="patients.html" data-page="patients" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-users w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Patients</span>
                </a>
                <a href="templates.html" data-page="templates" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-file-invoice w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Custom Reports</span>
                </a>
                <a href="report-create.html" data-page="report-create" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-plus-circle w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Create Report</span>
                </a>
                <a href="design.html" data-page="design" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-paint-brush w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Design Report</span>
                </a>
            </nav>

            <div class="p-5 border-t border-white/10 bg-black/10 backdrop-blur-sm">
                <div class="flex items-center mb-5">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-sm font-bold shadow-lg border border-white/20">
                        <i class="fas fa-user-md"></i>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm font-semibold text-white truncate w-36" id="nav-user-name">Loading...</p>
                        <p class="text-xs text-indigo-200/70">Administrator</p>
                    </div>
                </div>
                <button id="logout-btn" class="w-full flex items-center justify-center px-4 py-2.5 bg-white/5 hover:bg-red-500/80 border border-white/10 hover:border-red-400 rounded-xl text-sm font-medium text-white transition-all duration-300">
                    <i class="fas fa-sign-out-alt mr-2"></i> Sign Out
                </button>
            </div>
        </aside>
    `;

    // Ensure the container exists
    const container = document.querySelector('.flex.h-screen.overflow-hidden');
    if (container) {
        container.insertAdjacentHTML('afterbegin', sidebarHTML);
        
        // Apply active class based on current URL
        const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'dashboard';
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            if (link.dataset.page === currentPage) {
                // Active classes
                link.className = "nav-link flex items-center px-4 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 shadow-inner text-white rounded-xl transition-custom group";
                
                // Active icon classes
                const icon = link.querySelector('i');
                if(icon) {
                    icon.className = icon.className.replace('group-hover:text-brand-100', 'text-brand-100');
                    if(!icon.className.includes('group-hover:scale-110')) {
                       icon.className += ' group-hover:scale-110 transition-transform';
                    }
                }
            }
        });

        // Re-attach logout handler
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn && typeof handleLogout === 'function') {
            logoutBtn.addEventListener('click', handleLogout);
        }
        
        // Re-inject user name if checkAuth already ran — use textContent (safe)
        const user = localStorage.getItem('lis_user');
        const userNameEl = document.getElementById('nav-user-name');
        if (userNameEl && user) {
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
