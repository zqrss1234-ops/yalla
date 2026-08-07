const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('./database');

const app = express();
const github = {
  owner: process.env.GH_OWNER || 'zqrss1234-ops',
  repo: process.env.GH_REPO || 'yalla',
  path: process.env.GH_PATH || 'licenses.json',
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
    db.removeDevice(key, deviceId);
  } else {
    const k = db.findKey(key);
    if (k) {
      k.activations.filter(a => a.status === 'approved').forEach(a => db.removeDevice(key, a.device_id));
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

app.post('/api/admin/backup', (req, res) => {
  const { token } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  res.json({ success: true, data: { nextId: db.data.nextId, keys: db.getAllKeys() } });
});

app.post('/api/admin/import', (req, res) => {
  const { token, data } = req.body;
  if (!verifyToken(token)) return res.status(403).json({ error: 'Unauthorized' });
  if (!data || !Array.isArray(data.keys)) {
    return res.status(400).json({ error: 'Invalid data. Expected { keys: [...], nextId: n }' });
  }
  db.data = {
    keys: data.keys.map(k => ({ ...k, activations: k.activations || [] })),
    nextId: data.nextId || (data.keys.length + 1)
  };
  db.save();
  res.json({ success: true, message: `Imported ${db.data.keys.length} keys` });
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

    // Device has a DIFFERENT code. If that old activation is approved, the
    // device is already actively bound somewhere else -> block. If it is only
    // pending/rejected (e.g. orphaned request after reinstall), clear the old
    // record and let the device switch to the newly entered code.
    if (deviceBinding.activation.status === 'approved') {
      return res.json({ valid: false, message: 'هذا الجهاز لديه رمز تفعيل نشط بالفعل' });
    }

    db.removeDevice(deviceBinding.key, deviceId);
    // Fall through to a fresh activation on the new code.
  }

  // Reinstall case: a code that already has APPROVED devices gets a new device id
  // (user reinstalled apps) -> auto-approve so it doesn't get stuck pending.
  const existingApproved = (license.activations || []).filter(a => a.status === 'approved').length;
  if (existingApproved > 0) {
    db.addActivation(key, deviceId, deviceName, deviceModel, iosVersion, bundleId || 'unknown');
    db.approveDevice(key, deviceId);
    return res.json({ valid: true, message: '✓ تم التفعيل بنجاح' });
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
