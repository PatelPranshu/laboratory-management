(function() {
    // Prevent Flash of Unauthenticated Content (FOUC)
    var user = localStorage.getItem('lis_user');
    var exp = localStorage.getItem('lis_exp');
    var currentTime = Math.floor(Date.now() / 1000);
    
    // Check if token exists and is valid
    if (!user || !exp || parseInt(exp, 10) < currentTime) {
        localStorage.removeItem('lis_user');
        localStorage.removeItem('lis_exp');
        // Preserve current page as returnUrl so user returns here after login
        var currentPage = window.location.pathname.split('/').pop();
        var currentSearch = window.location.search;
        var returnPath = currentPage + currentSearch;
        if (returnPath && returnPath !== 'index.html' && returnPath !== 'index.html?') {
            window.location.replace('index.html?returnUrl=' + encodeURIComponent(returnPath));
        } else {
            window.location.replace('index.html');
        }
        return;
    }
    
    // Early RBAC Check (optional, but prevents role-based FOUC)
    try {
        var u = JSON.parse(user);
        var currentPath = window.location.pathname;
        var currentPage = currentPath.split('/').pop().split('?')[0].split('#')[0];
        
        var PAGE_PERMISSIONS = {
            'staff.html': ['Admin'],
            'register-staff.html': ['Admin'],
            'design.html': ['Admin'],
            'templates.html': ['Admin', 'Doctor'],
            'super-admin.html': ['SuperAdmin'],
            'lab-details.html': ['SuperAdmin']
        };
        
        if (PAGE_PERMISSIONS[currentPage]) {
            var allowedRoles = PAGE_PERMISSIONS[currentPage];
            if (!allowedRoles.includes(u.role)) {
                window.location.replace('dashboard.html');
            }
        }
    } catch (e) {
        localStorage.removeItem('lis_user');
        localStorage.removeItem('lis_exp');
        window.location.replace('index.html');
    }
})();


