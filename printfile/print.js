// --- KONFIGURASI INTEGRASI (TANAM) ---
const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwZrFtrkH0r8p1BaPyGxQT1Tscb9jHyTtnHjm1eh8jv3Kys1vQ6xuHiPINXpRSSJ53NZg/exec";

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const appId = urlParams.get('id');

    if (appId) {
        loadApplicationData(parseInt(appId));
    } else {
        console.log('Tiada ID permohonan diberikan. Borang kosong sedia untuk diisi manual.');
    }
});

async function loadApplicationData(id) {
    let app = null;

    // 1. Cuba cari dalam LocalStorage dulu (Legacy Support)
    const apps = JSON.parse(localStorage.getItem('db_applications') || '[]');
    app = apps.find(a => a.id === id);

    // 2. Jika TIADA dalam LocalStorage, tarik dari Cloud (Turbo Sync Mode)
    if (!app && GAS_URL) {
        console.log('🔍 Menarik data dari Cloud...');
        try {
            const res = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=permohonan`);
            const result = await res.json();
            if (result.status === 'success' && result.data) {
                app = result.data.find(a => a.id === id);
            }
        } catch (e) {
            console.error('Gagal tarik dari Cloud:', e);
        }
    }

    if (!app) {
        console.error('Permohonan tidak dijumpai dalam database.');
        return;
    }

    // Populate Borrower Info
    setText('print-name', app.nama);
    setText('print-tujuan', app.tujuan);
    setText('print-noPekerja', app.noPekerja);
    setText('print-jabatan', app.jabatan);
    setText('print-noSamb', app.noSamb || '-'); // Jika ada field baru
    setText('print-phone', app.telefon);
    setText('print-tarikhPinjam', app.mula);
    setText('print-tarikhPulang', app.tamat);
    setText('print-lokasi', app.lokasi || '-');
    setText('print-jenisPermohonan', app.jenis);
    setText('borang-no', app.noPermohonan || '_____');

    // Populate Equipment Table (Section A)
    const equipmentList = document.getElementById('equipment-list');
    if (equipmentList) {
        equipmentList.innerHTML = '';

        // Pecahkan model/kuantiti/siri jika disimpan dalam format <br>
        const models = app.model ? app.model.split(', ') : [];
        const quantities = app.kuantiti ? app.kuantiti.split('<br>').map(k => k.replace('&bull; ', '').trim()) : [];
        const serialsRaw = app.siri ? app.siri.split('<br>').map(s => s.trim()).filter(s => s && s !== '-') : [];

        if (models.length > 0) {
            let serialIndex = 0;
            models.forEach((mod, index) => {
                let qtyStr = quantities[index] || '-';

                // Cari jumlah unit untuk extract nombor siri yang sepadan
                let count = 1;
                const match = qtyStr.match(/(?:-\s*)?(\d+)\s*Unit/i);
                if (match) {
                    count = parseInt(match[1], 10);
                } else if (/^\d+$/.test(qtyStr)) {
                    count = parseInt(qtyStr, 10);
                } else if (models.length === 1 && serialsRaw.length > 1) {
                    count = serialsRaw.length; // Fallback jika format lama
                }

                let siriForThisModel = [];
                for (let i = 0; i < count; i++) {
                    if (serialsRaw[serialIndex]) {
                        siriForThisModel.push(serialsRaw[serialIndex]);
                        serialIndex++;
                    }
                }
                const noSiriStr = siriForThisModel.length > 0 ? siriForThisModel.join(', ') : '-';

                const row = `
                    <tr>
                        <td style="text-align:center;">${index + 1}</td>
                        <td>${mod}</td>
                        <td style="text-align:center;">${qtyStr}</td>
                        <td>${noSiriStr}</td>
                    </tr>
                `;
                equipmentList.innerHTML += row;
            });
        }

        // Add empty rows for visual consistency
        const currentCount = models.length || 0;
        for (let i = currentCount; i < 3; i++) {
            equipmentList.innerHTML += `<tr><td style="text-align:center;">${i + 1}</td><td></td><td></td><td></td></tr>`;
        }
    }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return dateStr; // Gunakan format asal dari DB sedia ada
}
