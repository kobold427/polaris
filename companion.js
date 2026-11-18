(() => {
  const STAGE_W = 200;
  const STAGE_H = 120;
  const BASE_Y = 114;
  const CELL = 1.5;
  const RATE = { work: 12, rest: 8, idle: 5, sleep: 4 };
  const FOG_STEP = 3;
  const KINDS = ['lotus', 'star'];

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => {
    const x = clamp(t);
    return x * x * (3 - 2 * x);
  };
  const kf = (s, a) => {
    const n = a.length - 1;
    const x = clamp(s, 0, n);
    const i = Math.min(n - 1, Math.floor(x));
    return lerp(a[i], a[i + 1], smooth(x - i));
  };
  const hash = (x, y, z) => {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const w = smooth(z - zi);
    const h = (a, b, c) => hash(xi + a, yi + b, zi + c);
    return lerp(
      lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
      lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v),
      w,
    );
  };

  const petal = (c, len, wid) => {
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(wid * 0.95, -len * 0.22, wid * 0.8, -len * 0.78, 0, -len);
    c.bezierCurveTo(-wid * 0.8, -len * 0.78, -wid * 0.95, -len * 0.22, 0, 0);
    c.closePath();
  };

  const carved = (c, len, wid, gap) => {
    petal(c, len, wid);
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = gap;
    c.lineJoin = 'round';
    c.stroke();
    c.fill();
    c.globalCompositeOperation = 'source-over';
    petal(c, len, wid);
    c.fill();
  };

  const ROW_BACK = [-1, -0.5, 0, 0.5, 1];
  const ROW_FRONT = [-0.75, -0.25, 0.25, 0.75];

  const lotus = (c, P) => {
    const s = P.s;
    const sway = Math.sin(P.t * 0.9) * 0.75 + Math.sin(P.t * 0.37 + 1.3) * 0.45;
    const tilt = sway * P.sw * 0.1;
    const H = kf(s, [16, 34, 48, 58]);
    const x0 = STAGE_W / 2;
    const y0 = BASE_Y;
    const bx = Math.sin(tilt) * H * 1.15;
    const tx = x0 + bx;
    const ty = y0 - H;
    const cx = x0 + bx * 0.12;
    const cy = y0 - H * 0.58;
    const at = (p) => {
      const q = 1 - p;
      return [q * q * x0 + 2 * q * p * cx + p * p * tx, q * q * y0 + 2 * q * p * cy + p * p * ty];
    };
    c.fillStyle = '#000';
    c.strokeStyle = '#000';

    c.globalAlpha = 0.55;
    c.lineWidth = 1.8;
    const ripple = kf(s, [0.55, 0.8, 1, 1.15]);
    [[22, 3.4], [40, 5.6]].forEach(([rx, ry], i) => {
      const k = ripple * (1 + 0.05 * Math.sin(P.t * 0.8 + i * 1.7));
      c.beginPath();
      c.ellipse(x0, y0 + 1, rx * k, ry * k, 0, 0, Math.PI * 2);
      c.stroke();
    });
    c.globalAlpha = 1;

    const ang = Math.atan2(tx - cx, cy - ty);
    c.save();
    c.translate(tx, ty);
    c.rotate(ang + sway * P.sw * 0.04);

    const pod = kf(s, [1, 0.92, 0.82, 0.72]);
    c.beginPath();
    c.ellipse(0, -7 * pod, 8.6 * pod, 10 * pod, 0, 0, Math.PI * 2);
    c.fill();
    if (s < 1.4) {
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = 1 - smooth(s / 1.4);
      [[-3.4, -12], [3.4, -12], [0, -8]].forEach(([hx, hy]) => {
        c.beginPath();
        c.arc(hx * pod, hy * pod, 1.7, 0, Math.PI * 2);
        c.fill();
      });
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }

    const spread = kf(s, [0, 0.06, 0.34, 1]) * 1.2;
    const L = kf(s, [0, 27, 34, 42]);
    const W = kf(s, [0, 11, 13, 14.5]);
    if (L > 0.5) {
      const gapW = 3.6 * smooth((spread - 0.42) / 0.55);
      const row = (list, lf, wf, sf, gap) => {
        const order = list.map((f, i) => i).sort((a, b) => Math.abs(list[b]) - Math.abs(list[a]));
        order.forEach((i) => {
          const f = list[i];
          const a = f * spread * sf;
          c.save();
          c.rotate(a);
          carved(c, L * lf * (1 - 0.14 * Math.abs(f)), W * wf, gap);
          c.restore();
        });
      };
      row(ROW_BACK, 1, 1, 1, gapW);
      row(ROW_FRONT, kf(s, [0.9, 0.9, 0.84, 0.66]), 0.85, 0.8, gapW);
    }
    c.restore();
    c.lineCap = 'round';
    c.lineWidth = kf(s, [4.6, 4.6, 5.2, 5.8]);
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(cx, cy, tx, ty);
    c.stroke();

    const leaf = (p, side, grow, len, wid, base) => {
      if (grow <= 0.01) return;
      const [lx, ly] = at(p);
      c.save();
      c.translate(lx, ly);
      c.rotate(side * (base + sway * P.sw * 0.07) + tilt * 0.6);
      petal(c, len * grow, wid * (0.5 + 0.5 * grow));
      c.fill();
      c.restore();
    };
    leaf(0.3, -1, smooth((s - 0.9) / 1.3), 36, 13, 1.05);
    leaf(0.52, 1, smooth((s - 1.7) / 1.3), 32, 12, 0.98);
  };

  const RAYS = Array.from({ length: 16 }, (_, k) => {
    const g = k % 4 === 0 ? 0 : k % 2 === 0 ? 1 : 2;
    return { a: (k / 16) * Math.PI * 2 - Math.PI / 2, g, len: [58, 52, 40][g], wid: [3.2, 2.8, 2.3][g], at: [0.3, 0.95, 1.7][g], span: [1.8, 1.8, 1.3][g], ph: k * 1.7 };
  });

  const star = (c, P) => {
    const s = P.s;
    const cx = STAGE_W / 2;
    const cy = STAGE_H / 2 + 2;
    const pulse = 1 + 0.05 * Math.sin(P.t * 1.7) + 0.03 * Math.sin(P.t * 3.1 + 1);
    const coreR = kf(s, [3.2, 5, 6, 6.8]) * pulse;
    const glowR = kf(s, [11, 22, 33, 42]) * pulse;
    const glowA = kf(s, [0.18, 0.24, 0.3, 0.34]);
    const hole = kf(s, [0, 0, 1.2, 2.8]);

    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    grad.addColorStop(0, `rgba(0,0,0,${glowA})`);
    grad.addColorStop(0.35, `rgba(0,0,0,${glowA * 0.6})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.beginPath();
    c.arc(cx, cy, glowR, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = '#000';
    RAYS.forEach((r) => {
      const grow = smooth((s - r.at) / r.span);
      if (grow <= 0.01) return;
      const len = r.len * grow * (1 + 0.05 * Math.sin(P.t * 1.3 + r.ph));
      const w = r.wid * (0.55 + 0.45 * grow);
      c.save();
      c.translate(cx, cy);
      c.rotate(r.a);
      c.beginPath();
      c.moveTo(0, -w);
      c.lineTo(len, 0);
      c.lineTo(0, w);
      c.closePath();
      c.fill();
      c.restore();
    });

    c.beginPath();
    c.arc(cx, cy, coreR, 0, Math.PI * 2);
    c.fill();

    if (hole > 0.05) {
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      c.arc(cx, cy, hole * (1 + 0.1 * Math.sin(P.t * 2.3)), 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = 'source-over';
    }
  };

  const DRAW = { lotus, star };

  const boxBlur = (a, b, cols, rows, r) => {
    const k = 1 / (2 * r + 1);
    for (let y = 0; y < rows; y++) {
      const o = y * cols;
      let sum = 0;
      for (let x = 0; x <= r && x < cols; x++) sum += a[o + x];
      for (let x = 0; x < cols; x++) {
        b[o + x] = sum * k;
        const add = x + r + 1;
        const rem = x - r;
        if (add < cols) sum += a[o + add];
        if (rem >= 0) sum -= a[o + rem];
      }
    }
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      for (let y = 0; y <= r && y < rows; y++) sum += b[y * cols + x];
      for (let y = 0; y < rows; y++) {
        a[y * cols + x] = sum * k;
        const add = y + r + 1;
        const rem = y - r;
        if (add < rows) sum += b[add * cols + x];
        if (rem >= 0) sum -= b[rem * cols + x];
      }
    }
  };

  const grainField = (cols, rows) => {
    const f = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ign = (52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)) % 1;
        f[y * cols + x] = ign * 0.6 + hash(x, y, 7) * 0.4;
      }
    }
    return f;
  };

  const instances = new Set();
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  let loop = 0;
  let inkCache = { dirty: true, rgb: [28, 28, 30] };

  const toRgb = (value, fallback) => {
    const m = String(value).match(/[\d.]+/g);
    return m && m.length >= 3 ? m.slice(0, 3).map((n) => Math.round(parseFloat(n))) : fallback;
  };

  const ink = () => {
    if (inkCache.dirty) {
      const raw = getComputedStyle(document.body).getPropertyValue('--ink-rgb').trim();
      inkCache = { dirty: false, rgb: toRgb(raw, [28, 28, 30]) };
    }
    return inkCache.rgb;
  };

  new MutationObserver(() => { inkCache.dirty = true; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme', 'style', 'class'] });

  const kick = () => {
    if (loop || !instances.size || document.hidden || still.matches) return;
    let wait = Infinity;
    const now = performance.now();
    instances.forEach((p) => { wait = Math.min(wait, p.wait(now)); });
    loop = setTimeout(() => {
      loop = 0;
      if (document.hidden) return;
      const t = performance.now();
      instances.forEach((p) => p.step(t));
      kick();
    }, Math.max(16, wait));
  };

  const sizing = (canvas, base = CELL) => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (r.width < 8 || r.height < 8) return null;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const cell = Math.max(1, Math.round(base * dpr));
    const cols = Math.floor(canvas.width / cell);
    const rows = Math.floor(canvas.height / cell);
    return { r, dpr, cell, cols, rows, gx: Math.floor((canvas.width - cols * cell) / 2), gy: Math.floor((canvas.height - rows * cell) / 2) };
  };

  const MODE = {
    idle: { w: 0.82, sw: 0.22 },
    work: { w: 1, sw: 1 },
    rest: { w: 0.88, sw: 0.55 },
    sleep: { w: 0.45, sw: 0.1 },
  };

  const make = (kind) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'pal';
    canvas.setAttribute('aria-hidden', 'true');
    const g = canvas.getContext('2d');
    const mc = document.createElement('canvas');
    const mg = mc.getContext('2d', { willReadFrequently: true });
    const oc = document.createElement('canvas');
    const og = oc.getContext('2d');
    const draw = DRAW[kind] || DRAW.lotus;
    const P = { t: 0, s: 0, sw: MODE.idle.sw, w: MODE.idle.w };
    const S = { state: 'idle', stage: 0, last: 0, born: 0, cols: 0, rows: 0 };
    const every = () => 1000 / RATE[S.state];
    S.mine = { step, resize, wait: (now) => Math.max(0, S.last + every() - now) };

    function resize() {
      const z = sizing(canvas, clamp(canvas.getBoundingClientRect().height / 80, 0.7, CELL));
      if (!z) {
        S.cols = 0;
        return;
      }
      Object.assign(S, z);
      mc.width = oc.width = z.cols;
      mc.height = oc.height = z.rows;
      S.a = new Float32Array(z.cols * z.rows);
      S.b = new Float32Array(z.cols * z.rows);
      S.grain = grainField(z.cols, z.rows);
      S.img = og.createImageData(z.cols, z.rows);
      S.out = new Uint32Array(S.img.data.buffer);
      S.thr = new Float32Array(z.cols * z.rows);
      S.tick = -1;
      S.gw = Math.ceil((z.cols - 1) / FOG_STEP) + 1;
      S.gh = Math.ceil((z.rows - 1) / FOG_STEP) + 1;
      S.fog = new Float32Array(S.gw * S.gh);
      const k = (Math.min(z.r.width / STAGE_W, z.r.height / STAGE_H) * z.dpr) / z.cell;
      S.k = k;
      S.ox = (z.cols - STAGE_W * k) / 2;
      S.oy = (z.rows - STAGE_H * k) / 2;
      S.r1 = Math.max(1, Math.round(1.7 * k));
      S.r2 = Math.max(1, Math.round(0.8 * k));
      S.stillKey = '';
      if (still.matches) render();
    }

    function render() {
      if (!S.cols) return;
      const { cols, rows, a, b, grain } = S;
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.clearRect(0, 0, cols, rows);
      mg.setTransform(S.k, 0, 0, S.k, S.ox, S.oy);
      mg.globalAlpha = 1;
      mg.globalCompositeOperation = 'source-over';
      draw(mg, P);
      const px = mg.getImageData(0, 0, cols, rows).data;
      for (let i = 0, n = cols * rows; i < n; i++) a[i] = px[i * 4 + 3] / 255;
      boxBlur(a, b, cols, rows, S.r1);
      boxBlur(a, b, cols, rows, S.r2);
      const [ir, ig, ib] = ink();
      const out = S.out;
      const thr = S.thr;
      const w = P.w;
      const tick = still.matches ? 0 : Math.floor(P.t * 3);
      if (tick !== S.tick) {
        S.tick = tick;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) thr[y * cols + x] = grain[y * cols + x] * 0.8 + hash(x, y, tick) * 0.2;
      }
      const fogged = w < 0.995;
      const { fog, gw, gh } = S;
      if (fogged) {
        for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) fog[gy * gw + gx] = noise(gx * FOG_STEP * 0.07, gy * FOG_STEP * 0.1, P.t * 0.18);
      }
      const rgba = ((255 << 24) | (ib << 16) | (ig << 8) | ir) >>> 0;
      const gain = (1 - w) * 1.6;
      for (let y = 0; y < rows; y++) {
        const fy = y / FOG_STEP;
        const iy = Math.floor(fy);
        const ty = fy - iy;
        const r0 = iy * gw;
        const r1 = Math.min(gh - 1, iy + 1) * gw;
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const av = a[i];
          if (av <= 0.06) {
            out[i] = 0;
            continue;
          }
          const q = Math.min(1, (av - 0.06) / 0.84);
          let v = q * q * (3 - 2 * q);
          if (fogged) {
            const fx = x / FOG_STEP;
            const ix = Math.floor(fx);
            const tx = fx - ix;
            const jx = Math.min(gw - 1, ix + 1);
            const top = fog[r0 + ix] + (fog[r0 + jx] - fog[r0 + ix]) * tx;
            const bot = fog[r1 + ix] + (fog[r1 + jx] - fog[r1 + ix]) * tx;
            const f = top + (bot - top) * ty;
            v *= clamp(w + (f - 0.45) * gain);
          }
          out[i] = v > thr[i] ? rgba : 0;
        }
      }
      og.putImageData(S.img, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(oc, 0, 0, cols, rows, S.gx, S.gy, cols * S.cell, rows * S.cell);
    }

    function step(now) {
      if (S.last && now - S.last < every() - 3) return;
      const dt = S.last ? Math.min(0.3, (now - S.last) / 1000) : 0;
      S.last = now;
      S.born += dt;
      P.t += dt;
      const m = MODE[S.state];
      const k = 1 - Math.exp(-dt / 0.7);
      P.s += (S.stage - P.s) * (1 - Math.exp(-dt / 0.9));
      P.sw += (m.sw - P.sw) * k;
      P.w += (m.w * lerp(0.35, 1, smooth(S.born / 1.6)) - P.w) * k;
      render();
    }

    const api = {
      node: canvas,
      set(state, stage) {
        const prev = S.state;
        S.state = MODE[state] ? state : 'idle';
        if (S.state !== prev && loop) {
          clearTimeout(loop);
          loop = 0;
          kick();
        }
        S.stage = clamp(stage || 0, 0, 3);
        if (still.matches) {
          const key = `${S.state}|${Math.round(S.stage * 20)}`;
          if (key === S.stillKey) return;
          S.stillKey = key;
          const m = MODE[S.state];
          P.s = S.stage;
          P.sw = 0;
          P.w = m.w;
          render();
        }
      },
      destroy() {
        instances.delete(S.mine);
        ro.disconnect();
      },
    };
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    instances.add(S.mine);
    kick();
    return api;
  };

  still.addEventListener('change', () => { instances.forEach((p) => p.resize()); kick(); });
  document.addEventListener('visibilitychange', kick);

  window.Companion = { create: make, KINDS };
})();
