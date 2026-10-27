'use strict';
const { EventEmitter } = require('events');
const { dayKeyOf, hms } = require('./pomodoro-log');
const Heat = require('./shared/heat');
const Tones = require('./shared/tones');

const PHASES = ['work', 'short', 'long'];
const PALETTE = ['#0a84ff', '#30d158', '#bf5af2', '#ff453a', '#5ac8fa', '#ffd60a', '#ff375f', '#64d2ff', '#ac8e68', '#8e8e93'];
const HEX = /^#[0-9a-f]{6}$/i;

const DEFAULTS = {
  durations: { work: 25, short: 5, long: 15 },
  longEvery: 4,
  autoStart: false,
  idleEndMin: 30,
  colors: { work: '#0a84ff', short: '#30d158', long: '#bf5af2' },
  subjects: [{ name: 'Focus', color: PALETTE[0] }],
  subject: 'Focus',
  goalMin: 180,
  weeklyGoalMin: 900,
  alerts: { sound: true, tone: 'bell', file: '', volume: 70, banner: true, toast: false },
  logFolder: 'Desktop Widgets/Pomodoro',
};

const int = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const midnightOf = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const cleanName = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40);

function normalizeAlerts(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULTS.alerts;
  const flag = (v, def) => (typeof v === 'boolean' ? v : def);
  const file = typeof r.file === 'string' ? r.file.replace(/\0/g, '').trim().slice(0, 520) : '';
  let tone = Tones.IDS.includes(r.tone) || r.tone === 'custom' ? r.tone : d.tone;
  if (tone === 'custom' && !file) tone = d.tone;
  return { sound: flag(r.sound, d.sound), tone, file, volume: int(r.volume, 0, 100, d.volume), banner: flag(r.banner, d.banner), toast: flag(r.toast, d.toast) };
}

function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULTS;
  const dur = r.durations || {};
  const col = r.colors || {};
  const subjects = [];
  for (const s of Array.isArray(r.subjects) ? r.subjects : []) {
    const name = cleanName(s && s.name);
    if (!name || subjects.some((x) => x.name === name) || subjects.length >= 40) continue;
    subjects.push({ name, color: HEX.test(s.color) ? s.color.toLowerCase() : PALETTE[subjects.length % PALETTE.length] });
  }
  if (!subjects.length) subjects.push(...d.subjects.map((s) => ({ ...s })));
  const cur = cleanName(r.subject);
  return {
    durations: {
      work: int(dur.work, 1, 180, d.durations.work), short: int(dur.short, 1, 60, d.durations.short), long: int(dur.long, 1, 120, d.durations.long),
    },
    longEvery: int(r.longEvery, 2, 12, d.longEvery),
    autoStart: !!r.autoStart,
    idleEndMin: int(r.idleEndMin, 5, 240, d.idleEndMin),
    colors: Object.fromEntries(PHASES.map((p) => [p, HEX.test(col[p]) ? col[p].toLowerCase() : d.colors[p]])),
    subjects,
    subject: subjects.some((s) => s.name === cur) ? cur : subjects[0].name,
    goalMin: int(r.goalMin, 10, 1440, d.goalMin),
    weeklyGoalMin: int(r.weeklyGoalMin, 0, 10080, d.weeklyGoalMin),
    alerts: normalizeAlerts(r.alerts),
    logFolder: String(r.logFolder || d.logFolder).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') || d.logFolder,
  };
}

class PomodoroEngine extends EventEmitter {
  constructor({ store, log, now = Date.now, notify = () => {}, getFirstDay = () => 1 }) {
    super();
    this.store = store;
    this.log = log;
    this.now = now;
    this.notify = notify;
    this.getFirstDay = getFirstDay;
    this.weekBase = { start: '', sec: 0 };
    this.weekRev = 0;
    this.settings = normalizeSettings(store.get('pomodoro', {}));
    this.phase = 'work';
    this.status = 'idle';
    this.remainingMs = this.durMs('work');
    this.endAt = 0;
    this.session = null;
    this.seg = null;
    this.brk = null;
    this.brkTotal = 0;
    this.day = this._emptyDay(dayKeyOf(now()));
    this.timer = null;
  }

  _notify(title, body, info) {
    try { this.notify(title, body, info); } catch (e) { console.warn('pomodoro notify:', e && e.message); }
  }

  _emptyDay(key) { return { key, bySubject: {}, focusSec: 0, breakSec: 0, pomodoros: 0 }; }
  durMs(phase) { return this.settings.durations[phase] * 60000; }

  async load() {
    const t = await this.log.day(this.day.key);
    this.day.bySubject = { ...t.bySubject };
    this.day.focusSec = t.focusSec;
    this.day.pomodoros = t.pomodoros;
    await this.refreshWeek();
    this._changed();
  }

  async refreshWeek() {
    const rev = ++this.weekRev;
    const today = this.day.key;
    const first = this.getFirstDay();
    const start = Heat.weekStart(today, first);
    let sec = 0;
    try {
      if (this.log.flush) await this.log.flush();
      for (let key = start; key < today; key = Heat.addDays(key, 1)) sec += (await this.log.day(key)).focusSec || 0;
    } catch (e) {
      console.warn('pomodoro week:', e.message);
      sec = 0;
    }
    if (rev !== this.weekRev || today !== this.day.key) return;
    this.weekBase = { start, sec };
    this._changed();
  }

  weekSec() { return this.weekBase.sec + this.day.focusSec; }

  startTicking(ms = 250) {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), ms);
    if (this.timer.unref) this.timer.unref();
  }

  async shutdown() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.session) this.endSession('app quit', false);
    await this.log.flush();
  }

  _log(entry) {
    const day = dayKeyOf(entry.start != null ? entry.start : entry.ts);
    Promise.resolve(this.log.write(day, entry)).catch((e) => console.warn('pomodoro log:', e.message));
  }

  _changed() {
    this.emit('state', this.getState());
  }

  getState() {
    const now = this.now();
    return {
      now,
      phase: this.phase,
      status: this.status,
      durationMs: this.durMs(this.phase),
      remainingMs: this.status === 'running' ? Math.max(0, this.endAt - now) : this.remainingMs,
      endAt: this.status === 'running' ? this.endAt : 0,
      subject: this.settings.subject,
      settings: JSON.parse(JSON.stringify(this.settings)),
      day: { ...this.day, bySubject: { ...this.day.bySubject } },
      seg: this.seg ? { ...this.seg } : null,
      cycle: this.day.pomodoros % this.settings.longEvery,
      week: { start: this.weekBase.start, doneSec: this.weekSec(), goalMin: this.settings.weeklyGoalMin },
      session: this.session ? { ...this.session, bySubject: { ...this.session.bySubject } } : null,
    };
  }

  _openSeg(ts) { this.seg = { subject: this.settings.subject, start: ts }; }

  _closeSeg(ts) {
    if (!this.seg) return 0;
    const { subject, start } = this.seg;
    this.seg = null;
    const sec = Math.round((ts - start) / 1000);
    if (sec < 1) return 0;
    this._log({ t: 'segment', start, end: ts, subject });
    this.day.bySubject[subject] = (this.day.bySubject[subject] || 0) + sec;
    this.day.focusSec += sec;
    if (this.session) {
      this.session.focusSec += sec;
      this.session.bySubject[subject] = (this.session.bySubject[subject] || 0) + sec;
    }
    return sec;
  }

  _pauseBrk(ts) {
    if (!this.brk) return;
    this.brkTotal += (ts - this.brk.start) / 1000;
    this.brk = null;
  }

  _endBrk(ts, how) {
    if (!this.brk && !this.brkTotal) return;
    this._pauseBrk(ts);
    const sec = Math.round(this.brkTotal);
    this.brkTotal = 0;
    this.day.breakSec += sec;
    if (this.session) this.session.breakSec += sec;
    this._log({ t: 'break-end', ts, kind: this.phase, seconds: sec, how });
  }

  _stopRunning(ts, how) {
    if (this.phase === 'work') this._closeSeg(ts);
    else this._endBrk(ts, how);
  }

  _beginSession(ts) {
    this.session = { startedAt: ts, lastActive: ts, pomodoros: 0, focusSec: 0, breakSec: 0, bySubject: {} };
    this._log({ t: 'session-start', ts, subject: this.settings.subject });
  }

  _touch(ts) { if (this.session) this.session.lastActive = ts; }

  start(ts = this.now()) {
    if (this.status === 'running') return;
    const resumed = this.status === 'paused';
    const fresh = !this.session;
    if (fresh) this._beginSession(ts);
    if (this.phase === 'work') {
      this._openSeg(ts);
      if (!fresh) this._log({ t: resumed ? 'resume' : 'work-start', ts, subject: this.settings.subject, phase: 'work' });
    } else if (resumed) {
      this.brk = { start: ts };
      if (!fresh) this._log({ t: 'resume', ts, subject: this.settings.subject, phase: this.phase });
    } else {
      this.brk = { start: ts };
      this.brkTotal = 0;
      this._log({ t: 'break-start', ts, kind: this.phase, minutes: this.settings.durations[this.phase] });
    }
    if (this.status === 'idle') this.remainingMs = this.durMs(this.phase);
    this.endAt = ts + this.remainingMs;
    this.status = 'running';
    this._touch(ts);
    this._changed();
  }

  pause(ts = this.now()) {
    if (this.status !== 'running') return;
    this.remainingMs = Math.max(0, this.endAt - ts);
    if (this.phase === 'work') this._closeSeg(ts);
    else this._pauseBrk(ts);
    this._log({ t: 'pause', ts, subject: this.settings.subject, phase: this.phase });
    this.status = 'paused';
    this.endAt = 0;
    this._touch(ts);
    this._changed();
  }

  toggle() { if (this.status === 'running') this.pause(); else this.start(); }

  _goIdle(phase) {
    this.phase = phase;
    this.status = 'idle';
    this.endAt = 0;
    this.remainingMs = this.durMs(phase);
  }

  reset(ts = this.now()) {
    const active = this.status !== 'idle';
    if (this.status === 'running') this._stopRunning(ts, 'reset');
    else if (this.phase !== 'work') this._endBrk(ts, 'reset');
    if (active && this.session) this._log({ t: 'reset', ts });
    this._goIdle(this.phase);
    this._touch(ts);
    this._changed();
  }

  setPhase(phase, ts = this.now()) {
    if (!PHASES.includes(phase) || (phase === this.phase && this.status === 'idle')) return;
    if (this.status === 'running') this._stopRunning(ts, 'switched');
    else if (this.status === 'paused' && this.phase !== 'work') this._endBrk(ts, 'switched');
    this._goIdle(phase);
    this._touch(ts);
    this._changed();
  }

  skip(ts = this.now()) {
    const was = this.phase;
    if (this.status === 'running') this._stopRunning(ts, 'skipped');
    else if (this.status === 'paused' && was !== 'work') this._endBrk(ts, 'skipped');
    this._goIdle(was === 'work' ? 'short' : 'work');
    this._touch(ts);
    if (this.settings.autoStart) this.start(ts);
    this._changed();
  }

  _complete(ts, now = ts) {
    const was = this.phase;
    const late = Math.max(0, now - ts);
    let info; let title; let body;
    if (was === 'work') {
      const weekBefore = this.weekSec();
      this._closeSeg(ts);
      const goalSec = this.settings.weeklyGoalMin * 60;
      const weeklyGoal = goalSec > 0 && weekBefore < goalSec && this.weekSec() >= goalSec;
      this.day.pomodoros += 1;
      if (this.session) this.session.pomodoros += 1;
      this._log({ t: 'pomodoro', ts, subject: this.settings.subject, n: this.day.pomodoros });
      const long = this.day.pomodoros % this.settings.longEvery === 0;
      this._goIdle(long ? 'long' : 'short');
      info = { kind: 'work-end', subject: this.settings.subject, next: long ? 'long' : 'short', autoStart: this.settings.autoStart, late, weeklyGoal };
      title = 'Pomodoro complete';
      body = `${this.settings.subject}: time for a ${long ? 'long' : 'short'} break`;
    } else {
      this._endBrk(ts, 'finished');
      this._goIdle('work');
      info = { kind: 'break-end', subject: this.settings.subject, next: 'work', autoStart: this.settings.autoStart, late, weeklyGoal: false };
      title = 'Break is over';
      body = 'Time to get back to work';
    }
    this._touch(ts);
    if (this.settings.autoStart) this.start(now);
    this._changed();
    this._notify(title, body, info);
  }

  _finishSession(ts, reason) {
    if (!this.session) return null;
    const s = this.session;
    const summary = { reason, start: s.startedAt, end: ts, focusSec: s.focusSec, breakSec: s.breakSec, pomodoros: s.pomodoros, bySubject: { ...s.bySubject } };
    this._log({ t: 'session-end', ts, reason, summary });
    this.session = null;
    return summary;
  }

  endSession(reason = 'ended', notify = true, ts = this.now()) {
    if (!this.session && this.status === 'idle') return null;
    if (this.status === 'running') this._stopRunning(ts, 'session ended');
    else if (this.status === 'paused' && this.phase !== 'work') this._endBrk(ts, 'session ended');
    const summary = this._finishSession(ts, reason);
    this._goIdle('work');
    if (summary) {
      this.emit('sessionEnd', summary);
      if (notify) {
        const parts = Object.entries(summary.bySubject).sort((a, b) => b[1] - a[1]).map(([n, s]) => `${n} — ${hms(s)}`);
        this._notify(`Session complete: ${hms(summary.focusSec)}`, [`Pomodoros: ${summary.pomodoros}`, ...parts].join('\n'),
          { kind: 'session', focusSec: summary.focusSec, pomodoros: summary.pomodoros, bySubject: { ...summary.bySubject } });
      }
    }
    this._changed();
    return summary;
  }

  setSubject(name, ts = this.now()) {
    name = cleanName(name);
    const from = this.settings.subject;
    if (!name || name === from || !this.settings.subjects.some((s) => s.name === name)) return;
    if (this.status === 'running' && this.phase === 'work') {
      this._closeSeg(ts);
      this.settings.subject = name;
      this._openSeg(ts);
    } else {
      this.settings.subject = name;
    }
    if (this.session) this._log({ t: 'switch', ts, from, to: name });
    this._touch(ts);
    this._persist();
    this._changed();
  }

  addSubject(name, color) {
    name = cleanName(name);
    if (!name) return false;
    const s = this.settings;
    if (s.subjects.some((x) => x.name === name) || s.subjects.length >= 40) { this.setSubject(name); return false; }
    s.subjects.push({ name, color: HEX.test(color) ? color.toLowerCase() : PALETTE[s.subjects.length % PALETTE.length] });
    this._persist();
    this.setSubject(name);
    this._changed();
    return true;
  }

  updateSubject(oldName, patch = {}) {
    const s = this.settings;
    const item = s.subjects.find((x) => x.name === oldName);
    if (!item) return false;
    const name = patch.name !== undefined ? cleanName(patch.name) : item.name;
    if (!name || (name !== oldName && s.subjects.some((x) => x.name === name))) return false;
    const ts = this.now();
    const renamed = name !== oldName;
    const wasCurrent = s.subject === oldName;
    if (renamed && wasCurrent && this.seg) this._closeSeg(ts);
    if (patch.color && HEX.test(patch.color)) item.color = patch.color.toLowerCase();
    item.name = name;
    if (wasCurrent) s.subject = name;
    if (renamed && wasCurrent && this.status === 'running' && this.phase === 'work') this._openSeg(ts);
    if (renamed && this.day.bySubject[oldName] !== undefined) {
      this.day.bySubject[name] = (this.day.bySubject[name] || 0) + this.day.bySubject[oldName];
      delete this.day.bySubject[oldName];
    }
    this._persist();
    this._changed();
    return true;
  }

  removeSubject(name) {
    const s = this.settings;
    if (s.subjects.length <= 1 || !s.subjects.some((x) => x.name === name)) return false;
    const next = s.subjects.find((x) => x.name !== name).name;
    if (s.subject === name) this.setSubject(next);
    s.subjects = s.subjects.filter((x) => x.name !== name);
    this._persist();
    this._changed();
    return true;
  }

  setSettings(patch = {}) {
    const keep = this.settings;
    const next = normalizeSettings({
      ...keep,
      durations: { ...keep.durations, ...(patch.durations || {}) },
      colors: { ...keep.colors, ...(patch.colors || {}) },
      alerts: { ...keep.alerts, ...(patch.alerts && typeof patch.alerts === 'object' ? patch.alerts : {}) },
      ...Object.fromEntries(['longEvery', 'autoStart', 'idleEndMin', 'goalMin', 'weeklyGoalMin', 'logFolder'].filter((k) => k in patch).map((k) => [k, patch[k]])),
    });
    const folderChanged = next.logFolder !== keep.logFolder;
    this.settings = next;
    if (this.status === 'idle') this.remainingMs = this.durMs(this.phase);
    this._persist();
    this._changed();
    if (folderChanged) this.emit('logFolder', next.logFolder);
  }

  _persist() { this.store.set('pomodoro', this.settings); }

  tick(ts = this.now()) {
    if (dayKeyOf(ts) !== this.day.key) this._rollover(ts);
    if (this.status === 'running') {
      if (ts >= this.endAt) this._complete(Math.min(ts, this.endAt), ts);
    } else if (this.session && ts - this.session.lastActive >= this.settings.idleEndMin * 60000) {
      this.endSession('idle', false, this.session.lastActive);
    }
  }

  _rollover(ts) {
    const mid = midnightOf(ts);
    const running = this.status === 'running';
    if (this.seg) this._closeSeg(mid);
    if (this.brk) this._pauseBrk(mid);
    if (this.session) {
      this._finishSession(mid, 'midnight');
    }
    const prev = this.day;
    this.day = this._emptyDay(dayKeyOf(ts));
    const start = Heat.weekStart(this.day.key, this.getFirstDay());
    this.weekBase = { start, sec: this.weekBase.start === start ? this.weekBase.sec + prev.focusSec : 0 };
    if (running) {
      this._beginSession(mid);
      if (this.phase === 'work') this._openSeg(mid); else this.brk = { start: mid };
    }
    this._changed();
  }
}

module.exports = { PomodoroEngine, normalizeSettings, normalizeAlerts, DEFAULTS, PALETTE, PHASES };
