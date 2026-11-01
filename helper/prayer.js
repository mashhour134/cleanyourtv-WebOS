// Prayer times for the optional Sakina card. Coordinates are sent only to AlAdhan when the user requests timings.
// Timings are cached in memory by local date, location, and calculation method.
const fetch = require('./fetch');
const API = process.env.CYTV_PRAYER_URL || 'https://api.aladhan.com/v1/timings';
const cache = {};
function valid(n, min, max) {
  return typeof n === 'number' && isFinite(n) && n >= min && n <= max;
}
function dateKey(d) {
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear();
}
async function get(lat, lon, method) {
  lat = Number(lat);
  lon = Number(lon);
  method = Number(method);
  if (!valid(lat, -90, 90) || !valid(lon, -180, 180)) return { error: 'no place chosen' };
  if ([2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].indexOf(method) < 0) method = 4;
  const date = dateKey(new Date());
  const key = [lat.toFixed(2), lon.toFixed(2), method, date].join('|');
  if (cache[key] && Date.now() - cache[key].at < 6 * 60 * 60 * 1000) return cache[key];
  const url = API + '/' + date + '?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) + '&method=' + method;
  try {
    const r = await fetch.read(url, {
      headers: { 'User-Agent': 'cleanyourtv-prayer-times' },
      maxBytes: 128 * 1024,
      totalMs: 15000,
      allowHttp: () => !!process.env.CYTV_PRAYER_URL,
    });
    const j = JSON.parse(r.body.toString('utf8'));
    const t = j && j.data && j.data.timings;
    if (!t) throw new Error('prayer times unavailable');
    const result = {
      at: Date.now(),
      method: method,
      date: date,
      timings: {
        Fajr: String(t.Fajr || '').slice(0, 5),
        Sunrise: String(t.Sunrise || '').slice(0, 5),
        Dhuhr: String(t.Dhuhr || '').slice(0, 5),
        Asr: String(t.Asr || '').slice(0, 5),
        Maghrib: String(t.Maghrib || '').slice(0, 5),
        Isha: String(t.Isha || '').slice(0, 5),
      },
    };
    cache[key] = result;
    return result;
  } catch (e) {
    return cache[key] || { error: String(e.message || e) };
  }
}
module.exports = { get };
