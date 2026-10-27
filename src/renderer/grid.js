'use strict';
(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let state = null;
  let frame = 0;

  const BLUE = '10,132,255';
  const FRAME_RADIUS = 22;
  const MARK_EVERY = 2;
  const MARK_ARM = 3;

  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function roundRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function line(width, color) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 2.5;
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    frame = 0;
    fit();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (!state || !state.area) return;
    const [al, at, ar, ab] = state.area;
    const p = state.pitch;

    roundRect(al + 0.5, at + 0.5, ar - al - 1, ab - at - 1, FRAME_RADIUS);
    line(1.5, 'rgba(255,255,255,.9)');

    ctx.beginPath();
    for (let y = at + p, j = 1; y < ab; y += p, j++) {
      for (let x = al + p, i = 1; x < ar; x += p, i++) {
        if (i % MARK_EVERY || j % MARK_EVERY) continue;
        ctx.moveTo(x - MARK_ARM + 0.5, y + 0.5); ctx.lineTo(x + MARK_ARM + 0.5, y + 0.5);
        ctx.moveTo(x + 0.5, y - MARK_ARM + 0.5); ctx.lineTo(x + 0.5, y + MARK_ARM + 0.5);
      }
    }
    line(1.3, 'rgba(255,255,255,.85)');

    if (state.ghost) {
      const [l, t, r, b] = state.ghost;
      roundRect(l + 0.5, t + 0.5, r - l - 1, b - t - 1, FRAME_RADIUS);
      ctx.fillStyle = `rgba(${BLUE},.14)`; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(${BLUE},.95)`; ctx.stroke();
    }
  }

  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  window.addEventListener('resize', schedule);
  window.api.grid.on((s) => {
    if (s.visible === false) { canvas.classList.remove('on'); return; }
    state = s;
    canvas.classList.add('on');
    schedule();
  });
})();
