'use strict';
const fs = require('fs');
const path = require('path');

class Store {
  constructor(file) {
    this.file = file;
    this.data = {};
    this.timer = null;
    this.retries = 0;
    let raw = null;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { }
    if (raw === null) return;
    let ok = false;
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object' && !Array.isArray(j)) { this.data = j; ok = true; }
    } catch { }
    if (!ok) {
      this.recoveredFrom = `${file}.corrupt-${Date.now()}`;
      try { fs.copyFileSync(file, this.recoveredFrom); } catch { this.recoveredFrom = null; }
      console.warn('Store: config is unreadable, starting empty. Backup:', this.recoveredFrom);
    }
  }

  get(key, def) {
    const v = this.data[key];
    return v === undefined ? def : v;
  }

  set(key, value) {
    this.data[key] = value;
    this.saveSoon();
  }

  saveSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush() {
    clearTimeout(this.timer);
    const tmp = this.file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1), 'utf8');
      fs.renameSync(tmp, this.file);
      this.retries = 0;
    } catch (e) {
      console.error('Store.flush:', e.message);
      if (this.retries < 5) {
        this.retries += 1;
        this.timer = setTimeout(() => this.flush(), 1000);
        if (this.timer.unref) this.timer.unref();
      }
    }
  }
}

module.exports = { Store };
