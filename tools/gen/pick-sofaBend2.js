/* 用搜索出的候选替换「沙发过弯」：先验算，再打印可直接入库的块表 */
const fs = require('fs');
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const idx = +(process.argv[2] || 0);
const hits = JSON.parse(fs.readFileSync(__dirname + '/logs/sofaBend2.json', 'utf8'));
const lv = hits[idx].level;
const raw = resolve(lv);
const L = K.parse(raw), st = K.initialState(raw);
const g = K.grid(L, st);
let b = '';
for (let r = 0; r < L.h; r++) {
  for (let c = 0; c < L.w; c++) b += g[r * L.w + c] < 0 ? '.' : String.fromCharCode(65 + g[r * L.w + c]);
  b += '\n';
}
console.log(b);
console.log('块: ' + L.pieces.map((p, i) => String.fromCharCode(65 + i) + '=' + p.name + '(' + (p.shape || 'custom') + ')').join(' '));
const sol = K.solve(L, st, raw.goals, { maxNodes: 900000 });
console.log('可解:', sol.ok, sol.ok ? (sol.moves.length + ' 步 / ' + K.mergeMoves(sol.moves).length + ' 手') : sol.reason);
if (sol.ok) {
  const sofas = L.pieces.map((p, i) => (p.rotMode === 'sofa' ? i : -1)).filter(i => i >= 0);
  let cur = st;
  for (const m of sol.moves) {
    if (m.t === 'r' && sofas.indexOf(m.i) >= 0) {
      const m0 = K.openingCell(L, null, m.i, cur[m.i].ori, cur[m.i].x, cur[m.i].y);
      const m1 = K.openingCell(L, null, m.i, m.ori, m.x, m.y);
      console.log('  沙发转: (' + cur[m.i].x + ',' + cur[m.i].y + ')ori' + cur[m.i].ori + ' → (' + m.x + ',' + m.y + ')ori' + m.ori +
        ' 缺口 ' + m0.join(',') + '→' + m1.join(',') + (m0.join() === m1.join() ? ' ✓' : ' ✗'));
    }
    cur = K.apply(cur, m);
  }
}
const an = K.analyze(L, st, raw.goals, { maxNodes: 1200000 });
console.log('难度:', JSON.stringify(K.difficulty(an)), '态', an.states, '路', an.paths,
  '干扰', JSON.stringify(an.interference));
