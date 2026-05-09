// ===== CUSTOMER MANAGEMENT MODULE =====
const Customers = {
    list: [],
    unsubscribe: null,

    init() {
        document.getElementById('addCustomerBtn').addEventListener('click', () => Customers.showForm());
        document.getElementById('customerSearch').addEventListener('input', e => Customers.filter(e.target.value));

        // Event delegation for table action buttons
        document.getElementById('customerTableBody').addEventListener('click', e => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'edit') Customers.showForm(id);
            else if (action === 'add-loan') Loans.showFormForCustomer(id);
            else if (action === 'remove') Customers.removeCustomer(id);
        });

        Customers.listen();
    },

    listen() {
        if (Customers.unsubscribe) Customers.unsubscribe();
        
        // Robust owner identification
        const isOwner = Auth.userRole === 'superadmin' || Auth.userRole === 'super_admin' || Auth.currentUser?.email === SUPERUSER.email;
        const ownerId = Branches.currentOwnerId || (isOwner ? Auth.currentUser?.uid : null);
        const branchId = Branches.currentBranch;

        console.log(`Customers.listen triggered. Role: ${Auth.userRole}, Owner: ${ownerId}, Branch: ${branchId}`);

        if (!ownerId) {
            console.warn('Customers.listen deferred: ownerId not ready');
            return;
        }

        let query = db.collection('customers').where('ownerId', '==', ownerId);
        
        Customers.unsubscribe = query.onSnapshot(snap => {
            let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Filter by branch locally
            if (branchId) {
                list = list.filter(item => item.branchId === branchId);
            }

            Customers.list = list;
            Customers.list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            Customers.render();
            Dashboard.refresh();
        }, err => {
            console.error('Customers listener error:', err);
        });
    },

    render(data) {
        const list = data || Customers.list;
        const tbody = document.getElementById('customerTableBody');
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No customers found. Add one to get started.</td></tr>';
            return;
        }

        const isManager = Auth.userRole === 'superadmin' || 
                         Auth.userRole === 'super_admin' || 
                         Auth.userRole === 'branch_admin' || 
                         Auth.currentUser?.email === SUPERUSER.email;
        
        tbody.innerHTML = list.map(c => {
            const activeLoans = Loans.list.filter(l => l.customerId === c.id && l.status === 'active').length;
            const totalBorrowed = Loans.list.filter(l => l.customerId === c.id).reduce((s, l) => s + l.amount, 0);
            return `<tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.phone || '-'}</td>
                <td>${activeLoans}</td>
                <td>₹${totalBorrowed.toLocaleString('en-IN')}</td>
                <td class="actions">
                    ${isManager ? `<button class="btn btn-sm btn-outline" data-action="edit" data-id="${c.id}" title="Edit"><span class="material-icons-round">edit</span></button>` : ''}
                    <button class="btn btn-sm btn-outline" data-action="add-loan" data-id="${c.id}" title="New Loan"><span class="material-icons-round">add_card</span></button>
                    ${isManager ? `<button class="btn btn-sm btn-danger" data-action="remove" data-id="${c.id}" title="Delete"><span class="material-icons-round">delete</span></button>` : ''}
                </td>
            </tr>`;
        }).join('');
    },

    filter(q) {
        if (!q) { Customers.render(); return; }
        q = q.toLowerCase();
        Customers.render(Customers.list.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))));
    },

    showForm(id) {
        const c = id ? Customers.list.find(x => x.id === id) : null;
        const title = c ? 'Edit Customer' : 'Add Customer';
        App.openModal(title, `
            <form id="customerForm">
                <div class="form-group">
                    <label>Full Name *</label>
                    <input type="text" class="form-input" id="cfName" required value="${c ? c.name : ''}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="tel" class="form-input" id="cfPhone" value="${c ? (c.phone || '') : ''}">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" class="form-input" id="cfEmail" value="${c ? (c.email || '') : ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Address</label>
                    <textarea class="form-input" id="cfAddress">${c ? (c.address || '') : ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea class="form-input" id="cfNotes">${c ? (c.notes || '') : ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Profile Photo</label>
                    <input type="file" class="form-input" id="cfPhoto" accept="image/*">
                </div>
                <div class="form-group">
                    <label>ID Proof (optional)</label>
                    <input type="file" class="form-input" id="cfIdProof" accept="image/*">
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <span class="material-icons-round">${c ? 'save' : 'person_add'}</span> ${c ? 'Update' : 'Add'} Customer
                </button>
            </form>
        `);
        document.getElementById('customerForm').addEventListener('submit', async e => {
            e.preventDefault();
            await Customers.save(id);
        });
    },

    async save(id) {
        const data = {
            name: document.getElementById('cfName').value.trim(),
            phone: document.getElementById('cfPhone').value.trim(),
            email: document.getElementById('cfEmail').value.trim(),
            address: document.getElementById('cfAddress').value.trim(),
            notes: document.getElementById('cfNotes').value.trim(),
            ownerId: Branches.currentOwnerId || (Auth.currentUser?.email === SUPERUSER.email ? Auth.currentUser.uid : null),
            branchId: Branches.currentBranch || '',
            userId: Auth.currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!data.name) { App.toast('Name is required', 'error'); return; }

        try {
            // Upload photo if selected
            const photoEl = document.getElementById('cfPhoto');
            if (photoEl && photoEl.files && photoEl.files[0]) {
                try {
                    const ref = storage.ref(`customers/${Auth.currentUser.uid}/${Date.now()}_photo`);
                    await ref.put(photoEl.files[0]);
                    data.photoUrl = await ref.getDownloadURL();
                } catch (uploadErr) {
                    console.warn('Photo upload failed:', uploadErr);
                }
            }
            // Upload ID proof if selected
            const idEl = document.getElementById('cfIdProof');
            if (idEl && idEl.files && idEl.files[0]) {
                try {
                    const ref = storage.ref(`customers/${Auth.currentUser.uid}/${Date.now()}_id`);
                    await ref.put(idEl.files[0]);
                    data.idProofUrl = await ref.getDownloadURL();
                } catch (uploadErr) {
                    console.warn('ID proof upload failed:', uploadErr);
                }
            }

            if (id) {
                await db.collection('customers').doc(id).update(data);
                App.toast('Customer updated', 'success');
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('customers').add(data);
                App.toast('Customer added', 'success');
            }
        } catch (err) {
            console.error('Save customer error:', err);
            App.toast('Error: ' + err.message, 'error');
        }
        App.closeModal();
    },

    async removeCustomer(id) {
        if (!confirm('Delete this customer? This will also delete all associated loans and payments.')) return;
        try {
            // Delete associated loans and payments
            const loans = await db.collection('loans').where('customerId', '==', id).get();
            const batch = db.batch();
            for (const loan of loans.docs) {
                const payments = await db.collection('payments').where('loanId', '==', loan.id).get();
                payments.docs.forEach(p => batch.delete(p.ref));
                batch.delete(loan.ref);
            }
            batch.delete(db.collection('customers').doc(id));
            await batch.commit();
            App.toast('Customer deleted', 'success');
        } catch (err) {
            console.error('Delete customer error:', err);
            App.toast('Error: ' + err.message, 'error');
        }
    },

    getById(id) {
        return Customers.list.find(c => c.id === id);
    }
};
