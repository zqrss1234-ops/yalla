const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key, x-hwid, x-device-id");
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const CURRENT_EPOCH = "V5_ABOD_TOTAL_RESET_2026";
const ADMIN_PATH = "abod-master-7788";
const ADMIN_TOKEN = "12Qwaszx@@";
const JWT_SECRET_SALT = process.env.JWT_SECRET || "ABOD_V5_SECURE_HMAC_SECRET_2026_MASTER";
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "";

const DB_FILE = path.join(__dirname, 'database.json');
let memoryDB = { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
let isMongoActive = false;
let mongoCollection = null;

function loadLocalFileDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
    saveLocalDB(init);
    return init;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!parsed.keys) parsed.keys = [];
    if (parsed.epoch !== CURRENT_EPOCH) {
      parsed.keys = [];
      parsed.epoch = CURRENT_EPOCH;
      parsed.secretSalt = JWT_SECRET_SALT;
      saveLocalDB(parsed);
    }
    return parsed;
  } catch (e) {
    return { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
  }
}

function saveLocalDB(data) {
  try {
    if (!data.epoch) data.epoch = CURRENT_EPOCH;
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {}
}

memoryDB = loadLocalFileDB();

if (MONGO_URI) {
  (async () => {
    try {
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      mongoCollection = client.db('yallasniper_cloud').collection('system_state');
      isMongoActive = true;
      const doc = await mongoCollection.findOne({ _id: 'master_license_store' });
      if (doc && doc.epoch === CURRENT_EPOCH) {
        memoryDB = { epoch: CURRENT_EPOCH, keys: doc.keys || [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
      } else {
        await mongoCollection.updateOne(
          { _id: 'master_license_store' },
          { $set: { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
        memoryDB = { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
      }
      saveLocalDB(memoryDB);
    } catch (err) {
      isMongoActive = false;
    }
  })();
}

async function persistDB(data) {
  memoryDB = data;
  saveLocalDB(data);
  if (isMongoActive && mongoCollection) {
    try {
      await mongoCollection.updateOne(
        { _id: 'master_license_store' },
        { $set: { keys: data.keys, adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (e) {}
  }
}

function sendUniversalLockdown(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  return res.status(200).json({
    status: "revoked",
    success: false,
    valid: false,
    action: "lock",
    message: "All previous keys have been terminated",
    authorized: false,
    approved: false,
    active: false,
    allowed: false,
    licensed: false,
    killswitch: true,
    disabled: true,
    code: 403,
    error: "REVOKED",
    key: null,
    config: {
      global_enabled: false,
      run_enabled: false,
      dashboard_enabled: false,
      allow_legacy_mode: false,
      killswitch: true
    }
  });
}

function buildLockedResponse(msg) {
  return {
    status: "revoked",
    success: false,
    valid: false,
    action: "lock",
    message: "All previous keys have been terminated",
    authorized: false,
    approved: false,
    active: false,
    allowed: false,
    licensed: false,
    killswitch: true,
    disabled: true,
    code: 403,
    error: "REVOKED",
    key: null,
    config: {
      global_enabled: false,
      run_enabled: false,
      dashboard_enabled: false,
      allow_legacy_mode: false,
      killswitch: true
    }
  };
}

function checkAdminPassword(input) {
  if (!input) return false;
  const str = String(input).trim();
  if (str === "12Qwaszx@@" || str === "abod2026") return true;
  if (str.toLowerCase() === "12qwaszx@@" || str.toLowerCase() === "abod2026") return true;
  const norm = str.replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48))
                  .replace(/[\u06F0-\u06F9]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x06F0 + 48));
  if (norm === "12Qwaszx@@" || norm.toLowerCase() === "12qwaszx@@") return true;
  if (norm === "abod2026" || norm.toLowerCase() === "abod2026") return true;
  return false;
}

function requireAdminAuth(req, res, next) {
  let token = null;
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) token = auth.replace('Bearer ', '').trim();
  else if (req.query && (req.query.token || req.query.pass || req.query.password)) token = String(req.query.token || req.query.pass || req.query.password).trim();
  else if (req.body && (req.body.token || req.body.pass || req.body.password)) token = String(req.body.token || req.body.pass || req.body.password).trim();

  if (checkAdminPassword(token) || token === ADMIN_TOKEN || token === (process.env.ADMIN_TOKEN || "").trim()) {
    return next();
  }
  return res.status(403).json({ success: false, error: "UNAUTHORIZED", message: "كلمة المرور غير صحيحة" });
}

function extractDevicePayload(req) {
  const b = req.body || {};
  const q = req.query || {};
  const h = req.headers || {};
  const key = (b.key || b.license || b.licenseKey || b.token || q.key || q.token || "").trim();
  const deviceId = (b.deviceId || b.deviceUUID || b.uuid || b.hwid || b.hardwareId || q.deviceId || q.deviceUUID || q.uuid || q.hwid || h['x-hwid'] || h['x-device-id'] || "").trim();
  const deviceName = (b.deviceName || b.name || q.deviceName || "").trim();
  const deviceModel = (b.deviceModel || b.model || q.deviceModel || "").trim();
  const iosVersion = (b.iosVersion || b.version || q.iosVersion || "").trim();
  const bundleId = (b.bundleId || b.bundle || q.bundleId || "").trim();
  return { key, deviceId, deviceName, deviceModel, iosVersion, bundleId };
}

async function handleCheckDevice(req, res) {
  return sendUniversalLockdown(res);
}

async function handleValidate(req, res) {
  return sendUniversalLockdown(res);
}

const checkRoutes = [
  '/api/validate', '/validate', '/api/v1/validate', '/api/license', '/license', '/api/v1/license',
  '/api/verify', '/verify', '/api/v1/verify', '/api/activate', '/activate', '/api/v1/activate', '/api/auth', '/auth', '/api/v1/auth'
];
const deviceRoutes = [
  '/api/check_device', '/check_device', '/api/v1/check_device', '/api/check-device', '/check-device', '/api/v1/check-device',
  '/api/device_check', '/device_check', '/api/device-check', '/device-check', '/api/check', '/check', '/api/v1/check', '/api/status', '/status'
];

checkRoutes.forEach(r => { app.post(r, handleValidate); app.get(r, handleValidate); });
deviceRoutes.forEach(r => { app.post(r, handleCheckDevice); app.get(r, handleCheckDevice); });

app.get('/api/health', (req, res) => {
  res.json({ status: "online", epoch: memoryDB.epoch, cloud_active: isMongoActive, total_keys: memoryDB.keys.length });
});

app.get('/api/admin/keys', requireAdminAuth, (req, res) => {
  const db = memoryDB;
  let approvedCount = 0, blockedCount = 0;
  db.keys.forEach(k => {
    if (k.status === 'blocked' || k.active === false) blockedCount++;
    else approvedCount++;
  });
  return res.json({
    success: true, keys: db.keys, cloud_active: isMongoActive, epoch: db.epoch,
    stats: { total_keys: db.keys.length, approved: approvedCount, blocked: blockedCount }
  });
});

app.post('/api/admin/generate', requireAdminAuth, async (req, res) => {
  const { owner, durationDays, maxDevices } = req.body;
  const days = parseInt(durationDays) || 30;
  const slots = parseInt(maxDevices) || 1;
  const ownerName = (owner || "مستخدم جديد").trim();
  const randHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const key = `ABOD-${randHex}-${randNum}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const newKeyObj = { key, owner: ownerName, status: "active", active: true, createdAt: now.toISOString(), expiresAt, durationDays: days, maxDevices: slots, devices: [] };
  const db = memoryDB;
  db.keys.unshift(newKeyObj);
  await persistDB(db);
  return res.json({ success: true, key: newKeyObj });
});

app.post('/api/admin/toggle_lock', requireAdminAuth, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false });
  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false });
  k.status = (k.status === 'blocked' || k.active === false) ? 'active' : 'blocked';
  k.active = (k.status === 'active');
  await persistDB(db);
  return res.json({ success: true, key: k });
});

app.post('/api/admin/reset', requireAdminAuth, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false });
  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false });
  k.devices = [];
  await persistDB(db);
  return res.json({ success: true });
});

app.post('/api/admin/delete', requireAdminAuth, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false });
  const db = memoryDB;
  db.keys = db.keys.filter(x => x.key.toUpperCase() !== key.toUpperCase());
  await persistDB(db);
  return res.json({ success: true });
});

app.post('/api/admin/purge_all', requireAdminAuth, async (req, res) => {
  const db = memoryDB;
  db.keys = [];
  db.epoch = "V5_PURGED_" + Date.now();
  await persistDB(db);
  if (isMongoActive && mongoCollection) {
    try {
      await mongoCollection.updateOne({ _id: 'master_license_store' }, { $set: { epoch: CURRENT_EPOCH, keys: [], updatedAt: new Date().toISOString() } }, { upsert: true });
    } catch (e) {}
  }
  return res.json({ success: true, message: "تم تصفير وقفل جميع الأكواد والأجهزة المسجلة فوراً!" });
});

app.get('/api/admin/backup', requireAdminAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="yalla_backup_${Date.now()}.json"`);
  res.send(JSON.stringify(memoryDB, null, 2));
});

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة التحكم | عبدالإله 👑</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
    body { background: #090d16; color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; }
    header { background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .brand { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 800; }
    .brand-badge { background: linear-gradient(135deg, #4f46e5, #ec4899); color: white; padding: 2px 8px; border-radius: 6px; font-size: 12px; }
    .btn { padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
    .btn-primary { background: #4f46e5; color: white; }
    .btn-primary:hover { background: #4338ca; }
    .btn-danger { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); }
    .btn-danger:hover { background: #ef4444; color: white; }
    .btn-secondary { background: rgba(255, 255, 255, 0.06); color: #f8fafc; border-color: rgba(255, 255, 255, 0.1); }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .container { max-width: 1200px; width: 100%; margin: 0 auto; padding: 20px; flex: 1; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .stat-card { background: rgba(18, 24, 38, 0.9); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 18px; }
    .stat-title { font-size: 13px; color: #94a3b8; margin-bottom: 4px; }
    .stat-value { font-size: 26px; font-weight: 800; }
    .control-panel { background: rgba(18, 24, 38, 0.9); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 18px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; }
    .form-group { display: flex; gap: 8px; flex-wrap: wrap; }
    input, select { background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 8px 12px; color: white; font-size: 14px; outline: none; }
    table { width: 100%; border-collapse: collapse; text-align: right; background: rgba(18, 24, 38, 0.9); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.08); }
    th { background: #0f172a; padding: 12px 16px; font-size: 13px; color: #94a3b8; }
    td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
    .key-badge { font-family: monospace; background: rgba(79, 70, 229, 0.15); border: 1px solid rgba(79, 70, 229, 0.3); color: #a5b4fc; padding: 2px 6px; border-radius: 6px; font-weight: 700; user-select: all; }
    .badge-active { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; padding: 2px 6px; border-radius: 6px; font-size: 12px; }
    .badge-blocked { background: rgba(239, 68, 68, 0.15); color: #fca5a5; padding: 2px 6px; border-radius: 6px; font-size: 12px; }
    #loginModal { position: fixed; inset: 0; background: #090d16; display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .login-box { background: rgba(18, 24, 38, 0.95); border: 1px solid rgba(255, 255, 255, 0.12); padding: 32px; border-radius: 12px; width: 100%; max-width: 380px; text-align: center; }
    .login-box input { width: 100%; margin: 16px 0; padding: 12px; font-size: 16px; text-align: center; }
    .login-box .btn { width: 100%; padding: 12px; font-size: 16px; }
  </style>
</head>
<body>

<div id="loginModal">
  <div class="login-box">
    <div style="font-size: 44px; margin-bottom: 8px;">👑</div>
    <h2 style="font-weight: 800; margin-bottom: 4px;">لوحة تحكم عبدالإله</h2>
    <p style="color: #94a3b8; font-size: 14px;">أدخل كلمة المرور للمتابعة</p>
    <div id="loginError" style="display:none; color:#fca5a5; background:rgba(239,68,68,0.15); padding:8px; border-radius:8px; margin-top:10px; font-size:13px;"></div>
    <input type="password" id="adminPassInput" placeholder="أدخل كلمة المرور">
    <button class="btn btn-primary" id="loginSubmitBtn">تسجيل الدخول ⚡</button>
  </div>
</div>

<header>
  <div class="brand"><span>👑</span><span>لوحة تحكم عبدالإله</span><span class="brand-badge">إصدار V5</span></div>
  <div style="display:flex; gap:8px;">
    <button class="btn btn-danger btn-sm" id="btnPurge">🚨 قفل وتصفير شامل</button>
    <button class="btn btn-secondary btn-sm" id="btnLogout">خروج</button>
  </div>
</header>

<div class="container">
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-title">إجمالي الأكواد</div><div class="stat-value" id="statTotalKeys">0</div></div>
    <div class="stat-card"><div class="stat-title">الأكواد النشطة</div><div class="stat-value" style="color:#10b981;" id="statApproved">0</div></div>
    <div class="stat-card"><div class="stat-title">المحظورة / المقفلة</div><div class="stat-value" style="color:#ef4444;" id="statBlocked">0</div></div>
    <div class="stat-card"><div class="stat-title">حالة السحابة</div><div class="stat-value" style="font-size:18px; margin-top:6px;" id="statCloud">فحص...</div></div>
  </div>

  <div class="control-panel">
    <div class="form-group">
      <input type="text" id="newOwnerName" placeholder="اسم صاحب الكود">
      <select id="newDuration">
        <option value="30">30 يوم (شهر)</option>
        <option value="60">60 يوم (شهرين)</option>
        <option value="90">90 يوم (3 أشهر)</option>
        <option value="365">سنة كاملة</option>
        <option value="3650">دائم مدى الحياة</option>
      </select>
      <select id="newMaxDevices">
        <option value="1">جهاز واحد</option>
        <option value="2">جهازين</option>
        <option value="5">5 أجهزة</option>
        <option value="16">16 جهاز (أسطول)</option>
      </select>
      <button class="btn btn-primary" id="btnGenerate">⚡ توليد كود</button>
    </div>
    <div class="form-group">
      <input type="text" id="searchInput" placeholder="بحث...">
      <button class="btn btn-secondary" id="btnRefresh">🔄 تحديث</button>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>الكود</th><th>صاحب الكود</th><th>الحالة</th><th>الصلاحية</th><th>الأجهزة</th><th>الإجراءات</th>
      </tr>
    </thead>
    <tbody id="keysTableBody">
      <tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:30px;">جاري التحميل...</td></tr>
    </tbody>
  </table>
</div>

<script>
(function() {
  var token = sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || '';
  var urlParams = new URLSearchParams(window.location.search);
  var urlPass = urlParams.get('pass') || urlParams.get('token');
  if (urlPass) {
    token = urlPass.trim();
    sessionStorage.setItem('adminToken', token);
    localStorage.setItem('adminToken', token);
  }

  var allKeys = [];

  function req(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, options);
  }

  function loadData(cb) {
    req('/api/admin/keys')
    .then(function(res) {
      if (!res.ok) throw new Error('Auth error');
      return res.json();
    })
    .then(function(data) {
      allKeys = data.keys || [];
      document.getElementById('statTotalKeys').innerText = (data.stats && data.stats.total_keys) || 0;
      document.getElementById('statApproved').innerText = (data.stats && data.stats.approved) || 0;
      document.getElementById('statBlocked').innerText = (data.stats && data.stats.blocked) || 0;
      document.getElementById('statCloud').innerHTML = data.cloud_active ? '<span style="color:#10b981">✅ متصلة</span>' : '<span style="color:#94a3b8">محلي</span>';
      render();
      if (cb) cb(true);
    })
    .catch(function() {
      if (cb) cb(false);
    });
  }

  function render() {
    var tbody = document.getElementById('keysTableBody');
    var q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    var list = allKeys.filter(function(k) {
      if (!q) return true;
      return (k.key && k.key.toLowerCase().indexOf(q) !== -1) || (k.owner && k.owner.toLowerCase().indexOf(q) !== -1);
    });

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:35px;">لا توجد أي أكواد مسجلة (النظام مصفّر بالكامل ومغلق على الجميع ✅)</td></tr>';
      return;
    }

    var h = '';
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      var isBlock = (k.status === 'blocked' || k.active === false);
      var exp = k.expiresAt ? new Date(k.expiresAt).toLocaleDateString('ar-SA') : 'دائم';
      var devCount = (k.devices && k.devices.length) ? (k.devices.length + ' جهاز') : 'لا يوجد';
      h += '<tr>' +
        '<td><span class="key-badge">' + k.key + '</span></td>' +
        '<td><strong>' + (k.owner || 'مستخدم') + '</strong></td>' +
        '<td>' + (isBlock ? '<span class="badge-blocked">محظور 🛑</span>' : '<span class="badge-active">نشط ✅</span>') + '</td>' +
        '<td>' + exp + '</td>' +
        '<td>' + devCount + '</td>' +
        '<td><div style="display:flex; gap:6px;">' +
          '<button class="btn btn-secondary btn-sm act-toggle" data-key="' + k.key + '">' + (isBlock ? 'تفعيل' : 'حظر') + '</button>' +
          '<button class="btn btn-secondary btn-sm act-reset" data-key="' + k.key + '">🔄 تصفير</button>' +
          '<button class="btn btn-danger btn-sm act-del" data-key="' + k.key + '">🗑️ حذف</button>' +
        '</div></td>' +
      '</tr>';
    }
    tbody.innerHTML = h;
  }

  function doLogin() {
    var p = (document.getElementById('adminPassInput').value || '').trim();
    var err = document.getElementById('loginError');
    var btn = document.getElementById('loginSubmitBtn');
    err.style.display = 'none';

    if (!p) {
      err.innerText = 'يرجى إدخال كلمة المرور';
      err.style.display = 'block';
      return;
    }

    btn.innerText = 'جاري التحقق...';
    btn.disabled = true;
    token = p;
    sessionStorage.setItem('adminToken', token);
    localStorage.setItem('adminToken', token);

    loadData(function(ok) {
      btn.innerText = 'تسجيل الدخول ⚡';
      btn.disabled = false;
      if (ok) {
        document.getElementById('loginModal').style.display = 'none';
      } else {
        sessionStorage.removeItem('adminToken');
        localStorage.removeItem('adminToken');
        token = '';
        err.innerText = 'كلمة المرور غير صحيحة!';
        err.style.display = 'block';
      }
    });
  }

  document.getElementById('loginSubmitBtn').addEventListener('click', doLogin);
  document.getElementById('adminPassInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btnRefresh').addEventListener('click', function() { loadData(); });
  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('btnLogout').addEventListener('click', function() {
    sessionStorage.removeItem('adminToken');
    localStorage.removeItem('adminToken');
    token = '';
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('adminPassInput').value = '';
  });

  document.getElementById('btnGenerate').addEventListener('click', function() {
    var owner = (document.getElementById('newOwnerName').value || '').trim();
    var duration = document.getElementById('newDuration').value;
    var maxDevices = document.getElementById('newMaxDevices').value;
    req('/api/admin/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: owner, durationDays: duration, maxDevices: maxDevices })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) {
        document.getElementById('newOwnerName').value = '';
        loadData();
        alert('تم توليد الكود بنجاح: ' + d.key.key);
      }
    });
  });

  document.getElementById('btnPurge').addEventListener('click', function() {
    var ans = prompt('🚨 تحذير خطير: هذا الخيار سيحذف كافة الأكواد ويقفل الأداة على جميع الناس نهائياً! اكتب (نعم) للتأكيد:');
    if (ans === 'نعم') {
      req('/api/admin/purge_all', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        alert(d.message || 'تم التصفير والقفل الشامل!');
        loadData();
      });
    }
  });

  document.getElementById('keysTableBody').addEventListener('click', function(e) {
    var t = e.target;
    var key = t.getAttribute('data-key');
    if (!key) return;

    if (t.classList.contains('act-toggle')) {
      req('/api/admin/toggle_lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key }) })
      .then(function() { loadData(); });
    } else if (t.classList.contains('act-reset')) {
      if (confirm('تصفير ارتباط الأجهزة بهذا الكود؟')) {
        req('/api/admin/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key }) })
        .then(function() { loadData(); });
      }
    } else if (t.classList.contains('act-del')) {
      if (confirm('حذف الكود نهائياً وقفل الأداة عند صاحبه؟')) {
        req('/api/admin/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key }) })
        .then(function() { loadData(); });
      }
    }
  });

  if (token) {
    loadData(function(ok) {
      if (ok) document.getElementById('loginModal').style.display = 'none';
      else document.getElementById('loginModal').style.display = 'flex';
    });
  } else {
    document.getElementById('loginModal').style.display = 'flex';
  }
})();
</script>
</body>
</html>`;

app.get(['/' + ADMIN_PATH, '/abod', '/admin', '/login'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(DASHBOARD_HTML);
});

app.get('/', (req, res, next) => {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(DASHBOARD_HTML);
  }
  next();
});

app.all('/api/*', (req, res) => sendUniversalLockdown(res));
app.post('*', (req, res) => sendUniversalLockdown(res));

app.use((req, res) => {
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family: sans-serif; padding: 40px; background: #fff; color: #222;"><h1>404 Not Found</h1><p>The requested URL ' + req.originalUrl + ' was not found on this server.</p><hr><address style="font-size: 13px; color: #777;">Apache/2.4.52 (Ubuntu) Server</address></body></html>');
});

const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || 'https://yalla-upd0.onrender.com/api/health';
setInterval(() => {
  try { https.get(KEEP_ALIVE_URL, () => {}).on('error', () => {}); } catch (e) {}
}, 3.5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running securely on port ' + PORT);
});
