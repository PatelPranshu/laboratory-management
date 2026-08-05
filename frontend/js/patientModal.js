const PatientModal = {
    options: null,
    isSaving: false,

    init: function() {
        if (document.getElementById('universal-patient-modal')) return;

        const modalHTML = `
            <div id="universal-patient-modal" class="fixed inset-0 bg-slate-900/50 hidden overflow-y-auto h-full w-full z-[200] flex items-center justify-center transition-opacity">
                <div class="relative mx-auto border-0 w-full max-w-xl shadow-2xl rounded-2xl bg-white m-4 transform transition-transform scale-95 opacity-0 duration-300" id="universal-patient-modal-content">
                    <div class="px-5 sm:px-8 py-4 sm:py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                        <h3 class="text-lg sm:text-xl font-bold text-slate-800 flex items-center" id="upm-title">
                            <i class="fas fa-user-plus text-brand-500 mr-3" id="upm-icon"></i> <span id="upm-title-text">Quick Registration</span>
                        </h3>
                        <button onclick="PatientModal.close()" class="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors focus:outline-none">
                            <i class="fas fa-times text-lg"></i>
                        </button>
                    </div>

                    <div class="px-5 sm:px-8 py-4 sm:py-5">
                        <form id="universal-patient-form" onsubmit="PatientModal.save(event)">
                            <div class="grid grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3 sm:gap-y-4 text-left">
                                <div class="col-span-2">
                                    <label class="block text-[12px] sm:text-[13px] font-bold text-slate-700 mb-1 sm:mb-1.5 flex items-center">
                                        Full Name <span class="text-red-500 ml-1">*</span>
                                    </label>
                                    <div class="relative">
                                        <input type="text" id="upm-name" required placeholder="John Doe" autocomplete="off"
                                            class="w-full px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-medium text-slate-800 text-sm">
                                        <div id="upm-name-suggestions" class="absolute z-[250] w-full bg-white border border-slate-200 shadow-xl rounded-xl mt-1 hidden max-h-60 overflow-y-auto top-full left-0">
                                        </div>
                                    </div>
                                </div>

                                <div class="col-span-1">
                                    <label class="block text-[12px] sm:text-[13px] font-bold text-slate-700 mb-1 sm:mb-1.5 flex items-center">
                                        Age <span class="text-red-500 ml-1">*</span>
                                    </label>
                                    <div class="flex gap-2">
                                        <input type="number" id="upm-age" required min="0" placeholder="e.g. 35"
                                            class="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-medium text-slate-800 text-sm">
                                        <select id="upm-age-unit" required
                                            class="w-[85px] shrink-0 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-medium text-slate-800 text-sm cursor-pointer">
                                            <option value="Years">Yrs</option>
                                            <option value="Months">Mos</option>
                                            <option value="Days">Days</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="col-span-1">
                                    <label class="block text-[12px] sm:text-[13px] font-bold text-slate-700 mb-1 sm:mb-1.5 flex items-center">
                                        Gender <span class="text-red-500 ml-1">*</span>
                                    </label>
                                    <select id="upm-gender" required
                                        class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-medium text-slate-800 text-sm cursor-pointer appearance-none">
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div class="col-span-2 sm:col-span-1">
                                    <label class="block text-[12px] sm:text-[13px] font-bold text-slate-700 mb-1 sm:mb-1.5 flex items-center">
                                        Phone Number
                                    </label>
                                    <input type="text" id="upm-phone" placeholder="+91 999 999 9999"
                                        class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-medium text-slate-800 text-sm">
                                </div>

                                <div class="col-span-2 sm:col-span-1">
                                    <label class="block text-[12px] sm:text-[13px] font-bold text-slate-700 mb-1 sm:mb-1.5">Email Address</label>
                                    <input type="email" id="upm-email" placeholder="example@email.com"
                                        class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-medium text-slate-800 text-sm">
                                </div>

                                <div class="col-span-2">
                                    <label class="block text-[12px] sm:text-[13px] font-bold text-slate-700 mb-1 sm:mb-1.5">Address</label>
                                    <textarea id="upm-address" rows="2" placeholder="Full residential address..."
                                        class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-medium text-slate-800 text-sm resize-none"></textarea>
                                </div>

                                <div class="col-span-1">
                                    <label class="block text-[12px] sm:text-[13px] font-bold text-slate-700 mb-1 sm:mb-1.5 flex items-center gap-1.5">
                                        <i class="fas fa-weight text-slate-400 text-[10px]"></i> Weight (kg)
                                    </label>
                                    <input type="number" id="upm-weight" step="0.1" min="0" placeholder="e.g. 70"
                                        class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-medium text-slate-800 text-sm">
                                </div>

                                <div class="col-span-1">
                                    <label class="block text-[12px] sm:text-[13px] font-bold text-slate-700 mb-1 sm:mb-1.5 flex items-center gap-1.5">
                                        <i class="fas fa-ruler-vertical text-slate-400 text-[10px]"></i> Height (cm)
                                    </label>
                                    <input type="number" id="upm-height" step="0.1" min="0" placeholder="e.g. 170"
                                        class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-medium text-slate-800 text-sm">
                                </div>
                            </div>

                            <div class="flex items-center justify-end space-x-3 sm:space-x-4 pt-4 sm:pt-5 mt-4 border-t border-slate-100">
                                <button type="button" onclick="PatientModal.close()"
                                    class="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-800 focus:outline-none transition-colors">Cancel</button>
                                <button type="submit" id="btn-save-upm"
                                    class="flex-1 sm:flex-none px-7 py-2.5 rounded-xl shadow-md text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 focus:outline-none transition-all">Register</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Optional draft auto-save integration if DraftManager exists and we are in create mode
        const autoSaveDraft = () => {
            if (this.options && this.options.mode === 'create' && typeof DraftManager !== 'undefined') {
                const data = {
                    name: document.getElementById('upm-name').value,
                    phone: document.getElementById('upm-phone').value,
                    email: document.getElementById('upm-email').value,
                    age: document.getElementById('upm-age').value,
                    ageUnit: document.getElementById('upm-age-unit').value,
                    gender: document.getElementById('upm-gender').value,
                    address: document.getElementById('upm-address').value,
                    weight: document.getElementById('upm-weight').value,
                    height: document.getElementById('upm-height').value
                };
                if (Object.values(data).some(v => v && v.trim() !== '')) {
                    DraftManager.save('patient', data);
                }
            }
        };

        ['upm-name', 'upm-phone', 'upm-email', 'upm-age', 'upm-age-unit', 'upm-gender', 'upm-address', 'upm-weight', 'upm-height'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
                if(typeof DraftManager !== 'undefined' && DraftManager.debounce) {
                    // Use simple debounce inline or trigger direct save if not typed fast
                    if(!this._draftDebounceTimer) {
                        this._draftDebounceTimer = setTimeout(() => {
                            autoSaveDraft();
                            this._draftDebounceTimer = null;
                        }, 500);
                    }
                }
            });
        });

        // Initialize autocomplete logic
        window.LIS_SEARCH_CACHE = window.LIS_SEARCH_CACHE || {};
        let searchDebounceTimer = null;
        const nameInput = document.getElementById('upm-name');
        const suggestionsBox = document.getElementById('upm-name-suggestions');

        if (nameInput && suggestionsBox) {
            document.addEventListener('click', (e) => {
                if (!nameInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                    suggestionsBox.classList.add('hidden');
                }
            });

            nameInput.addEventListener('input', (e) => {
                if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

                const query = e.target.value.trim().toLowerCase();
                if (query.length < 2) {
                    suggestionsBox.classList.add('hidden');
                    return;
                }

                searchDebounceTimer = setTimeout(async () => {
                    try {
                        let results = [];
                        if (window.LIS_SEARCH_CACHE[query]) {
                            results = window.LIS_SEARCH_CACHE[query];
                        } else {
                            const res = await api.request(`/patients?search=${encodeURIComponent(query)}&limit=5`);
                            results = res.data || [];
                            window.LIS_SEARCH_CACHE[query] = results;
                        }

                        if (results.length > 0) {
                            suggestionsBox.innerHTML = results.map(p => `
                                <div onclick="window.location.href='patient-profile?id=${p._id}'" class="p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-colors last:border-0">
                                    <div>
                                        <p class="text-sm font-bold text-slate-800">${p.name}</p>
                                        <p class="text-xs text-slate-500 mt-0.5">${p.phone || 'No phone'} • ${p.age} ${p.ageUnit || 'Yrs'} / ${p.gender}</p>
                                    </div>
                                    <i class="fas fa-external-link-alt text-brand-500 opacity-50 text-xs"></i>
                                </div>
                            `).join('');
                            suggestionsBox.classList.remove('hidden');
                        } else {
                            suggestionsBox.innerHTML = '';
                            suggestionsBox.classList.add('hidden');
                        }
                    } catch (err) {
                        console.error('Search error:', err);
                        suggestionsBox.classList.add('hidden');
                    }
                }, 500);
            });
            
            nameInput.addEventListener('focus', () => {
                if (nameInput.value.trim().length >= 2 && suggestionsBox.innerHTML.trim() !== '') {
                    suggestionsBox.classList.remove('hidden');
                }
            });
        }
    },

    open: function(options) {
        this.options = options || { mode: 'create' };
        this.init(); // Ensure modal exists
        
        document.getElementById('universal-patient-form').reset();
        
        const titleText = document.getElementById('upm-title-text');
        const icon = document.getElementById('upm-icon');
        const saveBtn = document.getElementById('btn-save-upm');
        
        if (this.options.mode === 'edit') {
            titleText.textContent = 'Edit Patient Profile';
            icon.className = 'fas fa-user-edit text-brand-500 mr-3';
            saveBtn.textContent = 'Save Changes';
            
            const p = this.options.patient || {};
            document.getElementById('upm-name').value = p.name || '';
            document.getElementById('upm-age').value = p.age || '';
            document.getElementById('upm-age-unit').value = p.ageUnit || 'Years';
            document.getElementById('upm-gender').value = p.gender || 'Male';
            document.getElementById('upm-phone').value = p.phone || '';
            document.getElementById('upm-email').value = p.email || '';
            document.getElementById('upm-address').value = p.address || '';
            document.getElementById('upm-weight').value = p.weight || '';
            document.getElementById('upm-height').value = p.height || '';
        } else {
            titleText.textContent = 'Quick Registration';
            icon.className = 'fas fa-user-plus text-brand-500 mr-3';
            saveBtn.textContent = 'Register';
            
            // Try to load draft
            if (typeof DraftManager !== 'undefined') {
                const draft = DraftManager.load('patient');
                if (draft) {
                    document.getElementById('upm-name').value = draft.name || '';
                    document.getElementById('upm-phone').value = draft.phone || '';
                    document.getElementById('upm-email').value = draft.email || '';
                    document.getElementById('upm-age').value = draft.age || '';
                    document.getElementById('upm-age-unit').value = draft.ageUnit || 'Years';
                    document.getElementById('upm-gender').value = draft.gender || 'Male';
                    document.getElementById('upm-address').value = draft.address || '';
                    document.getElementById('upm-weight').value = draft.weight || '';
                    document.getElementById('upm-height').value = draft.height || '';
                }
            }
        }
        
        const modal = document.getElementById('universal-patient-modal');
        const content = document.getElementById('universal-patient-modal-content');
        
        modal.classList.remove('hidden');
        setTimeout(() => {
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        }, 10);
    },

    close: function() {
        const modal = document.getElementById('universal-patient-modal');
        const content = document.getElementById('universal-patient-modal-content');
        if (!modal) return;
        
        content.classList.remove('scale-100', 'opacity-100');
        content.classList.add('scale-95', 'opacity-0');
        
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    },

    save: async function(e) {
        e.preventDefault();
        if (this.isSaving) return;
        this.isSaving = true;

        if (typeof UI !== 'undefined' && UI.toggleLoader) {
            UI.toggleLoader('btn-save-upm', true, '<i class="fas fa-circle-notch fa-spin mr-2"></i> Saving...');
        } else {
            document.getElementById('btn-save-upm').textContent = 'Saving...';
        }

        const data = {
            name: document.getElementById('upm-name').value,
            phone: document.getElementById('upm-phone').value,
            email: document.getElementById('upm-email').value,
            age: document.getElementById('upm-age').value,
            ageUnit: document.getElementById('upm-age-unit').value,
            gender: document.getElementById('upm-gender').value,
            address: document.getElementById('upm-address').value,
            weight: document.getElementById('upm-weight').value || undefined,
            height: document.getElementById('upm-height').value || undefined
        };

        try {
            if (this.options.mode === 'edit' && this.options.patient && this.options.patient._id) {
                const res = await api.request(`/patients/${this.options.patient._id}`, 'PUT', data);
                if (typeof UI !== 'undefined') UI.showToast('Profile updated successfully', 'success');
                if (typeof DraftManager !== 'undefined') DraftManager.clear('patient');
                this.close();
                if (this.options.onSuccess) this.options.onSuccess(res.data);
            } else {
                const res = await api.request('/patients', 'POST', data);
                if (typeof UI !== 'undefined') UI.showToast('Patient added successfully', 'success');
                if (typeof DraftManager !== 'undefined') DraftManager.clear('patient');
                this.close();
                if (this.options.onSuccess) this.options.onSuccess(res.data);
            }
        } catch (err) {
            if (typeof UI !== 'undefined') {
                UI.showToast(err.message || 'Error saving patient', 'error');
            } else {
                alert(err.message || 'Error saving patient');
            }
        } finally {
            this.isSaving = false;
            if (typeof UI !== 'undefined' && UI.toggleLoader) {
                UI.toggleLoader('btn-save-upm', false, this.options.mode === 'edit' ? 'Save Changes' : 'Register');
            } else {
                document.getElementById('btn-save-upm').textContent = this.options.mode === 'edit' ? 'Save Changes' : 'Register';
            }
        }
    }
};

// Auto-initialize on DOM content loaded to attach the HTML
document.addEventListener('DOMContentLoaded', () => {
    PatientModal.init();
});

