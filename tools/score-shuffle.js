/* 随机型关卡（level.shuffle）的难度分：**多轮随机关卡的"去头尾"平均**
 *
 *   node tools/score-shuffle.js --file levels/随机型关卡/01_织布机.json
 *   node tools/score-shuffle.js --file levels/随机型关卡/02_4阶数字华容道.json --rounds 10 --write
 *   node tools/score-shuffle.js --all --write            # 全库带 shuffle 的关都算一遍
 *   node tools/score-shuffle.js --file <关> --rounds 8 --jobs 4 --cap 60000   # 多核并行、加大预算
 *       --jobs  同时跑几轮（默认 4，每轮一个子进程，内存互不干扰）
 *       --cap   每个权重的展开上限（默认 3 万；大棋盘上 6 万常常是"能不能解出来"的分水岭，
 *               内存也翻倍，配 --jobs 3 更稳）
 *       --weights  一轮里依次试的权重（默认 5,8,11,14）
 *
 * 为什么不能沿用一次性打分：这类关每次开局都是新题，最短解长度本身就是个分布。
 * 所以按 level.shuffleSteps 抽 N 轮随机关卡，每轮单独打分，再**去掉最高与最低**取平均
 * （N<4 时不去头尾），结果标 estimated —— 它是这个关卡的"平均难度"，不是某一局的证明值。
 *
 * 两条评分通道：
 *   ① 4 阶数字华容道这类 4×4 滑块 → 专用 PDB + IDA* 拿**真正的最优解**，再按同一套 v3 结构评分；
 *   ② 其它（如织布机）→ 加权 A* 找一条参考解，用 estimatePath 量结构（标"未证明最短"）。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v && v[0] !== '-' ? v : true;
}
const has = n => process.argv.indexOf('--' + n) >= 0;
const ROOT = path.join(__dirname, '..');
const LVROOT = path.join(ROOT, 'levels');

const ROUNDS = Math.max(2, +(arg('rounds', 8)) || 8);
const TL = Math.max(2000, +(arg('tl', 12000)) || 12000);        // 每轮求解预算
// 大棋盘（织布机 36 块、每局面走法 ~48）只求一条参考解，不追求最优：
// 节点上限压在 3 万（约 400MB），一轮里换几个权重各试一次（见 roundGeneric）。
const CAP = Math.max(5000, +(arg('cap', 30000)) || 30000);
const WEIGHTS = String(arg('weights', '5,8,11,14')).split(',').map(Number).filter(x => x > 0);
const WRITE = has('write');
const SEED = +(arg('seed', 7)) || 7;
// 默认 4 路并行：每轮一个子进程，大棋盘单轮几十秒，串行跑 8 轮要五分钟
const JOBS = Math.max(1, Math.min(+(arg('jobs', 4)) || 4, ROUNDS, require('os').cpus().length - 1 || 1));

/* 固定种子随机数：同一份 --seed 抽出来的题目可复现，分数才能被复核 */
function rngOf(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; }

/* ── 4×4 数字华容道：PDB + IDA* 拿最优解，沿解量结构 ── */
let P = null, PDB = null, pdbs = null;
const GROUPS = [[1, 2, 3, 4], [5, 9, 13], [6, 7, 8, 10, 14], [11, 12, 15]];
function ensureP15() {
  if (pdbs) return;
  P = require('../puzzle15.js');
  PDB = require('../pdb15.js');
  const t0 = Date.now();
  pdbs = GROUPS.map(g => PDB.build(g));
  console.log('  模式库 4 组构建完成 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
function slidesOf(s) {
  const z = s.indexOf(0), zx = z & 3, zy = z >> 2, out = [];
  for (const [sx, sy, step] of [[-1, 0, -1], [1, 0, 1], [0, -1, -4], [0, 1, 4]])
    for (let n = 1; n <= 3; n++) {
      const nx = zx + sx * n, ny = zy + sy * n;
      if (nx < 0 || nx > 3 || ny < 0 || ny > 3) break;
      out.push({ from: z, to: ny * 4 + nx, step });
    }
  return out;
}
function applySlide(s, from, to, step) {
  const b = s.slice();
  for (let p = from; p !== to; p += step) b[p] = b[p + step];
  b[to] = 0;
  return b;
}
/** 一轮 4×4：返回 {score, depth, exact, ...} */
function roundP15(L, start, goals) {
  ensureP15();
  const info = P.detect(L, start, goals);
  if (!info) return null;
  const goalB = info.goal;
  const t0 = Date.now();
  const sol = P.solve15(info.start, goalB, { weight: 1, pdbs, timeLimitMs: TL });
  let steps, moves, exact = !!sol.ok, bound = null;
  if (sol.ok) { steps = sol.moves.length; moves = sol.moves; }
  else {
    // 没证出最优：退到加权 A* 的一条真解（是上界，比 PDB 下界更接近真实长度）
    const q = P.solve15astar(info.start, goalB, { weight: 3, timeLimitMs: Math.min(15000, TL), maxNodes: 800000 });
    if (!q.ok || !q.moves.length) return null;
    moves = q.moves;
    steps = moves.length;
    bound = P.rootHeuristic(info.start, goalB, pdbs);
  }
  // 沿解统计：折返（h 没降）、空格回头、看起来更近的岔路
  let cur = info.start.slice(), hPrev = P.rootHeuristic(cur, goalB, pdbs);
  const emptySeen = new Map([[cur.indexOf(0), 1]]);
  let retreats = 0, revisit = 0, temptation = 0, n = 0;
  for (const m of moves) {
    const nx = applySlide(cur, m.from, m.to, m.step);
    const h = P.rootHeuristic(nx, goalB, pdbs);
    if (h >= hPrev) retreats++;
    const e = nx.indexOf(0);
    if (emptySeen.has(e)) revisit++;
    emptySeen.set(e, (emptySeen.get(e) || 0) + 1);
    let good = 0, off = 0;
    for (const sl of slidesOf(cur)) {
      if (sl.to === m.to) continue;
      if (P.rootHeuristic(applySlide(cur, sl.from, sl.to, sl.step), goalB, pdbs) < hPrev) good++; else off++;
    }
    if (off > 0) temptation += Math.log2(1 + off / Math.max(1, good));
    cur = nx; hPrev = h; n++;
  }
  const res = {
    depth: steps, hands: steps, states: 1, paths: 1, truncated: false, stopped: false,
    cognition: { active: 15, switches: n, revisits: revisit, retreats, maxSetup: 0, maxPlateau: 0, temptation, measured: true },
    interference: { same: 0, branches: 0, waste: 0, dead: 0, worst: 0, measured: true }
  };
  const d = K.difficulty(res);
  return { score: d.score, depth: steps, exact, bound, hands: steps, retreats, revisit, temptation, parts: d.parts, ms: Date.now() - t0 };
}

/** 单轮隔离执行：子进程算完把结果打在最后一行，父进程聚合。
 *  用异步 execFile 是为了能让多轮同时在跑（--jobs），每轮还是一个独立进程：
 *  大棋盘一轮峰值几百 MB，堆在同一个进程里跑到第六轮会被系统掐掉。 */
function runRoundIsolated(file, r) {
  const { execFile } = require('child_process');
  const args = [__filename, '--one', '--file', file, '--round', String(r),
    '--seed', String(SEED), '--cap', String(CAP), '--weights', WEIGHTS.join(','), '--tl', String(TL)];
  return new Promise(resolve => {
    execFile(process.execPath, args, { encoding: 'utf8', timeout: 900000, maxBuffer: 1 << 22 }, (err, stdout) => {
      const out = String(stdout || (err && err.stdout) || '');
      const m = /##ROUND##(.*)/.exec(out);
      if (!m) return resolve(null);
      resolve(m[1].trim() === 'null' ? null : JSON.parse(m[1]));
    });
  });
}

/** 一轮通用棋：加权 A* 拿参考解 → estimatePath 量结构。
 *  同一个局面，"权重"决定了会不会掉进"所有块都差一点"的平台：
 *  织布机上 w=10 可能 12 万节点都出不来，w=5 二十几万以内就通了。
 *  所以一轮里换几个权重各试一次，谁先解出来用谁。 */
function roundGeneric(L, start, goals) {
  const t0 = Date.now();
  let q = null, usedW = null;
  for (const w of WEIGHTS) {
    const r = K.quickSolve(L, start, goals, { maxNodes: CAP, weight: w });
    if (r && r.ok && r.moves && r.moves.length) { q = r; usedW = w; break; }
  }
  if (!q) return null;
  const est = K.estimatePath(L, start, goals, q.moves);
  if (!est) return null;
  const d = K.difficulty({ depth: -1, estimate: est, truncated: true, stopped: false, states: q.visited || 0 });
  if (!d) return null;
  return {
    score: d.score, depth: est.steps, exact: false, hands: est.hands, w: usedW,
    retreats: est.cognition.retreats, revisit: est.cognition.revisits,
    temptation: +(+est.cognition.temptation).toFixed(2), parts: d.parts, ms: Date.now() - t0
  };
}

function trimmedMean(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  if (a.length < 4) return { avg: a.reduce((x, y) => x + y, 0) / a.length, trimmed: false, min: a[0], max: a[a.length - 1] };
  const mid = a.slice(1, -1);
  return { avg: mid.reduce((x, y) => x + y, 0) / mid.length, trimmed: true, min: a[0], max: a[a.length - 1] };
}
const gradeOf = s => s >= 66 ? '极难' : s >= 54 ? '困难' : s >= 38 ? '中等' : s >= 22 ? '简单' : '太简单';

/* ── 子进程模式：只算一轮，把结果打在最后一行（父进程解析） ── */
if (has('one')) {
  const f = path.resolve(String(arg('file')));
  const r = +arg('round', 0) || 0;
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  const lv = rec.level || rec;
  const raw = SH.resolve(JSON.parse(JSON.stringify(lv)));
  const L = K.parse(raw), base = K.initialState(raw);
  const steps = Math.max(1, lv.shuffleSteps | 0 || 200);
  const start = K.scramble(L, base, steps, { rng: rngOf(SEED * 1000 + r * 37 + 11) });
  let got = null;
  try {
    const is15 = !!require('../puzzle15.js').detect(L, base, raw.goals);
    got = is15 ? roundP15(L, start, raw.goals) : roundGeneric(L, start, raw.goals);
  } catch (e) {
    got = null;
    console.error('  轮内异常：' + (e && e.message));
  }
  console.log('##ROUND##' + (got ? JSON.stringify(got) : 'null'));
  process.exit(0);
}

async function scoreFile(file) {
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lv = rec.level || rec;
  if (!lv.shuffle) { console.log('！' + path.basename(file) + ' 没有 shuffle 属性，跳过'); return null; }
  const raw = SH.resolve(JSON.parse(JSON.stringify(lv)));
  const L = K.parse(raw);
  const base = K.initialState(raw);
  const steps = Math.max(1, lv.shuffleSteps | 0 || 200);
  const is15 = (() => { try { return !!require('../puzzle15.js').detect(L, base, raw.goals); } catch (e) { return false; } })();

  console.log('\n=== ' + rec.name + '（' + L.w + '×' + L.h + '，打乱 ' + steps + ' 步 × ' + ROUNDS + ' 轮，' +
    (is15 ? 'PDB 最优解' : '加权 A* 参考解') + '，' + JOBS + ' 路并行）===');
  // 每一轮一个独立子进程（内存隔离），多轮同时跑（多核）：大棋盘单轮几十秒，串行太耽误事。
  const results = new Array(ROUNDS).fill(null);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const r = next++;
      if (r >= ROUNDS) return;
      results[r] = await runRoundIsolated(file, r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(JOBS, ROUNDS) }, worker));
  const rounds = [];
  results.forEach((got, r) => {
    if (!got) { console.log('  第 ' + (r + 1) + ' 轮：没解出来（预算不够），跳过'); return; }
    rounds.push(got);
    console.log('  第 ' + (r + 1) + ' 轮：' + (got.exact ? '最优 ' : '参考 ') + got.depth + ' 步 · ' +
      got.score + ' 分 ' + gradeOf(got.score) + '（' + got.ms + 'ms' + (got.w ? '，w=' + got.w : '') + '）');
  });
  if (rounds.length < 2) { console.error('！能用的轮数不足（' + rounds.length + '），不写分'); return null; }

  const scores = rounds.map(x => x.score);
  const tm = trimmedMean(scores);
  const score = Math.round(tm.avg);
  const grade = gradeOf(score);
  const avgOf = f => +(rounds.reduce((a, x) => a + f(x), 0) / rounds.length).toFixed(1);
  const meta = {
    score, grade,
    scoringVersion: 3, version: 3,
    depth: null, hands: Math.round(avgOf(x => x.depth)),
    states: null, paths: 0, waste: 0, same: 0,
    estimated: true, unsolved: false,
    confidence: '随机型关卡：' + steps + ' 步打乱 × ' + rounds.length + ' 轮抽样，去头尾平均' +
      (rounds.every(x => x.exact) ? '（每轮都是已证明的最优解）' : '（部分轮次用参考解，未证明最短）'),
    shuffle: { steps, rounds: rounds.length, seed: SEED, trimmed: tm.trimmed },
    sample: {
      rounds: rounds.length, steps,
      scores, avg: +tm.avg.toFixed(1), min: tm.min, max: tm.max, trimmed: tm.trimmed,
      exact: rounds.filter(x => x.exact).length,
      perRound: rounds.map(x => ({ score: x.score, depth: x.depth, exact: !!x.exact }))
    },
    cognition: { retreats: avgOf(x => x.retreats), revisits: avgOf(x => x.revisit), temptation: avgOf(x => x.temptation) },
    parts: {
      depth: avgOf(x => x.parts.depth), planning: avgOf(x => x.parts.planning),
      endurance: avgOf(x => x.parts.endurance || 0), choice: avgOf(x => x.parts.choice),
      trap: avgOf(x => x.parts.trap || 0), unique: 0, space: 0
    }
  };
  console.log('  → 去头尾平均 ' + tm.avg.toFixed(1) + ' → ' + score + ' 分 · ' + grade +
    '（' + tm.min + '~' + tm.max + (tm.trimmed ? '，已去掉最高最低' : '，轮数太少未去头尾') + '）');

  if (WRITE) {
    rec.meta = meta;
    rec.solution = null;                        // 每局都不一样，不存单一解法
    fs.writeFileSync(file + '.tmp', JSON.stringify(rec, null, 1) + '\n');
    fs.renameSync(file + '.tmp', file);
    console.log('  已写入 ' + path.relative(ROOT, file));
  }
  return meta;
}

let files = [];
if (has('all')) {
  for (const name of fs.readdirSync(LVROOT)) {
    if (name[0] === '_') continue;
    const abs = path.join(LVROOT, name);
    const dir = fs.statSync(abs).isDirectory() ? abs : LVROOT;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f[0] === '_') continue;
      if (!fs.statSync(path.join(dir, f)).isFile()) continue;
      let rec = null;
      try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
      if (rec && rec.level && rec.level.shuffle) files.push(path.join(dir, f));
    }
  }
} else {
  const f = arg('file', null);
  if (!f) { console.log('用法：node tools/score-shuffle.js --file <关卡.json> [--rounds 8] [--write]   或 --all'); process.exit(1); }
  files = [path.resolve(f)];
}

(async () => {
  let written = 0;
  for (const f of files) if (await scoreFile(f)) written++;
  console.log('\n完成：' + written + '/' + files.length + ' 关' + (WRITE ? '已写回' : '（没有 --write，未写文件）'));
  if (WRITE) console.log('记得跑 node tools/build-levelpacks.js');
})();
