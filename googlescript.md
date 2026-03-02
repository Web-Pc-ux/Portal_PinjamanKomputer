/**
 * GOOGLE APPS SCRIPT - TURBO ENGINE v5.3 (CONCURRENT ULTRA)
 * Dioptimumkan untuk Baca/Tulis/Padam serentak tanpa delay.
 */

const AUTH_TOKEN = "CHRIS_SHEETS_KEY_2026"; 

const INITIAL_STRUCTURE = {
  'permohonan': ['id', 'noPermohonan', 'nama', 'noPekerja', 'jabatan', 'telefon', 'email', 'jenis', 'lokasi', 'tujuan', 'mula', 'tamat', 'model', 'kuantiti', 'siri', 'scanPinjam', 'scanPulang', 'catatanAdmin', 'status', 'timestamp', 'Timestamp'],
  'komputer': ['id', 'kategori', 'model', 'noPC', 'noSiri', 'noPendaftaran', 'Timestamp'],
  'kategori': ['id', 'nama', 'Timestamp'],
  'admin': ['id', 'nama', 'username', 'email', 'jawatan', 'peranan', 'password', 'Timestamp'],
  'tetapan': ['id', 'idle', 'sound', 'volume', 'isMuted', 'gasUrl', 'gasToken', 'logo', 'bg', 'Timestamp']
};

function setupSystem() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(INITIAL_STRUCTURE).forEach(sheetName => {
    let sheet = doc.getSheetByName(sheetName) || doc.insertSheet(sheetName);
    if (sheet.getLastColumn() === 0) {
      const headers = INITIAL_STRUCTURE[sheetName];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f3f3');
      sheet.setFrozenRows(1);
      if (sheetName === 'admin' && sheet.getLastRow() === 1) {
        sheet.appendRow([1, 'Super Admin', 'admin', 'admin@ums.edu.my', 'Pentadbir Sistem', 'Pemilik', 'admin123', new Date()]);
      }
    }
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  // Tunggu sehingga 30 saat untuk giliran (Antisipasi trafik tinggi serentak)
  if (!lock.tryLock(30000)) return responseJSON({ status: 'error', message: 'Server Busy' });

  try {
    const params = JSON.parse(e.postData.contents);
    if (params.token !== AUTH_TOKEN) return responseJSON({ status: 'error', message: 'Invalid Token' });

    const doc = SpreadsheetApp.getActiveSpreadsheet();
    const action = params.action;
    const inputData = params.data || {};
    const sheetName = inputData.jenis_data || params.sheet || 'permohonan';
    let sheet = doc.getSheetByName(sheetName) || doc.insertSheet(sheetName);

    if (action === 'create' || action === 'update') return upsertTurbo(sheet, inputData, action === 'update');
    if (action === 'delete') return deleteTurbo(sheet, params.id || inputData.id);
    
    return responseJSON({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    return responseJSON({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock(); // Lepas kunci untuk pengguna seterusnya
  }
}

function doGet(e) {
  const params = e.parameter;
  if (params.token !== AUTH_TOKEN) return responseJSON({ status: 'error', message: 'Invalid Token' });

  const doc = SpreadsheetApp.getActiveSpreadsheet();
  if (params.action === 'read') {
    if (params.sheet === 'all') {
      const allData = {};
      Object.keys(INITIAL_STRUCTURE).forEach(sName => {
        // KESELAMATAN: Jangan hantar senarai admin ke 'all' fetch (Cegah leak)
        if (sName === 'admin') {
          allData[sName] = []; 
          return;
        }
        const s = doc.getSheetByName(sName);
        allData[sName] = s ? readFast(s) : [];
      });
      return responseJSON({ status: 'success', data: allData, engine: 'Turbo v5.3 Concurrent' });
    }
    
    // KESELAMATAN: Benarkan cari admin spesifik sahaja (Bukan tarik semua)
    if (params.sheet === 'admin' && params.search) {
      const s = doc.getSheetByName('admin');
      const allAdmins = s ? readFast(s) : [];
      const query = params.search.toLowerCase().trim();
      const match = allAdmins.find(a => 
        (a.username && a.username.toString().toLowerCase() === query) || 
        (a.email && a.email.toString().toLowerCase() === query)
      );
      return responseJSON({ status: 'success', data: match ? [match] : [] });
    }

    const s = doc.getSheetByName(params.sheet || 'permohonan');
    return responseJSON({ status: 'success', data: s ? readFast(s) : [] });
  }
  return responseJSON({ status: 'active', message: 'Turbo Engine v5.3 Online' });
}

function readFast(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function upsertTurbo(sheet, data, isUpdate) {
  delete data.jenis_data;
  data.Timestamp = new Date();
  
  // --- OPTIMIZED SYNC HEADERS (Tanpa call function luar untuk kelajuan) ---
  const lastCol = sheet.getLastColumn();
  let headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const keys = Object.keys(data);
  const newKeys = keys.filter(k => headers.indexOf(k) === -1);
  
  if (newKeys.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, newKeys.length).setValues([newKeys]);
    sheet.getRange(1, lastCol + 1, 1, newKeys.length).setFontWeight('bold').setBackground('#fff2cc');
    headers = headers.concat(newKeys); 
  }
  
  const rowData = headers.map(h => {
    const val = data[h];
    return (typeof val === 'string' && val.startsWith('0')) ? "'" + val : (val === undefined ? '' : val);
  });

  if (isUpdate && data.id) {
    const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().map(r => r[0].toString());
    const idx = ids.indexOf(data.id.toString());
    if (idx !== -1) {
      sheet.getRange(idx + 1, 1, 1, rowData.length).setValues([rowData]);
      return responseJSON({ status: 'success', message: 'Updated' });
    }
  }

  sheet.appendRow(rowData);
  return responseJSON({ status: 'success', message: 'Created' });
}

function deleteTurbo(sheet, id) {
  const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().map(r => r[0].toString());
  const idx = ids.indexOf(id.toString());
  if (idx !== -1) {
    sheet.deleteRow(idx + 1);
    return responseJSON({ status: 'success', message: 'Deleted' });
  }
  return responseJSON({ status: 'error', message: 'ID not found' });
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
