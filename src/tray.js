'use strict';
const path = require('path');
const { app, Menu, Tray, nativeImage, nativeTheme } = require('electron');

const ICON = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const THEMES = [['system', 'Match System'], ['light', 'Light'], ['dark', 'Dark']];

function createTray({ tr, wm, widgets, shortcuts, capture, openSettings, setTheme, setGrid, obsidianTemplate, openLogFolder, copyDiagnostics }) {
  const image = nativeImage.createFromPath(ICON);
  const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);

  const buildMenu = () => Menu.buildFromTemplate([
    { label: tr('Settings & Appearance…'), click: () => openSettings('look') },
    { label: tr('Quick Capture…'), click: () => capture.show(), accelerator: shortcuts.capture },
    { label: tr('Show Widgets'), click: () => wm.peek(), accelerator: shortcuts.peek },
    { type: 'separator' },
    { label: tr('Widgets'), submenu: widgets.map(({ key, title }) => ({ label: tr(title), type: 'checkbox', checked: wm.enabled(key), click: (item) => wm.setVisible(key, item.checked) })) },
    { label: tr('Theme'), submenu: THEMES.map(([value, label]) => ({ label: tr(label), type: 'radio', checked: nativeTheme.themeSource === value, click: () => setTheme(value) })) },
    { label: tr('Lock Position'), type: 'checkbox', checked: wm.isLocked(), click: (item) => wm.setLocked(item.checked) },
    { label: tr('Snap to Grid'), type: 'checkbox', checked: wm.gridCfg().snap, click: (item) => setGrid({ snap: item.checked }) },
    { label: tr('Reset Layout'), click: () => wm.showAllReset() },
    { type: 'separator' },
    { label: 'Obsidian', submenu: obsidianTemplate() },
    { type: 'separator' },
    { label: tr('Help'), submenu: [{ label: tr('Open Log Folder'), click: openLogFolder }, { label: tr('Copy Diagnostics'), click: copyDiagnostics }] },
    {
      label: tr('Launch at Windows Login'), type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] }),
    },
    { label: tr('Quit'), click: () => app.quit() },
  ]);

  tray.setToolTip('Polaris');
  tray.on('click', () => wm.peek());
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  return tray;
}

module.exports = { createTray };
