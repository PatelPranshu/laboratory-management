/**
 * Referrals Management Logic
 * Handles CRUD operations for the referring doctors directory
 */

document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we are on the signatures page where the referrals section exists
    if (document.getElementById('referrals-list')) {
        fetchReferrals();
    }
});

async function fetchReferrals() {
    const list = document.getElementById('referrals-list');
    const badge = document.getElementById('referrals-count-badge');
    
    try {
        const res = await api.request('/referrals');
        const referrals = res.data;
        
        if (badge) badge.textContent = `${referrals.length} Saved`;
        
        if (!referrals || referrals.length === 0) {
            list.innerHTML = `
                <div class="col-span-full py-10 text-center text-slate-400">
                    <i class="fas fa-user-md text-3xl mb-3 opacity-20"></i>
                    <p class="text-xs font-bold uppercase tracking-widest">No Referral Sources Added</p>
                </div>
            `;
            return;
        }

        list.innerHTML = referrals.map(ref => `
            <div class="group relative bg-white border border-slate-100 p-3 rounded-xl shadow-sm hover:shadow-md hover:border-emerald-200 transition-all">
                <div class="flex items-center gap-3">
                    <div class="shrink-0 w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-sm border border-emerald-100">
                        ${ref.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-[13px] font-bold text-slate-800 leading-snug break-words" title="${ref.name}">${ref.name}</p>
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Referring Source</p>
                    </div>
                    <button onclick="deleteReferral('${ref._id}')" class="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100">
                        <i class="fas fa-trash-alt text-[10px]"></i>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Error fetching referrals:', err);
        UI.showToast('Failed to load referring doctors.', 'error');
    }
}

async function addReferral(event) {
    if (event) event.preventDefault();
    
    const nameInput = document.getElementById('referral-name');
    const name = nameInput.value.trim();
    if (!name) return;

    UI.toggleLoader('btn-add-referral', true, 'Adding...');
    
    try {
        await api.request('/referrals', 'POST', { name });
        nameInput.value = '';
        UI.showToast('Referral source added successfully.', 'success');
        fetchReferrals();
    } catch (err) {
        UI.showToast(err.message || 'Failed to add referral.', 'error');
    } finally {
        UI.toggleLoader('btn-add-referral', false, 'Add to Directory');
    }
}

async function deleteReferral(id) {
    if (!confirm('Are you sure you want to remove this referral source?')) return;
    
    try {
        await api.request(`/referrals/${id}`, 'DELETE');
        UI.showToast('Referral source removed.', 'success');
        fetchReferrals();
    } catch (err) {
        UI.showToast(err.message || 'Failed to delete referral.', 'error');
    }
}
