'use strict';
const fs = require('fs');
const { app, BrowserWindow, Menu, Notification, dialog, shell } = require('electron');
const { popup } = require('./menus');
const { checkSoundFile, EXT: SOUND_EXT } = require('./audio');
const Appearance = require('./shared/appearance');
const TaskInput = require('./shared/taskinput');
const Cal = require('./shared/cal');

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const senderWindow = (event) => BrowserWindow.fromWebContents(event.sender) || undefined;

function commonHandlers({ ipc: { on, handle }, store, wm, backdrop, language, setLanguage, openLogFolder, copyDiagnostics, widgets }) {
  handle('language:get', () => language());
  handle('language:set', (_e, value) => setLanguage(value));

  on('drag:start', (e, { mode, edges }) => wm.startDrag(wm.keyOf(e.sender), mode, edges));
  on('drag:end', () => wm.endDrag());
  on('notify', (_e, { title, body }) => {
    shell.beep();
    if (Notification.isSupported()) new Notification({ title, body }).show();
  });

  handle('locked:get', () => wm.isLocked());
  handle('widgets:get', () => widgets());
  handle('win:getBounds', (e) => wm.boundsPayload(wm.keyOf(e.sender)));
  handle('backdrop:get', () => backdrop.payload());

  handle('menu', async (e, items) => {
    const key = wm.keyOf(e.sender);
    const id = await popup(senderWindow(e), items);
    if (id === '__hide') {
      if (key) wm.setVisible(key, false);
      return null;
    }
    if (id === '__lock') {
      wm.setLocked(!wm.isLocked());
      return null;
    }
    return id;
  });

  handle('state:get', (e) => store.get('state', {})[wm.keyOf(e.sender)] || {});
  handle('state:set', (e, patch) => {
    const key = wm.keyOf(e.sender);
    if (!key) return false;
    const all = store.get('state', {});
    store.set('state', { ...all, [key]: { ...all[key], ...patch } });
    return true;
  });

  handle('path:info', (_e, target) => {
    try {
      return { dir: fs.statSync(String(target)).isDirectory() };
    } catch {
      return { dir: false, missing: true };
    }
  });
  handle('open:path', (_e, target) => shell.openPath(String(target)));
  handle('open:external', (_e, url) => (/^(https?|obsidian):/i.test(url) ? shell.openExternal(url) : null));
  handle('file:icon', async (_e, target) => (await app.getFileIcon(String(target), { size: 'normal' })).toDataURL());
  handle('pick:folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return canceled ? null : filePaths[0];
  });

  handle('diag:openLog', () => openLogFolder());
  handle('diag:copy', () => copyDiagnostics());
}

function settingsHandlers({ ipc: { handle }, store, wm, settings, appearance, setTheme, setGrid, calendarPrefs, engine, broadcast }) {
  handle('settings:open', (_e, tab) => {
    settings.open(tab);
    return true;
  });

  handle('appearance:get', () => appearance.get());
  handle('appearance:set', (_e, { scope, patch }) => appearance.update((config) => Appearance.applyPatch(config, scope, patch || {})));
  handle('appearance:reset', (_e, scope) => appearance.update((config) => Appearance.resetScope(config, scope)));

  handle('theme:get', () => store.get('theme', 'system'));
  handle('theme:set', (_e, value) => setTheme(value));

  handle('grid:get', () => wm.gridCfg());
  handle('grid:set', (_e, patch) => setGrid(patch || {}));

  handle('behavior:get', () => wm.behaviorCfg());
  handle('behavior:set', (_e, patch) => {
    if (patch && typeof patch.raiseOnDesktop === 'boolean') {
      store.set('behavior', { ...store.get('behavior', {}), raiseOnDesktop: patch.raiseOnDesktop });
    }
    return wm.behaviorCfg();
  });

  handle('calendar:get', () => calendarPrefs());
  handle('calendar:set', (_e, patch = {}) => {
    const before = calendarPrefs();
    const next = { ...before };
    if ('firstDay' in patch) next.firstDay = Cal.normFirstDay(patch.firstDay);
    if (typeof patch.weekNumbers === 'boolean') next.weekNumbers = patch.weekNumbers;
    store.set('calendar', next);
    broadcast('calendar:prefs', next);
    if (next.firstDay !== before.firstDay) {
      engine.refreshWeek().catch((e) => console.warn(`week refresh: ${e.message}`));
    }
    return next;
  });
}

function weatherHandlers({ ipc: { handle }, weather }) {
  handle('weather:get', () => weather.snapshot());
  handle('weather:search', async (_e, query) => ({ places: await weather.search(query) }));
  handle('weather:setCity', (_e, name) => weather.setCity(name));
  handle('weather:setPlace', (_e, place) => weather.setPlace(place));
  handle('weather:setUnits', (_e, units) => weather.setUnits(units));
  handle('weather:refresh', async () => {
    await weather.refresh();
    return weather.snapshot();
  });
}

function obsidianHandlers({ ipc: { handle }, ob, obsidianMenu }) {
  handle('ob:status', () => ob.status());
  handle('ob:configMenu', (e) => {
    Menu.buildFromTemplate(obsidianMenu.template()).popup({ window: senderWindow(e) });
    return true;
  });

  handle('ob:tasks:list', () => ob.listTasks());
  handle('ob:tasks:add', (_e, task) => ob.addTask(task));
  handle('ob:tasks:toggle', (_e, ref) => ob.toggleTask(ref));
  handle('ob:tasks:edit', (_e, ref, title) => ob.editTask(ref, title));
  handle('ob:tasks:remove', (_e, ref) => ob.removeTask(ref));

  handle('ob:note:read', () => ob.readNote());
  handle('ob:note:write', (_e, text) => ob.writeNote(text));
  handle('ob:note:setMode', (_e, mode) => {
    ob.setOption({ noteMode: mode === 'daily' ? 'daily' : 'file' });
    return ob.status();
  });

  handle('ob:month', (_e, year, month, firstDay) => ob.monthData(year, month, Cal.normFirstDay(firstDay)));
  handle('ob:openDaily', (_e, date) => ob.openDaily(date));
  handle('ob:openFile', (_e, rel) => ob.openFile(rel));
  handle('ob:toggleAt', (_e, ref) => ob.toggleAt(ref));
}

function captureHandlers({ ipc: { handle }, store, ob, capture }) {
  handle('capture:state', () => ({ kind: store.get('capture', {}).kind === 'note' ? 'note' : 'task' }));
  handle('capture:close', () => {
    capture.hide();
    return true;
  });
  handle('capture:submit', async (_e, input) => {
    const kind = input && input.kind === 'note' ? 'note' : 'task';
    const text = String((input && input.text) || '').slice(0, 500);
    store.set('capture', { kind });
    if (kind === 'note') return { ok: !!(await ob.appendToNote(text)).ok, kind };
    const { title, due } = TaskInput.parseInput(text);
    if (!title) return { ok: false, kind };
    await ob.addTask({ title, due });
    return { ok: true, kind, title, due };
  });
}

function pomodoroHandlers({ ipc: { handle }, engine, pomodoroLog, banner, alerts, ob, tr }) {
  const commands = {
    start: () => engine.start(),
    pause: () => engine.pause(),
    toggle: () => engine.toggle(),
    skip: () => engine.skip(),
    reset: () => engine.reset(),
    end: () => engine.endSession(),
    setPhase: (phase) => engine.setPhase(phase),
    setSubject: (name) => engine.setSubject(name),
    addSubject: (arg) => engine.addSubject(arg && arg.name, arg && arg.color),
    updateSubject: (arg) => engine.updateSubject(arg && arg.name, (arg && arg.patch) || {}),
    removeSubject: (name) => engine.removeSubject(name),
    setSettings: (patch) => engine.setSettings(patch || {}),
  };

  handle('pomodoro:state', () => engine.getState());
  handle('pomodoro:cmd', (_e, name, arg) => {
    if (!Object.hasOwn(commands, name)) throw new Error(`Unknown command: ${name}`);
    commands[name](arg);
    return engine.getState();
  });

  handle('banner:state', () => banner.payload);
  handle('banner:action', (_e, what) => {
    banner.hide();
    if (what === 'start' && engine.status !== 'running') engine.start();
    return true;
  });

  handle('alerts:test', (_e, what) => alerts.test(what === 'banner' ? 'banner' : 'sound'));
  handle('alerts:checkSound', () => checkSoundFile(engine.settings.alerts.file));
  handle('alerts:chooseSound', async (e) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(senderWindow(e), {
      title: tr('Sound file'), properties: ['openFile'],
      filters: [{ name: tr('Audio'), extensions: SOUND_EXT.map((ext) => ext.slice(1)) }],
    });
    if (canceled || !filePaths[0]) return { ok: false, canceled: true };
    const check = await checkSoundFile(filePaths[0]);
    if (check.ok) engine.setSettings({ alerts: { file: filePaths[0], tone: 'custom' } });
    return check;
  });

  handle('prod:range', async (_e, { from, to }) => {
    await pomodoroLog.flush();
    const days = await pomodoroLog.range(String(from), String(to));
    const today = engine.day;
    if (today.key >= from && today.key <= to) {
      if (today.focusSec > 0 || today.pomodoros > 0) {
        days[today.key] = { total: today.focusSec, subjects: { ...today.bySubject }, pomodoros: today.pomodoros };
      } else {
        delete days[today.key];
      }
    }
    return { days, goalMin: engine.settings.goalMin, today: today.key, connected: !!ob.vault };
  });
  handle('prod:openDay', async (_e, key) => {
    if (!ob.vault || !DAY_KEY.test(String(key))) return false;
    const rel = `${engine.settings.logFolder}/${key}.md`;
    if (!fs.existsSync(ob.abs(rel))) return false;
    return ob.openFile(rel);
  });
}

function registerHandlers(context) {
  commonHandlers(context);
  settingsHandlers(context);
  weatherHandlers(context);
  obsidianHandlers(context);
  captureHandlers(context);
  pomodoroHandlers(context);
}

module.exports = { registerHandlers };
