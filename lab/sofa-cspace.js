/* ────────────────────────────────────────────────────────────────
 * sofa-cspace.js — 沙发位形空间 (x, y, θ) 的栅格化 + 连通分量
 *
 * 思路：沙发是连续刚体，整体状态空间 = 方块格位 × (x,y,θ)。
 * 直接暴搜是 10^9 级，不可行；但对"给定方块布局"这一层，
 * 沙发的可达域可以用 (x,y,θ) 采样栅格 + BFS 精确算出来：
 *   采样点 (i·step, j·step, k·thStep) 用真实几何内核判碰撞，
 *   邻接 = 四方向平移 + 原地转 + 边转边挪一格。
 * 于是三类问题一次全解决：
 *   1) 沙发此刻能到达哪些位姿（连通分量）
 *   2) 给定目标位姿，能不能到、怎么走（BFS 父指针回溯）
 *   3) 挪哪块能让可达域变大 / 让目标变可达（一层前瞻）
 * ──────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const G = global.SofaGeom;

  function build(level, blocks, shape, opts) {
    opts = opts || {};
    const step = opts.step || 0.1;
    const thStep = opts.thStep || 5;
    const ni = Math.round(level.w / step) + 1;
    const nj = Math.round(level.h / step) + 1;
    const nth = Math.round(360 / thStep);
    const n = ni * nj * nth;
    const free = new Uint8Array(n);

    let exact = 0, tested = 0;
    const t0 = Date.now();

    for (let k = 0; k < nth; k++) {
      const poly = G.polyFor(shape, { cx: 0, cy: 0, deg: k * thStep });
      const pb = G.bboxOf(poly);
      const iMin = Math.max(0, Math.ceil(-pb[0] / step - 1e-9));
      const iMax = Math.min(ni - 1, Math.floor((level.w - pb[2]) / step + 1e-9));
      const jMin = Math.max(0, Math.ceil(-pb[1] / step - 1e-9));
      const jMax = Math.min(nj - 1, Math.floor((level.h - pb[3]) / step + 1e-9));
      if (iMax < iMin || jMax < jMin) continue;
      const base = k;
      for (let j = jMin; j <= jMax; j++) {
        const y = j * step;
        const rowBase = (j * ni) * nth + base;
        for (let i = iMin; i <= iMax; i++) {
          const x = i * step;
          tested++;
          let hit = false;
          for (let bi = 0; bi < blocks.length; bi++) {
            const b = blocks[bi];
            // 等价于把多边形平移 (x,y) 后与方块求交：改成方块反向平移，省掉 160 点数组的分配
            if (b.x - x >= pb[2] || b.x + b.w - x <= pb[0] ||
                b.y - y >= pb[3] || b.y + b.h - y <= pb[1]) continue;
            if (G.polyRect(poly, { x: b.x - x, y: b.y - y, w: b.w, h: b.h })) { hit = true; break; }
            exact++;
          }
          if (!hit) free[rowBase + i * nth] = 1;
        }
      }
    }

    let freeCount = 0;
    for (let i = 0; i < n; i++) if (free[i]) freeCount++;

    return {
      step, thStep, ni, nj, nth, free, freeCount, level, blocks, shape,
      stats: { tested, exact, ms: Date.now() - t0 }
    };
  }

  const idx = (cs, i, j, k) => ((j * cs.ni) + i) * cs.nth + k;
  const wrapTh = (cs, k) => ((k % cs.nth) + cs.nth) % cs.nth;

  function nodeOf(cs, pose) {
    const i = Math.round(pose.cx / cs.step);
    const j = Math.round(pose.cy / cs.step);
    const k = wrapTh(cs, Math.round(pose.deg / cs.thStep));
    return { i, j, k };
  }
  function poseOf(cs, i, j, k) {
    return { cx: i * cs.step, cy: j * cs.step, deg: k * cs.thStep };
  }
  const inRange = (cs, i, j) => i >= 0 && i < cs.ni && j >= 0 && j < cs.nj;
  const isFree = (cs, i, j, k) => inRange(cs, i, j) && cs.free[idx(cs, i, j, wrapTh(cs, k))] === 1;

  /** 从 startPose 出发的连通分量；给了 goalPose 就同时回溯路径 */
  function reach(cs, startPose, goalPose) {
    const n = cs.free.length;
    const seen = new Uint8Array(n);
    const parent = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    const s = nodeOf(cs, startPose);
    const startIdx = idx(cs, s.i, s.j, s.k);
    if (!isFree(cs, s.i, s.j, s.k)) {
      return { ok: false, reason: 'start-blocked', s, visited: 0, posCount: 0, path: null };
    }
    seen[startIdx] = 1;
    queue[0] = startIdx;
    let head = 0, tail = 1;
    let goalIdx = -1;
    const g = goalPose ? nodeOf(cs, goalPose) : null;
    if (g) goalIdx = idx(cs, g.i, g.j, g.k);

    // 邻居：4 平移 + 2 原地转 + 16 边转边挪（缺这条会严重欠连通）
    const NB = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) NB.push([di, dj, 0]);
    for (const dk of [1, -1]) {
      NB.push([0, 0, dk]);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (di || dj) NB.push([di, dj, dk]);
      }
    }

    while (head < tail) {
      const cur = queue[head++];
      if (cur === goalIdx) break;
      const k = cur % cs.nth;
      const rest = (cur - k) / cs.nth;
      const i = rest % cs.ni;
      const j = (rest - i) / cs.ni;
      for (let t = 0; t < NB.length; t++) {
        const ni2 = i + NB[t][0], nj2 = j + NB[t][1];
        if (!inRange(cs, ni2, nj2)) continue;
        const nx = idx(cs, ni2, nj2, wrapTh(cs, k + NB[t][2]));
        if (seen[nx] || cs.free[nx] !== 1) continue;
        seen[nx] = 1;
        parent[nx] = cur;
        queue[tail++] = nx;
      }
    }

    let posCount = 0;
    const proj = new Uint8Array(cs.ni * cs.nj);
    for (let t = 0; t < tail; t++) {
      const k = queue[t] % cs.nth;
      const rest = (queue[t] - k) / cs.nth;
      proj[rest] = 1;   // rest = j*ni + i
    }
    for (let t = 0; t < proj.length; t++) if (proj[t]) posCount++;

    let path = null;
    const reached = goalIdx >= 0 && seen[goalIdx] === 1;
    if (reached) {
      path = [];
      let cur = goalIdx;
      while (cur !== -1) {
        const k = cur % cs.nth;
        const rest = (cur - k) / cs.nth;
        const i = rest % cs.ni;
        const j = (rest - i) / cs.ni;
        path.push(poseOf(cs, i, j, k));
        cur = parent[cur];
      }
      path.reverse();
    }
    return {
      ok: true, visited: tail, posCount, proj, path, reached,
      startNode: s, goalNode: g, goalIdx, startIdx
    };
  }

  /** 两点之间（角度线性插值）是否全程无碰撞——用真实内核校验 */
  function segmentFree(cs, a, b, tol) {
    tol = tol || 0.04;
    let dd = b.deg - a.deg;
    while (dd > 180) dd -= 360;
    while (dd < -180) dd += 360;
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / tol), Math.ceil(Math.abs(dd) / 1.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const p = { cx: a.cx + dx * t, cy: a.cy + dy * t, deg: a.deg + dd * t };
      if (G.conflict(cs.level, cs.blocks, p, cs.shape)) return false;
    }
    return true;
  }

  /** 贪心捷径：把 BFS 的锯齿路径压成几段长直线/长弧，播起来才像真的在推沙发 */
  function shortcut(cs, path) {
    if (!path || path.length < 3) return path;
    const out = [path[0]];
    let i = 0;
    let guard = 0;
    while (i < path.length - 1 && guard++ < 4000) {
      let best = i + 1;
      for (let j = path.length - 1; j > i + 1; j--) {
        if (segmentFree(cs, path[i], path[j])) { best = j; break; }
      }
      out.push(path[best]);
      i = best;
    }
    return out;
  }

  global.SofaCspace = { build, reach, shortcut, segmentFree, nodeOf, poseOf, idx, isFree };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.SofaCspace;
})(typeof window !== 'undefined' ? window : globalThis);
