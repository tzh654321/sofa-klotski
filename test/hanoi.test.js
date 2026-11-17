/* 汉诺塔关卡 + 宏动作求解器回归
 *   node test/hanoi.test.js
 *
 * 单格 BFS 在这关会组合爆炸，专用求解器把「整盘搬动」当宏动作：
 * 2^5-1 = 31 次搬动，展开 906 个引擎单格走法。这里每步都验证合法，并回放到达目标。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const { solveHanoi } = require('../tools/solve-hanoi.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

console.log('[1] 关卡文件与滑块命名');
const file = path.join(__dirname, '..', 'levels', '合移位', '05_汉诺塔.json');
ok(fs.existsSync(file), '合移位/05_汉诺塔.json 存在');
const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
const lv = rec.level;
ok(rec.name === '汉诺塔' && lv.name === '汉诺塔', '关卡名是汉诺塔');
ok(lv.solver === 'hanoi', '标记了专用求解器 hanoi');
const want = {
  c8: '火环', c9: '木环', c10: '土环', c11: '水环', c12: '金环',
  c24: '门柱', c25: '门柱'
};
for (const [id, name] of Object.entries(want)) {
  const p = lv.pieces.find(x => x.id === id);
  ok(!!p && p.name === name, id + ' 命名为「' + name + '」', p && p.name);
}
ok(lv.pieces.filter(p => p.name === '门柱').length === 2, '两根立柱都叫门柱');
ok(lv.pieces.find(p => p.id === 'c12').color === '#e8b923', '金环用金色 #e8b923');
ok(lv.pieces.find(p => p.id === 'c24').color === '#4a4a55', '门柱用深石板灰 #4a4a55');
ok(lv.pieces.filter(p => p.hero).map(p => p.id).join('') === 'c8', '主角标记在最外一层火环');
ok(lv.pieces.filter(p => p.lock).length === 2, '两根锁定立柱');
ok(lv.pieces.filter(p => !p.lock).length === 5, '五个可动盘');

console.log('\n[2] 布局与目标');
const L = K.parse(lv), st0 = K.initialState(lv);
const used = new Set(); let bad = 0;
for (let i = 0; i < L.pieces.length; i++) {
  for (const [c, r] of K.pieceCells(L, st0, i)) {
    const k = c + ',' + r;
    if (c < 0 || r < 0 || c >= L.w || r >= L.h || used.has(k)) bad++;
    used.add(k);
  }
}
ok(bad === 0, '不越界不重叠', bad);
ok(!K.isGoal(L, st0, lv.goals), '开局还没归位');
ok(K.goalNorm(L, lv.goals[0]).kind === 'place', '目标是「某块占某些格」');

console.log('\n[3] 预存解逐步合法 + 回放达成');
{
  const src = rec.solution.moves;
  ok(rec.solution.solver === 'hanoi' && rec.solution.optimal === false,
    '标记为非单格最短的专用解');
  ok(src.length === rec.solution.steps, '记录的步数与走法一致', [src.length, rec.solution.steps]);
  let st = st0, illegal = 0;
  for (const mv of src) {
    const legal = K.moves(L, st).some(m => {
      if (m.i !== mv.i || m.t !== mv.t) return false;
      if (mv.t === 'm') return m.dx === mv.dx && m.dy === mv.dy;
      return true;
    });
    if (!legal) illegal++;
    st = K.apply(st, mv);
  }
  ok(illegal === 0, '906 步每一步都是引擎合法走法', illegal);
  ok(K.isGoal(L, st, lv.goals), '回放结束最大盘到了最右柱');
  ok(K.mergeMoves(src).length === 31, '合并成 31 手 = 2^5-1 次整盘搬动', K.mergeMoves(src).length);
}

console.log('\n[4] 求解器可重跑且结果一致');
{
  const t = Date.now();
  const r = solveHanoi(lv);
  ok(r.ok, '宏求解器出解');
  ok(r.macroMoves === 31 && r.steps === 906 && r.hands === 31,
    '31 次搬动 / 906 步 / 31 手', [r.macroMoves, r.steps, r.hands]);
  ok(JSON.stringify(r.moves) === JSON.stringify(rec.solution.moves), '重跑结果与关卡里存的完全一致');
  ok(Date.now() - t < 5000, '毫秒级出解（不是 BFS 的分钟级）', (Date.now() - t) + 'ms');
  ok(JSON.stringify(r.slotX) === '[0,10,20]', '自动识别出三根柱位', r.slotX);
  // 正面证明「为什么必须用专用求解」：单格 BFS 在两万节点上限内连一条解都搜不到
  const bfs = K.solve(L, st0, lv.goals, { maxNodes: 20000 });
  ok(!bfs.ok && bfs.reason === 'limit', '单格 BFS 两万节点内没解（组合爆炸，命中上限）',
    bfs.ok ? bfs.moves.length : bfs.reason);
}

console.log('\n' + (fail ? 'FAILED  ' + fail + ' / ' + (pass + fail) : 'ALL PASS  ' + pass + ' 条'));
process.exit(fail ? 1 : 0);
