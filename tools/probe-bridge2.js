/* 断桥类最后一试：稀疏棋盘 + 从终点 BFS 取最远位姿当开局。
 * 若仍找不到 ≥40 分的合法关，就按需求「舍弃难度分过低的」把这一类砍掉。
 *   node tools/probe-bridge2.js
 */
const path = require('path');
const fs = require('fs');
const K = require(path.join(__dirname, '..', 'sofa-klotski.js'));
const { resolve } = require(path.join(__dirname, '..', 'shapes.js'));
const CAP = 120000;

const COLORS = ['#3f48cc', '#00a2e8', '#ffaec9', '#b97a57', '#22b14c', '#fff200'];
const G = (W, H) => ({ piece: 'hero', label: '底行正中',
  cells: [[Math.floor((W - 2) / 2), H - 2], [Math.floor((W - 2) / 2) + 1, H - 2],
    [Math.floor((W - 2) / 2), H - 1], [Math.floor((W - 2) / 2) + 1, H - 1]] });

function farthest(raw) {
  const r = resolve(raw), L = K.parse(r), st0 = K.initialState(r);
  const keyOf = K.makeKeyer(L), k0 = keyOf(st0);
  const seen = new Map([[k0, st0]]), dist = new Map([[k0, 0]]), q = [k0];
  const gx = Math.floor((L.w - 2) / 2), gy = L.h - 2;
  let head = 0, best = { st: st0, d: 0 }, truncated = false;
  while (head < q.length) {
    const k = q[head++], s = seen.get(k), d = dist.get(k);
    for (const mv of K.moves(L, s)) {
      const ns = K.apply(s, mv), nk = keyOf(ns);
      if (dist.has(nk)) continue;
      dist.set(nk, d + 1); seen.set(nk, ns); q.push(nk);
      if (d + 1 > best.d && Math.abs(ns[0].x - gx) + Math.abs(ns[0].y - gy) >= 2) best = { st: ns, d: d + 1 };
    }
    if (dist.size > CAP) { truncated = true; break; }
  }
  return { st: best.st, d: best.d, states: dist.size, truncated };
}

function build(W, H, bridgeCells, extras) {
  const gx = Math.floor((W - 2) / 2);
  const pieces = [
    { id: 'hero', x: gx, y: H - 2, shape: '2x2', color: '#ff7f27', name: '曹操', hero: true },
    { id: 'bridge', x: 0, y: 0, shape: 'custom', color: '#a349a4', name: '断桥',
      cells: bridgeCells.map(([c, r]) => ({ c, r })), rot: false }
  ];
  for (let k = 0; k < extras.length; k++) {
    const [x, y] = extras[k];
    pieces.push({ id: 'p' + k, x, y, shape: '1x1', color: COLORS[k % COLORS.length], name: '卒' + (k + 1) });
  }
  const used = new Set();
  for (const p of pieces) {
    const cells = p.shape === '2x2' ? [[0, 0], [1, 0], [0, 1], [1, 1]]
      : p.shape === 'custom' ? bridgeCells : [[0, 0]];
    for (const [c, r] of cells) {
      const k = (p.x + c) + ',' + (p.y + r);
      if (p.x + c < 0 || p.y + r < 0 || p.x + c >= W || p.y + r >= H || used.has(k)) return null;
      used.add(k);
    }
  }
  return { name: '断桥', w: W, h: H, pieces, goals: [G(W, H)] };
}

const results = [];
const BRIDGES = [[[0, 0], [1, 1]], [[0, 0], [2, 0]], [[0, 0], [1, 1], [3, 1]]];
for (const W of [4, 5]) for (const H of [5, 6]) for (const bc of BRIDGES) {
  for (const extras of [[], [[3, 2]], [[3, 2], [0, 3]], [[3, 2], [0, 3], [W - 1, 1]]]) {
    const base = build(W, H, bc, extras);
    if (!base) continue;
    const f = farthest(base);
    if (f.truncated || f.d < 20) continue;
    const raw = JSON.parse(JSON.stringify(base));
    raw.pieces.forEach((p, i) => { p.x = f.st[i].x; p.y = f.st[i].y; p.ori = f.st[i].ori; });
    const r = resolve(raw), L = K.parse(r), st = K.initialState(r);
    const s = K.solve(L, st, r.goals, { maxNodes: CAP });
    if (!s.ok) continue;
    const a = K.analyze(L, st, r.goals, { maxNodes: CAP }), d = K.difficulty(a);
    if (!d || a.truncated) continue;
    const rec = { tag: W + '×' + H + ' 弧' + JSON.stringify(bc) + ' 卒' + extras.length,
      raw, steps: s.moves.length, hands: K.mergeMoves(s.moves).length,
      states: a.states, paths: a.paths, score: d.score, grade: d.grade };
    console.log(rec.tag.padEnd(42), rec.steps + '步/' + rec.hands + '手', a.states + '态',
      a.paths + '路', d.score + '分 ' + d.grade);
    results.push(rec);
  }
}
results.sort((a, b) => b.score - a.score);
console.log('\n找到 ' + results.length + ' 关；≥40 分的 ' + results.filter(r => r.score >= 40).length + ' 关');
if (results.length) fs.writeFileSync(path.join(__dirname, 'bridge-candidates.json'), JSON.stringify(results, null, 1));
