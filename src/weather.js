'use strict';

async function getJson(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'Polaris/1.0' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

class CityNotFound extends Error {}

const UNITS = {
  metric: { temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm', wind: 'km/h' },
  imperial: { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', wind: 'mph' },
};
const normUnits = (u) => (u === 'imperial' ? 'imperial' : 'metric');

async function searchPlaces(query, { lang = 'en', count = 8 } = {}, fetchImpl = fetch) {
  const q = new URLSearchParams({ name: String(query || '').trim(), count: String(count), language: lang === 'ru' ? 'ru' : 'en', format: 'json' });
  if (!q.get('name')) return [];
  const found = (await getJson(`https://geocoding-api.open-meteo.com/v1/search?${q}`, fetchImpl)).results || [];
  const seen = new Set();
  const out = [];
  for (const r of found) {
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    const place = { name: r.name || String(query), region: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude };
    const key = `${place.name}|${place.region}|${place.country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out;
}

const pick = (arr, i) => (Array.isArray(arr) && arr[i] != null ? arr[i] : null);

async function fetchWeather({ city, lat, lon, name }, fetchImpl = fetch, opts = {}) {
  const units = normUnits(opts.units);
  if (lat == null || lon == null) {
    const found = await searchPlaces(city, { lang: opts.lang, count: 1 }, fetchImpl);
    if (!found.length) throw new CityNotFound('City not found');
    ({ lat, lon } = found[0]);
    name = found[0].name || city;
  }
  const u = UNITS[units];
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '6',
    temperature_unit: u.temperature_unit, wind_speed_unit: u.wind_speed_unit, precipitation_unit: u.precipitation_unit,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m,precipitation',
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  });
  const js = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`, fetchImpl);
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
    name, lat, lon, units, windUnit: u.wind,
    now: {
      temp: cur.temperature_2m, feels: cur.apparent_temperature, code: cur.weather_code, day: !!cur.is_day,
      humidity: cur.relative_humidity_2m != null ? cur.relative_humidity_2m : null,
      wind: cur.wind_speed_10m != null ? cur.wind_speed_10m : null,
      precip: cur.precipitation != null ? cur.precipitation : null,
      pop: hourly.length ? hourly[0].pop : null,
    },
    hourly, daily, updated: Date.now(),
  };
}

module.exports = { fetchWeather, searchPlaces, CityNotFound, normUnits, UNITS };
