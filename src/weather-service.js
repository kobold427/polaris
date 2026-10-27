'use strict';
const { EventEmitter } = require('events');
const { fetchWeather, searchPlaces, CityNotFound, normUnits } = require('./weather');

const REFRESH_MS = 15 * 60 * 1000;
const RETRY_MS = 2 * 60 * 1000;

class WeatherService extends EventEmitter {
  constructor({ store, getLang }) {
    super();
    this.store = store;
    this.getLang = getLang;
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
    return { settings: this.settings, data: this.data, error: this.error, loading: this.loading };
  }

  start() {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.retryTimer);
  }

  search(query) {
    return searchPlaces(String(query || '').slice(0, 80), { lang: this.getLang() });
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
    this.store.set('weather', settings);
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
      const data = await fetchWeather(settings, undefined, { units: normUnits(settings.units), lang: this.getLang() });
      if (revision === this.revision) {
        this.data = data;
        this.error = null;
        clearTimeout(this.retryTimer);
        this.store.set('weather', {
          ...settings, lang: settings.lat != null ? settings.lang : this.getLang(),
          lat: data.lat, lon: data.lon, name: data.name, units: normUnits(settings.units),
        });
      }
    } catch (e) {
      if (revision === this.revision) {
        const notFound = e instanceof CityNotFound;
        this.error = notFound ? e.message : 'No data. Check your internet connection.';
        clearTimeout(this.retryTimer);
        if (!notFound) this.retryTimer = setTimeout(() => this.refresh(), RETRY_MS);
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
      const found = await searchPlaces(settings.name || settings.city, { lang, count: 6 });
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
