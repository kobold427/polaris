'use strict';
const { EventEmitter } = require('events');
const { fetchWeather, searchPlaces, CityNotFound, normUnits, normSource, normCustomUrl } = require('./weather');

const REFRESH_MS = 15 * 60 * 1000;
const RETRY_MS = 2 * 60 * 1000;

class WeatherService extends EventEmitter {
  constructor({ store, getLang, isActive = () => true }) {
    super();
    this.store = store;
    this.getLang = getLang;
    this.isActive = isActive;
    this.fetchedAt = 0;
    this.data = null;
    this.error = null;
    this.loading = false;
    this.again = false;
    this.revision = 0;
    this.retryTimer = null;
    this.timer = null;
  }

  get settings() {
    return this.store.get('weather', {}) || {};
  }

  snapshot() {
    return { settings: this.settings, source: this.sourceCfg(), data: this.data, error: this.error, loading: this.loading };
  }

  sourceCfg() {
    const s = this.settings;
    return { source: normSource(s.source), customUrl: normCustomUrl(s.customUrl), fallback: s.fallback !== false };
  }

  async setSource({ source, customUrl } = {}) {
    const next = { ...this.sourceCfg(), source: normSource(source) };
    if (customUrl !== undefined) {
      const url = normCustomUrl(customUrl);
      if (!url) throw new Error('Invalid address');
      next.customUrl = url;
    }
    if (next.source === 'custom' && !next.customUrl) throw new Error('Invalid address');
    this.revision += 1;
    this.store.set('weather', { ...this.settings, ...next });
    this.error = null;
    await this.refresh();
    return this.snapshot();
  }

  async setFallback(flag) {
    this.store.set('weather', { ...this.settings, fallback: !!flag });
    if (this.error) await this.refresh();
    return this.snapshot();
  }

  start() {
    this.wake();
    this.timer = setInterval(() => { if (this.isActive()) this.refresh(); }, REFRESH_MS);
    this.timer.unref();
  }

  wake() {
    if (this.isActive() && (this.error || !this.data || Date.now() - this.fetchedAt >= REFRESH_MS)) this.refresh();
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.retryTimer);
  }

  search(query) {
    return searchPlaces(String(query || '').slice(0, 80), { lang: this.getLang(), source: this.sourceCfg().source });
  }

  async setCity(name) {
    return this.change({ city: String(name || '').trim(), units: this.units() });
  }

  async setPlace(place) {
    const lat = Number(place?.lat);
    const lon = Number(place?.lon);
    if (!place || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Invalid place');
    const name = String(place.name || '').slice(0, 80);
    return this.change({ city: name, name, lat, lon, lang: this.getLang(), units: this.units() });
  }

  async setUnits(units) {
    this.revision += 1;
    this.store.set('weather', { ...this.settings, units: normUnits(units) });
    await this.refresh();
    return this.snapshot();
  }

  units() {
    return normUnits(this.settings.units);
  }

  async change(settings) {
    this.revision += 1;
    this.store.set('weather', { ...this.sourceCfg(), ...settings });
    this.data = null;
    this.error = null;
    await this.refresh();
    return this.snapshot();
  }

  async refresh() {
    let settings = this.settings;
    if (!settings.city) return;
    if (this.loading) {
      this.again = true;
      return;
    }
    this.loading = true;
    const revision = this.revision;
    this.emit('update', this.snapshot());
    try {
      settings = await this.withLocalizedName(settings);
      const data = await fetchWeather({ ...settings, ...this.sourceCfg() }, undefined, { units: normUnits(settings.units), lang: this.getLang() });
      if (revision === this.revision) {
        this.data = data;
        this.fetchedAt = Date.now();
        this.error = null;
        clearTimeout(this.retryTimer);
        this.store.set('weather', {
          ...this.settings, ...settings, lang: settings.lat != null ? settings.lang : this.getLang(),
          lat: data.lat, lon: data.lon, name: data.name, units: normUnits(settings.units),
        });
      }
    } catch (e) {
      if (revision === this.revision) {
        const notFound = e instanceof CityNotFound;
        this.error = notFound ? e.message : 'No data. Check your internet connection.';
        clearTimeout(this.retryTimer);
        if (!notFound) this.retryTimer = setTimeout(() => { if (this.isActive()) this.refresh(); }, RETRY_MS);
      }
      console.warn(`weather: ${e.message}`);
    }
    this.loading = false;
    this.emit('update', this.snapshot());
    if (this.again) {
      this.again = false;
      await this.refresh();
    }
  }

  async withLocalizedName(settings) {
    const lang = this.getLang();
    if (settings.lang === lang || settings.lat == null || settings.lon == null) return settings;
    try {
      const found = await searchPlaces(settings.name || settings.city, { lang, count: 6, source: this.sourceCfg().source });
      const nearest = found
        .map((place) => ({ place, distance: Math.hypot(place.lat - settings.lat, place.lon - settings.lon) }))
        .sort((a, b) => a.distance - b.distance)[0];
      return { ...settings, lang, ...(nearest && nearest.distance < 0.5 ? { name: nearest.place.name } : {}) };
    } catch {
      return settings;
    }
  }
}

module.exports = { WeatherService };
