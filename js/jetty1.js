/*
 * Jetty Boot cabinet: the title and high-score screens shown in the room, plus
 * the shared boot art. The game itself is in play/jetty1.js and is only
 * fetched after a coin goes into the machine.
 */
(function () {
  'use strict';
  var JB = window.JB;
  var W = 240, H = 336;
  var BG = '#1b2029', G = '#b4f02a', DIM = '#5d7a1e', BAND = '#2b3a17', HI = '#f4ffd0';
  var RED = '#ff3b2f', RED_HOT = '#ff9a5a';

  var BOOT = [
    '..XXXXX.....',
    '..XXXXX.....',
    '..XXXXX.....',
    '..XXXXX.....',
    '..XXXXXX....',
    '..XXXXXXXXX.',
    '..XXXXXXXXXX',
    '..XXXXXXXXXX',
    '..XXXXXXXXXX',
    '..X..X..X..X'
  ];

  /* Red flame straight down from under the sole. power 0..1 sets its length. Drawing only: it never collides. */
  function drawFlame(c, x, y, px, t, power) {
    var f = Math.floor(t * 24) % 2, len = Math.round((4 + power * 7 + f) * px);
    c.fillStyle = RED;
    c.fillRect(x + 3 * px, y + 10 * px, 7 * px, Math.round(len * 0.45));
    c.fillRect(x + 4 * px, y + 10 * px, 5 * px, Math.round(len * 0.75));
    c.fillRect(x + 6 * px, y + 10 * px, px, len);
    c.fillStyle = RED_HOT;
    c.fillRect(x + 5 * px, y + 10 * px, 3 * px, Math.round(len * 0.3));
  }
  /* ang tilts the boot (and its flame) forward around its middle. */
  function drawBoot(c, x, y, px, color, power, t, ang) {
    if (ang) {
      c.save();
      c.translate(x + 6 * px, y + 5 * px); c.rotate(ang); c.translate(-(x + 6 * px), -(y + 5 * px));
    }
    if (power > 0) { drawFlame(c, x, y, px, t, power); }
    JB.sprite(c, BOOT, x, y, px, color);
    if (ang) { c.restore(); }
  }

  function title(c, y, size) {
    c.save();
    c.transform(1, 0, -0.18, 1, 0, 0);
    var shift = (y + size / 2) * 0.18;
    JB.text(c, 'JETTY BOOT', W / 2 + shift + 2, y + 2, size, BAND);
    JB.text(c, 'JETTY BOOT', W / 2 + shift, y, size, G);
    c.restore();
  }

  function attract(c, t, rows, note) {
    c.fillStyle = BG; c.fillRect(0, 0, W, H);
    var page = Math.floor(t / 7) % 2;
    if (page === 0) {
      title(c, 62, 20);
      var bob = Math.round(Math.sin(t * 3) * 4);
      drawBoot(c, 78, 112 + bob, 7, G, 0.4, t, 0);
      JB.text(c, 'UNOFFICIAL FAN GAME', W / 2, 318, 5, DIM);
    } else {
      title(c, 34, 16);
      JB.text(c, 'HIGH SCORES', W / 2, 72, 8, G);
      JB.drawScores(c, { W: W, y: 98, rows: rows, color: G, dim: DIM, hi: HI, band: BAND });
    }
    if (note) {
      c.fillStyle = BG; c.fillRect(0, 268, W, 40);
      JB.text(c, note, W / 2, 284, 7, HI);
    } else if (Math.floor(t * 2) % 2 === 0) {
      JB.text(c, 'INSERT COIN', W / 2, 284, 8, G);
    }
  }

  JB.games.jetty1 = {
    id: 'jetty1', name: 'JETTY BOOT', W: W, H: H, ready: true,
    src: 'play/jetty1.js',
    attract: attract,
    art: { BOOT: BOOT, drawBoot: drawBoot, title: title, BG: BG, G: G, DIM: DIM, BAND: BAND, HI: HI }
  };
})();
