const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

class LicenseDatabase {
  constructor(dbPath, github) {
    this.dbPath = dbPath || path.join(__dirname, 'licenses.json');
    this.github = github || null;
    this.data = { keys: [], nextId: 1 };
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.load();
  }

  load() {
    // GitHub is the ONLY persistent source (Render's local disk is ephemeral
    // and is wiped on every redeploy/reset). Load it FIRST; local file is only
    // a mirror/fallback if GitHub is unreachable.
    let localData = null;
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8').replace(/^\uFEFF/, '');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.keys)) localData = parsed;
      }
    } catch { }

    if (this.github) {
      try {
        const raw = this._githubLoad();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.keys)) {
            // Prefer the copy holding MORE keys (latest state keeps growing).
            if (!localData || (parsed.keys.length >= localData.keys.length && parsed.nextId >= localData.nextId)) {
              this.data = parsed;
            } else {
              this.data = localData;
            }
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
            this.migrateOldKeys();
            return;
          }
        }
      } catch { }
    }

    if (localData) {
      this.data = localData;
      this.migrateOldKeys();
      return;
    }

    this.data = { keys: [], nextId: 1 };
  }

  save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch { }
    if (this.github) {
      this._saveRequested = true;
      if (!this._saveLoopRunning) {
        this._saveLoopRunning = true;
        this._saveLoop();
      }
    }
  }

  /**
   * Durable save loop: runs until the GitHub copy equals the CURRENT in-memory
   * state. Every change made while a PUT is in flight flags _saveRequested so
   * the loop keeps going until the latest state is persisted — nothing is
   * silently dropped, and deletions also reach GitHub.
   */
  async _saveLoop() {
    try {
      while (true) {
        this._saveRequested = false;
        const snapshot = JSON.stringify(this.data, null, 2);
        let ok = false;
        try {
          ok = await this._githubPut(snapshot);
        } catch (e) { ok = false; }
        if (ok) {
          if (JSON.stringify(this.data, null, 2) !== snapshot) {
            // Data changed mid-flight — persist again.
            continue;
          }
          if (!this._saveRequested) {
            // GitHub now matches in-memory state; nothing pending — stop.
            break;
          }
        } else {
          // Failure — retry, never silently lose the save.
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    } finally {
      this._saveLoopRunning = false;
    }
  }

  _githubPut(content) {
    const gh = this.github;
    const getSha = () => new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.github.com',
        path: `/repos/${gh.owner}/${gh.repo}/contents/${gh.path}`,
        method: 'GET',
        headers: {
          'User-Agent': 'license-server',
          'Authorization': `token ${gh.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      };
      const req = https.request(opts, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve(json.sha || null);
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.end();
    });
    return getSha().then(sha => new Promise((resolve) => {
      const putOpts = {
        hostname: 'api.github.com',
        path: `/repos/${gh.owner}/${gh.repo}/contents/${gh.path}`,
        method: 'PUT',
        headers: {
          'User-Agent': 'license-server',
          'Authorization': `token ${gh.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        }
      };
      const body = JSON.stringify({
        message: 'auto-save licenses',
        content: Buffer.from(content).toString('base64'),
        sha: sha || undefined
      });
      const req = https.request(putOpts, res => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      });
      req.on('error', () => resolve(false));
      req.write(body);
      req.end();
    }));
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

  _githubLoad() {
    const script = `
      const https = require('https');
      const opts = {
        hostname: 'api.github.com',
        path: '/repos/${this.github.owner}/${this.github.repo}/contents/${this.github.path}',
        headers: {
          'User-Agent': 'license-server',
          'Authorization': 'token ${this.github.token}',
          'Accept': 'application/vnd.github.v3.raw'
        }
      };
      https.get(opts, res => {
        if (res.statusCode !== 200) process.exit(1);
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => process.stdout.write(b));
      }).on('error', () => process.exit(1));
    `;
    try {
      return execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { encoding: 'utf8', timeout: 15000 });
    } catch { return null; }
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

  removeDevice(key, deviceId) {
    const k = this.findKey(key);
    if (!k) return false;
    k.activations = (k.activations || []).filter(a => a.device_id !== deviceId);
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

  reset() {
    this.data = { keys: [], nextId: 1 };
    this.save();
  }

  close() { }
}

module.exports = LicenseDatabase;