// ===== AUTHENTICATION MODULE =====
const SUPERUSER = {
    username: 'VIKI',
    password: '1101VIKI',
    email: 'viki@lendflow.admin',
    displayName: 'VIKI (Super Admin)'
};

const Auth = {
    currentUser: null,

    init() {
        // Show screen when ready
        const authScreen = document.getElementById('authScreen');
        if (authScreen) authScreen.classList.add('ready');

        document.getElementById('loginForm').addEventListener('submit', e => { e.preventDefault(); Auth.login(); });
        const regForm = document.getElementById('registerForm');
        if (regForm) regForm.addEventListener('submit', e => { e.preventDefault(); Auth.register(); });
        
        const sReg = document.getElementById('showRegister');
        if (sReg) sReg.addEventListener('click', e => { e.preventDefault(); Auth.toggleForms(true); });
        
        const sLog = document.getElementById('showLogin');
        if (sLog) sLog.addEventListener('click', e => { e.preventDefault(); Auth.toggleForms(false); });
        const fBtn = document.getElementById('forgotPassBtn');
        if (fBtn) fBtn.addEventListener('click', e => { e.preventDefault(); Auth.forgotPassword(); });

        auth.onAuthStateChanged(user => {
            if (user) {
                Auth.currentUser = user;
                Auth.showApp(user);
            } else {
                Auth.currentUser = null;
                Auth.showAuth();
            }
        });
    },

    toggleForms(showReg) {
        document.getElementById('loginForm').style.display = showReg ? 'none' : 'block';
        document.getElementById('registerForm').style.display = showReg ? 'block' : 'none';
        document.getElementById('authError').style.display = 'none';
    },

    async login() {
        const emailOrUser = document.getElementById('loginEmail').value.trim();
        const pass = document.getElementById('loginPassword').value;
        const btn = document.getElementById('loginBtn');
        btn.disabled = true; btn.innerHTML = '<span class="material-icons-round">hourglass_top</span> Signing in...';

        try {
            // Check if superuser login
            if (emailOrUser.toUpperCase() === SUPERUSER.username && pass === SUPERUSER.password) {
                // Try signing in with mapped email
                try {
                    await auth.signInWithEmailAndPassword(SUPERUSER.email, SUPERUSER.password);
                } catch (e) {
                    // Auto-create superuser account on first login
                    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
                        const cred = await auth.createUserWithEmailAndPassword(SUPERUSER.email, SUPERUSER.password);
                        await cred.user.updateProfile({ displayName: SUPERUSER.displayName });
                        await db.collection('users').doc(cred.user.uid).set({
                            name: SUPERUSER.displayName, email: SUPERUSER.email, role: 'superadmin',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            settings: { lateFeeEnabled: false, lateFeeRate: 0.5 }
                        });
                    } else {
                        throw e;
                    }
                }
            } else {
                await auth.signInWithEmailAndPassword(emailOrUser, pass);
            }
        } catch (err) {
            let msg = err.message;
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                msg = "Incorrect email or password. Please try again or use the Super Admin login.";
            }
            Auth.showError(msg);
        }
        btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">login</span> Sign In';
    },

    async forgotPassword() {
        const email = document.getElementById('loginEmail').value.trim();
        if (!email || !email.includes('@')) {
            Auth.showError("Please enter your valid email address first.");
            return;
        }
        if (confirm(`Send password reset email to ${email}?`)) {
            try {
                await auth.sendPasswordResetEmail(email);
                alert("Password reset link sent! Please check your email inbox.");
            } catch (err) {
                Auth.showError(err.message);
            }
        }
    },

    async register() {
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const pass = document.getElementById('regPassword').value;
        const btn = document.getElementById('regBtn');
        btn.disabled = true; btn.innerHTML = '<span class="material-icons-round">hourglass_top</span> Creating...';
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            await cred.user.updateProfile({ displayName: name });
            await db.collection('users').doc(cred.user.uid).set({
                name, email, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                settings: { lateFeeEnabled: false, lateFeeRate: 0.5 }
            });
        } catch (err) {
            Auth.showError(err.message);
        }
        btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">person_add</span> Create Account';
    },

    async logout() {
        console.log('Logout triggered');
        if (confirm('Are you sure you want to logout? A final backup will be taken.')) {
            // AUTO BACKUP ON LOGOUT
            try {
                if (typeof App !== 'undefined' && App.backup) await App.backup(true);
            } catch (e) { console.error('Logout backup failed', e); }

            await auth.signOut();
            console.log('Signed out successfully');
            window.location.href = window.location.pathname; // Clean reload
        }
    },

    async showApp(user) {
        try {
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('appShell').style.display = 'flex';
            
            // Fetch user profile from Firestore with timeout/error safety
            let userData = { role: 'user' };
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) userData = userDoc.data();
            } catch (e) {
                console.warn('Profile fetch failed, using defaults', e);
            }
            
            const name = userData.name || user.displayName || 'Admin';
            document.getElementById('userName').textContent = name;
            document.getElementById('userEmail').textContent = user.email;
            document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();

            // Store role globally
            Auth.userRole = userData.role || (user.email === SUPERUSER.email ? 'superadmin' : 'user');
            console.log('User Role Verified:', Auth.userRole);
            
            // Update UI role label
            const roleEl = document.getElementById('userRole');
            if (roleEl) {
                if (Auth.userRole === 'superadmin' || Auth.userRole === 'super_admin' || user.email === SUPERUSER.email) {
                    roleEl.textContent = 'Super Admin';
                    document.querySelectorAll('.superadmin-only').forEach(el => el.style.display = 'flex');
                }
                else if (Auth.userRole === 'branch_admin') {
                    roleEl.textContent = 'Branch Admin';
                    document.querySelectorAll('.branch-admin-only').forEach(el => el.style.display = 'flex');
                }
                else roleEl.textContent = 'Staff';
            }
            
            // Initialize App
            App.init();
            
            // LICENSE CHECK (AMC)
            const branchId = userData.branchId || Branches.currentBranch || '';
            if (branchId) {
                const today = new Date().toISOString().split('T')[0];
                db.collection('amc_contracts').where('branchId', '==', branchId).orderBy('endDate', 'desc').limit(1).onSnapshot(snap => {
                    const expiryBox = document.getElementById('licenseExpiryBox');
                    const expiryDateEl = document.getElementById('licenseExpiryDate');
                    const lockOverlay = document.getElementById('licenseLock');
                    const badgeTop = document.getElementById('licenseBadge');
                    const expiryDateTop = document.getElementById('licenseExpiryDateTop');
                    
                    if (!snap.empty) {
                        const amc = snap.docs[0].data();
                        const isExpired = amc.endDate < today || amc.status === 'expired';
                        
                        if (expiryDateEl) expiryDateEl.textContent = amc.endDate;
                        if (expiryDateTop) expiryDateTop.textContent = amc.endDate;
                        if (expiryBox) expiryBox.style.display = 'block';
                        if (badgeTop) badgeTop.style.display = 'flex';
                        
                        // Update Lock WhatsApp Message
                        const lockWaBtn = document.getElementById('lockWaBtn');
                        if (lockWaBtn) {
                            const waMsg = encodeURIComponent(`Hello Vignesh, I NEED A LICENCE RENEWAL FOR SHOP: ${amc.branchName || 'My Branch'}`);
                            lockWaBtn.href = `https://wa.me/919360039283?text=${waMsg}`;
                        }

                        // LOCK LOGIC: Lock if expired AND not Super Admin
                        const isSuper = Auth.userRole === 'superadmin' || Auth.userRole === 'super_admin' || user.email === SUPERUSER.email;
                        if (isExpired && !isSuper) {
                            if (lockOverlay) lockOverlay.style.display = 'flex';
                        } else {
                            if (lockOverlay) lockOverlay.style.display = 'none';
                        }
                    } else {
                        // No contract found - LOCK IT for normal users
                        if (expiryBox) expiryBox.style.display = 'block';
                        if (badgeTop) badgeTop.style.display = 'flex';
                        if (expiryDateEl) expiryDateEl.textContent = 'UNLICENSED';
                        if (expiryDateTop) expiryDateTop.textContent = 'NO LICENSE';
                        
                        const isSuper = Auth.userRole === 'superadmin' || Auth.userRole === 'super_admin' || user.email === SUPERUSER.email;
                        if (!isSuper) {
                            if (lockOverlay) lockOverlay.style.display = 'flex';
                        }
                    }
                });
            }

            // Go to dashboard by default
            App.navigate('dashboard');

            // AUTO BACKUP ON LOGIN
            setTimeout(() => {
                if (typeof App !== 'undefined' && App.backup) App.backup(true);
            }, 3000); // Small delay to let data load
        } catch (err) {
            console.error('showApp crash:', err);
            // Emergency fallback
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('appShell').style.display = 'flex';
            App.init();
        }
    },

    showAuth() {
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('appShell').style.display = 'none';
    },

    showError(msg) {
        const el = document.getElementById('authError');
        el.textContent = msg; el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 5000);
    }
};

document.addEventListener('DOMContentLoaded', () => Auth.init());
