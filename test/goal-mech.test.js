/* 目标新机制（引擎层）：空格目标 / 多落点 / 成组（任一·全部可换位）
 *   node test/goal-mech.test.js
 *
 * 只用引擎，不开浏览器：判定、匹配、状态指纹对称化、求解、启发式、文案。
 */
const K = require('../sofa-klotski.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b });

/* 3×1 的跑道上摆 3 个 1×1 —— 只够验判定 */
const flat = {
  name: 'flat', w: 3, h: 1,
  pieces: [
    { id: 'a', x: 0, y: 0, shape: '1x1', name: 'A' },
    { id: 'b', x: 1, y: 0, shape: '1x1', name: 'B' },
    { id: 'c', x: 2, y: 0, shape: '1x1', name: 'C' }
  ]
};
const LF = K.parse(flat);
const pos = o => LF.pieces.map(p => ({ x: o[p.id][0], y: o[p.id][1], ori: 0 }));
const S1 = pos({ a: [0, 0], b: [1, 0], c: [2, 0] });
const S2 = pos({ a: [1, 0], b: [0, 0], c: [2, 0] });

console.log('\n[1] 老写法：某块 → 一个格位');
ok(K.goalOne(LF, S1, { piece: 'a', cells: [[0, 0]] }) === true, 'A 在 (0,0) 时达成');
ok(K.goalOne(LF, S1, { piece: 'a', cells: [[1, 0]] }) === false, 'A 不在 (1,0) 时不达成');
ok(K.goalOne(LF, S1, { piece: 0, cells: [[0, 0]] }) === true, 'piece 也可以写下标');

console.log('\n[2] 某块 → 多个落点之一');
const twoSpots = { piece: 'a', spots: [[[0, 1]], [[0, 0]]] };
ok(K.goalOne(LF, S1, twoSpots) === true, '(0,0) 是第二个落点 → 达成');
ok(K.goalOne(LF, S2, { piece: 'a', spots: [[[0, 0]], [[2, 0]]] }) === false, '两个落点都不在 → 不达成');
eq(K.goalNorm(LF, twoSpots).spots.length, 2, '规范化后是 2 个落点');
eq(K.goalText(LF, twoSpots), 'A → 2 个落点之一', '多落点文案');

console.log('\n[3] 空格目标');
ok(K.goalOne(LF, pos({ a: [0, 0], b: [1, 0], c: [1, 0] }), { empty: [[2, 0]] }) === true,
  '第三格确实空着 → 达成');
ok(K.goalOne(LF, S1, { empty: [[2, 0]] }) === false, '第三格被 C 占着 → 不达成');
ok(K.goalOne(LF, S1, { empty: [[0, 0], [2, 0]] }) === false, '要求两格空、实际都占着 → 不达成');
eq(K.goalText(LF, { empty: [[0, 0], [2, 0]] }), '空格 2 格', '空格目标的文案');
eq(K.goalProgress(LF, pos({ a: [0, 0], b: [1, 0], c: [1, 0] }), { empty: [[2, 0], [0, 0]] }),
  { kind: 'empty', got: 1, need: 2 }, '空格目标能数出"已空几格"');

console.log('\n[4] 几块里「至少一块」到位');
const anyGoal = { pieces: ['a', 'b'], spots: [[[0, 0]], [[1, 0]]], need: 'any' };
ok(K.goalOne(LF, S1, anyGoal) === true, 'A 在第一落点 → 达成');
ok(K.goalOne(LF, S2, anyGoal) === true, '换成 B 在第一落点 → 一样达成（不认具体哪块）');
ok(K.goalOne(LF, pos({ a: [1, 0], b: [1, 0], c: [2, 0] }), { pieces: ['a', 'b'], spots: [[[0, 0]]], need: 'any' }) === false,
  '两块都不在落点 → 不达成');
eq(K.goalNorm(LF, anyGoal).need, 1, 'need=any 规范化成"只要 1 块"');
eq(K.goalText(LF, anyGoal), '任一：A／B → 2 个落点', '成组·任一 的文案');

console.log('\n[5] 几块「全都」到位（位置可换）');
const allGoal = { pieces: ['a', 'b'], spots: [[[0, 0]], [[1, 0]]], need: 'all' };
ok(K.goalOne(LF, S1, allGoal) === true, 'A→左、B→中，各就各位');
ok(K.goalOne(LF, S2, allGoal) === true, '两块互换位置，同样算达成（位置可换）');
ok(K.goalOne(LF, pos({ a: [0, 0], b: [2, 0], c: [1, 0] }), allGoal) === false,
  '只有 A 在落点、B 跑到落点外 → 不达成');
ok(K.goalOne(LF, S1, { pieces: ['a', 'b'], spots: [[[0, 0]]], need: 'all' }) === false,
  '落点只有 1 个却要 2 块 → 永远达不成');
eq(K.goalNorm(LF, allGoal).need, 2, 'need=all 规范化成"要满员"');
eq(K.goalText(LF, allGoal), '全部：A／B → 2 个落点', '成组·全部 的文案');

console.log('\n[6] 三块轮换：匹配是"座位不重复"，不是逐块对格');
const rot3 = { pieces: ['a', 'b', 'c'], spots: [[[0, 0]], [[1, 0]], [[2, 0]]], need: 'all' };
let permHit = 0, permAll = 0;
for (const pa of [0, 1, 2]) for (const pb of [0, 1, 2]) for (const pc of [0, 1, 2]) {
  if (new Set([pa, pb, pc]).size !== 3) continue;
  permAll++;
  if (K.goalOne(LF, pos({ a: [pa, 0], b: [pb, 0], c: [pc, 0] }), rot3)) permHit++;
}
ok(permAll === 6 && permHit === 6, '6 种排列全部达成', { permAll, permHit });

console.log('\n[7] 同一组的同形块在状态指纹里对称（否则"位置可换"会把状态数乘 3!）');
const own3 = [{ piece: 'a', cells: [[0, 0]] }, { piece: 'b', cells: [[1, 0]] }, { piece: 'c', cells: [[2, 0]] }];
const kGroup = K.makeKeyer(LF, K.tagsFor(LF, [rot3]));
const kOwn = K.makeKeyer(LF, K.tagsFor(LF, own3));
ok(kGroup(S1) === kGroup(S2), '成组目标下，互换两块 → 同一个指纹');
ok(kOwn(S1) !== kOwn(S2), '各归各位时，互换两块 → 指纹不同');

/* 2×2 三块 + 1 空格：真正的滑动棋盘，用来验求解 */
const LB = K.parse({
  name: 'box', w: 2, h: 2,
  pieces: [
    { id: 'a', x: 0, y: 0, shape: '1x1', name: 'A' },
    { id: 'b', x: 1, y: 0, shape: '1x1', name: 'B' },
    { id: 'c', x: 0, y: 1, shape: '1x1', name: 'C' }
  ]
});
const startB = K.initialState({ pieces: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] });
const replay = (r) => {
  let s = startB;
  for (const m of r.moves) s = K.apply(s, m);
  return s;
};

console.log('\n[8] 求解器认这些目标：解出来的终局确实满足 isGoal');
{
  const goals = [{ empty: [[1, 1]] }, { piece: 'a', spots: [[[1, 1]], [[0, 1]]] }];
  const r = K.solve(LB, startB, goals, { maxNodes: 200000 });
  ok(r.ok === true, '空格 + 多落点 有解', r.reason || (r.moves && r.moves.length));
  ok(K.isGoal(LB, replay(r), goals), '按解法走完真的达成目标');
}
{
  const goals = [{ pieces: ['a', 'b', 'c'], spots: [[[0, 0]], [[1, 1]], [[0, 1]]], need: 'all' },
    { empty: [[1, 0]] }];
  const r = K.solve(LB, startB, goals, { maxNodes: 200000 });
  ok(r.ok === true, '成组 + 空格 组合目标有解', r.reason);
  const s2 = replay(r);
  ok(K.isGoal(LB, s2, goals), '终局达成成组 + 空格目标');
  ok(K.cellFree(LB, s2, 1, 0), '(1,0) 确实空着');
}
{
  const goals = [{ pieces: ['a', 'b'], spots: [[[0, 0]]], need: 'all' }];
  const r = K.solve(LB, startB, goals, { maxNodes: 4000 });
  ok(r.ok === false && r.reason === 'unsolvable', '落点不够的成组目标判为无解', r.reason);
}
{
  const goals = [{ pieces: ['a', 'b', 'c'], spots: [[[0, 0]], [[1, 1]], [[0, 1]]], need: 'all' }];
  const r = K.solve(LB, startB, goals, { maxNodes: 200000 });
  ok(r.ok === true, '「三块随便换位」也有解', r.reason);
  ok(K.isGoal(LB, replay(r), goals), '终局三块都在座位表里');
  const g0 = goals[0];
  ok(K.goalProgress(LB, startB, g0).got >= 1, '进度能数出"已经有几块到位"',
    K.goalProgress(LB, startB, g0));
}

console.log('\n[9] 启发式 / 难度分析不会因为这些目标炸掉');
{
  const goals = [{ pieces: ['a', 'b'], spots: [[[0, 0]], [[1, 1]]], need: 'any' }, { empty: [[1, 0]] }];
  // 「任一就位」= 只要一块到位；起手 a 就在 (0,0)，距离必须是 0。
  // 旧实现取「最远的那一块」会报 1，等于把已达成的目标当成还差一步。
  ok(K.heuristic(LB, startB, goals) === 0, '任一就位：已有一块在落点 → 启发式 0');
  const none = K.initialState({ pieces: [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }] });
  ok(K.heuristic(LB, none, goals) > 0, '两块都不在落点 → 启发式为正');
  const a = K.analyze(LB, startB, goals, { maxNodes: 5000 });
  ok(a && a.states > 0, 'analyze 跑得动', a && a.states);
  ok(a.depth > 0 || a.estimate, '拿到了深度或参考解');
  const d = K.difficulty(a);
  ok(d && typeof d.score === 'number', 'difficulty 有分', d && d.score);
}

console.log('\n[10] 老目标文案不变、坏目标不崩');
eq(K.goalText(LF, { piece: 'a', cells: [[0, 0]] }), 'A → (0,0)', '单点文案');
eq(K.goalText(LF, { piece: 'a', cells: [[0, 0]], label: '左上角' }), 'A → 左上角', '有 label 时用它');
eq(K.goalText(LF, { piece: 'zzz', cells: [[0, 0]] }), '（无效目标）', '块不存在 = 无效目标');
ok(K.goalOne(LF, S1, null) === false, 'null 目标不崩');
ok(K.goalOne(LF, S1, { empty: [] }) === false, '空的空格目标不算达成');
eq(K.goalText(LF, { empty: [] }), '空格 · 待选格', '还没选格的空格目标不显示「（无效目标）」');

console.log('\n[11] 两条成组目标：对称标签不能串组（回归：BFS 曾把 2 步有解判成无解）');
{
  const P2 = {
    name: 'twoGroups', w: 3, h: 2,
    pieces: [
      { id: 'a', x: 2, y: 1, shape: '1x1' }, { id: 'b', x: 1, y: 1, shape: '1x1' },
      { id: 'c', x: 0, y: 0, shape: '1x1' }, { id: 'd', x: 1, y: 0, shape: '1x1' }
    ]
  };
  const LG = K.parse(P2), SG = K.initialState(P2);
  const spots = [[[0, 0]], [[1, 0]]];
  const G2 = [
    { pieces: ['a', 'b'], spots, need: 'any' },
    { pieces: ['c', 'd'], spots, need: 'any' }
  ];
  const tags = K.tagsFor(LG, G2);
  ok(tags[0] === tags[1] && tags[2] === tags[3] && tags[0] !== tags[2],
    '组内共享标签、组间标签不同（落点和 need 一样也不能混成一组）', tags);
  const key2 = K.makeKeyer(LG, tags);
  const sw = SG.map(p => ({ ...p }));
  const tmp = sw[0]; sw[0] = { ...sw[2] }; sw[2] = { ...tmp };
  ok(key2(SG) !== key2(sw), '跨组互换两块 → 指纹必须不同');

  // 不带任何对称化的参考 BFS：真实最短是 2 步
  const plain = s => s.map(p => p.x + ',' + p.y + ',' + p.ori).join('|');
  const q = [SG], seen = new Set([plain(SG)]), dist = new Map([[plain(SG), 0]]);
  let real = -1, head = 0;
  while (head < q.length) {
    const s = q[head++], d = dist.get(plain(s));
    if (K.isGoal(LG, s, G2)) { real = d; break; }
    for (const m of K.moves(LG, s, K.grid(LG, s))) {
      const n = K.apply(s, m), k = plain(n);
      if (seen.has(k)) continue;
      seen.add(k); dist.set(k, d + 1); q.push(n);
    }
  }
  const r = K.solve(LG, SG, G2, { maxNodes: 100000 });
  ok(real === 2 && r.ok === true && r.moves.length === 2,
    '引擎最短解 == 参考 BFS 的 2 步（旧实现误报 unsolvable）',
    { real, got: r.ok ? r.moves.length : r.reason });
  let fin = SG;
  for (const m of (r.moves || [])) fin = K.apply(fin, m);
  ok(K.isGoal(LG, fin, G2), '按解法走完两条成组目标都达成');
}

console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed' : 'ALL PASS  ' + pass + ' passed, 0 failed'));
process.exit(fail ? 1 : 0);
