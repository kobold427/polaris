'use strict';

const DESKTOP_CLASSES = new Set(['Progman', 'WorkerW']);

class DesktopKeeper {
  constructor({ windows, foreground, isOurs = () => false, raise, lower, enabled = () => true, busy = () => false, every = 300, log = () => {} }) {
    Object.assign(this, { windows, foreground, isOurs, raise, lower, enabled, busy, every, log });
    this.raised = false;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { try { this.tick(); } catch (e) { this.log(`desktop keeper: ${e.message}`); } }, this.every);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  each(fn) { for (const w of this.windows()) if (w && !w.isDestroyed() && w.isVisible()) fn(w); }

  tick() {
    if (!this.enabled()) { if (this.raised) this.drop(); return; }
    if (this.busy()) return;
    const f = this.foreground();
    if (!f) return;
    if (DESKTOP_CLASSES.has(f.cls)) {
      if (!this.raised) { this.raised = true; this.each(this.raise); this.log(`desktop is active (${f.cls}): widgets brought forward`); }
    } else if (this.raised && !this.isOurs(f.hwnd)) {
      this.drop();
    }
  }

  drop() {
    this.raised = false;
    this.each(this.lower);
    this.log('widgets sent back behind windows');
  }
}

module.exports = { DesktopKeeper, DESKTOP_CLASSES };
