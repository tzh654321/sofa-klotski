/* 4×4「沙半」同款构成重搜：在「转体起点/落点的缺口都必须空」的新规则下可解，
 * 且最短解里沙发真的转过体。
 *   node tools/gen/search-shaBan.js [毫秒预算]
 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const W = 4, H = 4;
const GOAL = { piece: 'sq', cells: [[1, 2], [2, 2], [1, 3], [2, 3]] };
const BUDGET = +(process.argv[2] || 90000);
let seed = 20261114;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length) % a.length];

const SET = [
  { id: 'sq', shape: '2x2', hero: true, color: '#ff7f27', name: '方块' },
  { id: 'sem', shape: 'semi', color: '#a349a4', name: '半圆' },
  { id: 'bar', shape: '2x1', color: '#b97a57', name: '2×1' },
  { id: 'd1', shape: '1x1', color: '#00a2e8', name: '1×1' },
  { id: 'd2', shape: '1x1', color: '#3f48cc', name: '1×1' },
  { id: 'd3', shape: '1x1', color: '#ed1c24', name: '1×1' },
  { id: 'sofa', shape: 'sofa', color: '#22b14c', name: '沙发' }
];

function randomLayout() {
  const occ = new Set();
  const pieces = [];
  for (const spec of SET.slice().sort(() => rnd() - 0.5)) {
    let placed = false;
    for (let t = 0; t < 120 && !placed; t++) {
      const ori = (spec.shape === 'sofa' || spec.shape === 'semi') ? Math.floor(rnd() * 4) : 0;
      const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
      const probe = K.parse(resolve({ w: W, h: H, pieces: [Object.assign({ x, y, ori }, spec)] }));
      const cells = K.pieceCells(probe, [{ x, y, ori }], 0);
      if (cells.some(([c, r]) => c < 0 || r < 0 || c >= W || r >= H)) continue;
      if (cells.some(([c, r]) => occ.has(c + ',' + r))) continue;
      cells.forEach(([c, r]) => occ.add(c + ',' + r));
      pieces.push(Object.assign({ x, y, ori }, spec));
      placed = true;
    }
    if (!placed) return null;
  }
  return { name: '沙半', w: W, h: H, goals: [GOAL], pieces };
}

const t0 = Date.now();
const hits = [];
let tried = 0, solv = 0;
while (Date.now() - t0 < BUDGET) {
  const lv = randomLayout();
  if (!lv) continue;
  tried++;
  const raw = resolve(lv);
  const L = K.parse(raw), st = K.initialState(raw);
  const sol = K.solve(L, st, raw.goals, { maxNodes: 150000 });
  if (!sol.ok) continue;
  solv++;
  const hands = K.mergeMoves(sol.moves).length;
  const sofa = L.pieces.findIndex(p => p.rotMode === 'sofa');
  let turns = 0, cur = st;
  for (const m of sol.moves) { if (m.t === 'r' && m.i === sofa) turns++; cur = K.apply(cur, m); }
  if (!turns || hands < 12) continue;
  hits.push({ hands, steps: sol.moves.length, turns, level: lv });
  hits.sort((a, b) => b.hands - a.hands);
  if (hits.length > 8) hits.length = 8;
}
console.error('[' + tried + ' 布局 / 可解 ' + solv + ' / 命中 ' + hits.length + '] 用时 ' +
  ((Date.now() - t0) / 1000).toFixed(0) + 's');
for (const h of hits) {
  const an = K.analyze(K.parse(resolve(h.level)), K.initialState(resolve(h.level)), h.level.goals, { maxNodes: 1200000 });
  const d = K.difficulty(an);
  console.error('  手数 ' + h.hands + ' 步 ' + h.steps + ' 转体 ' + h.turns + ' 态 ' + an.states +
    ' 路 ' + an.paths + ' → ' + (d ? d.score + ' 分 ' + d.grade : '—'));
}
console.log(JSON.stringify(hits));
