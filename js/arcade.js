/* The room: cabinet attract screens, the coin, the play stage, name entry, and the top 100 crawl. */
(function () {
  'use strict';
  var JB = window.JB, B = JB.board, A = JB.audio, games = JB.games;
  var IDS = ['jetty1', 'jetty2'];
  var STEP = 1 / 60;
  var KNOWN = { 'USE LETTERS AND NUMBERS': 1, 'PICK ANOTHER NAME': 1, 'SCORE NOT ACCEPTED': 1 };
  var KEYS = {
    Space: 'thrust', ArrowUp: 'thrust', KeyW: 'thrust',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'stop', KeyS: 'stop'
  };
  function $(id) { return document.getElementById(id); }

  var screens = {}, rowsTop = {}, notes = {};
  IDS.forEach(function (id) {
    screens[id] = JB.setup($('screen-' + id), games[id].W, games[id].H, 2);
    rowsTop[id] = [];
  });

  var stage = $('stage'), sCanvas = $('stage-canvas'), sBox = $('stage-screen'), sCtx = null, sScale = 0;
  var form = $('name-form'), input = $('name-input'), saveBtn = $('save'), msg = $('entry-msg');
  var after = $('after'), tip = $('tip');
  var mode = 'room', game = null, run = null, acc = 0, boardRows = [];
  var t = 0, last = 0;

  /* Held state from keys and from the pointer, plus one-step pulses so a quick press or a swipe is never missed. */
  var keys = {}, ptr = {}, pulse = {}, tapQ = null, swipe = null;
  function clearInput() { keys = {}; ptr = {}; pulse = {}; tapQ = null; swipe = null; }
  function readInput() {
    return {
      thrust: !!(keys.thrust || ptr.thrust || pulse.thrust),
      left: !!(keys.left || pulse.left),
      right: !!(keys.right || pulse.right),
      stop: !!(keys.stop || pulse.stop),
      tap: tapQ
    };
  }
  /* Which page a cabinet is showing: 0 title, 1 high scores. Matches the games' own attract timing. */
  function attractPage() { return Math.floor(t / 7) % 2; }

  function refreshBoards() {
    IDS.forEach(function (id) {
      B.top(id, 10).then(function (rows) { rowsTop[id] = rows; }).catch(function () { /* keep the last list */ });
    });
  }

  /* ---------- main loop ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now; t += dt;
    if (mode === 'room') {
      IDS.forEach(function (id) {
        var n = notes[id] && notes[id].until > t ? notes[id].text : '';
        games[id].attract(screens[id], t, rowsTop[id], n);
      });
    } else if (mode === 'play') {
      acc += dt;
      var n = 0;
      while (acc >= STEP && n < 6) {
        run.step(readInput());
        pulse = {}; tapQ = null;
        acc -= STEP; n++;
      }
      if (n === 6) { acc = 0; }
      A.jet(run.thrust);
      var ev = run.events.splice(0);
      for (var i = 0; i < ev.length; i++) {
        if (ev[i] === 'over') { A.music(false); A.sfx.over(); }
        else if (A.sfx[ev[i]]) { A.sfx[ev[i]](); }
      }
      /* Draw between the last step and the next one, so motion stays smooth on any display. */
      run.draw(sCtx, t, acc / STEP);
      if (run.over) { toEntry(); }
    } else if (mode === 'entry') {
      run.draw(sCtx, t, 1);
    } else if (mode === 'board') {
      game.scoreScreen(sCtx, t, boardRows, run.score);
    }
  }

  function fitStage() {
    if (stage.hidden || !game) { return; }
    var box = sBox.getBoundingClientRect(), ratio = game.W / game.H;
    var w = Math.max(120, Math.floor(Math.min(box.width, box.height * ratio)));
    sCanvas.style.width = w + 'px';
    sCanvas.style.height = Math.floor(w / ratio) + 'px';
    /* Match the canvas to the real screen pixels so moving edges land on whole pixels. */
    var scale = Math.max(2, Math.min(6, Math.ceil(w * (window.devicePixelRatio || 1) / game.W)));
    if (scale !== sScale || !sCtx) { sScale = scale; sCtx = JB.setup(sCanvas, game.W, game.H, scale); }
  }

  /* ---------- play flow ---------- */
  function start(id) {
    closeCrawl();
    game = games[id];
    A.unlock(); A.sfx.coin();
    sScale = 0; sCtx = null;
    var hi = rowsTop[id][0] ? rowsTop[id][0].score : 0;
    run = game.create((Math.random() * 4294967296) >>> 0, hi);
    acc = 0; clearInput();
    $('stage-title').textContent = game.name;
    tip.textContent = game.tip; tip.hidden = false;
    form.hidden = true; after.hidden = true;
    stage.hidden = false;
    document.body.classList.add('playing');
    mode = 'play';
    fitStage();
    A.music(true, game.id);
  }

  function toEntry() {
    mode = 'entry'; clearInput(); A.jet(false);
    tip.hidden = true;
    fitStage();
    var mine = run;
    setTimeout(function () {
      if (mode !== 'entry' || run !== mine) { return; }
      if (run.score < 1) { showBoard(null); return; }
      var saved = '';
      try { saved = localStorage.getItem('jb_name') || ''; } catch (e) { saved = ''; }
      input.value = B.cleanName(saved);
      msg.textContent = ''; saveBtn.disabled = false;
      form.hidden = false;
      fitStage();
      input.focus();
    }, 900);
  }

  function showBoard(res) {
    form.hidden = true; after.hidden = false;
    mode = 'board'; boardRows = rowsTop[game.id] || [];
    var note = '';
    if (res && !res.saved) { note = 'YOUR BEST OF ' + res.best + ' STAYS ON THE BOARD'; }
    else if (!B.configured) { note = 'DEMO MODE: SCORES STAY ON THIS DEVICE'; }
    tip.textContent = note; tip.hidden = !note;
    var id = game.id;
    B.top(id, 10).then(function (rows) { rowsTop[id] = rows; if (game && game.id === id) { boardRows = rows; } }).catch(function () { /* keep the last list */ });
    fitStage();
    /* No auto-focus on the exit button: a player still tapping Space would leave before seeing the board. */
  }

  function exitStage() {
    A.music(false); A.jet(false); clearInput();
    stage.hidden = true;
    document.body.classList.remove('playing');
    mode = 'room'; run = null; game = null;
    coin.hidden = false; coin.style.transform = '';
    refreshBoards();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (mode !== 'entry' || saveBtn.disabled) { return; }
    var name = B.cleanName(input.value), problem = B.nameProblem(name);
    if (problem) { msg.textContent = problem; return; }
    saveBtn.disabled = true; msg.textContent = 'SAVING...';
    B.submit(game.id, name, run.score).then(function (res) {
      try { localStorage.setItem('jb_name', name); } catch (err) { /* not saved */ }
      msg.textContent = '';
      showBoard(res);
    }).catch(function (err) {
      saveBtn.disabled = false;
      msg.textContent = err && KNOWN[err.message] ? err.message : 'COULD NOT SAVE. TRY AGAIN OR SKIP.';
    });
  });
  input.addEventListener('input', function () {
    var v = input.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 10);
    if (v !== input.value) { input.value = v; }
  });
  $('skip').addEventListener('click', function () { if (mode === 'entry') { showBoard(null); } });
  $('exit').addEventListener('click', exitStage);
  $('quit').addEventListener('click', exitStage);

  /* ---------- game input: one finger does everything ----------
     Hold anywhere = boots. In the sequel, a sideways swipe turns the miner and a
     downward swipe stops it. The finger can stay down while swiping. */
  stage.addEventListener('pointerdown', function (e) {
    if (mode !== 'play' || e.target.closest('button, input, form')) { return; }
    e.preventDefault();
    ptr.thrust = true; pulse.thrust = true;
    if (game.controls === 'swipe') {
      swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
      if (e.target === sCanvas) {
        var r = sCanvas.getBoundingClientRect();
        tapQ = { x: (e.clientX - r.left) / r.width * game.W, y: (e.clientY - r.top) / r.height * game.H };
      }
    }
  });
  window.addEventListener('pointermove', function (e) {
    if (mode !== 'play' || !swipe || e.pointerId !== swipe.id) { return; }
    var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      pulse[dx < 0 ? 'left' : 'right'] = true;
      swipe.x = e.clientX; swipe.y = e.clientY;
    } else if (dy > 34 && dy > Math.abs(dx) * 1.2) {
      pulse.stop = true;
      swipe.x = e.clientX; swipe.y = e.clientY;
    }
  });
  function release() { ptr = {}; swipe = null; }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', function () { keys = {}; ptr = {}; swipe = null; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { keys = {}; ptr = {}; swipe = null; A.jet(false); } });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Escape') {
      if (!crawl.hidden) { closeCrawl(); } else if (!stage.hidden) { exitStage(); }
      return;
    }
    if (mode === 'board' && e.code === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) { exitStage(); return; }
    var k = KEYS[e.code];
    if (mode === 'play' && k) {
      if (e.target && e.target.tagName === 'BUTTON' && e.code === 'Space') { e.target.blur(); }
      e.preventDefault();
      if (!e.repeat) { keys[k] = true; pulse[k] = true; }
    }
  });
  window.addEventListener('keyup', function (e) {
    var k = KEYS[e.code];
    if (k) { keys[k] = false; }
  });
  window.addEventListener('resize', function () { fitStage(); closeCrawl(); });
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', fitStage); }

  /* ---------- coin: drag and drop only ---------- */
  var coin = $('coin'), hint = $('hint'), drag = null, hintTimer = null;
  var cabs = Array.prototype.slice.call(document.querySelectorAll('.cab'));

  function say(text, ms) {
    hint.textContent = text;
    clearTimeout(hintTimer);
    if (ms) { hintTimer = setTimeout(function () { hint.textContent = ''; }, ms); }
  }
  function cabAt(x, y) {
    for (var i = 0; i < cabs.length; i++) {
      var r = cabs[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { return cabs[i]; }
    }
    return null;
  }
  function mark(cab) {
    cabs.forEach(function (c) { c.classList.toggle('is-target', c === cab); });
  }
  var loading = {};
  function loadGame(g) {
    if (!loading[g.id]) {
      loading[g.id] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = g.src;
        s.onload = function () { if (g.create) { resolve(); } else { reject(new Error('no game')); } };
        s.onerror = function () { reject(new Error('load failed')); };
        document.head.appendChild(s);
      });
      loading[g.id].catch(function () { delete loading[g.id]; });
    }
    return loading[g.id];
  }
  function insert(id) {
    var g = games[id];
    if (!g || !g.ready) {
      A.unlock(); A.sfx.nope();
      notes[id] = { text: (g && g.notReady) || 'NOT READY', until: t + 3.5 };
      return;
    }
    coin.hidden = true;
    A.unlock();
    if (g.create) { start(id); return; }
    /* The game code is only fetched now, after a coin went in. */
    loadGame(g).then(function () { start(id); }).catch(function () {
      coin.hidden = false;
      notes[id] = { text: 'MACHINE JAMMED', until: t + 3.5 };
      say('THE MACHINE JAMMED. YOUR COIN IS BACK. TRY AGAIN.', 3500);
    });
  }

  coin.addEventListener('pointerdown', function (e) {
    if (e.button) { return; }
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { coin.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
    coin.classList.remove('is-back');
    coin.classList.add('is-drag');
  });
  coin.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) { return; }
    coin.style.transform = 'translate(' + (e.clientX - drag.x) + 'px,' + (e.clientY - drag.y) + 'px) scale(1.25)';
    mark(cabAt(e.clientX, e.clientY));
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) { return; }
    drag = null;
    mark(null);
    coin.classList.remove('is-drag');
    var cab = e.type === 'pointerup' ? cabAt(e.clientX, e.clientY) : null;
    coin.classList.add('is-back');
    coin.style.transform = '';
    if (cab) { insert(cab.getAttribute('data-game')); }
  }
  coin.addEventListener('pointerup', endDrag);
  coin.addEventListener('pointercancel', endDrag);

  /* ---------- top 100 crawl ----------
     No button. Tap a cabinet's screen while it is showing its high scores and the
     full list rolls up above that machine, shrinking into the distance. It moves
     by itself, and the visitor can drag or wheel through it. A plain tap closes it. */
  var crawl = $('crawl'), crawlText = $('crawl-text'), crawlFor = null;
  var cPos = 0, cMax = 0, cLast = 0, cHold = 0, cDrag = null, cTouched = false, cRaf = 0;
  var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function cell(cls, text) {
    var s = document.createElement('span');
    s.className = cls; s.textContent = text;
    return s;
  }
  function fillCrawl(g, rows) {
    crawlText.textContent = '';
    var h = document.createElement('h2');
    h.textContent = g.name + (g.id === 'jetty2' ? ': SOLE SURVIVOR' : '');
    crawlText.appendChild(h);
    var p = document.createElement('p');
    p.textContent = rows.length ? 'THE TOP ' + rows.length + ' ON RECORD' : 'NO SCORES YET. BE THE FIRST.';
    crawlText.appendChild(p);
    rows.forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'crawl__row' + (r.me ? ' is-me' : '');
      row.appendChild(cell('rank', (i + 1) + '.'));
      row.appendChild(cell('who', r.name));
      row.appendChild(cell('pts', String(r.score)));
      crawlText.appendChild(row);
    });
  }
  function measureCrawl() {
    cMax = crawlText.offsetHeight + crawl.clientHeight * 1.6;
    cPos = Math.max(0, Math.min(cPos, cMax));
  }
  function crawlFrame(now) {
    if (crawl.hidden) { cRaf = 0; return; }
    var dt = Math.min((now - cLast) / 1000, 0.1);
    cLast = now;
    if (!still && !cDrag && now > cHold) {
      cPos += 30 * dt;
      if (cPos >= cMax) {
        cPos = cMax;
        if (!cTouched) { closeCrawl(); return; }
      }
    }
    crawlText.style.transform = 'translateY(' + (-cPos) + 'px)';
    cRaf = requestAnimationFrame(crawlFrame);
  }
  function openCrawl(id, cab) {
    var g = games[id], r = cab.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var w = Math.max(240, Math.min(vw - 16, Math.max(r.width * 1.5, 300), 440));
    var left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
    /* Sits above the machine. On a short screen it borrows a little room from the top of the cabinet. */
    var bottom = Math.max(r.top, 170);
    crawl.style.left = left + 'px'; crawl.style.width = w + 'px';
    crawl.style.top = '4px'; crawl.style.height = (bottom - 4) + 'px';
    crawlFor = id; cTouched = false; cDrag = null; cHold = 0;
    fillCrawl(g, []);
    crawlText.lastChild.textContent = 'LOADING...';
    crawl.hidden = false;
    /* With motion turned off in the visitor's settings, start with the first lines in view and let them scroll by hand. */
    cPos = still ? crawl.clientHeight * 0.75 : 0;
    measureCrawl();
    cLast = performance.now();
    if (!cRaf) { cRaf = requestAnimationFrame(crawlFrame); }
    B.top(id, 100).then(function (rows) {
      if (crawlFor !== id || crawl.hidden) { return; }
      fillCrawl(g, rows);
      measureCrawl();
    }).catch(function () {
      if (crawlFor !== id || crawl.hidden) { return; }
      crawlText.lastChild.textContent = 'THE BOARD COULD NOT BE LOADED. TRY AGAIN SOON.';
      measureCrawl();
    });
  }
  function closeCrawl() {
    crawl.hidden = true; crawlFor = null; cDrag = null;
    crawl.classList.remove('is-drag');
  }
  function nudgeCrawl(by) {
    cPos = Math.max(0, Math.min(cMax, cPos + by));
    cTouched = true; cHold = performance.now() + 2500;
  }
  crawl.addEventListener('wheel', function (e) { e.preventDefault(); nudgeCrawl(e.deltaY * 0.9); }, { passive: false });
  crawl.addEventListener('pointerdown', function (e) {
    if (e.button) { return; }
    e.preventDefault();
    cDrag = { id: e.pointerId, y: e.clientY, pos: cPos, moved: false };
    try { crawl.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
  });
  crawl.addEventListener('pointermove', function (e) {
    if (!cDrag || e.pointerId !== cDrag.id) { return; }
    var dy = e.clientY - cDrag.y;
    if (!cDrag.moved && Math.abs(dy) < 6) { return; }
    cDrag.moved = true; cTouched = true;
    crawl.classList.add('is-drag');
    /* The tilt squeezes distance on screen, so a drag moves the list a bit further than the finger. */
    cPos = Math.max(0, Math.min(cMax, cDrag.pos - dy * 1.7));
  });
  function endCrawlDrag(e) {
    if (!cDrag || e.pointerId !== cDrag.id) { return; }
    var moved = cDrag.moved;
    cDrag = null;
    crawl.classList.remove('is-drag');
    if (moved) { cHold = performance.now() + 2500; } else if (e.type === 'pointerup') { closeCrawl(); }
  }
  crawl.addEventListener('pointerup', endCrawlDrag);
  crawl.addEventListener('pointercancel', endCrawlDrag);
  document.addEventListener('pointerdown', function (e) {
    if (crawl.hidden || crawl.contains(e.target) || (e.target.closest && e.target.closest('.cab__screen'))) { return; }
    closeCrawl();
  });
  cabs.forEach(function (cab) {
    var screen = cab.querySelector('.cab__screen'), id = cab.getAttribute('data-game');
    screen.addEventListener('click', function () {
      if (mode !== 'room') { return; }
      if (!crawl.hidden) { var same = crawlFor === id; closeCrawl(); if (same) { return; } }
      if (attractPage() === 1) { openCrawl(id, cab); }
    });
  });

  /* ---------- sound toggle ---------- */
  var muteBtn = $('mute');
  function paintMute() {
    muteBtn.textContent = A.isMuted() ? 'SOUND OFF' : 'SOUND ON';
    muteBtn.setAttribute('aria-pressed', A.isMuted() ? 'true' : 'false');
  }
  muteBtn.addEventListener('click', function () { A.setMuted(!A.isMuted()); paintMute(); });
  paintMute();

  /* ---------- go ---------- */
  if (document.fonts && document.fonts.load) { document.fonts.load('8px "Press Start 2P"').catch(function () { /* fallback font */ }); }
  refreshBoards();
  requestAnimationFrame(function (now) { last = now; requestAnimationFrame(frame); });
})();
