/* 大局面推箱子参考解工具：node tools/solve-sokoban.js
 *   node test/sokoban-solver.test.js
 *
 * 通用 BFS 在 11×9 的 ROOM 6 上会撞节点上限；这里验证「按推」求解器
 * 给出的解能被引擎逐条接受、真的把 5 个箱子推到 5 个亮点，且一次只推一个。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');
const { solveFile } = require('../tools/solve-sokoban.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

const src = path.join(__dirname, '..', 'levels', '推箱子', '06_仓库番6.json');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sofa-soko-')), 'room6.json');
fs.copyFileSync(src, tmp);

console.log('\n[1] 按推搜索能给出参考解');
const r = solveFile(tmp, { weight: 2, max: 2000000 });
ok(r.ok === true, '找到解', r);
ok(r.steps > 0 && r.pushes > 0, '有步数也有推箱次数', r);
ok(r.visited < 20000, '状态数远小于通用 BFS 的百万级', r.visited);

console.log('\n[2] 写回的解法能被引擎逐条接受并达成目标');
const rec = JSON.parse(fs.readFileSync(tmp, 'utf8'));
ok(rec.solution.solver === 'sokoban-push-astar' && rec.solution.optimal === false,
  '标了求解器与「非最优」', rec.solution.solver);
ok(rec.solution.steps === rec.solution.moves.length, 'steps 与 moves 长度一致',
  [rec.solution.steps, rec.solution.moves.length]);
const raw = SH.resolve(JSON.parse(JSON.stringify(rec.level)));
const L = K.parse(raw);
let st = K.initialState(raw);
let bad = 0, maxBoxes = 0;
const boxIdx = new Set(L.pieces.map((p, i) => p.onceOnly ? i : -1).filter(i => i >= 0));
for (const mv of rec.solution.moves) {
  const legal = K.moves(L, st).some(m => m.i === mv.i && m.t === mv.t &&
    m.dx === mv.dx && m.dy === mv.dy &&
    (mv.t !== 'p' || JSON.stringify(m.chain) === JSON.stringify(mv.chain)));
  if (!legal) { bad++; break; }
  if (mv.t === 'p') maxBoxes = Math.max(maxBoxes, (mv.chain || []).filter(i => boxIdx.has(i)).length);
  st = K.apply(st, mv);
}
ok(bad === 0, '每一步都是引擎当前局面下合法的走法', bad);
ok(K.isGoal(L, st, raw.goals), '回放结束 5 个箱子全在亮点上');
ok(maxBoxes === 1, '每次推只带动一个箱子（一次被动的语义）', maxBoxes);

fs.unlinkSync(tmp);   // 只清掉自己造的那个临时文件，不递归删目录
try { fs.rmdirSync(path.dirname(tmp)); } catch (e) { }
console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed'
  : 'ALL PASS  ' + pass + ' passed, 0 failed'));
process.exit(fail ? 1 : 0);
