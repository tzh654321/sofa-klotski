/* 迷宫难度 · maze-2
 *
 * 口径（用户给的公式，2026-11-21）：
 *   迷宫难度 = 1 / Σ_paths ( 1 / D_path )
 *   通关路径 = 起点到终点的简单路径（每格最多踩一次）
 *   D_path  = (该路径上所有岔路的难度分之和) × (被岔路分开的每一小段长度的 √ 之和 + 转弯次数)
 *   岔路分  = 二层岔路分之和；若这条岔路里再没有岔路 → √(死路总长度) + 转弯次数
 *
 * 三处规格没写死、这里明确定下来的边界情况（写进 README，改口径要一起改测试）：
 *   ① 一条岔路都没有的路径：D_path = √(整条长度) + 转弯次数（把整条路当成一条死路）。
 *      否则乘积恒为 0，任何「一条道走到黑」的迷宫都会得 0 分。
 *   ② 岔路走到主路上（环、捷径）：主路格子对岔路是墙，于是这条岔路在接回主路的地方断掉，
 *      按「无岔路的死路」记 √len + turns（长度只算岔路自己那截）。
 *   ③ 岔路内部成环：岔路探索时每格只进一次，环会在第一次回到已访问格时断掉。
 *
 * 复杂度：逐步穷举全部简单路径，路径多到 maxPaths 就截断并置 exact=false
 * （截断会破坏旋转/镜像不变性，所以对外给的分数默认要求 exact=true；生成器做粗筛时可以放宽）。
 *
 * 浏览器 + Node 共用：`module.exports` 或 `window.MazeDiff`。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MazeDiff = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = 'maze-3';
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /* ── 可调参数（只影响量级/手感，不改变已锁定的排序性质） ──
   *  DEAD_L0：死路的"饱和长度"。l ≪ L0 时 l²/(l²+L0²) 几乎为 0（过短的岔路是噪音，
   *           不该跟长岔路一样计分）；l ≫ L0 时趋于 1（极长的死路也不会无限加分）。
   *  TURN_W ：每个转弯折算多少分（0.15 ≈ 6 个转弯顶一条走满饱和长度、不转弯的死路）。 */
  const DEAD_L0 = 40;
  const TURN_W = 0.15;
  /* SCALE：只影响量级（1 条走满饱和长度、不转弯的死路 = 100 分），不影响任何排序/比值。 */
  const SCALE = 100;
  /* BRANCH_EPS：岔路分低于这个值就算「过短的岔路」，**不当作一个分割点**去切主路。
   *   5 格的死路 ≈ 0.015、25 格 ≈ 0.28、100 格 ≈ 0.86，取 0.05（≈9 格）当门槛：
   *   20 条 5 格死路的主路仍然是"一整段"，不会因为被切了 21 刀而虚高。
   * SEG_MODE：主路那段怎么算。
   *   'total'  √(整条长度) + 转弯      ← 默认：岔路分已经按"每条岔路"计过一遍了，
   *   'split'  Σ√(被岔路分开的每段) + 转弯   再按岔路数切一遍等于重复计分，
   *                                       而且切法越碎分越高，跟上面的岔路排序打架。
   *   两种都留着，`evaluate(m,{seg:'split'})` 可切回老口径。 */
  /* MAX_LEVEL：岔路最多递归几层。
   *   不封顶时，**环**会让同一批格子被不同入口反复计入（兄弟岔路互不影响 → 必然重复计分），
   *   搜索一会儿就能把分数刷到几百万（实测 767 万），涨的全是重复计数而不是真的更难。
   *   封到 4 层：一层/二层/三层/四层岔路都算，再深就按死路截断 —— 递归上限是"全局固定值"，
   *   旋转/镜像下不变，等价局面照样同分。 */
  /* 多层深度偏好（DEPTH_BONUS）：同一层里的排序不变，但**越深的岔路越值钱** ——
   * 第 L 层的死路按 1 + 0.25·(L-1) 倍计分（第 1 层权重 1，所有已锁定的手算样例都不变）。
   * 这是为了回应「人设计的回环迷宫会有岔路中的岔路」：
   * 光允许嵌套（MAX_LEVEL 大）不够，还要让嵌套比"同样长度的平铺死路"更划算。
   * 6 层：再深的按死路截断（全局固定值，旋转/镜像不变）。 */
  const MAX_LEVEL = 6;
  const DEPTH_BONUS = 0.25;
  const BRANCH_EPS = 5;      // 与 SCALE 同量纲（0.05 × 100）
  const SEG_MODE = 'split';

  /* ── 迷宫模型 ───────────────────────────────────────────────────────── */

  /** 从关卡记录里取网格：lock 块 = 墙，目标那块 = 起点，第一个目标的第一个格子 = 终点
   *  cells 兼容两种写法：[[c,r],…] 与 [{c,r},…] */
  function fromLevel(level) {
    const w = level.w, h = level.h;
    const wall = new Uint8Array(w * h);
    const g0 = level.goals && level.goals[0];
    if (!g0 || !g0.cells || !g0.cells.length) throw new Error('迷宫缺少目标');
    const mover = level.pieces.find(p => p.id === g0.piece) || level.pieces.find(p => p.hero);
    if (!mover) throw new Error('迷宫找不到起点块（目标里的 piece 或 hero）');
    for (const p of level.pieces) {
      if (p === mover) continue;
      if (!p.lock) continue;
      for (const cell of (p.cells || [[0, 0]])) {
        const c = Array.isArray(cell) ? cell[0] : cell.c;
        const r = Array.isArray(cell) ? cell[1] : cell.r;
        const x = (p.x || 0) + c, y = (p.y || 0) + r;
        if (x >= 0 && x < w && y >= 0 && y < h) wall[y * w + x] = 1;
      }
    }
    const [gx, gy] = g0.cells[0];
    return { w, h, wall, start: (mover.y || 0) * w + (mover.x || 0), goal: gy * w + gx };
  }

  /** '.'=通路 '#'=墙 'S'=起点 'G'=终点；允许前后有空白/说明行 */
  function parseAscii(rows) {
    const lines = rows.filter(r => /[.#SG]/.test(r));
    const h = lines.length, w = Math.max(...lines.map(r => r.length));
    const wall = new Uint8Array(w * h);
    let start = -1, goal = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = lines[y][x] || '#';
        if (ch === '#') wall[y * w + x] = 1;
        if (ch === 'S') start = y * w + x;
        if (ch === 'G') goal = y * w + x;
      }
    }
    if (start < 0 || goal < 0) throw new Error('ascii 迷宫要有 S 和 G');
    return { w, h, wall, start, goal };
  }

  function toAscii(m) {
    const rows = [];
    for (let y = 0; y < m.h; y++) {
      let s = '';
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x;
        s += i === m.start ? 'S' : i === m.goal ? 'G' : m.wall[i] ? '#' : '.';
      }
      rows.push(s);
    }
    return rows;
  }

  /* 旋转 / 镜像：等价局面（只改朝向） */
  function transform(m, kind) {
    const { w, h, wall, start, goal } = m;
    const nw = kind === 'transpose' || kind === 'rot90' || kind === 'rot270' ? h : w;
    const nh = kind === 'transpose' || kind === 'rot90' || kind === 'rot270' ? w : h;
    const out = new Uint8Array(nw * nh);
    const put = (x, y, v) => { out[y * nw + x] = v; };
    const map = (x, y) => {
      switch (kind) {
        case 'rot90': return [h - 1 - y, x];
        case 'rot180': return [w - 1 - x, h - 1 - y];
        case 'rot270': return [y, w - 1 - x];
        case 'flipX': return [w - 1 - x, y];
        case 'flipY': return [x, h - 1 - y];
        case 'transpose': return [y, x];
        default: return [x, y];
      }
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [nx, ny] = map(x, y);
      put(nx, ny, wall[y * w + x]);
    }
    const [sx, sy] = map(start % w, (start / w) | 0);
    const [gx, gy] = map(goal % w, (goal / w) | 0);
    return { w: nw, h: nh, wall: out, start: sy * nw + sx, goal: gy * nw + gx };
  }

  /* ── 打分内核 ───────────────────────────────────────────────────────── */

  function turnsOf(m, path) {
    let turns = 0, prev = -1;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const d = (b === a + 1) ? 0 : (b === a - 1) ? 1 : (b === a + m.w) ? 2 : 3;
      if (prev >= 0 && d !== prev) turns++;
      prev = d;
    }
    return turns;
  }

  /**
   * 一条岔路的难度分。entry=岔路口外侧那一格，from=从哪儿来（主路 / 岔路主干）。
   *
   * 关键：**兄弟岔路必须互不影响**。走到岔口时逐个方向递归，
   * 每条递归自己开一份「已走」标记、返回时撤掉（mark/undo），
   * 这样总和与「先算哪一支」无关 —— 否则旋转 90° 后邻居枚举顺序一变，分数就跟着变
   * （这就是等价局面分数不一致的根源，实测 19×19 密林穿行差 1.5%）。
   */
  let STAT = null;   // 打开 opts.stats 时统计「岔路层级」，用来验证嵌套结构有没有自然长出来
  let MAXLV = MAX_LEVEL;   // 单次 evaluate 用的递归上限（opts.maxLevel 可覆盖）
  /* CNT：算一条路径时「岔路一共走了多少格次」。树状迷宫里它正好等于非主路格数；
   * 有环路/格子密铺时，同一格会被不同岔口反复走到 → CNT 远大于非主路格数。
   * 用它做一次归一化，把"重复计分"折算掉（见 pathScore 末尾）。 */
  let CNT = 0;
  let OFF = 1;       // 这一盘的非主路格数（evaluate 传进来）

  /** 第 level 层的权重：第 1 层 = 1，往上每层 +DEPTH_BONUS —— 「多层深度偏好」 */
  function depthW(level) { return 1 + DEPTH_BONUS * (level - 1); }

  function branchScore(m, entry, from, blocked, stamp, gen, mine, level) {
    level = level || 1;
    let len = 0, turns = 0, prevDir = -1, cur = entry, prev = from;
    for (let guard = 0; guard < 1e6; guard++) {
      if (m.wall[cur] || blocked[cur] || stamp[cur] === gen) return deadEndScore(len, turns) * depthW(level);
      stamp[cur] = gen; mine.push(cur);
      len++; CNT++;
      let nextCell = -1, forward = 0;
      for (let k = 0; k < 4; k++) {
        const n = step(m, cur, k);
        if (n < 0 || n === prev) continue;
        if (m.wall[n] || blocked[n] || stamp[n] === gen) continue;
        forward++;
        if (nextCell < 0) nextCell = n;
      }
      if (forward === 0) {
        if (STAT) {
          STAT.deadEnds++;
          STAT.maxLevel = Math.max(STAT.maxLevel, level);
          STAT.levelCount[level] = (STAT.levelCount[level] || 0) + 1;
        }
        return deadEndScore(len, turns) * depthW(level);       // 死路（或接回主路 / 成环）
      }
      if (forward >= 2) {
        if (level >= MAXLV) {                                  // 递归到底：这条当死路截断
          if (STAT) { STAT.truncated = (STAT.truncated || 0) + 1; }
          return deadEndScore(len, turns) * depthW(level);
        }
        /* 岔口：每个方向各算一条二层岔路，本条岔路 = 它们之和（规格如此）。
         * 每支各自标记、各自撤销 → 与枚举顺序无关。 */
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const n = step(m, cur, k);
          if (n < 0 || n === prev) continue;
          if (m.wall[n] || blocked[n] || stamp[n] === gen) continue;
          const sub = [];
          sum += branchScore(m, n, cur, blocked, stamp, gen, sub, level + 1);
          for (const c of sub) stamp[c] = 0;                  // 撤销这一支的标记
        }
        return sum;
      }
      if (prevDir >= 0 && prevDir !== dirOf(m, cur, nextCell)) turns++;
      prevDir = dirOf(m, cur, nextCell);
      prev = cur; cur = nextCell;
    }
    return deadEndScore(len, turns) * depthW(level);
  }

  /** 一条死路（或一段无岔路的走廊）的分：凸起 + 饱和。
   *  这条曲线是为了满足用户点的三条排序：
   *    同样总格数下  「大量过短」< 「少量极长」< 「中等数量中等长度」
   *  纯 √len 是凹的 → 20 条 5 格（20·√5≈44.7）反而 > 1 条 100 格（10），正好反了；
   *  纯线性 → 无论怎么切都一样；这里用 l²/(l²+L0²)：短段起步极慢、长段封顶，
   *  于是 20×5 ≈ 0.31 < 1×100 ≈ 0.86 < 4×25 ≈ 1.12。 */
  function deadEndScore(len, turns) {
    const r = len / DEAD_L0;
    return SCALE * ((r * r) / (1 + r * r) + TURN_W * turns);
  }

  function step(m, i, k) {
    const x = i % m.w, y = (i / m.w) | 0;
    const nx = x + D4[k][0], ny = y + D4[k][1];
    if (nx < 0 || nx >= m.w || ny < 0 || ny >= m.h) return -1;
    return ny * m.w + nx;
  }
  function dirOf(m, a, b) {
    if (b === a + 1) return 0;
    if (b === a - 1) return 1;
    if (b === a + m.w) return 2;
    return 3;
  }

  /** 一条通关路径的难度分 */
  function pathScore(m, path, blocked, stamp, gen, segMode, offCells) {
    segMode = segMode || SEG_MODE;
    OFF = Math.max(1, offCells == null ? m.w * m.h : offCells);
    CNT = 0;
    let branchSum = 0, junctionIdx = [];
    const mine = [];
    for (let i = 1; i < path.length - 1; i++) {
      const c = path[i], prev = path[i - 1], next = path[i + 1];
      let here = 0;
      for (let k = 0; k < 4; k++) {
        const n = step(m, c, k);
        if (n < 0 || n === prev || n === next) continue;
        if (m.wall[n] || blocked[n]) continue;
        mine.length = 0;
        here += branchScore(m, n, c, blocked, stamp, gen, mine, 1);
        for (const x of mine) stamp[x] = 0;      // 每条岔路独立，算完就撤
      }
      branchSum += here;
      // 只有"够格"的岔路才切开主路（过短的岔路只是噪音，不算决策点）
      if (here >= BRANCH_EPS) junctionIdx.push(i);
    }
    const turns = turnsOf(m, path);
    /* 主路项：√(路长) + 转弯数。'split' 时按"够格的岔路"切成几段分别开方（原口径）；
     * 'total' 时直接开整条（岔路分已经在上面计过一遍，切开等于重复计分）。 */
    let base;
    if (segMode === 'split') {
      base = 0; let last = 0;
      for (const j of junctionIdx) { base += Math.sqrt(j - last); last = j; }
      base += Math.sqrt(path.length - 1 - last);
    } else {
      base = Math.sqrt(path.length - 1);
    }
    base += turns;
    /* 岔路是"乘性加成"，但必须**从 1 起乘**：
     * 直接写成 (Σ岔路分)×(主路项) 的话，一条没有岔路的走廊会得 0 分，
     * 而加一条最小的死路反而让分变小 —— 不单调。
     * 用 (1 + Σ岔路分/SCALE)：没有岔路 = 纯主路分；加死路只会往上走；
     * 一条走满饱和长度的死路（100 分）正好把主路分翻倍。 */
    /* 重复计分归一化：树状盘面 CNT == OFF（每格只算一次）→ 系数 1，分数完全不变；
     * 环路/密铺盘面 CNT 会虚高几倍，按 OFF/CNT 折算回来。
     * 这一步是"多层深度偏好"能用的前提：不折算的话，密集格阵里
     * 同一批格子会在第 1~6 层被反复计入，分数能刷到几千（真实难度远没有）。 */
    const dup = CNT > 0 ? Math.min(1, OFF / CNT) : 1;
    return {
      d: (1 + (branchSum * dup) / SCALE) * base,
      branchSum: branchSum * dup, rawBranchSum: branchSum, dup,
      turns, junctions: junctionIdx.length,
    };
  }

  /** 多通路合成：power mean（指数 -P）。单独拆出来是为了能直接单测这三条性质。 */
  function aggregate(ds, p) {
    p = p || 2;
    let s = 0;
    for (const d of ds) s += Math.pow(Math.max(d, 1e-9), -p);
    return s > 0 ? Math.pow(s, -1 / p) : 0;
  }

  /**
   * 求迷宫难度。
   *   opts.maxPaths  最多枚举多少条简单路径（默认 200000）
   *   opts.maxNodes  DFS 展开上限（默认 3e7）
   *   opts.detail    true 时返回每条路径的难度分（调试/测试用）
   */
  function evaluate(m, opts) {
    opts = opts || {};
    const maxPaths = opts.maxPaths || 200000;
    const maxNodes = opts.maxNodes || 3e7;
    /* 多通路合成：power mean（指数 -P）。P=1 就是原来的 1/Σ(1/D)（调和平均）。
     * 提到 P=2 是为了满足用户点的三条：
     *   易(1)+难(100) → 1.0000      ≈ 易（难的几乎不影响）
     *   易+易         → 0.707      更易
     *   难+难         → 70.7       没那么难（而不是直接砍半 50）
     * 同时 20 万条路径也不会把分数压成 0（P=1 时是 D/20 万，P=2 时是 D/447）。 */
    const P = opts.p || 2;
    if (opts.stats) STAT = { deadEnds: 0, maxLevel: 0, levelCount: {} };
    MAXLV = opts.maxLevel || MAX_LEVEL;
    const { w, h, wall } = m;
    const N = w * h;
    /* 先做一次「能不能到终点」的反向 BFS：到不了终点的格子不可能出现在任何通关路径上，
     * 一律不枚举。**不改变分数**（分支只剪掉不可能通向终点的部分），
     * 但把「一片环路 + 一条唯一解」的盘面从指数级压到线性级 ——
     * 实测 21×21 有一版只有 1 条简单路径，却要吃掉 200 万节点（环路不在解上，全被白枚举）。 */
    const toGoal = new Uint8Array(N);
    if (!wall[m.goal]) {
      const gq = [m.goal]; toGoal[m.goal] = 1;
      for (let i = 0; i < gq.length; i++) {
        const c = gq[i];
        for (let k = 0; k < 4; k++) {
          const n = step(m, c, k);
          if (n < 0 || wall[n] || toGoal[n]) continue;
          toGoal[n] = 1; gq.push(n);
        }
      }
    }
    /* 非主路格数：所有从起点可达的通路格，减去当前路径长度（每条路径各自算） */
    let openReach = 0;
    for (let c = 0; c < N; c++) if (!wall[c] && toGoal[c]) openReach++;
    const onPath = new Uint8Array(N);
    const vis = new Int32Array(N);
    let gen = 0;
    const path = [];
    const ds = [], bs = [];
    let nodes = 0, capped = false, sum = 0, pathCount = 0;

    function dfs(c) {
      if (capped) return;
      if (++nodes > maxNodes) { capped = true; return; }
      onPath[c] = 1; path.push(c);
      if (c === m.goal) {
        pathCount++;
        if (pathCount > maxPaths) { capped = true; path.pop(); onPath[c] = 0; return; }
        gen++;
        const r = pathScore(m, path, onPath, vis, gen, opts.seg || SEG_MODE, openReach - path.length);
        const d = Math.max(r.d, 1e-9);
        sum += Math.pow(d, -P);
        if (opts.detail) { ds.push(d); bs.push(r.branchSum); }
      } else {
        for (let k = 0; k < 4; k++) {
          const n = step(m, c, k);
          if (n < 0 || wall[n] || onPath[n] || !toGoal[n]) continue;
          dfs(n);
          if (capped) break;
        }
      }
      path.pop(); onPath[c] = 0;
    }
    if (toGoal[m.start]) dfs(m.start);

    const score = sum > 0 ? Math.pow(sum, -1 / P) : 0;
    return {
      version: VERSION,
      score,
      p: P,
      paths: pathCount,
      exact: !capped,
      capped,
      nodes,
      sumPow: sum,
      mean: pathCount && !capped ? Math.pow(sum / pathCount, -1 / P) : null,
      difficulties: opts.detail ? ds : undefined,
      branchSums: opts.detail ? bs : undefined,
      stats: opts.stats ? STAT : undefined,
    };
  }

  /** 只求最短解长度（BFS），生成器写 note / tip 用 */
  function shortest(m) {
    const { w, h, wall } = m;
    const dist = new Int32Array(w * h).fill(-1);
    dist[m.start] = 0;
    const q = [m.start];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (c === m.goal) break;
      for (let k = 0; k < 4; k++) {
        const n = step(m, c, k);
        if (n < 0 || wall[n] || dist[n] >= 0) continue;
        dist[n] = dist[c] + 1; q.push(n);
      }
    }
    return dist[m.goal];
  }

  return { VERSION, DEAD_L0, TURN_W, SCALE, MAX_LEVEL, DEPTH_BONUS, depthW, BRANCH_EPS, SEG_MODE, fromLevel, parseAscii, toAscii, transform, evaluate, pathScore, shortest, turnsOf, branchScore, deadEndScore, aggregate };
});
