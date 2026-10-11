/*
 * Jetty Boot (fan version): the game itself. Fetched only after a coin is
 * inserted. One button: hold to thrust, release to fall.
 * The simulation runs in fixed 1/60 s steps from a seed, so the same seed and
 * the same press/release ticks always produce the same run.
 */
(function () {
  'use strict';
  var JB = window.JB, game = JB.games.jetty1, art = game.art;
  var W = game.W, H = game.H, TOP = 44, GROUND = 288, MID = 160;
  /* Proportions measured from the real cabinet, as shares of the play field height:
     wall thickness about 8%, boot about 6% by 5%, wall to wall about 40 to 50%. */
  var FIELD = GROUND - TOP, GAP = Math.round(FIELD / 4), FIRST_GAP = Math.round(FIELD / 2);
  var BPX = 1.25, BX = 60, BW = 12 * BPX, BH = 10 * BPX, WW = 20, SPACING = 100;
  /* Flight measured frame by frame from a recording of the real cabinet. A press
     sends the boot up at once at a fixed speed (about 0.69 field heights a second),
     whatever it was doing before; it keeps that speed while held, and gravity
     (about 2.7 field heights a second, each second) takes over on release.
     The walls pass at one every 1.28 seconds, the same rhythm as the cabinet. */
  var GRAV = 0.183, CLIMB = 2.8, MAX_DOWN = 8;
  var PACE = SPACING / 1.28 / 60, PER_LEVEL = 10, TILT = 0.24;
  var BG = art.BG, G = art.G, BAND = art.BAND, HI = art.HI, DIM = art.DIM;

  var K = 8, layer = null;
  function bootLayer() {
    if (!layer) {
      var cv = document.createElement('canvas'); cv.width = 12 * K; cv.height = 24 * K;
      layer = cv.getContext('2d');
    }
    return layer;
  }

  function Run(seed, hi) {
    this.seed = seed >>> 0;
    this.rand = JB.rng(seed);
    this.hi = hi || 0;
    this.score = 0; this.lives = 3; this.level = 1;
    this.walls = []; this.y = MID; this.py = MID; this.vy = 0;
    this.spawned = 0; this.passed = 0;
    this.tick = 0; this.grace = true; this.inv = 0; this.freeze = 0; this.banner = 0;
    this.down = false; this.thrust = false; this.held = 0; this.tilt = 0; this.clear = 0;
    this.burn = 0; this.over = false; this.events = []; this.inputs = []; this.auto = false;
  }

  /* inp.thrust: is the button held this tick. */
  Run.prototype.step = function (inp) {
    if (this.over) { this.thrust = false; return; }
    this.tick++;
    var down = !!(inp && inp.thrust), k;
    /* Remember where things were, so drawing can glide between steps. */
    this.py = this.y;
    for (k = 0; k < this.walls.length; k++) { this.walls[k].px = this.walls[k].x; }
    var pressed = down && !this.down;
    if (down !== this.down) { this.inputs.push(down ? this.tick : -this.tick); }
    this.down = down;

    if (this.freeze > 0) {
      this.thrust = false;
      this.freeze--;
      if (this.freeze === 0) {
        if (this.lives <= 0) { this.over = true; this.events.push('over'); }
        else {
          /* Walls not yet passed come around again. */
          this.walls = []; this.spawned = this.passed;
          this.y = MID; this.py = MID; this.vy = 0; this.tilt = 0; this.grace = true; this.inv = 90;
        }
      }
      return;
    }
    /* Level finished: hold for a moment, then start the next one from the beginning. */
    if (this.clear > 0) {
      this.thrust = false;
      this.clear--;
      if (this.clear === 0) {
        this.level++; this.walls = []; this.spawned = 0; this.passed = 0; this.auto = false;
        this.y = MID; this.py = MID; this.vy = 0; this.tilt = 0;
        this.grace = true; this.banner = 150;
      }
      return;
    }
    if (this.banner > 0) { this.banner--; }
    if (this.inv > 0) { this.inv--; }
    if (this.grace) {
      if (pressed) { this.grace = false; }
      else { this.thrust = false; this.y = MID + Math.sin(this.tick * 0.1) * 3; return; }
    }
    /* The pace never changes. Later levels are harder because of the path: the
       first wall of a level always has the same wide, centered opening (half the
       field). Every other opening is a quarter of the field, and each one sits
       further from the last as levels go up, so the boot climbs and dives more. */
    var speed = PACE;
    var gap = GAP;
    var swingMin = Math.min(8 + (this.level - 1) * 7, 48);
    var swingMax = Math.min(48 + (this.level - 1) * 8, 92);

    /* Once the last wall of the level is behind it, the boot flies itself: it holds
       its height, eases away from the floor and roof, and cannot crash. */
    var auto = this.passed >= PER_LEVEL;
    this.auto = auto;
    if (auto) {
      var safe = Math.max(TOP + 34, Math.min(GROUND - BH - 34, this.y));
      this.vy = 0; this.held = 0; this.thrust = false;
      this.y += (safe - this.y) * 0.08;
      this.tilt += (0 - this.tilt) * 0.18;
    } else {
      if (down) { this.vy = -CLIMB; this.held = Math.min(this.held + 1, 30); this.burn = 10; }
      else { this.vy += GRAV; this.held = 0; if (this.burn > 0) { this.burn--; } }
      /* The flame and tilt linger for a moment after a tap, as on the cabinet. */
      this.thrust = down || this.burn > 0;
      this.tilt += ((this.thrust ? 1 : 0) - this.tilt) * 0.18;
      if (this.vy > MAX_DOWN) { this.vy = MAX_DOWN; }
      this.y += this.vy;
    }

    var last = this.walls[this.walls.length - 1];
    if (this.spawned < PER_LEVEL && (!last || last.x <= W - SPACING)) {
      var lo = TOP + 14, hiY = GROUND - 14 - gap;
      var gy = lo + this.rand() * (hiY - lo);
      var wgap = gap;
      if (this.spawned === 0) {
        wgap = FIRST_GAP; gy = TOP + (FIELD - FIRST_GAP) / 2;
      } else if (last) {
        /* Step up or down from the previous opening by an amount set by the level,
           measured between the middles of the two openings. */
        var from = last.gy + last.gap / 2 - gap / 2;
        var swing = swingMin + this.rand() * (swingMax - swingMin);
        var dir = this.rand() < 0.5 ? -1 : 1;
        if (from + dir * swing < lo || from + dir * swing > hiY) { dir = -dir; }
        gy = Math.max(lo, Math.min(hiY, from + dir * swing));
      }
      this.walls.push({ x: W + 4, px: W + 4, gy: Math.round(gy), gap: wgap, passed: false });
      this.spawned++;
    }
    /* The hit box is the boot's body only. The flame is never part of it. */
    var hit = false, bx = BX + 4, by = this.y + 1, bw = BW - 5, bh = BH - 2;
    for (var i = 0; i < this.walls.length; i++) {
      var w = this.walls[i];
      w.x -= speed;
      if (!w.passed && w.x + WW < BX) {
        w.passed = true; this.score++; this.passed++; this.events.push('point');
      }
      if (bx + bw > w.x && bx < w.x + WW && (by < w.gy || by + bh > w.gy + w.gap)) { hit = true; }
    }
    while (this.walls.length && this.walls[0].x < -WW - 4) { this.walls.shift(); }
    var roof = this.y <= TOP, floor = this.y + BH >= GROUND;
    if (roof || floor) { hit = true; }
    if (auto) { hit = false; roof = false; floor = false; }
    if (hit && this.inv === 0) {
      this.lives--; this.freeze = 50; this.thrust = false; this.events.push('hit');
    } else if (roof) {
      this.y = TOP + 1; this.vy = 0.5;
    } else if (floor) {
      this.y = GROUND - BH - 1; this.vy = -1.5;
    } else if (this.passed >= PER_LEVEL && this.walls.length === 0) {
      /* Every wall of the level is behind the boot and off the screen. */
      this.clear = 110; this.thrust = false; this.events.push('level');
    }
  };

  /* a: how far we are between the last step and the next, 0..1. */
  Run.prototype.draw = function (c, t, a) {
    var i;
    if (a === undefined) { a = 1; }
    c.fillStyle = BG; c.fillRect(0, 0, W, H);

    JB.text(c, 'HIGH SCORE', W / 2, 5, 6, DIM);
    JB.text(c, Math.max(this.hi, this.score), W / 2, 14, 6, G);
    for (i = 0; i < this.lives; i++) { JB.sprite(c, art.BOOT, 6 + i * 14, 27, 1, G); }
    JB.text(c, this.score, W / 2, 27, 9, G);
    JB.text(c, 'LVL ' + this.level, W - 8, 29, 6, G, 'right');

    c.fillStyle = G;
    c.fillRect(0, TOP - 2, W, 2);
    c.fillRect(0, GROUND, W, 2);
    for (i = 0; i < this.walls.length; i++) {
      var w = this.walls[i], x = JB.snap(c, w.px + (w.x - w.px) * a);
      c.fillRect(x, TOP, WW, w.gy - TOP);
      c.fillRect(x, w.gy + w.gap, WW, GROUND - (w.gy + w.gap));
    }

    var y = JB.snap(c, this.py + (this.y - this.py) * a);
    if (this.freeze > 0) {
      var r = 50 - this.freeze;
      c.fillStyle = G;
      for (i = 0; i < 8; i++) {
        var an = i * Math.PI / 4;
        c.fillRect(Math.round(BX + BW / 2 + Math.cos(an) * r * 0.5), Math.round(y + BH / 2 + Math.sin(an) * r * 0.5), 2, 2);
      }
    } else if (!this.over && !(this.inv > 0 && this.tick % 8 < 4)) {
      var power = this.grace || this.auto ? 0.2 : (this.thrust ? 0.45 + this.held / 30 * 0.55 : 0);
      /* Drawn large on a spare canvas, then placed at the game's boot size, so the
         pixels stay solid at any screen scale and tilt. */
      var oc = bootLayer();
      oc.clearRect(0, 0, 12 * K, 24 * K);
      art.drawBoot(oc, 0, 0, K, G, this.clear > 0 ? 0 : power, t, 0);
      c.save();
      c.translate(BX + BW / 2, y + BH / 2); c.rotate(this.tilt * TILT);
      c.imageSmoothingEnabled = true;
      c.drawImage(oc.canvas, -BW / 2, -BH / 2, BW, 24 * BPX);
      c.restore();
    }

    if (this.over) {
      c.fillStyle = BG; c.fillRect(30, 116, W - 60, 70);
      c.fillStyle = G; c.fillRect(30, 116, W - 60, 2); c.fillRect(30, 184, W - 60, 2);
      JB.text(c, 'GAME OVER', W / 2, 130, 12, G);
      JB.text(c, 'SCORE ' + this.score, W / 2, 158, 8, HI);
    } else if (this.clear > 0) {
      JB.text(c, 'LEVEL ' + this.level, W / 2, 96, 12, HI);
      JB.text(c, 'CLEAR', W / 2, 116, 12, HI);
    } else if (this.freeze === 0) {
      if (this.banner > 0) { JB.text(c, 'LEVEL ' + this.level, W / 2, 96, 12, HI); }
      if (this.grace && Math.floor(t * 2) % 2 === 0) { JB.text(c, 'HOLD TO FLY', W / 2, 210, 8, G); }
    }
  };

  function scoreScreen(c, t, rows, score) {
    c.fillStyle = BG; c.fillRect(0, 0, W, H);
    art.title(c, 22, 16);
    JB.text(c, 'HIGH SCORES', W / 2, 56, 8, G);
    JB.drawScores(c, { W: W, y: 80, rows: rows, color: G, dim: DIM, hi: HI, band: BAND });
    JB.text(c, 'YOUR SCORE ' + score, W / 2, 262, 8, HI);
    if (Math.floor(t * 2) % 2 === 0) { JB.text(c, 'GRAB ANOTHER COIN', W / 2, 296, 7, G); }
  }

  game.tip = 'HOLD THE SCREEN OR SPACE TO THRUST. LET GO TO FALL.';
  game.controls = 'one';
  game.scoreScreen = scoreScreen;
  game.create = function (seed, hi) { return new Run(seed, hi); };
})();
