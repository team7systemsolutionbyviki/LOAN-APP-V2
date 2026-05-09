// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
    apiKey: "AIzaSyDz6upxpqx3Vx5uHrmPHOuCtQHx8JNVRxs",
    authDomain: "finace-e7cbc.firebaseapp.com",
    projectId: "finace-e7cbc",
    storageBucket: "finace-e7cbc.firebasestorage.app",
    messagingSenderId: "212031390609",
    appId: "1:212031390609:web:a8c86d9d596d454c541030"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') console.warn('Persistence failed: multiple tabs open');
    else if (err.code === 'unimplemented') console.warn('Persistence not supported');
});
