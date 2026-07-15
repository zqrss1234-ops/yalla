const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('./database');

const app = express();
const github = {
  owner: 'zqrss1234-ops',
  repo: 'yalla',
  path: 'licenses.json',
  token: process.env.GH_TOKEN || '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'
};
const db = new Database(process.env.DB_PATH, github);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'impossible';

function generateLicenseKey() {
  const segs = [];
  for (let i = 0; i < 4; i++) {
    let s = '';
    for (let j = 0; j < 4; j++) {
      s += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)];
    }
    segs.push(s);
  }
  return segs.join('-');
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

app.post('/api/admin/keys', (req, res) => {
  const { token } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  const keys = db.getAllKeys();
  const stats = db.getStats();
  const pendingCount = db.getPendingActivations().length;
  res.json({ keys, stats, pendingCount });
});

app.post('/api/admin/approve', (req, res) => {
  const { token, key, deviceId } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  if (deviceId) {
    db.approveDevice(key, deviceId);
  } else {
    const k = db.findKey(key);
    if (k) {
      k.activations.filter(a => a.status === 'pending').forEach(a => db.approveDevice(key, a.device_id));
    }
  }
  res.json({ success: true });
});

app.post('/api/admin/reject', (req, res) => {
  const { token, key, deviceId } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  if (deviceId) {
    db.rejectDevice(key, deviceId);
  }
  res.json({ success: true });
});

app.post('/api/admin/revoke', (req, res) => {
  const { token, key, deviceId } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  if (deviceId) {
    db.revokeDevice(key, deviceId);
  } else {
    const k = db.findKey(key);
    if (k) {
      k.activations.filter(a => a.status === 'approved').forEach(a => db.revokeDevice(key, a.device_id));
    }
  }
  res.json({ success: true });
});

app.post('/api/admin/delete', (req, res) => {
  const { token, key } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  db.deleteKey(key);
  res.json({ success: true });
});

app.post('/api/admin/reset', (req, res) => {
  const { token } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  db.reset();
  res.json({ success: true, message: 'Database reset successfully' });
});

app.post('/api/validate', (req, res) => {
  const { key, deviceId, deviceName, deviceModel, iosVersion, bundleId } = req.body;
  if (!key || !deviceId) {
    return res.status(400).json({ valid: false, message: 'Missing key or deviceId' });
  }

  const license = db.findKey(key);
  if (!license) {
    return res.json({ valid: false, message: 'رمز التفعيل غير صالح' });
  }

  const deviceBinding = db.findAnyActivationByDevice(deviceId);

  if (deviceBinding) {
    if (deviceBinding.key === key) {
      // Same code + same device
      const act = deviceBinding.activation;
      if (act.status === 'approved') {
        return res.json({ valid: true, message: '✓ تم التفعيل بنجاح' });
      }
      if (act.status === 'rejected') {
        return res.json({ valid: false, message: 'تم رفض طلب التفعيل من المطور' });
      }
      return res.json({ valid: false, needsApproval: true, message: 'بانتظار موافقة المطور' });
    }

    // Device already has a DIFFERENT code
    const msg = deviceBinding.activation.status === 'approved'
      ? 'هذا الجهاز لديه رمز تفعيل نشط بالفعل'
      : 'هذا الجهاز لديه طلب تفعيل معلق بالفعل';
    return res.json({ valid: false, message: msg });
  }

  db.addActivation(key, deviceId, deviceName, deviceModel, iosVersion, bundleId || 'unknown');

  res.json({
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
  } catch { return false; }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`License server running on port ${PORT}`);
});
