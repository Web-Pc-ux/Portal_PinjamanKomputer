const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwZrFtrkH0r8p1BaPyGxQT1Tscb9jHyTtnHjm1eh8jv3Kys1vQ6xuHiPINXpRSSJ53NZg/exec";

/* ==============================
   FORGOT PASSWORD — SEARCH FROM CLOUD
============================== */
const searchBtn = document.getElementById('searchBtn');
const requestBtn = document.getElementById('requestBtn');
const resultDiv = document.getElementById('result');
const input = document.getElementById('userid');

searchBtn.addEventListener('click', async () => {
    const val = input.value.trim().toLowerCase();
    resultDiv.style.display = 'none';
    requestBtn.style.display = 'none';

    if (val.length === 0) {
        alert('Silakan masukkan Username atau Email.');
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
            resultDiv.innerHTML = `
                    <div style="color: #059669; font-weight: 600; margin-bottom: 0.5rem;">Akaun Dijumpai</div>
                    <div style="text-align: left; background: #f8fafc; padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div><strong>Nama:</strong> ${admin.nama}</div>
                        <div><strong>Username:</strong> ${admin.username || '-'}</div>
                        <div><strong>Email:</strong> ${admin.email}</div>
                    </div>
                `;
            resultDiv.style.display = 'block';
            requestBtn.style.display = 'inline-block';
        } else {
            resultDiv.textContent = 'Username atau Email tidak ditemukan dalam sistem.';
            resultDiv.style.display = 'block';
        }
    } catch (e) {
        resultDiv.textContent = 'Ralat menghubungi Cloud. Sila cuba lagi.';
        resultDiv.style.display = 'block';
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Cek Akun';
    }
});

requestBtn.addEventListener('click', () => {
    alert('Permintaan tetapan semula kata laluan telah dihantar ke email anda.');
});

// ... kode JS yang sudah ada ...

document.getElementById('backBtn').addEventListener('click', () => {
    window.history.back(); // atau boleh ganti dengan window.location.href = 'page1.html';
});

