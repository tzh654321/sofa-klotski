/* ────────────────────────────────────────────────────────────────
 * sofa-geom.js — 沙发华容道的几何内核（纯函数，无 DOM 依赖）
 *
 * 约定：棋盘 4×5（可配），单位格，x 向右、y 向下，角度顺时针为正。
 * 方块是轴对齐矩形，沙发是一个任意简单多边形（连续刚体，可任意角度）。
 * ──────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const EPS = 1e-7;

  function cross(ax, ay, bx, by) { return ax * by - ay * bx; }

  /** 局部轮廓 -> 世界坐标多边形 */
  function polyFor(shape, pose) {
    const a = pose.deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const out = new Array(shape.length);
    for (let i = 0; i < shape.length; i++) {
      const x = shape[i][0], y = shape[i][1];
      out[i] = [pose.cx + x * c - y * s, pose.cy + x * s + y * c];
    }
    return out;
  }

  function bboxOf(poly) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of poly) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    return [x0, y0, x1, y1];
  }

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** 线段真交叉（共线/接触不算） */
  function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = cross(bx - ax, by - ay, cx - ax, cy - ay);
    const d2 = cross(bx - ax, by - ay, dx - ax, dy - ay);
    const d3 = cross(dx - cx, dy - cy, ax - cx, ay - cy);
    const d4 = cross(dx - cx, dy - cy, bx - cx, by - cy);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  /** 简单多边形 vs 轴对齐矩形：顶点互含 or 边相交 */
  function polyRect(poly, r) {
    const x1 = r.x + r.w, y1 = r.y + r.h;
    for (const p of poly) {
      if (p[0] > r.x && p[0] < x1 && p[1] > r.y && p[1] < y1) return true;
    }
    const cs = [[r.x, r.y], [x1, r.y], [x1, y1], [r.x, y1]];
    for (const c of cs) if (pointInPoly(c[0], c[1], poly)) return true;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      for (let k = 0; k < 4; k++) {
        const c = cs[k], d = cs[(k + 1) % 4];
        if (segCross(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1])) return true;
      }
    }
    return false;
  }

  const rectsOverlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /** 沙发在 pose 下撞了什么：null / 'wall' / 方块 id */
  function conflict(level, blocks, pose, shape) {
    const poly = polyFor(shape, pose);
    const bb = bboxOf(poly);
    if (bb[0] < -EPS || bb[1] < -EPS || bb[2] > level.w + EPS || bb[3] > level.h + EPS) return 'wall';
    for (const b of blocks) {
      if (b.x >= bb[2] || b.x + b.w <= bb[0] || b.y >= bb[3] || b.y + b.h <= bb[1]) continue;
      if (polyRect(poly, b)) return b.id;
    }
    return null;
  }

  /** 方块放到 (nx,ny) 是否合法（方块互不重叠 + 不压沙发） */
  function fits(level, blocks, sofaPose, shape, blk, nx, ny) {
    if (nx < 0 || ny < 0 || nx + blk.w > level.w || ny + blk.h > level.h) return false;
    const cand = { x: nx, y: ny, w: blk.w, h: blk.h };
    for (const o of blocks) {
      if (o === blk) continue;
      if (rectsOverlap(cand, o)) return false;
    }
    if (!sofaPose) return true;
    const poly = polyFor(shape, sofaPose);
    const bb = bboxOf(poly);
    if (nx >= bb[2] || nx + blk.w <= bb[0] || ny >= bb[3] || ny + blk.h <= bb[1]) return true;
    return !polyRect(poly, cand);
  }

  /** 当前姿态下能连续旋转到的极限角度 [lo, hi]（度，均为非负） */
  function rotRange(level, blocks, pose, shape, step, limit) {
    step = step || 0.5;
    limit = limit || 180;
    let lo = 0, hi = 0;
    for (let a = step; a <= limit; a += step) {
      if (conflict(level, blocks, { cx: pose.cx, cy: pose.cy, deg: pose.deg - a }, shape)) break;
      lo = a;
    }
    for (let a = step; a <= limit; a += step) {
      if (conflict(level, blocks, { cx: pose.cx, cy: pose.cy, deg: pose.deg + a }, shape)) break;
      hi = a;
    }
    return [lo, hi];
  }

  /** 沙发多边形的面积（校验轮廓用） */
  function area(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  const G = { polyFor, bboxOf, pointInPoly, polyRect, conflict, fits, rotRange, area, rectsOverlap };
  global.SofaGeom = G;
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
})(typeof window !== 'undefined' ? window : globalThis);
