// ===== DATA MIGRATION UTILITY =====
const Migration = {
    async run() {
        if (!Auth.currentUser || Auth.currentUser.email !== SUPERUSER.email) return;
        
        const hasRun = localStorage.getItem('lendflow_migration_v3');
        if (hasRun) return;

        console.log('Running data migration to v3 (Branch + Data Ownership)...');
        const uid = Auth.currentUser.uid;
        
        try {
            // 1. Migrate Branches first
            const branchSnap = await db.collection('branches').where('ownerId', '==', null).get(); // Some might have no ownerId
            // Also check all branches for legacy ones
            const allBranches = await db.collection('branches').get();
            const branchBatch = db.batch();
            let bCount = 0;
            allBranches.forEach(doc => {
                if (!doc.data().ownerId) {
                    branchBatch.update(doc.ref, { ownerId: uid });
                    bCount++;
                }
            });
            if (bCount > 0) {
                await branchBatch.commit();
                console.log(`Migrated ${bCount} branches`);
            }

            // 2. Migrate Data
            const collections = ['customers', 'loans', 'payments'];
            for (const col of collections) {
                const snap = await db.collection(col).where('userId', '==', uid).get();
                const batch = db.batch();
                let count = 0;

                snap.forEach(doc => {
                    if (!doc.data().ownerId) {
                        batch.update(doc.ref, { ownerId: uid });
                        count++;
                    }
                });

                if (count > 0) {
                    await batch.commit();
                    console.log(`Migrated ${count} documents in ${col}`);
                }
            }
            
            // 3. Ensure SuperAdmin role is correct
            await db.collection('users').doc(uid).update({ role: 'superadmin' });
            console.log('Super Admin role forced to superadmin');

            localStorage.setItem('lendflow_migration_v4', 'true');
            console.log('Migration v4 complete.');
            // Refresh listeners
            Customers.listen();
            Loans.listen();
            Payments.listen();
        } catch (err) {
            console.error('Migration failed:', err);
        }
    }
};
