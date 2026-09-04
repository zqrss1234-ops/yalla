const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ كلمة السر للدخول للوحة التحكم (يمكنك تغييرها لأي كلمة سر تريدها)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "abod2026";

// 🕵️ المسار السري الخاص بلوحة التحكم (لا أحد يعرفه أو يصل إليه غيرك)
const ADMIN_PATH = process.env.ADMIN_PATH || "abod-master-7788";

const DB_FILE = path.join(__dirname, 'database.json');

// نظام الحماية من محاولات التخمين (Anti-Brute Force)
const failedAttempts = new Map();

function checkRateLimit(ip) {
  const record = failedAttempts.get(ip);
  if (!record) return true;
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return false;
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    failedAttempts.delete(ip);
    return true;
  }
  return true;
}

function recordFailedAttempt(ip) {
  let record = failedAttempts.get(ip) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000; // حظر 15 دقيقة
  }
  failedAttempts.set(ip, record);
}

function clearFailedAttempts(ip) {
  failedAttempts.delete(ip);
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { keys: [], adminToken: ADMIN_TOKEN };
    saveDB(init);
    return init;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!parsed.keys) parsed.keys = [];
    return parsed;
  } catch (e) {
    return { keys: [], adminToken: ADMIN_TOKEN };
  }
}

function saveDB(data) {
  try {
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE); // Atomic write prevents corruption
  } catch (err) {
    console.error("[DB SAVE ERROR]", err);
  }
}

// حماية مسارات الأدمن من أي وصول غير مصرح مع حظر التخمين
function requireAdminAuth(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, message: "🚫 تم حظر هذا الاتصال مؤقتاً بسبب تكرار المحاولات الخاطئة" });
  }

  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'] || req.query.token;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: "🚫 غير مصرح: يرجى كتابة رمز الأدمن" });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  if (token !== ADMIN_TOKEN) {
    recordFailedAttempt(ip);
    return res.status(403).json({ success: false, message: "⛔ رمز الأدمن غير صحيح" });
  }
  clearFailedAttempts(ip);
  next();
}

// -------------------------------------------------------------
// 1. API: التحقق من التفعيل (1 Key = 1 Device - Persistent)
// -------------------------------------------------------------
app.post('/api/validate', (req, res) => {
  const key = req.body.key;
  const deviceId = req.body.deviceId || req.body.device_id;
  const deviceName = req.body.deviceName || req.body.device_name || 'iPhone';
  const deviceModel = req.body.deviceModel || req.body.device_model || 'iOS Device';
  const iosVersion = req.body.iosVersion || req.body.ios_version || '';
  const bundleId = req.body.bundleId || req.body.bundle_id || '';

  if (!key || !deviceId) {
    return res.status(400).json({ valid: false, message: "بيانات التفعيل ناقصة" });
  }

  const db = loadDB();
  const cleanKey = key.trim().toUpperCase();
  const keyObj = db.keys.find(k => k.key && k.key.trim().toUpperCase() === cleanKey);

  if (!keyObj) {
    return res.json({ valid: false, message: "⚠️ كود التفعيل غير صالح، تواصل مع عبدالإله" });
  }

  if (!keyObj.activations) {
    keyObj.activations = [];
  }

  // 1. هل الجهاز مسجل مسبقاً لهذا الكود؟
  let thisDevice = keyObj.activations.find(a => a.device_id === deviceId);

  if (thisDevice) {
    if (thisDevice.status === 'rejected' || thisDevice.status === 'blocked') {
      return res.json({ 
        valid: false, 
        message: "🚫 تم إيقاف وقفل الأداة من قِبل الإدارة" 
      });
    }
    
    if (thisDevice.status === 'approved') {
      thisDevice.last_seen = new Date().toISOString();
      thisDevice.device_name = deviceName;
      thisDevice.device_model = deviceModel;
      thisDevice.ios_version = iosVersion;
      saveDB(db);
      return res.json({ 
        valid: true, 
        message: "✅ تم التحقق وتفعيل الجهاز بنجاح" 
      });
    }

    return res.json({ 
      valid: false, 
      needs_approval: true, 
      message: "⏳ بانتظار الموافقة على جهازك من لوحة التحكم" 
    });
  }

  // 2. هل الكود مستخدم ومفعّل لجهاز آخر؟ (1 Key = 1 Device)
  const approvedOnOtherDevice = keyObj.activations.find(a => a.status === 'approved' && a.device_id !== deviceId);
  if (approvedOnOtherDevice) {
    return res.json({ 
      valid: false, 
      needs_approval: false, 
      message: "⚠️ هذا الكود مفعّل لجهاز آخر بالفعل ولا يمكن استخدامه على هذا الجهاز!" 
    });
  }

  // 3. تسجيل الجهاز الجديد وتفعيله
  const newActivation = {
    device_id: deviceId,
    device_name: deviceName,
    device_model: deviceModel,
    ios_version: iosVersion,
    bundle_id: bundleId,
    status: 'approved',
    requested_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    last_seen: new Date().toISOString()
  };

  keyObj.activations.push(newActivation);
  saveDB(db);

  return res.json({ 
    valid: true, 
    message: "👑 تم تفعيل وحفظ جهازك بنجاح!" 
  });
});

// -------------------------------------------------------------
// 1.1 API: فحص حالة الجهاز وتفعيل جميع النسخ الـ 16 تلقائياً
// -------------------------------------------------------------
app.post('/api/check_device', (req, res) => {
  const deviceId = req.body.deviceId || req.body.device_id;
  const deviceName = req.body.deviceName || req.body.device_name || 'iPhone';
  const deviceModel = req.body.deviceModel || req.body.device_model || 'iOS Device';
  const iosVersion = req.body.iosVersion || req.body.ios_version || '';

  if (!deviceId) {
    return res.json({ valid: false, message: "معرف الجهاز مفقود" });
  }

  const db = loadDB();
  for (const k of (db.keys || [])) {
    const act = (k.activations || []).find(a => a.device_id === deviceId);
    if (act) {
      if (act.status === 'blocked' || act.status === 'rejected') {
        return res.json({ valid: false, message: "🚫 تم قفل الأداة عن هذا الجهاز" });
      }
      if (act.status === 'approved') {
        act.last_seen = new Date().toISOString();
        act.device_name = deviceName;
        act.device_model = deviceModel;
        act.ios_version = iosVersion;
        saveDB(db);
        return res.json({ 
          valid: true, 
          key: k.key, 
          message: "👑 تم تفعيل النسخة المكررة تلقائياً بنجاح!" 
        });
      }
      if (act.status === 'pending') {
        return res.json({ valid: false, needs_approval: true, message: "⏳ بانتظار الموافقة" });
      }
    }
  }

  return res.json({ valid: false, message: "الجهاز غير مسجل مسبقاً، يرجى التفعيل من النسخة الأساسية" });
});

// -------------------------------------------------------------
// 2. Admin APIs: إدارة وتوليد وقفل الأكواد (محمية برمز الأدمن)
// -------------------------------------------------------------
app.post('/api/admin/generate', requireAdminAuth, (req, res) => {
  const count = Math.min(Math.max(parseInt(req.body.count) || 1, 1), 100);
  const note = req.body.note || '';
  const db = loadDB();
  const generated = [];

  for (let i = 0; i < count; i++) {
    const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `ABOD-${part()}-${part()}-${part()}`;
    const keyObj = {
      key: key,
      created_at: new Date().toISOString(),
      note: note,
      activations: []
    };
    db.keys.unshift(keyObj);
    generated.push(key);
  }

  saveDB(db);
  res.json({ success: true, keys: generated });
});

app.post('/api/admin/lock', requireAdminAuth, (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) {
      act.status = 'blocked';
    }
    saveDB(db);
  }
  res.json({ success: true, message: "تم قفل الأداة عن هذا الجهاز فورياً" });
});

app.post('/api/admin/unlock', requireAdminAuth, (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) {
      act.status = 'approved';
      act.approved_at = new Date().toISOString();
    }
    saveDB(db);
  }
  res.json({ success: true, message: "تم فتح وتفعيل الأداة لهذا الجهاز" });
});

app.post('/api/admin/delete', requireAdminAuth, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  db.keys = db.keys.filter(k => k.key !== key);
  saveDB(db);
  res.json({ success: true });
});

app.post('/api/admin/reset', requireAdminAuth, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj) {
    keyObj.activations = [];
    saveDB(db);
  }
  res.json({ success: true, message: "تم مسح ارتباط الجهاز وإتاحة الكود" });
});

// 📥 تصدير نسخة احتياطية من الأكواد (Backup JSON)
app.get('/api/admin/backup', requireAdminAuth, (req, res) => {
  const db = loadDB();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=keys_backup_${Date.now()}.json`);
  res.send(JSON.stringify(db, null, 2));
});

// 📤 استيراد واستعادة نسخة احتياطية (Restore JSON)
app.post('/api/admin/restore', requireAdminAuth, (req, res) => {
  const incomingData = req.body;
  if (!incomingData || !Array.isArray(incomingData.keys)) {
    return res.status(400).json({ success: false, message: "ملف النسخة الاحتياطية غير صالح" });
  }
  const db = loadDB();
  const existingKeyMap = new Map();
  db.keys.forEach(k => existingKeyMap.set(k.key, k));

  incomingData.keys.forEach(incomingKey => {
    if (!existingKeyMap.has(incomingKey.key)) {
      db.keys.push(incomingKey);
    }
  });

  saveDB(db);
  res.json({ success: true, message: `تم استعادة ودمج ${incomingData.keys.length} كود بنجاح!` });
});

// -------------------------------------------------------------
// 🕵️ 5. إخفاء الصفحة الرئيسية (Stealth Mode)
// -------------------------------------------------------------
app.get('/', (req, res) => {
  // الصفحة الرئيسية ترجع 404 لإخفاء السيرفر تماماً عن أي زائر أو متطفل
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1><p>The requested URL was not found on this server.</p></body></html>');
});

// -------------------------------------------------------------
// 👑 6. لوحة التحكم المشفرة على المسار السري الخاص بك فقط
// -------------------------------------------------------------
app.get(`/${ADMIN_PATH}`, (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 لوحة تحكم عبدالإله الملكية | إدارة الأكواد</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-dark: #08090c;
    --card-bg: #12141c;
    --gold: #d4af37;
    --gold-light: #f3e5ab;
    --accent: #66fcf1;
    --green: #2ecc71;
    --red: #e74c3c;
    --orange: #e67e22;
    --text: #e0e6ed;
    --text-muted: #8892b0;
    --border: #1e2230;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', sans-serif; }
  body { background: var(--bg-dark); color: var(--text); padding: 20px; min-height: 100vh; }
  .container { max-width: 1240px; margin: 0 auto; }
  
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

  .actions-bar { display: flex; gap: 12px; margin-bottom: 25px; flex-wrap: wrap; align-items: center; }
  .btn { padding: 12px 20px; border-radius: 12px; font-size: 14.5px; font-weight: 700; cursor: pointer; border: none; transition: 0.2s; display: inline-flex; align-items: center; gap: 8px; }
  .btn-gold { background: linear-gradient(135deg, var(--gold), #aa820a); color: #000; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.25); }
  .btn-gold:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4); }
  .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .btn-outline:hover { background: var(--border); }
  .btn-backup { background: rgba(102, 252, 241, 0.12); color: var(--accent); border: 1px solid rgba(102, 252, 241, 0.3); }
  .btn-backup:hover { background: rgba(102, 252, 241, 0.25); }

  .gen-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 22px; margin-bottom: 25px; display: none; }
  .gen-box.show { display: block; }
  .gen-inputs { display: flex; gap: 12px; align-items: center; margin-top: 15px; flex-wrap: wrap; }
  .input { background: #08090c; border: 1px solid var(--border); color: #fff; padding: 12px 16px; border-radius: 10px; font-size: 15px; }
  .input:focus { border-color: var(--gold); outline: none; }
  .gen-results { margin-top: 15px; padding: 15px; background: #000; border-radius: 10px; font-family: monospace; color: var(--gold-light); font-size: 14px; line-height: 1.8; max-height: 180px; overflow-y: auto; display: none; }

  .table-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
  .table-header { padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 12px; }
  .table-header h2 { font-size: 18px; color: #fff; }
  table { width: 100%; border-collapse: collapse; text-align: right; }
  th { background: #0c0e14; padding: 14px 18px; font-size: 13px; color: var(--text-muted); font-weight: 700; border-bottom: 1px solid var(--border); }
  td { padding: 16px 18px; font-size: 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:hover { background: rgba(255, 255, 255, 0.02); }
  
  .badge { padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-block; }
  .badge-approved { background: rgba(46, 204, 113, 0.15); color: var(--green); }
  .badge-pending { background: rgba(230, 126, 34, 0.15); color: var(--orange); }
  .badge-rejected { background: rgba(231, 76, 60, 0.15); color: var(--red); }
  .badge-unused { background: rgba(136, 146, 176, 0.15); color: var(--text-muted); }

  .act-btn { padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; margin-left: 6px; transition: 0.15s; }
  .btn-approve { background: var(--green); color: #000; }
  .btn-reject { background: var(--red); color: #fff; }
  .btn-revoke { background: var(--orange); color: #fff; }
  .btn-reset { background: rgba(102, 252, 241, 0.2); color: var(--accent); border: 1px solid rgba(102, 252, 241, 0.4); }
  .btn-del { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
  .btn-del:hover { color: var(--red); border-color: var(--red); }
  .btn-copy { background: rgba(212, 175, 55, 0.15); color: var(--gold); border: 1px solid rgba(212, 175, 55, 0.3); }

  .key-tag { font-family: monospace; background: #000; padding: 5px 10px; border-radius: 6px; color: var(--gold-light); font-weight: 700; }

  /* Login Modal */
  #loginModal { position: fixed; inset: 0; background: rgba(0,0,0,0.96); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
  #loginBox { background: var(--card-bg); padding: 40px; border-radius: 24px; border: 1px solid var(--gold); width: 400px; text-align: center; box-shadow: 0 10px 40px rgba(212, 175, 55, 0.25); }
</style>
</head>
<body>

<div id="loginModal">
  <div id="loginBox">
    <h2 style="color:var(--gold); margin-bottom:10px; font-size:24px;">👑 لوحة تحكم عبدالإله</h2>
    <p style="color:var(--text-muted); font-size:13.5px; margin-bottom:22px;">أدخل كلمة السر الخاصة بك لفتح اللوحة بأمان</p>
    <input type="password" id="adminTokenInput" class="input" placeholder="كلمة السر..." style="width:100%; margin-bottom:18px; text-align:center; font-size:16px;" onkeydown="if(event.key==='Enter') login()">
    <button class="btn btn-gold" onclick="login()" style="width:100%; justify-content:center; font-size:16px;">دخول آمن</button>
  </div>
</div>

<div class="container" id="mainDashboard" style="display:none;">
  <header>
    <div class="logo-title">
      <h1>👑 لوحة تحكم عبدالإله الملكية</h1>
      <span class="status-tag">السيرفر محمي ومشفر 100% 🔒</span>
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-backup" onclick="downloadBackup()">📥 حفظ نسخة احتياطية (JSON)</button>
      <button class="btn btn-outline" onclick="triggerRestore()">📤 استعادة نسخة احتياطية</button>
      <input type="file" id="restoreFileInput" style="display:none;" accept=".json" onchange="handleRestoreFile(this)">
      <button class="btn btn-outline" onclick="loadData()">🔄 تحديث</button>
      <button class="btn btn-outline" onclick="logout()" style="color:var(--red); border-color:rgba(231,76,60,0.3);">خروج</button>
    </div>
  </header>

  <div class="stats-grid">
    <div class="stat-card active">
      <div class="num" id="statApproved">0</div>
      <div class="label">الأجهزة المفعلة بنجاح</div>
    </div>
    <div class="stat-card">
      <div class="num" id="statTotal">0</div>
      <div class="label">إجمالي الأكواد المولدة</div>
    </div>
    <div class="stat-card pending">
      <div class="num" id="statPending">0</div>
      <div class="label">بانتظار الموافقة</div>
    </div>
    <div class="stat-card">
      <div class="num" id="statRejected">0</div>
      <div class="label">المقفلة / المحظورة</div>
    </div>
  </div>

  <div class="actions-bar">
    <button class="btn btn-gold" onclick="toggleGen()">➕ توليد أكواد جديدة</button>
    <span style="color:var(--text-muted); font-size:13px; margin-right:auto;">مسار اللوحة السري: <code style="color:var(--gold-light); background:#000; padding:3px 8px; border-radius:4px;">/${ADMIN_PATH}</code></span>
  </div>

  <div class="gen-box" id="genBox">
    <h3 style="color:#fff;">توليد مفاتيح تفعيل جديدة</h3>
    <div class="gen-inputs">
      <label style="color:var(--text-muted); font-size:14px;">عدد الأكواد:</label>
      <input type="number" id="genCount" class="input" value="1" min="1" max="100" style="width: 90px; text-align:center;">
      <input type="text" id="genNote" class="input" placeholder="ملاحظة أو اسم العميل (اختياري)..." style="width: 250px;">
      <button class="btn btn-gold" onclick="generateKeys()">توليد الآن ⚡</button>
    </div>
    <div class="gen-results" id="genResults"></div>
  </div>

  <div class="table-card">
    <div class="table-header">
      <h2>قائمة الأكواد والأجهزة المسجلة</h2>
      <input type="text" id="search" class="input" placeholder="بحث عن كود أو جهاز أو UUID..." oninput="filterRows()" style="width: 280px;">
    </div>
    <table>
      <thead>
        <tr>
          <th>كود التفعيل</th>
          <th>الحالة</th>
          <th>معلومات الجهاز</th>
          <th>معرف العتاد (Hardware UUID)</th>
          <th>تاريخ الإنشاء</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding:35px;">جاري تحميل البيانات...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<script>
let authToken = localStorage.getItem('ys_admin_token') || '';
let allKeys = [];

if (authToken) {
  testAuth(authToken);
}

function login() {
  const token = document.getElementById('adminTokenInput').value.trim();
  if (!token) return alert('الرجاء كتابة كلمة السر');
  testAuth(token);
}

function logout() {
  localStorage.removeItem('ys_admin_token');
  authToken = '';
  location.reload();
}

async function testAuth(token) {
  try {
    const res = await fetch('/api/admin/keys', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      authToken = token;
      localStorage.setItem('ys_admin_token', token);
      document.getElementById('loginModal').style.display = 'none';
      document.getElementById('mainDashboard').style.display = 'block';
      loadData();
    } else {
      alert('⛔ كلمة السر غير صحيحة أو تم حظر الاتصال مؤقتاً!');
    }
  } catch (e) {
    alert('حدث خطأ أثناء الاتصال بالسيرفر');
  }
}

async function loadData() {
  try {
    const res = await fetch('/api/admin/keys', { headers: { 'Authorization': 'Bearer ' + authToken } });
    if (!res.ok) { logout(); return; }
    const data = await res.json();
    allKeys = data.keys || [];
    document.getElementById('statPending').textContent = data.stats.pending || 0;
    document.getElementById('statApproved').textContent = data.stats.approved || 0;
    document.getElementById('statTotal').textContent = data.stats.total_keys || 0;
    document.getElementById('statRejected').textContent = data.stats.rejected || 0;
    renderTable(allKeys);
  } catch (err) { console.error(err); }
}

function renderTable(keys) {
  const tbody = document.getElementById('tableBody');
  if (keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 35px;">لا توجد أكواد حالياً، اضغط \"توليد أكواد جديدة\" في الأعلى</td></tr>';
    return;
  }

  let rowsHtml = '';
  keys.forEach(k => {
    const acts = k.activations || [];
    if (acts.length === 0) {
      rowsHtml += `<tr>
        <td><span class="key-tag">\${k.key}</span> <button class="act-btn btn-copy" onclick="copyText('\${k.key}')">نسخ الكود</button></td>
        <td><span class="badge badge-unused">جاهز للاستخدام</span></td>
        <td><span style="color:var(--text-muted);">\${k.note ? '📝 ' + k.note : 'ـ'}</span></td>
        <td><span style="color:var(--text-muted);">-</span></td>
        <td>\${new Date(k.created_at).toLocaleDateString('ar-SA')}</td>
        <td><button class="act-btn btn-del" onclick="deleteKey('\${k.key}')">حذف الكود</button></td>
      </tr>`;
    } else {
      acts.forEach(a => {
        let badgeClass = 'badge-unused', badgeText = 'غير مستخدم';
        let actButtons = '';

        if (a.status === 'pending') {
          badgeClass = 'badge-pending'; badgeText = 'بانتظار الموافقة';
          actButtons = `<button class="act-btn btn-approve" onclick="approveKey('\${k.key}', '\${a.device_id}')">موافقة</button>
                        <button class="act-btn btn-reject" onclick="rejectKey('\${k.key}', '\${a.device_id}')">رفض</button>`;
        } else if (a.status === 'approved') {
          badgeClass = 'badge-approved'; badgeText = 'مفعل وشغال ✅';
          actButtons = `<button class="act-btn btn-revoke" onclick="lockKey('\${k.key}', '\${a.device_id}')">قفل الأداة</button>
                        <button class="act-btn btn-reset" onclick="resetKey('\${k.key}')">إلغاء ربط الجهاز</button>`;
        } else if (a.status === 'rejected' || a.status === 'blocked') {
          badgeClass = 'badge-rejected'; badgeText = 'مقفل / محظور 🚫';
          actButtons = `<button class="act-btn btn-approve" onclick="unlockKey('\${k.key}', '\${a.device_id}')">إعادة تفعيل</button>
                        <button class="act-btn btn-reset" onclick="resetKey('\${k.key}')">إلغاء ربط الجهاز</button>`;
        }

        const devUUID = a.device_id || '';
        const uuidDisplay = devUUID ? `
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="key-tag" style="color:var(--accent); font-size:11.5px; border:1px solid rgba(102,252,241,0.25);">\${devUUID}</span>
            <button class="act-btn btn-copy" style="color:var(--accent); border-color:rgba(102,252,241,0.4);" onclick="copyText('\${devUUID}')">نسخ UUID</button>
          </div>` : '<span style="color:var(--text-muted);">-</span>';

        rowsHtml += `<tr>
          <td><span class="key-tag">\${k.key}</span> <button class="act-btn btn-copy" onclick="copyText('\${k.key}')">نسخ الكود</button></td>
          <td><span class="badge \${badgeClass}">\${badgeText}</span></td>
          <td><strong>\${a.device_name || 'iPhone'}</strong><br><span style="font-size:12px; color:var(--text-muted);">\${a.device_model || 'iOS'}\${a.ios_version ? ' • iOS ' + a.ios_version : ''}</span></td>
          <td>\${uuidDisplay}</td>
          <td>\${new Date(k.created_at).toLocaleDateString('ar-SA')}\${a.last_seen ? '<br><span style="font-size:11.5px; color:var(--green);">متصل ' + new Date(a.last_seen).toLocaleTimeString('ar-SA') + '</span>' : ''}</td>
          <td>\${actButtons} <button class="act-btn btn-del" onclick="deleteKey('\${k.key}')">حذف</button></td>
        </tr>`;
      });
    }
  });

  tbody.innerHTML = rowsHtml;
}

function toggleGen() {
  const box = document.getElementById('genBox');
  box.classList.toggle('show');
}

async function generateKeys() {
  const count = document.getElementById('genCount').value;
  const note = document.getElementById('genNote').value;
  const res = await fetch('/api/admin/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ count: parseInt(count), note: note })
  });
  const data = await res.json();
  const resBox = document.getElementById('genResults');
  resBox.style.display = 'block';
  resBox.innerHTML = '<strong>👑 تم توليد الأكواد بنجاح (جاهزة للنسخ والتوزيع):</strong><br>' + data.keys.join('<br>');
  loadData();
}

async function lockKey(key, deviceId) {
  await fetch('/api/admin/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function unlockKey(key, deviceId) {
  await fetch('/api/admin/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function deleteKey(key) {
  if (!confirm('هل أنت متأكد من حذف هذا الكود نهائياً؟')) return;
  await fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  loadData();
}

async function resetKey(key) {
  if (!confirm('هل تريد فك ارتباط الجهاز بهذا الكود ليمكن تفعيله على جهاز جديد؟')) return;
  await fetch('/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  loadData();
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('تم نسخ الكود بنجاح: ' + text);
  });
}

function downloadBackup() {
  window.location.href = '/api/admin/backup?token=' + encodeURIComponent(authToken);
}

function triggerRestore() {
  document.getElementById('restoreFileInput').click();
}

async function handleRestoreFile(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const res = await fetch('/api/admin/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify(json)
    });
    const result = await res.json();
    alert(result.message || 'تمت الاستعادة بنجاح');
    loadData();
  } catch (err) {
    alert('ملف النسخة الاحتياطية غير صالح');
  }
}

function filterRows() {
  const q = document.getElementById('search').value.toLowerCase();
  const filtered = allKeys.filter(k => {
    if (k.key.toLowerCase().includes(q)) return true;
    return (k.activations || []).some(a => 
      (a.device_name && a.device_name.toLowerCase().includes(q)) ||
      (a.device_id && a.device_id.toLowerCase().includes(q))
    );
  });
  renderTable(filtered);
}
</script>
</body>
</html>`;
  res.send(html);
});

// 🕵️ صفحة 404 لجميع الروابط والمسارات غير المعروفة (Stealth Mode)
// أي شخص يدخل أي رابط عشوائي أو يحاول التخمين سيظهر له 404 Not Found
app.use((req, res) => {
  res.status(404).send(`<!DOCTYPE html>
<html>
<head>
  <title>404 Not Found</title>
</head>
<body style="font-family: sans-serif; padding: 40px; background: #fff; color: #222;">
  <h1>404 Not Found</h1>
  <p>The requested URL ${req.originalUrl} was not found on this server.</p>
  <hr>
  <address style="font-size: 13px; color: #777;">Apache/2.4.52 (Ubuntu) Server at ${req.hostname || 'localhost'} Port 80</address>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running securely on port ${PORT}`);
});
