const Database = require('better-sqlite3');
const path = require('path');

class LicenseDatabase {
  constructor(dbPath) {
    this.db = new Database(dbPath || path.join(__dirname, 'licenses.db'));
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        device_id TEXT,
        device_name TEXT,
        device_model TEXT,
        ios_version TEXT,
        bundle_id TEXT,
        revoked INTEGER DEFAULT 0,
        approved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        activated_at DATETIME,
        last_used DATETIME
      )
    `);
  }

  addKey(key) {
    const stmt = this.db.prepare('INSERT INTO licenses (key) VALUES (?)');
    stmt.run(key);
  }

  findKey(key) {
    const stmt = this.db.prepare('SELECT * FROM licenses WHERE key = ?');
    return stmt.get(key);
  }

  addDeviceInfo(key, deviceId, deviceName, deviceModel, iosVersion, bundleId) {
    const stmt = this.db.prepare(
      `UPDATE licenses SET
        device_id = ?, device_name = ?, device_model = ?,
        ios_version = ?, bundle_id = ?, activated_at = CURRENT_TIMESTAMP
       WHERE key = ?`
    );
    stmt.run(deviceId, deviceName || null, deviceModel || null, iosVersion || null, bundleId || null, key);
  }

  approveKey(key) {
    const stmt = this.db.prepare('UPDATE licenses SET approved = 1 WHERE key = ?');
    stmt.run(key);
  }

  rejectKey(key) {
    const stmt = this.db.prepare('UPDATE licenses SET approved = -1 WHERE key = ?');
    stmt.run(key);
  }

  revokeKey(key) {
    const stmt = this.db.prepare('UPDATE licenses SET revoked = 1 WHERE key = ?');
    stmt.run(key);
  }

  unrevokeKey(key) {
    const stmt = this.db.prepare('UPDATE licenses SET revoked = 0 WHERE key = ?');
    stmt.run(key);
  }

  deleteKey(key) {
    const stmt = this.db.prepare('DELETE FROM licenses WHERE key = ?');
    stmt.run(key);
  }

  logUsage(key) {
    const stmt = this.db.prepare('UPDATE licenses SET last_used = CURRENT_TIMESTAMP WHERE key = ?');
    stmt.run(key);
  }

  getAllKeys() {
    const stmt = this.db.prepare('SELECT * FROM licenses ORDER BY created_at DESC');
    return stmt.all();
  }

  getPendingCount() {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM licenses WHERE device_id IS NOT NULL AND approved = 0 AND revoked = 0"
    ).get();
    return row.count;
  }

  getStats() {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN revoked = 1 THEN 1 ELSE 0 END) as revoked_count,
        SUM(CASE WHEN device_id IS NOT NULL AND approved = 1 AND revoked = 0 THEN 1 ELSE 0 END) as activated,
        SUM(CASE WHEN device_id IS NULL AND revoked = 0 THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN device_id IS NOT NULL AND approved = 0 AND revoked = 0 THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN last_used IS NOT NULL AND date(last_used) = date('now') THEN 1 ELSE 0 END) as active_today
      FROM licenses
    `).get();
    return row;
  }

  close() {
    this.db.close();
  }
}

module.exports = LicenseDatabase;
