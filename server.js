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
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// -------------------------------------------------------------
// 1. مسار الفحص الذكي (يقفل أي كود قديم أو جديد على أول جهاز فقط)
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

  // إذا كان الكود قديماً وموزعاً مسبقاً، يتم تسجيله فوراً في قاعدة البيانات
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

  // 1. فحص هل هناك جهاز مفعل وموافق عليه لهذا الكود
  const approvedActivation = keyObj.activations.find(a => a.status === 'approved');

  if (approvedActivation) {
    // 🔒 إذا كان الكود مفعل لجهاز آخر مختلف -> حظر وطرد فوري!
    if (approvedActivation.device_id !== deviceId) {
      return res.json({ 
        valid: false, 
        needs_approval: false,
        message: "⚠️ هذا الكود مفعّل لجهاز آخر ولا يمكن مشاركته!" 
      });
    }
    // نفس الجهاز المصرح له -> دخول مباشر
    return res.json({ valid: true, message: "تم التحقق بنجاح" });
  }

  // 2. فحص حالة هذا الجهاز
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

// -------------------------------------------------------------
// 3. لوحة التحكم المدمجة
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
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="logo-title">
      <h1>👑 لوحة تحكم عبدالإله</h1>
      <span class="status-tag">السيرفر متصل وفعال ✅</span>
    </div>
    <div>
      <button class="btn btn-outline" onclick="loadData()">🔄 تحديث</button>
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
      <div class="label">المرفوضة / الملغاة</div>
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
let allKeys = [];

async function loadData() {
  try {
    const res = await fetch('/api/admin/keys');
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">لا توجد أكواد حالياً، اضغط "توليد أكواد جديدة" في الأعلى</td></tr>';
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
          actButtons = \`<button class="act-btn btn-revoke" onclick="revokeKey('\${k.key}', '\${a.device_id}')">إلغاء التفعيل</button>\`;
        } else if (a.status === 'rejected') {
          badgeClass = 'badge-rejected'; badgeText = 'ملغي / مرفوض';
          actButtons = \`<button class="act-btn btn-approve" onclick="approveKey('\${k.key}', '\${a.device_id}')">إعادة تفعيل</button>\`;
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: parseInt(count) })
  });
  const data = await res.json();
  const resBox = document.getElementById('genResults');
  resBox.style.display = 'block';
  resBox.innerHTML = '<strong>تم توليد الأكواد بنجاح (انسخها):</strong><br>' + data.keys.join('<br>');
  loadData();
}

async function approveKey(key, deviceId) {
  await fetch('/api/admin/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function rejectKey(key, deviceId) {
  await fetch('/api/admin/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function revokeKey(key, deviceId) {
  await fetch('/api/admin/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function deleteKey(key) {
  if (!confirm('هل أنت متأكد من حذف هذا الكود؟')) return;
  await fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
  });
  loadData();
}

function filterRows() {
  const q = document.getElementById('search').value.toLowerCase();
  const filtered = allKeys.filter(k => {
    if (k.key.toLowerCase().includes(q)) return true;
    return (k.activations || []).some(a => (a.device_name && a.device_name.toLowerCase().includes(q)) || (a.device_id && a.device_id.toLowerCase().includes(q)));
  });
  renderTable(filtered);
}

loadData();
setInterval(loadData, 5000);
</script>
</body>
</html>`;
  res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
