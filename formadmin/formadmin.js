/* ==============================
   LOCAL STORAGE HELPERS
============================== */
const DB_KEYS = {
    APPS: 'db_applications',
    COMPS: 'db_computers',
    ADMINS: 'db_admins'
};

// In-Memory Storage for Cloud Only mode
let CORE_DATA = {
    [DB_KEYS.APPS]: [],
    [DB_KEYS.COMPS]: [],
    'db_categories': []
};

function getDB(key) {
    // Only settings stay in localStorage
    if (key === 'db_settings') {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : {};
    }
    return CORE_DATA[key] || [];
}

function saveDB(key, data) {
    if (key === 'db_settings') {
        localStorage.setItem(key, JSON.stringify(data));
        return;
    }
    CORE_DATA[key] = data;
}

/* ==============================
   PAGE CONTROL
============================== */
const agreeBtn = document.getElementById('agreeBtn');
const page1 = document.getElementById('page1');
const page2 = document.getElementById('page2');
const form = document.getElementById('applicationForm');

if (agreeBtn) {
    agreeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        page1.style.display = 'none';
        page2.style.display = 'block';
    });
}

/* ==============================
   DYNAMIC MODEL BUILDER
   (reads from db_computers & db_categories)
============================== */
function buildModelSection() {
    const container = document.getElementById('modelContainer');
    if (!container) return;

    const computers = getDB(DB_KEYS.COMPS);
    const categories = getDB('db_categories');
    const apps = getDB(DB_KEYS.APPS);

    if ((!categories || categories.length === 0) && (!computers || computers.length === 0)) {
        container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin" style="color:var(--primary); font-size:1.5rem;"></i><p style="color:#666; font-size:0.9em; margin-top:10px;">Menarik data peralatan terkini...</p></div>';
        return;
    }

    // Build set of borrowed computer identifiers (noPC or noSiri) from active apps
    const borrowedIds = new Set();
    apps.forEach(app => {
        if (app.status === 'Menunggu' || app.status === 'Lulus' || app.status === 'Baru' || app.status === 'Lewat') {
            const siriField = (app.siri || '').replace(/<br\s*\/?>/gi, '\n');
            siriField.split('\n').forEach(entry => {
                const trimmed = entry.trim().toLowerCase();
                if (trimmed && trimmed !== '-') {
                    borrowedIds.add(trimmed);
                }
            });
        }
    });

    // Count borrowed units per category from active applications (Quota Calculation)
    const borrowedPerCat = {};
    apps.forEach(app => {
        const st = (app.status || '').toUpperCase();
        const activeStatuses = ['MENUNGGU', 'LULUS', 'BARU', 'LEWAT', 'DIPINJAM', 'APPROVE'];

        if (activeStatuses.includes(st)) {
            const isAssigned = ['LULUS', 'DIPINJAM', 'APPROVE', 'LEWAT'].includes(st);
            const models = (app.model || '').split(',').map(m => m.trim().toLowerCase());

            if (isAssigned && app.siri && app.siri !== '-') {
                const siriList = app.siri.split('<br>').filter(s => s.trim() && s.trim() !== '-');
                const siriCount = siriList.length;
                if (models.length === 1) {
                    borrowedPerCat[models[0]] = (borrowedPerCat[models[0]] || 0) + siriCount;
                } else {
                    const kuantitiStr = (app.kuantiti || '').replace(/<br\s*\/?>/gi, '\n').replace(/&bull;/g, '•');
                    kuantitiStr.split('\n').forEach(line => {
                        const match = line.match(/•?\s*(.+?)\s*[-–—]\s*(\d+)/i);
                        if (match) {
                            const catName = match[1].trim().toLowerCase();
                            const qty = parseInt(match[2], 10);
                            borrowedPerCat[catName] = (borrowedPerCat[catName] || 0) + qty;
                        }
                    });
                }
            } else {
                const kuantitiStr = (app.kuantiti || '').replace(/<br\s*\/?>/gi, '\n').replace(/&bull;/g, '•');
                kuantitiStr.split('\n').forEach(line => {
                    const match = line.match(/•?\s*(.+?)\s*[-–—]\s*(\d+)/i);
                    if (match) {
                        const catName = match[1].trim().toLowerCase();
                        const qty = parseInt(match[2], 10);
                        borrowedPerCat[catName] = (borrowedPerCat[catName] || 0) + qty;
                    }
                });
            }
        }
    });

    // Group computers by kategori, filtering out borrowed ones
    const grouped = {};
    categories.forEach(cat => {
        grouped[cat.nama] = [];
    });

    computers.forEach(comp => {
        const cat = comp.kategori || 'Lain-lain';
        if (!grouped[cat]) grouped[cat] = [];

        const pcId = (comp.noPC || '').toLowerCase().trim();
        const siriId = (comp.noSiri || '').toLowerCase().trim();

        const isBorrowed = (pcId && borrowedIds.has(pcId)) || (siriId && borrowedIds.has(siriId));

        grouped[cat].push({
            ...comp,
            isBorrowed
        });
    });

    let html = '';
    let catIndex = 0;

    Object.keys(grouped).forEach(catName => {
        const allItems = grouped[catName];
        const totalCount = allItems.length;
        const quotaUsed = borrowedPerCat[catName.toLowerCase()] || 0;
        const availableQuota = Math.max(0, totalCount - quotaUsed);

        const availableItems = allItems.filter(c => !c.isBorrowed);
        const catId = catName.replace(/\s+/g, '_').toLowerCase();
        const isFirst = catIndex === 0;

        html += `
            <div class="item-group" ${!isFirst ? 'style="margin-top:15px;"' : ''}>
                <label id="label-${catId}">
                    <input type="checkbox" class="cat-check" data-cat="${catId}" ${availableQuota === 0 ? 'disabled' : ''} />
                    ${catName} (${availableQuota} Tersedia)
                    <span class="stock-status ${availableQuota === 0 ? 'out-of-stock' : ''}">${availableQuota === 0 ? 'HABIS' : ''}</span>
                </label>

                <div class="sub-models" id="models-${catId}" style="display:none;">
                    ${availableItems.slice(0, availableQuota).map(comp => `
                        <label>
                            <input type="checkbox" name="model_${catId}" value="${comp.model}" data-nopc="${comp.noPC || ''}" data-nosiri="${comp.noSiri || ''}" />
                            ${comp.model} ${comp.noPC ? '(' + comp.noPC + ')' : ''}
                        </label>
                    `).join('')}
                    ${availableQuota === 0 ? '<p style="color:#999; font-size:0.85em; padding:5px 0;">Semua unit sedang dipinjam.</p>' : ''}
                </div>
            </div>
        `;
        catIndex++;
    });

    container.innerHTML = html;

    // Attach toggle event listeners
    container.querySelectorAll('.cat-check').forEach(check => {
        check.addEventListener('change', () => {
            const catId = check.dataset.cat;
            const subModels = document.getElementById('models-' + catId);
            if (check.checked) {
                subModels.style.display = 'block';
            } else {
                subModels.style.display = 'none';
                subModels.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            }
        });
    });
}

/* ==============================
   GENERATE NO PERMOHONAN
============================== */
function generateApplicationNo() {
    const apps = getDB(DB_KEYS.APPS);
    const now = new Date();
    const year = now.getFullYear();

    const yearApps = apps.filter(app => {
        const match = app.noPermohonan && app.noPermohonan.match(/\/(\d{4})$/);
        return match && parseInt(match[1]) === year;
    });

    const nextNum = yearApps.length + 1;
    const padded = String(nextNum).padStart(4, '0');
    return `Digital-${padded}/${year}`;
}

/* ==============================
   GENERATE UNIQUE ID
============================== */
function generateId() {
    const apps = getDB(DB_KEYS.APPS);
    if (apps.length === 0) return 1;
    return Math.max(...apps.map(a => a.id || 0)) + 1;
}

/* ==============================
   FORMAT DATETIME
============================== */
function formatDateTime(dtString) {
    if (!dtString) return '-';
    const dt = new Date(dtString);
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    const hours = String(dt.getHours()).padStart(2, '0');
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/* ==============================
   CREATE POPUP MODAL
============================== */
const modalDiv = document.createElement('div');
modalDiv.id = 'successModal';
modalDiv.style.position = 'fixed';
modalDiv.style.top = '0';
modalDiv.style.left = '0';
modalDiv.style.width = '100%';
modalDiv.style.height = '100%';
modalDiv.style.backgroundColor = 'rgba(0,0,0,0.5)';
modalDiv.style.display = 'none';
modalDiv.style.justifyContent = 'center';
modalDiv.style.alignItems = 'center';
modalDiv.style.zIndex = '9999';

const modalContent = document.createElement('div');
modalContent.style.background = '#fff';
modalContent.style.borderRadius = '12px';
modalContent.style.padding = '30px';
modalContent.style.textAlign = 'center';
modalContent.style.maxWidth = '400px';
modalContent.style.width = '90%';
modalContent.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';

const modalMessage = document.createElement('h3');
modalMessage.textContent = '✅ Borang Berjaya Dihantar!';
modalMessage.style.color = '#2a3eb1';

const modalAppNo = document.createElement('p');
modalAppNo.style.marginTop = '10px';
modalAppNo.style.fontSize = '0.95rem';

const modalBtn = document.createElement('button');
modalBtn.textContent = 'Tutup';
modalBtn.style.marginTop = '20px';
modalBtn.style.padding = '8px 20px';
modalBtn.style.border = 'none';
modalBtn.style.borderRadius = '5px';
modalBtn.style.backgroundColor = '#2a3eb1';
modalBtn.style.color = '#fff';
modalBtn.style.cursor = 'pointer';

modalBtn.addEventListener('click', () => {
    modalDiv.style.display = 'none';
    window.location.href = '../dashboard/main.html';
});

modalContent.appendChild(modalMessage);
modalContent.appendChild(modalAppNo);
modalContent.appendChild(modalBtn);
modalDiv.appendChild(modalContent);
document.body.appendChild(modalDiv);

/* ==============================
   FORM SUBMIT
============================== */
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const container = document.getElementById('modelContainer');
        const checkedCats = container.querySelectorAll('.cat-check:checked');
        if (checkedCats.length === 0) {
            alert('Sila pilih sekurang-kurangnya 1 kategori peralatan');
            return;
        }

        let valid = true;
        checkedCats.forEach(catCheck => {
            const catId = catCheck.dataset.cat;
            const selected = container.querySelectorAll(`input[name="model_${catId}"]:checked`);
            if (selected.length === 0) {
                const catName = catCheck.parentElement.textContent.trim().split('(')[0].trim();
                alert(`Sila pilih sekurang-kurangnya 1 model untuk ${catName}`);
                valid = false;
            }
        });
        if (!valid) return;

        const appNo = generateApplicationNo();
        const newId = generateId();

        let models = [];
        let kuantitiParts = [];
        let siriParts = [];

        checkedCats.forEach(catCheck => {
            const catId = catCheck.dataset.cat;
            const catName = catCheck.parentElement.textContent.trim().split('(')[0].trim();
            const selectedModels = Array.from(container.querySelectorAll(`input[name="model_${catId}"]:checked`));
            kuantitiParts.push(`&bull; ${catName} - ${selectedModels.length} Unit`);

            selectedModels.forEach(cb => {
                const noPC = cb.dataset.nopc || '';
                const noSiri = cb.dataset.nosiri || '';
                let label = cb.value;
                if (noPC || noSiri) {
                    label += ' (' + [noPC, noSiri].filter(Boolean).join('/') + ')';
                }
                models.push(label);
                siriParts.push(noPC || noSiri || cb.value);
            });
        });

        const now = new Date();
        const timestamp = now.toLocaleDateString('ms-MY') + ' ' + now.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });

        const newApp = {
            id: newId,
            noPermohonan: appNo,
            nama: document.getElementById('name').value,
            noPekerja: document.getElementById('noPekerja').value,
            jabatan: document.getElementById('jabatan').value,
            telefon: document.getElementById('phone').value,
            email: document.getElementById('email').value,
            jenis: document.getElementById('jenisPermohonan').value,
            lokasi: document.getElementById('lokasi').value,
            tujuan: document.getElementById('tujuan').value,
            mula: formatDateTime(document.getElementById('tarikhMasaPinjam').value),
            tamat: formatDateTime(document.getElementById('tarikhMasaPulangan').value),
            model: models.join(', ') || '-',
            kuantiti: kuantitiParts.join('<br>') || '-',
            siri: siriParts.join('<br>') || '-',
            scanPinjam: '-',
            scanPulang: '-',
            catatanAdmin: '',
            status: 'Menunggu',
            timestamp: timestamp
        };

        // Kirim ke Google Sheets (GAS)
        syncToGAS(newApp);

        // Update Local Data
        const apps = getDB(DB_KEYS.APPS);
        apps.push(newApp);
        saveDB(DB_KEYS.APPS, apps);
        buildModelSection();

        console.log('✅ Data dihantar dan baki dikemaskini');

        modalAppNo.textContent = `No Permohonan Anda: ${appNo}`;
        modalDiv.style.display = 'flex';

        form.reset();
        container.querySelectorAll('.sub-models').forEach(sm => sm.style.display = 'none');
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

        page2.style.display = 'none';
        page1.style.display = 'block';
    });
}

// --- KONFIGURASI INTEGRASI (TANAM) ---
const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwZrFtrkH0r8p1BaPyGxQT1Tscb9jHyTtnHjm1eh8jv3Kys1vQ6xuHiPINXpRSSJ53NZg/exec";

async function syncToGAS(data) {
    if (!GAS_URL) return;
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: 'create',
                token: GAS_TOKEN,
                data: { ...data, jenis_data: 'permohonan' }
            })
        });
    } catch (error) {
        console.error('❌ GAS Sync Error:', error);
    }
}

async function fetchInitialData() {
    if (!GAS_URL) return;
    buildModelSection();

    try {
        console.log('🚀 Mula Turbo Sync (Form Admin - Bulk)...');
        const resData = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=all`);
        const result = await resData.json();

        if (result && result.status === 'success' && result.data) {
            const allData = result.data;
            let hasChanges = false;

            const mappings = [
                { sheet: 'komputer', key: DB_KEYS.COMPS },
                { sheet: 'kategori', key: 'db_categories' },
                { sheet: 'permohonan', key: DB_KEYS.APPS }
            ];

            mappings.forEach(m => {
                const newData = allData[m.sheet] || [];
                const key = m.key;
                const currentDataStr = JSON.stringify(key === 'db_categories' ? (CORE_DATA['db_categories'] || []) : getDB(key));
                const newDataStr = JSON.stringify(newData);

                if (currentDataStr !== newDataStr) {
                    if (key === 'db_categories') {
                        CORE_DATA['db_categories'] = newData;
                        localStorage.setItem('db_categories', newDataStr);
                    } else {
                        saveDB(key, newData);
                    }
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                console.log('✨ Data dikemaskini (Turbo Mode).');
                buildModelSection();
            }
        }
    } catch (e) {
        console.error('❌ Gagal Turbo Sync:', e);
    }
}

/* ==============================
   INIT
============================== */
document.addEventListener('DOMContentLoaded', () => {
    fetchInitialData();
});