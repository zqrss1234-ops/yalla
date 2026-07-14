const fs = require('fs');
const path = require('path');

class LicenseDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, 'licenses.json');
    this.data = { keys: [], nextId: 1 };
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        this.data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
      }
    } catch { }
    this.migrateOldKeys();
  }

  save() {
    try { fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8'); } catch { }
  }

  migrateOldKeys() {
    let count = 0;
    for (const k of this.data.keys) {
      if (k.device_id && (!k.activations || k.activations.length === 0)) {
        k.activations = [{
          device_id: k.device_id,
          device_name: k.device_name || null,
          device_model: k.device_model || null,
          ios_version: k.ios_version || null,
          bundle_id: k.bundle_id || null,
          status: k.approved === 1 ? 'approved' : (k.approved === -1 ? 'rejected' : 'pending'),
          requested_at: k.created_at || new Date().toISOString(),
          approved_at: k.activated_at || null
        }];
        delete k.device_id; delete k.device_name; delete k.device_model;
        delete k.ios_version; delete k.bundle_id; delete k.approved;
        delete k.revoked; delete k.activated_at; delete k.last_used;
        count++;
      }
      if (!k.activations) k.activations = [];
    }
    if (count) this.save();
  }

  addKey(key) {
    this.data.keys.push({
      id: this.data.nextId++,
      key,
      created_at: new Date().toISOString(),
      activations: []
    });
    this.save();
  }

  findKey(key) {
    return this.data.keys.find(k => k.key === key) || null;
  }

  addActivation(key, deviceId, deviceName, deviceModel, iosVersion, bundleId) {
    const k = this.findKey(key);
    if (!k) return null;
    if (!k.activations) k.activations = [];
    const existing = (k.activations || []).find(a => a.device_id === deviceId);
    if (existing) return existing;

    const act = {
      device_id: deviceId,
      device_name: deviceName || null,
      device_model: deviceModel || null,
      ios_version: iosVersion || null,
      bundle_id: bundleId || null,
      status: 'pending',
      requested_at: new Date().toISOString(),
      approved_at: null
    };
    k.activations.push(act);
    this.save();
    return act;
  }

  findActivation(key, deviceId) {
    const k = this.findKey(key);
    if (!k) return null;
    return (k.activations || []).find(a => a.device_id === deviceId) || null;
  }

  approveDevice(key, deviceId) {
    const k = this.findKey(key);
    if (!k) return false;
    const act = (k.activations || []).find(a => a.device_id === deviceId);
    if (!act) return false;
    act.status = 'approved';
    act.approved_at = new Date().toISOString();
    this.save();
    return true;
  }

  rejectDevice(key, deviceId) {
    const k = this.findKey(key);
    if (!k) return false;
    const act = (k.activations || []).find(a => a.device_id === deviceId);
    if (!act) return false;
    act.status = 'rejected';
    this.save();
    return true;
  }

  findAnyActivationByDevice(deviceId) {
    for (const k of this.data.keys) {
      const act = (k.activations || []).find(a => a.device_id === deviceId);
      if (act) return { key: k.key, activation: act };
    }
    return null;
  }

  getPendingActivations() {
    const pending = [];
    for (const k of this.data.keys) {
      for (const a of (k.activations || [])) {
        if (a.status === 'pending') {
          pending.push({ key: k.key, ...a });
        }
      }
    }
    return pending.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
  }

  getActivationCount(key) {
    const k = this.findKey(key);
    if (!k) return 0;
    return (k.activations || []).filter(a => a.status === 'approved').length;
  }

  revokeDevice(key, deviceId) {
    const k = this.findKey(key);
    if (!k) return false;
    const act = (k.activations || []).find(a => a.device_id === deviceId);
    if (!act) return false;
    act.status = 'rejected';
    this.save();
    return true;
  }

  deleteKey(key) {
    this.data.keys = this.data.keys.filter(k => k.key !== key);
    this.save();
  }

  getAllKeys() {
    return [...this.data.keys].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
  }

  getStats() {
    const keys = this.data.keys;
    let totalActs = 0, approvedActs = 0, pendingActs = 0, rejectedActs = 0;
    for (const k of keys) {
      for (const a of (k.activations || [])) {
        totalActs++;
        if (a.status === 'approved') approvedActs++;
        else if (a.status === 'pending') pendingActs++;
        else if (a.status === 'rejected') rejectedActs++;
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const activeToday = keys.reduce((sum, k) =>
      sum + (k.activations || []).filter(a =>
        a.status === 'approved' && a.approved_at && a.approved_at.startsWith(today)
      ).length, 0
    );

    return {
      total_keys: keys.length,
      total_activations: totalActs,
      approved: approvedActs,
      pending: pendingActs,
      rejected: rejectedActs,
      active_today: activeToday
    };
  }

  close() { }
}

module.exports = LicenseDatabase;
