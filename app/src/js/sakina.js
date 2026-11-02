/* Sakina: an idle screen with local adhkar and prayer times from the configured prayer card. */
var SAKINA_OPEN = false,
  SAKINA_IDLE = 0,
  SAKINA_INDEX = 0,
  SAKINA_COUNT = 0,
  SAKINA_LAST_SOUND = '';
/* the idle time before the Sakina screen: cfg.sakina.mins is 1, 3, 5 or 10 (0: never); 3 minutes when nothing is set */
function sakinaIdleMs(c) {
  var m = c && c.sakina && typeof c.sakina.mins === 'number' ? c.sakina.mins : 3;
  return m > 0 ? m * 60000 : 0;
}
function sakinaArm() {
  var ms = sakinaIdleMs(typeof cfg === 'undefined' ? null : cfg);
  SAKINA_IDLE = ms ? setTimeout(sakinaShow, ms) : 0;
}
/* today in the Islamic calendar (Umm al-Qura), in the launcher's language; '' where the browser has no such calendar */
function sakinaHijri() {
  try {
    return new Date().toLocaleDateString(String(LOC).split('-u-')[0] + '-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch (e) {
    return '';
  }
}
function sakinaPrayerCard() {
  var cards = (cfg && cfg.cards) || {};
  for (var k in cards) if (cards[k] && cards[k].type === 'prayer') return cards[k];
  return null;
}
function sakinaDhikrCard() {
  var cards = (cfg && cfg.cards) || {};
  for (var k in cards) if (cards[k] && cards[k].type === 'adhkar') return cards[k];
  return null;
}
function sakinaAudio(url, volume) {
  if (!url || !/^https:\/\//i.test(url)) return;
  try {
    if (window.SAKINA_AUDIO) {
      window.SAKINA_AUDIO.pause();
      window.SAKINA_AUDIO = null;
    }
    window.SAKINA_AUDIO = new Audio(url);
    window.SAKINA_AUDIO.volume = Math.max(0, Math.min(1, Number(volume) || 0.8));
    window.SAKINA_AUDIO.onerror = sakinaAudioFailed;
    var playing = window.SAKINA_AUDIO.play();
    if (playing && playing.catch) playing.catch(sakinaAudioFailed);
  } catch (e) {
    sakinaAudioFailed();
  }
}
/* a link that does not play (not found, not audio, blocked): said on screen and written to the service log (Share log) */
function sakinaAudioFailed() {
  toast(t('The audio could not be played. Check the link.'), true);
  logLine('sakina audio could not be played');
}
/* the adhan: at the minute of a prayer, once for each prayer of a day (kept across a restart of the launcher). rows: [[name, 'HH:MM'], ...] */
function sakinaAdhanCheck(p, rows, now) {
  rows.some(function (r) {
    var hm = String(r[1] || '').split(':');
    if (hm.length !== 2 || now.getHours() !== +hm[0] || now.getMinutes() !== +hm[1]) return false;
    var key = now.toDateString() + r[0],
      done = SAKINA_LAST_SOUND;
    try {
      done = done || localStorage.getItem('sakina.adhan') || '';
    } catch (e) {}
    if (key !== done) {
      SAKINA_LAST_SOUND = key;
      try {
        localStorage.setItem('sakina.adhan', key);
      } catch (e) {}
      sakinaAudio(p.audio, p.volume);
    }
    return true;
  });
}
/* the adhan also plays while Home is showing and Sakina is not open (it is checked while Sakina is open by sakinaDraw); not while the
   launcher is hidden behind another app, where a page cannot be sure to run */
function sakinaAdhanTick() {
  var p = sakinaPrayerCard();
  if (!p || p.sound !== 'auto' || !p.audio || SAKINA_OPEN || document.hidden) return;
  var data = prayerFor(p);
  if (!data || !data.timings) return;
  sakinaAdhanCheck(
    p,
    ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(function (k) {
      return [k, data.timings[k]];
    }),
    new Date()
  );
}
setInterval(sakinaAdhanTick, 15000);
function sakinaPrayerMarkup() {
  var p = sakinaPrayerCard(),
    data = p && prayerFor(p),
    next = prayerNext(data);
  var el = document.getElementById('sakina-times');
  if (!el) return;
  var place = document.getElementById('sakina-place');
  if (place) place.textContent = p && p.place ? p.place : '';
  if (!p || p.lat === undefined || p.lon === undefined) {
    el.textContent = t('Set up prayer times in Customise > Cards.');
    return;
  }
  if (!data || !data.timings) {
    el.textContent = t('Prayer times unavailable.');
    return;
  }
  var now = new Date(),
    rows = [
      ['Fajr', data.timings.Fajr],
      ['Dhuhr', data.timings.Dhuhr],
      ['Asr', data.timings.Asr],
      ['Maghrib', data.timings.Maghrib],
      ['Isha', data.timings.Isha],
    ];
  el.innerHTML = '';
  /* the Sunrise row is shown but never counts as a prayer: not the next one, and no audio */
  var shown = rows.slice();
  if (data.timings.Sunrise) shown.splice(1, 0, ['Sunrise', data.timings.Sunrise]);
  shown.forEach(function (r) {
    var row = document.createElement('div'),
      name = document.createElement('span'),
      time = document.createElement('b');
    row.className = 'sakina-row' + (r[0] === 'Sunrise' ? ' sun' : next && r[1] === next.time ? ' next' : '');
    name.textContent = t(r[0]);
    time.textContent = r[1];
    row.appendChild(name);
    row.appendChild(time);
    el.appendChild(row);
  });
  var n = document.getElementById('sakina-next');
  if (n && next) {
    n.textContent = t('Next prayer') + ' · ' + next.name + ' · ' + next.time + ' · ' + prayerRemain(next.at.getTime() - now.getTime());
  }
  if (p.sound === 'auto' && p.audio) sakinaAdhanCheck(p, rows, now);
}
function sakinaDraw() {
  var item = ADHKAR_ITEMS[SAKINA_INDEX % ADHKAR_ITEMS.length];
  var text = document.getElementById('sakina-dhikr'),
    meta = document.getElementById('sakina-source');
  if (text) text.textContent = item.text;
  if (meta) meta.textContent = SAKINA_COUNT + ' / ' + item.count + ' ×  ·  ' + item.source;
  var title = document.getElementById('sakina-dhikr-title');
  if (title) title.textContent = t('Daily adhkar');
  var kicker = document.querySelector('.sakina-prayer .sakina-kicker');
  if (kicker) kicker.textContent = t('Prayer times');
  var hint = document.getElementById('sakina-hint');
  if (hint) hint.textContent = t('Arrows change dhikr · OK counts · Up/Down/Blue plays or pauses audio · Back to leave');
  var date = document.getElementById('sakina-date'),
    hijri = sakinaHijri(),
    dtext = dateText() + (hijri ? '  \u00B7  ' + hijri : ''),
    clock = document.getElementById('sakina-time');
  if (date && date.textContent !== dtext) date.textContent = dtext;
  if (clock && clock.textContent !== timeText()) clock.textContent = timeText();
  var play = document.getElementById('sakina-play'),
    p = sakinaPrayerCard();
  if (play) {
    play.textContent = t('Play recitation');
    play.style.display = p && p.audio && p.sound !== 'off' ? 'inline-block' : 'none';
  }
  sakinaPrayerMarkup();
}
function sakinaShow(force) {
  /* The launcher can remain visibly on screen while webOS reports document.hidden.
     The visibilitychange handler already hides Sakina when the launcher actually leaves.
     force (Customise > Sakina screen > Try it now) shows it over an open menu too. */
  if (force !== true && (LIVE.on || stack.length)) {
    sakinaArm();
    return;
  }
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
  if (window.SAKINA_AUDIO) {
    try {
      window.SAKINA_AUDIO.pause();
    } catch (e) {}
  }
  sakinaWake();
}
function sakinaWake() {
  clearTimeout(SAKINA_IDLE);
  if (SAKINA_OPEN) sakinaHide();
  sakinaArm();
}
document.addEventListener(
  'keydown',
  function (e) {
    if (!SAKINA_OPEN) {
      sakinaWake();
      return;
    }
    var k = e.keyCode;
    if (k === 461 || k === 27 || k === 8) {
      e.preventDefault();
      e.stopPropagation();
      sakinaHide();
      return;
    }
    if (k === 13) {
      e.preventDefault();
      e.stopPropagation();
      SAKINA_COUNT = Math.min(ADHKAR_ITEMS[SAKINA_INDEX].count, SAKINA_COUNT + 1);
      sakinaDraw();
    } else if (k === 37 || k === 39) {
      e.preventDefault();
      e.stopPropagation();
      SAKINA_INDEX = (SAKINA_INDEX + 1) % ADHKAR_ITEMS.length;
      SAKINA_COUNT = 0;
      sakinaDraw();
    } else if (k === 38 || k === 40 || k === 403) {
      e.preventDefault();
      e.stopPropagation();
      var p = sakinaPrayerCard();
      if (window.SAKINA_AUDIO && !window.SAKINA_AUDIO.paused) window.SAKINA_AUDIO.pause();
      else if (p && p.audio && p.sound !== 'off') sakinaAudio(p.audio, p.volume);
    } else sakinaHide();
  },
  true
);
document.addEventListener(
  'mousedown',
  function () {
    if (!SAKINA_OPEN) sakinaWake();
  },
  true
);
var sakinaPointerX = null,
  sakinaPointerY = null;
document.addEventListener(
  'mousemove',
  function (e) {
    /* Ignore tiny pointer jitter from the Magic Remote; it must not keep resetting the idle timer. */
    if (sakinaPointerX !== null && Math.abs(e.clientX - sakinaPointerX) + Math.abs(e.clientY - sakinaPointerY) < 18) return;
    sakinaPointerX = e.clientX;
    sakinaPointerY = e.clientY;
    if (!SAKINA_OPEN) sakinaWake();
  },
  true
);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) sakinaHide();
  else sakinaWake();
});
setInterval(function () {
  if (SAKINA_OPEN) sakinaDraw();
}, 30000);
var sakinaPlay = document.getElementById('sakina-play');
if (sakinaPlay)
  sakinaPlay.addEventListener('click', function (e) {
    e.stopPropagation();
    var p = sakinaPrayerCard();
    if (p && p.audio) sakinaAudio(p.audio, p.volume);
  });
sakinaWake();
