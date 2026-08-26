const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { keys: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { keys: [] };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Save error:", e);
  }
}

// -------------------------------------------------------------
// 1. API: التحقق من التفعيل (1 Key = 1 Device Only)
// -------------------------------------------------------------
app.post('/api/validate', (req, res) => {
  const rawKey = req.body.key;
  const deviceId = req.body.deviceId || req.body.device_id;
  const deviceName = req.body.deviceName || req.body.device_name || 'iPhone';
  const deviceModel = req.body.deviceModel || req.body.device_model || 'iOS Device';
  const iosVersion = req.body.iosVersion || req.body.ios_version || '';
  const bundleId = req.body.bundleId || req.body.bundle_id || '';

  if (!rawKey || !deviceId) {
    return res.status(400).json({ valid: false, message: "Missing key or deviceId" });
  }

  const key = rawKey.trim().toUpperCase();
  const db = loadDB();
  let keyObj = db.keys.find(k => k.key && k.key.trim().toUpperCase() === key);

  if (!keyObj) {
    keyObj = {
      key: key,
      created_at: new Date().toISOString(),
      activations: []
    };
    db.keys.unshift(keyObj);
    saveDB(db);
  }

  if (!keyObj.activations) {
    keyObj.activations = [];
  }

  const approvedActivation = keyObj.activations.find(a => a.status === 'approved');

  if (approvedActivation) {
    if (approvedActivation.device_id !== deviceId) {
      return res.json({ 
        valid: false, 
        needs_approval: false,
        message: "⚠️ هذا الكود مفعّل لجهاز آخر ولا يمكن مشاركته!" 
      });
    }
    return res.json({ valid: true, message: "تم التحقق بنجاح" });
  }

  let thisDevice = keyObj.activations.find(a => a.device_id === deviceId);
  if (!thisDevice) {
    thisDevice = {
      device_id: deviceId,
      device_name: deviceName,
      device_model: deviceModel,
      ios_version: iosVersion,
      bundle_id: bundleId,
      status: 'pending',
      requested_at: new Date().toISOString()
    };
    keyObj.activations.push(thisDevice);
    saveDB(db);
  }

  if (thisDevice.status === 'rejected') {
    return res.json({ 
      valid: false, 
      needs_approval: false,
      message: "🚫 تم إيقاف هذا الترخيص من قِبل الإدارة" 
    });
  }

  return res.json({ 
    valid: false, 
    needs_approval: true, 
    message: "تم إرسال الطلب، بانتظار موافقة الإدارة من لوحة التحكم" 
  });
});

// -------------------------------------------------------------
// 2. Admin APIs
// -------------------------------------------------------------
app.get('/api/admin/keys', (req, res) => {
  const db = loadDB();
  const keys = db.keys || [];
  let pendingCount = 0, approvedCount = 0, rejectedCount = 0;

  keys.forEach(k => {
    (k.activations || []).forEach(a => {
      if (a.status === 'pending') pendingCount++;
      if (a.status === 'approved') approvedCount++;
      if (a.status === 'rejected') rejectedCount++;
    });
  });

  res.json({
    keys: keys,
    pendingCount: pendingCount,
    stats: {
      total_keys: keys.length,
      approved: approvedCount,
      pending: pendingCount,
      rejected: rejectedCount,
      active_today: approvedCount
    }
  });
});

app.post('/api/admin/generate', (req, res) => {
  const count = parseInt(req.body.count) || 1;
  const db = loadDB();
  const newKeys = [];

  for (let i = 0; i < count; i++) {
    const randomKey = 'YS-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const keyRecord = {
      key: randomKey,
      created_at: new Date().toISOString(),
      activations: []
    };
    db.keys.unshift(keyRecord);
    newKeys.push(randomKey);
  }

  saveDB(db);
  res.json({ keys: newKeys });
});

app.post('/api/admin/approve', (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key && k.key.trim().toUpperCase() === (key || '').trim().toUpperCase());
  if (keyObj && keyObj.activations) {
    keyObj.activations.forEach(a => {
      if (a.device_id === targetDeviceId) {
        a.status = 'approved';
        a.approved_at = new Date().toISOString();
      } else {
        a.status = 'rejected';
      }
    });
    saveDB(db);
  }
  res.json({ success: true });
});

app.post('/api/admin/reject', (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key && k.key.trim().toUpperCase() === (key || '').trim().toUpperCase());
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) act.status = 'rejected';
    saveDB(db);
  }
  res.json({ success: true });
});

app.post('/api/admin/revoke', (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key && k.key.trim().toUpperCase() === (key || '').trim().toUpperCase());
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) act.status = 'rejected';
    saveDB(db);
  }
  res.json({ success: true });
});

app.post('/api/admin/delete', (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  db.keys = db.keys.filter(k => k.key && k.key.trim().toUpperCase() !== (key || '').trim().toUpperCase());
  saveDB(db);
  res.json({ success: true });
});

app.post('/api/admin/import', (req, res) => {
  const importedKeys = req.body.keys;
  if (Array.isArray(importedKeys)) {
    const db = loadDB();
    importedKeys.forEach(ik => {
      if (!db.keys.some(k => k.key === ik.key)) {
        db.keys.push(ik);
      }
    });
    saveDB(db);
    return res.json({ success: true, count: db.keys.length });
  }
  res.status(400).json({ error: "Invalid data" });
});

// -------------------------------------------------------------
// 3. لوحة التحكم المدمجة الكاملة
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 لوحة تحكم عبدالإله | إدارة التراخيص</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-dark: #0b0c10;
    --card-bg: #14161d;
    --gold: #d4af37;
    --gold-light: #f3e5ab;
    --accent: #66fcf1;
    --green: #2ecc71;
    --red: #e74c3c;
    --orange: #e67e22;
    --text: #e0e6ed;
    --text-muted: #8892b0;
    --border: #232733;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', sans-serif; }
  body { background: var(--bg-dark); color: var(--text); padding: 20px; min-height: 100vh; }
  .container { max-width: 1200px; margin: 0 auto; }
  
  header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 1px solid var(--border); margin-bottom: 25px; flex-wrap: wrap; gap: 15px; }
  .logo-title { display: flex; align-items: center; gap: 12px; }
  .logo-title h1 { font-size: 26px; color: var(--gold-light); font-weight: 800; }
  .status-tag { background: rgba(46, 204, 113, 0.15); color: var(--green); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: bold; border: 1px solid rgba(46, 204, 113, 0.3); }

  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 30px; }
  .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 20px; text-align: center; position: relative; overflow: hidden; }
  .stat-card .num { font-size: 34px; font-weight: 800; color: #fff; margin-bottom: 6px; }
  .stat-card .label { font-size: 14px; color: var(--text-muted); font-weight: 500; }
  .stat-card.pending { border-color: rgba(230, 126, 34, 0.4); }
  .stat-card.pending .num { color: var(--orange); }
  .stat-card.active { border-color: rgba(46, 204, 113, 0.4); }
  .stat-card.active .num { color: var(--green); }

  .actions-bar { display: flex; gap: 12px; margin-bottom: 25px; flex-wrap: wrap; }
  .btn { padding: 12px 22px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; border: none; transition: 0.2s; display: inline-flex; align-items: center; gap: 8px; }
  .btn-gold { background: linear-gradient(135deg, var(--gold), #aa820a); color: #000; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.25); }
  .btn-gold:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4); }
  .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .btn-outline:hover { background: var(--border); }

  .gen-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 22px; margin-bottom: 25px; display: none; }
  .gen-box.show { display: block; }
  .gen-inputs { display: flex; gap: 12px; align-items: center; margin-top: 15px; }
  .input { background: #0b0c10; border: 1px solid var(--border); color: #fff; padding: 12px 16px; border-radius: 10px; font-size: 15px; }
  .input:focus { border-color: var(--gold); outline: none; }
  .gen-results { margin-top: 15px; padding: 15px; background: #000; border-radius: 10px; font-family: monospace; color: var(--gold-light); font-size: 14px; line-height: 1.8; max-height: 180px; overflow-y: auto; display: none; }

  .table-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
  .table-header { padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 12px; }
  .table-header h2 { font-size: 18px; color: #fff; }
  table { width: 100%; border-collapse: collapse; text-align: right; }
  th { background: #0e1017; padding: 14px 18px; font-size: 13px; color: var(--text-muted); font-weight: 700; border-bottom: 1px solid var(--border); }
  td { padding: 16px 18px; font-size: 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:hover { background: rgba(255, 255, 255, 0.02); }
  
  .badge { padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-block; }
  .badge-approved { background: rgba(46, 204, 113, 0.15); color: var(--green); }
  .badge-pending { background: rgba(230, 126, 34, 0.15); color: var(--orange); }
  .badge-rejected { background: rgba(231, 76, 60, 0.15); color: var(--red); }
  .badge-unused { background: rgba(136, 146, 176, 0.15); color: var(--text-muted); }

  .act-btn { padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; margin-left: 6px; }
  .btn-approve { background: var(--green); color: #000; }
  .btn-reject { background: var(--red); color: #fff; }
  .btn-revoke { background: var(--orange); color: #fff; }
  .btn-copy { background: rgba(212, 175, 55, 0.2); color: var(--gold-light); border: 1px solid var(--gold); }
  .btn-del { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
  .btn-del:hover { color: var(--red); border-color: var(--red); }

  .key-tag { font-family: monospace; background: #000; padding: 4px 10px; border-radius: 6px; color: var(--gold-light); font-weight: 700; letter-spacing: 1px; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="logo-title">
      <h1>👑 لوحة تحكم عبدالإله</h1>
      <span class="status-tag">السيرفر متصل وفعال ✅</span>
    </div>
    <div style="display: flex; gap: 10px;">
