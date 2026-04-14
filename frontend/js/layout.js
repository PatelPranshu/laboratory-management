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
                ${(u && (u.role === 'Admin' || u.role === 'Doctor' || u.role === 'LabTech')) ? `
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
        
        // Inject logo into top header if not already there (for mobile/tablet visibility)
        const header = document.querySelector('header');
        if (header && !header.querySelector('.header-logo')) {
            // Find search bar or breadcrumbs to insert before
            const searchBar = header.querySelector('.flex-1.w-full.max-w-2xl') || header.querySelector('nav');
            const logoHTML = `
                <div class="header-logo flex items-center lg:hidden mr-4 shrink-0 cursor-pointer" onclick="window.location.href='dashboard.html'">
                    <div class="bg-brand-600 p-1.5 rounded-lg shadow-sm mr-2.5">
                        <i class="fa-solid fa-microscope text-white text-[10px]"></i>
                    </div>
                    <span class="text-xs font-black tracking-tighter text-slate-800 uppercase">MyPatho<span class="text-brand-600">Labs</span></span>
                </div>
            `;
            if (searchBar) {
                searchBar.insertAdjacentHTML('beforebegin', logoHTML);
            } else {
                header.insertAdjacentHTML('afterbegin', logoHTML);
            }
        }

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
        
        // Initialize Notification System
        setTimeout(() => {
            if (typeof initNotifications === 'function') initNotifications();
            injectFavicon();
        }, 100);
    }
}

/**
 * Injects a microscope favicon if not present
 */
function injectFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/svg+xml';
    // Clean microscope SVG
    favicon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath fill='%230284c7' d='M416 0C398.3 0 384 14.3 384 32v83.6l-50.5 60.6c-17.7 21.2-17.7 51.6 0 72.8l50.5 60.6V448c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32zM192 128V32c0-17.7-14.3-32-32-32s-32 14.3-32 32v96H96c-17.7 0-32 14.3-32 32v64c0 17.7 14.3 32 32 32h32v48c0 17.7 14.3 32 32 32h64c17.7 0 32-14.3 32-32V256h32c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32H192zM64 480c0 17.7 14.3 32 32 32h320c17.7 0 32-14.3 32-32s-14.3-32-32-32H96c-17.7 0-32 14.3-32 32z'/%3E%3C/svg%3E";
    document.head.appendChild(favicon);
}

// ---------------- Real-Time Notification System ---------------- //
function initNotifications() {
    const token = localStorage.getItem('lis_token');
    if (!token) return;

    // Wait for api.js to be available if not already
    if (typeof api === 'undefined') {
        setTimeout(initNotifications, 200);
        return;
    }

    if (typeof io !== 'undefined') {
        setupNotificationSystem(token);
    } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.8.1/socket.io.min.js';
        script.onload = () => setupNotificationSystem(token);
        document.head.appendChild(script);
    }
}

function setupNotificationSystem(token) {
    const header = document.querySelector('header');
    if (!header) return;

    // Find the rightmost flex container to append the bell
    let targetContainer = header.querySelector('#header-actions') || 
                          header.querySelector('.flex.items-center.gap-4:last-child') || 
                          header.querySelector('.flex.space-x-4:last-child') ||
                          header.querySelector('.flex.items-center.justify-end');
    
    // Fallback if no clean container found
    if (!targetContainer) {
        const wrap = document.createElement('div');
        wrap.className = "ml-6 flex items-center space-x-4 shrink-0";
        header.appendChild(wrap);
        targetContainer = wrap;
    } else {
         // Append explicitly via code if it exists. Dashboard uses #header-actions.
    }

    // Check if bell already injected
    if (document.getElementById('notification-wrapper')) return;

    const notifHTML = `
        <div class="relative ml-4 shrink-0 z-[100]" id="notification-wrapper">
            <button id="notif-bell-btn" class="relative bg-white p-2.5 rounded-xl text-slate-500 hover:text-brand-600 shadow-sm border border-slate-100 transition-all focus:outline-none">
                <i class="fas fa-bell"></i>
                <span id="notif-badge" class="hidden absolute top-0 right-0 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white border-2 border-white shadow-sm">
                    0
                </span>
            </button>
            <div id="notif-dropdown" class="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 shadow-xl shadow-slate-200/50 rounded-xl z-[300] hidden overflow-hidden origin-top-right transition-all">
                <div class="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 class="text-sm font-bold text-slate-800">Notifications</h3>
                    <button id="notif-read-all" class="text-[11px] font-semibold text-brand-600 hover:text-brand-800 transition-colors">Mark all as read</button>
                </div>
                <div id="notif-list" class="max-h-[350px] overflow-y-auto custom-scrollbar bg-white">
                    <div class="px-4 py-8 text-center text-sm font-medium text-slate-400">
                        <i class="fas fa-circle-notch fa-spin mb-2"></i><br>Loading...
                    </div>
                </div>
            </div>
        </div>
    `;
    
    targetContainer.insertAdjacentHTML('beforeend', notifHTML);

    const bellBtn = document.getElementById('notif-bell-btn');
    const dropdown = document.getElementById('notif-dropdown');
    const badge = document.getElementById('notif-badge');
    const listEl = document.getElementById('notif-list');
    const readAllBtn = document.getElementById('notif-read-all');

    let notifications = [];
    let unreadCount = 0;

    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#notification-wrapper')) {
            dropdown.classList.add('hidden');
        }
    });

    const renderList = () => {
        if (notifications.length === 0) {
            listEl.innerHTML = '<div class="px-4 py-8 flex flex-col items-center text-center text-sm font-medium text-slate-400"><i class="fas fa-bell-slash text-2xl mb-3 text-slate-200"></i>No notifications yet.</div>';
            return;
        }

        listEl.innerHTML = notifications.map(n => `
            <div class="p-4 border-b border-slate-50 last:border-0 hover:bg-brand-50/30 cursor-pointer transition-colors ${n.isRead ? 'opacity-70' : 'bg-brand-50/10'}" onclick="handleNotifClick('${n._id}', '${n.type}', '${n.referenceId}')">
                <div class="flex gap-3">
                    <div class="mt-0.5 rounded-full bg-slate-100 w-8 h-8 flex items-center justify-center shrink-0 ${!n.isRead ? 'text-brand-600 bg-brand-50' : 'text-slate-400'}">
                        ${n.type === 'NEW_PATIENT' ? '<i class="fas fa-user-plus text-xs"></i>' : '<i class="fas fa-file-medical text-xs"></i>'}
                    </div>
                    <div>
                        <p class="text-[13px] font-semibold text-slate-800 mb-0.5 ${!n.isRead ? 'text-brand-700' : ''}">${sanitizeHTML(n.title)}</p>
                        <p class="text-[12px] text-slate-500 leading-snug">${sanitizeHTML(n.message)}</p>
                        <p class="text-[10px] font-medium text-slate-400 mt-1.5"><i class="far fa-clock mr-1"></i>${new Date(n.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • ${new Date(n.createdAt).toLocaleDateString()}</p>
                    </div>
                    ${!n.isRead ? '<div class="w-2 h-2 rounded-full bg-brand-500 mt-2 ml-auto shrink-0 shadow-sm"></div>' : ''}
                </div>
            </div>
        `).join('');
    };

    const updateBadge = () => {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    };

    const fetchNotifs = async () => {
        try {
            const res = await api.request('/notifications');
            notifications = res.data;
            unreadCount = res.unreadCount;
            renderList();
            updateBadge();
        } catch(e) {
            console.error('Failed to load notifications', e);
            listEl.innerHTML = '<div class="px-4 py-4 text-center text-sm font-medium text-red-400">Failed to load notifications.</div>';
        }
    };

    fetchNotifs();

    window.handleNotifClick = async (id, type, refId) => {
        dropdown.classList.add('hidden');
        try {
            await api.request(`/notifications/read/${id}`, 'PUT');
            const idx = notifications.findIndex(n => n._id === id);
            if (idx > -1 && !notifications[idx].isRead) {
               notifications[idx].isRead = true;
               unreadCount = Math.max(0, unreadCount - 1);
               updateBadge();
               renderList();
            }
        } catch(e) {}
        
        if (type === 'NEW_PATIENT') window.location.href = `patient-profile.html?id=${refId}`;
        if (type === 'NEW_REPORT') window.location.href = `report-create.html?edit=${refId}`;
    };

    readAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            readAllBtn.textContent = 'Marking...';
            await api.request('/notifications/read-all', 'PUT');
            notifications.forEach(n => n.isRead = true);
            unreadCount = 0;
            updateBadge();
            renderList();
            readAllBtn.textContent = 'Mark all as read';
        } catch(e) {
            readAllBtn.textContent = 'Error';
            setTimeout(() => readAllBtn.textContent = 'Mark all as read', 2000);
        }
    });

    // Use the explicit SOCKET_URL from api.js (avoids fragile string manipulation)
    const socketUrl = (typeof SOCKET_URL !== 'undefined') ? SOCKET_URL : '';

    // Connect Socket.IO with production-ready settings
    const socket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'], // Prefer WebSocket, fall back to polling
        reconnectionAttempts: 10,              // Don't retry forever
        reconnectionDelay: 2000,               // Start with 2s delay
        reconnectionDelayMax: 30000,           // Cap at 30s
        timeout: 15000                         // Connection timeout
    });

    socket.on('connect', () => {
        console.log('[Notifications] Socket connected');
    });

    socket.on('connect_error', (err) => {
        console.warn('[Notifications] Socket connection error:', err.message);
    });

    socket.on('new_notification', (data) => {
        notifications.unshift(data);
        if (notifications.length > 50) notifications.pop();
        unreadCount++;
        renderList();
        updateBadge();
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(data.title, 'success');
        }
    });
}
