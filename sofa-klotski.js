/* ────────────────────────────────────────────────────────────────
 * sofa-klotski.js — 离散华容道内核（吸附网格 · 整块转 90°）
 *
 * 模型：
 *   每个块 = 一组格子 + 位置 (x,y) + 朝向 ori。
 *   每一格可以是「实心」或「四分之一圆」（半径 1，圆心在该格的一个角）。
 *   两个四分之一圆格共用圆心 → 恰好拼成半圆，这也给出半圆真正的转轴。
 *
 * 旋转模式（rot）：
 *   'hinge'  绕自身任一格铰接翻转（老规则，枚举候选）
 *   'center' 绕包围盒中心
 *   'anchor' 绕包围盒左上角
 *   'pivot'  绕块自己的转轴（半圆 = 圆心；自绘块 = 圆心/重心）——每方向只有一个落点
 *
 * 状态：state[i] = {x, y, ori}，与 level.pieces 下标一一对应。
 * ──────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const DIRS4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // 右 下 左 上（+1 ori = 顺时针一格）
  const sk = (c, r) => c + ',' + r;

  function bbox(cells) {
    let w = 0, h = 0;
    for (const [c, r] of cells) { if (c + 1 > w) w = c + 1; if (r + 1 > h) h = r + 1; }
    return [w, h];
  }
  function norm(cells) {
    let mc = Infinity, mr = Infinity;
    for (const [c, r] of cells) { if (c < mc) mc = c; if (r < mr) mr = r; }
    const out = cells.map(([c, r]) => [c - mc, r - mr]);
    out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    return out;
  }
  /** 逆时针/顺时针就地转 90°（在自身包围盒内），结果已归一化 */
  function rotate(cells) {
    const [w, h] = bbox(cells);
    return norm(cells.map(([c, r]) => [h - 1 - r, c]));
  }
  function rectCells(w, h) {
    const out = [];
    for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) out.push([c, r]);
    return out;
  }

  /** 绕 (px,py) 转 90°。d=+1 为视觉顺时针（y 向下坐标系） */
  const rotP = (x, y, px, py, d) => d > 0
    ? [px - (y - py), py + (x - px)]
    : [px + (y - py), py - (x - px)];

  /* ══════════ 格内容 / 美术 ══════════ */

  /** 一格里的内容物，共三种（可以混用）：
   *   - arc=[i,j]：1/4 圆盘，圆心在该格第 (i,j) 个角（0=左/上，1=右/下），半径 1；
   *   - seg=d    ：弓形 —— 「半径 √2/2 的 1/4 圆 减掉 斜边为 1 的 Rt 三角形」的月牙，
   *                弦 = 整条格边（长 1）、弧 = R=√2/2 的四分之一圆、矢高 (√2−1)/2 ≈ 0.2071；
   *                d = 凸出方向（DIRS4 下标：0 右 / 1 下 / 2 左 / 3 上），弦贴在对侧那条边上。
   *                把两块这样的弓形贴到 1×1 方块的相邻两边，拼出来就是「斜半圆」；
   *   - disc     ：内切整圆，圆心 = 格中心，半径 1/2（正好占一格，转 90° 不变）。
   *  弓形的弧所在圆（「隐含圆心」）落在格外的半格点上：斜半圆的两块弓形共用同一个圆心，
   *  那个点就是整个块的转轴 —— segCenterOf() 负责把它找出来。 */
  const SEG_R = 0.7071067811865476;                       // √2/2
  const SEG_COFF = [[-0.5, 0.5], [0.5, -0.5], [1.5, 0.5], [0.5, 1.5]];
  const segCircleOf = q => [q.c + SEG_COFF[q.seg & 3][0], q.r + SEG_COFF[q.seg & 3][1]];
  /** 所有弓形共用同一个隐含圆心时返回它，否则 null（=不构成一个"斜半圆"） */
  function segCenterOf(desc) {
    const segs = desc.filter(q => q.seg != null);
    if (!segs.length) return null;
    const p0 = segCircleOf(segs[0]);
    return segs.every(q => {
      const p = segCircleOf(q);
      return Math.abs(p[0] - p0[0]) < 1e-9 && Math.abs(p[1] - p0[1]) < 1e-9;
    }) ? p0 : null;
  }

  function normDesc(list) {
    let mc = Infinity, mr = Infinity;
    for (const q of list) { if (q.c < mc) mc = q.c; if (q.r < mr) mr = q.r; }
    return list.map(q => ({
      c: q.c - mc, r: q.r - mr,
      arc: q.arc ? [q.arc[0], q.arc[1]] : null,
      seg: q.seg == null ? null : (q.seg & 3),
      disc: !!q.disc
    })).sort((a, b) => a.r - b.r || a.c - b.c);
  }

  /** 由格内容生成可直接喂给 <path> 的填充/描边路径（坐标以格为单位） */
  function artOf(desc) {
    const occ = new Set(desc.map(q => sk(q.c, q.r)));
    let fill = '', stroke = '';
    for (const q of desc) {
      if (q.seg != null) {
        // 弓形：弦贴一条格边、弧朝格内凸 0.2071。弦外侧有邻格时不描弦（拼斜半圆不留中缝）
        const e = [
          { A: [q.c, q.r], B: [q.c, q.r + 1], sw: 1, nb: [-1, 0] },            // 凸右，弦=左边
          { A: [q.c, q.r], B: [q.c + 1, q.r], sw: 0, nb: [0, -1] },            // 凸下，弦=上边
          { A: [q.c + 1, q.r], B: [q.c + 1, q.r + 1], sw: 0, nb: [1, 0] },     // 凸左，弦=右边
          { A: [q.c, q.r + 1], B: [q.c + 1, q.r + 1], sw: 1, nb: [0, 1] }      // 凸上，弦=下边
        ][q.seg & 3];
        const arc = 'A' + SEG_R + ' ' + SEG_R + ' 0 0 ' + e.sw + ' ' + e.B[0] + ' ' + e.B[1];
        fill += 'M' + e.A[0] + ' ' + e.A[1] + arc + 'Z';
        stroke += 'M' + e.A[0] + ' ' + e.A[1] + arc;
        if (!occ.has(sk(q.c + e.nb[0], q.r + e.nb[1])))
          stroke += 'M' + e.A[0] + ' ' + e.A[1] + 'L' + e.B[0] + ' ' + e.B[1];
      } else if (q.disc) {
        // 内切整圆：圆心=格中心、r=0.5，两段半弧拼成一圈
        const cx = q.c + 0.5;
        const d2 = 'M' + cx + ' ' + q.r + 'A0.5 0.5 0 1 1 ' + cx + ' ' + (q.r + 1) +
          'A0.5 0.5 0 1 1 ' + cx + ' ' + q.r;
        fill += d2 + 'Z';
        stroke += d2;
      } else if (!q.arc) {
        fill += 'M' + q.c + ' ' + q.r + 'h1v1h-1z';
        const edges = [
          [q.c, q.r, q.c + 1, q.r, 0, -1],
          [q.c + 1, q.r, q.c + 1, q.r + 1, 1, 0],
          [q.c + 1, q.r + 1, q.c, q.r + 1, 0, 1],
          [q.c, q.r + 1, q.c, q.r, -1, 0]
        ];
        for (const [x1, y1, x2, y2, ox, oy] of edges) {
          if (!occ.has(sk(q.c + ox, q.r + oy))) stroke += 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2;
        }
      } else {
        const ax = q.c + q.arc[0], ay = q.r + q.arc[1];
        // 圆心在格角上：弧的两个端点正好是该格的另两个角
        const qx = q.arc[0] === 0 ? 1 : -1;
        const qy = q.arc[1] === 0 ? 1 : -1;
        const A = [ax, ay + qy], B = [ax + qx, ay];
        const sw = qx === qy ? 0 : 1;      // SVG sweep：1 = 屏幕顺时针
        fill += 'M' + ax + ' ' + ay + 'L' + A[0] + ' ' + A[1] +
          'A1 1 0 0 ' + sw + ' ' + B[0] + ' ' + B[1] + 'Z';
        stroke += 'M' + A[0] + ' ' + A[1] + 'A1 1 0 0 ' + sw + ' ' + B[0] + ' ' + B[1];
        // 圆心角出发的两条直边：外侧没有邻格才描（拼成半圆时不会出现中缝）
        const vN = sk(ax === q.c ? q.c - 1 : q.c + 1, q.r);
        const hN = sk(q.c, ay === q.r ? q.r - 1 : q.r + 1);
        if (!occ.has(vN)) stroke += 'M' + ax + ' ' + ay + 'L' + A[0] + ' ' + A[1];
        if (!occ.has(hN)) stroke += 'M' + ax + ' ' + ay + 'L' + B[0] + ' ' + B[1];
      }
    }
    const [w, h] = bbox(desc.map(q => [q.c, q.r]));
    return { fill, stroke, w, h };
  }

  /** 绕 pivot 转 90° 的候选落点。
   *  转轴可以落在半格上（沙发的缺口圆心就是「整数 x + 半整数 y」）：
   *  这时旋转后的格子落在半格位置，必须补一个「略带平移」把它吸附回整格。
   *  每个半整数轴有 2 种取整方向 → 最多 4 个落点，这就是「沙发过拐角」里的平移量。
   *  关键：吸附位移必须同样作用于圆心，否则连续转两次时转轴会漂移半格。 */
  function spinOptions(desc, pivot, d) {
    const rot = desc.map(q => {
      let minx = Infinity, miny = Infinity;
      for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const t = rotP(q.c + dx, q.r + dy, pivot[0], pivot[1], d);
        if (t[0] < minx) minx = t[0];
        if (t[1] < miny) miny = t[1];
      }
      const ap = q.arc ? rotP(q.c + q.arc[0], q.r + q.arc[1], pivot[0], pivot[1], d) : null;
      // 弓形的凸出方向跟着块一起转（d=+1 是屏幕顺时针：右→下→左→上）；内切圆转不转都一样
      const seg = q.seg == null ? null : ((q.seg + (d > 0 ? 1 : 3)) % 4);
      return { minx, miny, ap, seg, disc: !!q.disc };
    });
    const fx = rot[0].minx - Math.floor(rot[0].minx);
    const fy = rot[0].miny - Math.floor(rot[0].miny);
    const ox = Math.abs(fx) < 1e-9 ? [0] : [0, 1];
    const oy = Math.abs(fy) < 1e-9 ? [0] : [0, 1];
    const out = [];
    for (const ex of ox) for (const ey of oy) {
      // 统一吸附位移：所有格子共用，保证形状不变形
      const tx = Math.floor(rot[0].minx) + ex - rot[0].minx;
      const ty = Math.floor(rot[0].miny) + ey - rot[0].miny;
      const items = rot.map(o => {
        const c = Math.round(o.minx + tx), r = Math.round(o.miny + ty);
        const arc = o.ap ? [Math.round(o.ap[0] + tx) - c, Math.round(o.ap[1] + ty) - r] : null;
        return { c, r, arc, seg: o.seg, disc: o.disc };
      });
      let mc = Infinity, mr = Infinity;
      for (const q of items) { if (q.c < mc) mc = q.c; if (q.r < mr) mr = q.r; }
      for (const q of items) { q.c -= mc; q.r -= mr; }
      items.sort((a, b) => a.r - b.r || a.c - b.c);
      out.push({ desc: items, off: [mc, mr], pivot: [pivot[0] + tx - mc, pivot[1] + ty - mr] });
    }
    return out;
  }

  /** 规范版：取第一种吸附方向（整数轴上唯一） */
  function spinDesc(desc, pivot, d) {
    const o = spinOptions(desc, pivot, d)[0];
    return { desc: o.desc, pivot: o.pivot, off: o.off };
  }

  /** 转轴选择：所有圆弧同心 → 那个圆心（半圆的自然转轴）；
   *  否则包围盒中心，宽高奇偶不同时包围盒中心不对齐格子，改取「离重心最近的那一格的中心」 */
  function pivotOf(desc) {
    // 弓形（斜半圆）：两块弓形的弧同属一个圆，那个圆心就是自然转轴 = 「1×1 方的中心」
    const segP = segCenterOf(desc);
    if (segP) return segP;
    const arcs = desc.filter(q => q.arc);
    if (arcs.length) {
      const p0 = [arcs[0].c + arcs[0].arc[0], arcs[0].r + arcs[0].arc[1]];
      if (arcs.every(q => q.c + q.arc[0] === p0[0] && q.r + q.arc[1] === p0[1])) return p0;
      // 不同心（例如自绘了多段弧）：退回几何重心的规则，不要乱抓一个圆心当轴
    }
    const cs = desc.map(q => [q.c, q.r]);
    const [w, h] = bbox(cs);
    if ((w & 1) === (h & 1)) return [w / 2, h / 2];
    let cx = 0, cy = 0;
    for (const q of desc) { cx += q.c + 0.5; cy += q.r + 0.5; }
    cx /= desc.length; cy /= desc.length;
    let best = [0.5, 0.5], bd = Infinity;
    for (const q of desc) {
      const d = (q.c + 0.5 - cx) * (q.c + 0.5 - cx) + (q.r + 0.5 - cy) * (q.r + 0.5 - cy);
      if (d < bd - 1e-9) { bd = d; best = [q.c + 0.5, q.r + 0.5]; }
    }
    return best;
  }

  /** 半圆的圆心（平边中点），ori0 局部坐标 */
  function flatMidLocal(cells, flat) {
    const [w, h] = bbox(cells);
    const d = DIRS4[(((flat || 0) / 90) % 4 + 4) % 4];
    if (w >= h) return [w / 2, d[1] > 0 ? h : 0];
    return [d[0] > 0 ? w : 0, h / 2];
  }

  /** 沙发缺口（r=0.5 半圆）的圆心：包围盒朝 open 方向那条边的中点。
   *  1×3 竖放、缺口朝右 → (1, 1.5)，落在半格上，这正是「过拐角要带平移」的由来。 */
  function notchMidLocal(cells, open) {
    const [w, h] = bbox(cells);
    const d = DIRS4[(((open || 0) / 90) % 4 + 4) % 4];
    if (d[0] !== 0) return [d[0] > 0 ? w : 0, h / 2];
    return [w / 2, d[1] > 0 ? h : 0];
  }

  /* ══════════ 同心扇形 ══════════
   * 一个半径 1 的整圆以某个格点为圆心，正好占 2×2 四个象限；
   * 1/4 圆 = 一个象限格，1/2 圆 = 两个相邻象限格，3/4 圆 = 三个。
   * 所有「扇形块」只允许绕这个公共圆心转；同一个圆心上的若干扇形块
   * 构成一个装配体，平移和旋转都整体联动 —— 同心扇形运动传递。 */

  /** 象限编号：左上 0 / 右上 1 / 左下 2 / 右下 3 */
  function quadOf(c, r, cx, cy) {
    const dx = c - cx, dy = r - cy;
    if (!((dx === -1 || dx === 0) && (dy === -1 || dy === 0))) return -1;
    return (dx === 0 ? 1 : 0) + (dy === 0 ? 2 : 0);
  }
  const quadCW = q => [1, 3, 0, 2][q];
  const quadCCW = q => [2, 0, 3, 1][q];
  const quadCell = (q, cx, cy) => [cx + (q === 1 || q === 3 ? 0 : -1), cy + (q >= 2 ? 0 : -1)];

  /** 局部坐标下判断「纯扇形」：每格都是四分之一圆且圆心重合 */
  function sectorDesc(desc) {
    if (!desc || !desc.length || desc.some(q => !q.arc)) return null;
    const cx = desc[0].c + desc[0].arc[0], cy = desc[0].r + desc[0].arc[1];
    const quads = [];
    for (const q of desc) {
      if (q.c + q.arc[0] !== cx || q.r + q.arc[1] !== cy) return null;
      const k = quadOf(q.c, q.r, cx, cy);
      if (k < 0 || quads.indexOf(k) >= 0) return null;
      quads.push(k);
    }
    return { center: [cx, cy], quads };
  }

  /** 运行时判断第 i 块是不是扇形块，返回绝对圆心与象限集合 */
  function sectorOf(level, state, i) {
    const p = level.pieces[i];
    const o = p.oris[state[i].ori % p.oris.length];
    const s = sectorDesc(o.desc);
    if (!s) return null;
    return { center: [state[i].x + s.center[0], state[i].y + s.center[1]],
      quads: s.quads, bx: state[i].x + s.center[0] - 1, by: state[i].y + s.center[1] - 1 };
  }

  /** 同一圆心上的全部扇形块 → 一个装配体（不一定铺满，1/2+1/4 也算） */
  function sectorAssembly(level, state, i) {
    const s = sectorOf(level, state, i);
    if (!s) return null;
    const members = [i], quads = s.quads.slice();
    for (let j = 0; j < level.pieces.length; j++) {
      if (j === i) continue;
      const t = sectorOf(level, state, j);
      if (!t || t.center[0] !== s.center[0] || t.center[1] !== s.center[1]) continue;
      if (t.quads.some(q => quads.indexOf(q) >= 0)) return null;   // 叠放 → 装配无效
      for (const q of t.quads) quads.push(q);
      members.push(j);
    }
    members.sort((a, b) => a - b);
    return { center: s.center, bx: s.bx, by: s.by, members, quads, full: quads.length === 4 };
  }

  /** 把一组格子按 4-邻接拆成连通分量（自绘块允许有互不相邻的部分） */
  function components(cells) {
    const set = new Map(cells.map(c => [sk(c[0], c[1]), c]));
    const seen = new Set(), out = [];
    for (const [k, c] of set) {
      if (seen.has(k)) continue;
      const comp = [], q = [c];
      seen.add(k);
      while (q.length) {
        const cur = q.pop();
        comp.push(cur);
        for (const [dx, dy] of DIRS4) {
          const nk = sk(cur[0] + dx, cur[1] + dy);
          if (set.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(set.get(nk)); }
        }
      }
      out.push(comp);
    }
    return out;
  }

  /* ══════════ 解析 ══════════ */

  function parse(raw) {
    const level = {
      w: raw.w, h: raw.h,
      name: raw.name || '未命名',
      goal: raw.goal || null,
      pieces: []
    };
    (raw.pieces || []).forEach((p, i) => {
      const isCustom = !!p.cells && typeof p.cells[0] === 'object' && !Array.isArray(p.cells[0]);
      let desc0;
      if (isCustom) {
        desc0 = normDesc(p.cells.map(q => ({
          c: q.c | 0, r: q.r | 0,
          arc: q.arc ? [q.arc[0] | 0, q.arc[1] | 0] : null,
          seg: q.seg == null ? null : ((q.seg | 0) & 3),
          disc: !!q.disc
        })));
      } else if (p.cells) {
        desc0 = norm(p.cells).map(([c, r]) => ({ c, r, arc: null }));
      } else {
        desc0 = norm(rectCells(p.w || 1, p.h || 1)).map(([c, r]) => ({ c, r, arc: null }));
      }

      const sec = sectorDesc(desc0);       // 纯扇形（1/4、1/2、3/4、整圆）
      /* 斜半圆（水滴）：几块弓形 seg 共用同一个隐含圆心 —— 那个点就是转轴。
       * 以前只认 arc 形式的扇形，手绘出来的弓形拼块 sec 为 null、rotPlay 变成 false，
       * 于是"水滴转不动"；pivotOf 早就支持弓形了，缺的只是这里把 mode/rotPlay 打开。 */
      const segPivot = sec ? null : segCenterOf(desc0);

      let mode = false;
      if (p.rot === 'pivot' || p.rotMode === 'pivot') mode = 'pivot';
      else if (p.rot === 'sofa' || p.rotMode === 'sofa' || p.art === 'sofa') mode = 'sofa';
      else if (p.rot === 'center') mode = 'center';
      else if (p.rot === 'anchor') mode = 'anchor';
      else if (p.rot) mode = 'hinge';
      // 半圆/四分之一圆/四分之三圆：任何时候都只绕自己的圆心转（其它自绘块不可转）
      if (sec || segPivot) mode = 'pivot';
      else if (p.flat != null && mode) mode = 'pivot';

      /* 「能不能转」和「有没有多个朝向」是两件事：
       *   - 试玩/求解里只有两类块允许转：纯扇形（绕自身圆心）、沙发（绕缺口圆心）；
       *   - 其它块（L 形、T 形、1×3、自绘异形…）可以有多朝向给编辑器摆位（QE），
       *     但下棋时不能转 —— 它们的"旋转"只是绕包围盒中心的跳跃平移，不是真转身。
       * 这样也顺手治了「自绘异形块求解时乱转 → 状态空间爆表、难度算不出来」的问题。 */
      const rotPlay = !!sec || !!segPivot || mode === 'sofa' || (p.flat != null && mode === 'pivot') || !!p.spin;

      const oris = [];
      if (mode === 'pivot' || mode === 'sofa') {
        let cur = desc0;
        let pv = sec ? [sec.center[0], sec.center[1]]
          : segPivot ? [segPivot[0], segPivot[1]]
          : mode === 'sofa' ? notchMidLocal(desc0.map(q => [q.c, q.r]), p.open || 0)
            : p.flat != null ? flatMidLocal(desc0.map(q => [q.c, q.r]), p.flat)
              : (Array.isArray(p.pivot) ? [p.pivot[0], p.pivot[1]] : pivotOf(desc0));
        for (let k = 0; k < 4; k++) {
          const cs = cur.map(q => [q.c, q.r]);
          const bb = bbox(cs);
          oris.push({
            desc: cur, cells: cs, w: bb[0], h: bb[1],
            key: cs.map(c => c.join(',')).sort().join(';'),
            art: artOf(cur), pivot: [pv[0], pv[1]]
          });
          const nx = spinDesc(cur, pv, 1);
          cur = nx.desc; pv = nx.pivot;
        }
      } else {
        const count = mode ? 4 : 1;
        let cells = norm(desc0.map(q => [q.c, q.r]));
        for (let k = 0; k < count; k++) {
          const kk = cells.map(c => c.join(',')).sort().join(';');
          if (p.nodedup || !oris.some(o => o.key === kk)) {
            const [w, h] = bbox(cells);
            // 不旋转的自绘块也要保留 arc（否则四分之一圆会被画成实心方格）
            const desc = (count === 1 && isCustom) ? desc0 : cells.map(([c, r]) => ({ c, r, arc: null }));
            oris.push({ desc, cells, w, h, key: kk, art: artOf(desc) });
          }
          cells = rotate(cells);
        }
      }

      level.pieces.push({
        id: p.id || ('p' + i),
        name: p.name || '',
        color: p.color || '#8b8b8b',
        hero: !!p.hero,
        rot: mode,
        rotMode: mode,
        rotPlay,                      // 试玩/求解里是否允许转（只有扇形、沙发为 true）
        lock: !!p.lock,
        shape: p.shape || null,
        art: p.art || null,            // 'sofa' = 用特殊美术轮廓，其余走格内容生成的路径
        pair: p.pair || null,
        open: p.open == null ? null : (p.open | 0),
        flat: p.flat == null ? null : (p.flat | 0),
        chainOnly: !!p.chainOnly,     // 被动：自己不能走/转，只能被别人推着走，且会继续把推力传下去
        onceOnly: !!p.onceOnly,       // 一次被动：只在被「发起块」直接撞到时走一格，自己不再传力（推箱子的箱子）
        nodedup: !!p.nodedup,
        spin: !!p.spin,               // 自绘的「可绕自身格心转」标记（斜半圆+方块）
        custom: isCustom,
        sector: sec,                  // 纯扇形块：{center, quads}，UI 用来解释转轴
        desc: desc0,
        oris
      });
    });
    // id → 下标：目标判定每次都要按 id 找块（BFS 里每个后继都查），少扫一遍列表
    level.of = Object.create(null);
    level.pieces.forEach((p, i) => { if (level.of[p.id] == null) level.of[p.id] = i; });
    return level;
  }

  function initialState(raw) {
    return raw.pieces.map(p => ({ x: p.x | 0, y: p.y | 0, ori: (p.ori | 0) % 4 }));
  }

  /* ══════════ 随机型关卡：随机打乱 ══════════
   * 关卡文件里存的是「基准态」（通常是还原态）；带 shuffle:true 的关在载入/复位时
   * 从基准态随机走 shuffleSteps 步，得到这一轮的题目。
   *
   * 两个细节决定"乱没乱"：
   *   - 不立刻走回头路（avoidReverse，默认开）：否则有效步数掉一半，几百步还看着像原样；
   *   - rng 可注入，工具里能用固定种子复现同一道题（难度抽样要可复核）。
   */
  function scramble(level, state, steps, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const avoid = opts.avoidReverse !== false;
    const n = Math.max(0, Math.floor(steps || 0));
    let cur = state.map(s => ({ x: s.x, y: s.y, ori: s.ori }));
    let last = null;
    for (let k = 0; k < n; k++) {
      let pool = moves(level, cur);
      if (!pool.length) break;
      if (avoid && last && pool.length > 1) {
        const f = pool.filter(m => !(m.t === 'm' && m.i === last.i && m.dx === -last.dx && m.dy === -last.dy));
        if (f.length) pool = f;
      }
      const mv = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
      cur = apply(cur, mv);
      last = mv.t === 'm' ? { i: mv.i, dx: mv.dx, dy: mv.dy } : null;
    }
    return cur;
  }

  function pieceCells(level, state, i) {
    const o = level.pieces[i].oris[state[i].ori % level.pieces[i].oris.length];
    return o.cells.map(([c, r]) => [state[i].x + c, state[i].y + r]);
  }

  function grid(level, state) {
    // 必须放得下「块个数」而不是格数：Int8Array 的索引上限只有 127，
    // 超过 128 块的关（如 19×19 密林穿行有 136 块）会溢出成负数，
    // 被当成「这里有个块」→ level.pieces[-121] 直接炸。用 Int32 一劳永逸。
    const g = new Int32Array(level.w * level.h).fill(-1);
    for (let i = 0; i < level.pieces.length; i++) {
      for (const [c, r] of pieceCells(level, state, i)) {
        if (c < 0 || r < 0 || c >= level.w || r >= level.h) continue;
        g[r * level.w + c] = i;
      }
    }
    return g;
  }

  /** 若 cells 恰为一个实心矩形，返回其绝对包围盒 {x,y,w,h}，否则 null */
  function rectOf(cellsAbs) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [c, r] of cellsAbs) {
      if (c < x0) x0 = c; if (c > x1) x1 = c;
      if (r < y0) y0 = r; if (r > y1) y1 = r;
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w * h !== cellsAbs.length) return null;
    if (new Set(cellsAbs.map(c => c[0] + ',' + c[1])).size !== w * h) return null;
    return { x: x0, y: y0, w, h };
  }

  /** 半圆的圆心 = 平边中点（跟着 ori 一起转） */
  function flatMid(level, state, i, ori, x, y) {
    const p = level.pieces[i];
    const o = p.oris[ori % p.oris.length];
    const d = DIRS4[(((p.flat || 0) / 90 + ori) % 4 + 4) % 4];
    if (o.w >= o.h) return [x + o.w / 2, y + (d[1] > 0 ? o.h : 0)];
    return [x + (d[0] > 0 ? o.w : 0), y + o.h / 2];
  }

  /** 旧接口：两块同心扇形拼成整圆时返回伙伴（保留给既有调用/测试） */
  function discPair(level, state, i) {
    const asm = sectorAssembly(level, state, i);
    if (!asm || asm.members.length !== 2 || !asm.full) return null;
    return { j: asm.members.find(k => k !== i), bx: asm.bx, by: asm.by };
  }

  /** 同心扇形运动传递 · 整体平移：装配体所有成员一起走一格 */
  function assemblySlide(level, state, asm, dx, dy, g) {
    for (const k of asm.members) if (level.pieces[k].lock) return null;
    const own = new Set();
    for (const k of asm.members)
      for (const [c, r] of pieceCells(level, state, k)) own.add(c + ',' + r);
    for (const k of asm.members) {
      for (const [c, r] of pieceCells(level, state, k)) {
        const nc = c + dx, nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= level.w || nr >= level.h) return null;
        if (own.has(nc + ',' + nr)) continue;           // 同伴会同时让开
        if (g[nr * level.w + nc] !== -1) return null;
      }
    }
    return { t: 'ps', ids: asm.members.slice(), i: asm.members[0], j: asm.members[1], dx, dy };
  }

  /** 同心扇形运动传递 · 同步转 90°
   *  扫掠区 = 起始象限 ∪ 目标象限；整个 2×2 圆域必须在盘内且没有「外人」，
   *  否则转动途中会从别的块里穿过去（穿模）。成员全部绕同一圆心转同一角度。 */
  function assemblyTurn(level, state, asm, d, g) {
    const [cx, cy] = asm.center;
    const swept = new Set(asm.quads);
    for (const q of asm.quads) swept.add(d > 0 ? quadCW(q) : quadCCW(q));
    for (let q = 0; q < 4; q++) {
      const [c, r] = quadCell(q, cx, cy);
      if (c < 0 || r < 0 || c >= level.w || r >= level.h) return null;
      const occ = g[r * level.w + c];
      if (occ === -1 || asm.members.indexOf(occ) >= 0) continue;
      if (swept.has(q)) return null;
    }
    const ids = [], poses = [];
    for (const k of asm.members) {
      const p = level.pieces[k];
      if (p.lock) return null;
      const nOri = p.oris.length;
      const a = p.oris[state[k].ori % nOri];
      if (!a.pivot) return null;
      const no = (state[k].ori + d + nOri * 2) % nOri;
      const sp = spinDesc(a.desc, a.pivot, d);
      const nx = state[k].x + sp.off[0], ny = state[k].y + sp.off[1];
      for (const q of sp.desc) {
        const gc = nx + q.c, gr = ny + q.r;
        if (gc < 0 || gr < 0 || gc >= level.w || gr >= level.h) return null;
        const occ = g[gr * level.w + gc];
        if (occ !== -1 && asm.members.indexOf(occ) < 0) return null;
      }
      ids.push(k); poses.push({ x: nx, y: ny, ori: no });
    }
    return { t: 'cr', ids, poses, d, pivot: { x: cx, y: cy },
      i: ids[0], j: ids[1], A: poses[0], B: poses[1] };
  }

  /** 旧接口：整圆同步转 */
  function discMove(level, state, i, pair, d) {
    const asm = sectorAssembly(level, state, i);
    if (!asm || pair.j == null || asm.members.indexOf(pair.j) < 0) return null;
    return assemblyTurn(level, state, asm, d, grid(level, state));
  }

  /** 扇形块单独旋转的扫掠检查（象限级精确判定，不用保守包围盒） */
  function sectorSweepClear(level, g, i, sec, d, allowed) {
    const [cx, cy] = sec.center;
    const swept = new Set(sec.quads);
    for (const q of sec.quads) swept.add(d > 0 ? quadCW(q) : quadCCW(q));
    for (let q = 0; q < 4; q++) {
      const [c, r] = quadCell(q, cx, cy);
      if (c < 0 || r < 0 || c >= level.w || r >= level.h) return false;
      const occ = g[r * level.w + c];
      if (occ === -1 || occ === i || (allowed && allowed.indexOf(occ) >= 0)) continue;
      if (swept.has(q)) return false;
    }
    return true;
  }

  /** 连续 90° 旋转扫过的格子（按角度采样、整格正方形保守估计） */
  function sweptCells(level, state, i, pivot, d, endCells) {
    const o = level.pieces[i].oris[state[i].ori % level.pieces[i].oris.length];
    const px = pivot.x !== undefined ? pivot.x : pivot[0];
    const py = pivot.y !== undefined ? pivot.y : pivot[1];
    const set = new Set(endCells.map(q => q[0] + ',' + q[1]));
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const ang = d * Math.PI / 2 * s / steps;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (const q of o.desc) {
        let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          const x = state[i].x + q.c + dx - px;
          const y = state[i].y + q.r + dy - py;
          const rx = px + x * ca - y * sa;
          const ry = py + x * sa + y * ca;
          if (rx < minx) minx = rx; if (rx > maxx) maxx = rx;
          if (ry < miny) miny = ry; if (ry > maxy) maxy = ry;
        }
        for (let c = Math.floor(minx + 1e-9); c < Math.ceil(maxx - 1e-9); c++)
          for (let r = Math.floor(miny + 1e-9); r < Math.ceil(maxy - 1e-9); r++)
            set.add(c + ',' + r);
      }
    }
    return set;
  }

  /** 扫掠区里不能有别的块、也不能越界 */
  function sweepClear(level, g, i, cellKeys, allowed) {
    for (const key of cellKeys) {
      const [c, r] = key.split(',').map(Number);
      if (c < 0 || r < 0 || c >= level.w || r >= level.h) return false;
      const occ = g[r * level.w + c];
      if (occ === -1 || occ === i || (allowed && allowed.indexOf(occ) >= 0)) continue;
      return false;
    }
    return true;
  }

  /** C 形块（沙发）开口处那一格。开口对着墙 = 墙插进凹槽 → 穿模 */
  function openingCell(level, state, i, ori, x, y) {
    const p = level.pieces[i];
    const o = p.oris[ori % p.oris.length];
    const vertical = o.h > o.w;
    const mc = vertical ? [x, y + (o.h >> 1)] : [x + (o.w >> 1), y];
    const d = DIRS4[(((p.open || 0) / 90 + ori) % 4 + 4) % 4];
    return [mc[0] + d[0], mc[1] + d[1]];
  }
  /** 半圆的平边所邻的格子（整条平边，横跨 2 格） */
  function flatCells(level, state, i, ori, x, y) {
    const p = level.pieces[i];
    const o = p.oris[ori % p.oris.length];
    const d = DIRS4[(((p.flat || 0) / 90 + ori) % 4 + 4) % 4];
    const out = [];
    if (o.w >= o.h) {
      const r = d[1] > 0 ? y + o.h : y - 1;
      for (let c = 0; c < o.w; c++) out.push([x + c, r]);
    } else {
      const cc = d[0] > 0 ? x + o.w : x - 1;
      for (let r = 0; r < o.h; r++) out.push([cc, y + r]);
    }
    return out;
  }
  /** 沙发转体的离散判定：只看落点格 + 缺口方向。
   *
   *  「缺口方向」的具体含义：**缺口正对的那一格，转完必须还是那一格**。
   *  沙发本来就是围着缺口前那一个墙角（一块/一堵墙/一片空地）转身的：
   *  缺口叼住的角落不能换 —— 换了就说明这次"旋转"其实是连滑带转的瞬移。
   *  例：3×3 里沙发竖在中间、缺口朝左顶着 1×2，转成横的之后缺口会朝到别处，
   *  这种"T 型通道里的硬转"就会被拒掉。 */
  function notchAnchorOk(level, i, ori0, x0, y0, ori1, x1, y1) {
    const m0 = openingCell(level, null, i, ori0, x0, y0);
    const m1 = openingCell(level, null, i, ori1, x1, y1);
    return m0[0] === m1[0] && m0[1] === m1[1];
  }

  /** 开口（沙发缺口 / 半圆平边）是否还朝着棋盘内 */
  function openingInside(level, state, i, ori, x, y) {
    const p = level.pieces[i];
    let cells = null;
    if (p.open != null) cells = [openingCell(level, state, i, ori, x, y)];
    else if (p.flat != null) cells = flatCells(level, state, i, ori, x, y);
    else return true;
    for (const c of cells) {
      if (c[0] < 0 || c[1] < 0 || c[0] >= level.w || c[1] >= level.h) return false;
    }
    return true;
  }

  /* ══════════ 走法 ══════════ */

  /** 连锁推：发起块 i 朝 (dx,dy) 走一格，把挡路的块一起带走。
   *   普通/被动块会把推力继续往前传（能连推一串）；
   *   一次被动块（onceOnly）只认「发起块直接撞上来」这一下：中间隔了别的块就不动，
   *   而且它自己不再把力传给下一块 —— 推箱子里「不能连推两个箱子」由此自然成立。 */
  function chainShift(level, state, g, i, dx, dy) {
    const set = new Set([i]);
    const q = [i];
    while (q.length) {
      const pI = q.pop();
      for (const [c, r] of pieceCells(level, state, pI)) {
        const nc = c + dx, nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= level.w || nr >= level.h) return null;
        const o = g[nr * level.w + nc];
        if (o !== -1 && !set.has(o)) {
          const once = level.pieces[o].onceOnly;
          if (once && pI !== i) return null;   // 间接受力：一次被动块不动，这一推整个作废
          set.add(o);
          if (!once) q.push(o);                // 一次被动块到此为止，不再把推力往下传
        }
      }
    }
    for (const pI of set) {
      if (level.pieces[pI].lock) return null;          // 锁定的块推不动
      for (const [c, r] of pieceCells(level, state, pI)) {
        const nc = c + dx, nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= level.w || nr >= level.h) return null;
        const o = g[nr * level.w + nc];
        if (o !== -1 && !set.has(o)) return null;
      }
    }
    return [...set];
  }

  /** 旧接口：整圆整体平移 */
  function discSlide(level, state, i, dx, dy) {
    const asm = sectorAssembly(level, state, i);
    if (!asm || asm.members.length < 2) return null;
    return assemblySlide(level, state, asm, dx, dy, grid(level, state));
  }

  function fitsAt(level, g, i, cells, x, y) {
    for (const [c, r] of cells) {
      const gc = x + c, gr = y + r;
      if (gc < 0 || gr < 0 || gc >= level.w || gr >= level.h) return false;
      const o = g[gr * level.w + gc];
      if (o !== -1 && o !== i) return false;
    }
    return true;
  }

  /** 由起止包围盒中心反解「绕哪一点转了 90°」，让所有旋转都能按圆弧播放 */
  function effectivePivot(a, b, nx, ny, d) {
    const c0x = a.x + a.w / 2, c0y = a.y + a.h / 2;
    const c1x = nx + b.w / 2, c1y = ny + b.h / 2;
    // R(x,y)=(-y,x) 对应 d=+1，(y,-x) 对应 d=-1；解 (I-R)P = C1 - R(C0)
    const A = c1x - (d > 0 ? -c0y : c0y);
    const B = c1y - (d > 0 ? c0x : -c0x);
    return d > 0 ? { x: (A - B) / 2, y: (A + B) / 2 } : { x: (A + B) / 2, y: (B - A) / 2 };
  }

  /** 旋转后的单位格 vs 轴对齐网格格：分离轴（x、y + 两条边法线，共 4 条轴） */
  function quadHitsSquare(quad, sx, sy) {
    const axes = [[1, 0], [0, 1]];
    for (let k = 0; k < 2; k++) {
      const ex = quad[k + 1][0] - quad[k][0], ey = quad[k + 1][1] - quad[k][1];
      const len = Math.hypot(ex, ey) || 1;
      axes.push([-ey / len, ex / len]);
    }
    const sq = [[sx, sy], [sx + 1, sy], [sx + 1, sy + 1], [sx, sy + 1]];
    for (const [ax, ay] of axes) {
      let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
      for (const [x, y] of quad) { const v = x * ax + y * ay; if (v < p0) p0 = v; if (v > p1) p1 = v; }
      for (const [x, y] of sq) { const v = x * ax + y * ay; if (v < q0) q0 = v; if (v > q1) q1 = v; }
      if (p1 <= q0 + 1e-9 || q1 <= p0 + 1e-9) return false;      // 找到分离轴 -> 不相交
    }
    return true;
  }

  /** 旋转扫掠检测：把块绕 pivot 从 0 转到 90°，采样中间角度，
   *  每个格子用 SAT 和附近占用格求交。这样"转过去会从别的块里穿过去"的走法直接被拒，
   *  动画也就不会穿模（落点为空是必要条件，不是充分条件）。 */
  function sweepFree(level, state, i, pivot, d, samples) {
    samples = samples || 6;
    const p = level.pieces[i];
    const o = p.oris[state[i].ori % p.oris.length];
    const g = grid(level, state);
    const near = [];
    for (let r = 0; r < level.h; r++) {
      for (let c = 0; c < level.w; c++) {
        const v = g[r * level.w + c];
        if (v !== -1 && v !== i) near.push([c, r]);
      }
    }
    if (!near.length) return true;
    for (let s2 = 1; s2 < samples; s2++) {
      const a = (d * Math.PI / 2) * (s2 / samples);
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const [c0, r0] of o.cells) {
        const quad = [[c0, r0], [c0 + 1, r0], [c0 + 1, r0 + 1], [c0, r0 + 1]].map(([x0, y0]) => {
          const dx = state[i].x + x0 - pivot.x, dy = state[i].y + y0 - pivot.y;
          return [pivot.x + dx * ca - dy * sa, pivot.y + dx * sa + dy * ca];
        });
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [X, Y] of quad) {
          if (X < x0) x0 = X; if (X > x1) x1 = X;
          if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
        }
        for (const [gc, gr] of near) {
          if (gc + 1 < x0 || gc > x1 || gr + 1 < y0 || gr > y1) continue;
          if (quadHitsSquare(quad, gc, gr)) return false;
        }
      }
    }
    return true;
  }

  function moves(level, state, g) {
    g = g || grid(level, state);
    const out = [];
    // 先找出所有「同心扇形装配体」，成员共享同一份，避免重复登记走法
    const assemblies = new Map();
    for (let i = 0; i < level.pieces.length; i++) {
      const asm = sectorAssembly(level, state, i);
      if (asm && asm.members.length > 1) assemblies.set(i, asm);
    }
    for (let i = 0; i < level.pieces.length; i++) {
      const p = level.pieces[i];
      if (p.lock) continue;                             // 锁定的块完全不动
      // 被动 / 一次被动：自己不主动走、也不主动转，只可能被别的块推着让位（p 走法由推的那块生成）
      if (p.chainOnly || p.onceOnly) continue;
      const cells = pieceCells(level, state, i);

      for (const [dx, dy] of DIRS4) {
        let ok = true;
        for (const [c, r] of cells) {
          const nc = c + dx, nr = r + dy;
          if (nc < 0 || nr < 0 || nc >= level.w || nr >= level.h) { ok = false; break; }
          const o = g[nr * level.w + nc];
          if (o !== -1 && o !== i) { ok = false; break; }
        }
        if (ok) out.push({ i, t: 'm', dx, dy });
        else {
          const ch = chainShift(level, state, g, i, dx, dy);
          if (ch && ch.length > 1) out.push({ i, t: 'p', dx, dy, chain: ch });
        }
      }

      const asm = assemblies.get(i);
      if (asm) {
        if (i !== asm.members[0]) continue;             // 装配体只登记一次
        if (asm.members.some(k => level.pieces[k].chainOnly || level.pieces[k].onceOnly)) continue; // 只被推的块不能带着整组自己转/滑
        for (const [dx, dy] of DIRS4) {
          const sl = assemblySlide(level, state, asm, dx, dy, g);
          if (sl) out.push(sl);
        }
        for (const d of [1, -1]) {
          const mv = assemblyTurn(level, state, asm, d, g);
          if (mv) out.push(mv);
        }
        continue;                                       // 成员不再单独旋转
      }

      // 只有扇形与沙发在试玩/求解里能转；其它块的多朝向只给编辑器摆位用
      if (!p.rotPlay || p.oris.length < 2) continue;
      const nOri = p.oris.length;
      const a = p.oris[state[i].ori % nOri];
      const sec = sectorOf(level, state, i);            // 单个扇形块
      const pvLocal = a.pivot || [a.w / 2, a.h / 2];
      const pivotWorld = { x: state[i].x + pvLocal[0], y: state[i].y + pvLocal[1] };

      for (const d of [1, -1]) {
        const no = (state[i].ori + d + nOri * 2) % nOri;
        const b = p.oris[no];

        if (p.rotMode === 'pivot' || p.rotMode === 'sofa') {
          // pivot = 圆心（半圆/扇形）或缺口圆心（沙发）；sofa 额外有 4 种吸附平移
          const isSofa = p.rotMode === 'sofa';
          const opts = isSofa ? spinOptions(a.desc, a.pivot, d) : [spinDesc(a.desc, a.pivot, d)];
          const ori0 = state[i].ori % nOri;
          for (const sp of opts) {
            const nc = sp.desc.map(c2 => [c2.c, c2.r]);
            const nx = state[i].x + sp.off[0], ny = state[i].y + sp.off[1];
            /* 转身必须是「原地转身」：转轴在世界坐标里不能挪窝。
             * 弧形组合（自绘的内切圆 + 弓形）的转轴常压在格的角上甚至格外，吸附之后
             * 会算出一个带整格平移的结果 —— 那不是转身，是让块凭空挪一格（还能穿墙）。
             * 沙发是例外：它的转轴定义就是缺口圆心，转身本来就带半格吸附平移。 */
            if (!isSofa) {
              const pvNew = b.pivot || sp.pivot;
              if (!pvNew) continue;
              if (Math.abs(nx + pvNew[0] - pivotWorld.x) > 1e-9 ||
                  Math.abs(ny + pvNew[1] - pivotWorld.y) > 1e-9) continue;
            }
            if (!fitsAt(level, g, i, nc, nx, ny)) continue;
            if (!openingInside(level, state, i, no, nx, ny)) continue;
            // 沙发/扇形都是离散块：只看落点与方向，不做连续扫掠（动画走插值公式）
            if (isSofa && !notchAnchorOk(level, i, ori0, state[i].x, state[i].y, no, nx, ny)) continue;
            if (sec && !sectorSweepClear(level, g, i, sec, d, null)) continue;
            out.push({ i, t: 'r', d, x: nx, y: ny, ori: no, pivot: pivotWorld });
          }
          continue;
        }

        const cands = [];
        if (p.rotMode === 'center') {
          const cx = state[i].x + a.w / 2, cy = state[i].y + a.h / 2;
          cands.push([Math.round(cx - b.w / 2), Math.round(cy - b.h / 2)]);
        } else if (p.rotMode === 'anchor') {
          cands.push([state[i].x, state[i].y]);
        } else {
          for (const [pc, pr] of a.cells) {
            const cx = state[i].x + pc + 0.5, cy = state[i].y + pr + 0.5;
            for (const [qc, qr] of b.cells) {
              cands.push([Math.round(cx - qc - 0.5), Math.round(cy - qr - 0.5)]);
            }
          }
        }
        const seenPos = new Set();
        for (const [nx, ny] of cands) {
          const pk = nx + ',' + ny;
          if (seenPos.has(pk)) continue;
          seenPos.add(pk);
          if (!fitsAt(level, g, i, b.cells, nx, ny)) continue;
          if (!openingInside(level, state, i, no, nx, ny)) continue;
          // hinge/center/anchor 是老式「离散铰接翻转」，本身就带一次跳跃平移，
          // 没有连续扫掠可言；穿模的根因在「绕错中心」，已由 pivot/sofa 规则修好。
          // 这里只给动画一个真实转轴，让它按圆弧走而不是直线穿过邻块。
          const pv = effectivePivot({ x: state[i].x, y: state[i].y, w: a.w, h: a.h },
            { w: b.w, h: b.h }, nx, ny, d);
          out.push({ i, t: 'r', d, x: nx, y: ny, ori: no, pivot: pv });
        }
      }
    }
    return out;
  }

  function apply(state, mv) {
    const s = state.map(p => ({ x: p.x, y: p.y, ori: p.ori }));
    if (mv.t === 'm') { s[mv.i].x += mv.dx; s[mv.i].y += mv.dy; }
    else if (mv.t === 'p') { for (const pI of mv.chain) { s[pI].x += mv.dx; s[pI].y += mv.dy; } }
    else if (mv.t === 'ps') {
      for (const k of (mv.ids || [mv.i, mv.j])) { s[k].x += mv.dx; s[k].y += mv.dy; }
    }
    else if (mv.t === 'cr') {
      const ids = mv.ids || [mv.i, mv.j], poses = mv.poses || [mv.A, mv.B];
      ids.forEach((k, n) => { s[k] = { x: poses[n].x, y: poses[n].y, ori: poses[n].ori }; });
    }
    else { s[mv.i].x = mv.x; s[mv.i].y = mv.y; s[mv.i].ori = mv.ori; }
    return s;
  }

  /* ══════════ 状态指纹 / 目标 ══════════ */

  function makeKeyer(level, tagOf) {
    const groups = [];
    level.pieces.forEach((p, i) => {
      const sig = p.oris.map(o => o.key).join('|') + '#' + p.oris.length
        + '@' + (tagOf ? (tagOf[i] || '') : '')
        + '^' + (p.oris[0].pivot ? p.oris[0].pivot.join(',') : '')
        + JSON.stringify([!!p.lock, !!p.onceOnly, !!p.chainOnly, p.rotPlay, p.rotMode,
          p.open, p.flat, p.oris.map(o => o.pivot || null)]); // 只有动作规则和朝向编码相同才可互换
      let g = groups.find(z => z.sig === sig);
      if (!g) { g = { sig, idx: [] }; groups.push(g); }
      g.idx.push(i);
    });
    // 借鉴专用求解器的姿态编号；每姿态固定两字，不用53位以上Number拼整盘。
    // 键只用于判重，搜索路径仍保存真实棋子编号。
    return function (state) {
      let s = 'P';
      for (const g of groups) {
        const parts = g.idx.map(i => (state[i].ori*level.h+state[i].y)*level.w+state[i].x);
        if (parts.some((v,j)=>!Number.isSafeInteger(v)||v<0||v>0xffffffff ||
          state[g.idx[j]].x<0||state[g.idx[j]].x>=level.w||state[g.idx[j]].y<0||state[g.idx[j]].y>=level.h))
          return 'F'+JSON.stringify(groups.map(z=>z.idx.map(i=>[state[i].x,state[i].y,state[i].ori].join(',')).sort()));
        if(parts.length>1)parts.sort((a,b)=>a-b);
        for(const v of parts)s+=String.fromCharCode(v & 65535,Math.floor(v/65536));
      }
      return s;
    };
  }

  const cellsKey = cells => cells.map(c => c[0] + ',' + c[1]).sort().join(';');

  /* ══════════ 目标（goal） ══════════
   *
   * 一条目标有四种写法，判定全部走同一个规范化入口 goalNorm：
   *
   *   ① {piece:'a', cells:[[c,r],…]}                    某块 → 这一个格位（老写法，仍最常用）
   *   ② {piece:'a', spots:[[[c,r],…], …]}               某块 → 这几个格位里的任意一个
   *   ③ {pieces:['a','b'], spots:[…], need:'any'|'all'}  几块共用一张"座位表"：
   *        any —— 只要有一块坐进任一格位就算达成（"至少一块到位"）
   *        all —— 每一块都得各自坐进一个格位；座位不重复，所以位置**可以互换**
   *   ④ {empty:[[c,r],…]}                               这些格位必须空着（空格目标）
   *
   * 「位置可换」用二分图最大匹配判定，而不是"逐块比对某个指定格位"：
   * 三块随便换位只要都坐在座位表里就算达成，不必展开成 3! = 6 条并列目标。
   * 同一组里的块在 makeKeyer 里共享一个标签 —— 形状相同时它们就是可互换的，
   * 状态数按排列数除下去（见 tagsFor），否则"位置可换"的关会被状态空间撑爆。
   */

  function pieceIdx(level, ref) {
    if (typeof ref === 'number') return (ref >= 0 && ref < level.pieces.length) ? ref : -1;
    if (level.of && level.of[ref] != null) return level.of[ref];
    return level.pieces.findIndex(p => p.id === ref);
  }

  /** 把各种写法收敛成一个规范形（不落盘，只在判定/启发式/文案里用） */
  function goalNorm(level, g) {
    if (!g) return null;
    if (g.empty) {
      const cells = (Array.isArray(g.empty) ? g.empty : []).map(c => [c[0] | 0, c[1] | 0]);
      return cells.length ? { kind: 'empty', cells } : null;
    }
    const refs = Array.isArray(g.pieces) ? g.pieces : (g.piece != null ? [g.piece] : []);
    const pieces = [];
    for (const r of refs) { const i = pieceIdx(level, r); if (i >= 0 && pieces.indexOf(i) < 0) pieces.push(i); }
    if (!pieces.length) return null;
    if (g.bottom && !Array.isArray(g.spots) && !Array.isArray(g.cells))
      return { kind: 'bottom', pieces, spots: [], need: pieces.length };
    const spots0 = Array.isArray(g.spots) ? g.spots : (Array.isArray(g.cells) ? [g.cells] : null);
    if (!spots0) return null;
    const spots = [];
    for (const s of spots0) {
      if (!Array.isArray(s) || !s.length) continue;
      spots.push(s.map(c => [c[0] | 0, c[1] | 0]));
    }
    if (!spots.length) return null;
    const need = (g.need === 'any' || g.need === 1) ? 1 : pieces.length;
    return { kind: 'place', pieces, spots, need };
  }

  /** 这一格现在有没有被任何块占着 */
  function cellFree(level, state, c, r) {
    for (let i = 0; i < level.pieces.length; i++) {
      const p = level.pieces[i];
      const o = p.oris[state[i].ori % p.oris.length];
      for (const q of o.cells) if (state[i].x + q[0] === c && state[i].y + q[1] === r) return false;
    }
    return true;
  }

  /** 规范形 → 里面有几块"各就各位"（座位不重复）。need=1 时只要有一对成立就够。 */
  function matchCount(level, state, c) {
    if (c.kind === 'bottom') {
      const i = c.pieces[0];
      if (i == null) return 0;
      let maxR = -1;
      for (const q of pieceCells(level, state, i)) if (q[1] > maxR) maxR = q[1];
      return maxR === level.h - 1 ? 1 : 0;
    }
    if (c.need === 1) {
      for (const i of c.pieces) {
        const k = cellsKey(pieceCells(level, state, i));
        for (const s of c.spots) if (cellsKey(s) === k) return 1;
      }
      return 0;
    }
    const spotKeys = c.spots.map(cellsKey);
    const opts = c.pieces.map(i => {
      const k = cellsKey(pieceCells(level, state, i));
      const out = [];
      for (let s = 0; s < spotKeys.length; s++) if (spotKeys[s] === k) out.push(s);
      return out;
    });
    // Kuhn 增广路：n ≤ 十几，直接递归，比 Hungarian 好读
    const owner = new Array(c.spots.length).fill(-1);
    let got = 0;
    for (let p = 0; p < opts.length; p++) {
      if (!opts[p].length) continue;
      const seen = new Array(c.spots.length).fill(false);
      const aug = q => {
        for (const s of opts[q]) {
          if (seen[s]) continue;
          seen[s] = true;
          if (owner[s] < 0 || aug(owner[s])) { owner[s] = q; return true; }
        }
        return false;
      };
      if (aug(p)) { got++; if (got >= c.need) return got; }
    }
    return got;
  }

  function goalOne(level, state, goal) {
    const c = goalNorm(level, goal);
    if (!c) return false;
    if (c.kind === 'empty') {
      for (const [cc, rr] of c.cells) if (!cellFree(level, state, cc, rr)) return false;
      return true;
    }
    return matchCount(level, state, c) >= c.need;
  }
  function isGoal(level, state, g) {
    const list = Array.isArray(g) ? g : (g ? [g] : []);
    if (!list.length) return false;
    for (const x of list) if (!goalOne(level, state, x)) return false;
    return true;
  }

  /** 还在差几块/差几格 —— 给 UI 显示"2/3 到位"用（不做搜索，只看当前局面） */
  function goalProgress(level, state, goal) {
    const c = goalNorm(level, goal);
    if (!c) return null;
    if (c.kind === 'empty') {
      let free = 0;
      for (const [cc, rr] of c.cells) if (cellFree(level, state, cc, rr)) free++;
      return { kind: 'empty', got: free, need: c.cells.length };
    }
    if (c.kind === 'bottom') {
      const got = matchCount(level, state, c);
      return { kind: 'place', got, need: 1 };
    }
    return { kind: 'place', got: matchCount(level, state, c), need: c.need, spots: c.spots.length };
  }

  /** 一条目标的中文摘要（编辑器列表 / 求解器的「目标」行共用） */
  function goalText(level, goal) {
    // 刚点「＋空格」还没在棋盘上选格：此时它是一条待填的目标，不该显示成「（无效目标）」
    if (goal && Array.isArray(goal.empty) && !goal.empty.length) return '空格 · 待选格';
    const c = goalNorm(level, goal);
    if (!c) return '（无效目标）';
    const nm = i => level.pieces[i].name || level.pieces[i].id;
    if (c.kind === 'empty') return '空格 ' + c.cells.length + ' 格';
    const names = c.pieces.map(nm);
    if (c.pieces.length === 1) {
      const head = names[0] + ' → ';
      if (c.kind === 'bottom') return head + '最底行（任意列）';
      if (c.spots.length === 1) {
        if (goal.label) return head + goal.label;
        return head + c.spots[0].map(q => '(' + q[0] + ',' + q[1] + ')').join('');
      }
      return head + c.spots.length + ' 个落点之一';
    }
    return (c.need === 1 ? '任一' : '全部') + '：' + names.join('／') +
      (c.kind === 'bottom' ? ' → 最底行' : ' → ' + c.spots.length + ' 个落点');
  }

  function tagsFor(level, goal) {
    const tag = new Array(level.pieces.length).fill('');
    (Array.isArray(goal) ? goal : [goal]).forEach((g, gi) => {
      const c = goalNorm(level, g);
      if (!c || c.kind === 'empty') return;
      // 同一组的成员共享同一个标签：形状也一样时它们就真的可互换（位置可换的目标天然对称）。
      // 标签必须带上「第几条目标」：两条成员不同、落点和 need 恰好一样的成组目标，
      // 若标签相同，四块会被合成一组互换 —— 而目标其实分得清谁是谁，BFS 会把解漏掉。
      const t = '#G' + gi + 'S' + (c.kind === 'bottom' ? 'bottom'
        : c.spots.map(cellsKey).sort().join('|')) + '@' + c.need;
      for (const i of c.pieces) tag[i] += t;
    });
    return tag;
  }

  /** 把「一次拖动」合并成一「手」——同一块连续滑动就算一手，**可以拐弯、可以一路推块**。
   *
   *   步：一格（含连锁让位）算一步 —— 就是 moves.length，不在这里合并；
   *   手：人松手前的一整段动作 —— 同块的连续滑动全算一手（L 形拐弯也只算一手）；
   *       旋转（点一下）和同轴联动（两块一起转）各自单独算一手。
   *   segs 记下每一段的方向，UI 才能把「右 2 下 1」写出来、动画也好分段。 */
  function mergeMoves(moves_) {
    const out = [];
    for (const mv of moves_) {
      const last = out[out.length - 1];
      const slide = mv.t === 'm' || mv.t === 'p';
      if (slide && last && last.slide && last.i === mv.i) {
        const seg = last.segs[last.segs.length - 1];
        if (seg.dx === mv.dx && seg.dy === mv.dy) seg.n++;
        else last.segs.push({ dx: mv.dx, dy: mv.dy, n: 1 });
        last.n++;
        last.dx = mv.dx; last.dy = mv.dy;
        if (mv.t === 'p') last.chain = mv.chain;
        continue;
      }
      if (mv.t === 'cr') out.push({ t: 'cr', i: mv.i, j: mv.j, ids: mv.ids || [mv.i, mv.j],
        poses: mv.poses || [mv.A, mv.B], d: mv.d, pivot: mv.pivot, n: 1 });
      else if (mv.t === 'ps') out.push({ t: 'ps', i: mv.i, j: mv.j, ids: mv.ids || [mv.i, mv.j],
        dx: mv.dx, dy: mv.dy, n: 1 });
      else if (slide) out.push({ i: mv.i, t: mv.t, slide: true, dx: mv.dx, dy: mv.dy,
        segs: [{ dx: mv.dx, dy: mv.dy, n: 1 }], chain: mv.chain, n: 1 });
      else out.push({ i: mv.i, t: 'r', d: mv.d, x: mv.x, y: mv.y, ori: mv.ori, n: 1 });
    }
    return out;
  }

  /** 只拖第 i 块，一手能到的全部状态（可拐弯、可一路推块）。cap 控规模。 */
  function handClosure(level, st0, i, cap) {
    const keyOf = s2 => s2.map(p => p.x + ',' + p.y + ',' + p.ori).join(';');
    const lim = cap || 300;
    const seen = new Map([[keyOf(st0), st0]]);
    const q = [st0];
    for (let h = 0; h < q.length && seen.size <= lim; h++) {
      const cur = q[h];
      for (const mv of moves(level, cur)) {
        if (mv.t !== 'm' && mv.t !== 'p') continue;      // 一手只含平移/推，旋转另算一手
        if (mv.i !== i) continue;
        const nx = apply(cur, mv), k = keyOf(nx);
        if (seen.has(k)) continue;
        seen.set(k, nx);
        q.push(nx);
      }
    }
    return seen;
  }

  /** 「一手」的完整定义：一次拖动（同一块连续滑动，可拐弯、可一路推块）。
   *  做法：先按**步最优路径**贪心合手（mergeMoves），再在**关键点（两手交界）**试二次合并 ——
   *  「能不能用一只手把这两手一起做完」只需要一次「单手闭包」：从这一手开始的状态出发，
   *  只拖这一块（沿途可推别的块），看目标状态在不在闭包里。
   *  闭包很小（实测中位 3 个状态、最大 8）：板上挤着的时候一块块根本走不远，
   *  所以逐对验证很便宜，不用再额外剪枝；只在解超过 600 步时整体跳过。 */
  function handsOf(level, states, movesIn) {
    const merge = mergeMoves(movesIn);
    if (!states || states.length !== movesIn.length + 1) return merge;
    if (movesIn.length > 600) return merge;              // 超长解不做二次合并（太贵，收益也小）
    const spans = [];
    let si = 0;
    for (const h of merge) {
      const from = si, n = h.n || 1;
      // 这一手顺带挪动了哪些块：直接比前后状态（'p' 连锁、'ps' 双联、'cr' 同轴都算）
      const pushed = new Set();
      for (let k = from; k < from + n; k++) {
        const A = states[k], B = states[k + 1];
        for (let q = 0; q < A.length; q++) {
          if (q !== h.i && (A[q].x !== B[q].x || A[q].y !== B[q].y || A[q].ori !== B[q].ori)) pushed.add(q);
        }
      }
      spans.push({ head: h, i: h.i, from, to: from + n - 1, pushed });
      si += n;
    }
    if (spans.length < 2) return merge;
    const keyOf = s2 => s2.map(p => p.x + ',' + p.y + ',' + p.ori).join(';');
    let changedAny = false;
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let k = 0; k + 1 < spans.length; k++) {
        const a = spans[k], b = spans[k + 1];
        if (a.to - a.from + b.to - b.from + 1 > 400) continue;   // 太长的一手动画也不好演，跳过
        const target = keyOf(states[b.to + 1]);
        const clo = handClosure(level, states[a.from], a.i, 260);
        if (!clo.has(target)) continue;
        const pushed = new Set(a.pushed);
        b.pushed.forEach(x => pushed.add(x));
        spans.splice(k, 2, { head: a.head, i: a.i, from: a.from, to: b.to, pushed, merged: true });
        changed = changedAny = true;
      }
      if (!changed) break;
    }
    if (!changedAny) return merge;
    return spans.map(sp => {
      if (!sp.merged) return sp.head;
      const segs = [];
      for (let k = sp.from; k <= sp.to; k++) {
        const mv = movesIn[k];
        if (mv.i !== sp.i || (mv.t !== 'm' && mv.t !== 'p')) continue;
        const last = segs[segs.length - 1];
        if (last && last.dx === mv.dx && last.dy === mv.dy) last.n++;
        else segs.push({ dx: mv.dx, dy: mv.dy, n: 1 });
      }
      return Object.assign({}, sp.head, {
        slide: true, n: sp.to - sp.from + 1, segs,
        chain: [...sp.pushed], merged: true
      });
    });
  }

  /* ══════════ 求解 ══════════ */

  /** 到目标还差多远（只给"快速解"排序用，不参与合法性判定）
   *  块 → 落点按包围盒左上角的曼哈顿距离算；成组目标取"最省事的 need 块"之和：
   *  「全部就位」是每块都算，「任一就位」只算最近的那一块（取最大会把已经到位的
   *  局面也估成还差很远，快速解会绕远路）。这个下界在座位重叠时会高估，
   *  但 quickSolve 只是加权 A*，拿它当排序权重不影响最短解证明。 */
  function goalDistance(level, state, goal) {
    const c = goalNorm(level, goal);
    if (!c || c.kind === 'empty') return 0;
    const boxOf = list => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [cc, rr] of list) {
        if (cc < x0) x0 = cc; if (cc > x1) x1 = cc;
        if (rr < y0) y0 = rr; if (rr > y1) y1 = rr;
      }
      return [x0, y0, x1, y1];
    };
    const i0 = c.pieces[0];
    if (c.kind === 'bottom') {
      let maxR = -1;
      for (const q of pieceCells(level, state, i0)) if (q[1] > maxR) maxR = q[1];
      return Math.max(0, (level.h - 1) - maxR);
    }
    const ds = [];
    for (const i of c.pieces) {
      const a = boxOf(pieceCells(level, state, i));
      let best = Infinity;
      for (const sp of c.spots) {
        const b = boxOf(sp);
        const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (d < best) best = d;
      }
      ds.push(best === Infinity ? 0 : best);
    }
    if (c.need >= c.pieces.length) return ds.reduce((x, y) => x + y, 0);
    ds.sort((x, y) => x - y);                       // 只要 need 块到位 → 取最近的那几块
    return ds.slice(0, c.need).reduce((x, y) => x + y, 0);
  }

  function heuristic(level, state, goal) {
    const list = Array.isArray(goal) ? goal : (goal ? [goal] : []);
    let h = 0;
    for (const g of list) h += goalDistance(level, state, g);
    return h;
  }

  /** 极简二叉堆（按 f 升序） */
  function Heap() {
    const a = [];
    const less = (x, y) => x.f < y.f;
    return {
      size: () => a.length,
      push(v) {
        a.push(v);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (less(a[i], a[p])) { const t = a[i]; a[i] = a[p]; a[p] = t; i = p; } else break;
        }
      },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length && last) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = i * 2 + 1, r = l + 1;
            let m = i;
            if (l < a.length && less(a[l], a[m])) m = l;
            if (r < a.length && less(a[r], a[m])) m = r;
            if (m === i) break;
            const t = a[i]; a[i] = a[m]; a[m] = t; i = m;
          }
        }
        return top;
      }
    };
  }

  /** 把生成器一口气跑完（node 工具/测试用；浏览器里用切片驱动，见 index.html） */
  function driveSync(gen) {
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
  }

  /** 快速解：加权 A*（w 越大越快、越不保证短）。只用来拿一个"上界"，给 BFS 剪枝用。
   *  生成器版：每 512 个节点 yield 一次 { visited }，UI 可以切片跑、随时中止。 */
  function* quickSolveGen(level, rawState, goal, opts) {
    opts = opts || {};
    const maxNodes = opts.maxNodes || 200000;
    const weight = opts.weight || 4;
    const t0 = Date.now();
    const keyOf = makeKeyer(level, tagsFor(level, goal));
    const startKey = keyOf(rawState);
    if (isGoal(level, rawState, goal)) return { ok: true, moves: [], states: [rawState], visited: 1, ms: 0 };
    const best = new Map([[startKey, 0]]);
    const par = new Map([[startKey, null]]);
    const seenState = new Map([[startKey, rawState]]);
    const heap = Heap();
    heap.push({ k: startKey, g: 0, f: heuristic(level, rawState, goal) * weight });
    let visited = 1, sinceYield = 0;
    while (heap.size()) {
      const cur = heap.pop();
      const g = cur.g;
      if (best.get(cur.k) !== g) continue;              // 过期条目
      const st = seenState.get(cur.k);
      if (isGoal(level, st, goal)) {
        const path = [], states = [];
        let c = cur.k;
        while (par.get(c)) { path.push(par.get(c).mv); states.push(seenState.get(c)); c = par.get(c).k; }
        path.reverse(); states.reverse();
        states.unshift(rawState);                 // 与 BFS 一致：states[0] = 起点
        return { ok: true, moves: path, states, visited, ms: Date.now() - t0 };
      }
      if (visited++ > maxNodes) return { ok: false, reason: 'limit', visited, ms: Date.now() - t0 };
      if (++sinceYield >= 512) {
        sinceYield = 0;
        yield { visited, elapsed: Date.now() - t0, heap: heap.size() };
      }
      for (const mv of moves(level, st, grid(level, st))) {
        const ns = apply(st, mv), nk = keyOf(ns);
        const ng = g + 1;
        if (best.has(nk) && best.get(nk) <= ng) continue;
        best.set(nk, ng);
        par.set(nk, { k: cur.k, mv });
        seenState.set(nk, ns);
        heap.push({ k: nk, g: ng, f: ng + heuristic(level, ns, goal) * weight });
      }
    }
    return { ok: false, reason: 'unsolvable', visited, ms: Date.now() - t0 };
  }

  function quickSolve(level, rawState, goal, opts) {
    return driveSync(quickSolveGen(level, rawState, goal, opts));
  }

  /** 最短解。
   *
   *  大面积局面（状态数上万）纯 BFS 很慢，所以先跑一次加权 A* 拿"快速解"当上界 ub，
   *  再让 BFS 只展开「步数 + 1 < ub」的节点：比 ub 更长（含等于）的分支全部剪掉。
   *  因为 BFS 是按层推进的，这样剪枝不会漏掉更短的解：
   *    - 找到解 → 一定是最短解（optimal）
   *    - 没找到更短的、且没撞上节点上限 → 快速解本身就是最短解（optimal）
   *    - 撞上节点上限 → 返回快速解，标记 optimal:false（够用即可）
   *
   *  生成器版：定期 yield { phase, visited, depth }，浏览器里切片驱动 → 页面不卡、可中止。
   */
  function* solveGen(level, rawState, goal, opts) {
    opts = opts || {};
    const maxNodes = opts.maxNodes || 2000000;
    const t0 = Date.now();
    const keyOf = makeKeyer(level, tagsFor(level, goal));
    const startKey = keyOf(rawState);
    if (isGoal(level, rawState, goal)) {
      return { ok: true, moves: [], visited: 1, ms: 0, states: [rawState], optimal: true };
    }

    // ① 快速解 → 上界
    let quick = null;
    if (opts.quick !== false) {
      // 节点数固定，保证同一局面每次给出的上界一致（手数才可复现）
      quick = yield* quickSolveGen(level, rawState, goal, {
        maxNodes: opts.quickNodes || 25000, weight: opts.weight || 4
      });
    }
    const ub = quick && quick.ok ? quick.moves.length : Infinity;

    // ② 带深度上界的 BFS
    const seen = new Map();
    seen.set(startKey, { parent: null, mv: null, state: rawState, d: 0 });
    const queue = [startKey];
    let head = 0, found = null, limitHit = false, sinceYield = 0;
    while (head < queue.length) {
      const k = queue[head++];
      const node = seen.get(k);
      const d = node.d;
      if (d + 1 >= ub) continue;                       // 再走一步就用满预算了，剪掉
      for (const mv of moves(level, node.state, grid(level, node.state))) {
        const ns = apply(node.state, mv);
        const nk = keyOf(ns);
        if (seen.has(nk)) continue;
        seen.set(nk, { parent: k, mv, state: ns, d: d + 1 });
        if (isGoal(level, ns, goal)) { found = nk; break; }
        if (seen.size > maxNodes) { limitHit = true; break; }
        queue.push(nk);
      }
      if (found || limitHit) break;
      if (++sinceYield >= 512) {
        sinceYield = 0;
        yield { phase: 'bfs', visited: seen.size, depth: d, elapsed: Date.now() - t0 };
      }
    }

    const build = key2 => {
      const path = [], states = [];
      let c = key2;
      while (c && seen.get(c) && seen.get(c).parent) {
        const node = seen.get(c);
        path.push(node.mv); states.push(node.state); c = node.parent;
      }
      path.reverse(); states.reverse();
      states.unshift(rawState);                   // states[0] = 起点（UI 按"走了几步"取状态）
      return { path, states };
    };
    const handsFor = (path, states) => handsOf(level, states, path).length;

    if (found) {
      const { path, states } = build(found);
      return { ok: true, moves: path, states, hands: handsFor(path, states),
        visited: seen.size, ms: Date.now() - t0, optimal: true, upper: ub === Infinity ? null : ub };
    }
    // 没找到更短的解
    if (quick && quick.ok) {
      // BFS 没撞上限 → 已穷尽所有更短的可能，快速解就是最短的
      return {
        ok: true, moves: quick.moves, states: quick.states, hands: handsFor(quick.moves, quick.states),
        visited: seen.size, ms: Date.now() - t0,
        optimal: !limitHit, viaQuick: true, quickVisited: quick.visited
      };
    }
    if (limitHit) return { ok: false, reason: 'limit', visited: seen.size, ms: Date.now() - t0 };
    return { ok: false, reason: 'unsolvable', visited: seen.size, ms: Date.now() - t0 };
  }

  function solve(level, rawState, goal, opts) {
    return driveSync(solveGen(level, rawState, goal, opts));
  }

  /** 难度分析：穷举可达状态 + 数出「最短解一路上会误入多少岔路」
   *
   *  正反两遍 BFS：
   *    正向 —— 从起点出发，得到最短步数 depth、最短路径条数 paths；
   *    反向 —— 从目标状态出发（走法都可逆，所以这就是「每个状态离目标还有多远」）。
   *  然后沿一条最短解逐步统计：
   *    same  —— 同样能算走对的走法数（越多越宽松，玩家瞎点也能对）
   *    waste —— 会被带偏的走法代价之和；代价 = 走完这一步后离目标又远了几个单位步，
   *             走到回不来的死路按 DEFLECT_CAP 记满。
   *
   *  大面积局面跑不完是常态：按已枚举的部分给结果，`truncated=true`，
   *  岔路项退化成"平均分支数"的代理（见 difficulty）。
   *
   *  生成器版：每 512 个状态 yield 一次 { phase, states, head, back, total, elapsed }。
   *  浏览器里用切片驱动 —— 页面不卡、进度条能动、随时中止；node 里 driveSync 一口气跑完。
   */
  const DEFLECT_CAP = 10;

  /** 认知决策不等于鼠标松开次数：路口、推箱方向与重复套路分开统计。 */
  function pathDecisions(level, states, path) {
    const tokens = [], actors = new Set();
    let junctions = 0, pushes = 0, pushChanges = 0, lastPush = '', previousDir = '', turns = 0;
    for (let j=0;j<path.length;j++) {
      const m=path[j], ids=m.chain || m.ids || [m.i];
      actors.add(m.i);
      const dir=m.t==='r'||m.t==='cr'?'r'+m.d:(m.dx || 0)+','+(m.dy || 0);
      if (previousDir && dir!==previousDir) turns++;
      previousDir=dir;
      const pushed=ids.filter(i=>i!==m.i && (level.pieces[i].onceOnly || level.pieces[i].chainOnly));
      if(pushed.length){pushes++;const k=pushed.join(',')+':'+dir;if(k!==lastPush)pushChanges++;lastPush=k;}
      // 移动同一操作者时，扣除来路后仍有多个去向才是需判断的路口。
      const alternatives=new Set();
      for(const v of moves(level,states[j])) if(v.i===m.i){
        const ns=apply(states[j],v);
        if(j && ns.every((q,i)=>q.x===states[j-1][i].x&&q.y===states[j-1][i].y&&q.ori===states[j-1][i].ori))continue;
        alternatives.add(v.t+':'+(v.dx||0)+','+(v.dy||0)+':'+(v.d||0));
      }
      if(alternatives.size>1)junctions+=Math.log2(alternatives.size);
      // 同一块同方向长拖只形成一个操作符；重复序列按结构而不是状态位置去重。
      const token=m.i+':'+dir+':'+pushed.join(',');
      if(tokens[tokens.length-1]!==token)tokens.push(token);
    }
    const grams=new Set();
    for(let i=0;i+3<tokens.length;i++)grams.add(tokens.slice(i,i+4).join('|'));
    const novelty=tokens.length<40?1:Math.min(1,grams.size/Math.max(1,tokens.length-3));
    const movers=level.pieces.filter(p=>!p.lock&&!p.onceOnly&&!p.chainOnly).length;
    return {junctions,pushes,pushChanges,turns,sequenceNovelty:novelty,actionRuns:tokens.length,
      navigation: movers<=2 && level.pieces.some(p=>p.lock), boxPuzzle:pushes>0};
  }

  // 对可回放的候选解提取结构，不要求先证明最短。所有长度均为该候选路径的上界。
  /* 单看这一步本身合不合法（m/p 两种最常见）。返回 true / false / null（其它类型交给通用比对）。
   * 为什么需要：estimatePath 原来对每一步都要求"在 moves() 枚举出的后继里能找到同样的局面"，
   * 一步要 enumerate 全部走法 + 算局面指纹；178 块 / 1.2 万步的关直接跑不动，
   * 而且推链步（t:'p'）的局面根本不是任何单块走法能到的，会被判成不合法。 */
  function moveLegalFast(level, state, mv) {
    if (mv.t !== 'm' && mv.t !== 'p') return null;
    const ch = chainShift(level, state, grid(level, state), mv.i, mv.dx, mv.dy);
    if (!ch) return false;
    if (mv.t === 'm') return ch.length === 1;
    const a = [...ch].sort((x, y) => x - y);
    const b = [...(mv.chain || [])].sort((x, y) => x - y);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  function estimatePath(level, start, goal, path) {
    let state = start, last = -1, setup = 0, maxSetup = 0, retreats = 0, switches = 0;
    let plateau = 0, maxPlateau = 0, rebuilds = 0, previousH = heuristic(level, state, goal);
    const states = [state], active = new Set(), touchedBefore = new Set();
    let temptation = 0;
    const keyOf = makeKeyer(level, tagsFor(level, goal));
    for (let j = 0; j < path.length; j++) {
      const mv = path[j], legal = moves(level, state);
      const wanted = keyOf(apply(state, mv));
      const fast = moveLegalFast(level, state, mv);
      if (fast === false) return null;
      if (fast === null && !legal.some(m => keyOf(apply(state, m)) === wanted)) return null;
      const next = apply(state, mv), h = heuristic(level, next, goal);
      const newHand = mv.i !== last || !['m','p'].includes(mv.t);
      if (newHand) {
        switches++; active.add(mv.i);
        if (touchedBefore.has(mv.i)) rebuilds++;
        touchedBefore.add(mv.i);
        if (h > previousH) retreats++;
        if (h >= previousH) { plateau++; maxPlateau = Math.max(maxPlateau, plateau); }
        else plateau = 0;
        // 局部候选数仅作低权重代理，排除立即返回和不涉及解法的块后再计。
        const choices = new Set();
        for (const m of legal) if (m.i === mv.i) {
          const ns = apply(state,m), k = keyOf(ns);
          if (k !== wanted && (j === 0 || k !== keyOf(states[j-1])) && heuristic(level,ns,goal) <= previousH) choices.add(k);
        }
        temptation += Math.log2(1+choices.size);
      }
      if (h === previousH && newHand) { setup++; maxSetup=Math.max(maxSetup,setup); }
      else if (h !== previousH) setup=0;
      last=mv.i; previousH=h; state=next; states.push(state);
    }
    if (!isGoal(level,state,goal)) return null;
    return { steps:path.length, hands:handsOf(level,states,path).length, moves:path,
      cognition:{active:active.size,revisits:rebuilds,retreats,maxSetup,
        switches,temptation,measured:false,proxy:true,maxPlateau,...pathDecisions(level,states,path)}, optimal:false };
  }

  function* analyzeGen(level, rawState, goal, opts) {
    opts = opts || {};
    const cap = opts.maxNodes || 300000;
    const t0 = Date.now();
    const keyOf = makeKeyer(level, tagsFor(level, goal));
    const startKey = keyOf(rawState);
    const dist = new Map([[startKey, 0]]);
    const cnt = new Map([[startKey, 1]]);
    const seen = new Map([[startKey, rawState]]);
    const par = new Map([[startKey, null]]);
    const mvOf = new Map();
    const q = [startKey];
    // 保存实际有向边的前驱索引：反查到任意合法终局的距离，不假定旋转必然可逆。
    const nodeIndex = new Map([[startKey, 0]]), incoming = [[]];
    let head = 0, edges = 0, truncated = false;
    let goalKey = isGoal(level, rawState, goal) ? startKey : null;
    let sinceYield = 0;

    while (head < q.length) {
      const k = q[head++];
      const d = dist.get(k);
      const st = seen.get(k);
      const ms = moves(level, st, grid(level, st));
      edges += ms.length;
      const successors = new Set();
      for (const mv of ms) {
        const ns = apply(st, mv), nk = keyOf(ns);
        if (successors.has(nk)) continue;
        successors.add(nk);
        if (!nodeIndex.has(nk)) { nodeIndex.set(nk, nodeIndex.size); incoming.push([]); }
        incoming[nodeIndex.get(nk)].push(nodeIndex.get(k));
        if (dist.has(nk)) {
          if (dist.get(nk) === d + 1) cnt.set(nk, cnt.get(nk) + cnt.get(k));
          continue;
        }
        dist.set(nk, d + 1); cnt.set(nk, cnt.get(k));
        seen.set(nk, ns); par.set(nk, k); mvOf.set(nk, mv);
        q.push(nk);
        if (!goalKey && isGoal(level, ns, goal)) goalKey = nk;
      }
      if (dist.size > cap) { truncated = true; break; }
      if (++sinceYield >= 512) {
        sinceYield = 0;
        yield { phase: 'forward', states: dist.size, head, depth: goalKey ? dist.get(goalKey) : -1, elapsed: Date.now() - t0 };
      }
    }

    let depth = -1, paths = 0, hands = 0, movesOut = null;
    // 干扰统计（都是「每步平均」）
    let stepBranches = 0, stepWaste = 0, stepSame = 0, deadBranches = 0, worstDeflect = 0;
    let backStates = 0, backTruncated = false, hasInterference = false;
    let cognition = null;
    if (goalKey) {
      depth = dist.get(goalKey);
      // 路径条数只在枚举完整时才是真值；截断时用已有的部分（UI 会标"下限"）
      for (const [k, d] of dist) {
        if (d === depth && isGoal(level, seen.get(k), goal)) paths += cnt.get(k);
      }
      const mv = [], pathStates = [];
      let cur = goalKey;
      while (par.get(cur)) { mv.push(mvOf.get(cur)); pathStates.push(seen.get(cur)); cur = par.get(cur); }
      mv.reverse(); pathStates.reverse();
      pathStates.unshift(rawState);
      hands = handsOf(level, pathStates, mv).length;
      movesOut = mv;
      const decisions = pathDecisions(level,pathStates,mv);
      // 用路径中的调度与反直觉动作衡量认知负担，不把无关活动空间算成难度。
      const actors = mv.map(m => m.i);
      const runs = actors.filter((x, i) => i === 0 || x !== actors[i - 1]);
      const active = new Set(runs);
      const goalIds = new Set();
      for (const g of (Array.isArray(goal) ? goal : [goal])) {
        const c = goalNorm(level, g);
        if (c && c.kind !== 'empty') for (const i of c.pieces) goalIds.add(i);
      }
      let retreats = 0, setupRun = 0, maxSetup = 0, setup = 0;
      for (let j = 0; j < mv.length; j++) {
        const newAction = j === 0 || actors[j] !== actors[j-1] || !['m','p'].includes(mv[j].t);
        if (newAction && heuristic(level, pathStates[j+1], goal) > heuristic(level, pathStates[j], goal)) retreats++;
        const touched = mv[j].chain || mv[j].ids || [mv[j].i];
        if (!touched.some(i => goalIds.has(i))) {
          if (newAction) { setup++; setupRun++; maxSetup = Math.max(maxSetup, setupRun); }
        } else setupRun = 0;
      }
      cognition = { active: active.size, switches: Math.max(0, runs.length-1),
        revisits: Math.max(0, runs.length-active.size), retreats, setup, maxSetup,
        decisions: 0, temptation: 0, measured: false, ...decisions };

      /* ── 反向 BFS：目标状态 → 全图（枚举被截断就没有意义，跳过） ── */
      if (!truncated) {
        const toGoal = new Map();
        const rq = [];
        for (const k of q) if (isGoal(level, seen.get(k), goal)) { toGoal.set(k, 0); rq.push(k); }
        let rh = 0, sinceYield2 = 0;
        while (rh < rq.length) {
          const k = rq[rh++];
          const d = toGoal.get(k);
          const st = seen.get(k);
          if (!st) continue;                     // 走法理论上可逆；真遇到不对称就跳过
          for (const predecessor of incoming[nodeIndex.get(k)]) {
            const nk = q[predecessor];
            if (toGoal.has(nk)) continue;
            toGoal.set(nk, d + 1);
            rq.push(nk);
          }
          if (toGoal.size > cap) { backTruncated = true; break; }
          if (++sinceYield2 >= 512) {
            sinceYield2 = 0;
            yield { phase: 'backward', total: dist.size, back: toGoal.size, states: dist.size, elapsed: Date.now() - t0 };
          }
        }
        backStates = toGoal.size;

        /* ── 沿最短解逐步看岔路 ── */
        const pathKeys = [];
        for (let cur2 = goalKey; cur2; cur2 = par.get(cur2)) pathKeys.push(cur2);
        pathKeys.reverse();
        const steps = Math.max(1, pathKeys.length - 1);
        for (let k = 0; k + 1 < pathKeys.length; k++) {
          const st = seen.get(pathKeys[k]);
          const rest = toGoal.get(pathKeys[k]) - 1;
          const h = heuristic(level, st, goal);
          const alternatives = new Set();
          let good = 0, tempting = 0;
          for (const m of moves(level, st, grid(level, st))) {
            const nk = keyOf(apply(st, m));
            if (alternatives.has(nk) || (k > 0 && nk === pathKeys[k-1])) continue;
            alternatives.add(nk);
            const d2 = toGoal.get(nk);
            if (d2 === rest) { stepSame++; good++; continue; }
            const ns = apply(st, m);
            // 只计实际参与解法的块，且看起来不离目标更远的错误选择。
            if (active.has(m.i) && heuristic(level, ns, goal) <= h) tempting++;
            stepBranches++;
            let pen;
            if (d2 === undefined) { deadBranches++; pen = DEFLECT_CAP; }
            else pen = Math.min(DEFLECT_CAP, Math.max(1, d2 - rest));
            stepWaste += pen;
            if (pen > worstDeflect) worstDeflect = pen;
          }
          if (tempting > 0) {
            cognition.decisions++;
            cognition.temptation += Math.log2(1 + tempting / Math.max(1, good));
          }
        }
        cognition.measured = true;
        stepBranches /= steps; stepWaste /= steps; stepSame /= steps;
        hasInterference = true;
      }
    }
    let estimate = null;
    if (truncated && depth < 0 && opts.estimate !== false) {
      // 先释放大图，补充搜索只使用独立的小预算，防止两张搜索图同时占内存。
      dist.clear(); cnt.clear(); seen.clear(); par.clear(); mvOf.clear(); nodeIndex.clear(); incoming.length = 0;
      const probe = quickSolveGen(level, rawState, goal, {maxNodes: opts.estimateNodes || 100000, weight: 8});
      let r = probe.next();
      while (!r.done) { yield {phase:'estimate', states:q.length, visited:r.value.visited, elapsed:Date.now()-t0}; r=probe.next(); }
      if (r.value.ok) estimate = estimatePath(level,rawState,goal,r.value.moves);
      if (opts.candidateMoves) {
        const saved = estimatePath(level,rawState,goal,opts.candidateMoves);
        if (saved && (!estimate || saved.steps < estimate.steps)) estimate = saved;
      }
      if (estimate) estimate.source = 'validated-candidate';
    }
    const interference = {
      same: +stepSame.toFixed(2), branches: +stepBranches.toFixed(2),
      waste: +stepWaste.toFixed(2), dead: deadBranches, worst: worstDeflect,
      measured: hasInterference                  // false = 枚举被截断，岔路项是缺的
    };
    return {
      states: q.length, edges, depth, paths, hands, moves: movesOut, truncated, stopped: false, interference,
      backStates, backTruncated, cognition, estimate, scoringVersion: 3,
      branching: edges / Math.max(head, 1),
      ms: Date.now() - t0
    };
  }

  function analyze(level, rawState, goal, opts) {
    return driveSync(analyzeGen(level, rawState, goal, opts));
  }

  /** 难度模型 v2：长度、反直觉调度、有效选择；状态数与全局路径数仅供诊断。
   *  这是结构代理评分，尚无真人样本校准，不应解释成成功率或耗时预测。
   *  hands 是单位步最短路合手后的值，不冒充全局最少手数。 */
  function difficulty(res) {
    if (!res || (res.depth < 0 && !res.estimate)) return null;
    const evidence = res.depth < 0 ? res.estimate : res;
    const rawHands = evidence.hands == null ? evidence.steps || res.depth : evidence.hands;
    const c = evidence.cognition || {};
    const novelty = c.sequenceNovelty == null ? 1 : Math.max(0.12,c.sequenceNovelty);
    // 重复的操作套路折算为学习后的执行量；不按关卡名称硬编码汉诺塔。
    const repetition = 0.25 + 0.75*Math.sqrt(novelty);
    const hands = c.navigation || c.boxPuzzle
      ? Math.max(rawHands, (c.junctions || 0)*0.6 + (c.pushChanges || 0)*2 + (c.pushes || 0)*0.25)
      : rawHands*repetition;
    const sat = (x, scale) => 1 - Math.exp(-Math.max(0, x || 0) / scale);
    // 单一长拖动很容易；长度只反映操作负担，不能独立刷到极难。
    const gate = Math.min(1, hands / 10);
    const length = 40 * sat(hands, 40);
    const planning = (22 * sat((c.revisits || 0)*novelty, 16) + 10 * sat((c.retreats || 0)*novelty, 4) +
      8 * sat(Math.min(c.maxSetup || 0, (c.active || 0) * 3)*novelty, 10)) * repetition;
    const routeChoice = c.navigation || c.boxPuzzle ? 20*sat((c.junctions || 0)+(c.pushChanges || 0)*2,30) : 0;
    const choice = Math.max(routeChoice, (c.measured ? 20 * sat(c.temptation, 22) : c.proxy ? 10 * sat(c.temptation, 22) : 0)*repetition);
    // 长尾采用未饱和的原始负担：长解必须伴随反复调度才得分，单块长拖不刷分。
    // 对数增长后用有理函数渐近压缩，比指数饱和更能区分千手及以上关卡。
    const coordination = Math.min(1, Math.max(0, (c.active || 0)-1)/3);
    const load = Math.log1p(Math.max(0,hands-80)/80) *
      Math.log1p(Math.max(0,(c.revisits || 0)-24)/24) * coordination +
      0.35*Math.log1p(Math.max(0,(c.maxPlateau || c.maxSetup || 0)-16)/16)*coordination;
    const endurance = 20 * load/(load+4) * novelty;
    const scale = 0.8;
    const score = Math.min(99, Math.round(gate * (scale*(length + planning + choice) + endurance)));
    const grade = score >= 66 ? '极难' : score >= 54 ? '困难' : score >= 38 ? '中等' : score >= 22 ? '简单' : '太简单';
    return { score, grade, version: 3, estimated: !!(res.truncated || res.stopped || !c.measured),
      confidence: c.measured ? '结构估计' : '参考解结构估算，未证明最短，分数不是上下界', unsolved: res.depth < 0,
      parts: { depth: +(scale*gate*length).toFixed(1), planning: +(scale*gate*planning).toFixed(1),
        endurance: +(gate*endurance).toFixed(1), choice: +(scale*gate*choice).toFixed(1), trap: +(scale*gate*choice).toFixed(1), unique: 0, space: 0 } };
  }

  const K = {
    parse, initialState, scramble, moves, apply, grid, pieceCells, makeKeyer, isGoal, goalOne, solve,
    goalNorm, goalText, goalProgress, matchCount, cellFree, pieceIdx, tagsFor,
    quickSolve, quickSolveGen, solveGen, heuristic, goalDistance,
    analyze, analyzeGen, difficulty, estimatePath, mergeMoves, handsOf, handClosure, components, driveSync,
    cellsKey, rotate, norm, bbox, rectCells, chainShift, discPair, discMove, discSlide,
    rectOf, openingCell, flatCells, flatMid, flatMidLocal, openingInside,
    artOf, spinDesc, pivotOf, normDesc, rotP, DIRS4, segCenterOf,
    sectorDesc, sectorOf, sectorAssembly, assemblySlide, assemblyTurn, sweepFree, quadHitsSquare,
    sectorSweepClear, sweptCells, sweepClear, spinOptions, notchMidLocal, notchAnchorOk,
    quadOf, quadCW, quadCCW, quadCell, effectivePivot
  };
  global.Klotski = K;
  if (typeof module !== 'undefined' && module.exports) module.exports = K;
})(typeof window !== 'undefined' ? window : globalThis);
