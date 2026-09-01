const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { keys: [], adminToken: "admin123456" };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { keys: [], adminToken: "admin123456" };
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
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
    // إذا كان محظور أو مقفول من الإدارة
    if (thisDevice.status === 'rejected' || thisDevice.status === 'blocked') {
      return res.json({ 
        valid: false, 
        message: "🚫 تم إيقاف وقفل الأداة من قِبل الإدارة" 
      });
    }
    
    // إذا كان موافق عليه مسبقاً (حتى لو حذف النسخ ورجع حملها على نفس الجهاز) -> تفعيل فوري!
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

    // بانتظار الموافقة
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

  // 3. جهاز جديد يستخدم كود متاح -> تسجيله بانتظار الموافقة (أو تفعيل تلقائي)
  const newActivation = {
    device_id: deviceId,
    device_name: deviceName,
    device_model: deviceModel,
    ios_version: iosVersion,
    bundle_id: bundleId,
    status: 'approved', // تفعيل تلقائي للجهاز الأول، ويحفظ بالسيرفر دائماً
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
// 2. Admin APIs: التحكم والتجميد وإدارة الأكواد
// -------------------------------------------------------------
app.get('/api/admin/keys', (req, res) => {
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

// قفل / تجميد الأداة عن جهاز معين
app.post('/api/admin/lock', (req, res) => {
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

// فتح وتفعيل الأداة لجهاز معين
app.post('/api/admin/unlock', (req, res) => {
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

// حذف الكود بالكامل
app.post('/api/admin/delete', (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  db.keys = db.keys.filter(k => k.key !== key);
  saveDB(db);
  res.json({ success: true });
});

// إعادة تعيين كود لجعله متاحاً لجهاز آخر
app.post('/api/admin/reset', (req, res) => {
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
// 3. لوحة التحكم المدمجة الكاملة (Web Dashboard HTML)
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 لوحة تحكم عبدالإله | إدارة السيرفر والتراخيص</title>
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
  .stat-card.active { border-color: rgba(46, 204, 113, 0.4); }
  .stat-card.active .num { color: var(--green); }
  .stat-card.blocked { border-color: rgba(231, 76, 60, 0.4); }
  .stat-card.blocked .num { color: var(--red); }

  .actions-bar { display: flex; gap: 12px; margin-bottom: 25px; flex-wrap: wrap; }
  .btn { padding: 12px 22px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; border: none; transition: 0.2s; display: inline-flex; align-items: center; gap: 8px; }
  .btn-gold { background: linear-gradient(135deg, var(--gold), #aa820a); color: #000; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.25); }
  .btn-gold:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4); }
  .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .btn-outline:hover { background: var(--border); }
  .btn-red { background: rgba(231, 76, 60, 0.15); color: var(--red); border: 1px solid rgba(231, 76, 60, 0.3); }
  .btn-red:hover { background: var(--red); color: #fff; }
  .btn-green { background: rgba(46, 204, 113, 0.15); color: var(--green); border: 1px solid rgba(46, 204, 113, 0.3); }
  .btn-green:hover { background: var(--green); color: #fff; }
  .btn-sm { padding: 6px 12px; font-size: 12.5px; border-radius: 8px; }

  .gen-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 22px; margin-bottom: 25px; display: none; }
  .gen-box.show { display: block; }
  .gen-inputs { display: flex; gap: 12px; align-items: center; margin-top: 15px; }
  .input { background: #0b0c10; border: 1px solid var(--border); color: #fff; padding: 12px 16px; border-radius: 10px; font-size: 15px; }
  .input:focus { border-color: var(--gold); outline: none; }

  .table-container { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; text-align: right; }
  th { background: rgba(255, 255, 255, 0.02); padding: 16px; font-size: 14px; color: var(--text-muted); border-bottom: 1px solid var(--border); }
  td { padding: 16px; font-size: 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: middle; }
  tr:hover { background: rgba(255, 255, 255, 0.015); }
  
  .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; }
  .badge-approved { background: rgba(46, 204, 113, 0.15); color: var(--green); }
  .badge-blocked { background: rgba(231, 76, 60, 0.15); color: var(--red); }
  .badge-available { background: rgba(102, 252, 241, 0.15); color: var(--accent); }

  .key-text { font-family: monospace; font-size: 15px; font-weight: bold; color: var(--gold-light); letter-spacing: 1px; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="logo-title">
      <h1>👑 لوحة تحكم عبدالإله | إدارة السيرفر والتراخيص</h1>
    </div>
    <div class="status-tag">السيرفر متصل ويعمل ⚡</div>
  </header>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="num" id="totalKeys">0</div>
      <div class="label">إجمالي الأكواد</div>
    </div>
    <div class="stat-card active">
      <div class="num" id="approvedKeys">0</div>
      <div class="label">أجهزة مفعلة ومحفوظة</div>
    </div>
    <div class="stat-card blocked">
      <div class="num" id="blockedKeys">0</div>
      <div class="label">أجهزة مقفولة ومحظورة</div>
    </div>
  </div>

  <div class="actions-bar">
    <button class="btn btn-gold" onclick="toggleGen()">⚡ توليد أكواد جديدة</button>
    <button class="btn btn-outline" onclick="loadKeys()">🔄 تحديث البيانات</button>
  </div>

  <div class="gen-box" id="genBox">
    <h3>توليد أكواد تفعيل جديدة</h3>
    <div class="gen-inputs">
      <input type="number" id="genCount" class="input" value="1" min="1" max="50" style="width: 100px;">
      <button class="btn btn-gold" onclick="generateKeys()">توليد فوراً</button>
    </div>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>كود التفعيل</th>
          <th>الجهاز المرتبط</th>
          <th>معلومات النظام والموديل</th>
          <th>الحالة</th>
          <th>التحكم بالأداة عن بُعد</th>
        </tr>
      </thead>
      <tbody id="keysTable">
        <tr><td colspan="5" style="text-align:center;">جاري تحميل البيانات...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<script>
async function loadKeys() {
  try {
    const res = await fetch('/api/admin/keys');
    const data = await res.json();
    document.getElementById('totalKeys').innerText = data.stats.total_keys;
    document.getElementById('approvedKeys').innerText = data.stats.approved;
    document.getElementById('blockedKeys').innerText = data.stats.rejected;

    const tbody = document.getElementById('keysTable');
    if (!data.keys || data.keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد أكواد بعد</td></tr>';
      return;
    }

    let rows = '';
    data.keys.forEach(k => {
      const acts = k.activations || [];
      if (acts.length === 0) {
        rows += \`<tr>
          <td><span class="key-text">\${k.key}</span></td>
          <td><span style="color:var(--text-muted);">غير مرتبط بأي جهاز (متاح)</span></td>
          <td>-</td>
          <td><span class="badge badge-available">متاح للاستخدام</span></td>
          <td>
            <button class="btn btn-red btn-sm" onclick="deleteKey('\${k.key}')">حذف</button>
          </td>
        </tr>\`;
      } else {
        acts.forEach(a => {
          const isApproved = a.status === 'approved';
          rows += \`<tr>
            <td><span class="key-text">\${k.key}</span></td>
            <td><strong>\${a.device_name || 'iPhone'}</strong><br><small style="color:var(--text-muted); font-size:11px;">\${a.device_id.substring(0,18)}...</small></td>
            <td>\${a.device_model || ''} | iOS \${a.ios_version || ''}</td>
            <td>
              <span class="badge \${isApproved ? 'badge-approved' : 'badge-blocked'}">
                \${isApproved ? 'مفعّل ومحفوظ' : 'مقفل / محظور'}
              </span>
            </td>
            <td>
              \${isApproved ? 
                \`<button class="btn btn-red btn-sm" onclick="lockDevice('\${k.key}', '\${a.device_id}')">🔒 قفل الأداة</button>\` : 
                \`<button class="btn btn-green btn-sm" onclick="unlockDevice('\${k.key}', '\${a.device_id}')">🔓 فتح الأداة</button>\`
              }
              <button class="btn btn-outline btn-sm" onclick="resetKey('\${k.key}')">إعادة تعيين</button>
              <button class="btn btn-red btn-sm" onclick="deleteKey('\${k.key}')">حذف</button>
            </td>
          </tr>\`;
        });
      }
    });
    tbody.innerHTML = rows;
  } catch (e) {
    console.error(e);
  }
}

function toggleGen() {
  const b = document.getElementById('genBox');
  b.classList.toggle('show');
}

async function generateKeys() {
  const count = document.getElementById('genCount').value || 1;
  await fetch('/api/admin/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: count })
  });
  toggleGen();
  loadKeys();
}

async function lockDevice(key, deviceId) {
  if (!confirm('هل تريد قفل وتجميد الأداة عن هذا الجهاز فوراً؟')) return;
  await fetch('/api/admin/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, deviceId })
  });
  loadKeys();
}

async function unlockDevice(key, deviceId) {
  await fetch('/api/admin/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, deviceId })
  });
  loadKeys();
}

async function resetKey(key) {
  if (!confirm('هل تريد فك ارتباط الجهاز بالكود لجعله متاحاً لجهاز آخر؟')) return;
  await fetch('/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
  });
  loadKeys();
}

async function deleteKey(key) {
  if (!confirm('هل تريد حذف هذا الكود نهائياً؟')) return;
  await fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
  });
  loadKeys();
}

loadKeys();
setInterval(loadKeys, 10000);
</script>
</body>
</html>\`;
  res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`License Server running on port \${PORT}\`);
});
