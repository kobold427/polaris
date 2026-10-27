'use strict';
const path = require('path');
const { fileURLToPath } = require('url');
const { ipcMain } = require('electron');

function createIpc(rendererDir) {
  const fromOurPages = (event) => {
    const frame = event.senderFrame;
    if (!frame) return false;
    try {
      const rel = path.relative(rendererDir, fileURLToPath(frame.url));
      return !rel.startsWith('..') && !path.isAbsolute(rel);
    } catch {
      return false;
    }
  };

  const on = (channel, listener) => {
    ipcMain.on(channel, (event, ...args) => {
      if (fromOurPages(event)) listener(event, ...args);
      else console.warn(`ipc: ${channel} ignored, sender is not an app page`);
    });
  };

  const handle = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!fromOurPages(event)) throw new Error(`ipc: ${channel} rejected, sender is not an app page`);
      try {
        return await handler(event, ...args);
      } catch (e) {
        console.warn(`ipc: ${channel} failed: ${e.message}`);
        return { error: e.message };
      }
    });
  };

  return { on, handle };
}

module.exports = { createIpc };
