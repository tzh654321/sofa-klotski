/* ────────────────────────────────────────────────────────────────
 * 设计关卡生成器：从「已解布局」用合法走法反向打乱
 *
 *   node tools/make-levels.js [每类候选数]
 *
 * 为什么不随机摆块再判可解：那样 90% 的候选无解，且随机布局经常重叠。
 * 从已解状态出发只走合法走法 ⇒ 反着走回去必然可解；再按
 * 状态空间 / 最短解长度 / 最短路径条数打分，丢掉分数过低的。
 *
 * 产物 tools/level-candidates.json：每类最好的一关，供 levels.js 收录。
 * ──────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const { resolve, SEMI_CELLS } = require('../shapes.js');

const TRIES = +(process.argv[2] || 60);
const CAP = 160000;

let seed = 20261113;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ri = n => Math.floor(rnd() * n) % n;
const clone = o => JSON.parse(JSON.stringify(o));

const PAL = ['#ed1c24', '#fff200', '#00a2e8', '#3f48cc', '#ffaec9', '#b97a57', '#a349a4', '#22b14c', '#7ddc9a'];
const T = {
  '1x2': { label: '竖条', cells: [[0, 0], [0, 1]] },
  '2x1': { label: '横条', cells: [[0, 0], [1, 0]] },
  '1x1': { label: '小卒', cells: [[0, 0]] },
  'L3': { label: '拐角', cells: [[0, 0], [0, 1], [1, 1]] },
  'semi': { label: '半月', cells: [[0, 0], [1, 0]] },
  'quarter': { label: '圆角', cells: [[0, 0]] },
  'bridge': { label: '断桥', cells: [[0, 0], [0, 1], [2, 0], [2, 1]] }
};

function pieceOf(kind, id, extra) {
  const t = T[kind];
  const p = Object.assign({ id, shape: kind === 'semi' || kind === 'quarter' || kind === 'bridge' ? 'custom' : kind,
    color: PAL[0], name: t.label }, extra || {});
  if (kind === 'semi') {
    p.cells = clone(SEMI_CELLS); p.rot = 'pivot'; p.flat = 90; p.pair = 'disc'; p.nodedup = true;
  } else if (kind === 'quarter') {
    p.cells = [{ c: 0, r: 0, arc: [1, 1] }]; p.rot = 'pivot'; p.nodedup = true;
  } else if (kind === 'bridge') {
    p.cells = t.cells.map(([c, r]) => ({ c, r })); p.rot = false;
  } else if (kind === 'L3') {
    p.rot = 'pivot';
  }
  return p;
}

/** 在 solved 布局里随机无重叠地铺块（主角固定在终点） */
function layout(kinds, W, H, lockedCount) {
  const g = new Int8Array(W * H);
  const free = (cells, x, y) => cells.every(([c, r]) =>
    x + c >= 0 && y + r >= 0 && x + c < W && y + r < H && !g[(y + r) * W + (x + c)]);
  const put = (cells, x, y) => cells.forEach(([c, r]) => { g[(y + r) * W + (x + c)] = 1; });
  const gx = Math.floor((W - 2) / 2);
  const goal = { piece: 'hero', label: '底行正中',
    cells: [[gx, H - 2], [gx + 1, H - 2], [gx, H - 1], [gx + 1, H - 1]] };
  const pieces = [{ id: 'hero', x: gx, y: H - 2, shape: '2x2', color: '#ff7f27', name: '曹操', hero: true }];
  put([[0, 0], [1, 0], [0, 1], [1, 1]], gx, H - 2);

  kinds.forEach((kind, k) => {
    const t = T[kind];
    for (let att = 0; att < 80; att++) {
      const x = ri(W), y = ri(H);
      if (!free(t.cells, x, y)) continue;
      // 别把出口两列完全堵死（留一点腾挪空间）
      put(t.cells, x, y);
      pieces.push(pieceOf(kind, 'p' + k, { x, y, color: PAL[(k + 1) % PAL.length] }));
      return;
    }
    return null;
  });
  if (pieces.length !== kinds.length + 1) return null;

  // 锁定块：只锁小件，且不锁主角
  if (lockedCount) {
    const cand = pieces.filter(p => p.id !== 'hero' && (p.shape === '1x1' || p.shape === '1x2'));
    for (let k = 0; k < Math.min(lockedCount, cand.length); k++) {
      const p = cand.splice(ri(cand.length), 1)[0];
      p.lock = true; p.color = '#6b6480'; p.name = '锁石';
    }
  }
  // 想留出 2~5 个空格：铺不满就随机删掉几个小件
  let empty = g.reduce((s, v) => s + (v ? 0 : 1), 0);
  if (empty < 2) {
    const small = pieces.filter(p => p.id !== 'hero' && !p.lock && p.shape === '1x1');
    while (empty < 3 && small.length) {
      const p = small.splice(ri(small.length), 1)[0];
      g[p.y * W + p.x] = 0; empty++;
      pieces.splice(pieces.indexOf(p), 1);
    }
  }
  if (empty > 7) return null;
  return { name: '候选', w: W, h: H, pieces, goals: [goal], _empty: empty };
}

/** 从「已解状态」做完整 BFS，取离它最远的那个位姿当开局。
 *  反向路径一定存在 ⇒ 必然可解；BFS 距离就是解长度的下界，比随机打乱靠谱得多。
 *  （随机打乱在紧凑局面里主角几乎不动，最短路常常只有 1~3 步。） */
function farthest(raw, cap) {
  const r = resolve(raw);
  const L = K.parse(r), st0 = K.initialState(r);
  const hero = r.pieces.findIndex(p => p.id === 'hero');
  const gx = Math.floor((L.w - 2) / 2), gy = L.h - 2;
  const far = s => Math.abs(s[hero].x - gx) + Math.abs(s[hero].y - gy);
  const keyOf = K.makeKeyer(L);
  const k0 = keyOf(st0);
  const seen = new Map([[k0, st0]]), dist = new Map([[k0, 0]]);
  const q = [k0];
  let head = 0, best = { st: st0, d: 0 }, truncated = false;
  while (head < q.length) {
    const k = q[head++], s = seen.get(k), d = dist.get(k);
    for (const mv of K.moves(L, s)) {
      const ns = K.apply(s, mv), nk = keyOf(ns);
      if (dist.has(nk)) continue;
      dist.set(nk, d + 1); seen.set(nk, ns); q.push(nk);
      if (d + 1 > best.d && far(ns) >= 2) best = { st: ns, d: d + 1 };
    }
    if (dist.size > cap) { truncated = true; break; }
  }
  return { r, L, st: best.st, depth: best.d, states: dist.size, truncated };
}

function evaluate(raw) {
  const f = farthest(raw, CAP);
  if (f.truncated || f.depth < 24) return null;
  const st = f.st;
  // 用最远位姿当关卡初始状态
  const out = clone(raw);
  out.pieces.forEach((p, i) => { p.x = st[i].x; p.y = st[i].y; p.ori = st[i].ori; });
  const rr = resolve(out);
  const L2 = K.parse(rr), st2 = K.initialState(rr);
  // 布局合法性
  const used = new Set();
  for (let i = 0; i < L2.pieces.length; i++)
    for (const [c, r] of K.pieceCells(L2, st2, i)) {
      const k = c + ',' + r;
      if (c < 0 || r < 0 || c >= L2.w || r >= L2.h || used.has(k)) return null;
      used.add(k);
    }
  if (K.isGoal(L2, st2, rr.goals)) return null;
  const s = K.solve(L2, st2, rr.goals, { maxNodes: CAP });
  if (!s.ok || s.moves.length < 24) return null;       // 太短的关直接舍弃
  const a = K.analyze(L2, st2, rr.goals, { maxNodes: CAP });
  const d = K.difficulty(a);
  if (!d || a.truncated) return null;
  return { raw: out, steps: s.moves.length, hands: K.mergeMoves(s.moves).length,
    states: a.states, paths: a.paths, depth: a.depth, branching: a.branching, diff: d };
}

const CATS = {
  plain:  { kinds: ['1x2', '1x2', '1x2', '1x2', '2x1', '1x1', '1x1', '1x1'], W: 4, H: 5, lock: 0 },
  lock:   { kinds: ['1x2', '1x2', '1x2', '2x1', '1x1', '1x1', '1x1', '1x1'], W: 4, H: 5, lock: 2 },
  bridge: { kinds: ['bridge', '1x2', '2x1', '1x1', '1x1', '1x1'], W: 4, H: 5, lock: 0 },
  semi:   { kinds: ['semi', 'semi', '1x2', '2x1', '1x1', '1x1', '1x1'], W: 4, H: 5, lock: 0 },
  arc:    { kinds: ['quarter', 'quarter', '1x2', '1x2', '2x1', '1x1', '1x1', '1x1'], W: 4, H: 5, lock: 0 },
  tall:   { kinds: ['1x2', '1x2', '1x2', '1x2', '2x1', '2x1', '1x1', '1x1', '1x1'], W: 4, H: 6, lock: 1 }
};

const best = {};
for (const [cat, cfg] of Object.entries(CATS)) {
  let n = 0;
  for (let t = 0; t < TRIES; t++) {
    const raw = layout(cfg.kinds, cfg.W, cfg.H, cfg.lock);
    if (!raw) continue;
    const e = evaluate(raw);
    if (!e) continue;
    n++;
    if (!best[cat] || e.diff.score > best[cat].diff.score) best[cat] = e;
    if (e.diff.score >= 45 && e.steps >= 26) {
      console.log(cat.padEnd(8), ('空' + raw._empty).padEnd(4),
        (e.steps + '步/' + e.hands + '手').padEnd(12), (e.states + '态').padEnd(9),
        (e.paths + '路').padEnd(10), e.diff.score + '分 ' + e.diff.grade);
    }
  }
  const b = best[cat];
  console.log('  → ' + cat + ' 合格 ' + n + ' / ' + TRIES +
    (b ? '，最佳 ' + b.diff.score + ' 分 / ' + b.steps + ' 步 / ' + b.states + ' 态' : '，无可用候选'));
}

const out = {};
for (const [k, v] of Object.entries(best)) if (v) out[k] = v;
fs.writeFileSync(path.join(__dirname, 'level-candidates.json'), JSON.stringify(out, null, 1));
console.log('\n写出 tools/level-candidates.json');
