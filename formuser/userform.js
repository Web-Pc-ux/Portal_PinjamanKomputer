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

// Mod Edit Global
let isEditMode = false;
let editId = null;
let currentEditData = null;

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
   ELEMENTS
============================== */
const agreeBtn = document.getElementById('agreeBtn');
const page1 = document.getElementById('page1');
const page2 = document.getElementById('page2');
const form = document.getElementById('applicationForm');

// Modal elements
const successModal = document.getElementById('successModal');
const closeModal = document.getElementById('closeModal');
const refNumberEl = document.getElementById('refNumber');
const okBtn = document.getElementById('okBtn');

// Page 1 -> Page 2
agreeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    page1.style.display = 'none';
    page2.style.display = 'block';
    window.scrollTo(0, 0);
});

// Semak Mod Edit dari URL
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('id')) {
    isEditMode = true;
    editId = urlParams.get('id');
    console.log("🛠️ Masuk ke MOD EDIT untuk ID:", editId);

    // Tukar tajuk & butang
    const mainTitle = document.querySelector('.form-header h2');
    if (mainTitle) mainTitle.innerHTML = '<i class="fas fa-edit"></i> Kemaskini Permohonan';

    const submitBtn = document.querySelector('button[type="submit"] span');
    if (submitBtn) submitBtn.textContent = 'Kemaskini Permohonan';

    // Langkau Page 1 (Terus ke Page 2)
    page1.style.display = 'none';
    page2.style.display = 'block';
}

// Toggle Lain-lain field
const jenisSelect = document.getElementById('jenisPermohonan');
const jenisLainContainer = document.getElementById('jenisLainContainer');
const jenisLainInput = document.getElementById('jenisLain');

if (jenisSelect) {
    jenisSelect.addEventListener('change', () => {
        if (jenisSelect.value === 'Lain-lain') {
            jenisLainContainer.style.display = 'block';
            jenisLainInput.required = true;
        } else {
            jenisLainContainer.style.display = 'none';
            jenisLainInput.required = false;
            jenisLainInput.value = '';
        }
    });
}

// Kemaskini had tarikh secara real-time
function updateDateRestrictions() {
    const now = new Date();
    // Format: YYYY-MM-DDTHH:MM
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const minDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

    const pinjamInput = document.getElementById('tarikhMasaPinjam');
    const pulangInput = document.getElementById('tarikhMasaPulangan');

    if (pinjamInput) {
        // Jika bukan mod edit, baru kita sekat tarikh lepas
        if (!isEditMode) {
            pinjamInput.min = minDateTime;
        }
    }

    if (pulangInput) {
        // Masa pulang mesti selepas masa sekarang
        pulangInput.min = minDateTime;

        // Dan mesti selepas masa pinjam yang dipilih
        if (pinjamInput && pinjamInput.value) {
            if (pinjamInput.value > minDateTime) {
                pulangInput.min = pinjamInput.value;
            }
        }
    }
}

// Jalankan sekatan tarikh
document.addEventListener('DOMContentLoaded', () => {
    updateDateRestrictions();

    const pinjamInput = document.getElementById('tarikhMasaPinjam');
    const pulangInput = document.getElementById('tarikhMasaPulangan');

    if (pinjamInput) {
        pinjamInput.addEventListener('change', updateDateRestrictions);
    }
    if (pulangInput) {
        pulangInput.addEventListener('change', updateDateRestrictions);
    }
});

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
        container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin" style="color:var(--primary); font-size:1.5rem;"></i><p style="color:#666; font-size:0.9em; margin-top:10px;">Menarik data peralatan terkini dari Cloud...</p></div>';
        return;
    }

    // Group computers by kategori
    const grouped = {};
    categories.forEach(cat => {
        grouped[cat.nama] = [];
    });

    computers.forEach(comp => {
        const cat = comp.kategori || 'Lain-lain';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(comp);
    });

    // Count borrowed units per category from active applications
    const borrowedPerCat = {};
    apps.forEach(app => {
        const st = (app.status || '').toUpperCase();
        const activeStatuses = ['MENUNGGU', 'LULUS', 'BARU', 'LEWAT', 'DIPINJAM', 'APPROVE'];

        if (activeStatuses.includes(st)) {
            const isAssigned = ['LULUS', 'DIPINJAM', 'APPROVE', 'LEWAT'].includes(st);
            const models = (app.model || '').split(',').map(m => m.trim().toLowerCase());

            if (isAssigned && app.siri && app.siri !== '-') {
                // MOD PERINGKAT ADMIN: Kira berdasarkan No Siri yang dipilih
                const siriList = app.siri.split('<br>').filter(s => s.trim() && s.trim() !== '-');
                const siriCount = siriList.length;

                // Masalah: Siri tidak menyimpan kategori. Kita assume kategori dari field 'model' atau 'kuantiti'
                // Cara paling selamat: Jika ada siri, kita agihkan siriCount kepada kategori dalam 'model'
                if (models.length === 1) {
                    borrowedPerCat[models[0]] = (borrowedPerCat[models[0]] || 0) + siriCount;
                } else {
                    // Jika pelbagai kategori, terpaksa parse 'kuantiti' string tetapi limitkan kepada siriCount?
                    // Untuk kes Chris, kebiasaannya per kategori. Kita fallback ke parse kuantiti jika siriCount == 0
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
                // MOD PERINGKAT PERMOHONAN: Kira berdasarkan string kuantiti user
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

    let html = '';
    let catIndex = 0;

    Object.keys(grouped).forEach(origCatName => {
        const items = grouped[origCatName];
        const totalStock = items.length;

        // Match guna lowercase
        const borrowed = borrowedPerCat[origCatName.toLowerCase()] || 0;
        const available = Math.max(0, totalStock - borrowed);

        const catId = origCatName.replace(/\s+/g, '_').toLowerCase();
        const isFirst = catIndex === 0;

        html += `
            <div ${!isFirst ? 'style="margin-top: 10px;"' : ''}>
                <label id="label-${catId}">
                    <input type="checkbox" class="cat-check" data-cat="${catId}" data-catname="${origCatName}" data-stok="${available}" ${available === 0 ? 'disabled' : ''} />
                    ${origCatName} 
                    <span class="stock-status ${available === 0 ? 'out-of-stock' : ''}">${available === 0 ? 'HABIS' : ''}</span>
                </label>
                <input type="number" class="cat-qty" id="qty-${catId}" min="1" max="${available}" placeholder="Kuantiti" disabled />
            </div>
        `;
        catIndex++;
    });

    container.innerHTML = html;

    // Attach toggle events
    container.querySelectorAll('.cat-check').forEach(check => {
        const catId = check.dataset.cat;
        const qtyInput = document.getElementById('qty-' + catId);
        const stock = parseInt(check.dataset.stok, 10);

        check.addEventListener('change', () => {
            if (check.checked) {
                qtyInput.disabled = false;
                qtyInput.value = '1';
            } else {
                qtyInput.value = '';
                qtyInput.disabled = true;
                qtyInput.classList.remove('error-input');
            }
        });

        if (qtyInput) {
            qtyInput.addEventListener('input', () => {
                if (qtyInput.value) {
                    let val = parseInt(qtyInput.value, 10);
                    if (val > stock) qtyInput.value = stock;
                    else if (val < 1) qtyInput.value = 1;
                }
            });
        }
    });

    restoreDynamicFormState();
}

/* ==============================
   CONFETTI SYSTEM
============================== */
const canvas = document.getElementById("confettiCanvas");
const ctx = canvas.getContext("2d");

let confettiParticles = [];
let confettiActive = false;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function createConfetti() {
    confettiParticles = [];
    for (let i = 0; i < 120; i++) {
        confettiParticles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            r: random(4, 8),
            dx: random(-6, 6),
            dy: random(-10, -3),
            gravity: 0.25,
            color: `hsl(${random(0, 360)}, 100%, 60%)`,
            alpha: 1
        });
    }
    confettiActive = true;
    animateConfetti();
}

function animateConfetti() {
    if (!confettiActive) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    confettiParticles.forEach((p, i) => {
        p.dy += p.gravity;
        p.x += p.dx;
        p.y += p.dy;
        p.alpha -= 0.008;

        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
    });

    confettiParticles = confettiParticles.filter(p => p.alpha > 0);

    if (confettiParticles.length > 0) {
        requestAnimationFrame(animateConfetti);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        confettiActive = false;
    }
}

/* ==============================
   GENERATE REF NUMBER
============================== */
function generateRefNumber() {
    const apps = getDB(DB_KEYS.APPS);
    const tahun = new Date().getFullYear();

    // Find the highest existing number for this year
    let maxNum = 0;
    apps.forEach(app => {
        if (app.noPermohonan) {
            const match = app.noPermohonan.match(/Digital-(\d+)\//);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        }
    });

    const nextNum = maxNum + 1;
    return `Digital-${String(nextNum).padStart(4, '0')}/${tahun}`;
}

/* ==============================
   GENERATE UNIQUE ID
============================== */
function generateId() {
    const apps = getDB(DB_KEYS.APPS);
    if (apps.length === 0) return 1;
    return Math.max(...apps.map(a => a.id)) + 1;
}

/* ==============================
   FORMAT DATETIME
============================== */
function formatDateTime(dtString) {
    if (!dtString) return '';
    const dt = new Date(dtString);
    if (isNaN(dt.getTime())) return dtString;
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    let hours = dt.getHours();
    const mins = String(dt.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'petang' : 'pagi';
    hours = hours % 12 || 12;
    const strHours = String(hours).padStart(2, '0');
    return `${day}/${month}/${year} ${strHours}:${mins} ${ampm}`;
}

/* ==============================
   FORM SUBMIT — SAVE TO LOCALSTORAGE & FIREBASE
============================== */
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const container = document.getElementById('modelContainer');

    // Validate: at least one category must be checked
    const checkedCats = container.querySelectorAll('.cat-check:checked');
    if (checkedCats.length === 0) {
        alert('Sila pilih sekurang-kurangnya 1 kategori peralatan');
        return;
    }

    // Validate qty for each checked category
    let valid = true;
    checkedCats.forEach(catCheck => {
        const catId = catCheck.dataset.cat;
        const stock = parseInt(catCheck.dataset.stok, 10);
        const qtyInput = document.getElementById('qty-' + catId);
        const qty = parseInt(qtyInput.value, 10);

        if (isNaN(qty) || qty < 1 || qty > stock) {
            const catName = catCheck.parentElement.textContent.trim().split('(')[0].trim();
            alert(`Sila masukkan kuantiti ${catName} yang sah (1 hingga ${stock}).`);
            qtyInput.focus();
            qtyInput.classList.add('error-input');
            valid = false;
        } else {
            qtyInput.classList.remove('error-input');
        }
    });
    if (!valid) return;

    // Generate ref number and ID
    const refNumber = isEditMode ? currentEditData.noPermohonan : generateRefNumber();
    const finalId = isEditMode ? editId : generateId();

    // Collect model & quantity
    let models = [];
    let kuantitiParts = [];

    checkedCats.forEach(catCheck => {
        const catId = catCheck.dataset.cat;
        const catName = catCheck.dataset.catname; // Ambil nama penuh
        const qtyInput = document.getElementById('qty-' + catId);

        models.push(catName);
        kuantitiParts.push(`&bull; ${catName} - ${qtyInput.value} Unit`);
    });

    const finalKuantiti = kuantitiParts.join('<br>') || '-';

    // Build timestamp
    const now = new Date();
    const timestamp = now.toLocaleDateString('ms-MY') + ' ' + now.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });

    // Handle File Upload (Google Drive Alternative)
    const fileInput = document.getElementById('failPermohonan');
    let fileData = null;
    let fileName = null;

    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > 2) {
            Swal.fire('Fail Terlalu Besar', 'Sila muat naik fail bersaiz bawah 2MB.', 'error');
            return;
        }

        Swal.fire({
            title: 'Memproses lampiran...',
            text: 'Sila tunggu sebentar',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        // Baca fail sebagai Base64
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });

        fileData = base64;
        fileName = file.name;
        Swal.close();
    }

    // Build new application object
    const newApp = {
        id: finalId,
        noPermohonan: refNumber,
        nama: document.getElementById('name').value,
        noPekerja: document.getElementById('noPekerja').value,
        jabatan: document.getElementById('jabatan').value,
        telefon: "'" + document.getElementById('phone').value,
        email: document.getElementById('email').value,
        jenis: document.getElementById('jenisPermohonan').value === 'Lain-lain' ?
            document.getElementById('jenisLain').value :
            document.getElementById('jenisPermohonan').value,
        lokasi: document.getElementById('lokasi').value,
        tujuan: document.getElementById('tujuan').value,
        mula: formatDateTime(document.getElementById('tarikhMasaPinjam').value),
        tamat: formatDateTime(document.getElementById('tarikhMasaPulangan').value),
        model: models.join(', ') || '-',
        kuantiti: finalKuantiti,
        kuantitiAsal: finalKuantiti, // Simpan untuk rujukan readonly
        siri: '-',
        scanPinjam: '-',
        scanPulang: '-',
        catatanAdmin: '',
        status: 'Menunggu',
        failBorang: isEditMode ? currentEditData.failBorang : '-', // Kekalkan fail lama jika dalam mod edit
        timestamp: timestamp,
        // Kolum tambahan untuk muat naik fail ke GAS
        fileData: fileData,
        fileName: fileName,
        // Kolum tersembunyi khas untuk perekodan Google Login (Audit)
        authName: window.loggedInGoogleName || '',
        authEmail: window.loggedInGoogleEmail || '',
        authTimestamp: new Date().toISOString()
    };

    // Kirim ke Google Sheets (GAS) - Mod Update atau Create
    const result = await syncToGAS(newApp, isEditMode ? 'update' : 'create');

    // TUTUP LOADING SEBELUM TUNJUK MODAL BERJAYA
    Swal.close();

    if (result.status === 'success') {
        // Update Local Data Serta-merta (Untuk update baki tanpa refresh)
        const apps = getDB(DB_KEYS.APPS);
        apps.push(newApp);
        saveDB(DB_KEYS.APPS, apps);
        buildModelSection(); if (window.isEditMode && window.currentEditData) { restoreEditPeralatan(window.currentEditData.peralatan || window.currentEditData.kuantiti); }

        console.log('✅ Data dihantar dan baki dikemaskini');

        // Mainkan Bunyi Kejayaan
        playSuccessSound();

        // Paparan Berjaya Terapung (Premium)
        Swal.fire({
            icon: 'success',
            title: 'Borang Berjaya Dihantar!',
            html: `Nombor Rujukan: <strong>${refNumber}</strong><br><br>Permohonan anda telah berjaya direkodkan. Sila tunggu pengesahan daripada pihak pentadbir.`,
            confirmButtonText: 'OK',
            confirmButtonColor: '#2563eb',
            allowOutsideClick: false,
            backdrop: `rgba(0,0,123,0.4)`
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = '../UserS/';
            }
        });

        createConfetti();

        // Reset borang
        form.reset();
        container.querySelectorAll('.cat-qty').forEach(q => { q.disabled = true; q.value = ''; });
        container.querySelectorAll('.cat-check').forEach(c => c.checked = false);
        if (jenisLainContainer) jenisLainContainer.style.display = 'none';
    } else {
        Swal.fire('Ralat', 'Gagal menyimpan data: ' + result.message, 'error');
    }

    // Handle Redirect after success
    const handleSuccessRedirect = () => {
        successModal.style.display = 'none';
        window.location.href = '../UserS/';
    };

    if (okBtn) okBtn.addEventListener('click', handleSuccessRedirect);
    if (closeModal) closeModal.addEventListener('click', handleSuccessRedirect);
});

// --- KONFIGURASI INTEGRASI (TANAM) ---
const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbzslQ-3jXX1wfKVUUJPu7Tt4XB9k4tUCOuDUa93sgXwBZvUflvGIFj-wq0Op6QkCpb7kg/exec";

// Fungsi untuk sync ke Google Sheets
async function syncToGAS(data, action = 'create') {
    if (!GAS_URL) return { status: 'error', message: 'URL GAS tidak sah' };

    try {
        // Papar loading
        Swal.fire({
            title: 'Menghantar Borang...',
            text: action === 'update' ? 'Sedang mengemaskini permohonan' : 'Sila tunggu sebentar, fail sedang di upload',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: action,
                token: GAS_TOKEN,
                data: {
                    ...data,
                    jenis_data: 'permohonan'
                }
            })
        });
        return await response.json();
    } catch (e) {
        console.error("Sync Error:", e);
        return { status: 'error', message: e.toString() };
    }
}


// Fungsi menarik data peralatan dari Google Sheets (Turbo Sync Bulk)
async function fetchInitialData() {
    if (!GAS_URL) return;

    // 1. Instant Load: Papar data sedia ada dulu
    buildModelSection(); if (window.isEditMode && window.currentEditData) { restoreEditPeralatan(window.currentEditData.peralatan || window.currentEditData.kuantiti); }

    try {
        console.log('🚀 Mula Turbo Sync (User Form - Bulk Mode)...');

        // Tarik semua data dalam SATU request (12x lebih laju)
        const resData = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=all`);
        const result = await resData.json();

        if (result.status === 'success') {
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
                const currentData = JSON.stringify(key === 'db_categories' ? (CORE_DATA['db_categories'] || []) : getDB(key));
                const newDataStr = JSON.stringify(newData);

                if (currentData !== newDataStr) {
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
                console.log('✨ Data peralatan dikemaskini.');
                buildModelSection(); if (window.isEditMode && window.currentEditData) { restoreEditPeralatan(window.currentEditData.peralatan || window.currentEditData.kuantiti); }
            }
        }

    } catch (e) {
        console.error('❌ Gagal Turbo Sync:', e);
    }
}

// Helper function to finish and return to page 1
function finishSubmission() {
    successModal.style.display = 'none';
    page2.style.display = 'none';
    page1.style.display = 'block';

    // Buang memori draf borang supaya ia kosong untuk permohonan seterusnya
    // Buang memori draf borang supaya ia kosong untuk permohonan seterusnya
    sessionStorage.removeItem('userFormDraft');

    // Scroll to top of page 1
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Tutup modal events
closeModal.addEventListener('click', finishSubmission);
okBtn.addEventListener('click', finishSubmission);

// Tutup modal klik luar
window.addEventListener('click', (e) => {
    if (e.target === successModal) finishSubmission();
});

/* ==============================
   FIREBASE & LOGIN LOGIC
============================== */
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

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;

/* ==============================
   INIT
============================== */
document.addEventListener('DOMContentLoaded', () => {
    // Bersihkan URL: Buang 'index.html' jika ada
    if (window.location.pathname.endsWith('index.html')) {
        const cleanPath = window.location.pathname.replace('index.html', '');
        window.history.replaceState({}, '', cleanPath + window.location.hash);
    }

    // Paksa browser sentiasa bermula di atas (scroll ke atas) setiap kali refresh
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    const loginOverlay = document.getElementById('loginOverlay');
    const mainContent = document.getElementById('mainContent');
    const btnLogin = document.getElementById('userGoogleLoginBtn');
    const btnText = document.getElementById('userGoogleLoginText');
    const btnMsLogin = document.getElementById('userMsLoginBtn');
    const btnMsText = document.getElementById('userMsLoginText');

    if (auth) {
        // Check if user is already logged in
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                let email = user.email || "";
                if (!email && user.providerData) {
                    for (let p of user.providerData) {
                        if (p.email) { email = p.email; break; }
                    }
                }

                // Verify UMS Email
                if (email.toLowerCase().endsWith('@ums.edu.my')) {
                    // Simpan data login secara rahsia (global)
                    window.loggedInGoogleEmail = email;
                    window.loggedInGoogleName = user.displayName || "";

                    // Sembunyikan login, tunjuk borang
                    if (loginOverlay) loginOverlay.style.display = 'none';
                    if (mainContent) mainContent.style.display = 'block';

                    // Auto-isi maklumat pengguna dan lock
                    const nameInput = document.getElementById('name');
                    const emailInput = document.getElementById('email');

                    if (nameInput) {
                        nameInput.value = window.loggedInGoogleName.toUpperCase();
                        nameInput.readOnly = true;
                        nameInput.style.backgroundColor = '#f1f5f9';
                        nameInput.style.color = '#475569';
                    }
                    if (emailInput) {
                        emailInput.value = window.loggedInGoogleEmail;
                        emailInput.readOnly = true;
                        emailInput.style.backgroundColor = '#f1f5f9';
                        emailInput.style.color = '#475569';
                    }

                    if (!isEditMode) {
                        restoreFormState();
                    }
                    await fetchInitialData();

                    // --- PENGISIAN MOD EDIT (BACKGROUND) ---
                    if (isEditMode) {
                        (async () => {
                            try {
                                const res = await fetch(`${GAS_URL}?action=read&token=${GAS_TOKEN}&sheet=permohonan&search=${editId}`);
                                const result = await res.json();

                                if (result.status === 'success' && result.data && result.data.length > 0) {
                                    currentEditData = result.data[0];

                                    // Isi borang (Pastikan id sedia ada sepadan)
                                    document.getElementById('noPekerja').value = currentEditData.noPekerja || '';
                                    document.getElementById('phone').value = currentEditData.telefon || '';
                                    document.getElementById('jabatan').value = currentEditData.jabatan || '';
                                    document.getElementById('lokasi').value = currentEditData.lokasi || '';
                                    document.getElementById('tujuan').value = currentEditData.tujuan || '';

                                    // Isi Tarikh & Masa (Perlu tukar format ke ISO)
                                    setTimeout(() => {
                                        if (currentEditData.mula) {
                                            const isoMula = convertToISODate(currentEditData.mula);
                                            document.getElementById('tarikhMasaPinjam').value = isoMula;
                                        }
                                        if (currentEditData.tamat) {
                                            const isoTamat = convertToISODate(currentEditData.tamat);
                                            document.getElementById('tarikhMasaPulangan').value = isoTamat;
                                        }
                                    }, 1000); // Beri masa untuk DOM sedia

                                    // Handle Jenis Permohonan
                                    const selectJenis = document.getElementById('jenisPermohonan');
                                    const knownTypes = Array.from(selectJenis.options).map(o => o.value);
                                    if (knownTypes.includes(currentEditData.jenis)) {
                                        selectJenis.value = currentEditData.jenis;
                                    } else {
                                        selectJenis.value = 'Lain-lain';
                                        document.getElementById('jenisLainContainer').style.display = 'block';
                                        document.getElementById('jenisLain').value = currentEditData.jenis;
                                    }

                                    // --- PAPAR FAIL SEDIA ADA ---
                                    if (currentEditData.failBorang && currentEditData.failBorang !== '-') {
                                        const fileContainer = document.getElementById('existingFileContainer');
                                        const fileLink = document.getElementById('existingFileLink');
                                        if (fileContainer && fileLink) {
                                            fileContainer.style.display = 'flex';
                                            fileLink.href = currentEditData.failBorang;
                                            fileLink.textContent = "Lihat Lampiran Sedia Ada (" + (currentEditData.noPermohonan) + ")";

                                            // Jadikan input fail tidak wajib jika sudah ada fail
                                            const fileInput = document.getElementById('failPermohonan');
                                            if (fileInput) fileInput.required = false;
                                        }
                                    }

                                    // Tunggu baki peralatan sedia (fetchInitialData) baru restore peralatan
                                    // Kami gunakan selang masa sedikit lebih lama untuk pastikan buildModelSection selesai
                                    setTimeout(() => {
                                        console.log("🔄 Memulihkan pilihan peralatan...");
                                        restoreEditPeralatan(currentEditData.peralatan || currentEditData.kuantiti);
                                    }, 2000);
                                }
                            } catch (e) {
                                console.error("Edit fetch error:", e);
                            }
                        })();
                    }
                } else {
                    auth.signOut();
                    Swal.fire({
                        icon: 'error',
                        title: 'Akses Ditolak',
                        text: 'Hanya pengguna dengan emel rasmi UMS (@ums.edu.my/@student.ums.edu.my/@iluv.ums.edu.my) dibenarkan untuk mengakses borang ini.'
                    });
                    if (btnLogin) {
                        btnLogin.disabled = false;
                        btnText.innerHTML = 'Log Masuk Google';
                    }
                }
            } else {
                // Tiada user log masuk - redirect ke portal utama
                Swal.fire({
                    icon: 'warning',
                    title: 'Sesi Tamat',
                    text: 'Anda perlu log masuk di halaman utama untuk mengakses borang ini.',
                    showConfirmButton: false,
                    timer: 2000
                }).then(() => {
                    window.location.href = '../';
                });
            }
        });
    } else {
        // Jika Firebase tiada, terus buka borang (fallback lokal)
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
        fetchInitialData();
    }

    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            try {
                btnLogin.disabled = true;
                btnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

                // Trik fokus: Jika pengguna kembali ke tingkap utama (tutup popup) 
                // butang akan terus dibersihkan dari loading.
                const resetBtnOnFocus = () => {
                    setTimeout(() => {
                        btnLogin.disabled = false;
                        btnText.innerHTML = 'Log Masuk Google';
                        window.removeEventListener('focus', resetBtnOnFocus);
                    }, 800);
                };
                window.addEventListener('focus', resetBtnOnFocus);

                const provider = new firebase.auth.GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });

                await auth.signInWithPopup(provider);

                // Tunjukkan loading overlay
                Swal.fire({
                    title: 'Mengesahkan Akaun...',
                    text: 'Sila tunggu sebentar, kami sedang menyediakan borang anda.',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });
                // onAuthStateChanged akan uruskan validasi emel
            } catch (error) {
                btnLogin.disabled = false;
                btnText.innerHTML = 'Log Masuk Google';
                console.error(error);
                if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                    Swal.fire('Ralat', 'Gagal log masuk: ' + error.message, 'error');
                }
            }
        });
    }

    if (btnMsLogin) {
        btnMsLogin.addEventListener('click', async () => {
            try {
                btnMsLogin.disabled = true;
                btnMsText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

                const resetBtnOnFocus = () => {
                    setTimeout(() => {
                        btnMsLogin.disabled = false;
                        btnMsText.innerHTML = 'Log Masuk Microsoft';
                        window.removeEventListener('focus', resetBtnOnFocus);
                    }, 800);
                };
                window.addEventListener('focus', resetBtnOnFocus);

                const provider = new firebase.auth.OAuthProvider('microsoft.com');
                provider.addScope('email');
                provider.addScope('User.Read');
                provider.setCustomParameters({ prompt: 'select_account' });

                const result = await auth.signInWithPopup(provider);

                // Tunjukkan loading overlay
                Swal.fire({
                    title: 'Mengesahkan Akaun...',
                    text: 'Sila tunggu sebentar, kami sedang menyediakan borang anda.',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                // Ekstrak nama Microsoft sebenar dari profil
                if (result && result.user) {
                    const profileName = (result.additionalUserInfo && result.additionalUserInfo.profile && result.additionalUserInfo.profile.displayName)
                        || result.user.displayName || "Peminjam UMS";

                    // Pastikan displayName dalam Firebase diupdate supaya onAuthStateChanged dapat detect
                    if (!result.user.displayName || result.user.displayName !== profileName) {
                        await result.user.updateProfile({ displayName: profileName });
                        window.loggedInGoogleName = profileName;
                    }
                }

                // onAuthStateChanged akan uruskan validasi emel dan auto-isi borang
            } catch (error) {
                btnMsLogin.disabled = false;
                btnMsText.innerHTML = 'Log Masuk Microsoft';
                console.error(error);
                if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                    Swal.fire('Ralat', 'Gagal log masuk: ' + error.message, 'error');
                }
            }
        });
    }

    const backBtn = document.getElementById('backToPortalBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '../';
        });
    }

    // Fungsi untuk buang rujukan fail sedia ada semasa EDIT
    window.removeExistingFile = function () {
        Swal.fire({
            title: 'Padam Fail?',
            text: "Pautan fail sedia ada akan dikeluarkan dari permohonan ini. Sila muat naik fail baru jika perlu.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Ya, Padam'
        }).then((result) => {
            if (result.isConfirmed) {
                if (currentEditData) currentEditData.failBorang = '-';
                const fileContainer = document.getElementById('existingFileContainer');
                if (fileContainer) fileContainer.style.display = 'none';

                // Jika asal fail adalah wajib, kita boleh minta user upload baru
                // document.getElementById('failPermohonan').required = true;

                Swal.fire('Dipadam', 'Rujukan fail telah dikeluarkan.', 'success');
            }
        });
    }

    // Auto-save form draft on input/change
    if (form) {
        form.addEventListener('input', saveFormState);
        form.addEventListener('change', saveFormState);

        // Buang draf sekiranya pengguna menekan butang "Set Semula"
        form.addEventListener('reset', () => {
            sessionStorage.removeItem('userFormDraft');
        });
    }

    // Valdiasi saiz fail secara langsung bila dipilih
    const fileInput = document.getElementById('failPermohonan');
    if (fileInput) {
        fileInput.addEventListener('change', function () {
            if (this.files && this.files[0]) {
                const sizeMB = this.files[0].size / (1024 * 1024);
                if (sizeMB > 2) {
                    Swal.fire('Fail Terlalu Besar', 'Maksimum saiz dibenarkan adalah 2MB.', 'warning');
                    this.value = ''; // Kosongkan
                }
            }
        });
    }
});

/* ==============================
   FORM DRAFT AUTO-SAVE
============================== */
function saveFormState() {
    const formData = {
        noPekerja: document.getElementById('noPekerja')?.value || '',
        phone: document.getElementById('phone')?.value || '',
        jabatan: document.getElementById('jabatan')?.value || '',
        jenisPermohonan: document.getElementById('jenisPermohonan')?.value || '',
        jenisLain: document.getElementById('jenisLain')?.value || '',
        lokasi: document.getElementById('lokasi')?.value || '',
        tujuan: document.getElementById('tujuan')?.value || '',
        tarikhMasaPinjam: document.getElementById('tarikhMasaPinjam')?.value || '',
        tarikhMasaPulangan: document.getElementById('tarikhMasaPulangan')?.value || ''
    };

    // Save dynamic fields
    const dynamicData = {};
    document.querySelectorAll('.cat-check').forEach(check => {
        if (check.checked) {
            const catId = check.dataset.cat;
            const qtyInput = document.getElementById('qty-' + catId);
            dynamicData[catId] = { checked: true, qty: qtyInput ? qtyInput.value : '' };
        }
    });
    formData.dynamic = dynamicData;

    sessionStorage.setItem('userFormDraft', JSON.stringify(formData));
}

function restoreFormState() {
    const draft = sessionStorage.getItem('userFormDraft');
    if (!draft) return;

    try {
        const formData = JSON.parse(draft);

        // Restore static fields
        ['noPekerja', 'phone', 'jabatan', 'jenisPermohonan', 'jenisLain', 'lokasi', 'tujuan', 'tarikhMasaPinjam', 'tarikhMasaPulangan'].forEach(id => {
            const el = document.getElementById(id);
            if (el && formData[id]) {
                el.value = formData[id];
            }
        });

        // Trigger change for jenisPermohonan to show/hide jenisLain
        const jenisSelect = document.getElementById('jenisPermohonan');
        if (jenisSelect) {
            jenisSelect.dispatchEvent(new Event('change'));
        }
    } catch (e) {
        console.error("Error restoring form draft", e);
    }
}

function restoreDynamicFormState() {
    const draft = sessionStorage.getItem('userFormDraft');
    if (!draft) return;
    try {
        const formData = JSON.parse(draft);
        if (formData.dynamic) {
            Object.keys(formData.dynamic).forEach(catId => {
                const check = document.querySelector(`.cat-check[data-cat="${catId}"]`);
                if (check && !check.disabled) {
                    check.checked = true;
                    check.dispatchEvent(new Event('change'));

                    const qtyInput = document.getElementById('qty-' + catId);
                    if (qtyInput) {
                        qtyInput.value = formData.dynamic[catId].qty;
                    }
                }
            });
        }
    } catch (e) {
        console.error("Error restoring dynamic form draft", e);
    }
}

// Fungsi tambahan untuk memulihkan pilihan peralatan semasa EDIT
function restoreEditPeralatan(kuantitiStr) {
    console.log("🔍 Memulihkan:", kuantitiStr);
    if (!kuantitiStr || kuantitiStr === "-") return;

    const lines = kuantitiStr.replace(/<br\s*\/?>/gi, "\n").replace(/&bull;/g, "�").split("\n");
    lines.forEach(line => {
        const match = line.match(/�?\s*(.+?)\s*[-��]\s*(\d+)/i);
        if (match) {
            const catName = match[1].trim();
            const qty = match[2].trim();

            // Cari checkbox yang sepadan dengan nama kategori
            const check = Array.from(document.querySelectorAll(".cat-check")).find(c => (c.dataset.catname || "").toLowerCase().trim() === catName.toLowerCase().trim());
            if (check) {
                check.checked = true;
                check.dispatchEvent(new Event("change"));
                const qtyInput = document.getElementById("qty-" + check.dataset.cat);
                if (qtyInput) qtyInput.value = qty;
            }
        }
    });
}

// Fungsi bantu untuk menukar format dd/mm/yyyy hh:mm ke YYYY-MM-DDTHH:MM (untuk input datetime-local)
function convertToISODate(str) {
    if (!str || str === '-') return '';
    try {
        // Jika sudah format ISO (mengandungi T)
        if (str.includes('T')) return str;

        // Dijangka format: dd/mm/yyyy HH:mm
        const parts = str.trim().split(/\s+/);
        const datePart = parts[0];
        const timePart = parts[1] || '08:00';

        const dParts = datePart.split('/');
        if (dParts.length < 3) {
            // Cuba split guna '-' jika ada
            const dPartsAlt = datePart.split('-');
            if (dPartsAlt.length === 3) {
                // Jika format YYYY-MM-DD
                if (dPartsAlt[0].length === 4) return datePart + 'T' + timePart;
                // Jika format DD-MM-YYYY
                return `${dPartsAlt[2]}-${dPartsAlt[1]}-${dPartsAlt[0]}T${timePart}`;
            }
            return '';
        }

        const day = dParts[0].padStart(2, '0');
        const month = dParts[1].padStart(2, '0');
        const year = dParts[2];

        const result = `${year}-${month}-${day}T${timePart}`;
        console.log("Converted date:", str, "to", result);
        return result;
    } catch (e) {
        console.warn("Gagal menukar format tarikh:", str, e);
        return '';
    }
}

// Fungsi Pemulihan Peralatan Versi Stabil
window.restoreEditPeralatan = function (kuantitiStr) {
    if (!kuantitiStr || kuantitiStr === '-') return;

    // Bersihkan HTML dan tukar ke baris baru
    let cleanText = kuantitiStr.replace(/<br\s*\/?>/gi, '\n').replace(/&bull;/g, '');
    let lines = cleanText.split('\n');

    lines.forEach(line => {
        if (!line.trim()) return;

        // Cari pembahagi (biasanya ' - ')
        let parts = line.split(/[-–—]/);
        if (parts.length >= 2) {
            let catName = parts[0].replace(/[•]/g, '').trim().toLowerCase();
            let qtyPart = parts[1].trim();
            let qtyMatch = qtyPart.match(/(\d+)/);

            if (qtyMatch) {
                let qty = qtyMatch[1];
                let allChecks = document.querySelectorAll('.cat-check');
                let check = Array.from(allChecks).find(c => (c.dataset.catname || '').toLowerCase().trim() === catName);

                if (check) {
                    check.checked = true;
                    check.dispatchEvent(new Event('change'));
                    let qtyInput = document.getElementById('qty-' + check.dataset.cat);
                    if (qtyInput) qtyInput.value = qty;
                }
            }
        }
    });
};


// Fungsi untuk memainkan bunyi kejayaan
function playSuccessSound() {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log('Audio play blocked by browser:', e));
}

function convertToISODate(str) {
    if (!str || str === '-') return '';
    try {
        let s = str.toString().trim();
        // Handle ISO (YYYY-MM-DDTHH:mm)
        if (s.includes('T')) return s.substring(0, 16);

        // Handle dd/mm/yyyy HH:mm
        const parts = s.split(/\s+/);
        const datePart = parts[0];
        const timePart = (parts[1] || '08:00').substring(0, 5);
        const dParts = datePart.split('/');
        if (dParts.length === 3) {
            const day = dParts[0].padStart(2, '0');
            const month = dParts[1].padStart(2, '0');
            const year = dParts[2];
            return year + '-' + month + '-' + day + 'T' + timePart;
        }
        return '';
    } catch (e) {
        console.error('Error converting date:', e);
        return '';
    }
}
