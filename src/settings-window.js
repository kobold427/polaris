'use strict';
const path = require('path');
const { BrowserWindow, nativeTheme } = require('electron');
const { webPreferences, lockNavigation } = require('./window-kit');

class SettingsWindow {
  constructor({ preload, rendererDir, getLang, title }) {
    Object.assign(this, { preload, rendererDir, getLang, title });
    this.win = null;
  }

  get alive() {
    return !!this.win && !this.win.isDestroyed();
  }

  open(tab) {
    if (this.alive) {
      if (this.win.isMinimized()) this.win.restore();
      this.win.show();
      this.win.focus();
      if (tab) this.win.webContents.send('settings:tab', tab);
      return;
    }
    this.win = new BrowserWindow({
      width: 620, height: 720, minWidth: 540, minHeight: 560, title: `Polaris — ${this.title()}`,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e22' : '#f5f5f7',
      webPreferences: webPreferences(this.preload),
    });
    lockNavigation(this.win.webContents);
    this.win.on('closed', () => { this.win = null; });
    this.load(tab || 'look');
  }

  load(tab) {
    this.win.loadFile(path.join(this.rendererDir, 'settings.html'), { query: { key: 'settings', tab, lang: this.getLang() } });
  }

  reload() {
    if (!this.alive) return;
    const url = new URL(this.win.webContents.getURL());
    this.load(url.searchParams.get('tab') || 'look');
  }

  send(channel, payload) {
    if (this.alive) this.win.webContents.send(channel, payload);
  }
}

module.exports = { SettingsWindow };
