const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.set('trust proxy', true);

// ==========================================
// 🛡️ هيدرز منع الكاش نهائياً (Anti-Caching)
// ==========================================
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================
// 🔑 كلمة المرور للوحة التحكم (حصراً abod2026)
// ==========================================
const ADMIN_TOKEN = "abod2026";
const ADMIN_PATH = process.env.ADMIN_PATH || "abod-master-7788";
const JWT_SECRET_SALT = process.env.JWT_SECRET || "ABOD_V4_SECURE_SALT_998877665544332211";

const DB_FILE = path.join(__dirname, 'database.json');
const CURRENT_EPOCH = "V4_ABOD_HARD_RESET_2026";
const INITIAL_KEYS = [];

// ==========================================
// 🛡️ التخزين السحابي الدائم (MongoDB Atlas)
// ==========================================
let memoryDB = { epoch: CURRENT_EPOCH, keys: INITIAL_KEYS, adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
let isMongoActive = false;
let mongoCollection = null;

function loadLocalFileDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { epoch: CURRENT_EPOCH, keys: INITIAL_KEYS, adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
    saveLocalDB(init);
    return init;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!parsed.keys) parsed.keys = [];
    if (parsed.epoch !== CURRENT_EPOCH) {
      console.log("🚨 [V4 HARD RESET] تصفير وقفل شامل لكافة الأكواد والـ HWID السابقة!");
      parsed.keys = [];
      parsed.epoch = CURRENT_EPOCH;
      parsed.secretSalt = JWT_SECRET_SALT;
      saveLocalDB(parsed);
    }
    return parsed;
  } catch (e) {
    return { epoch: CURRENT_EPOCH, keys: INITIAL_KEYS, adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
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
  if (!mongoUri) return;
  try {
    let MongoClient;
    try { MongoClient = require('mongodb').MongoClient; } catch (e) { return; }
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 6000 });
    await client.connect();
    const db = client.db('yalla_suite');
    mongoCollection = db.collection('license_database');
    isMongoActive = true;
    console.log("✅ Successfully connected to MongoDB Atlas Cloud Database!");

    const remoteDoc = await mongoCollection.findOne({ _id: 'master_license_store' });
    if (remoteDoc) {
      if (remoteDoc.epoch !== CURRENT_EPOCH) {
        console.log("🚨 [MONGO V4 HARD RESET] تصفير قاعدة بيانات MongoDB كلياً وقفل كل النسخ القديمة نهائياً!");
        await mongoCollection.updateOne(
          { _id: 'master_license_store' },
          { $set: { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
        memoryDB = { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
        saveLocalDB(memoryDB);
      } else if (Array.isArray(remoteDoc.keys)) {
        memoryDB = { epoch: CURRENT_EPOCH, keys: remoteDoc.keys, adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
        saveLocalDB(memoryDB);
      }
    } else {
      await mongoCollection.updateOne(
        { _id: 'master_license_store' },
        { $set: { _id: 'master_license_store', epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT, updatedAt: new Date().toISOString() } },
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
      { $set: { keys: data.keys, adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT, updatedAt: new Date().toISOString() } },
      { upsert: true }
    ).catch(err => console.error("[MONGO SAVE ERROR]", err.message));
  }
}

initMongoCloud();

function buildLockedResponse(msg) {
  return {
    status: "blocked",
    message: msg || "🚫 تم إيقاف وقفل الأداة من الإدارة نهائياً",
    valid: false,
    approved: false,
    active: false,
    success: false,
    allowed: false,
    licensed: false,
    error: "REVOKED",
    code: 403,
    key: null,
    needs_approval: false,
    needsApproval: false
  };
}

function normalizeToken(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48))
    .replace(/[\u06F0-\u06F9]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x06F0 + 48))
    .replace(/[-\s_]/g, '');
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '').trim();
  } else if (req.query && (req.query.token || req.query.pass || req.query.password)) {
    token = String(req.query.token || req.query.pass || req.query.password).trim();
  } else if (req.body && (req.body.token || req.body.pass || req.body.password)) {
    token = String(req.body.token || req.body.pass || req.body.password).trim();
  }

  const norm = normalizeToken(token);
  // قبول كلمة المرور abod2026 بكافة أشكالها (حروف كبيرة، صغيرة، أرقام عربية، مسافات)
  if (norm === "abod2026" || token === ADMIN_TOKEN || token === (process.env.ADMIN_TOKEN || "").trim()) {
    return next();
  }

  return res.status(403).json({ success: false, message: "🚫 غير مصرح لك بالدخول" });
}

function extractRequestParams(req) {
  const body = req.body || {};
  const query = req.query || {};

  const key = body.key || body.license_key || body.licenseKey || query.key || query.license_key || query.licenseKey;
  const deviceId = body.deviceId || body.device_id || body.udid || body.hwid || query.deviceId || query.device_id || query.udid || query.hwid;
  const deviceName = body.deviceName || body.device_name || query.deviceName || query.device_name || "Unknown Device";
  const deviceModel = body.deviceModel || body.device_model || query.deviceModel || query.device_model || "iOS Device";
  const iosVersion = body.iosVersion || body.ios_version || query.iosVersion || query.ios_version || "";
  const bundleId = body.bundleId || body.bundle_id || query.bundleId || query.bundle_id || "";

  return { key, deviceId, deviceName, deviceModel, iosVersion, bundleId };
}

function generateNewKeyString() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = () => {
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
  };
  return 'ABOD-' + segment() + '-' + segment() + '-' + segment();
}

// -------------------------------------------------------------
// معالج تفعيل الأكواد الصارم (Validate Key Handler)
// -------------------------------------------------------------
function handleValidate(req, res) {
  const { key, deviceId, deviceName, deviceModel, iosVersion, bundleId } = extractRequestParams(req);

  if (!key || !deviceId) {
    return res.json(buildLockedResponse("Key Expired or Invalid"));
  }

  const cleanKey = String(key).trim().toUpperCase();

  if (!cleanKey.startsWith('ABOD-')) {
    return res.json(buildLockedResponse("Key Expired or Invalid"));
  }

  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key && k.key.trim().toUpperCase() === cleanKey);

  if (!keyObj) {
    return res.json(buildLockedResponse("Key Expired or Invalid"));
  }

  // إذا تم قفل الكود من الإدارة يدوياً
  if (keyObj.status === 'blocked') {
    return res.json(buildLockedResponse("🚫 تم إيقاف وقفل هذا الكود نهائياً من الإدارة"));
  }

  if (!keyObj.activations) {
    keyObj.activations = [];
  }

  let thisDevice = keyObj.activations.find(a => a.device_id === deviceId);

  if (thisDevice) {
    if (thisDevice.status === 'rejected' || thisDevice.status === 'blocked') {
      return res.json(buildLockedResponse("🚫 تم قفل الأداة عن هذا الجهاز من قِبل الإدارة"));
    }
    
    if (thisDevice.status === 'approved') {
      thisDevice.last_seen = new Date().toISOString();
      thisDevice.device_name = deviceName;
      thisDevice.device_model = deviceModel;
      thisDevice.ios_version = iosVersion;
      saveDB(db);
      return res.json({ 
        valid: true, 
        approved: true, 
        active: true, 
        success: true, 
        allowed: true, 
        licensed: true, 
        status: "approved", 
        key: cleanKey, 
        owner_name: keyObj.owner_name || "",
        message: "✅ تم التحقق وتفعيل الجهاز بنجاح" 
      });
    }

    return res.json({ 
      valid: false, 
      approved: false, 
      active: false, 
      success: false, 
      needs_approval: true, 
      needsApproval: true, 
      status: "pending", 
      message: "⏳ بانتظار الموافقة على جهازك من لوحة التحكم" 
    });
  }

  // ربط الكود بجهاز واحد فقط
  const approvedOnOtherDevice = keyObj.activations.find(a => a.status === 'approved' && a.device_id !== deviceId);
  if (approvedOnOtherDevice) {
    return res.json(buildLockedResponse("⚠️ هذا الكود مفعّل لجهاز آخر بالفعل ولا يمكن استخدامه على هذا الجهاز!"));
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
    approved: true, 
    active: true, 
    success: true, 
    allowed: true, 
    licensed: true, 
    status: "approved", 
    key: cleanKey, 
    owner_name: keyObj.owner_name || "",
    message: "👑 تم تفعيل وحفظ جهازك بنجاح!" 
  });
}

// -------------------------------------------------------------
// معالج فحص النسخ المكررة والفرعية (Check Device Handler)
// -------------------------------------------------------------
function handleCheckDevice(req, res) {
  const { deviceId, deviceName, deviceModel, iosVersion } = extractRequestParams(req);

  if (!deviceId) {
    return res.json(buildLockedResponse("Key Expired or Invalid"));
  }

  const db = loadDB();
  for (const k of (db.keys || [])) {
    if (k.status === 'blocked') continue;
    const act = (k.activations || []).find(a => a.device_id === deviceId);
    if (act) {
      if (act.status === 'blocked' || act.status === 'rejected') {
        return res.json(buildLockedResponse("🚫 تم قفل الأداة عن هذا الجهاز"));
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
          active: true, 
          success: true, 
          allowed: true, 
          licensed: true, 
          status: "approved", 
          key: k.key, 
          owner_name: k.owner_name || "",
          message: "👑 تم تفعيل النسخة المكررة تلقائياً بنجاح!" 
        });
      }
      if (act.status === 'pending') {
        return res.json({ 
          valid: false, 
          approved: false, 
          needs_approval: true, 
          needsApproval: true, 
          status: "pending", 
          message: "⏳ بانتظار الموافقة" 
        });
      }
    }
  }

  return res.json(buildLockedResponse("Key Expired or Invalid"));
}

const validateRoutes = [
  '/api/validate', '/validate', '/api/v1/validate',
  '/api/license', '/license', '/api/v1/license',
  '/api/verify', '/verify', '/api/v1/verify',
  '/api/activate', '/activate', '/api/v1/activate',
  '/api/auth', '/auth', '/api/v1/auth'
];
const checkDeviceRoutes = [
  '/api/check_device', '/check_device', '/api/v1/check_device',
  '/api/check-device', '/check-device', '/api/v1/check-device',
  '/api/device_check', '/device_check',
  '/api/device-check', '/device-check',
  '/api/check', '/check', '/api/v1/check',
  '/api/status', '/status'
];

validateRoutes.forEach(r => {
  app.post(r, handleValidate);
  app.get(r, handleValidate);
});

checkDeviceRoutes.forEach(r => {
  app.post(r, handleCheckDevice);
  app.get(r, handleCheckDevice);
});

app.get('/api/health', (req, res) => {
  res.json({ status: "alive", time: Date.now(), cloud: isMongoActive, epoch: CURRENT_EPOCH });
});

// -------------------------------------------------------------
// Admin APIs: إدارة وتوليد وقفل الأكواد
// -------------------------------------------------------------
app.get('/api/admin/keys', requireAdminAuth, (req, res) => {
  const db = loadDB();
  const keys = db.keys || [];
  
  let approvedCount = 0;
  let pendingCount = 0;
  let blockedCount = 0;
  
  keys.forEach(k => {
    if (k.status === 'blocked') blockedCount++;
    (k.activations || []).forEach(a => {
      if (a.status === 'approved') approvedCount++;
      else if (a.status === 'pending') pendingCount++;
      else if (a.status === 'blocked' || a.status === 'rejected') blockedCount++;
    });
  });

  res.json({
    success: true,
    keys: keys,
    pendingCount: pendingCount,
    cloud_active: isMongoActive,
    epoch: CURRENT_EPOCH,
    stats: {
      total_keys: keys.length,
      approved: approvedCount,
      pending: pendingCount,
      blocked: blockedCount
    }
  });
});

app.post('/api/admin/generate', requireAdminAuth, (req, res) => {
  const { count, owner_name, note } = req.body;
  const num = Math.min(Math.max(parseInt(count) || 1, 1), 100);
  const db = loadDB();
  const newKeys = [];

  for (let i = 0; i < num; i++) {
    const key = generateNewKeyString();
    const keyItem = {
      key: key,
      owner_name: (owner_name || "").trim() || "غير مسجل",
      note: note || "",
      status: 'active',
      created_at: new Date().toISOString(),
      activations: []
    };
    db.keys.push(keyItem);
    newKeys.push(keyItem);
  }

  saveDB(db);
  res.json({ success: true, keys: newKeys, count: newKeys.length });
});

app.post('/api/admin/edit_owner', requireAdminAuth, (req, res) => {
  const { key, owner_name, note } = req.body;
  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key === key);
  if (keyObj) {
    if (owner_name !== undefined) keyObj.owner_name = owner_name.trim();
    if (note !== undefined) keyObj.note = note;
    saveDB(db);
    return res.json({ success: true, message: "تم تحديث اسم صاحب الكود بنجاح" });
  }
  res.status(404).json({ success: false, message: "الكود غير موجود" });
});

// قفل / فتح الأداة للكود كاملاً (Kill Switch)
app.post('/api/admin/toggle_lock', requireAdminAuth, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key === key);
  if (keyObj) {
    keyObj.status = (keyObj.status === 'blocked') ? 'active' : 'blocked';
    if (keyObj.activations) {
      keyObj.activations.forEach(a => {
        a.status = (keyObj.status === 'blocked') ? 'blocked' : 'approved';
      });
    }
    saveDB(db);
    return res.json({ 
      success: true, 
      status: keyObj.status, 
      message: keyObj.status === 'blocked' ? "🚨 تم قفل الأداة عن هذا الكود وجميع أجهزته فوراً" : "✅ تم إعادة تفعيل الأداة لهذا الكود" 
    });
  }
  res.status(404).json({ success: false, message: "الكود غير موجود" });
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
      act.last_seen = new Date().toISOString();
    }
    saveDB(db);
  }
  res.json({ success: true, message: "تم اعتماد وتفعيل الجهاز بنجاح" });
});

app.post('/api/admin/lock_device', requireAdminAuth, (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) {
      act.status = (act.status === 'blocked') ? 'approved' : 'blocked';
    }
    saveDB(db);
    return res.json({ success: true, message: act && act.status === 'blocked' ? "تم قفل الجهاز فورياً" : "تم فتح الجهاز" });
  }
  res.json({ success: false, message: "الجهاز غير موجود" });
});

app.post('/api/admin/delete', requireAdminAuth, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  db.keys = (db.keys || []).filter(k => k.key !== key);
  saveDB(db);
  res.json({ success: true, message: "تم حذف الكود نهائياً وإلغاء صلاحيته فوراً" });
});

app.post('/api/admin/reset', requireAdminAuth, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key === key);
  if (keyObj) {
    keyObj.activations = [];
    saveDB(db);
  }
  res.json({ success: true, message: "تم فك ارتباط الجهاز بنجاح ويمكن استخدامه بجهاز جديد" });
});

app.post('/api/admin/purge_all', requireAdminAuth, async (req, res) => {
  const db = loadDB();
  db.keys = [];
  db.epoch = CURRENT_EPOCH;
  db.secretSalt = JWT_SECRET_SALT;
  saveDB(db);
  if (isMongoActive && mongoCollection) {
    try {
      await mongoCollection.updateOne(
        { _id: 'master_license_store' },
        { $set: { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (e) {
      console.error("[MONGO PURGE ERROR]", e);
    }
  }
  res.json({ success: true, message: "🚨 تم قفل وتصفير جميع الأكواد بنجاح! جميع النسخ مقفلة الآن." });
});

app.get('/api/admin/backup', requireAdminAuth, (req, res) => {
  const db = loadDB();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=keys_backup_' + Date.now() + '.json');
  res.send(JSON.stringify(db, null, 2));
});

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
    if (incomingKey && incomingKey.key && incomingKey.key.startsWith('ABOD-') && !existingKeyMap.has(incomingKey.key)) {
      db.keys.push(incomingKey);
      added++;
    }
  });

  saveDB(db);
  res.json({ success: true, message: 'تم استعادة ودمج ' + added + ' كود بنجاح!' });
});

// -------------------------------------------------------------
// 👑 صفحة لوحة التحكم الفاخرة — عبدالإله V4
// -------------------------------------------------------------
const DASHBOARD_PAGE_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>عبدالإله 👑 — لوحة التحكم المركزية</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-main: #0b0f19;
    --bg-card: #111827;
    --bg-card-hover: #172033;
    --border: #1f293d;
    --border-accent: #374151;
    --accent: #6366f1;
    --accent-hover: #4f46e5;
    --accent-glow: rgba(99, 102, 241, 0.25);
    --gold: #f59e0b;
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --text-muted: #6b7280;
    --danger: #ef4444;
    --danger-bg: rgba(239, 68, 68, 0.12);
    --success: #10b981;
    --success-bg: rgba(16, 185, 129, 0.12);
    --warning: #f59e0b;
    --warning-bg: rgba(245, 158, 11, 0.12);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', sans-serif;
    background: var(--bg-main);
    color: var(--text-primary);
    min-height: 100vh;
    padding-bottom: 60px;
    background-image: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.06) 0%, transparent 60%);
  }

  /* Login Overlay */
  #loginOverlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(11, 15, 25, 0.98);
    display: flex; justify-content: center; align-items: center;
    z-index: 99999;
  }
  .login-card {
    background: var(--bg-card);
    border: 1px solid var(--border-accent);
    border-radius: 20px;
    padding: 40px 35px;
    width: 380px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(99, 102, 241, 0.1);
  }
  .login-card h2 {
    font-size: 28px;
    font-weight: 900;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #ffffff 40%, var(--gold));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .login-card p {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 25px;
  }
  .login-card input {
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: #0b0f19;
    color: #fff;
    font-family: inherit;
    font-size: 16px;
    margin-bottom: 18px;
    text-align: center;
    transition: all 0.2s;
  }
  .login-card input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 15px var(--accent-glow);
  }
  .login-card button {
    width: 100%;
    padding: 13px;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 15px var(--accent-glow);
    transition: transform 0.15s, background 0.2s;
  }
  .login-card button:hover {
    transform: translateY(-2px);
    background: linear-gradient(135deg, #4f46e5, #4338ca);
  }

  /* Header */
  .header {
    background: rgba(17, 24, 39, 0.85);
    backdrop-filter: blur(15px);
    border-bottom: 1px solid var(--border);
    padding: 20px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky; top: 0; z-index: 100;
  }
  .brand {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .brand-title {
    font-size: 26px;
    font-weight: 900;
    background: linear-gradient(135deg, #ffffff 40%, var(--gold));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
  }
  .brand-subtitle {
    font-size: 12.5px;
    color: var(--text-secondary);
    letter-spacing: 0.3px;
  }
  .header-actions {
    display: flex;
    gap: 12px;
  }
  .btn {
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    padding: 10px 18px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
  }
  .btn-primary {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #fff;
    box-shadow: 0 4px 15px var(--accent-glow);
  }
  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
  }
  .btn-danger {
    background: var(--danger-bg);
    color: var(--danger);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  .btn-danger:hover {
    background: var(--danger);
    color: #fff;
  }
  .btn-outline {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-accent);
  }
  .btn-outline:hover {
    color: #fff;
    border-color: var(--text-primary);
  }

  /* Container & Stats */
  .container {
    max-width: 1300px;
    margin: 30px auto;
    padding: 0 25px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 22px 25px;
    position: relative;
    overflow: hidden;
  }
  .stat-card::after {
    content: '';
    position: absolute;
    top: 0; right: 0; width: 4px; height: 100%;
    background: var(--border-accent);
  }
  .stat-card.accent::after { background: var(--accent); }
  .stat-card.green::after { background: var(--success); }
  .stat-card.red::after { background: var(--danger); }
  .stat-label {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 900;
    color: #fff;
  }

  /* Table Controls */
  .controls-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
    gap: 15px;
    flex-wrap: wrap;
  }
  .search-box {
    position: relative;
    flex: 1;
    max-width: 400px;
  }
  .search-box input {
    width: 100%;
    padding: 12px 18px 12px 40px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: #fff;
    font-family: inherit;
    font-size: 14px;
  }
  .search-box input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
  }

  /* Table */
  .table-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: right;
  }
  th {
    background: #0e1422;
    padding: 16px 20px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 18px 20px;
    font-size: 14px;
    border-bottom: 1px solid rgba(31, 41, 61, 0.6);
    vertical-align: middle;
  }
  tr:hover td {
    background: var(--bg-card-hover);
  }
  .key-code {
    font-family: 'Courier New', monospace;
    font-weight: 800;
    font-size: 15px;
    color: #a5b4fc;
    background: rgba(99, 102, 241, 0.1);
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid rgba(99, 102, 241, 0.25);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    letter-spacing: 0.5px;
  }
  .owner-tag {
    font-weight: 700;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .owner-edit-btn {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 13px;
    opacity: 0.8;
    transition: opacity 0.2s;
  }
  .owner-edit-btn:hover { opacity: 1; }
  .note-tag {
    font-size: 11.5px;
    color: var(--text-muted);
    margin-top: 3px;
  }
  .device-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .device-friendly-name {
    font-weight: 700;
    color: #34d399;
  }
  .device-raw {
    font-size: 11.5px;
    color: var(--text-muted);
    font-family: monospace;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 700;
  }
  .badge-active { background: var(--success-bg); color: var(--success); }
  .badge-blocked { background: var(--danger-bg); color: var(--danger); }
  .badge-pending { background: var(--warning-bg); color: var(--warning); }

  .actions-cell {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .act-btn {
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid transparent;
    font-family: inherit;
    transition: all 0.15s;
  }
  .act-btn-lock {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.3);
  }
  .act-btn-lock:hover { background: #ef4444; color: #fff; }
  .act-btn-unlock {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border-color: rgba(16, 185, 129, 0.3);
  }
  .act-btn-unlock:hover { background: #10b981; color: #fff; }
  .act-btn-reset {
    background: #1f293d;
    color: var(--text-secondary);
  }
  .act-btn-reset:hover { color: #fff; background: #2d3a54; }
  .act-btn-delete {
    background: transparent;
    color: var(--text-muted);
  }
  .act-btn-delete:hover { color: var(--danger); }

  /* Modals */
  .modal {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.85);
    display: none; justify-content: center; align-items: center;
    z-index: 1000;
  }
  .modal-content {
    background: var(--bg-card);
    border: 1px solid var(--border-accent);
    border-radius: 18px;
    padding: 30px;
    width: 440px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.7);
  }
  .modal-title {
    color: var(--text-primary);
    font-size: 20px;
    font-weight: 800;
    margin-bottom: 18px;
  }
  .form-group {
    margin-bottom: 16px;
    text-align: right;
  }
  .form-group label {
    display: block;
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }
  .form-group input, .form-group textarea {
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: #0b0f19;
    color: #fff;
    font-family: inherit;
    font-size: 14px;
  }
  .form-group input:focus, .form-group textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 24px;
  }
</style>
</head>
<body>

<div id="loginOverlay">
  <div class="login-card">
    <h2>عبدالإله 👑</h2>
    <p>لوحة التحكم المركزية وإدارة التراخيص</p>
    <input type="text" id="adminPassInput" placeholder="أدخل كلمة المرور (abod2026)" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" onkeydown="if(event.key==='Enter') doLogin()">
    <button onclick="doLogin()">تسجيل الدخول</button>
  </div>
</div>

<header class="header">
  <div class="brand">
    <span class="brand-title">عبدالإله 👑</span>
    <span class="brand-subtitle">نظام الإدارة المركزي وقفل الأجهزة الصارم V4</span>
  </div>
  <div class="header-actions">
    <button class="btn btn-primary" onclick="openGenerateModal()">➕ توليد كود جديد</button>
    <button class="btn btn-outline" onclick="exportBackup()">💾 نسخ احتياطي</button>
    <button class="btn btn-outline" onclick="document.getElementById('restoreInput').click()">📥 استعادة</button>
    <input type="file" id="restoreInput" style="display:none" onchange="importBackup(event)" accept=".json">
    <button class="btn btn-danger" onclick="purgeAllPrompt()">🚨 قفل وتصفير الجميع</button>
  </div>
</header>

<div class="container">
  <div class="stats-grid">
    <div class="stat-card accent">
      <div class="stat-label">إجمالي الأكواد المسجلة</div>
      <div class="stat-value" id="statTotalKeys">0</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">الأجهزة المفعلة والشغالة</div>
      <div class="stat-value" id="statApprovedDevices">0</div>
    </div>
    <div class="stat-card red">
      <div class="stat-label">الأكواد المقفلة (Kill-Switch)</div>
      <div class="stat-value" id="statBlockedCount">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">حالة قاعدة البيانات السحابية</div>
      <div class="stat-value" id="statCloudStatus" style="font-size:20px; margin-top:5px;">متصلة ✓</div>
    </div>
  </div>

  <div class="controls-bar">
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input type="text" id="search" placeholder="ابحث بكود التفعيل، اسم المشتري، موديل الجهاز..." oninput="filterRows()">
    </div>
    <div style="font-size:13px; color:var(--text-secondary);">
      تحديث حقيقي تلقائي كل 10 ثوانٍ
    </div>
  </div>

  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th>كود التفعيل (ABOD)</th>
          <th>صاحب الكود (الاسم)</th>
          <th>الجهاز الفعلي المربوط</th>
          <th>الحالة التشغيلية</th>
          <th>آخر تواجد / فحص</th>
          <th>الإجراءات الفورية</th>
        </tr>
      </thead>
      <tbody id="keysTableBody">
        <tr>
          <td colspan="6" style="text-align:center; padding: 40px; color: var(--text-secondary);">
            جاري جلب البيانات...
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- مودال توليد كود جديد -->
<div class="modal" id="generateModal">
  <div class="modal-content">
    <div class="modal-title">✨ توليد كود تفعيل جديد</div>
    <div class="form-group">
      <label>اسم صاحب الكود (المشتري):</label>
      <input type="text" id="genOwner" placeholder="مثال: فهد الشمري...">
    </div>
    <div class="form-group">
      <label>عدد الأكواد المراد توليدها:</label>
      <input type="number" id="genCount" value="1" min="1" max="50">
    </div>
    <div class="form-group">
      <label>ملاحظة اختيارية:</label>
      <input type="text" id="genNote" placeholder="ملاحظة خاصة...">
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeGenerateModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="submitGenerate()">توليد الكود</button>
    </div>
  </div>
</div>

<!-- مودال تعديل اسم الشخص -->
<div class="modal" id="editOwnerModal">
  <div class="modal-content">
    <div class="modal-title">✏️ تعديل بيانات صاحب الكود</div>
    <input type="hidden" id="editTargetKey">
    <div class="form-group">
      <label>اسم صاحب الكود:</label>
      <input type="text" id="editOwnerName">
    </div>
    <div class="form-group">
      <label>الملاحظة:</label>
      <input type="text" id="editOwnerNote">
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeEditOwnerModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="submitEditOwner()">حفظ التعديل</button>
    </div>
  </div>
</div>

<script>
let authToken = sessionStorage.getItem('abod_v4_admin_token') || '';
let allKeys = [];

const IPHONE_NAMES = {
  'iPhone14,2': 'iPhone 13 Pro',
  'iPhone14,3': 'iPhone 13 Pro Max',
  'iPhone14,4': 'iPhone 13 mini',
  'iPhone14,5': 'iPhone 13',
  'iPhone14,6': 'iPhone SE (3rd gen)',
  'iPhone14,7': 'iPhone 14',
  'iPhone14,8': 'iPhone 14 Plus',
  'iPhone15,2': 'iPhone 14 Pro',
  'iPhone15,3': 'iPhone 14 Pro Max',
  'iPhone15,4': 'iPhone 15',
  'iPhone15,5': 'iPhone 15 Plus',
  'iPhone16,1': 'iPhone 15 Pro',
  'iPhone16,2': 'iPhone 15 Pro Max',
  'iPhone17,1': 'iPhone 16 Pro',
  'iPhone17,2': 'iPhone 16 Pro Max',
  'iPhone17,3': 'iPhone 16',
  'iPhone17,4': 'iPhone 16 Plus',
  'iPhone13,1': 'iPhone 12 mini',
  'iPhone13,2': 'iPhone 12',
  'iPhone13,3': 'iPhone 12 Pro',
  'iPhone13,4': 'iPhone 12 Pro Max',
  'iPhone12,1': 'iPhone 11',
  'iPhone12,3': 'iPhone 11 Pro',
  'iPhone12,5': 'iPhone 11 Pro Max',
  'iPhone11,8': 'iPhone XR',
  'iPhone11,2': 'iPhone XS',
  'iPhone11,6': 'iPhone XS Max',
  'iPhone10,3': 'iPhone X',
  'iPhone10,6': 'iPhone X'
};

function formatDeviceModel(raw) {
  if (!raw) return 'آيفون غير معروف';
  return IPHONE_NAMES[raw] || raw;
}

function normalizeToken(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48))
    .replace(/[\u06F0-\u06F9]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x06F0 + 48))
    .replace(/[-\s_]/g, '');
}

// تسجيل الدخول التلقائي في حال تم فتح الرابط بـ ?pass=abod2026 أو وجود توكن سابق
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlPass = urlParams.get('pass') || urlParams.get('token');
  if (urlPass) {
    const norm = normalizeToken(urlPass);
    const inp = document.getElementById('adminPassInput');
    if (inp) inp.value = norm;
    testToken(norm);
  } else if (authToken) {
    testToken(authToken);
  }
});

function doLogin() {
  const raw = document.getElementById('adminPassInput').value;
  const p = normalizeToken(raw);
  if (!p) {
    alert('يرجى إدخال كلمة المرور abod2026');
    return;
  }
  testToken(p);
}

async function testToken(token) {
  const btn = document.querySelector('#loginOverlay button');
  if (btn) btn.innerText = 'جاري التحقق...';
  try {
    const res = await fetch('/api/admin/keys', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      authToken = token;
      sessionStorage.setItem('abod_v4_admin_token', token);
      document.getElementById('loginOverlay').style.display = 'none';
      loadData();
    } else {
      alert('كلمة المرور غير صحيحة! تأكد من كتابة abod2026');
      if (btn) btn.innerText = 'تسجيل الدخول';
    }
  } catch (e) {
    alert('تعذر الاتصال بالسيرفر أو جاري تشغيل السيرفر، انتظر ثوانٍ وجرب مجدداً.');
    if (btn) btn.innerText = 'تسجيل الدخول';
  }
}

async function loadData() {
  try {
    const res = await fetch('/api/admin/keys', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    if (!data.success) return;

    allKeys = data.keys || [];
    document.getElementById('statTotalKeys').innerText = allKeys.length;
    document.getElementById('statApprovedDevices').innerText = (data.stats && data.stats.approved) || 0;
    document.getElementById('statBlockedCount').innerText = (data.stats && data.stats.blocked) || 0;
    document.getElementById('statCloudStatus').innerText = data.cloud_active ? 'متصلة دائماً ✓' : 'محلي ⚠️';

    renderTable(allKeys);
  } catch (e) {
    console.error(e);
  }
}

function renderTable(keys) {
  const tbody = document.getElementById('keysTableBody');
  if (!keys || keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px; color: var(--text-secondary); font-weight:700;">لا توجد أكواد مسجلة حالياً (تم التصفير الشامل بنجاح)</td></tr>';
    return;
  }

  tbody.innerHTML = keys.map(k => {
    const isKeyBlocked = k.status === 'blocked';
    const acts = k.activations || [];
    
    let deviceCellHtml = '';
    if (acts.length === 0) {
      deviceCellHtml = '<span style="color:var(--text-muted); font-size:13px;">بانتظار الربط بأول جهاز...</span>';
    } else {
      deviceCellHtml = acts.map(a => {
        const friendlyModel = formatDeviceModel(a.device_model);
        const devName = a.device_name || 'iPhone';
        return '<div class="device-info">' +
          '<span class="device-friendly-name">📱 ' + friendlyModel + '</span>' +
          '<span class="device-raw">' + devName + ' (' + (a.device_model || '') + ')</span>' +
          '<span class="device-raw" style="font-size:10.5px; opacity:0.6;">UDID: ' + a.device_id.substring(0, 14) + '...</span>' +
        '</div>';
      }).join('<hr style="border:0; border-top:1px dashed var(--border); margin:6px 0;">');
    }

    let statusHtml = '';
    if (isKeyBlocked) {
      statusHtml = '<span class="badge badge-blocked">🔴 مقفل من الإدارة</span>';
    } else if (acts.some(a => a.status === 'approved')) {
      statusHtml = '<span class="badge badge-active">🟢 مفعّل وشغال</span>';
    } else {
      statusHtml = '<span class="badge badge-pending">⏳ بانتظار أول تفعيل</span>';
    }

    const lastSeen = acts[0] ? acts[0].last_seen : k.created_at;
    const lastSeenStr = lastSeen ? new Date(lastSeen).toLocaleString('ar-SA') : 'غير متوفر';
    const ownerName = k.owner_name || 'غير مسجل';
    const noteBadge = k.note ? '<div class="note-tag">📝 ' + k.note + '</div>' : '';

    return '<tr>' +
      '<td>' +
        '<div class="key-code">' +
          k.key +
          ' <button onclick="copyText(\'' + k.key + '\')" style="background:none; border:none; cursor:pointer; font-size:13px;" title="نسخ الكود">📋</button>' +
        '</div>' +
      '</td>' +
      '<td>' +
        '<div class="owner-tag">' +
          '👤 ' + ownerName +
          ' <button class="owner-edit-btn" onclick="openEditOwnerModal(\'' + k.key + '\', \'' + encodeURIComponent(ownerName) + '\', \'' + encodeURIComponent(k.note || '') + '\')" title="تعديل اسم الشخص">✏️</button>' +
        '</div>' +
        noteBadge +
      '</td>' +
      '<td>' + deviceCellHtml + '</td>' +
      '<td>' + statusHtml + '</td>' +
      '<td style="color:var(--text-secondary); font-size:12.5px;">' + lastSeenStr + '</td>' +
      '<td>' +
        '<div class="actions-cell">' +
          '<button class="act-btn ' + (isKeyBlocked ? 'act-btn-unlock' : 'act-btn-lock') + '" onclick="toggleKeyLock(\'' + k.key + '\')">' +
            (isKeyBlocked ? '🔓 تفعيل الأداة' : '🔒 قفل الأداة') +
          '</button>' +
          '<button class="act-btn act-btn-reset" onclick="resetKeyHWID(\'' + k.key + '\')" title="فك ارتباط الجهاز الحالي">' +
            '🔄 فك الارتباط' +
          '</button>' +
          '<button class="act-btn act-btn-delete" onclick="deleteKeyPermanent(\'' + k.key + '\')" title="حذف نهائي">' +
            '🗑️' +
          '</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function openGenerateModal() {
  document.getElementById('genOwner').value = '';
  document.getElementById('genNote').value = '';
  document.getElementById('generateModal').style.display = 'flex';
}
function closeGenerateModal() {
  document.getElementById('generateModal').style.display = 'none';
}

async function submitGenerate() {
  const count = parseInt(document.getElementById('genCount').value) || 1;
  const owner_name = document.getElementById('genOwner').value.trim();
  const note = document.getElementById('genNote').value.trim();

  const res = await fetch('/api/admin/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ count, owner_name, note })
  });
  const data = await res.json();
  if (data.success) {
    closeGenerateModal();
    loadData();
    alert('✅ تم توليد ' + data.count + ' كود بنجاح لصاحب الكود: ' + (owner_name || 'بدون اسم'));
  }
}

function openEditOwnerModal(key, encodedName, encodedNote) {
  document.getElementById('editTargetKey').value = key;
  document.getElementById('editOwnerName').value = decodeURIComponent(encodedName);
  document.getElementById('editOwnerNote').value = decodeURIComponent(encodedNote);
  document.getElementById('editOwnerModal').style.display = 'flex';
}
function closeEditOwnerModal() {
  document.getElementById('editOwnerModal').style.display = 'none';
}

async function submitEditOwner() {
  const key = document.getElementById('editTargetKey').value;
  const owner_name = document.getElementById('editOwnerName').value.trim();
  const note = document.getElementById('editOwnerNote').value.trim();

  const res = await fetch('/api/admin/edit_owner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, owner_name, note })
  });
  const data = await res.json();
  if (data.success) {
    closeEditOwnerModal();
    loadData();
  }
}

async function toggleKeyLock(key) {
  const res = await fetch('/api/admin/toggle_lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  const data = await res.json();
  if (data.success) {
    loadData();
  }
}

async function resetKeyHWID(key) {
  if (!confirm('هل تريد فك ارتباط الجهاز المرتبط بهذا الكود؟')) return;
  const res = await fetch('/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  const data = await res.json();
  alert(data.message);
  loadData();
}

async function deleteKeyPermanent(key) {
  if (!confirm('هل أنت متأكد من حذف هذا الكود نهائياً؟ ستتوقف الأداة عند المستخدم فوراً.')) return;
  const res = await fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  const data = await res.json();
  loadData();
}

async function purgeAllPrompt() {
  const pass = prompt('🚨 تحذير: سيتم قفل وإلغاء جميع النسخ والأكواد فوراً! اكتب كلمة المرور للتأكيد:');
  if (normalizeToken(pass) !== 'abod2026') {
    if (pass !== null) alert('كلمة المرور غير صحيحة!');
    return;
  }
  const res = await fetch('/api/admin/purge_all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken }
  });
  const data = await res.json();
  alert(data.message);
  loadData();
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('تم نسخ الكود: ' + text);
  });
}

function exportBackup() {
  window.open('/api/admin/backup?token=' + encodeURIComponent(authToken), '_blank');
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const json = JSON.parse(event.target.result);
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
  };
  reader.readAsText(file);
}

function filterRows() {
  const q = document.getElementById('search').value.toLowerCase().trim();
  if (!q) {
    renderTable(allKeys);
    return;
  }
  const filtered = allKeys.filter(k => {
    if (k.key && k.key.toLowerCase().includes(q)) return true;
    if (k.owner_name && k.owner_name.toLowerCase().includes(q)) return true;
    if (k.note && k.note.toLowerCase().includes(q)) return true;
    return (k.activations || []).some(a => {
      const friendly = formatDeviceModel(a.device_model).toLowerCase();
      const rawModel = (a.device_model || '').toLowerCase();
      const devName = (a.device_name || '').toLowerCase();
      const devId = (a.device_id || '').toLowerCase();
      return friendly.includes(q) || rawModel.includes(q) || devName.includes(q) || devId.includes(q);
    });
  });
  renderTable(filtered);
}
</script>
</body>
</html>`;

app.get(['/' + ADMIN_PATH, '/abod', '/admin', '/login'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(DASHBOARD_PAGE_HTML);
});

// توجيه تلقائي إذا فتح المستخدم الرابط الرئيسي ومعه كلمة المرور
app.get('/', (req, res, next) => {
  if (req.query && (req.query.pass || req.query.token)) {
    return res.redirect('/' + ADMIN_PATH + '?pass=' + encodeURIComponent(req.query.pass || req.query.token));
  }
  next();
});

// أي مسار API أو طلب POST غير معتمد يُرد عليه فوراً بكود قفل متوافق مع كافة الإصدارات القديمة والجديدة
app.all('/api/*', (req, res) => {
  res.json(buildLockedResponse("Key Expired or Invalid"));
});

app.post('*', (req, res) => {
  res.json(buildLockedResponse("Key Expired or Invalid"));
});

// صفحة 404 للمسارات العادية غير المعروفة (Stealth Mode)
app.use((req, res) => {
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family: sans-serif; padding: 40px; background: #fff; color: #222;"><h1>404 Not Found</h1><p>The requested URL ' + req.originalUrl + ' was not found on this server.</p><hr><address style="font-size: 13px; color: #777;">Apache/2.4.52 (Ubuntu) Server</address></body></html>');
});

const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || 'https://yalla-upd0.onrender.com/api/health';
setInterval(() => {
  try {
    https.get(KEEP_ALIVE_URL, (res) => {}).on('error', () => {});
  } catch (e) {}
}, 3.5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running securely on port ' + PORT);
});
