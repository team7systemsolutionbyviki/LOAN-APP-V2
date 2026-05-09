// ===== PAYMENT TRACKING MODULE =====
const Payments = {
    list: [],
    unsubscribe: null,

    init() {
        document.getElementById('addPaymentBtn').addEventListener('click', () => Payments.showForm());
        document.getElementById('paymentSearch').addEventListener('input', e => Payments.filter(e.target.value));

        // Event delegation for table action buttons
        document.getElementById('paymentTableBody').addEventListener('click', e => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'receipt') Payments.printReceipt(id);
            else if (action === 'whatsapp') Payments.sendWhatsApp(id);
            else if (action === 'remove') Payments.removePayment(id);
        });

        Payments.listen();
    },

    listen() {
        if (Payments.unsubscribe) Payments.unsubscribe();
        
        const isOwner = Auth.userRole === 'superadmin' || Auth.userRole === 'super_admin' || Auth.currentUser?.email === SUPERUSER.email;
        const ownerId = Branches.currentOwnerId || (isOwner ? Auth.currentUser?.uid : null);
        const branchId = Branches.currentBranch;

        console.log(`Payments.listen triggered. Role: ${Auth.userRole}, Owner: ${ownerId}, Branch: ${branchId}`);

        if (!ownerId) return;

        let query = db.collection('payments').where('ownerId', '==', ownerId);

        Payments.unsubscribe = query.onSnapshot(snap => {
            let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Filter by branch locally
            if (branchId) {
                list = list.filter(item => item.branchId === branchId);
            }

            Payments.list = list;
            Payments.list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            Payments.render();
            Dashboard.refresh();
        }, err => {
            console.error('Payments listener error:', err);
        });
    },

    render(data) {
        const list = data || Payments.list;
        const tbody = document.getElementById('paymentTableBody');
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No payments recorded yet.</td></tr>';
            return;
        }

        const isManager = Auth.userRole === 'superadmin' || 
                         Auth.userRole === 'super_admin' || 
                         Auth.userRole === 'branch_admin' || 
                         Auth.currentUser?.email === SUPERUSER.email;
        
        tbody.innerHTML = list.map(p => {
            const loan = Loans.list.find(l => l.id === p.loanId);
            const cust = loan ? Customers.getById(loan.customerId) : null;
            return `<tr>
                <td>${p.date}</td>
                <td>${cust ? cust.name : 'Unknown'}</td>
                <td>₹${loan ? loan.amount.toLocaleString('en-IN') : '—'}</td>
                <td><strong>₹${p.amount.toLocaleString('en-IN')}</strong></td>
                <td>${p.mode}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline" data-action="receipt" data-id="${p.id}" title="Receipt"><span class="material-icons-round">print</span></button>
                    <button class="btn btn-sm btn-outline" data-action="whatsapp" data-id="${p.id}" title="WhatsApp" style="color:#25D366"><span class="material-icons-round">chat</span></button>
                    ${isManager ? `<button class="btn btn-sm btn-danger" data-action="remove" data-id="${p.id}" title="Delete"><span class="material-icons-round">delete</span></button>` : ''}
                </td>
            </tr>`;
        }).join('');
    },

    filter(q) {
        if (!q) { Payments.render(); return; }
        q = q.toLowerCase();
        Payments.render(Payments.list.filter(p => {
            const loan = Loans.list.find(l => l.id === p.loanId);
            const cust = loan ? Customers.getById(loan.customerId) : null;
            return (cust && cust.name.toLowerCase().includes(q)) || p.date.includes(q) || p.mode.toLowerCase().includes(q);
        }));
    },

    showForm(loanId) {
        const activeLoans = Loans.list.filter(l => l.status === 'active' || l.status === 'overdue');
        const loanOptions = activeLoans.map(l => {
            const cust = Customers.getById(l.customerId);
            return `<option value="${l.id}" ${loanId === l.id ? 'selected' : ''}>${cust ? cust.name : 'Unknown'} — ₹${l.amount.toLocaleString('en-IN')} (Bal: ₹${(l.remainingBalance || 0).toLocaleString('en-IN')})</option>`;
        }).join('');
        const today = new Date().toISOString().split('T')[0];

        App.openModal('Record Payment', `
            <form id="paymentForm">
                <div class="form-group">
                    <label>Select Loan *</label>
                    <select class="form-select" id="pfLoan" required>${loanOptions}</select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Amount (₹) *</label>
                        <input type="number" class="form-input" id="pfAmount" required min="1">
                    </div>
                    <div class="form-group">
                        <label>Date *</label>
                        <input type="date" class="form-input" id="pfDate" required value="${today}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Payment Mode</label>
                    <select class="form-select" id="pfMode">
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Reference #</label>
                    <input type="text" class="form-input" id="pfReference" placeholder="e.g. Transaction ID">
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <input type="text" class="form-input" id="pfNotes" placeholder="Optional">
                </div>
                <div id="paymentPreview" style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:16px;font-size:13px"></div>
                <button type="submit" class="btn btn-primary btn-block">
                    <span class="material-icons-round">payments</span> Record Payment
                </button>
            </form>
        `);

        // Show loan info on select
        const updatePreview = () => {
            const loan = Loans.list.find(l => l.id === document.getElementById('pfLoan').value);
            if (loan) {
                document.getElementById('pfAmount').value = loan.emiAmount || '';
                document.getElementById('paymentPreview').innerHTML =
                    `<strong>EMI:</strong> ₹${(loan.emiAmount || 0).toLocaleString('en-IN')} | <strong>Balance:</strong> ₹${(loan.remainingBalance || 0).toLocaleString('en-IN')}`;
            }
        };
        document.getElementById('pfLoan').addEventListener('change', updatePreview);
        updatePreview();

        document.getElementById('paymentForm').addEventListener('submit', async e => {
            e.preventDefault();
            await Payments.save();
        });
    },

    async save() {
        const loanId = document.getElementById('pfLoan').value;
        const amount = parseFloat(document.getElementById('pfAmount').value);
        const date = document.getElementById('pfDate').value;
        const mode = document.getElementById('pfMode').value;
        const notes = document.getElementById('pfNotes').value.trim();

        try {
            // Save payment
            await db.collection('payments').add({
                loanId, amount, date, mode, notes,
                reference: document.getElementById('pfReference').value.trim(),
                ownerId: Branches.currentOwnerId || (Auth.currentUser?.email === SUPERUSER.email ? Auth.currentUser.uid : null),
                branchId: Branches.currentBranch || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update loan balance
            const loan = Loans.list.find(l => l.id === loanId);
            if (loan) {
                const newPaid = (loan.totalPaid || 0) + amount;
                const newBalance = Math.max(0, (loan.totalPayable || loan.amount) - newPaid);
                const updateData = {
                    totalPaid: newPaid,
                    remainingBalance: newBalance,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                // Auto-close if fully paid
                if (newBalance <= 0) updateData.status = 'closed';

                // Update schedule - mark next pending as paid
                if (loan.schedule) {
                    const schedule = [...loan.schedule];
                    const nextPending = schedule.find(s => s.status === 'pending');
                    if (nextPending) nextPending.status = 'paid';
                    updateData.schedule = schedule;
                }

                await db.collection('loans').doc(loanId).update(updateData);
            }

            App.toast('Payment recorded', 'success');
            App.closeModal();
        } catch (err) {
            App.toast('Error: ' + err.message, 'error');
        }
    },

    async removePayment(id) {
        if (!confirm('Delete this payment? Loan balance will be recalculated.')) return;
        try {
            const payment = Payments.list.find(p => p.id === id);
            if (payment) {
                const loan = Loans.list.find(l => l.id === payment.loanId);
                if (loan) {
                    const newPaid = Math.max(0, (loan.totalPaid || 0) - payment.amount);
                    const newBalance = (loan.totalPayable || loan.amount) - newPaid;
                    await db.collection('loans').doc(payment.loanId).update({
                        totalPaid: newPaid, remainingBalance: newBalance,
                        status: newBalance > 0 ? 'active' : 'closed',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
            await db.collection('payments').doc(id).delete();
            App.toast('Payment deleted', 'success');
        } catch (err) {
            App.toast('Error: ' + err.message, 'error');
        }
    },

    async printReceipt(id) {
        const p = Payments.list.find(x => x.id === id);
        if (!p) return;
        const loan = Loans.list.find(l => l.id === p.loanId);
        const cust = loan ? Customers.getById(loan.customerId) : null;
        
        // Get Branch Profile
        const branchId = p.branchId || Branches.currentBranch;
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

        // Calculate next due date
        let nextDue = 'N/A';
        if (loan && loan.schedule) {
            const next = loan.schedule.find(s => s.status === 'pending');
            if (next) nextDue = next.date;
        }

        // Calculate breakdown for flat interest
        let interestPaid = 0;
        let principalPaid = 0;
        if (loan && loan.interestType === 'flat') {
            const totalInterest = (loan.amount * loan.interestRate / 100) * (loan.duration / (loan.frequency === 'monthly' ? 1 : loan.frequency === 'weekly' ? 4 : 30));
            const emiInterest = totalInterest / loan.duration;
            interestPaid = Math.min(p.amount, Math.round(emiInterest));
            principalPaid = p.amount - interestPaid;
        } else {
            principalPaid = p.amount;
        }

        const printArea = document.getElementById('printArea');
        printArea.innerHTML = `
            <style>
                @page { size: A5; margin: 5mm; }
                @media print {
                    body { visibility: hidden; }
                    #printArea, #printArea * { visibility: visible; }
                    #printArea { position: absolute; left: 0; top: 0; width: 148mm; height: 210mm; }
                }
                .receipt-page {
                    font-family: 'Courier New', Courier, monospace;
                    width: 148mm;
                    height: 210mm;
                    padding: 15mm 10mm;
                    box-sizing: border-box;
                    color: #000;
                    background: #fff;
                    line-height: 1.2;
                }
                .double-line { border-top: 3px double #000; margin: 10px 0; }
                .single-line { border-top: 1px solid #000; margin: 10px 0; }
                .dashed-line { border-top: 1px dashed #666; margin: 10px 0; }
                .row { display: flex; justify-content: space-between; margin: 5px 0; }
                .col { width: 48%; }
                .v-sep { border-left: 1px solid #000; padding-left: 15px; }
                .section-header { font-weight: bold; text-transform: uppercase; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #000; display: inline-block; }
                .data-item { font-size: 12px; margin: 4px 0; display: flex; }
                .label { min-width: 100px; }
            </style>
            <div class="receipt-page">
                <div class="double-line"></div>
                
                <!-- HEADER -->
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
                    ${profile.logoUrl ? `<img src="${profile.logoUrl}" style="max-height: 45px; max-width: 120px; object-fit: contain;">` : '<div style="width:120px"></div>'}
                    <div style="text-align: center; flex: 1;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 900;">${profile.name}</h1>
                        <p style="margin: 2px 0; font-size: 11px;">${profile.address}</p>
                    </div>
                    <div style="text-align: right; width: 120px; font-size: 12px; font-weight: bold;">
                        Phone:<br>${profile.mobile}
                    </div>
                </div>

                <div class="double-line"></div>

                <div class="row" style="font-weight: bold; font-size: 13px;">
                    <div>RECEIPT NO : #${p.id.slice(-8).toUpperCase()}</div>
                    <div>DATE : ${p.date}</div>
                </div>

                <div class="single-line"></div>

                <!-- SECTION 1: CUSTOMER | LOAN -->
                <div class="row">
                    <div class="col">
                        <span class="section-header">CUSTOMER DETAILS</span>
                        <div class="data-item"><span class="label">Name</span>: ${cust ? cust.name : 'N/A'}</div>
                        <div class="data-item"><span class="label">Phone</span>: ${cust ? cust.phone : 'N/A'}</div>
                        <div class="data-item"><span class="label">Address</span>: ${cust ? (cust.address || 'N/A') : 'N/A'}</div>
                    </div>
                    <div class="col v-sep">
                        <span class="section-header">LOAN DETAILS</span>
                        <div class="data-item"><span class="label">Loan ID</span>: #${loan ? loan.id.slice(-8).toUpperCase() : 'N/A'}</div>
                        <div class="data-item"><span class="label">Amount</span>: ₹${loan ? loan.amount.toLocaleString('en-IN') : 'N/A'}</div>
                        <div class="data-item"><span class="label">Interest</span>: ${loan ? loan.interestRate : 'N/A'}%</div>
                        <div class="data-item"><span class="label">Start Date</span>: ${loan ? (loan.startDate || 'N/A') : 'N/A'}</div>
                    </div>
                </div>

                <div class="dashed-line"></div>

                <!-- SECTION 2: PAYMENT | BREAKDOWN -->
                <div class="row">
                    <div class="col">
                        <span class="section-header">PAYMENT DETAILS</span>
                        <div class="data-item"><span class="label">Paid Amount</span>: <strong style="font-size: 14px;">₹${p.amount.toLocaleString('en-IN')}</strong></div>
                        <div class="data-item"><span class="label">Mode</span>: ${p.mode}</div>
                        <div class="data-item"><span class="label">Type</span>: ${p.amount >= (loan?.emiAmount || 0) ? 'EMI' : 'PARTIAL'}</div>
                    </div>
                    <div class="col v-sep">
                        <span class="section-header">BREAKDOWN</span>
                        <div class="data-item"><span class="label">Interest Paid</span>: ₹${interestPaid.toLocaleString('en-IN')}</div>
                        <div class="data-item"><span class="label">Principal Pd</span>: ₹${principalPaid.toLocaleString('en-IN')}</div>
                    </div>
                </div>

                <div class="dashed-line"></div>

                <!-- SECTION 3: BALANCE -->
                <span class="section-header">BALANCE DETAILS</span>
                <div class="row" style="margin-top: 5px;">
                    <div class="col">
                        <div class="data-item"><span class="label">Total Paid</span>: ₹${loan ? (loan.totalPaid || 0).toLocaleString('en-IN') : 'N/A'}</div>
                        <div class="data-item"><span class="label">Next Due</span>: <strong>${nextDue}</strong></div>
                    </div>
                    <div class="col">
                        <div class="data-item" style="font-size: 14px;"><span class="label">Remaining</span>: <strong style="color:#000">₹${loan ? (loan.remainingBalance || 0).toLocaleString('en-IN') : 'N/A'}</strong></div>
                    </div>
                </div>

                <div class="single-line"></div>

                <div style="font-size: 11px; min-height: 15mm;">
                    <strong style="text-decoration: underline;">NOTES:</strong><br>
                    ${p.notes || 'No additional notes provided.'}
                </div>

                <div class="single-line"></div>

                <div style="display: flex; justify-content: space-between; margin-top: 30px; font-size: 12px; font-weight: bold;">
                    <div style="text-align: center;">_______________________<br>Received By</div>
                    <div style="text-align: center;">_______________________<br>Customer Sign</div>
                </div>

                <div style="text-align: center; margin-top: 25px;">
                    <div style="font-size: 16px; font-weight: 900; letter-spacing: 5px;">*** THANK YOU ***</div>
                </div>

                <div class="double-line"></div>
            </div>
        `;
        printArea.style.display = 'block';
        window.print();
        setTimeout(() => printArea.style.display = 'none', 1000);
    },

    async sendWhatsApp(id) {
        const p = Payments.list.find(x => x.id === id);
        if (!p) return;
        const loan = Loans.list.find(l => l.id === p.loanId);
        const cust = Customers.getById(loan?.customerId);
        if (!cust || !cust.phone) {
            App.toast('Customer phone number missing', 'error');
            return;
        }

        // Get Profile (Async fetch if missing)
        const branchId = p.branchId || Branches.currentBranch;
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
        if (!profile) profile = { name: 'LendFlow' };

        const nextDue = loan?.schedule?.find(s => s.status === 'pending')?.date || 'N/A';

        const message = `*PAYMENT RECEIPT - ${profile.name.toUpperCase()}*%0A%0A` +
            `Dear *${cust.name}*,%0A` +
            `We have received your payment.%0A%0A` +
            `💰 *Amount:* ₹${p.amount.toLocaleString('en-IN')}%0A` +
            `📅 *Date:* ${p.date}%0A` +
            `💳 *Mode:* ${p.mode}%0A` +
            `🔖 *Receipt:* #${p.id.slice(-8).toUpperCase()}%0A%0A` +
            `📉 *Remaining Balance:* ₹${(loan?.remainingBalance || 0).toLocaleString('en-IN')}%0A` +
            `⏳ *Next Due Date:* ${nextDue}%0A%0A` +
            `Thank you for your business!%0A` +
            `_Generated via ${profile.name}_`;

        const waUrl = `https://wa.me/91${cust.phone.replace(/\D/g, '')}?text=${message}`;
        window.open(waUrl, '_blank');
    }
};
