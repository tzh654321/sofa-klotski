/* 关卡生成器：4×6 板、随机铺块（留 4~7 空位），求解器筛"可解且够长"
 *   node test/gen.js lock 200
 */
const K = require('../sofa-klotski.js');
const { resolve, SEMI_CELLS } = require('../shapes.js');

let seed = +(process.argv[6] || 7717);
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ri = n => Math.floor(rnd() * n) % n;
const COLORS = ['#ed1c24', '#ff7f27', '#fff200', '#00a2e8', '#3f48cc', '#ffaec9', '#b97a57', '#a349a4', '#22b14c'];

const SHAPES = {
  a: [[0, 0]], b: [[0, 0], [0, 1]], c: [[0, 0], [1, 0]]
};

function make(type, W, H) {
  const g = new Int8Array(W * H);
  const occ = (c, r) => (c < 0 || r < 0 || c >= W || r >= H) ? 1 : g[r * W + c];
  const put = (cells, x, y, v) => { for (const [dc, dr] of cells) g[(y + dr) * W + (x + dc)] = v || 1; };
  const free = (cells, x, y) => cells.every(([dc, dr]) => !occ(x + dc, y + dr));
  const pieces = [];
  let n = 0;

  // 主角
  let hx, hy, guard = 0;
  do { hx = ri(W - 1); hy = ri(Math.max(1, H - 3)); } while (guard++ < 60 && !free([[0, 0], [1, 0], [0, 1], [1, 1]], hx, hy));
  put([[0, 0], [1, 0], [0, 1], [1, 1]], hx, hy);
  pieces.push({ id: 'hero', x: hx, y: hy, shape: '2x2', hero: true, name: '曹操', color: '#ff7f27' });

  // 特殊块
  if (type === 'lockkeep') { /* 先不放石头，由外层挑一块上锁 */ }
  else if (type === 'lock') {
    for (let k = 0; k < 2; k++) {
      const two = rnd() < 0.4;
      const cells = two ? SHAPES.b : SHAPES.a;
      let done = false, gg = 0;
      while (gg++ < 60 && !done) {
        const x = ri(two ? W - 1 : W), y = ri(two ? H - 1 : H);
        if (!free(cells, x, y)) continue;
        if (y >= H - 2 && x <= 2) continue;                 // 别占目标区
        put(cells, x, y); done = true;
        pieces.push({ id: 'rock' + k, x, y, shape: two ? '1x2' : '1x1', lock: true, name: '石' + (k + 1), color: '#6b6480' });
      }
    }
  } else if (type === 'bridge') {
    // 对角两格：4-邻接上互不相邻，但 bbox 2×2 可以原地旋转（换另一条对角）
    const cells = [[0, 0], [1, 1]];
    let done = false, gg = 0;
    while (gg++ < 80 && !done) {
      const x = ri(W - 1), y = ri(H - 1);
      if (!free(cells, x, y)) continue;
      put(cells, x, y); done = true;
      pieces.push({ id: 'bridge', x, y, cells: cells.map(([c, r]) => ({ c, r })), rot: 'pivot', name: '断桥', color: '#a349a4' });
    }
  } else {
    let done = false, gg = 0;
    while (gg++ < 80 && !done) {
      const x = ri(W - 1), y = ri(H - 1);
      if (!free(SEMI_CELLS, x, y)) continue;
      put(SEMI_CELLS.map(q => [q.c, q.r]), x, y); done = true;
      pieces.push({ id: 'semi', x, y, cells: JSON.parse(JSON.stringify(SEMI_CELLS)), rot: 'pivot', flat: 90, pair: 'disc', nodedup: true, name: '半月', color: '#a349a4' });
    }
  }

  // 填充：小件优先，铺到目标占用率
  const target = 12 + ri(7);        // 除主角外再占 12..18 格
  let filled = 0, gg = 0;
  while (gg++ < 400 && filled < target) {
    const ks = ['b', 'b', 'c', 'c', 'a'];
    const kind = ks[ri(ks.length)];
    const cells = SHAPES[kind];
    const x = ri(kind === 'c' ? W - 1 : W), y = ri(kind === 'b' ? H - 1 : H);
    if (!free(cells, x, y)) continue;
    put(cells, x, y);
    filled += cells.length;
    pieces.push({
      id: 'p' + (n++), x, y,
      shape: kind === 'a' ? '1x1' : kind === 'b' ? '1x2' : '2x1',
      name: String.fromCharCode(65 + (n % 26)), color: COLORS[n % COLORS.length]
    });
  }

  const empty = g.reduce((s, v) => s + (v ? 0 : 1), 0);
  const gx = Math.floor((W - 2) / 2);
  return {
    name: type, w: W, h: H, pieces,
    goals: [{ piece: 'hero', label: '底行正中', cells: [[gx, H - 2], [gx + 1, H - 2], [gx, H - 1], [gx + 1, H - 1]] }],
    _empty: empty
  };
}

const type = process.argv[2] || 'lock';
const tries = +(process.argv[3] || 120);
const W = +(process.argv[4] || 4), H = +(process.argv[5] || 6);
let solv = 0, best = null;
for (let t = 0; t < tries; t++) {
  const raw = make(type, W, H);
  if (raw._empty < 3 || raw._empty > 8) continue;
  const r = resolve(raw);
  const L = K.parse(r), st = K.initialState(r);
  const used = new Map(); let bad = 0;
  for (let i = 0; i < L.pieces.length; i++) for (const [c, rr] of K.pieceCells(L, st, i)) {
    const k = c + ',' + rr;
    if (used.has(k)) bad++; else used.set(k, i);
  }
  if (bad) continue;
  let s = K.solve(L, st, r.goals, { maxNodes: 200000 });
  if (!s.ok) continue;
  solv++;
  if (type === 'lockkeep') {
    // 把某个填充块焊死，看是否还能解、且不至于太短
    for (let i = 1; i < raw.pieces.length; i++) {
      const r2 = JSON.parse(JSON.stringify(raw));
      r2.pieces[i].lock = true;
      r2.pieces[i].color = '#6b6480';
      r2.pieces[i].name = '石·' + r2.pieces[i].name;
      const rr2 = resolve(r2);
      const L2 = K.parse(rr2), st2 = K.initialState(rr2);
      const s2 = K.solve(L2, st2, rr2.goals, { maxNodes: 200000 });
      if (!s2.ok || s2.moves.length < 26) continue;
      const a2 = K.analyze(L2, st2, rr2.goals, { maxNodes: 200000 });
      const d2 = K.difficulty(a2);
      if (!d2) continue;
      console.log('KEEPLOCK', '空' + raw._empty, '锁' + r2.pieces[i].id, s2.moves.length + '步/' + K.mergeMoves(s2.moves).length + '手',
        a2.states + '态', a2.paths + '路', d2.score + '分 ' + d2.grade);
      if (!best || d2.score > best.d.score) best = { raw: r2, steps: s2.moves.length, hands: K.mergeMoves(s2.moves).length, states: a2.states, paths: a2.paths, d: d2 };
      if (d2.score >= 65) {
        console.log('EARLY ' + JSON.stringify({ name: r2.name, w: r2.w, h: r2.h, pieces: r2.pieces, goals: r2.goals }));
        console.log('SCORE ' + d2.score + ' ' + s2.moves.length + '步 ' + K.mergeMoves(s2.moves).length + '手 ' + a2.states + '态 ' + a2.paths + '路');
        process.exit(0);
      }
    }
    continue;
  }
  const a = K.analyze(L, st, r.goals, { maxNodes: 200000 });
  const d = K.difficulty(a);
  const hands = K.mergeMoves(s.moves).length;
  if (s.moves.length < 22) continue;
  const rec = { raw, steps: s.moves.length, hands, states: a.states, paths: a.paths, d };
  if (!best || d.score > best.d.score) best = rec;
  if (d && d.score >= 55 && s.moves.length >= 28) {
    console.log('EARLY ' + JSON.stringify({ w: raw.w, h: raw.h, pieces: raw.pieces, goals: raw.goals }));
    console.log('SCORE ' + d.score + ' ' + s.moves.length + '步 ' + hands + '手 ' + a.states + '态');
    process.exit(0);
  }
  console.log(type, '空' + raw._empty, s.moves.length + '步/' + hands + '手', a.states + '态', (d ? d.score + '分 ' + d.grade : '—'));
}
console.log('可解 ' + solv + ' / ' + tries);
if (best) {
  console.log('\nBEST ' + best.steps + '步 ' + best.hands + '手 ' + (best.d ? best.d.score + '分' : ''));
  console.log(JSON.stringify({ name: type, w: best.raw.w, h: best.raw.h, pieces: best.raw.pieces, goals: best.raw.goals }, null, 1));
}
