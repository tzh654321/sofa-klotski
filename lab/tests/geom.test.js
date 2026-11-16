/* 无头几何内核测试：node test/geom.test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, window: {} };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['sofa-shape.js', 'sofa-geom.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const SOFA = ctx.SOFA_OUTLINE;
const G = ctx.SofaGeom;

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ` (${a} vs ${b})`); }

const level = {
  w: 4, h: 5,
  blocks: [
    { id: 'r', x: 0, y: 0, w: 1, h: 2 },
    { id: 'o', x: 1, y: 0, w: 2, h: 2 },
    { id: 'y', x: 3, y: 0, w: 1, h: 2 },
    { id: 'c', x: 1, y: 2, w: 2, h: 1 },
    { id: 'b', x: 3, y: 2, w: 1, h: 2 },
    { id: 'p', x: 1, y: 4, w: 1, h: 1 },
    { id: 'n', x: 2, y: 4, w: 1, h: 1 },
    { id: 'm', x: 3, y: 4, w: 1, h: 1 }
  ]
};
const REF = { cx: 0.498, cy: 3.499, deg: 0 };

console.log('\n[1] 轮廓本体');
ok(SOFA.length >= 100, '点数 ' + SOFA.length);
const a0 = G.area(SOFA);
near(a0, 1.852, 0.02, '面积 1.85 格²');
const bb0 = G.bboxOf(SOFA);
near(bb0[2] - bb0[0], 0.928, 0.01, '宽 0.93 格');
near(bb0[3] - bb0[1], 2.919, 0.01, '长 2.92 格');
// 简单多边形（无自交）
function selfIntersect(poly) {
  const n = poly.length;
  const seg = (a, b, c, d) => {
    const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
    const d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  };
  let hits = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (seg(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) hits++;
    }
  }
  return hits;
}
ok(selfIntersect(SOFA) === 0, '轮廓无自交', selfIntersect(SOFA));

console.log('\n[2] 参考局面');
ok(G.conflict(level, level.blocks, REF, SOFA) === null, '沙发落在 L 形走廊里不碰撞');
const wb = G.bboxOf(G.polyFor(SOFA, REF));
near(wb[0], 0.034, 0.01, '世界包围盒 x0');
near(wb[1], 2.040, 0.01, '世界包围盒 y0');
near(wb[2], 0.962, 0.01, '世界包围盒 x1');
near(wb[3], 4.959, 0.01, '世界包围盒 y1');

// 方块之间不重叠、都在界内
let overlap = 0;
for (let i = 0; i < level.blocks.length; i++) {
  const a = level.blocks[i];
  if (a.x < 0 || a.y < 0 || a.x + a.w > level.w || a.y + a.h > level.h) overlap++;
  for (let j = i + 1; j < level.blocks.length; j++) if (G.rectsOverlap(a, level.blocks[j])) overlap++;
}
ok(overlap === 0, '8 个方块互不重叠且在界内');

const filled = level.blocks.reduce((s, b) => s + b.w * b.h, 0);
console.log(`     方块占 ${filled} 格，沙发 ${a0.toFixed(2)} 格²，空地 ${(level.w * level.h - filled - a0).toFixed(2)} 格²`);

console.log('\n[3] 出生点能不能动');
const rng0 = G.rotRange(level, level.blocks, REF, SOFA, 0.25, 180);
console.log(`     可转范围 −${rng0[0]}° / +${rng0[1]}°`);
ok(rng0[0] + rng0[1] < 30, '走廊里几乎转不动（符合“必须靠挪方块腾地方”的设计）');
for (const [dx, dy, name] of [[0, -0.02, '上'], [0.02, 0, '右'], [-0.02, 0, '左'], [0, 0.02, '下']]) {
  const r = G.conflict(level, level.blocks, { cx: REF.cx + dx, cy: REF.cy + dy, deg: 0 }, SOFA);
  console.log(`     平移 ${name} 0.02 格 -> ${r === null ? '可' : '卡住(' + r + ')'}`);
}

console.log('\n[4] 图2 局面：两个 1×1 上移一格');
const lv2 = JSON.parse(JSON.stringify(level));
lv2.blocks.find(b => b.id === 'p').y = 3;
lv2.blocks.find(b => b.id === 'n').y = 3;
ok(G.conflict(lv2, lv2.blocks, REF, SOFA) === null, '原姿态在新局面下仍然合法');
const rng2 = G.rotRange(lv2, lv2.blocks, REF, SOFA, 0.25, 180);
console.log(`     可转范围 −${rng2[0]}° / +${rng2[1]}°（比原来大就说明腾出了转角）`);
ok(rng2[0] + rng2[1] > rng0[0] + rng0[1], '空出底行后转角余量确实变大');

// 图2 那个"斜 28° 卡在拐角"经核对并非合法姿态（沙发会压住粉/棕两块），是示意图；
// 但放开底行后沙发确实能横躺最后一行 —— 这才是该局面下真实存在的极端姿态。
const drawn = { cx: 1.1, cy: 3.6, deg: 28 };
ok(G.conflict(lv2, lv2.blocks, drawn, SOFA) !== null, '图2 的 28° 斜卡姿态物理上不合法（示意图）');
const flat = { cx: 1.5, cy: 4.5, deg: 90 };
ok(G.conflict(lv2, lv2.blocks, flat, SOFA) === null, '腾出底行后沙发可横躺最后一行 (1.5,4.5,90°)');
ok(G.conflict(level, level.blocks, flat, SOFA) !== null, '原布局下同一姿态不合法（底行没空）');

console.log('\n[5] 碰撞判定 vs 顶点采样交叉校验');
// 在沙发内部采样点，若有点落进方块，conflict 必须报碰撞
function sampleInside(poly, n) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0);
    if (G.pointInPoly(x, y, poly)) out.push([x, y]);
  }
  return out;
}
let bad = 0, tested = 0;
for (let t = 0; t < 400; t++) {
  const pose = { cx: -0.2 + Math.random() * 4.4, cy: -0.2 + Math.random() * 5.4, deg: Math.random() * 360 };
  const poly = G.polyFor(SOFA, pose);
  const pts = sampleInside(poly, 40);
  const hit = G.conflict(level, level.blocks, pose, SOFA);
  const inBlock = pts.some(p => level.blocks.some(b =>
    p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h));
  tested++;
  if (inBlock && hit === null) bad++;
  // 反向：报碰撞时，沙发必然要么出界要么与某方块相交（用采样点无法证伪，只查单调性）
  if (hit === null) {
    const bb = G.bboxOf(poly);
    if (bb[0] < -1e-6 || bb[1] < -1e-6 || bb[2] > 4 + 1e-6 || bb[3] > 5 + 1e-6) bad++;
  }
}
ok(bad === 0, `400 组随机姿态 / 采样点交叉校验无漏判（漏判 ${bad}/${tested}）`);

console.log('\n[6] 方块合法性');
const p1 = level.blocks.find(b => b.id === 'p');
ok(G.fits(level, level.blocks, REF, SOFA, p1, 1, 3) === true, '1×1 上移一格可行');
ok(G.fits(level, level.blocks, REF, SOFA, p1, 0, 4) === false, '1×1 挪进沙发占的格不可行');
ok(G.fits(level, level.blocks, REF, SOFA, p1, 4, 4) === false, '出界不可行');
ok(G.fits(level, level.blocks, REF, SOFA, p1, 2, 4) === false, '重叠不可行');

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
