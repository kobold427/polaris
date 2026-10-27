'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const params = new URLSearchParams(location.search);
const key = params.get('key');
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel, cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('api', {
  key,
  lang: params.get('lang') === 'ru' ? 'ru' : 'en',
  language: { get: () => invoke('language:get'), set: (v) => invoke('language:set', v) },
  drag: {
    start: (mode, edges) => ipcRenderer.send('drag:start', { mode, edges }),
    end: () => ipcRenderer.send('drag:end'),
  },
  locked: { get: () => invoke('locked:get'), on: (cb) => on('locked', cb) },
  menu: (items) => invoke('menu', items),
  state: { get: () => invoke('state:get'), set: (patch) => invoke('state:set', patch) },
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  pathInfo: (p) => invoke('path:info', p),
  openPath: (p) => invoke('open:path', p),
  openExternal: (url) => invoke('open:external', url),
  fileIcon: (p) => invoke('file:icon', p),
  pickFolder: () => invoke('pick:folder'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  win: { getBounds: () => invoke('win:getBounds'), onBounds: (cb) => on('win:bounds', cb) },
  appearance: {
    get: () => invoke('appearance:get'),
    set: (scope, patch) => invoke('appearance:set', { scope, patch }),
    reset: (scope) => invoke('appearance:reset', scope),
    on: (cb) => on('appearance:update', cb),
  },
  backdrop: { get: () => invoke('backdrop:get'), on: (cb) => on('backdrop:update', cb) },
  calendarPrefs: { get: () => invoke('calendar:get'), set: (patch) => invoke('calendar:set', patch), on: (cb) => on('calendar:prefs', cb) },
  capture: { state: () => invoke('capture:state'), submit: (p) => invoke('capture:submit', p), close: () => invoke('capture:close'), onShown: (cb) => on('capture:shown', cb) },
  banner: { state: () => invoke('banner:state'), action: (what) => invoke('banner:action', what), onShown: (cb) => on('banner:shown', cb) },
  audio: { onPlay: (cb) => on('audio:play', cb) },
  alerts: { test: (what) => invoke('alerts:test', what), chooseSound: () => invoke('alerts:chooseSound'), checkSound: () => invoke('alerts:checkSound') },
  behavior: { get: () => invoke('behavior:get'), set: (patch) => invoke('behavior:set', patch) },
  grid: { on: (cb) => on('grid:update', cb), get: () => invoke('grid:get'), set: (patch) => invoke('grid:set', patch) },
  theme: { get: () => invoke('theme:get'), set: (v) => invoke('theme:set', v), on: (cb) => on('theme', cb) },
  settings: { open: (tab) => invoke('settings:open', tab), onTab: (cb) => on('settings:tab', cb) },
  diag: { openLog: () => invoke('diag:openLog'), copy: () => invoke('diag:copy') },
  widgets: { list: () => invoke('widgets:get') },
  pomodoro: {
    state: () => invoke('pomodoro:state'),
    cmd: (name, arg) => invoke('pomodoro:cmd', name, arg),
    on: (cb) => on('pomodoro:state', cb),
    onSessionEnd: (cb) => on('pomodoro:sessionEnd', cb),
  },
  productivity: {
    range: (from, to) => invoke('prod:range', { from, to }),
    openDay: (key) => invoke('prod:openDay', key),
    on: (cb) => on('prod:changed', cb),
  },
  weather: {
    get: () => invoke('weather:get'),
    setCity: (name) => invoke('weather:setCity', name),
    search: (q) => invoke('weather:search', q),
    setPlace: (place) => invoke('weather:setPlace', place),
    setUnits: (u) => invoke('weather:setUnits', u),
    refresh: () => invoke('weather:refresh'),
    on: (cb) => on('weather:update', cb),
  },
  obsidian: {
    status: () => invoke('ob:status'),
    onStatus: (cb) => on('ob:status', cb),
    configMenu: () => invoke('ob:configMenu'),
    tasks: {
      list: () => invoke('ob:tasks:list'),
      add: (task) => invoke('ob:tasks:add', task),
      toggle: (ref) => invoke('ob:tasks:toggle', ref),
      edit: (ref, title) => invoke('ob:tasks:edit', ref, title),
      remove: (ref) => invoke('ob:tasks:remove', ref),
      on: (cb) => on('ob:tasks', cb),
    },
    note: {
      read: () => invoke('ob:note:read'),
      write: (text) => invoke('ob:note:write', text),
      setMode: (mode) => invoke('ob:note:setMode', mode),
      on: (cb) => on('ob:note', cb),
    },
    calendar: {
      month: (year, month, firstDay) => invoke('ob:month', year, month, firstDay),
      openDaily: (date) => invoke('ob:openDaily', date),
      openFile: (rel) => invoke('ob:openFile', rel),
      toggleAt: (ref) => invoke('ob:toggleAt', ref),
      on: (cb) => on('ob:index', cb),
    },
  },
});
