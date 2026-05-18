const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbzslQ-3jXX1wfKVUUJPu7Tt4XB9k4tUCOuDUa93sgXwBZvUflvGIFj-wq0Op6QkCpb7kg/exec";

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const appId = urlParams.get('id');
    const compId = urlParams.get('compId');
    const catName = urlParams.get('catName');

    if (appId) {
        loadApplicationData(parseInt(appId));
    } else if (compId) {
        loadComputerData(parseInt(compId));
    } else if (catName) {
        loadCategoryData(catName);
    } else {
        console.log('Tiada ID permohonan atau komputer diberikan.');
    }
});

async function loadApplicationData(id) {
    let app = null;

    // 1. Cuba cari dalam LocalStorage
    const apps = JSON.parse(localStorage.getItem('db_applications') || '[]');
    const computers = JSON.parse(localStorage.getItem('db_computers') || '[]');
    app = apps.find(a => a.id === id);

    // 2. Jika TIADA dalam LocalStorage, tarik dari Cloud
    if ((!app || computers.length === 0) && GAS_URL) {
        console.log('Menarik data dari Cloud...');
        try {
            const resApps = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=permohonan`);
            const resultApps = await resApps.json();
            if (resultApps.status === 'success' && resultApps.data) {
                app = resultApps.data.find(a => a.id === id);
            }

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

    // --- BAHAGIAN ATAS ---
    // Mapping seperti yang diminta:
    // Jenis : kategori
    // Jenama/Model : model
    // No Siri Pembuat : noSiri (kita guna app.siri berdasarkan dashboard)
    // No Siri Pendaftaran : noPendaftaran

    setText('val-jenis', app.kategori || 'KOMPUTER RIBA (LAPTOP)');

    // Parse model jika terdapat banyak
    let displayModel = app.model || '-';
    if (displayModel.includes(', ')) {
        displayModel = displayModel.split(', ')[0]; // Ambil yang pertama jika senarai
    }
    setText('val-jenama', displayModel);

    // Parse No Siri
    let displaySiri = app.siri || app.noSiri || '-';
    if (displaySiri.includes('<br>')) {
        displaySiri = displaySiri.replace(/<br>/g, ', ');
    }
    setText('val-nosiri', displaySiri);

    setText('val-nopendaftaran', app.noPendaftaran || '-');

    // --- BAHAGIAN BAWAH (JADUAL) ---
    const tbody = document.getElementById('table-body');
    if (tbody) {
        tbody.innerHTML = ''; // Kosongkan jadual sedia ada

        // Baris Pertama - Data Permohonan (Bil: autokira, sini 1 sbb 1 rekod)

        let signatureImg = '';
        if (app.signaturePinjam && app.signaturePinjam.startsWith('data:image')) {
            signatureImg = `<img src="${app.signaturePinjam}" style="max-height: 55px; display: block; margin: 0 auto;">`;
        }


        let rowHtml = `
            <tr class="bottom-row">
                <td style="text-align:center;">1</td>
                <td>${app.nama || '-'}</td>
                <td style="text-align:center;">${formatDate(app.mula)}</td>
                <td style="text-align:center;">${formatDate(app.tamat)}</td>
                
                <!-- Tandatangan Peminjam -->
                <td style="text-align:center; vertical-align:middle; padding: 2px;">
                    ${signatureImg}
                    <div style="font-size: 9px; margin-top:2px;">${formatDate(app.scanPinjam)}</div>
                </td>

                <!-- Pegawai Pengeluar (Dikeluarkan) -->
                <td style="text-align:center;">${app.adminNamaPinjam || app.authNamaPinjam || '-'}</td>
                <td style="text-align:center;">${formatDate(app.adminTarikhPinjam || app.scanPinjam)}</td>

                <!-- Pegawai Pengeluar (Dipulangkan) -->
                <td style="text-align:center;">${app.adminNamaPulang || app.authNamaPulang || ''}</td>
                <td style="text-align:center;">${app.adminTarikhPulang || app.scanPulang ? formatDate(app.adminTarikhPulang || app.scanPulang) : ''}</td>
                
                <!-- Catatan -->
                <td></td>
            </tr>
        `;

        // Baris Tambahan (Baki baris kosong untuk penuhkan kertas, cth: 12 baris)
        for (let i = 2; i <= 13; i++) {
            rowHtml += `
                <tr class="bottom-row">
                    <td style="text-align:center;">${i}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            `;
        }

        tbody.innerHTML = rowHtml;
    }
}

async function loadComputerData(id) {
    let comp = null;
    let appsData = [];

    // Tarik data komputer dari localStorage
    const computers = JSON.parse(localStorage.getItem('db_computers') || '[]');
    comp = computers.find(c => c.id === id);

    // Tarik data permohonan dari localStorage
    appsData = JSON.parse(localStorage.getItem('db_applications') || '[]');

    if ((!comp || appsData.length === 0) && GAS_URL) {
        console.log('Menarik data dari Cloud...');
        try {
            const resComps = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=komputer`);
            const resultComps = await resComps.json();
            if (resultComps.status === 'success' && resultComps.data) {
                comp = resultComps.data.find(c => c.id === id);
            }

            const resApps = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=permohonan`);
            const resultApps = await resApps.json();
            if (resultApps.status === 'success' && resultApps.data) {
                appsData = resultApps.data;
            }
        } catch (e) {
            console.error('Gagal tarik dari Cloud:', e);
        }
    }

    if (!comp) {
        console.error('Komputer tidak dijumpai');
        return;
    }

    const compSerial = (comp.noSiri && comp.noSiri !== '-') ? comp.noSiri.trim().toLowerCase() : null;
    const compPC = (comp.noPC && comp.noPC !== '-') ? comp.noPC.trim().toLowerCase() : null;

    setText('val-jenis', comp.kategori || 'KOMPUTER RIBA (LAPTOP)');
    setText('val-jenama', comp.model || '-');
    setText('val-nosiri', comp.noSiri || comp.noPC || '-');
    setText('val-nopendaftaran', comp.noPendaftaran || '-');

    // Filter permohonan yang ada kaitan dengan no siri atau no PC komputer ini
    let relatedApps = [];
    if (compSerial || compPC) {
        relatedApps = appsData.filter(a => {
            const s = (a.siri || a.noSiri || '').toLowerCase();
            if (compSerial && s.includes(compSerial)) return true;
            if (compPC && s.includes(compPC)) return true;
            return false;
        });

        // Susun mengikut tarikh pinjam (lama ke baru)
        relatedApps.sort((a, b) => new Date(a.mula) - new Date(b.mula));
    }

    const tbody = document.getElementById('table-body');
    if (tbody) {
        let rowHtml = '';
        let count = 1;

        // Paparkan setiap permohonan berkaitan
        relatedApps.forEach(app => {
            let signatureImg = '';
            if (app.signaturePinjam && app.signaturePinjam.startsWith('data:image')) {
                signatureImg = `<img src="${app.signaturePinjam}" style="max-height: 55px; display: block; margin: 0 auto;">`;
            }

            rowHtml += `
                <tr class="bottom-row">
                    <td style="text-align:center;">${count}</td>
                    <td>${app.nama || '-'}</td>
                    <td style="text-align:center;">${formatDate(app.mula)}</td>
                    <td style="text-align:center;">${formatDate(app.tamat)}</td>
                    <td style="text-align:center; vertical-align:middle; padding: 12px;">
                        ${signatureImg}
                        
                    </td>
                    <td style="text-align:center;">${app.adminNamaPinjam || app.authNamaPinjam || '-'}</td>
                    <td style="text-align:center;">${formatDate(app.adminTarikhPinjam || app.scanPinjam)}</td>
                    <td style="text-align:center;">${app.adminNamaPulang || app.authNamaPulang || ''}</td>
                    <td style="text-align:center;">${app.adminTarikhPulang || app.scanPulang ? formatDate(app.adminTarikhPulang || app.scanPulang) : ''}</td>
                    <td></td>
                </tr>
            `;
            count++;
        });

        // Baki baris kosong (minimum 13 baris keseluruhan untuk penuhkan kertas)
        const emptyRowsNeeded = Math.max(0, 13 - relatedApps.length);
        for (let i = 0; i < emptyRowsNeeded; i++) {
            rowHtml += `
                <tr class="bottom-row">
                    <td style="text-align:center;">${count}</td>
                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
            `;
            count++;
        }

        tbody.innerHTML = rowHtml;
    }
}

// Fungsi Bantuan (Helper Functions)
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '';
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr === "undefined") return "-";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateStr;
    }
}

async function loadCategoryData(catName) {
    let computers = JSON.parse(localStorage.getItem('db_computers') || '[]');
    let appsData = JSON.parse(localStorage.getItem('db_applications') || '[]');

    if ((computers.length === 0 || appsData.length === 0) && GAS_URL) {
        console.log('Menarik data dari Cloud...');
        try {
            const resComps = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=komputer`);
            const resultComps = await resComps.json();
            if (resultComps.status === 'success' && resultComps.data) {
                computers = resultComps.data;
            }

            const resApps = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=permohonan`);
            const resultApps = await resApps.json();
            if (resultApps.status === 'success' && resultApps.data) {
                appsData = resultApps.data;
            }
        } catch (e) {
            console.error('Gagal tarik dari Cloud:', e);
        }
    }

    const categoryComps = computers.filter(c => (c.kategori || 'Lain-lain').toLowerCase() === catName.toLowerCase());
    if (categoryComps.length === 0) {
        document.body.innerHTML = `<h2 style="text-align:center; margin-top: 50px; font-family: sans-serif;">Tiada komputer dijumpai untuk kategori ${catName}</h2>`;
        return;
    }

    const templateHTML = `
        <div class="kewpa-page" style="page-break-after: always; margin-bottom: 30px;">
            <div class="header-top">
                <div class="header-right">
                    <div>BEN/MP/FA/01</div>
                    <div class="kew-pa">KEW PA-6</div>
                </div>
            </div>
            <div class="logo-container">
                <img src="../Pictrure/ums_logo.png" alt="UMS Logo" onerror="this.src='https://upload.wikimedia.org/wikipedia/ms/thumb/0/05/Logo_UMS.svg/1200px-Logo_UMS.svg.png'">
            </div>
            <div class="form-title">Daftar Pergerakan Harta Modal Dan Inventori</div>
            <table class="main-table">
                <tr>
                    <td colspan="5" class="top-left-cell">
                        <table class="inner-table">
                            <tr>
                                <td class="label-col">Jenis</td><td class="colon-col">:</td><td class="fill-col" id="val-jenis-{ID}"></td>
                            </tr>
                            <tr>
                                <td class="label-col">Jenama/Model</td><td class="colon-col">:</td><td class="fill-col" id="val-jenama-{ID}"></td>
                            </tr>
                            <tr>
                                <td class="label-col">No. Siri Pembuat</td><td class="colon-col">:</td><td class="fill-col" id="val-nosiri-{ID}"></td>
                            </tr>
                            <tr>
                                <td class="label-col">No. Siri Pendaftaran</td><td class="colon-col">:</td><td class="fill-col" id="val-nopendaftaran-{ID}"></td>
                            </tr>
                        </table>
                    </td>
                    <td colspan="4" class="pegawai-col">Pegawai Mengeluar</td>
                    <td rowspan="3" class="catatan-col">Catatan</td>
                </tr>
                <tr>
                    <th rowspan="2" style="width: 4%;">Bil</th>
                    <th rowspan="2" style="width: 17%;">Nama<br>Peminjam</th>
                    <th colspan="2" style="width: 22%;">Tarikh</th>
                    <th rowspan="2" style="width: 12%;">Tandatangan<br>Peminjam</th>
                    <th colspan="2" style="width: 18%;">Ketika Dikeluarkan</th>
                    <th colspan="2" style="width: 18%;">Ketika Dipulangkan</th>
                </tr>
                <tr>
                    <th style="width: 11%;">Dikeluarkan</th>
                    <th style="width: 11%;">Jangka<br>Dipulangkan</th>
                    <th style="width: 9%;">Tandatangan</th>
                    <th style="width: 9%;">Tarikh</th>
                    <th style="width: 9%;">Tandatangan</th>
                    <th style="width: 9%;">Tarikh</th>
                </tr>
                <tbody id="table-body-{ID}">
                </tbody>
            </table>
        </div>
    `;

    document.body.innerHTML = '';

    categoryComps.forEach(comp => {
        const pageDiv = document.createElement('div');
        pageDiv.innerHTML = templateHTML.replace(/{ID}/g, comp.id);
        document.body.appendChild(pageDiv);

        setText(`val-jenis-${comp.id}`, comp.kategori || 'KOMPUTER RIBA (LAPTOP)');
        setText(`val-jenama-${comp.id}`, comp.model || '-');
        setText(`val-nosiri-${comp.id}`, comp.noSiri || comp.noPC || '-');
        setText(`val-nopendaftaran-${comp.id}`, comp.noPendaftaran || '-');

        const compSerial = (comp.noSiri && comp.noSiri !== '-') ? comp.noSiri.trim().toLowerCase() : null;
        const compPC = (comp.noPC && comp.noPC !== '-') ? comp.noPC.trim().toLowerCase() : null;

        let relatedApps = [];
        if (compSerial || compPC) {
            relatedApps = appsData.filter(a => {
                const s = (a.siri || a.noSiri || '').toLowerCase();
                if (compSerial && s.includes(compSerial)) return true;
                if (compPC && s.includes(compPC)) return true;
                return false;
            });
            relatedApps.sort((a, b) => new Date(a.mula) - new Date(b.mula));
        }

        const tbody = document.getElementById(`table-body-${comp.id}`);
        if (tbody) {
            let rowHtml = '';
            let count = 1;
            relatedApps.forEach(app => {
                let signatureImg = '';
                if (app.signaturePinjam && app.signaturePinjam.startsWith('data:image')) {
                    signatureImg = `<img src="${app.signaturePinjam}" style="max-height: 55px; display: block; margin: 0 auto;">`;
                }


                rowHtml += `
                    <tr class="bottom-row">
                        <td style="text-align:center;">${count}</td>
                        <td>${app.nama || '-'}</td>
                        <td style="text-align:center;">${formatDate(app.mula)}</td>
                        <td style="text-align:center;">${formatDate(app.tamat)}</td>
                        <td style="text-align:center; vertical-align:middle; padding: 12px;">
                            ${signatureImg}
                        </td>
                        <td style="text-align:center;">${app.adminNamaPinjam || app.authNamaPinjam || '-'}</td>
                        <td style="text-align:center;">${formatDate(app.adminTarikhPinjam || app.scanPinjam)}</td>
                        <td style="text-align:center;">${app.adminNamaPulang || app.authNamaPulang || ''}</td>
                        <td style="text-align:center;">${app.adminTarikhPulang || app.scanPulang ? formatDate(app.adminTarikhPulang || app.scanPulang) : ''}</td>
                        <td></td>
                    </tr>
                `;
                count++;
            });

            const emptyRowsNeeded = Math.max(0, 13 - relatedApps.length);
            for (let i = 0; i < emptyRowsNeeded; i++) {
                rowHtml += `
                    <tr class="bottom-row">
                        <td style="text-align:center;">${count}</td>
                        <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                    </tr>
                `;
                count++;
            }
            tbody.innerHTML = rowHtml;
        }
    });
}
