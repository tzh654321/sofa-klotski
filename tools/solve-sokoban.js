/* 大局面推箱子关卡的参考解求解器（只推一个箱子的规则）
 *
 *   node tools/solve-sokoban.js levels/推箱子/06_仓库番6.json
 *   node tools/solve-sokoban.js <file> --weight 2 --max 2000000
 *
 * 为什么需要它：通用 BFS 把「玩家位置」也算进状态，11×9 的 ROOM 6 在 150 万节点内
 * 连一条解都搜不到。这里换成推箱子标准做法 ——
 *   状态 = 箱位集合 + 玩家可达区（同一区域内玩家走多少步都不影响可推方向），
 *   边   = 推一格，启发式 = 每只箱子到最近亮点的最少推数（反向推 BFS 预计算）。
 * 找到推序列后再展开成玩家的 m/p 走法，并逐条交给 K.moves / K.apply 校验，
 * 最后写回关卡记录的 solution 字段（非最优，标 optimal:false）。
 * 分数仍由 node tools/recompute.js --only 推箱子 用这份解当候选去算。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');

function solveFile(file, opts) {
  opts = opts || {};
  const WGT = opts.weight || 2, MAX = opts.max || 2000000;
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lv = rec.level || rec;
  const raw = SH.resolve(JSON.parse(JSON.stringify(lv)));
  const L = K.parse(raw), st = K.initialState(raw);
  const W = raw.w, H = raw.h;
  const cell = (c, r) => r * W + c, xy = i => [i % W, Math.floor(i / W)];
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const wall = new Uint8Array(W * H), boxAt = new Map();
  let player = -1, playerCell = -1;
  L.pieces.forEach((p, i) => {
    const cs = K.pieceCells(L, st, i);
    if (p.lock) { for (const [c, r] of cs) wall[cell(c, r)] = 1; return; }
    const [c, r] = cs[0];
    if (p.onceOnly || p.chainOnly) boxAt.set(cell(c, r), i);
    else { player = i; playerCell = cell(c, r); }
  });
  if (player < 0 || !boxAt.size) throw new Error('没找到玩家 / 一次被动箱子');
  const goals = (raw.goals || []).flatMap(g =>
    (g.spots || (g.cells ? [g.cells] : [])).map(s => cell(s[0][0], s[0][1])));
  if (!goals.length) throw new Error('没有目标亮点');

  /* 反向推距离：亮点 g ← 箱子在 p，玩家站在 p-d，两者都不能是墙 */
  function distFromGoal(g) {
    const d = new Map([[g, 0]]), q = [g];
    for (let h = 0; h < q.length; h++) {
      const c = q[h], [x, y] = xy(c);
      for (const [dx, dy] of DIRS) {
        const px = x - dx, py = y - dy, sx = x - 2 * dx, sy = y - 2 * dy;
        if (!inside(px, py) || !inside(sx, sy)) continue;
        const p = cell(px, py);
        if (wall[p] || wall[cell(sx, sy)] || d.has(p)) continue;
        d.set(p, d.get(c) + 1); q.push(p);
      }
    }
    return d;
  }
  const DG = goals.map(distFromGoal);
  const hOf = bs => bs.reduce((sum, b) => {
    let m = Infinity;
    for (const d of DG) { const v = d.get(b); if (v != null && v < m) m = v; }
    return sum + (m === Infinity ? 30 : m);
  }, 0);
  /** 玩家不推箱能走到的所有格子（箱子当墙） */
  function reach(pc, boxSet) {
    const seen = new Set([pc]), q = [pc];
    for (let h = 0; h < q.length; h++) {
      const [x, y] = xy(q[h]);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const n = cell(nx, ny);
        if (wall[n] || boxSet.has(n) || seen.has(n)) continue;
        seen.add(n); q.push(n);
      }
    }
    return seen;
  }

  /* 二叉堆（按 f 升序） */
  const heap = [], less = (a, b) => a.f < b.f;
  function hpush(v) {
    heap.push(v); let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      const t = heap[i]; heap[i] = heap[p]; heap[p] = t; i = p;
    }
  }
  function hpop() {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        const t = heap[i]; heap[i] = heap[m]; heap[m] = t; i = m;
      }
    }
    return top;
  }

  const startBoxes = [...boxAt.keys()].sort((a, b) => a - b);
  const keyOf = (bs, r) => bs.join(',') + '|' + Math.min(...r);
  const r0 = reach(playerCell, new Set(startBoxes)), k0 = keyOf(startBoxes, r0);
  const best = new Map([[k0, 0]]), par = new Map([[k0, null]]);
  hpush({ bs: startBoxes, r: r0, k: k0, g: 0, f: WGT * hOf(startBoxes) });
  let found = null, vis = 0;
  while (heap.length) {
    const cur = hpop();
    if (best.get(cur.k) !== cur.g) continue;
    vis++;
    if (goals.every(g => cur.bs.indexOf(g) >= 0)) { found = cur.k; break; }
    if (vis > MAX) break;
    const boxSet = new Set(cur.bs);
    for (const b of cur.bs) {
      const [x, y] = xy(b);
      for (const [dx, dy] of DIRS) {
        const bx = x + dx, by = y + dy, sx = x - dx, sy = y - dy;
        if (!inside(bx, by) || !inside(sx, sy)) continue;
        const bc = cell(bx, by), sc = cell(sx, sy);
        if (wall[bc] || wall[sc] || boxSet.has(bc) || !cur.r.has(sc)) continue;
        const nbs = cur.bs.map(v => v === b ? bc : v).sort((a, b2) => a - b2);
        const nr = reach(b, new Set(nbs)), nk = keyOf(nbs, nr), ng = cur.g + 1;
        if (best.has(nk) && best.get(nk) <= ng) continue;
        best.set(nk, ng);
        par.set(nk, { p: cur.k, push: { from: b, to: bc, d: [dx, dy], behind: sc } });
        hpush({ bs: nbs, r: nr, k: nk, g: ng, f: ng + WGT * hOf(nbs) });
      }
    }
  }
  if (!found) return { ok: false, reason: vis > MAX ? 'limit' : 'unsolvable', visited: vis };

  const pushes = [];
  for (let k = found; par.get(k);) { const e = par.get(k); pushes.push(e.push); k = e.p; }
  pushes.reverse();

  /* 展开成引擎走法：先走到箱子背后，再推一步 */
  let s = st, pc = playerCell;
  const boxPos = new Map(boxAt), moves = [];
  function walkTo(target) {
    const q = [pc], prev = new Map([[pc, null]]), boxSet = new Set(boxPos.keys());
    for (let h = 0; h < q.length; h++) {
      const c = q[h]; if (c === target) break;
      const [x, y] = xy(c);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const n = cell(nx, ny);
        if (wall[n] || boxSet.has(n) || prev.has(n)) continue;
        prev.set(n, { p: c, d: [dx, dy] }); q.push(n);
      }
    }
    if (!prev.has(target)) return false;
    const seq = [];
    for (let c = target; prev.get(c);) { const e = prev.get(c); seq.push(e.d); c = e.p; }
    seq.reverse();
    for (const d of seq) {
      const mv = { i: player, t: 'm', dx: d[0], dy: d[1] };
      moves.push(mv); s = K.apply(s, mv);
      pc = cell(xy(pc)[0] + d[0], xy(pc)[1] + d[1]);
    }
    return true;
  }
  for (const pu of pushes) {
    if (!walkTo(pu.behind)) throw new Error('走不到箱子背后：' + JSON.stringify(pu));
    const bi = boxPos.get(pu.from);
    if (bi == null) throw new Error('箱位映射丢失：' + JSON.stringify(pu));
    const mv = { i: player, t: 'p', dx: pu.d[0], dy: pu.d[1], chain: [player, bi] };
    const legal = K.moves(L, s).some(x => x.i === mv.i && x.t === 'p' &&
      x.dx === mv.dx && x.dy === mv.dy && JSON.stringify(x.chain) === JSON.stringify(mv.chain));
    if (!legal) throw new Error('引擎不认这一步：' + JSON.stringify(pu));
    moves.push(mv); s = K.apply(s, mv); pc = pu.from;
    boxPos.delete(pu.from); boxPos.set(pu.to, bi);
  }
  if (!K.isGoal(L, s, raw.goals)) throw new Error('解法回放没达成目标');

  rec.solution = {
    solver: 'sokoban-push-astar', optimal: false,
    steps: moves.length, hands: K.mergeMoves(moves).length, moves
  };
  fs.writeFileSync(file, JSON.stringify(rec, null, 1) + '\n', 'utf8');
  return { ok: true, steps: moves.length, pushes: pushes.length, visited: vis, states: best.size };
}

module.exports = { solveFile };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const file = argv.find(a => !a.startsWith('--'));
  const argOf = k => { const i = argv.indexOf(k); return i >= 0 ? +argv[i + 1] : null; };
  if (!file) {
    console.log('用法：node tools/solve-sokoban.js <关卡 json> [--weight 2] [--max 2000000]');
    process.exit(1);
  }
  try {
    const r = solveFile(path.resolve(file), { weight: argOf('--weight') || 2, max: argOf('--max') || 2000000 });
    console.log(r.ok
      ? '解出 ' + r.steps + ' 步 / ' + r.pushes + ' 次推（搜索 ' + r.visited + ' 态）；已写回 ' + file
      : '没找到解：' + r.reason + '（展开 ' + r.visited + ' 态）');
    process.exit(r.ok ? 0 : 2);
  } catch (e) { console.error('失败：' + e.message); process.exit(1); }
}
