/* 4×5「横刀弯马」同名单重搜：曹操 2×2 + 关羽 2×1 + 三将 1×2 + 三卒 + 沙发，
 * 要求可解、沙发在最短解里转过体、手数够长。
 *   node tools/gen/search-hengdao.js [毫秒预算]
 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const W = 4, H = 5;
const GOAL = { piece: 'hero', label: '底行正中', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] };
const BUDGET = +(process.argv[2] || 120000);
let seed = 0x5a17;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const SET = [
  { id: 'hero', shape: '2x2', hero: true, name: '曹操' },
  { id: 'guan', shape: '2x1', name: '关羽' },
  { id: 'zhang', shape: '1x2', name: '张飞' },
  { id: 'zhao', shape: '1x2', name: '赵云' },
  { id: 'huang', shape: '1x2', name: '黄忠' },
  { id: 'z1', shape: '1x1', name: '卒1' },
  { id: 'z2', shape: '1x1', name: '卒2' },
  { id: 'z4', shape: '1x1', name: '卒4' },
  { id: 'sofa', shape: 'sofa', name: '沙发' }
];

function randomLayout() {
  const occ = new Set();
  const pieces = [];
  for (const spec of SET.slice().sort(() => rnd() - 0.5)) {
    let placed = false;
    for (let t = 0; t < 150 && !placed; t++) {
      const ori = spec.shape === 'sofa' ? Math.floor(rnd() * 4) : 0;
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
  return { name: '横刀弯马', w: W, h: H, goals: [GOAL], pieces };
}

const t0 = Date.now();
const hits = [];
let tried = 0, solv = 0, withTurn = 0;
while (Date.now() - t0 < BUDGET) {
  const lv = randomLayout();
  if (!lv) continue;
  tried++;
  const raw = resolve(lv);
  const L = K.parse(raw), st = K.initialState(raw);
  const sofa = L.pieces.findIndex(p => p.rotMode === 'sofa');
  const sol = K.solve(L, st, raw.goals, { maxNodes: 400000 });
  if (!sol.ok) continue;
  solv++;
  let turns = 0;
  for (const m of sol.moves) if (m.t === 'r' && m.i === sofa) turns++;
  if (!turns) continue;
  withTurn++;
  const hands = K.mergeMoves(sol.moves).length;
  if (hands < 30) continue;
  hits.push({ hands, steps: sol.moves.length, turns, level: lv });
  hits.sort((a, b) => b.hands - a.hands);
  if (hits.length > 10) hits.length = 10;
}
console.error('[' + tried + ' 布局 / 可解 ' + solv + ' / 沙发转身 ' + withTurn + ' / 入选 ' + hits.length +
  '] 用时 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
for (const h of hits) {
  const an = K.analyze(K.parse(resolve(h.level)), K.initialState(resolve(h.level)), h.level.goals, { maxNodes: 1200000 });
  const d = K.difficulty(an);
  console.error('  ' + h.hands + ' 手 / ' + h.steps + ' 步 / 转 ' + h.turns + ' → 态 ' + an.states +
    ' 路 ' + an.paths + ' / ' + (d ? d.score + ' 分 ' + d.grade : '—'));
}
require('fs').writeFileSync(__dirname + '/logs/hengdao2.json', JSON.stringify(hits, null, 1), 'utf8');
