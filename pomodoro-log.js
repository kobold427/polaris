'use strict';
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const pad = (n) => String(n).padStart(2, '0');
const clock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const clockShort = (ts) => clock(ts).slice(0, 5);
const dayKeyOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hms = (sec) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const KIND = { short: 'short', long: 'long' };

const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const SEGMENT_RE = /^- (\d{2}):(\d{2}):(\d{2})–(\d{2}):(\d{2}):(\d{2}) 📚 (.+) · (\d+):(\d{2}):(\d{2})\s*$/;
const MARK = '✷';
const POMODORO_RE = /^- \d{2}:\d{2}:\d{2} (?:✷|🍅)/;
const SESSION_RE = /^## Session (\d+)/;
const SESSION_COUNT_RE = /^## Session \d+/gm;

function header(dayKey) {
  const [y, m, d] = dayKey.split('-');
  return `---\ndate: ${dayKey}\ntags: [pomodoro-log]\n---\n# Pomodoro · ${y}-${m}-${d}\n`;
}

function formatEntry(e, ctx = {}) {
  const t = e.ts != null ? clock(e.ts) : '';
  switch (e.t) {
    case 'session-start': return ['', `## Session ${ctx.no} · ${clockShort(e.ts)}`, `- ${t} ▶ Session started · ${e.subject}`];
    case 'work-start': return [`- ${t} ▶ Work · ${e.subject}`];
    case 'resume': return [`- ${t} ⏵ Resumed${e.phase === 'work' ? ` · ${e.subject}` : ' · break'}`];
    case 'pause': return [`- ${t} ⏸ Paused${e.phase === 'work' ? ` · ${e.subject}` : ' · break'}`];
    case 'segment': return [`- ${clock(e.start)}–${clock(e.end)} 📚 ${e.subject} · ${hms((e.end - e.start) / 1000)}`];
    case 'pomodoro': return [`- ${t} ${MARK} Pomodoro ${e.n} · ${e.subject}`];
    case 'break-start': return [`- ${t} ☕ Break (${KIND[e.kind] || e.kind}) · ${e.minutes} min`];
    case 'break-end': return [`- ${t} ☕ Break ended · ${hms(e.seconds)} (${e.how})`];
    case 'switch': return [`- ${t} 🔁 Subject changed · ${e.from} → ${e.to}`];
    case 'reset': return [`- ${t} ↺ Timer reset`];
    case 'session-end': {
      const s = e.summary;
      const lines = [`- ${t} ■ Session ended (${e.reason})`, ''];
      lines.push(`> [!summary] Session ${ctx.no || ''} summary · ${clockShort(s.start)}–${clockShort(s.end)}`.replace('  ', ' '));
      lines.push(`> **Focus:** ${hms(s.focusSec)} · **breaks:** ${hms(s.breakSec)} · **pomodoros:** ${s.pomodoros}`);
      for (const [name, sec] of Object.entries(s.bySubject).sort((a, b) => b[1] - a[1])) lines.push(`> - ${name} — ${hms(sec)}`);
      lines.push('');
      return lines;
    }
    default: return [];
  }
}

function parseDay(text) {
  const bySubject = {};
  let focusSec = 0;
  let pomodoros = 0;
  let sessions = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.match(SEGMENT_RE);
    if (m) {
      const sec = Number(m[8]) * 3600 + Number(m[9]) * 60 + Number(m[10]);
      bySubject[m[7]] = (bySubject[m[7]] || 0) + sec;
      focusSec += sec;
    } else if (POMODORO_RE.test(raw)) pomodoros += 1;
    else if (SESSION_RE.test(raw)) sessions += 1;
  }
  return { bySubject, focusSec, pomodoros, sessions };
}

class PomodoroLog extends EventEmitter {
  constructor({ dir, fsImpl = fs }) {
    super();
    this.dir = dir;
    this.fs = fsImpl.promises;
    this.queue = Promise.resolve();
    this.cur = null;
    this.cache = new Map();
  }

  file(dayKey) { return path.join(this.dir(), `${dayKey}.md`); }

  _serial(fn) {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  async _read(file) {
    try { return await this.fs.readFile(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }

  write(dayKey, entry) {
    return this._serial(async () => {
      const file = this.file(dayKey);
      let text = await this._read(file);
      const isNew = text === null;
      if (isNew) text = header(dayKey);
      if (entry.t === 'session-start') {
        const no = (text.match(SESSION_COUNT_RE) || []).length + 1;
        this.cur = { day: dayKey, no };
      } else if (!this.cur || this.cur.day !== dayKey) {
        this.cur = { day: dayKey, no: (text.match(SESSION_COUNT_RE) || []).length };
      }
      const lines = formatEntry(entry, this.cur || {});
      if (!lines.length) return;
      await this.fs.mkdir(path.dirname(file), { recursive: true });
      await this.fs.writeFile(file, `${text.replace(/\s*$/, '\n')}${lines.join('\n')}\n`, 'utf8');
      if (entry.t === 'session-end') this.cur = null;
      this.emit('changed', dayKey);
    });
  }

  flush() { return this.queue; }

  async day(dayKey) {
    const text = await this._read(this.file(dayKey));
    return parseDay(text);
  }

  async range(from, to) {
    const dir = this.dir();
    let names;
    try { names = await this.fs.readdir(dir); } catch { return {}; }
    const out = {};
    for (const name of names) {
      const m = name.match(FILE_RE);
      if (!m || m[1] < from || m[1] > to) continue;
      const file = path.join(dir, name);
      let st;
      try { st = await this.fs.stat(file); } catch { continue; }
      let hit = this.cache.get(file);
      if (!hit || hit.mtimeMs !== st.mtimeMs || hit.size !== st.size) {
        const parsed = parseDay(await this._read(file));
        hit = { mtimeMs: st.mtimeMs, size: st.size, data: { total: parsed.focusSec, subjects: parsed.bySubject, pomodoros: parsed.pomodoros } };
        this.cache.set(file, hit);
      }
      if (hit.data.total > 0 || hit.data.pomodoros > 0) out[m[1]] = hit.data;
    }
    return out;
  }

  async migrate(srcDir, dstDir) {
    let names;
    try { names = await this.fs.readdir(srcDir); } catch { return 0; }
    let n = 0;
    for (const name of names) {
      if (!FILE_RE.test(name)) continue;
      const dst = path.join(dstDir, name);
      try { await this.fs.access(dst); continue; } catch { }
      await this.fs.mkdir(dstDir, { recursive: true });
      await this.fs.copyFile(path.join(srcDir, name), dst);
      n += 1;
    }
    return n;
  }
}

module.exports = { PomodoroLog, formatEntry, parseDay, hms, clock, dayKeyOf, header, SEGMENT_RE };
