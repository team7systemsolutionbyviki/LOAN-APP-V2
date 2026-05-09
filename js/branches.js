// ===== BRANCH MANAGEMENT MODULE (Super Admin Only) =====
const Branches = {
    list: [],
    currentBranch: null,
    currentOwnerId: null,
    unsubscribe: null,
    isSuperAdmin: false,

    init() {
        // Reset visibility for all restricted items first
        document.querySelectorAll('.superadmin-only, .branch-admin-only, .admin-only').forEach(el => el.style.display = 'none');

        // Check if current user is superadmin
        Branches.isSuperAdmin = Auth.currentUser && Auth.currentUser.email === SUPERUSER.email;

        if (Branches.isSuperAdmin) {
            // Show superadmin-only and admin-only elements
            document.querySelectorAll('.superadmin-only, .admin-only').forEach(el => el.style.display = '');
            
            const branchSel = document.getElementById('branchSelector');
            if (branchSel) {
                branchSel.style.display = 'block';
                // Sync initial state
                Branches.currentBranch = branchSel.value;
                branchSel.addEventListener('change', e => {
                    Branches.currentBranch = e.target.value;
                    
                    // Refresh all data for the new branch context
                    if (typeof Customers !== 'undefined') Customers.listen();
                    if (typeof Loans !== 'undefined') Loans.listen();
                    if (typeof Payments !== 'undefined') Payments.listen();
                    if (typeof Dashboard !== 'undefined') Dashboard.refresh();
                    if (typeof App !== 'undefined') App.loadBranchProfile();
                });
            }

            const addBtn = document.getElementById('addBranchBtn');
            if (addBtn) addBtn.addEventListener('click', () => Branches.showForm());
            
            const searchInput = document.getElementById('branchSearch');
            if (searchInput) searchInput.addEventListener('input', e => Branches.filter(e.target.value));

            const tableBody = document.getElementById('branchTableBody');
            if (tableBody) {
                tableBody.addEventListener('click', e => {
                    const btn = e.target.closest('button[data-action]');
                    if (!btn) return;
                    const action = btn.dataset.action;
                    const id = btn.dataset.id;
                    if (action === 'edit') Branches.showForm(id);
                    else if (action === 'remove') Branches.removeBranch(id);
                    else if (action === 'staff') Branches.manageStaff(id);
                });
            }
        } else if (Auth.userRole === 'branch_admin') {
            // Show branch-admin-only and admin-only elements
            document.querySelectorAll('.branch-admin-only, .admin-only').forEach(el => el.style.display = '');
            
            const addStaffBtn = document.getElementById('addStaffBtn');
            if (addStaffBtn) addStaffBtn.addEventListener('click', () => {
                if (Branches.currentBranch) Branches.manageStaff(Branches.currentBranch);
            });
        }

        // Always load branch context (sets ownerId and triggers listeners)
        Branches.loadUserBranch();

        Branches.listen();
    },

    async loadUserBranch() {
        try {
            const userDoc = await db.collection('users').doc(Auth.currentUser.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                // Only overwrite if userData actually has a branchId
                if (userData.branchId) Branches.currentBranch = userData.branchId;
                
                // If not superadmin, find the ownerId from the branch
                if (!Branches.isSuperAdmin && Branches.currentBranch) {
                    const branchDoc = await db.collection('branches').doc(Branches.currentBranch).get();
                    if (branchDoc.exists) {
                        Branches.currentOwnerId = branchDoc.data().ownerId;
                    }
                } else if (Branches.isSuperAdmin) {
                    Branches.currentOwnerId = Auth.currentUser.uid;
                }

                // Re-trigger listeners
                Branches.listen();
                if (typeof App !== 'undefined') App.loadBranchProfile();
                if (typeof Customers !== 'undefined') Customers.listen();
                if (typeof Loans !== 'undefined') Loans.listen();
                if (typeof Payments !== 'undefined') Payments.listen();

                // Update UI Branch Name
                const branchEl = document.getElementById('userBranch');
                if (branchEl) {
                    if (Branches.currentBranch) {
                        const bDoc = await db.collection('branches').doc(Branches.currentBranch).get();
                        if (bDoc.exists) {
                            branchEl.textContent = bDoc.data().name;
                            branchEl.style.display = 'block';
                        }
                    } else if (Branches.isSuperAdmin) {
                        branchEl.textContent = 'All Branches';
                        branchEl.style.display = 'block';
                    } else {
                        branchEl.style.display = 'none';
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load user branch:', err);
        }
    },

    listen() {
        if (Branches.unsubscribe) Branches.unsubscribe();

        if (Branches.isSuperAdmin) {
            Branches.unsubscribe = db.collection('branches').where('ownerId', '==', Auth.currentUser.uid)
                .onSnapshot(snap => {
                    Branches.list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    Branches.list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    Branches.render();
                    Branches.updateSelector();
                }, err => {
                    console.error('Branches listener error:', err);
                });
        } else if (Auth.userRole === 'branch_admin' || Branches.currentBranch) {
            // For branch admin, listen to their specific branch to see staff
            const bid = Branches.currentBranch;
            if (!bid) return;
            Branches.unsubscribe = db.collection('branches').doc(bid)
                .onSnapshot(doc => {
                    if (doc.exists) {
                        const data = doc.data();
                        Branches.list = [{ id: doc.id, ...data }];
                        if (Auth.userRole === 'branch_admin') {
                            Branches.renderStaffTable(data.staff || []);
                            const header = document.getElementById('branchNameHeader');
                            if (header) header.textContent = `Staff — ${data.name}`;
                        }
                    }
                });
        }
    },

    renderStaffTable(staff) {
        const tbody = document.getElementById('staffTableBody');
        if (!tbody) return;
        if (!staff.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No staff members in your branch yet.</td></tr>';
            return;
        }
        tbody.innerHTML = staff.map(s => `
            <tr>
                <td><strong>${s.name}</strong></td>
                <td>${s.email}</td>
                <td><span class="badge ${s.role === 'branch_admin' ? 'badge-active' : 'badge-closed'}">${s.role || 'staff'}</span></td>
                <td>${s.addedAt ? new Date(s.addedAt).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="Branches.removeStaffFromBranch('${s.email}')" title="Remove">
                        <span class="material-icons-round">person_remove</span>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    async removeStaffFromBranch(email) {
        if (!confirm(`Remove ${email} from your branch?`)) return;
        const bid = Branches.currentBranch;
        const branch = Branches.list.find(b => b.id === bid);
        if (!branch) return;

        const updatedStaff = (branch.staff || []).filter(s => s.email !== email);
        try {
            await db.collection('branches').doc(bid).update({
                staff: updatedStaff,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // Also remove branchId from user doc
            const userSnap = await db.collection('users').where('email', '==', email).get();
            if (!userSnap.empty) {
                await userSnap.docs[0].ref.update({ branchId: null });
            }
            App.toast('Staff member removed', 'success');
        } catch (err) {
            App.toast('Error: ' + err.message, 'error');
        }
    },

    render(data) {
        const list = data || Branches.list;
        const tbody = document.getElementById('branchTableBody');
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No branches created yet. Add your first branch.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(b => {
            const statusClass = b.status === 'active' ? 'badge-active' : 'badge-closed';
            const staffCount = b.staff ? b.staff.length : 0;
            return `<tr>
                <td><strong>${b.name}</strong></td>
                <td>${b.location || '-'}</td>
                <td>${b.managerName || '-'}</td>
                <td>${staffCount} staff</td>
                <td><span class="badge ${statusClass}">${b.status || 'active'}</span></td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline" data-action="staff" data-id="${b.id}" title="Manage Staff"><span class="material-icons-round">group_add</span></button>
                    <button class="btn btn-sm btn-outline" data-action="edit" data-id="${b.id}" title="Edit"><span class="material-icons-round">edit</span></button>
                    <button class="btn btn-sm btn-danger" data-action="remove" data-id="${b.id}" title="Delete"><span class="material-icons-round">delete</span></button>
                </td>
            </tr>`;
        }).join('');
    },

    updateSelector() {
        const sel = document.getElementById('branchSelector');
        if (!sel) return;
        const currentVal = Branches.currentBranch || sel.value;
        sel.innerHTML = '<option value="">All Branches</option>' +
            Branches.list.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        sel.value = currentVal;
        // Keep internal state in sync
        Branches.currentBranch = sel.value;
    },

    filter(q) {
        if (!q) { Branches.render(); return; }
        q = q.toLowerCase();
        Branches.render(Branches.list.filter(b =>
            b.name.toLowerCase().includes(q) || (b.location && b.location.toLowerCase().includes(q))
        ));
    },

    showForm(id) {
        if (!Branches.isSuperAdmin) {
            App.toast('Only Super Admin can manage branches', 'error');
            return;
        }

        const b = id ? Branches.list.find(x => x.id === id) : null;
        const title = b ? 'Edit Branch' : 'Add New Branch';

        App.openModal(title, `
            <form id="branchForm">
                <div class="form-group">
                    <label>Branch Name *</label>
                    <input type="text" class="form-input" id="bfName" required value="${b ? b.name : ''}" placeholder="e.g. Main Office">
                </div>
                <div class="form-group">
                    <label>Location / Address</label>
                    <textarea class="form-input" id="bfLocation" placeholder="Full address">${b ? (b.location || '') : ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Manager Name</label>
                        <input type="text" class="form-input" id="bfManager" value="${b ? (b.managerName || '') : ''}" placeholder="Branch manager">
                    </div>
                    <div class="form-group">
                        <label>Manager Phone</label>
                        <input type="tel" class="form-input" id="bfPhone" value="${b ? (b.managerPhone || '') : ''}" placeholder="Phone number">
                    </div>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select class="form-select" id="bfStatus">
                        <option value="active" ${b && b.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${b && b.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <span class="material-icons-round">${b ? 'save' : 'add_business'}</span> ${b ? 'Update' : 'Create'} Branch
                </button>
            </form>
        `);

        document.getElementById('branchForm').addEventListener('submit', async e => {
            e.preventDefault();
            await Branches.save(id);
        });
    },

    async save(id) {
        const data = {
            name: document.getElementById('bfName').value.trim(),
            location: document.getElementById('bfLocation').value.trim(),
            managerName: document.getElementById('bfManager').value.trim(),
            managerPhone: document.getElementById('bfPhone').value.trim(),
            status: document.getElementById('bfStatus').value,
            ownerId: Auth.currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!data.name) { App.toast('Branch name is required', 'error'); return; }

        try {
            if (id) {
                await db.collection('branches').doc(id).update(data);
                App.toast('Branch updated', 'success');
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                data.staff = [];
                await db.collection('branches').add(data);
                App.toast('Branch created', 'success');
            }
        } catch (err) {
            console.error('Save branch error:', err);
            App.toast('Error: ' + err.message, 'error');
        }
        App.closeModal();
    },

    async removeBranch(id) {
        if (!confirm('Delete this branch? Staff assignments will be removed. Customers, loans, and payments in this branch will lose their branch association.')) return;
        try {
            await db.collection('branches').doc(id).delete();
            App.toast('Branch deleted', 'success');
        } catch (err) {
            console.error('Delete branch error:', err);
            App.toast('Error: ' + err.message, 'error');
        }
    },

    manageStaff(branchId) {
        const branch = Branches.list.find(b => b.id === branchId);
        if (!branch) return;

        const staff = branch.staff || [];

        App.openModal(`Staff — ${branch.name}`, `
            <div id="staffList" style="margin-bottom:16px">
                ${staff.length ? staff.map((s, i) => `
                    <div class="schedule-item" style="padding:10px 16px">
                        <div class="info">
                            <p><strong>${s.name}</strong></p>
                            <small>${s.email}</small>
                        </div>
                        <button class="btn btn-sm btn-danger" id="removeStaff_${i}" title="Remove Staff">
                            <span class="material-icons-round">person_remove</span>
                        </button>
                    </div>
                `).join('') : '<p class="empty-state">No staff assigned to this branch</p>'}
            </div>
            <h4 style="margin-bottom:12px">Create Staff Account</h4>
            <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">The staff member can log in immediately after you create this.</p>
            <form id="addStaffForm">
                <div class="form-group">
                    <label>Full Name *</label>
                    <input type="text" class="form-input" id="sfName" required placeholder="Staff Full Name">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Staff Email *</label>
                        <input type="email" class="form-input" id="sfEmail" required placeholder="staff@example.com">
                    </div>
                    <div class="form-group">
                        <label>Password *</label>
                        <input type="text" class="form-input" id="sfPassword" required placeholder="Min 6 chars" minlength="6">
                    </div>
                </div>
                <div class="form-group">
                    <label>Access Level (Role) *</label>
                    <select class="form-select" id="sfRole">
                        <option value="staff">Staff (Data Entry Only)</option>
                        <option value="branch_admin">Normal Admin (Branch Reports + Management)</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary btn-block" id="sfSubmitBtn">
                    <span class="material-icons-round">person_add</span> Create & Assign
                </button>
            </form>
        `);

        // Remove staff handlers
        staff.forEach((s, i) => {
            const removeBtn = document.getElementById(`removeStaff_${i}`);
            if (removeBtn) {
                removeBtn.addEventListener('click', async () => {
                    if (!confirm(`Remove ${s.name} from this branch?`)) return;
                    const updatedStaff = staff.filter((_, idx) => idx !== i);
                    try {
                        // 1. Update branch staff list
                        await db.collection('branches').doc(branchId).update({
                            staff: updatedStaff,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        
                        // 2. Remove branchId from user doc (if found)
                        const userSnap = await db.collection('users').where('email', '==', s.email).get();
                        if (!userSnap.empty) {
                            await userSnap.docs[0].ref.update({ branchId: null });
                        }

                        App.toast('Staff removed', 'success');
                        Branches.manageStaff(branchId); // Refresh
                    } catch (err) {
                        App.toast('Error: ' + err.message, 'error');
                    }
                });
            }
        });

        // Add staff form
        document.getElementById('addStaffForm').addEventListener('submit', async e => {
            e.preventDefault();
            const name = document.getElementById('sfName').value.trim();
            const email = document.getElementById('sfEmail').value.trim().toLowerCase();
            const password = document.getElementById('sfPassword').value;
            const role = document.getElementById('sfRole').value;
            const btn = document.getElementById('sfSubmitBtn');

            if (!name || !email || password.length < 6) {
                App.toast('Please fill all fields correctly (Password min 6 chars)', 'error');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-round">hourglass_top</span> Creating...';

            let tempApp = null;
            try {
                // 1. Create staff in Firebase Auth using a secondary app instance
                // This prevents logging out the current admin user
                const tempAppName = 'temp_staff_creator_' + Date.now();
                tempApp = firebase.initializeApp(firebaseConfig, tempAppName);
                const tempAuth = tempApp.auth();
                
                const cred = await tempAuth.createUserWithEmailAndPassword(email, password);
                const uid = cred.user.uid;
                await cred.user.updateProfile({ displayName: name });

                // 2. Update user doc in main db
                await db.collection('users').doc(uid).set({
                    name, email, branchId,
                    role: role,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // 3. Update branch staff list
                const updatedStaff = [...staff, { name, email, userId: uid, role, addedAt: new Date().toISOString() }];
                await db.collection('branches').doc(branchId).update({
                    staff: updatedStaff,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                App.toast(`Staff account created for ${name}`, 'success');
                Branches.manageStaff(branchId); // Refresh UI
            } catch (err) {
                console.error('Add staff error:', err);
                App.toast('Error: ' + err.message, 'error');
            } finally {
                if (tempApp) await tempApp.delete();
                btn.disabled = false;
                btn.innerHTML = '<span class="material-icons-round">person_add</span> Create & Assign Staff';
            }
        });
    },

    // Helper: get current branch ID for data filtering
    getCurrentBranchId() {
        return Branches.currentBranch || '';
    },

    getById(id) {
        return Branches.list.find(b => b.id === id);
    }
};
