// Prayer times worked out on the TV (app/src/js/prayercalc.js): the five times of a day from a place, the method and the Asr rule, the next
// prayer (and tomorrow's Fajr after Isha), the time left, and prayerLocal(), which gives a card its times in the service's shape. The file has
// no browser calls apart from Intl, so it is loaded as it is. Times are compared as instants (UTC hours), so the TV's own time zone
// of the machine that runs the test does not matter.
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { root, ok, run } = require('./lib');

run(async () => {
  const sandbox = {
    Intl,
    Date,
    Math,
    String,
    isFinite,
    t: s => s,
    LOC: 'en-GB',
    clockOpts: () => ({ hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }),
    cfg: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, 'app', 'src', 'js', 'prayercalc.js'), 'utf8') + '\nthis.P = PRAYER; this.L = prayerLocal;',
    sandbox,
    { filename: 'prayercalc.js' }
  );
  const P = sandbox.P;
  const hours = d => d.getUTCHours() + d.getUTCMinutes() / 60;
  const near = (d, h, name) =>
    ok(Math.abs(hours(d) - h) <= 8 / 60, name + ' within 8 minutes of ' + h.toFixed(2) + ' UTC (got ' + hours(d).toFixed(2) + ')');

  // Riyadh on 1 November 2026 (UTC+3 there): Fajr 04:41, sunrise 06:00, Dhuhr 11:37, Asr 14:49, Maghrib 17:13, Isha 18:43 local
  const day = new Date(Date.UTC(2026, 10, 1, 12));
  const riyadh = { lat: 24.7136, lon: 46.6753, method: 'ummalqura' };
  const t = P.times(day, riyadh);
  ok(t && ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].every(k => t[k] instanceof Date), 'times gives the six times as Dates');
  near(t.fajr, 1.683, 'Riyadh Fajr');
  near(t.sunrise, 3.0, 'Riyadh sunrise');
  near(t.dhuhr, 8.617, 'Riyadh Dhuhr');
  near(t.asr, 11.817, 'Riyadh Asr');
  near(t.maghrib, 14.217, 'Riyadh Maghrib');
  near(t.isha, 15.717, 'Riyadh Isha');
  ok(
    t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr && t.asr < t.maghrib && t.maghrib < t.isha,
    'the times of a day are in order'
  );
  ok(t.isha - t.maghrib === 90 * 60000, 'Umm al-Qura: Isha is 90 minutes after Maghrib outside Ramadan');

  // Ramadan: 120 minutes, when the browser has the Umm al-Qura calendar (a Node without full ICU has not)
  const ram = new Date(Date.UTC(2026, 2, 1, 12));
  let cal = false;
  try {
    cal = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).format(ram) === '9';
  } catch (_) {}
  if (cal) {
    const r = P.times(ram, riyadh);
    ok(r.isha - r.maghrib === 120 * 60000, 'Umm al-Qura: Isha is 120 minutes after Maghrib in Ramadan');
    ok(P.ramadan(ram) === true && P.ramadan(day) === false, 'ramadan() knows Ramadan from other months');
  } else ok(P.ramadan(ram) === false, 'without the Umm al-Qura calendar ramadan() is false and does not throw');

  // another method and the Hanafi Asr
  const mwl = P.times(day, { lat: 24.7136, lon: 46.6753, method: 'mwl' });
  ok(mwl.fajr > t.fajr, 'the Muslim World League (18 degrees) starts Fajr later than Umm al-Qura (18.5)');
  const han = P.times(day, { lat: 24.7136, lon: 46.6753, asr: 'hanafi' });
  ok(han.asr > t.asr && han.asr - t.asr < 90 * 60000, 'the Hanafi Asr is later than the standard Asr');
  ok(P.times(day, { lat: '24.7136', lon: '46.6753' }).dhuhr.getTime() === t.dhuhr.getTime(), 'a place written as text works the same');

  // a place with no usable day, or no place
  ok(P.times(day, { lat: 78, lon: 15 }) === null, 'the polar north gives null instead of wrong times');
  ok(P.times(day, {}) === null && P.times(day, { lat: 'x', lon: 1 }) === null, 'no place gives null');

  // next(): the prayer after a moment, tomorrow's Fajr after Isha
  const before = new Date(t.dhuhr.getTime() - 60000);
  const n1 = P.next(before, riyadh);
  ok(n1.id === 'dhuhr' && n1.at.getTime() === t.dhuhr.getTime(), 'a minute before Dhuhr the next prayer is Dhuhr');
  ok(n1.prev.getTime() === t.fajr.getTime(), 'and the one before it is Fajr');
  const after = new Date(t.isha.getTime() + 60000);
  const n2 = P.next(after, riyadh);
  ok(n2.id === 'fajr' && n2.at > after && n2.at - after < 14 * 3600000, "after Isha the next prayer is tomorrow's Fajr");
  ok(P.next(day, { lat: 80, lon: 0 }) === null, 'next() is null where there are no times');

  // left(): minutes, or hours and minutes
  ok(P.left(25 * 60000) === '25' && P.left(85 * 60000) === '1:25' && P.left(60 * 60000) === '1:00', 'left() writes 25, 1:25 and 1:00');
  ok(P.left(-5000) === '0' && P.left(1) === '1', 'left() rounds up to the minute and never goes below 0');

  // prayerLocal(): what the prayer card and the Sakina screen use instead of asking the service
  const L = sandbox.L;
  const loc = L({ lat: 24.7136, lon: 46.6753, method: '4' });
  ok(
    loc && loc.local === true && ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].every(k => /^\d\d:\d\d$/.test(loc.timings[k])),
    'a card gets the six times of today as HH:MM, in the shape the service gives them'
  );
  ok(L({ lat: 24.7136, lon: 46.6753 }).method === 4, 'a card without a method uses Umm al-Qura (4), as the service does');
  ok(
    L({ lat: 24.7136, lon: 46.6753, method: '3' }).timings.Fajr > loc.timings.Fajr,
    'the method number picks the method (3: the Muslim World League)'
  );
  ok(
    L({ lat: 24.7136, lon: 46.6753, method: '4', source: 'online' }) === null,
    'a card that asks for the online source is left to the service'
  );
  ok(L({ lat: 24.7136, lon: 46.6753, method: '15' }) === null, 'a method only the service has is left to the service');
  ok(L({ lat: 78, lon: 15, method: '4' }) === null, 'a place with no usable day (the far north) is left to the service');
});
