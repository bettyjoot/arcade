/*
 * Jetty Boot2: Sole Survivor (fan game): the game itself. Fetched only after a
 * coin is inserted. Pick a miner and fly through the cave to the drop pod.
 * One-hand controls: hold for boots, swipe (or arrow keys) to turn, swipe down
 * to stop. The miner shoots by itself at bugs in front of it.
 * Bugs, rock, crystal, and lava kill. The ceiling is safe.
 * Fixed 1/60 s steps from a seed, so a run can be replayed from its inputs.
 */
(function () {
  'use strict';
  var JB = window.JB, game = JB.games.jetty2, art = game.art;
  var W = game.W, H = game.H, TOP = 30, GROUND = 300;
  var PW = 12, PH = 16;
  var GRAV = 0.085, THRUST = 0.19, MAX_UP = -1.8, MAX_DOWN = 1.9;
  var RANGE = { plasma: 150, rocket: 170, shotgun: 85, flame: 62 };
  var CLASSES = art.CLASSES, BUGS = art.BUGS;
  var INK = art.INK, WHITE = art.WHITE, GOLD = art.GOLD, PINK = art.PINK, BAND = art.BAND;
  var CARDS = [[12, 58], [124, 58], [12, 176], [124, 176]], CW = 104, CH = 110;

  /* Boss: an original giant cave bug, 28 x 18 cells drawn at double size. It faces left as drawn;
     the glowing sac on its rear (S, W) is the only place it can be hurt. */
  var BOSS = [
    '........AAAAAAAAAAAA........',
    '......AAAAAAAAAAAAAAAA......',
    '....AAAHHAAAAAAAAAAAAAAA....',
    '...AAAHHAAAAAAAAAAAAAAAAA...',
    '..AAAAAAAAAAAAAAAAAAAAAAASS.',
    '.AAAAAAAAAAAAAAAAAAAAAAASSSS',
    '.BBBBBBBBBBBBBBBBBBBBBBBSSWS',
    'BEEBBBBBBBBBBBBBBBBBBBBBSWWS',
    'BEEBBBBBBBBBBBBBBBBBBBBBSWWS',
    'BBBBBBBBBBBBBBBBBBBBBBBBSSWS',
    'TTBBBBBBBBBBBBBBBBBBBBBBSSSS',
    '.TTMMMBBBBBBBBBBBBBBBBBBBSS.',
    '..TMMMBBBBBBBBBBBBBBBBBB....',
    '...BBBBBBBBBBBBBBBBBBBB.....',
    '....BBBBBBBBBBBBBBBBB.......',
    '...L...L...L...L...L........',
    '..L...L...L...L...L.........',
    '.L...L...L...L...L..........'
  ];
  var BOSS_PAL = { A: '#b5542e', H: '#e89a6a', B: '#4a2a3a', E: '#fff36b', T: '#f4ffd0', M: '#1a1026', S: '#5fd83a', W: '#e8ffd0', L: '#4a2a3a' };
  var BOSS_PAL_HURT = { A: '#b5542e', H: '#e89a6a', B: '#4a2a3a', E: '#fff36b', T: '#f4ffd0', M: '#1a1026', S: '#ffffff', W: '#ffffff', L: '#4a2a3a' };
  var BW = 56, BH = 36, ARENA = 560;

  /* Pickups: an extra life, a speed boost, a weapon boost. */
  var ICON = {
    life: ['.XX.XX.', 'XXXXXXX', 'XHXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    speed: ['X..X...', '.X..X..', '..X..X.', '...X..X', '..X..X.', '.X..X..', 'X..X...'],
    power: ['...X...', '.X.X.X.', '..XXX..', 'XXXXXXX', '..XXX..', '.X.X.X.', '...X...']
  };
  var ICON_PAL = { life: { X: '#ff4d6d', H: '#ffd0da' }, speed: { X: '#39d0ff' }, power: { X: '#ffb347' } };
  var MAX_LIVES = 5, BOOST = 600;                       /* a boost lasts 10 seconds */
  var DROP_LIFE = 0.015, DROP_POWER = 0.05, DROP_SPEED = 0.05;   /* chance per bug killed */

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function hsh(n) { var s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); }

  /* ---------- level building ---------- */
  /* Every fifth level is a boss arena: open cave, one giant bug, a few small ones. */
  function buildBoss(level, rand) {
    var tier = level / 5, bugs = [], i, B = BUGS.gnat;
    for (i = 0; i < Math.min(1 + tier, 5); i++) {
      var bx = 200 + rand() * 300, by = TOP + 30 + rand() * 200;
      bugs.push({ type: 'gnat', x: bx, y: by, px: bx, py: by, by: by, vx: 0, vy: 0, hp: B.hp, id: i, timer: 0, flash: 0 });
    }
    var hp = 20 + tier * 20;
    return {
      L: ARENA, obs: [], bugs: bugs,
      boss: { x: ARENA / 2 - BW / 2, y: 130, px: ARENA / 2 - BW / 2, py: 130, face: -1, hp: hp, max: hp, tier: tier,
              turn: 0, timer: 120, shots: 0, flash: 0, t0: Math.floor(rand() * 600) }
    };
  }
  function buildLevel(level, rand) {
    if (level % 5 === 0) { return buildBoss(level, rand); }
    var L = Math.min(1300 + level * 250, 2800), obs = [], bugs = [], x = 250, i;
    function add(o) { o.seed = obs.length * 7 + level * 31; obs.push(o); }
    while (x < L - 190) {
      var kind = Math.floor(rand() * 4), w = Math.round(22 + rand() * 16), h, y;
      var mat = rand() < 0.32 ? 'crystal' : 'rock', tint = rand() < 0.5 ? 1 : 0;
      if (kind === 0) {
        h = Math.round(40 + rand() * (110 + Math.min(level * 8, 50)));
        add({ x: x, y: GROUND - h, w: w, h: h, dir: 'up', kind: mat, tint: tint });
      } else if (kind === 1) {
        h = Math.round(40 + rand() * 140);
        add({ x: x, y: TOP, w: w, h: h, dir: 'down', kind: mat, tint: tint });
      } else if (kind === 2) {
        var gap = Math.max(100 - level * 3, 76);
        y = Math.round(TOP + 30 + rand() * (GROUND - TOP - 60 - gap));
        add({ x: x, y: TOP, w: w, h: y - TOP, dir: 'down', kind: mat, tint: tint });
        add({ x: x, y: y + gap, w: w, h: GROUND - y - gap, dir: 'up', kind: mat, tint: tint });
      } else {
        var bw = Math.round(30 + rand() * 20), bh = Math.round(24 + rand() * 30);
        y = Math.round(TOP + 40 + rand() * (GROUND - TOP - 120 - bh));
        add({ x: x, y: y, w: bw, h: bh, dir: 'float', kind: rand() < 0.5 ? 'ore' : 'crystal', tint: tint });
        w = bw;
      }
      x += w + Math.round(120 + rand() * 70 - Math.min(level * 4, 30));
    }
    var n = Math.min(6 + level * 3, 30);
    for (i = 0; i < n; i++) {
      var r = rand(), type = r < 0.55 ? 'gnat' : (r < 0.82 || level < 2 ? 'spit' : 'brute'), B = BUGS[type];
      var bx = 320 + rand() * (L - 540), by = TOP + 16 + rand() * (GROUND - TOP - 60), tries = 0;
      while (tries++ < 12 && inRock(obs, bx - 4, by - 4, B.w + 8, B.h + 8)) { bx += 14; by = TOP + 16 + rand() * (GROUND - TOP - 60); }
      bugs.push({ type: type, x: bx, y: by, px: bx, py: by, by: by, vx: 0, vy: 0, hp: B.hp, id: i, timer: 60 + Math.floor(rand() * 80), flash: 0 });
    }
    return { L: L, obs: obs, bugs: bugs };
  }
  function inRock(obs, x, y, w, h) {
    for (var i = 0; i < obs.length; i++) {
      var o = obs[i];
      if (overlap(x, y, w, h, o.x, o.y, o.w, o.h)) { return true; }
    }
    return false;
  }
  /* Middle of the tallest open space in the column around x. */
  function safeY(obs, x) {
    var spans = [[TOP, GROUND - 20]], i, j;
    for (i = 0; i < obs.length; i++) {
      var o = obs[i];
      if (o.x > x + PW + 10 || o.x + o.w < x - 10) { continue; }
      var next = [];
      for (j = 0; j < spans.length; j++) {
        var a = spans[j][0], b = spans[j][1];
        if (o.y + o.h <= a || o.y >= b) { next.push(spans[j]); continue; }
        if (o.y > a) { next.push([a, o.y]); }
        if (o.y + o.h < b) { next.push([o.y + o.h, b]); }
      }
      spans = next;
    }
    var best = null;
    for (i = 0; i < spans.length; i++) { if (!best || spans[i][1] - spans[i][0] > best[1] - best[0]) { best = spans[i]; } }
    return best && best[1] - best[0] >= 50 ? (best[0] + best[1]) / 2 - PH / 2 : null;
  }

  /* ---------- run ---------- */
  function Run(seed, hi) {
    this.seed = seed >>> 0;
    this.rand = JB.rng(seed);
    this.hi = hi || 0;
    this.score = 0; this.lives = 3; this.level = 1;
    this.phase = 'select'; this.sel = 0; this.selT = 0; this.cls = null;
    this.tick = 0; this.over = false; this.thrust = false;
    this.prev = {}; this.events = []; this.inputs = []; this.mask = 0;
    this.pl = { x: 40, y: 150, px: 40, py: 150, vx: 0, vy: 0, face: 1, dir: 0, gy: 150 };
    this.obs = []; this.bugs = []; this.shots = []; this.globs = []; this.fx = [];
    this.L = 1000; this.cam = 0; this.pcam = 0; this.boss = null; this.bossDown = 0;
    this.drops = []; this.speedT = 0; this.powerT = 0;
    this.grace = true; this.inv = 0; this.freeze = 0; this.clear = 0; this.banner = 0; this.cool = 0; this.bonus = 0;
  }

  Run.prototype.startLevel = function () {
    var lv = buildLevel(this.level, this.rand), p = this.pl;
    this.L = lv.L; this.obs = lv.obs; this.bugs = lv.bugs; this.boss = lv.boss || null; this.bossDown = 0;
    this.shots = []; this.globs = []; this.fx = []; this.drops = [];
    p.x = p.px = 40; p.y = p.py = p.gy = 150; p.vx = 0; p.vy = 0; p.face = 1; p.dir = 0;
    this.cam = this.pcam = 0;
    this.grace = true; this.inv = 0; this.cool = 0; this.banner = 150; this.phase = 'play';
  };

  Run.prototype.respawn = function () {
    var p = this.pl, x = Math.max(40, p.x - 70), y = null, tries = 0;
    while (tries++ < 40 && (y = safeY(this.obs, x)) === null) { x = Math.max(40, x - 12); }
    if (y === null || this.boss) { x = 40; y = 150; }
    p.x = p.px = x; p.y = p.py = p.gy = y; p.vx = 0; p.vy = 0; p.face = 1; p.dir = 0;
    this.globs = [];
    for (var i = 0; i < this.bugs.length; i++) {
      var b = this.bugs[i];
      if (Math.abs(b.x - x) < 90) { b.x += 150; b.px = b.x; b.vx = 0; b.vy = 0; }
    }
    this.cam = this.pcam = clamp(x - 84, 0, this.L - W);
    this.grace = true; this.inv = 120; this.cool = 0;
  };

  Run.prototype.spark = function (x, y, n, color, speed) {
    for (var i = 0; i < n; i++) {
      var a = this.rand() * Math.PI * 2, s = (0.4 + this.rand()) * speed;
      this.fx.push({ k: 'p', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 14 + Math.floor(this.rand() * 14), color: color });
    }
  };

  Run.prototype.hurt = function (b, dmg) {
    b.hp -= dmg; b.flash = 4;
    if (b.hp <= 0 && !b.dead) {
      b.dead = true;
      var B = BUGS[b.type];
      this.score = Math.min(999999, this.score + B.pts);
      this.events.push('squish');
      this.spark(b.x + B.w / 2, b.y + B.h / 2, 10, B.pal.B, 1.6);
      this.fx.push({ k: 't', x: b.x + B.w / 2, y: b.y, vx: 0, vy: -0.4, life: 40, text: '+' + B.pts });
      /* Now and then a dead bug leaves something behind. A life is the rarest. */
      var roll = this.rand();
      var kind = roll < DROP_LIFE ? 'life' : (roll < DROP_LIFE + DROP_POWER ? 'power' : (roll < DROP_LIFE + DROP_POWER + DROP_SPEED ? 'speed' : ''));
      if (kind) { this.drop(kind, b.x + B.w / 2 - 4, b.y + B.h / 2 - 4, 1, 600); }
    }
  };

  Run.prototype.drop = function (kind, x, y, px, ttl) {
    x = clamp(x, 8, this.L - 20); y = clamp(y, TOP + 12, GROUND - 40);
    this.drops.push({ k: kind, x: x, y: y, px: x, py: y, s: px, ttl: ttl, id: this.tick });
  };
  Run.prototype.collect = function (d) {
    var p = this.pl, msg;
    if (d.k === 'life') {
      if (this.lives < MAX_LIVES) { this.lives++; msg = '+1 LIFE'; }
      else { this.score = Math.min(999999, this.score + 1000); msg = '+1000'; }
      this.events.push('life');
    } else if (d.k === 'speed') { this.speedT = BOOST; msg = 'SPEED UP'; this.events.push('power'); }
    else { this.powerT = BOOST; msg = 'POWER UP'; this.events.push('power'); }
    this.fx.push({ k: 't', x: p.x + 6, y: p.y - 6, vx: 0, vy: -0.4, life: 60, text: msg });
    this.spark(d.x + 4, d.y + 4, 10, ICON_PAL[d.k].X, 1.6);
  };

  /* The boss's weak spot, on its rear. */
  Run.prototype.sac = function () {
    var b = this.boss;
    return { x: b.face < 0 ? b.x + 46 : b.x, y: b.y + 8, w: 10, h: 16 };
  };
  /* Is world position x on the boss's back side? */
  Run.prototype.behind = function (x) {
    var b = this.boss;
    return (x - (b.x + BW / 2)) * b.face < 0;
  };
  Run.prototype.hurtBoss = function (dmg) {
    var b = this.boss, i;
    if (!b) { return; }
    b.hp -= dmg; b.flash = 5;
    if (b.hp <= 0) {
      var pts = 5000 * b.tier;
      this.score = Math.min(999999, this.score + pts);
      for (i = 0; i < 5; i++) {
        this.fx.push({ k: 'b', x: b.x + 8 + this.rand() * 40, y: b.y + 6 + this.rand() * 24, vx: 0, vy: 0, life: 10 + Math.floor(this.rand() * 10) });
      }
      this.spark(b.x + BW / 2, b.y + BH / 2, 40, BOSS_PAL.A, 2.8);
      this.spark(b.x + BW / 2, b.y + BH / 2, 24, BOSS_PAL.S, 2.2);
      this.fx.push({ k: 't', x: b.x + BW / 2, y: b.y, vx: 0, vy: -0.3, life: 80, text: '+' + pts });
      this.events.push('boom'); this.events.push('level');
      /* A big pulsing heart is left where the boss fell. It stays until taken. */
      this.drop('life', b.x + BW / 2 - 7, b.y + BH / 2 - 7, 2, -1);
      this.boss = null; this.globs = []; this.bossDown = 200;
    }
  };

  Run.prototype.explode = function (x, y) {
    this.events.push('boom');
    if (this.boss && this.behind(x)) {
      var sc = this.sac();
      if (Math.abs(sc.x + 5 - x) + Math.abs(sc.y + 8 - y) < 34) { this.hurtBoss(this.powerT > 0 ? 12 : 6); }
    }
    this.fx.push({ k: 'b', x: x, y: y, vx: 0, vy: 0, life: 16 });
    this.spark(x, y, 14, '#ffb347', 2.2);
    for (var i = 0; i < this.bugs.length; i++) {
      var b = this.bugs[i], B = BUGS[b.type];
      var d = Math.abs(b.x + B.w / 2 - x) + Math.abs(b.y + B.h / 2 - y);
      if (!b.dead && d < 44) { this.hurt(b, (d < 20 ? 6 : 3) * (this.powerT > 0 ? 2 : 1)); }
    }
  };

  /* Nearest live bug in front of the miner, inside the weapon's reach and a forward cone. */
  Run.prototype.target = function (range) {
    var p = this.pl, f = p.face, mx = p.x + 6, my = p.y + 8, best = null, bd = 1e9;
    for (var i = 0; i < this.bugs.length; i++) {
      var b = this.bugs[i], B = BUGS[b.type];
      if (b.dead || b.x > this.cam + W + 4 || b.x + B.w < this.cam - 4) { continue; }
      var dx = (b.x + B.w / 2 - mx) * f, dy = b.y + B.h / 2 - my;
      if (dx > 4 && dx < range && Math.abs(dy) <= dx * 0.8 + 12) {
        var d = dx + Math.abs(dy);
        if (d < bd) { bd = d; best = { dx: dx, dy: dy }; }
      }
    }
    /* The boss is only worth shooting from behind, at its weak spot. */
    if (this.boss && this.behind(mx)) {
      var sc = this.sac(), sdx = (sc.x + 5 - mx) * f, sdy = sc.y + 8 - my;
      if (sdx > 4 && sdx < range && Math.abs(sdy) <= sdx * 0.8 + 12 && sdx + Math.abs(sdy) < bd) { best = { dx: sdx, dy: sdy }; }
    }
    return best;
  };

  Run.prototype.fire = function (tg) {
    var p = this.pl, c = this.cls, f = p.face, mx = f > 0 ? p.x + PW + 2 : p.x - 2, my = p.y + 8, i;
    var ang = clamp(Math.atan2(tg.dy, tg.dx), -0.75, 0.75), ca = Math.cos(ang), sa = Math.sin(ang);
    /* Weapon boost: double damage, faster firing, longer reach. */
    var P = this.powerT > 0, pm = P ? 2 : 1, rm = P ? 1.4 : 1, cm = P ? 0.6 : 1;
    if (c.weapon === 'plasma') {
      this.shots.push({ k: 'p', x: mx, y: my - 1, px: mx, py: my - 1, vx: ca * 5.2 * f, vy: sa * 5.2, life: 60, dmg: pm, w: 5, h: 3 });
      this.cool = Math.round(9 * cm); this.events.push('zap');
    } else if (c.weapon === 'rocket') {
      this.shots.push({ k: 'r', x: mx, y: my - 4, px: mx, py: my - 4, vx: ca * 1.4 * f, vy: sa * 1.4, sp: 1.4, ang: ang, f: f, life: 130, dmg: 0, w: 7, h: 4 });
      this.cool = Math.round(50 * cm); p.vx -= 0.5 * f; this.events.push('launch');
    } else if (c.weapon === 'shotgun') {
      for (i = -2; i <= 2; i++) {
        var a = ang + i * 0.13 + (this.rand() - 0.5) * 0.08;
        this.shots.push({ k: 's', x: mx, y: my, px: mx, py: my, vx: Math.cos(a) * 4.6 * f, vy: Math.sin(a) * 4.6, life: Math.round(20 * rm), dmg: 1.3 * pm, w: 2, h: 2 });
      }
      this.cool = Math.round(36 * cm); p.vx -= 0.3 * f; this.events.push('blast');
    } else {
      /* Flamethrower: a short cone that burns everything inside it, every tick. */
      for (i = 0; i < 2; i++) {
        var sp = (2.0 + this.rand() * 1.2) * rm;
        this.fx.push({ k: 'f', x: mx, y: my, vx: ca * sp * f + p.vx, vy: sa * sp + (this.rand() - 0.5) * 1.0, life: 18 + Math.floor(this.rand() * 8) });
      }
      for (i = 0; i < this.bugs.length; i++) {
        var b = this.bugs[i], B = BUGS[b.type];
        var dx = (b.x + B.w / 2 - mx) * f, dy = Math.abs(b.y + B.h / 2 - my);
        if (!b.dead && dx > -4 && dx < 66 * rm && dy < 12 + dx * 0.8) { this.hurt(b, 0.2 * pm); }
      }
      if (this.boss && this.behind(p.x + 6)) {
        var sc = this.sac(), sdx = (sc.x + 5 - mx) * f, sdy = Math.abs(sc.y + 8 - my);
        if (sdx > -4 && sdx < 66 * rm && sdy < 12 + sdx * 0.8) { this.hurtBoss(0.2 * pm); }
      }
      if (this.tick % 8 === 0) { this.events.push('hiss'); }
    }
  };

  Run.prototype.die = function () {
    var p = this.pl;
    this.lives--; this.freeze = 70; this.thrust = false; this.speedT = 0; this.powerT = 0;
    this.events.push('hit');
    this.spark(p.x + 6, p.y + 8, 22, this.cls.pal.H, 2.4);
    this.spark(p.x + 6, p.y + 8, 12, '#ffb347', 1.6);
  };

  Run.prototype.moveFx = function () {
    for (var i = this.fx.length - 1; i >= 0; i--) {
      var q = this.fx[i];
      q.x += q.vx; q.y += q.vy; q.life--;
      if (q.k === 'p') { q.vy += 0.05; }
      if (q.life <= 0) { this.fx.splice(i, 1); }
    }
  };

  /* inp: { thrust (held), left, right, stop (direction commands), tap {x,y} } */
  Run.prototype.step = function (inp) {
    if (this.over) { this.thrust = false; return; }
    inp = inp || {};
    this.tick++;
    var pv = this.prev, i;
    var e = { left: inp.left && !pv.left, right: inp.right && !pv.right, thrust: inp.thrust && !pv.thrust };
    this.prev = { left: !!inp.left, right: !!inp.right, thrust: !!inp.thrust };
    var mask = (inp.left ? 1 : 0) | (inp.right ? 2 : 0) | (inp.thrust ? 4 : 0) | (inp.stop ? 8 : 0);
    if (mask !== this.mask) { this.mask = mask; this.inputs.push([this.tick, mask]); }

    if (this.phase === 'select') {
      this.thrust = false; this.selT++;
      if (e.left) { this.sel = (this.sel + 3) % 4; this.events.push('pick'); }
      if (e.right) { this.sel = (this.sel + 1) % 4; this.events.push('pick'); }
      var go = this.selT > 20 && e.thrust && !inp.tap;
      if (inp.tap) {
        for (i = 0; i < 4; i++) {
          if (inp.tap.x >= CARDS[i][0] && inp.tap.x <= CARDS[i][0] + CW && inp.tap.y >= CARDS[i][1] && inp.tap.y <= CARDS[i][1] + CH) {
            this.inputs.push([this.tick, 'card', i]);
            if (this.sel === i && this.selT > 20) { go = true; } else { this.sel = i; this.events.push('pick'); }
          }
        }
      }
      if (go) { this.cls = CLASSES[this.sel]; this.events.push('level'); this.startLevel(); }
      return;
    }

    var p = this.pl, c = this.cls;
    p.px = p.x; p.py = p.y; this.pcam = this.cam;
    for (i = 0; i < this.bugs.length; i++) { this.bugs[i].px = this.bugs[i].x; this.bugs[i].py = this.bugs[i].y; }
    for (i = 0; i < this.shots.length; i++) { this.shots[i].px = this.shots[i].x; this.shots[i].py = this.shots[i].y; }
    for (i = 0; i < this.globs.length; i++) { this.globs[i].px = this.globs[i].x; this.globs[i].py = this.globs[i].y; }
    for (i = 0; i < this.drops.length; i++) { this.drops[i].px = this.drops[i].x; this.drops[i].py = this.drops[i].y; }

    if (this.freeze > 0) {
      this.thrust = false; this.freeze--; this.moveFx();
      if (this.freeze === 0) {
        if (this.lives <= 0) { this.over = true; this.events.push('over'); } else { this.respawn(); }
      }
      return;
    }
    if (this.clear > 0) {
      this.thrust = false; this.clear--; this.moveFx();
      if (this.clear === 0) { this.level++; this.startLevel(); }
      return;
    }
    if (this.banner > 0) { this.banner--; }
    if (this.inv > 0) { this.inv--; }
    if (this.grace) {
      if (e.thrust || inp.left || inp.right) { this.grace = false; p.dir = 1; }
      else { this.thrust = false; p.y = p.gy + Math.sin(this.tick * 0.1) * 3; this.moveFx(); return; }
    }

    /* miner: keeps flying the way it faces until told to turn or stop */
    if (inp.stop) { p.dir = 0; }
    if (inp.left && !inp.right) { p.dir = -1; p.face = -1; }
    if (inp.right && !inp.left) { p.dir = 1; p.face = 1; }
    if (this.speedT > 0) { this.speedT--; }
    if (this.powerT > 0) { this.powerT--; }
    var fast = this.speedT > 0;
    p.vx += clamp(p.dir * c.speed * (fast ? 1.5 : 1) - p.vx, fast ? -0.16 : -0.1, fast ? 0.16 : 0.1);
    if (inp.thrust) { p.vy -= THRUST; }
    p.vy = clamp(p.vy + GRAV, MAX_UP, MAX_DOWN);
    p.x += p.vx; p.y += p.vy;
    if (p.x < 2) { p.x = 2; p.vx = 0; }
    if (this.boss && p.x > this.L - PW - 6) { p.x = this.L - PW - 6; p.vx = 0; }
    if (this.bossDown > 0) { this.bossDown--; }
    if (p.y < TOP) { p.y = TOP; if (p.vy < 0) { p.vy = 0; } }
    this.thrust = !!inp.thrust;
    /* The camera leads the way the miner faces, so there is always room to see ahead. */
    this.cam += (clamp(p.x - (p.face > 0 ? 84 : W - 96), 0, this.L - W) - this.cam) * 0.1;

    /* guns fire by themselves when a bug is in front and in reach */
    if (this.cool > 0) { this.cool--; }
    if (this.cool <= 0) {
      var tg = this.target(RANGE[c.weapon] * (this.powerT > 0 ? 1.4 : 1));
      if (tg) { this.fire(tg); }
    }

    var hx = p.x + 2, hy = p.y + 2, hw = 8, hh = 13, dead = false, b, B, s, o, j;

    /* shots */
    for (i = this.shots.length - 1; i >= 0; i--) {
      s = this.shots[i];
      if (s.k === 'r') {
        s.sp = Math.min(s.sp + 0.14, 5.2);
        s.vx = Math.cos(s.ang) * s.sp * s.f; s.vy = Math.sin(s.ang) * s.sp;
        if (this.tick % 2 === 0) { this.fx.push({ k: 'p', x: s.x, y: s.y + 2, vx: 0, vy: 0, life: 10, color: '#d9d3c7' }); }
      }
      s.x += s.vx; s.y += s.vy; s.life--;
      var gone = s.life <= 0 || s.x < this.cam - 30 || s.x > this.cam + W + 30 || s.y < TOP || s.y > GROUND, struck = false;
      if (!gone && inRock(this.obs, s.x, s.y, s.w, s.h)) { gone = true; struck = true; if (s.k !== 'r') { this.spark(s.x, s.y, 3, '#b9b0c9', 1); } }
      if (!gone && this.boss) {
        var bs = this.boss, sc = this.sac();
        if (overlap(s.x, s.y, s.w, s.h, sc.x, sc.y, sc.w, sc.h)) {
          if (s.dmg) { this.hurtBoss(s.dmg); }
          gone = true; struck = true;
        } else if (overlap(s.x, s.y, s.w, s.h, bs.x + 2, bs.y + 2, BW - 4, BH - 8)) {
          /* Armor: the shot is wasted. */
          gone = true; struck = true;
          if (s.k !== 'r') { this.spark(s.x, s.y, 2, '#e89a6a', 1); }
        }
      }
      if (!gone) {
        for (j = 0; j < this.bugs.length; j++) {
          b = this.bugs[j]; B = BUGS[b.type];
          if (!b.dead && overlap(s.x, s.y, s.w, s.h, b.x, b.y, B.w, B.h)) { if (s.dmg) { this.hurt(b, s.dmg); } gone = true; struck = true; break; }
        }
      }
      if (gone) {
        if (s.k === 'r' && struck) { this.explode(s.x + 3, s.y + 2); }
        this.shots.splice(i, 1);
      }
    }

    /* bugs */
    var pcx = p.x + 6, pcy = p.y + 8, lv = this.level;
    for (i = this.bugs.length - 1; i >= 0; i--) {
      b = this.bugs[i]; B = BUGS[b.type];
      if (b.dead) { this.bugs.splice(i, 1); continue; }
      if (b.flash > 0) { b.flash--; }
      if (b.x > this.cam + W + 70 || b.x < this.cam - 80) { continue; }
      var dx = pcx - (b.x + B.w / 2), dy = pcy - (b.y + B.h / 2);
      if (b.type === 'gnat') {
        var sp = 0.55 + Math.min(lv * 0.05, 0.4);
        b.vx = clamp(b.vx + (dx > 0 ? 0.025 : -0.025), -sp, sp);
        b.vy = clamp(b.vy + (dy > 0 ? 0.025 : -0.025), -sp, sp);
        b.x += b.vx; b.y += b.vy + Math.sin(this.tick * 0.2 + b.id) * 0.4;
      } else if (b.type === 'brute') {
        b.x -= 0.25 + Math.min(lv * 0.02, 0.25);
        b.y += Math.abs(dx) < 140 ? clamp(dy * 0.02, -0.4, 0.4) : Math.sin(this.tick * 0.04 + b.id) * 0.4;
      } else {
        b.y = b.by + Math.sin(this.tick * 0.05 + b.id) * 6;
        if (--b.timer <= 0) {
          b.timer = 130 - Math.min(lv * 6, 50);
          if (Math.abs(dx) < 170 && Math.abs(dx) > 16) {
            var d = Math.sqrt(dx * dx + dy * dy) || 1, gs = 1.15 + Math.min(lv * 0.07, 0.7);
            var gx = b.x + B.w / 2, gy = b.y + 2;
            this.globs.push({ x: gx, y: gy, px: gx, py: gy, vx: dx / d * gs, vy: dy / d * gs, life: 240 });
            this.events.push('spit');
          }
        }
      }
      b.y = clamp(b.y, TOP + 2, GROUND - B.h - 4);
      if (this.inv === 0 && overlap(hx, hy, hw, hh, b.x + 1, b.y + 1, B.w - 2, B.h - 2)) { dead = true; }
    }

    /* boss: tracks the miner's height, spits when facing it, and is slow to turn around */
    if (this.boss) {
      var bo = this.boss, tr = bo.tier, bcx, back;
      bo.px = bo.x; bo.py = bo.y;
      if (bo.flash > 0) { bo.flash--; }
      bo.x = ARENA / 2 - BW / 2 + Math.sin((this.tick + bo.t0) * 0.01) * 40;
      bo.y += clamp(clamp(pcy - BH / 2, TOP + 8, GROUND - BH - 14) - bo.y, -(0.3 + Math.min(tr * 0.05, 0.25)), 0.3 + Math.min(tr * 0.05, 0.25));
      bcx = bo.x + BW / 2; back = this.behind(pcx);
      if (back) {
        if (++bo.turn > Math.max(110, 210 - tr * 20)) { bo.face = pcx > bcx ? 1 : -1; bo.turn = 0; bo.timer = 50; this.events.push('spit'); }
      } else if (bo.turn > 0) { bo.turn -= 2; }
      if (--bo.timer <= 0) {
        bo.timer = Math.max(110, 175 - tr * 10);
        if (!back) {
          var mxb = bo.face < 0 ? bo.x + 4 : bo.x + BW - 4, myb = bo.y + 24;
          var ba = Math.atan2(pcy - myb, pcx - mxb), gsp = 0.9 + Math.min(tr * 0.08, 0.5), k;
          for (k = -1; k <= 1; k++) {
            this.globs.push({ x: mxb, y: myb, px: mxb, py: myb, vx: Math.cos(ba + k * 0.28) * gsp, vy: Math.sin(ba + k * 0.28) * gsp, life: 260 });
          }
          this.events.push('spit');
        }
        if (++bo.shots % 4 === 0 && this.bugs.length < 2) {
          var G0 = BUGS.gnat, gx0 = bo.x + BW / 2, gy0 = bo.y + BH;
          this.bugs.push({ type: 'gnat', x: gx0, y: gy0, px: gx0, py: gy0, by: gy0, vx: 0, vy: 0, hp: G0.hp, id: 100 + bo.shots, timer: 0, flash: 0 });
        }
      }
      if (this.inv === 0 && overlap(hx, hy, hw, hh, bo.x + 4, bo.y + 4, BW - 8, BH - 12)) { dead = true; }
    }

    /* bug spit */
    for (i = this.globs.length - 1; i >= 0; i--) {
      o = this.globs[i];
      o.x += o.vx; o.y += o.vy; o.life--;
      if (o.life <= 0 || o.y < TOP || o.y > GROUND || inRock(this.obs, o.x - 2, o.y - 2, 4, 4)) { this.globs.splice(i, 1); continue; }
      if (this.inv === 0 && overlap(hx, hy, hw, hh, o.x - 2, o.y - 2, 4, 4)) { dead = true; }
    }

    /* pickups: hover in place, drift to the miner when close, fade after a while */
    for (i = this.drops.length - 1; i >= 0; i--) {
      var dr = this.drops[i], sz = 7 * dr.s, ddx = pcx - (dr.x + sz / 2), ddy = pcy - (dr.y + sz / 2);
      if (dr.ttl > 0 && --dr.ttl === 0) { this.drops.splice(i, 1); continue; }
      if (Math.abs(ddx) + Math.abs(ddy) < 34) { dr.x += clamp(ddx, -1.4, 1.4); dr.y += clamp(ddy, -1.4, 1.4); }
      if (overlap(hx - 2, hy - 2, hw + 4, hh + 4, dr.x, dr.y, sz, sz)) { this.collect(dr); this.drops.splice(i, 1); }
    }

    this.moveFx();
    if (inRock(this.obs, hx, hy, hw, hh) || p.y + PH >= GROUND) { dead = true; }
    if (dead) { this.die(); return; }

    if (!this.boss && p.x >= this.L - 62) {
      this.bonus = 1000 + 500 * this.level;
      this.score = Math.min(999999, this.score + this.bonus);
      this.clear = 140; this.thrust = false; this.events.push('level');
    }
  };

  /* ---------- cave drawing ---------- */
  var ROCK = '#5a5068', ROCK_HI = '#7d7290', ROCK_LO = '#3a3346', ROCK_BAND = '#463d57';
  var GEM = [['#3ff0c8', '#c9fff3', '#1a9c86'], ['#ff7aa8', '#ffd9e6', '#b0437f']];

  /* Stalagmite or stalactite: rough-edged rock that narrows toward its free end, with mineral flecks. */
  function drawRock(c, x, o) {
    var n = Math.ceil(o.h / 6), i;
    for (i = 0; i < n; i++) {
      var sy = o.y + i * 6, sh = Math.min(6, o.y + o.h - sy);
      var fromTip = o.dir === 'up' ? i : (o.dir === 'down' ? n - 1 - i : Math.min(i, n - 1 - i));
      var taper = fromTip === 0 ? 5 : (fromTip === 1 ? 3 : (fromTip === 2 ? 1 : 0));
      var l = taper + Math.floor(hsh(o.seed + i) * 2.5), r = taper + Math.floor(hsh(o.seed + i + 40) * 2.5);
      var sw = o.w - l - r;
      if (sw < 4) { l = Math.floor((o.w - 4) / 2); sw = 4; }
      c.fillStyle = ROCK; c.fillRect(x + l, sy, sw, sh);
      c.fillStyle = ROCK_HI; c.fillRect(x + l, sy, 2, sh);
      c.fillStyle = ROCK_LO; c.fillRect(x + l + sw - 3, sy, 3, sh);
      if (i % 4 === 2 && sw > 8) { c.fillStyle = ROCK_BAND; c.fillRect(x + l + 2, sy + 4, sw - 5, 1); }
      var f = hsh(o.seed * 3 + i);
      if (f > 0.8 && sw > 10) {
        c.fillStyle = f > 0.92 ? '#ffd75e' : '#ff9a5a';
        c.fillRect(x + l + 3 + Math.floor(hsh(o.seed + i * 7) * (sw - 9)), sy + 2, 2, 2);
      }
    }
  }
  function drawShard(c, x, y, w, h, pal, top, bot) {
    var tip = Math.min(9, Math.floor(h / 3)), third = Math.max(1, Math.floor(w / 3)), i;
    var by = y + (top ? tip : 0), bh = h - (top ? tip : 0) - (bot ? tip : 0);
    c.fillStyle = pal[0]; c.fillRect(x, by, w, bh);
    c.fillStyle = pal[1]; c.fillRect(x, by, third, bh);
    c.fillStyle = pal[2]; c.fillRect(x + w - third, by, third, bh);
    for (i = 0; i < tip; i++) {
      var ins = Math.floor((tip - i) / tip * (w / 2 - 1));
      if (top) { c.fillStyle = pal[0]; c.fillRect(x + ins, y + i, w - ins * 2, 1); c.fillStyle = pal[1]; c.fillRect(x + ins, y + i, 1, 1); }
      if (bot) { var yy = y + h - 1 - i; c.fillStyle = pal[0]; c.fillRect(x + ins, yy, w - ins * 2, 1); c.fillStyle = pal[2]; c.fillRect(x + w - ins - 1, yy, 1, 1); }
    }
  }
  /* A cluster of crystal shards growing from a rock foot. */
  function drawCrystal(c, x, o) {
    var pal = GEM[o.tint], count = o.w >= 30 ? 3 : 2, sw = Math.floor(o.w / count), k;
    for (k = 0; k < count; k++) {
      var off = Math.floor(hsh(o.seed + k * 5) * Math.min(18, o.h * 0.3)), kx = x + k * sw;
      if (o.dir === 'up') { drawShard(c, kx, o.y + off, sw - 1, o.h - off, pal, true, false); }
      else if (o.dir === 'down') { drawShard(c, kx, o.y, sw - 1, o.h - off, pal, false, true); }
      else { drawShard(c, kx, o.y + Math.floor(off / 2), sw - 1, o.h - off, pal, true, true); }
    }
    if (o.dir !== 'float') {
      var fy = o.dir === 'up' ? o.y + o.h - 7 : o.y;
      c.fillStyle = ROCK; c.fillRect(x - 1, fy, o.w + 2, 7);
      c.fillStyle = ROCK_HI; c.fillRect(x - 1, fy, o.w + 2, 1);
      c.fillStyle = ROCK_LO; c.fillRect(x - 1, fy + 6, o.w + 2, 1);
    }
  }
  /* A boulder studded with gold and copper ore. */
  function drawOre(c, x, o) {
    var w = o.w, h = o.h, y = o.y, k;
    c.fillStyle = ROCK; c.fillRect(x + 3, y, w - 6, h); c.fillRect(x, y + 3, w, h - 6); c.fillRect(x + 1, y + 1, w - 2, h - 2);
    c.fillStyle = ROCK_HI; c.fillRect(x + 3, y, w - 6, 2); c.fillRect(x, y + 3, 2, h - 6);
    c.fillStyle = ROCK_LO; c.fillRect(x + 3, y + h - 2, w - 6, 2); c.fillRect(x + w - 3, y + 3, 3, h - 6);
    for (k = 0; k < 6; k++) {
      var nx = x + 4 + Math.floor(hsh(o.seed + k) * (w - 11)), ny = y + 4 + Math.floor(hsh(o.seed + k + 9) * (h - 11));
      c.fillStyle = k % 2 ? '#ffd75e' : '#ff9a5a'; c.fillRect(nx, ny, 3, 3);
      c.fillStyle = '#fff2a8'; c.fillRect(nx, ny, 1, 1);
    }
  }
  /* Jagged cave roof under the score bar. */
  function drawRoof(c, cam) {
    c.fillStyle = ROCK_LO; c.fillRect(0, TOP - 8, W, 6);
    var base = Math.floor(cam / 6);
    for (var i = -1; i < W / 6 + 2; i++) {
      var idx = base + i, hh = 1 + Math.floor(hsh(idx) * 3);
      c.fillRect(Math.round(idx * 6 - cam), TOP - 2, 6, hh - 1);
    }
  }

  /* Original drop pod: a hovering capsule with an open hatch and a pickup beam. */
  function drawPod(c, x, t) {
    var y = 128 + Math.round(Math.sin(t * 2) * 2), f = Math.floor(t * 20) % 2, i;
    c.fillStyle = 'rgba(120,220,255,0.07)'; c.fillRect(x - 2, TOP, 52, GROUND - TOP);
    c.fillStyle = 'rgba(120,220,255,0.10)'; c.fillRect(x + 6, TOP, 36, GROUND - TOP);
    /* thrusters */
    c.fillStyle = '#ff8a2a'; c.fillRect(x + 8, y + 78, 8, 8 + f * 4); c.fillRect(x + 32, y + 78, 8, 8 + f * 4);
    c.fillStyle = '#fff2a8'; c.fillRect(x + 10, y + 78, 4, 5 + f * 2); c.fillRect(x + 34, y + 78, 4, 5 + f * 2);
    c.fillStyle = '#5f6678'; c.fillRect(x + 6, y + 72, 12, 6); c.fillRect(x + 30, y + 72, 12, 6);
    /* nose cone */
    c.fillStyle = '#d1483a';
    for (i = 0; i < 4; i++) { c.fillRect(x + 18 - i * 4, y + i * 3, 12 + i * 8, 3); }
    c.fillStyle = '#ef7a6a'; c.fillRect(x + 18, y, 3, 3); c.fillRect(x + 10, y + 6, 3, 6);
    /* hull */
    c.fillStyle = '#d9dde6'; c.fillRect(x + 2, y + 12, 44, 58); c.fillRect(x + 4, y + 70, 40, 3);
    c.fillStyle = '#ffffff'; c.fillRect(x + 2, y + 12, 4, 58);
    c.fillStyle = '#8f96a8'; c.fillRect(x + 40, y + 12, 6, 58); c.fillRect(x + 4, y + 70, 40, 2);
    c.fillStyle = '#2fbf9a'; c.fillRect(x + 2, y + 18, 44, 4);
    c.fillStyle = '#1a7f68'; c.fillRect(x + 40, y + 18, 6, 4);
    /* porthole */
    c.fillStyle = '#2b2f3a'; c.fillRect(x + 27, y + 26, 12, 12);
    c.fillStyle = '#39d0ff'; c.fillRect(x + 29, y + 28, 8, 8);
    c.fillStyle = '#c9f3ff'; c.fillRect(x + 29, y + 28, 3, 3);
    /* open hatch facing the miner, with a ramp */
    c.fillStyle = '#2b2f3a'; c.fillRect(x, y + 34, 20, 34);
    c.fillStyle = '#ffd75e'; c.fillRect(x + 2, y + 36, 16, 30);
    c.fillStyle = '#fff2a8'; c.fillRect(x + 2, y + 36, 6, 30);
    c.fillStyle = '#8f96a8'; c.fillRect(x - 12, y + 66, 16, 3);
    c.fillStyle = '#5f6678'; c.fillRect(x - 12, y + 69, 3, 2);
    /* beacon and guide arrows */
    c.fillStyle = f ? '#ffffff' : '#ff5a5a'; c.fillRect(x + 22, y - 4, 4, 4);
    if (Math.floor(t * 3) % 2 === 0) {
      c.fillStyle = GOLD;
      for (i = 0; i < 2; i++) {
        var ax = x - 34 + i * 9, ay = y + 46;
        c.fillRect(ax, ay, 2, 2); c.fillRect(ax + 2, ay + 2, 2, 2); c.fillRect(ax + 4, ay + 4, 2, 2); c.fillRect(ax + 2, ay + 6, 2, 2); c.fillRect(ax, ay + 8, 2, 2);
      }
    }
  }

  Run.prototype.drawSelect = function (c, t) {
    art.backdrop(c, t * 20, t);
    c.fillStyle = 'rgba(18,12,38,0.6)'; c.fillRect(0, 0, W, H);
    JB.text(c, 'CHOOSE YOUR MINER', W / 2, 24, 9, GOLD);
    for (var i = 0; i < 4; i++) {
      var x = CARDS[i][0], y = CARDS[i][1], on = i === this.sel, cl = CLASSES[i];
      c.fillStyle = on ? GOLD : BAND; c.fillRect(x, y, CW, CH);
      c.fillStyle = on ? '#2a1c5c' : INK; c.fillRect(x + 2, y + 2, CW - 4, CH - 4);
      art.drawMiner(c, x + 30, y + 12 + (on ? Math.round(Math.sin(t * 5) * 2) : 0), 3, cl, false, on ? 0.6 : 0, t);
      JB.text(c, cl.name, x + CW / 2, y + 76, 6, on ? WHITE : PINK);
      JB.text(c, cl.gun, x + CW / 2, y + 90, 5, on ? GOLD : '#8f89a8');
    }
    if (Math.floor(t * 2) % 2 === 0) { JB.text(c, 'TAP A MINER, TAP AGAIN TO GO', W / 2, 304, 6, WHITE); }
  };

  Run.prototype.draw = function (c, t, a) {
    if (a === undefined) { a = 1; }
    if (this.phase === 'select') { this.drawSelect(c, t); return; }
    var i, p = this.pl, cam = this.pcam + (this.cam - this.pcam) * a;
    function sx(o) { return JB.snap(c, o.px + (o.x - o.px) * a - cam); }
    function sy(o) { return JB.snap(c, o.py + (o.y - o.py) * a); }

    art.backdrop(c, cam, t);

    /* exit: a drop pod waiting at the end of the cave */
    var ex = JB.snap(c, this.L - 62 - cam);
    if (!this.boss && ex < W + 30) { drawPod(c, ex, t); }

    for (i = 0; i < this.obs.length; i++) {
      var o = this.obs[i], ox = JB.snap(c, o.x - cam);
      if (ox > W + 2 || ox + o.w < -2) { continue; }
      if (o.kind === 'crystal') { drawCrystal(c, ox, o); } else if (o.kind === 'ore') { drawOre(c, ox, o); } else { drawRock(c, ox, o); }
    }

    for (i = 0; i < this.bugs.length; i++) {
      var b = this.bugs[i], B = BUGS[b.type], bx = sx(b);
      if (bx > W + 4 || bx + B.w < -4) { continue; }
      var flap = Math.floor(t * 14 + b.id) % 2 === 0;
      JB.sprite(c, flap ? B.map : B.map2, bx, sy(b), 1, b.flash > 0 ? WHITE : B.pal, b.type === 'gnat' && b.vx > 0);
    }
    if (this.boss) {
      var bo = this.boss;
      var bsx = sx(bo), bsy = sy(bo) + Math.round(Math.sin(t * 6) * 1);
      JB.sprite(c, BOSS, bsx, bsy, 2, bo.flash > 0 ? BOSS_PAL_HURT : BOSS_PAL, bo.face > 0);
      /* Its mouth glows for half a second before it spits: the cue to move. */
      if (bo.timer < 30 && !this.behind(p.x + 6) && Math.floor(t * 12) % 2 === 0) {
        c.fillStyle = '#b7ff5a'; c.fillRect(bo.face < 0 ? bsx + 4 : bsx + BW - 12, bsy + 22, 8, 4);
      }
    }
    for (i = 0; i < this.globs.length; i++) {
      var g = this.globs[i];
      c.fillStyle = '#b7ff5a'; c.fillRect(sx(g) - 2, sy(g) - 2, 4, 4);
      c.fillStyle = '#f4ffd0'; c.fillRect(sx(g) - 1, sy(g) - 1, 2, 2);
    }
    for (i = 0; i < this.shots.length; i++) {
      var s = this.shots[i], x = sx(s), y = sy(s);
      if (s.k === 'p') { c.fillStyle = '#39d0ff'; c.fillRect(x, y, s.w, s.h); c.fillStyle = WHITE; c.fillRect(x + 1, y + 1, 3, 1); }
      else if (s.k === 'r') { c.fillStyle = '#d9d3c7'; c.fillRect(x, y, s.w, s.h); c.fillStyle = '#c0392b'; c.fillRect(x + (s.vx > 0 ? 5 : 0), y, 2, s.h); c.fillStyle = '#ffb347'; c.fillRect(x + (s.vx > 0 ? -3 : 7), y + 1, 3, 2); }
      else { c.fillStyle = '#ffe9a8'; c.fillRect(x, y, 2, 2); }
    }

    for (i = 0; i < this.drops.length; i++) {
      var dr = this.drops[i], sz = 7 * dr.s;
      if (dr.ttl > 0 && dr.ttl < 150 && Math.floor(t * 10) % 2 === 0) { continue; }   /* blink before fading */
      var dx0 = sx(dr), dy0 = sy(dr) + Math.round(Math.sin(t * 4 + dr.id) * 2), col = ICON_PAL[dr.k].X;
      /* pulsing ring */
      var ring = Math.round(2 + (Math.sin(t * 8 + dr.id) + 1) * (dr.s > 1 ? 3 : 1.5));
      c.globalAlpha = 0.45; c.fillStyle = col;
      c.fillRect(dx0 - ring, dy0 - ring, sz + ring * 2, 1); c.fillRect(dx0 - ring, dy0 + sz + ring - 1, sz + ring * 2, 1);
      c.fillRect(dx0 - ring, dy0 - ring, 1, sz + ring * 2); c.fillRect(dx0 + sz + ring - 1, dy0 - ring, 1, sz + ring * 2);
      c.globalAlpha = 1;
      if (dr.k !== 'life') { c.fillStyle = INK; c.fillRect(dx0 - 2, dy0 - 2, sz + 4, sz + 4); }
      JB.sprite(c, ICON[dr.k], dx0, dy0, dr.s, ICON_PAL[dr.k]);
    }
    if (this.freeze === 0 && !this.over && !(this.inv > 0 && this.tick % 8 < 4)) {
      art.drawMiner(c, sx(p), sy(p), 1, this.cls, p.face < 0, this.grace ? 0.3 : (this.thrust ? 1 : 0), t);
    }

    for (i = 0; i < this.fx.length; i++) {
      var q = this.fx[i], qx = JB.snap(c, q.x - cam);
      if (q.k === 'p') { c.fillStyle = q.color; c.fillRect(qx, q.y, 2, 2); }
      else if (q.k === 'f') { var sz = 2 + Math.floor((26 - q.life) / 5); c.fillStyle = q.life > 14 ? '#fff2a8' : (q.life > 7 ? '#ff9a3a' : '#d14b2a'); c.fillRect(qx - sz / 2, q.y - sz / 2, sz, sz); }
      else if (q.k === 'b') { var r = (16 - q.life) * 2.4 + 4; c.fillStyle = q.life > 8 ? '#fff2a8' : '#ff8a2a'; c.fillRect(qx - r, q.y - r / 2, r * 2, r); c.fillRect(qx - r / 2, q.y - r, r, r * 2); }
      else if (q.k === 't') { JB.text(c, q.text, qx, q.y, 5, GOLD); }
    }

    art.lava(c, GROUND, cam, t);
    drawRoof(c, cam);

    /* HUD */
    c.fillStyle = INK; c.fillRect(0, 0, W, TOP - 8);
    for (i = 0; i < this.lives; i++) {
      c.fillStyle = this.cls.pal.H; c.fillRect(6 + i * 11, 5, 8, 6);
      c.fillStyle = this.cls.pal.V; c.fillRect(9 + i * 11, 7, 5, 2);
    }
    JB.text(c, this.score, W / 2, 4, 8, WHITE);
    JB.text(c, 'LVL ' + this.level, W - 6, 5, 6, GOLD, 'right');
    c.fillStyle = BAND; c.fillRect(6, 17, W - 12, 2);
    if (this.boss) {
      /* On a boss level the bar shows the boss's health. */
      c.fillStyle = '#ff5a5a'; c.fillRect(6, 17, Math.round((W - 12) * clamp(this.boss.hp / this.boss.max, 0, 1)), 2);
    } else {
      c.fillStyle = GOLD; c.fillRect(6, 17, Math.round((W - 12) * clamp(p.x / (this.L - 62), 0, 1)), 2);
    }

    /* active boosts: icon and a bar that runs down */
    var by0 = TOP + 4;
    if (this.speedT > 0) {
      JB.sprite(c, ICON.speed, 6, by0, 1, ICON_PAL.speed);
      c.fillStyle = BAND; c.fillRect(16, by0 + 2, 30, 3); c.fillStyle = ICON_PAL.speed.X; c.fillRect(16, by0 + 2, Math.round(30 * this.speedT / BOOST), 3);
      by0 += 10;
    }
    if (this.powerT > 0) {
      JB.sprite(c, ICON.power, 6, by0, 1, ICON_PAL.power);
      c.fillStyle = BAND; c.fillRect(16, by0 + 2, 30, 3); c.fillStyle = ICON_PAL.power.X; c.fillRect(16, by0 + 2, Math.round(30 * this.powerT / BOOST), 3);
    }

    if (this.over) {
      c.fillStyle = 'rgba(18,12,38,0.88)'; c.fillRect(24, 116, W - 48, 72);
      c.fillStyle = GOLD; c.fillRect(24, 116, W - 48, 2); c.fillRect(24, 186, W - 48, 2);
      JB.text(c, 'GAME OVER', W / 2, 130, 12, WHITE);
      JB.text(c, 'SCORE ' + this.score, W / 2, 160, 8, GOLD);
    } else if (this.clear > 0) {
      JB.text(c, 'LEVEL ' + this.level + ' CLEAR', W / 2, 110, 10, WHITE);
      JB.text(c, 'BONUS +' + this.bonus, W / 2, 130, 8, GOLD);
    } else if (this.freeze === 0) {
      if (this.banner > 0) {
        JB.text(c, 'LEVEL ' + this.level, W / 2, 90, 12, WHITE);
        if (this.boss) { JB.text(c, 'BOSS: CAVE TYRANT', W / 2, 110, 7, '#ff5a5a'); JB.text(c, 'GET BEHIND IT. HIT THE GREEN SAC.', W / 2, 124, 5, GOLD); }
        else { JB.text(c, 'REACH THE DROP POD', W / 2, 110, 6, GOLD); }
      } else if (this.bossDown > 0) {
        JB.text(c, 'BOSS DOWN', W / 2, 90, 12, WHITE); JB.text(c, 'GRAB THE HEART, THEN THE DROP POD', W / 2, 110, 5, GOLD);
      }
      if (this.grace && Math.floor(t * 2) % 2 === 0) { JB.text(c, 'HOLD TO FLY', W / 2, 220, 8, WHITE); }
    }
  };

  function scoreScreen(c, t, rows, score) {
    art.backdrop(c, t * 20, t);
    c.fillStyle = 'rgba(18,12,38,0.82)'; c.fillRect(10, 10, W - 20, H - 20);
    JB.text(c, 'SOLE SURVIVOR', W / 2, 24, 10, GOLD);
    JB.text(c, 'HIGH SCORES', W / 2, 52, 8, WHITE);
    JB.drawScores(c, { W: W, y: 78, rows: rows, color: WHITE, dim: PINK, hi: GOLD, band: BAND });
    JB.text(c, 'YOUR SCORE ' + score, W / 2, 262, 8, GOLD);
    if (Math.floor(t * 2) % 2 === 0) { JB.text(c, 'GRAB ANOTHER COIN', W / 2, 296, 7, WHITE); }
  }

  game.tip = 'HOLD: BOOTS.  SWIPE SIDEWAYS OR ARROWS: TURN.  SWIPE DOWN: STOP.  GUNS FIRE THEMSELVES.';
  game.controls = 'swipe';
  game.scoreScreen = scoreScreen;
  game.create = function (seed, hi) { return new Run(seed, hi); };
})();
