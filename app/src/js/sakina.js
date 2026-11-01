/* Sakina: an idle screen with local adhkar and prayer times from the configured prayer card. */
var SAKINA_OPEN = false, SAKINA_IDLE = 0, SAKINA_INDEX = 0, SAKINA_COUNT = 0, SAKINA_LAST_SOUND = '';
function sakinaPrayerCard() {
  var cards = cfg && cfg.cards || {};
  for (var k in cards) if (cards[k] && cards[k].type === 'prayer') return cards[k];
  return null;
}
function sakinaDhikrCard() {
  var cards = cfg && cfg.cards || {};
  for (var k in cards) if (cards[k] && cards[k].type === 'adhkar') return cards[k];
  return null;
}
function sakinaAudio(url, volume) {
  if (!url || !/^https:\/\//i.test(url)) return;
  try {
    if (window.SAKINA_AUDIO) { window.SAKINA_AUDIO.pause(); window.SAKINA_AUDIO = null; }
    window.SAKINA_AUDIO = new Audio(url);
    window.SAKINA_AUDIO.volume = Math.max(0, Math.min(1, Number(volume) || 0.8));
    var playing = window.SAKINA_AUDIO.play();
    if (playing && playing.catch) playing.catch(function () {});
  } catch (e) {}
}
function sakinaPrayerMarkup() {
  var p = sakinaPrayerCard(), data = p && prayerFor(p), next = prayerNext(data);
  var el = document.getElementById('sakina-times');
  if (!el) return;
  if (!p || p.lat === undefined || p.lon === undefined) { el.textContent = t('Set up prayer times in Customise > Cards.'); return; }
  if (!data || !data.timings) { el.textContent = t('Prayer times unavailable.'); return; }
  var now = new Date(), rows = [['Fajr', data.timings.Fajr], ['Dhuhr', data.timings.Dhuhr], ['Asr', data.timings.Asr], ['Maghrib', data.timings.Maghrib], ['Isha', data.timings.Isha]];
  el.innerHTML = '';
  rows.forEach(function (r) {
    var row = document.createElement('div'), name = document.createElement('span'), time = document.createElement('b');
    row.className = 'sakina-row' + (next && r[1] === next.time ? ' next' : '');
    name.textContent = t(r[0]); time.textContent = r[1]; row.appendChild(name); row.appendChild(time); el.appendChild(row);
  });
  var n = document.getElementById('sakina-next');
  if (n && next) {
    var mins = Math.max(0, Math.floor((next.at.getTime() - now.getTime()) / 60000));
    n.textContent = t('Next prayer') + ' · ' + next.name + ' · ' + next.time + ' · ' + mins + ' ' + t('min left');
  }
  if (p.sound === 'auto' && p.audio) {
    rows.some(function (r) {
      var hm = String(r[1] || '').split(':');
      if (hm.length !== 2) return false;
      if (now.getHours() === +hm[0] && now.getMinutes() === +hm[1]) {
        var key = now.toDateString() + r[0];
        if (key !== SAKINA_LAST_SOUND) { SAKINA_LAST_SOUND = key; sakinaAudio(p.audio, p.volume); }
        return true;
      }
      return false;
    });
  }
}
function sakinaDraw() {
  var item = ADHKAR_ITEMS[SAKINA_INDEX % ADHKAR_ITEMS.length];
  var text = document.getElementById('sakina-dhikr'), meta = document.getElementById('sakina-source');
  if (text) text.textContent = item.text;
  if (meta) meta.textContent = SAKINA_COUNT + ' / ' + item.count + ' ×  ·  ' + item.source;
  var title = document.getElementById('sakina-dhikr-title');
  if (title) title.textContent = t('Daily adhkar');
  var kicker = document.querySelector('.sakina-prayer .sakina-kicker');
  if (kicker) kicker.textContent = t('Prayer times');
  var hint = document.getElementById('sakina-hint');
  if (hint) hint.textContent = t('Arrows change dhikr · OK counts · Up plays or pauses audio · Back to leave');
  var date = document.getElementById('sakina-date');
  if (date) date.textContent = dateText();
  var play = document.getElementById('sakina-play'), p = sakinaPrayerCard();
  if (play) { play.textContent = t('Play recitation'); play.style.display = p && p.audio && p.sound !== 'off' ? 'inline-block' : 'none'; }
  sakinaPrayerMarkup();
}
function sakinaShow() {
  if (document.hidden || LIVE.on || stack.length) return;
  var el = document.getElementById('sakina-screen');
  if (!el) return;
  SAKINA_OPEN = true;
  el.className = 'sakina-screen open';
  document.body.classList.add('sakina-open');
  sakinaDraw();
}
function sakinaHide() {
  SAKINA_OPEN = false;
  document.body.classList.remove('sakina-open');
  var el = document.getElementById('sakina-screen');
  if (el) el.className = 'sakina-screen';
  if (window.SAKINA_AUDIO) { try { window.SAKINA_AUDIO.pause(); } catch (e) {} }
  sakinaWake();
}
function sakinaWake() {
  clearTimeout(SAKINA_IDLE);
  if (SAKINA_OPEN) sakinaHide();
  SAKINA_IDLE = setTimeout(sakinaShow, 180000);
}
document.addEventListener('keydown', function (e) {
  if (SAKINA_OPEN) {
    var k = e.keyCode;
    e.preventDefault(); e.stopPropagation();
    if (k === 461 || k === 27 || k === 8) { sakinaHide(); return; }
    if (k === 13) {
      SAKINA_COUNT = Math.min(ADHKAR_ITEMS[SAKINA_INDEX].count, SAKINA_COUNT + 1);
      sakinaDraw();
    } else if (k === 37 || k === 39) {
      SAKINA_INDEX = (SAKINA_INDEX + 1) % ADHKAR_ITEMS.length;
      SAKINA_COUNT = 0;
      sakinaDraw();
    } else if (k === 38 || k === 40 || k === 403) {
      var p = sakinaPrayerCard();
      if (window.SAKINA_AUDIO && !window.SAKINA_AUDIO.paused) window.SAKINA_AUDIO.pause();
      else if (p && p.audio && p.sound !== 'off') sakinaAudio(p.audio, p.volume);
    }
    return;
  }
  sakinaWake();
}, true);
document.addEventListener('mousedown', function () { if (!SAKINA_OPEN) sakinaWake(); }, true);
document.addEventListener('mousemove', function () { if (!SAKINA_OPEN) sakinaWake(); }, true);
document.addEventListener('visibilitychange', function () { if (document.hidden) sakinaHide(); else sakinaWake(); });
setInterval(function () { if (SAKINA_OPEN) sakinaDraw(); }, 30000);
var sakinaPlay = document.getElementById('sakina-play');
if (sakinaPlay) sakinaPlay.addEventListener('click', function (e) {
  e.stopPropagation();
  var p = sakinaPrayerCard();
  if (p && p.audio) sakinaAudio(p.audio);
});
sakinaWake();
