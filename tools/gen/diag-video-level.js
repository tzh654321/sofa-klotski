/* 按"未标题-1.mp4"第一帧还原的布局验算（4×5，5 个空格）
 *   第0行: 1×1(0,0) 曹操2×2(1,0) 1×2(3,0)
 *   第1行: (0,1) 空   (3,1) 1×2 下半
 *   第2行: 沙发(0,2) 关羽2×1(1,2) 黄忠1×2(3,2)
 *   第3行: (1,3)(2,3) 空，(0,3) 沙发，(3,3) 黄忠
 *   第4行: (1,4)(2,4) 空，(0,4) 沙发，(3,4) 1×1
 *   node tools/gen/diag-video-level.js
 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const LV = {
  name: '视频关', w: 4, h: 5,
  goals: [{ piece: 'hero', label: '底行正中', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
  pieces: [
    { id: 'p00', x: 0, y: 0, shape: '1x1', name: '卒A' },
    { id: 'hero', x: 1, y: 0, shape: '2x2', name: '曹操', hero: true },
    { id: 'v30', x: 3, y: 0, shape: '1x2', name: '竖条' },
    { id: 'sofa', x: 0, y: 2, ori: 0, shape: 'sofa', name: '沙发' },
    { id: 'h12', x: 1, y: 2, shape: '2x1', name: '横条' },
    { id: 'v32', x: 3, y: 2, shape: '1x2', name: '竖条2' },
    { id: 'p34', x: 3, y: 4, shape: '1x1', name: '卒B' }
  ]
};

const raw = resolve(LV);
const L = K.parse(raw), st = K.initialState(raw);
const g = K.grid(L, st);
let b = '';
for (let r = 0; r < L.h; r++) {
  for (let c = 0; c < L.w; c++) b += g[r * L.w + c] < 0 ? '.' : String.fromCharCode(65 + g[r * L.w + c]);
  b += '\n';
}
console.log(LV.w + '×' + LV.h + '\n' + b);
console.log('空格数: ' + (L.w * L.h - L.pieces.reduce((n, p, i) => n + K.pieceCells(L, st, i).length, 0)));
const t0 = Date.now();
const sol = K.solve(L, st, raw.goals, { maxNodes: 900000 });
console.log('当前规则: ' + (sol.ok ? sol.moves.length + ' 步 / ' + K.mergeMoves(sol.moves).length + ' 手 (' +
  (Date.now() - t0) + 'ms)' : '无解(' + sol.reason + ')'));
if (sol.ok) {
  const sofas = L.pieces.map((p, i) => (p.rotMode === 'sofa' ? i : -1)).filter(i => i >= 0);
  let cur = st, n = 0;
  for (const m of sol.moves) {
    if (m.t === 'r' && sofas.indexOf(m.i) >= 0) {
      n++;
      console.log('  沙发转体#' + n + ' (' + cur[m.i].x + ',' + cur[m.i].y + ')ori' + cur[m.i].ori +
        ' → (' + m.x + ',' + m.y + ')ori' + m.ori + ' d=' + m.d);
    }
    cur = K.apply(cur, m);
  }
  console.log('  共 ' + n + ' 次沙发转体');
  const an = K.analyze(L, st, raw.goals, { maxNodes: 1200000 });
  console.log('  状态 ' + an.states + ' 路径 ' + an.paths + ' → ' + JSON.stringify(K.difficulty(an)));
}
