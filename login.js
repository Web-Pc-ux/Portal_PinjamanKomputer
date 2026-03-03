/* ==============================
   CLOUD LOGIN & SECURITY
============================== */
// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCkXpGW5uQRWos4J8Bnsctdshs6hf3Wti0",
    authDomain: "loginpage-38cbb.firebaseapp.com",
    databaseURL: "https://loginpage-38cbb-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "loginpage-38cbb",
    storageBucket: "loginpage-38cbb.firebasestorage.app",
    messagingSenderId: "330112161697",
    appId: "1:330112161697:web:0b687c4e5db4d0c40d1de0",
    measurementId: "G-LC3Q7E8BSH"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwZrFtrkH0r8p1BaPyGxQT1Tscb9jHyTtnHjm1eh8jv3Kys1vQ6xuHiPINXpRSSJ53NZg/exec";

// Helper function for case-insensitive property access
const getVal = (obj, key) => {
    if (!obj) return null;
    const realKey = Object.keys(obj).find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
    return realKey ? obj[realKey] : null;
};

async function findAdmin(searchQuery) {
    if (!GAS_URL) return null;

    try {
        // KESELAMATAN: Hanya tarik 1 rekod yang sepadan (Cegah Leak Seluruh Senarai Admin)
        const url = `${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=admin&search=${encodeURIComponent(searchQuery)}`;
        const res = await fetch(url);
        const result = await res.json();

        if (result.status === 'success' && result.data && result.data.length > 0) {
            return result.data[0]; // Pulangkan data admin yang dijumpai
        }
    } catch (e) {
        console.warn('⚠️ Gagal mencari Admin dari Cloud.', e);
    }
    return null;
}

const loginForm = document.getElementById('loginForm');
const btn = loginForm.querySelector('button[type="submit"]');

loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    document.getElementById('usernameError').textContent = '';
    document.getElementById('passwordError').textContent = '';

    const username = this.username.value.trim();
    const password = this.password.value.trim();

    if (!username || !password) {
        if (!username) document.getElementById('usernameError').textContent = 'Username diperlukan.';
        if (!password) document.getElementById('passwordError').textContent = 'Password diperlukan.';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Loading...';

    try {
        // 1. Dapatkan rekod admin / Kenal pasti identiti (Server-side search)
        const finalAdmin = await findAdmin(username);

        if (!finalAdmin) {
            console.log("❌ Tiada padanan di Excel untuk:", username);
            throw new Error("ID Pengguna tidak dijumpai. Sila hubungi pentadbir.");
        }

        const validEmail = getVal(finalAdmin, 'email') || (username.includes('@') ? username : (getVal(finalAdmin, 'username') || username) + "@ums.edu.my");

        let userCredential;
        try {
            // 3. Log masuk Firebase Auth
            userCredential = await auth.signInWithEmailAndPassword(validEmail, password);
            console.log("✅ Disahkan oleh Firebase Auth");
        } catch (firebaseErr) {
            console.log("Firebase Error Code:", firebaseErr.code);
            // Jika akaun tiada di Firebase, sistem 'Auto-Create'
            if (firebaseErr.code === 'auth/user-not-found' || firebaseErr.code === 'auth/invalid-credential' || firebaseErr.code === 'auth/invalid-email') {
                try {
                    btn.textContent = 'Setting up profile...';
                    userCredential = await auth.createUserWithEmailAndPassword(validEmail, password);
                    console.log("✅ Profil Firebase baharu berjaya dicipta secara automatik");
                } catch (createErr) {
                    // Jika emel sudah ada (padahal sign-in gagal), bermaksud PASSWORD SALAH
                    if (createErr.code === 'auth/email-already-in-use') {
                        throw new Error('Kata Laluan Tidak Sah.');
                    }
                    throw new Error('Gagal setup profil Firebase: ' + createErr.message);
                }
            } else if (firebaseErr.code === 'auth/wrong-password') {
                throw new Error('Kata Laluan Tidak Sah.');
            } else {
                throw new Error('Ralat Firebase: ' + firebaseErr.message);
            }
        }

        // 4. Salin Profile & Check Multi-login (Gunakan Username sebagai ID Dokumen supaya unik walaupun kongsi emel)
        btn.textContent = 'Checking session...';
        const user = userCredential.user;
        const usernameKey = (getVal(finalAdmin, 'username') || username).toLowerCase().trim();
        const userDocRef = db.collection('admins').doc(usernameKey);

        const userDoc = await userDocRef.get();
        const existingSession = userDoc.exists ? userDoc.data().sessionId : null;
        const newSessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

        // Semakan: Jika sesi sedia ada adalah dari peranti/pelayar yang sama (leaked session)
        const localSession = localStorage.getItem('loggedInAdmin');
        let isSameDevice = false;
        if (localSession) {
            try {
                const localData = JSON.parse(localSession);
                if (localData.username && localData.username.toLowerCase().trim() === usernameKey && localData.sessionId === existingSession) {
                    isSameDevice = true;
                    console.log("ℹ️ Sesi sedia ada dikesan dari peranti yang sama. Mengabaikan amaran redundan.");
                }
            } catch (e) {
                console.warn("Ralat membaca sesi tempatan:", e);
            }
        }

        if (existingSession && !isSameDevice) {
            const result = await Swal.fire({
                title: 'Akaun Sedang Digunakan',
                text: `ID "${usernameKey}" dikesan sedang aktif di peranti lain. Teruskan dan log keluar peranti tersebut?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Ya, Teruskan',
                cancelButtonText: 'Batal'
            });

            if (!result.isConfirmed) {
                await auth.signOut();
                btn.disabled = false;
                btn.textContent = 'Log In';
                return;
            }
        }

        btn.textContent = 'Finalizing...';
        await userDocRef.set({
            uid: user.uid, // Simpan UID untuk rujukan sahaja
            nama: getVal(finalAdmin, 'nama'),
            email: validEmail,
            username: getVal(finalAdmin, 'username') || username,
            jawatan: getVal(finalAdmin, 'jawatan') || '',
            peranan: getVal(finalAdmin, 'peranan') || 'Admin',
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            sessionId: newSessionId
        }, { merge: true });

        // 5. Simpan Session
        localStorage.setItem('loggedInAdmin', JSON.stringify({
            id: getVal(finalAdmin, 'id') || 99,
            uid: user.uid,
            nama: getVal(finalAdmin, 'nama'),
            username: getVal(finalAdmin, 'username') || username,
            email: validEmail,
            peranan: getVal(finalAdmin, 'peranan'),
            loginTime: new Date().toISOString(),
            sessionId: newSessionId
        }));

        btn.textContent = '✓ Berjaya Log Masuk!';
        btn.style.backgroundColor = '#28a745';

        // Reset dashboard view to 'dashboard' for every fresh login
        localStorage.removeItem('activeDashboardSection');

        setTimeout(() => {
            window.location.href = 'dashboard/main.html';
        }, 1200);

    } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Log In';
        document.getElementById('passwordError').textContent = err.message || 'Ralat semasa log masuk ke pangkalan data.';
    }
});

document.getElementById('forgotBtn').addEventListener('click', () => {
    window.location.href = 'forgot/forget.html';
});

document.getElementById('borrowBtn').addEventListener('click', () => {
    window.location.href = 'formuser/index.html';
});

// Copyright load removed for static fallback
