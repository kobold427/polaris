'use strict';
const fs = require('fs');
const path = require('path');

const OLD_NAME = 'Desktop Widgets';
const CARRIED = ['config.json', 'pomodoro-log'];

function migrateUserData({ appData, userData }) {
  const from = path.join(appData, OLD_NAME);
  if (path.resolve(from) === path.resolve(userData)) return [];
  if (fs.existsSync(path.join(userData, 'config.json'))) return [];
  if (!fs.existsSync(path.join(from, 'config.json'))) return [];
  fs.mkdirSync(userData, { recursive: true });
  const copied = [];
  for (const name of CARRIED) {
    const src = path.join(from, name);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(userData, name), { recursive: true, force: false });
    copied.push(name);
  }
  return copied;
}

module.exports = { migrateUserData, OLD_NAME };
