/* 最短路径条数：正确性验证（组合数 + 分层 DP 对拍） */
const K = require('../sofa-klotski.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

const one = (x, y) => ({ id: 'a', x, y, w: 1, h: 1 });
const analyze = (raw, goal) => {
  const L = K.parse(raw), st = K.initialState(raw);
  return { r: K.analyze(L, st, goal, { maxNodes: 300000 }), L, st };
};

/** 分层 DP（与引擎的“发现即累加”是两种独立实现）：cnt[v] = Σ 上一层前驱的 cnt */
function layeredCount(raw, goal) {
  const L = K.parse(raw), st = K.initialState(raw);
  // 目标不同的同形块不能互换，否则 (a 到位 & b 没到位) 会被并成同一个抽象状态
  const tag = new Array(L.pieces.length).fill('');
  (Array.isArray(goal) ? goal : [goal]).forEach(g => {
    if (!g) return;
    const i = typeof g.piece === 'number' ? g.piece : L.pieces.findIndex(p => p.id === g.piece);
    if (i >= 0) tag[i] += JSON.stringify(g.cells || 'bottom');
  });
  const keyOf = K.makeKeyer(L, tag);
  const dist = new Map([[keyOf(st), 0]]);
  const seen = new Map([[keyOf(st), st]]);
  const layers = [[keyOf(st)]];
  for (let d = 0; d < layers.length; d++) {
    const next = [];
    for (const k of layers[d]) {
      const s = seen.get(k);
      for (const mv of K.moves(L, s)) {
        const ns = K.apply(s, mv), nk = keyOf(ns);
        if (dist.has(nk)) continue;
        dist.set(nk, d + 1); seen.set(nk, ns); next.push(nk);
      }
    }
    if (next.length) layers.push(next);
    if (dist.size > 300000) return null;
  }
  // 把“达成”的所有状态按层收好（goal 可能是数组 → 全部满足才算达成）
  const isG = s => K.isGoal(L, s, goal);
  const depth = dist.size && [...dist].filter(([k, d]) => isG(seen.get(k))).reduce((m, [, d]) => (m < 0 || d < m ? d : m), -1);
  if (depth < 0) return null;
  const cnt = new Map();
  for (const k of layers[0]) cnt.set(k, 1);
  // 整层收集完再一次性把贡献推给下一层（引擎是「发现即累加」，这里的顺序与结构都不同）
  for (let d = 1; d <= depth; d++) {
    for (const v of layers[d]) cnt.set(v, 0);
    for (const u of layers[d - 1]) {
      const su = seen.get(u), cu = cnt.get(u) || 0;
      if (!cu) continue;
      for (const mv of K.moves(L, su)) {
        const nk = keyOf(K.apply(su, mv));
        if (dist.get(nk) === d) cnt.set(nk, (cnt.get(nk) || 0) + cu);
      }
    }
  }
  let total = 0;
  for (const k of layers[depth]) if (isG(seen.get(k))) total += cnt.get(k) || 0;
  return { depth, paths: total, states: dist.size };
}

console.log('[1] 无障碍盘：路径数应等于组合数 C(n, k)');
{
  // 3×3，单块 (0,0) -> (2,2)：4 步里选 2 步向右 = 6
  const { r } = analyze({ w: 3, h: 3, pieces: [one(0, 0)] }, { piece: 'a', cells: [[2, 2]] });
  console.log('     3x3 单块: 深度 ' + r.depth + ' / 路径 ' + r.paths);
  ok(r.depth === 4 && r.paths === 6, '3×3 → 4 步 / C(4,2)=6 条', [r.depth, r.paths]);
  // 4×4，(0,0) -> (3,3)：6 步里选 3 步向右 = 20
  const a2 = analyze({ w: 4, h: 4, pieces: [one(0, 0)] }, { piece: 'a', cells: [[3, 3]] });
  console.log('     4x4 单块: 深度 ' + a2.r.depth + ' / 路径 ' + a2.r.paths);
  ok(a2.r.paths === 20, '4×4 → C(6,3)=20 条', a2.r.paths);
  // 5×5，(0,0) -> (4,4)：8 步里选 4 = 70
  const a3 = analyze({ w: 5, h: 5, pieces: [one(0, 0)] }, { piece: 'a', cells: [[4, 4]] });
  ok(a3.r.depth === 8 && a3.r.paths === 70, '5×5 → C(8,4)=70 条', [a3.r.depth, a3.r.paths]);
}

console.log('\n[2] 有障碍 / 多块：与分层 DP 对拍');
const cases = [
  ['3×3 两块', { w: 3, h: 3, pieces: [one(0, 0), { id: 'b', x: 2, y: 2, w: 1, h: 1 }] }, { piece: 'a', cells: [[2, 1]] }],
  ['4×4 三块', { w: 4, h: 4, pieces: [one(0, 0), { id: 'b', x: 1, y: 1, w: 1, h: 1 }, { id: 'c', x: 3, y: 3, w: 1, h: 1 }] }, { piece: 'a', cells: [[3, 0]] }],
  ['4×4 2×2+1×2', { w: 4, h: 4, pieces: [
    { id: 'a', x: 0, y: 0, w: 2, h: 2 }, { id: 'b', x: 2, y: 0, w: 1, h: 2 }, { id: 'c', x: 3, y: 0, w: 1, h: 1 }] },
    { piece: 'a', cells: [[2, 2], [3, 2], [2, 3], [3, 3]] }],
  ['4×4 两目标', { w: 4, h: 4, pieces: [one(0, 0), { id: 'b', x: 3, y: 3, w: 1, h: 1 }] },
    [{ piece: 'a', cells: [[2, 2]] }, { piece: 'b', cells: [[0, 3]] }]]
];
for (const [tag, raw, goal] of cases) {
  const { r } = analyze(raw, goal);
  const ref = layeredCount(raw, goal);
  console.log('     ' + tag + ': 引擎 ' + r.depth + ' 步/' + r.paths + ' 条 · 分层DP ' +
    (ref ? ref.depth + ' 步/' + ref.paths + ' 条' : '—'));
  ok(!!ref, tag + ' 分层 DP 能算出来', ref);
  if (ref) {
    ok(r.depth === ref.depth, tag + ' 深度一致', [r.depth, ref.depth]);
    ok(r.paths === ref.paths, tag + ' 路径条数一致', [r.paths, ref.paths]);
  }
}

console.log('\n[3] 多目标 + 同形块：路径数很大，且两种实现一致');
{
  // 4×4 里 4 个 1×1 各归其位（同形块有不同目标 → 必须带 tag 分组）
  const cells = [[0, 0], [1, 0], [2, 0], [3, 0]];
  const raw = {
    name: 'quad', w: 4, h: 4,
    pieces: cells.map(([x, y], i) => ({ id: 'n' + (i + 1), x, y, w: 1, h: 1 })),
    goals: cells.map(([x, y], i) => ({ piece: 'n' + (i + 1), cells: [[x, 2 + (i >> 2)]] }))
  };
  // 目标：1/2 到第 2 行、3/4 到第 3 行（都要走 2 步，互相让路）
  const { r } = analyze(raw, raw.goals);
  console.log('     深度 ' + r.depth + ' / 状态 ' + r.states + ' / 路径 ' + r.paths);
  ok(r.depth > 0 && r.paths > 0, '给出路径数', [r.depth, r.paths]);
  ok(Number.isFinite(r.paths), '没有溢出成 Infinity', r.paths);
  const ref = layeredCount(raw, raw.goals);
  if (ref) {
    console.log('     分层 DP: 深度 ' + ref.depth + ' / 路径 ' + ref.paths);
    ok(ref.depth === r.depth && ref.paths === r.paths, '两种实现结果一致', [r.paths, ref.paths]);
  } else {
    ok(false, '分层 DP 能算出来');
  }
}

console.log('\n[4] 精度：超过 2^53 之后 Number 只能近似');
{
  const BIG = 2 ** 53;
  console.log('     2^53 = ' + BIG + '；在其上加 1 得 ' + (BIG + 1) + '（没有变化 → 说明超出即丢精度）');
  ok(BIG + 1 === BIG, '2^53+1 无法表示（这就是 4.5e62 末尾一堆 0 的原因）');
  ok(Number.isSafeInteger(Number('451386874160920000000000000000000000000000000000000000000000000')) === false,
    '用户那个 63 位数不是安全整数');
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
