/* ────────────────────────────────────────────────────────────────
 * puzzle15.js — 4×4 十五子专用求解器（IDA*）
 *
 * 为什么单独一套：
 *   十五数码可达状态 16!/2 ≈ 1.05e13，通用 BFS 只能撞上限。
 *   这里把棋盘压成 16 个 Uint8，用 IDA* 沿启发式往下钻，不存搜索树。
 *
 * 关键：本项目的"连锁推"一次可让空格沿直线跳 1~3 格，同时带动最多 3 个数字，
 *   所以一步最多把 H（水平曼哈顿和）减 3、V 减 3：
 *       h = ceil(H/3) + ceil(V/3)
 *   这是该规则下的合法下界，比 ceil((H+V)/3) 更强。
 *   权重 1 → 保证最短；权重 >1（加权 IDA*）→ 快速解，不保证最短。
 * ──────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const N = 16;

  function validBoard(a) {
    if (!a || a.length !== N) return false;
    const seen = new Set();
    for (const x of a) {
      if (!Number.isInteger(x) || x < 0 || x > 15 || seen.has(x)) return false;
      seen.add(x);
    }
    return true;
  }

  /** 十五数码可达性不变量（含空格所在行） */
  function parity(a) {
    let inv = 0;
    for (let i = 0; i < N; i++) {
      if (a[i] === 0) continue;
      for (let j = i + 1; j < N; j++) {
        if (a[j] !== 0 && a[i] > a[j]) inv++;
      }
    }
    const rowFromBottom = 4 - (a.indexOf(0) >> 2);
    return (inv + rowFromBottom) & 1;
  }

  /**
   * solve15(start, goal, opts)
   *   chain       是否按"连锁推"计步（本项目规则，默认 true）
   *   weight      1=最短解；>1=快速解
   *   timeLimitMs 超时预算
   * 返回 { ok, moves:[{from,to,step}], optimal, expanded, ms, reason }
   */
  function solve15(start, goal, opts) {
    opts = opts || {};
    const chain = opts.chain !== false;
    const weight = Math.max(1, +opts.weight || 1);
    const timeLimitMs = opts.timeLimitMs == null ? 8000 : opts.timeLimitMs;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const s = Array.from(start), g = Array.from(goal || goalBoard());
    if (!validBoard(s) || !validBoard(g)) {
      return { ok: false, reason: 'bad-board', expanded: 0, ms: 0 };
    }
    if (parity(s) !== parity(g)) {
      return { ok: false, reason: 'unsolvable', expanded: 0, ms: 0 };
    }

    const board = Uint8Array.from(s);
    const targetPos = new Uint8Array(N);
    for (let p = 0; p < N; p++) targetPos[g[p]] = p;

    // 每个数字到每个格子的水平/垂直距离，预计算
    const dx = [], dy = [];
    for (let t = 0; t < N; t++) {
      dx.push(new Uint8Array(N));
      dy.push(new Uint8Array(N));
    }
    for (let t = 1; t < N; t++) {
      const q = targetPos[t];
      for (let p = 0; p < N; p++) {
        dx[t][p] = Math.abs((p & 3) - (q & 3));
        dy[t][p] = Math.abs((p >> 2) - (q >> 2));
      }
    }
    const divisor = chain ? 3 : 1;
    const heap = (H, V) => Math.ceil(H / divisor) + Math.ceil(V / divisor);

    // ── 模式数据库：h = max(曼哈顿/3, 各 PDB 的值)
    // 只能取 max：一次连锁推可能同时挪动不同组的数字，两张表会重复计同一步，
    // 相加就不再是下界（会剪掉最优解）。
    const pdbs = (opts.pdbs && opts.pdbs.length) ? opts.pdbs : null;
    const where = new Uint8Array(16);
    const ppos = new Int32Array(8);
    function pdbH() {
      for (let p = 0; p < N; p++) where[board[p]] = p;
      let m = 0;
      for (let pi = 0; pi < pdbs.length; pi++) {
        const pdb = pdbs[pi], k = pdb.k;
        ppos[0] = where[0];
        const tl = pdb.tiles;
        for (let i = 0; i < tl.length; i++) ppos[i + 1] = where[tl[i]];
        const d = pdb.dist[rankOf(ppos, k)];
        if (d !== 255 && d > m) m = d;
      }
      return m;
    }
    const totalH = (H, V) => (pdbs ? Math.max(heap(H, V), pdbH()) : heap(H, V));

    // 空格能滑到的目标格（沿直线 1~3 格）
    const maxJump = chain ? 3 : 1;
    const edges = [];
    for (let z = 0; z < N; z++) {
      const list = [];
      const zx = z & 3, zy = z >> 2;
      for (const [sx, sy, step] of [[-1, 0, -1], [1, 0, 1], [0, -1, -4], [0, 1, 4]]) {
        for (let n = 1; n <= maxJump; n++) {
          const nx = zx + sx * n, ny = zy + sy * n;
          if (nx < 0 || nx > 3 || ny < 0 || ny > 3) break;
          list.push({ to: ny * 4 + nx, step });
        }
      }
      edges.push(list);
    }

    function slide(z, to, step) {
      for (let p = z; p !== to; p += step) board[p] = board[p + step];
      board[to] = 0;
    }

    let H0 = 0, V0 = 0;
    for (let p = 0; p < N; p++) {
      const t = board[p];
      if (t) { H0 += dx[t][p]; V0 += dy[t][p]; }
    }

    const FOUND = 1, TIMEOUT = 2;
    const path = [];
    let expanded = 0, ticks = 0, deadline = false;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // 转置表：状态 -> 已用过的最大 g（本次迭代内）。
    // 同一迭代里以更大的 g 再次到达同一状态，剩下的路完全一样，不可能更优，直接剪。
    const useTT = opts.tt !== false;
    const TT_MAX = opts.ttMax || 3000000;
    const seenG = useTT ? new Map() : null;
    let epoch = 0;
    const bkey = () => String.fromCharCode.apply(null, board);

    function dfs(z, prevBlank, gnum, H, V, bound) {
      if ((ticks++ & 511) === 0 && now() - t0 >= timeLimitMs) { deadline = true; throw TIMEOUT; }
      if (useTT) {
        const k = bkey();
        // 值打包成一个整数：高 24 位 = epoch，低 8 位 = g。不要用对象——300 万条对象就是几百 MB
        const val = seenG.get(k);
        if (val !== undefined && (val >>> 8) === epoch) {
          if ((val & 255) <= gnum) return Infinity;      // 已经用更少步数走过
          seenG.set(k, (epoch << 8) | gnum);
        } else if (seenG.size < TT_MAX) {
          seenG.set(k, (epoch << 8) | gnum);
        }
        // 超过上限就不再记新状态（老条目继续剪枝）：宁可少剪点，也不能把 Map 撑爆
        // （V8 的 Map 上限是 2^24 项，深局面很容易撞上）
      }
      const f = gnum + weight * totalH(H, V);
      if (f > bound) return f;
      if (H === 0 && V === 0) return FOUND;

      expanded++;
      let nextBound = Infinity;
      const cands = [];
      const rootLimit = (gnum === 0 && opts.rootOnly) ? new Set(opts.rootOnly) : null;
      let candIdx = -1;
      for (const e of edges[z]) {
        if (e.to === prevBlank) continue;
        candIdx++;
        let nH = H, nV = V;
        for (let p = z + e.step; ; p += e.step) {
          const t = board[p], q = p - e.step;
          nH += dx[t][q] - dx[t][p];
          nV += dy[t][q] - dy[t][p];
          if (p === e.to) break;
        }
        cands.push({ to: e.to, step: e.step, H: nH, V: nV, h: totalH(nH, nV), idx: candIdx });
      }
      // 先走估计更好的分支，IDA* 在加权模式下收益明显
      cands.sort((a, b) => a.h - b.h);

      for (const e of cands) {
        if (rootLimit && !rootLimit.has(e.idx)) continue;
        slide(z, e.to, e.step);
        path.push({ from: z, to: e.to, step: e.step });
        const r = dfs(e.to, z, gnum + 1, e.H, e.V, bound);
        slide(e.to, z, -e.step);
        if (r === FOUND) return FOUND;
        path.pop();
        if (r < nextBound) nextBound = r;
      }
      return nextBound;
    }

    let bound = opts.oneBound != null ? opts.oneBound : weight * heap(H0, V0);
    let guard = 0;
    try {
      for (;;) {
        if (++guard > 999) break;
        epoch++;
        if (opts.onIter) opts.onIter(bound, expanded);
        const r = dfs(board.indexOf(0), -1, 0, H0, V0, bound);
        if (opts.oneBound != null) {
          // 只跑这一轮：给多核协调用（每个 worker 负责首层的一个分支）
          return r === FOUND
            ? { ok: true, moves: path.slice(), optimal: weight === 1, expanded, ms: Math.round(now() - t0) }
            : { ok: false, reason: 'bound', nextBound: r, expanded, ms: Math.round(now() - t0) };
        }
        if (r === FOUND) {
          return {
            ok: true, moves: path.slice(), optimal: weight === 1,
            expanded, ms: Math.round(now() - t0)
          };
        }
        if (r === Infinity) return { ok: false, reason: 'unsolvable', expanded, ms: Math.round(now() - t0) };
        bound = r;
      }
      return { ok: false, reason: 'limit', expanded, ms: Math.round(now() - t0) };
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      return { ok: false, reason: 'timeout', expanded, lowerBound: heap(H0, V0), ms: Math.round(now() - t0) };
    }
  }

  /** 通用加权 A*：可只盯部分数字（stage），并可冻结已完成的数字（frozen）
   *  opts.stage  要摆到目标位置的数字集合（默认 1..15）
   *  opts.frozen 已冻结的数字集合（它们不许动，等于墙）
   */
  function astarCore(start, goal, opts) {
    opts = opts || {};
    const w = Math.max(1, +opts.weight || 4);
    const timeLimitMs = opts.timeLimitMs == null ? 8000 : opts.timeLimitMs;
    const cap = opts.maxNodes || 900000;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t0 = now();

    const s = Array.from(start), g = Array.from(goal || goalBoard());
    if (!validBoard(s) || !validBoard(g)) return { ok: false, reason: 'bad-board', expanded: 0, ms: 0 };

    const targetPos = new Uint8Array(N);
    for (let p = 0; p < N; p++) targetPos[g[p]] = p;
    const dx = [], dy = [];
    for (let t = 0; t < N; t++) { dx.push(new Uint8Array(N)); dy.push(new Uint8Array(N)); }
    for (let t = 1; t < N; t++) {
      const q = targetPos[t];
      for (let p = 0; p < N; p++) {
        dx[t][p] = Math.abs((p & 3) - (q & 3));
        dy[t][p] = Math.abs((p >> 2) - (q >> 2));
      }
    }
    const stageSet = opts.stage ? new Set(opts.stage) : null;
    const frozenSet = opts.frozen ? new Set(opts.frozen) : null;
    const inStage = t => !stageSet || stageSet.has(t);

    const hv = a => {
      let H = 0, V = 0;
      for (let p = 0; p < N; p++) {
        const t = a[p];
        if (t && inStage(t)) { H += dx[t][p]; V += dy[t][p]; }
      }
      return Math.ceil(H / 3) + Math.ceil(V / 3);
    };
    const done = a => {
      for (let p = 0; p < N; p++) {
        const t = a[p];
        if (t && inStage(t) && targetPos[t] !== p) return false;
      }
      return true;
    };

    const edges = [];
    for (let z = 0; z < N; z++) {
      const list = [], zx = z & 3, zy = z >> 2;
      for (const [sx, sy, step] of [[-1, 0, -1], [1, 0, 1], [0, -1, -4], [0, 1, 4]]) {
        for (let n = 1; n <= 3; n++) {
          const nx = zx + sx * n, ny = zy + sy * n;
          if (nx < 0 || nx > 3 || ny < 0 || ny > 3) break;
          list.push({ to: ny * 4 + nx, step });
        }
      }
      edges.push(list);
    }

    const heap = [];
    const push = n => {
      heap.push(n);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= heap[i].f) break;
        const tmp = heap[p]; heap[p] = heap[i]; heap[i] = tmp; i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          const tmp = heap[m]; heap[m] = heap[i]; heap[i] = tmp; i = m;
        }
      }
      return top;
    };

    const key = a => a.join(',');
    const startKey = key(s);
    const best = new Map([[startKey, 0]]);
    const parent = new Map([[startKey, null]]);
    const moveOf = new Map();
    push({ f: w * hv(s), g: 0, board: s, k: startKey });

    let expanded = 0;
    while (heap.length) {
      if ((expanded & 255) === 0 && now() - t0 >= timeLimitMs) {
        return { ok: false, reason: 'timeout', expanded, ms: Math.round(now() - t0) };
      }
      if (expanded > cap) return { ok: false, reason: 'limit', expanded, ms: Math.round(now() - t0) };
      const node = pop();
      if (node.g > (best.get(node.k) ?? Infinity)) continue;
      const a = node.board;
      if (done(a)) {
        const moves = [];
        let k = node.k;
        while (moveOf.has(k)) { moves.push(moveOf.get(k)); k = parent.get(k); }
        moves.reverse();
        return { ok: true, moves, optimal: w === 1, expanded, ms: Math.round(now() - t0) };
      }
      expanded++;
      const z = a.indexOf(0);
      for (const e of edges[z]) {
        // 冻结的数字一步都不许动：整段滑动的路径上不能有它们
        let blocked = false;
        if (frozenSet) {
          for (let p = z + e.step; ; p += e.step) {
            if (frozenSet.has(a[p])) { blocked = true; break; }
            if (p === e.to) break;
          }
        }
        if (blocked) continue;
        const b = a.slice();
        for (let p = z; p !== e.to; p += e.step) b[p] = b[p + e.step];
        b[e.to] = 0;
        const kk = key(b), ng = node.g + 1;
        if (ng >= (best.get(kk) ?? Infinity)) continue;
        best.set(kk, ng);
        parent.set(kk, node.k);
        moveOf.set(kk, { from: z, to: e.to, step: e.step });
        push({ f: ng + w * hv(b), g: ng, board: b, k: kk });
      }
    }
    return { ok: false, reason: 'unsolvable', expanded, ms: Math.round(now() - t0) };
  }

  /** 分层解：按用户给的分组 A/B/C 逐层摆好，前一层完成后冻结
   *  A={1,2,3,4,5,9,13}  B={6,7,8,10,14}  C={11,12,15}
   *  也就是 4×4 的「最外 L → 次外 L → 最后 2×2」。
   */
  const LAYERS = [
    [1, 2, 3, 4, 5, 9, 13],
    [6, 7, 8, 10, 14],
    [11, 12, 15]
  ];
  function solve15layered(start, goal, opts) {
    opts = opts || {};
    const g = Array.from(goal || goalBoard());
    let board = Array.from(start);
    const all = [];
    const frozen = [];
    let expanded = 0;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    for (let li = 0; li < LAYERS.length; li++) {
      const layer = LAYERS[li];
      const r = astarCore(board, g, {
        weight: opts.weight || 3,
        stage: layer,
        frozen: frozen.slice(),
        timeLimitMs: opts.timeLimitMs || 6000,
        maxNodes: 2000000
      });
      expanded += r.expanded || 0;
      if (!r.ok) {
        // 某一层卡住就整体退回加权 A*，保证一定能出解
        const fb = solve15astar(board, g, { weight: opts.weight || 4, timeLimitMs: opts.timeLimitMs || 8000 });
        if (fb.ok) {
          for (const m of fb.moves) all.push(m);
          return { ok: true, moves: all, optimal: false, layered: true, fallback: 'layer' + (li + 1),
            expanded: expanded + fb.expanded, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) };
        }
        return { ok: false, reason: 'layer' + (li + 1) + '-' + (r.reason || 'fail'), expanded, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) };
      }
      for (const m of r.moves) {
        all.push(m);
        for (let p = m.from; p !== m.to; p += m.step) board[p] = board[p + m.step];
        board[m.to] = 0;
      }
      for (const t of layer) frozen.push(t);
    }
    const ok = JSON.stringify(board) === JSON.stringify(g);
    return { ok, moves: all, optimal: false, layered: true, expanded, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) };
  }

  /** 加权 A*（快速解）：按 f = g + w*h 挑节点，先到先得，不保证最短。
   *  IDA* 在深局面上会反复重来，A* 至少把已经算过的部分留下来。 */
  function solve15astar(start, goal, opts) {
    opts = opts || {};
    const w = Math.max(1, +opts.weight || 4);
    const timeLimitMs = opts.timeLimitMs == null ? 8000 : opts.timeLimitMs;
    const cap = opts.maxNodes || 1200000;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const s = Array.from(start), g = Array.from(goal || goalBoard());
    if (!validBoard(s) || !validBoard(g)) return { ok: false, reason: 'bad-board', expanded: 0, ms: 0 };
    if (parity(s) !== parity(g)) return { ok: false, reason: 'unsolvable', expanded: 0, ms: 0 };

    const targetPos = new Uint8Array(N);
    for (let p = 0; p < N; p++) targetPos[g[p]] = p;
    const dx = [], dy = [];
    for (let t = 0; t < N; t++) { dx.push(new Uint8Array(N)); dy.push(new Uint8Array(N)); }
    for (let t = 1; t < N; t++) {
      const q = targetPos[t];
      for (let p = 0; p < N; p++) {
        dx[t][p] = Math.abs((p & 3) - (q & 3));
        dy[t][p] = Math.abs((p >> 2) - (q >> 2));
      }
    }
    const heapOf = (H, V) => Math.ceil(H / 3) + Math.ceil(V / 3);
    const edges = [];
    for (let z = 0; z < N; z++) {
      const list = [], zx = z & 3, zy = z >> 2;
      for (const [sx, sy, step] of [[-1, 0, -1], [1, 0, 1], [0, -1, -4], [0, 1, 4]]) {
        for (let n = 1; n <= 3; n++) {
          const nx = zx + sx * n, ny = zy + sy * n;
          if (nx < 0 || nx > 3 || ny < 0 || ny > 3) break;
          list.push({ to: ny * 4 + nx, step });
        }
      }
      edges.push(list);
    }
    const hv = a => {
      let H = 0, V = 0;
      for (let p = 0; p < N; p++) { const t = a[p]; if (t) { H += dx[t][p]; V += dy[t][p]; } }
      return heapOf(H, V);
    };

    // 二叉堆（最小 f）
    const heap = [];
    const push = n => {
      heap.push(n);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= heap[i].f) break;
        [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };

    const key = a => a.join(',');
    const startKey = key(s);
    const best = new Map([[startKey, 0]]);
    const parent = new Map([[startKey, null]]);
    const moveOf = new Map();
    push({ f: w * hv(s), g: 0, board: s, k: startKey });

    let expanded = 0;
    while (heap.length) {
      if ((expanded & 255) === 0 && now() - t0 >= timeLimitMs) {
        return { ok: false, reason: 'timeout', expanded, ms: Math.round(now() - t0) };
      }
      if (expanded > cap) return { ok: false, reason: 'limit', expanded, ms: Math.round(now() - t0) };
      const node = pop();
      if (node.g > (best.get(node.k) ?? Infinity)) continue;
      const a = node.board;
      if (hv(a) === 0) {
        const moves = [];
        let k = node.k;
        while (moveOf.has(k)) { moves.push(moveOf.get(k)); k = parent.get(k); }
        moves.reverse();
        return { ok: true, moves, optimal: w === 1, expanded, ms: Math.round(now() - t0) };
      }
      expanded++;
      const z = a.indexOf(0);
      for (const e of edges[z]) {
        const b = a.slice();
        for (let p = z; p !== e.to; p += e.step) b[p] = b[+p + e.step];
        b[e.to] = 0;
        const kk = key(b), ng = node.g + 1;
        if (ng >= (best.get(kk) ?? Infinity)) continue;
        best.set(kk, ng);
        parent.set(kk, node.k);
        moveOf.set(kk, { from: z, to: e.to, step: e.step });
        push({ f: ng + w * hv(b), g: ng, board: b, k: kk });
      }
    }
    return { ok: false, reason: 'unsolvable', expanded, ms: Math.round(now() - t0) };
  }

  // PDB 查询需要 P(n,k)：这里自带一份，避免和 pdb15.js 互相依赖
  const PERMS = [];
  for (let n = 0; n <= 16; n++) {
    PERMS.push(new Float64Array(9));
    PERMS[n][0] = 1;
    for (let k = 1; k <= 8; k++) PERMS[n][k] = n - k + 1 >= 1 ? PERMS[n][k - 1] * (n - k + 1) : 0;
  }
  function rankOf(pos, k) {
    let rank = 0;
    for (let i = 0; i < k; i++) {
      const p = pos[i];
      let c = p;
      for (let j = 0; j < i; j++) if (pos[j] < p) c--;
      rank += c * PERMS[15 - i][k - 1 - i];
    }
    return rank;
  }

  /** 根节点的下界（多核协调时定起手阈值用） */
  function rootHeuristic(start, goal, pdbs) {
    const g = Array.from(goal || goalBoard());
    const targetPos = new Array(N);
    for (let p = 0; p < N; p++) targetPos[g[p]] = p;
    let H = 0, V = 0;
    for (let p = 0; p < N; p++) {
      const t = start[p];
      if (!t) continue;
      H += Math.abs((p & 3) - (targetPos[t] & 3));
      V += Math.abs((p >> 2) - (targetPos[t] >> 2));
    }
    let h = Math.ceil(H / 3) + Math.ceil(V / 3);
    if (pdbs) {
      const where = new Uint8Array(16);
      for (let p = 0; p < N; p++) where[start[p]] = p;
      const ppos = new Int32Array(8);
      for (const pdb of pdbs) {
        ppos[0] = where[0];
        for (let i = 0; i < pdb.tiles.length; i++) ppos[i + 1] = where[pdb.tiles[i]];
        const d = pdb.dist[rankOf(ppos, pdb.k)];
        if (d !== 255 && d > h) h = d;
      }
    }
    return h;
  }

  function goalBoard() {
    const g = new Array(N);
    for (let i = 0; i < N; i++) g[i] = (i + 1) % N;
    return g;
  }

  /**
   * 从关卡数据判断能不能用专用求解器：
   *  4×4、15 个 1×1 块、一个空格、每块的目标格恰好铺满 15 格
   * 返回 null 或 { start:[16], tileOfPiece:[16], pieceOfTile:[16] }
   */
  function detect(level, state, goals) {
    if (!level || level.w !== 4 || level.h !== 4) return null;
    if (level.pieces.length !== 15) return null;
    const g = new Array(N).fill(null);
    for (const goal of (goals || [])) {
      if (!goal || !goal.cells || goal.cells.length !== 1) return null;
      const i = typeof goal.piece === 'number' ? goal.piece
        : level.pieces.findIndex(p => p.id === goal.piece);
      if (i < 0) return null;
      const [c, r] = goal.cells[0];
      if (c < 0 || r < 0 || c > 3 || r > 3) return null;
      if (g[r * 4 + c] != null) return null;
      g[r * 4 + c] = i;
    }
    if (g.filter(x => x != null).length !== 15) return null;

    // 每块必须是 1×1，且所有朝向都是自己那一格
    for (let i = 0; i < 15; i++) {
      const p = level.pieces[i];
      for (const o of p.oris) if (o.cells.length !== 1) return null;
    }

    const start = new Array(N).fill(0);
    const tileOfPiece = new Array(15).fill(0);
    const pieceOfTile = new Array(16).fill(-1);
    // 逐格填：数字编号 = 该块目标格下标 + 1（于是目标盘面就是 [1..15,0]），0 留给空格
    const goalPosOf = new Array(15).fill(-1);
    for (let q = 0; q < N; q++) if (g[q] != null) goalPosOf[g[q]] = q;
    const tileAt = new Array(N).fill(0);
    let used = 0;
    for (let i = 0; i < 15; i++) {
      const cells = level.pieces[i].oris[state[i].ori % level.pieces[i].oris.length].cells;
      const c = state[i].x + cells[0][0], r = state[i].y + cells[0][1];
      if (c < 0 || r < 0 || c > 3 || r > 3) return null;
      const pos = r * 4 + c;
      if (tileAt[pos]) return null;
      const gp = goalPosOf[i];
      if (gp < 0) return null;
      const num = gp + 1;              // 1..15
      tileAt[pos] = num;
      tileOfPiece[i] = num;
      pieceOfTile[num] = i;
      used++;
    }
    if (used !== 15) return null;
    const blanks = tileAt.filter(x => x === 0).length;
    if (blanks !== 1) return null;
    return { start: tileAt, tileOfPiece, pieceOfTile, goal: goalBoard() };
  }

  global.Puzzle15 = { solve15, solve15astar, solve15layered, astarCore, detect, parity, goalBoard, rootHeuristic, LAYERS, N };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Puzzle15;
})(typeof window !== 'undefined' ? window : globalThis);
