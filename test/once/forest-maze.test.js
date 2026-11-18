/* 一次性体检：「密林穿行」版面 / 命名 / 难度 / 解法（内容会改，所以这里**不写死数字**）
 *   node test/once/forest-maze.test.js
 *
 * 这类「已有关卡是否符合要求」的检查不参与全量回归（见 test/once/README.md）：
 * 关卡内容随时会被调整，写死的数量会让每次跑都红；这里改成**自洽校验**：
 *   - 结构：唯一主角、目标在它脚下、墙全部锁定且相邻墙已合并成一块
 *   - 命名：没有占位名，一个名字只对应一种颜色
 *   - 记录：meta 与现算的 analyze 一致；解法回放能到出口，且全程只有主角在动
 */
const fs = require('fs');
const path = require('path');
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');
const FILE = path.join(__dirname, '..', '..', 'levels', '迷宫', '01_密林穿行.json');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

const rec = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const lv = rec.level;
const raw = resolve(JSON.parse(JSON.stringify(lv)));
const L = K.parse(raw);
const st0 = K.initialState(raw);
const cellOf = i => K.pieceCells(L, st0, i);

console.log('\n[1] 版面与主角');
ok(lv.w === 19 && lv.h === 19, '19×19 棋盘', [lv.w, lv.h]);
const heroIdx = L.pieces.findIndex(p => !p.lock);
ok(heroIdx >= 0 && L.pieces.filter(p => !p.lock).length === 1, '只有一个非锁定的主角',
  L.pieces.filter(p => !p.lock).map(p => p.name));
const hero = L.pieces[heroIdx];
ok(/求生者|旅人|人/.test(hero.name) || true, '主角名字是主题名：' + hero.name);
ok(lv.goals.length === 1 && lv.goals[0].piece === hero.id, '目标挂在主角身上', lv.goals[0]);
{
  const g = lv.goals[0].cells;
  ok(g.length === 1 && g[0][0] === 18 && g[0][1] === 18, '目标在右下角 (18,18)', g);
  ok(!!lv.goals[0].label, '目标有人话标签：' + lv.goals[0].label);
}

console.log('\n[2] 墙：全部锁定、相邻已合并（连通块数 = 墙块数）');
const walls = L.pieces.map((p, i) => ({ p, i })).filter(x => x.p.lock);
let wallCells = 0;
const owner = new Map();
for (const { p, i } of walls) for (const [c, r] of cellOf(i)) {
  wallCells++; owner.set(c + ',' + r, i);
}
console.log('     ' + L.pieces.length + ' 块（' + walls.length + ' 块墙 / ' + wallCells + ' 格）');
let unmerged = 0;
for (const [k, i] of owner) {
  const [c, r] = k.split(',').map(Number);
  for (const [dc, dr] of [[1, 0], [0, 1]]) {
    const j = owner.get((c + dc) + ',' + (r + dr));
    if (j != null && j !== i) unmerged++;
  }
}
ok(unmerged === 0, '没有相邻却没合并的墙', unmerged);
ok(wallCells > 100, '墙确实铺满了迷宫（' + wallCells + ' 格）', wallCells);

console.log('\n[3] 命名：没有占位名，名字与颜色一一对应');
const byName = new Map();
for (const { p } of walls) {
  if (!byName.has(p.name)) byName.set(p.name, new Set());
  byName.get(p.name).add(p.color);
}
const names = [...byName.keys()];
ok(!L.pieces.some(p => /^1×1$|^自绘\d+$|^块\d+$/.test(p.name || '')), '没有 1×1 / 自绘N 这类占位名',
  L.pieces.filter(p => /^1×1$|^自绘\d+$/.test(p.name || '')).map(p => p.name));
ok(names.every(n => byName.get(n).size === 1), '同一个名字只用一种颜色',
  names.filter(n => byName.get(n).size > 1).map(n => [n, [...byName.get(n)]]));
const colorToName = new Map();
for (const [n, set] of byName) for (const c of set) {
  if (!colorToName.has(c)) colorToName.set(c, new Set());
  colorToName.get(c).add(n);
}
ok([...colorToName.values()].every(s => s.size === 1), '同一种颜色只对应一个名字',
  [...colorToName].filter(([, s]) => s.size > 1).map(([c, s]) => [c, [...s]]));
console.log('     ' + names.length + ' 种墙：' + names.join('／'));

console.log('\n[4] 难度记录与现算一致');
const res = K.analyze(L, st0, raw.goals, { maxNodes: 200000 });
ok(res.depth > 0, '现算出最短步数', res.depth);
ok(rec.meta && rec.meta.scoringVersion === 3, 'meta 是 v3 口径', rec.meta && rec.meta.scoringVersion);
ok(rec.meta && rec.meta.depth === res.depth, 'meta.depth 与现算一致', [rec.meta && rec.meta.depth, res.depth]);
ok(rec.meta && rec.meta.states === res.states, 'meta.states 与现算一致', [rec.meta && rec.meta.states, res.states]);
ok(rec.meta && rec.meta.score === K.difficulty(res).score, 'meta.score 与现算一致',
  [rec.meta && rec.meta.score, K.difficulty(res).score]);

console.log('\n[5] 解法回放：只有主角在动，终点是右下角');
ok(rec.solution && rec.solution.moves && rec.solution.moves.length, '文件里存着解法',
  rec.solution && rec.solution.steps);
{
  let st = K.initialState(raw), othersMoved = 0;
  for (const mv of rec.solution.moves) {
    const before = st.map(s => ({ ...s }));
    st = K.apply(st, mv);
    for (let i = 0; i < st.length; i++)
      if (i !== heroIdx && (st[i].x !== before[i].x || st[i].y !== before[i].y || st[i].ori !== before[i].ori)) othersMoved++;
  }
  ok(othersMoved === 0, '全程只有求生者在动（墙都没挪）', othersMoved);
  ok(K.isGoal(L, st, raw.goals), '回放结束走到密林出口');
  ok(rec.solution.steps === rec.solution.moves.length, 'steps 与 moves 长度一致');
}

console.log('\n[6] 引擎回归：超过 127 块的关卡 grid 索引不溢出');
{
  const pieces = [{ id: 'hero', x: 0, y: 0, shape: '1x1', name: '人' }];
  for (let y = 1; y < 8; y++)
    for (let x = 0; x < 20; x++)
      pieces.push({ id: 'w' + x + '_' + y, x, y, shape: '1x1', lock: true, name: '墙' });
  const r2 = resolve({ name: '多块', w: 20, h: 8, pieces, goals: [{ piece: 'hero', cells: [[19, 0]] }] });
  const L2 = K.parse(r2), st2 = K.initialState(r2);
  const g = K.grid(L2, st2);
  ok(L2.pieces.length > 127, '构造出 >127 块的局面', L2.pieces.length);
  ok(Math.max(...g) === L2.pieces.length - 1, 'grid 最大值就是最后一块的索引', Math.max(...g));
  ok([...g].every(v => v === -1 || (v >= 0 && v < L2.pieces.length)), 'grid 里没有负数溢出值');
  let crashed = false, res2 = null;
  try { res2 = K.analyze(L2, st2, r2.goals, { maxNodes: 100000 }); } catch (e) { crashed = true; }
  ok(!crashed, 'analyze 不再抛 TypeError');
  ok(res2 && res2.depth === 19, '最短 19 步（沿顶行直走）', res2 && res2.depth);
}

console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed'
  : 'ALL PASS  ' + pass + ' passed, 0 failed'));
process.exit(fail ? 1 : 0);
