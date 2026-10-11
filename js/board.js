/*
 * Leaderboards. One board per game, one best score per player per game.
 * With Firebase configured, scores live in Firestore under
 *   boards/{game}/scores/{uid}
 * and firestore.rules is what enforces every limit. The checks in this file
 * are for a friendly experience only: anyone can bypass browser code, so
 * nothing here is trusted by the database.
 * Without Firebase config the page runs in demo mode (this browser only).
 */
(function () {
  'use strict';
  var JB = window.JB = window.JB || {};
  var CFG = window.JB_CONFIG || {};
  var CAPS = { jetty1: 5000, jetty2: 999999 };
  var NAME_RE = /^[A-Z0-9 _-]{1,10}$/;
  var BLOCK = ['FUCK', 'SHIT', 'CUNT', 'BITCH', 'DICK', 'COCK', 'PUSSY', 'RAPE', 'NAZI', 'HITLER'];
  var DEMO = {
    jetty1: [['GRANITE', 64], ['PICKAXE', 51], ['LANTERN', 43], ['OREHOUND', 37], ['DUSTY', 30],
             ['COBALT', 24], ['SHALE', 19], ['FLINT', 14], ['QUARTZ', 9], ['BASALT', 5]],
    jetty2: [['GRANITE', 9200], ['PICKAXE', 7450], ['LANTERN', 6100], ['OREHOUND', 4800], ['DUSTY', 3650],
             ['COBALT', 2900], ['SHALE', 2100], ['FLINT', 1500], ['QUARTZ', 900], ['BASALT', 400]]
  };
  var configured = !!(CFG.firebase && CFG.firebase.apiKey && CFG.firebase.projectId);
  var fbReady = null, cache = {};

  function cleanName(raw) {
    return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9 _-]/g, '')
      .replace(/\s+/g, ' ').trim().slice(0, 10).trim();
  }
  function nameProblem(name) {
    if (!NAME_RE.test(name) || !/[A-Z0-9]/.test(name)) { return 'USE LETTERS AND NUMBERS'; }
    var flat = name.replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I')
      .replace(/3/g, 'E').replace(/4/g, 'A').replace(/5/g, 'S').replace(/7/g, 'T');
    for (var i = 0; i < BLOCK.length; i++) {
      if (flat.indexOf(BLOCK[i]) >= 0) { return 'PICK ANOTHER NAME'; }
    }
    return '';
  }
  function validRow(r) {
    return !!r && typeof r.name === 'string' && NAME_RE.test(r.name) &&
      Number.isInteger(r.score) && r.score >= 1;
  }
  function validScore(game, score) {
    return Object.prototype.hasOwnProperty.call(CAPS, game) &&
      Number.isInteger(score) && score >= 1 && score <= CAPS[game];
  }

  /* ---------- demo mode ---------- */
  function demoMine(game) {
    try {
      var r = JSON.parse(localStorage.getItem('jb_demo_v1_' + game));
      return validRow(r) ? { name: r.name, score: r.score, me: true } : null;
    } catch (e) { return null; }
  }
  function demoTop(game, n) {
    var rows = (DEMO[game] || []).map(function (d) { return { name: d[0], score: d[1], demo: true }; });
    var mine = demoMine(game);
    if (mine) { rows.push(mine); }
    rows.sort(function (a, b) { return b.score - a.score; });
    return rows.slice(0, n);
  }
  function demoSubmit(game, name, score) {
    var mine = demoMine(game);
    if (mine && mine.score >= score) { return { saved: false, best: mine.score }; }
    try { localStorage.setItem('jb_demo_v1_' + game, JSON.stringify({ name: name, score: score })); } catch (e) { /* not saved */ }
    return { saved: true, best: score };
  }

  /* ---------- Firebase mode ---------- */
  function initFb() {
    if (fbReady) { return fbReady; }
    var base = 'https://www.gstatic.com/firebasejs/' + (CFG.sdk || '10.12.2') + '/';
    fbReady = Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-auth.js'),
      import(base + 'firebase-firestore.js'),
      CFG.appCheckSiteKey ? import(base + 'firebase-app-check.js') : null
    ]).then(function (m) {
      var app = m[0].initializeApp(CFG.firebase);
      if (m[3]) {
        m[3].initializeAppCheck(app, {
          provider: new m[3].ReCaptchaV3Provider(CFG.appCheckSiteKey),
          isTokenAutoRefreshEnabled: true
        });
      }
      var f = { A: m[1], F: m[2], auth: m[1].getAuth(app), db: m[2].getFirestore(app) };
      return f.auth.authStateReady().then(function () { return f; });
    });
    fbReady.catch(function () { fbReady = null; });
    return fbReady;
  }
  function fbTop(game, n) {
    return initFb().then(function (f) {
      var me = f.auth.currentUser ? f.auth.currentUser.uid : null;
      var q = f.F.query(f.F.collection(f.db, 'boards', game, 'scores'), f.F.orderBy('score', 'desc'), f.F.limit(n));
      return f.F.getDocs(q).then(function (snap) {
        var rows = [];
        snap.forEach(function (d) {
          var v = d.data(), r = { name: v.name, score: v.score, me: d.id === me };
          if (validRow(r)) { rows.push(r); }
        });
        return rows;
      });
    });
  }
  function fbSubmit(game, name, score) {
    return initFb().then(function (f) {
      var user = f.auth.currentUser;
      var signed = user ? Promise.resolve(user) : f.A.signInAnonymously(f.auth).then(function (c) { return c.user; });
      return signed.then(function (u) {
        var ref = f.F.doc(f.db, 'boards', game, 'scores', u.uid);
        return f.F.getDoc(ref).then(function (snap) {
          if (snap.exists() && snap.data().score >= score) { return { saved: false, best: snap.data().score }; }
          return f.F.setDoc(ref, { name: name, score: score, ts: f.F.serverTimestamp() })
            .then(function () { return { saved: true, best: score }; });
        });
      });
    });
  }

  /* ---------- public ---------- */
  function top(game, n) {
    n = Math.max(1, Math.min(n || 10, 100));
    if (!Object.prototype.hasOwnProperty.call(CAPS, game)) { return Promise.resolve([]); }
    var key = game + ':' + n, hit = cache[key];
    if (hit && Date.now() - hit.t < 60000) { return Promise.resolve(hit.rows); }
    var p = configured ? fbTop(game, n) : Promise.resolve(demoTop(game, n));
    return p.then(function (rows) { cache[key] = { t: Date.now(), rows: rows }; return rows; });
  }
  function submit(game, rawName, score) {
    var name = cleanName(rawName), problem = nameProblem(name);
    if (problem) { return Promise.reject(new Error(problem)); }
    if (!validScore(game, score)) { return Promise.reject(new Error('SCORE NOT ACCEPTED')); }
    var p = configured ? fbSubmit(game, name, score) : Promise.resolve(demoSubmit(game, name, score));
    return p.then(function (res) {
      Object.keys(cache).forEach(function (k) { if (k.indexOf(game + ':') === 0) { delete cache[k]; } });
      return res;
    });
  }

  JB.board = { configured: configured, top: top, submit: submit, cleanName: cleanName, nameProblem: nameProblem, caps: CAPS };
})();
