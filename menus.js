'use strict';
const { Menu } = require('electron');

function toTemplate(items, done) {
  return items.map((item) => {
    if (item.type === 'separator') return { type: 'separator' };
    const entry = { label: item.label, enabled: item.enabled !== false };
    if (item.role) entry.role = item.role;
    else entry.click = () => done(item.id);
    if (item.type === 'checkbox' || item.type === 'radio') Object.assign(entry, { type: item.type, checked: !!item.checked });
    if (item.submenu) entry.submenu = toTemplate(item.submenu, done);
    return entry;
  });
}

function popup(window, items) {
  return new Promise((resolve) => {
    Menu.buildFromTemplate(toTemplate(items, resolve)).popup({
      window,
      callback: () => setTimeout(() => resolve(null), 120),
    });
  });
}

module.exports = { toTemplate, popup };
