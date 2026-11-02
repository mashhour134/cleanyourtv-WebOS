// The Sakina screen (app/src/js/sakina.js): sakinaIdleMs() turns the setting (Customise > Sakina screen) into the idle time. sakina.js
// starts listeners when it loads, so the function is cut out of it as it is. The page markup and the background are checked too.
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { root, ok, run } = require('./lib');

// the source of one top-level function, from "function name(" to its closing brace
function source(js, name) {
  const start = js.indexOf('function ' + name + '(');
  if (start < 0) return '';
  let depth = 0;
  for (let i = js.indexOf('{', start); i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}' && --depth === 0) return js.slice(start, i + 1);
  }
  return '';
}

run(async () => {
  const js = fs.readFileSync(path.join(root, 'app', 'src', 'js', 'sakina.js'), 'utf8'),
    sb = {};
  vm.runInNewContext(source(js, 'sakinaIdleMs') + '\nthis.f = sakinaIdleMs;', sb, { filename: 'sakinaIdleMs' });
  const f = sb.f;
  ok(f({}) === 180000 && f(null) === 180000 && f({ sakina: {} }) === 180000, 'nothing set: three minutes, as before');
  ok(
    f({ sakina: { mins: 1 } }) === 60000 && f({ sakina: { mins: 5 } }) === 300000 && f({ sakina: { mins: 10 } }) === 600000,
    '1, 5 and 10 minutes'
  );
  ok(f({ sakina: { mins: 0 } }) === 0, '0 means never (no timer is started)');
  ok(f({ sakina: { mins: 'x' } }) === 180000, 'a value that is not a number falls back to three minutes');

  // the moving background is in the page, and the script keeps the earlier fixes: no restart while a menu or Live TV is open, and the
  // small pointer movements of the Magic Remote do not count as use
  const css = fs.readFileSync(path.join(root, 'app', 'src', 'css', 'home.css'), 'utf8'),
    html = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
  ok(
    /class="sk-bg"><div class="sk-pat"><\/div><div class="sk-glow">/.test(html),
    'the built page has the background layers inside the Sakina screen'
  );
  const anim = (css.match(/@keyframes sakina(Drift|Breath)\s*\{[\s\S]*?\n\}/g) || []).join('\n');
  ok(anim && !/(top|left|width|height|margin|background)\s*:/.test(anim), 'the background animates only transform and opacity');
  ok(
    /\.sk-pat \{[^}]*background-image: url\("data:image\/svg\+xml,%3Csvg[^"]*%3C\/svg%3E"\)/.test(css),
    'the star pattern is an inline SVG image (a data: address, not a file that is not there)'
  );
  ok(
    /LIVE\.on \|\| stack\.length/.test(js) && /< 18/.test(js),
    'the idle guards stay: not over Live TV or a menu, and pointer jitter is ignored'
  );

  // the time left: hours and minutes (not "368 minutes"), in the launcher's language, with the plural forms of the language
  const cards = fs.readFileSync(path.join(root, 'app', 'src', 'js', 'cards.js'), 'utf8'),
    runtime = fs.readFileSync(path.join(root, 'i18n', 'runtime.js'), 'utf8'),
    I18N = {};
  for (const l of ['en', 'ar']) {
    I18N[l] = JSON.parse(fs.readFileSync(path.join(root, 'i18n', l + '.json'), 'utf8'));
    I18N[l]._name = l;
  }
  const remain = lang => {
    const box = { window: {}, navigator: { language: lang }, document: { documentElement: {} }, I18N, Intl };
    vm.runInNewContext(runtime + '\n' + source(cards, 'prayerRemain') + '\nsetLang("' + lang + '"); this.f = prayerRemain;', box, {
      filename: 'prayerRemain',
    });
    return mins => box.f(mins * 60000);
  };
  const ar = remain('ar'),
    en = remain('en');
  ok(ar(368) === '6 ساعات و8 دقائق متبقية', 'Arabic: 368 minutes read "6 ساعات و8 دقائق متبقية" (got ' + ar(368) + ')');
  ok(ar(120) === '2 ساعتان متبقية' && ar(60) === '1 ساعة متبقية', 'Arabic: whole hours have their own forms (ساعتان, ساعة)');
  ok(
    ar(61) === '1 ساعة و1 دقيقة متبقية' && ar(42) === '42 دقيقة متبقية',
    'Arabic: one hour and one minute, and under an hour only minutes'
  );
  ok(
    en(368) === '6 hours and 8 minutes remaining' && en(61) === '1 hour and 1 minute remaining',
    'English: hours and minutes with singular and plural'
  );
  ok(en(42) === '42 min left' && en(0) === '0 min left', 'English: under an hour it stays "42 min left"');

  // the adhan: once for each prayer of a day, kept across a restart of the launcher, and an unknown or empty time never plays
  const store = {};
  const adhan = () => {
    const box = {
      SAKINA_LAST_SOUND: '',
      plays: [],
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = v) },
      sakinaAudio: (u, v) => box.plays.push(u + '@' + v),
    };
    vm.runInNewContext(source(js, 'sakinaAdhanCheck') + '\nthis.f = sakinaAdhanCheck;', box, { filename: 'sakinaAdhanCheck' });
    return box;
  };
  const rows = [
    ['Fajr', '04:41'],
    ['Dhuhr', '11:37'],
    ['Isha', ''],
  ];
  const card = { audio: 'https://example.test/a.mp3', volume: '0.6' };
  let a = adhan();
  a.f(card, rows, new Date(2026, 10, 2, 4, 40, 30));
  ok(a.plays.length === 0, 'a minute before the prayer: nothing plays');
  a.f(card, rows, new Date(2026, 10, 2, 4, 41, 5));
  a.f(card, rows, new Date(2026, 10, 2, 4, 41, 50));
  ok(a.plays.length === 1 && a.plays[0] === 'https://example.test/a.mp3@0.6', 'at the minute of Fajr it plays once, with the card volume');
  a = adhan(); // the launcher restarted within the same minute
  a.f(card, rows, new Date(2026, 10, 2, 4, 41, 59));
  ok(a.plays.length === 0, 'after a restart in the same minute it does not play again');
  a.f(card, rows, new Date(2026, 10, 2, 11, 37, 2));
  ok(a.plays.length === 1, 'the next prayer plays');
  a.f(card, rows, new Date(2026, 10, 3, 4, 41, 2));
  ok(a.plays.length === 2, 'and the same prayer the next day plays again');
  a.f(card, [['Isha', '']], new Date(2026, 10, 3, 0, 0, 0));
  ok(a.plays.length === 2, 'an empty prayer time never plays');
});
