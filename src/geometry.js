'use strict';

const MARGIN = 24;
const GAP = 16;
const GRID = 20;

function inflate(rect, gap = GAP) {
  return [rect[0] - gap, rect[1] - gap, rect[2] + gap, rect[3] + gap];
}

function sweepX(rect, x1, blockers) {
  const [left, top, right, bottom] = rect;
  const width = right - left;
  let nx = x1;
  for (const [bl, bt, br, bb] of blockers) {
    if (top < bb && bottom > bt) {
      if (x1 > left && right <= bl) nx = Math.min(nx, bl - width);
      else if (x1 < left && left >= br) nx = Math.max(nx, br);
    }
  }
  return nx;
}

function sweepY(rect, y1, blockers) {
  const [left, top, right, bottom] = rect;
  const height = bottom - top;
  let ny = y1;
  for (const [bl, bt, br, bb] of blockers) {
    if (left < br && right > bl) {
      if (y1 > top && bottom <= bt) ny = Math.min(ny, bt - height);
      else if (y1 < top && top >= bb) ny = Math.max(ny, bb);
    }
  }
  return ny;
}

function clampMove(rect, want, area, blockers) {
  const [left, top, right, bottom] = rect;
  const width = right - left;
  const height = bottom - top;
  const [al, at, ar, ab] = area;
  let x = Math.max(al, Math.min(want[0], ar - width));
  let y = Math.max(at, Math.min(want[1], ab - height));
  x = sweepX(rect, x, blockers);
  y = sweepY([x, top, x + width, bottom], y, blockers);
  return [x, y];
}

function resizeRect(start, edges, dx, dy, area, minSize, blockers) {
  const [sl, st, sr, sb] = start;
  const [al, at, ar, ab] = area;
  const [minW, minH] = minSize;
  let nl = sl, nr = sr, nt = st, nb = sb;
  if (edges.includes('L')) nl = Math.max(al, Math.min(sl + dx, sr - minW));
  if (edges.includes('R')) nr = Math.min(ar, Math.max(sr + dx, sl + minW));
  if (edges.includes('T')) nt = Math.max(at, Math.min(st + dy, sb - minH));
  if (edges.includes('B')) nb = Math.min(ab, Math.max(sb + dy, st + minH));
  for (const [bl, bt, br, bb] of blockers) {
    if (st < bb && sb > bt) {
      if (edges.includes('R') && bl >= sr) nr = Math.min(nr, bl);
      if (edges.includes('L') && br <= sl) nl = Math.max(nl, br);
    }
  }
  if (nr - nl < minW) { nl = sl; nr = sr; }
  for (const [bl, bt, br, bb] of blockers) {
    if (nl < br && nr > bl) {
      if (edges.includes('B') && bt >= sb) nb = Math.min(nb, bt);
      if (edges.includes('T') && bb <= st) nt = Math.max(nt, bb);
    }
  }
  if (nb - nt < minH) { nt = st; nb = sb; }
  return [nl, nt, nr, nb];
}

function rectValid(rect, area, blockers, tol = 0) {
  const [l, t, r, b] = rect;
  const [al, at, ar, ab] = area;
  if (l < al - tol || t < at - tol || r > ar + tol || b > ab + tol) return false;
  for (const [bl, bt, br, bb] of blockers) {
    if (l < br - tol && r > bl + tol && t < bb - tol && b > bt + tol) return false;
  }
  return true;
}

function findFreeSpot(size, area, blockers, step = 8) {
  const [width, height] = size;
  const [al, at, ar, ab] = area;
  for (let y = at; y + height <= ab; y += step) {
    for (let x = ar - width; x >= al; x -= step) {
      if (rectValid([x, y, x + width, y + height], area, blockers)) return [x, y];
    }
  }
  return null;
}

function nodesAround(v, origin, pitch = GRID) {
  const k = Math.floor((v - origin) / pitch);
  return [k - 1, k, k + 1, k + 2].map((i) => origin + i * pitch).sort((a, b) => Math.abs(a - v) - Math.abs(b - v));
}

function snapMove(rect, pos, area, blockers, origin, pitch = GRID) {
  const w = rect[2] - rect[0];
  const h = rect[3] - rect[1];
  const xs = [...nodesAround(pos[0], origin[0], pitch), area[0], area[2] - w];
  const ys = [...nodesAround(pos[1], origin[1], pitch), area[1], area[3] - h];
  let best = null;
  let bestD = Infinity;
  for (const x of xs) {
    if (Math.abs(x - pos[0]) > pitch) continue;
    for (const y of ys) {
      if (Math.abs(y - pos[1]) > pitch) continue;
      const d = (x - pos[0]) ** 2 + (y - pos[1]) ** 2;
      if (d < bestD && rectValid([x, y, x + w, y + h], area, blockers)) { best = [x, y]; bestD = d; }
    }
  }
  return best || pos;
}

function nearestFree(size, want, area, blockers, origin, pitch = GRID, exact = false) {
  const [w, h] = size;
  const [al, at, ar, ab] = area;
  const maxX = ar - w;
  const maxY = ab - h;
  if (maxX < al || maxY < at) return null;
  const px = Math.min(maxX, Math.max(al, want[0]));
  const py = Math.min(maxY, Math.max(at, want[1]));
  const step = pitch > 0 && !exact ? pitch : 4;
  const axis = (v, lo, hi, o) => {
    const set = new Set([lo, hi]);
    if (exact) set.add(v);
    for (let k = Math.ceil((lo - o) / step); o + k * step <= hi; k++) set.add(o + k * step);
    return [...set].sort((a, b) => Math.abs(a - v) - Math.abs(b - v));
  };
  const xs = axis(px, al, maxX, origin[0]);
  const ys = axis(py, at, maxY, origin[1]);
  let best = null;
  let bestD = Infinity;
  for (const x of xs) {
    const dx = (x - px) ** 2;
    if (dx >= bestD) break;
    for (const y of ys) {
      const d = dx + (y - py) ** 2;
      if (d >= bestD) break;
      if (rectValid([x, y, x + w, y + h], area, blockers)) { best = [x, y]; bestD = d; break; }
    }
  }
  return best;
}

function snapResize(rect, edges, area, minSize, blockers, origin, pitch = GRID) {
  const [l, t, r, b] = rect;
  const [minW, minH] = minSize;
  const opt = (flag, v, o, bound) => (flag ? [...nodesAround(v, o, pitch), bound] : [v]);
  const ls = opt(edges.includes('L'), l, origin[0], area[0]);
  const rs = opt(edges.includes('R'), r, origin[0], area[2]);
  const ts = opt(edges.includes('T'), t, origin[1], area[1]);
  const bs = opt(edges.includes('B'), b, origin[1], area[3]);
  let best = null;
  let bestD = Infinity;
  const near = (v, ref) => Math.abs(v - ref) <= pitch;
  for (const nl of ls) {
    if (!near(nl, l)) continue;
    for (const nr of rs) {
      if (!near(nr, r) || nr - nl < minW) continue;
      for (const nt of ts) {
        if (!near(nt, t)) continue;
        for (const nb of bs) {
          if (!near(nb, b) || nb - nt < minH) continue;
          const d = Math.abs(nl - l) + Math.abs(nr - r) + Math.abs(nt - t) + Math.abs(nb - b);
          if (d < bestD && rectValid([nl, nt, nr, nb], area, blockers)) { best = [nl, nt, nr, nb]; bestD = d; }
        }
      }
    }
  }
  return best || rect;
}

function packColumns(sizes, area, gap = GAP, pitch = 0, mins = null) {
  const [al, at, ar, ab] = area;
  const H = ab - at;
  const W = ar - al;
  const widthOf = (cols) => cols.reduce((sum, col) => sum + Math.max(...col.map((c) => c[2])), 0) + gap * (cols.length - 1);
  const heightOf = (col) => col.reduce((sum, c) => sum + c[3], 0) + gap * (col.length - 1);

  const sequential = (items) => {
    const columns = [];
    let cur = [];
    let curY = 0;
    items.forEach(([w, h], i) => {
      if (cur.length && curY + h > H) { columns.push(cur); cur = []; curY = 0; }
      cur.push([i, w, h, h]);
      curY += h + gap;
    });
    if (cur.length) columns.push(cur);
    return columns.map((col) => col.map(([i, w, h]) => [i, 0, w, h]));
  };

  const search = (items) => {
    const n = items.length;
    if (n > 9) return null;
    let best = null;
    for (let k = 1; k <= n && !best; k++) {
      const assign = new Array(n).fill(0);
      const rec = (i, used) => {
        if (i === n) {
          const cols = Array.from({ length: k }, () => []);
          assign.forEach((c, idx) => cols[c].push([idx, 0, items[idx][0], items[idx][1]]));
          if (cols.some((c) => !c.length)) return;
          if (cols.some((c) => heightOf(c) > H)) return;
          const w = widthOf(cols);
          if (!best || w < best.w) best = { w, cols };
          return;
        }
        for (let c = 0; c <= Math.min(used, k - 1); c++) { assign[i] = c; rec(i + 1, Math.max(used, c + 1)); }
      };
      rec(0, 0);
    }
    return best && best.cols;
  };

  const attempt = (items) => {
    let cols = sequential(items);
    if (widthOf(cols) <= W) return cols;
    const found = search(items);
    if (found && widthOf(found) <= W) cols = found;
    return widthOf(cols) <= W && cols.every((c) => heightOf(c) <= H) ? cols : null;
  };

  let columns = attempt(sizes);
  if (!columns && mins) {
    const step = pitch || 10;
    for (const f of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      const shrunk = sizes.map(([w, h], i) => [Math.max(mins[i][0], Math.floor((w * f) / step) * step), Math.max(mins[i][1], Math.floor((h * f) / step) * step)]);
      columns = attempt(shrunk);
      if (columns) { sizes = shrunk; break; }
    }
  }
  if (!columns) columns = sequential(sizes);

  const result = new Array(sizes.length);
  let xRight = pitch ? al + Math.floor(W / pitch) * pitch : ar;
  for (const col of columns) {
    const colW = Math.max(...col.map((c) => c[2]));
    const left = Math.max(al, xRight - colW);
    let y = at;
    for (const [i, , w, h] of col) { result[i] = [left, y, w, h]; y += h + gap; }
    xRight = left - gap;
  }
  return result;
}

module.exports = { MARGIN, GAP, GRID, nodesAround, nearestFree, snapMove, snapResize, inflate, sweepX, sweepY, clampMove, resizeRect, rectValid, findFreeSpot, packColumns };
