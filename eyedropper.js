'use strict';
(() => {
  const api = window.api;
  const $ = (id) => document.getElementById(id);
  const shot = $('shot');
  const loupe = $('loupe');
  const zoom = $('zoom');
  const zctx = zoom.getContext('2d');
  const CELLS = 11;
  const CELL = zoom.width / CELLS;
  let ctx = null;
  let pixels = null;
  let last = null;
  let done = false;

  window.I18n.translateDom(document.body, api.lang);

  const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  function at(clientX, clientY) {
    if (!pixels) return null;
    const x = Math.min(shot.width - 1, Math.max(0, Math.floor((clientX / window.innerWidth) * shot.width)));
    const y = Math.min(shot.height - 1, Math.max(0, Math.floor((clientY / window.innerHeight) * shot.height)));
    const i = (y * shot.width + x) * 4;
    return { x, y, color: hex(pixels[i], pixels[i + 1], pixels[i + 2]) };
  }

  function drawLoupe(p, clientX, clientY) {
    const half = Math.floor(CELLS / 2);
    zctx.imageSmoothingEnabled = false;
    zctx.fillStyle = '#000';
    zctx.fillRect(0, 0, zoom.width, zoom.height);
    zctx.drawImage(shot, p.x - half, p.y - half, CELLS, CELLS, 0, 0, zoom.width, zoom.height);
    zctx.strokeStyle = 'rgba(255,255,255,.18)';
    zctx.lineWidth = 1;
    for (let i = 1; i < CELLS; i++) {
      zctx.beginPath(); zctx.moveTo(i * CELL + 0.5, 0); zctx.lineTo(i * CELL + 0.5, zoom.height); zctx.stroke();
      zctx.beginPath(); zctx.moveTo(0, i * CELL + 0.5); zctx.lineTo(zoom.width, i * CELL + 0.5); zctx.stroke();
    }
    zctx.lineWidth = 2;
    zctx.strokeStyle = '#fff';
    zctx.strokeRect(half * CELL, half * CELL, CELL, CELL);
    zctx.strokeStyle = '#000';
    zctx.lineWidth = 1;
    zctx.strokeRect(half * CELL - 1.5, half * CELL - 1.5, CELL + 3, CELL + 3);
    $('sw').style.background = p.color;
    $('hex').textContent = p.color.toUpperCase();
    const w = loupe.offsetWidth || 132;
    const h = loupe.offsetHeight || 160;
    const left = clientX + 22 + w > window.innerWidth ? clientX - 22 - w : clientX + 22;
    const top = clientY + 22 + h > window.innerHeight ? clientY - 22 - h : clientY + 22;
    loupe.style.transform = `translate(${left}px, ${top}px)`;
    loupe.style.display = 'block';
  }

  function finish(color) {
    if (done) return;
    done = true;
    api.eyedropper.done(color);
  }

  document.addEventListener('pointermove', (e) => {
    const p = at(e.clientX, e.clientY);
    if (!p) return;
    last = p;
    drawLoupe(p, e.clientX, e.clientY);
  });
  document.addEventListener('pointerleave', () => { loupe.style.display = 'none'; });
  document.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.button === 2) { finish(null); return; }
    if (e.button !== 0) return;
    const p = at(e.clientX, e.clientY) || last;
    finish(p ? p.color : null);
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') finish(null);
    if (e.key === 'Enter' && last) finish(last.color);
  });

  api.eyedropper.shot().then((data) => {
    if (!data || !data.shot) { finish(null); return; }
    const img = new Image();
    img.onload = () => {
      shot.width = img.naturalWidth;
      shot.height = img.naturalHeight;
      ctx = shot.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      pixels = ctx.getImageData(0, 0, shot.width, shot.height).data;
    };
    img.src = data.shot;
  });
})();
