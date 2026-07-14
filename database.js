const fs = require('fs');
const path = require('path');

class LicenseDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, 'licenses.json');
    this.data = { keys: [], nextId: 1 };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        this.data = JSON.parse(raw);
      }
    } catch { }
  }

  save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch { }
  }

  addKey(key) {
    this.data.keys.push({
      id: this.data.nextId++,
      key,
      device_id: null,
      device_name: null,
      device_model: null,
      ios_version: null,
      bundle_id: null,
      revoked: 0,
      approved: 0,
      created_at: new Date().toISOString(),
      activated_at: null,
      last_used: null
    });
    this.save();
  }

  findKey(key) {
    return this.data.keys.find(k => k.key === key) || null;
  }

  addDeviceInfo(key, deviceId, deviceName, deviceModel, iosVersion, bundleId) {
    const k = this.findKey(key);
    if (!k) return;
    k.device_id = deviceId;
    k.device_name = deviceName || null;
    k.device_model = deviceModel || null;
    k.ios_version = iosVersion || null;
    k.bundle_id = bundleId || null;
    k.activated_at = new Date().toISOString();
    this.save();
  }

  approveKey(key) {
    const k = this.findKey(key);
    if (k) { k.approved = 1; this.save(); }
  }

  rejectKey(key) {
    const k = this.findKey(key);
    if (k) { k.approved = -1; this.save(); }
  }

  revokeKey(key) {
    const k = this.findKey(key);
    if (k) { k.revoked = 1; this.save(); }
  }

  unrevokeKey(key) {
    const k = this.findKey(key);
    if (k) { k.revoked = 0; this.save(); }
  }

  deleteKey(key) {
    this.data.keys = this.data.keys.filter(k => k.key !== key);
    this.save();
  }

  logUsage(key) {
    const k = this.findKey(key);
    if (k) { k.last_used = new Date().toISOString(); this.save(); }
  }

  getAllKeys() {
    return [...this.data.keys].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
  }

  getPendingCount() {
    return this.data.keys.filter(k =>
      k.device_id && k.approved === 0 && !k.revoked
    ).length;
  }

  getStats() {
    const keys = this.data.keys;
    const total = keys.length;
    const revoked_count = keys.filter(k => k.revoked).length;
    const activated = keys.filter(k => k.device_id && k.approved === 1 && !k.revoked).length;
    const available = keys.filter(k => !k.device_id && !k.revoked).length;
    const pending = keys.filter(k => k.device_id && k.approved === 0 && !k.revoked).length;
    const today = new Date().toISOString().slice(0, 10);
    const active_today = keys.filter(k =>
      k.last_used && k.last_used.startsWith(today) && !k.revoked
    ).length;
    return { total, revoked_count, activated, available, pending, active_today };
  }

  close() { }
}

module.exports = LicenseDatabase;
