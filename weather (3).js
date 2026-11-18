'use strict';

const USER_AGENT = 'Polaris/1.1 (+https://github.com/kobold427/polaris)';

async function getJson(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

class CityNotFound extends Error {}

const UNITS = {
  metric: { temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm', wind: 'km/h', precip: 'mm' },
  imperial: { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', wind: 'mph', precip: 'in' },
};
const normUnits = (u) => (u === 'imperial' ? 'imperial' : 'metric');

const SOURCES = {
  'open-meteo': { name: 'Open-Meteo', site: 'https://open-meteo.com/' },
  met: { name: 'MET Norway', site: 'https://api.met.no/' },
  custom: { name: 'Custom', site: '' },
};
const BUILT_IN = ['open-meteo', 'met'];
const normSource = (s) => (Object.hasOwn(SOURCES, s) ? s : 'open-meteo');

function normCustomUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  u.search = '';
  u.hash = '';
  if (!/\/v1\/forecast\/?$/.test(u.pathname)) u.pathname = `${u.pathname.replace(/\/+$/, '')}/v1/forecast`;
  return u.toString();
}

function dedupe(found, query) {
  const seen = new Set();
  const out = [];
  for (const place of found) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
    if (!place.name) place.name = String(query);
    const key = `${place.name}|${place.region}|${place.country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out;
}

async function searchOpenMeteo(query, { lang, count }, fetchImpl) {
  const q = new URLSearchParams({ name: query, count: String(count), language: lang === 'ru' ? 'ru' : 'en', format: 'json' });
  const found = (await getJson(`https://geocoding-api.open-meteo.com/v1/search?${q}`, fetchImpl)).results || [];
  return found.map((r) => ({ name: r.name || '', region: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude }));
}

async function searchNominatim(query, { lang, count }, fetchImpl) {
  const q = new URLSearchParams({
    q: query, format: 'jsonv2', addressdetails: '1', limit: String(count), 'accept-language': lang === 'ru' ? 'ru' : 'en',
  });
  const found = await getJson(`https://nominatim.openstreetmap.org/search?${q}`, fetchImpl);
  return (Array.isArray(found) ? found : []).map((r) => {
    const a = r.address || {};
    return {
      name: r.name || a.city || a.town || a.village || String(r.display_name || '').split(',')[0],
      region: a.state || a.region || a.county || '', country: a.country || '',
      lat: Number(r.lat), lon: Number(r.lon),
    };
  });
}

const GEOCODERS = { 'open-meteo': searchOpenMeteo, nominatim: searchNominatim };
const GEO_ORDER = { 'open-meteo': ['open-meteo', 'nominatim'], met: ['nominatim', 'open-meteo'], custom: ['nominatim', 'open-meteo'] };

async function searchPlaces(query, { lang = 'en', count = 8, source = 'open-meteo' } = {}, fetchImpl = fetch) {
  const q = String(query || '').trim();
  if (!q) return [];
  let failure = null;
  for (const id of GEO_ORDER[normSource(source)]) {
    try {
      return dedupe(await GEOCODERS[id](q, { lang, count }, fetchImpl), q);
    } catch (e) {
      failure = e;
    }
  }
  throw failure || new Error('Search failed');
}

const pick = (arr, i) => (Array.isArray(arr) && arr[i] != null ? arr[i] : null);

async function fetchOpenMeteo({ lat, lon }, units, fetchImpl, base = 'https://api.open-meteo.com/v1/forecast') {
  const u = UNITS[units];
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '6',
    temperature_unit: u.temperature_unit, wind_speed_unit: u.wind_speed_unit, precipitation_unit: u.precipitation_unit,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m,precipitation',
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  });
  const js = await getJson(`${base}?${q}`, fetchImpl);
  const { current: cur, hourly: hr, daily: dy } = js;
  const key = cur.time.slice(0, 13);
  let start = hr.time.findIndex((t) => t.slice(0, 13) >= key);
  if (start < 0) start = 0;
  const hourly = [];
  for (let i = start; i < Math.min(start + 12, hr.time.length); i++) {
    hourly.push({ hour: Number(hr.time[i].slice(11, 13)), temp: hr.temperature_2m[i], code: hr.weather_code[i], day: !!hr.is_day[i], pop: pick(hr.precipitation_probability, i) });
  }
  const daily = dy.time.map((date, i) => ({ date, max: dy.temperature_2m_max[i], min: dy.temperature_2m_min[i], code: dy.weather_code[i], pop: pick(dy.precipitation_probability_max, i) }));
  return {
    now: {
      temp: cur.temperature_2m, feels: cur.apparent_temperature, code: cur.weather_code, day: !!cur.is_day,
      humidity: cur.relative_humidity_2m != null ? cur.relative_humidity_2m : null,
      wind: cur.wind_speed_10m != null ? cur.wind_speed_10m : null,
      precip: cur.precipitation != null ? cur.precipitation : null,
      pop: hourly.length ? hourly[0].pop : null,
    },
    hourly, daily,
  };
}

const MET_CODES = [
  [/thunder/, 95], [/heavysnow/, 75], [/lightsnow/, 71], [/snow/, 73], [/heavysleet/, 67], [/sleet/, 66],
  [/heavyrain/, 65], [/lightrain/, 61], [/rain/, 63], [/fog/, 45], [/partlycloudy/, 2], [/fair/, 1], [/clearsky/, 0], [/cloudy/, 3],
];

function metCode(symbol) {
  const s = String(symbol || '');
  const showers = /showers/.test(s);
  for (const [re, code] of MET_CODES) {
    if (!re.test(s)) continue;
    if (showers && code >= 61 && code <= 65) return code === 61 ? 80 : code === 65 ? 82 : 81;
    if (showers && code >= 71 && code <= 75) return code === 75 ? 86 : 85;
    return code;
  }
  return 3;
}

function sunElevation(date, lat, lon) {
  const rad = Math.PI / 180;
  const day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const g = (2 * Math.PI / 365) * (day - 1 + (hours - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const solarMin = hours * 60 + eq + 4 * lon;
  const ha = (solarMin / 4 - 180) * rad;
  const cosZ = Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / rad;
}

function isDay(symbol, date, lat, lon) {
  const s = String(symbol || '');
  if (/_night$/.test(s)) return false;
  if (/_(day|polartwilight)$/.test(s)) return true;
  return sunElevation(date, lat, lon) > -0.833;
}

function apparent(temp, humidity, windMs) {
  if (temp == null) return null;
  if (humidity == null || windMs == null) return temp;
  const e = (humidity / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
  return temp + 0.33 * e - 0.7 * windMs - 4;
}

const pad = (n) => String(n).padStart(2, '0');
const localYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function fetchMet({ lat, lon }, units, fetchImpl) {
  const q = new URLSearchParams({ lat: Number(lat).toFixed(4), lon: Number(lon).toFixed(4) });
  const js = await getJson(`https://api.met.no/weatherapi/locationforecast/2.0/complete?${q}`, fetchImpl);
  const series = (js.properties && js.properties.timeseries) || [];
  if (!series.length) throw new Error('Empty forecast');
  const imperial = units === 'imperial';
  const temp = (c) => (c == null ? null : imperial ? c * 9 / 5 + 32 : c);
  const wind = (ms) => (ms == null ? null : imperial ? ms * 2.23694 : ms * 3.6);
  const precip = (mm) => (mm == null ? null : imperial ? mm / 25.4 : mm);
  const symbolOf = (e) => {
    const d = e.data || {};
    return (d.next_1_hours && d.next_1_hours.summary.symbol_code) || (d.next_6_hours && d.next_6_hours.summary.symbol_code) || (d.next_12_hours && d.next_12_hours.summary.symbol_code) || '';
  };
  const popOf = (e) => {
    const d = e.data || {};
    const v = (d.next_1_hours && d.next_1_hours.details && d.next_1_hours.details.probability_of_precipitation)
      ?? (d.next_6_hours && d.next_6_hours.details && d.next_6_hours.details.probability_of_precipitation);
    return v == null ? null : v;
  };

  const nowTs = Date.now();
  let start = series.findIndex((e) => Date.parse(e.time) + 3600000 > nowTs);
  if (start < 0) start = 0;
  const first = series[start];
  const det = first.data.instant.details;
  const firstDate = new Date(first.time);
  const firstSymbol = symbolOf(first);
  const n1 = first.data.next_1_hours;

  const hourly = [];
  for (let i = start; i < series.length && hourly.length < 12; i++) {
    const e = series[i];
    if (!e.data.next_1_hours) break;
    const d = new Date(e.time);
    const symbol = symbolOf(e);
    hourly.push({ hour: d.getHours(), temp: temp(e.data.instant.details.air_temperature), code: metCode(symbol), day: isDay(symbol, d, lat, lon), pop: popOf(e) });
  }

  const days = new Map();
  for (const e of series) {
    const d = new Date(e.time);
    const key = localYmd(d);
    if (key < localYmd(new Date(nowTs))) continue;
    let day = days.get(key);
    if (!day) { day = { date: key, temps: [], symbol: '', noon: Infinity, pop: null }; days.set(key, day); }
    const t = e.data.instant.details.air_temperature;
    if (t != null) day.temps.push(t);
    const n6 = e.data.next_6_hours;
    if (n6 && n6.details) {
      if (n6.details.air_temperature_max != null) day.temps.push(n6.details.air_temperature_max);
      if (n6.details.air_temperature_min != null) day.temps.push(n6.details.air_temperature_min);
    }
    const dist = Math.abs(d.getHours() + d.getMinutes() / 60 - 12);
    const symbol = symbolOf(e);
    if (symbol && dist < day.noon) { day.noon = dist; day.symbol = symbol; }
    const p = popOf(e);
    if (p != null) day.pop = Math.max(day.pop == null ? 0 : day.pop, p);
  }
  const daily = [...days.values()].filter((d) => d.temps.length).slice(0, 6).map((d) => ({
    date: d.date, max: temp(Math.max(...d.temps)), min: temp(Math.min(...d.temps)), code: metCode(d.symbol), pop: d.pop,
  }));

  return {
    now: {
      temp: temp(det.air_temperature),
      feels: temp(apparent(det.air_temperature, det.relative_humidity, det.wind_speed)),
      code: metCode(firstSymbol), day: isDay(firstSymbol, firstDate, lat, lon),
      humidity: det.relative_humidity != null ? det.relative_humidity : null,
      wind: wind(det.wind_speed),
      precip: n1 && n1.details ? precip(n1.details.precipitation_amount) : null,
      pop: hourly.length ? hourly[0].pop : null,
    },
    hourly, daily,
  };
}

function plan(source, fallback) {
  const s = normSource(source);
  const order = [s];
  if (fallback) for (const other of BUILT_IN) if (!order.includes(other)) order.push(other);
  return order;
}

async function fetchFrom(source, place, units, fetchImpl, customUrl) {
  if (source === 'met') return fetchMet(place, units, fetchImpl);
  if (source === 'custom') {
    const base = normCustomUrl(customUrl);
    if (!base) throw new Error('No custom source address');
    return fetchOpenMeteo(place, units, fetchImpl, base);
  }
  return fetchOpenMeteo(place, units, fetchImpl);
}

async function fetchWeather({ city, lat, lon, name, source, customUrl, fallback }, fetchImpl = fetch, opts = {}) {
  const units = normUnits(opts.units);
  if (lat == null || lon == null) {
    const found = await searchPlaces(city, { lang: opts.lang, count: 1, source }, fetchImpl);
    if (!found.length) throw new CityNotFound('City not found');
    ({ lat, lon } = found[0]);
    name = found[0].name || city;
  }
  let failure = null;
  for (const id of plan(source, fallback !== false)) {
    try {
      const data = await fetchFrom(id, { lat, lon }, units, fetchImpl, customUrl);
      const site = id === 'custom' ? new URL(normCustomUrl(customUrl)).origin : SOURCES[id].site;
      const label = id === 'custom' ? new URL(site).host : SOURCES[id].name;
      return {
        name, lat, lon, units, windUnit: UNITS[units].wind, precipUnit: UNITS[units].precip,
        source: id, sourceName: label, sourceSite: site, fellBack: id !== normSource(source),
        ...data, updated: Date.now(),
      };
    } catch (e) {
      failure = e;
      console.warn(`weather: ${id} failed: ${e.message}`);
    }
  }
  throw failure || new Error('No data');
}

module.exports = {
  fetchWeather, searchPlaces, CityNotFound, normUnits, normSource, normCustomUrl, metCode, sunElevation, apparent, UNITS, SOURCES,
};
