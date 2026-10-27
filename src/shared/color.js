'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Color = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const HEX = /^#[0-9a-f]{6}$/i;

  const isHex = (v) => typeof v === 'string' && HEX.test(v);

  const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

  const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);

  const mixHex = (a, b, t) => toHex(mix(toRgb(a), toRgb(b), t));

  const linear = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

  function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  return { isHex, toRgb, toHex, mix, mixHex, luminance, contrast };
}));
