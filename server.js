const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// =========================================================================
// 🔒 إعدادات الحماية القصوى والسرية الكاملة (خاصة بك وحدك)
// =========================================================================

// 1. رمز الأدمن السري (غيّره لكلمة سر قوية خاصة بك فقط)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "Abod_Sniper_Master_2026_Secure_Key_!@#";

// 2. المسار السري للوحة التحكم (فقط أنت من يعرف هذا الرابط للدخول للوحة)
const SECRET_DASHBOARD_PATH = "/abod-vault-998877";

const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { keys: [], adminToken: ADMIN_TOKEN };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { keys: [], adminToken: ADMIN_TOKEN };
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ميدلوير لحماية جميع روابط لوحة التحكم والأدمن
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'] || req.query.token;
  if (!authHeader) {
    return res.status(404).send("Cannot GET " + req.url); // يظهر خطأ 404 لإيهام المتطفل بأن الرابط غير موجود
  }
  const token = authHeader.replace('Bearer ', '').trim();
  if (token !== ADMIN_TOKEN) {
    return res.status(404).send("Cannot GET " + req.url);
  }
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

  // 3. تسجيل الجهاز الجديد وتفعيله فورياً
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
// 2. Admin APIs: التحكم والتجميد وإدارة الأكواد (مقفلة ومموهة)
// -------------------------------------------------------------
app.get('/api/admin/keys', requireAdminAuth, (req, res) => {
  const db = loadDB();
  const keys = db.keys || [];
  let pendingCount = 0, approvedCount = 0, rejectedCount = 0;

  keys.forEach(k => {
    (k.activations || []).forEach(a => {
      if (a.status === 'pending') pendingCount++;
      if (a.status === 'approved') approvedCount++;
      if (a.status === 'rejected' || a.status === 'blocked') rejectedCount++;
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

app.post('/api/admin/generate', requireAdminAuth, (req, res) => {
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

app.post('/api/admin/lock', requireAdminAuth, (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) {
      act.status = 'blocked';
      act.blocked_at = new Date().toISOString();
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

app.post('/api/admin/approve', requireAdminAuth, (req, res) => {
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
  res.json({ success: true, message: "تمت الموافقة وتفعيل الجهاز" });
});

app.post('/api/admin/reject', requireAdminAuth, (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) {
      act.status = 'rejected';
      act.rejected_at = new Date().toISOString();
    }
    saveDB(db);
  }
  res.json({ success: true, message: "تم رفض الجهاز" });
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

// -------------------------------------------------------------
// 3. التمويه الكامل: الصفحة الرئيسية تظهر 404 (كأن الموقع غير موجود)
// -------------------------------------------------------------
app.get('/', (req, res) => {
  res.status(404).send(`<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="background:#fff;color:#222;font-family:sans-serif;padding:40px;text-align:center;"><h1>404 Not Found</h1><hr><p style="color:#777;">nginx/1.24.0 (Ubuntu)</p></body></html>`);
});

// -------------------------------------------------------------
// 4. المسار السري الخاص بك فقط للوحة التحكم الذهبية
// -------------------------------------------------------------
app.get(SECRET_DASHBOARD_PATH, (req, res) => {
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
  .table-header { padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
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
  .btn-del { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
  .btn-del:hover { color: var(--red); border-color: var(--red); }

  .key-tag { font-family: monospace; background: #000; padding: 4px 10px; border-radius: 6px; color: var(--gold-light); font-weight: 700; }

  /* Login Modal */
  #loginModal { position: fixed; inset: 0; background: rgba(0,0,0,0.92); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
  #loginBox { background: var(--card-bg); padding: 36px; border-radius: 20px; border: 1px solid var(--gold); width: 380px; text-align: center; box-shadow: 0 10px 35px rgba(212, 175, 55, 0.2); }
</style>
</head>
<body>

<div id="loginModal">
  <div id="loginBox">
    <h2 style="color:var(--gold); margin-bottom:10px;">👑 تسجيل دخول المسؤول</h2>
    <p style="color:var(--text-muted); font-size:13.5px; margin-bottom:20px;">أدخل رمز الإدارة السري للوصول للوحة التحكم</p>
    <input type="password" id="adminTokenInput" class="input" placeholder="رمز الإدارة السري..." style="width:100%; margin-bottom:15px; text-align:center;">
    <button class="btn btn-gold" onclick="login()" style="width:100%; justify-content:center;">دخول إلى اللوحة</button>
  </div>
</div>

<div class="container" id="mainDashboard" style="display:none;">
  <header>
    <div class="logo-title">
      <h1>👑 لوحة تحكم عبدالإله</h1>
      <span class="status-tag">السيرفر محمي ومتصل ✅</span>
    </div>
    <div style="display:flex; gap:10px;">
      <button class="btn btn-outline" onclick="loadData()">🔄 تحديث</button>
      <button class="btn btn-outline" onclick="logout()" style="color:var(--red); border-color:rgba(231,76,60,0.3);">خروج</button>
    </div>
  </header>

  <div class="stats-grid">
    <div class="stat-card pending">
      <div class="num" id="statPending">0</div>
      <div class="label">بانتظار الموافقة</div>
    </div>
    <div class="stat-card active">
      <div class="num" id="statApproved">0</div>
      <div class="label">الأجهزة المفعلة</div>
    </div>
    <div class="stat-card">
      <div class="num" id="statTotal">0</div>
      <div class="label">إجمالي الأكواد</div>
    </div>
    <div class="stat-card">
      <div class="num" id="statRejected">0</div>
      <div class="label">المرفوضة / المقفلة</div>
    </div>
  </div>

  <div class="actions-bar">
    <button class="btn btn-gold" onclick="toggleGen()">➕ توليد أكواد جديدة</button>
  </div>

  <div class="gen-box" id="genBox">
    <h3>توليد مفاتيح تفعيل جديدة</h3>
    <div class="gen-inputs">
      <input type="number" id="genCount" class="input" value="1" min="1" max="100" style="width: 100px;">
      <button class="btn btn-gold" onclick="generateKeys()">توليد الآن</button>
    </div>
    <div class="gen-results" id="genResults"></div>
  </div>

  <div class="table-card">
    <div class="table-header">
      <h2>قائمة الأكواد والأجهزة المسجلة</h2>
      <input type="text" id="search" class="input" placeholder="بحث عن كود أو جهاز..." oninput="filterRows()" style="width: 250px;">
    </div>
    <table>
      <thead>
        <tr>
          <th>كود التفعيل</th>
          <th>الحالة</th>
          <th>معلومات الجهاز</th>
          <th>المعرف (UUID)</th>
          <th>تاريخ الإنشاء</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">جاري تحميل البيانات...</td></tr>
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
  if (!token) return alert('الرجاء كتابة رمز الأدمن');
  testAuth(token);
}

function logout() {
  localStorage.removeItem('ys_admin_token');
  authToken = '';
  document.getElementById('mainDashboard').style.display = 'none';
  document.getElementById('loginModal').style.display = 'flex';
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
      alert('⛔ رمز الأدمن غير صحيح!');
    }
  } catch (e) {
    alert('حدث خطأ أثناء الاتصال بالسيرفر');
  }
}

async function loadData() {
  try {
    const res = await fetch('/api/admin/keys', { headers: { 'Authorization': 'Bearer ' + authToken } });
    if (!res.ok) {
      logout();
      return;
    }
    const data = await res.json();
    allKeys = data.keys || [];
    
    document.getElementById('statPending').textContent = data.stats.pending || 0;
    document.getElementById('statApproved').textContent = data.stats.approved || 0;
    document.getElementById('statTotal').textContent = data.stats.total_keys || 0;
    document.getElementById('statRejected').textContent = data.stats.rejected || 0;

    renderTable(allKeys);
  } catch (err) {
    console.error(err);
  }
}

function renderTable(keys) {
  const tbody = document.getElementById('tableBody');
  if (keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">لا توجد أكواد حالياً، اضغط \"توليد أكواد جديدة\" في الأعلى</td></tr>';
    return;
  }

  let rowsHtml = '';
  keys.forEach(k => {
    const acts = k.activations || [];
    if (acts.length === 0) {
      rowsHtml += \`<tr>
        <td><span class="key-tag">\${k.key}</span></td>
        <td><span class="badge badge-unused">غير مستخدم</span></td>
        <td>-</td>
        <td>-</td>
        <td>\${new Date(k.created_at).toLocaleDateString('ar-SA')}</td>
        <td><button class="act-btn btn-del" onclick="deleteKey('\${k.key}')">حذف</button></td>
      </tr>\`;
    } else {
      acts.forEach(a => {
        let badgeClass = 'badge-unused', badgeText = 'غير مستخدم';
        let actButtons = '';

        if (a.status === 'pending') {
          badgeClass = 'badge-pending'; badgeText = 'بانتظار الموافقة';
          actButtons = \`<button class="act-btn btn-approve" onclick="approveKey('\${k.key}', '\${a.device_id}')">موافقة</button>
                        <button class="act-btn btn-reject" onclick="rejectKey('\${k.key}', '\${a.device_id}')">رفض</button>\`;
        } else if (a.status === 'approved') {
          badgeClass = 'badge-approved'; badgeText = 'مفعل';
          actButtons = \`<button class="act-btn btn-revoke" onclick="lockKey('\${k.key}', '\${a.device_id}')">قفل الأداة</button>\`;
        } else if (a.status === 'rejected' || a.status === 'blocked') {
          badgeClass = 'badge-rejected'; badgeText = 'مقفل / محظور';
          actButtons = \`<button class="act-btn btn-approve" onclick="unlockKey('\${k.key}', '\${a.device_id}')">إعادة تفعيل</button>\`;
        }

        rowsHtml += \`<tr>
          <td><span class="key-tag">\${k.key}</span></td>
          <td><span class="badge \${badgeClass}">\${badgeText}</span></td>
          <td><strong>\${a.device_name || 'iPhone'}</strong> (\${a.device_model || 'iOS'})</td>
          <td style="font-family: monospace; font-size: 12px; color: var(--text-muted);">\${a.device_id ? a.device_id.substring(0, 14) + '...' : '-'}</td>
          <td>\${new Date(k.created_at).toLocaleDateString('ar-SA')}</td>
          <td>\${actButtons} <button class="act-btn btn-del" onclick="deleteKey('\${k.key}')">حذف</button></td>
        </tr>\`;
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
  const res = await fetch('/api/admin/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ count: parseInt(count) })
  });
  const data = await res.json();
  const resBox = document.getElementById('genResults');
  resBox.style.display = 'block';
  resBox.innerHTML = '<strong>تم توليد الأكواد بنجاح (انسخها):</strong><br>' + data.keys.join('<br>');
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

async function approveKey(key, deviceId) {
  await fetch('/api/admin/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function rejectKey(key, deviceId) {
  await fetch('/api/admin/reject', {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running securely on port ${PORT}`);
});
