/* 随机搜索候选关：按 recipe 摆放特殊块 + 随机填充 + 求解/打分筛
 *   node tools/gen/search.js <recipe> <seed> <trials> [solveCap] [analyzeCap]
 * 通过的候选以 JSON 行写到 stdout（重定向到 tools/gen/logs/*.jsonl）
 */
const { K, load, metrics, PALETTE } = require('./lib.js');
const { SHAPES } = require('../../shapes.js');

/* ───────── 随机数 ───────── */
let seed = 1;
const srand = s => { seed = s >>> 0; };
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ri = n => Math.floor(rnd() * n) % n;
const pick = a => a[ri(a.length)];

const NAMES = ['茶几', '木箱', '石墩', '坐垫', '台灯', '花架', '鞋柜', '书柜', '凳子', '地毯',
  '屏风', '水壶', '座钟', '花瓶', '靠枕', '矮柜', '边几', '蒲团', '折扇', '桌脚'];
const FILL = [
  { shape: '1x1', w: 4 }, { shape: '1x2', w: 6 }, { shape: '2x1', w: 6 },
  { shape: '2x2', w: 2 }, { shape: 'L3', w: 2 }, { shape: 'T4', w: 1.4 },
  { shape: 'L4', w: 1.4 }, { shape: '1x3', w: 1 }
];
const shapeCells = name => SHAPES[name].cells;

/* ───────── 摆放器 ───────── */
class Packer {
  constructor(W, H) { this.W = W; this.H = H; this.g = new Int8Array(W * H); this.pieces = []; this.filled = 0; }
  occ(c, r) { return (c < 0 || r < 0 || c >= this.W || r >= this.H) ? 1 : this.g[r * this.W + c]; }
  free(cells, x, y) { return cells.every(([dc, dr]) => this.occ(x + dc, y + dr) === 0); }
  put(cells, x, y, v) { for (const [dc, dr] of cells) this.g[(y + dr) * this.W + (x + dc)] = v || 1; this.filled += cells.length; }
  clear(cells, x, y) { for (const [dc, dr] of cells) { if (this.g[(y + dr) * this.W + (x + dc)]) this.filled--; this.g[(y + dr) * this.W + (x + dc)] = 0; } }
  reserve(c, r) { if (this.occ(c, r) === 0) { this.g[r * this.W + c] = 2; this.filled++; } }
  unreserve(c, r) { if (this.g[r * this.W + c] === 2) { this.g[r * this.W + c] = 0; this.filled--; } }
  add(def, cells, x, y) {
    if (!this.free(cells, x, y)) return false;
    this.put(cells, x, y);
    this.pieces.push(Object.assign({}, def, { x, y }));
    return true;
  }
}

/* ───────── 随机填充 ───────── */
function fill(pk, targetEmpty, opt) {
  opt = opt || {};
  const area = pk.W * pk.H;
  let guard = 0;
  while (guard++ < 1200) {
    const empty = area - pk.filled;
    if (empty <= targetEmpty) break;
    let total = 0;
    const cand = [];
    for (const f of FILL) {
      const cs = shapeCells(f.shape);
      if (cs.length > empty - targetEmpty) continue;
      cand.push([f, total]);
      total += f.w;
    }
    if (!cand.length) break;
    let r = rnd() * total, f = cand[cand.length - 1][0];
    for (const [ff, acc] of cand) if (r < acc + ff.w) { f = ff; break; }
    const cs = shapeCells(f.shape);
    for (let t = 0; t < 40; t++) {
      const x = ri(pk.W), y = ri(pk.H);
      if (pk.free(cs, x, y)) {
        pk.put(cs, x, y);
        pk.pieces.push({ id: 'f' + (pk.pieces.length + 1), x, y, shape: f.shape });
        break;
      }
    }
  }
  // 给填充块命名 / 上色
  let pi = 0;
  const pal = PALETTE.filter(c => c !== '#6b6480');
  for (const p of pk.pieces) {
    if (p.id[0] !== 'f') continue;
    p.color = pal[(pi * 7 + 1) % pal.length];
    p.name = NAMES[pi % NAMES.length] + (pi >= NAMES.length ? String(pi + 1) : '');
    pi++;
  }
}

/* ───────── recipes ───────── */
const RECIPES = {};

const SOFA_V = [[0, 0], [0, 1], [0, 2]];

/* 1) sofaH：5×5，沙发必须转成横的（ori3，缺口朝上）才能占住底行目标槽 */
RECIPES.sofaH = () => {
  const W = 5, H = 5, pk = new Packer(W, H);
  const pos = [];
  for (let y = 0; y + 2 < H; y++) for (let x = 0; x + 2 < W; x++)
    if (x + 1 < W && y + 1 < H) pos.push([x, y]);
  const [sx, sy] = pick(pos);
  if (!pk.add({ id: 'sofa', shape: 'sofa', ori: 0, name: '沙发', color: '#22b14c' }, SOFA_V, sx, sy)) return null;
  const notch = [sx + 1, sy + 1];
  pk.reserve(notch[0], notch[1]);
  fill(pk, pick([3, 4, 4]));
  pk.unreserve(notch[0], notch[1]);
  const gx = pick([1, 2]);
  const goal = { piece: 'sofa', label: '贴底横放', cells: [[gx, H - 1], [gx + 1, H - 1], [gx + 2, H - 1]] };
  return { name: '候选', w: W, h: H, pieces: pk.pieces, goals: [goal] };
};

/* 2) discQ：5×5，半圆+两块 1/4 圆同心拼整圆，目标是把指定 1/4 圆送到指定格 */
RECIPES.discQ = () => {
  const W = 5, H = 5, pk = new Packer(W, H);
  let cx, cy, done = false;
  for (let t = 0; t < 60 && !done; t++) {
    cx = 1 + ri(W - 1); cy = 1 + ri(H - 1);
    const x0 = cx - 1, y0 = cy - 1;
    if (!pk.free([[0, 0], [1, 0], [0, 1], [1, 1]], x0, y0)) continue;
    pk.put([[0, 0], [1, 0]], x0, y0);
    pk.pieces.push({ id: 'sem', x: x0, y: y0, shape: 'semi', name: '半月', color: '#a349a4' });
    pk.put([[0, 0]], x0, y0 + 1);
    pk.pieces.push({ id: 'qa', x: x0, y: y0 + 1, name: '甲', color: '#ffaec9', shape: 'custom',
      cells: [{ c: 0, r: 0, arc: [1, 0] }], rot: false });
    pk.put([[0, 0]], x0 + 1, y0 + 1);
    pk.pieces.push({ id: 'qb', x: x0 + 1, y: y0 + 1, name: '乙', color: '#5c00e6', shape: 'custom',
      cells: [{ c: 0, r: 0, arc: [0, 0] }], rot: false });
    done = true;
    var startWindow = [x0, y0];
  }
  if (!done) return null;
  // 目标窗口：不能是初始窗口
  let wx, wy, t2 = 0;
  do { wx = ri(W - 1); wy = ri(H - 1); } while (t2++ < 60 && wx === startWindow[0] && wy === startWindow[1]);
  if (wx === startWindow[0] && wy === startWindow[1]) return null;
  const which = pick(['qa', 'qb']);
  const cell = which === 'qa' ? [wx, wy + 1] : [wx + 1, wy + 1];
  const goal = { piece: which, label: which === 'qa' ? '甲归位' : '乙归位', cells: [cell] };
  fill(pk, pick([2, 3, 3, 4]));
  return { name: '候选', w: W, h: H, pieces: pk.pieces, goals: [goal] };
};

/* 3) lockBridge：5×5 / 6×4，锁定墙 + 不自相邻的自绘块，目标非标准 */
RECIPES.lockBridge = () => {
  const W = pick([5, 6]), H = W === 5 ? 5 : 4, pk = new Packer(W, H);
  const heroShape = pick(['2x2', 'sofa', '1x2']);
  const heroCells = heroShape === 'sofa' ? SOFA_V
    : heroShape === '2x2' ? [[0, 0], [1, 0], [0, 1], [1, 1]]
      : [[0, 0], [0, 1]];
  const hp = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pk.free(heroCells, x, y)) hp.push([x, y]);
  if (!hp.length) return null;
  const [hx, hy] = pick(hp);
  if (!pk.add({ id: 'hero', shape: heroShape, hero: true, name: '主角', color: '#ff7f27' }, heroCells, hx, hy)) return null;
  // 锁定块
  for (let k = 0; k < 2; k++) {
    const two = rnd() < 0.45;
    const cs = two ? pick([[[0, 0], [0, 1]], [[0, 0], [1, 0]]]) : [[0, 0]];
    let placed = false;
    for (let t = 0; t < 60 && !placed; t++) {
      const x = ri(W), y = ri(H);
      if (pk.free(cs, x, y)) {
        pk.put(cs, x, y);
        pk.pieces.push({ id: 'lock' + k, x, y, shape: two ? '1x2' : '1x1', lock: true, name: '焊石' + (k + 1), color: '#6b6480' });
        placed = true;
      }
    }
    if (!placed) return null;
  }
  // 不自相邻的自绘块（刚性平移，两段隔开）
  let okB = false;
  for (let t = 0; t < 200 && !okB; t++) {
    const ax = ri(W), ay = ri(H), bx = ri(W), by = ri(H);
    if (Math.abs(ax - bx) + Math.abs(ay - by) < 2) continue;
    const x0 = Math.min(ax, bx), y0 = Math.min(ay, by);
    const cells = [[ax - x0, ay - y0], [bx - x0, by - y0]];
    if (!pk.free(cells, x0, y0)) continue;
    pk.put(cells, x0, y0);
    pk.pieces.push({ id: 'rail', x: x0, y: y0, shape: 'custom', rot: false,
      cells: cells.map(([c, r]) => ({ c, r })), name: '双联杠', color: '#8ab72a' });
    okB = true;
  }
  if (!okB) return null;
  fill(pk, pick([2, 3, 4]));
  const level = { name: '候选', w: W, h: H, pieces: pk.pieces, goals: [] };
  if (heroShape === '2x2') {
    let gx, gy;
    if (hx === 0) gx = W - 2; else gx = 0;
    if (hy === 0) gy = H - 2; else gy = 0;
    level.goals = [{ piece: 'hero', label: '对角', cells: [[gx, gy], [gx + 1, gy], [gx, gy + 1], [gx + 1, gy + 1]] }];
  } else if (heroShape === 'sofa') {
    const gx = ri(W - 2);
    level.goals = [{ piece: 'hero', label: '贴底横放', cells: [[gx, H - 1], [gx + 1, H - 1], [gx + 2, H - 1]] }];
  } else {
    level.goals = [{ piece: 'hero', label: '右下立', cells: [[W - 1, H - 2], [W - 1, H - 1]] }];
  }
  return level;
};

/* 4) twoGoals：5×5，两个块各自归位 */
RECIPES.twoGoals = () => {
  const W = 5, H = 5, pk = new Packer(W, H);
  const h = [];
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) h.push([x, y]);
  const [hx, hy] = pick(h);
  if (!pk.add({ id: 'hero', shape: '2x2', hero: true, name: '大柜', color: '#ff7f27' }, [[0, 0], [1, 0], [0, 1], [1, 1]], hx, hy)) return null;
  const bp = [];
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) if (pk.free([[0, 0], [0, 1]], x, y)) bp.push([x, y]);
  if (!bp.length) return null;
  const [bx, by] = pick(bp);
  if (!pk.add({ id: 'bar', shape: '1x2', name: '立柜', color: '#00a2e8' }, [[0, 0], [0, 1]], bx, by)) return null;
  fill(pk, pick([2, 3]));
  return {
    name: '候选', w: W, h: H, pieces: pk.pieces,
    goals: [
      { piece: 'hero', label: '左上', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
      { piece: 'bar', label: '右下', cells: [[4, 3], [4, 4]] }
    ]
  };
};

/* 5) sofaSemi：4×6，沙发 + 半圆，目标异形 */
RECIPES.sofaSemi = () => {
  const W = 4, H = 6, pk = new Packer(W, H);
  const pos = [];
  for (let y = 0; y + 2 < H; y++) for (let x = 0; x + 2 < W; x++)
    if (x + 1 < W && y + 1 < H) pos.push([x, y]);
  const [sx, sy] = pick(pos);
  if (!pk.add({ id: 'sofa', shape: 'sofa', ori: 0, name: '沙发', color: '#22b14c' }, SOFA_V, sx, sy)) return null;
  const notch = [sx + 1, sy + 1];
  pk.reserve(notch[0], notch[1]);
  // 半圆
  let ok = false;
  for (let t = 0; t < 120 && !ok; t++) {
    const cx = 1 + ri(W - 1), cy = 1 + ri(H - 1);
    const x0 = cx - 1, y0 = cy - 1;
    const semi = [[0, 0], [1, 0]];
    if (!pk.free(semi, x0, y0)) continue;
    pk.put(semi, x0, y0);
    pk.pieces.push({ id: 'sem', x: x0, y: y0, shape: 'semi', name: '半月', color: '#a349a4' });
    ok = true;
  }
  if (!ok) { pk.unreserve(notch[0], notch[1]); return null; }
  fill(pk, pick([2, 3]));
  pk.unreserve(notch[0], notch[1]);
  const gx = ri(W - 2);
  return {
    name: '候选', w: W, h: H, pieces: pk.pieces,
    goals: [{ piece: 'sofa', label: '贴底横放', cells: [[gx, H - 1], [gx + 1, H - 1], [gx + 2, H - 1]] }]
  };
};

/* 6) sofaLockWall：5×4，沙发 + 锁定墙，沙发必须转 */
RECIPES.sofaLockWall = () => {
  const W = 5, H = 4, pk = new Packer(W, H);
  const pos = [];
  for (let y = 0; y + 2 < H; y++) for (let x = 0; x + 2 < W; x++)
    if (x + 1 < W && y + 1 < H) pos.push([x, y]);
  const [sx, sy] = pick(pos);
  if (!pk.add({ id: 'sofa', shape: 'sofa', ori: 0, name: '沙发', color: '#22b14c' }, SOFA_V, sx, sy)) return null;
  const notch = [sx + 1, sy + 1];
  pk.reserve(notch[0], notch[1]);
  // 锁定墙
  let placed = false;
  for (let t = 0; t < 80 && !placed; t++) {
    const lx = 1 + ri(W - 1);
    const cs = rnd() < 0.5 ? [[0, 0], [0, 1]] : [[0, 0], [1, 0]];
    if (!pk.free(cs, lx, ri(H - 1) + 1)) continue;
  }
  // 简化：锁定墙固定为竖 1x2，放在右半边
  for (let t = 0; t < 120 && !placed; t++) {
    const lx = 2 + ri(W - 2);
    const ly = ri(H - 1);
    if (!pk.free([[0, 0], [0, 1]], lx, ly)) continue;
    pk.put([[0, 0], [0, 1]], lx, ly);
    pk.pieces.push({ id: 'wall', x: lx, y: ly, shape: '1x2', lock: true, name: '焊墙', color: '#6b6480' });
    placed = true;
  }
  if (!placed) { pk.unreserve(notch[0], notch[1]); return null; }
  fill(pk, pick([2, 3]));
  pk.unreserve(notch[0], notch[1]);
  const gx = pick([1, 2]);
  return {
    name: '候选', w: W, h: H, pieces: pk.pieces,
    goals: [{ piece: 'sofa', label: '贴底横放', cells: [[gx, H - 1], [gx + 1, H - 1], [gx + 2, H - 1]] }]
  };
};

/* ───────── 主流程 ───────── */
const recipe = process.argv[2] || 'sofaH';
const baseSeed = +(process.argv[3] || 1);
const trials = +(process.argv[4] || 40);
const solveCap = +(process.argv[5] || 300000);
const analyzeCap = +(process.argv[6] || 300000);
if (!RECIPES[recipe]) { console.error('未知 recipe: ' + Object.keys(RECIPES).join(', ')); process.exit(1); }

const t0 = Date.now();
let tried = 0, solv = 0, passed = 0;
for (let t = 0; t < trials; t++) {
  srand(baseSeed * 100003 + t * 7919 + 13);
  let level = null;
  try { level = RECIPES[recipe](); } catch (e) { level = null; }
  if (!level) continue;
  tried++;
  const m = metrics(level, { solveCap, analyzeCap });
  if (!m.ok) continue;
  solv++;
  if (m.a.truncated) continue;
  if (m.steps < 24) continue;
  if (m.score < 34) continue;
  passed++;
  console.log(JSON.stringify({
    recipe, seed: baseSeed * 100003 + t * 7919 + 13, t,
    steps: m.steps, hands: m.hands, states: m.states, paths: m.paths,
    score: m.score, grade: m.grade, parts: m.d.parts,
    sofaTurns: m.sofaTurns, sectorIdx: m.sectorIdx, lockIdx: m.lockIdx,
    customIdx: m.customIdx, concentric: m.concentric, stdGoal: m.stdGoal,
    interference: m.a.interference, level
  }));
}
console.error('[' + recipe + '] 生成 ' + tried + ' 可解 ' + solv + ' 通过 ' + passed +
  ' 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
