// ===== REPORTS MODULE =====
const Reports = {
    init() {
        document.getElementById('genReportBtn').addEventListener('click', () => Reports.generate());
        document.getElementById('exportExcelBtn').addEventListener('click', () => Reports.exportExcel());
        document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
    },

    generate() {
        const type = document.getElementById('reportType').value;
        const date = document.getElementById('reportDate').value;
        const el = document.getElementById('reportOutput');

        if (type === 'daily') Reports.dailyReport(el, date);
        else if (type === 'monthly') Reports.monthlyReport(el, date);
        else Reports.customerReport(el);
    },

    dailyReport(el, date) {
        const dayPayments = Payments.list.filter(p => p.date === date);
        const total = dayPayments.reduce((s, p) => s + p.amount, 0);

        el.innerHTML = `
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
                <h3>Daily Collection — ${date}</h3>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-outline btn-sm" onclick="Reports.sendWhatsApp('${date}')" style="color:#25D366;border-color:#25D366">
                        <span class="material-icons-round">chat</span> WhatsApp
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="Reports.printCollectionReport('${date}')">
                        <span class="material-icons-round">print</span> Print Report
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
                    <div class="stat-card stat-green"><div class="stat-info"><h3>₹${total.toLocaleString('en-IN')}</h3><p>Total Collected</p></div></div>
                    <div class="stat-card stat-blue"><div class="stat-info"><h3>${dayPayments.length}</h3><p>Payments</p></div></div>
                </div>
                ${dayPayments.length ? `
                <table class="data-table"><thead><tr><th>Customer</th><th>Amount</th><th>Mode</th></tr></thead><tbody>
                ${dayPayments.map(p => {
            const loan = Loans.list.find(l => l.id === p.loanId);
            const cust = loan ? Customers.getById(loan.customerId) : null;
            return `<tr><td>${cust ? cust.name : 'Unknown'}</td><td>₹${p.amount.toLocaleString('en-IN')}</td><td>${p.mode}</td></tr>`;
        }).join('')}
                </tbody></table>` : '<p class="empty-state">No collections on this date</p>'}
            </div>
        `;
    },

    async printCollectionReport(date) {
        const dayPayments = Payments.list.filter(p => p.date === date);
        if (!dayPayments.length) {
            App.toast('No data to print', 'info');
            return;
        }

        // Get Branch Profile
        const branchId = dayPayments[0].branchId || Branches.currentBranch;
        let profile = null;
        const profileStr = localStorage.getItem('branch_profile_' + branchId);
        if (profileStr) {
            profile = JSON.parse(profileStr);
        } else {
            try {
                const doc = await db.collection('branches').doc(branchId).get();
                if (doc.exists) profile = doc.data();
            } catch (e) { }
        }
        if (!profile) profile = { name: 'LendFlow', address: 'Financial Services', mobile: '', gpay: '', licNo: '' };

        // Calculations
        let cashTotal = 0, upiTotal = 0, bankTotal = 0;
        dayPayments.forEach(p => {
            const m = p.mode.toLowerCase();
            if (m === 'cash') cashTotal += p.amount;
            else if (m === 'upi') upiTotal += p.amount;
            else bankTotal += p.amount;
        });

        const overdueCount = Loans.list.filter(l => l.status === 'overdue').length;
        let missedCount = 0;
        Loans.list.filter(l => l.status === 'active').forEach(l => {
            if (l.schedule) {
                const missed = l.schedule.some(s => s.status === 'pending' && s.date < date);
                if (missed) missedCount++;
            }
        });

        const printArea = document.getElementById('printArea');
        printArea.innerHTML = `
            <style>
                @page { size: A5; margin: 0; }
                @media print {
                    body { visibility: hidden; }
                    #printArea, #printArea * { visibility: visible; }
                    #printArea { position: absolute; left: 0; top: 0; width: 148mm; height: 210mm; }
                }
                .report-page {
                    font-family: 'Courier New', Courier, monospace;
                    width: 148mm;
                    height: 210mm;
                    padding: 10mm;
                    box-sizing: border-box;
                    color: #000;
                    background: #fff;
                    line-height: 1.2;
                }
                .double-line { border-top: 3px double #000; margin: 8px 0; }
                .single-line { border-top: 1px solid #000; margin: 8px 0; }
                .row { display: flex; justify-content: space-between; margin: 4px 0; }
                .report-table { width: 100%; border-collapse: collapse; font-size: 10px; margin: 8px 0; }
                .report-table th, .report-table td { border: 1px solid #000; padding: 4px; text-align: left; }
                .report-table th { background: #f0f0f0; }
                .section-header { font-weight: bold; text-transform: uppercase; font-size: 13px; margin: 10px 0 5px; text-decoration: underline; }
            </style>
            <div class="report-page">
                <div class="double-line"></div>
                
                <!-- CENTERED HEADER -->
                <div style="text-align: center; margin-bottom: 5px;">
                    ${profile.logoUrl ? `<img src="${profile.logoUrl}" style="max-height: 50px; margin-bottom: 5px;">` : ''}
                    <h1 style="margin: 0; font-size: 22px; font-weight: 900; text-transform: uppercase;">${profile.name}</h1>
                    <p style="margin: 2px 0; font-size: 12px; font-weight: bold;">Phone: ${profile.mobile}</p>
                </div>

                <div class="double-line"></div>
                
                <div style="text-align: center; font-weight: 900; font-size: 16px; letter-spacing: 3px; margin: 8px 0;">DAILY COLLECTION REPORT</div>
                
                <div class="row" style="font-size: 11px; font-weight: bold;">
                    <div>Date : ${date}</div>
                    <div>Generated On : ${new Date().toLocaleDateString('en-IN')}</div>
                </div>
                <div class="row" style="font-size: 11px; font-weight: bold;">
                    <div>Collector : ${Auth.currentUser?.displayName || 'Admin'}</div>
                </div>
                
                <div class="single-line"></div>
                
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width:25px">S.#</th>
                            <th>Customer Name</th>
                            <th>Loan ID</th>
                            <th>Amount</th>
                            <th>Mode</th>
                            <th>Type</th>
                            <th>Next Due</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dayPayments.map((p, idx) => {
            const loan = Loans.list.find(l => l.id === p.loanId);
            const cust = loan ? Customers.getById(loan.customerId) : null;
            const nextDue = loan?.schedule?.find(s => s.status === 'pending')?.date || 'CLOSED';
            return `<tr>
                                <td>${idx + 1}</td>
                                <td>${cust ? cust.name : 'Unknown'}</td>
                                <td>#${p.loanId.slice(-6).toUpperCase()}</td>
                                <td>₹${p.amount.toLocaleString('en-IN')}</td>
                                <td>${p.mode}</td>
                                <td>${p.amount >= (loan?.emiAmount || 0) ? 'EMI' : 'PART'}</td>
                                <td>${nextDue}</td>
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
                
                <div class="single-line"></div>
                
                <div class="row" style="font-weight: 900; font-size: 13px;">
                    <div>TOTAL COLLECTION : ₹${(cashTotal + upiTotal + bankTotal).toLocaleString('en-IN')}</div>
                </div>
                <div class="row" style="font-size: 11px; margin-top: 4px;">
                    <div>Cash Total : ₹${cashTotal.toLocaleString('en-IN')}</div>
                    <div>UPI Total  : ₹${upiTotal.toLocaleString('en-IN')}</div>
                    <div>Bank Total : ₹${bankTotal.toLocaleString('en-IN')}</div>
                </div>
                
                <div class="single-line"></div>
                
                <div class="section-header">PERFORMANCE SUMMARY</div>
                <div class="row" style="font-size: 11px;">
                    <div>Total Entries   : ${dayPayments.length}</div>
                    <div>Missed Payments : ${missedCount}</div>
                    <div>Overdue Loans   : ${overdueCount}</div>
                </div>
                
                <div class="single-line"></div>
                
                <div style="font-size: 10px; min-height: 12mm;">
                    <strong style="text-decoration: underline;">NOTES:</strong><br>
                    Daily financial reconciliation for branch collections on ${date}.
                </div>
                
                <div class="single-line"></div>
                
                <div style="display: flex; justify-content: space-between; margin-top: 35px; font-size: 11px; font-weight: bold;">
                    <div style="text-align: center;">_______________________<br>Prepared By</div>
                    <div style="text-align: center;">_______________________<br>Verified By</div>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <div style="font-size: 15px; font-weight: 900; letter-spacing: 5px;">*** END OF REPORT ***</div>
                </div>
                <div class="double-line"></div>
            </div>
        `;
        printArea.style.display = 'block';
        window.print();
        setTimeout(() => printArea.style.display = 'none', 1000);
    },

    monthlyReport(el, date) {
        const month = date.substring(0, 7); // YYYY-MM
        const monthPayments = Payments.list.filter(p => p.date.startsWith(month));
        const totalCollected = monthPayments.reduce((s, p) => s + p.amount, 0);
        const loansCreated = Loans.list.filter(l => l.startDate && l.startDate.startsWith(month));
        const totalLent = loansCreated.reduce((s, l) => s + l.amount, 0);
        const profit = totalCollected - totalLent;

        el.innerHTML = `
            <div class="card-header"><h3>Monthly Report — ${month}</h3></div>
            <div class="card-body">
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px">
                    <div class="stat-card stat-blue"><div class="stat-info"><h3>₹${totalLent.toLocaleString('en-IN')}</h3><p>Lent Out</p></div></div>
                    <div class="stat-card stat-green"><div class="stat-info"><h3>₹${totalCollected.toLocaleString('en-IN')}</h3><p>Collected</p></div></div>
                    <div class="stat-card ${profit >= 0 ? 'stat-purple' : 'stat-red'}"><div class="stat-info"><h3>₹${profit.toLocaleString('en-IN')}</h3><p>Profit/Loss</p></div></div>
                    <div class="stat-card stat-orange"><div class="stat-info"><h3>${monthPayments.length}</h3><p>Payments</p></div></div>
                </div>
            </div>
        `;
    },

    customerReport(el) {
        const custData = Customers.list.map(c => {
            const custLoans = Loans.list.filter(l => l.customerId === c.id);
            const totalBorrowed = custLoans.reduce((s, l) => s + l.amount, 0);
            const totalPaid = custLoans.reduce((s, l) => s + (l.totalPaid || 0), 0);
            const balance = custLoans.reduce((s, l) => s + (l.remainingBalance || 0), 0);
            const active = custLoans.filter(l => l.status === 'active').length;
            return { name: c.name, phone: c.phone, totalBorrowed, totalPaid, balance, active, loans: custLoans.length };
        }).filter(c => c.loans > 0);

        el.innerHTML = `
            <div class="card-header"><h3>Customer-wise Report</h3></div>
            <div class="card-body">
                ${custData.length ? `
                <table class="data-table"><thead><tr>
                    <th>Customer</th><th>Loans</th><th>Borrowed</th><th>Paid</th><th>Balance</th><th>Active</th>
                </tr></thead><tbody>
                ${custData.map(c => `<tr>
                    <td><strong>${c.name}</strong><br><small>${c.phone || ''}</small></td>
                    <td>${c.loans}</td>
                    <td>₹${c.totalBorrowed.toLocaleString('en-IN')}</td>
                    <td>₹${c.totalPaid.toLocaleString('en-IN')}</td>
                    <td>₹${c.balance.toLocaleString('en-IN')}</td>
                    <td>${c.active}</td>
                </tr>`).join('')}
                </tbody></table>` : '<p class="empty-state">No customer data available</p>'}
            </div>
        `;
    },



    exportExcel() {
        const type = document.getElementById('reportType').value;
        const date = document.getElementById('reportDate').value;
        const month = date.substring(0, 7);

        let filteredPayments = [];
        if (type === 'daily') filteredPayments = Payments.list.filter(p => p.date === date);
        else if (type === 'monthly') filteredPayments = Payments.list.filter(p => p.date.startsWith(month));
        else {
            App.toast('Please select Daily or Monthly report for full export', 'info');
            return;
        }

        if (!filteredPayments.length) {
            App.toast('No transactions found to export', 'info');
            return;
        }

        const headers = [
            "S.NO", "DATE", "CUSTOMER NAME", "PHONE", "LOAN ID",
            "LOAN AMOUNT", "INTEREST RATE (%)", "EMI AMOUNT", "AMOUNT PAID",
            "INTEREST PAID", "PRINCIPAL PAID", "TOTAL PAID TILL DATE",
            "REMAINING BALANCE", "PAYMENT MODE", "PAYMENT TYPE",
            "NEXT DUE DATE", "STATUS", "NOTES"
        ];

        const rows = filteredPayments.map((p, idx) => {
            const loan = Loans.list.find(l => l.id === p.loanId);
            const cust = loan ? Customers.getById(loan.customerId) : null;

            // Calculate Split
            let intPaid = 0, prinPaid = 0;
            if (loan && loan.interestType === 'flat') {
                const totalInterest = (loan.amount * loan.interestRate / 100) * (loan.duration / (loan.frequency === 'monthly' ? 1 : loan.frequency === 'weekly' ? 4 : 30));
                const emiInt = totalInterest / loan.duration;
                intPaid = Math.min(p.amount, Math.round(emiInt));
                prinPaid = p.amount - intPaid;
            } else {
                prinPaid = p.amount;
            }

            const nextDue = loan?.schedule?.find(s => s.status === 'pending')?.date || 'N/A';
            const scheduled = loan?.schedule?.find(s => s.date >= p.date)?.date || p.date;
            const status = p.date <= scheduled ? 'On Time' : 'Overdue';

            return [
                idx + 1,
                p.date,
                cust ? cust.name : 'Unknown',
                cust ? cust.phone : 'N/A',
                `#${p.loanId.slice(-8).toUpperCase()}`,
                loan ? loan.amount : 0,
                loan ? loan.interestRate : 0,
                loan ? (loan.emiAmount || 0) : 0,
                p.amount,
                intPaid,
                prinPaid,
                loan ? (loan.totalPaid || 0) : 0,
                loan ? (loan.remainingBalance || 0) : 0,
                p.mode,
                p.amount >= (loan?.emiAmount || 0) ? 'EMI' : 'Partial',
                nextDue,
                status,
                (p.notes || '').replace(/"/g, '""')
            ];
        });

        let csvContent = headers.join(",") + "\n";
        rows.forEach(row => {
            csvContent += row.map(val => `"${val}"`).join(",") + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `LendFlow_Export_${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        App.toast('Excel Export Successful', 'success');
    },

    sendWhatsApp(date) {
        const dayPayments = Payments.list.filter(p => p.date === date);
        if (!dayPayments.length) {
            App.toast('No data to send', 'info');
            return;
        }

        const branchId = dayPayments[0].branchId || Branches.currentBranch;
        const profileStr = localStorage.getItem('branch_profile_' + branchId);
        const profile = profileStr ? JSON.parse(profileStr) : { name: 'LendFlow' };

        let cash = 0, upi = 0, bank = 0;
        dayPayments.forEach(p => {
            const m = p.mode.toLowerCase();
            if (m === 'cash') cash += p.amount;
            else if (m === 'upi') upi += p.amount;
            else bank += p.amount;
        });

        const total = cash + upi + bank;

        const message = `*DAILY COLLECTION REPORT - ${profile.name.toUpperCase()}*%0A%0A` +
            `📅 *Date:* ${date}%0A%0A` +
            `💰 *Total Collection:* ₹${total.toLocaleString('en-IN')}%0A` +
            `--------------------------%0A` +
            `💵 *Cash:* ₹${cash.toLocaleString('en-IN')}%0A` +
            `📱 *UPI:* ₹${upi.toLocaleString('en-IN')}%0A` +
            `🏦 *Bank:* ₹${bank.toLocaleString('en-IN')}%0A` +
            `--------------------------%0A` +
            `✅ *Total Entries:* ${dayPayments.length}%0A%0A` +
            `_Reported by ${Auth.currentUser?.displayName || 'Admin'}_`;

        const phone = prompt("Enter WhatsApp number to send report (with country code, e.g., 91XXXXXXXXXX):", "91");
        if (phone && phone.length > 5) {
            const waUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${message}`;
            window.open(waUrl, '_blank');
        }
    }
};
