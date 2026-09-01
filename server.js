const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ غيّر رمز الأدمن السري إلى كلمة سر قوية خاصة بك فقط!
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "Abod_Sniper_Master_2026_Secure_Key_!@#";
const CLIENT_SHARED_SECRET = "YS_HMAC_SECRET_TOKEN_998877665544332211";

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
    return res.status(401).json({ success: false, message: "🚫 غير مصرح: يرجى تقديم رمز الإدارة" });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: "⛔ رمز الإدارة غير صحيح" });
  }
  next();
}

// -------------------------------------------------------------
// 1. API: التحقق من التفعيل (محمي وموقع رقمياً)
// -------------------------------------------------------------
app.post('/api/validate', (req, res) => {
  const { key, deviceId, device_id, deviceName, device_name, deviceModel, device_model, iosVersion, ios_version, bundleId, bundle_id, timestamp, signature } = req.body;
  const targetDeviceId = deviceId || device_id;
  const targetDeviceName = deviceName || device_name || 'iPhone';
  const targetDeviceModel = deviceModel || device_model || 'iOS Device';
  const targetIosVersion = iosVersion || ios_version || '';
  const targetBundleId = bundleId || bundle_id || '';

  if (!key || !targetDeviceId) {
    return res.status(400).json({ valid: false, message: "بيانات التفعيل ناقصة" });
  }

  // التحقق من صلاحية الوقت لمنع هجمات إعادة الإرسال (Anti-Replay) إذا وجد التوقيع
  if (timestamp && signature) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) { // فارق لا يزيد عن 5 دقائق
      return res.status(400).json({ valid: false, message: "انتهت صلاحية الطلب، تأكد من ضبط وقت الجهاز" });
    }
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
  let thisDevice = keyObj.activations.find(a => a.device_id === targetDeviceId);

  if (thisDevice) {
    if (thisDevice.status === 'rejected' || thisDevice.status === 'blocked') {
      return res.json({ valid: false, message: "🚫 تم إيقاف وقفل الأداة من قِبل الإدارة" });
    }
    
    if (thisDevice.status === 'approved') {
      thisDevice.last_seen = new Date().toISOString();
      thisDevice.device_name = targetDeviceName;
      thisDevice.device_model = targetDeviceModel;
      thisDevice.ios_version = targetIosVersion;
      saveDB(db);
      return res.json({ valid: true, message: "✅ تم التحقق وتفعيل الجهاز بنجاح" });
    }

    return res.json({ valid: false, needs_approval: true, message: "⏳ بانتظار الموافقة على جهازك من لوحة التحكم" });
  }

  // 2. هل الكود مستخدم ومفعّل لجهاز آخر؟ (1 Key = 1 Device)
  const approvedOnOtherDevice = keyObj.activations.find(a => a.status === 'approved' && a.device_id !== targetDeviceId);
  if (approvedOnOtherDevice) {
    return res.json({ valid: false, needs_approval: false, message: "⚠️ هذا الكود مفعّل لجهاز آخر بالفعل ولا يمكن استخدامه على هذا الجهاز!" });
  }

  // 3. تسجيل الجهاز الجديد
  const newActivation = {
    device_id: targetDeviceId,
    device_name: targetDeviceName,
    device_model: targetDeviceModel,
    ios_version: targetIosVersion,
    bundle_id: targetBundleId,
    status: 'approved',
    requested_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    last_seen: new Date().toISOString()
  };

  keyObj.activations.push(newActivation);
  saveDB(db);

  return res.json({ valid: true, message: "👑 تم تفعيل وحفظ جهازك بنجاح!" });
});

// -------------------------------------------------------------
// 2. Admin APIs (محمية 100% بـ requireAdminAuth)
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
  const { key, deviceId, device_id } = req.body;
  const targetDeviceId = deviceId || device_id;
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
  const { key, deviceId, device_id } = req.body;
  const targetDeviceId = deviceId || device_id;
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

// -------------------------------------------------------------
// 3. لوحة التحكم الآمنة مع شاشة تسجيل دخول (Login Gate)
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 لوحة تحكم عبدالإله المحمية | إدارة السيرفر والتراخيص</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
  :root { --bg: #0b0c10; --card: #14161d; --gold: #d4af37; --text: #e0e6ed; --border: #232733; --red: #e74c3c; --green: #2ecc71; }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', sans-serif; }
  body { background: var(--bg); color: var(--text); padding: 20px; }
  .container { max-width: 900px; margin: 0 auto; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
  h1, h2 { color: var(--gold); margin-bottom: 15px; }
  input, button { padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border); background: #1c1f2a; color: #fff; font-size: 15px; }
  button { background: var(--gold); color: #000; font-weight: bold; cursor: pointer; border: none; }
  button:hover { opacity: 0.9; }
  .btn-danger { background: var(--red); color: #fff; }
  .btn-success { background: var(--green); color: #fff; }
  table { width: 100%; border-collapse: collapse; margin-top: 15px; }
  th, td { padding: 12px; border: 1px solid var(--border); text-align: center; }
  th { background: #181b24; color: var(--gold); }
  #loginModal { position: fixed; inset: 0; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 999; }
  #loginBox { background: var(--card); padding: 30px; border-radius: 12px; border: 1px solid var(--gold); width: 340px; text-align: center; }
</style>
</head>
<body>

<div id="loginModal">
  <div id="loginBox">
    <h2>👑 تسجيل دخول المسؤول</h2>
    <p style="color:#8892b0; font-size:13px; margin-bottom:15px;">أدخل رمز الإدارة السري للوصول للوحة التحكم</p>
    <input type="password" id="adminTokenInput" placeholder="رمز الإدارة السري..." style="width:100%; margin-bottom:15px;">
    <button onclick="login()" style="width:100%;">دخول</button>
  </div>
</div>

<div class="container" id="mainDashboard" style="display:none;">
  <div class="card">
    <h1>👑 لوحة تحكم عبدالإله الخاصة</h1>
    <p style="color:#8892b0;">لوحة إدارة تراخيص الأداة والأجهزة المتصلة</p>
  </div>

  <div class="card">
    <h2>⚡ توليد أكواد جديدة</h2>
    <input type="number" id="genCount" value="1" min="1" max="50" style="width: 80px;">
    <button onclick="generateKeys()">توليد الأكواد</button>
  </div>

  <div class="card">
    <h2>📋 قائمة الأكواد والأجهزة</h2>
    <button onclick="loadKeys()" style="margin-bottom:10px;">🔄 تحديث القائمة</button>
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th>الكود</th>
            <th>حالة الجهاز</th>
            <th>معلومات الجهاز</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody id="keysTable"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
let authToken = localStorage.getItem('ys_admin_token') || '';

if (authToken) {
  testAuth(authToken);
}

function login() {
  const token = document.getElementById('adminTokenInput').value.trim();
  if (!token) return alert('الرجاء كتابة رمز الأدمن');
  testAuth(token);
}

async function testAuth(token) {
  try {
    const res = await fetch('/api/admin/keys', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      authToken = token;
      localStorage.setItem('ys_admin_token', token);
      document.getElementById('loginModal').style.display = 'none';
      document.getElementById('mainDashboard').style.display = 'block';
      loadKeys();
    } else {
      alert('⛔ رمز الأدمن غير صحيح!');
    }
  } catch (e) {
    alert('حدث خطأ أثناء الاتصال بالسيرفر');
  }
}

async function loadKeys() {
  const res = await fetch('/api/admin/keys', { headers: { 'Authorization': 'Bearer ' + authToken } });
  const data = await res.json();
  const tbody = document.getElementById('keysTable');
  tbody.innerHTML = '';

  data.keys.forEach(k => {
    let act = (k.activations && k.activations[0]) ? k.activations[0] : null;
    let devStatus = act ? (act.status === 'blocked' ? '<span style=\"color:var(--red)\">🚫 مقفل</span>' : '<span style=\"color:var(--green)\">✅ مفعّل</span>') : 'غير مربوط';
    let devInfo = act ? (act.device_name + ' | ' + act.device_model) : '—';
    let deviceId = act ? act.device_id : '';

    let lockBtn = act ? (act.status === 'blocked' ? 
      \`<button class=\"btn-success\" onclick=\"unlockKey('\${k.key}', '\${deviceId}')\">فك القفل</button>\` : 
      \`<button class=\"btn-danger\" onclick=\"lockKey('\${k.key}', '\${deviceId}')\">قفل الأداة</button>\`) : '';

    let resetBtn = act ? \`<button onclick=\"resetKey('\${k.key}')\">مسح الجهاز</button>\` : '';
    let delBtn = \`<button class=\"btn-danger\" onclick=\"deleteKey('\${k.key}')\">حذف الكود</button>\`;

    tbody.innerHTML += \`
      <tr>
        <td style=\"font-family:monospace; font-weight:bold;\">\${k.key}</td>
        <td>\${devStatus}</td>
        <td>\${devInfo}</td>
        <td>\${lockBtn} \${resetBtn} \${delBtn}</td>
      </tr>
    \`;
  });
}

async function generateKeys() {
  const count = document.getElementById('genCount').value;
  await fetch('/api/admin/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ count })
  });
  loadKeys();
}

async function lockKey(key, deviceId) {
  await fetch('/api/admin/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, deviceId })
  });
  loadKeys();
}

async function unlockKey(key, deviceId) {
  await fetch('/api/admin/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, deviceId })
  });
  loadKeys();
}

async function resetKey(key) {
  if (!confirm('هل تريد إلغاء ارتباط الجهاز وإتاحة الكود لجهاز آخر؟')) return;
  await fetch('/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  loadKeys();
}

async function deleteKey(key) {
  if (!confirm('هل أنت متأكد من حذف هذا الكود نهائياً؟')) return;
  await fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  loadKeys();
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
