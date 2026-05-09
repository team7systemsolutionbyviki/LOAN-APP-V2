// ===== DASHBOARD & ANALYTICS MODULE =====
const Dashboard = {
    refresh() {
        const loans = Loans.list;
        const payments = Payments.list;
        const today = new Date().toISOString().split('T')[0];

        // Stats
        const totalGiven = loans.reduce((s, l) => s + l.amount, 0);
        const totalCollected = loans.reduce((s, l) => s + (l.totalPaid || 0), 0);
        const totalInterestEarned = payments.reduce((s, p) => s + p.amount, 0) - loans.filter(l => l.totalPaid > 0).reduce((s, l) => s + Math.min(l.totalPaid || 0, l.amount), 0);
        const pending = loans.filter(l => l.status !== 'closed').reduce((s, l) => s + (l.remainingBalance || 0), 0);

        // Check overdue
        let overdueCount = 0;
        loans.forEach(l => {
            if (l.status === 'closed') return;
            if (l.endDate && l.endDate < today && l.remainingBalance > 0) {
                overdueCount++;
                if (l.status !== 'overdue') {
                    db.collection('loans').doc(l.id).update({ status: 'overdue' });
                }
            } else if (l.schedule) {
                const hasOverdue = l.schedule.some(s => s.status === 'pending' && s.date < today);
                if (hasOverdue && l.status !== 'overdue') {
                    overdueCount++;
                }
            }
        });

        document.getElementById('statTotalGiven').textContent = '₹' + totalGiven.toLocaleString('en-IN');
        document.getElementById('statTotalCollected').textContent = '₹' + totalCollected.toLocaleString('en-IN');
        document.getElementById('statInterestEarned').textContent = '₹' + Math.max(0, totalInterestEarned).toLocaleString('en-IN');
        document.getElementById('statPending').textContent = '₹' + pending.toLocaleString('en-IN');
        document.getElementById('statOverdue').textContent = overdueCount;
        document.getElementById('statCustomers').textContent = Customers.list.length;

        // Upcoming Dues (next 7 days)
        Dashboard.renderUpcoming(today);
        Dashboard.renderOverdue(today);
        Dashboard.renderRecent();
        Dashboard.updateNotifications(today);
    },

    renderUpcoming(today) {
        const el = document.getElementById('upcomingDues');
        const upcoming = [];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        Loans.list.forEach(l => {
            if (l.status === 'closed') return;
            if (l.schedule) {
                l.schedule.forEach(s => {
                    if (s.status === 'pending' && s.date >= today && s.date <= nextWeekStr) {
                        const cust = Customers.getById(l.customerId);
                        upcoming.push({ date: s.date, name: cust ? cust.name : 'Unknown', amount: s.emi, loanId: l.id });
                    }
                });
            }
        });

        if (!upcoming.length) {
            el.innerHTML = '<p class="empty-state">No upcoming dues in next 7 days</p>';
            return;
        }
        upcoming.sort((a, b) => a.date.localeCompare(b.date));
        el.innerHTML = upcoming.slice(0, 10).map(u => `
            <div class="schedule-item" style="cursor:pointer" onclick="Loans.viewDetail('${u.loanId}')">
                <div class="date">${u.date}</div>
                <div class="info"><p>${u.name}</p></div>
                <div class="amount">₹${u.amount.toLocaleString('en-IN')}</div>
            </div>
        `).join('');
    },

    renderOverdue(today) {
        const el = document.getElementById('overduePayments');
        const overdue = [];
        Loans.list.forEach(l => {
            if (l.status === 'closed') return;
            if (l.schedule) {
                l.schedule.forEach(s => {
                    if (s.status === 'pending' && s.date < today) {
                        const cust = Customers.getById(l.customerId);
                        overdue.push({ date: s.date, name: cust ? cust.name : 'Unknown', amount: s.emi, loanId: l.id });
                    }
                });
            }
        });

        if (!overdue.length) {
            el.innerHTML = '<p class="empty-state">No overdue payments 🎉</p>';
            return;
        }
        overdue.sort((a, b) => a.date.localeCompare(b.date));
        el.innerHTML = overdue.slice(0, 10).map(o => `
            <div class="schedule-item overdue" style="cursor:pointer" onclick="Loans.viewDetail('${o.loanId}')">
                <div class="date" style="color:var(--red)">${o.date}</div>
                <div class="info"><p>${o.name}</p></div>
                <div class="amount" style="color:var(--red)">₹${o.amount.toLocaleString('en-IN')}</div>
            </div>
        `).join('');
    },

    renderRecent() {
        const el = document.getElementById('recentPayments');
        const recent = Payments.list.slice(0, 10);
        if (!recent.length) {
            el.innerHTML = '<p class="empty-state">No recent payments</p>';
            return;
        }
        el.innerHTML = recent.map(p => {
            const loan = Loans.list.find(l => l.id === p.loanId);
            const cust = loan ? Customers.getById(loan.customerId) : null;
            return `<div class="schedule-item">
                <div class="date">${p.date}</div>
                <div class="info"><p>${cust ? cust.name : 'Unknown'}</p><small>${p.mode}</small></div>
                <div class="amount" style="color:var(--green)">₹${p.amount.toLocaleString('en-IN')}</div>
            </div>`;
        }).join('');
    },

    updateNotifications(today) {
        const notifs = [];
        // Due today
        Loans.list.forEach(l => {
            if (l.status === 'closed') return;
            if (l.schedule) {
                l.schedule.forEach(s => {
                    if (s.status === 'pending' && s.date === today) {
                        const cust = Customers.getById(l.customerId);
                        notifs.push({ type: 'due', text: `${cust ? cust.name : 'Unknown'} — EMI ₹${s.emi.toLocaleString('en-IN')} due today`, time: 'Today' });
                    }
                    if (s.status === 'pending' && s.date < today) {
                        const cust = Customers.getById(l.customerId);
                        notifs.push({ type: 'overdue', text: `${cust ? cust.name : 'Unknown'} — EMI ₹${s.emi.toLocaleString('en-IN')} overdue since ${s.date}`, time: s.date });
                    }
                });
            }
        });

        const badge = document.getElementById('notifBadge');
        if (notifs.length) {
            badge.style.display = 'flex';
            badge.textContent = notifs.length > 99 ? '99+' : notifs.length;
        } else {
            badge.style.display = 'none';
        }

        const list = document.getElementById('notifList');
        if (!notifs.length) {
            list.innerHTML = '<p class="empty-state">No notifications</p>';
        } else {
            list.innerHTML = notifs.slice(0, 20).map(n => `
                <div class="notif-item ${n.type}">
                    <span class="material-icons-round">${n.type === 'overdue' ? 'warning' : n.type === 'due' ? 'schedule' : 'check_circle'}</span>
                    <div class="notif-text"><p>${n.text}</p><small>${n.time}</small></div>
                </div>
            `).join('');
        }
    }
};
