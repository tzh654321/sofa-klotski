/* 诊断：沿最短解检查每个沙发转体「途中扫过的格子」是否干净
 *   node tools/gen/diag-sweep.js
 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');
const LEVELS = require('../../levels.js');

const T_CASE = {
  name: 'T 型通道（用户报告）', w: 3, h: 3,
  goals: [{ piece: 'u14', cells: [[0, 0], [1, 0], [2, 0]] }],
  pieces: [
    { id: 'u12', x: 0, y: 1, ori: 0, shape: '1x2', name: '1×2' },
    { id: 'u13', x: 2, y: 1, ori: 0, shape: '1x2', name: '1×2' },
    { id: 'u14', x: 1, y: 0, ori: 2, shape: 'sofa', name: '沙发' }
  ]
};

function boardStr(L, st) {
  const g = K.grid(L, st);
  let s = '';
  for (let r = 0; r < L.h; r++) {
    for (let c = 0; c < L.w; c++) s += g[r * L.w + c] < 0 ? '.' : String.fromCharCode(65 + g[r * L.w + c]);
    s += '\n';
  }
  return s;
}

function check(tag, rawIn, opts) {
  opts = opts || {};
  const raw = resolve(rawIn);
  const L = K.parse(raw), st0 = K.initialState(raw);
  console.log('\n════ ' + tag + ' ' + L.w + '×' + L.h + ' ════');
  console.log(boardStr(L, st0));
  const sol = K.solve(L, st0, raw.goals, { maxNodes: 900000 });
  console.log('当前引擎: ' + (sol.ok ? '可解 ' + sol.moves.length + ' 步 / ' + K.mergeMoves(sol.moves).length + ' 手' : '无解(' + sol.reason + ')'));
  if (!sol.ok) return;
  const sofas = L.pieces.map((p, k) => (p.rotMode === 'sofa' ? k : -1)).filter(k => k >= 0);
  let cur = st0, rot = 0, clear = 0, blocked = 0;
  for (const mv of sol.moves) {
    if (mv.t === 'r' && sofas.indexOf(mv.i) >= 0) {
      rot++;
      const ok = K.sweepFree(L, cur, mv.i, mv.pivot, mv.d, opts.samples || 24);
      if (ok) clear++; else blocked++;
      console.log('  转体 #' + rot + ' (ori ' + cur[mv.i].ori + ' → ' + mv.ori + ', d=' + mv.d +
        ', at ' + cur[mv.i].x + ',' + cur[mv.i].y + ')  途中扫掠: ' + (ok ? '干净' : '❌ 撞到别的块'));
      if (!ok && opts.dump) console.log(boardStr(L, cur));
    }
    cur = K.apply(cur, mv);
  }
  console.log('  沙发转体 ' + rot + ' 次：干净 ' + clear + '，撞块 ' + blocked);
}

check('T 型通道（用户报告，期望：无解）', T_CASE);
for (const key of ['sofaBend', 'shaBan', 'sofaSeat']) check(key, LEVELS[key](), { dump: true });
