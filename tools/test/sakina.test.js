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
});
