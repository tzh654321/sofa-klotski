/* 迷宫难度 maze-2 · 单测
 *   node test/maze-difficulty.test.js
 *
 * 验三件事：
 *   ① 规格里的公式按手算样例对得上（直线 / 一条死路岔路 / 两条并列路径的合成）；
 *   ② **等价局面的分数必须一样**（旋转 90/180/270、水平/垂直镜像、转置）—— 用户点名要验的；
 *   ③ 迭代生成器：改动预算逐次递减、格子→块→格子往返不变形、底图连通。
 */
const fs = require('fs');
const path = require('path');
const MD = require('../tools/maze/difficulty.js');
const EV = require('../tools/maze/evolve.cjs');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('[1] 公式 / 手算样例');
{
  /* 死路核：deadEndScore(l, t) = 100 · ( l²/(l²+40²) + 0.15·t )
   * 主路：D = (1 + Σ死路核/100) × (√路长 + 转弯) */
  const dead = (l, t) => 100 * ((l * l) / (l * l + 1600) + 0.15 * (t || 0));

  const straight = MD.parseAscii(['#S##', '#.##', '#G##', '####']);   // 2 步，无岔路
  const a = MD.evaluate(straight);
  ok(a.paths === 1 && near(a.score, Math.SQRT2, 1e-9), '直走廊 = √2（无岔路时就是主路项）', a.score);

  /* 同上 + 右侧一格死路（1 格死路 0.06 分，远低于 BRANCH_EPS=5 → 不切主路）：
   * D = (1 + 0.0625/100) × √2 —— 只比纯直廊难一丁点，但**必须变大** */
  const stub = MD.parseAscii(['#S##', '#..#', '#G##', '####']);
  const b = MD.evaluate(stub);
  ok(b.paths === 1 && near(b.score, (1 + dead(1, 0) / 100) * Math.SQRT2, 1e-9),
    '直走廊 + 1 格死路 = (1+核/100)×√2', [b.score, (1 + dead(1, 0) / 100) * Math.SQRT2]);
  ok(b.score > a.score, '加死路一定比纯直廊难（单调）', [a.score, b.score]);
}

console.log('\n[1b] 岔路排序：总格数相等时「大量过短」<「少量极长」<「中等数量中等长度」');
{
  /* 梳子迷宫：主走廊一样长（40 步），岔路总格数都是 100 格 */
  const comb = (stubs, W = 45, H = 104) => {
    const wall = new Uint8Array(W * H).fill(1);
    for (let x = 1; x < W - 1; x++) wall[1 * W + x] = 0;
    for (const [x, len] of stubs) for (let t = 1; t <= len; t++) wall[(1 + t) * W + x] = 0;
    return { w: W, h: H, wall, start: 1 * W + 1, goal: 1 * W + (W - 2) };
  };
  const many = comb(Array.from({ length: 20 }, (_, i) => [2 + 2 * i, 5]));
  const mid = comb([[10, 25], [20, 25], [30, 25], [40, 25]]);
  const long = comb([[20, 100]]);
  const sm = MD.evaluate(many), sd = MD.evaluate(mid), sl = MD.evaluate(long);
  ok(sm.score < sl.score, '大量过短(20×5) < 少量极长(1×100)', [sm.score, sl.score]);
  ok(sl.score < sd.score, '少量极长(1×100) < 中等(4×25)', [sl.score, sd.score]);
  // 岔路分本身也必须同序（整关分再乘主路项，可能被主路项干扰）
  const bm = MD.evaluate(many, { detail: true }).branchSums[0];
  const bd = MD.evaluate(mid, { detail: true }).branchSums[0];
  const bl = MD.evaluate(long, { detail: true }).branchSums[0];
  ok(bm < bl && bl < bd, '岔路分同序：' + [bm, bl, bd].map(v => v.toFixed(1)).join(' < '), [bm, bl, bd]);
}

console.log('\n[1c] 多通路合成：易+难≈易 / 易+易=更易 / 难+难=没那么难');
{
  const A = MD.aggregate;
  ok(near(A([1, 100]), 1, 0.01), '易(1)+难(100) ≈ 易', A([1, 100]));
  ok(A([1, 1]) < 1, '易+易 更易', A([1, 1]));
  const hh = A([100, 100]);
  ok(hh < 100 && hh > 50, '难+难 没那么难（>一半，<原值）', hh);
  ok(A([100]) === 100, '单条路径就是它自己', A([100]));

  /* 真迷宫上再验一遍：两路口径一致 */
  const loop = MD.parseAscii(['S..', '.#.', 'G..']);
  const c = MD.evaluate(loop, { detail: true });
  ok(c.paths === 2 && near(c.score, MD.aggregate(c.difficulties), 1e-9), '两条路 → 用 power mean 合成', [c.score, MD.aggregate(c.difficulties)]);
  ok(c.score < Math.min(...c.difficulties), '多一条路 → 比任何单条都容易', [c.score, c.difficulties]);
}

console.log('\n[1d] 二层岔路用同一个核（递归不改变排序）');
{
  /* 死路核本身满足排序，二层岔路分是若干死路核之和 → 同序。
   * 这里直接验核：20×5 与 4×25 与 1×100 的核和。 */
  const sum = lens => lens.reduce((a, l) => a + MD.deadEndScore(l, 0), 0);
  const many = sum(Array(20).fill(5)), mid = sum(Array(4).fill(25)), long = sum([100]);
  ok(many < long && long < mid, '核和同序：' + [many, long, mid].map(v => v.toFixed(1)).join(' < '), [many, long, mid]);
}

console.log('\n[2] 等价局面（旋转 / 镜像 / 转置）分数一致');
{
  const file = path.join(__dirname, '..', 'levels', '迷宫', '01_密林穿行.json');
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const m = MD.fromLevel(rec.level);
  const base = MD.evaluate(m, { maxPaths: 300000 });
  ok(base.exact, '19×19 密林穿行能穷举（分数可作基准）', [base.paths, base.exact]);
  const kinds = ['rot90', 'rot180', 'rot270', 'flipX', 'flipY', 'transpose'];
  for (const k of kinds) {
    const t = MD.evaluate(MD.transform(m, k), { maxPaths: 300000 });
    ok(t.exact && near(t.score, base.score, 1e-9), k + ' 分数相同（' + base.score.toFixed(6) + '）', [t.score, base.score]);
  }
  // 对称迷宫：旋转 180° 应该一模一样
  const sym = MD.parseAscii(['#S#', '#.#', '#G#']);
  ok(near(MD.evaluate(MD.transform(sym, 'rot180')).score, MD.evaluate(sym).score), '对称走廊转 180° 分数不变');
}

console.log('\n[3] 迭代生成器');
{
  const iters = 40, K0 = 9;
  const seq = Array.from({ length: iters }, (_, i) => EV.budgetAt(K0, iters, i));
  ok(seq[0] === K0, '第一次迭代改动 K0 格', seq[0]);
  ok(seq[iters - 1] === 1, '最后一次只改 1 格', seq[iters - 1]);
  ok(seq.every((v, i) => i === 0 || v <= seq[i - 1]), '改动格数单调不增', seq);

  const base = EV.makePerfect(15, 15);
  ok(EV.connected(base), '完美迷宫底图连通');
  let open = 0; for (const v of base.wall) if (!v) open++;
  ok(open > 40, '底图有通路', open);

  // 网格 → 块 → 网格：往返后墙一模一样（生成器写关卡 / 读关卡都靠这个）
  const pieces = EV.wallsToPieces(base);
  const lv = {
    w: base.w, h: base.h,
    goals: [{ piece: 'hero', cells: [[base.goal % base.w, (base.goal / base.w) | 0]] }],
    pieces: [{ id: 'hero', x: base.start % base.w, y: (base.start / base.w) | 0, ori: 0, shape: '1x1', hero: true }, ...pieces],
  };
  const back = MD.fromLevel(lv);
  let diff = 0;
  for (let i = 0; i < base.wall.length; i++) if (base.wall[i] !== back.wall[i]) diff++;
  ok(diff === 0, '网格 → 块 → 网格 往返不变（' + pieces.length + ' 块）', diff);
  ok(back.start === base.start && back.goal === base.goal, '起点 / 终点往返不变', [back.start, back.goal]);

  const ev = MD.evaluate(back);
  ok(ev.paths === 1 && ev.exact, '完美迷宫只有 1 条通关路径', [ev.paths, ev.exact]);

  /* 全连通：所有通路格都要能从起点走到（只看起点→终点会允许封印半块棋盘） */
  const ring = EV.makeRing(21, 21);
  ok(EV.allReachable(ring), '回型底图全连通');
  // 造一个"不可达"：把起点本身封成墙（任何变体都该被拒）
  const s2 = EV.clone(ring);
  let openCell = -1;
  for (let i = 0; i < s2.wall.length; i++) if (!s2.wall[i]) { openCell = i; break; }
  s2.wall[openCell] = 1;                       // 封掉起点本身 → 必然不连通
  ok(!EV.allReachable(s2), '封掉起点 → 判为不连通', openCell);
}

console.log('\n[7] 反向可达剪枝：不贡献通关路径的区域不参与枚举（分数不变）');
{
  /* 一条直走廊 + 右侧一团和主路不连通的 2×2 环路。
   * 那 4 格既到不了终点、也不在任何通关路径上，枚举时不该被展开 ——
   * 展开的话「环路多、唯一解」的盘面会指数爆炸（实测 21×21 有一版吃 200 万节点）。 */
  const withLoop = MD.parseAscii([
    '#####',
    '#S.G#',
    '###.#',
    '#.#.#',
    '#...#',
  ]);
  const noLoop = MD.parseAscii([
    '#####',
    '#S.G#',
    '#####',
    '#####',
    '#####',
  ]);
  const a = MD.evaluate(withLoop), b = MD.evaluate(noLoop);
  ok(a.paths === 1 && a.exact, '旁边挂着环路也不影响路径条数', a.paths);
  ok(near(a.score, b.score, 1e-12), '环路区域不影响分数（剪枝不改结果）', [a.score, b.score]);
  ok(a.nodes < 60, '不展开到不了终点的格子（节点数 ' + a.nodes + '）', a.nodes);
}

console.log('\n[8] 结构算子：挖支路不破坏全可达（这才是它命中率 100% 的原因）');
{
  const base = EV.makeRing(21, 21);
  let good = 0, carved = 0, added = 0;
  for (let t = 0; t < 30; t++) {
    const m = EV.clone(base);
    const before = m.wall.length - m.wall.reduce((x, y) => x + y, 0);
    const n = EV.carveSpur(m, 1 + (t % 12), t % 5 === 0);
    const after = m.wall.length - m.wall.reduce((x, y) => x + y, 0);
    added += n;
    if (n > 0) { carved++; if (after > before && EV.allReachable(m)) good++; }
  }
  ok(carved >= 24, '30 次里有 ' + carved + ' 次真的挖出了通路（少数起点三面都是通路，挖不动）', carved);
  ok(good === carved, '挖成功的每一次都保持全可达（开洞只接不切）', [good, carved]);
  ok(added > 60, '确实挖出了通路（共 ' + added + ' 格）', added);
}

console.log('\n[9] 多层深度偏好：同样格数，嵌套的岔路比分叉点平铺更难');
{
  /* 两个手搭的盘面，主路都是 y=1 上 x=1..7，岔路总格数都是 8：
   *   flat   ：两个独立的 4 格竖死路（都在第 1 层）
   *   nested ：一条竖岔路 → 在第 2 层分成 3 格 + 2 格（岔路中的岔路）
   * 深度权重 depthW(L)=1+0.25(L-1) 让 nested 明显更高。 */
  const build = (cells, w, h) => {
    const wall = new Uint8Array(w * h).fill(1);
    for (let x = 1; x <= 7; x++) wall[1 * w + x] = 0;      // 主路
    for (const [x, y] of cells) wall[y * w + x] = 0;
    return { w, h, wall, start: 1 * w + 1, goal: 1 * w + 7 };
  };
  const flatCells = [[2, 2], [2, 3], [2, 4], [2, 5], [4, 2], [4, 3], [4, 4], [4, 5]];
  const nestCells = [[2, 2], [2, 3], [3, 3], [4, 3], [5, 3], [3, 4], [3, 5], [5, 4]];
  const flat = build(flatCells, 9, 7), nest = build(nestCells, 9, 7);
  const openOf = m => m.wall.length - m.wall.reduce((a, b) => a + b, 0);
  ok(openOf(flat) === openOf(nest), '两个盘面开放格数相同（' + openOf(flat) + '）', [openOf(flat), openOf(nest)]);
  const fa = MD.evaluate(flat, { stats: true });
  const ne = MD.evaluate(nest, { stats: true });
  ok(fa.paths === 1 && ne.paths === 1, '都是唯一解', [fa.paths, ne.paths]);
  ok(ne.score > fa.score, '嵌套岔路 > 平铺岔路（' + fa.score.toFixed(1) + ' → ' + ne.score.toFixed(1) + '）', [fa.score, ne.score]);
  ok(ne.stats.maxLevel >= 2 && fa.stats.maxLevel === 1, 'nested 真的长到了第 2 层', [fa.stats.maxLevel, ne.stats.maxLevel]);
  ok(Math.abs(MD.depthW(1) - 1) < 1e-12 && MD.depthW(3) > MD.depthW(2), 'depthW 逐层递增且第 1 层为 1', [MD.depthW(1), MD.depthW(2), MD.depthW(3)]);
  ok(MD.MAX_LEVEL >= 5, '递归上限已放宽到 ' + MD.MAX_LEVEL + ' 层', MD.MAX_LEVEL);
}

console.log('\n[10] 新底图（竖纹 / 斜纹 / 棋盘 / 噪声）repair 后全可达');
{
  for (const [name, gen] of [['竖纹', EV.makeVStripe], ['斜纹', EV.makeDStripe], ['棋盘', EV.makeChecker], ['噪声', EV.makeNoise]]) {
    const m = gen(21, 21);
    const open0 = m.wall.length - m.wall.reduce((a, b) => a + b, 0);
    const okRepair = EV.repair(m);
    ok(okRepair && EV.allReachable(m), name + ' 底图 repair 后全可达', [okRepair, open0]);
  }
}

console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed' : 'ALL PASS  ' + pass + ' passed, 0 failed'));
process.exit(fail ? 1 : 0);
