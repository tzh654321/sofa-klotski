/* 精确解：把「草丛已在底行正中」的所有合法布局当作多源起点，BFS 全图，
 * 取离目标集合最远的状态 —— 它在数学上就是「最少步数最大」的初始布局。
 * 用法：node tools/search-exact.js
 */
const K = require('../sofa-klotski.js');
const { resolve } = require('../shapes.js');

const W = 4, H = 5;
const GOAL_CELLS = [[1, 3], [2, 3], [1, 4], [2, 4]];
const GOAL = { piece: 'hero', label: '底行正中', cells: GOAL_CELLS };

/* 构成：2h2v = 2 横 + 2 竖（默认）；3h1v = 3 横 + 1 竖。
 * 块顺序固定（大块先放）→ 生成的布局 id 稳定。 */
const SETNAME = process.argv[2] || '2h2v';
const HBAR = () => ({ shape: '2x1', base: [[0, 0], [1, 0]] });
const VBAR = () => ({ shape: '1x2', base: [[0, 0], [0, 1]] });
function planOf(set) {
  const ps = [
    { id: 'hero', shape: '2x2', base: [[0, 0], [1, 0], [0, 1], [1, 1]], name: '草丛', hero: true, fixed: { x: 1, y: 3 } },
    { id: 'sofa', shape: 'sofa', base: [[0, 0], [0, 1], [0, 2]], name: '沙发', rots: 4 }
  ];
  const bars = set === '3h1v' ? [HBAR(), HBAR(), HBAR(), VBAR()] : [HBAR(), HBAR(), VBAR(), VBAR()];
  bars.forEach((b, i) => ps.push(Object.assign(b, {
    id: 'b' + (i + 1), name: (b.shape === '2x1' ? '横条' : '竖条') + (i + 1)
  })));
  for (let i = 0; i < 3; i++) ps.push({ id: 'z' + (i + 1), shape: '1x1', base: [[0, 0]], name: '卒' + (i + 1) });
  return ps;
}
const PLAN = planOf(SETNAME);

function rotCells(cells) {
  const h = Math.max(...cells.map(c => c[1])) + 1;
  return cells.map(([c, r]) => [h - 1 - r, c]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
/** 某块的所有 (ori, x, y) 摆法 */
function placementsOf(kind) {
  const out = [];
  const rots = kind.rots || 1;
  for (let ori = 0; ori < rots; ori++) {
    let cells = kind.base;
    for (let t = 0; t < ori; t++) cells = rotCells(cells);
    const bw = Math.max(...cells.map(c => c[0])) + 1;
    const bh = Math.max(...cells.map(c => c[1])) + 1;
    for (let y = 0; y + bh <= H; y++) {
      for (let x = 0; x + bw <= W; x++) out.push({ ori, x, y, cells });
    }
  }
  return out;
}
const PLACE = PLAN.map(k => (k.fixed
  ? [{ ori: 0, x: k.fixed.x, y: k.fixed.y, cells: k.base }]
  : placementsOf(k)));

/** 枚举所有「草丛在目标位」的合法布局 */
function enumerateTargets(limit) {
  const out = [];
  const occ = new Int8Array(W * H).fill(-1);
  const cur = new Array(PLAN.length).fill(null);
  for (const [c, r] of PLAN[0].base) occ[(PLAN[0].fixed.y + r) * W + PLAN[0].fixed.x + c] = 0;
  cur[0] = { ori: 0, x: 1, y: 3, cells: PLAN[0].base };

  function rec(i) {
    if (out.length >= limit) return;
    if (i >= PLAN.length) {
      out.push(cur.map(o => ({ x: o.x, y: o.y, ori: o.ori })));
      return;
    }
    for (const pl of PLACE[i]) {
      let ok = true;
      for (const [c, r] of pl.cells) if (occ[(pl.y + r) * W + pl.x + c] !== -1) { ok = false; break; }
      if (!ok) continue;
      for (const [c, r] of pl.cells) occ[(pl.y + r) * W + pl.x + c] = i;
      cur[i] = pl;
      rec(i + 1);
      for (const [c, r] of pl.cells) occ[(pl.y + r) * W + pl.x + c] = -1;
    }
  }
  rec(1);
  return out;
}

function rawOf(poses) {
  return {
    name: '临时名称', w: W, h: H,
    pieces: PLAN.map((k, i) => ({
      id: k.id, x: poses[i].x, y: poses[i].y, ori: poses[i].ori,
      shape: k.shape, name: k.name, hero: !!k.hero
    })),
    goals: [GOAL]
  };
}

const LIMIT = +(process.argv[2] || 300000);
const t0 = Date.now();
const targets = enumerateTargets(LIMIT);
console.log('目标态 ' + targets.length + (targets.length >= LIMIT ? '（撞上限）' : '') +
  ' 个 · ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

const raw0 = resolve(rawOf(targets[0]));
const L = K.parse(raw0);
const keyOf = K.makeKeyer(L);

// 多源 BFS：所有目标态 dist=0
const dist = new Map();
const seen = new Map();
const q = [];
for (const poses of targets) {
  const st0 = K.initialState(resolve(rawOf(poses)));
  const k = keyOf(st0);
  if (dist.has(k)) continue;                    // 同形块互换 → 同一个抽象状态
  dist.set(k, 0); seen.set(k, st0); q.push(k);
}
console.log('去重后源点 ' + q.length + ' 个');

let head = 0, far = { d: 0, state: seen.get(q[0]), key: q[0] };
const t1 = Date.now();
while (head < q.length) {
  const k = q[head++];
  const d = dist.get(k), st = seen.get(k);
  if (d > far.d) far = { d, state: st, key: k };
  for (const mv of K.moves(L, st)) {
    const ns = K.apply(st, mv), nk = keyOf(ns);
    if (dist.has(nk)) continue;
    dist.set(nk, d + 1); seen.set(nk, ns); q.push(nk);
  }
  if ((head & 8191) === 0) process.stdout.write('\r  BFS ' + dist.size + ' 态 / 最深 ' + far.d + '   ');
}
console.log('\n全图 ' + dist.size + ' 态 · 最深 ' + far.d + ' 步 · BFS ' +
  ((Date.now() - t1) / 1000).toFixed(1) + 's');

const out = rawOf(far.state.map(s => ({ x: s.x, y: s.y, ori: s.ori })));
const resp = resolve(out);
const Ls = K.parse(resp), sts = K.initialState(resp);
const s = K.solve(Ls, sts, resp.goals, { maxNodes: 4000000 });
console.log('验证：最短 ' + (s.ok ? s.moves.length : '无解') + ' 步 / ' +
  (s.ok ? K.mergeMoves(s.moves).length : '-') + ' 手');
if (s.ok && s.moves.length !== far.d) console.log('⚠ 与 BFS 距离不一致（' + far.d + '）');
console.log('JSON ' + JSON.stringify(out));
