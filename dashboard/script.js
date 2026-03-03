// Firebase Configuration
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
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', () => {
    // 1. Monitor Sesi Firebase Secara Real-time (Lebih Selamat)
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            console.warn("⚠️ Sesi tidak sah. Kembali ke Login.");
            window.location.href = '../index.html';
            return;
        }

        // 2. Ambil data admin dari LocalStorage (Session Cache)
        const session = localStorage.getItem('loggedInAdmin');
        if (!session) {
            firebase.auth().signOut().then(() => {
                window.location.href = '../index.html';
            });
            return;
        }

        const adminData = JSON.parse(session);

        // 3. Semakan Sesi Ganda & Real-time Session Monitoring
        try {
            // Kita guna Username sebagai kunci dokumen supaya unik walaupun kongsi emel/UID
            const usernameKey = adminData.username.toLowerCase().trim();

            db.collection('admins').doc(usernameKey).onSnapshot(async (doc) => {
                if (doc.exists) {
                    const cloudSessionId = doc.data().sessionId;
                    // Ambil semula adminData terbaru dari localStorage untuk dipadankan
                    const latestSession = localStorage.getItem('loggedInAdmin');
                    if (!latestSession) return;

                    const latestAdminData = JSON.parse(latestSession);

                    if (cloudSessionId && latestAdminData.sessionId !== cloudSessionId) {
                        console.warn("⚠️ Sesi ditamatkan secara real-time: Login dikesan dari peranti lain.");
                        localStorage.removeItem('loggedInAdmin');

                        await Swal.fire({
                            title: 'Sesi Bertindih',
                            text: 'Akaun anda baru sahaja log masuk di peranti lain. Sesi ini ditamatkan.',
                            icon: 'error',
                            confirmButtonText: 'OK',
                            allowOutsideClick: false
                        });

                        await firebase.auth().signOut();
                        window.location.href = '../index.html';
                    }
                }
            }, (err) => {
                console.error("Ralat Snapshot Sesi:", err);
            });
        } catch (e) {
            console.error("Gagal memulakan pemantauan sesi:", e);
        }

        initializeDashboard(adminData);
    });
});

function initializeDashboard(adminData) {
    // Display logged-in admin name
    const adminNameEl = document.querySelector('.user-profile span');
    const profileIconEl = document.getElementById('userProfileIcon');

    if (adminNameEl && adminData.nama) {
        adminNameEl.textContent = adminData.nama;
    }

    // Set Profile Picture (Cari gambar sebenar dari emel melalui Unavatar)
    if (profileIconEl && adminData.email) {
        // Unavatar akan carikan gambar profil sebenar (Google/Gravatar/etc) berdasarkan emel
        const email = adminData.email.toLowerCase().trim();
        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(adminData.nama)}&background=6366f1&color=fff&bold=true`;
        const profileUrl = `https://unavatar.io/${email}?fallback=${encodeURIComponent(fallbackUrl)}`;

        profileIconEl.innerHTML = `<img src="${profileUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover;">`;

        // Error handling: Jika Unavatar gagal, guna UI-Avatars sebagai backup terakhir
        const img = profileIconEl.querySelector('img');
        img.onerror = function () {
            this.src = fallbackUrl;
        };
    }

    // Navigation logic
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    const sections = document.querySelectorAll('.section-content');
    const sectionTitle = document.getElementById('sectionTitle');
    const burgerBtn = document.getElementById('burgerBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function switchSection(sectionId, updateStorage = true) {
        const targetItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
        if (!targetItem) return;

        // Update active nav
        navItems.forEach(nav => nav.classList.remove('active'));
        targetItem.classList.add('active');

        // Update visible section
        sections.forEach(sec => sec.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');

        // Update title
        sectionTitle.textContent = targetItem.querySelector('span').textContent;

        // Save to localStorage
        if (updateStorage) {
            localStorage.setItem('activeDashboardSection', sectionId);
        }

        // Close sidebar on mobile
        if (window.innerWidth <= 1024) {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        }

        // Auto-render report when switching to Laporan
        if (sectionId === 'laporan') {
            renderReportStats();
            renderComputerUsage();
            resetReportFilter();
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section');
            switchSection(sectionId);
        });
    });

    // Check for saved section on load
    const savedSection = localStorage.getItem('activeDashboardSection');
    if (savedSection) {
        switchSection(savedSection, false);
    }

    // Burger Menu Logic
    burgerBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
    });

    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    });

    // Initialize data & render
    initMockData();
    loadSettings();
    fetchAllFromGAS(); // Tarik semua data dari Cloud setiap kali buka dashboard

    // 3. Auto Logout Logic (Idle Monitor)
    initIdleMonitor();
}

let idleTimer;
function initIdleMonitor() {
    let lastActivity = Date.now();

    const resetTimer = () => {
        lastActivity = Date.now();
    };

    // Events to track
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(evt => {
        document.addEventListener(evt, resetTimer, true);
    });

    if (idleTimer) clearInterval(idleTimer);

    idleTimer = setInterval(() => {
        const settings = getDB('db_settings');
        const idleLimitSeconds = parseInt(settings.idle || "1800");
        const elapsedSeconds = (Date.now() - lastActivity) / 1000;

        if (elapsedSeconds >= idleLimitSeconds) {
            console.warn("⏰ Idle timeout reached. Automatic logout.");
            performAutoLogout();
        }
    }, 10000); // Check every 10 seconds
}

async function performAutoLogout() {
    clearInterval(idleTimer);

    // Clear SessionId in Firestore before logout
    const session = localStorage.getItem('loggedInAdmin');
    if (session) {
        const adminData = JSON.parse(session);
        const usernameKey = adminData.username.toLowerCase().trim();
        try {
            await db.collection('admins').doc(usernameKey).update({ sessionId: null });
        } catch (e) {
            console.error("Gagal memadam sessionId semasa auto-logout:", e);
        }
    }

    localStorage.removeItem('loggedInAdmin');

    Swal.fire({
        title: 'Sesi Tamat',
        text: 'Anda telah dilog keluar secara automatik kerana tidak aktif.',
        icon: 'info',
        confirmButtonText: 'OK',
        allowOutsideClick: false
    }).then(() => {
        firebase.auth().signOut().then(() => {
            window.location.href = '../index.html';
        });
    });
}

// Modal Logic
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Section-specific functions
function showShareModal(activeTab = 'tab1') {
    const currentPath = window.location.pathname;
    const directoryPath = currentPath.substring(0, currentPath.lastIndexOf('/dashboard'));
    const url = window.location.origin + directoryPath + '/formuser/index.html';

    const tab1Active = activeTab === 'tab1';
    const tab2Active = activeTab === 'tab2';

    Swal.fire({
        title: 'Borang Permohonan User',
        html: `
            <div class="share-tabs" style="margin-top: 1.5rem;">
                <div style="display: flex; border-bottom: 2px solid var(--border); margin-bottom: 1.5rem;">
                    <button onclick="switchShareTab('tab1')" id="btnTab1" class="tab-btn" style="flex: 1; padding: 0.75rem; border: none; background: none; font-weight: 600; cursor: pointer; border-bottom: ${tab1Active ? '2px solid var(--primary)' : 'none'}; color: ${tab1Active ? 'var(--primary)' : 'var(--text-muted)'};">
                        <i class="fas fa-share-alt"></i> Share & Preview
                    </button>
                    <button onclick="switchShareTab('tab2')" id="btnTab2" class="tab-btn" style="flex: 1; padding: 0.75rem; border: none; background: none; font-weight: 600; cursor: pointer; border-bottom: ${tab2Active ? '2px solid var(--primary)' : 'none'}; color: ${tab2Active ? 'var(--primary)' : 'var(--text-muted)'};">
                        <i class="fas fa-qrcode"></i> QR Code
                    </button>
                </div>
                
                <div id="contentTab1" class="tab-content" style="text-align: left; display: ${tab1Active ? 'block' : 'none'};">
                    <div style="margin-bottom: 1.5rem;">
                         <label style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Share Link Button</label>
                         <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                             <input type="text" id="shareUrl" value="${url}" readonly 
                                 style="flex: 1; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 0.875rem; background: var(--bg-main); color: var(--text-main);">
                             <button onclick="copyLink()" class="btn btn-primary" title="Salin Pautan"><i class="fas fa-copy"></i></button>
                         </div>
                         <p style="font-size: 0.75rem; color: var(--primary); margin-top: 0.3rem;">*Klik punat biru untuk salin pautan</p>
                    </div>

                    <div style="border-top: 1px solid var(--border); padding-top: 1.5rem;">
                         <label style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Form Preview</label>
                         <button onclick="previewForm()" class="btn btn-outline" style="width: 100%; margin-top: 0.5rem; justify-content: center; background: var(--bg-main); color: var(--text-main);">
                            <i class="fas fa-eye"></i> Lihat Pratonton Borang
                         </button>
                         <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.3rem;">*Show form pratonton sahaja</p>
                    </div>
                </div>

                <div id="contentTab2" class="tab-content" style="display: ${tab2Active ? 'block' : 'none'}; text-align: center;">
                    <div id="shareQrCode" style="display: flex; justify-content: center; margin: 1.5rem auto; padding: 1rem; background: white; border: 1px solid var(--border); border-radius: var(--radius); width: fit-content;"></div>
                    <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem;">Imbas kod QR di atas untuk akses terus ke borang pemohonan.</p>
                    
                    <div style="display: flex; gap: 0.75rem; justify-content: center;">
                        <button onclick="downloadQR()" class="btn btn-primary" style="padding: 0.6rem 1.25rem; font-size: 0.85rem;">
                            <i class="fas fa-download"></i> Muat Turun QR
                        </button>
                        <button onclick="shareQR()" class="btn btn-outline" style="padding: 0.6rem 1.25rem; font-size: 0.85rem; border-color: var(--primary); color: var(--primary);">
                            <i class="fas fa-share-nodes"></i> Kongsi
                        </button>
                    </div>
                </div>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        width: '500px',
        didOpen: () => {
            new QRCode(document.getElementById("shareQrCode"), {
                text: url,
                width: 180,
                height: 180
            });
        }
    });
}

function switchShareTab(tab) {
    const tab1 = document.getElementById('contentTab1');
    const tab2 = document.getElementById('contentTab2');
    const btn1 = document.getElementById('btnTab1');
    const btn2 = document.getElementById('btnTab2');

    if (tab === 'tab1') {
        tab1.style.display = 'block';
        tab2.style.display = 'none';
        btn1.style.borderBottom = '2px solid var(--primary)';
        btn1.style.color = 'var(--primary)';
        btn2.style.borderBottom = 'none';
        btn2.style.color = 'var(--text-muted)';
    } else {
        tab1.style.display = 'none';
        tab2.style.display = 'block';
        btn2.style.borderBottom = '2px solid var(--primary)';
        btn2.style.color = 'var(--primary)';
        btn1.style.borderBottom = 'none';
        btn1.style.color = 'var(--text-muted)';
    }
}

function copyLink() {
    const copyText = document.getElementById("shareUrl");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);

    // Use custom toast so the Share modal stays open
    const toast = document.createElement('div');
    toast.innerHTML = '<i class="fas fa-check-circle"></i> Pautan disalin!';
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.875rem;font-weight:600;z-index:99999;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 12px rgba(16,185,129,0.3);animation:fadeInRight 0.3s ease;';
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 1500);
}

/* ==============================
   QR DOWNLOAD & SHARE
============================== */
function downloadQR() {
    const qrContainer = document.getElementById('shareQrCode');
    if (!qrContainer) return;

    let dataUrl = '';

    // QRCode.js creates both a canvas and an img inside the container
    // The img.src is already a data:image/png;base64 URL â€” use it directly
    const img = qrContainer.querySelector('img');
    const canvas = qrContainer.querySelector('canvas');

    if (img && img.src && img.src.startsWith('data:image')) {
        dataUrl = img.src;
    } else if (canvas) {
        try {
            dataUrl = canvas.toDataURL('image/png');
        } catch (e) {
            console.error('Canvas toDataURL failed:', e);
        }
    }

    if (dataUrl) {
        // Use Blob approach for reliable download
        fetch(dataUrl)
            .then(res => res.blob())
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'QR_Borang_Permohonan.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);

                // Custom toast
                const toast = document.createElement('div');
                toast.innerHTML = '<i class="fas fa-check-circle"></i> QR Code telah dimuat turun!';
                toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.875rem;font-weight:600;z-index:99999;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 12px rgba(16,185,129,0.3);';
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => toast.remove(), 300);
                }, 2000);
            });
    } else {
        // Fallback: show error toast
        const toast = document.createElement('div');
        toast.innerHTML = '<i class="fas fa-exclamation-circle"></i> Gagal memuat turun QR. Sila cuba lagi.';
        toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#ef4444;color:white;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.875rem;font-weight:600;z-index:99999;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 12px rgba(239,68,68,0.3);';
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

function shareQR() {
    const currentPath = window.location.pathname;
    const directoryPath = currentPath.substring(0, currentPath.lastIndexOf('/dashboard'));
    const url = window.location.origin + directoryPath + '/formuser/index.html';

    // Try Web Share API first
    if (navigator.share) {
        const qrContainer = document.getElementById('shareQrCode');
        const canvas = qrContainer ? qrContainer.querySelector('canvas') : null;

        if (canvas) {
            canvas.toBlob(async (blob) => {
                const file = new File([blob], 'QR_Borang_Permohonan.png', { type: 'image/png' });
                try {
                    await navigator.share({
                        title: 'Borang Permohonan Peminjaman Peralatan ICT',
                        text: 'Sila imbas QR Code atau klik pautan untuk akses borang permohonan.',
                        url: url,
                        files: [file]
                    });
                } catch (err) {
                    // Fallback: share without file
                    try {
                        await navigator.share({
                            title: 'Borang Permohonan Peminjaman Peralatan ICT',
                            text: 'Sila klik pautan untuk akses borang permohonan: ' + url,
                            url: url
                        });
                    } catch (e) {
                        fallbackShare(url);
                    }
                }
            });
        } else {
            navigator.share({
                title: 'Borang Permohonan Peminjaman Peralatan ICT',
                text: 'Sila klik pautan untuk akses borang permohonan.',
                url: url
            }).catch(() => fallbackShare(url));
        }
    } else {
        fallbackShare(url);
    }
}

function fallbackShare(url) {
    navigator.clipboard.writeText(url).then(() => {
        const toast = document.createElement('div');
        toast.innerHTML = '<i class="fas fa-check-circle"></i> Pautan disalin ke clipboard untuk dikongsi!';
        toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#2563eb;color:white;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.875rem;font-weight:600;z-index:99999;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 12px rgba(37,99,235,0.3);';
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    });
}

function showQRCode() {
    const url = window.location.origin + '/userform.html';
    Swal.fire({
        title: 'QR Code Permohonan',
        html: '<div id="qrcode" style="display: flex; justify-content: center; margin-top: 1rem;"></div>',
        didOpen: () => {
            new QRCode(document.getElementById("qrcode"), url);
        }
    });
}

function showTambahAdmin() {
    openModal('adminModal');
}

function showTambahKategori() {
    Swal.fire({
        title: 'Tambah Kategori',
        input: 'text',
        inputLabel: 'Nama Kategori',
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            // Save category
            let categories = getDB('db_categories');
            const newId = categories.length > 0 ? Math.max(...categories.map(c => c.id)) + 1 : 1;
            const newCat = { id: newId, nama: result.value };
            categories.push(newCat);
            saveDB('db_categories', categories);

            // Sync to GAS
            syncToGAS(newCat, 'create', 'kategori');

            renderCategoryTable();
            Swal.fire('Berjaya!', `Kategori "${result.value}" telah ditambah.`, 'success');
        }
    });
}

function showTambahModel() {
    openModal('computerModal');
}

/**
 * MUAT NAIK EXCEL (BULK IMPORT)
 */
async function handleExcelUpload(input) {
    const file = input.files[0];
    if (!file) return;

    Swal.fire({
        title: 'Memproses Fail Excel...',
        text: 'Sila tunggu sebentar...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                Swal.fire('Ralat', 'Fail Excel kosong atau format tidak sah.', 'error');
                return;
            }

            let computers = getDB(DB_KEYS.COMPS);
            let categories = getDB(DB_KEYS.CATS);
            let nextCompId = computers.length > 0 ? Math.max(...computers.map(c => c.id)) + 1 : 1;
            let nextCatId = categories.length > 0 ? Math.max(...categories.map(c => c.id)) + 1 : 1;

            let addedCount = 0;
            let newCategoriesDetected = [];

            for (const row of jsonData) {
                // Mapping: Nama header Excel ke Key Database (Case-insensitive match possible)
                const rawCat = row['Kategori'] || row['kategori'] || 'Lain-lain';
                const model = row['Model'] || row['model'] || '-';
                const noPC = row['No PC'] || row['noPC'] || row['No. PC'] || '-';
                const noSiri = row['No Siri'] || row['noSiri'] || row['No. Siri'] || '-';
                const noPendaftaran = row['No Pendaftaran'] || row['noPendaftaran'] || row['No. Pendaftaran'] || '-';

                // 1. Pastikan Kategori wujud
                let catObj = categories.find(c => c.nama.toLowerCase() === rawCat.toLowerCase());
                if (!catObj) {
                    catObj = { id: nextCatId++, nama: rawCat };
                    categories.push(catObj);
                    newCategoriesDetected.push(catObj);
                }

                // 2. Cipta Objek Komputer
                const newComp = {
                    id: nextCompId++,
                    kategori: catObj.nama,
                    model: model,
                    noPC: noPC,
                    noSiri: noSiri,
                    noPendaftaran: noPendaftaran
                };

                computers.push(newComp);

                // 3. Sync ke GAS (Parallel-ish but simple)
                syncToGAS(newComp, 'create', 'komputer');
                addedCount++;
            }

            // Sync kategori baru jika ada
            for (const nc of newCategoriesDetected) {
                syncToGAS(nc, 'create', 'kategori');
            }

            // Simpan ke memory & render
            saveDB(DB_KEYS.COMPS, computers);
            saveDB(DB_KEYS.CATS, categories);

            renderComputerTable();
            renderCategoryTable();

            Swal.fire({
                icon: 'success',
                title: 'Berjaya!',
                text: `${addedCount} unit komputer telah berjaya diimport dari Excel.`,
            });

        } catch (error) {
            console.error('Excel Import Error:', error);
            Swal.fire('Ralat', 'Gagal memproses fail Excel. Pastikan format betul.', 'error');
        } finally {
            input.value = ''; // Reset input
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * MUAT TURUN TEMPLAT EXCEL
 */
function downloadExcelTemplate() {
    const headers = [['Kategori', 'Model', 'No PC', 'No Siri', 'No Pendaftaran']];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(headers);

    // Set column widths for better visibility
    ws['!cols'] = [
        { wch: 20 }, // Kategori
        { wch: 20 }, // Model
        { wch: 15 }, // No PC
        { wch: 20 }, // No Siri
        { wch: 25 }  // No Pendaftaran
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Template_Komputer");
    XLSX.writeFile(wb, "Templat_Import_Komputer.xlsx");

    Swal.fire({
        icon: 'success',
        title: 'Templat Dimuat Turun!',
        text: 'Sila isi maklumat dalam fail Excel tersebut dan muat naik semula.',
        timer: 2000,
        showConfirmButton: false
    });
}

/* ==============================
   SETTINGS - SAVE/LOAD TO LOCALSTORAGE
============================== */
// Helper untuk baca fail imej ke Base64
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

async function saveSettings() {
    const idle = document.getElementById('idleTime')?.value || "1800";
    const sound = document.getElementById('soundChoice')?.value || "bell";
    const volume = document.getElementById('soundVolume')?.value || "80";
    const isMuted = document.getElementById('muteSound')?.checked || false;

    // gasToken logic
    const gasTokenEl = document.getElementById('gasToken');
    const gasToken = gasTokenEl ? gasTokenEl.value : (getDB('db_settings').gasToken || GAS_TOKEN);

    // Ambil data lama untuk kekalkan imej jika tiada upload baru
    const oldSettings = JSON.parse(localStorage.getItem('db_settings') || '{}');
    let logo = oldSettings.logo || '';
    let bg = oldSettings.bg || '';

    // Proses upload imej (jika ada)
    const logoEl = document.getElementById('logoUpload');
    const bgEl = document.getElementById('bgUpload');

    if (logoEl && logoEl.files[0]) logo = await readFileAsDataURL(logoEl.files[0]);
    if (bgEl && bgEl.files[0]) bg = await readFileAsDataURL(bgEl.files[0]);

    const themeChoice = document.getElementById('themeChoice')?.value || "light";
    const settings = { idle, sound, volume, isMuted, gasToken, logo, bg, themeChoice };
    localStorage.setItem('db_settings', JSON.stringify(settings));

    // Papar Loading
    Swal.fire({
        title: 'Menyimpan & Menyelaras...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // Sync to GAS (Semua tetapan termasuk imej Base64)
        await syncToGAS({ id: 'current', ...settings }, 'update', 'tetapan');

        // Refresh UI
        loadSettings();
        playSound('bell');

        Swal.fire('Berjaya!', 'Tetapan telah disimpan ke Cloud.', 'success');
        console.log('✅ Settings Saved & Synced:', settings);
    } catch (error) {
        console.error('❌ Ralat Simpan Tetapan:', error);
        Swal.fire('Ralat', 'Gagal menyimpan ke Cloud.', 'error');
    }
}

function loadSettings() {
    const data = localStorage.getItem('db_settings');
    if (!data) return;

    const settings = JSON.parse(data);
    const idleEl = document.getElementById('idleTime');
    const soundEl = document.getElementById('soundChoice');
    const volumeEl = document.getElementById('soundVolume');
    const muteEl = document.getElementById('muteSound');
    const gasTokenEl = document.getElementById('gasToken');
    const themeChoiceEl = document.getElementById('themeChoice');

    if (idleEl && settings.idle) idleEl.value = settings.idle;
    if (soundEl && settings.sound) soundEl.value = settings.sound;
    if (volumeEl && settings.volume) volumeEl.value = settings.volume;
    if (muteEl && settings.isMuted !== undefined) muteEl.checked = settings.isMuted;
    if (gasTokenEl && settings.gasToken) gasTokenEl.value = settings.gasToken;
    if (themeChoiceEl && settings.themeChoice) themeChoiceEl.value = settings.themeChoice;

    // Applikasi Imej & Identiti
    if (settings.logo) {
        const logoImg = document.getElementById('sidebarLogo');
        if (logoImg) logoImg.src = settings.logo;
    }
    if (settings.bg) {
        const bgContainer = document.getElementById('bgBlurContainer');
        if (bgContainer) bgContainer.style.backgroundImage = `url(${settings.bg})`;
    }

    applyTheme(settings.themeChoice || 'light');
}

/* ==============================
   SOUND & NOTIFICATION ENGINE
 ============================== */
const SOUNDS = {
    bell: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    chime: 'https://assets.mixkit.co/active_storage/sfx/2218/2218-preview.mp3',
    alert: 'https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3'
};

function playSound(type = null) {
    const settings = getDB('db_settings');
    if (settings.isMuted) return;

    const chosenType = type || settings.sound || 'bell';
    const volume = (settings.volume || 80) / 100;
    const url = SOUNDS[chosenType] || SOUNDS.bell;

    try {
        const audio = new Audio(url);
        audio.volume = volume;
        audio.play().catch(e => console.warn("🔇 Audio playback blocked by browser policy. Interaction required."));
    } catch (err) {
        console.error("❌ Audio Error:", err);
    }
}

function testSound() {
    const soundType = document.getElementById('soundChoice')?.value || 'bell';
    const volume = document.getElementById('soundVolume')?.value || 80;
    const isMuted = document.getElementById('muteSound')?.checked || false;

    if (isMuted) {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'Bunyi sedang di-mute',
            showConfirmButton: false,
            timer: 2000
        });
        return;
    }

    // Play temporary sound with current UI settings
    const url = SOUNDS[soundType] || SOUNDS.bell;
    const audio = new Audio(url);
    audio.volume = volume / 100;
    audio.play();
}

/* ==============================
   IMAGE CLEAR FUNCTIONS
 ============================== */
async function clearImage(type) {
    const settings = getDB('db_settings');
    if (type === 'logo') {
        settings.logo = '';
        const logoImg = document.getElementById('sidebarLogo');
        if (logoImg) logoImg.src = "https://kukuro.ums.edu.my/img/Logo%20Digital%20UMS%20warnaPNG.png";
        document.getElementById('logoUpload').value = '';
    } else if (type === 'bg') {
        settings.bg = '';
        const bgContainer = document.getElementById('bgBlurContainer');
        if (bgContainer) bgContainer.style.backgroundImage = 'none';
        document.getElementById('bgUpload').value = '';
    }

    saveDB('db_settings', settings);

    try {
        await syncToGAS({ id: 'current', ...settings }, 'update', 'tetapan');
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `Imej ${type} telah dipadam`,
            showConfirmButton: false,
            timer: 2000
        });
    } catch (e) {
        console.error("❌ Gagal sync pemadaman imej:", e);
    }
}

/* ==============================
   DARK MODE FUNCTIONS
============================== */
function applyTheme(theme) {
    const isDark = theme === 'dark';
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }

    const btn = document.getElementById('darkModeTopBtn');
    if (btn) {
        btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
}

function handleThemeSelect(theme) {
    applyTheme(theme);
    saveSettingsSilently();
}

function toggleDarkMode() {
    const isDark = document.body.classList.contains('dark-mode');
    const newTheme = isDark ? 'light' : 'dark';

    // Update select if exists
    const themeChoiceEl = document.getElementById('themeChoice');
    if (themeChoiceEl) {
        themeChoiceEl.value = newTheme;
    }

    applyTheme(newTheme);
    saveSettingsSilently();
}

async function saveSettingsSilently() {
    const idle = document.getElementById('idleTime')?.value || "1800";
    const sound = document.getElementById('soundChoice')?.value || "bell";
    const volume = document.getElementById('soundVolume')?.value || "80";
    const isMuted = document.getElementById('muteSound')?.checked || false;
    const gasTokenEl = document.getElementById('gasToken');
    const gasToken = gasTokenEl ? gasTokenEl.value : (getDB('db_settings').gasToken || GAS_TOKEN);
    const themeChoice = document.getElementById('themeChoice')?.value || "light";

    const oldSettings = JSON.parse(localStorage.getItem('db_settings') || '{}');
    const logo = oldSettings.logo || '';
    const bg = oldSettings.bg || '';

    const settings = { idle, sound, volume, isMuted, gasToken, logo, bg, themeChoice };
    localStorage.setItem('db_settings', JSON.stringify(settings));

    try {
        await syncToGAS({ id: 'current', ...settings }, 'update', 'tetapan');
    } catch (e) {
        // fail silently
    }
}

// --- KONFIGURASI INTEGRASI (TANAM) ---
const GAS_TOKEN = "CHRIS_SHEETS_KEY_2026";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwZrFtrkH0r8p1BaPyGxQT1Tscb9jHyTtnHjm1eh8jv3Kys1vQ6xuHiPINXpRSSJ53NZg/exec";

function updateConnectionStatus(isConnected) {
    const statusBox = document.getElementById('connectionStatus');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');

    if (!statusBox || !statusIcon || !statusText) return;

    if (isConnected) {
        statusBox.style.background = '#f0fdf4';
        statusBox.style.borderColor = '#16a34a';
        statusIcon.className = 'fas fa-check-circle';
        statusIcon.style.color = '#16a34a';
        statusIcon.classList.remove('fa-spin');
        statusText.textContent = 'Status: Berjaya Berhubung (Online)';
        statusText.style.color = '#166534';
    } else {
        statusBox.style.background = '#fef2f2';
        statusBox.style.borderColor = '#ef4444';
        statusIcon.className = 'fas fa-exclamation-circle';
        statusIcon.style.color = '#ef4444';
        statusIcon.classList.remove('fa-spin');
        statusText.textContent = 'Status: Sambungan Gagal (Offline)';
        statusText.style.color = '#991b1b';
    }
}

async function testGasConnection() {
    const url = GAS_URL;

    if (!url) {
        Swal.fire('Ralat', 'URL Google Script tidak dijumpai (Internal Error).', 'error');
        return;
    }

    Swal.fire({
        title: 'Menguji Sambungan...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: 'test', token: GAS_TOKEN })
        });
        updateConnectionStatus(true);
        Swal.fire('Berjaya!', 'Sambungan berjaya. Kunci (Token) telah dikesan secara automatik.', 'success');
    } catch (error) {
        console.error('GAS Test Error:', error);
        updateConnectionStatus(false);
        Swal.fire('Gagal', 'Tidak dapat menghubungi Google Script. Periksa URL anda.', 'error');
    }
}

// Fungsi untuk sinkronisasi data ke Google Sheets
async function syncToGAS(data, action = 'update', sheet = 'permohonan') {
    const url = GAS_URL;
    if (!url) return;

    try {
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: action,
                token: GAS_TOKEN,
                data: {
                    ...data,
                    jenis_data: sheet
                }
            })
        });
        console.log(`✅ Sinkronisasi GAS [${sheet}] (${action}) Berjaya`);
    } catch (error) {
        console.error(`❌ GAS Sync Error [${sheet}]:`, error);
    }
}

// Fungsi untuk menarik SEMUA data dari Google Sheets (Turbo Sync Engine v5)
async function fetchAllFromGAS() {
    const url = GAS_URL;
    if (!url) {
        updateConnectionStatus(false);
        return;
    }

    // LIST JADUAL
    const tableConfigs = [
        { sheet: 'permohonan', key: DB_KEYS.APPS },
        { sheet: 'komputer', key: DB_KEYS.COMPS },
        { sheet: 'kategori', key: DB_KEYS.CATS },
        { sheet: 'admin', key: DB_KEYS.ADMINS },
        { sheet: 'tetapan', key: 'db_settings' }
    ];

    console.log('🚀 Mula Turbo Sync (Parallel Mode)...');

    // 1. STALE-WHILE-REVALIDATE: Papar data sedia ada dulu (Laju gila!)
    // Ini menjadikan masa menunggu "perasan" (perceived time) adalah 0ms.
    renderAllUI();

    try {
        // 2. BULK FETCH (TURBO 12X): Tarik SEMUA sheet dalam SATU request sahaja.
        // Menghapuskan latency HTTP connection berganda.
        const resData = await fetch(`${url}?action=read&token=${GAS_TOKEN}&sheet=all`);
        const result = await resData.json();

        if (result && result.status === 'success' && result.data) {
            const allData = result.data;
            let hasChanges = false;

            // Mapping data dari Bulk Response
            const mappings = [
                { sheet: 'permohonan', key: DB_KEYS.APPS },
                { sheet: 'komputer', key: DB_KEYS.COMPS },
                { sheet: 'kategori', key: DB_KEYS.CATS },
                { sheet: 'admin', key: DB_KEYS.ADMINS },
                { sheet: 'tetapan', key: 'db_settings' }
            ];

            mappings.forEach(m => {
                // 1. Dynamic Search (Case-Insensitive & Common Plurals)
                const possibleNames = [m.sheet, m.sheet + 's', m.sheet + 'res'];
                let newData = undefined;

                // Cari key yang sepadan dalam respons GAS (Case Insensitive)
                const responseKeys = Object.keys(allData);
                for (const potentialName of possibleNames) {
                    const match = responseKeys.find(k => k.toLowerCase() === potentialName.toLowerCase());
                    if (match) {
                        newData = allData[match];
                        break;
                    }
                }

                // 2. Perlindungan 'Data Hilang': Jika sheet tiada dalam respons, abaikan perbandingan.
                if (newData === undefined) {
                    console.warn(`⚠️ Sheet [${m.sheet}] tidak dijumpai dalam respons Bulk. Melangkau update.`);
                    return;
                }

                // 3. Perlindungan 'Overwrite Kosong': Jangan benarkan overwrite dengan senarai kosong jika local ada data
                const currentData = getDB(m.key);
                if (Array.isArray(newData) && newData.length === 0 && currentData.length > 0) {
                    // Kecuali jika memang kita nak kosongkan, tapi buat masa ni kita protect
                    if (m.sheet === 'admin') {
                        console.warn(`⚠️ Respons Cloud untuk [admin] adalah kosong. Mode perlindungan diaktifkan.`);
                        return;
                    }
                }

                if (m.sheet === 'tetapan') {
                    newData = (Array.isArray(newData) && newData.length > 0) ? newData[0] : newData;
                }

                const currentDataStr = JSON.stringify(currentData);
                const newDataStr = JSON.stringify(newData);

                if (currentDataStr !== newDataStr) {
                    saveDB(m.key, newData);
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                renderAllUI();
                console.log('✨ Data dikemaskini (Bulk Turbo Mode).');
            }
            updateConnectionStatus(true);
        }
    } catch (error) {
        console.error('❌ Kegagalan Sync Cloud:', error);
        updateConnectionStatus(false);
    }
}

// Fungsi Helper untuk render semua UI sekali gus (Efficiency)
function renderAllUI() {
    renderApplicationTable();
    renderDashboardStats();
    renderComputerTable();
    renderCategoryTable();
    renderAdminTable();
    loadSettings();
}

function logout() {
    Swal.fire({
        title: 'Log Keluar?',
        text: "Anda pasti ingin keluar dari sistem?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Log Keluar',
        cancelButtonText: 'Batal'
    }).then(async (result) => {
        if (result.isConfirmed) {
            // Clear SessionId in Firestore
            const session = localStorage.getItem('loggedInAdmin');
            if (session) {
                const adminData = JSON.parse(session);
                const usernameKey = adminData.username.toLowerCase().trim();
                try {
                    await db.collection('admins').doc(usernameKey).update({ sessionId: null });
                } catch (e) {
                    console.error("Gagal memadam sessionId:", e);
                }
            }

            localStorage.removeItem('loggedInAdmin');
            firebase.auth().signOut().then(() => {
                window.location.href = '../index.html';
            });
        }
    });
}

function previewForm() {
    Swal.fire({
        title: 'Pratonton Borang Permohonan',
        html: `<iframe src="../formuser/index.html" style="width: 100%; height: 500px; border: none; border-radius: var(--radius);"></iframe>`,
        width: '800px',
        showCloseButton: true,
        showConfirmButton: false,
        confirmButtonText: 'Kembali',
    }).then(() => {
        // When preview is closed (X button), reopen Share modal at Tab 1
        showShareModal('tab1');
    });
}

function showFormUser() {
    window.location.href = '../formuser/index.html';
}
function openFormAdmin() {
    window.location.href = '../formadmin/formadmin.html';
}

/* ==============================
   CLOUD-BASED DATA ENGINE (NO LOCALSTORAGE)
   ============================== */
const DB_KEYS = {
    APPS: 'db_applications',
    COMPS: 'db_computers',
    ADMINS: 'db_admins',
    CATS: 'db_categories'
};

// In-Memory Storage (Data tidak akan kekal dalam browser selepas Refresh/Tutup Tab)
// Sumber tunggal kebenaran adalah Google Sheets.
let CORE_DATA = {
    [DB_KEYS.APPS]: [],
    [DB_KEYS.COMPS]: [],
    [DB_KEYS.ADMINS]: [],
    [DB_KEYS.CATS]: []
};

function getDB(key) {
    // Tetapan & Login masih di LocalStorage untuk memori browser
    if (key === 'db_settings' || key === 'loggedInAdmin') {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : (key === 'db_settings' ? {} : null);
    }
    // Jadual data diambil dari memory
    return CORE_DATA[key] || [];
}

function saveDB(key, data) {
    if (key === 'db_settings' || key === 'loggedInAdmin') {
        localStorage.setItem(key, JSON.stringify(data));
        return;
    }
    // Update memory only (Matikan simpanan ke LocalStorage)
    CORE_DATA[key] = data;
    console.log(`ℹ️ Memory Update [${key}]. Simpanan ke LocalStorage dilangkau (Cloud Only mode).`);
}

function initMockData() {
    // 1. Ambil data sesi semasa
    const session = localStorage.getItem('loggedInAdmin');
    const currentUser = session ? JSON.parse(session) : null;

    // 2. Sediakan Admin kecemasan dalam memory (Hanya jika Cloud belum ditarik)
    if (CORE_DATA[DB_KEYS.ADMINS].length === 0) {
        if (currentUser) {
            // Gunakan identiti sebenar user yang sedang login sebagai admin pertama
            CORE_DATA[DB_KEYS.ADMINS].push({
                id: currentUser.id || 1,
                nama: currentUser.nama || 'Admin Utama',
                email: currentUser.email || 'admin@ums.edu.my',
                username: currentUser.username || (currentUser.email ? currentUser.email.split('@')[0] : 'admin'),
                jawatan: currentUser.jawatan || 'Pentadbir Sistem',
                peranan: currentUser.peranan || 'Admin',
                password: '***'
            });
        } else {
            // Fallback terakhir jika tiada sesi langsung
            CORE_DATA[DB_KEYS.ADMINS].push({
                id: 1,
                nama: 'Super Admin',
                username: 'admin',
                email: 'admin@ums.edu.my',
                jawatan: 'Pentadbir Sistem',
                peranan: 'Pemilik',
                password: 'admin123'
            });
        }
    }

    renderAllTables();
    renderDashboardStats();
}

/* ==============================
   RENDER ALL TABLES
============================== */
function renderAllTables() {
    renderAdminTable();
    renderComputerTable();
    renderApplicationTable();
    renderCategoryTable();
}

/* ==============================
   DASHBOARD STATS (Dynamic from localStorage)
============================== */
function renderDashboardStats() {
    const apps = getDB(DB_KEYS.APPS);

    const countBaru = apps.filter(a => a.status === 'Menunggu' || a.status === 'Baru').length;
    const countLulus = apps.filter(a => a.status === 'Lulus').length;
    const countDipulangkan = apps.filter(a => a.status === 'Dipulangkan').length;
    const countLewat = apps.filter(a => a.status === 'Lewat').length;
    const countDitolak = apps.filter(a => a.status === 'Ditolak' || a.status === 'Tolak').length;

    // Update stat cards
    const statCards = document.querySelectorAll('.stat-card');
    if (statCards.length >= 6) {
        statCards[0].querySelector('.value').textContent = apps.length;
        statCards[1].querySelector('.value').textContent = countBaru;
        statCards[2].querySelector('.value').textContent = countLulus;
        statCards[3].querySelector('.value').textContent = countDipulangkan;
        statCards[4].querySelector('.value').textContent = countLewat;
        statCards[5].querySelector('.value').textContent = countDitolak;
    }

    // Update notification
    const notifEl = document.getElementById('actionNotifications');
    if (notifEl) {
        if (countBaru > 0) {
            notifEl.innerHTML = `<p style="color: var(--warning); font-size: 0.875rem;"><i class="fas fa-exclamation-triangle"></i> <strong>${countBaru}</strong> permohonan baru menunggu kelulusan.</p>`;
        } else {
            notifEl.innerHTML = `<p style="color: var(--text-muted); font-size: 0.875rem;">Tiada tindakan segera diperlukan.</p>`;
        }
    }

    // Update notification bar
    const alertBar = document.querySelector('#dashboard .alert');
    if (alertBar) {
        alertBar.innerHTML = `<i class="fas fa-bell"></i> <strong>Notifikasi:</strong> ${countBaru} permohonan baru menunggu kelulusan. Jumlah rekod: ${apps.length}.`;
    }
}

/* ==============================
   RENDER ADMIN TABLE
============================== */
function renderAdminTable() {
    const table = document.getElementById('adminTableBody');
    if (!table) return;

    let data = getDB(DB_KEYS.ADMINS);

    // Dapatkan data sesi semasa
    const session = localStorage.getItem('loggedInAdmin');
    const currentUser = session ? JSON.parse(session) : null;

    // EMERGENCY RECOVERY: Jika data kosong, cuba masukkan user semasa (Proteksi Penuh)
    if (data.length === 0 && currentUser) {
        console.warn("⚠️ Data admin kosong. Memulihkan daripada sesi untuk paparan.");
        data = [{
            id: currentUser.id || 1,
            nama: currentUser.nama,
            email: currentUser.email,
            username: currentUser.username || currentUser.email.split('@')[0],
            jawatan: currentUser.jawatan || 'Pentadbir',
            peranan: currentUser.peranan || 'Admin'
        }];
    }

    if (data.length === 0) {
        table.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Tiada data admin.</td></tr>`;
        return;
    }

    table.innerHTML = data.map(admin => {
        const isMe = currentUser && (admin.email === currentUser.email || admin.id === currentUser.id);

        return `
            <tr class="${isMe ? 'row-me' : ''}">
                <td data-label="Nama">
                    ${admin.nama} 
                    ${isMe ? '<span style="background: #22c55e; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; margin-left: 5px; font-weight: 700;">SAYA</span>' : ''}
                </td>
                <td data-label="Username">${admin.username || '-'}</td>
                <td data-label="Email">${admin.email}</td>
                <td data-label="Jawatan">${admin.jawatan || '-'}</td>
                <td data-label="Peranan">${admin.peranan}</td>
                <td data-label="Tindakan">
                    <button class="btn btn-outline" onclick="editAdmin(${admin.id})" title="Edit Admin" style="padding: 0.25rem 0.5rem;"><i class="fas fa-user-edit"></i></button>
                    <button class="btn btn-outline" onclick="resetAdminPassword(${admin.id})" title="Reset Password" style="padding: 0.25rem 0.5rem; color: var(--warning);"><i class="fas fa-key"></i></button>
                    ${isMe ?
                `<button class="btn btn-outline" disabled title="Anda tidak boleh padam akaun sendiri" style="padding: 0.25rem 0.5rem; color: #cbd5e1; cursor: not-allowed;"><i class="fas fa-trash"></i></button>` :
                `<button class="btn btn-outline" onclick="deleteAdmin(${admin.id})" title="Padam Admin" style="padding: 0.25rem 0.5rem; color: var(--danger);"><i class="fas fa-trash"></i></button>`
            }
                </td>
            </tr>
        `;
    }).join('');
}

/* ==============================
   RENDER COMPUTER TABLE
============================== */
function renderComputerTable() {
    const table = document.getElementById('computerTableBody');
    if (!table) return;
    const data = getDB(DB_KEYS.COMPS);

    if (data.length === 0) {
        table.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Tiada data komputer.</td></tr>`;
        return;
    }

    // Group by category
    const grouped = data.reduce((acc, comp) => {
        const cat = comp.kategori || 'Lain-lain';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(comp);
        return acc;
    }, {});

    let html = '';
    window.toggleCategoryRows = function (catId) {
        const rows = document.querySelectorAll('.cat-row-' + catId);
        const icon = document.getElementById('icon_' + catId);
        let isHidden = false;

        rows.forEach(row => {
            if (row.style.display === 'none') {
                row.style.display = '';
            } else {
                row.style.display = 'none';
                isHidden = true;
            }
        });

        if (icon) {
            icon.className = isHidden ? 'fas fa-folder' : 'fas fa-folder-open';
        }
    };

    Object.keys(grouped).sort().forEach(cat => {
        const catId = cat.replace(/[^a-zA-Z0-9]/g, '_');
        // Category Header Row
        html += `
            <tr class="category-group-row" style="background: var(--bg-main); cursor: pointer;" onclick="toggleCategoryRows('${catId}')" title="Klik untuk Buka/Tutup">
                <td colspan="6" style="padding: 0.75rem 1rem; border-left: 4px solid var(--primary);">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <i id="icon_${catId}" class="fas fa-folder-open" style="color: var(--primary); font-size: 1.1rem;"></i>
                            <span style="font-weight: 700; color: var(--text-main); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px;">
                                ${cat} (${grouped[cat].length} Unit)
                            </span>
                        </div>
                        <i class="fas fa-chevron-down" style="color: var(--text-muted); font-size: 0.8rem;"></i>
                    </div>
                </td>
            </tr>
        `;

        // Item Rows
        grouped[cat].forEach(comp => {
            html += `
                <tr class="cat-row-${catId}">
                    <td style="padding-left: 2rem; color: var(--text-muted); font-size: 0.85rem;"><em>${cat}</em></td>
                    <td data-label="Model" style="font-weight: 600;">${comp.model}</td>
                    <td data-label="No. PC">${comp.noPC || '-'}</td>
                    <td data-label="No. Siri">${comp.noSiri || '-'}</td>
                    <td data-label="No. Pendaftaran UMS">${comp.noPendaftaran || '-'}</td>
                    <td data-label="Tindakan">
                        <button class="btn btn-outline" onclick="editComputer(${comp.id})" style="padding: 0.25rem 0.5rem;"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-outline" onclick="deleteComputer(${comp.id})" style="padding: 0.25rem 0.5rem; color: var(--danger);"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    });

    table.innerHTML = html;
}

/* ==============================
   RENDER CATEGORY TABLE
============================== */
function renderCategoryTable() {
    const table = document.getElementById('categoryTableBody');
    if (!table) return;
    const data = getDB(DB_KEYS.CATS);

    if (data.length === 0) {
        table.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 2rem; color: var(--text-muted);">Tiada kategori.</td></tr>`;
        return;
    }

    table.innerHTML = data.map(cat => `
        <tr>
            <td data-label="Nama Kategori">${cat.nama}</td>
            <td data-label="Tindakan">
                <button class="btn btn-outline" onclick="deleteCategory(${cat.id})" style="padding: 0.25rem 0.5rem; color: var(--danger);"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    // Pastikan dropdown kategori juga dikemaskini
    populateCategoryDropdown();
}

/* ==============================
   RENDER APPLICATION TABLE
============================== */
function renderApplicationTable() {
    const activeTable = document.getElementById('applicantTableBody');
    const completedTable = document.getElementById('completedTableBody');
    const delayedTable = document.getElementById('delayedTableBody');
    const rejectedTable = document.getElementById('rejectedTableBody');

    if (!activeTable || !completedTable || !delayedTable || !rejectedTable) return;

    const data = getDB(DB_KEYS.APPS);

    // Filter data
    const activeData = data.filter(app => !['Selesai', 'Dipulangkan', 'Ditolak', 'Tolak', 'Lewat'].includes(app.status));
    const completedData = data.filter(app => ['Selesai', 'Dipulangkan'].includes(app.status));
    const delayedData = data.filter(app => app.status === 'Lewat');
    const rejectedData = data.filter(app => app.status === 'Ditolak' || app.status === 'Tolak');

    // Helper function to render rows
    const renderRows = (apps, targetTable, emptyMsg) => {
        if (apps.length === 0) {
            targetTable.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">${emptyMsg}</td></tr>`;
            return;
        }

        targetTable.innerHTML = apps.map(app => {
            // Parse feedback if it's a string
            let fb = app.feedback;
            if (typeof fb === 'string') {
                try { fb = JSON.parse(fb); } catch (e) { fb = null; }
            }

            let rows = `
                <tr>
                    <td data-label="No. Permohonan"><strong>${app.noPermohonan}</strong></td>
                    <td data-label="Maklumat Pemohon">
                        <div style="font-weight: 600; color: var(--primary);">${app.nama}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                            <i class="fas fa-id-badge" style="width: 14px;"></i> ${app.noPekerja} | ${app.jabatan}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 5px; border-top: 1px dashed #e2e8f0; padding-top: 5px;">
                            <span style="font-weight: 600; font-size: 0.7rem; text-transform: uppercase; color: #94a3b8; display: block; margin-bottom: 2px;">Emel Pemohon:</span>
                            <i class="fas fa-envelope" style="width: 14px; color: var(--primary);"></i> ${app.email}
                        </div>
                    </td>
                    <td data-label="Maklumat Pinjaman">
                        <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; margin-bottom: 2px;">Tujuan/Jenis:</div>
                        <div style="font-weight: 500; margin-bottom: 6px;">${app.jenis}</div>
                        
                        <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; margin-bottom: 2px; border-top: 1px dashed #e2e8f0; padding-top: 4px;">Peralatan:</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                            <i class="fas fa-laptop" style="width: 14px;"></i> ${app.model}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">
                            <i class="fas fa-layer-group" style="width: 14px;"></i> ${app.kuantiti}
                        </div>
                        ${app.siri ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px; border-top: 1px dotted #e2e8f0; padding-top: 4px;">Siri: ${app.siri}</div>` : ''}
                    </td>
                    <td data-label="Tempoh Penggunaan">
                        <div style="font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem;">
                            <i class="fas fa-calendar-alt" style="color: var(--success); font-size: 0.7rem;"></i>
                            <span><strong>Mula:</strong> ${app.mula}</span>
                        </div>
                        ${app.scanPinjam ? `<div style="font-size: 0.7rem; color: #059669; padding-left: 1.1rem;">Scan: ${app.scanPinjam}</div>` : ''}
                        
                        <div style="font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem; margin-top: 4px;">
                            <i class="fas fa-calendar-check" style="color: var(--danger); font-size: 0.7rem;"></i>
                            <span><strong>Tamat:</strong> ${app.tamat}</span>
                        </div>
                        ${app.scanPulang ? `<div style="font-size: 0.7rem; color: #dc2626; padding-left: 1.1rem;">Scan: ${app.scanPulang}</div>` : ''}
                    </td>
                    <td data-label="Status">
                        <span class="badge status-${getStatusClass(app.status)}">${app.status}</span>
                    </td>
                    <td data-label="Tindakan">
                        <div style="display: flex; gap: 0.4rem;">
                            <button class="btn btn-primary" onclick="urusApp(${app.id})" title="Urus" style="padding: 0.4rem 0.6rem; font-size: 0.75rem;">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-primary" onclick="window.open('../printfile/print.html?id=${app.id}', '_blank')" title="Cetak Borang" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; background-color: #6366f1;">
                                <i class="fas fa-print"></i>
                            </button>
                            <button class="btn btn-outline" onclick="deleteApplication(this, ${app.id})" title="Padam" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; color: var(--danger); border-color: #fee2e2;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;

            if (fb) {
                rows += `
                <tr class="feedback-row" style="background-color: #fffaf5;">
                    <td colspan="6" style="padding: 0 15px 15px 15px; border-top: none;">
                        <div class="feedback-container" style="background: white; border: 1px solid #fed7aa; border-radius: 0 0 12px 12px; border-top: 3px solid #fbbf24; padding: 12px 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                            <div class="feedback-flex" style="display: flex; align-items: center; justify-content: space-between; gap: 30px;">
                                <div class="feedback-header-info" style="display: flex; align-items: center; gap: 10px; min-width: 180px;">
                                    <div style="background: #fff7ed; padding: 8px; border-radius: 8px; color: #ea580c;">
                                        <i class="fas fa-comment-dots fa-lg"></i>
                                    </div>
                                    <div>
                                        <div style="font-size: 0.75rem; font-weight: 800; color: #ea580c; text-transform: uppercase; letter-spacing: 0.05em;">Maklumbalas Peminjam</div>
                                        <div style="font-size: 0.65rem; color: #94a3b8;">Diterima: ${fb.submittedAt || '-'}</div>
                                    </div>
                                </div>

                                <div class="feedback-stats" style="display: flex; flex: 1; justify-content: space-around; align-items: center; background: #fafafa; padding: 10px; border-radius: 10px;">
                                    <div class="stat-item" style="text-align: center;">
                                        <div style="font-size: 0.6rem; font-weight: 800; color: #64748b; margin-bottom: 2px;">KEMUDAHAN</div>
                                        <div style="color: #fbbf24; font-size: 1rem; letter-spacing: 2px;">${'★'.repeat(fb.ratings?.kemudahan || 0)}${'☆'.repeat(4 - (fb.ratings?.kemudahan || 0))}</div>
                                    </div>
                                    <div class="stat-divider" style="width: 1px; height: 30px; background: #e2e8f0;"></div>
                                    <div class="stat-item" style="text-align: center;">
                                        <div style="font-size: 0.6rem; font-weight: 800; color: #64748b; margin-bottom: 2px;">PENYAMPAIAN</div>
                                        <div style="color: #fbbf24; font-size: 1rem; letter-spacing: 2px;">${'★'.repeat(fb.ratings?.penyampaian || 0)}${'☆'.repeat(4 - (fb.ratings?.penyampaian || 0))}</div>
                                    </div>
                                    <div class="stat-divider" style="width: 1px; height: 30px; background: #e2e8f0;"></div>
                                    <div class="stat-item" style="text-align: center;">
                                        <div style="font-size: 0.6rem; font-weight: 800; color: #64748b; margin-bottom: 2px;">KESELURUHAN</div>
                                        <div style="color: #fbbf24; font-size: 1rem; letter-spacing: 2px;">${'★'.repeat(fb.ratings?.keseluruhan || 0)}${'☆'.repeat(4 - (fb.ratings?.keseluruhan || 0))}</div>
                                    </div>
                                    <div class="stat-divider" style="width: 1px; height: 30px; background: #e2e8f0;"></div>
                                    <div class="stat-item" style="text-align: center;">
                                        <div style="font-size: 0.6rem; font-weight: 800; color: #64748b; margin-bottom: 2px;">MEMBANTU?</div>
                                        <div style="font-size: 0.8rem; font-weight: 900; color: #10b981;">${fb.help || 'N/A'}</div>
                                    </div>
                                </div>

                                <div class="feedback-notes" style="flex: 1; max-width: 400px; position: relative;">
                                    <div style="padding: 10px 15px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; font-style: italic; font-size: 0.75rem; color: #92400e; line-height: 1.5;">
                                        <i class="fas fa-quote-left" style="color: #fbd38d; margin-right: 8px;"></i>
                                        ${fb.notes || 'Tiada cadangan penambahbaikan dikongsi.'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
                `;
            }

            return rows;
        }).join('');
    };

    // Render all tables
    renderRows(activeData, activeTable, 'Tiada permohonan aktif.');
    renderRows(completedData, completedTable, 'Tiada rekod selesai.');
    renderRows(delayedData, delayedTable, 'Tiada rekod lewat.');
    renderRows(rejectedData, rejectedTable, 'Tiada rekod ditolak.');

    // Paparan Amaran Lewat (Tanda Peringatan Merah)
    const lateContainer = document.getElementById('lateAlertContainer');
    if (lateContainer) {
        if (delayedData.length > 0) {
            lateContainer.innerHTML = `
                <div class="alert alert-danger" style="background: #fef2f2; border: 2px solid #ef4444; color: #b91c1c; padding: 1rem; border-radius: 8px; margin: 1rem 0; display: flex; align-items: center; gap: 1rem; animation: alert-pulse 2s infinite;">
                    <i class="fas fa-hand-holding-warning fa-2x"></i>
                    <div>
                        <strong style="font-size: 1rem;">PERHATIAN: Terdapat ${delayedData.length} permohonan lewat!</strong>
                        <p style="margin: 0; font-size: 0.85rem; opacity: 0.9;">Sila ambil tindakan segera untuk menghubungi peminjam di bawah.</p>
                    </div>
                </div>
                <style>
                    @keyframes alert-pulse {
                        0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                        70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                    }
                </style>
            `;
        } else {
            lateContainer.innerHTML = '';
        }
    }

    // Also refresh dashboard stats
    renderDashboardStats();
}

function deleteApplication(btn, id) {
    Swal.fire({
        title: 'Padam Rekod?',
        text: "Data pemohon ini akan dibuang secara kekal dari LocalStorage!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Padamkan!',
        cancelButtonText: 'Batal',
        showClass: {
            popup: 'animate__animated animate__fadeInDown'
        },
        hideClass: {
            popup: 'animate__animated animate__fadeOutUp'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const row = btn.closest('tr');
            if (row) row.classList.add('row-fade-out');

            setTimeout(() => {
                let apps = getDB(DB_KEYS.APPS);
                const appToDelete = apps.find(a => a.id === id);
                apps = apps.filter(a => a.id !== id);
                saveDB(DB_KEYS.APPS, apps);

                // Sync to GAS (Delete)
                if (appToDelete) {
                    syncToGAS({ id: id }, 'delete', 'permohonan');
                }

                renderApplicationTable();

                Swal.fire({
                    title: 'Dipadam!',
                    text: 'Rekod telah berjaya dipadam dari Cloud.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }, 500);
        }
    });
}

function getStatusClass(status) {
    if (status === 'Menunggu' || status === 'Baru') return 'waiting';
    if (status === 'Lulus') return 'approved';
    if (status === 'Ditolak' || status === 'Tolak') return 'danger';
    if (status === 'Dipulangkan') return 'info';
    if (status === 'Lewat') return 'danger';
    return 'info';
}

function urusApp(id) {
    const apps = getDB(DB_KEYS.APPS);
    const app = apps.find(a => a.id === id);
    if (!app) return;

    const detailBody = document.getElementById('urusDetailBody');
    const actionButtons = document.getElementById('actionButtons');

    detailBody.innerHTML = `
        <!-- BAHAGIAN 1: MAKLUMAT PEMOHON -->
        <div class="modal-section-title primary">
            <i class="fas fa-user-circle"></i> 1. Maklumat Pemohon
        </div>
        <div class="view-only-grid">
            <div class="form-group">
                <label>No. Permohonan</label>
                <div class="info-box">${app.noPermohonan}</div>
            </div>
            <div class="form-group">
                <label>Nama Penuh</label>
                <div class="info-box">${app.nama}</div>
            </div>
            <div class="form-group">
                <label>No. Pekerja</label>
                <div class="info-box">${app.noPekerja}</div>
            </div>
            <div class="form-group">
                <label>J/A/F/P/I/B</label>
                <div class="info-box">${app.jabatan}</div>
            </div>
            <div class="form-group">
                <label>No. Telefon</label>
                <div class="info-box">${app.telefon}</div>
            </div>
            <div class="form-group">
                <label>Email</label>
                <div class="info-box">${app.email}</div>
            </div>
            <div class="form-group">
                <label>Jenis Permohonan</label>
                <div class="info-box">${app.jenis}</div>
            </div>
            <div class="form-group">
                <label>Lokasi Penggunaan</label>
                <div class="info-box">${app.lokasi}</div>
            </div>
            <div class="form-group" style="grid-column: span 2;">
                <label>Tujuan Penggunaan</label>
                <div class="info-box">${app.tujuan}</div>
            </div>
            <div class="form-group" style="grid-column: span 2;">
                <label>Tarikh & Masa Scan (Rekod Sistem)</label>
                <div id="modalScanArea">
                    <table class="scan-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Tarikh & Masa</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${app.scanPinjam ? `<tr><td style="color:#f59e0b;font-weight:600;"><i class="fas fa-sign-out-alt"></i> Pinjam</td><td style="font-family:monospace;">${app.scanPinjam}</td></tr>` : ''}
                            ${app.scanPulang ? `<tr><td style="color:#10b981;font-weight:600;"><i class="fas fa-sign-in-alt"></i> Pulang</td><td style="font-family:monospace;">${app.scanPulang}</td></tr>` : ''}
                            ${(!app.scanPinjam && !app.scanPulang) ? `<tr><td colspan="2" style="text-align:center;color:#94a3b8;">Tiada rekod imbasan lagi.</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="form-group">
                <label>Tarikh Peminjaman</label>
                <div class="info-box">${app.mula}</div>
            </div>
            <div class="form-group">
                <label>Tarikh Pemulangan</label>
                <div class="info-box">${app.tamat}</div>
            </div>
        </div>

        <!-- BAHAGIAN 2: ITEM DIPINJAM -->
        <div class="modal-section-title primary">
            <i class="fas fa-laptop"></i> 2. Item Dipinjam
        </div>

        <div style="margin-bottom: 1rem; padding: 1rem; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; display: flex; align-items: center; gap: 15px;">
            <div style="background: #fef3c7; width: 45px; height: 45px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #d97706;">
                <i class="fas fa-clipboard-list" style="font-size: 1.5rem;"></i>
            </div>
            <div>
                <label style="font-weight:700; font-size:0.75rem; color:#92400e; text-transform:uppercase; display:block; letter-spacing: 0.5px; margin-bottom: 5px;">Permintaan Asal Pemohon</label>
                <div style="font-size:0.9rem; color:#b45309; line-height: 1.6; font-weight: 600;">${app.kuantitiAsal || app.kuantiti}</div>
            </div>
        </div>

        <div id="borrowedItemsArea" style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius); padding: 1.5rem;">
            <div id="borrowedItemsList" style="display: flex; flex-wrap: wrap; gap: 8px;">
                <!-- Diisi secara dinamik -->
            </div>
            <div id="borrowedItemsSummary" style="margin-top: 12px; border-top: 1px dashed #bfdbfe; padding-top: 8px; font-size: 0.85rem; color: #1e40af; font-weight: 600;">
                <!-- Ringkasan kuantiti di sini -->
            </div>
        </div>

        <!-- BAHAGIAN 3: TINDAKAN ADMIN -->
        <div class="modal-section-title danger">
            <i class="fas fa-user-shield"></i> 3. Tindakan Admin
        </div>
        <div class="admin-action-box">
            <div class="admin-grid-layout">
                <!-- KIRI: PILIHAN MODEL -->
                <div class="admin-card-section">
                    <label style="font-weight:700; font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:1rem; display:block;">Pilihan Model & Kuantiti</label>
                    
                    <div class="model-select-container" id="adminModelContainer">
                        <!-- Dinamik: diisi oleh buildAdminModelHTML -->
                    </div>
                </div>

                <!-- KANAN: STATUS & CATATAN -->
                <div class="status-note-container">
                    <div class="admin-card-section">
                        <label style="font-weight:700; font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.75rem; display:block;">Status & Nota</label>
                        
                        <div class="form-group" style="margin-bottom:1.25rem;">
                            <label style="font-size:0.8rem; margin-bottom:0.4rem;">Status Semasa</label>
                            <select id="admin_status" style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid #cbd5e1; font-weight:600; font-size:0.9rem; color:var(--primary);">
                                <option value="Baru" ${app.status === 'Baru' ? 'selected' : ''}>Baru</option>
                                <option value="Menunggu" ${app.status === 'Menunggu' ? 'selected' : ''}>Menunggu</option>
                                <option value="Lulus" ${app.status === 'Lulus' ? 'selected' : ''}>Lulus</option>
                                <option value="Tolak" ${app.status === 'Tolak' || app.status === 'Ditolak' ? 'selected' : ''}>Tolak</option>
                                <option value="Dipulangkan" ${app.status === 'Dipulangkan' ? 'selected' : ''}>Dipulangkan</option>
                                <option value="Lewat" ${app.status === 'Lewat' ? 'selected' : ''}>Lewat</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label style="font-size:0.8rem; margin-bottom:0.4rem;">Catatan Admin</label>
                            <textarea id="admin_catatan" placeholder="Masukkan nota di sini..." style="width: 100%; height: 120px; padding: 0.75rem; border-radius: 8px; border: 1px solid #cbd5e1; font-size:0.85rem; resize:none;">${app.catatanAdmin || ''}</textarea>
                        </div>
                    </div>
                </div>
            </div>

            <!-- BAHAGIAN 4: PENGESAHAN PEMINJAM DAN ADMIN -->
            <div class="modal-section-title danger" style="margin-top:2rem;">
                <i class="fas fa-qrcode"></i> 4. Bahagian Pengesahan Peminjam dan Admin
            </div>
            <div class="admin-action-box" style="background:#fff7ed; border-color:#fed7aa;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.5rem;">
                    <div style="text-align:center; padding:1.5rem; background:white; border-radius:12px; border:1px solid #ffedd5;">
                        <i class="fas fa-sign-out-alt" style="font-size:2rem; color:#f59e0b; margin-bottom:1rem;"></i>
                        <h5 style="margin-bottom:0.5rem; color:#1e293b;">Pengesahan Pinjam</h5>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:1rem;">Scan: <strong style="color:#1e293b;">${app.scanPinjam || '-'}</strong></p>
                        <button class="btn btn-primary" onclick="generateActionQR(${app.id}, 'pinjam')" style="width:100%; background:#f59e0b; border:none;">
                            <i class="fas fa-qrcode"></i> QR Pinjam
                        </button>
                    </div>

                    <div style="text-align:center; padding:1.5rem; background:white; border-radius:12px; border:1px solid #ffedd5;">
                        <i class="fas fa-sign-in-alt" style="font-size:2rem; color:#10b981; margin-bottom:1rem;"></i>
                        <h5 style="margin-bottom:0.5rem; color:#1e293b;">Pengesahan Pulang</h5>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:1rem;">Scan: <strong style="color:#1e293b;">${app.scanPulang || '-'}</strong></p>
                        <button class="btn btn-primary" onclick="generateActionQR(${app.id}, 'pulang')" style="width:100%; background:#10b981; border:none;">
                            <i class="fas fa-qrcode"></i> QR Pulang
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    actionButtons.innerHTML = `
        <button class="btn btn-primary" onclick="window.open('../printfile/print.html?id=${app.id}', '_blank')" style="background: #6366f1; border: none; padding: 0.75rem 1.5rem;">
            <i class="fas fa-print"></i> Cetak Borang
        </button>
        <button class="btn btn-outline" onclick="closeModal('urusModal')" style="padding: 0.75rem 1.5rem;">
            <i class="fas fa-times"></i> Tutup
        </button>
        <button class="btn btn-primary" onclick="updateAppManagement(${app.id})" style="padding: 0.75rem 2rem; background: #2563eb; box-shadow: 0 4px 6px rgba(37,99,235,0.2);">
            <i class="fas fa-save"></i> Kemaskini Rekod
        </button>
    `;

    openModal('urusModal');
    // Build dynamic model section after modal is rendered
    setTimeout(() => buildAdminModelHTML(app.id), 0);
}

function buildAdminModelHTML(currentAppId) {
    const container = document.getElementById('adminModelContainer');
    if (!container) return;

    const apps = getDB(DB_KEYS.APPS);
    const app = apps.find(a => a.id === currentAppId);
    if (!app) return;

    const computers = getDB(DB_KEYS.COMPS);
    const categories = JSON.parse(localStorage.getItem('db_categories') || '[]');
    const allApps = getDB(DB_KEYS.APPS);

    // Build set of already borrowed IDs from current app to pre-tick
    const currentBorrowedSiri = new Set();
    if (app.siri && app.siri !== '-') {
        app.siri.split('<br>').map(s => s.trim().toLowerCase()).forEach(id => {
            if (id) currentBorrowedSiri.add(id);
        });
    }

    // Ekstrak jumlah yang dipohon oleh user sebagai rujukan
    const requestedCounts = {};
    const kStr = (app.kuantiti || '').replace(/<br\s*\/?>/gi, '\n').replace(/&bull;/g, '•');
    kStr.split('\n').forEach(line => {
        const match = line.match(/(?:•?\s*)(.+?)\s*[-–—]\s*(\d+)/i);
        if (match) {
            requestedCounts[match[1].trim().toLowerCase()] = parseInt(match[2], 10);
        }
    });

    const borrowedIds = new Set();
    const borrowedByOthersPerCat = {};
    const activeStatuses = ['Menunggu', 'Lulus', 'Baru', 'Lewat', 'Dipinjam', 'Approve'];

    allApps.forEach(a => {
        if (a.id !== currentAppId && activeStatuses.includes(a.status)) {
            const st = a.status.toUpperCase();
            const siriField = (a.siri || '').replace(/<br\s*\/?>/gi, '\n');
            const models = (a.model || '').split(',').map(m => m.trim().toLowerCase());

            // Kira siri IDs (No PC / Siri)
            siriField.split('\n').forEach(entry => {
                const trimmed = entry.trim().toLowerCase();
                if (trimmed && trimmed !== '-') borrowedIds.add(trimmed);
            });

            // Kira kuota kategori
            const isAssigned = ['LULUS', 'DIPINJAM', 'APPROVE', 'LEWAT'].includes(st);
            if (isAssigned && a.siri && a.siri !== '-') {
                const siriCount = siriField.split('\n').filter(s => s.trim() && s.trim() !== '-').length;
                if (models.length === 1) {
                    borrowedByOthersPerCat[models[0]] = (borrowedByOthersPerCat[models[0]] || 0) + siriCount;
                } else {
                    const kuantiti = (a.kuantiti || '').replace(/<br\s*\/?>/gi, '\n').replace(/&bull;/g, '•');
                    kuantiti.split('\n').forEach(line => {
                        const match = line.match(/(?:•?\s*)(.+?)\s*[-–—]\s*(\d+)/i);
                        if (match) {
                            const catName = match[1].trim().toLowerCase();
                            const qty = parseInt(match[2], 10);
                            borrowedByOthersPerCat[catName] = (borrowedByOthersPerCat[catName] || 0) + qty;
                        }
                    });
                }
            } else {
                const kuantiti = (a.kuantiti || '').replace(/<br\s*\/?>/gi, '\n').replace(/&bull;/g, '•');
                kuantiti.split('\n').forEach(line => {
                    const match = line.match(/(?:•?\s*)(.+?)\s*[-–—]\s*(\d+)/i);
                    if (match) {
                        const catName = match[1].trim().toLowerCase();
                        const qty = parseInt(match[2], 10);
                        borrowedByOthersPerCat[catName] = (borrowedByOthersPerCat[catName] || 0) + qty;
                    }
                });
            }
        }
    });

    const grouped = {};
    categories.forEach(cat => { grouped[cat.nama] = []; });
    computers.forEach(comp => {
        const cat = comp.kategori || 'Lain-lain';
        if (!grouped[cat]) grouped[cat] = [];
        const pcId = (comp.noPC || '').toLowerCase().trim();
        const siriId = (comp.noSiri || '').toLowerCase().trim();
        const isBorrowedByOthers = (pcId && borrowedIds.has(pcId)) || (siriId && borrowedIds.has(siriId));
        if (!isBorrowedByOthers) grouped[cat].push(comp);
    });

    let html = '';
    Object.keys(grouped).forEach(origCatName => {
        const items = grouped[origCatName];
        const requested = requestedCounts[origCatName.toLowerCase()] || 0;

        // Stok Global Tersedia = Total items pool - (Borrowed by others + Selected in this pool)
        // Tetapi untuk header awal, kita tunjuk total available pool
        const totalInPool = items.length;

        const catId = origCatName.replace(/\s+/g, '_').toLowerCase();
        const iconClass = origCatName.toLowerCase().includes('monitor') ? 'desktop' : 'laptop';

        // Semak jika kategori ini ada item yang sudah terpilih sebelumnya
        let catHasPreSelected = false;
        items.forEach(comp => {
            const pcId = (comp.noPC || '').toLowerCase().trim();
            const siriId = (comp.noSiri || '').toLowerCase().trim();
            if (currentBorrowedSiri.has(pcId) || currentBorrowedSiri.has(siriId)) {
                catHasPreSelected = true;
            }
        });

        html += `<div style="margin-bottom:1.5rem;" class="admin-cat-group" data-catname="${origCatName}" data-requested="${requested}">`;
        html += `<label style="display:flex; align-items:center; gap:0.5rem; font-weight:600; cursor:pointer;">`;
        html += `<input type="checkbox" class="admin-cat-check" data-cat="${catId}" onchange="toggleAdminModel('${catId}')" ${catHasPreSelected ? 'checked' : ''}> `;
        html += `<i class="fas fa-${iconClass}" style="color:var(--primary)"></i> <span class="cat-label-text">${origCatName} (Dipohon: ${requested} | Stok: ${totalInPool} Unit)</span>`;
        if (totalInPool === 0) html += ' <span style="color:#ef4444; font-size:0.75rem; font-weight:700; margin-left:0.5rem;">HABIS</span>';
        html += `</label>`;
        html += `<div id="admin_${catId}_options" class="model-option-group" style="display:${catHasPreSelected ? 'block' : 'none'};">`;
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem;">`;
        items.forEach(comp => {
            const pcId = (comp.noPC || '').toLowerCase().trim();
            const siriId = (comp.noSiri || '').toLowerCase().trim();
            const isSelected = currentBorrowedSiri.has(pcId) || currentBorrowedSiri.has(siriId);

            html += `<label style="font-size:0.8rem; display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 4px; border: 1px solid transparent; transition: all 0.2s;">`;
            html += `<input type="checkbox" name="admin_model_item" value="${comp.model}" data-cat="${origCatName}" data-nopc="${comp.noPC || ''}" data-nosiri="${comp.noSiri || ''}" onchange="updateAdminSelectDisplay()" ${isSelected ? 'checked' : ''}> `;
            html += `${comp.model} ${comp.noPC ? '(' + comp.noPC + ')' : ''}</label>`;
        });
        html += '</div></div></div>';
    });

    container.innerHTML = html;

    // Initial sync
    updateAdminSelectDisplay();
}

/**
 * SYNC ANTARA PILIHAN MODAL DAN PAPARAN ITEM DIPINJAM
 */
function updateAdminSelectDisplay() {
    const listContainer = document.getElementById('borrowedItemsList');
    const summaryContainer = document.getElementById('borrowedItemsSummary');
    if (!listContainer || !summaryContainer) return;

    const checkedItems = Array.from(document.querySelectorAll('input[name="admin_model_item"]:checked'));

    // 1. Render Pills Item Terpilih
    if (checkedItems.length === 0) {
        listContainer.innerHTML = '<div style="color:#94a3b8; font-style:italic; font-size:0.85rem;">Tiada item dipilih. Perlu dipilih semula dalam Senarai Model di bawah.</div>';
        summaryContainer.innerHTML = 'Kuantiti: 0 Unit';
    } else {
        listContainer.innerHTML = checkedItems.map(cb => {
            const label = cb.parentElement.innerText.trim();
            const noPC = cb.dataset.nopc;
            const noSiri = cb.dataset.nosiri;
            const uniqueId = noPC || noSiri || label;

            return `
                <div class="borrowed-item-pill" style="display:inline-flex; align-items:center; background:white; border:1px solid #bfdbfe; padding:6px 12px; border-radius:30px; font-size:0.85rem; color:#1e40af; font-weight:600; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <i class="fas fa-desktop" style="margin-right:8px; font-size:0.75rem;"></i>
                    ${label}
                    <i class="fas fa-times-circle" title="Keluarkan Item" onclick="removeItemFromLoan('${uniqueId}')" style="margin-left:8px; color:#ef4444; cursor:pointer; font-size:1.1rem; transition: transform 0.2s;"></i>
                </div>
            `;
        }).join('');

        // 2. Render Kuantiti Ringkasan (Contoh: Laptop - 7 Unit)
        const counts = {};
        checkedItems.forEach(cb => {
            const cat = cb.dataset.cat;
            counts[cat] = (counts[cat] || 0) + 1;
        });
        summaryContainer.innerHTML = Object.keys(counts).map(cat => `• ${cat} - ${counts[cat]} Unit`).join(' | ');
    }

    // 3. Update Header Units (e.g. Dipohon: 7 | Baki: 26 Unit)
    document.querySelectorAll('.admin-cat-group').forEach(group => {
        const catName = group.dataset.catname;
        const requested = group.dataset.requested || 0;
        const catCheckboxes = group.querySelectorAll('input[name="admin_model_item"]');
        const checkedInCat = Array.from(catCheckboxes).filter(cb => cb.checked).length;
        const totalInPool = catCheckboxes.length;
        const remaining = Math.max(0, totalInPool - checkedInCat);

        const labelText = group.querySelector('.cat-label-text');
        if (labelText) {
            labelText.innerText = `${catName} (Dipohon: ${requested} | Baki: ${remaining} Unit)`;
        }
    });

    // 4. Sembunyikan item yang telah ditick (Part 3)
    // Sesuai permintaan: "item yang telah ditick akan menghilang"
    document.querySelectorAll('input[name="admin_model_item"]').forEach(cb => {
        const label = cb.parentElement;
        if (label && label.tagName === 'LABEL') {
            label.style.display = cb.checked ? 'none' : 'flex';
        }
    });
}

function removeItemFromLoan(uniqueId) {
    // Cari checkbox yang sepadan dan untick
    const checkboxes = document.querySelectorAll('input[name="admin_model_item"]');
    checkboxes.forEach(cb => {
        const id = cb.dataset.nopc || cb.dataset.nosiri || cb.parentElement.innerText.trim();
        if (id === uniqueId) {
            cb.checked = false;
        }
    });

    // Refresh UI
    updateAdminSelectDisplay();
}

function toggleAdminModel(catId) {
    const checkbox = document.querySelector('.admin-cat-check[data-cat="' + catId + '"]');
    const options = document.getElementById('admin_' + catId + '_options');
    if (checkbox && options) {
        options.style.display = checkbox.checked ? 'block' : 'none';
        if (!checkbox.checked) {
            options.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        }
        updateAdminSelectDisplay(); // Pastikan baki dan paparan dikemaskini
    }
}

function generateActionQR(id, type) {
    const currentPath = window.location.pathname;
    const directoryPath = currentPath.substring(0, currentPath.lastIndexOf('/dashboard'));
    const verifyUrl = window.location.origin + directoryPath + `/dashboard/qrcode.html?id=${id}&type=${type}`;

    const title = type === 'pinjam' ? 'QR Pengesahan Pinjam' : 'QR Pengesahan Pulang';
    const color = type === 'pinjam' ? '#f59e0b' : '#10b981';

    // Snappier UI: No more hiding urusModal (Requires CSS z-index update)
    Swal.fire({
        title: title,
        html: `
            <div style="padding: 1rem;">
                <div id="actionQrPlaceholder" style="display: flex; justify-content: center; margin-bottom: 1.5rem; padding: 1rem; background: white; border: 1px solid #eee; border-radius: 12px; width: fit-content; margin: 0 auto; transition: transform 0.2s ease-in-out;"></div>
                <p style="font-size: 0.85rem; color: #64748b; margin-top: 1rem;">Minta peminjam imbas QR ini untuk membuat pengesahan digital secara terus.</p>
                <a href="${verifyUrl}" target="_blank" style="display: block; margin-top: 1rem; padding: 0.75rem; background: #f8fafc; border-radius: 8px; font-size: 0.75rem; word-break: break-all; color: ${color}; border: 1px dashed ${color}; text-decoration: none; font-weight: 600;">
                    <i class="fas fa-external-link-alt"></i> KLIK UNTUK PRATONTON:<br>${verifyUrl}
                </a>
                <div style="display: flex; gap: 0.75rem; justify-content: center; margin-top: 1.5rem;">
                    <button onclick="downloadActionQR()" class="btn btn-primary" style="padding: 0.6rem 1.25rem; font-size: 0.85rem;">
                        <i class="fas fa-download"></i> Muat Turun
                    </button>
                    <button onclick="shareActionQR('${verifyUrl}')" class="btn btn-outline" style="padding: 0.6rem 1.25rem; font-size: 0.85rem; border-color: ${color}; color: ${color};">
                        <i class="fas fa-share-alt"></i> Kongsi
                    </button>
                </div>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: () => {
            // Speed improvement: CorrectLevel.M is faster to scan for phone cameras
            new QRCode(document.getElementById("actionQrPlaceholder"), {
                text: verifyUrl,
                width: 220,
                height: 220,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    });
}

function downloadActionQR() {
    const qrContainer = document.getElementById('actionQrPlaceholder');
    if (!qrContainer) return;

    const img = qrContainer.querySelector('img');
    const canvas = qrContainer.querySelector('canvas');
    let dataUrl = '';

    if (img && img.src && img.src.startsWith('data:image')) {
        dataUrl = img.src;
    } else if (canvas) {
        try { dataUrl = canvas.toDataURL('image/png'); } catch (e) { }
    }

    if (dataUrl) {
        fetch(dataUrl)
            .then(res => res.blob())
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'QR_Pengesahan.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
            });
    }
}

function shareActionQR(url) {
    if (navigator.share) {
        navigator.share({
            title: 'QR Pengesahan Peminjaman',
            text: 'Sila imbas QR atau klik pautan untuk pengesahan.',
            url: url
        }).catch(() => {
            navigator.clipboard.writeText(url);
        });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            const toast = document.createElement('div');
            toast.innerHTML = '<i class="fas fa-check-circle"></i> Pautan QR disalin!';
            toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.875rem;font-weight:600;z-index:99999;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 12px rgba(16,185,129,0.3);';
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        });
    }
}

function updateAppManagement(id) {
    let apps = getDB(DB_KEYS.APPS);
    const index = apps.findIndex(a => a.id === id);
    if (index !== -1) {
        const newStatus = document.getElementById('admin_status').value;
        const note = document.getElementById('admin_catatan').value;

        apps[index].status = newStatus;
        apps[index].catatanAdmin = note;

        // Handle Model baru jika admin ada pilih
        const selectedItems = Array.from(document.querySelectorAll('input[name="admin_model_item"]:checked'));
        if (selectedItems.length > 0) {
            // Build kuantiti and siri from selected items grouped by category
            const groupedSelected = {};
            selectedItems.forEach(cb => {
                const cat = cb.dataset.cat;
                if (!groupedSelected[cat]) groupedSelected[cat] = [];
                groupedSelected[cat].push(cb);
            });

            let modelLabels = [];
            let kuantitiParts = [];
            let siriParts = [];

            Object.keys(groupedSelected).forEach(catName => {
                const catSelected = groupedSelected[catName];
                // Record the category with quantity for display purposes
                modelLabels.push(`${catName} - ${catSelected.length} Unit`);

                // Kemaskini kuantiti berdasarkan jumlah item yang dipilih (untuk stock locking)
                kuantitiParts.push(`&bull; ${catName} - ${catSelected.length} Unit`);

                // Build the assigned units for the 'siri' field
                catSelected.forEach(cb => {
                    const noPC = cb.dataset.nopc || '';
                    const noSiri = cb.dataset.nosiri || '';
                    siriParts.push(noPC || noSiri || cb.value);
                });
            });

            apps[index].model = modelLabels.join(', ');
            apps[index].kuantiti = kuantitiParts.join('<br>'); // Update untuk sync baki stok
            apps[index].siri = siriParts.join('<br>');
        } else {
            // Jika tiada yang dipilih, biarkan kuantiti asal tetapi kosongkan siri
            apps[index].siri = '-';
        }

        saveDB(DB_KEYS.APPS, apps);

        // Kirim kemaskini ke Google Sheets
        syncToGAS(apps[index]);

        renderApplicationTable();
        closeModal('urusModal');
        playSound('chime');

        Swal.fire({
            icon: 'success',
            title: 'Berjaya Dikemaskini!',
            text: 'Tindakan admin telah disimpan dan diselaraskan ke Google Sheets.',
            timer: 1500,
            showConfirmButton: false
        });
    }
}

function saveAppEdit(id) {
    let apps = getDB(DB_KEYS.APPS);
    const index = apps.findIndex(a => a.id === id);
    if (index !== -1) {
        apps[index].nama = document.getElementById('edit_nama').value;
        apps[index].noPekerja = document.getElementById('edit_noPekerja').value;
        apps[index].jabatan = document.getElementById('edit_jabatan').value;
        apps[index].telefon = document.getElementById('edit_telefon').value;
        apps[index].email = document.getElementById('edit_email').value;
        apps[index].lokasi = document.getElementById('edit_lokasi').value;
        apps[index].tujuan = document.getElementById('edit_tujuan').value;
        apps[index].model = document.getElementById('edit_model').value;
        apps[index].kuantiti = document.getElementById('edit_kuantiti').value;

        saveDB(DB_KEYS.APPS, apps);

        // Sync to GAS
        syncToGAS(apps[index]);

        renderApplicationTable();
        closeModal('urusModal');

        Swal.fire({
            icon: 'success',
            title: 'Pindaan Disimpan!',
            text: 'Maklumat pemohon telah dikemaskini dalam Cloud.',
            timer: 1500,
            showConfirmButton: false
        });
    }
}

function updateAppStatus(id, newStatus) {
    let apps = getDB(DB_KEYS.APPS);
    const index = apps.findIndex(a => a.id === id);
    if (index !== -1) {
        apps[index].status = newStatus;
        saveDB(DB_KEYS.APPS, apps);
        renderApplicationTable();
        closeModal('urusModal');

        Swal.fire({
            icon: 'success',
            title: 'Berjaya!',
            text: `Permohonan status telah ditukar kepada ${newStatus}.`,
            timer: 1500,
            showConfirmButton: false
        });
    }
}

/* ==============================
   DELETE ADMIN
============================== */
function deleteAdmin(id) {
    const session = localStorage.getItem('loggedInAdmin');
    const currentUser = session ? JSON.parse(session) : null;

    if (currentUser && (id === currentUser.id)) {
        Swal.fire('Ralat!', 'Anda tidak dibenarkan memadam akaun anda sendiri semasa sedang log masuk.', 'error');
        return;
    }

    const admins = getDB(DB_KEYS.ADMINS);
    const adminToDelete = admins.find(a => a.id === id);

    Swal.fire({
        title: 'Padam Admin?',
        text: adminToDelete ? `Adakah anda pasti mahu memadam ${adminToDelete.nama}? Data akan dipadam dari Excel & Cloud!` : "Data ini akan dibuang dari rekod!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ya, Padam'
    }).then(async (result) => {
        if (result.isConfirmed) {
            // 1. Padam dari Firestore (Cari guna email)
            if (adminToDelete && adminToDelete.email) {
                try {
                    const snapshot = await db.collection('admins').where('email', '==', adminToDelete.email).get();
                    if (!snapshot.empty) {
                        const batch = db.batch();
                        snapshot.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        console.log("✅ Dihapus dari Firestore (Awan)");
                    }
                } catch (err) {
                    console.error("❌ Gagal hapus dari Firestore:", err);
                }
            }

            // 2. Padam dari LocalStorage & Excel
            let data = getDB(DB_KEYS.ADMINS);
            data = data.filter(a => a.id !== id);
            saveDB(DB_KEYS.ADMINS, data);

            // Sync to GAS (Delete)
            syncToGAS({ id: id }, 'delete', 'admin');

            renderAdminTable();
            Swal.fire('Dipadam!', 'Data admin telah dibuang sepenuhnya.', 'success');
        }
    });
}

/* ==============================
   EDIT ADMIN
============================== */
function editAdmin(id) {
    const admins = getDB(DB_KEYS.ADMINS);
    const admin = admins.find(a => a.id === id);
    if (!admin) return;

    Swal.fire({
        title: 'Edit Admin',
        html: `
            <div style="text-align: left;">
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">Nama</label>
                    <input id="swal_nama" class="swal2-input" value="${admin.nama}" style="margin: 0.25rem 0;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">Username</label>
                    <input id="swal_username" class="swal2-input" value="${admin.username || ''}" style="margin: 0.25rem 0;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">Email</label>
                    <input id="swal_email" class="swal2-input" value="${admin.email}" style="margin: 0.25rem 0;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">Jawatan</label>
                    <input id="swal_jawatan" class="swal2-input" value="${admin.jawatan || ''}" style="margin: 0.25rem 0;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">Password</label>
                    <input id="swal_password" type="password" class="swal2-input" value="${admin.password || ''}" style="margin: 0.25rem 0;">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal',
        preConfirm: () => {
            return {
                nama: document.getElementById('swal_nama').value,
                username: document.getElementById('swal_username').value,
                email: document.getElementById('swal_email').value,
                jawatan: document.getElementById('swal_jawatan').value,
                password: document.getElementById('swal_password').value
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            let admins = getDB(DB_KEYS.ADMINS);
            const index = admins.findIndex(a => a.id === id);
            if (index !== -1) {
                admins[index].nama = result.value.nama;
                admins[index].username = result.value.username;
                admins[index].email = result.value.email;
                admins[index].jawatan = result.value.jawatan;
                admins[index].password = result.value.password;
                saveDB(DB_KEYS.ADMINS, admins);

                // Sync to GAS (Update) - Tanpa Password
                const { password, ...adminData } = admins[index];
                syncToGAS(adminData, 'update', 'admin');

                renderAdminTable();
                Swal.fire('Berjaya!', 'Data admin telah dikemaskini.', 'success');
            }
        }
    });
}

/* ==============================
   RESET ADMIN PASSWORD
============================== */
function resetAdminPassword(id) {
    const admins = getDB(DB_KEYS.ADMINS);
    const admin = admins.find(a => a.id === id);

    if (!admin) return;

    Swal.fire({
        title: `Reset Password: ${admin.nama}`,
        input: 'password',
        inputLabel: 'Masukkan Password Baru',
        inputPlaceholder: 'Sila masukkan password baru...',
        inputAttributes: {
            autocapitalize: 'off',
            autocorrect: 'off'
        },
        showCancelButton: true,
        confirmButtonText: 'Kemaskini Password',
        cancelButtonText: 'Batal',
        inputValidator: (value) => {
            if (!value) {
                return 'Anda perlu masukkan password baru!';
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const index = admins.findIndex(a => a.id === id);
            if (index !== -1) {
                admins[index].password = result.value;
                saveDB(DB_KEYS.ADMINS, admins);

                // Sync to GAS (Update) - Tanpa Password
                const { password, ...adminData } = admins[index];
                syncToGAS(adminData, 'update', 'admin');

                Swal.fire({
                    icon: 'success',
                    title: 'Password Dikemaskini!',
                    text: `Password untuk ${admin.nama} telah berjaya ditukar.`,
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        }
    });
}

/* ==============================
   DELETE COMPUTER
============================== */
function deleteComputer(id) {
    Swal.fire({
        title: 'Padam Komputer?',
        text: "Data ini akan dibuang dari LocalStorage!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ya, Padam'
    }).then((result) => {
        if (result.isConfirmed) {
            let data = getDB(DB_KEYS.COMPS);
            data = data.filter(c => c.id !== id);
            saveDB(DB_KEYS.COMPS, data);

            // Sync to GAS (Delete)
            syncToGAS({ id: id }, 'delete', 'komputer');

            renderComputerTable();
            Swal.fire('Dipadam!', 'Data komputer telah dibuang dari LocalStorage.', 'success');
        }
    });
}

/* ==============================
   EDIT COMPUTER
============================== */
function editComputer(id) {
    const comps = getDB(DB_KEYS.COMPS);
    const comp = comps.find(c => c.id === id);
    if (!comp) return;

    Swal.fire({
        title: 'Edit Komputer',
        html: `
            <div style="text-align: left;">
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">Model</label>
                    <input id="swal_model" class="swal2-input" value="${comp.model}" style="margin: 0.25rem 0;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">No. PC</label>
                    <input id="swal_noPC" class="swal2-input" value="${comp.noPC || ''}" style="margin: 0.25rem 0;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">No. Siri</label>
                    <input id="swal_noSiri" class="swal2-input" value="${comp.noSiri || ''}" style="margin: 0.25rem 0;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">No. Pendaftaran UMS</label>
                    <input id="swal_noPendaftaran" class="swal2-input" value="${comp.noPendaftaran || ''}" style="margin: 0.25rem 0;">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal',
        preConfirm: () => {
            return {
                model: document.getElementById('swal_model').value,
                noPC: document.getElementById('swal_noPC').value,
                noSiri: document.getElementById('swal_noSiri').value,
                noPendaftaran: document.getElementById('swal_noPendaftaran').value
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            let comps = getDB(DB_KEYS.COMPS);
            const index = comps.findIndex(c => c.id === id);
            if (index !== -1) {
                comps[index].model = result.value.model;
                comps[index].noPC = result.value.noPC;
                comps[index].noSiri = result.value.noSiri;
                comps[index].noPendaftaran = result.value.noPendaftaran;
                saveDB(DB_KEYS.COMPS, comps);

                // Sync to GAS (Update)
                syncToGAS(comps[index], 'update', 'komputer');

                renderComputerTable();
                Swal.fire('Berjaya!', 'Data komputer telah dikemaskini.', 'success');
            }
        }
    });
}

/* ==============================
   DELETE CATEGORY
============================== */
function deleteCategory(id) {
    Swal.fire({
        title: 'Padam Kategori?',
        text: "Data ini akan dibuang dari sistem!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ya, Padam'
    }).then((result) => {
        if (result.isConfirmed) {
            let data = getDB(DB_KEYS.CATS);
            data = data.filter(c => c.id !== id);
            saveDB(DB_KEYS.CATS, data);

            // Sync to GAS (Delete)
            syncToGAS({ id: id }, 'delete', 'kategori');

            renderCategoryTable();
            Swal.fire('Dipadam!', 'Kategori telah dibuang dari sistem.', 'success');
        }
    });
}

/* ==============================
   ADMIN FORM HANDLING (Add Admin Modal)
============================== */
document.addEventListener('DOMContentLoaded', () => {
    const addAdminForm = document.getElementById('addAdminForm');
    if (addAdminForm) {
        addAdminForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputs = addAdminForm.querySelectorAll('input');

            const admins = getDB(DB_KEYS.ADMINS);
            const newId = admins.length > 0 ? Math.max(...admins.map(a => a.id)) + 1 : 1;

            const newAdmin = {
                id: newId,
                nama: inputs[0].value,
                username: inputs[1].value,
                email: inputs[2].value,
                jawatan: inputs[3].value,
                password: inputs[4].value, // Ambil dari input baru
                peranan: inputs[5].value || 'Admin'
            };

            admins.push(newAdmin);
            saveDB(DB_KEYS.ADMINS, admins);

            // Sync to GAS - Tanpa Password
            const { password, ...adminData } = newAdmin;
            syncToGAS(adminData, 'create', 'admin');

            renderAdminTable();
            closeModal('adminModal');
            addAdminForm.reset();

            Swal.fire({
                icon: 'success',
                title: 'Admin Ditambah!',
                html: `<p>${newAdmin.nama} telah berjaya ditambah ke dalam sistem.</p>`,
                timer: 3000,
                showConfirmButton: true
            });
        });
    }

    // Computer form handling
    const addComputerForm = document.getElementById('addComputerForm');
    if (addComputerForm) {
        addComputerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const comps = getDB(DB_KEYS.COMPS);
            const newId = comps.length > 0 ? Math.max(...comps.map(c => c.id)) + 1 : 1;

            const categorySelect = document.getElementById('compCategorySelect');
            if (categorySelect && !categorySelect.value) {
                Swal.fire('Ralat', 'Sila pilih kategori komputer.', 'error');
                return;
            }
            const inputs = addComputerForm.querySelectorAll('input[type="text"]');

            const newComp = {
                id: newId,
                kategori: categorySelect ? categorySelect.value : 'Laptop',
                model: inputs[0].value,
                noPC: inputs[1].value,
                noSiri: inputs[2].value,
                noPendaftaran: inputs[3].value
            };

            comps.push(newComp);
            saveDB(DB_KEYS.COMPS, comps);

            // Sync to GAS
            syncToGAS(newComp, 'create', 'komputer');

            renderComputerTable();
            closeModal('computerModal');
            addComputerForm.reset();

            Swal.fire({
                icon: 'success',
                title: 'Komputer Ditambah!',
                text: `${newComp.model} telah ditambah ke dalam sistem.`,
                timer: 2000,
                showConfirmButton: false
            });
        });

        // Populate category dropdown
        populateCategoryDropdown();
    }
});

function populateCategoryDropdown() {
    const select = document.getElementById('compCategorySelect');
    if (!select) return;
    const categories = getDB(DB_KEYS.CATS);
    const options = categories.map(c => `<option value="${c.nama}">${c.nama}</option>`).join('');
    select.innerHTML = `<option value="">-- Pilih Kategori --</option>` + options;
}

/* ==============================
   LAPORAN (REPORT) FUNCTIONS
============================== */
let filteredReportData = [];

function renderReportStats() {
    const apps = getDB(DB_KEYS.APPS);

    const total = apps.length;
    const menunggu = apps.filter(a => a.status === 'Menunggu' || a.status === 'Baru').length;
    const lulus = apps.filter(a => a.status === 'Lulus').length;
    const tolak = apps.filter(a => a.status === 'Tolak' || a.status === 'Ditolak').length;
    const pulang = apps.filter(a => a.status === 'Dipulangkan').length;
    const lewat = apps.filter(a => a.status === 'Lewat').length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('rptTotal', total);
    set('rptMenunggu', menunggu);
    set('rptLulus', lulus);
    set('rptTolak', tolak);
    set('rptPulang', pulang);
    set('rptLewat', lewat);
}

function renderComputerUsage() {
    const tbody = document.getElementById('computerUsageTableBody');
    if (!tbody) return;

    const computers = getDB(DB_KEYS.COMPS);
    const apps = getDB(DB_KEYS.APPS);

    if (computers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">Tiada data komputer.</td></tr>`;
        return;
    }

    // For each computer, count how many applications reference its noPC or noSiri
    const usageData = computers.map(comp => {
        const pcId = (comp.noPC || '').toLowerCase().trim();
        const siriId = (comp.noSiri || '').toLowerCase().trim();

        // Count applications that mention this computer's noPC or noSiri in the 'siri' field
        let usageCount = 0;
        let isCurrentlyUsed = false;

        apps.forEach(app => {
            // The 'siri' field contains HTML like "PC01-121211<br>MN02-44221"
            const siriField = (app.siri || '').replace(/<br\s*\/?>/gi, ' ').toLowerCase();
            // Also check the model field
            const modelField = (app.model || '').toLowerCase();

            const matches = (pcId && siriField.includes(pcId)) ||
                (siriId && siriField.includes(siriId)) ||
                (pcId && modelField.includes(pcId)) ||
                (siriId && modelField.includes(siriId));

            if (matches) {
                usageCount++;
                // Check if currently being used (Lulus but not yet returned)
                if (app.status === 'Lulus' || app.status === 'Menunggu' || app.status === 'Baru') {
                    isCurrentlyUsed = true;
                }
            }
        });

        return {
            ...comp,
            usageCount,
            currentStatus: isCurrentlyUsed ? 'Sedang Digunakan' : 'Tersedia'
        };
    });

    tbody.innerHTML = usageData.map((comp, i) => {
        const statusColor = comp.currentStatus === 'Sedang Digunakan' ? '#f59e0b' : '#22c55e';
        const statusBg = comp.currentStatus === 'Sedang Digunakan' ? '#fef3c7' : '#dcfce7';
        const statusTextColor = comp.currentStatus === 'Sedang Digunakan' ? '#92400e' : '#166534';

        return `
            <tr>
                <td data-label="Bil">${i + 1}</td>
                <td data-label="Model">${comp.model || '-'}</td>
                <td data-label="No. PC">${comp.noPC || '-'}</td>
                <td data-label="No. Siri">${comp.noSiri || '-'}</td>
                <td data-label="No. Pendaftaran">${comp.noPendaftaran || '-'}</td>
                <td data-label="Jumlah Penggunaan" style="text-align: center;">
                    <span style="display: inline-block; background: #eef2ff; color: var(--primary); font-weight: 700; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem;">
                        ${comp.usageCount}
                    </span>
                </td>
                <td data-label="Status Terkini">
                    <span style="display: inline-block; background: ${statusBg}; color: ${statusTextColor}; font-weight: 600; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem;">
                        ${comp.currentStatus}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

function parseDateDMY(dateStr) {
    // Parse DD/MM/YYYY HH:MM format
    if (!dateStr || dateStr === '-') return null;
    const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!parts) return null;
    return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
}

function applyReportFilter() {
    const apps = getDB(DB_KEYS.APPS);
    const dateFrom = document.getElementById('rptDateFrom').value;
    const dateTo = document.getElementById('rptDateTo').value;
    const status = document.getElementById('rptStatus').value;
    const search = document.getElementById('rptSearch').value.toLowerCase().trim();

    let filtered = [...apps];

    // Filter by status
    if (status !== 'semua') {
        filtered = filtered.filter(a => {
            if (status === 'Menunggu') return a.status === 'Menunggu' || a.status === 'Baru';
            if (status === 'Tolak') return a.status === 'Tolak' || a.status === 'Ditolak';
            return a.status === status;
        });
    }

    // Filter by date range
    if (dateFrom) {
        const from = new Date(dateFrom);
        filtered = filtered.filter(a => {
            const d = parseDateDMY(a.mula);
            return d && d >= from;
        });
    }
    if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59);
        filtered = filtered.filter(a => {
            const d = parseDateDMY(a.mula);
            return d && d <= to;
        });
    }

    // Filter by search
    if (search) {
        filtered = filtered.filter(a =>
            (a.nama && a.nama.toLowerCase().includes(search)) ||
            (a.noPermohonan && a.noPermohonan.toLowerCase().includes(search)) ||
            (a.jabatan && a.jabatan.toLowerCase().includes(search)) ||
            (a.email && a.email.toLowerCase().includes(search)) ||
            (a.model && a.model.toLowerCase().includes(search))
        );
    }

    filteredReportData = filtered;
    renderReportTable(filtered);

    const countEl = document.getElementById('rptRecordCount');
    if (countEl) countEl.textContent = `${filtered.length} rekod dijumpai`;
}

function resetReportFilter() {
    document.getElementById('rptDateFrom').value = '';
    document.getElementById('rptDateTo').value = '';
    document.getElementById('rptStatus').value = 'semua';
    document.getElementById('rptSearch').value = '';

    // Show all data
    const apps = getDB(DB_KEYS.APPS);
    filteredReportData = apps;
    renderReportTable(apps);

    const countEl = document.getElementById('rptRecordCount');
    if (countEl) countEl.textContent = `${apps.length} rekod dijumpai`;
}

function renderReportTable(data) {
    const tbody = document.getElementById('reportTableBody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Tiada data untuk dipaparkan.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((app, i) => `
        <tr>
            <td data-label="#">${i + 1}</td>
            <td data-label="No. Permohonan"><strong>${app.noPermohonan}</strong></td>
            <td data-label="Maklumat Pemohon">
                <div style="font-weight: 600;">${app.nama}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${app.jabatan}</div>
                <div style="font-size: 0.7rem; color: var(--primary); margin-top: 4px; border-top: 1px dashed #e2e8f0; padding-top: 2px;">${app.email}</div>
            </td>
            <td data-label="Maklumat Pinjaman">
                <div style="font-weight: 500;">${app.jenis}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${app.model} (${app.kuantiti} Unit)</div>
            </td>
            <td data-label="Tempoh">
                <div style="font-size: 0.8rem;">${app.mula}</div>
                <div style="font-size: 0.8rem;">${app.tamat}</div>
            </td>
            <td data-label="Status">
                <span class="badge status-${getStatusClass(app.status)}">${app.status}</span>
            </td>
        </tr>
    `).join('');
}

function getComputerUsageData() {
    const computers = getDB(DB_KEYS.COMPS);
    const apps = getDB(DB_KEYS.APPS);

    return computers.map(comp => {
        const pcId = (comp.noPC || '').toLowerCase().trim();
        const siriId = (comp.noSiri || '').toLowerCase().trim();
        let usageCount = 0;
        let isCurrentlyUsed = false;

        apps.forEach(app => {
            const siriField = (app.siri || '').replace(/<br\s*\/?>/gi, ' ').toLowerCase();
            const modelField = (app.model || '').toLowerCase();
            const matches = (pcId && siriField.includes(pcId)) ||
                (siriId && siriField.includes(siriId)) ||
                (pcId && modelField.includes(pcId)) ||
                (siriId && modelField.includes(siriId));
            if (matches) {
                usageCount++;
                if (app.status === 'Lulus' || app.status === 'Menunggu' || app.status === 'Baru') {
                    isCurrentlyUsed = true;
                }
            }
        });

        return {
            ...comp,
            usageCount,
            currentStatus: isCurrentlyUsed ? 'Sedang Digunakan' : 'Tersedia'
        };
    });
}

function printReport() {
    const data = filteredReportData.length > 0 ? filteredReportData : getDB(DB_KEYS.APPS);
    const usageData = getComputerUsageData();

    const printWindow = window.open('', '_blank');
    const now = new Date();
    const dateStr = now.toLocaleDateString('ms-MY') + ' ' + now.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Laporan Permohonan Peminjaman</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 2rem; color: #1e293b; }
                .header { text-align: center; margin-bottom: 2rem; border-bottom: 3px solid #4f46e5; padding-bottom: 1rem; }
                .header h1 { font-size: 1.2rem; color: #4f46e5; }
                .header p { font-size: 0.8rem; color: #64748b; margin-top: 0.25rem; }
                .stats { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
                .stat { padding: 0.5rem 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.8rem; }
                .stat strong { color: #4f46e5; }
                table { width: 100%; border-collapse: collapse; font-size: 0.75rem; margin-bottom: 1rem; }
                th { background: #f1f5f9; padding: 0.5rem; text-align: left; font-weight: 700; border: 1px solid #e2e8f0; }
                td { padding: 0.4rem 0.5rem; border: 1px solid #e2e8f0; }
                tr:nth-child(even) { background: #fafafa; }
                .footer { margin-top: 2rem; font-size: 0.7rem; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 0.5rem; }
                .badge { padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.65rem; font-weight: 600; }
                .status-waiting { background: #fef08a; color: #854d0e; }
                .status-approved { background: #dcfce7; color: #166534; }
                .status-danger { background: #fee2e2; color: #991b1b; }
                .status-info { background: #e0f2fe; color: #0369a1; }
                .section-title { font-size: 1rem; font-weight: 700; color: #4f46e5; margin: 2rem 0 1rem 0; padding-bottom: 0.5rem; border-bottom: 2px solid #eef2ff; }
                .usage-badge { padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 600; }
                @media print { body { padding: 0.5rem; } .page-break { page-break-before: always; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>LAPORAN PERMOHONAN PEMINJAMAN PERALATAN ICT</h1>
                <p>Jabatan Digital, Universiti Malaysia Sabah</p>
                <p>Dijana pada: ${dateStr}</p>
            </div>
            <div class="stats">
                <div class="stat">Jumlah: <strong>${data.length}</strong></div>
                <div class="stat">Menunggu: <strong>${data.filter(a => a.status === 'Menunggu' || a.status === 'Baru').length}</strong></div>
                <div class="stat">Lulus: <strong>${data.filter(a => a.status === 'Lulus').length}</strong></div>
                <div class="stat">Ditolak: <strong>${data.filter(a => a.status === 'Tolak' || a.status === 'Ditolak').length}</strong></div>
                <div class="stat">Dipulangkan: <strong>${data.filter(a => a.status === 'Dipulangkan').length}</strong></div>
            </div>

            <h2 class="section-title">ðŸ“‹ Senarai Permohonan</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>No. Permohonan</th>
                        <th>Nama</th>
                        <th>Jabatan</th>
                        <th>Jenis</th>
                        <th>Model</th>
                        <th>Tarikh Pinjam</th>
                        <th>Tarikh Pulang</th>
                        <th>Status</th>
                        <th>Catatan</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map((app, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${app.noPermohonan}</td>
                            <td>${app.nama}</td>
                            <td>${app.jabatan}</td>
                            <td>${app.jenis}</td>
                            <td>${app.model}</td>
                            <td>${app.mula}</td>
                            <td>${app.tamat}</td>
                            <td><span class="badge status-${getStatusClass(app.status)}">${app.status}</span></td>
                            <td>${app.catatanAdmin || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="page-break"></div>
            <h2 class="section-title">ðŸ–¥ï¸ Statistik Penggunaan Komputer</h2>
            <table>
                <thead>
                    <tr>
                        <th>Bil</th>
                        <th>Model</th>
                        <th>No. PC</th>
                        <th>No. Siri</th>
                        <th>No. Pendaftaran UMS</th>
                        <th>Jumlah Penggunaan</th>
                        <th>Status Terkini</th>
                    </tr>
                </thead>
                <tbody>
                    ${usageData.map((comp, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${comp.model || '-'}</td>
                            <td>${comp.noPC || '-'}</td>
                            <td>${comp.noSiri || '-'}</td>
                            <td>${comp.noPendaftaran || '-'}</td>
                            <td style="text-align: center; font-weight: 700;">${comp.usageCount}</td>
                            <td><span class="usage-badge" style="background: ${comp.currentStatus === 'Sedang Digunakan' ? '#fef3c7' : '#dcfce7'}; color: ${comp.currentStatus === 'Sedang Digunakan' ? '#92400e' : '#166534'};">${comp.currentStatus}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="footer">
                <p>&copy; ${now.getFullYear()} Jabatan Digital UMS â€” Laporan dijana secara automatik</p>
            </div>
            <script>window.onload = () => window.print();<\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function exportExcel() {
    const data = filteredReportData.length > 0 ? filteredReportData : getDB(DB_KEYS.APPS);
    const usageData = getComputerUsageData();

    // Build Excel XML with multiple worksheets
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header"><Font ss:Bold="1" ss:Size="10"/><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="default"><Font ss:Size="9"/></Style>
  <Style ss:ID="bold"><Font ss:Bold="1" ss:Size="9"/></Style>
 </Styles>

 <Worksheet ss:Name="Laporan Permohonan">
  <Table>
   <Row>
    <Cell ss:StyleID="header"><Data ss:Type="String">#</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">No. Permohonan</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Nama</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">No. Pekerja</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Jabatan</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Telefon</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Email</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Jenis</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Lokasi</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Tujuan</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Model</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Tarikh Pinjam</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Tarikh Pulang</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Catatan</Data></Cell>
   </Row>`;

    data.forEach((app, i) => {
        const esc = (s) => (s || '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/<br\s*\/?>/gi, ' ');
        xml += `
   <Row>
    <Cell ss:StyleID="default"><Data ss:Type="Number">${i + 1}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.noPermohonan)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.nama)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.noPekerja)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.jabatan)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.telefon)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.email)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.jenis)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.lokasi)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.tujuan)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.model)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.mula)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.tamat)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.status)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(app.catatanAdmin)}</Data></Cell>
   </Row>`;
    });

    xml += `
  </Table>
 </Worksheet>

 <Worksheet ss:Name="Usage">
  <Table>
   <Row>
    <Cell ss:StyleID="header"><Data ss:Type="String">Bil</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Model</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">No. PC</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">No. Siri</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">No. Pendaftaran UMS</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Jumlah Penggunaan</Data></Cell>
    <Cell ss:StyleID="header"><Data ss:Type="String">Status Terkini</Data></Cell>
   </Row>`;

    usageData.forEach((comp, i) => {
        const esc = (s) => (s || '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        xml += `
   <Row>
    <Cell ss:StyleID="default"><Data ss:Type="Number">${i + 1}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(comp.model)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(comp.noPC)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(comp.noSiri)}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${esc(comp.noPendaftaran)}</Data></Cell>
    <Cell ss:StyleID="bold"><Data ss:Type="Number">${comp.usageCount}</Data></Cell>
    <Cell ss:StyleID="default"><Data ss:Type="String">${comp.currentStatus}</Data></Cell>
   </Row>`;
    });

    xml += `
  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Laporan_Peminjaman_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const toast = document.createElement('div');
    toast.innerHTML = '<i class="fas fa-check-circle"></i> Fail Excel telah dimuat turun!';
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#16a34a;color:white;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.875rem;font-weight:600;z-index:99999;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 12px rgba(22,163,106,0.3);';
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2000);
}

function exportCSV() {
    const data = filteredReportData.length > 0 ? filteredReportData : getDB(DB_KEYS.APPS);

    const headers = ['#', 'No. Permohonan', 'Nama', 'No. Pekerja', 'Jabatan', 'Telefon', 'Email', 'Jenis', 'Lokasi', 'Tujuan', 'Model', 'Tarikh Pinjam', 'Tarikh Pulang', 'Status', 'Catatan'];
    let csv = headers.join(',') + '\n';

    data.forEach((app, i) => {
        const cleanQty = (app.kuantiti || '').replace(/<[^>]*>/g, ' ').replace(/&bull;/g, 'â€¢');
        const row = [
            i + 1,
            `"${app.noPermohonan}"`,
            `"${app.nama}"`,
            `"${app.noPekerja}"`,
            `"${app.jabatan}"`,
            `"${app.telefon}"`,
            `"${app.email}"`,
            `"${app.jenis}"`,
            `"${app.lokasi}"`,
            `"${app.tujuan}"`,
            `"${app.model}"`,
            `"${app.mula}"`,
            `"${app.tamat}"`,
            `"${app.status}"`,
            `"${app.catatanAdmin || '-'}"`
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Laporan_Peminjaman_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const toast = document.createElement('div');
    toast.innerHTML = '<i class="fas fa-check-circle"></i> Fail CSV telah dimuat turun!';
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#4f46e5;color:white;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.875rem;font-weight:600;z-index:99999;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 12px rgba(79,70,229,0.3);';
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2000);
}

/* ==============================
   PROFILE DROPDOWN & EDIT LOGIC
============================== */
function toggleProfileMenu(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.toggle('active');
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown && dropdown.classList.contains('active')) {
        const profileArea = document.querySelector('.user-profile');
        if (profileArea && !profileArea.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    }
});

async function editMyProfile() {
    const session = localStorage.getItem('loggedInAdmin');
    if (!session) return;
    const admin = JSON.parse(session);

    const { value: formValues } = await Swal.fire({
        title: 'Kemaskini Profil Saya',
        html: `
            <div style="text-align: left;">
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">Nama Penuh</label>
                    <input id="my_nama" class="swal2-input" value="${admin.nama}" style="margin: 0.5rem 0; width: 100%;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">Jawatan / Bahagian</label>
                    <input id="my_jawatan" class="swal2-input" value="${admin.jawatan || ''}" placeholder="Cth: Juruteknik" style="margin: 0.5rem 0; width: 100%;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="font-size: 0.8rem; font-weight: 600;">Kata Laluan Baru (Kosongkan jika tidak ubah)</label>
                    <input id="my_password" type="password" class="swal2-input" placeholder="Masukkan kata laluan baru jika perlu" style="margin: 0.5rem 0; width: 100%;">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Simpan Perubahan',
        confirmButtonColor: 'var(--primary)',
        preConfirm: () => {
            return {
                nama: document.getElementById('my_nama').value,
                jawatan: document.getElementById('my_jawatan').value,
                password: document.getElementById('my_password').value
            }
        }
    });

    if (formValues) {
        if (!formValues.nama) {
            Swal.fire('Ralat', 'Nama tidak boleh dikosongkan!', 'error');
            return;
        }

        try {
            Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const currentUser = firebase.auth().currentUser;
            if (!currentUser) throw new Error("Sesi Firebase tamat. Sila log masuk semula.");

            // 1. Kemaskini Firebase Auth jika ada password baru
            if (formValues.password) {
                await currentUser.updatePassword(formValues.password);
            }

            // 2. Kemaskini Firestore
            const myUid = currentUser.uid;
            await db.collection('admins').doc(myUid).set({
                nama: formValues.nama,
                jawatan: formValues.jawatan,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // 3. Kemaskini LocalStorage & Database
            admin.nama = formValues.nama;
            admin.jawatan = formValues.jawatan;
            localStorage.setItem('loggedInAdmin', JSON.stringify(admin));

            let admins = getDB(DB_KEYS.ADMINS);
            let idx = admins.findIndex(a => a.email === admin.email);
            if (idx !== -1) {
                admins[idx].nama = formValues.nama;
                admins[idx].jawatan = formValues.jawatan;
                if (formValues.password) admins[idx].password = formValues.password;
                saveDB(DB_KEYS.ADMINS, admins);

                // 4. Sync ke Google Sheets
                const { password, ...adminData } = admins[idx];
                syncToGAS(adminData, 'update', 'admin');
            }

            // 5. Update UI serta-merta
            const nameEl = document.querySelector('.user-profile span');
            if (nameEl) nameEl.textContent = formValues.nama;

            Swal.fire({
                icon: 'success',
                title: 'Berjaya!',
                text: 'Profil anda telah dikemaskini.',
                timer: 2000,
                showConfirmButton: false
            });

            // Tutup dropdown
            const d = document.getElementById('profileDropdown');
            if (d) d.classList.remove('active');

        } catch (err) {
            console.error("Profile update error:", err);
            Swal.fire('Ralat', `Gagal mengemaskini profil: ${err.message}`, 'error');
        }
    }
}

function logout() {
    Swal.fire({
        title: 'Log Keluar?',
        text: "Anda akan dipandu ke halaman log masuk.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: 'var(--danger)',
        confirmButtonText: 'Ya, Keluar'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('loggedInAdmin');
            window.location.href = '../index.html';
        }
    });
}
