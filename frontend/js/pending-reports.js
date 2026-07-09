document.addEventListener('DOMContentLoaded', () => {
    loadCommonLayout();
    fetchPendingReports();

    // Auto-refresh pending reports when user switches back to this tab (10s throttle)
    if (typeof TabFocusRefresh !== 'undefined') {
        TabFocusRefresh.register(() => fetchPendingReports());
    }
});

const user = JSON.parse(localStorage.getItem('lis_user') || '{}');
let currentPendingPage = 1;
const PENDING_LIMIT = 20;

async function fetchPendingReports(page = 1) {
    currentPendingPage = page;
    try {
        const res = await api.request(`/reports/pending?page=${page}&limit=${PENDING_LIMIT}`);
        const tbody = document.getElementById('pending-table-body');
        
        if (!res.data || res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-8 py-20 text-center block sm:table-cell"><div class="max-w-xs mx-auto"><i class="fas fa-check-circle text-5xl text-emerald-100 mb-4 block"></i><span class="text-sm font-bold text-slate-800 uppercase tracking-widest">Queue Clear</span><p class="text-xs font-semibold text-slate-400 mt-2 leading-relaxed">All diagnostic reports have been verified and signed. No pending drafts found.</p></div></td></tr>`;
            renderPendingPagination(null);
            return;
        }

        tbody.innerHTML = res.data.map(report => `
            <tr class="flex sm:table-row flex-col sm:flex-row hover:bg-slate-50/50 transition-colors group p-5 sm:p-0 border-b border-slate-100 last:border-0 sm:border-0 cursor-default gap-3 sm:gap-0">
                <td class="px-0 sm:px-8 py-0 sm:py-6 flex sm:table-cell items-center min-w-0 w-full sm:w-auto text-slate-600 font-bold text-sm whitespace-nowrap">
                    <span class="sm:hidden font-bold text-[10px] text-slate-400 uppercase tracking-widest w-32 shrink-0">Draft Date</span>
                    ${new Date(report.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td class="px-0 sm:px-8 py-0 sm:py-6 flex sm:table-cell items-start min-w-0 w-full sm:w-auto whitespace-nowrap">
                    <span class="sm:hidden font-bold text-[10px] text-slate-400 uppercase tracking-widest w-32 shrink-0 mt-1">Patient Details</span>
                    <div>
                        <div class="font-bold text-slate-900 text-base tracking-tight">${sanitizeHTML(report.patientId?.name || 'Unknown Patient')}</div>
                        <div class="text-[10px] text-slate-500 font-mono mt-0.5 font-bold">ID: ${report._id.slice(-12).toUpperCase()}</div>
                        <div class="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tighter">${report.patientId?.age || '?'} yrs • ${report.patientId?.gender || 'Unknown'}</div>
                    </div>
                </td>
                <td class="px-0 sm:px-8 py-0 sm:py-6 flex sm:table-cell items-center min-w-0 w-full sm:w-auto whitespace-nowrap">
                    <span class="sm:hidden font-bold text-[10px] text-slate-400 uppercase tracking-widest w-32 shrink-0">Test Profiles</span>
                    <div class="flex flex-wrap gap-1 max-w-xs">
                        ${report.templateIds && report.templateIds.length > 0 
                            ? report.templateIds.map(t => `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-tight border border-slate-200/50">${sanitizeHTML(t.templateName)}</span>`).join('')
                            : '<span class="text-slate-400 text-[10px] italic">No templates</span>'
                        }
                    </div>
                </td>
                <td class="px-0 sm:px-8 py-0 sm:py-6 flex sm:table-cell items-center min-w-0 w-full sm:w-auto whitespace-nowrap">
                    <span class="sm:hidden font-bold text-[10px] text-slate-400 uppercase tracking-widest w-32 shrink-0">Prepared By</span>
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-slate-700">${sanitizeHTML(report.creatorId?.name || 'System')}</span>
                        <span class="text-[9px] font-black bg-slate-100 text-slate-400 rounded-md px-2 py-0.5 uppercase tracking-widest border border-slate-200">${sanitizeHTML(report.creatorId?.role || 'User')}</span>
                    </div>
                </td>
                <td class="px-0 sm:px-8 py-0 sm:py-6 flex sm:table-cell items-center min-w-0 w-full sm:w-auto whitespace-nowrap">
                    <span class="sm:hidden font-bold text-[10px] text-slate-400 uppercase tracking-widest w-32 shrink-0">Verifier</span>
                    ${report.verifierId ? `
                        <div class="flex items-center text-slate-800">
                            <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mr-3 border border-emerald-100"><i class="fas fa-user-md text-sm"></i></div>
                            <span class="text-sm font-bold">${sanitizeHTML(report.verifierId.name)}</span>
                        </div>
                    ` : `
                        <span class="text-xs font-bold text-amber-500 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100"><i class="fas fa-exclamation-triangle mr-2"></i>Unassigned</span>
                    `}
                </td>
                <td class="px-0 sm:px-8 py-0 sm:py-6 flex sm:table-cell items-center justify-end sm:justify-end min-w-0 w-full sm:w-auto whitespace-nowrap sm:text-right mt-2 sm:mt-0">
                    ${(user.role === 'Admin' || (user.role === 'Doctor' && report.verifierId && report.verifierId._id === user.id) || user.role === 'LabTech') ? `
                    <a href="report-create.html?edit=${report._id}" class="inline-flex items-center justify-center w-full sm:w-auto px-6 py-2.5 bg-brand-600 text-white font-bold rounded-xl shadow-sm transition-all text-sm">
                        <i class="fas fa-file-signature mr-2"></i> Open for Review
                    </a>
                    ` : `
                    <span class="text-xs font-black text-slate-300 uppercase tracking-widest italic w-full sm:w-auto text-center sm:text-right">Awaiting Action</span>
                    `}
                </td>
            </tr>
        `).join('');

        renderPendingPagination(res.pagination);

    } catch (err) {
        document.getElementById('pending-table-body').innerHTML = `<tr><td colspan="6" class="px-8 py-10 text-center text-red-500 font-bold block sm:table-cell">Failed to sync with verification queue.</td></tr>`;
        console.error("Pending reports error:", err);
    }
}

function renderPendingPagination(pagination) {
    let container = document.getElementById('pending-pagination');
    if (!container) {
        container = document.createElement('div');
        container.id = 'pending-pagination';
        container.className = 'flex items-center justify-center gap-2 py-6';
        const tableParent = document.getElementById('pending-table-body')?.closest('table')?.parentElement;
        if (tableParent) tableParent.appendChild(container);
    }

    if (!pagination || pagination.pages <= 1) {
        container.innerHTML = '';
        return;
    }

    const { page, pages } = pagination;
    let html = '';
    
    html += `<button onclick="fetchPendingReports(${page - 1})" ${page <= 1 ? 'disabled' : ''} class="px-3 py-2 rounded-lg text-sm font-bold ${page <= 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'}"><i class="fas fa-chevron-left"></i></button>`;
    
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= page - 1 && i <= page + 1)) {
            html += `<button onclick="fetchPendingReports(${i})" class="px-3.5 py-2 rounded-lg text-sm font-bold ${i === page ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}">${i}</button>`;
        } else if (i === page - 2 || i === page + 2) {
            html += `<span class="text-slate-300 px-1">...</span>`;
        }
    }
    
    html += `<button onclick="fetchPendingReports(${page + 1})" ${page >= pages ? 'disabled' : ''} class="px-3 py-2 rounded-lg text-sm font-bold ${page >= pages ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'}"><i class="fas fa-chevron-right"></i></button>`;
    
    container.innerHTML = html;
}
