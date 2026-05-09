// ===== MAIN APP CONTROLLER =====
const App = {
    initialized: false,

    init() {
        if (App.initialized) return;
        App.initialized = true;

        // Data Migration
        Migration.run();

        // Init modules
        try { Customers.init(); } catch(e) { console.error('Customers init failed', e); }
        try { Branches.init(); } catch(e) { console.error('Branches init failed', e); }
        try { Loans.init(); } catch(e) { console.error('Loans init failed', e); }
        try { Payments.init(); } catch(e) { console.error('Payments init failed', e); }
        try { Amc.init(); } catch(e) { console.error('Amc init failed', e); }
        try { Reports.init(); } catch(e) { console.error('Reports init failed', e); }

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                const page = item.dataset.page;
                App.navigate(page);
            });
        });

        // Sidebar toggle (mobile)
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });
        document.getElementById('sidebarClose').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
        });

        // Theme toggle
        const savedTheme = localStorage.getItem('lendflow_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        document.getElementById('darkModeToggle').checked = savedTheme === 'dark';
        App.updateThemeIcon(savedTheme);

        document.getElementById('themeToggle').addEventListener('click', () => App.toggleTheme());
        document.getElementById('darkModeToggle').addEventListener('change', e => {
            App.setTheme(e.target.checked ? 'dark' : 'light');
        });

        // Notifications panel
        document.getElementById('notifBtn').addEventListener('click', () => {
            const panel = document.getElementById('notifPanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', e => {
            if (!e.target.closest('#notifPanel') && !e.target.closest('#notifBtn')) {
                document.getElementById('notifPanel').style.display = 'none';
            }
        });

        // Modal close
        document.getElementById('modalClose').addEventListener('click', () => App.closeModal());
        document.getElementById('modalOverlay').addEventListener('click', e => {
            if (e.target === e.currentTarget) App.closeModal();
        });

        // Settings
        App.initSettings();

        // Schedule
        App.initSchedule();

        // Backup / Restore
        const bBtn = document.getElementById('backupBtn');
        if (bBtn) bBtn.addEventListener('click', () => App.backup());
        
        const rBtn = document.getElementById('restoreBtn');
        const rFile = document.getElementById('restoreFile');
        if (rBtn && rFile) {
            rBtn.addEventListener('click', () => rFile.click());
            rFile.addEventListener('change', e => App.restore(e));
        }

        // Late fee toggle
        const lfToggle = document.getElementById('lateFeeToggle');
        if (lfToggle) {
            lfToggle.addEventListener('change', e => {
                const lfGroup = document.getElementById('lateFeeGroup');
                if (lfGroup) lfGroup.style.display = e.target.checked ? 'block' : 'none';
            });
        }
    },

    navigate(page) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        // Show target
        const el = document.getElementById('page-' + page);
        if (el) el.classList.add('active');
        const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (nav) nav.classList.add('active');

        // Update title
        const titles = { dashboard: 'Dashboard', customers: 'Customers', loans: 'Loans', payments: 'Payments', schedule: 'Schedule', reports: 'Reports', settings: 'Settings', branches: 'Branches', 'staff-mgmt': 'Staff Management' };
        document.getElementById('pageTitle').textContent = titles[page] || page;

        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('open');

        // Refresh schedule if needed
        if (page === 'schedule') App.renderCalendar();
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        App.setTheme(next);
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('lendflow_theme', theme);
        document.getElementById('darkModeToggle').checked = theme === 'dark';
        App.updateThemeIcon(theme);
    },

    updateThemeIcon(theme) {
        const icon = document.querySelector('#themeToggle .material-icons-round');
        icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    },

    // Modal
    openModal(title, bodyHtml) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = bodyHtml;
        document.getElementById('modalOverlay').classList.add('active');
    },

    closeModal() {
        document.getElementById('modalOverlay').classList.remove('active');
    },

    // Toast
    toast(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="material-icons-round">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span> ${msg}`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    },

    // Helpers
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    },

    // Settings
    initSettings() {
        if (!Auth.currentUser) return;
        
        // Load System Rules (global or user-level)
        db.collection('users').doc(Auth.currentUser.uid).get().then(doc => {
            if (doc.exists) {
                const settings = doc.data().settings || {};
                const feeToggle = document.getElementById('lateFeeToggle');
                const feeRate = document.getElementById('lateFeeRate');
                const feeGroup = document.getElementById('lateFeeGroup');
                if (feeToggle) feeToggle.checked = settings.lateFeeEnabled || false;
                if (feeRate) feeRate.value = settings.lateFeeRate || 0.5;
                if (feeGroup) feeGroup.style.display = settings.lateFeeEnabled ? 'block' : 'none';
                
                const bDrive = document.getElementById('backupDrivePath');
                if (bDrive) {
                    bDrive.value = settings.backupPath || 'F:\\';
                    // Only superadmin can edit
                    const isSuper = Auth.userRole === 'superadmin' || Auth.userRole === 'super_admin' || Auth.currentUser.email === SUPERUSER.email;
                    bDrive.disabled = !isSuper;
                }
            }
        });

        // Load Branch Profile
        App.loadBranchProfile();

        // Listeners for settings
        const branchForm = document.getElementById('branchSettingsForm');
        if (branchForm) {
            branchForm.addEventListener('submit', e => {
                e.preventDefault();
                App.saveBranchSettings();
            });
        }

        const sysBtn = document.getElementById('saveSystemSettings');
        if (sysBtn) sysBtn.addEventListener('click', () => App.saveSystemSettings());
    },

    async loadBranchProfile() {
        const bid = Branches.currentBranch;
        if (!bid) return;

        try {
            const doc = await db.collection('branches').doc(bid).get();
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('bsName').value = data.name || '';
                document.getElementById('bsAddress').value = data.address || '';
                document.getElementById('bsLicNo').value = data.licNo || '';
                document.getElementById('bsMobile').value = data.mobile || '';
                document.getElementById('bsGPay').value = data.gpay || '';
                
                if (data.logoUrl) document.getElementById('bsLogoPreview').innerHTML = `<img src="${data.logoUrl}" style="width:100%">`;
                if (data.qrUrl) document.getElementById('bsQRPreview').innerHTML = `<img src="${data.qrUrl}" style="width:100%">`;
                
                // If staff, disable inputs
                if (Auth.userRole === 'staff') {
                    document.querySelectorAll('#branchSettingsForm input, #branchSettingsForm textarea').forEach(el => el.disabled = true);
                }
            }
        } catch (err) { console.error('Load profile error:', err); }
    },

    async saveBranchSettings() {
        const bid = Branches.currentBranch;
        if (!bid) return App.toast('No branch selected', 'error');

        const btn = document.querySelector('#branchSettingsForm button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round">sync</span> Saving...';

        try {
            const data = {
                name: document.getElementById('bsName').value.trim(),
                address: document.getElementById('bsAddress').value.trim(),
                licNo: document.getElementById('bsLicNo').value.trim(),
                mobile: document.getElementById('bsMobile').value.trim(),
                gpay: document.getElementById('bsGPay').value.trim(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Logo to Base64
            const logoFile = document.getElementById('bsLogo').files[0];
            if (logoFile) {
                if (logoFile.size > 500000) return App.toast('Logo too large (max 500KB)', 'error');
                data.logoUrl = await App.fileToBase64(logoFile);
            }

            // QR to Base64
            const qrFile = document.getElementById('bsQR').files[0];
            if (qrFile) {
                if (qrFile.size > 500000) return App.toast('QR too large (max 500KB)', 'error');
                data.qrUrl = await App.fileToBase64(qrFile);
            }

            await db.collection('branches').doc(bid).update(data);
            App.toast('Branch profile updated!', 'success');
            App.loadBranchProfile();
        } catch (err) {
            App.toast('Error: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round">save</span> Save Branch Settings';
        }
    },

    async saveSystemSettings() {
        const btn = document.getElementById('saveSystemSettings');
        btn.disabled = true;
        try {
            const settings = {
                lateFeeEnabled: document.getElementById('lateFeeToggle').checked,
                lateFeeRate: parseFloat(document.getElementById('lateFeeRate').value),
                backupPath: document.getElementById('backupDrivePath') ? document.getElementById('backupDrivePath').value : 'F:\\',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(Auth.currentUser.uid).update({ settings });
            App.toast('System rules saved!', 'success');
        } catch (err) {
            App.toast('Error: ' + err.message, 'error');
        } finally { btn.disabled = false; }
    },

    // Schedule / Calendar
    currentCalMonth: new Date().getMonth(),
    currentCalYear: new Date().getFullYear(),

    initSchedule() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                document.getElementById('scheduleCalendar').style.display = tab === 'calendar' ? 'block' : 'none';
                document.getElementById('scheduleList').style.display = tab === 'list' ? 'block' : 'none';
                if (tab === 'calendar') App.renderCalendar();
                else App.renderScheduleList();
            });
        });
    },

    renderCalendar() {
        const el = document.getElementById('scheduleCalendar');
        const year = App.currentCalYear;
        const month = App.currentCalMonth;
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // Get dues for this month
        const dueMap = {};
        Loans.list.forEach(l => {
            if (l.status === 'closed' || !l.schedule) return;
            l.schedule.forEach(s => {
                if (s.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
                    if (!dueMap[s.date]) dueMap[s.date] = [];
                    dueMap[s.date].push({ ...s, loanId: l.id, customerId: l.customerId });
                }
            });
        });

        let html = `
            <div class="cal-header">
                <button class="btn btn-sm btn-outline" onclick="App.currentCalMonth--;if(App.currentCalMonth<0){App.currentCalMonth=11;App.currentCalYear--;}App.renderCalendar()">
                    <span class="material-icons-round">chevron_left</span>
                </button>
                <h3>${monthNames[month]} ${year}</h3>
                <button class="btn btn-sm btn-outline" onclick="App.currentCalMonth++;if(App.currentCalMonth>11){App.currentCalMonth=0;App.currentCalYear++;}App.renderCalendar()">
                    <span class="material-icons-round">chevron_right</span>
                </button>
            </div>
            <div class="cal-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
            <div class="cal-days">
        `;

        // Previous month's trailing days
        for (let i = 0; i < firstDay; i++) html += '<div class="cal-day other-month"></div>';

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const dues = dueMap[dateStr];
            let cls = 'cal-day';
            if (isToday) cls += ' today';
            if (dues) {
                const hasOverdue = dues.some(du => du.status === 'pending' && dateStr < todayStr);
                cls += hasOverdue ? ' has-overdue' : ' has-due';
            }
            html += `<div class="${cls}" title="${dues ? dues.length + ' due' : ''}">${d}</div>`;
        }

        html += '</div>';
        el.innerHTML = html;
    },

    renderScheduleList() {
        const el = document.getElementById('scheduleListBody');
        const today = new Date().toISOString().split('T')[0];
        const items = [];

        Loans.list.forEach(l => {
            if (l.status === 'closed' || !l.schedule) return;
            l.schedule.forEach(s => {
                if (s.status === 'pending') {
                    const cust = Customers.getById(l.customerId);
                    const isOverdue = s.date < today;
                    items.push({ date: s.date, name: cust ? cust.name : 'Unknown', amount: s.emi, loanId: l.id, isOverdue });
                }
            });
        });

        items.sort((a, b) => a.date.localeCompare(b.date));

        if (!items.length) {
            el.innerHTML = '<p class="empty-state">No pending EMIs</p>';
            return;
        }

        el.innerHTML = items.slice(0, 50).map(i => `
            <div class="schedule-item ${i.isOverdue ? 'overdue' : ''}" style="cursor:pointer" onclick="Loans.viewDetail('${i.loanId}')">
                <div class="date" ${i.isOverdue ? 'style="color:var(--red)"' : ''}>${i.date}</div>
                <div class="info"><p>${i.name}</p><small>${i.isOverdue ? 'OVERDUE' : 'Upcoming'}</small></div>
                <div class="amount" ${i.isOverdue ? 'style="color:var(--red)"' : ''}>₹${i.amount.toLocaleString('en-IN')}</div>
            </div>
        `).join('');
    },

    // Backup
    async backup(isAuto = false) {
        try {
            if (!isAuto) App.toast('Preparing backup...', 'info');
            const uid = Auth.currentUser.uid;
            const [custSnap, loanSnap, paySnap] = await Promise.all([
                db.collection('customers').where('userId', '==', uid).get(),
                db.collection('loans').where('userId', '==', uid).get(),
                db.collection('payments').where('userId', '==', uid).get()
            ]);
            const data = {
                exportDate: new Date().toISOString(),
                customers: custSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                loans: loanSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                payments: paySnap.docs.map(d => ({ id: d.id, ...d.data() }))
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const drive = (document.getElementById('backupDrivePath')?.value || 'F:').replace(/[:\\/]/g, '');
            a.download = `[DRIVE_${drive}]_lendflow_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            App.toast('Backup exported', 'success');
        } catch (err) {
            App.toast('Backup failed: ' + err.message, 'error');
        }
    },

    async restore(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!confirm('This will import data from the backup. Existing data will NOT be deleted. Continue?')) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const uid = Auth.currentUser.uid;
            const batch = db.batch();

            if (data.customers) {
                data.customers.forEach(c => {
                    const ref = db.collection('customers').doc();
                    const { id, ...rest } = c;
                    batch.set(ref, { ...rest, userId: uid });
                });
            }
            if (data.loans) {
                data.loans.forEach(l => {
                    const ref = db.collection('loans').doc();
                    const { id, ...rest } = l;
                    batch.set(ref, { ...rest, userId: uid });
                });
            }
            if (data.payments) {
                data.payments.forEach(p => {
                    const ref = db.collection('payments').doc();
                    const { id, ...rest } = p;
                    batch.set(ref, { ...rest, userId: uid });
                });
            }

            await batch.commit();
            App.toast('Data restored successfully', 'success');
        } catch (err) {
            App.toast('Restore failed: ' + err.message, 'error');
        }
        e.target.value = '';
    }
};
