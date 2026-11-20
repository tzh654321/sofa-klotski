/* 迷宫迭代生成器 · maze-2
 *
 *   node tools/maze/evolve.cjs [--w 15] [--h 15] [--iters 400] [--seed 7] [--loops 0]
 *                              [--from levels/迷宫/01_密林穿行.json] [--out lab/mazes]
 *
 * 「每次迭代减小块的更改个数」：第 i 次迭代最多翻动
 *   k = max(1, round(K0 * (1 - i/iters)))  个格子
 * 前期一次改一大片（探索结构），后期一次只改一两格（精修）。
 * 接受准则：模拟退火（温度线性降到 0），只跟自己的工作副本比，不碰正式关卡集。
 *
 * 输出：<out>/maze-<seed>-<ts>.json（与 levels/迷宫 同构，但不写进 levels，不进关卡包）
 */
const fs = require('fs');
const path = require('path');
const MD = require('./difficulty.js');

/* ── 命令行 ── */
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const has = k => argv.includes('--' + k);
const W = +arg('w', 15), H = +arg('h', 15);
const ITERS = +arg('iters', 400);
const SEED = +arg('seed', 7);
const LOOPS = +arg('loops', 0);
const BASE = arg('base', 'ring');          // ring / perfect / vstripe / dstripe / checker / noise
const NN = arg('nn', '01');               // 文件名前缀（新批次用 02、03…，不覆盖已有的）
const TAG = { ring: '', perfect: ' 完美', vstripe: ' 竖纹', dstripe: ' 斜纹', checker: ' 棋盘', noise: ' 噪声' };
const OUT = arg('out', path.join(__dirname, '..', '..', 'levels', 'lab'));
const FROM = arg('from', null);
const QUIET = has('quiet');
const BEAM = Math.max(1, +arg('beam', 1));   // 每轮保留几个「晋级名额」
const CAND = Math.max(1, +arg('cand', 1));   // 每个名额每轮生几个候选
/* 大棋盘（51×51 有 1268 个通路格、>20 万条简单路径）一次评估要 12s，
 * 迭代时用较小的上限做粗筛；收尾那次再用默认上限复核。 */
const REACH = arg('reach', 'hard');   // hard = 强制全部可达；soft = 允许不可达，按比例扣奖励
const MAXEV = +arg('evals', 0);       // 演算总次数上限（0 = 不限）
const REPAIR = +(arg('repair', 0.35)); // soft 模式下每轮给"连回去"算子的概率
const REACHPOW = +(arg('reachpow', 2)); // 可达率奖励的指数
const MAXP = +arg('maxpaths', 2000);   // 迭代期不用枚举 20 万条：好盘面只有几条路
/* 迭代期评估用较小的节点上限：候选里一旦出现"边一多路径就爆炸"的盘面，
 * 3e7 上限一次要 1s（实测 120 轮里 90% 的时间都耗在这种废候选上）。
 * 这类候选本来就不可能是好盘面（路径越多越容易），顺手给它一个惩罚分。 */
const MAXN = +arg('maxnodes', 3e5);
/* 默认不惩罚：截断只是"少算了几条路"，实测对 beam 排序没影响（2e6 与 3e7 两种上限
 * 收敛到同一结果），但惩罚会挡住"中途路径很多、最后收敛成唯一解"的那条上升路径（151 vs 258）。 */
const INEXACT_PEN = +(arg('inexactpen', 1));   // 1 = 不额外打折（截断候选另有 -1 的一票否决）
const EVAL = { maxPaths: MAXP, maxNodes: MAXN };

/* ── 随机数（可复现） ── */
function rngOf(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const rand = rngOf(SEED);
const ri = n => Math.floor(rand() * n);
const pick = a => a[ri(a.length)];

/* ── 建底图：完美迷宫（唯一解）+ 可选环路 ── */
function makePerfect(w, h) {
  const wall = new Uint8Array(w * h).fill(1);
  const inb = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1;
  const oddX = [], oddY = [];
  for (let x = 1; x < w; x += 2) oddX.push(x);
  for (let y = 1; y < h; y += 2) oddY.push(y);
  const sx = oddX[0], sy = oddY[0];
  wall[sy * w + sx] = 0;
  const stack = [[sx, sy]];
  const seen = new Set([sy * w + sx]);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const cand = [];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx > w - 2 || ny > h - 2) continue;
      if (seen.has(ny * w + nx)) continue;
      cand.push([nx, ny, x + dx / 2, y + dy / 2]);
    }
    if (!cand.length) { stack.pop(); continue; }
    const [nx, ny, mx, my] = pick(cand);
    wall[my * w + mx] = 0;
    wall[ny * w + nx] = 0;
    seen.add(ny * w + nx);
    stack.push([nx, ny]);
  }
  // 去掉边界外的零头，起点/终点落在通路上
  const m = { w, h, wall, start: sy * w + sx, goal: 0 };
  const cx = (w % 2 ? w - 2 : w - 3), cy = (h % 2 ? h - 2 : h - 3);
  wall[cy * w + cx] = 0;
  m.goal = cy * w + cx;
  return m;
}

function clone(m) { return { w: m.w, h: m.h, wall: m.wall.slice(), start: m.start, goal: m.goal }; }

/** 回型（同心矩形环）底图：一圈圈走廊 + 每圈随机开口连到外一圈。
 *  这就是「回型迷宫」那 5 关的形状，也是本生成器的默认起点。 */
function makeRing(w, h, opts) {
  opts = opts || {};
  const wall = new Uint8Array(w * h).fill(1);
  const put = (x, y, v) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) wall[y * w + x] = v; };
  const ringOf = (x, y) => Math.min(x, y, w - 1 - x, h - 1 - y);
  const maxK = Math.floor(Math.min(w, h) / 2) - 1;
  for (let k = 1; k <= maxK; k += 2) {
    for (let x = k; x <= w - 1 - k; x++) { put(x, k, 0); put(x, h - 1 - k, 0); }
    for (let y = k; y <= h - 1 - k; y++) { put(k, y, 0); put(w - 1 - k, y, 0); }
  }
  // 相邻两圈之间开口：在中间那层墙上打通 1~2 处（要打在外圈/内圈都是走廊的那段）
  for (let k = 1; k + 2 <= maxK; k += 2) {
    const gaps = 1 + (rand() < 0.5 ? 1 : 0);
    for (let g = 0; g < gaps; g++) {
      const side = ri(4);
      if (side === 0 || side === 1) {                 // 上下两条边：x 落在内圈走廊的范围内
        const lo = k + 2, hi = w - k - 3;
        if (hi < lo) continue;
        const y = side === 0 ? k + 1 : h - 2 - k;
        put(lo + ri(hi - lo + 1), y, 0);
      } else {                                        // 左右两条边
        const lo = k + 2, hi = h - k - 3;
        if (hi < lo) continue;
        const x = side === 2 ? k + 1 : w - 2 - k;
        put(x, lo + ri(hi - lo + 1), 0);
      }
    }
  }
  // 中心：从最内圈开一条竖直通道连到中心格（否则中心是孤岛）
  const cx = (w - 1) >> 1, cy = (h - 1) >> 1;
  let inner = 1;
  for (let k = 1; k <= maxK; k += 2) inner = k;
  for (let y = inner; y <= cy; y++) put(cx, y, 0);
  wall[cy * w + cx] = 0;
  const m = { w, h, wall, start: 1 * w + 1, goal: cy * w + cx };
  // 兜底：万一开口没打通，沿一条直线硬连（保证起点到终点有路）
  for (let guard = 0; guard < 200 && !connected(m); guard++) {
    const c = 1 + ri(w * h - 2);
    if (!wall[c]) continue;
    const x = c % w, y = (c / w) | 0;
    if (ringOf(x, y) % 2 === 1) continue;
    wall[c] = 0;
  }
  return m;
}

/* ── 其它底图：条纹 / 棋盘 / 噪声 ────────────────────────────────────
 * 它们本身几乎都不连通（棋盘格的对角邻居在 4 连通下不算邻居），
 * 所以统一交给 `repair()`：反复用「连回主路」算子把每一片孤岛接进来。
 * repair 之后所有通路格都从起点可达，正好满足后面 `allReachable` 的硬约束。 */
function blank(w, h) {
  return {
    w, h, wall: new Uint8Array(w * h).fill(1),
    start: 1 * w + 1, goal: (((h - 1) >> 1) * w) + ((w - 1) >> 1),
  };
}
function pattern(w, h, isWall) {
  const m = blank(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) m.wall[y * w + x] = isWall(x, y) ? 1 : 0;
  }
  m.wall[m.start] = 0; m.wall[m.goal] = 0;
  return m;
}
const makeVStripe = (w, h) => pattern(w, h, x => x % 3 === 0);              // 竖条纹
const makeDStripe = (w, h) => pattern(w, h, (x, y) => (x + y) % 3 === 0);   // 斜条纹
const makeChecker = (w, h) => pattern(w, h, (x, y) => (x + y) % 2 === 0);   // 棋盘格
function makeNoise(w, h, pWall) {
  const pw = pWall == null ? 0.42 : pWall;
  return pattern(w, h, () => rand() < pw);                                   // 噪声
}

/** 环的个数（独立回路数）：E - V + 1（通路格组成的连通图）。
 *  唯一解的迷宫 = 0；密铺/条纹底图一开始几十上百个。
 *  用途：路径数一多就枚举不动了（截断分不可信），这时用「环越少越好」当梯度，
 *  把盘面先压成树，再交给评分细调。 */
function cyclesOf(m) {
  const { w, h, wall } = m;
  let V = 0, E = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = y * w + x;
      if (wall[c]) continue;
      V++;
      if (x + 1 < w - 1 && !wall[c + 1]) E++;
      if (y + 1 < h - 1 && !wall[c + w]) E++;
    }
  }
  if (!V) return 0;
  return Math.max(0, E - V + 1);
}

/** 从起点出发的可达掩码 */
function reachMask(m) {
  const { w, h, wall } = m;
  const seen = new Uint8Array(w * h);
  if (wall[m.start]) return seen;
  const q = [m.start]; seen[m.start] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
      const n = ny * w + nx;
      if (wall[n] || seen[n]) continue;
      seen[n] = 1; q.push(n);
    }
  }
  return seen;
}

/** 兜底桥接：从一片孤岛出发，全格（墙也算可走）BFS 到最近的可达格，
 *  把路径上的墙全部打开。`connectStray` 要求"一步就能接上"，棋盘格那种
 *  一格宽的对角孤岛有时接不上，这时候用这个保证一定能推进。 */
function bridgeStray(m) {
  const { w, h, wall } = m;
  const seen = reachMask(m);
  let from = -1;
  for (let c = 0; c < w * h; c++) if (!wall[c] && !seen[c]) { from = c; break; }
  if (from < 0) return false;
  const prev = new Int32Array(w * h).fill(-1);
  prev[from] = from;
  const q = [from];
  let hit = -1;
  for (let i = 0; i < q.length && hit < 0; i++) {
    const c = q[i], x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
      const n = ny * w + nx;
      if (prev[n] !== -1) continue;
      prev[n] = c;
      if (seen[n]) { hit = n; break; }        // 撞到主路了
      q.push(n);
    }
  }
  if (hit < 0) return false;
  for (let c = hit; c !== from; c = prev[c]) wall[c] = 0;   // 沿途的墙全打开
  return true;
}

/** 终点必须是叶子（只有 1 个通路邻居）。
 *  否则「终点背后」还能挂一大片区域：DFS 一踩到终点就收工，那片区域
 *  既不计分、也不参与岔路，白白浪费棋盘（实测 31×31 斜纹有一版
 *  643 个开放格里 500 多个都在终点背后，评分只算了 100 多格）。
 *  叶子不是割点，去掉它剩下的一定还连通，所以这条约束不会误伤连通性。 */
function goalIsLeaf(m) { return openNb(m, m.goal) === 1; }

/** hard 模式的完整合法性：所有通路格可达 + 终点是叶子 */
function valid(m) { return allReachable(m) && goalIsLeaf(m); }

/** 离起点最远的叶子（给新底图挑终点用） */
function farthestLeaf(m) {
  const { w, h, wall } = m;
  const dist = new Int32Array(w * h).fill(-1);
  dist[m.start] = 0;
  const q = [m.start];
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
      const n = ny * w + nx;
      if (wall[n] || dist[n] >= 0) continue;
      dist[n] = dist[c] + 1; q.push(n);
    }
  }
  let best = -1, bd = -1;
  for (let c = 0; c < w * h; c++) {
    if (wall[c] || c === m.start || dist[c] < 0) continue;
    if (openNb(m, c) === 1 && dist[c] > bd) { bd = dist[c]; best = c; }
  }
  if (best < 0) {                       // 没有叶子（全环）→ 退化成最远格
    for (let c = 0; c < w * h; c++) {
      if (wall[c] || c === m.start || dist[c] < 0) continue;
      if (dist[c] > bd) { bd = dist[c]; best = c; }
    }
  }
  return best;
}

/** 反复把孤岛接回主路，直到所有通路格都从起点可达 */
function repair(m) {
  for (let g = 0; g < m.w * m.h && !allReachable(m); g++) {
    if (!connectStray(m) && !bridgeStray(m)) return false;
  }
  return allReachable(m);
}

/* ── 连通性 ── */
function connected(m) {
  const { w, h, wall } = m;
  if (wall[m.start] || wall[m.goal]) return false;
  const seen = new Uint8Array(w * h);
  const q = [m.start]; seen[m.start] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === m.goal) return true;
    const x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
      const n = ny * w + nx;
      if (wall[n] || seen[n]) continue;
      seen[n] = 1; q.push(n);
    }
  }
  return false;
}

/** 起点能走到的通路格 / 总通路格 */
function reachStats(m) {
  const { w, h, wall } = m;
  const seen = new Uint8Array(w * h);
  let open = 0;
  for (let c = 0; c < w * h; c++) if (!wall[c]) open++;
  if (wall[m.start]) return { open, reach: 0 };
  const q = [m.start]; seen[m.start] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (wall[n] || seen[n]) continue;
      seen[n] = 1; q.push(n);
    }
  }
  let reach = 0;
  for (let c = 0; c < w * h; c++) if (!wall[c] && seen[c]) reach++;
  return { open, reach };
}

/** 所有通路格都必须从起点走得到。
 *  只查「起点→终点」的话，补一格墙就能把整片区域封死 —— 那片区既不计分也不参与岔路，
 *  等于白扔半块棋盘（实测 31×31 有一次 468 个开放格里 215 个不可达）。
 *  而且按用户的说法：不可达区域随便朝主路连一格都能变成岔路，所以它不该存在。 */
function allReachable(m) {
  const { w, h, wall } = m;
  if (wall[m.start] || wall[m.goal]) return false;
  const seen = new Uint8Array(w * h);
  const q = [m.start]; seen[m.start] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (wall[n] || seen[n]) continue;
      seen[n] = 1; q.push(n);
    }
  }
  for (let c = 0; c < w * h; c++) if (!wall[c] && !seen[c]) return false;
  return true;
}

const openNb = (m, c) => {
  const { w, h, wall } = m;
  const x = c % w, y = (c / w) | 0;
  let n = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (!wall[ny * w + nx]) n++;
  }
  return n;
};
/** 第 i 次迭代允许改动的格子数：从 K0 线性降到 1（「每次迭代减小块的更改个数」） */
function budgetAt(K0, iters, i) { return Math.max(1, Math.round(K0 * (1 - i / Math.max(1, iters)))); }

/* ── 单格变异：每个都以「不破坏连通、不动起点终点」为前提 ── */
function flips(m, wantOpen) {
  const { w, h, wall } = m;
  const cand = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const c = y * w + x;
    if (c === m.start || c === m.goal) continue;
    if (wantOpen ? !wall[c] : !!wall[c]) continue;
    const on = openNb(m, c);
    if (wantOpen ? on === 1 : on >= 1) cand.push(c);   // 只在贴着通路的地方开洞 / 只在贴着通路的地方补墙
  }
  return cand;
}

function tryFlip(m, wantOpen) {
  const cand = flips(m, wantOpen);
  if (!cand.length) return false;
  for (let t = 0; t < 12 && cand.length; t++) {
    const c = cand[ri(cand.length)];
    const old = m.wall[c];
    m.wall[c] = wantOpen ? 0 : 1;
    if (REACH === 'soft' ? connected(m) : valid(m)) return true;
    m.wall[c] = old;
  }
  return false;
}

/** 「修一块被封印的区域」的定向变异：找一格不可达的通路格，
 *  把它旁边的墙打开，让这片区域接回主路（随机开洞很难撞上，所以要专门给一个算子）。 */
function connectStray(m) {
  const { w, h, wall } = m;
  const seen = new Uint8Array(w * h);
  const q = [m.start]; seen[m.start] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (wall[n] || seen[n]) continue;
      seen[n] = 1; q.push(n);
    }
  }
  const stray = [];
  for (let c = 0; c < w * h; c++) if (!wall[c] && !seen[c]) stray.push(c);
  if (!stray.length) return false;
  for (let t = 0; t < 60 && stray.length; t++) {
    const c = stray[ri(stray.length)], x = c % w, y = (c / w) | 0;
    const cand = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
      const n = ny * w + nx;
      if (!wall[n]) continue;
      // 这格墙旁边要有可达的通路格，打开才算"接回主路"
      let touches = false;
      for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const mx = nx + ex, my = ny + ey;
        if (mx < 0 || my < 0 || mx >= w || my >= h) continue;
        const mm = my * w + mx;
        if (!wall[mm] && seen[mm]) { touches = true; break; }
      }
      if (touches) cand.push(n);
    }
    if (!cand.length) continue;
    const n = cand[ri(cand.length)];
    wall[n] = 0;
    return true;
  }
  return false;
}

/* ── 结构算子（hard 模式下天然安全） ────────────────────────────────
 * 关键性质：**开洞只会把新格子接进已有通路，永远不会把已有通路切死**；
 *           只有「补墙」才可能切出一片不可达区域。
 * 所以「挖一条支路」不需要连通性检查，命中率 100%；而后期单格随机翻墙一大半都被
 * `allReachable` 否掉（beam 里大量候选其实是同一个父节点的重采样）。
 * 支路挖到尽头就是死路 —— 正是评分最奖励的形状；挖到半路撞上已有通路就成环
 * （少量概率），也就是「进到里面的环再从另一边出去」那种设计。 */
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SPUR_P = +(arg('spur', 0.55));       // 每轮用「挖支路」算子的概率
const SEAL_P = +(arg('seal', 0.12));       // 用「封掉一条死路口」算子的概率
const LOOP_P = +(arg('loop', 0.12));       // 挖支路时允许成环的概率
const SPUR_MAX = +(arg('spurmax', 14));    // 一条支路最多挖几格
const PATIENCE = +(arg('patience', 40));   // 连续多少轮没进步就踢一脚

function openList(m) {
  const r = [];
  for (let c = 0; c < m.wall.length; c++) if (!m.wall[c]) r.push(c);
  return r;
}
/** 死路口（只有 1 个通路邻居）：从这里继续挖 = 把死路挖长 */
function tipsOf(m) {
  const r = [];
  for (let c = 0; c < m.wall.length; c++) {
    if (m.wall[c] || c === m.start || c === m.goal) continue;
    if (openNb(m, c) <= 1) r.push(c);
  }
  return r;
}
/** 走廊格（正好 2 个通路邻居）：从这里开新支路 = 造一个新的岔口 */
function corridorsOf(m) {
  const r = [];
  for (let c = 0; c < m.wall.length; c++) {
    if (m.wall[c] || c === m.start || c === m.goal) continue;
    if (openNb(m, c) === 2) r.push(c);
  }
  return r;
}

/** 从通路上的某格往外挖 len 格。返回真正挖开的格数（0 = 没地方挖）。 */
function carveSpur(m, len, allowLoop) {
  const { w, h, wall } = m;
  const tips = tipsOf(m), corr = corridorsOf(m), all = openList(m);
  let from;
  const r = rand();
  if (tips.length && r < 0.4) from = pick(tips);
  else if (corr.length && r < 0.8) from = pick(corr);
  else from = pick(all);
  let x = from % w, y = (from / w) | 0;
  let d = pick(DIRS), carved = 0;
  for (let s = 0; s < len; s++) {
    const opts = DIRS.filter(([dx, dy]) => {
      const ax = x + dx, ay = y + dy;
      if (ax < 1 || ay < 1 || ax >= w - 1 || ay >= h - 1) return false;
      const c = ay * w + ax;
      return wall[c] || (allowLoop && !wall[c]);
    });
    if (!opts.length) break;
    // 直走优先（不一步一拐），偶尔换方向
    d = opts.find(([dx, dy]) => dx === d[0] && dy === d[1]) || (rand() < 0.3 ? pick(opts) : opts[0]);
    const nx = x + d[0], ny = y + d[1], n = ny * w + nx;
    if (!wall[n]) { if (allowLoop) break; continue; }
    wall[n] = 0; carved++;
    x = nx; y = ny;
  }
  return carved;
}

/** 封掉一条死路的口子（单格、且是端点 → 一定不会切死别的区域） */
function sealTip(m) {
  for (let t = 0; t < 8; t++) {
    const tips = tipsOf(m);
    if (!tips.length) return false;
    const c = pick(tips);
    m.wall[c] = 1;
    if (valid(m)) return true;
    m.wall[c] = 0;
  }
  return false;
}

/** 一次迭代的提案：结构算子 + k 个单格改动（k 递减） */
function propose(base, k) {
  const m = clone(base);
  let changed = 0;
  const r = rand();
  if (r < SPUR_P) {
    changed += carveSpur(m, Math.max(1, Math.min(SPUR_MAX, Math.round(k * 1.5 + rand() * 3))), rand() < LOOP_P);
  } else if (r < SPUR_P + SEAL_P) {
    if (sealTip(m)) changed++;
  }
  if (REACH === 'soft' && rand() < REPAIR && connectStray(m)) changed++;
  for (let i = 0; i < k; i++) {
    const wantOpen = rand() < 0.62;      // 偏向"开洞加死路"：难度公式奖励死路
    if (tryFlip(m, wantOpen)) changed++;
  }
  if (!changed) return null;
  /* 挖支路可能正好从终点边上开口（终点就变岔口了），这里统一兜一次 */
  if (REACH === 'soft' ? !connected(m) : !valid(m)) return null;
  return m;
}

/* ── 从关卡文件起步 ── */
function fromFile(f) {
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  const m = MD.fromLevel(rec.level);
  return { m, rec };
}

/* ── 关卡输出（与 levels/迷宫 同构） ── */
function wallsToPieces(m) {
  const { w, h, wall } = m;
  const seen = new Uint8Array(w * h);
  const pieces = [];
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!wall[s] || seen[s]) continue;
    // 4 连通合并成一块
    const cells = [];
    const q = [s]; seen[s] = 1;
    while (q.length) {
      const c = q.pop();
      const x = c % w, y = (c / w) | 0;
      cells.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nc = ny * w + nx;
        if (!wall[nc] || seen[nc]) continue;
        seen[nc] = 1; q.push(nc);
      }
    }
    const minX = Math.min(...cells.map(c => c[0]));
    const minY = Math.min(...cells.map(c => c[1]));
    pieces.push({
      id: 'w' + (++n), x: minX, y: minY, ori: 0, shape: 'custom',
      cells: cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      rot: false, lock: true, color: '#3b4252', name: '回墙'
    });
  }
  return pieces;
}

function main() {
  let base, srcName = 'ring';
  if (FROM) { const r = fromFile(FROM); base = r.m; srcName = path.basename(FROM, '.json'); }
  else if (BASE === 'perfect') {
    base = makePerfect(W, H);
    for (let i = 0; i < LOOPS; i++) tryFlip(base, true);
    if (!connected(base)) throw new Error('底图不连通');
  } else if (BASE === 'ring') {
    base = makeRing(W, H);
    if (!connected(base)) throw new Error('回型底图不连通');
  } else {
    const gen = { vstripe: makeVStripe, dstripe: makeDStripe, checker: makeChecker, noise: makeNoise }[BASE];
    if (!gen) throw new Error('未知底图：' + BASE + '（ring/perfect/vstripe/dstripe/checker/noise）');
    base = gen(W, H);
    const before = base.wall.length - base.wall.reduce((a, b) => a + b, 0);
    if (!repair(base)) throw new Error(BASE + ' 底图修不好（repair 失败）');
    const far = farthestLeaf(base);
    if (far >= 0) base.goal = far;
    if (!valid(base)) throw new Error(BASE + ' 底图不满足「全可达 + 终点是叶子」');
    const after = base.wall.length - base.wall.reduce((a, b) => a + b, 0);
    if (!QUIET) console.log('  底图 ' + BASE + ' → repair 打通 ' + (after - before) + ' 格，开放 ' + after +
      ' 格，终点取最远叶子');
  }

  const K0 = Math.max(2, Math.round((base.w * base.h) / 40));   // 初始一次改多少格
  /* soft 模式：分数 × (可达/开放)²。不可达的格子不计分，但也没被硬性禁掉，
   * 反而"连一格就能白捡一片岔路" —— 看它能不能靠奖励自己收敛到 0。 */
  let haveExact = false;        // 手上已经有「可穷举」的好解了吗（见下面 fit 的处理）
  const evalOf = m => {
    const r = MD.evaluate(m, EVAL);
    const { open, reach } = reachStats(m);
    const ratio = open ? reach / open : 0;
    let fit = REACH === 'soft' ? r.score * Math.pow(ratio, REACHPOW) : r.score;
    /* 截断分不可信：DFS 在节点上限停下 → 只数到几条路 → 分数被抬得比真值高一个量级。
     * 一旦手上已经有可穷举的好解，就直接把这些赝品的 fit 打成 -1（不再让它们领跑）；
     * 还没有的时候（大棋盘底图本身就 >20 万条路）先放行，否则搜索根本迈不出第一步。 */
    if (!r.exact) {
      /* 枚举被截断 = 路径多到数不完（真值反而很低）。这种盘面不能拿分数排序，
       * 改用「还剩几个环」当梯度：环越少越靠前，0 环就会变成可穷举的唯一解。 */
      const cyc = cyclesOf(m);
      fit = -(cyc + 1) * 1 - (r.score > 0 ? 1e-3 : 0);
      if (haveExact) fit = -1;
    }
    return { score: r.score, paths: r.paths, exact: r.exact, ratio, fit, cycles: r.exact ? 0 : cyclesOf(m) };
  };
  let cur = clone(base), curR = evalOf(cur), curScore = curR.score, bestRatio = curR.ratio;
  let best = clone(cur), bestScore = curScore;
  /* 另记一个「可穷举」的最好解：它是唯一能当成品交出去的（分是真值） */
  let bestExact = curR.exact ? clone(cur) : null;
  let bestExactScore = curR.exact ? curR.fit : -1;
  haveExact = !!bestExact;
  const t0 = Date.now();
  const log = [];

  /* 束搜索：每轮每个「晋级名额」都生 CAND 个候选，一起评估后保留最好的 BEAM 个。
   * BEAM=1,CAND=1 就是原来的单点爬山。 */
  let beam = [{ m: cur, s: curScore }];
  let evaluated = 0, lastImp = 0, kicks = 0;
  for (let i = 0; i < ITERS; i++) {
    if (MAXEV && evaluated >= MAXEV) { if (!QUIET) console.log('  演算次数到上限 ' + MAXEV + '，提前收工'); break; }
    const k = budgetAt(K0, ITERS, i);                            // ← 每次迭代改动更少
    const kids = [];
    for (const node of beam) {
      for (let c = 0; c < CAND; c++) {
        const cand = propose(node.m, k);
        if (!cand) continue;
        const r = evalOf(cand);
        evaluated++;
        kids.push({ m: cand, s: r.fit, score: r.score, ratio: r.ratio, paths: r.paths, exact: r.exact });
        if (r.exact && r.fit > bestExactScore) { bestExact = clone(cand); bestExactScore = r.fit; haveExact = true; }
      }
    }
    if (!kids.length) { log.push({ i, k, skip: true }); continue; }
    kids.sort((a, b) => b.s - a.s);
    const all = kids.concat(beam).sort((a, b) => b.s - a.s);
    const pool = all.slice(0, BEAM);
    /* 精英：beam 里至少留一个「可穷举」的状态。
     * 截断分是虚高的赝品（DFS 在 2e6 节点停下 → 只数到几条路 → 分数被抬上去），
     * 不设这一条时，400 轮之后 beam 会被这些赝品占满，最后只能交出一个 59.9 分的盘面
     * （它自己其实是 2 条路、59.9 分，而 beam 里那堆 9000+ 全是假的）。 */
    if (!pool.some(x => x.exact)) {
      const ex = all.find(x => x.exact);
      if (ex) pool[pool.length - 1] = ex;
    }
    beam = pool.sort((a, b) => b.s - a.s).map(x => ({ m: x.m, s: x.s, exact: x.exact }));
    if (beam[0].s > bestScore) { best = clone(beam[0].m); bestScore = beam[0].s; bestRatio = beam[0].ratio != null ? beam[0].ratio : 1; lastImp = i; }
    /* 停滞太久 → 从当前最好局面「踢一脚」：挖一条长支路 + 几格翻动。
     * 单格翻墙在后期命中率很低，全靠这个算子跳出现有的结构。 */
    if (PATIENCE && i - lastImp >= PATIENCE) {
      lastImp = i; kicks++;
      const kick = clone(best);
      let n = carveSpur(kick, Math.max(4, K0), rand() < 0.5);
      for (let t = 0; t < Math.max(2, k); t++) if (tryFlip(kick, rand() < 0.7)) n++;
      if (n) {
        const r2 = evalOf(kick); evaluated++;
        beam[beam.length - 1] = { m: kick, s: r2.fit, ratio: r2.ratio };
        if (r2.fit > bestScore) { best = clone(kick); bestScore = r2.fit; }
      }
    }
    log.push({ i, k, score: kids[0].s, best: bestScore, beam: beam.map(x => +x.s.toFixed(2)) });
    /* 每 50 轮把「当前最好的可穷举解」真算一遍：这才是能交出去的成绩，
     * 日志里那个 best 是 fit（可能包含截断赝品），不能拿来讲进步曲线。 */
    if (!QUIET && bestExact && (i % 50 === 0 || i === ITERS - 1)) {
      const be = MD.evaluate(bestExact, { stats: true });
      console.log('    [可交付] it' + String(i).padStart(4), '分', be.score.toFixed(1),
        '| 步', MD.shortest(bestExact), '| 死路', be.stats.deadEnds,
        '| 岔路层', be.stats.maxLevel, JSON.stringify(be.stats.levelCount));
    }
    if (!QUIET && (i % 20 === 0 || i === ITERS - 1)) {
      console.log('  it' + String(i).padStart(4), 'k=' + k, '本轮最好', kids[0].s.toFixed(2),
        '| 晋级', beam.map(x => x.s.toFixed(1)).join(','), '| best', bestScore.toFixed(2),
        '| 可达', (100 * (kids[0].ratio == null ? 1 : kids[0].ratio)).toFixed(1) + '%',
        '| paths', kids[0].paths, kids[0].exact ? '' : '(cap)',
        process.env.MEM ? ('| rss ' + (process.memoryUsage().rss / 1048576).toFixed(0) + 'MB') : '');
    }
  }

  /* 输出优先用可穷举的那个；一个都没有（比如大棋盘底图本身就 >20 万条路）才退回 best */
  if (bestExact) { best = bestExact; bestScore = bestExactScore; }
  const ev = MD.evaluate(best, { stats: true });   // 收尾用默认上限复核一次
  const dist = MD.shortest(best);
  const openCells = best.wall.length - best.wall.reduce((a, b) => a + b, 0);
  const reach = (function () {
    const { w, h, wall } = best; const seen = new Uint8Array(w * h);
    const q = [best.start]; seen[best.start] = 1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % w, y = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (wall[n] || seen[n]) continue;
        seen[n] = 1; q.push(n);
      }
    }
    let r = 0; for (let c = 0; c < w * h; c++) if (!wall[c] && seen[c]) r++;
    return r;
  })();
  const pieces = wallsToPieces(best);
  const heroIdx = 0;
  const level = {
    name: '迷宫 ' + best.w + '×' + best.h + (TAG[BASE] || (BASE === 'ring' ? '' : ' ' + BASE)) + ' #' + SEED,
    w: best.w, h: best.h,
    goals: [{ piece: 'hero', cells: [[best.goal % best.w, (best.goal / best.w) | 0]], label: '终点' }],
    pieces: [
      { id: 'hero', x: best.start % best.w, y: (best.start / best.w) | 0, ori: 0, shape: '1x1', color: '#ffb03a', name: '行者', hero: true },
      ...pieces,
    ],
    note: best.w + '×' + best.h + ' 迷宫（' + MD.VERSION + ' 迭代生成 · seed ' + SEED + '）；最短 ' + dist +
      ' 步，简单路径 ' + ev.paths + ' 条，迷宫口径难度 ' + ev.score.toFixed(1) + '。' +
      '评分按「手」计：全程一次连续拖动 = 1 手，难度分偏低是评分口径，不代表关卡简单。'
  };

  /* 解法：BFS 一条最短路径，逐格拆成单步（页面直接能播） */
  const moves = [];
  {
    const { w, wall } = best;
    const prev = new Int32Array(w * best.h).fill(-2);
    prev[best.start] = -1;
    const q = [best.start];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (c === best.goal) break;
      const x = c % w, y = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= best.h) continue;
        const n = ny * w + nx;
        if (wall[n] || prev[n] !== -2) continue;
        prev[n] = c; q.push(n);
      }
    }
    const pathCells = [];
    for (let c = best.goal; c !== -1; c = prev[c]) pathCells.push(c);
    pathCells.reverse();
    for (let i = 1; i < pathCells.length; i++) {
      const a = pathCells[i - 1], b = pathCells[i];
      moves.push({ i: heroIdx, t: 'm', dx: (b % w) - (a % w), dy: ((b / w) | 0) - ((a / w) | 0) });
    }
  }

  const rec = {
    set: 'lab', id: 'maze2-' + best.w + 'x' + best.h + '-s' + SEED, name: level.name,
    origin: '回型迷宫 · ' + MD.VERSION + ' 迭代', lvKey: 'maze2-' + best.w + 'x' + best.h + '-s' + SEED,
    note: level.note, tip: best.w + '×' + best.h + ' · 难度 ' + ev.score.toFixed(2),
    source: 'generated',
    level,
    meta: { score: null, grade: null, hands: 1, scoringVersion: 3, depth: dist, estimated: true },
    maze: {
      score: ev.score, version: MD.VERSION, paths: ev.paths, exact: ev.exact,
      depth: dist, openCells, reachable: reach, unreachable: openCells - reach,
      seed: SEED, iterations: ITERS, K0, beam: BEAM, cand: CAND, evaluated, reach: REACH,
      spurp: SPUR_P, loopP: LOOP_P, spurMax: SPUR_MAX, kicks,
      deadEnds: ev.stats ? ev.stats.deadEnds : null,
      maxBranchLevel: ev.stats ? ev.stats.maxLevel : null,
      branchLevels: ev.stats ? ev.stats.levelCount : null,
      maxPaths: MAXP,
      base: FROM ? path.basename(FROM) : BASE, from: FROM ? path.basename(FROM) : null,
      elapsedMs: Date.now() - t0,
    },
    solution: { steps: moves.length, hands: 1, moves },
  };

  fs.mkdirSync(OUT, { recursive: true });
  /* 命名跟 levels/ 其它关一致：NN_名字.json（NN 是批次序号，重跑同 seed 会直接覆盖） */
  const outFile = path.join(OUT, NN + '_迷宫 ' + best.w + '×' + best.h +
    (TAG[BASE] || (BASE === 'ring' ? '' : ' ' + BASE)) + ' #' + SEED + '.json');
  fs.writeFileSync(outFile, JSON.stringify(rec));
  if (!QUIET) {
    console.log('\n完成：' + outFile);
    console.log('  难度 ' + ev.score.toFixed(2) + '（' + MD.VERSION + '，' + ev.paths + ' 条简单路径' +
      (ev.exact ? '，穷举' : '，截断') + '）· 最短 ' + dist + ' 步 · 开放格 ' + openCells +
      '（可达 ' + reach + (openCells - reach ? '，不可达 ' + (openCells - reach) : '') + '）' +
      ' · 评估 ' + evaluated + ' 次 · ' + (Date.now() - t0) + 'ms');
    if (ev.stats) console.log('  死路 ' + ev.stats.deadEnds + ' 条，最深岔路层级 ' + ev.stats.maxLevel +
      '，各层 ' + JSON.stringify(ev.stats.levelCount));
    console.log('  改动预算 K0=' + K0 + ' → 1（' + ITERS + ' 次迭代）');
  }
  return rec;
}

if (require.main === module) main();
module.exports = { makePerfect, makeRing, makeVStripe, makeDStripe, makeChecker, makeNoise, repair,
  wallsToPieces, main, budgetAt, connected, allReachable,
  clone, tryFlip, carveSpur, sealTip, tipsOf, corridorsOf, valid, goalIsLeaf, farthestLeaf, cyclesOf, SPUR_MAX };
