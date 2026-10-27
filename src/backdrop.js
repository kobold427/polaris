'use strict';
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { execFile } = require('child_process');

const STALE_CACHE_MS = 3 * 24 * 3600 * 1000;

const POSITIONS = ['center', 'tile', 'stretch', 'fit', 'fill', 'span'];
const styleFromPosition = (n) => POSITIONS[Number(n)] || 'fill';

function styleFromRegistry(style, tile) {
  if (String(tile) === '1') return 'tile';
  return { 10: 'fill', 6: 'fit', 2: 'stretch', 0: 'center', 22: 'span' }[String(style)] || 'fill';
}

const hex2 = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');

function colorRefToHex(ref) {
  const n = Number(ref);
  if (!Number.isFinite(n)) return null;
  return `#${hex2(n & 255)}${hex2((n >> 8) & 255)}${hex2((n >> 16) & 255)}`;
}

function rgbTripleToHex(s) {
  const p = String(s || '').trim().split(/\s+/).map(Number);
  if (p.length < 3 || p.some((n) => !Number.isFinite(n))) return null;
  return `#${hex2(p[0])}${hex2(p[1])}${hex2(p[2])}`;
}

function parseReg(out, name) {
  const m = String(out || '').match(new RegExp(`^\\s*${name}\\s+REG_\\w+[ \\t]*(.*)$`, 'mi'));
  return m ? m[1].trim() : null;
}

const defaultExec = (cmd, args, opts = {}) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024, ...opts }, (err, stdout) => resolve(err ? '' : String(stdout)));
});

const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace DW {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IDesktopWallpaper {
    void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
    [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
    [return: MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint monitorIndex);
    uint GetMonitorDevicePathCount();
    RECT GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
    void SetBackgroundColor(uint color);
    uint GetBackgroundColor();
    void SetPosition(int position);
    int GetPosition();
  }
  [ComImport, Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")] public class DesktopWallpaperClass { }
}
"@
$w = [DW.IDesktopWallpaper](New-Object DW.DesktopWallpaperClass)
$n = $w.GetMonitorDevicePathCount()
$list = @()
for ($i = 0; $i -lt $n; $i++) {
  $id = $w.GetMonitorDevicePathAt($i)
  $r = $null; try { $r = $w.GetMonitorRECT($id) } catch {}
  $p = ''; try { $p = $w.GetWallpaper($id) } catch {}
  if ($r -ne $null) { $list += [pscustomobject]@{ left = $r.Left; top = $r.Top; right = $r.Right; bottom = $r.Bottom; path = $p } }
}
$o = [pscustomobject]@{ monitors = @($list); color = $w.GetBackgroundColor(); position = $w.GetPosition() }
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($o | ConvertTo-Json -Compress -Depth 4)))
`;

const encodePs = (script) => Buffer.from(script, 'utf16le').toString('base64');

function parsePsOutput(out) {
  try {
    const b64 = String(out || '').trim().split(/\s+/).pop();
    if (!b64) return null;
    const js = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    let monitors = js.monitors;
    if (!Array.isArray(monitors)) monitors = monitors ? [monitors] : [];
    return {
      monitors: monitors.filter((m) => m && Number.isFinite(m.left) && Number.isFinite(m.top)).map((m) => ({ rect: [m.left, m.top, m.right, m.bottom], file: String(m.path || '') })),
      color: js.color, position: js.position,
    };
  } catch { return null; }
}

const comProbe = (exec) => exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePs(PS_SCRIPT)], { timeout: 20000 }).then(parsePsOutput);

async function regProbe(exec) {
  const [desk, colors] = await Promise.all([
    exec('reg', ['query', 'HKCU\\Control Panel\\Desktop']),
    exec('reg', ['query', 'HKCU\\Control Panel\\Colors', '/v', 'Background']),
  ]);
  if (!desk) return null;
  return {
    file: parseReg(desk, 'WallPaper') || '',
    style: styleFromRegistry(parseReg(desk, 'WallpaperStyle'), parseReg(desk, 'TileWallpaper')),
    color: rgbTripleToHex(parseReg(colors, 'Background')),
  };
}

const statFile = (fsImpl, file) => { try { const s = fsImpl.statSync(file); return s.isFile() ? s : null; } catch { return null; } };

function cacheFiles(env, fsImpl, count = 1) {
  if (!env.APPDATA) return [];
  const dir = path.join(env.APPDATA, 'Microsoft', 'Windows', 'Themes');
  const out = [path.join(dir, 'TranscodedWallpaper')];
  for (let i = 0; i < Math.max(1, count); i++) out.push(path.join(dir, `Transcoded_${String(i).padStart(3, '0')}`));
  return out.filter((f) => statFile(fsImpl, f));
}

async function detect({ platform = process.platform, exec = defaultExec, env = process.env, fsImpl = fs, now = Date.now } = {}) {
  if (platform !== 'win32') return { via: 'none', monitors: [], style: 'fill', color: null, notes: ['Desktop wallpaper detection works on Windows only'] };
  const notes = [];
  const [com, reg] = await Promise.all([comProbe(exec), regProbe(exec)]);
  const color = (com && colorRefToHex(com.color)) || (reg && reg.color) || '#000000';
  const style = com && com.monitors.length ? styleFromPosition(com.position) : (reg ? reg.style : 'fill');

  const usable = (f) => (f && statFile(fsImpl, f) ? f : null);
  const regFile = reg ? usable(reg.file) : null;
  if (!com) notes.push('Windows wallpaper API (PowerShell) is unavailable — using the registry');
  if (!com && !reg) notes.push('Registry is unavailable too');

  if (com && com.monitors.length) {
    const caches = cacheFiles(env, fsImpl, com.monitors.length);
    const monitors = com.monitors.map((m, i) => {
      let file = usable(m.file);
      if (!file && m.file) {
        file = usable(path.join(env.APPDATA || '', 'Microsoft', 'Windows', 'Themes', `Transcoded_${String(i).padStart(3, '0')}`)) || caches[0] || regFile;
        notes.push(`Cannot read ${m.file} — using the Windows cache instead`);
      }
      return { rect: m.rect, file: file || null };
    });
    return { via: 'windows-api', monitors, style, color, notes };
  }

  if (regFile) return { via: 'registry', monitors: [{ rect: null, file: regFile }], style, color, notes };

  const cache = cacheFiles(env, fsImpl, 1)[0];
  if (reg && cache) {
    const age = now() - statFile(fsImpl, cache).mtimeMs;
    if (age <= STALE_CACHE_MS) {
      notes.push('The registry has no wallpaper path, but the Windows cache is fresh (Spotlight or slideshow) — using it');
      return { via: 'cache', monitors: [{ rect: null, file: cache }], style, color, notes };
    }
    notes.push('The registry has no wallpaper path and the Windows cache is old — treating the desktop as a solid color');
  }
  return { via: reg ? 'registry' : 'none', monitors: [{ rect: null, file: null }], style, color, notes };
}

async function signature({ platform = process.platform, exec = defaultExec, env = process.env, fsImpl = fs } = {}) {
  if (platform !== 'win32') return 'none';
  const [desk, colors] = await Promise.all([exec('reg', ['query', 'HKCU\\Control Panel\\Desktop']), exec('reg', ['query', 'HKCU\\Control Panel\\Colors', '/v', 'Background'])]);
  const wp = parseReg(desk, 'WallPaper');
  const bits = [wp, parseReg(desk, 'WallpaperStyle'), parseReg(desk, 'TileWallpaper'), parseReg(colors, 'Background')];
  for (const f of [wp, ...cacheFiles(env, fsImpl, 4)]) {
    const s = f && statFile(fsImpl, f);
    bits.push(s ? `${f}:${s.mtimeMs}:${s.size}` : '');
  }
  return bits.join('|');
}

function assignMonitors(displays, monitors) {
  const byPos = (a, b) => a[0] - b[0] || a[1] - b[1];
  if (!monitors.length) return displays.map(() => null);
  const ds = displays.map((d, i) => ({ i, p: [d.bounds.x, d.bounds.y] })).sort((a, b) => byPos(a.p, b.p));
  const ms = monitors.slice().sort((a, b) => byPos(a.rect || [0, 0], b.rect || [0, 0]));
  const out = new Array(displays.length).fill(null);
  if (ds.length === ms.length) ds.forEach((d, k) => { out[d.i] = ms[k]; });
  else {
    const primary = ms.find((m) => m.rect && m.rect[0] === 0 && m.rect[1] === 0) || ms[0];
    displays.forEach((_, i) => { out[i] = primary; });
  }
  return out;
}

const displayKey = (d) => `${d.bounds.x},${d.bounds.y},${d.bounds.width},${d.bounds.height}`;

class Backdrop extends EventEmitter {
  constructor({ nativeImage, screen, powerMonitor = null, exec = defaultExec, fsImpl = fs, env = process.env, platform = process.platform, now = Date.now, maxWidth = 480, quality = 70 } = {}) {
    super();
    Object.assign(this, { nativeImage, screen, powerMonitor, exec, fsImpl, env, platform, now, maxWidth, quality });
    this.signature = null;
    this.timer = null;
    this.running = null;
    this.rerun = false;
    this.detected = null;
    this.images = new Map();
    this.data = { displays: [], images: {}, span: null };
  }

  _load(file) {
    const stat = statFile(this.fsImpl, file);
    if (!stat) return null;
    const id = `${file}|${stat.mtimeMs}|${stat.size}`;
    if (!this.images.has(id)) {
      let loaded = null;
      try {
        if (stat.size <= 96 * 1024 * 1024) {
          let img = this.nativeImage.createFromBuffer(this.fsImpl.readFileSync(file));
          if (img.isEmpty()) img = this.nativeImage.createFromPath(file);
          if (!img.isEmpty()) loaded = this._encode(img);
        }
      } catch (e) { console.warn('backdrop load:', file, e.message); }
      this.images.set(id, loaded);
      if (this.images.size > 12) this.images.delete(this.images.keys().next().value);
    }
    const loaded = this.images.get(id);
    return loaded && { id, ...loaded };
  }

  _encode(img) {
    const { width, height } = img.getSize();
    const small = width > this.maxWidth ? img.resize({ width: this.maxWidth, quality: 'good' }) : img;
    return { w: width, h: height, dataUrl: `data:image/jpeg;base64,${small.toJPEG(this.quality).toString('base64')}` };
  }

  refresh() {
    if (this.running) { this.rerun = true; return this.running; }
    this.running = this._refresh().finally(() => {
      this.running = null;
      if (this.rerun) {
        this.rerun = false;
        this.refresh().catch((e) => console.warn('backdrop:', e.message));
      }
    });
    return this.running;
  }

  async _refresh() {
    this.detected = await detect(this);
    for (const note of this.detected.notes) console.info(`backdrop: ${note}`);
    this._build(this.screen.getAllDisplays());
    this.emit('change', this.data);
  }

  _build(displays) {
    const { monitors, style, color } = this.detected;
    const assigned = assignMonitors(displays, monitors);
    const images = {};
    const entries = displays.map((display, i) => {
      const entry = { key: displayKey(display), image: null, style, color };
      const img = assigned[i] && assigned[i].file ? this._load(assigned[i].file) : null;
      if (img) {
        images[img.id] = { w: img.w, h: img.h, dataUrl: img.dataUrl };
        entry.image = img.id;
      }
      return entry;
    });
    let span = null;
    if (displays.length) {
      const left = Math.min(...displays.map((d) => d.bounds.x));
      const top = Math.min(...displays.map((d) => d.bounds.y));
      const right = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
      const bottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));
      span = { x: left, y: top, w: right - left, h: bottom - top };
    }
    this.data = { displays: entries, images, span };
  }

  payload() { return this.data; }

  start(intervalMs = 30000) {
    const update = () => this.refresh().catch((e) => console.warn('backdrop:', e.message));
    update();
    this.timer = setInterval(() => this.check().catch((e) => console.warn('backdrop:', e.message)), intervalMs);
    this.timer.unref();
    this.onChange = () => {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => { this.signature = null; update(); }, 900);
    };
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) this.screen.on(event, this.onChange);
    if (this.powerMonitor) for (const event of ['resume', 'unlock-screen']) this.powerMonitor.on(event, this.onChange);
  }

  async check() {
    const next = await signature(this);
    const changed = this.signature !== null && next !== this.signature;
    this.signature = next;
    if (changed) await this.refresh();
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.debounce);
    if (!this.onChange) return;
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) this.screen.removeListener(event, this.onChange);
    if (this.powerMonitor) for (const event of ['resume', 'unlock-screen']) this.powerMonitor.removeListener(event, this.onChange);
  }
}

module.exports = {
  Backdrop, detect, signature, assignMonitors, displayKey, parsePsOutput, parseReg,
  styleFromPosition, styleFromRegistry, colorRefToHex, rgbTripleToHex, PS_SCRIPT, STALE_CACHE_MS,
};
