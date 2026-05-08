// --- KONFIGURASI INTEGRASI (TANAM) ---
const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbyXM2XdS32iEQIBcjZnv7uyswowBln22gnLOfzRi8LdKj2eM6W9cZhixL_PhQDb91jq1w/exec";

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
    setText('print-tarikhPinjam', formatDate(app.mula));
    setText('print-tarikhPulang', formatDate(app.tamat));
    setText('print-lokasi', app.lokasi || '-');
    setText('print-jenisPermohonan', app.jenis);
    setText('borang-no', app.noPermohonan || '_____');

    // Populate Digital Audit Info (Jika ada)
    setText('print-authNamaPinjam', app.authNamaPinjam || '______________________');
    setText('print-scanPinjam', formatDate(app.scanPinjam) || '______________________');
    setSignature('print-sigPinjam', app.signaturePinjam);
    
    setText('print-authNamaPulang', app.authNamaPulang || '______________________');
    setText('print-scanPulang', formatDate(app.scanPulang) || '______________________');
    setSignature('print-sigPulang', app.signaturePulang);

    // Populate Feedback Section D
    if (app.feedback) {
        try {
            const fb = JSON.parse(app.feedback);
            
            // Bulatkan Rating
            if (fb.ratings) {
                if (fb.ratings.kemudahan) circleElement(`rate-kemudahan-${fb.ratings.kemudahan}`);
                if (fb.ratings.penyampaian) circleElement(`rate-penyampaian-${fb.ratings.penyampaian}`);
                if (fb.ratings.keseluruhan) circleElement(`rate-keseluruhan-${fb.ratings.keseluruhan}`);
            }

            // Nota Cadangan
            setText('print-feedbackNotes', fb.notes || '');

            // Membantu?
            if (fb.help) {
                const helpKey = fb.help.toUpperCase().replace(/\s+/g, '_');
                circleElement(`help-${helpKey}`);
            }
        } catch (e) {
            console.error("Error parsing feedback:", e);
        }
    }

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

    }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '';
}

function setSignature(id, dataUrl) {
    const el = document.getElementById(id);
    if (el && dataUrl && dataUrl.startsWith('data:image')) {
        el.src = dataUrl;
        el.style.display = 'block';
    }
}

function circleElement(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('circled');
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr === "undefined") return "-";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        const hourStr = String(hours).padStart(2, "0");
        return `${day}/${month}/${year} ${hourStr}:${minutes} ${ampm}`;
    } catch (e) {
        return dateStr;
    }
}
