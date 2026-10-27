'use strict';
const fs = require('fs');
const path = require('path');
const { webPreferences, lockNavigation } = require('./window-kit');

const EXT = ['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.opus'];
const MAX_BYTES = 6 * 1024 * 1024;

async function checkSoundFile(file, fsImpl = fs.promises) {
  const f = String(file || '');
  if (!f) return { ok: false, reason: 'missing' };
  if (!EXT.includes(path.extname(f).toLowerCase())) return { ok: false, reason: 'type' };
  let st;
  try { st = await fsImpl.stat(f); } catch { return { ok: false, reason: 'missing' }; }
  if (!st.isFile()) return { ok: false, reason: 'missing' };
  if (st.size > MAX_BYTES) return { ok: false, reason: 'size' };
  if (st.size === 0) return { ok: false, reason: 'empty' };
  return { ok: true, name: path.basename(f), size: st.size };
}

class AudioPlayer {
  constructor({ BrowserWindow, preload, rendererDir, fsImpl = fs.promises, log = () => {}, idleMs = 120000, setTimer = setTimeout, clearTimer = clearTimeout }) {
    Object.assign(this, { BrowserWindow, preload, rendererDir, log, idleMs, setTimer, clearTimer });
    this.fs = fsImpl;
    this.win = null;
    this.ready = false;
    this.queue = [];
    this.idle = null;
    this.played = 0;
  }

  _create() {
    const win = new this.BrowserWindow({
      width: 100, height: 100, show: false, frame: false, skipTaskbar: true, focusable: false,
      title: 'Polaris — Audio',
      webPreferences: webPreferences(this.preload, { autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false }),
    });
    lockNavigation(win.webContents);
    win.webContents.on('did-finish-load', () => {
      this.ready = true;
      const q = this.queue.splice(0);
      for (const msg of q) win.webContents.send('audio:play', msg);
    });
    win.webContents.on('render-process-gone', () => { this.win = null; this.ready = false; });
    win.on('closed', () => { this.win = null; this.ready = false; });
    win.loadFile(path.join(this.rendererDir, 'audio.html'), { query: { key: 'audio' } });
    this.win = win;
    return win;
  }

  async play({ tone = 'bell', volume = 70, file = '' } = {}) {
    let data = null;
    let fallback = null;
    if (tone === 'custom') {
      const chk = await checkSoundFile(file, this.fs);
      if (chk.ok) {
        try { data = await this.fs.readFile(file); } catch (e) { fallback = 'read'; this.log(`audio: cannot read ${file}: ${e.message}`); }
      } else {
        fallback = chk.reason;
        this.log(`audio: custom sound unusable (${chk.reason}): ${file}`);
      }
      if (!data) tone = 'bell';
    }
    const msg = { tone, volume, data };
    const win = this.win && !this.win.isDestroyed() ? this.win : this._create();
    if (this.ready) win.webContents.send('audio:play', msg); else this.queue.push(msg);
    this.played += 1;
    this.clearTimer(this.idle);
    this.idle = this.setTimer(() => this.close(), this.idleMs);
    if (this.idle && this.idle.unref) this.idle.unref();
    return { ok: true, tone, ...(fallback ? { fallback } : {}) };
  }

  close() {
    this.clearTimer(this.idle);
    this.idle = null;
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
    this.ready = false;
    this.queue = [];
  }

  dispose() { this.close(); }
}

module.exports = { AudioPlayer, checkSoundFile, EXT, MAX_BYTES };
