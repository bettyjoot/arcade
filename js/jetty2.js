/*
 * Jetty Boots: In 2 Deep cabinet: title and high-score screens shown in the
 * room, plus the shared art (four original miners, original bugs). The game
 * itself is in play/jetty2.js and is only fetched after a coin goes in.
 */
(function () {
  'use strict';
  var JB = window.JB;
  var W = 240, H = 336;
  var INK = '#120c26', WHITE = '#ffffff', GOLD = '#ffd75e', PINK = '#ff7aa8', BAND = '#3b2a7a';

  /* One miner body, 12 x 16, facing right. Palettes and a small extra make the four classes. */
  var MINER = [
    '...HHHHHH...',
    '..HHHHHHHH..',
    '..HHHVVVVH..',
    '..HHHVVVVH..',
    '..HHHHHHHH..',
    '...HHHHHH...',
    '.PPSSSSSS...',
    '.PPSSASSSG..',
    '.PPSSSSSSG..',
    '.PPSSSSSS...',
    '..DSSSSSD...',
    '..DDD.DDD...',
    '..DD...DD...',
    '..DD...DD...',
    '.BBB..BBB...',
    '.BBBB.BBBB..'
  ];
  var CLASSES = [
    { id: 'explorer', name: 'EXPLORER', gun: 'PLASMA RIFLE', weapon: 'plasma', speed: 1.25,
      pal: { H: '#ece6d2', V: '#39d0ff', S: '#2e9e6b', D: '#1c6a47', P: '#c8a23a', G: '#f0c070', A: '#ffffff', B: '#3b3f52' } },
    { id: 'artillery', name: 'ARTILLERYMAN', gun: 'ROCKET LAUNCHER', weapon: 'rocket', speed: 0.9,
      pal: { H: '#c0392b', V: '#ffd75e', S: '#6b7183', D: '#434757', P: '#8c2a20', G: '#d9d3c7', A: '#ffd75e', B: '#2a2c38' } },
    { id: 'borer', name: 'BORER', gun: 'FLAMETHROWER', weapon: 'flame', speed: 1.0,
      pal: { H: '#f2a33a', V: '#2b2f3a', S: '#7a5a3a', D: '#523a24', P: '#d14b2a', G: '#e8c08a', A: '#ffe9a8', B: '#33261a' } },
    { id: 'technician', name: 'TECHNICIAN', gun: 'SHOTGUN', weapon: 'shotgun', speed: 1.1,
      pal: { H: '#3f6fd8', V: '#b8f5ff', S: '#d9d3c7', D: '#9a958a', P: '#6b4fc4', G: '#f0c070', A: '#3f6fd8', B: '#2b2f4a' } }
  ];

  var GNAT = ['.W....W.', 'WWW..WWW', '..BBBB..', '.BEBBEB.', '..BBBB..', '...MM...'];
  var GNAT2 = ['........', '.WW..WW.', 'W.BBBB.W', '.BEBBEB.', '..BBBB..', '...MM...'];
  var SPIT = [
    '....EE......', '....EE......', '....SS......', '..BBBBBBBB..', '.BBBBBBBBBB.',
    'BBDBBBBBBDBB', 'BBBBMMMMBBBB', '.BBBBBBBBBB.', '..L.L..L.L..', '..L.L..L.L..'
  ];
  var BRUTE = [
    '....AAAAAAAA....', '..AAAAAAAAAAAA..', '.AAAHAAAAAAHAAA.', 'AAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBB',
    'BEEBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBB', '.BMMBBBBBBBBBBB.', '..BBBBBBBBBBBB..', '..L..L..L..L....', '.L..L..L..L.....'
  ];
  var BUGS = {
    gnat: { map: GNAT, map2: GNAT2, w: 8, h: 6, hp: 1, pts: 100, pal: { W: '#e9d6ff', B: '#c04bd8', E: '#fff36b', M: '#5a1a6a' } },
    spit: { map: SPIT, map2: SPIT, w: 12, h: 10, hp: 2, pts: 250, pal: { E: '#ffe14a', S: '#2fbf9a', B: '#2fbf9a', D: '#1a7f68', M: '#0f2a2a', L: '#1a7f68' } },
    brute: { map: BRUTE, map2: BRUTE, w: 16, h: 12, hp: 6, pts: 500, pal: { A: '#7a55a3', H: '#b193d6', B: '#3a2a52', E: '#ff5a5a', M: '#1a1026', L: '#3a2a52' } }
  };

  /* Mirror a small rectangle around the miner's 12-pixel width. */
  function part(c, x, y, px, flip, rx, ry, rw, rh, color) {
    c.fillStyle = color;
    c.fillRect(x + (flip ? 12 - rx - rw : rx) * px, y + ry * px, rw * px, rh * px);
  }
  function drawMiner(c, x, y, px, cls, flip, flame, t) {
    if (flame > 0) {
      var f = Math.floor(t * 24) % 2, len = 2 + flame * 4 + f;
      part(c, x, y, px, flip, 1, 16, 3, len, '#ff8a2a'); part(c, x, y, px, flip, 6, 16, 3, len, '#ff8a2a');
      part(c, x, y, px, flip, 2, 16, 1, len - 1, '#fff2a8'); part(c, x, y, px, flip, 7, 16, 1, len - 1, '#fff2a8');
    }
    JB.sprite(c, MINER, x, y, px, cls.pal, flip);
    if (cls.weapon === 'plasma') {
      part(c, x, y, px, flip, 8, 7, 6, 2, '#4a5068'); part(c, x, y, px, flip, 13, 7, 2, 2, '#39d0ff'); part(c, x, y, px, flip, 9, 9, 2, 1, '#2b2f3a');
      part(c, x, y, px, flip, 5, -2, 1, 2, '#ece6d2'); part(c, x, y, px, flip, 5, -3, 1, 1, '#ff5a5a');
    } else if (cls.weapon === 'rocket') {
      part(c, x, y, px, flip, 4, 5, 11, 3, '#3a3f4f'); part(c, x, y, px, flip, 14, 4, 2, 5, '#c0392b'); part(c, x, y, px, flip, 3, 5, 1, 3, '#ffd75e');
    } else if (cls.weapon === 'flame') {
      part(c, x, y, px, flip, 8, 8, 6, 2, '#5a5f70'); part(c, x, y, px, flip, 14, 7, 1, 3, '#2b2f3a'); part(c, x, y, px, flip, 15, 8, 1, 1, '#ffb347');
      part(c, x, y, px, flip, -1, 5, 2, 6, '#d14b2a'); part(c, x, y, px, flip, -1, 4, 2, 1, '#ffe9a8');
    } else {
      part(c, x, y, px, flip, 8, 7, 6, 1, '#2b2f3a'); part(c, x, y, px, flip, 8, 8, 6, 1, '#6b7183'); part(c, x, y, px, flip, 7, 8, 2, 2, '#8a5a30');
      part(c, x, y, px, flip, 1, 3, 2, 1, '#ffd75e');
    }
  }

  function hash(n) { var s = Math.sin(n * 91.7) * 43758.5453; return s - Math.floor(s); }

  /* Cave backdrop with two scrolling rock layers. off is the camera position. */
  function backdrop(c, off, t) {
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0b18'); g.addColorStop(0.55, '#171226'); g.addColorStop(0.85, '#2a1622'); g.addColorStop(1, '#4a1c1c');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    /* Two layers of distant stalactites and stalagmites. */
    var layers = [[0.25, '#141124', 70, 90], [0.5, '#1f1930', 52, 60]], i, s;
    for (var l = 0; l < layers.length; l++) {
      var L = layers[l], o = off * L[0], base = Math.floor(o / L[2]);
      c.fillStyle = L[1];
      for (i = -1; i < W / L[2] + 2; i++) {
        var idx = base + i, x = Math.round(idx * L[2] - o);
        var up = 16 + hash(idx + l * 31) * L[3], dn = 16 + hash(idx + l * 57 + 9) * L[3];
        for (s = 0; s < 5; s++) {
          c.fillRect(x + s * 4, 0, L[2] - 6 - s * 8, Math.round(up * (s + 1) / 5));
          c.fillRect(x + 20 + s * 4, H - Math.round(dn * (s + 1) / 5), L[2] - 6 - s * 8, Math.round(dn * (s + 1) / 5));
        }
      }
    }
    var o2 = off * 0.7, b2 = Math.floor(o2 / 46);
    for (i = -1; i < W / 46 + 2; i++) {
      var id = b2 + i;
      /* Far-off crystal clusters glinting in the dark. */
      var gx = Math.round(id * 46 - o2 + hash(id * 7) * 30), gy = Math.round(40 + hash(id * 3) * 230);
      var dim = hash(id * 5) > 0.5 ? '#1f7f72' : '#8a3f66', lit = hash(id * 5) > 0.5 ? '#3ff0c8' : '#ff7aa8';
      c.fillStyle = dim;
      c.fillRect(gx, gy - 3, 2, 6); c.fillRect(gx - 3, gy - 1, 2, 4); c.fillRect(gx + 3, gy, 2, 3);
      if (Math.sin(t * 2.5 + id) > 0.2) { c.fillStyle = lit; c.fillRect(gx, gy - 3, 1, 2); }
    }
  }
  function lava(c, y, off, t) {
    c.fillStyle = '#ff6a1f'; c.fillRect(0, y, W, H - y);
    c.fillStyle = '#c23a12'; c.fillRect(0, y + 10, W, H - y - 10);
    c.fillStyle = '#ffd75e';
    for (var x = -8; x < W + 8; x += 8) {
      var k = Math.floor((x + off) / 8);
      c.fillRect(x - (off % 8), y + (Math.sin(t * 3 + k * 0.9) > 0 ? 0 : 1), 5, 2);
    }
  }

  function title(c, y) {
    JB.text(c, 'JETTY', W / 2 + 2, y + 2, 20, INK);
    JB.text(c, 'JETTY', W / 2, y, 20, WHITE);
    c.font = '20px ' + JB.FONT;
    var bw = c.measureText('BOOT').width, tw = c.measureText('BOOTS').width, x0 = W / 2 - tw / 2;
    JB.text(c, 'BOOTS', x0 + 2, y + 28, 20, INK, 'left');
    JB.text(c, 'BOOT', x0, y + 26, 20, WHITE, 'left');
    JB.text(c, 'S', x0 + bw, y + 26, 20, GOLD, 'left');
    c.fillStyle = BAND; c.fillRect(30, y + 56, W - 60, 16);
    JB.text(c, 'IN 2 DEEP', W / 2, y + 61, 7, GOLD);
  }

  function attract(c, t, rows, note) {
    backdrop(c, t * 40, t);
    lava(c, 300, t * 40, t);
    var page = Math.floor(t / 7) % 2;
    if (page === 0) {
      title(c, 40);
      for (var i = 0; i < 4; i++) {
        drawMiner(c, 22 + i * 54, 170 + Math.round(Math.sin(t * 3 + i * 1.3) * 5), 3, CLASSES[i], false, 0.6, t);
      }
    } else {
      title(c, 14);
      c.fillStyle = 'rgba(18,12,38,0.82)'; c.fillRect(14, 96, W - 28, 176);
      JB.text(c, 'HIGH SCORES', W / 2, 104, 7, GOLD);
      JB.drawScores(c, { W: W, y: 122, rows: rows, color: WHITE, dim: PINK, hi: GOLD, band: BAND });
    }
    c.fillStyle = INK; c.fillRect(0, 276, W, 20);
    if (note) { JB.text(c, note, W / 2, 282, 6, GOLD); }
    else if (Math.floor(t * 2) % 2 === 0) { JB.text(c, 'INSERT COIN', W / 2, 282, 8, WHITE); }
  }

  JB.games.jetty2 = {
    id: 'jetty2', name: 'JETTY BOOTS', sub: 'IN 2 DEEP', W: W, H: H, ready: true,
    src: 'play/jetty2.js',
    attract: attract,
    art: { CLASSES: CLASSES, BUGS: BUGS, drawMiner: drawMiner, backdrop: backdrop, lava: lava, title: title,
           INK: INK, WHITE: WHITE, GOLD: GOLD, PINK: PINK, BAND: BAND }
  };
})();
