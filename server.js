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
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "abod2026";
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
    message: msg || "Key Expired or Invalid",
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

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '').trim();
  } else if (req.query && req.query.token) {
    token = req.query.token.trim();
  } else if (req.body && req.body.token) {
    token = req.body.token.trim();
  }

  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: "🚫 غير مصرح لك بالدخول" });
  }

  next();
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
    return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
  }

  const cleanKey = String(key).trim().toUpperCase();

  if (!cleanKey.startsWith('ABOD-')) {
    return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
  }

  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key && k.key.trim().toUpperCase() === cleanKey);

  if (!keyObj) {
    return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
  }

  // إذا تم قفل الكود من الإدارة يدوياً
  if (keyObj.status === 'blocked') {
    return res.status(403).json(buildLockedResponse("🚫 تم إيقاف وقفل هذا الكود نهائياً من الإدارة"));
  }

  if (!keyObj.activations) {
    keyObj.activations = [];
  }

  let thisDevice = keyObj.activations.find(a => a.device_id === deviceId);

  if (thisDevice) {
    if (thisDevice.status === 'rejected' || thisDevice.status === 'blocked') {
      return res.status(403).json(buildLockedResponse("🚫 تم قفل الأداة عن هذا الجهاز من قِبل الإدارة"));
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
    return res.status(403).json(buildLockedResponse("⚠️ هذا الكود مفعّل لجهاز آخر بالفعل ولا يمكن استخدامه على هذا الجهاز!"));
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
    return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
  }

  const db = loadDB();
  for (const k of (db.keys || [])) {
    if (k.status === 'blocked') continue;
    const act = (k.activations || []).find(a => a.device_id === deviceId);
    if (act) {
      if (act.status === 'blocked' || act.status === 'rejected') {
        return res.status(403).json(buildLockedResponse("🚫 تم قفل الأداة عن هذا الجهاز"));
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

  return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
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

app.all('/api/*', (req, res) => {
  res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
});

app.post('*', (req, res) => {
  res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
});

app.get('/', (req, res) => {
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family: sans-serif; padding: 40px; background: #fff; color: #222;"><h1>404 Not Found</h1><p>The requested URL / was not found on this server.</p><hr><address style="font-size: 13px; color: #777;">Apache/2.4.52 (Ubuntu) Server</address></body></html>');
});

// -------------------------------------------------------------
// 👑 صفحة لوحة التحكم الفاخرة — عبدالإله V4 Royal Edition
// -------------------------------------------------------------
app.get('/' + ADMIN_PATH, (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 لوحة تحكم عبدالإله</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-main: #08090d;
    --bg-card: #10121a;
    --bg-card-hover: #151824;
    --border: #1e2235;
    --border-gold: rgba(212, 175, 55, 0.3);
    --gold: #d4af37;
    --gold-glow: #ffd700;
    --gold-dark: #aa8210;
    --text-primary: #ffffff;
    --text-secondary: #9499b3;
    --text-muted: #5d637f;
    --danger: #ff4757;
    --danger-bg: rgba(255, 71, 87, 0.12);
    --success: #00d26a;
    --success-bg: rgba(0, 210, 106, 0.12);
    --warning: #ffa502;
    --warning-bg: rgba(255, 165, 2, 0.12);
    --info: #2ed573;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', sans-serif;
    background: var(--bg-main);
    color: var(--text-primary);
    min-height: 100vh;
    padding-bottom: 60px;
    background-image: radial-gradient(circle at 50% 0%, rgba(212, 175, 55, 0.08) 0%, transparent 50%);
  }
  #loginOverlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(8, 9, 13, 0.98);
    display: flex; justify-content: center; align-items: center;
    z-index: 99999;
  }
  .login-card {
    background: var(--bg-card);
    border: 1px solid var(--border-gold);
    border-radius: 20px;
    padding: 40px 35px;
    width: 380px;
    text-align: center;
    box-shadow: 0 15px 50px rgba(0,0,0,0.8), 0 0 30px rgba(212, 175, 55, 0.1);
  }
  .login-card h2 {
    color: var(--gold);
    font-size: 26px;
    font-weight: 900;
    margin-bottom: 8px;
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
    background: #181a26;
    color: #fff;
    font-family: inherit;
    font-size: 16px;
    margin-bottom: 18px;
    text-align: center;
    transition: all 0.2s;
  }
  .login-card input:focus {
    outline: none;
    border-color: var(--gold);
    box-shadow: 0 0 15px rgba(212, 175, 55, 0.3);
  }
  .login-card button {
    width: 100%;
    padding: 13px;
    background: linear-gradient(135deg, #ffd700, #d4af37, #aa8210);
    color: #000;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);
    transition: transform 0.15s;
  }
  .login-card button:hover { transform: translateY(-2px); }

  /* Header */
  .header {
    background: rgba(16, 18, 26, 0.85);
    backdrop-filter: blur(15px);
    border-bottom: 1px solid var(--border-gold);
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
    font-size: 24px;
    font-weight: 900;
    background: linear-gradient(135deg, #ffffff, #ffd700, #d4af37);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
  }
  .brand-subtitle {
    font-size: 12.5px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  /* Stats Cards */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;
    padding: 30px 40px 10px 40px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 22px;
    position: relative;
    overflow: hidden;
    transition: all 0.2s;
  }
  .stat-card:hover {
    border-color: var(--border-gold);
    transform: translateY(-2px);
  }
  .stat-card::before {
    content: '';
    position: absolute; top: 0; right: 0; width: 4px; height: 100%;
    background: var(--gold);
  }
  .stat-card.danger::before { background: var(--danger); }
  .stat-card.success::before { background: var(--success); }
  .stat-val {
    font-size: 32px;
    font-weight: 900;
    color: #fff;
    margin-bottom: 4px;
  }
  .stat-lbl {
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  /* Toolbar */
  .toolbar {
    padding: 20px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    flex-wrap: wrap;
  }
  .actions-group {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .btn {
    padding: 11px 20px;
    border-radius: 12px;
    border: none;
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
  }
  .btn-gold {
    background: linear-gradient(135deg, #ffd700, #d4af37);
    color: #08090d;
    box-shadow: 0 4px 15px rgba(212, 175, 55, 0.35);
  }
  .btn-gold:hover { transform: translateY(-1px); filter: brightness(1.08); }
  .btn-danger {
    background: var(--danger-bg);
    color: var(--danger);
    border: 1px solid rgba(255, 71, 87, 0.3);
  }
  .btn-danger:hover { background: var(--danger); color: #fff; }
  .btn-outline {
    background: var(--bg-card);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }
  .btn-outline:hover { border-color: var(--gold); color: var(--gold); }
  .search-box {
    position: relative;
    width: 320px;
  }
  .search-box input {
    width: 100%;
    padding: 12px 18px 12px 40px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: #fff;
    font-family: inherit;
    font-size: 14px;
    transition: all 0.2s;
  }
  .search-box input:focus {
    outline: none;
    border-color: var(--gold);
    box-shadow: 0 0 15px rgba(212, 175, 55, 0.2);
  }
  .search-box span {
    position: absolute; left: 14px; top: 12px;
    font-size: 16px; color: var(--text-muted);
  }

  /* Table */
  .table-wrap {
    padding: 0 40px;
  }
  .table-box {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: right;
  }
  th {
    background: #141724;
    padding: 16px 20px;
    color: var(--gold);
    font-size: 13.5px;
    font-weight: 800;
    border-bottom: 1px solid var(--border);
    letter-spacing: 0.2px;
  }
  td {
    padding: 18px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    font-size: 14px;
    vertical-align: middle;
  }
  tr:hover td {
    background: var(--bg-card-hover);
  }

  /* Components */
  .key-badge {
    font-family: 'SF Mono', Menlo, monospace;
    font-size: 15px;
    font-weight: 800;
    color: #ffd700;
    letter-spacing: 0.5px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(212, 175, 55, 0.1);
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid rgba(212, 175, 55, 0.25);
  }
  .owner-tag {
    font-size: 15px;
    font-weight: 800;
    color: #fff;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .owner-edit-btn {
    background: none; border: none; cursor: pointer;
    font-size: 14px; color: var(--text-secondary);
    transition: color 0.15s;
  }
  .owner-edit-btn:hover { color: var(--gold); }
  
  .device-info-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .device-model-badge {
    font-size: 13.5px;
    font-weight: 800;
    color: #00d26a;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .device-name-sub {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .device-hwid {
    font-family: monospace;
    font-size: 11px;
    color: var(--text-muted);
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12.5px;
    font-weight: 800;
  }
  .status-pill.active {
    background: var(--success-bg);
    color: var(--success);
    border: 1px solid rgba(0, 210, 106, 0.3);
  }
  .status-pill.blocked {
    background: var(--danger-bg);
    color: var(--danger);
    border: 1px solid rgba(255, 71, 87, 0.3);
  }
  .status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
  }

  .actions-cell {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .act-btn {
    padding: 6px 12px;
    border-radius: 8px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }
  .act-btn-lock {
    background: rgba(255, 71, 87, 0.15);
    color: #ff4757;
    border: 1px solid rgba(255, 71, 87, 0.3);
  }
  .act-btn-lock:hover { background: #ff4757; color: #fff; }
  .act-btn-unlock {
    background: rgba(0, 210, 106, 0.15);
    color: #00d26a;
    border: 1px solid rgba(0, 210, 106, 0.3);
  }
  .act-btn-unlock:hover { background: #00d26a; color: #000; }
  .act-btn-reset {
    background: #25283a;
    color: #d1d5db;
    border: 1px solid #363a52;
  }
  .act-btn-reset:hover { border-color: var(--gold); color: var(--gold); }
  .act-btn-delete {
    background: none;
    color: var(--text-muted);
    border: 1px solid transparent;
  }
  .act-btn-delete:hover { color: #ff4757; border-color: rgba(255, 71, 87, 0.3); }

  /* Modal */
  .modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    display: none; justify-content: center; align-items: center;
    z-index: 10000;
  }
  .modal-content {
    background: var(--bg-card);
    border: 1px solid var(--border-gold);
    border-radius: 20px;
    width: 440px;
    max-width: 90%;
    padding: 30px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.9);
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20px;
  }
  .modal-header h3 {
    font-size: 19px;
    color: var(--gold);
    font-weight: 800;
  }
  .modal-close {
    background: none; border: none; color: var(--text-secondary);
    font-size: 20px; cursor: pointer;
  }
  .modal-body label {
    display: block; font-size: 13px; font-weight: 700;
    color: var(--text-secondary); margin-bottom: 8px;
  }
  .modal-body input {
    width: 100%; padding: 12px; border-radius: 10px;
    border: 1px solid var(--border); background: #161926;
    color: #fff; font-family: inherit; font-size: 14px;
    margin-bottom: 16px;
  }
  .modal-body input:focus { outline: none; border-color: var(--gold); }
  .modal-footer {
    display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;
  }
</style>
</head>
<body>

<!-- تسجيل الدخول -->
<div id="loginOverlay">
  <div class="login-card">
    <h2>👑 لوحة تحكم عبدالإله</h2>
    <p>بوابة التحكم والأمان الرسمية (V4 Master)</p>
    <input type="password" id="adminPassInput" placeholder="أدخل كلمة المرور" autofocus onkeydown="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">تسجيل الدخول</button>
  </div>
</div>

<!-- الترويسة الرئيسية -->
<div class="header">
  <div class="brand">
    <div class="brand-title">👑 لوحة تحكم عبدالإله</div>
    <div class="brand-subtitle">نظام الإدارة والتحكم بالأكواد وإيقاف النسخ (V4 Edition)</div>
  </div>
  <div>
    <button class="btn btn-danger" onclick="purgeAllCodes()">🚨 إيقاف وتصفير شامل لكافة الأكواد</button>
  </div>
</div>

<!-- بطاقات الإحصائيات -->
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-val" id="statTotalKeys">0</div>
    <div class="stat-lbl">🔑 إجمالي الأكواد</div>
  </div>
  <div class="stat-card success">
    <div class="stat-val" id="statApprovedDevices">0</div>
    <div class="stat-lbl">📱 الأجهزة المفعلة</div>
  </div>
  <div class="stat-card danger">
    <div class="stat-val" id="statBlockedCount">0</div>
    <div class="stat-lbl">🚫 الأكواد المقفلة</div>
  </div>
  <div class="stat-card">
    <div class="stat-val" id="statCloudStatus" style="font-size:22px; color:var(--gold);">سحابي ✅</div>
    <div class="stat-lbl">☁️ التخزين الدائم (MongoDB Atlas)</div>
  </div>
</div>

<!-- شريط الإجراءات والبحث -->
<div class="toolbar">
  <div class="actions-group">
    <button class="btn btn-gold" onclick="openGenerateModal()">➕ توليد كود جديد مع اسم الشخص</button>
    <button class="btn btn-outline" onclick="exportBackup()">📥 تصدير نسخة احتياطية</button>
    <button class="btn btn-outline" onclick="triggerRestore()">📤 استعادة نسخة احتياطية</button>
    <input type="file" id="restoreFileInput" style="display:none" onchange="handleRestoreFile(this)">
  </div>
  <div class="search-box">
    <span>🔍</span>
    <input type="text" id="search" placeholder="ابحث باسم الشخص، الكود، نوع الجهاز..." oninput="filterRows()">
  </div>
</div>

<!-- جدول الأكواد والمشتركين -->
<div class="table-wrap">
  <div class="table-box">
    <table>
      <thead>
        <tr>
          <th>الكود (ABOD-)</th>
          <th>صاحب الكود (الاسم)</th>
          <th>الجهاز الفعلي المفعّل</th>
          <th>حالة الأداة</th>
          <th>آخر ظهور</th>
          <th>إجراءات التحكم السريع</th>
        </tr>
      </thead>
      <tbody id="keysTableBody">
        <tr><td colspan="6" style="text-align:center; padding: 40px; color: var(--text-secondary);">جاري تحميل الأكواد...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- مودال توليد كود جديد -->
<div class="modal-overlay" id="generateModal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>➕ توليد أكواد جديدة</h3>
      <button class="modal-close" onclick="closeGenerateModal()">✕</button>
    </div>
    <div class="modal-body">
      <label>عدد الأكواد المطلوبة:</label>
      <input type="number" id="genCount" value="1" min="1" max="50">
      
      <label>اسم صاحب الكود (العميل):</label>
      <input type="text" id="genOwner" placeholder="مثال: فهد المطيري / أبوعبدالله">

      <label>ملاحظات إضافية (اختياري):</label>
      <input type="text" id="genNote" placeholder="مثال: اشتراك شهر / رقم جوال">
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeGenerateModal()">إلغاء</button>
      <button class="btn btn-gold" onclick="submitGenerate()">توليد وتفعيل الكود</button>
    </div>
  </div>
</div>

<!-- مودال تعديل اسم صاحب الكود -->
<div class="modal-overlay" id="editOwnerModal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>✏️ تعديل اسم صاحب الكود</h3>
      <button class="modal-close" onclick="closeEditOwnerModal()">✕</button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="editTargetKey">
      <label>اسم الشخص (العميل):</label>
      <input type="text" id="editOwnerName">
      <label>ملاحظة:</label>
      <input type="text" id="editOwnerNote">
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeEditOwnerModal()">إلغاء</button>
      <button class="btn btn-gold" onclick="submitEditOwner()">حفظ التعديل</button>
    </div>
  </div>
</div>

<script>
let authToken = sessionStorage.getItem('abod_v4_admin_token') || "";
let allKeys = [];

// قاموس الترجمة الذكية لموديلات أجهزة أبل الفعلية
const IPHONE_NAMES = {
  "iPhone17,4": "iPhone 16 Plus",
  "iPhone17,3": "iPhone 16",
  "iPhone17,2": "iPhone 16 Pro Max",
  "iPhone17,1": "iPhone 16 Pro",
  "iPhone16,2": "iPhone 15 Pro Max",
  "iPhone16,1": "iPhone 15 Pro",
  "iPhone15,5": "iPhone 15 Plus",
  "iPhone15,4": "iPhone 15",
  "iPhone15,3": "iPhone 14 Pro Max",
  "iPhone15,2": "iPhone 14 Pro",
  "iPhone14,8": "iPhone 14 Plus",
  "iPhone14,7": "iPhone 14",
  "iPhone14,6": "iPhone SE (3rd gen)",
  "iPhone14,3": "iPhone 13 Pro Max",
  "iPhone14,2": "iPhone 13 Pro",
  "iPhone14,5": "iPhone 13",
  "iPhone14,4": "iPhone 13 mini",
  "iPhone13,4": "iPhone 12 Pro Max",
  "iPhone13,3": "iPhone 12 Pro",
  "iPhone13,2": "iPhone 12",
  "iPhone13,1": "iPhone 12 mini",
  "iPhone12,8": "iPhone SE (2nd gen)",
  "iPhone12,5": "iPhone 11 Pro Max",
  "iPhone12,3": "iPhone 11 Pro",
  "iPhone12,1": "iPhone 11",
  "iPhone11,6": "iPhone XS Max",
  "iPhone11,4": "iPhone XS Max",
  "iPhone11,2": "iPhone XS",
  "iPhone11,8": "iPhone XR",
  "iPhone10,6": "iPhone X",
  "iPhone10,3": "iPhone X",
  "iPhone10,5": "iPhone 8 Plus",
  "iPhone10,2": "iPhone 8 Plus",
  "iPhone10,4": "iPhone 8",
  "iPhone10,1": "iPhone 8"
};

function formatDeviceModel(model) {
  if (!model) return "آيفون (غير معروف)";
  return IPHONE_NAMES[model] || model;
}

if (authToken) {
  testToken(authToken);
}

function doLogin() {
  const p = document.getElementById('adminPassInput').value.trim();
  if (!p) return;
  testToken(p);
}

async function testToken(token) {
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
      alert('كلمة المرور غير صحيحة!');
    }
  } catch (e) {
    alert('تعذر الاتصال بالسيرفر');
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
    document.getElementById('statCloudStatus').innerText = data.cloud_active ? "متصل دائم ✅" : "محلي ⚠️";

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
    
    // تفاصيل الجهاز الفعلي
    let deviceCellHtml = '';
    if (acts.length === 0) {
      deviceCellHtml = '<span style="color:var(--text-muted); font-size:13px;">بانتظار الربط بأول جهاز...</span>';
    } else {
      deviceCellHtml = acts.map(a => {
        const friendlyModel = formatDeviceModel(a.device_model);
        const devName = a.device_name || "آيفون";
        const iosVer = a.ios_version ? ('iOS ' + a.ios_version) : '';
        return \`<div class="device-info-box">
          <div class="device-model-badge">📱 \${friendlyModel} <small style="color:var(--text-muted); font-size:11px;">(\${a.device_model || ''})</small></div>
          <div class="device-name-sub">\${devName} \${iosVer ? '• ' + iosVer : ''}</div>
          <div class="device-hwid" title="\${a.device_id}">\${a.device_id.substring(0, 18)}...</div>
        </div>\`;
      }).join('<hr style="border:none; border-top:1px solid #1e2235; margin:6px 0;">');
    }

    // اسم الشخص (صاحب الكود)
    const ownerName = k.owner_name || "غير محدد";
    const noteBadge = k.note ? \`<div style="font-size:11px; color:var(--text-muted);">\${k.note}</div>\` : '';

    // حالة الكود والأداة
    const statusHtml = isKeyBlocked ?
      '<span class="status-pill blocked"><span class="status-dot"></span> مقفل نهائياً</span>' :
      '<span class="status-pill active"><span class="status-dot"></span> نشط ومفعل</span>';

    // تاريخ آخر ظهور
    let lastSeenStr = '-';
    if (acts.length > 0 && acts[0].last_seen) {
      lastSeenStr = new Date(acts[0].last_seen).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    return \`<tr>
      <td>
        <div class="key-badge">
          \${k.key}
          <button onclick="copyText('\${k.key}')" style="background:none; border:none; cursor:pointer; font-size:13px;" title="نسخ الكود">📋</button>
        </div>
      </td>
      <td>
        <div class="owner-tag">
          👤 \${ownerName}
          <button class="owner-edit-btn" onclick="openEditOwnerModal('\${k.key}', '\${encodeURIComponent(ownerName)}', '\${encodeURIComponent(k.note || '')}')" title="تعديل اسم الشخص">✏️</button>
        </div>
        \${noteBadge}
      </td>
      <td>\${deviceCellHtml}</td>
      <td>\${statusHtml}</td>
      <td style="color:var(--text-secondary); font-size:12.5px;">\${lastSeenStr}</td>
      <td>
        <div class="actions-cell">
          <button class="act-btn \${isKeyBlocked ? 'act-btn-unlock' : 'act-btn-lock'}" onclick="toggleKeyLock('\${k.key}')">
            \${isKeyBlocked ? '🔓 تفعيل الأداة' : '🔒 قفل الأداة'}
          </button>
          <button class="act-btn act-btn-reset" onclick="resetKeyHWID('\${k.key}')" title="فك ارتباط الجهاز الحالي ليعمل على جهاز جديد">
            🔄 فك الارتباط
          </button>
          <button class="act-btn act-btn-delete" onclick="deleteKeyPermanent('\${k.key}')" title="حذف نهائي">
            🗑️
          </button>
        </div>
      </td>
    </tr>\`;
  }).join('');
}

// فتح وإغلاق مودال التوليد
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

// فتح وإغلاق مودال تعديل اسم الشخص
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

// قفل وفك قفل الأداة (Kill-Switch)
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

// فك ارتباط الجهاز لنقله
async function resetKeyHWID(key) {
  if (!confirm('هل تريد فك ارتباط الجهاز المرتبط بهذا الكود ليتمكن المستخدم من تفعيله على جهاز جديد؟')) return;
  const res = await fetch('/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  const data = await res.json();
  alert(data.message);
  loadData();
}

// حذف الكود نهائياً
async function deleteKeyPermanent(key) {
  if (!confirm('⚠️ هل أنت متأكد من حذف هذا الكود نهائياً؟ سيتم إلغاء صلاحية الأداة على جهاز المستخدم فوراً.')) return;
  const res = await fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  const data = await res.json();
  alert(data.message);
  loadData();
}

// تصفير شامل
async function purgeAllCodes() {
  if (!confirm('🚨 تحذير شديد الخطورة:\nهل تريد قفل وإلغاء جميع الأكواد وتصفير قاعدة البيانات بالكامل؟\nستتوقف الأداة عند جميع المشتركين بدون استثناء!')) return;
  const res = await fetch('/api/admin/purge_all', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  const data = await res.json();
  alert(data.message);
  loadData();
}

function copyText(t) {
  navigator.clipboard.writeText(t).then(() => alert('تم نسخ الكود: ' + t));
}

function exportBackup() {
  window.location.href = '/api/admin/backup?token=' + encodeURIComponent(authToken);
}

function triggerRestore() {
  document.getElementById('restoreFileInput').click();
}

function handleRestoreFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const json = JSON.parse(e.target.result);
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
</html>`);
});

// صفحة 404 للمسارات غير المعروفة (Stealth Mode)
app.use((req, res) => {
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family: sans-serif; padding: 40px; background: #fff; color: #222;"><h1>404 Not Found</h1><p>The requested URL ' + req.originalUrl + ' was not found on this server.</p><hr><address style="font-size: 13px; color: #777;">Apache/2.4.52 (Ubuntu) Server</address></body></html>');
});

const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || 'https://yalla-upd0.onrender.com/api/health';
setInterval(() => {
  try {
    https.get(KEEP_ALIVE_URL, (res) => {}).on('error', () => {});
  } catch (e) {}
}, 7 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running securely on port ' + PORT);
});
