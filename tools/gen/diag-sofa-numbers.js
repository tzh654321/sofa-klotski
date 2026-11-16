/* 给新规则定测试数：空盘/参考图/T 型 各自的沙发转体数与缺口格
 *   node tools/gen/diag-sofa-numbers.js
 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

function rots(lv, tag) {
  const raw = resolve(lv);
  const L = K.parse(raw), st = K.initialState(raw);
  const list = K.moves(L, st).filter(m => m.t === 'r' && L.pieces[m.i].rotMode === 'sofa');
  console.log(tag + ' → 转体 ' + list.length + ' 条');
  for (const m of list) {
    const c = L.pieces[m.i];
    const m0 = K.openingCell(L, null, m.i, st[m.i].ori, st[m.i].x, st[m.i].y);
    const m1 = K.openingCell(L, null, m.i, m.ori, m.x, m.y);
    console.log('   (' + st[m.i].x + ',' + st[m.i].y + ')ori' + st[m.i].ori + ' → (' + m.x + ',' + m.y + ')ori' + m.ori +
      ' d=' + m.d + ' 缺口 ' + m0.join(',') + '→' + m1.join(','));
  }
}

// 空盘 4×5，沙发竖放在左列
rots({ w: 4, h: 5, pieces: [{ id: 's', x: 0, y: 2, ori: 0, shape: 'sofa', name: '沙发' }] }, '空盘 (0,2)ori0');
// 空盘 4×5，沙发横放在最后一行
rots({ w: 4, h: 5, pieces: [{ id: 's', x: 0, y: 4, ori: 3, shape: 'sofa', name: '沙发' }] }, '空盘 (0,4)ori3');
// 用户报的 T 型
rots({
  w: 3, h: 3, pieces: [
    { id: 'a', x: 0, y: 1, w: 1, h: 2 }, { id: 'b', x: 2, y: 1, w: 1, h: 2 },
    { id: 's', x: 1, y: 0, ori: 2, shape: 'sofa', nodedup: true, open: 0 }]
}, 'T 型 (1,0)ori2');

// 参考图 ref(3)：沙发 at (0,2) ori0 + 横刀立马骨架
const ref3 = {
  w: 4, h: 5,
  pieces: [
    { id: 'red', x: 0, y: 0, w: 1, h: 2 }, { id: 'hero', x: 1, y: 0, w: 2, h: 2, hero: true },
    { id: 'yel', x: 3, y: 0, w: 1, h: 2 }, { id: 'cyn', x: 1, y: 2, w: 2, h: 1 },
    { id: 'blu', x: 3, y: 2, w: 1, h: 2 }, { id: 'sofa', x: 0, y: 2, ori: 0, shape: 'sofa', name: '沙发' },
    { id: 'pnk', x: 1, y: 4, w: 1, h: 1 }, { id: 'brn', x: 2, y: 4, w: 1, h: 1 }, { id: 'mag', x: 3, y: 4, w: 1, h: 1 }
  ]
};
{
  const raw = resolve(ref3);
  const L = K.parse(raw), st = K.initialState(raw);
  const GOAL = { piece: 'hero', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] };
  const sol = K.solve(L, st, GOAL, { maxNodes: 900000 });
  console.log('\n参考图 ref(3): ' + (sol.ok ? sol.moves.length + ' 步 / ' + K.mergeMoves(sol.moves).length + ' 手' : '无解'));
  if (sol.ok) {
    let cur = st, n = 0;
    for (const m of sol.moves) {
      if (m.t === 'r' && L.pieces[m.i].rotMode === 'sofa') {
        n++;
        const m0 = K.openingCell(L, null, m.i, cur[m.i].ori, cur[m.i].x, cur[m.i].y);
        const m1 = K.openingCell(L, null, m.i, m.ori, m.x, m.y);
        console.log('  沙发转#' + n + ' 缺口 ' + m0.join(',') + '→' + m1.join(',') + (m0.join() === m1.join() ? ' ✓' : ' ✗'));
      }
      cur = K.apply(cur, m);
    }
  }
  const an = K.analyze(L, st, GOAL, { maxNodes: 1200000 });
  console.log('  态 ' + an.states + ' 路 ' + an.paths + ' → ' + JSON.stringify(K.difficulty(an)));
}
