document.addEventListener('DOMContentLoaded', () => {
    loadCommonLayout();
    fetchPendingReports();
});

const user = JSON.parse(localStorage.getItem('lis_user') || '{}');

async function fetchPendingReports() {
    try {
        const res = await api.request('/reports/pending');
        const tbody = document.getElementById('pending-table-body');
        
        if (!res.data || res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 m-4 block text-slate-500"><i class="fas fa-check-circle text-4xl text-slate-300 mb-3 block"></i><span class="font-bold">No pending reports!</span><br><span class="text-xs mt-1 block">All drafts are resolved.</span></td></tr>`;
            return;
        }

        tbody.innerHTML = res.data.map(report => `
            <tr class="hover:bg-slate-50/80 transition-colors group">
                <td class="px-6 py-4 whitespace-nowrap text-slate-600 font-medium text-sm">
                    ${new Date(report.date).toLocaleDateString('en-GB')}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="font-bold text-slate-800">${escapeHtml(report.patientId?.name || 'Unknown')}</div>
                    <div class="text-xs text-slate-500">${report.patientId?.age || '?'} yrs • ${report.patientId?.gender || 'Unknown'}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    ${escapeHtml(report.creatorId?.name || 'System')} <span class="text-[10px] bg-slate-200 text-slate-500 rounded px-1 ml-1">${escapeHtml(report.creatorId?.role || '')}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800">
                    ${report.verifierId ? `<i class="fas fa-user-md text-brand-500 mr-1.5 opacity-60"></i>${escapeHtml(report.verifierId.name)}` : '<span class="text-yellow-500"><i class="fas fa-exclamation-circle mr-1"></i> Not Assigned</span>'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right">
                    ${(user.role === 'Admin' || (user.role === 'Doctor' && report.verifierId && report.verifierId._id === user.id) || user.role === 'LabTech') ? `
                    <a href="report-create.html?edit=${report._id}" class="inline-flex items-center px-4 py-2 bg-gradient-to-br from-brand-500 to-brand-600 text-white font-bold rounded-lg hover:-translate-y-0.5 shadow-md shadow-brand-500/30 transition-all text-sm">
                        <i class="fas fa-file-signature mr-2"></i> Verify & Sign
                    </a>
                    ` : `
                    <span class="text-xs text-slate-400 italic">Waiting...</span>
                    `}
                </td>
            </tr>
        `).join('');

    } catch (err) {
        document.getElementById('pending-table-body').innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-500">Error loading pending drafts</td></tr>`;
        console.error("Pending reports error:", err);
    }
}
