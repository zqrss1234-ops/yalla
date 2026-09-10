const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.set('trust proxy', true);

// ============================================================
// 🛡️ ترويسات منع الكاش الصارمة ومنع التخزين المؤقت نهائياً
// ============================================================
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

// ============================================================
// ⚙️ إعدادات النظام وكلمة المرور
// ============================================================
const CURRENT_EPOCH = "V6_ABOD_EXECUTIVE_2026";
const ADMIN_PATH = process.env.ADMIN_PATH || "abod-master-7788";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "12Qwaszx@@";
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "";

const DB_FILE = path.join(__dirname, 'database.json');
let memoryDB = { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN };
let isMongoActive = false;
let mongoCollection = null;

// ============================================================
// 📱 قاموس ترجمة موديلات أجهزة الآيفون الدقيق
// ============================================================
const APPLE_DEVICE_MAP = {
  'iPhone17,1': 'iPhone 16 Pro',
  'iPhone17,2': 'iPhone 16 Pro Max',
  'iPhone17,3': 'iPhone 16',
  'iPhone17,4': 'iPhone 16 Plus',
  'iPhone16,1': 'iPhone 15 Pro',
  'iPhone16,2': 'iPhone 15 Pro Max',
  'iPhone15,4': 'iPhone 15',
  'iPhone15,5': 'iPhone 15 Plus',
  'iPhone15,2': 'iPhone 14 Pro',
  'iPhone15,3': 'iPhone 14 Pro Max',
  'iPhone14,7': 'iPhone 14',
  'iPhone14,8': 'iPhone 14 Plus',
  'iPhone14,2': 'iPhone 13 Pro',
  'iPhone14,3': 'iPhone 13 Pro Max',
  'iPhone14,4': 'iPhone 13 mini',
  'iPhone14,5': 'iPhone 13',
  'iPhone13,1': 'iPhone 12 mini',
  'iPhone13,2': 'iPhone 12',
  'iPhone13,3': 'iPhone 12 Pro',
  'iPhone13,4': 'iPhone 12 Pro Max',
  'iPhone12,1': 'iPhone 11',
  'iPhone12,3': 'iPhone 11 Pro',
  'iPhone12,5': 'iPhone 11 Pro Max',
  'iPhone11,2': 'iPhone XS',
  'iPhone11,4': 'iPhone XS Max',
  'iPhone11,6': 'iPhone XS Max',
  'iPhone11,8': 'iPhone XR',
  'iPhone10,3': 'iPhone X',
  'iPhone10,6': 'iPhone X',
  'iPhone10,1': 'iPhone 8',
  'iPhone10,4': 'iPhone 8',
  'iPhone10,2': 'iPhone 8 Plus',
  'iPhone10,5': 'iPhone 8 Plus',
  'iPhone12,8': 'iPhone SE (2nd Gen)',
  'iPhone14,6': 'iPhone SE (3rd Gen)'
};

function formatAppleDeviceModel(rawModel) {
  if (!rawModel) return 'آيفون';
  const trimmed = String(rawModel).trim();
  if (APPLE_DEVICE_MAP[trimmed]) return APPLE_DEVICE_MAP[trimmed];
  return trimmed;
}

// ============================================================
// 💾 إدارة قاعدة البيانات (محلياً + سحابياً مع MongoDB)
// ============================================================
function loadLocalFileDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN };
    saveLocalDB(init);
    return init;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!parsed.keys) parsed.keys = [];
    if (parsed.epoch !== CURRENT_EPOCH) {
      parsed.keys = [];
      parsed.epoch = CURRENT_EPOCH;
      saveLocalDB(parsed);
    }
    return parsed;
  } catch (e) {
    return { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN };
  }
}

function saveLocalDB(data) {
  try {
    if (!data.epoch) data.epoch = CURRENT_EPOCH;
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {}
}

memoryDB = loadLocalFileDB();

if (MONGO_URI) {
  (async () => {
    try {
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      mongoCollection = client.db('yallasniper_cloud').collection('system_state');
      isMongoActive = true;
      const doc = await mongoCollection.findOne({ _id: 'master_license_store' });
      if (doc && doc.epoch === CURRENT_EPOCH) {
        memoryDB = { epoch: CURRENT_EPOCH, keys: doc.keys || [], adminToken: ADMIN_TOKEN };
      } else {
        await mongoCollection.updateOne(
          { _id: 'master_license_store' },
          { $set: { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
        memoryDB = { epoch: CURRENT_EPOCH, keys: [], adminToken: ADMIN_TOKEN };
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
        { $set: { keys: data.keys, adminToken: ADMIN_TOKEN, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (e) {}
  }
}

// ============================================================
// 🔒 دالة الرفض والحظر القطعي (Zero-Trust Lock Response)
// ============================================================
function buildLockedResponse(msg) {
  return {
    status: 'revoked',
    message: msg || '🚫 تم إيقاف وقفل الأداة من الإدارة نهائياً',
    action: 'lock',
    valid: false,
    approved: false,
    active: false,
    success: false,
    allowed: false,
    licensed: false,
    killswitch: true,
    disabled: true,
    error: 'REVOKED',
    code: 403,
    key: null,
    needs_approval: false,
    needsApproval: false
  };
}

function checkAdminPassword(input) {
  if (!input) return false;
  const str = String(input).trim();
  if (str === '12Qwaszx@@' || str === 'abod2026') return true;
  if (str.toLowerCase() === '12qwaszx@@' || str.toLowerCase() === 'abod2026') return true;
  const envPass = (process.env.ADMIN_TOKEN || '').trim();
  if (envPass && (str === envPass || str.toLowerCase() === envPass.toLowerCase())) return true;
  const norm = str.replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48))
                  .replace(/[\u06F0-\u06F9]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x06F0 + 48));
  if (norm === '12Qwaszx@@' || norm.toLowerCase() === '12qwaszx@@') return true;
  if (norm === 'abod2026' || norm.toLowerCase() === 'abod2026') return true;
  return false;
}

function requireAdminAuth(req, res, next) {
  let token = null;
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) token = auth.replace('Bearer ', '').trim();
  else if (req.query && (req.query.token || req.query.pass || req.query.password)) token = String(req.query.token || req.query.pass || req.query.password).trim();
  else if (req.body && (req.body.token || req.body.pass || req.body.password)) token = String(req.body.token || req.body.pass || req.body.password).trim();

  if (checkAdminPassword(token) || token === ADMIN_TOKEN) {
    return next();
  }
  return res.status(403).json({ success: false, error: 'UNAUTHORIZED', message: 'كلمة المرور غير صحيحة' });
}

function extractDevicePayload(req) {
  const b = req.body || {};
  const q = req.query || {};
  const h = req.headers || {};
  const key = (b.key || b.license || b.licenseKey || b.token || q.key || q.token || '').trim();
  const deviceId = (b.deviceId || b.deviceUUID || b.uuid || b.hwid || b.hardwareId || q.deviceId || q.deviceUUID || q.uuid || q.hwid || h['x-hwid'] || h['x-device-id'] || '').trim();
  const deviceName = (b.deviceName || b.name || q.deviceName || '').trim();
  const deviceModel = (b.deviceModel || b.model || q.deviceModel || '').trim();
  const iosVersion = (b.iosVersion || b.version || q.iosVersion || '').trim();
  const bundleId = (b.bundleId || b.bundle || q.bundleId || '').trim();
  return { key, deviceId, deviceName, deviceModel, iosVersion, bundleId };
}

// ============================================================
// 📱 معالجة فحص ترخيص الجهاز المباشر (Check Device Status)
// ============================================================
async function handleCheckDevice(req, res) {
  const { deviceId, deviceName, deviceModel, iosVersion, bundleId } = extractDevicePayload(req);
  if (!deviceId) return res.json(buildLockedResponse('معرف الجهاز غير صالح'));

  const db = memoryDB;
  let boundKey = null;
  for (const k of db.keys) {
    if (k.devices && Array.isArray(k.devices)) {
      const dev = k.devices.find(d => d.deviceId === deviceId);
      if (dev) { boundKey = { keyObj: k, devObj: dev }; break; }
    }
  }

  if (!boundKey) return res.json(buildLockedResponse('الجهاز غير مسجل أو محذوف من النظام'));
  const { keyObj, devObj } = boundKey;

  if (keyObj.status === 'blocked' || keyObj.active === false) return res.json(buildLockedResponse('🚫 هذا الكود محظور بالكامل'));
  if (devObj.status === 'blocked' || devObj.approved === false) return res.json(buildLockedResponse('🚫 تم قفل هذا الجهاز'));

  if (keyObj.expiresAt) {
    const exp = new Date(keyObj.expiresAt).getTime();
    if (!isNaN(exp) && Date.now() > exp) return res.json(buildLockedResponse('⌛ انتهت صلاحية الكود'));
  }

  devObj.lastSeen = new Date().toISOString();
  if (deviceName) devObj.deviceName = deviceName;
  if (deviceModel) {
    devObj.rawModel = deviceModel;
    devObj.deviceModel = formatAppleDeviceModel(deviceModel);
  }
  if (iosVersion) devObj.iosVersion = iosVersion;
  if (bundleId) devObj.bundleId = bundleId;
  persistDB(db);

  return res.json({
    status: 'approved', message: 'تم تفعيل الجهاز بنجاح ✅',
    valid: true, approved: true, active: true, success: true, allowed: true, licensed: true,
    code: 200, key: keyObj.key, owner: keyObj.owner || 'مستخدم', device_status: 'approved'
  });
}

// ============================================================
// 🔑 معالجة التحقق من الكود وتفعيل الآيفون (Validate Key)
// ============================================================
async function handleValidate(req, res) {
  const { key, deviceId, deviceName, deviceModel, iosVersion, bundleId } = extractDevicePayload(req);
  if (!key) return res.json(buildLockedResponse('لم يتم إرسال كود التفعيل'));

  const db = memoryDB;
  const keyObj = db.keys.find(k => k.key.toUpperCase() === key.toUpperCase());
  if (!keyObj) return res.json(buildLockedResponse('🚫 الكود غير مسجل في النظام نهائياً'));

  if (keyObj.status === 'blocked' || keyObj.active === false) return res.json(buildLockedResponse('🚫 هذا الكود ملغي ومحظور من الإدارة'));

  if (keyObj.expiresAt) {
    const exp = new Date(keyObj.expiresAt).getTime();
    if (!isNaN(exp) && Date.now() > exp) return res.json(buildLockedResponse('⌛ انتهت صلاحية هذا الكود'));
  }

  if (deviceId) {
    if (!keyObj.devices) keyObj.devices = [];
    let devObj = keyObj.devices.find(d => d.deviceId === deviceId);
    const friendlyModel = formatAppleDeviceModel(deviceModel);

    if (devObj) {
      if (devObj.status === 'blocked' || devObj.approved === false) return res.json(buildLockedResponse('🚫 هذا الجهاز مقفل'));
      devObj.lastSeen = new Date().toISOString();
      if (deviceName) devObj.deviceName = deviceName;
      if (deviceModel) {
        devObj.rawModel = deviceModel;
        devObj.deviceModel = friendlyModel;
      }
      if (iosVersion) devObj.iosVersion = iosVersion;
    } else {
      const maxSlots = keyObj.maxDevices || 1;
      if (keyObj.devices.length >= maxSlots) {
        return res.json(buildLockedResponse('تجاوزت الحد المسموح للأجهزة (' + maxSlots + ') - تواصل مع الإدارة لفك الارتباط'));
      }
      devObj = {
        deviceId,
        deviceName: deviceName || 'iPhone',
        rawModel: deviceModel || 'iPhone',
        deviceModel: friendlyModel,
        iosVersion: iosVersion || 'iOS',
        bundleId: bundleId || 'com.yalla.lite',
        status: 'approved',
        approved: true,
        firstActivated: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      keyObj.devices.push(devObj);
    }
    persistDB(db);

    return res.json({
      status: 'approved',
      message: 'تم تفعيل الكود بنجاح ✅',
      valid: true,
      approved: true,
      active: true,
      success: true,
      allowed: true,
      licensed: true,
      code: 200,
      key: keyObj.key,
      owner: keyObj.owner || 'مستخدم',
      expiresAt: keyObj.expiresAt || null,
      device: devObj
    });
  }

  return res.json(buildLockedResponse('معرف الجهاز مفقود'));
}

// مسارات التحقق والتفعيل للتوافق الكامل
const checkRoutes = [
  '/api/validate', '/validate', '/api/v1/validate', '/api/license', '/license', '/api/v1/license',
  '/api/verify', '/verify', '/api/v1/verify', '/api/activate', '/activate', '/api/v1/activate', '/api/auth', '/auth', '/api/v1/auth'
];
const deviceRoutes = [
  '/api/check_device', '/check_device', '/api/v1/check_device', '/api/check-device', '/check-device', '/api/v1/check-device',
  '/api/device_check', '/device_check', '/api/device-check', '/device-check', '/api/check', '/check', '/api/v1/check', '/api/status', '/status'
];

checkRoutes.forEach(r => { app.post(r, handleValidate); app.get(r, handleValidate); });
deviceRoutes.forEach(r => { app.post(r, handleCheckDevice); app.get(r, handleCheckDevice); });

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    server: 'YallaSniper Executive Licensing System',
    owner: 'عبدالإله 👑',
    epoch: memoryDB.epoch,
    cloud_active: isMongoActive,
    total_keys: memoryDB.keys.length
  });
});

// ============================================================
// 👑 مسارات الإدارة والتحكم (Admin Endpoints)
// ============================================================
app.get('/api/admin/keys', requireAdminAuth, (req, res) => {
  const db = memoryDB;
  let approvedCount = 0, blockedCount = 0, devicesCount = 0;
  db.keys.forEach(k => {
    if (k.status === 'blocked' || k.active === false) blockedCount++;
    else approvedCount++;
    if (k.devices && Array.isArray(k.devices)) devicesCount += k.devices.length;
  });
  return res.json({
    success: true,
    keys: db.keys,
    cloud_active: isMongoActive,
    epoch: db.epoch,
    stats: { total_keys: db.keys.length, approved: approvedCount, blocked: blockedCount, total_devices: devicesCount }
  });
});

app.post('/api/admin/generate', requireAdminAuth, async (req, res) => {
  const { owner, durationDays, maxDevices } = req.body;
  const days = parseInt(durationDays) || 30;
  const slots = parseInt(maxDevices) || 1;
  const ownerName = (owner || 'عميل جديد').trim();

  // توليد كود نظيف بتنسيق ملكي ABOD-XXXX-YYYY-ZZZZ
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part3 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const key = 'ABOD-' + part1 + '-' + part2 + '-' + part3;

  const now = new Date();
  const expiresAt = days >= 3650 ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const newKeyObj = {
    key,
    owner: ownerName,
    status: 'active',
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
  const { key, owner } = req.body;
  if (!key) return res.status(400).json({ success: false });
  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false });
  k.owner = (owner || 'عميل').trim();
  await persistDB(db);
  return res.json({ success: true, key: k });
});

app.post('/api/admin/toggle_lock', requireAdminAuth, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false });
  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false });
  k.status = (k.status === 'blocked' || k.active === false) ? 'active' : 'blocked';
  k.active = (k.status === 'active');
  await persistDB(db);
  return res.json({ success: true, key: k });
});

app.post('/api/admin/reset', requireAdminAuth, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false });
  const db = memoryDB;
  const k = db.keys.find(x => x.key.toUpperCase() === key.toUpperCase());
  if (!k) return res.status(404).json({ success: false });
  k.devices = [];
  await persistDB(db);
  return res.json({ success: true });
});

app.post('/api/admin/delete', requireAdminAuth, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false });
  const db = memoryDB;
  db.keys = db.keys.filter(x => x.key.toUpperCase() !== key.toUpperCase());
  await persistDB(db);
  return res.json({ success: true });
});

app.post('/api/admin/purge_all', requireAdminAuth, async (req, res) => {
  const db = memoryDB;
  db.keys = [];
  db.epoch = 'V6_PURGED_' + Date.now();
  await persistDB(db);
  if (isMongoActive && mongoCollection) {
    try {
      await mongoCollection.updateOne({ _id: 'master_license_store' }, { $set: { epoch: db.epoch, keys: [], updatedAt: new Date().toISOString() } }, { upsert: true });
    } catch (e) {}
  }
  return res.json({ success: true, message: '🚨 تم تصفير وقفل جميع الأكواد والأجهزة فوراً!' });
});

app.get('/api/admin/backup', requireAdminAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="abod_keys_backup_' + Date.now() + '.json"');
  res.send(JSON.stringify(memoryDB, null, 2));
});

// ============================================================
// 👑 واجهة لوحة القيادة الفخمة (Executive Luxury Dashboard HTML)
// ============================================================
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة القيادة والتحكم الإداري | سرفر عبدالإله 👑</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --card-bg: rgba(15, 23, 42, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-gold: #f59e0b;
      --accent-emerald: #10b981;
      --accent-red: #ef4444;
      --accent-indigo: #6366f1;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
    body { background: var(--bg); color: var(--text-main); min-height: 100vh; display: flex; flex-direction: column; background-image: radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(245, 158, 11, 0.06) 0%, transparent 40%); }
    header { background: rgba(11, 15, 25, 0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--card-border); padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-crown { font-size: 28px; filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.6)); }
    .brand-title { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
    .brand-badge { background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    .server-status-pill { display: flex; align-items: center; gap: 8px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 6px 14px; border-radius: 999px; font-size: 12.5px; color: #6ee7b7; font-weight: 700; }
    .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981; animation: pulse 1.8s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }
    .btn { padding: 9px 18px; border-radius: 10px; font-weight: 700; font-size: 13.5px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); display: inline-flex; align-items: center; gap: 6px; }
    .btn:hover { transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .btn-gold { background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.25); }
    .btn-gold:hover { filter: brightness(1.1); box-shadow: 0 6px 20px rgba(245, 158, 11, 0.35); }
    .btn-danger { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border-color: rgba(239, 68, 68, 0.35); }
    .btn-danger:hover { background: #ef4444; color: white; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4); }
    .btn-secondary { background: rgba(255, 255, 255, 0.05); color: var(--text-main); border-color: var(--card-border); }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.1); }
    .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 8px; }
    .btn-success { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border-color: rgba(16, 185, 129, 0.35); }
    .btn-success:hover { background: #10b981; color: white; }
    .container { max-width: 1380px; width: 100%; margin: 0 auto; padding: 24px; flex: 1; display: flex; flex-direction: column; gap: 24px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; }
    .stat-card { background: var(--card-bg); backdrop-filter: blur(16px); border: 1px solid var(--card-border); border-radius: 16px; padding: 20px; position: relative; overflow: hidden; }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, var(--card-border), transparent); }
    .stat-title { font-size: 13px; color: var(--text-muted); font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; }
    .stat-value { font-size: 30px; font-weight: 900; letter-spacing: -0.5px; }
    .stat-icon { font-size: 22px; opacity: 0.8; }
    .card { background: var(--card-bg); backdrop-filter: blur(16px); border: 1px solid var(--card-border); border-radius: 16px; padding: 22px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 12px; }
    .card-title { font-size: 16.5px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) auto; gap: 12px; align-items: flex-end; }
    .field-group { display: flex; flex-direction: column; gap: 6px; }
    .field-label { font-size: 12px; color: var(--text-muted); font-weight: 700; }
    input, select { background: rgba(11, 15, 25, 0.95); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px; padding: 10px 14px; color: white; font-size: 13.5px; outline: none; transition: border-color 0.2s; }
    input:focus, select:focus { border-color: var(--accent-gold); box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15); }
    .table-container { border-radius: 14px; overflow: hidden; border: 1px solid var(--card-border); background: rgba(11, 15, 25, 0.6); }
    table { width: 100%; border-collapse: collapse; text-align: right; }
    th { background: rgba(15, 23, 42, 0.95); padding: 14px 18px; font-size: 12.5px; color: var(--text-muted); font-weight: 800; border-bottom: 1px solid var(--card-border); }
    td { padding: 14px 18px; font-size: 13.5px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: middle; }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .key-badge { font-family: monospace; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.35); color: #c7d2fe; padding: 4px 10px; border-radius: 8px; font-weight: 800; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; user-select: all; }
    .client-tag { font-weight: 800; color: #fff; display: flex; align-items: center; gap: 6px; }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; }
    .status-badge.active { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-badge.blocked { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
    .device-box { background: rgba(18, 24, 38, 0.8); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 10px; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
    .device-model-title { font-weight: 800; color: #e2e8f0; font-size: 13px; display: flex; align-items: center; gap: 6px; }
    .device-sub { font-size: 11.5px; color: var(--text-muted); }
    .device-badge-empty { color: var(--text-muted); font-size: 12.5px; font-style: italic; }
    .filter-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .login-card { background: #0c101c; border: 1px solid rgba(245, 158, 11, 0.3); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7); padding: 36px; border-radius: 20px; width: 100%; max-width: 400px; text-align: center; }
    .copy-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 14px; transition: color 0.2s; }
    .copy-btn:hover { color: white; }
    .time-badge { font-family: monospace; font-size: 12.5px; color: var(--text-muted); background: rgba(255, 255, 255, 0.04); padding: 4px 10px; border-radius: 6px; }
  </style>
</head>
<body>

<div id="loginModal" class="modal-overlay">
  <div class="login-card">
    <div style="font-size: 52px; margin-bottom: 10px;">👑</div>
    <h2 style="font-weight: 900; font-size: 22px; margin-bottom: 6px;">لوحة تحكم عبدالإله</h2>
    <p style="color: var(--text-muted); font-size: 13.5px; margin-bottom: 20px;">أدخل كلمة المرور الإدارية للمتابعة</p>
    <div id="loginError" style="display:none; color: #fca5a5; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); padding: 10px; border-radius: 8px; margin-bottom: 14px; font-size: 13px;"></div>
    <div style="position: relative; margin-bottom: 16px;">
      <input type="password" id="adminPassInput" placeholder="أدخل كلمة المرور" style="width:100%; text-align:center; font-size:16px; padding:12px; border-radius:10px;">
      <button id="togglePassEye" type="button" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:16px;">👁️</button>
    </div>
    <button class="btn btn-gold" id="loginSubmitBtn" style="width:100%; justify-content:center; padding:12px; font-size:15px;">تسجيل الدخول ⚡</button>
  </div>
</div>

<header>
  <div class="brand">
    <span class="brand-crown">👑</span>
    <div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="brand-title">سرفر القيادة والتحكم | عبدالإله</span>
        <span class="brand-badge">الإصدار الملكي V6</span>
      </div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">نظام الحظر الفوري وتتبع أجهزة الآيفون الدقيق</div>
    </div>
  </div>
  <div class="header-actions">
    <div class="time-badge" id="liveClock">--:--:--</div>
    <div class="server-status-pill"><span class="pulse-dot"></span><span>السيرفر متصل بنشاط</span></div>
    <button class="btn btn-danger btn-sm" id="btnPurgeAll">🚨 قفل وتصفير شامل على الجميع</button>
    <button class="btn btn-secondary btn-sm" id="btnLogout">خروج</button>
  </div>
</header>

<div class="container">
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-title"><span>إجمالي الأكواد</span><span class="stat-icon">🔑</span></div>
      <div class="stat-value" id="statTotalKeys">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-title"><span>الأكواد النشطة والمفعلة</span><span class="stat-icon">🟢</span></div>
      <div class="stat-value" style="color: var(--accent-emerald);" id="statApproved">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-title"><span>الأكواد المقفلة والمحظورة</span><span class="stat-icon">🛑</span></div>
      <div class="stat-value" style="color: var(--accent-red);" id="statBlocked">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-title"><span>أجهزة الآيفون المربوطة</span><span class="stat-icon">📱</span></div>
      <div class="stat-value" style="color: #60a5fa;" id="statDevices">0</div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title"><span>⚡</span><span>توليد كود تفعيل جديد</span></div>
      <div style="font-size:12.5px; color:var(--text-muted);">الأكواد ترتبط بالسيرفر مباشرة وتقبل القفل والإلغاء بلحظة</div>
    </div>
    <div class="form-grid">
      <div class="field-group">
        <label class="field-label">👤 اسم العميل / صاحب الكود</label>
        <input type="text" id="newOwnerName" placeholder="مثال: أحمد الشمري أو VIP فهد">
      </div>
      <div class="field-group">
        <label class="field-label">⏱️ مدة الاشتراك</label>
        <select id="newDuration">
          <option value="1">24 ساعة (يوم تجريبي)</option>
          <option value="3">3 أيام</option>
          <option value="7">أسبوع كامل (7 أيام)</option>
          <option value="30" selected>شهر كامل (30 يوم)</option>
          <option value="60">شهرين (60 يوم)</option>
          <option value="90">3 أشهر (90 يوم)</option>
          <option value="365">سنة كاملة (365 يوم)</option>
          <option value="3650">دائم مدى الحياة 👑</option>
        </select>
      </div>
      <div class="field-group">
        <label class="field-label">📱 الحد الأقصى للأجهزة</label>
        <select id="newMaxDevices">
          <option value="1" selected>جهاز آيفون واحد (1)</option>
          <option value="2">جهازين (2)</option>
          <option value="5">5 أجهزة</option>
          <option value="16">16 جهاز (أسطول كامل)</option>
        </select>
      </div>
      <button class="btn btn-gold" id="btnGenerate" style="height:44px; padding: 0 24px;">⚡ توليد الكود فوراً</button>
    </div>
  </div>

  <div class="card">
    <div class="filter-bar">
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="card-title" style="margin:0;"><span>📋</span><span>إدارة وتتبع الأكواد وأجهزة الآيفون</span></div>
        <span class="time-badge" id="filteredCountBadge">0 كود</span>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <input type="text" id="searchInput" placeholder="🔍 بحث بكود، اسم العميل، موديل الآيفون..." style="min-width:280px;">
        <button class="btn btn-secondary btn-sm" id="btnRefresh">🔄 تحديث البيانات</button>
        <button class="btn btn-secondary btn-sm" id="btnDownloadBackup">💾 نسخة احتياطية</button>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>الكود الملكي</th>
            <th>اسم العميل</th>
            <th>الحالة والتحكم</th>
            <th>معلومات جهاز الآيفون المتصل</th>
            <th>الصلاحية</th>
            <th>الإجراءات السريعة</th>
          </tr>
        </thead>
        <tbody id="keysTableBody">
          <tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:40px;">جاري تحميل البيانات...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
(function() {
  var token = sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || '';
  var urlParams = new URLSearchParams(window.location.search);
  var urlPass = urlParams.get('pass') || urlParams.get('token');
  if (urlPass) {
    token = urlPass.trim();
    sessionStorage.setItem('adminToken', token);
    localStorage.setItem('adminToken', token);
  }

  var allKeys = [];

  function updateClock() {
    var now = new Date();
    var str = now.toLocaleTimeString('ar-SA', { hour12: true });
    document.getElementById('liveClock').innerText = str;
  }
  setInterval(updateClock, 1000);
  updateClock();

  function req(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, options);
  }

  function loadData(cb) {
    req('/api/admin/keys')
    .then(function(res) {
      if (!res.ok) {
        if (cb) cb(false);
        return null;
      }
      return res.json();
    })
    .then(function(data) {
      if (!data || !data.success) {
        if (cb) cb(false);
        return;
      }
      if (cb) cb(true);
      allKeys = data.keys || [];
      try {
        var elTotal = document.getElementById('statTotalKeys');
        if (elTotal) elTotal.innerText = (data.stats && data.stats.total_keys) || 0;
        var elApp = document.getElementById('statApproved');
        if (elApp) elApp.innerText = (data.stats && data.stats.approved) || 0;
        var elBlk = document.getElementById('statBlocked');
        if (elBlk) elBlk.innerText = (data.stats && data.stats.blocked) || 0;
        var elDev = document.getElementById('statDevices');
        if (elDev) elDev.innerText = (data.stats && data.stats.total_devices) || 0;
        render();
      } catch (renderErr) {
        console.error('Render error:', renderErr);
      }
    })
    .catch(function(err) {
      if (cb) cb(false);
    });
  }

  function render() {
    var tbody = document.getElementById('keysTableBody');
    var q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    var list = allKeys.filter(function(k) {
      if (!q) return true;
      var inKey = (k.key && k.key.toLowerCase().indexOf(q) !== -1);
      var inOwner = (k.owner && k.owner.toLowerCase().indexOf(q) !== -1);
      var inDev = false;
      if (k.devices && Array.isArray(k.devices)) {
        inDev = k.devices.some(function(d) {
          return (d.deviceName && d.deviceName.toLowerCase().indexOf(q) !== -1) ||
                 (d.deviceModel && d.deviceModel.toLowerCase().indexOf(q) !== -1) ||
                 (d.rawModel && d.rawModel.toLowerCase().indexOf(q) !== -1) ||
                 (d.deviceId && d.deviceId.toLowerCase().indexOf(q) !== -1);
        });
      }
      return inKey || inOwner || inDev;
    });

    document.getElementById('filteredCountBadge').innerText = list.length + ' كود';

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:45px; font-weight:700;">لا توجد أي أكواد مسجلة (النظام نظيف ومصفّر بالكامل ومغلق على الجميع ✅)</td></tr>';
      return;
    }

    var h = '';
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      var isBlock = (k.status === 'blocked' || k.active === false);
      var expStr = 'دائم مدى الحياة 👑';
      if (k.expiresAt) {
        var expDate = new Date(k.expiresAt);
        var diffDays = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) expStr = '<span style="color:var(--accent-red)">منتهي الصلاحية ⌛</span>';
        else expStr = 'متبقي ' + diffDays + ' يوم <br><small style="color:var(--text-muted)">' + expDate.toLocaleDateString('ar-SA') + '</small>';
      }

      var deviceCell = '';
      if (!k.devices || k.devices.length === 0) {
        deviceCell = '<span class="device-badge-empty">⏳ بانتظار الربط بأول آيفون...</span>';
      } else {
        deviceCell = k.devices.map(function(d) {
          var modelName = d.deviceModel || 'iPhone';
          var devName = d.deviceName || 'iPhone';
          var iosVer = d.iosVersion ? ('iOS ' + d.iosVersion) : '';
          var seen = d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString('ar-SA', { hour12: true, hour: '2-digit', minute: '2-digit' }) : '-';
          return '<div class="device-box">' +
            '<div class="device-model-title">📱 ' + modelName + '</div>' +
            '<div class="device-sub">' + devName + ' • ' + iosVer + '</div>' +
            '<div style="font-size:10.5px; color:var(--text-muted); display:flex; justify-content:space-between; margin-top:2px;">' +
              '<span>آخر ظهور: ' + seen + '</span>' +
              '<span title="' + (d.deviceId || '') + '">معرف: ' + (d.deviceId ? d.deviceId.substring(0, 8) + '...' : '-') + '</span>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      h += '<tr>' +
        '<td><div class="key-badge"><span>' + k.key + '</span><button class="copy-btn" data-action="copy" data-key="' + k.key + '" title="نسخ الكود">📋</button></div></td>' +
        '<td><div class="client-tag"><span>👤</span><span>' + (k.owner || 'عميل') + '</span><button class="copy-btn" data-action="edit-owner" data-key="' + k.key + '" data-owner="' + (k.owner || 'عميل') + '" title="تعديل اسم العميل">✏️</button></div></td>' +
        '<td>' + (isBlock ? '<span class="status-badge blocked">🛑 مقفل ومحظور</span>' : '<span class="status-badge active">🟢 نشط ومصرح</span>') + '</td>' +
        '<td>' + deviceCell + '</td>' +
        '<td style="font-size:12.5px;">' + expStr + '</td>' +
        '<td><div style="display:flex; gap:6px; flex-wrap:wrap;">' +
          '<button class="btn ' + (isBlock ? 'btn-success' : 'btn-danger') + ' btn-sm" data-action="toggle" data-key="' + k.key + '">' + (isBlock ? '🔓 تفعيل' : '🔒 قفل') + '</button>' +
          '<button class="btn btn-secondary btn-sm" data-action="reset" data-key="' + k.key + '" title="فك ارتباط الجهاز">🔄 فك ارتباط</button>' +
          '<button class="btn btn-secondary btn-sm" data-action="share" data-key="' + k.key + '" data-owner="' + (k.owner || 'عميل') + '" title="مشاركة عبر واتساب">💬</button>' +
          '<button class="btn btn-danger btn-sm" data-action="delete" data-key="' + k.key + '" title="حذف نهائي">🗑️</button>' +
        '</div></td>' +
      '</tr>';
    }
    tbody.innerHTML = h;
  }

  var tbodyEl = document.getElementById('keysTableBody');
  tbodyEl.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var act = btn.getAttribute('data-action');
    var key = btn.getAttribute('data-key');
    var owner = btn.getAttribute('data-owner');

    if (act === 'copy') {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(key).then(function() { alert('تم نسخ الكود بنجاح: ' + key); });
      } else {
        prompt('انسخ الكود:', key);
      }
    } else if (act === 'edit-owner') {
      var newName = prompt('تعديل اسم العميل / صاحب الكود (' + key + '):', owner);
      if (newName && newName.trim() !== '') {
        req('/api/admin/edit_owner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: key, owner: newName.trim() })
        }).then(function(r) { return r.json(); }).then(function(d) {
          if (d.success) loadData();
        });
      }
    } else if (act === 'toggle') {
      req('/api/admin/toggle_lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key })
      }).then(function(r) { return r.json(); }).then(function(d) {
        if (d.success) loadData();
      });
    } else if (act === 'reset') {
      if (confirm('هل تريد فك ارتباط جهاز الآيفون المسجل على الكود (' + key + ')؟ سيتمكن العميل من ربط جهاز جديد فوراً.')) {
        req('/api/admin/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: key })
        }).then(function(r) { return r.json(); }).then(function(d) {
          if (d.success) {
            alert('تم فك الارتباط بنجاح ✅');
            loadData();
          }
        });
      }
    } else if (act === 'share') {
      var shareMsg = ['مرحباً ' + (owner || 'عميلنا العزيز') + ' 👋', 'تم تفعيل اشتراكك في أداة يلا سنايبر الملكية 👑', 'كود التفعيل الخاص بك:', key, 'نتمنى لك استخداماً موفقاً!'].join(String.fromCharCode(10));
      window.open('https://wa.me/?text=' + encodeURIComponent(shareMsg), '_blank');
    } else if (act === 'delete') {
      if (confirm('تحذير: هل أنت متأكد من حذف الكود (' + key + ') نهائياً من السيرفر؟ سيتم حظر الجهاز المسجل فوراً.')) {
        req('/api/admin/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: key })
        }).then(function(r) { return r.json(); }).then(function(d) {
          if (d.success) loadData();
        });
      }
    }
  });

  function doLogin() {
    var p = (document.getElementById('adminPassInput').value || '').trim();
    var err = document.getElementById('loginError');
    var btn = document.getElementById('loginSubmitBtn');
    err.style.display = 'none';

    if (!p) {
      err.innerText = 'يرجى إدخال كلمة المرور';
      err.style.display = 'block';
      return;
    }

    btn.innerText = 'جاري التحقق...';
    btn.disabled = true;
    token = p;
    sessionStorage.setItem('adminToken', token);
    localStorage.setItem('adminToken', token);

    loadData(function(ok) {
      btn.innerText = 'تسجيل الدخول ⚡';
      btn.disabled = false;
      if (ok) {
        document.getElementById('loginModal').style.display = 'none';
      } else {
        sessionStorage.removeItem('adminToken');
        localStorage.removeItem('adminToken');
        token = '';
        err.innerText = 'كلمة المرور غير صحيحة!';
        err.style.display = 'block';
      }
    });
  }

  document.getElementById('loginSubmitBtn').addEventListener('click', doLogin);
  document.getElementById('adminPassInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btnRefresh').addEventListener('click', function() { loadData(); });
  document.getElementById('searchInput').addEventListener('input', render);

  var eyeBtn = document.getElementById('togglePassEye');
  var passInp = document.getElementById('adminPassInput');
  eyeBtn.addEventListener('click', function() {
    if (passInp.type === 'password') {
      passInp.type = 'text';
      eyeBtn.innerText = '🙈';
    } else {
      passInp.type = 'password';
      eyeBtn.innerText = '👁️';
    }
  });

  document.getElementById('btnLogout').addEventListener('click', function() {
    sessionStorage.removeItem('adminToken');
    localStorage.removeItem('adminToken');
    token = '';
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('adminPassInput').value = '';
  });

  document.getElementById('btnGenerate').addEventListener('click', function() {
    var owner = (document.getElementById('newOwnerName').value || '').trim();
    var duration = document.getElementById('newDuration').value;
    var maxDevices = document.getElementById('newMaxDevices').value;
    var btn = document.getElementById('btnGenerate');
    btn.disabled = true;
    btn.innerText = 'جاري التوليد...';

    req('/api/admin/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: owner, durationDays: duration, maxDevices: maxDevices })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      btn.disabled = false;
      btn.innerText = '⚡ توليد الكود فوراً';
      if (d.success) {
        document.getElementById('newOwnerName').value = '';
        loadData();
        prompt('✅ تم توليد كود التفعيل بنجاح! انسخ الكود وشاركه مع العميل:', d.key.key);
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.innerText = '⚡ توليد الكود فوراً';
    });
  });

  document.getElementById('btnPurgeAll').addEventListener('click', function() {
    var ans = prompt('🚨 تحذير أمني خطير جداً: هذا الإجراء سيقوم بحذف كافة الأكواد وحظر وقفل الأداة على جميع المشتركين في العالم فوراً! اكتب (قفل الجميع) للمتابعة:');
    if (ans === 'قفل الجميع' || ans === 'نعم') {
      req('/api/admin/purge_all', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        alert(d.message || 'تم قفل وتصفير النظام على الجميع بنجاح ✅');
        loadData();
      });
    }
  });

  document.getElementById('btnDownloadBackup').addEventListener('click', function() {
    window.open('/api/admin/backup?token=' + encodeURIComponent(token), '_blank');
  });

  if (token) {
    loadData(function(ok) {
      if (ok) document.getElementById('loginModal').style.display = 'none';
      else document.getElementById('loginModal').style.display = 'flex';
    });
  }
})();
</script>
</body>
</html>`;

const adminRoutes = [
  '/', '/' + ADMIN_PATH, '/admin', '/abod', '/login', '/dashboard', '/control'
];
adminRoutes.forEach(r => {
  app.get(r, (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(DASHBOARD_HTML);
  });
});

// صفحة 404 للمسارات المجهولة
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'The requested resource does not exist.' });
});

// نظام الحفاظ على استيقاظ السيرفر الذاتي (Keep-Alive Self Ping)
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || 'https://yalla-upd0.onrender.com/api/health';
setInterval(() => {
  try {
    https.get(KEEP_ALIVE_URL, (res) => {}).on('error', () => {});
  } catch (e) {}
}, 7 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 YallaSniper Executive Licensing Server running securely on 0.0.0.0:' + PORT);
});
