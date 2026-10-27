'use strict';

const REPEAT_MS = 250;

class Hotkeys {
  constructor({ globalShortcut, bindings, log = () => {}, now = Date.now }) {
    Object.assign(this, { globalShortcut, bindings, log, now });
    this.registered = [];
    this.lastRun = 0;
  }

  register() {
    for (const { accelerator, run } of this.bindings) {
      const ok = this.globalShortcut.register(accelerator, () => {
        const t = this.now();
        if (t - this.lastRun < REPEAT_MS) return;
        this.lastRun = t;
        run();
      });
      if (ok) this.registered.push(accelerator);
      else this.log(`Shortcut ${accelerator} is taken by another application`);
    }
  }

  dispose() {
    for (const accelerator of this.registered) this.globalShortcut.unregister(accelerator);
    this.registered = [];
  }
}

module.exports = { Hotkeys };
