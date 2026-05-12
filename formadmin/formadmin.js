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
const page2 = document.getElementById('page2');
const form = document.getElementById('applicationForm');

// Toggle Jenis Lain
const jenisPermohonanSelect = document.getElementById('jenisPermohonan');
const divJenisLain = document.getElementById('divJenisLain');
const inputJenisLain = document.getElementById('jenisLain');

if (jenisPermohonanSelect) {
    jenisPermohonanSelect.addEventListener('change', () => {
        if (jenisPermohonanSelect.value === 'Lain-lain') {
            divJenisLain.style.display = 'block';
            inputJenisLain.required = true;
        } else {
            divJenisLain.style.display = 'none';
            inputJenisLain.required = false;
            inputJenisLain.value = '';
        }
    });
}

/* ==============================
   EMAIL AUTO-FILL (Search from history)
============================== */
const emailInput = document.getElementById('email');
const suggestionsBox = document.getElementById('emailSuggestions');

if (emailInput) {
    emailInput.addEventListener('input', () => {
        const query = emailInput.value.toLowerCase().trim();
        
        // Sembunyi jika kosong
        if (query.length < 1) {
            suggestionsBox.style.display = 'none';
            return;
        }

        const apps = getDB(DB_KEYS.APPS);
        console.log(`🔍 Carian emel: "${query}" | Total Rekod: ${apps.length}`);

        // Ambil pemohon unik berdasarkan emel (terkini dahulu) dari database tempatan
        const uniqueUsers = {};
        [...apps].reverse().forEach(app => {
            const email = (app.email || '').toLowerCase().trim();
            if (email && email !== '-' && !uniqueUsers[email]) {
                uniqueUsers[email] = {
                    nama: app.nama,
                    noPekerja: app.noPekerja,
                    telefon: app.telefon,
                    jabatan: app.jabatan,
                    email: app.email,
                    source: 'History'
                };
            }
        });

        const localMatches = Object.values(uniqueUsers).filter(u => 
            u.email.toLowerCase().includes(query) || 
            u.nama.toLowerCase().includes(query)
        ).slice(0, 3);

        renderSuggestions(localMatches);

        // --- TAMBAHAN: Carian Microsoft Graph (Jika Log Masuk MS) ---
        const msToken = localStorage.getItem('msGraphToken');
        if (msToken && query.length >= 3) {
            searchMicrosoftGraph(query, msToken, localMatches);
        }
    });

    // Sembunyi bila klik luar
    document.addEventListener('click', (e) => {
        if (!emailInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.style.display = 'none';
        }
    });
}

async function searchMicrosoftGraph(query, token, localMatches) {
    try {
        const url = `https://graph.microsoft.com/v1.0/users?$filter=startsWith(displayName,'${query}') or startsWith(mail,'${query}') or startsWith(userPrincipalName,'${query}')&$select=displayName,mail,jobTitle,userPrincipalName,mobilePhone&$top=5`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            console.warn("⚠️ Token Microsoft tamat tempoh.");
            localStorage.removeItem('msGraphToken');
            return;
        }

        const result = await res.json();
        if (result.value && result.value.length > 0) {
            const msMatches = result.value.map(u => ({
                nama: u.displayName,
                email: u.mail || u.userPrincipalName,
                jabatan: u.jobTitle || '',
                telefon: u.mobilePhone || '',
                noPekerja: '', // Microsoft Graph biasanya tidak dedahkan No Pekerja secara terus di endpoint umum
                source: 'Microsoft'
            }));

            // Gabung dengan hasil tempatan (buang duplikasi emel)
            const combined = [...localMatches];
            msMatches.forEach(ms => {
                if (!combined.some(l => l.email.toLowerCase() === ms.email.toLowerCase())) {
                    combined.push(ms);
                }
            });

            renderSuggestions(combined.slice(0, 8));
        }
    } catch (e) {
        console.error("❌ Ralat Carian Microsoft:", e);
    }
}

let lastSearchResults = [];

// Security: Prevent XSS by escaping HTML special characters
function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderSuggestions(matches) {
    lastSearchResults = matches; // Simpan untuk kegunaan autoFill
    if (matches.length > 0) {
        suggestionsBox.innerHTML = matches.map(m => `
            <div class="suggestion-item" onclick="autoFillApplicant('${m.email.replace(/'/g, "\\'")}', '${m.source}')">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="s-name">${escapeHTML(m.nama)}</span>
                    <span style="font-size: 0.6rem; background: ${m.source === 'Microsoft' ? '#0078d4' : '#64748b'}; color: white; padding: 2px 6px; border-radius: 10px; font-weight: 800;">${escapeHTML(m.source.toUpperCase())}</span>
                </div>
                <span class="s-email">${escapeHTML(m.email)}</span>
            </div>
        `).join('');
        suggestionsBox.style.display = 'block';
    } else {
        const query = emailInput.value.trim();
        if (query.length > 0) {
            suggestionsBox.innerHTML = '<div class="suggestion-item" style="color: #94a3b8; font-size: 0.8rem; cursor: default;">Tiada rekod ditemui</div>';
            suggestionsBox.style.display = 'block';
        }
    }
}

window.autoFillApplicant = function(email, source = 'History') {
    let userData = null;
    
    if (source === 'History') {
        const apps = getDB(DB_KEYS.APPS);
        userData = [...apps].reverse().find(app => (app.email || '').toLowerCase().trim() === email.toLowerCase().trim());
    } else {
        // Ambil dari hasil carian Microsoft terakhir
        userData = lastSearchResults.find(m => m.email.toLowerCase().trim() === email.toLowerCase().trim());
    }
    
    if (userData) {
        console.log(`✅ Auto-fill (${source}) untuk:`, email);
        document.getElementById('email').value = userData.email || email;
        document.getElementById('name').value = userData.nama || '';
        document.getElementById('noPekerja').value = userData.noPekerja || '';
        // Telefon & Jabatan tidak auto-fill (permintaan user)
        // document.getElementById('phone').value = userData.telefon || '';
        // document.getElementById('jabatan').value = userData.jabatan || '';
        
        // Highlight
        const fields = ['email', 'name', 'noPekerja'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.background = '#f0fdf4';
                el.style.borderColor = '#10b981';
                setTimeout(() => {
                    el.style.background = '';
                    el.style.borderColor = '';
                }, 1500);
            }
        });
    }

    if (suggestionsBox) suggestionsBox.style.display = 'none';
};

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
                    ${catName}
                    <span class="stock-status ${availableQuota === 0 ? 'out-of-stock' : ''}">${availableQuota === 0 ? 'HABIS' : ''}</span>
                </label>

                <div class="sub-models" id="models-${catId}" style="display:none;">
                    ${availableItems.length > 1 ? `
                        <div class="sub-select-all" style="margin-bottom: 8px; border-bottom: 1px dashed #ddd; padding-bottom: 5px;">
                            <a href="javascript:void(0)" onclick="toggleSubModels('${catId}', true)" style="font-size: 0.75rem; color: var(--primary); text-decoration: none; font-weight: 600;">
                                <i class="fas fa-check-double"></i> Pilih Semua ${catName}
                            </a>
                            <span style="margin: 0 8px; color: #ccc;">|</span>
                            <a href="javascript:void(0)" onclick="toggleSubModels('${catId}', false)" style="font-size: 0.75rem; color: #64748b; text-decoration: none;">
                                Kosongkan
                            </a>
                        </div>
                    ` : ''}
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

    // Tambah fungsi global untuk toggle sub-models
    window.toggleSubModels = (catId, check) => {
        const subContainer = document.getElementById('models-' + catId);
        if (subContainer) {
            subContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = check);
        }
    };

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
    if (isNaN(dt.getTime())) return dtString;
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    let hours = dt.getHours();
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'petang' : 'pagi';
    hours = hours % 12 || 12;
    const strHours = String(hours).padStart(2, '0');
    return `${day}/${month}/${year} ${strHours}:${minutes} ${ampm}`;
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
    window.location.href = '../dashboard/';
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

        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menghantar...';
        }

        const container = document.getElementById('modelContainer');
        const checkedCats = container.querySelectorAll('.cat-check:checked');
        if (checkedCats.length === 0) {
            alert('Sila pilih sekurang-kurangnya 1 kategori peralatan');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Hantar Permohonan';
            }
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
        if (!valid) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Hantar Permohonan';
            }
            return;
        }

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

        const jenisRaw = document.getElementById('jenisPermohonan').value;
        const jenisLain = document.getElementById('jenisLain').value;
        const finalJenis = (jenisRaw === 'Lain-lain' && jenisLain) ? jenisLain : jenisRaw;

        // Logic Penentuan Status Awal
        const loanStartDate = new Date(document.getElementById('tarikhMasaPinjam').value);
        const today = new Date();
        
        // Kira perbezaan hari
        const diffTime = loanStartDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Jika tarikh pinjam lebih dari 7 hari dari sekarang, set sebagai 'Akan Datang'
        // Jika tidak, kekalkan 'Menunggu' (untuk tindakan segera)
        let initialStatus = 'Menunggu';
        if (diffDays > 7) {
            initialStatus = 'Akan Datang';
        }

        const newApp = {
            id: newId,
            noPermohonan: appNo,
            nama: document.getElementById('name').value,
            noPekerja: document.getElementById('noPekerja').value,
            jabatan: document.getElementById('jabatan').value,
            telefon: document.getElementById('phone').value,
            email: document.getElementById('email').value,
            jenis: finalJenis,
            lokasi: document.getElementById('lokasi').value,
            tujuan: document.getElementById('tujuan').value,
            mula: document.getElementById('tarikhMasaPinjam').value, // Simpan ISO untuk sorting/logic
            tamat: document.getElementById('tarikhMasaPulangan').value, // Simpan ISO
            mula_format: formatDateTime(document.getElementById('tarikhMasaPinjam').value),
            tamat_format: formatDateTime(document.getElementById('tarikhMasaPulangan').value),
            model: models.join(', ') || '-',
            kuantiti: kuantitiParts.join('<br>') || '-',
            siri: siriParts.join('<br>') || '-',
            scanPinjam: '-',
            scanPulang: '-',
            catatanAdmin: '',
            status: initialStatus,
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
    });
}

// --- KONFIGURASI INTEGRASI (TANAM) ---
const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbxfA_6FxdnHQC6ngT0kBjNCbFMz6_-NJ-Y1tm1CGl-PWC9oFnV_WecJg9h36UT7UmyhLA/exec";

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
    // 0. CLEAN URL: Remove 'formadmin.html' from browser bar
    if (window.location.pathname.endsWith('formadmin.html')) {
        const cleanPath = window.location.pathname.replace('formadmin.html', '');
        window.history.replaceState({}, '', cleanPath + window.location.hash);
    }

    // --- 1. SET MIN DATE (LOCK PAST DATES) ---
    const now = new Date();
    // Format to YYYY-MM-DDTHH:MM
    const nowFormatted = now.toISOString().slice(0, 16);
    
    const pinjamInput = document.getElementById('tarikhMasaPinjam');
    const pulangInput = document.getElementById('tarikhMasaPulangan');

    if (pinjamInput) {
        pinjamInput.min = nowFormatted;
        pinjamInput.addEventListener('change', () => {
            if (pulangInput) {
                // Tarikh pulang mestilah selepas tarikh pinjam
                pulangInput.min = pinjamInput.value;
                if (pulangInput.value && pulangInput.value < pinjamInput.value) {
                    pulangInput.value = pinjamInput.value;
                }
            }
        });
    }

    if (pulangInput) {
        pulangInput.min = nowFormatted;
    }

    // --- 2. LOAD DATA ---
    fetchInitialData();

    // --- 3. PILIH SEMUA PERALATAN LOGIC ---
    const selectAllCheck = document.getElementById('selectAllModels');
    if (selectAllCheck) {
        selectAllCheck.addEventListener('change', () => {
            const container = document.getElementById('modelContainer');
            const isChecked = selectAllCheck.checked;
            
            // 1. Ambil semua kategori
            const catChecks = container.querySelectorAll('.cat-check');
            catChecks.forEach(cc => {
                if (!cc.disabled) {
                    cc.checked = isChecked;
                    // Trigger change manually to expand/collapse sub-models
                    cc.dispatchEvent(new Event('change'));
                }
            });

            // 2. Ambil semua sub-models (yang tidak disabled)
            const modelChecks = container.querySelectorAll('.sub-models input[type="checkbox"]');
            modelChecks.forEach(mc => {
                if (!mc.disabled) {
                    mc.checked = isChecked;
                }
            });
        });
    }
});