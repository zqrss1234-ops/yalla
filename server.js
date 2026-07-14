const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('./database');

const app = express();
const db = new Database();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'impossible';

function generateLicenseKey() {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    let seg = '';
    for (let j = 0; j < 4; j++) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(seg);
  }
  return segments.join('-');
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_SECRET) {
    const token = Buffer.from(JSON.stringify({ t: Date.now(), s: ADMIN_SECRET })).toString('base64');
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, message: 'Wrong password' });
});

app.post('/api/admin/generate', (req, res) => {
  const { token, count } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });

  const numKeys = Math.min(count || 1, 100);
  const keys = [];
  for (let i = 0; i < numKeys; i++) {
    const key = generateLicenseKey();
    db.addKey(key);
    keys.push(key);
  }
  res.json({ keys });
});

app.get('/api/admin/keys', (req, res) => {
  const token = req.query.token;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });

  const keys = db.getAllKeys();
  const stats = db.getStats();
  const pendingCount = db.getPendingCount();
  res.json({ keys, stats, pendingCount });
});

app.post('/api/admin/approve', (req, res) => {
  const { token, key } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  db.approveKey(key);
  res.json({ success: true });
});

app.post('/api/admin/reject', (req, res) => {
  const { token, key } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  db.rejectKey(key);
  res.json({ success: true });
});

app.post('/api/admin/revoke', (req, res) => {
  const { token, key } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  db.revokeKey(key);
  res.json({ success: true });
});

app.post('/api/admin/unrevoke', (req, res) => {
  const { token, key } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  db.unrevokeKey(key);
  res.json({ success: true });
});

app.post('/api/admin/delete', (req, res) => {
  const { token, key } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  db.deleteKey(key);
  res.json({ success: true });
});

app.post('/api/validate', (req, res) => {
  const { key, deviceId, deviceName, deviceModel, iosVersion, bundleId } = req.body;

  if (!key || !deviceId) {
    return res.status(400).json({
      valid: false,
      message: 'Missing key or deviceId'
    });
  }

  const license = db.findKey(key);
  if (!license) {
    return res.json({
      valid: false,
      message: 'رمز التفعيل غير صالح'
    });
  }

  if (license.revoked) {
    return res.json({
      valid: false,
      message: 'تم إلغاء رمز التفعيل هذا'
    });
  }

  if (license.device_id && license.device_id !== deviceId) {
    return res.json({
      valid: false,
      message: 'رمز التفعيل مستخدم على جهاز آخر'
    });
  }

  if (!license.device_id) {
    db.addDeviceInfo(key, deviceId, deviceName, deviceModel, iosVersion, bundleId || 'unknown');
  }

  if (license.approved === 1) {
    db.logUsage(key);
    return res.json({
      valid: true,
      message: 'تم التحقق بنجاح'
    });
  }

  if (license.approved === -1) {
    return res.json({
      valid: false,
      message: 'تم رفض طلب التفعيل من المطور'
    });
  }

  return res.json({
    valid: false,
    needsApproval: true,
    message: 'بانتظار موافقة المطور'
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function verifyToken(token) {
  try {
    const data = JSON.parse(Buffer.from(token, 'base64').toString());
    return data.s === ADMIN_SECRET;
  } catch {
    return false;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`License server running on port ${PORT}`);
});
