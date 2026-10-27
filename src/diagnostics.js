'use strict';
const os = require('os');

function createDiagnostics({ app, screen, pin, wm, ob, backdrop, order, logger }) {
  const lines = () => {
    const primary = screen.getPrimaryDisplay();
    const displays = screen.getAllDisplays().map((d) => {
      const { x, y, width, height } = d.bounds;
      return `  #${d.id} ${width}x${height} at ${x},${y}, scale ${d.scaleFactor}${d.id === primary.id ? ' (primary)' : ''}`;
    });
    const widgets = order.map((key) => `${key}${wm.enabled(key) ? '' : '(hidden)'}=${(wm.bounds.get(key) || []).join(',')}`);
    return [
      `Polaris ${app.getVersion()} (${app.isPackaged ? 'installed' : 'dev'})`,
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
      `OS ${os.type()} ${os.release()} ${process.arch} · locale ${app.getLocale()}`,
      'Displays:', ...displays,
      `Window pinning (koffi): ${pin.available() ? 'yes' : 'no'}`,
      `Obsidian: ${ob.vault ? 'connected' : 'not connected'}`,
      `Widgets: ${widgets.join(' ')}`,
      `Wallpaper detection: ${backdrop.detected ? backdrop.detected.via : 'pending'}`,
    ];
  };

  const text = () => [...lines(), '', '--- log (last lines) ---', logger.tail(80)].join('\n');

  return { lines, text };
}

module.exports = { createDiagnostics };
