/* 规则对照实验：三种沙发判定下，横刀弯马 与 T 型通道 分别怎么走
 *   A 原版：只看落点 + 开口朝内（不查嘴）
 *   B 落点 + 落点嘴
 *   C 落点 + 起点嘴 + 落点嘴（当前实现）
 *   node tools/gen/diag-rules.js
 */
const fs = require('fs');
const path = require('path');
const { resolve } = require('../../shapes.js');

const SRC = path.join(__dirname, '..', '..', 'sofa-klotski.js');
const src = fs.readFileSync(SRC, 'utf8');
const START_NEEDLE = 'notchClear(level, g, i, state[i].ori % nOri';
const LAND_NEEDLE = 'notchClear(level, g, i, no, nx, ny)';

/** 按内容删掉一整行（源码是 CRLF，不能按 "\n" 直接 replace） */
function dropLine(s, needle) {
  const lines = s.split(/\r?\n/);
  const i = lines.findIndex(l => l.indexOf(needle) >= 0);
  if (i < 0) throw new Error('找不到这一行: ' + needle);
  lines.splice(i, 1);
  return lines.join('\n');
}

function engine(tag, dropStart, dropLand) {
  let s = src;
  if (dropStart) s = dropLine(s, START_NEEDLE);
  if (dropLand) s = dropLine(s, LAND_NEEDLE);
  const f = path.join(__dirname, '_engine_' + tag + '.js');
  fs.writeFileSync(f, s, 'utf8');
  return require(f);
}

const T_CASE = {
  name: 'T型通道', w: 3, h: 3,
  goals: [{ piece: 'sofa', cells: [[0, 0], [1, 0], [2, 0]] }],
  pieces: [
    { id: 'a', x: 0, y: 1, shape: '1x2', name: '1×2' },
    { id: 'b', x: 2, y: 1, shape: '1x2', name: '1×2' },
    { id: 'sofa', x: 1, y: 0, ori: 2, shape: 'sofa', name: '沙发' }
  ]
};
const HENG_DAO = {
  name: '横刀弯马', w: 4, h: 5,
  goals: [{ piece: 'hero', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
  pieces: [
    { id: 'zhang', x: 0, y: 0, shape: '1x2', name: '张飞' },
    { id: 'hero', x: 1, y: 0, shape: '2x2', name: '曹操', hero: true },
    { id: 'zhao', x: 3, y: 0, shape: '1x2', name: '赵云' },
    { id: 'guan', x: 1, y: 2, shape: '2x1', name: '关羽' },
    { id: 'huang', x: 3, y: 2, shape: '1x2', name: '黄忠' },
    { id: 'z1', x: 1, y: 3, shape: '1x1', name: '卒1' },
    { id: 'z2', x: 2, y: 3, shape: '1x1', name: '卒2' },
    { id: 'z4', x: 3, y: 4, shape: '1x1', name: '卒4' },
    { id: 'sofa', x: 0, y: 2, ori: 0, shape: 'sofa', name: '沙发' }
  ]
};

function board(K, L, st) {
  const g = K.grid(L, st);
  let s = '';
  for (let r = 0; r < L.h; r++) {
    for (let c = 0; c < L.w; c++) s += g[r * L.w + c] < 0 ? '.' : String.fromCharCode(65 + g[r * L.w + c]);
    s += '\n';
  }
  return s;
}

const variants = [
  ['A_原版(不查嘴)', engine('A', true, true)],
  ['B_只查落点嘴', engine('B', true, false)],
  ['C_起落都查(当前)', engine('C', false, false)]
];

for (const [tag, K] of variants) {
  console.log('\n════════════ ' + tag + ' ════════════');
  for (const lv of [HENG_DAO, T_CASE]) {
    const raw = resolve(lv);
    const L = K.parse(raw), st = K.initialState(raw);
    const sol = K.solve(L, st, raw.goals, { maxNodes: 600000 });
    console.log('\n— ' + lv.name + ': ' + (sol.ok ? sol.moves.length + ' 步 / ' + K.mergeMoves(sol.moves).length + ' 手' : '无解(' + sol.reason + ')'));
    if (!sol.ok) continue;
    let cur = st, n = 0;
    const sofas = L.pieces.map((p, i) => (p.rotMode === 'sofa' ? i : -1)).filter(i => i >= 0);
    for (const m of sol.moves) {
      if (m.t === 'r' && sofas.indexOf(m.i) >= 0) {
        n++;
        const pv = m.pivot;
        const mouthFrom = K.openingCell(L, cur, m.i, cur[m.i].ori, cur[m.i].x, cur[m.i].y);
        const mouthTo = K.openingCell(L, cur, m.i, m.ori, m.x, m.y);
        const g = K.grid(L, cur);
        const occ = c => (c[0] < 0 || c[1] < 0 || c[0] >= L.w || c[1] >= L.h) ? '出界' : (g[c[1] * L.w + c[0]] < 0 ? '空' : '有块' + g[c[1] * L.w + c[0]]);
        console.log('  转体#' + n + ' (' + cur[m.i].x + ',' + cur[m.i].y + ')ori' + cur[m.i].ori + '→(' + m.x + ',' + m.y + ')ori' + m.ori +
          ' d=' + m.d + ' 转轴' + JSON.stringify([pv.x, pv.y]) +
          ' 起嘴' + JSON.stringify(mouthFrom) + occ(mouthFrom) + ' ' + '落嘴' + JSON.stringify(mouthTo) + occ(mouthTo));
        if (n <= 3) console.log(board(K, L, cur));
      }
      cur = K.apply(cur, m);
    }
    if (!n) console.log('  （解法里沙发一次没转）');
  }
}
