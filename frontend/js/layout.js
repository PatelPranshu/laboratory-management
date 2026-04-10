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
    let labName = 'MyPathoLabs';
    let u = null;
    const userStr = localStorage.getItem('lis_user');
    if (userStr) {
        try {
            u = JSON.parse(userStr);
            if (u.labName) labName = u.labName;
        } catch(e) {}
    }

    // Sanitize labName to prevent stored XSS via malicious lab names
    const safeLabName = sanitizeForHtml(labName);

    const sidebarHTML = `
        <aside class="w-72 bg-gradient-sidebar text-white flex flex-col shadow-lg relative z-20 shrink-0">
            <!-- Sidebar Header -->
            <div class="h-24 flex items-center justify-start border-b border-white/5 px-6 group/logo cursor-default">
                <div class="relative">
                    <div class="bg-white/10 p-2.5 rounded-2xl shadow-md border border-white/10 mr-4 shrink-0 transition-transform duration-300">
                        <i class="fa-solid fa-microscope text-2xl text-brand-100"></i>
                    </div>
                </div>
                <div class="flex flex-col min-w-0">
                    <div class="text-lg font-black tracking-tighter text-white truncate leading-none uppercase transition-all duration-300" title="MyPathoLabs">
                        MyPatho<span class="text-brand-300 font-bold block mt-0.5 text-sm tracking-widest">Labs</span>
                    </div>
                </div>
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
                ${(u && (u.role === 'Admin' || u.role === 'Doctor')) ? `
                <a href="templates.html" data-page="templates" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-file-invoice w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Custom Reports</span>
                </a>
                ` : ''}
                ${(u && u.role === 'Admin') ? `
                <a href="staff.html" data-page="staff" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-user-shield w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Team Management</span>
                </a>
                ` : ''}
                <a href="report-create.html" data-page="report-create" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-plus-circle w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Create Report</span>
                </a>
                ${(u && (u.role === 'Admin' || u.role === 'Doctor' || u.role === 'LabTech')) ? `
                <a href="pending-reports.html" data-page="pending-reports" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-clock w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Pending Reports</span>
                </a>
                ` : ''}
                ${(u && (u.role === 'Admin' || u.role === 'Doctor')) ? `
                <a href="add-sign.html" data-page="add-sign" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-signature w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Signatures</span>
                </a>
                ` : ''}
                ${(u && u.role === 'Admin') ? `
                <a href="design.html" data-page="design" class="nav-link flex items-center px-4 py-3.5 text-indigo-100/70 hover:bg-white/5 hover:text-white rounded-xl transition-custom group">
                    <i class="fas fa-paint-brush w-6 group-hover:text-brand-100 transition-colors"></i> 
                    <span class="font-medium ml-2">Design Report</span>
                </a>
                ` : ''}
            </nav>

            <div class="p-5 border-t border-white/5 bg-black/5">
                <a href="profile.html" class="flex items-center mb-5 p-2 -mx-2 rounded-xl transition-all hover:bg-white/5 active:scale-95 group no-underline">
                    <div class="w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-sm font-bold shadow-lg border border-white/20 transition-all">
                        <i class="fas fa-user-md text-white"></i>
                    </div>
                    <div class="ml-3 overflow-hidden">
                        <p class="text-sm font-bold text-white truncate w-32" id="nav-user-name">Loading...</p>
                        <p class="text-[10px] font-bold text-indigo-300/60 uppercase tracking-widest flex items-center" id="nav-user-role">
                            Admin <i class="fas fa-chevron-right ml-1 text-[8px] opacity-0 group-hover:opacity-100 group-hover:ml-2 transition-all"></i>
                        </p>
                    </div>
                </a>
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
                // Active classes (removed backdrop-blur)
                link.className = "nav-link flex items-center px-4 py-3.5 bg-white/10 border border-white/10 shadow-sm text-white rounded-xl transition-custom group";
                
                // Active icon classes
                const icon = link.querySelector('i');
                if(icon) {
                    icon.className = icon.className.replace('group-hover:text-brand-100', 'text-brand-100');
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
        const userRoleEl = document.getElementById('nav-user-role');
        if (user) {
            try {
                const u = JSON.parse(user);
                const displayName = u.name || (u.email ? u.email.split('@')[0] : 'User');
                if (userNameEl) userNameEl.textContent = displayName;
                if (userRoleEl) {
                    const roleText = u.role === 'Admin' ? 'Admin' : (u.role === 'Doctor' ? 'Doctor / Pathologist' : 'Lab Technician');
                    userRoleEl.innerHTML = `${roleText} <i class="fas fa-chevron-right ml-1 text-[8px] opacity-0 group-hover:opacity-100 group-hover:ml-2 transition-all"></i>`;
                }
            } catch(e) {
                if (userNameEl) userNameEl.textContent = 'User';
            }
        }
    }
}
