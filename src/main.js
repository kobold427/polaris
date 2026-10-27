'use strict';
const fs = require('fs');
const path = require('path');
const {
  app, BrowserWindow, Menu, Notification, clipboard, globalShortcut, nativeImage, nativeTheme, powerMonitor, screen, session, shell,
} = require('electron');
const { Logger } = require('./log');
const { Store } = require('./store');
const { migrateUserData, OLD_NAME } = require('./legacy');
const { WidgetManager, DEFS, ORDER } = require('./windows');
const { GridOverlay } = require('./grid');
const { ObsidianSync } = require('./obsidian');
const { WeatherService } = require('./weather-service');
const { Backdrop } = require('./backdrop');
const pin = require('./winpin');
const { PomodoroEngine } = require('./pomodoro');
const { PomodoroLog } = require('./pomodoro-log');
const { Hotkeys } = require('./hotkeys');
const { CaptureWindow } = require('./capture');
const { BannerWindow } = require('./banner');
const { SettingsWindow } = require('./settings-window');
const { AudioPlayer } = require('./audio');
const { Alerts } = require('./alerts');
const { createIpc } = require('./ipc');
const { registerHandlers } = require('./handlers');
const { createTray } = require('./tray');
const { createObsidianMenu } = require('./obsidian-menu');
const { createDiagnostics } = require('./diagnostics');
const Appearance = require('./shared/appearance');
const I18n = require('./shared/i18n');
const Cal = require('./shared/cal');

const SHORTCUTS = { peek: 'Ctrl+Alt+W', capture: 'Ctrl+Alt+N', pomodoro: 'Ctrl+Alt+P' };
const dev = process.argv.includes('--dev');

app.setAppUserModelId('com.polaris.app');

if (app.requestSingleInstanceLock()) {
  app.on('window-all-closed', () => {});
  app.whenReady().then(start).catch((e) => {
    console.error(e);
    app.quit();
  });
} else {
  app.quit();
}

async function start() {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  const logger = new Logger({ dir: path.join(app.getPath('userData'), 'logs') });
  logger.hookConsole();
  process.on('uncaughtException', (e) => logger.error('uncaughtException:', e?.stack ?? e));
  process.on('unhandledRejection', (reason) => logger.error('unhandledRejection:', reason?.stack ?? reason));
  app.on('child-process-gone', (_event, details) => logger.error('child process gone:', JSON.stringify(details)));

  try {
    const copied = migrateUserData({ appData: app.getPath('appData'), userData: app.getPath('userData') });
    if (copied.length) console.log(`Copied from the previous "${OLD_NAME}" data folder: ${copied.join(', ')}`);
  } catch (e) {
    console.warn('Could not copy data from the previous folder:', e.message);
  }

  const store = new Store(path.join(app.getPath('userData'), 'config.json'));
  nativeTheme.themeSource = store.get('theme', 'system');
  const rendererDir = path.join(__dirname, 'renderer');
  const starIcon = path.join(rendererDir, 'star.png');
  const preload = path.join(__dirname, 'preload.js');

  const language = () => {
    const stored = store.get('language', 'en');
    const setting = stored === 'auto' || stored === 'ru' ? stored : 'en';
    return { setting, lang: I18n.resolve(setting, app.getLocale()) };
  };
  const getLang = () => language().lang;
  const tr = (key, params) => I18n.t(getLang(), key, params);

  const overlay = new GridOverlay({ BrowserWindow, preload, rendererDir });
  const wm = new WidgetManager({ store, rendererDir, preload, getLang, dev, overlay });
  const capture = new CaptureWindow({ BrowserWindow, screen, preload, rendererDir, getLang });
  const banner = new BannerWindow({ BrowserWindow, screen, preload, rendererDir, getLang });
  const audio = new AudioPlayer({ BrowserWindow, preload, rendererDir, log: (message) => logger.warn(message) });
  const settings = new SettingsWindow({ preload, rendererDir, getLang, title: () => tr('Settings') });
  const ob = new ObsidianSync(store, { openExternal: (url) => shell.openExternal(url) });
  const backdrop = new Backdrop({ nativeImage, screen, powerMonitor });
  const weather = new WeatherService({ store, getLang });
  const diagnostics = createDiagnostics({ app, screen, pin, wm, ob, backdrop, order: ORDER, logger });

  logger.info('=== start ===');
  for (const line of diagnostics.lines()) logger.info(line);

  const broadcast = (channel, payload) => {
    wm.broadcast(channel, payload);
    settings.send(channel, payload);
  };

  const calendarPrefs = () => {
    const saved = store.get('calendar', {});
    return { firstDay: Cal.normFirstDay(saved.firstDay), weekNumbers: !!saved.weekNumbers };
  };

  const localLogDir = path.join(app.getPath('userData'), 'pomodoro-log');
  let engine = null;
  const logDir = () => {
    if (ob.vault && engine) {
      try {
        return ob.abs(engine.settings.logFolder);
      } catch { }
    }
    return localLogDir;
  };
  const pomodoroLog = new PomodoroLog({ dir: logDir });
  const alerts = new Alerts({
    audio, banner, tr, log: (message) => logger.warn(message),
    settings: () => engine.settings.alerts,
    toast: (title, body, { silent } = {}) => {
      if (Notification.isSupported()) new Notification({ title, body, silent: !!silent, icon: starIcon }).show();
    },
  });
  engine = new PomodoroEngine({
    store, log: pomodoroLog,
    getFirstDay: () => calendarPrefs().firstDay,
    notify: (title, body, info) => alerts.handle(title, body, info),
  });
  engine.on('state', (state) => {
    broadcast('pomodoro:state', state);
    if (state.status === 'running' && banner.visible) banner.hide();
  });
  engine.on('sessionEnd', (summary) => broadcast('pomodoro:sessionEnd', summary));
  engine.on('logFolder', async () => {
    await pomodoroLog.flush();
    await engine.load();
    broadcast('prod:changed');
  });
  pomodoroLog.on('changed', () => broadcast('prod:changed'));

  let connectedVault = null;
  ob.on('status', async (status) => {
    broadcast('ob:status', status);
    const vault = status.connected ? status.vaultPath : null;
    if (vault === connectedVault) return;
    connectedVault = vault;
    try {
      await pomodoroLog.flush();
      if (vault) await pomodoroLog.migrate(localLogDir, logDir());
      await engine.load();
      broadcast('prod:changed');
    } catch (e) {
      console.warn(`pomodoro log relocate: ${e.message}`);
    }
  });
  for (const [event, channel] of [['tasks', 'ob:tasks'], ['note', 'ob:note'], ['index', 'ob:index']]) {
    ob.on(event, () => broadcast(channel));
  }
  const obsidianMenu = createObsidianMenu({
    ob, tr, getLogFolder: () => engine.settings.logFolder, openSettings: (tab) => settings.open(tab),
  });

  const appearance = {
    value: Appearance.config(store.get('appearance')),
    get() { return this.value; },
    update(change) {
      this.value = change(this.value);
      store.set('appearance', this.value);
      broadcast('appearance:update', this.value);
      return this.value;
    },
  };

  const setTheme = (value) => {
    const theme = ['system', 'light', 'dark'].includes(value) ? value : 'system';
    nativeTheme.themeSource = theme;
    store.set('theme', theme);
    broadcast('theme', theme);
    return theme;
  };

  const setGrid = ({ snap, show }) => {
    const grid = store.get('grid', {});
    if (typeof snap === 'boolean') grid.snap = snap;
    if (typeof show === 'boolean') grid.show = show;
    store.set('grid', grid);
    return wm.gridCfg();
  };

  const setLanguage = (setting) => {
    if (!['auto', 'en', 'ru'].includes(setting) || setting === language().setting) return language();
    store.set('language', setting);
    capture.dispose();
    banner.dispose();
    wm.reloadAll();
    settings.reload();
    weather.refresh();
    return language();
  };

  const openLogFolder = () => {
    const dir = path.dirname(logger.file);
    fs.mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  };
  const copyDiagnostics = () => {
    clipboard.writeText(diagnostics.text());
    return true;
  };

  const widgetList = ORDER.map((key) => ({ key, title: DEFS[key].title }));

  registerHandlers({
    ipc: createIpc(rendererDir),
    store, wm, ob, engine, pomodoroLog, weather, backdrop, capture, banner, alerts, settings, obsidianMenu, appearance,
    broadcast, language, setLanguage, setTheme, setGrid, calendarPrefs, openLogFolder, copyDiagnostics, tr,
    widgets: () => widgetList.map((widget) => ({ ...widget, visible: wm.enabled(widget.key) })),
  });

  const toggleTimer = () => {
    engine.toggle();
    if (!Notification.isSupported()) return;
    const state = engine.getState();
    const phase = { work: tr('Work'), short: tr('Short break'), long: tr('Long break') }[state.phase];
    const minutes = Math.floor(state.remainingMs / 60000);
    const seconds = String(Math.floor((state.remainingMs % 60000) / 1000)).padStart(2, '0');
    new Notification({
      title: state.status === 'running' ? tr('Pomodoro started') : tr('Pomodoro paused'),
      body: `${phase} · ${minutes}:${seconds}`,
      silent: true,
      icon: starIcon,
    }).show();
  };
  const hotkeys = new Hotkeys({
    globalShortcut,
    log: (message) => logger.warn(message),
    bindings: [
      { accelerator: SHORTCUTS.peek, run: () => wm.peek({ toggle: true }) },
      { accelerator: SHORTCUTS.capture, run: () => capture.toggle() },
      { accelerator: SHORTCUTS.pomodoro, run: toggleTimer },
    ],
  });

  wm.start();
  hotkeys.register();
  ob.start();
  backdrop.on('change', (data) => broadcast('backdrop:update', data));
  backdrop.start();
  await engine.load().catch((e) => console.warn(`pomodoro load: ${e.message}`));
  engine.startTicking();
  weather.on('update', (snapshot) => wm.broadcast('weather:update', snapshot));
  weather.start();

  createTray({
    tr, wm, capture, setTheme, setGrid, openLogFolder, copyDiagnostics,
    widgets: widgetList,
    shortcuts: SHORTCUTS,
    openSettings: (tab) => settings.open(tab),
    obsidianTemplate: obsidianMenu.template,
  });
  app.on('second-instance', () => wm.peek());

  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    (async () => {
      hotkeys.dispose();
      capture.dispose();
      banner.dispose();
      audio.dispose();
      wm.dispose();
      overlay.dispose();
      backdrop.stop();
      weather.stop();
      await engine.shutdown().catch((e) => console.warn(`shutdown: ${e.message}`));
      ob.stop();
      store.flush();
      logger.info('=== quit ===');
      logger.flushRepeats();
    })().finally(() => app.quit());
  });
}
