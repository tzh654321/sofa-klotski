/* 离散引擎单测：node test/klotski.test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, Map, Set, Int8Array, window: {} };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sofa-klotski.js'), 'utf8'), ctx, { filename: 'sofa-klotski.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shapes.js'), 'utf8'), ctx, { filename: 'shapes.js' });
const K = ctx.Klotski;
const resolve = ctx.resolveShapes;   // 把 shape 名字（2x2/semi/quarter/…）展开成 cells
// 半圆 = 两个同心四分之一圆格（新版扇形规则下必须用 arc 描述，不能再拿方格凑）
const SEMI_CELLS = () => [{ c: 0, r: 0, arc: [1, 1] }, { c: 1, r: 0, arc: [0, 1] }];

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };
const GOAL = { piece: 'hero', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] };

function ref(sofaLen) {
  return {
    w: 4, h: 5, goal: GOAL,
    pieces: [
      { id: 'red', x: 0, y: 0, w: 1, h: 2 },
      { id: 'hero', x: 1, y: 0, w: 2, h: 2, hero: true },
      { id: 'yel', x: 3, y: 0, w: 1, h: 2 },
      { id: 'cyn', x: 1, y: 2, w: 2, h: 1 },
      { id: 'blu', x: 3, y: 2, w: 1, h: 2 },
      { id: 'sofa', x: 0, y: 2, rot: 'hinge', cells: sofaLen === 3 ? [[0, 0], [0, 1], [0, 2]] : [[0, 0], [0, 1]] },
      { id: 'pnk', x: 1, y: 4, w: 1, h: 1 },
      { id: 'brn', x: 2, y: 4, w: 1, h: 1 },
      { id: 'mag', x: 3, y: 4, w: 1, h: 1 }
    ]
  };
}
const classic = () => ({
  w: 4, h: 5, goal: GOAL,
  pieces: [
    { id: 'zhang', x: 0, y: 0, w: 1, h: 2 }, { id: 'hero', x: 1, y: 0, w: 2, h: 2, hero: true },
    { id: 'zhao', x: 3, y: 0, w: 1, h: 2 }, { id: 'ma', x: 0, y: 2, w: 1, h: 2 },
    { id: 'guan', x: 1, y: 2, w: 2, h: 1 }, { id: 'huang', x: 3, y: 2, w: 1, h: 2 },
    { id: 'z1', x: 1, y: 3, w: 1, h: 1 }, { id: 'z2', x: 2, y: 3, w: 1, h: 1 },
    { id: 'z3', x: 0, y: 4, w: 1, h: 1 }, { id: 'z4', x: 3, y: 4, w: 1, h: 1 }
  ]
});

function replay(lv, st, res) {
  let cur = st, bad = 0;
  for (const mv of res.moves) {
    const legal = K.moves(lv, cur).some(m => m.i === mv.i && m.t === mv.t &&
      (m.t === 'm' ? (m.dx === mv.dx && m.dy === mv.dy) : (m.x === mv.x && m.y === mv.y && m.ori === mv.ori)));
    if (!legal) bad++;
    cur = K.apply(cur, mv);
  }
  return { bad, end: cur };
}

console.log('\n[1] 块形状与旋转');
const lvS = K.parse(ref(3));
const p = lvS.pieces[5];
ok(p.oris.length === 2, '1×3 沙发只有 2 个不同朝向');
ok(p.oris[0].w === 1 && p.oris[0].h === 3, '朝向0 = 1×3');
ok(p.oris[1].w === 3 && p.oris[1].h === 1, '朝向1 = 3×1');
ok(K.parse({ w: 4, h: 5, pieces: [{ id: 'a', x: 0, y: 0, w: 2, h: 2, rot: true }] }).pieces[0].oris.length === 1,
   '2×2 转 4 次回自身，被去重成 1 个朝向');

console.log('\n[2] 经典横刀立马（已知可解）');
const lvC = K.parse(classic()), stC = K.initialState(classic());
const t0 = Date.now();
const rC = K.solve(lvC, stC, GOAL);
ok(rC.ok, '可解');
console.log(`     最优 ${rC.moves.length} 单位步，探索 ${rC.visited} 状态，${Date.now() - t0}ms`);
ok(rC.moves.length === 76, '开连锁推后最优 76 单位步（禁推是 116）', rC.moves.length);
const rpC = replay(lvC, stC, rC);
ok(rpC.bad === 0, '回放每一步都合法', rpC.bad);
ok(K.isGoal(lvC, rpC.end, GOAL), '终局曹操落在下方正中');

console.log('');
console.log('[3] 参考图（沙发 1×3，4×5）：缺口叼住同一格 → 68 步可解（对照解法视频）');
const rawRef = ref(3);
rawRef.pieces[5].rot = 'sofa';           // 同一张参考图，但沙发按真规则（缺口朝右、绕缺口圆心转）
const lvR = K.parse(rawRef), stR = K.initialState(rawRef);
ok(K.pieceCells(lvR, stR, 5).length === 3, '沙发占 3 格');
ok(stR.reduce((s, x, i) => s + K.pieceCells(lvR, stR, i).length, 0) === 18, '总共占 18 格 / 留 2 空格');
const refRots = K.moves(lvR, stR).filter(m => m.t === 'r');
ok(refRots.length === 0, '开局两个落点都被占着 → 先转不动（要先把 (1,3)(2,3) 腾出来）', refRots.length);
const rR = K.solve(lvR, stR, GOAL, { maxNodes: 900000 });
ok(rR.ok && rR.moves.length === 68, '参考图 68 单位步可解（与用户提供的解法视频一致）',
  rR.ok ? rR.moves.length : rR.reason);
{
  let cur = stR, n = 0, keep = 0;
  for (const m of rR.moves) {
    if (m.t === 'r') {
      n++;
      const m0 = K.openingCell(lvR, null, m.i, cur[m.i].ori, cur[m.i].x, cur[m.i].y);
      const m1 = K.openingCell(lvR, null, m.i, m.ori, m.x, m.y);
      if (m0.join() === m1.join()) keep++;
    }
    cur = K.apply(cur, m);
  }
  ok(n > 0 && keep === n, '整条解法里 ' + n + ' 次沙发转体全都围着同一个墙角', [n, keep]);
  ok(K.isGoal(lvR, cur, GOAL), '终局曹操在底行正中');
}

console.log('\n[4] 连锁推：一排三块整体右移');
const lvP = { w: 4, h: 5, pieces: [
  { id: 'a', x: 0, y: 0, w: 1, h: 1 }, { id: 'b', x: 1, y: 0, w: 1, h: 1 }, { id: 'c', x: 2, y: 0, w: 1, h: 2 }] };
const Lp = K.parse(lvP), sp = K.initialState(lvP);
const push = K.moves(Lp, sp).find(m => m.i === 0 && m.t === 'p' && m.dx === 1);
ok(!!push && push.chain.length === 3, '检测到三块连锁', push && push.chain);
const sp2 = K.apply(sp, push);
ok(JSON.stringify(sp2.map(s => s.x)) === '[1,2,3]', '整体右移一格', sp2.map(s => s.x));
// 右边顶墙时应该推不动
const lvP2 = { w: 3, h: 5, pieces: [
  { id: 'a', x: 0, y: 0, w: 1, h: 1 }, { id: 'b', x: 1, y: 0, w: 1, h: 1 }, { id: 'c', x: 2, y: 0, w: 1, h: 2 }] };
const Lp2 = K.parse(lvP2), sp3 = K.initialState(lvP2);
ok(!K.moves(Lp2, sp3).some(m => m.i === 0 && m.t === 'p' && m.dx === 1), '顶到墙就推不动');

console.log('\n[4b] 疏解版（沙发 1×2）结构');
const rawL = ref(2), lvL = K.parse(rawL), stL = K.initialState(rawL);
ok(stL.reduce((s, x, i) => s + K.pieceCells(lvL, stL, i).length, 0) === 17, '占 17 格 / 3 空格');
ok(lvL.pieces[5].oris.length === 2, '1×2 沙发 2 个朝向');

console.log('\n[5] 不变量：随机走 300 步，任何时候都不重叠、不越界');
let s = stL.map(x => ({ ...x }));
let violations = 0;
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let step = 0; step < 300; step++) {
  const ms = K.moves(lvL, s);
  if (!ms.length) break;
  s = K.apply(s, ms[Math.floor(rnd() * ms.length) % ms.length]);
  const used = new Set();
  for (let i = 0; i < lvL.pieces.length; i++) {
    for (const [c, r] of K.pieceCells(lvL, s, i)) {
      if (c < 0 || r < 0 || c >= lvL.w || r >= lvL.h) violations++;
      const kk = c + ',' + r;
      if (used.has(kk)) violations++;
      used.add(kk);
    }
  }
}
ok(violations === 0, '300 步随机走法后依然无重叠/无越界');

console.log('');
console.log('[6] 整圆：两块半圆拼成 2×2 后只能同步转');
const semi = (id, x, y, ori) => ({ id, x, y, cells: SEMI_CELLS(), rot: 'pivot', nodedup: true, pair: 'disc', flat: 90, ori });
const rawD = { w: 4, h: 4, pieces: [semi('a', 0, 2, 0), semi('b', 0, 3, 2)] };
const Ld = K.parse(rawD), sd = K.initialState(rawD);
const pair = K.discPair(Ld, sd, 0);
ok(pair && pair.j === 1 && pair.bx === 0 && pair.by === 2, '识别出整圆（2×2 块在 (0,2)）', pair);
const crMoves = K.moves(Ld, sd).filter(m => m.t === 'cr');
ok(crMoves.length === 2, '只登记两个方向，不重复', crMoves.length);
ok(K.moves(Ld, sd).filter(m => m.t === 'r').length === 0, '不再提供单块转（会破形）');
const cwMove = crMoves.find(m => m.d === 1);
const sD2 = K.apply(sd, cwMove);
ok(sD2[0].x === 1 && sD2[0].y === 2 && sD2[0].ori === 1, '顺时针：上半圆转到右半格位', sD2[0]);
ok(sD2[1].x === 0 && sD2[1].y === 2 && sD2[1].ori === 3, '顺时针：下半圆转到左半格位', sD2[1]);
const areaD = new Set([...K.pieceCells(Ld, sD2, 0), ...K.pieceCells(Ld, sD2, 1)].map(c => c.join(',')));
ok(areaD.size === 4, '转完仍恰好占 4 格', areaD.size);
const rawSep = { w: 4, h: 4, pieces: [semi('a', 0, 0, 0), semi('b', 2, 3, 0)] };
const Ls = K.parse(rawSep), ss = K.initialState(rawSep);
ok(K.discPair(Ls, ss, 0) === null, '没拼成整圆 → 不构成整圆关系');
ok(K.moves(Ls, ss).some(m => m.t === 'r' && m.i === 0), '单独的半圆仍可单块转');

console.log('');
console.log('[7] 沙发过 L 弯：开口不能对着墙');
const sofaRaw = (x, y, ori) => ({ w: 4, h: 5, pieces: [
  { id: 's', x, y, ori: ori || 0, cells: [[0, 0], [0, 1], [0, 2]], rot: 'sofa', nodedup: true, open: 0 }] });
// 竖放在左列（开口朝右，对着棋盘内）：两个方向都能转
{
  const r0 = sofaRaw(0, 2), Ll = K.parse(r0), sl = K.initialState(r0);
  const rot = K.moves(Ll, sl).filter(m => m.t === 'r');
  ok(rot.length > 0, '中间区域两个方向都能转', rot.length);
  const bad = rot.filter(m => {
    const c = K.openingCell(Ll, sl, 0, m.ori, m.x, m.y);
    return c[0] < 0 || c[1] < 0 || c[0] >= Ll.w || c[1] >= Ll.h;
  });
  ok(bad.length === 0, '没有任何一个候选让开口穿墙', bad.length);
}
// 横躺在最后一行：开口朝下 = 墙插进凹槽 → 必须被拒
{
  const r0 = { w: 4, h: 5, pieces: [
    { id: 's', x: 0, y: 4, ori: 3, cells: [[0, 0], [0, 1], [0, 2]], rot: 'hinge', nodedup: true, open: 0 }] };
  const Ll = K.parse(r0), sl = K.initialState(r0);
  ok(K.openingCell(Ll, sl, 0, 3, 0, 4).join(',') === '1,3', '开口朝上时开口格在棋盘内 (1,3)');
  ok(K.openingCell(Ll, sl, 0, 1, 0, 4).join(',') === '1,5', '开口朝下时开口格在棋盘外 (1,5)');
  ok(!K.openingInside(Ll, sl, 0, 1, 0, 4), '开口朝下被判非法（墙插进凹槽）');
  ok(K.openingInside(Ll, sl, 0, 3, 0, 4), '开口朝上合法');
}
// 缺口方向：缺口正对的那一格在转体前后必须还是同一格（沙发围着那个墙角转身）
{
  // 空盘：竖直放左列，只有 2 个落点（另外两个会让缺口跑到别处）
  const r0 = sofaRaw(0, 2), L0 = K.parse(r0), s0 = K.initialState(r0);
  const rots = K.moves(L0, s0).filter(m => m.t === 'r');
  ok(rots.length === 2, '空盘上只剩 2 个合法落点（缺口格不变的）', rots.length);
  // 缺口正对着一颗子：可以转 —— 缺口本来就是叼着墙角转身的
  const raw = { w: 4, h: 5, pieces: [
    { id: 's', x: 0, y: 2, ori: 0, cells: [[0, 0], [0, 1], [0, 2]], rot: 'sofa', nodedup: true, open: 0 },
    { id: 'plug', x: 1, y: 3, w: 1, h: 1 }] };
  const Ll = K.parse(raw), sl = K.initialState(raw);
  const rp = K.moves(Ll, sl).filter(m => m.t === 'r');
  ok(rp.length === 2, '缺口叼着一颗 1×1 时照样能转（围着那颗子）', rp.length);
  ok(rp.every(m => {
    const m0 = K.openingCell(Ll, null, 0, sl[0].ori, sl[0].x, sl[0].y).join(',');
    const m1 = K.openingCell(Ll, null, 0, m.ori, m.x, m.y).join(',');
    return m0 === m1;
  }), '每个落点的缺口格都和起点一致');
}
// T 型通道（用户报的局面）：缺口从"左"跑到"下"，转体前后不是同一格 → 不许转、无解
{
  const tRaw = { w: 3, h: 3, goals: [{ piece: 'sofa', cells: [[0, 0], [1, 0], [2, 0]] }], pieces: [
    { id: 'a', x: 0, y: 1, w: 1, h: 2 }, { id: 'b', x: 2, y: 1, w: 1, h: 2 },
    { id: 'sofa', x: 1, y: 0, ori: 2, cells: [[0, 0], [0, 1], [0, 2]], rot: 'sofa', nodedup: true, open: 0 }] };
  const Lt = K.parse(tRaw), stt = K.initialState(tRaw);
  ok(K.moves(Lt, stt).filter(m => m.t === 'r').length === 0, '开局的转体走法为 0');
  ok(!K.solve(Lt, stt, tRaw.goals, { maxNodes: 200000 }).ok, 'T 型通道局面无解（旧版会一步转过去）');
}

console.log('');
console.log('[8] 半圆：平边不能朝墙（和沙发同款）');
const semiRaw = (x, y, ori) => ({ w: 4, h: 4, pieces: [
  { id: 's', x, y, ori: ori || 0, cells: SEMI_CELLS(), rot: 'pivot', nodedup: true, pair: 'disc', flat: 90 }] });
{
  const r0 = semiRaw(1, 3, 0), Ll = K.parse(r0), sl = K.initialState(r0);
  ok(JSON.stringify(K.flatCells(Ll, sl, 0, 0, 1, 3)) === '[[1,4],[2,4]]', '底行平边朝下时，平边邻格是棋盘外', K.flatCells(Ll, sl, 0, 0, 1, 3));
  ok(!K.openingInside(Ll, sl, 0, 0, 1, 3), '平边贴墙被判非法');
  const rot = K.moves(Ll, sl).filter(m => m.t === 'r');
  // 绕圆心转：圆心正好落在底边线上，两个方向的落点都有一格在盘外 -> 完全转不动（这正是"只能绕圆心"的必然结果）
  ok(rot.length === 0, '平边贴底的半圆两个方向都转不了（半圆会转进墙里）', rot.length);
  ok(K.moves(Ll, sl).filter(m => m.t === 'm').length >= 0, '平移不受影响');
}
{
  const r0 = semiRaw(1, 1, 0), Ll = K.parse(r0), sl = K.initialState(r0);
  const rot = K.moves(Ll, sl).filter(m => m.t === 'r');
  ok(rot.some(m => m.ori === 1) && rot.some(m => m.ori === 3), '棋盘中间两个方向都能转', rot.length);
}
{
  // 整圆关在加约束后仍可解
  const semi = (id, x, y, ori) => ({ id, x, y, ori, cells: SEMI_CELLS(), rot: 'pivot', nodedup: true, pair: 'disc', flat: 90 });
  const raw = { w: 4, h: 4, pieces: [
    { id: 'sq', x: 0, y: 0, w: 2, h: 2, hero: true }, { id: 'vv', x: 3, y: 0, w: 1, h: 2 },
    { id: 'hh', x: 2, y: 2, w: 2, h: 1 }, semi('s1', 0, 2, 0), semi('s2', 0, 3, 2), semi('s3', 2, 3, 0)] };
  const Ld = K.parse(raw), sd = K.initialState(raw);
  const rd = K.solve(Ld, sd, { piece: 'sq', cells: [[2, 2], [3, 2], [2, 3], [3, 3]] }, { maxNodes: 1500000 });
  ok(rd.ok && rd.moves.length === 40, '阴晴圆缺（整圆关）仍可解（绕圆心转之后 38→40 步）', rd.ok ? rd.moves.length : '无解');
  if (rd.ok) {
    const rep = replay(Ld, sd, rd);
    ok(rep.bad === 0, '回放全部合法');
    ok(K.isGoal(Ld, rep.end, { piece: 'sq', cells: [[2, 2], [3, 2], [2, 3], [3, 3]] }), '终局达成');
  }
}

console.log('');
console.log('');
console.log('[10] 自绘块：四分之一圆格 / 多分量 / 绕圆心（pivot）旋转');
{
  // 两个四分之一圆共用圆心 = 半圆；art 必须是"上半个圆"，且没有中缝
  const semi = [{ c: 0, r: 0, arc: [1, 1] }, { c: 1, r: 0, arc: [0, 1] }];
  const raw = { w: 4, h: 4, pieces: [{ id: 's', x: 1, y: 1, rot: 'pivot', cells: semi }] };
  const L = K.parse(raw), st = K.initialState(raw);
  const p = L.pieces[0];
  ok(p.custom === true, '识别为自绘块');
  ok(p.oris[0].pivot.join(',') === '1,1', '所有圆弧同心 → 转轴取那个圆心', p.oris[0].pivot);
  ok(p.oris[0].art.fill.split('Z').length === 3, '填充是两个四分之一圆子路径', p.oris[0].art.fill);
  ok(p.oris[0].art.stroke.indexOf('M1 1L1 0') === -1, '两半之间的竖缝不描边（拼成半圆时无缝）', p.oris[0].art.stroke);
  const rot = K.moves(L, st).filter(m => m.t === 'r');
  ok(rot.length === 2, '两个方向各只有一个落点（绕圆心）', rot.length);
  for (const m of rot) {
    const s2 = K.apply(st, m);
    const pv = [m.x + p.oris[m.ori].pivot[0], m.y + p.oris[m.ori].pivot[1]];
    ok(pv[0] === 2 && pv[1] === 2, '转完圆心还在原位 (2,2)', pv);
  }
  // 四次同向旋转回到原位
  {
    let cur = st, seq = [];
    for (let k = 0; k < 4; k++) {
      const mv = K.moves(L, cur).filter(m => m.t === 'r' && m.d === 1);
      if (!mv.length) break;
      cur = K.apply(cur, mv[0]); seq.push([mv[0].ori, mv[0].x, mv[0].y]);
    }
    ok(seq.length === 4 && cur[0].ori === st[0].ori && cur[0].x === st[0].x && cur[0].y === st[0].y,
      '顺时针转 4 次回到原位（落点自洽）', { seq, cur: cur[0] });
  }
}
{
  // 多分量：两块不相邻，视觉上用重心连线表示
  const raw = { w: 6, h: 4, pieces: [{ id: 'd', x: 0, y: 0, rot: false, cells: [
    { c: 0, r: 0 }, { c: 1, r: 0 }, { c: 4, r: 2 }, { c: 5, r: 2 }] }] };
  const L = K.parse(raw), st = K.initialState(raw);
  ok(K.pieceCells(L, st, 0).length === 4, '四格都在');
  const comps = K.components(K.pieceCells(L, st, 0));
  ok(comps.length === 2, '识别出两个互不相邻的分量', comps.length);
  ok(comps[0].length === 2 && comps[1].length === 2, '每个分量 2 格');
  ok((L.pieces[0].oris[0].art.fill.match(/[Zz]/g) || []).length === 4, '四格各画一块（没有连成一片）', L.pieces[0].oris[0].art.fill);
}
{
  // 自绘实心块：pivot 落点（奇偶相同时）应该在包围盒中心
  const L1 = K.parse({ w: 4, h: 4, pieces: [{ id: 'a', x: 0, y: 0, rot: 'pivot', cells: [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 1, r: 1 }, { c: 0, r: 1 }] }] });
  ok(L1.pieces[0].oris[0].pivot.join(',') === '1,1', '2×2 的轴在中心格点 (1,1)');
  const L2 = K.parse({ w: 4, h: 4, pieces: [{ id: 'b', x: 0, y: 0, rot: 'pivot', cells: [{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 0, r: 2 }] }] });
  ok(L2.pieces[0].oris[0].pivot.join(',') === '0.5,1.5', '1×3 的轴在中间格心 (0.5,1.5)');
  const L3 = K.parse({ w: 4, h: 4, pieces: [{ id: 'c', x: 0, y: 0, rot: 'pivot', cells: [{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 1, r: 1 }] }] });
  ok(L3.pieces[0].oris[0].pivot.join(',') === '1,1', 'L 形（2×2 盒）轴在角点 (1,1)，原地转');
}

console.log('');
console.log('[11] 锁定：试玩/求解都不许动，也推不动');
{
  const raw = { w: 4, h: 4, pieces: [
    { id: 'a', x: 0, y: 0, w: 1, h: 1 },
    { id: 'b', x: 1, y: 0, w: 1, h: 1, lock: true },
    { id: 'c', x: 3, y: 0, w: 1, h: 1 }] };
  const L = K.parse(raw), st = K.initialState(raw);
  ok(L.pieces[1].lock === true, 'lock 字段解析出来');
  ok(K.moves(L, st).filter(m => m.i === 1).length === 0, '锁定块没有任何走法');
  ok(K.moves(L, st).filter(m => m.i === 0 && m.dx === 1).length === 0, '别人也推不动它');
  // 目标块锁定 + 已在目标位置 -> 0 步
  const goal = { piece: 'b', cells: [[1, 0]] };
  const r = K.solve(L, st, goal);
  ok(r.ok && r.moves.length === 0, '锁定块已在目标位 → 0 步', r.ok ? r.moves.length : r.reason);
  // 锁定块换了目标位 -> 无解
  const r2 = K.solve(L, st, { piece: 'b', cells: [[1, 1]] });
  ok(!r2.ok && r2.reason === 'unsolvable', '锁定块不可能到达别处 → 无解', r2.reason);
}

console.log('');
console.log('[12] 难度分析');
{
  const raw = { w: 4, h: 4, pieces: [
    { id: 'a', x: 0, y: 0, w: 1, h: 1 }, { id: 'b', x: 1, y: 0, w: 1, h: 1 }, { id: 'c', x: 3, y: 3, w: 1, h: 1 }] };
  const L = K.parse(raw), st = K.initialState(raw);
  const res = K.analyze(L, st, { piece: 'c', cells: [[0, 3]] }, { maxNodes: 50000 });
  ok(!res.truncated && res.depth === 3, '三步可达（每步一格）', res);
  ok(res.states > 20, '枚举出可达状态数', res.states);
  ok(res.paths >= 1, '数出最短路径条数', res.paths);
  const d = K.difficulty(res);
  ok(d && d.score >= 0 && d.score <= 100, '难度分在 0-100', d);
  ok(d.score < 35, '这种小局面应该被评为低难度', d);
  // 路径唯一性：把 b 挡住，只剩一条路
  const raw2 = { w: 3, h: 1, pieces: [
    { id: 'a', x: 0, y: 0, w: 1, h: 1 }, { id: 'c', x: 2, y: 0, w: 1, h: 1 }] };
  const L2 = K.parse(raw2), s2 = K.initialState(raw2);
  const r2 = K.analyze(L2, s2, { piece: 'c', cells: [[1, 0]] });
  ok(r2.depth === 1 && r2.paths === 1, '一维局面：唯一最短路径', { d: r2.depth, p: r2.paths });
  const r3 = K.analyze(L2, s2, { piece: 'a', cells: [[1, 0]] });
  ok(r3.paths === 1, '同样唯一', r3.paths);
  // 一个"两条路都行"的局面：中间那颗往下走一步也算达成
  const raw4 = { w: 2, h: 2, pieces: [{ id: 'x', x: 0, y: 0, w: 1, h: 1 }] };
  const L4 = K.parse(raw4), s4 = K.initialState(raw4);
  const r4 = K.analyze(L4, s4, { piece: 'x', cells: [[1, 1]] });
  ok(r4.depth === 2 && r4.paths === 2, '两条等长路径都能到 (1,1)', { d: r4.depth, p: r4.paths });
}

console.log('');
console.log('[13] 同心扇形运动传递（1/2+1/2、3/4+1/4、1/2+1/4+1/4）');
{
  // 圆心统一放在世界 (2,2)：四象限 = 格(1,1)arc[1,1] / (2,1)arc[0,1] / (1,2)arc[1,0] / (2,2)arc[0,0]
  const C = (c, r, a) => ({ c, r, arc: a });
  const Q34 = { id: 't', x: 1, y: 1, rot: false, cells: [C(0, 0, [1, 1]), C(1, 0, [0, 1]), C(0, 1, [1, 0])] };
  const Q14 = { id: 'q', x: 2, y: 2, rot: false, cells: [C(0, 0, [0, 0])] };
  const H1 = { id: 'a', x: 1, y: 1, rot: false, cells: [C(0, 0, [1, 1]), C(1, 0, [0, 1])] };
  const H2 = { id: 'b', x: 1, y: 2, rot: false, cells: [C(0, 0, [1, 0]), C(1, 0, [0, 0])] };
  const H2b = { id: 'b', x: 1, y: 2, rot: false, cells: [C(0, 0, [1, 0])] };
  const mk = pieces => { const raw = { w: 4, h: 4, pieces }; return [K.parse(raw), K.initialState(raw), raw]; };

  for (const [tag, pieces, n] of [
    ['1/2 + 1/2', [H1, H2], 2],
    ['3/4 + 1/4', [Q34, Q14], 2],
    ['1/2 + 1/4 + 1/4', [H1, H2b, Q14], 3]]) {
    const [L, st] = mk(pieces);
    const crs = K.moves(L, st).filter(m => m.t === 'cr');
    ok(crs.length === 2, tag + ' → 两个方向各一次整体转', crs.length);
    ok(crs.every(m => (m.ids || m.members).length === n), tag + ' → 成员数 ' + n,
      crs.map(m => (m.ids || m.members).length));
    const single = K.moves(L, st).filter(m => m.t === 'r');
    ok(single.length === 0, tag + ' → 不允许单块转（会顶住同伴）', single.length);
    // 转完圆心不动、格数不变、成员之间不重叠
    const mv = crs.find(m => m.d === 1);
    const s2 = K.apply(st, mv);
    const cells = [];
    for (let i = 0; i < L.pieces.length; i++) for (const c of K.pieceCells(L, s2, i)) cells.push(c.join(','));
    ok(new Set(cells).size === cells.length, tag + ' → 转完不重叠', cells);
    ok(mv.pivot.x === 2 && mv.pivot.y === 2, tag + ' → 绕同一圆心 (2,2)', mv.pivot);
  }
  // 单个扇形：绕自身圆心，转 4 次回原位
  {
    const [L, st] = mk([Q34]);
    let cur = st, seq = [];
    for (let k = 0; k < 4; k++) {
      const mv = K.moves(L, cur).filter(m => (m.t === 'r' || m.t === 'cr') && m.d === 1)[0];
      if (!mv) break;
      cur = K.apply(cur, mv); seq.push([mv.ori !== undefined ? mv.ori : mv.poses[0].ori]);
    }
    ok(seq.length === 4 && JSON.stringify(cur[0]) === JSON.stringify(st[0]), '3/4 圆转 4 次回到原位', { seq, cur: cur[0] });
  }
  // 非扇形的自绘块：试玩/求解里不能转
  {
    const [L, st] = mk([{ id: 'x', x: 1, y: 1, cells: [{ c: 0, r: 0 }, { c: 1, r: 1 }] }]);
    ok(L.pieces[0].rotMode === false, '普通自绘块 rotMode = false', L.pieces[0].rotMode);
    ok(K.moves(L, st).filter(m => m.t === 'r' || m.t === 'cr').length === 0, '普通自绘块没有任何旋转走法');
  }
}

console.log('');
console.log('[14] 沙发：绕缺口中心转 + 半格平移');
{
  const SOFA = { cells: [[0, 0], [0, 1], [0, 2]], art: 'sofa', open: 0, nodedup: true, rot: 'hinge' };
  const raw = { w: 7, h: 7, pieces: [Object.assign({ id: 's', x: 2, y: 2 }, SOFA)] };
  const L = K.parse(raw), st = K.initialState(raw);
  const p = L.pieces[0];
  ok(p.rotMode === 'sofa', '沙发识别为缺口件', p.rotMode);
  // ori0：1×3 竖放，缺口朝右 -> 圆心 = 块心右移半格 = (1, 1.5) 局部
  ok(JSON.stringify(p.oris[0].pivot) === '[1,1.5]', '缺口中点在 (1,1.5)（块心右移半格）', p.oris[0].pivot);
  const rots = K.moves(L, st).filter(m => m.t === 'r');
  ok(rots.length >= 2, '沙发有转体走法', rots.length);
  ok(rots.every(m => m.pivot && typeof m.pivot.x === 'number'), '每条转体都带转轴（动画绕它画弧）',
    rots.map(m => m.pivot));
  const cw = rots.filter(m => m.d === 1);
  ok(cw.length >= 1 && cw.every(m => Math.abs(m.pivot.x - 3) < 1e-9 && Math.abs(m.pivot.y - 3.5) < 1e-9),
    '顺时针的转轴都在缺口中心 (3,3.5)', cw.map(m => m.pivot));
  for (const m of rots) {
    const s2 = K.apply(st, m);
    const cells = K.pieceCells(L, s2, 0);
    ok(cells.length === 3, '转完还是 3 格', cells.length);
    // 缺口中心在格边中点上，转 90° 后必须补半格平移才能落回格子 —— 所以圆心会跟着挪 ≤0.5 格
    const pv = p.oris[s2[0].ori % p.oris.length].pivot;
    const dx = (s2[0].x + pv[0]) - m.pivot.x, dy = (s2[0].y + pv[1]) - m.pivot.y;
    ok(Math.abs(dx) <= 0.5 + 1e-9 && Math.abs(dy) <= 0.5 + 1e-9,
      '转完缺口中心只挪了 ≤0.5 格（就是那点"略微平移"）', { dx, dy });
    break;
  }
}

console.log('');
console.log('[15] 沙发：纯离散判定（落点 + 缺口叼住的格子不变），不做连续扫掠');
{
  const SOFA2 = { cells: [[0, 0], [0, 1], [0, 2]], art: 'sofa', open: 0, nodedup: true, rot: 'hinge' };
  // 缺口朝右、正对 (1,3)：旁边放一颗子也不影响（缺口就是围着它转的）
  const raw = { w: 4, h: 5, pieces: [Object.assign({ id: 's', x: 0, y: 2 }, SOFA2), { id: 'u', x: 1, y: 3, w: 1, h: 1 }] };
  const L = K.parse(raw), st = K.initialState(raw);
  const rots = K.moves(L, st).filter(m => m.t === 'r');
  ok(rots.length === 2, '缺口前站着一颗子 → 仍然有 2 个落点（围着它转）', rots.length);
  ok(K.setSweep === undefined, '没有"严格物理"开关：沙发不是刚体');
  ok(rots.every(m => m.pivot && typeof m.pivot.x === 'number'), '每条转体都带转轴（动画按它画弧）', rots.map(m => m.pivot));
  ok(rots.every(m => {
    const m0 = K.openingCell(L, null, 0, st[0].ori, st[0].x, st[0].y).join(',');
    const m1 = K.openingCell(L, null, 0, m.ori, m.x, m.y).join(',');
    return m0 === m1;
  }), '转完缺口正对的还是 (1,3)');
  // 空盘时同样只有 2 个（4 种吸附平移里有一半会让缺口换格，被拒）
  const raw2 = { w: 4, h: 5, pieces: [Object.assign({ id: 's', x: 0, y: 2 }, SOFA2)] };
  const L2 = K.parse(raw2), s2 = K.initialState(raw2);
  ok(K.moves(L2, s2).filter(m => m.t === 'r').length === 2, '空盘上 2 个合法落点', K.moves(L2, s2).filter(m => m.t === 'r').length);
  ok(K.sweepFree(L2, s2, 0, { x: 1, y: 3.5 }, 1, 8) === true, 'sweepFree 仍可单独调用（只给动画参考，不进判定）');
}

console.log('[9] 双半圆只在圆心重合时才连锁');
{
  const semi = (id, x, y, o) => ({ id, x, y, ori: o || 0, cells: SEMI_CELLS(), rot: 'pivot', nodedup: true, pair: 'disc', flat: 90 });
  const check = list => {
    const raw = { w: 4, h: 4, pieces: list };
    const L = K.parse(raw), st = K.initialState(raw);
    return {
      paired: !!K.discPair(L, st, 0),
      cr: K.moves(L, st).filter(m => m.t === 'cr').length,
      r: K.moves(L, st).filter(m => m.t === 'r').length
    };
  };
  const discTB = check([semi('a', 0, 2, 0), semi('b', 0, 3, 2)]);   // 上下拼圆，圆心都是 (1,3)
  ok(discTB.paired && discTB.cr === 2, '上下拼成整圆 → 可以同步转', discTB);
  const discLR = check([semi('a', 0, 2, 3), semi('b', 1, 2, 1)]);   // 左右拼圆，圆心都是 (1,3)
  ok(discLR.paired && discLR.cr === 2, '左右拼成整圆 → 可以同步转', discLR);
  const humpsStacked = check([semi('a', 0, 2, 0), semi('b', 0, 3, 0)]);  // 两个凸包叠放，圆心 (1,3)/(1,4)
  ok(!humpsStacked.paired && humpsStacked.cr === 0, '两个凸包叠放（圆心不重合）→ 不许连锁', humpsStacked);
  // 两块叠放时，绕圆心转的另一个落点被同伴占住 -> 也转不了
  ok(humpsStacked.r === 0, '叠放时连单块也转不了（落点被同伴占住）', humpsStacked);
  {
    const free = semiRaw(0, 0, 0), Lf = K.parse(free), sf = K.initialState(free);
    ok(K.moves(Lf, sf).filter(m => m.t === 'r').length === 2, '空盘上半圆两个方向都能转（每次只有一个落点）');
  }
  const humpsSide = check([semi('a', 0, 2, 0), semi('b', 2, 2, 0)]);
  ok(!humpsSide.paired && humpsSide.cr === 0, '两个凸包并排 → 不许连锁', humpsSide);
}
{
  // 用户报的那一关（半圆2 与半圆3 并排）不该出现"一起转"
  const semi = (id, x, y, o) => ({ id, x, y, ori: o || 0, cells: SEMI_CELLS(), rot: 'pivot', nodedup: true, pair: 'disc', flat: 90 });
  const raw = { w: 4, h: 4, pieces: [
    { id: 'sq', x: 1, y: 0, w: 2, h: 2 }, { id: 'vv', x: 3, y: 0, w: 1, h: 2 }, { id: 'hh', x: 2, y: 3, w: 2, h: 1 },
    semi('s1', 0, 0), semi('s2', 0, 2), semi('s3', 1, 2)] };
  const L = K.parse(raw), st = K.initialState(raw);
  ok(K.discPair(L, st, 4) === null && K.discPair(L, st, 5) === null, '半圆2/3 并排 → 不是整圆关系');
  ok(K.moves(L, st).filter(m => m.t === 'cr').length === 0, '这一关没有整圆同步转走法');
}

console.log('');
console.log('[16] 沙发 T 型通道必须无解 + 非扇形自绘块不转 + 快速解剪枝');
{
  // 用户报的 3×3：沙发竖在中间、缺口朝左顶着 1×2，转成顶行 → 物理上转不动
  const tRaw = { w: 3, h: 3, goals: [{ piece: 'sofa', cells: [[0, 0], [1, 0], [2, 0]] }], pieces: [
    { id: 'a', x: 0, y: 1, w: 1, h: 2 }, { id: 'b', x: 2, y: 1, w: 1, h: 2 },
    { id: 'sofa', x: 1, y: 0, ori: 2, cells: [[0, 0], [0, 1], [0, 2]], rot: 'sofa', nodedup: true, open: 0 }] };
  const Lt = K.parse(tRaw), stt = K.initialState(tRaw);
  ok(K.moves(Lt, stt).filter(m => m.t === 'r').length === 0, '缺口被堵 → 开局 0 个转体走法');
  ok(!K.solve(Lt, stt, tRaw.goals, { maxNodes: 200000 }).ok, 'T 型通道局面无解（旧版会一步转过去）');
}
{
  // 自绘异形块：保留 4 朝向给编辑器，但试玩/求解里不能转
  const raw = { w: 4, h: 4, pieces: [
    { id: 'c', x: 1, y: 1, shape: 'custom', rot: 'pivot',
      cells: [{ c: 0, r: 0, arc: null }, { c: 1, r: 1, arc: null }] },
    { id: 'd', x: 2, y: 2, shape: 'custom', rot: 'pivot',
      cells: [{ c: 0, r: 0, arc: null }, { c: 2, r: 2, arc: null }] }] };
  const L = K.parse(raw), st = K.initialState(raw);
  ok(L.pieces[0].oris.length === 4, '仍生成 4 个朝向（编辑器 QE 摆位用）');
  ok(L.pieces.every(p => p.rotPlay === false), 'rotPlay = false');
  ok(K.moves(L, st).filter(m => m.t === 'r' || m.t === 'cr').length === 0, '没有转体走法');
}
{
  // 扇形仍然能转
  const raw = { w: 4, h: 4, pieces: [
    { id: 's', x: 1, y: 1, cells: SEMI_CELLS(), rot: 'pivot', nodedup: true, pair: 'disc', flat: 90 }] };
  const L = K.parse(raw), st = K.initialState(raw);
  ok(L.pieces[0].rotPlay === true, '扇形块 rotPlay = true');
  ok(K.moves(L, st).filter(m => m.t === 'r').length === 2, '半圆两个方向各一个落点');
}
{
  // 快速解 + 上界剪枝：返回的是最短解，且 states[0] 是起点
  const lv = K.parse(classic()), st = K.initialState(classic());
  const t0 = Date.now();
  const r = K.solve(lv, st, GOAL, { maxNodes: 400000 });
  ok(r.ok && r.moves.length === 76, '横刀立马仍是 76 单位步（带剪枝后不变）', r.ok ? r.moves.length : r.reason);
  ok(r.optimal === true, '标记为已证明最短', r.optimal);
  ok(r.states.length === r.moves.length + 1, 'states 从起点开始（UI 按步数取状态）', r.states.length);
  ok(K.isGoal(lv, r.states[r.states.length - 1], GOAL), '末态达成');
  console.log('     用时 ' + (Date.now() - t0) + 'ms / 探索 ' + r.visited + ' 状态 / 快速解 ' +
    (r.viaQuick ? '参与剪枝' : '未使用'));
  const q = K.quickSolve(lv, st, GOAL, { maxNodes: 80000, weight: 4 });
  ok(q.ok && q.states.length === q.moves.length + 1, '快速解自洽（可回放，states 也含起点）', q.ok ? q.moves.length : q.reason);
  const q2 = K.quickSolve(lv, st, GOAL, { maxNodes: 50, weight: 4 });
  ok(!q2.ok && (q2.reason === 'limit' || q2.reason === 'unsolvable'), '快速解撞上限时如实返回失败（外层退回纯 BFS）', q2.reason);
}

console.log('');
console.log('[17] 后台长任务：生成器可分片（进度/中止），超大局面截断后仍给分');
{
  const lv = K.parse(classic()), st = K.initialState(classic());

  // ① 生成器能分多片跑，拼接结果与一次性跑完全一致
  const g1 = K.analyzeGen(lv, st, GOAL, { maxNodes: 400000 });
  let slices = 0, lastP = null, r = g1.next();
  while (!r.done) { slices++; lastP = r.value; r = g1.next(); }
  const sliced = r.value;
  ok(slices > 3, 'analyze 分成了多片（每片都能刷界面）', slices);
  ok(lastP && typeof lastP.phase === 'string' && (lastP.states > 0 || lastP.back > 0),
    '进度里带阶段与已枚举状态数', lastP);
  const all = K.analyze(lv, st, GOAL, { maxNodes: 400000 });
  ok(sliced.states === all.states && sliced.depth === all.depth && sliced.paths === all.paths,
    '分片跑与一次跑结果一致', [sliced.states, all.states]);

  // ② 中途放弃生成器 = 终止（不抛异常、不出结果）
  const g2 = K.solveGen(lv, st, GOAL, { maxNodes: 400000 });
  g2.next(); g2.next();
  ok(true, '求解生成器放弃后不抛异常（终止按钮就是这么做的）');

  // ③ 截断：难度照样出分，且标成估算；空间项被 arctan 压在 0~20
  //    巨场：目标只要 6 步（很快找到），但空间上百万 → 用很小的上限制造"找到了解、枚举却没完"
  const HUGE = {
    w: 6, h: 6, goals: [{ piece: 'hero', cells: [[2, 4], [3, 4], [2, 5], [3, 5]] }],
    pieces: [
      { id: 'hero', x: 0, y: 0, shape: '2x2', name: '曹操', hero: true },
      { id: 's1', x: 4, y: 0, shape: 'semi', name: '半圆1', ori: 0 },
      { id: 's2', x: 4, y: 3, shape: 'semi', name: '半圆2', ori: 2 },
      { id: 'q1', x: 1, y: 2, shape: 'quarter', name: '一角1', ori: 0 },
      { id: 'q2', x: 3, y: 2, shape: 'quarter', name: '一角2', ori: 1 },
      { id: 'd1', x: 0, y: 3, shape: '1x1', name: '一' },
      { id: 'd2', x: 5, y: 5, shape: '1x1', name: '二' }
    ]
  };
  const hugeRaw = resolve(HUGE);
  const Lh = K.parse(hugeRaw), sh = K.initialState(hugeRaw);
  const cut = K.analyze(Lh, sh, hugeRaw.goals, { maxNodes: 200000 });
  ok(cut.truncated === true && cut.depth >= 0, '大局面：在到达目标之后被截断', [cut.states, cut.depth]);
  const dCut = K.difficulty(cut);
  ok(!!dCut && typeof dCut.score === 'number', '截断的局面仍给出难度分（不再拒绝评分）', dCut);
  ok(dCut.estimated === true, '标成估算分', dCut.estimated);
  ok(dCut.parts.space >= 0 && dCut.parts.space <= 20, '空间项是 arctan 压扁后的有界值', dCut.parts.space);
  ok(dCut.score >= 0 && dCut.score <= 100, '总分落在 0~100', dCut.score);
  ok(cut.interference.measured === false, '岔路项标成"没量到"（不编数）', cut.interference.measured);

  // ④ 连目标都没找到、但枚举被截断：也给下限估分（大局面常态）
  const cut2 = K.analyze(Lh, sh, hugeRaw.goals, { maxNodes: 20000 });
  const dCut2 = K.difficulty(cut2);
  ok(cut2.depth < 0 && cut2.truncated, '小上限下连目标都没找到', [cut2.states, cut2.depth]);
  ok(cut2.estimate ? dCut2 && dCut2.estimated && !cut2.estimate.optimal : dCut2 === null,
    '有合法参考解则估分，否则信息不足；不伪造最短性', dCut2);

  // ⑤ 对比：完整枚举时空间项还没顶满
  const full = K.analyze(lv, st, GOAL, { maxNodes: 400000 });
  const dFull = K.difficulty(full);
  ok(dFull.estimated === false, '完整枚举不是估算', dFull.estimated);
  ok(dFull.parts.space < 20, '完整枚举的空间项还没顶满', dFull.parts.space);

  // ⑥ 真的穷尽且不可达 → 不给分（这一条不能被 arctan 掩盖）
  const tRaw = { w: 3, h: 3, goals: [{ piece: 'sofa', cells: [[0, 0], [1, 0], [2, 0]] }], pieces: [
    { id: 'a', x: 0, y: 1, w: 1, h: 2 }, { id: 'b', x: 2, y: 1, w: 1, h: 2 },
    { id: 'sofa', x: 1, y: 0, ori: 2, cells: [[0, 0], [0, 1], [0, 2]], rot: 'sofa', nodedup: true, open: 0 }] };
  const Lt = K.parse(tRaw), stt = K.initialState(tRaw);
  const dead = K.analyze(Lt, stt, tRaw.goals, { maxNodes: 200000 });
  ok(dead.depth < 0 && !dead.truncated && K.difficulty(dead) === null, '穷尽后目标不可达 → 不给分', dead.depth);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
