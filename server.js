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
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ==========================================
// ⚙️ الإعدادات والمفاتيح الأساسية
// ==========================================
const CURRENT_EPOCH = "V5_ABOD_TOTAL_RESET_2026";
const ADMIN_PATH = "abod-master-7788";
const ADMIN_TOKEN = "12Qwaszx@@";
const JWT_SECRET_SALT = process.env.JWT_SECRET || "ABOD_V5_SECURE_HMAC_SECRET_2026_MASTER";
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "";

const DB_FILE = path.join(__dirname, 'database.json');
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
      console.log("🚨 [V5 HARD RESET] تصفير وقفل شامل لكافة الأكواد والـ HWID السابقة!");
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

if (MONGO_URI) {
  (async () => {
    try {
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const db = client.db('yallasniper_cloud');
      mongoCollection = db.collection('system_state');
      isMongoActive = true;
      console.log("✅ [MONGODB ATLAS] متصل بنجاح بالسحابة الدائمة!");

      const remoteDoc = await mongoCollection.findOne({ _id: 'master_license_store' });
      if (remoteDoc) {
        if (remoteDoc.epoch !== CURRENT_EPOCH) {
          console.log("🚨 [MONGO V5 PURGE] تصفير وقفل السحابة نهائياً!");
          await mongoCollection.updateOne(
            { _id: 'master_license_store' },
            { $set: { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT, updatedAt: new Date().toISOString() } },
            { upsert: true }
          );
          memoryDB = { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
        } else {
          memoryDB = { epoch: CURRENT_EPOCH, keys: remoteDoc.keys || [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT };
        }
      } else {
        await mongoCollection.updateOne(
          { _id: 'master_license_store' },
          { $set: { _id: 'master_license_store', epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
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
    } catch (e) {
      console.error("[MONGO WRITE ERROR]", e.message);
    }
  }
}

// ==========================================
// 🔒 دالة الرفض والإغلاق الشامل لكافة الأجهزة (Killswitch)
// ==========================================
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
    killswitch: true,
    disabled: true,
    error: "REVOKED",
    code: 403,
    key: null,
    needs_approval: false,
    needsApproval: false,
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
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '').trim();
  } else if (req.query && (req.query.token || req.query.pass || req.query.password)) {
    token = String(req.query.token || req.query.pass || req.query.password).trim();
  } else if (req.body && (req.body.token || req.body.pass || req.body.password)) {
    token = String(req.body.token || req.body.pass || req.body.password).trim();
  }

  if (checkAdminPassword(token) || token === ADMIN_TOKEN || token === (process.env.ADMIN_TOKEN || "").trim()) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: "UNAUTHORIZED_ADMIN_ACCESS",
    message: "🚫 كلمة مرور لوحة التحكم غير صحيحة"
  });
}

function extractDevicePayload(req) {
  const b = req.body || {};
  const q = req.query || {};
  const h = req.headers || {};

  const key = (b.key || b.license || b.licenseKey || b.token || q.key || q.token || "").trim();
  const deviceId = (b.deviceId || b.deviceUUID || b.uuid || b.hwid || b.hardwareId ||
                    q.deviceId || q.deviceUUID || q.uuid || q.hwid ||
                    h['x-hwid'] || h['x-device-id'] || "").trim();
  const deviceName = (b.deviceName || b.name || q.deviceName || "").trim();
  const deviceModel = (b.deviceModel || b.model || q.deviceModel || "").trim();
  const iosVersion = (b.iosVersion || b.version || q.iosVersion || "").trim();
  const bundleId = (b.bundleId || b.bundle || q.bundleId || "").trim();

  return { key, deviceId, deviceName, deviceModel, iosVersion, bundleId };
}

// ==========================================
// 📡 معالجة مسارات التحقق للأجهزة
// ==========================================
async function handleCheckDevice(req, res) {
  const { deviceId, deviceName, deviceModel, iosVersion, bundleId } = extractDevicePayload(req);

  if (!deviceId) {
    return res.json(buildLockedResponse("معرف الجهاز غير صالح"));
  }

  const db = memoryDB;
  let boundKey = null;

  for (const k of db.keys) {
    if (k.devices && Array.isArray(k.devices)) {
      const dev = k.devices.find(d => d.deviceId === deviceId);
      if (dev) {
        boundKey = { keyObj: k, devObj: dev };
        break;
      }
    }
  }

  if (!boundKey) {
    return res.json(buildLockedResponse("الجهاز غير مسجل أو محذوف من النظام"));
  }

  const { keyObj, devObj } = boundKey;

  if (keyObj.status === 'blocked' || keyObj.active === false) {
    return res.json(buildLockedResponse("🚫 هذا الكود محظور بالكامل من الإدارة"));
  }

  if (devObj.status === 'blocked' || devObj.approved === false) {
    return res.json(buildLockedResponse("🚫 تم قفل هذا الجهاز بشكل خاص من الإدارة"));
  }

  if (keyObj.expiresAt) {
    const exp = new Date(keyObj.expiresAt).getTime();
    if (!isNaN(exp) && Date.now() > exp) {
      return res.json(buildLockedResponse("⌛ انتهت صلاحية الكود"));
    }
  }

  devObj.lastSeen = new Date().toISOString();
  if (deviceName) devObj.deviceName = deviceName;
  if (deviceModel) devObj.deviceModel = deviceModel;
  if (iosVersion) devObj.iosVersion = iosVersion;
  if (bundleId) devObj.bundleId = bundleId;
  persistDB(db);

  return res.json({
    status: "approved",
    message: "تم تفعيل الجهاز بنجاح",
    valid: true,
    approved: true,
    active: true,
    success: true,
    allowed: true,
    licensed: true,
    code: 200,
    key: keyObj.key,
    owner: keyObj.owner || "مستخدم",
    device_status: "approved",
    needs_approval: false,
    needsApproval: false
  });
}

async function handleValidate(req, res) {
  const { key, deviceId, deviceName, deviceModel, iosVersion, bundleId } = extractDevicePayload(req);

  if (!key) {
    return res.json(buildLockedResponse("لم يتم إرسال كود التفعيل"));
  }

  const db = memoryDB;
  const keyObj = db.keys.find(k => k.key.toUpperCase() === key.toUpperCase());

  if (!keyObj) {
    return res.json(buildLockedResponse("🚫 الكود غير مسجل في النظام نهائياً"));
  }

  if (keyObj.status === 'blocked' || keyObj.active === false) {
    return res.json(buildLockedResponse("🚫 هذا الكود ملغي ومحظور من الإدارة"));
  }

  if (keyObj.expiresAt) {
    const exp = new Date(keyObj.expiresAt).getTime();
    if (!isNaN(exp) && Date.now() > exp) {
      return res.json(buildLockedResponse("⌛ انتهت صلاحية هذا الكود"));
    }
  }

  if (deviceId) {
    if (!keyObj.devices) keyObj.devices = [];
    let devObj = keyObj.devices.find(d => d.deviceId === deviceId);

    if (devObj) {
      if (devObj.status === 'blocked' || devObj.approved === false) {
        return res.json(buildLockedResponse("🚫 هذا الجهاز مقفل من الإدارة"));
      }
      devObj.lastSeen = new Date().toISOString();
      if (deviceName) devObj.deviceName = deviceName;
      if (deviceModel) devObj.deviceModel = deviceModel;
      if (iosVersion) devObj.iosVersion = iosVersion;
      if (bundleId) devObj.bundleId = bundleId;
    } else {
      const maxSlots = keyObj.maxDevices || 1;
      if (keyObj.devices.length >= maxSlots) {
        return res.json(buildLockedResponse(`تجاوزت الحد المسموح للأجهزة (${maxSlots} جهاز)`));
      }
      devObj = {
        deviceId,
        deviceName: deviceName || "iPhone",
        deviceModel: deviceModel || "Apple Device",
        iosVersion: iosVersion || "iOS",
        bundleId: bundleId || "com.yalla.lite",
        status: "approved",
        approved: true,
        firstActivated: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      keyObj.devices.push(devObj);
    }

    persistDB(db);

    return res.json({
      status: "approved",
      message: "تم تفعيل الكود بنجاح",
      valid: true,
      approved: true,
      active: true,
      success: true,
      allowed: true,
      licensed: true,
      code: 200,
      key: keyObj.key,
      owner: keyObj.owner || "مستخدم",
      expiresAt: keyObj.expiresAt || null,
      device: devObj
    });
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
  res.json({
    status: "online",
    epoch: memoryDB.epoch,
    cloud_active: isMongoActive,
    total_keys: memoryDB.keys ? memoryDB.keys.length : 0
  });
});

app.get('/api/admin/keys', requireAdminAuth, (req, res) => {
  const db = memoryDB;
  let totalKeys = db.keys.length;
  let approvedCount = 0;
  let blockedCount = 0;
  let pendingCount = 0;

  db.keys.forEach(k => {
    if (k.status === 'blocked' || k.active === false) {
      blockedCount++;
    } else {
      approvedCount++;
    }
    if (k.devices && Array.isArray(k.devices)) {
      k.devices.forEach(d => {
        if (d.status === 'blocked' || d.approved === false) {
          blockedCount++;
        }
      });
    }
  });

  return res.json({
    success: true,
    keys: db.keys,
    pendingCount: pendingCount,
    cloud_active: isMongoActive,
    epoch: db.epoch,
    stats: {
      total_keys: totalKeys,
      approved: approvedCount,
      pending: pendingCount,
      blocked: blockedCount
    }
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

  const newKeyObj = {
    key,
    owner: ownerName,
    status: "active",
    active: true,
    createdAt: now.toISOString(),
    expiresAt,
    durationDays: days,
    maxDevices: slots,
    devices: []
  };

  const db = memoryDB;
  db.keys.unshift(newKeyObj);
  await persistDB(db);

  return res.json({ success: true, key: newKeyObj });
});

app.post('/api/admin/edit_owner', requireAdminAuth, async (req, res) => {
  const { key, newOwner } = req.body;
  if (!key || !newOwner) return res.status(400).json({ success: false, message: "بيانات ناقصة" });

  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false, message: "الكود غير موجود" });

  k.owner = String(newOwner).trim();
  await persistDB(db);
  return res.json({ success: true, key: k });
});

app.post('/api/admin/toggle_lock', requireAdminAuth, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false, message: "الكود مطلوب" });

  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false, message: "الكود غير موجود" });

  if (k.status === 'blocked' || k.active === false) {
    k.status = 'active';
    k.active = true;
  } else {
    k.status = 'blocked';
    k.active = false;
  }

  await persistDB(db);
  return res.json({ success: true, key: k });
});

app.post('/api/admin/approve', requireAdminAuth, async (req, res) => {
  const { key, deviceId } = req.body;
  if (!key || !deviceId) return res.status(400).json({ success: false, message: "بيانات ناقصة" });

  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false, message: "الكود غير موجود" });

  const dev = (k.devices || []).find(d => d.deviceId === deviceId);
  if (!dev) return res.status(404).json({ success: false, message: "الجهاز غير موجود" });

  dev.status = "approved";
  dev.approved = true;
  await persistDB(db);

  return res.json({ success: true, device: dev });
});

app.post('/api/admin/lock_device', requireAdminAuth, async (req, res) => {
  const { key, deviceId } = req.body;
  if (!key || !deviceId) return res.status(400).json({ success: false, message: "بيانات ناقصة" });

  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false, message: "الكود غير موجود" });

  const dev = (k.devices || []).find(d => d.deviceId === deviceId);
  if (!dev) return res.status(404).json({ success: false, message: "الجهاز غير موجود" });

  dev.status = (dev.status === "blocked") ? "approved" : "blocked";
  dev.approved = (dev.status === "approved");
  await persistDB(db);

  return res.json({ success: true, device: dev });
});

app.post('/api/admin/delete', requireAdminAuth, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false, message: "الكود مطلوب" });

  const db = memoryDB;
  db.keys = db.keys.filter(x => x.key.toUpperCase() !== key.toUpperCase());
  await persistDB(db);
  return res.json({ success: true, message: "تم حذف الكود وقفل أجهزته نهائياً" });
});

app.post('/api/admin/reset', requireAdminAuth, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false, message: "الكود مطلوب" });

  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false, message: "الكود غير موجود" });

  k.devices = [];
  await persistDB(db);
  return res.json({ success: true, message: "تم تصفير ارتباط الأجهزة بنجاح" });
});

app.post('/api/admin/purge_all', requireAdminAuth, async (req, res) => {
  const db = memoryDB;
  db.keys = [];
  db.epoch = "V5_PURGED_" + Date.now();
  await persistDB(db);

  if (isMongoActive && mongoCollection) {
    try {
      await mongoCollection.updateOne(
        { _id: 'master_license_store' },
        { $set: { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, secretSalt: JWT_SECRET_SALT, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (e) {}
  }

  return res.json({
    success: true,
    message: "🚨 تم تصفير وقفل جميع الأكواد والأجهزة المسجلة فوراً وبشكل جذري!"
  });
});

app.get('/api/admin/backup', requireAdminAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="yalla_backup_${Date.now()}.json"`);
  res.send(JSON.stringify(memoryDB, null, 2));
});

app.post('/api/admin/restore', requireAdminAuth, async (req, res) => {
  try {
    const rawData = req.body;
    if (!rawData || !Array.isArray(rawData.keys)) {
      return res.status(400).json({ success: false, message: "ملف النسخة الاحتياطية غير صالح" });
    }
    memoryDB.keys = rawData.keys;
    if (rawData.epoch) memoryDB.epoch = rawData.epoch;
    await persistDB(memoryDB);
    return res.json({ success: true, message: `تمت استعادة ${rawData.keys.length} كود بنجاح!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: "فشل الاستعادة: " + err.message });
  }
});

// ==========================================
// 🎨 صفحة لوحة التحكم (محمية ومؤمنة وخالية من الأخطاء)
// ==========================================
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة التحكم | عبدالإله 👑</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(18, 24, 38, 0.9);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --danger: #ef4444;
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
    body {
      background-color: var(--bg);
      background-image:
        radial-gradient(at 0% 0%, rgba(79, 70, 229, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(245, 158, 11, 0.08) 0px, transparent 50%);
      background-attachment: fixed;
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 800; }
    .brand-badge {
      background: linear-gradient(135deg, #4f46e5, #ec4899);
      color: white;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
    }
    .header-actions { display: flex; gap: 10px; align-items: center; }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid transparent;
      transition: all 0.2s ease;
    }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn-danger { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); }
    .btn-danger:hover { background: var(--danger); color: white; }
    .btn-secondary { background: rgba(255, 255, 255, 0.06); color: var(--text); border-color: var(--card-border); }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }
    .btn-sm { padding: 5px 10px; font-size: 13px; }
    .container {
      max-width: 1300px;
      width: 100%;
      margin: 0 auto;
      padding: 24px;
      flex: 1;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
      backdrop-filter: blur(8px);
    }
    .stat-title { font-size: 13px; color: var(--text-muted); margin-bottom: 6px; }
    .stat-value { font-size: 28px; font-weight: 800; color: #fff; }
    .control-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      align-items: center;
      justify-content: space-between;
    }
    .form-group { display: flex; gap: 8px; flex-wrap: wrap; }
    input, select {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 9px 14px;
      color: white;
      font-size: 14px;
      outline: none;
    }
    input:focus, select:focus { border-color: var(--primary); }
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      overflow-x: auto;
      backdrop-filter: blur(8px);
    }
    table { width: 100%; border-collapse: collapse; text-align: right; }
    th {
      background: rgba(15, 23, 42, 0.5);
      padding: 14px 18px;
      font-size: 13px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 14px 18px;
      font-size: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: middle;
    }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .key-badge {
      font-family: monospace;
      background: rgba(79, 70, 229, 0.15);
      border: 1px solid rgba(79, 70, 229, 0.3);
      color: #a5b4fc;
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 14px;
      user-select: all;
    }
    .badge { padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .badge-active { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-blocked { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
    .action-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    #loginModal {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #090d16;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .login-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 36px;
      border-radius: var(--radius);
      width: 100%;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .login-box input {
      width: 100%;
      margin: 18px 0;
      padding: 12px 16px;
      font-size: 16px;
      text-align: center;
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .login-box .btn { width: 100%; padding: 12px; justify-content: center; font-size: 16px; }
  </style>
</head>
<body>

<div id="loginModal">
  <div class="login-box">
    <div style="font-size: 48px; margin-bottom: 12px;">👑</div>
    <h2 style="margin-bottom: 6px; font-weight: 800;">لوحة تحكم عبدالإله</h2>
    <p style="color: var(--text-muted); font-size: 14px;">أدخل كلمة المرور للمتابعة</p>
    <div id="loginError" style="display:none; color:#fca5a5; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:8px; margin-top:12px; font-size:13px; font-weight:700;"></div>
    <input type="password" id="adminPassInput" placeholder="أدخل كلمة المرور" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false">
    <button class="btn btn-primary" id="loginSubmitBtn">تسجيل الدخول ⚡</button>
  </div>
</div>

<header>
  <div class="brand">
    <span>👑</span>
    <span>لوحة تحكم عبدالإله</span>
    <span class="brand-badge">إصدار V4</span>
  </div>
  <div class="header-actions">
    <button class="btn btn-secondary btn-sm" id="btnExport">📥 نسخة احتياطية</button>
    <button class="btn btn-danger btn-sm" id="btnPurge">🚨 قفل وتصفير شامل</button>
    <button class="btn btn-secondary btn-sm" id="btnLogout">خروج</button>
  </div>
</header>

<div class="container">
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-title">إجمالي الأكواد</div>
      <div class="stat-value" id="statTotalKeys">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">الأكواد النشطة</div>
      <div class="stat-value" style="color: var(--success);" id="statApprovedDevices">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">المحظورة / المقفلة</div>
      <div class="stat-value" style="color: var(--danger);" id="statBlockedCount">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">حالة السحابة (MongoDB)</div>
      <div class="stat-value" style="font-size: 20px; margin-top: 8px;" id="statCloudStatus">فحص...</div>
    </div>
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
        <option value="1">جهاز واحد (افتراضي)</option>
        <option value="2">جهازين</option>
        <option value="5">5 أجهزة</option>
        <option value="16">16 جهاز (أسطول كامل)</option>
      </select>
      <button class="btn btn-primary" id="btnGenerate">⚡ توليد كود جديد</button>
    </div>

    <div class="form-group">
      <input type="text" id="searchInput" placeholder="بحث عن كود، اسم، أو جهاز...">
      <button class="btn btn-secondary" id="btnRefresh">🔄 تحديث</button>
    </div>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>الكود</th>
          <th>صاحب الكود</th>
          <th>الحالة</th>
          <th>الصلاحية</th>
          <th>الأجهزة المرتبطة</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody id="keysTableBody">
        <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">جاري التحميل...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<script>
(function() {
  var currentToken = sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || '';
  var loadedKeys = [];

  var params = new URLSearchParams(window.location.search);
  var urlToken = params.get('token') || params.get('pass') || params.get('password');
  if (urlToken) {
    currentToken = urlToken.trim();
    sessionStorage.setItem('adminToken', currentToken);
    localStorage.setItem('adminToken', currentToken);
    var cleanUrl = new URL(window.location);
    cleanUrl.searchParams.delete('token');
    cleanUrl.searchParams.delete('pass');
    cleanUrl.searchParams.delete('password');
    window.history.replaceState({}, document.title, cleanUrl.pathname);
  }

  function getAuthHeader() {
    return 'Bearer ' + currentToken;
  }

  function showLogin() {
    document.getElementById('loginModal').style.display = 'flex';
  }

  function hideLogin() {
    document.getElementById('loginModal').style.display = 'none';
  }

  function loadKeys(callback) {
    fetch('/api/admin/keys', {
      headers: { 'Authorization': getAuthHeader() }
    })
    .then(function(res) {
      if (!res.ok) throw new Error('Unauthorized');
      return res.json();
    })
    .then(function(data) {
      loadedKeys = data.keys || [];
      document.getElementById('statTotalKeys').innerText = (data.stats && data.stats.total_keys) || 0;
      document.getElementById('statApprovedDevices').innerText = (data.stats && data.stats.approved) || 0;
      document.getElementById('statBlockedCount').innerText = (data.stats && data.stats.blocked) || 0;
      document.getElementById('statCloudStatus').innerHTML = data.cloud_active ? '<span style="color:var(--success)">✅ متصلة</span>' : '<span style="color:var(--text-muted)">محلي</span>';
      renderTable();
      if (callback) callback(true);
    })
    .catch(function() {
      if (callback) callback(false);
    });
  }

  function doLogin() {
    var val = (document.getElementById('adminPassInput').value || '').trim();
    var errDiv = document.getElementById('loginError');
    var btn = document.getElementById('loginSubmitBtn');
    errDiv.style.display = 'none';

    if (!val) {
      errDiv.innerText = 'يرجى إدخال كلمة المرور';
      errDiv.style.display = 'block';
      return;
    }

    btn.innerText = 'جاري التحقق...';
    btn.disabled = true;

    currentToken = val;
    sessionStorage.setItem('adminToken', currentToken);
    localStorage.setItem('adminToken', currentToken);

    loadKeys(function(success) {
      btn.innerText = 'تسجيل الدخول ⚡';
      btn.disabled = false;
      if (success) {
        hideLogin();
      } else {
        sessionStorage.removeItem('adminToken');
        localStorage.removeItem('adminToken');
        currentToken = '';
        errDiv.innerText = 'كلمة المرور غير صحيحة!';
        errDiv.style.display = 'block';
      }
    });
  }

  function logout() {
    sessionStorage.removeItem('adminToken');
    localStorage.removeItem('adminToken');
    currentToken = '';
    showLogin();
    document.getElementById('adminPassInput').value = '';
  }

  function renderTable() {
    var tbody = document.getElementById('keysTableBody');
    var search = (document.getElementById('searchInput').value || '').trim().toLowerCase();

    var filtered = loadedKeys.filter(function(k) {
      if (!search) return true;
      if (k.key && k.key.toLowerCase().indexOf(search) !== -1) return true;
      if (k.owner && k.owner.toLowerCase().indexOf(search) !== -1) return true;
      return false;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 35px; font-size: 15px;">لا توجد أي أكواد مسجلة (النظام مصفّر بالكامل ومغلق على الجميع ✅)</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var k = filtered[i];
      var isBlocked = (k.status === 'blocked' || k.active === false);
      var statusBadge = isBlocked ? '<span class="badge badge-blocked">محظور 🛑</span>' : '<span class="badge badge-active">نشط ✅</span>';
      var expires = k.expiresAt ? new Date(k.expiresAt).toLocaleDateString('ar-SA') : 'دائم';

      var devHtml = '<span style="color:var(--text-muted); font-size:13px;">لا يوجد أجهزة مرتبطة</span>';
      if (k.devices && k.devices.length > 0) {
        devHtml = k.devices.length + ' جهاز مرتبط';
      }

      html += '<tr>' +
        '<td><span class="key-badge">' + k.key + '</span></td>' +
        '<td><strong>' + (k.owner || 'مستخدم') + '</strong></td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + expires + '</td>' +
        '<td>' + devHtml + '</td>' +
        '<td>' +
          '<div class="action-btns">' +
            '<button class="btn btn-secondary btn-sm action-toggle" data-key="' + k.key + '">' + (isBlocked ? 'تفعيل' : 'حظر') + '</button>' +
            '<button class="btn btn-secondary btn-sm action-reset" data-key="' + k.key + '">🔄 تصفير</button>' +
            '<button class="btn btn-danger btn-sm action-delete" data-key="' + k.key + '">🗑️ حذف</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }
    tbody.innerHTML = html;
  }

  function generateKey() {
    var owner = (document.getElementById('newOwnerName').value || '').trim();
    var duration = document.getElementById('newDuration').value;
    var maxDevices = document.getElementById('newMaxDevices').value;

    fetch('/api/admin/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader()
      },
      body: JSON.stringify({ owner: owner, durationDays: duration, maxDevices: maxDevices })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success) {
        document.getElementById('newOwnerName').value = '';
        loadKeys();
        alert('تم توليد الكود بنجاح: ' + data.key.key);
      }
    });
  }

  function purgeAllData() {
    var ans = prompt('🚨 تحذير خطير: هذا الخيار سيحذف كافة الأكواد ويقفل الأداة على جميع الناس نهائياً! اكتب (نعم) للتأكيد:');
    if (ans === 'نعم') {
      fetch('/api/admin/purge_all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthHeader()
        }
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        alert(data.message || 'تم التصفير والقفل الشامل!');
        loadKeys();
      });
    }
  }

  document.getElementById('loginSubmitBtn').addEventListener('click', doLogin);
  document.getElementById('adminPassInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnRefresh').addEventListener('click', function() { loadKeys(); });
  document.getElementById('btnGenerate').addEventListener('click', generateKey);
  document.getElementById('btnPurge').addEventListener('click', purgeAllData);
  document.getElementById('btnExport').addEventListener('click', function() {
    window.open('/api/admin/backup?token=' + encodeURIComponent(currentToken), '_blank');
  });
  document.getElementById('searchInput').addEventListener('input', renderTable);

  document.getElementById('keysTableBody').addEventListener('click', function(e) {
    var t = e.target;
    var key = t.getAttribute('data-key');
    if (!key) return;

    if (t.classList.contains('action-toggle')) {
      fetch('/api/admin/toggle_lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
        body: JSON.stringify({ key: key })
      }).then(function() { loadKeys(); });
    } else if (t.classList.contains('action-reset')) {
      if (confirm('تصفير ارتباط الأجهزة بهذا الكود؟')) {
        fetch('/api/admin/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
          body: JSON.stringify({ key: key })
        }).then(function() { loadKeys(); });
      }
    } else if (t.classList.contains('action-delete')) {
      if (confirm('حذف الكود نهائياً وقفل الأداة عند صاحبه؟')) {
        fetch('/api/admin/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
          body: JSON.stringify({ key: key })
        }).then(function() { loadKeys(); });
      }
    }
  });

  if (currentToken) {
    loadKeys(function(success) {
      if (success) {
        hideLogin();
      } else {
        showLogin();
      }
    });
  } else {
    showLogin();
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

app.all('/api/*', (req, res) => {
  res.json(buildLockedResponse("Key Expired or Invalid"));
});

app.post('*', (req, res) => {
  res.json(buildLockedResponse("Key Expired or Invalid"));
});

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
`;

fs.writeFileSync('c:/Users/QMA/Downloads/YallaSniperRebuiltV2_V38/server.js', generateScript, 'utf8');
console.log('Successfully written c:/Users/QMA/Downloads/YallaSniperRebuiltV2_V38/server.js');
,Description:Write perfect server.js,Overwrite:true,TargetFile:c:\Users\QMA\.gemini\antigravity\brain\9ec7864e-c68c-450a-8975-3c6dfb824dc9\scratch\make_final_server.js,toolAction:Write make_final_server.js,toolSummary:Create script to generate perfect server.js}
