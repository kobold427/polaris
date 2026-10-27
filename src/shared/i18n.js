'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lang-ru'));
  else root.I18n = factory(root.LangRu);
}(typeof self !== 'undefined' ? self : this, (RU) => {
  const LANGS = ['en', 'ru'];

  function resolve(setting, systemLocale) {
    if (setting === 'en' || setting === 'ru') return setting;
    return /^ru\b/i.test(String(systemLocale || '')) ? 'ru' : 'en';
  }

  const fmt = (s, params) => (params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s);
  const has = (k) => Object.prototype.hasOwnProperty.call(RU, k);

  function t(lang, key, params) {
    const s = lang === 'ru' && has(key) && typeof RU[key] === 'string' ? RU[key] : key;
    return fmt(s, params);
  }

  function tn(lang, n, one, other, params) {
    const p = { n, ...(params || {}) };
    const key = `${one}|${other}`;
    if (lang === 'ru' && has(key) && Array.isArray(RU[key])) {
      const a = Math.abs(n) % 100;
      const b = a % 10;
      const form = a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2;
      return fmt(RU[key][form], p);
    }
    return fmt(Math.abs(n) === 1 ? one : other, p);
  }

  function translateDom(rootEl, lang) {
    if (lang !== 'ru' || !rootEl) return;
    const doc = rootEl.ownerDocument || rootEl;
    const walker = doc.createTreeWalker(rootEl, 4 );
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    for (const n of nodes) {
      const raw = n.nodeValue;
      const key = raw.trim();
      if (key && has(key) && typeof RU[key] === 'string') n.nodeValue = raw.replace(key, RU[key]);
    }
    for (const el of rootEl.querySelectorAll ? rootEl.querySelectorAll('[title],[placeholder],[aria-label]') : []) {
      for (const a of ['title', 'placeholder', 'aria-label']) {
        const v = el.getAttribute(a);
        if (v && has(v) && typeof RU[v] === 'string') el.setAttribute(a, RU[v]);
      }
    }
  }

  return { LANGS, resolve, t, tn, translateDom, RU };
}));
