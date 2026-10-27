'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./color'));
  else root.Appearance = factory(root.Color);
}(typeof self !== 'undefined' ? self : this, (Color) => {
  const MODES = { card: 'Card', bare: 'Frameless' };
  const SCHEMES = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  const DEFAULTS = { mode: 'card', tint: 96, scheme: 'auto', accent: '' };
  const ACCENT_PRESETS = ['', '#64d2ff', '#bf5af2', '#30d158', '#ffd60a', '#ff453a', '#ff375f', '#8e8e93'];

  const clamp = (v, lo, hi, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
  };

  function normalize(raw) {
    const a = raw && typeof raw === 'object' ? raw : {};
    const wasGlass = a.bg !== undefined && a.bg !== 'solid';
    return {
      mode: a.mode in MODES ? a.mode : DEFAULTS.mode,
      tint: wasGlass ? DEFAULTS.tint : clamp(a.tint, 0, 100, DEFAULTS.tint),
      scheme: a.scheme in SCHEMES ? a.scheme : DEFAULTS.scheme,
      accent: Color.isHex(a.accent) ? a.accent.toLowerCase() : DEFAULTS.accent,
    };
  }

  const emptyConfig = () => ({ all: { ...DEFAULTS }, widgets: {} });

  function config(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const widgets = {};
    for (const [key, value] of Object.entries(r.widgets || {})) {
      if (value && typeof value === 'object') widgets[key] = normalize(value);
    }
    return { all: normalize(r.all), widgets };
  }

  const effective = (cfg, key) => {
    const c = config(cfg);
    return c.widgets[key] || c.all;
  };

  function applyPatch(cfg, scope, patch) {
    const c = config(cfg);
    const base = scope === 'all' ? c.all : (c.widgets[scope] || c.all);
    const next = normalize({ ...base, ...patch });
    if (scope === 'all') c.all = next;
    else c.widgets[scope] = next;
    return c;
  }

  function resetScope(cfg, scope) {
    const c = config(cfg);
    if (scope === 'all') c.all = { ...DEFAULTS };
    else delete c.widgets[scope];
    return c;
  }

  const panelVisible = (eff, key) => !(normalize(eff).mode === 'bare' && key === 'folders');

  function panelRgb(mode, scheme) {
    if (mode === 'bare') return scheme === 'dark' ? [58, 58, 62] : [246, 246, 248];
    return scheme === 'dark' ? [28, 28, 32] : [255, 255, 255];
  }

  const INK = { light: { rgb: [28, 28, 30], alpha: 0.66 }, dark: { rgb: [255, 255, 255], alpha: 0.64 } };

  function readability({ wall, tint, mode, scheme }) {
    const panel = Color.mix(wall, panelRgb(mode, scheme), Math.min(1, Math.max(0, tint)));
    const ink = INK[scheme];
    return Color.contrast(Color.mix(panel, ink.rgb, ink.alpha), panel);
  }

  const READABLE = 4.0;
  const COMFORT = 4.8;

  function pickScheme({ wall, tint, mode, setting = 'auto', prefer = 'light', current = null }) {
    if (setting === 'light' || setting === 'dark') return setting;
    if (!wall) return current || prefer;
    const score = {
      light: readability({ wall, tint, mode, scheme: 'light' }),
      dark: readability({ wall, tint, mode, scheme: 'dark' }),
    };
    const other = prefer === 'light' ? 'dark' : 'light';
    const now = current || prefer;
    if (now === prefer) {
      if (score[prefer] >= READABLE) return prefer;
      return score[other] > score[prefer] ? other : prefer;
    }
    if (score[prefer] >= COMFORT) return prefer;
    if (score[now] >= READABLE) return now;
    return score[prefer] >= score[now] ? prefer : now;
  }

  const WHITE = [255, 255, 255];
  const BLACK = [0, 0, 0];

  function accentVars(accent, scheme) {
    if (!Color.isHex(accent)) return {};
    const base = Color.toRgb(accent);
    const lighter = (t) => Color.toHex(Color.mix(base, WHITE, t));
    const darker = (t) => Color.toHex(Color.mix(base, BLACK, t));
    const heat = scheme === 'dark' ? [darker(0.5), darker(0.22), lighter(0.15), lighter(0.55)] : [lighter(0.78), lighter(0.5), lighter(0.22), accent];
    const vars = {
      '--accent': accent,
      '--on-accent': Color.contrast(base, WHITE) >= 2.5 ? '#fff' : '#1c1c1e',
      '--accent-soft': lighter(0.45),
      '--folder-back-1': lighter(0.1),
      '--folder-back-2': darker(0.22),
      '--folder-front-1': lighter(0.5),
      '--folder-front-2': lighter(0.2),
    };
    heat.forEach((c, i) => { vars[`--heat-${i + 1}`] = c; });
    return vars;
  }

  return {
    MODES, SCHEMES, DEFAULTS, ACCENT_PRESETS, READABLE,
    normalize, config, emptyConfig, effective, applyPatch, resetScope, panelVisible,
    panelRgb, readability, pickScheme, accentVars,
  };
}));
