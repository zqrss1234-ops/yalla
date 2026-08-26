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
// 1. مسار التحقق الصارم والمباشر
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
      client_name: 'مشترك سابق',
      notes: 'كود مسجل تلقائياً',
      created_at: new Date().toISOString(),
      activations: []
    };
    db.keys.unshift(keyObj);
    saveDB(db);
  }

  if (!keyObj.activations) {
    keyObj.activations = [];
  }

  // 1. فحص هل هناك جهاز مفعل
  const approvedActivation = keyObj.activations.find(a => a.status === 'approved');

  if (approvedActivation) {
    // 🔒 إذا حاول جهاز ثانٍ استخدام نفس الكود -> حظر فوري
    if (approvedActivation.device_id !== deviceId) {
      return res.json({ 
        valid: false, 
        needs_approval: false,
        message: "⚠️ هذا الكود مفعّل لجهاز آخر ولا يمكن مشاركته!" 
      });
    }
    // الجهاز المعتمد
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

  if (thisDevice.status === 'banned' || thisDevice.status === 'rejected') {
    return res.json({ 
      valid: false, 
      needs_approval: false,
      message: "🚫 تم إيقاف وقفل الأداة من عمك عبدالإله" 
    });
  }

  return res.json({ 
    valid: false, 
    needs_approval: true, 
    message: "⏳ تم إرسال الطلب، بانتظار الموافقة من عمك عبدالإله..." 
  });
});

// -------------------------------------------------------------
// 2. مسارات لوحة التحكم
// -------------------------------------------------------------
app.get('/api/admin/keys', (req, res) => {
  const db = loadDB();
  const keys = db.keys || [];
  let pendingCount = 0, approvedCount = 0, rejectedCount = 0;

  keys.forEach(k => {
    (k.activations || []).forEach(a => {
      if (a.status === 'pending') pendingCount++;
      if (a.status === 'approved') approvedCount++;
      if (a.status === 'rejected' || a.status === 'banned') rejectedCount++;
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
  const clientName = (req.body.client_name || '').trim();
  const notes = (req.body.notes || '').trim();
  const db = loadDB();
  const newKeys = [];

  for (let i = 0; i < count; i++) {
    const randomKey = 'YS-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const keyRecord = {
      key: randomKey,
      client_name: clientName || (count > 1 ? `مشترك ${i+1}` : 'مشترك غير محدد'),
      notes: notes || 'عادي',
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
        a.status = 'banned';
      }
    });
    saveDB(db);
  }
  res.json({ success: true });
});

app.post('/api/admin/lock', (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key && k.key.trim().toUpperCase() === (key || '').trim().toUpperCase());
  if (keyObj && keyObj.activations) {
    keyObj.activations.forEach(a => {
      if (!targetDeviceId || a.device_id === targetDeviceId) {
        a.status = 'banned';
      }
    });
    saveDB(db);
  }
  res.json({ success: true });
});

app.post('/api/admin/unlock', (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key && k.key.trim().toUpperCase() === (key || '').trim().toUpperCase());
  if (keyObj && keyObj.activations) {
    keyObj.activations.forEach(a => {
      if (!targetDeviceId || a.device_id === targetDeviceId) {
        a.status = 'approved';
      }
    });
    saveDB(db);
  }
  res.json({ success: true });
});

app.post('/api/admin/update-client', (req, res) => {
  const { key, client_name, notes } = req.body;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key && k.key.trim().toUpperCase() === (key || '').trim().toUpperCase());
  if (keyObj) {
    if (client_name !== undefined) keyObj.client_name = client_name;
    if (notes !== undefined) keyObj.notes = notes;
    saveDB(db);
    return res.json({ success: true });
  }
  res.status(404).json({ error: "Key not found" });
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
<title>👑 لوحة تحكم عبدالإله | إدارة المشتركين والتراخيص</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-dark: #0b0c10;
    --card-bg: #14161d;
    --gold: #d4af37;
    --gold-light: #f3e5ab;
    --green: #2ecc71;
    --red: #e74c3c;
    --orange: #e67e22;
    --text: #e0e6ed;
    --text-muted: #8892b0;
    --border: #232733;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', sans-serif; }
  body { background: var(--bg-dark); color: var(--text); padding: 20px; min-height: 100vh; }
  .container { max-width: 1300px; margin: 0 auto; }
  
  header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 1px solid var(--border); margin-bottom: 25px; flex-wrap: wrap; gap: 15px; }
  .logo-title { display: flex; align-items: center; gap: 12px; }
  .logo-title h1 { font-size: 26px; color: var(--gold-light); font-weight: 800; }
  .status-tag { background: rgba(46, 204, 113, 0.15); color: var(--green); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: bold; border: 1px solid rgba(46, 204, 113, 0.3); }

  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 30px; }
  .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 20px; text-align: center; }
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
  .gen-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-top: 15px; }
  .input { background: #0b0c10; border: 1px solid var(--border); color: #fff; padding: 12px 16px; border-radius: 10px; font-size: 15px; width: 100%; }
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
  .badge-banned { background: rgba(231, 76, 60, 0.15); color: var(--red); }
  .badge-unused { background: rgba(136, 146, 176, 0.15); color: var(--text-muted); }

  .act-btn { padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; margin-left: 5px; transition: 0.2s; }
  .btn-approve { background: var(--green); color: #000; }
  .btn-lock { background: var(--red); color: #fff; }
  .btn-unlock { background: var(--green); color: #000; }
  .btn-copy { background: rgba(212, 175, 55, 0.2); color: var(--gold-light); border: 1px solid var(--gold); }
  .btn-del { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
  .btn-del:hover { color: var(--red); border-color: var(--red); }

  .key-tag { font-family: monospace; background: #000; padding: 5px 10px; border-radius: 6px; color: var(--gold-light); font-weight: 700; letter-spacing: 1px; }
  .client-tag { font-weight: 800; color: #fff; font-size: 15px; cursor: pointer; }
  .client-tag:hover { text-decoration: underline; color: var(--gold-light); }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="logo-title">
      <h1>👑 لوحة تحكم عبدالإله</h1>
      <span class="status-tag">الحماية الملكية نشطة ✅</span>
    </div>
    <div style="display: flex; gap: 10px;">
      <button class="btn btn-outline" onclick="exportData()">📥 حفظ نسخة احتياطية</button>
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
      <div class="label">المشتركين المفعلين</div>
    </div>
    <div class="stat-card">
      <div class="num" id="statTotal">0</div>
      <div class="label">إجمالي الأكواد</div>
    </div>
    <div class="stat-card">
      <div class="num" id="statRejected">0</div>
      <div class="label">المقفلين / المحظورين</div>
    </div>
  </div>

  <div class="actions-bar">
    <button class="btn btn-gold" onclick="toggleGen()">➕ توليد كود باسم المشترك</button>
  </div>

  <div class="gen-box" id="genBox">
    <h3>توليد كود جديد لمشترك محدد</h3>
    <div class="gen-grid">
      <div>
        <label style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 5px;">اسم المشترك:</label>
        <input type="text" id="genClientName" class="input" placeholder="مثال: فيصل الحربي">
      </div>
      <div>
        <label style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 5px;">ملاحظة / مدة الاشتراك:</label>
        <input type="text" id="genNotes" class="input" placeholder="مثال: اشتراك شهر">
      </div>
      <div>
        <label style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 5px;">عدد الأكواد:</label>
        <input type="number" id="genCount" class="input" value="1" min="1" max="50">
      </div>
    </div>
    <div style="margin-top: 15px;">
      <button class="btn btn-gold" onclick="generateKeys()">توليد الكود الآن</button>
    </div>
    <div class="gen-results" id="genResults"></div>
  </div>

  <div class="table-card">
    <div class="table-header">
      <h2>سجل المشتركين والأجهزة (تحكم كامل)</h2>
      <input type="text" id="search" class="input" placeholder="بحث باسم المشترك أو الكود..." oninput="filterRows()" style="width: 280px;">
    </div>
    <table>
      <thead>
        <tr>
          <th>اسم المشترك</th>
          <th>كود التفعيل</th>
          <th>الحالة</th>
          <th>معلومات جهاز المشترك</th>
          <th>الملاحظات</th>
          <th>الإجراءات والتحكم</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">جاري تحميل المشتركين...</td></tr>
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">لا يوجد مشتركون حالياً، اضغط "توليد كود باسم المشترك" في الأعلى</td></tr>';
    return;
  }

  let rowsHtml = '';
  keys.forEach(k => {
    const acts = k.activations || [];
    const clientName = k.client_name || 'مشترك غير محدد';
    const notes = k.notes || '-';

    if (acts.length === 0) {
      rowsHtml += \`<tr>
        <td><span class="client-tag" onclick="editClient('\${k.key}', '\${clientName}', '\${notes}')">👤 \${clientName} ✏️</span></td>
        <td><span class="key-tag">\${k.key}</span></td>
        <td><span class="badge badge-unused">جاهز للاستخدام</span></td>
        <td>-</td>
        <td style="color: var(--text-muted); font-size: 13px;">\${notes}</td>
        <td>
          <button class="act-btn btn-copy" onclick="copyKey('\${k.key}')">📋 نسخ الكود</button>
          <button class="act-btn btn-del" onclick="deleteKey('\${k.key}')">حذف</button>
        </td>
      </tr>\`;
    } else {
      acts.forEach(a => {
        let badgeClass = 'badge-unused', badgeText = 'غير مستخدم';
        let actButtons = '';

        if (a.status === 'pending') {
          badgeClass = 'badge-pending'; badgeText = 'بانتظار الموافقة';
          actButtons = \`<button class="act-btn btn-approve" onclick="approveKey('\${k.key}', '\${a.device_id}')">موافقة ✅</button>
                        <button class="act-btn btn-lock" onclick="lockKey('\${k.key}', '\${a.device_id}')">رفض ❌</button>\`;
        } else if (a.status === 'approved') {
          badgeClass = 'badge-approved'; badgeText = 'شغال ومفعل ✅';
          actButtons = \`<button class="act-btn btn-lock" onclick="lockKey('\${k.key}', '\${a.device_id}')">🔒 قفل الأداة</button>\`;
        } else if (a.status === 'banned' || a.status === 'rejected') {
          badgeClass = 'badge-banned'; badgeText = 'مقفل وموقوف 🚫';
          actButtons = \`<button class="act-btn btn-unlock" onclick="unlockKey('\${k.key}', '\${a.device_id}')">🔓 فتح الأداة</button>\`;
        }

        rowsHtml += \`<tr>
          <td><span class="client-tag" onclick="editClient('\${k.key}', '\${clientName}', '\${notes}')">👤 \${clientName} ✏️</span></td>
          <td><span class="key-tag">\${k.key}</span></td>
          <td><span class="badge \${badgeClass}">\${badgeText}</span></td>
          <td><strong>\${a.device_name || 'iPhone'}</strong> (\${a.device_model || 'iOS'})</td>
          <td style="color: var(--text-muted); font-size: 13px;">\${notes}</td>
          <td>
            <button class="act-btn btn-copy" onclick="copyKey('\${k.key}')">📋 نسخ</button>
            \${actButtons}
            <button class="act-btn btn-del" onclick="deleteKey('\${k.key}')">حذف</button>
          </td>
        </tr>\`;
      });
    }
  });

  tbody.innerHTML = rowsHtml;
}

function copyKey(key) {
  navigator.clipboard.writeText(key);
  alert('تم نسخ الكود بنجاح: ' + key);
}

function toggleGen() {
  const box = document.getElementById('genBox');
  box.classList.toggle('show');
}

async function generateKeys() {
  const client_name = document.getElementById('genClientName').value;
  const notes = document.getElementById('genNotes').value;
  const count = document.getElementById('genCount').value;

  const res = await fetch('/api/admin/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name, notes, count: parseInt(count) })
  });
  const data = await res.json();
  const resBox = document.getElementById('genResults');
  resBox.style.display = 'block';
  resBox.innerHTML = '<strong>تم التوليد بنجاح للمشترك (' + (client_name || 'جديد') + '):</strong><br>' + data.keys.map(k => \`<span style="cursor:pointer;color:#d4af37;" onclick="copyKey('\${k}')">📋 \${k} (اضغط للنسخ)</span>\`).join('<br>');
  
  document.getElementById('genClientName').value = '';
  document.getElementById('genNotes').value = '';
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

async function lockKey(key, deviceId) {
  if (!confirm('هل أنت متأكد من قفل الأداة وإيقافها فوراً عن هذا المشترك؟')) return;
  await fetch('/api/admin/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function unlockKey(key, deviceId) {
  await fetch('/api/admin/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function editClient(key, currentName, currentNotes) {
  const newName = prompt('تعديل اسم المشترك:', currentName);
  if (newName === null) return;
  const newNotes = prompt('تعديل الملاحظات / مدة الاشتراك:', currentNotes);
  if (newNotes === null) return;

  await fetch('/api/admin/update-client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, client_name: newName, notes: newNotes })
  });
  loadData();
}

async function deleteKey(key) {
  if (!confirm('هل أنت متأكد من حذف هذا الكود نهائياً؟')) return;
  await fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
  });
  loadData();
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ keys: allKeys }, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", "abdulilah_subscribers_backup.json");
  dlAnchorElem.click();
}

function filterRows() {
  const q = document.getElementById('search').value.toLowerCase();
  const filtered = allKeys.filter(k => {
    if (k.key.toLowerCase().includes(q) || (k.client_name && k.client_name.toLowerCase().includes(q)) || (k.notes && k.notes.toLowerCase().includes(q))) return true;
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
