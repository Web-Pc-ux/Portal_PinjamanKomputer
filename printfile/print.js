// --- KONFIGURASI INTEGRASI (TANAM) ---
const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbzslQ-3jXX1wfKVUUJPu7Tt4XB9k4tUCOuDUa93sgXwBZvUflvGIFj-wq0Op6QkCpb7kg/exec";

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
    const computers = JSON.parse(localStorage.getItem('db_computers') || '[]');
    app = apps.find(a => a.id === id);

    // 2. Jika TIADA dalam LocalStorage, tarik dari Cloud (Turbo Sync Mode)
    if ((!app || computers.length === 0) && GAS_URL) {
        console.log('🔍 Menarik data dari Cloud...');
        try {
            // Tarik permohonan
            const resApps = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=permohonan`);
            const resultApps = await resApps.json();
            if (resultApps.status === 'success' && resultApps.data) {
                app = resultApps.data.find(a => a.id === id);
            }

            // Tarik komputer/peralatan (untuk cari model spesifik)
            const resComps = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=komputer`);
            const resultComps = await resComps.json();
            if (resultComps.status === 'success' && resultComps.data) {
                localStorage.setItem('db_computers', JSON.stringify(resultComps.data));
            }
        } catch (e) {
            console.error('Gagal tarik dari Cloud:', e);
        }
    }

    if (!app) {
        console.error('Permohonan tidak dijumpai');
        return;
    }

    // Populate Borrower Info
    setText('print-name', app.nama);
    setText('print-tujuan', app.tujuan);
    setText('print-noPekerja', app.noPekerja);
    setText('print-jabatan', app.jabatan);
    setText('print-noSamb', app.noSamb || '-'); // Jika ada field baru
    // Fix Telefon display: buang ' jika ada
    let displayPhone = app.telefon || '-';
    if (displayPhone.startsWith("'")) displayPhone = displayPhone.substring(1);
    setText('print-phone', displayPhone);
    setText('print-tarikhPinjam', formatDate(app.mula));
    setText('print-tarikhPulang', formatDate(app.tamat));
    setText('print-lokasi', app.lokasi || '-');
    setText('print-jenisPermohonan', app.jenis);
    setText('borang-no', app.noPermohonan || '_____');

    // Populate Digital Audit Info (Jika ada)
    // Seksyen Pinjam
    if (app.authNamaPinjam || app.adminNamaPinjam) {
        setText('print-adminNama', app.adminNamaPinjam || app.authNamaPinjam);
        setText('print-adminTarikh', formatDate(app.adminTarikhPinjam || app.scanPinjam));
        const adminSigPinjam = document.getElementById('print-adminSigPinjam');
        if (adminSigPinjam) adminSigPinjam.style.display = 'inline';

        setText('print-authNamaPinjam', app.authNamaPinjam || '______________________');
        setText('print-scanPinjam', formatDate(app.scanPinjam) || '______________________');
        setSignature('print-sigPinjam', app.signaturePinjam);
    }

    // Seksyen Pulang
    if (app.authNamaPulang || app.adminNamaPulang) {
        setText('print-adminNamaPulang', app.adminNamaPulang || app.authNamaPulang);
        setText('print-adminTarikhPulang', formatDate(app.adminTarikhPulang || app.scanPulang));
        const adminSigPulang = document.getElementById('print-adminSigPulang');
        if (adminSigPulang) adminSigPulang.style.display = 'inline';

        setText('print-authNamaPulang', app.authNamaPulang || '______________________');
        setText('print-scanPulang', formatDate(app.scanPulang) || '______________________');
        setSignature('print-sigPulang', app.signaturePulang);
    }

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
                // Hilangkan kuantiti dari nama model (Contoh: "Model - 1 Unit" -> "Model")
                if (mod.includes(' - ')) {
                    mod = mod.split(' - ')[0].trim();
                } else if (mod.includes('-')) {
                    // Fallback jika tiada space tetapi ada dash dihujung
                    const parts = mod.split('-');
                    if (parts.length > 1 && parts[parts.length - 1].toLowerCase().includes('unit')) {
                        parts.pop();
                        mod = parts.join('-').trim();
                    }
                }

                let qtyStr = quantities[index] || '-';

                // Hilangkan nama model dari string kuantiti (Contoh: "Model - 1 Unit" -> "1 Unit")
                if (qtyStr.includes(' - ')) {
                    qtyStr = qtyStr.split(' - ').pop().trim();
                } else if (qtyStr.includes('-')) {
                    // Fallback jika tiada space
                    qtyStr = qtyStr.split('-').pop().trim();
                }

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
                let specificModelName = "";

                for (let i = 0; i < count; i++) {
                    const currentSiri = serialsRaw[serialIndex];
                    if (currentSiri) {
                        siriForThisModel.push(currentSiri);

                        // Cuba cari model spesifik dari database komputer (hanya untuk item pertama dalam group)
                        if (i === 0 && typeof computers !== 'undefined' && computers.length > 0) {
                            const comp = computers.find(c =>
                                (c.noPC && c.noPC.toString().trim().toLowerCase() === currentSiri.toLowerCase()) ||
                                (c.noSiri && c.noSiri.toString().trim().toLowerCase() === currentSiri.toLowerCase())
                            );
                            if (comp && comp.model) {
                                specificModelName = comp.model;
                            }
                        }
                        serialIndex++;
                    }
                }

                const noSiriStr = siriForThisModel.length > 0 ? siriForThisModel.join(', ') : '-';
                const displayName = specificModelName ? `${mod} (${specificModelName})` : mod;

                const row = `
                    <tr>
                        <td style="text-align:center;">${index + 1}</td>
                        <td>${displayName}</td>
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
        const ampm = hours >= 12 ? "petang" : "pagi";
        hours = hours % 12 || 12;
        const hourStr = String(hours).padStart(2, "0");
        return `${day}/${month}/${year} ${hourStr}:${minutes} ${ampm}`;
    } catch (e) {
        return dateStr;
    }
}
