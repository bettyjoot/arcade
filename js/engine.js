/* Shared helpers: seeded random numbers, pixel drawing, text, sound. */
(function () {
  'use strict';
  var JB = window.JB = window.JB || {};
  var CFG = window.JB_CONFIG || {};
  JB.games = {};
  JB.FONT = '"Press Start 2P", ui-monospace, Menlo, Consolas, monospace';

  /* Seeded generator, so a run can be replayed exactly from its seed. */
  JB.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  JB.setup = function (canvas, W, H, scale) {
    canvas.width = W * scale;
    canvas.height = H * scale;
    var c = canvas.getContext('2d');
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.imageSmoothingEnabled = false;
    c.S = scale;
    return c;
  };

  /* Round a game coordinate to the nearest real screen pixel: smooth motion, crisp edges. */
  JB.snap = function (c, v) { var s = c.S || 1; return Math.round(v * s) / s; };

  JB.text = function (c, str, x, y, size, color, align) {
    c.font = size + 'px ' + JB.FONT;
    c.textAlign = align || 'center';
    c.textBaseline = 'top';
    c.fillStyle = color;
    c.fillText(String(str), x, y);
  };

  /* map: array of strings. color: one color for every filled cell, or an object of char -> color.
     flip mirrors the sprite left to right. */
  JB.sprite = function (c, map, x, y, px, color, flip) {
    var one = typeof color === 'string';
    if (one) { c.fillStyle = color; }
    for (var j = 0; j < map.length; j++) {
      var row = map[j], n = row.length;
      for (var i = 0; i < n; i++) {
        var ch = row.charAt(i);
        if (ch === '.') { continue; }
        if (!one) {
          if (!color[ch]) { continue; }
          c.fillStyle = color[ch];
        }
        c.fillRect(x + (flip ? n - 1 - i : i) * px, y + j * px, px, px);
      }
    }
  };

  /* High score table used by cabinets and the after-game screen. */
  JB.drawScores = function (c, o) {
    var rows = o.rows || [];
    if (!rows.length) {
      JB.text(c, 'NO SCORES YET', o.W / 2, o.y + 30, 7, o.color);
      JB.text(c, 'BE THE FIRST', o.W / 2, o.y + 46, 7, o.dim);
      return;
    }
    for (var i = 0; i < rows.length && i < 10; i++) {
      var y = o.y + i * 16;
      var col = rows[i].me ? o.hi : o.color;
      if (rows[i].me) {
        c.fillStyle = o.band;
        c.fillRect(18, y - 4, o.W - 36, 14);
      }
      JB.text(c, (i + 1) + '.', 46, y, 7, col, 'right');
      JB.text(c, rows[i].name, 56, y, 7, col, 'left');
      JB.text(c, rows[i].score, o.W - 24, y, 7, col, 'right');
    }
  };

  /* ---------- sound ---------- */
  var ac = null, muted = false, noiseBuf = null;
  try { muted = localStorage.getItem('jb_muted') === '1'; } catch (e) { muted = false; }

  function tone(freq, dur, type, slideTo, vol, at) {
    if (muted || !ac) { return; }
    try {
      var o = ac.createOscillator(), g = ac.createGain(), n = at || ac.currentTime;
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, n);
      if (slideTo) { o.frequency.exponentialRampToValueAtTime(slideTo, n + dur); }
      g.gain.setValueAtTime(vol || 0.05, n);
      g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(n); o.stop(n + dur + 0.02);
    } catch (e) { /* sound is optional */ }
  }
  function getNoise() {
    if (!noiseBuf && ac) {
      var len = ac.sampleRate;
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
    }
    return noiseBuf;
  }
  /* One burst of filtered noise: explosions, shotgun, flame hiss. */
  function noise(dur, freq, vol, slideTo) {
    if (muted || !ac) { return; }
    try {
      var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), n = ac.currentTime;
      src.buffer = getNoise();
      f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(freq, n);
      if (slideTo) { f.frequency.exponentialRampToValueAtTime(slideTo, n + dur); }
      g.gain.setValueAtTime(vol, n);
      g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
      src.connect(f); f.connect(g); g.connect(ac.destination);
      src.start(n, Math.random() * 0.5); src.stop(n + dur + 0.02);
    } catch (e) { /* sound is optional */ }
  }

  /* Music: the site owner's own files, one per game, set as `music` in js/config.js.
     The file is decoded into memory and looped by the audio engine itself, sample
     for sample, so there is no gap when it comes back around.
     An entry is a file name, or { src, loop, lead } for a compressed file:
       loop = exact length of the music in seconds
       lead = how far into the original recording its first note sounds
     MP3 decoders may or may not add a little silence in front. Finding the first
     note in the decoded audio and lining it up with `lead` gives the true start,
     so the loop is the same length in every browser. */
  var tunes = {}, tuneSrc = null, tuneGain = null, tuneUrl = '', tuneInfo = null;
  function musicEntry(id) {
    var m = CFG.music, e = !m ? '' : (typeof m === 'string' ? m : (m[id] || ''));
    if (!e) { return null; }
    return typeof e === 'string' ? { src: e } : (e.src ? e : null);
  }
  function loopPoints(buf, info) {
    if (!info || !(info.loop > 0)) { return null; }
    var d = buf.getChannelData(0), n = d.length, peak = 0, i, v;
    for (i = 0; i < n; i++) { v = d[i] < 0 ? -d[i] : d[i]; if (v > peak) { peak = v; } }
    if (!(peak > 0)) { return null; }
    var th = peak * 0.05, first = 0;
    for (i = 0; i < n; i++) { v = d[i] < 0 ? -d[i] : d[i]; if (v > th) { first = i; break; } }
    var start = Math.max(0, first / buf.sampleRate - (info.lead || 0));
    var end = Math.min(buf.duration, start + info.loop);
    return end - start > 1 ? { start: start, end: end } : null;
  }
  function loadTune(url) {
    if (!tunes[url]) {
      tunes[url] = fetch(url).then(function (r) {
        if (!r.ok) { throw new Error('music not found'); }
        return r.arrayBuffer();
      }).then(function (data) {
        return new Promise(function (resolve, reject) { ac.decodeAudioData(data, resolve, reject); });
      });
      tunes[url].catch(function () { delete tunes[url]; });
    }
    return tunes[url];
  }
  function stopTune() {
    if (tuneSrc) {
      try { tuneSrc.stop(); } catch (e) { /* already stopped */ }
      try { tuneSrc.disconnect(); } catch (e2) { /* already gone */ }
      tuneSrc = null;
    }
  }
  function startTune() {
    var url = tuneUrl, info = tuneInfo;
    if (!url || muted || !ac || tuneSrc) { return; }
    loadTune(url).then(function (buf) {
      if (tuneUrl !== url || muted || tuneSrc) { return; }
      var pts = loopPoints(buf, info);
      if (!tuneGain) { tuneGain = ac.createGain(); tuneGain.connect(ac.destination); }
      var base = typeof CFG.musicVolume === 'number' ? CFG.musicVolume : 0.5;
      var own = info && typeof info.volume === 'number' ? info.volume : 1;
      tuneGain.gain.value = Math.max(0, Math.min(1, base * own));
      var src = ac.createBufferSource();
      src.buffer = buf; src.loop = true;
      if (pts) { src.loopStart = pts.start; src.loopEnd = pts.end; }
      src.connect(tuneGain); src.start(0, pts ? pts.start : 0);
      tuneSrc = src;
    }).catch(function () { /* missing or unreadable file: play without music */ });
  }

  /* Jet whoosh: looping filtered noise that swells while the boots are thrusting. */
  var jetGain = null, jetFilter = null, jetOn = false;
  function ensureJet() {
    if (jetGain || !ac) { return; }
    try {
      var src = ac.createBufferSource();
      src.buffer = getNoise(); src.loop = true;
      jetFilter = ac.createBiquadFilter();
      jetFilter.type = 'bandpass'; jetFilter.frequency.value = 500; jetFilter.Q.value = 0.7;
      jetGain = ac.createGain();
      jetGain.gain.value = 0;
      src.connect(jetFilter); jetFilter.connect(jetGain); jetGain.connect(ac.destination);
      src.start();
    } catch (e) { jetGain = null; }
  }
  function jet(on) {
    on = !!on && !muted;
    if (!ac || on === jetOn) { return; }
    ensureJet();
    if (!jetGain) { return; }
    jetOn = on;
    var n = ac.currentTime;
    jetGain.gain.cancelScheduledValues(n);
    jetGain.gain.setTargetAtTime(on ? 0.16 : 0, n, on ? 0.04 : 0.09);
    jetFilter.frequency.cancelScheduledValues(n);
    jetFilter.frequency.setTargetAtTime(on ? 1500 : 500, n, on ? 0.25 : 0.1);
  }

  JB.audio = {
    jet: jet,
    unlock: function () {
      if (!ac) {
        try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
      }
      if (ac && ac.state === 'suspended') { ac.resume(); }
    },
    isMuted: function () { return muted; },
    setMuted: function (m) {
      if (m) { jet(false); stopTune(); }
      muted = !!m;
      if (!muted) { startTune(); }
      try { localStorage.setItem('jb_muted', muted ? '1' : '0'); } catch (e) { /* not saved */ }
    },
    /* music(true, gameId) starts that game's loop; music(false) stops it. */
    music: function (on, id) {
      stopTune();
      tuneInfo = on ? musicEntry(id) : null;
      tuneUrl = tuneInfo ? tuneInfo.src : '';
      if (tuneUrl) { startTune(); }
    },
    sfx: {
      coin: function () { tone(988, 0.08, 'square', null, 0.05); if (ac) { tone(1319, 0.3, 'square', null, 0.05, ac.currentTime + 0.08); } },
      point: function () { tone(880, 0.07, 'square', 1175, 0.05); },
      hit: function () { tone(200, 0.35, 'sawtooth', 50, 0.07); noise(0.3, 900, 0.12, 200); },
      level: function () {
        if (!ac) { return; }
        var n = ac.currentTime;
        tone(523, 0.1, 'square', null, 0.05, n); tone(659, 0.1, 'square', null, 0.05, n + 0.1); tone(784, 0.22, 'square', null, 0.05, n + 0.2);
      },
      over: function () {
        if (!ac) { return; }
        var n = ac.currentTime;
        tone(392, 0.18, 'square', null, 0.05, n); tone(330, 0.18, 'square', null, 0.05, n + 0.18); tone(262, 0.4, 'square', 131, 0.05, n + 0.36);
      },
      nope: function () { tone(150, 0.18, 'square', 110, 0.05); },
      life: function () {
        if (!ac) { return; }
        var n = ac.currentTime;
        tone(659, 0.09, 'square', null, 0.05, n); tone(880, 0.09, 'square', null, 0.05, n + 0.09); tone(1319, 0.3, 'square', null, 0.05, n + 0.18);
      },
      power: function () { tone(440, 0.1, 'sawtooth', 880, 0.05); if (ac) { tone(880, 0.2, 'square', 1760, 0.04, ac.currentTime + 0.1); } },
      pick: function () { tone(660, 0.05, 'square', null, 0.04); },
      zap: function () { tone(1400, 0.07, 'sawtooth', 500, 0.03); },
      launch: function () { noise(0.3, 500, 0.1, 1800); tone(160, 0.2, 'sawtooth', 320, 0.04); },
      boom: function () { noise(0.5, 700, 0.22, 90); tone(110, 0.4, 'sine', 40, 0.12); },
      blast: function () { noise(0.2, 1400, 0.2, 300); tone(140, 0.12, 'square', 60, 0.06); },
      hiss: function () { noise(0.16, 2400, 0.07, 1200); },
      squish: function () { tone(420, 0.1, 'square', 120, 0.05); noise(0.08, 1800, 0.06); },
      spit: function () { tone(300, 0.12, 'triangle', 620, 0.04); }
    }
  };
})();
