'use strict';
const fs = require('fs');
const path = require('path');
const util = require('util');

const pad = (n, w = 2) => String(n).padStart(w, '0');
function stamp(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

class Logger {
  constructor({ dir, name = 'polaris', maxBytes = 512 * 1024, keep = 2, now = () => new Date() } = {}) {
    this.dir = dir;
    this.file = path.join(dir, `${name}.log`);
    this.maxBytes = maxBytes;
    this.keep = keep;
    this.now = now;
    this.size = null;
    this.last = null;
    this.broken = false;
    this.orig = null;
  }

  _rotate() {
    for (let i = this.keep; i >= 1; i--) {
      const from = i === 1 ? this.file : `${this.file}.${i - 1}`;
      const to = `${this.file}.${i}`;
      try { if (fs.existsSync(from)) fs.renameSync(from, to); } catch { }
    }
    this.size = 0;
  }

  _append(line) {
    if (this.broken) return;
    try {
      if (this.size === null) {
        fs.mkdirSync(this.dir, { recursive: true });
        try { this.size = fs.statSync(this.file).size; } catch { this.size = 0; }
      }
      if (this.size > this.maxBytes) this._rotate();
      fs.appendFileSync(this.file, line, 'utf8');
      this.size += Buffer.byteLength(line);
    } catch {
      this.broken = true;
    }
  }

  write(level, args) {
    let text = util.format(...args);
    if (text.length > 4000) text = `${text.slice(0, 4000)}… (+${text.length - 4000} chars)`;
    const key = `${level}\u0000${text}`;
    if (this.last && this.last.key === key) { this.last.n += 1; return; }
    this.flushRepeats();
    this.last = { key, n: 0 };
    this._append(`${stamp(this.now())} [${level}] ${text.replace(/\r?\n/g, '\n    ')}\n`);
  }

  flushRepeats() {
    if (this.last && this.last.n > 0) this._append(`${stamp(this.now())} [INFO] (previous message repeated ${this.last.n} more times)\n`);
    this.last = null;
  }

  info(...a) { this.write('INFO', a); }
  warn(...a) { this.write('WARN', a); }
  error(...a) { this.write('ERROR', a); }

  tail(n = 80) {
    this.flushRepeats();
    try {
      const lines = fs.readFileSync(this.file, 'utf8').split('\n');
      return lines.slice(-n - 1).join('\n').trim();
    } catch { return ''; }
  }

  hookConsole(target = console) {
    if (this.orig) return;
    this.orig = {};
    for (const [method, level] of [['log', 'INFO'], ['info', 'INFO'], ['warn', 'WARN'], ['error', 'ERROR']]) {
      this.orig[method] = target[method];
      target[method] = (...args) => {
        try { this.write(level, args); } catch { }
        return this.orig[method].apply(target, args);
      };
    }
    this.target = target;
  }

  unhookConsole() {
    if (!this.orig) return;
    for (const [m, fn] of Object.entries(this.orig)) this.target[m] = fn;
    this.orig = null;
  }
}

module.exports = { Logger, stamp };
