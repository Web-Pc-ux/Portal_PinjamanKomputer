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
});

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
                    ${origCatName} (${available} Tersedia) 
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
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    const hours = String(dt.getHours()).padStart(2, '0');
    const mins = String(dt.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
}

/* ==============================
   FORM SUBMIT — SAVE TO LOCALSTORAGE
============================== */
form.addEventListener('submit', (e) => {
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
    const refNumber = generateRefNumber();
    const newId = generateId();

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

    // Build new application object
    const newApp = {
        id: newId,
        noPermohonan: refNumber,
        nama: document.getElementById('name').value,
        noPekerja: document.getElementById('noPekerja').value,
        jabatan: document.getElementById('jabatan').value,
        telefon: document.getElementById('phone').value,
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
        timestamp: timestamp
    };

    // Kirim ke Google Sheets (GAS)
    syncToGAS(newApp);

    // Update Local Data Serta-merta (Untuk update baki tanpa refresh)
    const apps = getDB(DB_KEYS.APPS);
    apps.push(newApp);
    saveDB(DB_KEYS.APPS, apps);
    buildModelSection();

    console.log('✅ Data dihantar dan baki dikemaskini');

    // Update modal content
    refNumberEl.textContent = `Nombor Rujukan: ${refNumber}`;

    // Show modal and trigger confetti
    successModal.style.display = 'block';
    createConfetti();

    // Reset form fields
    form.reset();
    container.querySelectorAll('.cat-qty').forEach(q => { q.disabled = true; q.value = ''; q.classList.remove('error-input'); });
    container.querySelectorAll('.cat-check').forEach(c => c.checked = false);
    if (jenisLainContainer) jenisLainContainer.style.display = 'none';
});

// --- KONFIGURASI INTEGRASI (TANAM) ---
const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwZrFtrkH0r8p1BaPyGxQT1Tscb9jHyTtnHjm1eh8jv3Kys1vQ6xuHiPINXpRSSJ53NZg/exec"; // <-- Masukkan URL yang sama di sini juga

// Fungsi untuk sync ke Google Sheets
async function syncToGAS(data) {
    if (!GAS_URL) return;

    try {
        await fetch(GAS_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: 'create',
                token: GAS_TOKEN,
                data: {
                    ...data,
                    jenis_data: 'permohonan'
                }
            })
        });
        console.log('✅ Permohonan berjaya dihantar ke Cloud');
    } catch (error) {
        console.error('❌ Ralat penghantaran GAS:', error);
    }
}

// Fungsi menarik data peralatan dari Google Sheets (Turbo Sync Bulk)
async function fetchInitialData() {
    if (!GAS_URL) return;

    // 1. Instant Load: Papar data sedia ada dulu
    buildModelSection();

    try {
        console.log('🚀 Mula Turbo Sync (User Form - Bulk Mode)...');

        // Tarik semua data dalam SATU request (12x lebih laju)
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
                buildModelSection();
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
   INIT
============================== */
document.addEventListener('DOMContentLoaded', () => {
    fetchInitialData();
});