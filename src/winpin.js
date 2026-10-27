'use strict';

let setWindowPos = null;
let getForegroundWindow = null;
let getClassName = null;

if (process.platform === 'win32') {
  try {
    const user32 = require('koffi').load('user32.dll');
    setWindowPos = user32.func('bool __stdcall SetWindowPos(uint64_t hWnd, int64_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)');
    getForegroundWindow = user32.func('uint64_t __stdcall GetForegroundWindow()');
    getClassName = user32.func('int __stdcall GetClassNameW(uint64_t hwnd, _Out_ uint8_t *buf, int max)');
  } catch (e) {
    console.warn('winpin: koffi is unavailable, widgets will not be pinned to the desktop:', e.message);
    setWindowPos = null;
    getForegroundWindow = null;
    getClassName = null;
  }
}

const HWND_TOP = 0n;
const HWND_BOTTOM = 1n;
const SWP_NOSIZE = 0x1;
const SWP_NOMOVE = 0x2;
const SWP_NOACTIVATE = 0x10;

function handleOf(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0));
}

function restack(win, insertAfter) {
  if (!setWindowPos || !win || win.isDestroyed()) return false;
  try {
    return !!setWindowPos(handleOf(win), insertAfter, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
  } catch (e) {
    console.warn('winpin.restack:', e.message);
    return false;
  }
}

const lower = (win) => restack(win, HWND_BOTTOM);

const raise = (win) => restack(win, HWND_TOP);

function foreground() {
  if (!getForegroundWindow || !getClassName) return null;
  try {
    const hwnd = getForegroundWindow();
    if (!hwnd) return { hwnd: 0n, cls: '' };
    const buf = Buffer.alloc(512);
    const length = getClassName(hwnd, buf, 256);
    return { hwnd, cls: length > 0 ? buf.toString('utf16le', 0, length * 2) : '' };
  } catch (e) {
    console.warn('winpin.foreground:', e.message);
    return null;
  }
}

module.exports = {
  lower, raise, handleOf, foreground,
  available: () => !!setWindowPos,
  canWatchDesktop: () => !!(getForegroundWindow && getClassName),
};
