'use strict';

const webPreferences = (preload, extra = {}) => ({
  preload, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, ...extra,
});

const FRAMELESS = {
  show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
  resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true,
};

function lockNavigation(webContents) {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event) => event.preventDefault());
}

module.exports = { webPreferences, FRAMELESS, lockNavigation };
