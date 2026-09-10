const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.set('trust proxy', true);

// ==========================================
// 🛡️ هيدرز منع الكاش نهائياً (Anti-Caching)
// يمنع أجهزة الآيفون وشبكات النت من تخزين أي رد قديم
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

// المسار السري الخاص بلوحة التحكم
const ADMIN_PATH = process.env.ADMIN_PATH || "abod-master-7788";

// تدوير وتغيير المفتاح السري لمنع قبول أي توكن قديم صادر سابقاً
const JWT_SECRET_SALT = process.env.JWT_SECRET || "ABOD_V4_SECURE_SALT_998877665544332211";

const DB_FILE = path.join(__dirname, 'database.json');

// الجيل الجديد V4: أمر تنفيذي بإيقاف وتصفير شامل لكافة الأكواد والأجهزة المسجلة مسبقاً
const CURRENT_EPOCH = "V4_ABOD_HARD_RESET_2026";

// الأكواد المدمجة (فارغة لضمان تطبيق سياسة القائمة البيضاء الصارمة)
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
    if (!parsed.keys) {
      parsed.keys = [];
    }
    if (parsed.epoch !== CURRENT_EPOCH) {
      console.log("🚨 [V4 HARD RESET] تصفير وقفل شامل لكافة الأكواد والـ HWID السابقة نهائياً على الجميع!");
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

// ==========================================
// 🛡️ دالة الاستجابة للرفض والقفل الفوري (Strict Whitelist Rejection)
// تُرجع رد HTTP 403 Forbidden مع بنية JSON الصارمة
// ==========================================
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

// ==========================================
// 🛡️ حماية لوحة التحكم بكلمة المرور abod2026
// ==========================================
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

// ==========================================
// 🔍 استخراج مدخلات الأجهزة والأكواد بدقة
// ==========================================
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

// -------------------------------------------------------------
// 1. محرك توليد الأكواد الجديد بالصيغة الموحدة: ABOD-XXXX-XXXX-XXXX
// -------------------------------------------------------------
function generateNewKeyString() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = () => {
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
  };
  return `ABOD-${segment()}-${segment()}-${segment()}`;
}

// -------------------------------------------------------------
// 2. معالج تفعيل الأكواد الصارم (Validate Key Handler)
// سياسة القائمة البيضاء: أي كود قديم أو محذوف يُرد عليه بـ 403 فوري
// -------------------------------------------------------------
function handleValidate(req, res) {
  const { key, deviceId, deviceName, deviceModel, iosVersion, bundleId } = extractRequestParams(req);

  // إذا لم يتم إرسال كود أو جهاز -> رد 403 فوري
  if (!key || !deviceId) {
    return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
  }

  const cleanKey = String(key).trim().toUpperCase();

  // فحص فوري: أي كود لا يبدأ بـ ABOD- يُرفض فوراً بدون استهلاك لقاعدة البيانات
  if (!cleanKey.startsWith('ABOD-')) {
    return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
  }

  const db = loadDB();
  const keyObj = (db.keys || []).find(k => k.key && k.key.trim().toUpperCase() === cleanKey);

  // إذا لم يكن الكود موجوداً ومفعلاً في القائمة البيضاء الجديدة -> رد 403 فوري
  if (!keyObj) {
    return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
  }

  if (!keyObj.activations) {
    keyObj.activations = [];
  }

  let thisDevice = keyObj.activations.find(a => a.device_id === deviceId);

  if (thisDevice) {
    if (thisDevice.status === 'rejected' || thisDevice.status === 'blocked') {
      return res.status(403).json(buildLockedResponse("🚫 تم إيقاف وقفل الأداة عن هذا الجهاز من قِبل الإدارة"));
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

  // ربط الكود بجهاز واحد فقط (Single HWID Binding) لمنع مشاركة الكود
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
    message: "👑 تم تفعيل وحفظ جهازك بنجاح!" 
  });
}

// -------------------------------------------------------------
// 3. معالج فحص النسخ المكررة والفرعية (Check Device Handler)
// -------------------------------------------------------------
function handleCheckDevice(req, res) {
  const { deviceId, deviceName, deviceModel, iosVersion } = extractRequestParams(req);

  if (!deviceId) {
    return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
  }

  const db = loadDB();
  for (const k of (db.keys || [])) {
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

  // إذا لم يكن الجهاز مسجلاً ضمن الأجهزة المفعلة بالكود الجديد -> 403 فوري
  return res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
}

// -------------------------------------------------------------
// 4. تسجيل مسارات الفحص بكافة التسميات الممكنة عبر كل الإصدارات
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// 5. مسار فحص حالة السيرفر (Health Check & Keep-Alive)
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: "alive", time: Date.now(), cloud: isMongoActive, epoch: CURRENT_EPOCH });
});

// -------------------------------------------------------------
// 6. Admin APIs: إدارة وتوليد الأكواد الجديدة
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
    epoch: CURRENT_EPOCH,
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
  const { count, note } = req.body;
  const num = Math.min(Math.max(parseInt(count) || 1, 1), 100);
  const db = loadDB();
  const newKeys = [];

  for (let i = 0; i < num; i++) {
    const key = generateNewKeyString();
    const keyItem = {
      key: key,
      created_at: new Date().toISOString(),
      note: note || "",
      activations: []
    };
    db.keys.push(keyItem);
    newKeys.push(key);
  }

  saveDB(db);
  res.json({ success: true, keys: newKeys, count: newKeys.length });
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
  res.json({ success: true, message: "تم رفض الجهاز بنجاح" });
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
  res.json({ success: true, message: "تم مسح ارتباط الجهاز وإتاحة الكود مجدداً" });
});

// قفل وتصفير شامل لجميع الأكواد والأجهزة فورياً
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
    if (incomingKey && incomingKey.key && incomingKey.key.startsWith('ABOD-') && !existingKeyMap.has(incomingKey.key)) {
      db.keys.push(incomingKey);
      added++;
    }
  });

  saveDB(db);
  res.json({ success: true, message: 'تم استعادة ودمج ' + added + ' كود بنجاح!' });
});

// -------------------------------------------------------------
// 🛡️ معالج حماية شامل لأي مسار API غير معروف (Strict 403 Whitelist)
// -------------------------------------------------------------
app.all('/api/*', (req, res) => {
  res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
});

// وأي طلب POST أو PUT موجه لأي مسار في السيرفر لا يخص لوحة التحكم: 403 أيضاً
app.post('*', (req, res) => {
  res.status(403).json(buildLockedResponse("Key Expired or Invalid"));
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
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 لوحة تحكم عبدالإله — V4 Master Control</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-base: #0a0a0f;
    --bg-card: #12121a;
    --border: #1e1e2d;
    --gold: #d4af37;
    --gold-hover: #b89628;
    --text-primary: #f0f0f5;
    --text-secondary: #8a8a9e;
    --danger: #e74c3c;
    --success: #2ecc71;
    --warning: #f39c12;
    --info: #3498db;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', sans-serif;
    background: var(--bg-base);
    color: var(--text-primary);
    min-height: 100vh;
  }
  #loginOverlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(10, 10, 15, 0.98);
    display: flex; justify-content: center; align-items: center;
    z-index: 9999;
  }
  .login-box {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 35px;
    width: 360px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
  }
  .login-box h2 {
    color: var(--gold);
    margin-bottom: 25px;
    font-size: 22px;
  }
  .login-box input {
    width: 100%;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #181824;
    color: #fff;
    font-family: inherit;
    font-size: 15px;
    margin-bottom: 15px;
    text-align: center;
  }
  .login-box button {
    width: 100%;
    padding: 12px;
    background: var(--gold);
    color: #0a0a0f;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
  }
  .topbar {
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    padding: 16px 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .topbar h1 {
    font-size: 20px;
    color: var(--gold);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    padding: 25px 30px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
  }
  .stat-card .val {
    font-size: 28px;
    font-weight: 900;
    color: var(--gold);
  }
  .stat-card .lbl {
    font-size: 13px;
    color: var(--text-secondary);
  }
  .actions-bar {
    padding: 0 30px 20px 30px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  .btn {
    padding: 10px 18px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .btn-gold { background: var(--gold); color: #000; }
  .btn-gold:hover { background: var(--gold-hover); }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-info { background: var(--info); color: #fff; }
  .table-container {
    padding: 0 30px 40px 30px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--bg-card);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  th, td {
    padding: 14px 18px;
    text-align: right;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  th {
    background: #161622;
    color: var(--gold);
    font-weight: 700;
  }
  .badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
  }
  .badge-success { background: rgba(46, 204, 113, 0.2); color: var(--success); }
  .badge-danger { background: rgba(231, 76, 60, 0.2); color: var(--danger); }
  .badge-warning { background: rgba(243, 156, 18, 0.2); color: var(--warning); }
</style>
</head>
<body>

<div id="loginOverlay">
  <div class="login-box">
    <h2>👑 لوحة تحكم عبدالإله</h2>
    <input type="password" id="adminPassInput" placeholder="أدخل كلمة المرور" autofocus onkeydown="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">تسجيل الدخول</button>
  </div>
</div>

<div class="topbar">
  <h1>👑 إدارة الأكواد الرسمية (V4 Master Suite)</h1>
  <div>
    <button class="btn btn-danger" onclick="purgeAllCodes()">🚨 إيقاف وتصفير شامل لكافة النسخ</button>
  </div>
</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="val" id="statTotalKeys">0</div>
    <div class="lbl">إجمالي الأكواد المفعلة</div>
  </div>
  <div class="stat-card">
    <div class="val" id="statApprovedDevices">0</div>
    <div class="lbl">الأجهزة المعتمدة</div>
  </div>
  <div class="stat-card">
    <div class="val" id="statPendingDevices">0</div>
    <div class="lbl">أجهزة بانتظار الموافقة</div>
  </div>
  <div class="stat-card">
    <div class="val" id="statCloudStatus">سحابي</div>
    <div class="lbl">حالة التخزين (Atlas)</div>
  </div>
</div>

<div class="actions-bar">
  <button class="btn btn-gold" onclick="generateKeysPrompt()">➕ توليد أكواد جديدة (ABOD-)</button>
  <button class="btn btn-info" onclick="exportBackup()">📥 تحميل نسخة احتياطية</button>
  <button class="btn btn-info" onclick="triggerRestore()">📤 استعادة نسخة احتياطية</button>
  <input type="file" id="restoreFileInput" style="display:none" onchange="handleRestoreFile(this)">
  <input type="text" id="search" placeholder="بحث عن كود أو جهاز..." style="padding: 10px 15px; border-radius: 8px; border: 1px solid var(--border); background: #12121a; color: #fff; margin-right: auto; width: 260px;" oninput="filterRows()">
</div>

<div class="table-container">
  <table>
    <thead>
      <tr>
        <th>الكود (ABOD-)</th>
        <th>الأجهزة المرتبطة (HWID)</th>
        <th>الحالة</th>
        <th>تاريخ الإنشاء</th>
        <th>الإجراءات</th>
      </tr>
    </thead>
    <tbody id="keysTableBody">
      <tr><td colspan="5" style="text-align:center; padding: 30px; color: var(--text-secondary);">لا توجد أكواد مسجلة (تم التصفير بنجاح)</td></tr>
    </tbody>
  </table>
</div>

<script>
let authToken = sessionStorage.getItem('abod_v4_admin_token') || "";
let allKeys = [];

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
    document.getElementById('statPendingDevices').innerText = data.pendingCount || 0;
    document.getElementById('statCloudStatus').innerText = data.cloud_active ? "متصل دائم ✅" : "محلي ⚠️";

    renderTable(allKeys);
  } catch (e) {
    console.error(e);
  }
}

function renderTable(keys) {
  const tbody = document.getElementById('keysTableBody');
  if (!keys || keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px; color: var(--text-secondary);">لا توجد أكواد مسجلة</td></tr>';
    return;
  }

  tbody.innerHTML = keys.map(k => {
    const acts = k.activations || [];
    const devicesHtml = acts.length === 0 ? '<span style="color:var(--text-secondary)">لم يرتبط بجهاز بعد</span>' : acts.map(a => {
      let badgeClass = a.status === 'approved' ? 'badge-success' : (a.status === 'blocked' || a.status === 'rejected' ? 'badge-danger' : 'badge-warning');
      let statusText = a.status === 'approved' ? 'مفعل' : (a.status === 'blocked' ? 'مقفل' : 'بانتظار');
      return \`<div style="margin-bottom: 6px;">
        \${a.device_name || 'iPhone'} (\${a.device_model || 'iOS'}) <span class="badge \${badgeClass}">\${statusText}</span>
        <br><small style="color:var(--text-secondary)">\${a.device_id}</small>
        <div style="margin-top: 4px;">
          \${a.status !== 'approved' ? \`<button onclick="approveDevice('\${k.key}','\${a.device_id}')" style="font-size:11px; padding:2px 6px; cursor:pointer;">قبول</button>\` : ''}
          \${a.status === 'approved' ? \`<button onclick="lockDevice('\${k.key}','\${a.device_id}')" style="font-size:11px; padding:2px 6px; cursor:pointer; color:red;">قفل</button>\` : ''}
        </div>
      </div>\`;
    }).join('');

    return \`<tr>
      <td style="font-family: monospace; font-weight: 700; color: var(--gold);">
        \${k.key} 
        <button onclick="copyText('\${k.key}')" style="background:none; border:none; cursor:pointer; color:#fff;" title="نسخ">📋</button>
      </td>
      <td>\${devicesHtml}</td>
      <td><span class="badge badge-success">نشط</span></td>
      <td style="color:var(--text-secondary); font-size:12px;">\${new Date(k.created_at).toLocaleString('ar-SA')}</td>
      <td>
        <button onclick="resetKey('\${k.key}')" class="btn" style="background:#444; color:#fff; padding:4px 8px; font-size:12px;">فك الارتباط</button>
        <button onclick="deleteKey('\${k.key}')" class="btn btn-danger" style="padding:4px 8px; font-size:12px;">حذف</button>
      </td>
    </tr>\`;
  }).join('');
}

async function generateKeysPrompt() {
  const count = prompt('كم عدد الأكواد المطلوب توليدها؟', '1');
  if (!count) return;
  const note = prompt('ملاحظة للكود (اسم المشتري مثلاً):', '');

  const res = await fetch('/api/admin/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ count: parseInt(count), note: note })
  });
  const data = await res.json();
  if (data.success) {
    alert('تم توليد ' + data.count + ' كود بنجاح بصيغة ABOD-');
    loadData();
  }
}

async function approveDevice(key, deviceId) {
  await fetch('/api/admin/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function lockDevice(key, deviceId) {
  await fetch('/api/admin/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function resetKey(key) {
  if (!confirm('هل تريد مسح الأجهزة المرتبطة بهذا الكود ليعاد استخدامه؟')) return;
  await fetch('/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  loadData();
}

async function deleteKey(key) {
  if (!confirm('هل أنت متأكد من حذف هذا الكود نهائياً وإلغاء صلاحيته على الأجهزة؟')) return;
  await fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  loadData();
}

async function purgeAllCodes() {
  if (!confirm('⚠️ تحذير شديد الخطورة: هل تريد قفل وإلغاء جميع الأكواد وتصفير قاعدة البيانات بالكامل؟ جميع الأجهزة ستقفل فوراً!')) return;
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

// ==========================================
// 🚀 نظام الحفاظ على يقظة السيرفر (Self Keep-Alive)
// يمنع خادم Render المجاني من الدخول في وضع النوم (Spin-Down)
// ==========================================
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || 'https://yalla-upd0.onrender.com/api/health';
setInterval(() => {
  try {
    https.get(KEEP_ALIVE_URL, (res) => {
      // Keep-alive successful
    }).on('error', () => {
      // Ignore network hiccup
    });
  } catch (e) {}
}, 7 * 60 * 1000); // كل 7 دقائق

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running securely on port ' + PORT);
});
