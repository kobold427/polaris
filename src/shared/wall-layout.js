'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WallLayout = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  function layout({ img, style, display, win, span }) {
    const scale = display.scale || 1;
    const ox = win.x - display.x;
    const oy = win.y - display.y;
    if (style === 'tile') return { x: -ox, y: -oy, w: img.w / scale, h: img.h / scale, repeat: true };

    let area = { x: 0, y: 0, w: display.w, h: display.h };
    let mode = style;
    if (style === 'span') {
      const sp = span || { x: display.x, y: display.y, w: display.w, h: display.h };
      area = { x: sp.x - display.x, y: sp.y - display.y, w: sp.w, h: sp.h };
      mode = 'fill';
    }
    let w;
    let h;
    if (mode === 'stretch') { w = area.w; h = area.h; }
    else if (mode === 'center') { w = img.w / scale; h = img.h / scale; }
    else {
      const sx = area.w / img.w;
      const sy = area.h / img.h;
      const s = mode === 'fit' ? Math.min(sx, sy) : Math.max(sx, sy);
      w = img.w * s;
      h = img.h * s;
    }
    const ix = area.x + (area.w - w) / 2;
    const iy = area.y + (area.h - h) / 2;
    return { x: ix - ox, y: iy - oy, w, h, repeat: false };
  }

  function averageRect(px, w, h, rect) {
    const x0 = Math.max(0, Math.floor(rect.x));
    const y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(w, Math.ceil(rect.x + rect.w));
    const y1 = Math.min(h, Math.ceil(rect.y + rect.h));
    if (x1 <= x0 || y1 <= y0) return null;
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        r += px[i]; g += px[i + 1]; b += px[i + 2];
        n += 1;
      }
    }
    return [r / n, g / n, b / n];
  }

  return { layout, averageRect };
}));
