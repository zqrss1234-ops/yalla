const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// ==========================================
// 🔑 كلمة المرور للوحة التحكم (حصراً abod2026)
// ==========================================
const ADMIN_TOKEN = "abod2026";

// المسار السري الخاص بلوحة التحكم
const ADMIN_PATH = process.env.ADMIN_PATH || "abod-master-7788";

const DB_FILE = path.join(__dirname, 'database.json');

// الجيل الجديد V3: قفل شامل لجميع الأكواد السابقة نهائياً على جميع النسخ
const CURRENT_EPOCH = "V3_ABOD_PERMANENT_2026";

// الأكواد المدمجة (فارغة لضمان قفل جميع النسخ القديمة فوراً)
const INITIAL_KEYS = [];

// ==========================================
// 🛡️ التخزين السحابي الدائم (MongoDB Atlas)
// ==========================================
let memoryDB = { epoch: CURRENT_EPOCH, keys: INITIAL_KEYS, adminToken: ADMIN_TOKEN };
let isMongoActive = false;
let mongoCollection = null;

function loadLocalFileDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { epoch: CURRENT_EPOCH, keys: INITIAL_KEYS, adminToken: ADMIN_TOKEN };
    saveLocalDB(init);
    return init;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!parsed.keys) {
      parsed.keys = [];
    }
    if (parsed.epoch !== CURRENT_EPOCH) {
      console.log("🚨 [V3 RESET] تصفير وقفل جميع النسخ والأكواد السابقة نهائياً على الجميع!");
      parsed.keys = [];
      parsed.epoch = CURRENT_EPOCH;
      saveLocalDB(parsed);
    }
    return parsed;
  } catch (e) {
    return { epoch: CURRENT_EPOCH, keys: INITIAL_KEYS, adminToken: ADMIN_TOKEN };
  }
}

function saveLocalDB(data) {
  try {
    if (!data.epoch) data.epoch = CURRENT_EPOCH;
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error("[LOCAL DB SAVE ERROR]", err);
  }
}

memoryDB = loadLocalFileDB();

async function initMongoCloud() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("ℹ️ Running in local file storage mode.");
    return;
  }
  try {
    let MongoClient;
    try {
      MongoClient = require('mongodb').MongoClient;
    } catch (e) {
      return;
    }

    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 6000 });
    await client.connect();
    const db = client.db('yalla_suite');
    mongoCollection = db.collection('license_database');
    isMongoActive = true;
    console.log("✅ Successfully connected to MongoDB Atlas Cloud Database!");

    const remoteDoc = await mongoCollection.findOne({ _id: 'master_license_store' });
    if (remoteDoc) {
      if (remoteDoc.epoch !== CURRENT_EPOCH) {
        console.log("🚨 [MONGO V3 RESET] تصفير قاعدة بيانات MongoDB وقفل كل النسخ القديمة نهائياً!");
        await mongoCollection.updateOne(
          { _id: 'master_license_store' },
          { $set: { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
        memoryDB = { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN };
        saveLocalDB(memoryDB);
      } else if (Array.isArray(remoteDoc.keys)) {
        memoryDB = { epoch: CURRENT_EPOCH, keys: remoteDoc.keys, adminToken: ADMIN_TOKEN };
        saveLocalDB(memoryDB);
      }
    } else {
      await mongoCollection.updateOne(
        { _id: 'master_license_store' },
        { $set: { _id: 'master_license_store', epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error("⚠️ MongoDB connection error:", err.message);
    isMongoActive = false;
  }
}

function loadDB() {
  return memoryDB;
}

function saveDB(data) {
  memoryDB = data;
  saveLocalDB(data);
  if (isMongoActive && mongoCollection) {
    mongoCollection.updateOne(
      { _id: 'master_license_store' },
      { $set: { keys: data.keys, adminToken: ADMIN_TOKEN, updatedAt: new Date().toISOString() } },
      { upsert: true }
    ).catch(err => console.error("[MONGO SAVE ERROR]", err.message));
  }
}

initMongoCloud();

// ==========================================
// 🛡️ حماية لوحة التحكم بكلمة المرور abod2026
// ==========================================
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'] || req.query.token;
  const token = authHeader ? authHeader.replace('Bearer ', '').trim() : '';

  if (token === ADMIN_TOKEN || token === (process.env.ADMIN_TOKEN || "abod2026")) {
    return next();
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "🚫 يرجى إدخال كلمة المرور" });
  }

  return res.status(403).json({ success: false, message: "⛔ كلمة المرور غير صحيحة" });
}

// -------------------------------------------------------------
// 1. معالج فحص وتفعيل الأكواد (قفل فوري لأي نسخة سابقة)
// -------------------------------------------------------------
function handleValidate(req, res) {
  const key = req.body.key;
  const deviceId = req.body.deviceId || req.body.device_id;
  const deviceName = req.body.deviceName || req.body.device_name || 'iPhone';
  const deviceModel = req.body.deviceModel || req.body.device_model || 'iOS Device';
  const iosVersion = req.body.iosVersion || req.body.ios_version || '';
  const bundleId = req.body.bundleId || req.body.bundle_id || '';

  if (!key || !deviceId) {
    return res.json({ valid: false, message: "🚫 بيانات التفعيل ناقصة" });
  }

  const cleanKey = key.trim().toUpperCase();

  // قفل فوري لأي كود قديم يبدأ بـ YS-
  if (cleanKey.startsWith('YS-')) {
    return res.json({ 
      valid: false, 
      needs_approval: false, 
      message: "🚫 تم إيقاف وقفل جميع النسخ السابقة نهائياً. تواصل مع عبدالإله للحصول على كود جديد" 
    });
  }

  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key && k.key.trim().toUpperCase() === cleanKey);

  // إذا لم يكن الكود موجوداً في الأكواد الجديدة المولدة، يتم قفل النسخة فوراً
  if (!keyObj) {
    return res.json({ 
      valid: false, 
      needs_approval: false, 
      message: "🚫 كود التفعيل غير صالح أو ملغي، تواصل مع عبدالإله لتفعيل نسختك بكود جديد" 
    });
  }

  if (!keyObj.activations) {
    keyObj.activations = [];
  }

  let thisDevice = keyObj.activations.find(a => a.device_id === deviceId);

  if (thisDevice) {
    if (thisDevice.status === 'rejected' || thisDevice.status === 'blocked') {
      return res.json({ 
        valid: false, 
        message: "🚫 تم إيقاف وقفل الأداة عن هذا الجهاز من قِبل الإدارة" 
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

  // منع استخدام الكود على أكثر من جهاز
  const approvedOnOtherDevice = keyObj.activations.find(a => a.status === 'approved' && a.device_id !== deviceId);
  if (approvedOnOtherDevice) {
    return res.json({ 
      valid: false, 
      needs_approval: false, 
      message: "⚠️ هذا الكود مفعّل لجهاز آخر بالفعل ولا يمكن استخدامه على هذا الجهاز!" 
    });
  }

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
}

// -------------------------------------------------------------
// 1.1 معالج فحص النسخ الـ 16 (Check Device Handler)
// -------------------------------------------------------------
function handleCheckDevice(req, res) {
  const deviceId = req.body.deviceId || req.body.device_id || req.query.deviceId || req.query.device_id;
  const deviceName = req.body.deviceName || req.body.device_name || 'iPhone';
  const deviceModel = req.body.deviceModel || req.body.device_model || 'iOS Device';
  const iosVersion = req.body.iosVersion || req.body.ios_version || '';

  if (!deviceId) {
    return res.json({ valid: false, approved: false, message: "معرف الجهاز مفقود" });
  }

  const db = loadDB();
  for (const k of (db.keys || [])) {
    const act = (k.activations || []).find(a => a.device_id === deviceId);
    if (act) {
      if (act.status === 'blocked' || act.status === 'rejected') {
        return res.json({ valid: false, approved: false, message: "🚫 تم قفل الأداة عن هذا الجهاز" });
      }
      if (act.status === 'approved') {
        act.last_seen = new Date().toISOString();
        act.device_name = deviceName;
        act.device_model = deviceModel;
        act.ios_version = iosVersion;
        saveDB(db);
        return res.json({ 
          valid: true, 
          approved: true,
          key: k.key, 
          message: "👑 تم تفعيل النسخة المكررة تلقائياً بنجاح!" 
        });
      }
      if (act.status === 'pending') {
        return res.json({ valid: false, approved: false, needs_approval: true, message: "⏳ بانتظار الموافقة" });
      }
    }
  }

  return res.json({ 
    valid: false, 
    approved: false, 
    key: null, 
    message: "🚫 الأداة مقفلة! انتهت صلاحية الأكواد السابقة، يرجى التفعيل بكود جديد من النسخة الأساسية" 
  });
}

// تسجيل مسارات الفحص بكافة التسميات لضمان قفل كل النسخ الـ 16
app.post('/api/validate', handleValidate);
app.post('/api/verify', handleValidate);
app.post('/api/license', handleValidate);

app.post('/api/check_device', handleCheckDevice);
app.post('/api/check-device', handleCheckDevice);
app.post('/api/device_check', handleCheckDevice);
app.post('/api/check', handleCheckDevice);

app.get('/api/check_device', handleCheckDevice);
app.get('/api/check-device', handleCheckDevice);

// -------------------------------------------------------------
// 2. Admin APIs: جلب وإدارة وتوليد الأكواد
// -------------------------------------------------------------
app.get('/api/admin/keys', requireAdminAuth, (req, res) => {
  const db = loadDB();
  const keys = db.keys || [];
  
  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  
  keys.forEach(k => {
    (k.activations || []).forEach(a => {
      if (a.status === 'approved') approvedCount++;
      else if (a.status === 'pending') pendingCount++;
      else if (a.status === 'blocked' || a.status === 'rejected') rejectedCount++;
    });
  });

  res.json({
    success: true,
    keys: keys,
    pendingCount: pendingCount,
    cloud_active: isMongoActive,
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
  const count = Math.min(Math.max(parseInt(req.body.count) || 1, 1), 100);
  const note = req.body.note || '';
  const db = loadDB();
  const generated = [];

  for (let i = 0; i < count; i++) {
    const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = 'ABOD-V3-' + part() + '-' + part();
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

app.post('/api/admin/approve', requireAdminAuth, (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key === key);
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
  const keyObj = (db.keys || []).find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) {
      act.status = 'rejected';
    }
    saveDB(db);
  }
  res.json({ success: true, message: "تم رفض الجهاز" });
});

app.post('/api/admin/lock', requireAdminAuth, (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key === key);
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
  const keyObj = (db.keys || []).find(k => k.key === key);
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
  db.keys = (db.keys || []).filter(k => k.key !== key);
  saveDB(db);
  res.json({ success: true, message: "تم حذف الكود نهائياً" });
});

app.post('/api/admin/reset', requireAdminAuth, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key === key);
  if (keyObj) {
    keyObj.activations = [];
    saveDB(db);
  }
  res.json({ success: true, message: "تم مسح ارتباط الجهاز وإتاحة الكود مجدداً" });
});

// قفل وتصفير شامل لجميع الأكواد والأجهزة فورياً
app.post('/api/admin/purge_all', requireAdminAuth, async (req, res) => {
  const db = loadDB();
  db.keys = [];
  db.epoch = CURRENT_EPOCH;
  saveDB(db);
  if (isMongoActive && mongoCollection) {
    try {
      await mongoCollection.updateOne(
        { _id: 'master_license_store' },
        { $set: { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (e) {
      console.error("[MONGO PURGE ERROR]", e);
    }
  }
  res.json({ success: true, message: "🚨 تم قفل وتصفير جميع الأكواد بنجاح! جميع النسخ مقفلة الآن." });
});

// تصدير نسخة احتياطية
app.get('/api/admin/backup', requireAdminAuth, (req, res) => {
  const db = loadDB();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=keys_backup_' + Date.now() + '.json');
  res.send(JSON.stringify(db, null, 2));
});

// استيراد نسخة احتياطية
app.post('/api/admin/restore', requireAdminAuth, (req, res) => {
  const incomingData = req.body;
  if (!incomingData || !Array.isArray(incomingData.keys)) {
    return res.status(400).json({ success: false, message: "ملف النسخة الاحتياطية غير صالح" });
  }
  const db = loadDB();
  const existingKeyMap = new Map();
  (db.keys || []).forEach(k => existingKeyMap.set(k.key, k));

  let added = 0;
  incomingData.keys.forEach(incomingKey => {
    if (incomingKey && incomingKey.key && !incomingKey.key.startsWith('YS-') && !existingKeyMap.has(incomingKey.key)) {
      db.keys.push(incomingKey);
      added++;
    }
  });

  saveDB(db);
  res.json({ success: true, message: 'تم استعادة ودمج ' + added + ' كود بنجاح!' });
});

// صفحة 404 للمسار الرئيسي (Stealth Mode)
app.get('/', (req, res) => {
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family: sans-serif; padding: 40px; background: #fff; color: #222;"><h1>404 Not Found</h1><p>The requested URL / was not found on this server.</p><hr><address style="font-size: 13px; color: #777;">Apache/2.4.52 (Ubuntu) Server</address></body></html>');
});

// -------------------------------------------------------------
// 👑 صفحة لوحة التحكم المشفرة والآمنة 100%
// -------------------------------------------------------------
app.get('/' + ADMIN_PATH, (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 لوحة تحكم عبدالإله | إدارة التراخيص</title>
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
  .logo-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
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

  /* نافذة الدخول المشفرة (لا ثغرات، لا كلمة مرور مكشوفة) */
  #loginModal { position: fixed; inset: 0; background: rgba(0,0,0,0.96); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
  #loginBox { background: var(--card-bg); padding: 40px; border-radius: 24px; border: 1px solid var(--gold); width: 380px; text-align: center; box-shadow: 0 10px 40px rgba(212, 175, 55, 0.25); }
</style>
</head>
<body>

<div id="loginModal">
  <div id="loginBox">
    <h2 style="color:var(--gold); margin-bottom:10px; font-size:24px;">👑 لوحة تحكم عبدالإله</h2>
    <p style="color:var(--text-muted); font-size:13.5px; margin-bottom:22px;">تسجيل الدخول المشفر للأدمن</p>
    <input type="password" id="adminTokenInput" class="input" placeholder="كلمة المرور..." style="width:100%; margin-bottom:18px; text-align:center; font-size:18px;" onkeydown="if(event.key==='Enter') login()">
    <button class="btn btn-gold" onclick="login()" style="width:100%; justify-content:center; font-size:16px;">دخول 🔓</button>
  </div>
</div>

<div class="container" id="mainDashboard" style="display:none;">
  <header>
    <div class="logo-title">
      <h1>👑 لوحة تحكم عبدالإله الملكية</h1>
      <span class="status-tag" id="cloudStatusTag">السيرفر محمي ومشفر 100% 🔒</span>
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-outline" style="color:var(--red); border-color:rgba(231,76,60,0.6); background:rgba(231,76,60,0.12); font-weight:bold;" onclick="purgeAllKeysPermanently()">🚨 قفل وتصفير جميع النسخ نهائياً</button>
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
    <button class="btn btn-gold" onclick="toggleGen()">➕ توليد أكواد جديدة للعملاء</button>
    <span style="color:var(--text-muted); font-size:13px; margin-right:auto;">المسار السري: <code style="color:var(--gold-light); background:#000; padding:3px 8px; border-radius:4px;">/` + ADMIN_PATH + `</code></span>
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
      <h2>قائمة الأكواد والتفعيلات المسجلة</h2>
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
var authToken = localStorage.getItem('ys_admin_token') || '';
var allKeys = [];

localStorage.removeItem('ys_persistent_vault');
localStorage.removeItem('ys_persistent_vault_v2');

if (authToken) {
  testAuth(authToken, true);
}

function login() {
  var input = document.getElementById('adminTokenInput');
  var token = input ? input.value.trim() : '';
  if (!token) {
    alert('الرجاء كتابة كلمة المرور');
    return;
  }
  testAuth(token, false);
}

function logout() {
  localStorage.removeItem('ys_admin_token');
  authToken = '';
  location.reload();
}

function testAuth(token, isAutoCheck) {
  fetch('/api/admin/keys', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(res) {
      if (res.ok) {
        authToken = token;
        localStorage.setItem('ys_admin_token', token);
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('mainDashboard').style.display = 'block';
        loadData();
      } else {
        if (!isAutoCheck) {
          alert('⛔ كلمة المرور غير صحيحة');
        }
      }
    })
    .catch(function() {
      if (!isAutoCheck) {
        alert('حدث خطأ أثناء الاتصال بالسيرفر');
      }
    });
}

function loadData() {
  fetch('/api/admin/keys', { headers: { 'Authorization': 'Bearer ' + authToken } })
    .then(function(res) {
      if (!res.ok) { logout(); return; }
      return res.json();
    })
    .then(function(data) {
      if (!data) return;
      allKeys = data.keys || [];

      document.getElementById('statPending').textContent = (data.stats && data.stats.pending) || 0;
      document.getElementById('statApproved').textContent = (data.stats && data.stats.approved) || 0;
      document.getElementById('statTotal').textContent = allKeys.length;
      document.getElementById('statRejected').textContent = (data.stats && data.stats.rejected) || 0;

      var cloudTag = document.getElementById('cloudStatusTag');
      if (data.cloud_active) {
        cloudTag.textContent = '🟢 قاعدة البيانات السحابية (MongoDB) متصلة ودائمة 100%';
        cloudTag.style.background = 'rgba(46, 204, 113, 0.15)';
        cloudTag.style.color = 'var(--green)';
        cloudTag.style.borderColor = 'rgba(46, 204, 113, 0.3)';
      } else {
        cloudTag.textContent = '🟢 التخزين المحلي نشط ومحمي 100%';
        cloudTag.style.background = 'rgba(102, 252, 241, 0.15)';
        cloudTag.style.color = 'var(--accent)';
        cloudTag.style.borderColor = 'rgba(102, 252, 241, 0.3)';
      }

      renderTable(allKeys);
    })
    .catch(function(err) { console.error(err); });
}

function renderTable(keys) {
  var tbody = document.getElementById('tableBody');
  if (!keys || keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 35px;">لا توجد أكواد حالياً، اضغط "توليد أكواد جديدة للعملاء" في الأعلى</td></tr>';
    return;
  }

  var rowsHtml = '';
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var acts = k.activations || [];
    if (acts.length === 0) {
      rowsHtml += '<tr>' +
        '<td><span class="key-tag">' + k.key + '</span> <button class="act-btn btn-copy" data-key="' + k.key + '" onclick="copyText(this.dataset.key)">نسخ الكود</button></td>' +
        '<td><span class="badge badge-unused">جاهز للاستخدام</span></td>' +
        '<td><span style="color:var(--text-muted);">' + (k.note ? '📝 ' + k.note : 'ـ') + '</span></td>' +
        '<td><span style="color:var(--text-muted);">-</span></td>' +
        '<td>' + new Date(k.created_at).toLocaleDateString('ar-SA') + '</td>' +
        '<td><button class="act-btn btn-del" data-key="' + k.key + '" onclick="deleteKey(this.dataset.key)">حذف الكود</button></td>' +
      '</tr>';
    } else {
      for (var j = 0; j < acts.length; j++) {
        var a = acts[j];
        var badgeClass = 'badge-unused', badgeText = 'غير مستخدم';
        var actButtons = '';

        if (a.status === 'pending') {
          badgeClass = 'badge-pending'; badgeText = 'بانتظار الموافقة';
          actButtons = '<button class="act-btn btn-approve" data-key="' + k.key + '" data-dev="' + a.device_id + '" onclick="approveKey(this.dataset.key, this.dataset.dev)">موافقة</button>' +
                        '<button class="act-btn btn-reject" data-key="' + k.key + '" data-dev="' + a.device_id + '" onclick="rejectKey(this.dataset.key, this.dataset.dev)">رفض</button>';
        } else if (a.status === 'approved') {
          badgeClass = 'badge-approved'; badgeText = 'مفعل وشغال ✅';
          actButtons = '<button class="act-btn btn-revoke" data-key="' + k.key + '" data-dev="' + a.device_id + '" onclick="lockKey(this.dataset.key, this.dataset.dev)">قفل الأداة</button>' +
                        '<button class="act-btn btn-reset" data-key="' + k.key + '" onclick="resetKey(this.dataset.key)">إلغاء ربط الجهاز</button>';
        } else if (a.status === 'rejected' || a.status === 'blocked') {
          badgeClass = 'badge-rejected'; badgeText = 'مقفل / محظور 🚫';
          actButtons = '<button class="act-btn btn-approve" data-key="' + k.key + '" data-dev="' + a.device_id + '" onclick="unlockKey(this.dataset.key, this.dataset.dev)">إعادة تفعيل</button>' +
                        '<button class="act-btn btn-reset" data-key="' + k.key + '" onclick="resetKey(this.dataset.key)">إلغاء ربط الجهاز</button>';
        }

        var devUUID = a.device_id || '';
        var uuidDisplay = devUUID ? (
          '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
            '<span class="key-tag" style="color:var(--accent); font-size:11.5px; border:1px solid rgba(102,252,241,0.25);">' + devUUID + '</span>' +
            '<button class="act-btn btn-copy" data-txt="' + devUUID + '" onclick="copyText(this.dataset.txt)">نسخ UUID</button>' +
          '</div>'
        ) : '<span style="color:var(--text-muted);">-</span>';

        rowsHtml += '<tr>' +
          '<td><span class="key-tag">' + k.key + '</span> <button class="act-btn btn-copy" data-key="' + k.key + '" onclick="copyText(this.dataset.key)">نسخ الكود</button></td>' +
          '<td><span class="badge ' + badgeClass + '">' + badgeText + '</span></td>' +
          '<td><strong>' + (a.device_name || 'iPhone') + '</strong><br><span style="font-size:12px; color:var(--text-muted);">' + (a.device_model || 'iOS') + (a.ios_version ? ' • iOS ' + a.ios_version : '') + '</span></td>' +
          '<td>' + uuidDisplay + '</td>' +
          '<td>' + new Date(k.created_at).toLocaleDateString('ar-SA') + (a.last_seen ? '<br><span style="font-size:11.5px; color:var(--green);">متصل ' + new Date(a.last_seen).toLocaleTimeString('ar-SA') + '</span>' : '') + '</td>' +
          '<td>' + actButtons + ' <button class="act-btn btn-del" data-key="' + k.key + '" onclick="deleteKey(this.dataset.key)">حذف</button></td>' +
        '</tr>';
      }
    }
  }

  tbody.innerHTML = rowsHtml;
}

function toggleGen() {
  var box = document.getElementById('genBox');
  box.classList.toggle('show');
}

function generateKeys() {
  var count = document.getElementById('genCount').value;
  var note = document.getElementById('genNote').value;
  fetch('/api/admin/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ count: parseInt(count), note: note })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    var resBox = document.getElementById('genResults');
    resBox.style.display = 'block';
    resBox.innerHTML = '<strong>👑 تم توليد الأكواد بنجاح:</strong><br>' + data.keys.join('<br>');
    loadData();
  });
}

function approveKey(key, deviceId) {
  fetch('/api/admin/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key: key, deviceId: deviceId })
  }).then(function() { loadData(); });
}

function rejectKey(key, deviceId) {
  fetch('/api/admin/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key: key, deviceId: deviceId })
  }).then(function() { loadData(); });
}

function lockKey(key, deviceId) {
  fetch('/api/admin/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key: key, deviceId: deviceId })
  }).then(function() { loadData(); });
}

function unlockKey(key, deviceId) {
  fetch('/api/admin/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key: key, deviceId: deviceId })
  }).then(function() { loadData(); });
}

function deleteKey(key) {
  if (!confirm('هل أنت متأكد من حذف هذا الكود نهائياً؟')) return;
  fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key: key })
  }).then(function() { loadData(); });
}

function resetKey(key) {
  if (!confirm('هل تريد فك ارتباط الجهاز بهذا الكود ليمكن تفعيله على جهاز جديد؟')) return;
  fetch('/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key: key })
  }).then(function() { loadData(); });
}

function purgeAllKeysPermanently() {
  if (!confirm('هل أنت متأكد من قفل وتصفير جميع النسخ والأكواد السابقة نهائياً؟')) return;
  fetch('/api/admin/purge_all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    alert(data.message || 'تم قفل وتصفير جميع الأكواد بنجاح!');
    loadData();
  })
  .catch(function() {
    alert('حدث خطأ أثناء الاتصال بالسيرفر');
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(function() {
    alert('تم نسخ الكود بنجاح: ' + text);
  });
}

function downloadBackup() {
  window.location.href = '/api/admin/backup?token=' + encodeURIComponent(authToken);
}

function triggerRestore() {
  document.getElementById('restoreFileInput').click();
}

function handleRestoreFile(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var json = JSON.parse(e.target.result);
      fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
        body: JSON.stringify(json)
      })
      .then(function(res) { return res.json(); })
      .then(function(result) {
        alert(result.message || 'تمت الاستعادة بنجاح');
        loadData();
      });
    } catch (err) {
      alert('ملف النسخة الاحتياطية غير صالح');
    }
  };
  reader.readAsText(file);
}

function filterRows() {
  var q = document.getElementById('search').value.toLowerCase();
  var filtered = allKeys.filter(function(k) {
    if (k.key.toLowerCase().indexOf(q) !== -1) return true;
    return (k.activations || []).some(function(a) {
      return (a.device_name && a.device_name.toLowerCase().indexOf(q) !== -1) ||
             (a.device_id && a.device_id.toLowerCase().indexOf(q) !== -1);
    });
  });
  renderTable(filtered);
}
</script>
</body>
</html>`);
});

// صفحة 404 للمسارات غير المعروفة (Stealth Mode)
app.use((req, res) => {
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family: sans-serif; padding: 40px; background: #fff; color: #222;"><h1>404 Not Found</h1><p>The requested URL ' + req.originalUrl + ' was not found on this server.</p><hr><address style="font-size: 13px; color: #777;">Apache/2.4.52 (Ubuntu) Server</address></body></html>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running securely on port ' + PORT);
});
