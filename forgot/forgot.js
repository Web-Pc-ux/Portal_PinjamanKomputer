const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwZrFtrkH0r8p1BaPyGxQT1Tscb9jHyTtnHjm1eh8jv3Kys1vQ6xuHiPINXpRSSJ53NZg/exec";

/* ==============================
   FORGOT PASSWORD — SEARCH FROM CLOUD
============================== */
const searchBtn = document.getElementById('searchBtn');
const requestBtn = document.getElementById('requestBtn');
const resultDiv = document.getElementById('result');
const input = document.getElementById('userid');

// Firebase Configuration (Same as login.js)
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

let targetEmail = "";

searchBtn.addEventListener('click', async () => {
    const val = input.value.trim().toLowerCase();
    resultDiv.style.display = 'none';
    requestBtn.style.display = 'none';
    targetEmail = "";

    if (val.length === 0) {
        Swal.fire('Perhatian', 'Silakan masukkan Username atau Email.', 'warning');
        return;
    }

    searchBtn.disabled = true;
    searchBtn.textContent = 'Mencari...';

    try {
        // KESELAMATAN: Hanya tarik 1 rekod mengikut carian (Cegah Leak Admin List)
        const url = `${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=admin&search=${encodeURIComponent(val)}`;
        const res = await fetch(url);
        const result = await res.json();

        if (result.status === 'success' && result.data && result.data.length > 0) {
            const admin = result.data[0];

            // Fallback email logic (Same as login.js)
            targetEmail = admin.email || (admin.username ? admin.username + "@ums.edu.my" : "");

            resultDiv.innerHTML = `
                    <div style="color: #059669; font-weight: 600; margin-bottom: 0.5rem;">Akaun Dijumpai</div>
                    <div style="text-align: left; background: #f8fafc; padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div><strong>Nama:</strong> ${admin.nama}</div>
                        <div><strong>Username:</strong> ${admin.username || '-'}</div>
                        <div><strong>Email:</strong> ${targetEmail || '-'}</div>
                    </div>
                `;
            resultDiv.style.display = 'block';
            if (targetEmail) {
                requestBtn.style.display = 'inline-block';
            } else {
                resultDiv.innerHTML += `<div style="color: #dc2626; font-size: 0.85rem; margin-top: 0.5rem;">Ralat: Alamat email tidak dijumpai. Sila hubungi pentadbir.</div>`;
            }
        } else {
            resultDiv.textContent = 'Username atau Email tidak ditemukan dalam sistem.';
            resultDiv.style.display = 'block';
        }
    } catch (e) {
        resultDiv.textContent = 'Ralat menghubungi Cloud. Sila cuba lagi.';
        resultDiv.style.display = 'block';
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Cari Maklumat';
    }
});

requestBtn.addEventListener('click', async () => {
    if (!targetEmail) return;

    requestBtn.disabled = true;
    requestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menghantar...';

    try {
        await auth.sendPasswordResetEmail(targetEmail);

        Swal.fire({
            title: 'Berjaya!',
            text: 'Pautan tetapan semula kata laluan telah dihantar ke email anda. Sila semak peti masuk (Inbox) atau Spam.',
            icon: 'success',
            confirmButtonText: 'Terima Kasih'
        });

        resultDiv.style.display = 'none';
        requestBtn.style.display = 'none';
        input.value = "";
    } catch (error) {
        console.error("Reset Error:", error);
        let errorMsg = 'Gagal menghantar email tetapan semula. Sila hubungi pentadbir.';

        if (error.code === 'auth/user-not-found') {
            errorMsg = 'Akaun ini belum berdaftar secara penuh di sistem keselamatan (Firebase). Sila hubungi pentadbir untuk reset secara manual.';
        }

        Swal.fire('Ralat', errorMsg, 'error');
    } finally {
        requestBtn.disabled = false;
        requestBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Mohon Set Semula';
    }
});

// ... kode JS yang sudah ada ...

document.getElementById('backBtn').addEventListener('click', () => {
    window.history.back(); // atau boleh ganti dengan window.location.href = 'page1.html';
});
