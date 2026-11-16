/* 「一次被动」(onceOnly) 引擎回归
 *   node test/once-passive.test.js
 *
 * 语义：块本身不产生任何走法；只有「发起块直接撞上来」时跟着走一格；
 * 它不再把推力传给下一块 —— 所以推箱子里「不能连推两个箱子」自动成立。
 * 与被动(chainOnly)并列：被动块会继续把推力往后传，能连推一串。
 */
const K = require('../sofa-klotski.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

/** 4×1 跑道：ps[i] 为 null 表示空格，其余是块属性 */
const mk = ps => ({
  name: 't', w: 4, h: 1,
  pieces: ps.map((p, x) => p ? Object.assign({ id: 'p' + x, x, y: 0, ori: 0, shape: '1x1' }, p) : null).filter(Boolean)
});
const build = ps => {
  const raw = mk(ps), L = K.parse(raw), st = K.initialState(raw);
  return { raw, L, st, ms: K.moves(L, st) };
};
const pushRight = o => o.ms.find(m => m.t === 'p' && m.i === 0 && m.dx === 1);

console.log('\n[1] 解析与「自己不动」');
{
  const o = build([{}, { onceOnly: true }, null, null]);
  ok(o.L.pieces[1].onceOnly === true && o.L.pieces[1].chainOnly === false, 'parse 读出 onceOnly');
  ok(o.ms.every(m => m.i !== 1), '一次被动块自己没有任何走法（含平移/旋转）');
  ok(o.ms.some(m => m.i === 0 && (m.t === 'm' || m.t === 'p')), '发起块照常能走（这里右面被占，所以是推）');
}

console.log('\n[2] 直接推：只走一格、只带一个块');
{
  const o = build([{}, { onceOnly: true }, null, null]);
  const p = pushRight(o);
  ok(!!p, '发起块直接撞上箱子 → 有推的走法');
  ok(p && JSON.stringify(p.chain.slice().sort()) === '[0,1]', '连锁里只有「发起块 + 这一个箱子」', p && p.chain);
  const after = K.apply(o.st, p);
  ok(after[0].x === 1 && after[1].x === 2, '玩家跟进一格、箱子被推一格', after.map(s => s.x));
  ok(K.moves(o.L, after).some(m => m.t === 'p' && m.i === 0 && m.dx === 1), '下一格还空着，能继续推');
}

console.log('\n[3] 不再传力：这几种情况整推作废');
const cases = [
  ['箱子后面还有箱子', [{}, { onceOnly: true }, { onceOnly: true }, null]],
  ['箱子后面有被动块', [{}, { onceOnly: true }, { chainOnly: true }, null]],
  ['箱子后面有普通块', [{}, { onceOnly: true }, {}, null]],
  ['箱子后面是锁定的墙', [{}, { onceOnly: true }, { lock: true }, null]],
  ['被动块间接撞上箱子', [{}, { chainOnly: true }, { onceOnly: true }, null]],
  ['普通块间接撞上箱子', [{}, {}, { onceOnly: true }, null]]
];
for (const [name, ps] of cases) ok(!pushRight(build(ps)), name + ' → 没有推的走法');

console.log('\n[4] 与「被动」并列：被动块仍然能连推一串');
{
  const o = build([{}, { chainOnly: true }, { chainOnly: true }, null]);
  const p = pushRight(o);
  ok(!!p && p.chain.length === 3, '三个块一起走（含两个被动块）', p && p.chain);
  ok(o.ms.every(m => m.i !== 1 && m.i !== 2), '被动块自己也没有走法');
}

console.log('\n[5] 求解器与状态指纹');
{
  const raw = mk([{ id: 'player' }, { id: 'box', onceOnly: true }, null, null]);
  raw.goals = [{ piece: 'box', cells: [[3, 0]] }];
  const L = K.parse(raw), st = K.initialState(raw);
  const r = K.solve(L, st, raw.goals, { maxNodes: 200000 });
  ok(r.ok === true && r.moves.length === 2, '最短 2 步把箱子推到 (3,0)', r.ok ? r.moves.length : r.reason);
  let s = st;
  for (const m of (r.moves || [])) s = K.apply(s, m);
  ok(K.isGoal(L, s, raw.goals), '按解法走完真的达标');
  ok((r.moves || []).every(m => m.t !== 'p' || (m.chain || []).length === 2),
    '解法里每一步推都只带动一个箱子');
  const a = K.analyze(L, st, raw.goals, { maxNodes: 20000 });
  ok(a && a.states > 0 && K.difficulty(a).score >= 0, 'analyze / difficulty 不崩', a && a.states);
}
{
  const raw = mk([{}, { onceOnly: true }, null, null]);
  const L = K.parse(raw), st = K.initialState(raw);
  const key = K.makeKeyer(L, null);
  const swapped = st.map(p => ({ ...p }));
  const t = swapped[0].x; swapped[0].x = swapped[1].x; swapped[1].x = t;
  ok(key(st) !== key(swapped), '同形的普通块 / 一次被动块在状态指纹里不可互换');
}

console.log('\n[6] 四档互斥：一次被动块不带其它标记');
{
  const o = build([{}, { onceOnly: true, lock: false }, null, null]);
  ok(!o.L.pieces[1].lock && !o.L.pieces[1].chainOnly, '没有 lock / chainOnly');
}

console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed'
  : 'ALL PASS  ' + pass + ' passed, 0 failed'));
process.exit(fail ? 1 : 0);
