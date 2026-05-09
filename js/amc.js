// ===== AMC CONTRACT MANAGEMENT MODULE =====
const Amc = {
    list: [],
    unsubscribe: null,

    init() {
        if (Auth.userRole !== 'superadmin' && Auth.userRole !== 'super_admin' && Auth.currentUser?.email !== SUPERUSER.email) {
            console.warn('AMC module restricted to Super Admin only');
            return;
        }

        const addBtn = document.getElementById('addAmcBtn');
        if (addBtn) addBtn.addEventListener('click', () => Amc.showForm());
        
        const searchInput = document.getElementById('amcSearch');
        if (searchInput) searchInput.addEventListener('input', e => Amc.filter(e.target.value));

        Amc.listen();
    },

    listen() {
        if (Amc.unsubscribe) Amc.unsubscribe();
        
        // AMC is global for superadmin
        Amc.unsubscribe = db.collection('amc_contracts')
            .onSnapshot(snap => {
                Amc.list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                Amc.render();
            }, err => {
                console.error('AMC listener error:', err);
            });
    },

    render(data) {
        if (Auth.userRole !== 'superadmin' && Auth.userRole !== 'super_admin' && Auth.currentUser?.email !== SUPERUSER.email) return;

        const list = data || Amc.list;
        const tbody = document.getElementById('amcTableBody');
        if (!tbody) return;

        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No AMC contracts found.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(c => {
            const statusCls = c.status === 'active' ? 'badge-active' : c.status === 'expired' ? 'badge-overdue' : 'badge-closed';
            return `<tr>
                <td><strong>${c.customerName || 'N/A'}</strong><br><small>${c.branchName || 'Branch Service'}</small></td>
                <td>${c.planName}</td>
                <td>${c.startDate} to ${c.endDate}</td>
                <td>₹${c.amount.toLocaleString('en-IN')}</td>
                <td><span class="badge ${statusCls}">${c.status.toUpperCase()}</span></td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline" title="Smart Record" onclick="Amc.smartRecord('${c.id}')"><span class="material-icons-round">history_edu</span></button>
                    <button class="btn btn-sm btn-outline" title="View Logs" onclick="Amc.viewHistory('${c.id}')"><span class="material-icons-round">analytics</span></button>
                    <button class="btn btn-sm btn-outline" onclick="Amc.showForm('${c.id}')"><span class="material-icons-round">edit</span></button>
                    <button class="btn btn-sm btn-danger" onclick="Amc.remove('${c.id}')"><span class="material-icons-round">delete</span></button>
                </td>
            </tr>`;
        }).join('');
    },

    async smartRecord(id) {
        const c = Amc.list.find(x => x.id === id);
        App.openModal('AMC Smart Recorder', `
            <div style="margin-bottom:15px;padding:10px;background:rgba(99,102,241,0.05);border-radius:8px;border:1px solid rgba(99,102,241,0.1)">
                <h4 style="margin:0">${c.branchName}</h4>
                <p style="margin:5px 0 0;font-size:12px;color:#64748b">Current Plan: ${c.planName} | Ends: ${c.endDate}</p>
            </div>
            <form id="smartRecordForm">
                <div class="form-group">
                    <label>Action / Note</label>
                    <select class="form-select" id="srAction" required>
                        <option value="Payment Received">Payment Received</option>
                        <option value="Follow-up Call">Follow-up Call</option>
                        <option value="Grace Period Extended">Grace Period Extended</option>
                        <option value="Branch Interaction">Branch Interaction</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Amount (if payment)</label>
                    <input type="number" class="form-input" id="srAmount" value="0">
                </div>
                <div class="form-group">
                    <label>Additional Notes</label>
                    <textarea class="form-input" id="srNotes" placeholder="Enter details..." rows="3"></textarea>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <span class="material-icons-round">save</span> Save Smart Record
                </button>
            </form>
        `);

        document.getElementById('smartRecordForm').addEventListener('submit', async e => {
            e.preventDefault();
            const record = {
                contractId: id,
                branchId: c.branchId,
                branchName: c.branchName,
                action: document.getElementById('srAction').value,
                amount: parseFloat(document.getElementById('srAmount').value) || 0,
                notes: document.getElementById('srNotes').value,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            try {
                await db.collection('amc_records').add(record);
                App.toast('Smart Record saved!', 'success');
                App.closeModal();
            } catch (err) {
                App.toast('Error: ' + err.message, 'error');
            }
        });
    },

    async viewHistory(id) {
        const c = Amc.list.find(x => x.id === id);
        App.openModal(`AMC History: ${c.branchName}`, `<div id="amcHistoryList">Loading records...</div>`);
        
        try {
            const snap = await db.collection('amc_records')
                .where('contractId', '==', id)
                .get();
            
            // Sort client-side to avoid index requirement
            const list = snap.docs.map(d => d.data());
            list.sort((a, b) => {
                const t1 = a.timestamp?.toMillis() || 0;
                const t2 = b.timestamp?.toMillis() || 0;
                return t2 - t1;
            });
            
            const el = document.getElementById('amcHistoryList');
            
            if (!list.length) {
                el.innerHTML = '<p class="empty-state">No records found for this branch.</p>';
                return;
            }

            el.innerHTML = list.map(r => `
                <div style="padding:12px;border-bottom:1px solid #eee">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <strong style="color:var(--primary)">${r.action}</strong>
                        <small style="color:#94a3b8">${r.timestamp?.toDate().toLocaleString() || 'Just now'}</small>
                    </div>
                    ${r.amount > 0 ? `<div style="font-weight:600;margin:4px 0">Amount: ₹${r.amount.toLocaleString('en-IN')}</div>` : ''}
                    <p style="margin:5px 0 0;font-size:13px;color:#475569">${r.notes || 'No notes added'}</p>
                </div>
            `).join('');
        } catch (err) {
            document.getElementById('amcHistoryList').innerHTML = `<p style="color:red">Error: ${err.message}</p>`;
        }
    },

    showForm(id) {
        const c = id ? Amc.list.find(x => x.id === id) : null;
        const today = new Date().toISOString().split('T')[0];
        
        App.openModal(id ? 'Edit AMC Contract' : 'New AMC Contract', `
            <form id="amcForm">
                <div class="form-group">
                    <label>Select Branch</label>
                    <select class="form-select" id="amcBranch" required>
                        <option value="">-- Select Branch --</option>
                        ${Branches.list.map(b => `<option value="${b.id}" ${c && c.branchId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Plan Name</label>
                        <select class="form-select" id="amcPlan">
                            <option value="Basic" ${c && c.planName === 'Basic' ? 'selected' : ''}>Basic</option>
                            <option value="Standard" ${c && c.planName === 'Standard' ? 'selected' : ''}>Standard</option>
                            <option value="Premium" ${c && c.planName === 'Premium' ? 'selected' : ''}>Premium</option>
                            <option value="CUSTOM" ${c && c.planName === 'CUSTOM' ? 'selected' : ''}>CUSTOM</option>
                        </select>
                    </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Start Date</label>
                        <input type="date" class="form-input" id="amcStart" value="${c ? c.startDate : today}" required>
                    </div>
                    <div class="form-group">
                        <label>End Date</label>
                        <input type="date" class="form-input" id="amcEnd" value="${c ? c.endDate : ''}" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Rate Per Day (₹)</label>
                        <input type="number" class="form-input" id="amcRate" value="${c ? (c.ratePerDay || 40) : '40'}" required>
                    </div>
                    <div class="form-group">
                        <label>Total Days (auto)</label>
                        <input type="number" class="form-input" id="amcDays" readonly value="0">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Total Amount (auto)</label>
                        <input type="number" class="form-input" id="amcAmount" value="${c ? c.amount : '0'}" required readonly>
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select class="form-select" id="amcStatus">
                            <option value="active" ${c && c.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="expired" ${c && c.status === 'expired' ? 'selected' : ''}>Expired</option>
                            <option value="cancelled" ${c && c.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Payment Type</label>
                    <select class="form-select" id="amcPaymentType">
                        <option value="Full" ${c && c.paymentType === 'Full' ? 'selected' : ''}>Full Payment</option>
                        <option value="Quarterly" ${c && c.paymentType === 'Quarterly' ? 'selected' : ''}>Quarterly</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <span class="material-icons-round">save</span> ${id ? 'Update Contract' : 'Create Contract'}
                </button>
            </form>
        `);

        const updateCalc = () => {
            const start = document.getElementById('amcStart').value;
            const end = document.getElementById('amcEnd').value;
            const rate = parseFloat(document.getElementById('amcRate').value) || 0;
            
            if (start && end) {
                const d1 = new Date(start);
                const d2 = new Date(end);
                const diffTime = d2 - d1;
                const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                
                document.getElementById('amcDays').value = diffDays;
                document.getElementById('amcAmount').value = diffDays * rate;
            }
        };

        ['amcStart', 'amcEnd', 'amcRate'].forEach(fid => {
            document.getElementById(fid).addEventListener('input', updateCalc);
            document.getElementById(fid).addEventListener('change', updateCalc);
        });
        if (!id) updateCalc();

        document.getElementById('amcForm').addEventListener('submit', async e => {
            e.preventDefault();
            const bSelect = document.getElementById('amcBranch');
            const data = {
                branchId: bSelect.value,
                branchName: bSelect.options[bSelect.selectedIndex].text,
                customerName: bSelect.options[bSelect.selectedIndex].text, // Using branch name as primary target
                planName: document.getElementById('amcPlan').value,
                ratePerDay: parseFloat(document.getElementById('amcRate').value),
                amount: parseFloat(document.getElementById('amcAmount').value),
                startDate: document.getElementById('amcStart').value,
                endDate: document.getElementById('amcEnd').value,
                paymentType: document.getElementById('amcPaymentType').value,
                status: document.getElementById('amcStatus').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            try {
                if (id) {
                    await db.collection('amc_contracts').doc(id).update(data);
                } else {
                    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await db.collection('amc_contracts').add(data);
                }
                App.toast('AMC Contract saved', 'success');
                App.closeModal();
            } catch (err) {
                App.toast('Error: ' + err.message, 'error');
            }
        });
    },

    async remove(id) {
        if (!confirm('Delete this AMC contract?')) return;
        try {
            await db.collection('amc_contracts').doc(id).delete();
            App.toast('Contract deleted', 'success');
        } catch (err) {
            App.toast('Error: ' + err.message, 'error');
        }
    },

    filter(q) {
        if (!q) { Amc.render(); return; }
        q = q.toLowerCase();
        const filtered = Amc.list.filter(c => 
            c.customerName.toLowerCase().includes(q) || 
            c.planName.toLowerCase().includes(q)
        );
        Amc.render(filtered);
    }
};
