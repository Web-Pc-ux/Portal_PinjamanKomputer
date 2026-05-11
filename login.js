/* ==============================
   CLOUD LOGIN & SECURITY
============================== */
// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCkXpGW5uQRWos4J8Bnsctdshs6hf3Wti0",
    authDomain: "loginpage-38cbb.firebaseapp.com",
    databaseURL: "https://loginpage-38cbb-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "loginpage-38cbb",
    storageBucket: "loginpage-38cbb.appspot.com",
    messagingSenderId: "330112161697",
    appId: "1:330112161697:web:0b687c4e5db4d0c40d1de0",
    measurementId: "G-LC3Q7E8BSH"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
// Initial Routing & URL Cleaning for Login Page
document.addEventListener('DOMContentLoaded', () => {
    // Bersihkan URL: Buang 'index.html' jika ada
    if (window.location.pathname.endsWith('index.html')) {
        const cleanPath = window.location.pathname.replace('index.html', '');
        window.history.replaceState({}, '', cleanPath + (window.location.hash || '#login'));
    }

    if (!window.location.hash) {
        window.location.hash = 'login';
    }
});

const auth = firebase.auth();
const db = firebase.firestore();

const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbxfA_6FxdnHQC6ngT0kBjNCbFMz6_-NJ-Y1tm1CGl-PWC9oFnV_WecJg9h36UT7UmyhLA/exec";

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

// Manual login logic removed to favor Microsoft SSO



// Microsoft Sign-In Logic
const msBtn = document.getElementById('msBtn');
if (msBtn) {
    msBtn.addEventListener('click', async () => {
        const btnMs = document.getElementById('msBtn');
        const originalText = '<img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft Logo" style="width:20px; height:20px; margin-right:10px;"> Log Masuk dengan Microsoft';

        try {
            btnMs.disabled = true;
            btnMs.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i> Memproses...';

            const resetBtnOnFocus = () => {
                setTimeout(() => {
                    btnMs.disabled = false;
                    btnMs.innerHTML = originalText;
                    window.removeEventListener('focus', resetBtnOnFocus);
                }, 800);
            };
            window.addEventListener('focus', resetBtnOnFocus);

            const provider = new firebase.auth.OAuthProvider('microsoft.com');
            // Minta akses untuk mendapatkan emel
            provider.addScope('email');
            provider.addScope('User.Read');
            provider.addScope('User.ReadBasic.All'); // Diperlukan untuk mencari pengguna lain dalam organisasi

            const result = await auth.signInWithPopup(provider);
            
            // Tunjukkan loading overlay selepas popup ditutup (untuk proses pengesahan akaun)
            Swal.fire({
                title: 'Mengesahkan Akaun...',
                text: 'Sila tunggu sebentar, kami sedang menyediakan dashboard anda.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const user = result.user;

            // Kadangkala Microsoft tidak memberikan 'user.email' secara terus. Kita ambil dari profil UPN.
            let email = user.email;
            if (!email && result.additionalUserInfo && result.additionalUserInfo.profile) {
                email = result.additionalUserInfo.profile.mail || result.additionalUserInfo.profile.userPrincipalName;
            }
            if (!email && user.providerData && user.providerData.length > 0) {
                email = user.providerData[0].email;
            }

            if (!email) {
                await auth.signOut();
                throw new Error("Gagal membaca emel dari akaun Microsoft anda.");
            }

            let finalAdmin = await findAdmin(email);
            const msName = user.displayName || (result.additionalUserInfo && result.additionalUserInfo.profile && result.additionalUserInfo.profile.displayName) || email.split('@')[0];

            if (!finalAdmin) {
                console.log("ℹ️ Tiada padanan di Excel. Melog masuk sebagai Pengguna Biasa.");
                finalAdmin = {
                    nama: msName,
                    username: email.split('@')[0],
                    peranan: 'User', // Wajib User
                    email: email
                };
            }

            // Pastikan peranan adalah string dan bersih
            const rawRole = (getVal(finalAdmin, 'peranan') || 'User').toString().toLowerCase().trim();
            const isAdmin = (rawRole === 'admin' || rawRole === 'pemilik' || rawRole === 'pentadbir');

            // 2. Setup Session
            const usernameKey = (getVal(finalAdmin, 'username') || email.split('@')[0]).toLowerCase().trim();
            const userDocRef = db.collection('admins').doc(usernameKey);

            const userDoc = await userDocRef.get();
            const existingSession = userDoc.exists ? userDoc.data().sessionId : null;
            const newSessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

            const localSession = localStorage.getItem('loggedInAdmin');
            let isSameDevice = false;
            if (localSession) {
                try {
                    const localData = JSON.parse(localSession);
                    if (localData.username && localData.username.toLowerCase().trim() === usernameKey && localData.sessionId === existingSession) {
                        isSameDevice = true;
                    }
                } catch (e) { }
            }

            if (existingSession && !isSameDevice) {
                const confirmResult = await Swal.fire({
                    title: 'Akaun Sedang Digunakan',
                    text: `ID "${usernameKey}" dikesan sedang aktif di peranti lain. Teruskan dan log keluar peranti tersebut?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Ya, Teruskan',
                    cancelButtonText: 'Batal'
                });

                if (!confirmResult.isConfirmed) {
                    await auth.signOut();
                    btnMs.disabled = false;
                    btnMs.innerHTML = originalText;
                    return;
                }
            }

            btnMs.innerHTML = '<i class="fas fa-check" style="margin-right:8px;color:green;"></i> Berjaya!';

            await userDocRef.set({
                uid: user.uid,
                nama: msName || getVal(finalAdmin, 'nama') || '',
                email: email,
                username: getVal(finalAdmin, 'username') || email.split('@')[0],
                jawatan: getVal(finalAdmin, 'jawatan') || '',
                peranan: getVal(finalAdmin, 'peranan') || 'User',
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                sessionId: newSessionId
            }, { merge: true });

            // 2. Setup Session
            const sessionData = {
                id: getVal(finalAdmin, 'id') || 99,
                uid: user.uid,
                nama: msName || getVal(finalAdmin, 'nama') || '',
                username: usernameKey,
                email: email,
                peranan: (getVal(finalAdmin, 'peranan') || 'User').toString().trim(),
                loginTime: new Date().toISOString(),
                sessionId: newSessionId
            };

            localStorage.setItem('loggedInAdmin', JSON.stringify(sessionData));
            localStorage.removeItem('activeDashboardSection');

            // 2.5 Simpan Access Token Microsoft (untuk kegunaan carian direktori di halaman lain)
            if (result.credential && result.credential.accessToken) {
                localStorage.setItem('msGraphToken', result.credential.accessToken);
            }

            // 3. SUCCESS NOTIFICATION & REDIRECTION
            const displayName = msName || getVal(finalAdmin, 'nama') || email.split('@')[0];
            
            btnMs.innerHTML = `<i class="fas fa-check"></i> Selamat Datang, ${displayName}!`;

            setTimeout(() => {
                if (isAdmin) {
                    console.log("➡️ Redirecting MS to ADMIN Dashboard");
                    window.location.href = 'dashboard/';
                } else {
                    console.log("➡️ Redirecting MS to USER Portal");
                    window.location.href = 'UserS/';
                }
            }, 1000);

        } catch (err) {
            btnMs.disabled = false;
            btnMs.innerHTML = originalText;
            console.error(err);
            if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
                Swal.fire({
                    icon: 'error',
                    title: 'Log Masuk Gagal',
                    text: err.message || 'Ralat semasa log masuk dengan Microsoft.'
                });
            }
        }
    });
}



// Copyright load removed for static fallback
