/* ────────────────────────────────────────────────────────────────
 * shapes.js — 形状库 + 关卡解析前的"形状展开"
 *
 * 关卡 JSON 里可以只写 shape 名（如 "2x2" / "sofa" / "semi"），
 * resolve() 把它展开成内核认识的 cells / rot / pair / flat / open。
 * 浏览器与 node（工具链、测试）共用这一份，避免两边规则不一致。
 * ──────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  /** 半径 1 的整圆以格角 (1,1) 为圆心，四个象限各一个四分之一圆格。
   *  arc=[i,j] 指该格的圆心落在第 (i,j) 个角。 */
  const QUARTER = { c: 0, r: 0, arc: [1, 1] };                 // 左上象限
  const QUARTER_TR = { c: 1, r: 0, arc: [0, 1] };               // 右上象限
  const QUARTER_BL = { c: 0, r: 1, arc: [1, 0] };               // 左下象限
  const QUARTER_BR = { c: 1, r: 1, arc: [0, 0] };               // 右下象限
  const SEMI_CELLS = [QUARTER, QUARTER_TR];                       // 上半圆
  const THREE_QUARTER = [QUARTER, QUARTER_TR, QUARTER_BL];        // 缺右下角的 3/4 圆
  const FULL_CIRCLE = [QUARTER, QUARTER_TR, QUARTER_BL, QUARTER_BR];
  const cp = o => JSON.parse(JSON.stringify(o));

  const SHAPES = {
    '2x2': { label: '2×2', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    '2x1': { label: '2×1', cells: [[0, 0], [1, 0]] },
    '1x2': { label: '1×2', cells: [[0, 0], [0, 1]] },
    '1x1': { label: '1×1', cells: [[0, 0]] },
    '1x3': { label: '1×3', cells: [[0, 0], [0, 1], [0, 2]], rot: 'hinge' },
    'L3': { label: 'L 3格', cells: [[0, 0], [0, 1], [1, 1]], rot: 'hinge' },
    'L4': { label: 'L 4格', cells: [[0, 0], [0, 1], [0, 2], [1, 2]], rot: 'hinge' },
    'T4': { label: 'T 4格', cells: [[0, 0], [1, 0], [2, 0], [1, 1]], rot: 'hinge' },
    // 沙发：C 形，缺口朝右；只绕缺口圆心转，并带半格吸附平移（沙发过拐角）
    // nodedup: 必须保留 4 个朝向，否则"缺口朝左/朝右"会被合并成一个
    'sofa': { label: '沙发', cells: [[0, 0], [0, 1], [0, 2]], art: 'sofa', rot: 'sofa', open: 0, nodedup: true },
    // 扇形块：一律只绕自身圆心转；同心的若干扇形块整体联动（同心扇形运动传递）
    'semi': { label: '半圆', cells: SEMI_CELLS, rot: 'pivot', flat: 90, pair: 'disc', nodedup: true },
    'quarter': { label: '1/4 圆', cells: [QUARTER], rot: 'pivot', pair: 'disc', nodedup: true },
    'threeQuarter': { label: '3/4 圆', cells: THREE_QUARTER, rot: 'pivot', pair: 'disc', nodedup: true },
    // 斜半圆 + 1×1 方：半径 √2/2、圆心与本格（拐角格）中心重合，弧朝「缺角」方向，
    // 于是弧会各凸出 0.207 到两条相邻边外 —— 连本格共占三格（本 / 上 / 右，随朝向转）。
    // 只绕自身圆心转（= 绕拐角格中心），4 个朝向。
    'diagSemi': {
      label: '斜半圆', cells: [[0, 0], [0, 1], [1, 1]],
      rot: 'pivot', pivot: [0.5, 1.5], nodedup: true, art: 'diagSemi', spin: true
    },
    /* 对角半圆的正确写法：一个内切圆 + 两条弓形，三个组件都整格装在格子里，
     * 占格表就等于真实几何（斜半圆 diagSemi 的弧会凸出相邻格 0.207，只留给老数据解析用）。 */
    'arcTri': {
      label: '小圆+两弓形', nodedup: true,
      cells: [{ c: 0, r: 0, seg: 3 }, { c: 0, r: 1, disc: true }, { c: 1, r: 1, seg: 0 }],
      rot: 'pivot', pivot: [0.5, 1.5]
    },
    'disc': { label: '整圆', cells: FULL_CIRCLE, rot: 'pivot', pair: 'disc', nodedup: true }
  };

  /** 把 raw 里所有 shape 名展开；不改原对象 */
  function resolve(raw) {
    const out = JSON.parse(JSON.stringify(raw));
    (out.pieces || []).forEach(p => {
      const sh = SHAPES[p.shape];
      if (!sh) return;
      if (!p.cells && sh.cells) p.cells = JSON.parse(JSON.stringify(sh.cells));
      if (p.rot == null && sh.rot) p.rot = sh.rot;
      if (sh.nodedup) p.nodedup = true;
      if (sh.pair) p.pair = sh.pair;
      if (sh.open != null && p.open == null) p.open = sh.open;
      if (sh.flat != null && p.flat == null) p.flat = sh.flat;
      if (sh.art && p.art == null) p.art = sh.art;
      if (sh.pivot && !p.pivot) p.pivot = sh.pivot.slice();
      if (sh.spin) p.spin = true;
    });
    return out;
  }

  global.SHAPES = SHAPES;
  global.SEMI_CELLS = SEMI_CELLS;
  global.QUARTER_CELLS = cp([QUARTER]);
  global.THREE_QUARTER_CELLS = cp(THREE_QUARTER);
  global.FULL_CIRCLE_CELLS = cp(FULL_CIRCLE);
  global.resolveShapes = resolve;
  if (typeof module !== 'undefined' && module.exports) module.exports = {
    SHAPES, SEMI_CELLS, THREE_QUARTER: cp(THREE_QUARTER), FULL_CIRCLE: cp(FULL_CIRCLE), resolve
  };
})(typeof window !== 'undefined' ? window : globalThis);
