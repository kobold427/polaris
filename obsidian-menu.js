'use strict';
const path = require('path');
const { dialog, shell } = require('electron');
const { detectVaults } = require('./obsidian');

function createObsidianMenu({ ob, tr, getLogFolder, openSettings }) {
  const fail = (e) => dialog.showErrorBox('Polaris', tr(e.message));

  async function pickVault() {
    const result = await dialog.showOpenDialog({ title: tr('Obsidian vault folder'), properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths[0]) await ob.connect(result.filePaths[0]).catch(fail);
  }

  async function pickFile(option) {
    const { vaultPath } = ob.status();
    const result = await dialog.showOpenDialog({
      title: option === 'tasksFile' ? tr('Tasks file (.md in the vault)') : tr('Note file (.md in the vault)'),
      defaultPath: vaultPath, properties: ['openFile', 'promptToCreate'], filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePaths[0]) return;
    const rel = path.relative(vaultPath, result.filePaths[0]);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      fail(new Error('The file must be inside the vault.'));
      return;
    }
    ob.setOption({ [option]: rel.split(path.sep).join('/'), ...(option === 'noteFile' ? { noteMode: 'file' } : {}) });
  }

  function template() {
    const status = ob.status();
    const items = [
      { label: status.connected ? tr('Vault: {name}', { name: status.vaultName }) : tr('Obsidian is not connected (data is stored locally)'), enabled: false },
      { type: 'separator' },
    ];
    for (const vault of detectVaults()) {
      items.push({
        label: tr('Connect “{name}”', { name: vault.name }), type: 'radio',
        checked: !!status.vaultPath && path.resolve(status.vaultPath) === path.resolve(vault.path),
        click: () => ob.connect(vault.path, vault.id).catch(fail),
      });
    }
    items.push({ label: tr('Choose Vault Folder…'), click: pickVault });
    if (!status.connected) return items;

    const dateLanguage = (locale, label) => ({ label: tr(label), type: 'radio', checked: ob.cfg.locale === locale, click: () => ob.setOption({ locale }) });
    items.push(
      { type: 'separator' },
      { label: tr('Tasks: {file}', { file: status.tasksFile }), enabled: false },
      { label: tr('Choose Tasks File…'), click: () => pickFile('tasksFile') },
      { type: 'separator' },
      { label: tr('Note: Separate File'), type: 'radio', checked: status.noteMode === 'file', click: () => ob.setOption({ noteMode: 'file' }) },
      { label: tr('Note: Today’s Daily Note'), type: 'radio', checked: status.noteMode === 'daily', click: () => ob.setOption({ noteMode: 'daily' }) },
      { label: tr('Choose Note File…'), click: () => pickFile('noteFile') },
      { label: tr('Date Language in Daily Note Names'), submenu: [dateLanguage('en', 'English'), dateLanguage('ru', 'Russian')] },
      { type: 'separator' },
      { label: tr('Pomodoro log: {folder}', { folder: getLogFolder() }), enabled: false },
      { label: tr('Change Log Folder…'), click: () => openSettings('pomodoro') },
      { type: 'separator' },
      { label: tr('Open Vault in Obsidian'), click: () => shell.openExternal(`obsidian://open?vault=${encodeURIComponent(ob.vault.id || ob.vault.name)}`) },
      { label: tr('Disconnect Vault'), click: () => ob.disconnect() },
    );
    return items;
  }

  return { template };
}

module.exports = { createObsidianMenu };
