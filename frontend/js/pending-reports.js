document.addEventListener('DOMContentLoaded', () => {
    loadCommonLayout();
    fetchPendingReports();

    // Auto-refresh pending reports when user switches back to this tab (10s throttle)
    if (typeof TabFocusRefresh !== 'undefined') {
        TabFocusRefresh.register(fetchPendingReports);
    }
});

const user = JSON.parse(localStorage.getItem('lis_user') || '{}');

async function fetchPendingReports() {
    try {
        const res = await api.request('/reports/pending');
        const tbody = document.getElementById('pending-table-body');
        
        if (!res.data || res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-8 py-20 text-center"><div class="max-w-xs mx-auto"><i class="fas fa-check-circle text-5xl text-emerald-100 mb-4 block"></i><span class="text-sm font-bold text-slate-800 uppercase tracking-widest">Queue Clear</span><p class="text-xs font-semibold text-slate-400 mt-2 leading-relaxed">All diagnostic reports have been verified and signed. No pending drafts found.</p></div></td></tr>`;
            return;
        }

        tbody.innerHTML = res.data.map(report => `
            <tr class="group transition-colors">
                <td class="px-8 py-6 whitespace-nowrap text-slate-600 font-bold text-sm">
                    ${new Date(report.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td class="px-8 py-6 whitespace-nowrap">
                    <div class="font-bold text-slate-900 text-base tracking-tight">${sanitizeHTML(report.patientId?.name || 'Unknown Patient')}</div>
                    <div class="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tighter">${report.patientId?.age || '?'} yrs • ${report.patientId?.gender || 'Unknown'}</div>
                </td>
                <td class="px-8 py-6 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-slate-700">${sanitizeHTML(report.creatorId?.name || 'System')}</span>
                        <span class="text-[9px] font-black bg-slate-100 text-slate-400 rounded-md px-2 py-0.5 uppercase tracking-widest border border-slate-200">${sanitizeHTML(report.creatorId?.role || 'User')}</span>
                    </div>
                </td>
                <td class="px-8 py-6 whitespace-nowrap">
                    ${report.verifierId ? `
                        <div class="flex items-center text-slate-800">
                            <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mr-3 border border-emerald-100"><i class="fas fa-user-md text-sm"></i></div>
                            <span class="text-sm font-bold">${sanitizeHTML(report.verifierId.name)}</span>
                        </div>
                    ` : `
                        <span class="text-xs font-bold text-amber-500 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100"><i class="fas fa-exclamation-triangle mr-2"></i>Unassigned</span>
                    `}
                </td>
                <td class="px-8 py-6 whitespace-nowrap text-right">
                    ${(user.role === 'Admin' || (user.role === 'Doctor' && report.verifierId && report.verifierId._id === user.id) || user.role === 'LabTech') ? `
                    <a href="report-create.html?edit=${report._id}" class="inline-flex items-center px-6 py-2.5 bg-brand-600 text-white font-bold rounded-xl shadow-sm transition-all text-sm">
                        <i class="fas fa-file-signature mr-2"></i> Open for Review
                    </a>
                    ` : `
                    <span class="text-xs font-black text-slate-300 uppercase tracking-widest italic">Awaiting Action</span>
                    `}
                </td>
            </tr>
        `).join('');

    } catch (err) {
        document.getElementById('pending-table-body').innerHTML = `<tr><td colspan="5" class="px-8 py-10 text-center text-red-500 font-bold">Failed to sync with verification queue.</td></tr>`;
        console.error("Pending reports error:", err);
    }
}
