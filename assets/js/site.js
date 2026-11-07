/* LAR @ UNIBO — site interactions (no dependencies) */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header: solid after scrolling, mobile menu ---------- */
  function initHeader() {
    var header = document.querySelector('[data-header]');
    if (!header) return;

    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 24); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var toggle = header.querySelector('[data-nav-toggle]');
    if (!toggle) return;
    var setOpen = function (open) {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', function () { setOpen(!header.classList.contains('is-open')); });
    header.querySelectorAll('.site-nav a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 860) setOpen(false); });
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!els.length) return;

    // Stagger siblings inside the same parent.
    els.forEach(function (el) {
      var sibs = Array.prototype.filter.call(el.parentElement.children, function (c) { return c.classList.contains('reveal'); });
      var i = sibs.indexOf(el);
      if (i > 0) el.style.setProperty('--d', String(Math.min(i, 6)));
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Sub-navigation scrollspy ---------- */
  function initSubnav() {
    var nav = document.querySelector('[data-subnav]');
    if (!nav || !('IntersectionObserver' in window)) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
    var map = {};
    var targets = links.map(function (a) {
      var t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (t) map[t.id] = a;
      return t;
    }).filter(Boolean);
    var current = null;
    var setActive = function (id) {
      if (current === id) return;
      current = id;
      links.forEach(function (a) { a.classList.remove('is-active'); });
      var a = map[id];
      if (a) {
        a.classList.add('is-active');
        var strip = a.parentElement;
        var left = a.offsetLeft - strip.clientWidth / 2 + a.clientWidth / 2;
        strip.scrollTo({ left: left, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    };
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      for (var i = 0; i < targets.length; i++) {
        if (visible[targets[i].id]) { setActive(targets[i].id); return; }
      }
    }, { rootMargin: '-140px 0px -55% 0px' });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ---------- Long abstracts: clamp with "Read full abstract" ---------- */
  function initClamp() {
    document.querySelectorAll('[data-clamp]').forEach(function (el) {
      var btn = el.parentElement.querySelector('[data-clamp-toggle]');
      if (!btn) return;
      var lh = parseFloat(window.getComputedStyle(el).lineHeight) || 26;
      if (el.scrollHeight <= lh * 6.5) return;
      el.classList.add('is-clamped');
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var clamped = el.classList.toggle('is-clamped');
        btn.setAttribute('aria-expanded', String(!clamped));
        btn.textContent = clamped ? 'Read full abstract' : 'Show less';
      });
    });
  }

  /* ---------- Hero "cables": a tiny verlet rope simulation ----------
     A nod to our deformable-linear-object research. Ropes sag under
     gravity, sway slowly and are pushed away by the pointer. */
  function initCables(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    var host = canvas.parentElement;
    var calm = canvas.hasAttribute('data-calm');
    var count = parseInt(canvas.getAttribute('data-cables'), 10) || 6;
    // Light blues of the logo-navy hue, plus one red cable like the one in the LAR logo.
    var COLORS = ['156,203,234', '74,140,190', '196,220,238'];
    var ACCENT = '224,72,72';
    var STEP = 1 / 60;
    var W = 0, H = 0, ropes = [], t = 0, acc = 0, last = 0, raf = 0, inView = true;
    var mouse = { x: -1e4, y: -1e4 };

    function rng(seed) {
      return function () {
        seed = (seed + 0x6D2B79F5) | 0;
        var r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    }

    function build() {
      var rect = host.getBoundingClientRect();
      W = rect.width; H = rect.height;
      if (!W || !H) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var rand = rng(calm ? 11 : 5);
      var n = Math.max(22, Math.min(56, Math.round(W / 32)));
      ropes = [];
      for (var k = 0; k < count; k++) {
        var accent = k === Math.floor(count / 2);
        var ay = H * (0.3 + 0.62 * rand()), by = H * (0.2 + 0.72 * rand());
        var ax = -60, bx = W + 60;
        var span = Math.hypot(bx - ax, by - ay);
        var slack = 1.008 + 0.045 * rand();
        var pts = [];
        for (var i = 0; i < n; i++) {
          var f = i / (n - 1), x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
          pts.push({ x: x, y: y, px: x, py: y });
        }
        ropes.push({
          pts: pts,
          seg: span * slack / (n - 1),
          a: { x: ax, y: ay }, b: { x: bx, y: by },
          color: accent ? ACCENT : COLORS[k % COLORS.length],
          alpha: (accent ? 0.9 : 0.16 + 0.34 * rand()) * (calm ? 0.75 : 1),
          width: accent ? 2.2 : 0.8 + 2.6 * rand() * rand(),
          nodes: !accent && rand() > 0.55,
          glow: accent,
          phase: rand() * Math.PI * 2,
          speed: 0.35 + 0.55 * rand()
        });
      }
      for (var s = 0; s < 260; s++) step(); // let the ropes settle before the first frame
    }

    function step() {
      t += STEP;
      var R = 150, R2 = R * R, sway = calm ? 0.6 : 1;
      for (var r = 0; r < ropes.length; r++) {
        var rope = ropes[r], p = rope.pts, n = p.length, i, q;
        for (i = 1; i < n - 1; i++) {
          q = p[i];
          var vx = (q.x - q.px) * 0.965, vy = (q.y - q.py) * 0.965;
          q.px = q.x; q.py = q.y;
          var fx = Math.cos(t * rope.speed * 0.7 + i * 0.12 + rope.phase) * 0.012 * sway;
          var fy = 0.05 + Math.sin(t * rope.speed + i * 0.22 + rope.phase) * 0.035 * sway;
          var dx = q.x - mouse.x, dy = q.y - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            var d = Math.sqrt(d2) || 1, push = (1 - d / R) * 1.3;
            fx += dx / d * push; fy += dy / d * push;
          }
          q.x += vx + fx; q.y += vy + fy;
        }
        p[0].x = rope.a.x; p[0].y = rope.a.y;
        p[n - 1].x = rope.b.x; p[n - 1].y = rope.b.y;
        for (var it = 0; it < 6; it++) {
          for (i = 0; i < n - 1; i++) {
            var A = p[i], B = p[i + 1];
            var ex = B.x - A.x, ey = B.y - A.y, dist = Math.sqrt(ex * ex + ey * ey) || 1e-6;
            var k = (dist - rope.seg) / dist;
            var pinA = i === 0, pinB = i + 1 === n - 1;
            if (pinA) { B.x -= ex * k; B.y -= ey * k; }
            else if (pinB) { A.x += ex * k; A.y += ey * k; }
            else { A.x += ex * k * 0.5; A.y += ey * k * 0.5; B.x -= ex * k * 0.5; B.y -= ey * k * 0.5; }
          }
        }
      }
    }

    function tracePath(p) {
      var n = p.length;
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (var i = 1; i < n - 2; i++) {
        ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
      }
      ctx.quadraticCurveTo(p[n - 2].x, p[n - 2].y, p[n - 1].x, p[n - 1].y);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (var r = 0; r < ropes.length; r++) {
        var rope = ropes[r];
        tracePath(rope.pts);
        if (rope.glow) {
          ctx.strokeStyle = 'rgba(' + rope.color + ',0.14)';
          ctx.lineWidth = rope.width * 5;
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(' + rope.color + ',' + rope.alpha + ')';
        ctx.lineWidth = rope.width;
        ctx.stroke();
        if (rope.nodes) {
          ctx.fillStyle = 'rgba(' + rope.color + ',' + Math.min(1, rope.alpha + 0.3) + ')';
          for (var i = 3; i < rope.pts.length - 2; i += 4) {
            ctx.beginPath();
            ctx.arc(rope.pts[i].x, rope.pts[i].y, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    function frame(now) {
      raf = 0;
      var dt = last ? Math.min((now - last) / 1000, 0.1) : STEP;
      last = now;
      acc += dt;
      while (acc >= STEP) { step(); acc -= STEP; }
      draw();
      if (inView && !document.hidden) raf = window.requestAnimationFrame(frame);
    }
    function start() {
      if (reduceMotion || raf || !inView || document.hidden) return;
      last = 0;
      raf = window.requestAnimationFrame(frame);
    }

    build();
    draw();
    if (reduceMotion) return;

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) start();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', start);
    window.addEventListener('pointermove', function (e) {
      var rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }, { passive: true });
    document.addEventListener('pointerleave', function () { mouse.x = mouse.y = -1e4; });

    var resizeTimer = 0, lastW = W;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        // Mobile browsers fire resize when the URL bar hides; only rebuild on width changes.
        if (Math.abs(host.getBoundingClientRect().width - lastW) < 1) return;
        build(); draw(); lastW = W;
      }, 150);
    });
    start();
  }

  /* ---------- Hero: two robot arms shaping a cable ----------
     Inspired by the running example of the shape-servoing tutorial: two planar
     3R arms hold an elastic cable. Drag a gripper to move it, drag its ring to
     rotate it, or drag the cable to move both. The cable is an inextensible
     elastic rod (elastica) clamped in both grippers; its equilibrium is found
     with a few Newton steps per frame on the segment angles, with a Lagrange
     multiplier enforcing that the cable ends on the second gripper. */
  function initRobots(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    var hero = canvas.parentElement;
    var stageEl = hero.querySelector('[data-stage]');
    var hintEl = hero.querySelector('[data-hint="robots"]');
    if (!ctx || !stageEl) return;

    var M = 32;                                   // cable segments
    var GRAVITY = 1.5;                            // dimensionless weight (rho g L^3 / EI): a little sag
    var STEEL = '196,220,238', SKY = '156,203,234', NIGHT = '3,25,42', RED = '224,72,72';
    var W = 0, H = 0, stage, floorY, S, arm, bases, home, rodLen, h;
    var grips = null, theta = [], lam = [0, 0], nodes = [], good = null;
    var drag = null, hover = null, t = 0, last = 0, acc = 0, raf = 0, inView = true, interacted = false;
    var hold = [0, 0];

    function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
    function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

    function layout() {
      var hr = hero.getBoundingClientRect(), sr = stageEl.getBoundingClientRect();
      W = hr.width; H = hr.height;
      if (!W || !H || !sr.width) return false;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stage = { x: sr.left - hr.left, y: sr.top - hr.top, w: sr.width, h: sr.height };
      floorY = stage.y + stage.h - 4;
      S = Math.min(stage.h * 0.92, stage.w * 0.72);            // scene scale (like the demo's view height)
      arm = { l1: 0.47 * S, l2: 0.41 * S, l3: 0.09 * S, w: [0.026 * S, 0.02 * S, 0.014 * S] };
      bases = [[stage.x + 0.1 * stage.w, floorY - 0.07 * S], [stage.x + 0.9 * stage.w, floorY - 0.07 * S]];
      home = [{ x: stage.x + 0.32 * stage.w, y: floorY - 0.5 * S, a: -0.9 },
              { x: stage.x + 0.68 * stage.w, y: floorY - 0.5 * S, a: Math.PI + 0.9 }];
      rodLen = 1.6 * dist(home[0].x, home[0].y, home[1].x, home[1].y);   // slack cable: an arch between the grippers
      h = rodLen / M;
      grips = home.map(function (q) { return { x: q.x, y: q.y, a: q.a, tx: q.x, ty: q.y, ta: q.a }; });
      resetRod();
      for (var k = 0; k < 40; k++) solveRod(1);
      return true;
    }

    // ------------------------------------------------------------ cable (elastica)
    function endAngles() {
      var a0 = grips[0].a, a1 = grips[1].a + Math.PI;   // last segment points from the cable into the right gripper
      if (theta.length) {                               // keep angles continuous (no 2*pi jumps)
        a0 = theta[0] + angDiff(theta[0], a0);
        a1 = theta[M - 1] + angDiff(theta[M - 1], a1);
      }
      return [a0, a1];
    }
    function resetRod() {
      theta = [];
      var e = endAngles(), a0 = e[0], a1 = a0 + angDiff(a0, e[1]);
      for (var k = 0; k < M; k++) theta.push(a0 + (a1 - a0) * k / (M - 1));
      lam = [0, 0];
    }
    function residualNorm(F) { var r = 0; for (var i = 0; i < F.length; i++) r += F[i] * F[i]; return Math.sqrt(r); }

    // One Newton step on the KKT conditions of  min sum (dtheta)^2/h - w*sum(y)  s.t. sum h*(cos,sin) = D.
    function newtonStep() {
      var e = endAngles(); theta[0] = e[0]; theta[M - 1] = e[1];
      var D = [grips[1].x - grips[0].x, grips[1].y - grips[0].y];
      var w = GRAVITY * h / (rodLen * rodLen * rodLen) * 2;
      var nf = M - 2, n = nf + 2, F = new Array(n), J = [], i, j, k, c, sn;
      for (i = 0; i < n; i++) { J.push(new Array(n + 1).fill(0)); }
      var cx = 0, cy = 0;
      for (k = 0; k < M; k++) { cx += h * Math.cos(theta[k]); cy += h * Math.sin(theta[k]); }
      for (i = 0; i < nf; i++) {
        k = i + 1; c = Math.cos(theta[k]); sn = Math.sin(theta[k]);
        F[i] = (2 * theta[k] - theta[k - 1] - theta[k + 1]) * 2 / h - w * h * c * (M - k) + lam[0] * h * sn - lam[1] * h * c;
        J[i][i] = 4 / h + w * h * sn * (M - k) + lam[0] * h * c + lam[1] * h * sn;
        if (i > 0) J[i][i - 1] = -2 / h;
        if (i < nf - 1) J[i][i + 1] = -2 / h;
        J[i][nf] = h * sn; J[i][nf + 1] = -h * c;
        J[nf][i] = h * sn; J[nf + 1][i] = -h * c;
      }
      F[nf] = -(cx - D[0]); F[nf + 1] = -(cy - D[1]);
      for (i = 0; i < n; i++) J[i][n] = -F[i];
      for (i = 0; i < n; i++) {                       // Gaussian elimination with partial pivoting
        var piv = i;
        for (j = i + 1; j < n; j++) if (Math.abs(J[j][i]) > Math.abs(J[piv][i])) piv = j;
        if (Math.abs(J[piv][i]) < 1e-12) return Infinity;
        var tmp = J[i]; J[i] = J[piv]; J[piv] = tmp;
        for (j = i + 1; j < n; j++) {
          var f = J[j][i] / J[i][i];
          if (!f) continue;
          for (var m = i; m <= n; m++) J[j][m] -= f * J[i][m];
        }
      }
      var dx = new Array(n);
      for (i = n - 1; i >= 0; i--) {
        var sum = J[i][n];
        for (j = i + 1; j < n; j++) sum -= J[i][j] * dx[j];
        dx[i] = sum / J[i][i];
      }
      var maxStep = 0;
      for (i = 0; i < nf; i++) maxStep = Math.max(maxStep, Math.abs(dx[i]));
      var sc = maxStep > 0.35 ? 0.35 / maxStep : 1;    // limit the step: smooth, no wild jumps
      for (i = 0; i < nf; i++) theta[i + 1] += sc * dx[i];
      lam[0] += sc * dx[nf]; lam[1] += sc * dx[nf + 1];
      return residualNorm(F);
    }

    function solveRod(iters) {
      var r = Infinity;
      for (var it = 0; it < iters; it++) {
        r = newtonStep();
        if (!isFinite(r) || theta.some(function (v) { return !isFinite(v); })) {
          if (good) { theta = good.theta.slice(); lam = good.lam.slice(); } else resetRod();
          break;
        }
      }
      if (isFinite(r)) good = { theta: theta.slice(), lam: lam.slice() };
      nodes = [{ x: grips[0].x, y: grips[0].y }];
      for (var k = 0; k < M; k++) {
        var p = nodes[k];
        nodes.push({ x: p.x + h * Math.cos(theta[k]), y: p.y + h * Math.sin(theta[k]) });
      }
    }

    // ------------------------------------------------------------ arms
    // Planar 3R arm reaching the gripper with the cable leaving it along angle a (elbow up).
    function armPose(base, g) {
      var wx = g.x - arm.l3 * Math.cos(g.a), wy = g.y - arm.l3 * Math.sin(g.a);
      var dx = wx - base[0], dy = wy - base[1], r = Math.hypot(dx, dy);
      var rMax = arm.l1 + arm.l2 - 1, rMin = Math.abs(arm.l1 - arm.l2) + 1;
      if (r > rMax || r < rMin) { var f = Math.min(Math.max(r, rMin), rMax) / Math.max(r, 1e-6); dx *= f; dy *= f; r = Math.hypot(dx, dy); }
      var c2 = Math.min(1, Math.max(-1, (r * r - arm.l1 * arm.l1 - arm.l2 * arm.l2) / (2 * arm.l1 * arm.l2)));
      var s2 = Math.sqrt(1 - c2 * c2), phi = Math.atan2(dy, dx), best = null;
      [1, -1].forEach(function (sg) {
        var t1 = phi - Math.atan2(arm.l2 * sg * s2, arm.l1 + arm.l2 * c2);
        var e = [base[0] + arm.l1 * Math.cos(t1), base[1] + arm.l1 * Math.sin(t1)];
        if (!best || e[1] < best[1]) best = e;                 // screen y grows downwards: smaller y = higher elbow
      });
      return { base: base, elbow: best, wrist: [base[0] + dx, base[1] + dy], tip: [g.x, g.y] };
    }

    // Keep a requested gripper pose feasible: inside the stage, above the floor,
    // within the arm's reach and no farther from the other gripper than the cable allows.
    function constrain(i, x, y, a) {
      var m = 0.06 * S;
      x = Math.min(Math.max(x, stage.x + m), stage.x + stage.w - m);
      y = Math.min(Math.max(y, stage.y + 0.12 * S), floorY - 0.12 * S);
      var b = bases[i], wx = x - arm.l3 * Math.cos(a), wy = y - arm.l3 * Math.sin(a);
      var r = dist(wx, wy, b[0], b[1]), rMax = arm.l1 + arm.l2 - 2;
      if (r > rMax) { x -= (wx - b[0]) * (1 - rMax / r); y -= (wy - b[1]) * (1 - rMax / r); }
      var o = grips[1 - i], d = dist(x, y, o.x, o.y), dMax = rodLen * 0.95;
      if (d > dMax) { x = o.x + (x - o.x) * dMax / d; y = o.y + (y - o.y) * dMax / d; }
      return { x: x, y: y, a: a };
    }

    function idleTarget(i) {
      // Mostly mirror-symmetric sway (the cable keeps an arch), with a small asymmetric part.
      var q = home[i], sg = i ? -1 : 1, amp = reduceMotion ? 0 : 1;
      return { x: q.x + amp * sg * 0.035 * stage.w * Math.sin(t * 0.42),
               y: q.y + amp * (0.05 * S * Math.sin(t * 0.31 + 1) + 0.015 * S * sg * Math.sin(t * 0.23)),
               a: q.a + amp * sg * (0.18 * Math.sin(t * 0.27) + 0.06 * Math.sin(t * 0.19 + 2)) };
    }

    function step() {
      t += 1 / 60;
      var now = performance.now();
      for (var i = 0; i < 2; i++) {
        var g = grips[i], dragging = drag && (drag.side === i || drag.side === 2);
        if (!dragging && now > hold[i]) { var it = idleTarget(i); g.tx = it.x; g.ty = it.y; g.ta = it.a; }
        var k = dragging ? 0.3 : 0.035;
        g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k; g.a += angDiff(g.a, g.ta) * k;
      }
      var o = grips[1], d = dist(grips[0].x, grips[0].y, o.x, o.y);
      if (d > rodLen * 0.97) {                           // never ask the cable to stretch
        o.x = grips[0].x + (o.x - grips[0].x) * rodLen * 0.97 / d; o.y = grips[0].y + (o.y - grips[0].y) * rodLen * 0.97 / d;
      }
      solveRod(3);
    }

    // ------------------------------------------------------------ drawing
    function line(a, b, color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    function disc(p, r, fill, stroke, lw) {
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }
    function handlePos(g) {
      var nx = Math.sin(g.a), ny = -Math.cos(g.a);
      if (ny > 0) { nx = -nx; ny = -ny; }
      return [g.x + nx * 0.17 * S, g.y + ny * 0.17 * S];
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var fx0 = stage.x - 0.04 * stage.w, fx1 = stage.x + stage.w * 1.04;
      var grad = ctx.createLinearGradient(fx0, 0, fx1, 0);
      grad.addColorStop(0, 'rgba(' + SKY + ',0)'); grad.addColorStop(0.15, 'rgba(' + SKY + ',.28)');
      grad.addColorStop(0.85, 'rgba(' + SKY + ',.28)'); grad.addColorStop(1, 'rgba(' + SKY + ',0)');
      line([fx0, floorY], [fx1, floorY], grad, 1.5);
      for (var i = 0; i < 2; i++) {
        var pose = armPose(bases[i], grips[i]), chain = [pose.base, pose.elbow, pose.wrist, pose.tip], b = pose.base;
        ctx.fillStyle = 'rgba(' + SKY + ',.16)'; ctx.strokeStyle = 'rgba(' + SKY + ',.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(b[0] - 0.03 * S, b[1]); ctx.lineTo(b[0] + 0.03 * S, b[1]);
        ctx.lineTo(b[0] + 0.085 * S, floorY); ctx.lineTo(b[0] - 0.085 * S, floorY); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (var k = 0; k < 3; k++) {
          line(chain[k], chain[k + 1], 'rgba(' + STEEL + ',' + (k === 0 ? .5 : .62) + ')', arm.w[k]);
          line(chain[k], chain[k + 1], 'rgba(' + NIGHT + ',.55)', Math.max(1, arm.w[k] * 0.18));
        }
        [pose.base, pose.elbow, pose.wrist].forEach(function (j) {
          disc(j, 0.017 * S, 'rgb(' + NIGHT + ')', 'rgba(' + STEEL + ',.85)', Math.max(1.5, 0.006 * S));
        });
      }
      // cable: glow, core, tracked points
      ctx.beginPath(); ctx.moveTo(nodes[0].x, nodes[0].y);
      for (var j = 1; j < M - 1; j++) ctx.quadraticCurveTo(nodes[j].x, nodes[j].y, (nodes[j].x + nodes[j + 1].x) / 2, (nodes[j].y + nodes[j + 1].y) / 2);
      ctx.quadraticCurveTo(nodes[M - 1].x, nodes[M - 1].y, nodes[M].x, nodes[M].y);
      ctx.strokeStyle = 'rgba(' + RED + ',.18)'; ctx.lineWidth = 0.045 * S; ctx.stroke();
      ctx.strokeStyle = 'rgb(' + RED + ')'; ctx.lineWidth = Math.max(3, 0.015 * S); ctx.stroke();
      [0.2, 0.35, 0.5, 0.65, 0.8].forEach(function (f) {
        var nd = nodes[Math.round(f * M)];
        disc([nd.x, nd.y], Math.max(2.5, 0.011 * S), 'rgb(' + NIGHT + ')', 'rgba(255,255,255,.9)', 1.5);
      });
      grips.forEach(function (g, side) {
        var c = Math.cos(g.a), s = Math.sin(g.a), nx = -s, ny = c;
        var active = (drag && (drag.side === side || drag.side === 2)) || (hover && hover.side === side);
        var col = active ? 'rgb(' + SKY + ')' : 'rgba(232,241,248,.95)';
        var open = (active ? 0.042 : 0.036) * S, bx = g.x - 0.02 * S * c, by = g.y - 0.02 * S * s, lw = Math.max(2.4, 0.016 * S);
        [1, -1].forEach(function (sg) {
          var ax = bx + sg * open * nx, ay = by + sg * open * ny;
          line([ax, ay], [ax + 0.095 * S * c, ay + 0.095 * S * s], col, lw);
        });
        line([bx + open * nx, by + open * ny], [bx - open * nx, by - open * ny], col, lw);
        var hp = handlePos(g), ring = hover && hover.side === side && hover.mode === 'angle';
        ctx.setLineDash([3, 3]);
        line([g.x, g.y], hp, 'rgba(' + SKY + ',' + (active ? .55 : .25) + ')', 1.2);
        ctx.setLineDash([]);
        disc(hp, (ring ? 0.034 : 0.027) * S, 'rgba(' + NIGHT + ',.9)', 'rgba(' + SKY + ',' + (active ? .95 : .55) + ')', 2);
      });
    }

    // ------------------------------------------------------------ interaction
    function local(e) { var r = hero.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function hit(p) {
      for (var i = 0; i < 2; i++) { var hp = handlePos(grips[i]); if (dist(p[0], p[1], hp[0], hp[1]) < 0.06 * S + 6) return { side: i, mode: 'angle' }; }
      for (i = 0; i < 2; i++) if (dist(p[0], p[1], grips[i].x, grips[i].y) < 0.09 * S + 8) return { side: i, mode: 'grip' };
      for (var j = 3; j < M - 2; j++) if (dist(p[0], p[1], nodes[j].x, nodes[j].y) < 0.04 * S + 6) return { side: 2, mode: 'body' };
      return null;
    }
    function startDrag(e) {
      if (canvas.hidden || !grips || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.target.closest && e.target.closest('a, button, input, label')) return;
      var p = local(e), hh = hit(p);
      if (!hh) return;
      e.preventDefault();
      drag = { side: hh.side, mode: hh.mode, p0: p, g0: grips.map(function (g) { return { x: g.tx, y: g.ty, a: g.ta }; }) };
      try { hero.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!interacted) { interacted = true; if (hintEl) hintEl.classList.add('is-hidden'); }
      start();
    }
    function moveDrag(e) {
      var p = local(e);
      if (canvas.hidden) return;
      if (!drag) {
        if (e.pointerType === 'touch' || !grips) return;
        if (e.target.closest && e.target.closest('a, button')) { hover = null; hero.style.cursor = ''; return; }
        hover = hit(p);
        hero.style.cursor = hover ? (hover.mode === 'angle' ? 'grab' : 'move') : '';
        if (reduceMotion) draw();
        return;
      }
      var dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1], q;
      if (drag.mode === 'angle') {
        var g = grips[drag.side], ha = Math.atan2(p[1] - g.y, p[0] - g.x);
        var a1 = ha + Math.PI / 2, a2 = ha - Math.PI / 2;
        q = constrain(drag.side, g.tx, g.ty, Math.abs(angDiff(g.ta, a1)) < Math.abs(angDiff(g.ta, a2)) ? a1 : a2);
        g.ta = q.a;
      } else {
        [0, 1].forEach(function (i) {
          if (drag.side !== i && drag.side !== 2) return;
          var g0 = drag.g0[i];
          q = constrain(i, g0.x + dx, g0.y + dy, g0.a);
          grips[i].tx = q.x; grips[i].ty = q.y;
        });
      }
    }
    function endDrag() {
      if (!drag) return;
      var until = performance.now() + 4000;
      if (drag.side === 0 || drag.side === 2) hold[0] = until;
      if (drag.side === 1 || drag.side === 2) hold[1] = until;
      drag = null;
      hero.style.cursor = '';
    }
    hero.addEventListener('pointerdown', startDrag);
    hero.addEventListener('pointermove', moveDrag);
    hero.addEventListener('pointerup', endDrag);
    hero.addEventListener('pointercancel', endDrag);
    hero.addEventListener('pointerleave', function () { if (!drag) { hover = null; hero.style.cursor = ''; } });
    // On touch screens, a touch that starts on a gripper drags it instead of scrolling the page.
    hero.addEventListener('touchstart', function (e) {
      if (canvas.hidden || !grips || !e.touches.length) return;
      var r = hero.getBoundingClientRect(), tch = e.touches[0];
      if (hit([tch.clientX - r.left, tch.clientY - r.top])) e.preventDefault();
    }, { passive: false });

    // ------------------------------------------------------------ loop
    var STEP = 1 / 60, settleFrames = 0;
    function frame(now) {
      raf = 0;
      var dt = last ? Math.min((now - last) / 1000, 0.1) : STEP;
      last = now; acc += dt;
      var n = 0;
      while (acc >= STEP && n++ < 4) { step(); acc -= STEP; }
      if (n >= 4) acc = 0;
      draw();
      var keepGoing = reduceMotion && !drag ? settleFrames-- > 0 : true;
      if (inView && !document.hidden && keepGoing) raf = window.requestAnimationFrame(frame);
    }
    function start() {
      settleFrames = 120;
      if (raf || !inView || document.hidden) return;
      last = 0;
      raf = window.requestAnimationFrame(frame);
    }

    if (!layout()) return;
    draw();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && Math.abs(hero.getBoundingClientRect().width - lastW) >= 1 && layout()) lastW = W;
        if (inView) { if (reduceMotion) draw(); else start(); }
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () { if (!reduceMotion) start(); });
    var resizeTimer = 0, lastW = W;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (Math.abs(hero.getBoundingClientRect().width - lastW) < 1) return;
        if (layout()) { draw(); lastW = W; }
      }, 150);
    });
    if (!reduceMotion) start();
  }

  /* ---------- Hero: sEMG-driven robotic hand with shared autonomy ----------
     Press and hold to "contract": a simulated sEMG signal bursts, its envelope
     closes an underactuated hand (each joint stops when its finger touches the
     object, so the fingers wrap around it). After contact the signal sets the
     grip force; with shared autonomy on, the robot keeps the force inside a
     safe band, otherwise squeezing too hard crushes the object. */
  function initHands(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    var hero = canvas.parentElement;
    var stageEl = hero.querySelector('[data-stage]');
    var hintEl = hero.querySelector('[data-hint="hands"]');
    var toggle = hero.querySelector('[data-autonomy]');
    if (!ctx || !stageEl) return;

    var STEEL = '196,220,238', SKY = '156,203,234', NIGHT = '3,25,42', RED = '224,72,72', GREEN = '52,199,128';
    var F_MIN = 0.35, F_MAX = 0.7, NS = 240;
    var W = 0, H = 0, stage, S, palm, ball, fingers, emgBox, gaugeBox;
    var pressed = false, act = 0, env = 0, c = 0, raw = [], envHist = [];
    var autonomy = true, userForce = 0, force = 0, alpha = 0, contactC = null, squash = 0, crushed = 0, crushTimer = 0;
    var t = 0, last = 0, acc = 0, raf = 0, inView = false, lastUser = -1e9, lastW = 0;

    for (var i0 = 0; i0 < NS; i0++) { raw.push(0); envHist.push(0); }

    function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

    function layout() {
      var hr = hero.getBoundingClientRect(), sr = stageEl.getBoundingClientRect();
      W = hr.width; H = hr.height;
      if (!W || !H || !sr.width) return false;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stage = { x: sr.left - hr.left, y: sr.top - hr.top, w: sr.width, h: sr.height };
      S = Math.min(stage.h * 0.95, stage.w * 1.05);
      var cx = stage.x + 0.64 * stage.w, py = stage.y + 0.33 * stage.h;
      palm = { x: cx - 0.15 * S, y: py, w: 0.3 * S, h: 0.06 * S, cx: cx };
      ball = { x: cx, y: py + palm.h + 0.165 * S, r: 0.092 * S };
      var w = [0.026 * S, 0.021 * S, 0.016 * S];
      fingers = [
        { base: [palm.x + palm.w - 0.02 * S, py + palm.h], len: [0.115 * S, 0.09 * S, 0.068 * S], max: [1.25, 1.35, 1.2], sign: 1, w: w, th: [0, 0, 0], back: true },
        { base: [palm.x + palm.w - 0.035 * S, py + palm.h], len: [0.12 * S, 0.095 * S, 0.07 * S], max: [1.3, 1.4, 1.25], sign: 1, w: w, th: [0, 0, 0] },
        { base: [palm.x + 0.03 * S, py + palm.h], len: [0.11 * S, 0.085 * S], max: [1.25, 1.3], sign: -1, w: w, th: [0, 0] }
      ];
      emgBox = { x: stage.x, y: stage.y + 0.76 * stage.h, w: 0.56 * stage.w, h: 0.22 * stage.h };
      gaugeBox = { x: stage.x + 0.62 * stage.w, y: stage.y + 0.76 * stage.h, w: 0.38 * stage.w, h: 0.22 * stage.h };
      return true;
    }

    // ------------------------------------------------------------ hand kinematics and contact
    function pose(f) {
      var pts = [f.base.slice()], phi = Math.PI / 2;            // fingers start pointing down
      for (var k = 0; k < f.len.length; k++) {
        phi += f.sign * f.th[k];
        var p = pts[k];
        pts.push([p[0] + f.len[k] * Math.cos(phi), p[1] + f.len[k] * Math.sin(phi)]);
      }
      return pts;
    }
    function segDist(px, py, a, b) {
      var vx = b[0] - a[0], vy = b[1] - a[1], wx = px - a[0], wy = py - a[1];
      var u = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy || 1), 0, 1);
      return Math.hypot(px - (a[0] + u * vx), py - (a[1] + u * vy));
    }
    function ballR() { return ball.r * (1 - 0.12 * squash); }
    function gap(f, from) {
      var pts = pose(f), g = Infinity;
      for (var k = from; k < f.len.length; k++) g = Math.min(g, segDist(ball.x, ball.y, pts[k], pts[k + 1]) - ballR() - f.w[k] / 2);
      return g;
    }
    // Close each joint from open towards its target and stop at the first contact
    // (sweeping, not only testing the end angle, so a finger cannot pass through the object).
    function closeFinger(f, closure) {
      for (var k = 0; k < f.len.length; k++) {
        var target = closure * f.max[k], steps = Math.max(1, Math.ceil(target / 0.05)), prev = 0, hitAt = -1;
        for (var i = 1; i <= steps; i++) {
          f.th[k] = target * i / steps;
          if (gap(f, k) < 0) { hitAt = f.th[k]; break; }
          prev = f.th[k];
        }
        if (hitAt < 0) { f.th[k] = target; continue; }
        var lo = prev, hi = hitAt;                           // refine the contact angle
        for (var it = 0; it < 10; it++) { f.th[k] = (lo + hi) / 2; if (gap(f, k) < 0) hi = f.th[k]; else lo = f.th[k]; }
        f.th[k] = lo;
      }
    }
    function touching(f) { return gap(f, 0) < 1.5; }

    // ------------------------------------------------------------ simulation
    function step() {
      t += 1 / 60;
      var virtual = !reduceMotion && t * 1000 - lastUser > 7000 && (t % 6) > 1.5 && (t % 6) < 4.2;  // idle: a "virtual user" grasps
      var target = pressed || virtual ? 1 : 0;
      act += (target - act) * (target > act ? 0.12 : 0.07);
      for (var k = 0; k < 2; k++) {
        var smp = gauss() * (0.05 + 0.95 * act) * (0.75 + 0.5 * Math.random());
        raw.push(clamp(smp / 2.6, -1, 1)); raw.shift();
        env += (Math.abs(smp) * 1.25 - env) * 0.05;
      }
      envHist.push(clamp(env, 0, 1)); envHist.shift();
      var cTarget = clamp((env - 0.06) / 0.75, 0, 1);
      c += (cTarget - c) * 0.15;
      fingers.forEach(function (f) { closeFinger(f, c); });

      var both = touching(fingers[1]) && touching(fingers[2]);
      if (both) { if (contactC === null) contactC = c; userForce = clamp((c - contactC) / 0.3, 0, 1.3); }
      else { contactC = null; userForce = 0; }
      var intent = env > 0.12, safe = clamp(userForce, F_MIN, F_MAX), aTarget = 0;
      if (autonomy && both && intent) aTarget = clamp(Math.abs(userForce - safe) / 0.12, 0, 1);
      alpha += (aTarget - alpha) * 0.2;
      force = both ? userForce + alpha * (safe - userForce) : 0;

      squash += (clamp(force * 0.55, 0, 0.75) - squash) * 0.2;
      if (force > F_MAX + 0.08) { crushTimer += 1 / 60; if (crushTimer > 0.45) crushed = Math.min(1, crushed + 0.08); }
      else { crushTimer = 0; if (force < 0.1) crushed = Math.max(0, crushed - 0.02); }
    }

    // ------------------------------------------------------------ drawing
    function line(a, b, color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    function disc(p, r, fill, stroke, lw) {
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }
    function rrect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
    function label(text, x, y, color, align) {
      ctx.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x, y);
    }
    function drawFinger(f) {
      var pts = pose(f), a = f.back ? .32 : 1, touch = touching(f);
      for (var k = 0; k < f.len.length; k++) {
        line(pts[k], pts[k + 1], 'rgba(' + STEEL + ',' + (0.62 * a) + ')', f.w[k]);
        line(pts[k], pts[k + 1], 'rgba(' + NIGHT + ',' + (0.55 * a) + ')', Math.max(1, f.w[k] * 0.18));
      }
      for (k = 0; k < f.len.length; k++) disc(pts[k], 0.016 * S, 'rgba(' + NIGHT + ',' + a + ')', 'rgba(' + STEEL + ',' + (0.85 * a) + ')', Math.max(1.5, 0.006 * S));
      var tip = pts[pts.length - 1];
      disc(tip, 0.011 * S, touch && !f.back ? 'rgb(' + RED + ')' : 'rgba(' + STEEL + ',' + (0.8 * a) + ')');
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // table under the object
      var ty = ball.y + ball.r + 2, grad = ctx.createLinearGradient(ball.x - 0.32 * S, 0, ball.x + 0.32 * S, 0);
      grad.addColorStop(0, 'rgba(' + SKY + ',0)'); grad.addColorStop(0.5, 'rgba(' + SKY + ',.35)'); grad.addColorStop(1, 'rgba(' + SKY + ',0)');
      line([ball.x - 0.32 * S, ty], [ball.x + 0.32 * S, ty], grad, 1.5);
      // wrist mount
      var wrist = [palm.cx, palm.y - 0.13 * S];
      line([palm.cx, stage.y + 0.2 * stage.h], wrist, 'rgba(' + STEEL + ',.45)', 0.03 * S);
      line([palm.cx, stage.y + 0.2 * stage.h], wrist, 'rgba(' + NIGHT + ',.55)', 0.006 * S);
      line(wrist, [palm.cx, palm.y], 'rgba(' + STEEL + ',.6)', 0.024 * S);
      disc(wrist, 0.02 * S, 'rgb(' + NIGHT + ')', 'rgba(' + STEEL + ',.85)', 2);
      drawFinger(fingers[0]);
      // object (soft ball): squashes with grip force, turns red when crushed
      var rx = ball.r * (1 + 0.28 * squash + 0.25 * crushed), ry = ball.r * (1 - 0.22 * squash - 0.25 * crushed);
      var over = clamp((force - F_MAX) / 0.3, 0, 1), redness = Math.max(over, crushed);
      ctx.beginPath(); ctx.ellipse(ball.x, ball.y + (ball.r - ry), rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = redness > 0.05 ? 'rgba(' + RED + ',' + (0.18 + 0.4 * redness) + ')' : 'rgba(' + SKY + ',.16)'; ctx.fill();
      ctx.strokeStyle = redness > 0.05 ? 'rgb(' + RED + ')' : 'rgba(' + SKY + ',.85)'; ctx.lineWidth = 2; ctx.stroke();
      if (crushed > 0.5) {
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(ball.x - rx * 0.5, ball.y); ctx.lineTo(ball.x - rx * 0.1, ball.y + ry * 0.35); ctx.lineTo(ball.x + rx * 0.15, ball.y - ry * 0.1); ctx.lineTo(ball.x + rx * 0.5, ball.y + ry * 0.3);
        ctx.stroke();
      }
      // palm and front fingers
      rrect(palm.x, palm.y, palm.w, palm.h, palm.h / 2);
      ctx.fillStyle = 'rgba(' + STEEL + ',.2)'; ctx.fill(); ctx.strokeStyle = 'rgba(' + STEEL + ',.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      drawFinger(fingers[1]); drawFinger(fingers[2]);

      // sEMG panel: raw signal and its envelope
      var b = emgBox, mid = b.y + b.h * 0.58;
      rrect(b.x, b.y, b.w, b.h, 10); ctx.fillStyle = 'rgba(' + NIGHT + ',.55)'; ctx.fill();
      ctx.strokeStyle = 'rgba(' + SKY + ',.22)'; ctx.lineWidth = 1; ctx.stroke();
      label('sEMG', b.x + 10, b.y + 15, 'rgba(' + SKY + ',.85)');
      label('envelope', b.x + b.w - 10, b.y + 15, 'rgba(' + RED + ',.95)', 'right');
      var x0 = b.x + 8, dx = (b.w - 16) / (NS - 1), amp = b.h * 0.34;
      ctx.beginPath();
      for (var k = 0; k < NS; k++) { var yy = mid - raw[k] * amp; if (k) ctx.lineTo(x0 + k * dx, yy); else ctx.moveTo(x0, yy); }
      ctx.strokeStyle = 'rgba(' + SKY + ',.7)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath();
      for (k = 0; k < NS; k++) { var ye = mid - envHist[k] * amp * 0.95; if (k) ctx.lineTo(x0 + k * dx, ye); else ctx.moveTo(x0, ye); }
      ctx.strokeStyle = 'rgb(' + RED + ')'; ctx.lineWidth = 2; ctx.stroke();

      // grip force gauge with the safe band, and the autonomy share
      var g = gaugeBox, gx = g.x + 10, gw = g.w - 20, gy = g.y + g.h * 0.36, gh = Math.max(8, g.h * 0.13), fullScale = 1.2;
      rrect(g.x, g.y, g.w, g.h, 10); ctx.fillStyle = 'rgba(' + NIGHT + ',.55)'; ctx.fill();
      ctx.strokeStyle = 'rgba(' + SKY + ',.22)'; ctx.lineWidth = 1; ctx.stroke();
      label('grip force', gx, g.y + 15, 'rgba(' + SKY + ',.85)');
      rrect(gx, gy, gw, gh, gh / 2); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
      ctx.fillStyle = 'rgba(' + GREEN + ',.32)'; rrect(gx + gw * F_MIN / fullScale, gy, gw * (F_MAX - F_MIN) / fullScale, gh, 3); ctx.fill();
      var fw = gw * clamp(force, 0, fullScale) / fullScale;
      if (fw > 1) { rrect(gx, gy + gh * 0.25, fw, gh * 0.5, gh * 0.25); ctx.fillStyle = force > F_MAX + 0.02 ? 'rgb(' + RED + ')' : 'rgba(255,255,255,.92)'; ctx.fill(); }
      if (userForce > 0.01) {                                  // what the user's signal alone would command
        var ux = gx + gw * clamp(userForce, 0, fullScale) / fullScale;
        ctx.setLineDash([2, 2]); line([ux, gy - 4], [ux, gy + gh + 4], 'rgba(' + SKY + ',.9)', 1.5); ctx.setLineDash([]);
      }
      var ay = g.y + g.h * 0.74, aText = autonomy ? 'autonomy ' + Math.round(alpha * 100) + '%' : 'autonomy off';
      label(aText, gx, ay, 'rgba(' + SKY + ',.85)');
      var lw = ctx.measureText('autonomy 100%').width + 10, ax, aw, by;
      if (gw - lw >= 40) { ax = gx + lw; aw = gw - lw; by = ay - 7; }   // bar next to the label
      else { ax = gx; aw = gw; by = ay + 5; }                            // narrow panel: bar below the label
      rrect(ax, by, aw, 6, 3); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
      if (autonomy && alpha > 0.01) { rrect(ax, by, aw * alpha, 6, 3); ctx.fillStyle = 'rgb(' + SKY + ')'; ctx.fill(); }
    }

    // ------------------------------------------------------------ interaction
    function inStage(e) {
      var r = stageEl.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 20 && e.clientY <= r.bottom + 20;
    }
    function down(e) {
      if (canvas.hidden || (e.pointerType === 'mouse' && e.button !== 0) || !inStage(e)) return;
      if (e.target.closest && e.target.closest('a, button, input, label, [role="tab"]')) return;
      e.preventDefault();
      pressed = true; lastUser = t * 1000;
      if (hintEl) hintEl.classList.add('is-hidden');
      try { hero.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      start();
    }
    function up() { if (pressed) { pressed = false; lastUser = t * 1000; } }
    hero.addEventListener('pointerdown', down);
    hero.addEventListener('pointerup', up);
    hero.addEventListener('pointercancel', up);
    hero.addEventListener('pointermove', function (e) {
      if (canvas.hidden || e.pointerType === 'touch') return;
      var over = inStage(e) && !(e.target.closest && e.target.closest('a, button, [role="tab"]'));
      hero.style.cursor = over ? 'pointer' : '';
    });
    hero.addEventListener('touchstart', function (e) {
      if (canvas.hidden || !e.touches.length) return;
      if (e.target.closest && e.target.closest('a, button, [role="tab"]')) return;
      if (inStage({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY })) e.preventDefault();
    }, { passive: false });
    if (toggle) toggle.addEventListener('click', function () {
      autonomy = !autonomy;
      toggle.setAttribute('aria-pressed', String(autonomy));
      toggle.querySelector('span').textContent = autonomy ? 'on' : 'off';
      lastUser = t * 1000;
      start();
    });

    // ------------------------------------------------------------ loop
    var STEP = 1 / 60, settle = 0;
    function frame(now) {
      raf = 0;
      var dt = last ? Math.min((now - last) / 1000, 0.1) : STEP;
      last = now; acc += dt;
      var n = 0;
      while (acc >= STEP && n++ < 4) { step(); acc -= STEP; }
      if (n >= 4) acc = 0;
      draw();
      var keep = reduceMotion && !pressed ? settle-- > 0 : true;
      if (inView && !document.hidden && keep) raf = window.requestAnimationFrame(frame);
    }
    function start() {
      settle = 150;
      if (!W || raf || !inView || document.hidden) return;
      last = 0;
      raf = window.requestAnimationFrame(frame);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (!inView) return;
        if (Math.abs(hero.getBoundingClientRect().width - lastW) >= 1 && layout()) lastW = W;
        if (W) { draw(); start(); }
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', start);
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (canvas.hidden || Math.abs(hero.getBoundingClientRect().width - lastW) < 1) return;
        if (layout()) { lastW = W; draw(); }
      }, 150);
    });
  }

  /* ---------- Hero: switch between the two featured-research demos ---------- */
  function initHeroTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-demo-tab]'));
    if (!tabs.length) return;
    var link = document.querySelector('[data-demo-link]'), toggle = document.querySelector('[data-autonomy]');
    var info = {
      robots: { href: '/deformable_linear_objects/', text: 'Deformable linear objects' },
      hands: { href: '/human_robot_collaboration/', text: 'Shared autonomy & robotic hands' }
    };
    function select(name, focus) {
      tabs.forEach(function (b) {
        var on = b.getAttribute('data-demo-tab') === name;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      document.querySelectorAll('canvas[data-scene]').forEach(function (cv) { cv.hidden = cv.getAttribute('data-scene') !== name; });
      document.querySelectorAll('[data-hint]').forEach(function (h) { h.hidden = h.getAttribute('data-hint') !== name; });
      if (toggle) toggle.hidden = name !== 'hands';
      if (link && info[name]) {
        link.setAttribute('href', info[name].href);
        link.firstChild.nodeValue = info[name].text + ' ';
      }
    }
    tabs.forEach(function (b, i) {
      b.addEventListener('click', function () { select(b.getAttribute('data-demo-tab')); });
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        select(next.getAttribute('data-demo-tab'), true);
      });
    });
  }

  /* ---------- Publications: search and filters over the plain-HTML list ---------- */
  function initPublications() {
    var list = document.querySelector('[data-pub-list]');
    var toolbar = document.querySelector('[data-pub-toolbar]');
    if (!list || !toolbar) return;
    var pubs = Array.prototype.slice.call(list.querySelectorAll('.pub'));
    if (!pubs.length) return;
    var groups = Array.prototype.slice.call(list.querySelectorAll('.pub-year'));
    var input = toolbar.querySelector('[data-pub-search]');
    var typeGroup = toolbar.querySelector('[data-pub-type]');
    var yearGroup = toolbar.querySelector('[data-pub-years]');
    var countEl = document.querySelector('[data-pub-count]');
    var emptyEl = document.querySelector('[data-pub-empty]');

    var fold = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
    var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var counts = {};
    pubs.forEach(function (li) {
      li._text = fold(li.textContent.replace(/\s+/g, ' '));
      li._title = li.querySelector('.pub-title a') || li.querySelector('.pub-title');
      li._titleText = li._title ? li._title.textContent : '';
      counts[li.getAttribute('data-type')] = (counts[li.getAttribute('data-type')] || 0) + 1;
    });
    typeGroup.querySelectorAll('button').forEach(function (b) {
      var v = b.getAttribute('data-value');
      if (v && !counts[v]) b.hidden = true;
    });
    var years = groups.map(function (g) { return g.getAttribute('data-year'); }).filter(function (y) { return /^\d{4}$/.test(y); });
    yearGroup.innerHTML = '<button type="button" data-value="">All years</button>' +
      years.map(function (y) { return '<button type="button" data-value="' + y + '">' + y + '</button>'; }).join('');

    var params = new URLSearchParams(window.location.search);
    var state = { q: params.get('q') || '', type: params.get('type') || '', year: params.get('year') || '' };
    input.value = state.q;

    function highlight(li, terms) {
      if (!li._title) return;
      if (!terms.length) { li._title.textContent = li._titleText; return; }
      var text = li._titleText, folded = fold(text), marks = [];
      terms.forEach(function (t) {
        var i = folded.indexOf(t);
        while (t && i >= 0) { marks.push([i, i + t.length]); i = folded.indexOf(t, i + t.length); }
      });
      if (!marks.length) { li._title.textContent = text; return; }
      marks.sort(function (a, b) { return a[0] - b[0]; });
      var out = '', pos = 0;
      marks.forEach(function (m) {
        if (m[0] < pos) return;
        out += esc(text.slice(pos, m[0])) + '<mark>' + esc(text.slice(m[0], m[1])) + '</mark>';
        pos = m[1];
      });
      li._title.innerHTML = out + esc(text.slice(pos));
    }

    function apply() {
      var terms = fold(state.q).split(/\s+/).filter(Boolean);
      var shown = 0;
      pubs.forEach(function (li) {
        var ok = (!state.type || li.getAttribute('data-type') === state.type) &&
                 (!state.year || li.getAttribute('data-year') === state.year) &&
                 terms.every(function (t) { return li._text.indexOf(t) !== -1; });
        li.hidden = !ok;
        if (ok) shown++;
        highlight(li, ok ? terms : []);
      });
      groups.forEach(function (g) {
        var n = g.querySelectorAll('.pub:not([hidden])').length;
        g.hidden = n === 0;
        var small = g.querySelector('.pub-year-label small');
        if (small) small.textContent = n + (n === 1 ? ' paper' : ' papers');
      });
      if (emptyEl) emptyEl.hidden = shown !== 0;
      var filtered = state.q || state.type || state.year;
      countEl.innerHTML = filtered
        ? 'Showing ' + shown + ' of ' + pubs.length + ' publications <button type="button" data-pub-clear>Clear filters</button>'
        : pubs.length + ' publications';
      typeGroup.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === state.type)); });
      yearGroup.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === state.year)); });
      var qs = new URLSearchParams();
      if (state.q) qs.set('q', state.q);
      if (state.type) qs.set('type', state.type);
      if (state.year) qs.set('year', state.year);
      var s = qs.toString();
      if (window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + (s ? '?' + s : '') + window.location.hash);
    }

    var timer = 0;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = input.value.trim(); apply(); }, 120);
    });
    typeGroup.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) { state.type = b.getAttribute('data-value'); apply(); }
    });
    yearGroup.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var y = b.getAttribute('data-value');
      state.year = state.year === y ? '' : y;
      apply();
    });
    countEl.addEventListener('click', function (e) {
      if (!e.target.closest('[data-pub-clear]')) return;
      state = { q: '', type: '', year: '' };
      input.value = '';
      apply();
    });
    toolbar.hidden = false;
    apply();
  }

  /* ---------- Group photos: open a photo large, browse with arrows ---------- */
  function initGallery() {
    var gallery = document.querySelector('[data-gallery]');
    if (!gallery || typeof window.HTMLDialogElement !== 'function') return;  // without <dialog>, links open the image
    var items = Array.prototype.slice.call(gallery.querySelectorAll('a.gallery-item'));
    if (!items.length) return;
    var arrow = '<svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg>';
    var dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'Group photo');
    dlg.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>' +
      '<button class="lightbox-btn lightbox-close" type="button" aria-label="Close">&times;</button>' +
      '<button class="lightbox-btn lightbox-prev" type="button" aria-label="Previous photo">' + arrow + '</button>' +
      '<button class="lightbox-btn lightbox-next" type="button" aria-label="Next photo">' + arrow + '</button>';
    document.body.appendChild(dlg);
    var img = dlg.querySelector('img'), cap = dlg.querySelector('figcaption'), current = 0;
    function show(i) {
      current = (i + items.length) % items.length;
      var a = items[current];
      img.src = a.getAttribute('href');
      img.alt = a.querySelector('img').alt;
      cap.textContent = a.getAttribute('data-caption') || '';
    }
    items.forEach(function (a, i) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;     // let people open the image in a new tab
        e.preventDefault();
        show(i);
        dlg.showModal();
      });
    });
    dlg.querySelector('.lightbox-close').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('.lightbox-prev').addEventListener('click', function () { show(current - 1); });
    dlg.querySelector('.lightbox-next').addEventListener('click', function () { show(current + 1); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });
  }

  /* ---------- People: keep group counts in sync with the list ---------- */
  function initPeopleCounts() {
    document.querySelectorAll('.people-group').forEach(function (g) {
      var n = g.querySelectorAll('.people-grid > li, .alumni > li').length;
      var badge = g.querySelector('[data-count-auto]');
      if (badge) badge.textContent = n;
      var pill = document.querySelector('.subnav a[href="#' + g.id + '"] .n');
      if (pill) pill.textContent = n;
    });
  }

  function init() {
    initHeader();
    initReveal();
    initSubnav();
    initClamp();
    initPublications();
    initPeopleCounts();
    initGallery();
    document.querySelectorAll('[data-current-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
    document.querySelectorAll('canvas.cables').forEach(initCables);
    document.querySelectorAll('canvas[data-scene="robots"]').forEach(initRobots);
    document.querySelectorAll('canvas[data-scene="hands"]').forEach(initHands);
    initHeroTabs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
