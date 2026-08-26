const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

// تحميل أو إنشاء قاعدة البيانات
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
// 1. مسار فحص وتفعيل الكود (قفل صارم: 1 Key = 1 Device Only)
// -------------------------------------------------------------
app.post('/api/validate', (req, res) => {
  const { key, deviceId, deviceName, deviceModel, iosVersion, bundleId } = req.body;

  if (!key || !deviceId) {
    return res.status(400).json({ valid: false, message: "Missing key or deviceId" });
  }

  const db = loadDB();
  const keyObj = db.keys.find(k => k.key.trim().toUpperCase() === key.trim().toUpperCase());

  if (!keyObj) {
    return res.json({ valid: false, message: "كود التفعيل غير صالح" });
  }

  if (!keyObj.activations) {
    keyObj.activations = [];
  }

  // البحث عن جهاز موافق عليه مسبقاً لهذا الكود
  const approvedActivation = keyObj.activations.find(a => a.status === 'approved');

  if (approvedActivation) {
    // 🔒 قفل الثغرة: إذا كان الكود مفعل لجهاز آخر مختلف -> ارفض فوراً!
    if (approvedActivation.device_id !== deviceId) {
      return res.json({ 
        valid: false, 
        needs_approval: false,
        message: "⚠️ هذا الكود مفعّل لجهاز آخر ولا يمكن مشاركته!" 
      });
    }

    // إذا كان نفس الجهاز المعتمد الأصلي -> اسمح له بالدخول
    return res.json({ valid: true, message: "تم التحقق بنجاح" });
  }

  // فحص هل هذا الجهاز قيد الانتظار
  let thisDevice = keyObj.activations.find(a => a.device_id === deviceId);
  if (!thisDevice) {
    thisDevice = {
      device_id: deviceId,
      device_name: deviceName || 'iPhone',
      device_model: deviceModel || 'iOS Device',
      ios_version: iosVersion || '',
      bundle_id: bundleId || '',
      status: 'pending',
      requested_at: new Date().toISOString()
    };
    keyObj.activations.push(thisDevice);
    saveDB(db);
  }

  if (thisDevice.status === 'rejected') {
    return res.json({ valid: false, message: "تم رفض هذا الجهاز من قِبل الإدارة" });
  }

  return res.json({ 
    valid: false, 
    needs_approval: true, 
    message: "تم إرسال الطلب، بانتظار موافقة الإدارة من لوحة التحكم" 
  });
});

// -------------------------------------------------------------
// 2. مسارات لوحة التحكم (Admin API)
// -------------------------------------------------------------
app.post('/api/admin/keys', (req, res) => {
  const db = loadDB();
  const keys = db.keys || [];
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;

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
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    keyObj.activations.forEach(a => {
      if (a.device_id === deviceId) {
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
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === deviceId);
    if (act) act.status = 'rejected';
    saveDB(db);
  }
  res.json({ success: true });
});

app.post('/api/admin/revoke', (req, res) => {
  const { key, deviceId } = req.body;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === deviceId);
    if (act) act.status = 'rejected';
    saveDB(db);
  }
  res.json({ success: true });
});

app.post('/api/admin/delete', (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  db.keys = db.keys.filter(k => k.key !== key);
  saveDB(db);
  res.json({ success: true });
});

// الصفحة الرئيسية (Dashboard)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
