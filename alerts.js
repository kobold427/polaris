'use strict';
const AlertText = require('./shared/alerttext');

const STALE_MS = 2 * 60 * 1000;

class Alerts {
  constructor({ audio, banner, toast, settings, tr = (k, p) => (p ? k.replace(/\{(\w+)\}/g, (m, key) => (key in p ? String(p[key]) : m)) : k), log = () => {} }) {
    this.audio = audio;
    this.banner = banner;
    this.toast = toast;
    this.settings = settings;
    this.tr = tr;
    this.log = log;
    this.last = null;
  }

  handle(_title, _body, info) {
    const text = AlertText.of(info, this.tr);
    const a = this.settings();
    const did = { sound: false, banner: false, toast: false };
    if (!info || info.kind === 'session') {
      if (text.title) { this.toast(text.title, text.body, { silent: true }); did.toast = true; }
      this.last = did;
      return did;
    }
    const stale = (info.late || 0) > STALE_MS;
    if (!stale && a.sound) { this._sound(a); did.sound = true; }
    if (!stale && a.banner) { this._banner(info, text); did.banner = true; }
    if (a.toast) { this.toast(text.title, [text.body, text.extra].filter(Boolean).join('\n'), { silent: did.sound }); did.toast = true; }
    this.last = { ...did, stale };
    return this.last;
  }

  _sound(a) {
    Promise.resolve(this.audio.play({ tone: a.tone, volume: a.volume, file: a.file }))
      .catch((e) => this.log(`alerts: sound failed: ${e && e.message}`));
  }

  _banner(info, text) {
    try { this.banner.show({ info, text }); } catch (e) { this.log(`alerts: banner failed: ${e && e.message}`); }
  }

  test(what) {
    const a = this.settings();
    if (what === 'sound') return this.audio.play({ tone: a.tone, volume: a.volume, file: a.file });
    if (what === 'banner') {
      const info = { kind: 'work-end', subject: 'Focus', next: 'short', autoStart: false, late: 0, weeklyGoal: false, demo: true };
      this._banner(info, AlertText.of(info, this.tr));
      return { ok: true };
    }
    return { ok: false };
  }
}

module.exports = { Alerts, STALE_MS };
