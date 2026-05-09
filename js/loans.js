// ===== LOAN MANAGEMENT MODULE =====
const Loans = {
    list: [],
    unsubscribe: null,

    init() {
        document.getElementById('addLoanBtn').addEventListener('click', () => Loans.showForm());
        document.getElementById('loanSearch').addEventListener('input', e => Loans.filter());
        document.getElementById('loanStatusFilter').addEventListener('change', () => Loans.filter());

        // Event delegation for table action buttons
        document.getElementById('loanTableBody').addEventListener('click', e => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'view') Loans.viewDetail(id);
            else if (action === 'pay') Payments.showForm(id);
            else if (action === 'edit') Loans.showForm(id);
            else if (action === 'close') Loans.closeLoan(id);
            else if (action === 'remove') Loans.removeLoan(id);
        });

        Loans.listen();
    },

    listen() {
        if (Loans.unsubscribe) Loans.unsubscribe();
        
        const isOwner = Auth.userRole === 'superadmin' || Auth.userRole === 'super_admin' || Auth.currentUser?.email === SUPERUSER.email;
        const ownerId = Branches.currentOwnerId || (isOwner ? Auth.currentUser?.uid : null);
        const branchId = Branches.currentBranch;

        console.log(`Loans.listen triggered. Role: ${Auth.userRole}, Owner: ${ownerId}, Branch: ${branchId}`);

        if (!ownerId) return;

        let query = db.collection('loans').where('ownerId', '==', ownerId);

        Loans.unsubscribe = query.onSnapshot(snap => {
            let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Filter by branch locally
            if (branchId) {
                list = list.filter(item => item.branchId === branchId);
            }

            Loans.list = list;
            Loans.list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            Loans.render();
            Customers.render();
            Dashboard.refresh();
        }, err => {
            console.error('Loans listener error:', err);
        });
    },

    render(data) {
        const list = data || Loans.list;
        const tbody = document.getElementById('loanTableBody');
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No loans found.</td></tr>';
            return;
        }

        const isManager = Auth.userRole === 'superadmin' || 
                         Auth.userRole === 'super_admin' || 
                         Auth.userRole === 'branch_admin' || 
                         Auth.currentUser?.email === SUPERUSER.email;

        tbody.innerHTML = list.map(l => {
            const cust = Customers.getById(l.customerId);
            const statusClass = l.status === 'active' ? 'badge-active' : l.status === 'overdue' ? 'badge-overdue' : 'badge-closed';
            return `<tr>
                <td><strong>${cust ? cust.name : 'Unknown'}</strong></td>
                <td>₹${l.amount.toLocaleString('en-IN')}</td>
                <td>${l.type === 'interest' ? 'Interest' : 'EMI'}</td>
                <td><span class="badge ${statusClass}">${l.status.toUpperCase()}</span></td>
                <td>₹${(l.remainingBalance || 0).toLocaleString('en-IN')}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline" data-action="view" data-id="${l.id}" title="View"><span class="material-icons-round">visibility</span></button>
                    <button class="btn btn-sm btn-outline" data-action="pay" data-id="${l.id}" title="Payment"><span class="material-icons-round">payments</span></button>
                    ${l.status !== 'closed' ? `<button class="btn btn-sm btn-outline" data-action="close" data-id="${l.id}" title="Close Loan" style="color:var(--green)"><span class="material-icons-round">check_circle</span></button>` : ''}
                    ${isManager ? `<button class="btn btn-sm btn-outline" data-action="edit" data-id="${l.id}" title="Edit"><span class="material-icons-round">edit</span></button>` : ''}
                    ${isManager ? `<button class="btn btn-sm btn-danger" data-action="remove" data-id="${l.id}" title="Delete" ${l.status === 'closed' ? 'disabled' : ''}><span class="material-icons-round">delete</span></button>` : ''}
                </td>
            </tr>`;
        }).join('');
    },

    filter() {
        const q = document.getElementById('loanSearch').value.toLowerCase();
        const status = document.getElementById('loanStatusFilter').value;
        let filtered = Loans.list;
        if (status !== 'all') filtered = filtered.filter(l => l.status === status);
        if (q) filtered = filtered.filter(l => {
            const cust = Customers.getById(l.customerId);
            return cust && cust.name.toLowerCase().includes(q);
        });
        Loans.render(filtered);
    },

    // Calculate EMI
    calcEMI(amount, rate, duration, frequency, interestType) {
        let totalPayments;
        if (frequency === 'daily') totalPayments = duration;
        else if (frequency === 'weekly') totalPayments = duration;
        else totalPayments = duration;

        if (interestType === 'flat') {
            const totalInterest = (amount * rate * duration) / 100;
            const total = amount + totalInterest;
            return { emi: Math.ceil(total / totalPayments), totalInterest, totalPayable: total };
        } else {
            // Reducing balance
            const periodicRate = rate / 100;
            if (periodicRate === 0) return { emi: Math.ceil(amount / totalPayments), totalInterest: 0, totalPayable: amount };
            const emi = Math.ceil(amount * periodicRate * Math.pow(1 + periodicRate, totalPayments) / (Math.pow(1 + periodicRate, totalPayments) - 1));
            const totalPayable = emi * totalPayments;
            return { emi, totalInterest: totalPayable - amount, totalPayable };
        }
    },

    calcEndDate(startDate, duration, frequency) {
        const d = new Date(startDate);
        if (frequency === 'daily') d.setDate(d.getDate() + duration);
        else if (frequency === 'weekly') d.setDate(d.getDate() + duration * 7);
        else d.setMonth(d.getMonth() + duration);
        return d.toISOString().split('T')[0];
    },

    showForm(id) {
        const l = id ? Loans.list.find(x => x.id === id) : null;
        const title = l ? 'Edit Loan' : 'Create New Loan';
        const custOptions = Customers.list.map(c =>
            `<option value="${c.id}" ${l && l.customerId === c.id ? 'selected' : ''}>${c.name} (${c.phone || 'No phone'})</option>`
        ).join('');
        const today = new Date().toISOString().split('T')[0];

        App.openModal(title, `
            <form id="loanForm">
                <div class="form-group">
                    <label>Customer *</label>
                    <select class="form-select" id="lfCustomer" required>${custOptions}</select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Loan Amount (₹) *</label>
                        <input type="number" class="form-input" id="lfAmount" required min="1" value="${l ? l.amount : ''}">
                    </div>
                    <div class="form-group">
                        <label>Interest Rate (%) *</label>
                        <input type="number" class="form-input" id="lfRate" required min="0" step="0.1" value="${l ? l.interestRate : ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Interest Type</label>
                        <select class="form-select" id="lfInterestType">
                            <option value="flat" ${l && l.interestType === 'flat' ? 'selected' : ''}>Flat Interest</option>
                            <option value="reducing" ${l && l.interestType === 'reducing' ? 'selected' : ''}>Reducing Balance</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Payment Frequency</label>
                        <select class="form-select" id="lfFrequency">
                            <option value="daily" ${l && l.frequency === 'daily' ? 'selected' : ''}>Daily</option>
                            <option value="weekly" ${l && l.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                            <option value="monthly" ${l && l.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Duration (number of payments) *</label>
                        <input type="number" class="form-input" id="lfDuration" required min="1" value="${l ? l.duration : ''}">
                    </div>
                    <div class="form-group">
                        <label>Start Date *</label>
                        <input type="date" class="form-input" id="lfStartDate" required value="${l ? l.startDate : today}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>End Date (auto)</label>
                        <input type="date" class="form-input" id="lfEndDate" readonly value="${l ? l.endDate : ''}">
                    </div>
                    <div class="form-group">
                        <label>EMI Amount (auto)</label>
                        <input type="number" class="form-input" id="lfEMI" value="${l ? l.emiAmount : ''}" placeholder="Auto-calculated">
                    </div>
                </div>
                <div id="loanCalcPreview" style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:16px;font-size:13px;display:none"></div>
                <button type="submit" class="btn btn-primary btn-block">
                    <span class="material-icons-round">${l ? 'save' : 'add_card'}</span> ${l ? 'Update' : 'Create'} Loan
                </button>
            </form>
        `);

        // Auto-calc on input change
        const recalc = () => {
            const amount = parseFloat(document.getElementById('lfAmount').value);
            const rate = parseFloat(document.getElementById('lfRate').value);
            const duration = parseInt(document.getElementById('lfDuration').value);
            const freq = document.getElementById('lfFrequency').value;
            const type = document.getElementById('lfInterestType').value;
            const startDate = document.getElementById('lfStartDate').value;
            if (amount && rate >= 0 && duration && startDate) {
                const calc = Loans.calcEMI(amount, rate, duration, freq, type);
                document.getElementById('lfEMI').value = calc.emi;
                document.getElementById('lfEndDate').value = Loans.calcEndDate(startDate, duration, freq);
                const preview = document.getElementById('loanCalcPreview');
                preview.style.display = 'block';
                preview.innerHTML = `<strong>Summary:</strong> EMI: ₹${calc.emi.toLocaleString('en-IN')} | Total Interest: ₹${Math.round(calc.totalInterest).toLocaleString('en-IN')} | Total Payable: ₹${Math.round(calc.totalPayable).toLocaleString('en-IN')}`;
            }
        };
        ['lfAmount', 'lfRate', 'lfDuration', 'lfFrequency', 'lfInterestType', 'lfStartDate'].forEach(id => {
            document.getElementById(id).addEventListener('input', recalc);
            document.getElementById(id).addEventListener('change', recalc);
        });
        recalc();

        document.getElementById('loanForm').addEventListener('submit', async e => {
            e.preventDefault();
            await Loans.save(id);
        });
    },

    showFormForCustomer(customerId) {
        Loans.showForm();
        setTimeout(() => {
            const sel = document.getElementById('lfCustomer');
            if (sel) sel.value = customerId;
        }, 100);
    },

    async save(id) {
        const amount = parseFloat(document.getElementById('lfAmount').value);
        const rate = parseFloat(document.getElementById('lfRate').value);
        const duration = parseInt(document.getElementById('lfDuration').value);
        const freq = document.getElementById('lfFrequency').value;
        const type = document.getElementById('lfInterestType').value;
        const startDate = document.getElementById('lfStartDate').value;
        const calc = Loans.calcEMI(amount, rate, duration, freq, type);

        const data = {
            customerId: document.getElementById('lfCustomer').value,
            amount, interestRate: rate, interestType: type,
            frequency: freq, duration, startDate,
            endDate: Loans.calcEndDate(startDate, duration, freq),
            emiAmount: parseFloat(document.getElementById('lfEMI').value) || calc.emi,
            totalInterest: Math.round(calc.totalInterest),
            totalPayable: Math.round(calc.totalPayable),
            remainingBalance: id ? undefined : Math.round(calc.totalPayable),
            totalPaid: id ? undefined : 0,
            emiCount: parseInt(document.getElementById('lfEmiCount')?.value || 0),
            userId: Auth.currentUser.uid,
            ownerId: Branches.currentOwnerId || (Auth.currentUser?.email === SUPERUSER.email ? Auth.currentUser.uid : null),
            branchId: Branches.currentBranch || '',
            status: 'active',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        // Remove undefined fields
        Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

        try {
            if (id) {
                await db.collection('loans').doc(id).update(data);
                App.toast('Loan updated', 'success');
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                data.remainingBalance = Math.round(calc.totalPayable);
                data.totalPaid = 0;
                // Generate EMI schedule
                data.schedule = Loans.generateSchedule(amount, rate, duration, freq, type, startDate, calc.emi);
                const docRef = await db.collection('loans').add(data);
                App.toast('Loan created', 'success');
                // Automatically print issue receipt
                Loans.printIssueReceipt(docRef.id);
            }
            App.closeModal();
        } catch (err) {
            App.toast('Error: ' + err.message, 'error');
        }
    },

    generateSchedule(amount, rate, duration, freq, type, startDate, emi) {
        const schedule = [];
        let balance = amount;
        const d = new Date(startDate);
        for (let i = 1; i <= duration; i++) {
            if (freq === 'daily') d.setDate(d.getDate() + 1);
            else if (freq === 'weekly') d.setDate(d.getDate() + 7);
            else d.setMonth(d.getMonth() + 1);

            let interest, principal;
            if (type === 'flat') {
                interest = Math.round((amount * rate) / 100);
                principal = emi - interest;
            } else {
                interest = Math.round(balance * rate / 100);
                principal = emi - interest;
            }
            balance = Math.max(0, balance - principal);
            schedule.push({
                installment: i,
                date: d.toISOString().split('T')[0],
                emi, interest, principal,
                balance: Math.round(balance),
                status: 'pending'
            });
        }
        return schedule;
    },

    viewDetail(id) {
        const l = Loans.list.find(x => x.id === id);
        if (!l) return;
        const cust = Customers.getById(l.customerId);
        const loanPayments = Payments.list.filter(p => p.loanId === id);
        const paidAmount = loanPayments.reduce((s, p) => s + p.amount, 0);

        let scheduleHtml = '';
        if (l.schedule && l.schedule.length) {
            scheduleHtml = `<h4 style="margin:16px 0 8px">EMI Schedule</h4>
            <div class="table-responsive"><table class="data-table"><thead><tr>
                <th>#</th><th>Date</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Balance</th><th>Status</th>
            </tr></thead><tbody>
            ${l.schedule.map(s => {
                const today = new Date().toISOString().split('T')[0];
                const isPaid = s.status === 'paid';
                const isOverdue = !isPaid && s.date < today;
                const cls = isPaid ? 'badge-closed' : isOverdue ? 'badge-overdue' : 'badge-active';
                const label = isPaid ? 'Paid' : isOverdue ? 'Overdue' : 'Pending';
                return `<tr><td>${s.installment}</td><td>${s.date}</td><td>₹${s.emi.toLocaleString('en-IN')}</td>
                    <td>₹${s.principal.toLocaleString('en-IN')}</td><td>₹${s.interest.toLocaleString('en-IN')}</td>
                    <td>₹${s.balance.toLocaleString('en-IN')}</td><td><span class="badge ${cls}">${label}</span></td></tr>`;
            }).join('')}
            </tbody></table></div>`;
        }

        let paymentsHtml = '';
        if (loanPayments.length) {
            paymentsHtml = `<h4 style="margin:16px 0 8px">Payment History</h4>
            <div class="table-responsive"><table class="data-table"><thead><tr>
                <th>Date</th><th>Amount</th><th>Mode</th>
            </tr></thead><tbody>
            ${loanPayments.map(p => `<tr><td>${p.date}</td><td>₹${p.amount.toLocaleString('en-IN')}</td><td>${p.mode}</td></tr>`).join('')}
            </tbody></table></div>`;
        }

        App.openModal(`Loan Details — ${cust ? cust.name : 'Unknown'}`, `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                <div><small style="color:var(--text-secondary)">Loan Amount</small><p style="font-size:18px;font-weight:700">₹${l.amount.toLocaleString('en-IN')}</p></div>
                <div><small style="color:var(--text-secondary)">Interest</small><p style="font-size:18px;font-weight:700">${l.interestRate}% ${l.interestType === 'flat' ? 'Flat' : 'Reducing'}</p></div>
                <div><small style="color:var(--text-secondary)">EMI</small><p style="font-weight:600">₹${(l.emiAmount || 0).toLocaleString('en-IN')} / ${l.frequency}</p></div>
                <div><small style="color:var(--text-secondary)">Duration</small><p style="font-weight:600">${l.duration} ${l.frequency === 'daily' ? 'days' : l.frequency === 'weekly' ? 'weeks' : 'months'}</p></div>
                <div><small style="color:var(--text-secondary)">Total Payable</small><p style="font-weight:600">₹${(l.totalPayable || 0).toLocaleString('en-IN')}</p></div>
                <div><small style="color:var(--text-secondary)">Remaining</small><p style="font-weight:600;color:var(--red)">₹${(l.remainingBalance || 0).toLocaleString('en-IN')}</p></div>
                <div><small style="color:var(--text-secondary)">Start</small><p style="font-weight:600">${l.startDate}</p></div>
                <div><small style="color:var(--text-secondary)">End</small><p style="font-weight:600">${l.endDate}</p></div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:16px">
                <button class="btn btn-primary btn-sm" onclick="Payments.showForm('${id}')"><span class="material-icons-round">payments</span> Record Payment</button>
                <button class="btn btn-outline btn-sm" onclick="Loans.printReceipt('${id}')"><span class="material-icons-round">print</span> Receipt</button>
                ${l.status === 'active' ? `<button class="btn btn-success btn-sm" onclick="Loans.closeLoan('${id}')"><span class="material-icons-round">check_circle</span> Close Loan</button>` : ''}
            </div>
            ${scheduleHtml}
            ${paymentsHtml}
        `);
    },

    async closeLoan(id) {
        const l = Loans.list.find(x => x.id === id);
        if (!l) return;
        const cust = Customers.getById(l.customerId);
        const balance = l.remainingBalance || 0;
        const today = new Date().toISOString().split('T')[0];

        App.openModal(`Close Loan Settlement — ${cust ? cust.name : 'Unknown'}`, `
            <div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:16px">
                <div class="row"><small>Total Payable</small><strong>₹${(l.totalPayable || 0).toLocaleString('en-IN')}</strong></div>
                <div class="row"><small>Total Paid So Far</small><strong>₹${(l.totalPaid || 0).toLocaleString('en-IN')}</strong></div>
                <div class="single-line" style="margin:8px 0"></div>
                <div class="row" style="font-size:16px"><small>Pending Balance</small><strong style="color:var(--red)">₹${balance.toLocaleString('en-IN')}</strong></div>
            </div>
            
            ${balance > 0 ? `<p style="font-size:13px;margin-bottom:12px;color:var(--text-secondary)">Loan has a pending balance. Record the final payment to close.</p>` : `<p style="color:var(--green);font-weight:bold;margin-bottom:12px">Loan is fully paid and ready to close!</p>`}
            
            <form id="settlementForm">
                <div class="form-group">
                    <label>Final Settlement Amount</label>
                    <input type="number" class="form-input" id="sfAmount" value="${balance}" ${balance === 0 ? 'readonly' : ''} required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Payment Mode</label>
                        <select class="form-select" id="sfMode">
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="Bank">Bank Transfer</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" class="form-input" id="sfDate" value="${today}" required>
                    </div>
                </div>
                <div class="form-group">
                    <label>Closure Notes</label>
                    <textarea class="form-input" id="sfNotes" rows="2" placeholder="e.g. Full and final settlement"></textarea>
                </div>
                <button type="submit" class="btn btn-success btn-block" style="margin-top:10px">
                    <span class="material-icons-round">check_circle</span> CONFIRM SETTLEMENT & CLOSE
                </button>
            </form>
        `);

        document.getElementById('settlementForm').addEventListener('submit', async e => {
            e.preventDefault();
            const finalAmount = parseFloat(document.getElementById('sfAmount').value);
            const finalMode = document.getElementById('sfMode').value;
            const finalDate = document.getElementById('sfDate').value;
            const finalNotes = document.getElementById('sfNotes').value;

            if (finalAmount < balance) {
                if (!confirm(`Warning: Settlement amount ₹${finalAmount} is less than the remaining balance ₹${balance}. Close anyway?`)) return;
            }

            try {
                // 1. Record Final Payment if > 0
                if (finalAmount > 0) {
                    await db.collection('payments').add({
                        loanId: id, amount: finalAmount, date: finalDate, mode: finalMode,
                        notes: 'Final Settlement: ' + finalNotes,
                        ownerId: l.ownerId, branchId: l.branchId,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }

                // 2. Update Loan Status
                const newTotalPaid = (l.totalPaid || 0) + finalAmount;
                const newBalance = Math.max(0, (l.totalPayable || 0) - newTotalPaid);
                
                await db.collection('loans').doc(id).update({
                    status: 'closed',
                    closedDate: finalDate,
                    totalPaid: newTotalPaid,
                    remainingBalance: newBalance,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                App.toast('Loan closed successfully', 'success');
                App.closeModal();
                
                // 3. Print Closure Receipt
                setTimeout(() => Loans.printClosureReceipt(id), 500);

            } catch (err) {
                App.toast('Error closing loan: ' + err.message, 'error');
            }
        });
    },

    async printClosureReceipt(id) {
        const l = Loans.list.find(x => x.id === id);
        if (!l) return;
        const cust = Customers.getById(l.customerId);
        
        // Get Branch Profile
        const branchId = l.branchId || Branches.currentBranch;
        let profile = null;
        const profileStr = localStorage.getItem('branch_profile_' + branchId);
        if (profileStr) profile = JSON.parse(profileStr);
        else {
            try {
                const doc = await db.collection('branches').doc(branchId).get();
                if (doc.exists) profile = doc.data();
            } catch (e) {}
        }
        if (!profile) profile = { name: 'LendFlow', address: 'Financial Services', mobile: '' };

        const printArea = document.getElementById('printArea');
        printArea.innerHTML = `
            <style>
                @page { size: A5; margin: 5mm; }
                @media print {
                    body { visibility: hidden; }
                    #printArea, #printArea * { visibility: visible; }
                    #printArea { position: absolute; left: 0; top: 0; width: 148mm; height: 210mm; }
                }
                .closure-page { font-family: 'Courier New', Courier, monospace; width: 148mm; padding: 10mm; box-sizing: border-box; color: #000; background: #fff; line-height: 1.4; border: 2px solid #000; }
                .double-line { border-top: 3px double #000; margin: 8px 0; }
                .single-line { border-top: 1px solid #000; margin: 8px 0; }
                .row { display: flex; justify-content: space-between; margin: 6px 0; }
            </style>
            <div class="closure-page">
                <div style="text-align: center;">
                    ${profile.logoUrl ? `<img src="${profile.logoUrl}" style="max-height: 50px;">` : ''}
                    <h1 style="margin: 0; font-size: 22px;">${profile.name}</h1>
                    <p style="margin: 2px 0;">${profile.address}</p>
                    <p style="margin: 2px 0; font-weight: bold;">Phone: ${profile.mobile}</p>
                </div>
                <div class="double-line"></div>
                <h2 style="text-align: center; text-decoration: underline; margin: 10px 0;">LOAN CLOSURE RECEIPT</h2>
                <div class="row"><strong>Loan ID :</strong> #${l.id.slice(-8).toUpperCase()}</div>
                <div class="row"><strong>Closure Date :</strong> ${l.closedDate || new Date().toLocaleDateString('en-IN')}</div>
                <div class="single-line"></div>
                <div class="row"><span>Borrower Name</span>: <strong>${cust ? cust.name : 'Unknown'}</strong></div>
                <div class="row"><span>Phone Number</span>: ${cust ? cust.phone : 'N/A'}</div>
                <div class="single-line"></div>
                <div class="row"><span>Total Loan Amount</span>: ₹${l.amount.toLocaleString('en-IN')}</div>
                <div class="row"><span>Interest Charged</span>: ₹${(l.totalInterest || 0).toLocaleString('en-IN')}</div>
                <div class="row"><span>Total Payable</span>: ₹${(l.totalPayable || 0).toLocaleString('en-IN')}</div>
                <div class="single-line"></div>
                <div class="row" style="font-size: 18px; font-weight: 900;">
                    <span>TOTAL PAID</span>: ₹${(l.totalPaid || 0).toLocaleString('en-IN')}
                </div>
                <div class="row" style="color: #008000; font-weight: 900; font-size: 20px; text-align: center; display: block; margin-top: 15px;">
                    *** FULLY SETTLED & CLOSED ***
                </div>
                <div class="single-line" style="margin-top: 20px;"></div>
                <div style="display: flex; justify-content: space-between; margin-top: 30px; font-weight: bold;">
                    <div style="text-align: center;">_______________________<br>Authorized Sign</div>
                    <div style="text-align: center;">_______________________<br>Borrower Sign</div>
                </div>
                <div style="text-align: center; margin-top: 20px; font-size: 11px;">
                    This document serves as permanent proof that the mentioned loan has been fully paid and the account is officially closed.
                </div>
                <div class="double-line"></div>
            </div>
        `;
        printArea.style.display = 'block';
        window.print();
        setTimeout(() => printArea.style.display = 'none', 1000);
    },

    async removeLoan(id) {
        if (!confirm('Delete this loan and all its payments?')) return;
        try {
            const payments = await db.collection('payments').where('loanId', '==', id).get();
            const batch = db.batch();
            payments.docs.forEach(p => batch.delete(p.ref));
            batch.delete(db.collection('loans').doc(id));
            await batch.commit();
            App.toast('Loan deleted', 'success');
        } catch (err) {
            console.error('Delete loan error:', err);
            App.toast('Error: ' + err.message, 'error');
        }
    },

    async printIssueReceipt(id) {
        let l = Loans.list.find(x => x.id === id);
        if (!l) {
            try {
                const doc = await db.collection('loans').doc(id).get();
                if (doc.exists) l = { id: doc.id, ...doc.data() };
            } catch (e) {}
        }
        if (!l) return;
        const cust = Customers.getById(l.customerId);
        const branchId = l.branchId || Branches.currentBranch;
        let profile = null;
        const profileStr = localStorage.getItem('branch_profile_' + branchId);
        if (profileStr) profile = JSON.parse(profileStr);
        else {
            try {
                const branchDoc = await db.collection('branches').doc(branchId).get();
                if (branchDoc.exists) profile = branchDoc.data();
            } catch (e) {}
        }
        if (!profile) profile = { name: 'LendFlow', address: 'Financial Services', mobile: '', gpay: '', licNo: '' };
        const printArea = document.getElementById('printArea');
        printArea.innerHTML = `
            <style>
                @page { size: A5; margin: 5mm; }
                @media print {
                    body { visibility: hidden; }
                    #printArea, #printArea * { visibility: visible; }
                    #printArea { position: absolute; left: 0; top: 0; width: 148mm; height: 210mm; }
                }
                .receipt-page { font-family: 'Courier New', Courier, monospace; width: 148mm; height: 210mm; padding: 10mm; box-sizing: border-box; color: #000; background: #fff; line-height: 1.2; }
                .double-line { border-top: 3px double #000; margin: 8px 0; }
                .single-line { border-top: 1px solid #000; margin: 8px 0; }
                .row { display: flex; justify-content: space-between; margin: 5px 0; }
                .section-header { font-weight: bold; text-transform: uppercase; font-size: 14px; margin-bottom: 5px; text-decoration: underline; }
                .data-item { font-size: 12px; margin: 3px 0; }
                .label { display: inline-block; width: 150px; }
            </style>
            <div class="receipt-page">
                <div class="double-line"></div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    ${profile.logoUrl ? `<img src="${profile.logoUrl}" style="max-height: 45px; max-width: 120px;">` : '<div style="width:120px"></div>'}
                    <div style="text-align: center; flex: 1;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 900;">${profile.name}</h1>
                        <p style="margin: 2px 0; font-size: 11px;">${profile.address}</p>
                    </div>
                    <div style="text-align: right; width: 120px; font-size: 12px; font-weight: bold;">Phone:<br>${profile.mobile}</div>
                </div>
                <div class="double-line"></div>
                <div style="text-align: center; font-weight: 900; font-size: 16px; letter-spacing: 2px; margin: 10px 0;">NEW LOAN ISSUE RECEIPT</div>
                <div class="row" style="font-weight: bold; font-size: 13px;">
                    <div>Loan ID : #${l.id.slice(-8).toUpperCase()}</div>
                    <div>Date : ${l.startDate}</div>
                </div>
                <div class="single-line"></div>
                <div class="section-header">BORROWER DETAILS</div>
                <div class="data-item"><span class="label">Name</span>: ${cust ? cust.name : 'N/A'}</div>
                <div class="data-item"><span class="label">Phone</span>: ${cust ? cust.phone : 'N/A'}</div>
                <div class="data-item"><span class="label">Address</span>: ${cust ? (cust.address || 'N/A') : 'N/A'}</div>
                <div class="data-item"><span class="label">ID Proof</span>: ${cust ? (cust.idProof || 'Verified') : 'Verified'}</div>
                <div class="single-line"></div>
                <div class="section-header">LOAN DETAILS</div>
                <div class="row">
                    <div style="width: 50%;">
                        <div class="data-item"><span class="label" style="width: 120px;">Loan Amount</span>: ₹${l.amount.toLocaleString('en-IN')}</div>
                        <div class="data-item"><span class="label" style="width: 120px;">Interest Rate</span>: ${l.interestRate}%</div>
                        <div class="data-item"><span class="label" style="width: 120px;">Interest Type</span>: ${l.interestType.toUpperCase()}</div>
                    </div>
                    <div style="width: 50%;">
                        <div class="data-item"><span class="label" style="width: 120px;">Duration</span>: ${l.duration} ${l.frequency.replace('ly', 's')}</div>
                        <div class="data-item"><span class="label" style="width: 120px;">Frequency</span>: ${l.frequency.toUpperCase()}</div>
                    </div>
                </div>
                <div class="data-item" style="margin-top:5px;"><span class="label">Start / End Date</span>: ${l.startDate} to ${l.endDate}</div>
                <div class="single-line"></div>
                <div class="section-header">REPAYMENT DETAILS</div>
                <div class="row">
                    <div style="width: 50%;">
                        <div class="data-item"><span class="label" style="width: 120px;">EMI Amount</span>: <strong>₹${(l.emiAmount || 0).toLocaleString('en-IN')}</strong></div>
                        <div class="data-item"><span class="label" style="width: 120px;">Total Interest</span>: ₹${(l.totalInterest || 0).toLocaleString('en-IN')}</div>
                    </div>
                    <div style="width: 50%;">
                        <div class="data-item"><span class="label" style="width: 120px;">Total Payable</span>: ₹${(l.totalPayable || 0).toLocaleString('en-IN')}</div>
                        <div class="data-item"><span class="label" style="width: 120px;">Next Due Date</span>: ${l.schedule?.[0]?.date || 'N/A'}</div>
                    </div>
                </div>
                <div class="single-line"></div>
                <div class="section-header">TERMS & CONDITIONS</div>
                <div style="font-size: 10px; line-height: 1.4;">
                    1. Borrower agrees to repay as per schedule.<br>
                    2. Delay may result in penalty / additional interest.<br>
                    3. This receipt is proof of loan issued.
                </div>
                <div class="single-line"></div>
                <div style="display: flex; justify-content: space-between; margin-top: 25px; font-size: 12px; font-weight: bold;">
                    <div style="text-align: center;">_______________________<br>Lender Sign</div>
                    <div style="text-align: center;">_______________________<br>Borrower Sign</div>
                </div>
                <div style="margin-top: 15px; font-size: 11px;"><strong>NOTE:</strong> ${l.notes || 'N/A'}</div>
                <div style="text-align: center; margin-top: 20px;">
                    <div style="font-size: 16px; font-weight: 900; letter-spacing: 5px;">*** THANK YOU ***</div>
                </div>
                <div class="double-line"></div>
            </div>
        `;
        printArea.style.display = 'block';
        window.print();
        setTimeout(() => printArea.style.display = 'none', 1000);
    },

    async printReceipt(id) {
        const l = Loans.list.find(x => x.id === id);
        if (!l) return;
        const cust = Customers.getById(l.customerId);
        
        // Get Branch Profile
        const branchId = l.branchId || Branches.currentBranch;
        let profile = null;
        const profileStr = localStorage.getItem('branch_profile_' + branchId);
        if (profileStr) {
            profile = JSON.parse(profileStr);
        } else {
            try {
                const doc = await db.collection('branches').doc(branchId).get();
                if (doc.exists) profile = doc.data();
            } catch (e) { console.warn('Branch fetch failed', e); }
        }
        if (!profile) profile = { name: 'LendFlow', address: 'Financial Services', mobile: '', gpay: '', licNo: '' };

        // Calculations from schedule
        let interestPaid = 0;
        let principalPaid = 0;
        let pendingInterest = 0;
        let missedCount = 0;
        const today = new Date().toISOString().split('T')[0];

        if (l.schedule) {
            l.schedule.forEach(s => {
                if (s.status === 'paid') {
                    interestPaid += (s.interest || 0);
                    principalPaid += (s.principal || 0);
                } else {
                    pendingInterest += (s.interest || 0);
                    if (s.date < today) missedCount++;
                }
            });
        }

        const nextDue = l.schedule ? (l.schedule.find(s => s.status === 'pending')?.date || 'CLOSED') : 'N/A';

        const printArea = document.getElementById('printArea');
        printArea.innerHTML = `
            <style>
                @page { size: A5; margin: 5mm; }
                @media print {
                    body { visibility: hidden; }
                    #printArea, #printArea * { visibility: visible; }
                    #printArea { position: absolute; left: 0; top: 0; width: 148mm; height: 210mm; }
                }
                .receipt-page { font-family: 'Courier New', Courier, monospace; width: 148mm; height: 210mm; padding: 10mm; box-sizing: border-box; color: #000; background: #fff; line-height: 1.3; }
                .double-line { border-top: 3px double #000; margin: 8px 0; }
                .single-line { border-top: 1px solid #000; margin: 8px 0; }
                .dashed-line { border-top: 1px dashed #666; margin: 8px 0; }
                .row { display: flex; justify-content: space-between; margin: 5px 0; }
                .section-header { font-weight: bold; text-transform: uppercase; font-size: 14px; margin-bottom: 5px; text-decoration: underline; }
                .data-item { font-size: 12px; margin: 3px 0; }
                .label { display: inline-block; width: 160px; }
            </style>
            <div class="receipt-page">
                <div class="double-line"></div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    ${profile.logoUrl ? `<img src="${profile.logoUrl}" style="max-height: 45px; max-width: 120px;">` : '<div style="width:120px"></div>'}
                    <div style="text-align: center; flex: 1;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 900;">${profile.name}</h1>
                        <p style="margin: 2px 0; font-size: 11px;">${profile.address}</p>
                    </div>
                    <div style="text-align: right; width: 120px; font-size: 12px; font-weight: bold;">Phone:<br>${profile.mobile}</div>
                </div>
                <div class="double-line"></div>
                
                <div style="text-align: center; font-weight: 900; font-size: 16px; letter-spacing: 2px; margin: 8px 0;">LOAN DETAILS RECEIPT</div>
                
                <div class="row" style="font-weight: bold; font-size: 13px;">
                    <div>Loan ID : #${l.id.slice(-8).toUpperCase()}</div>
                    <div>Date : ${new Date().toLocaleDateString('en-IN')}</div>
                </div>
                
                <div class="single-line"></div>
                
                <div class="section-header">BORROWER DETAILS</div>
                <div class="data-item"><span class="label">Name</span>: ${cust ? cust.name : 'N/A'}</div>
                <div class="data-item"><span class="label">Phone</span>: ${cust ? cust.phone : 'N/A'}</div>
                <div class="data-item"><span class="label">Address</span>: ${cust ? (cust.address || 'N/A') : 'N/A'}</div>
                
                <div class="dashed-line"></div>
                
                <div class="section-header">LOAN INFORMATION</div>
                <div class="data-item"><span class="label">Loan Amount</span>: ₹${l.amount.toLocaleString('en-IN')}</div>
                <div class="data-item"><span class="label">Interest Rate</span>: ${l.interestRate}% (${l.interestType.toUpperCase()})</div>
                <div class="row">
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:100px">Start Date</span>: ${l.startDate}</div></div>
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:100px">End Date</span>: ${l.endDate}</div></div>
                </div>
                <div class="data-item"><span class="label">Duration</span>: ${l.duration} ${l.frequency.replace('ly', 's')}</div>
                
                <div class="dashed-line"></div>
                
                <div class="section-header">PAYMENT STATUS</div>
                <div class="row">
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:120px">Total Paid</span>: ₹${(l.totalPaid || 0).toLocaleString('en-IN')}</div></div>
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:120px">Remaining</span>: <strong>₹${(l.remainingBalance || 0).toLocaleString('en-IN')}</strong></div></div>
                </div>
                <div class="row">
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:120px">Principal Paid</span>: ₹${Math.round(principalPaid).toLocaleString('en-IN')}</div></div>
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:120px">Interest Paid</span>: ₹${Math.round(interestPaid).toLocaleString('en-IN')}</div></div>
                </div>
                <div class="data-item"><span class="label">Pending Interest</span>: ₹${Math.round(pendingInterest).toLocaleString('en-IN')}</div>
                
                <div class="dashed-line"></div>
                
                <div class="section-header">SCHEDULE DETAILS</div>
                <div class="row">
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:120px">EMI Amount</span>: ₹${(l.emiAmount || 0).toLocaleString('en-IN')}</div></div>
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:120px">Frequency</span>: ${l.frequency.toUpperCase()}</div></div>
                </div>
                <div class="row">
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:120px">Next Due Date</span>: <strong>${nextDue}</strong></div></div>
                    <div style="width:50%"><div class="data-item"><span class="label" style="width:120px;color:red">Missed Count</span>: ${missedCount}</div></div>
                </div>
                
                <div class="single-line"></div>
                
                <div style="font-size: 11px; min-height: 12mm;">
                    <strong>NOTES:</strong> ${l.notes || 'N/A'}
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-top: 25px; font-size: 12px; font-weight: bold;">
                    <div style="text-align: center;">_______________________<br>Verified By</div>
                    <div style="text-align: center;">_______________________<br>Customer Sign</div>
                </div>
                
                <div style="text-align: center; margin-top: 20px;">
                    <div style="font-size: 16px; font-weight: 900; letter-spacing: 5px;">*** THANK YOU ***</div>
                </div>
                <div class="double-line"></div>
            </div>
        `;
        printArea.style.display = 'block';
        window.print();
        setTimeout(() => printArea.style.display = 'none', 1000);
    }
};
