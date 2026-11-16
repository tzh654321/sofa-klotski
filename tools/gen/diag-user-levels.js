/* 验算用户新给的两关：横刀弯马 / 上下交汇（新规则下） */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const HENG_DAO = {
  name: '横刀弯马', w: 4, h: 5,
  goals: [{ piece: 'hero', label: '底行正中', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
  pieces: [
    { id: 'zhang', x: 0, y: 0, ori: 0, shape: '1x2', name: '张飞' },
    { id: 'hero', x: 1, y: 0, ori: 0, shape: '2x2', name: '曹操', hero: true },
    { id: 'zhao', x: 3, y: 0, ori: 0, shape: '1x2', name: '赵云' },
    { id: 'guan', x: 1, y: 2, ori: 0, shape: '2x1', name: '关羽' },
    { id: 'huang', x: 3, y: 2, ori: 0, shape: '1x2', name: '黄忠' },
    { id: 'z1', x: 1, y: 3, ori: 0, shape: '1x1', name: '卒1' },
    { id: 'z2', x: 2, y: 3, ori: 0, shape: '1x1', name: '卒2' },
    { id: 'z4', x: 3, y: 4, ori: 0, shape: '1x1', name: '卒4' },
    { id: 'u11', x: 0, y: 2, ori: 0, shape: 'sofa', name: '沙发' }
  ]
};

const SHANG_XIA = {
  name: '上下交汇', w: 4, h: 4,
  goals: [
    { piece: 'c11', cells: [[0, 0], [2, 0]] },
    { piece: 'c12', cells: [[1, 3], [3, 3]] }
  ],
  pieces: [
    { id: 'u9', x: 1, y: 1, ori: 0, shape: '1x2', name: '1×2' },
    { id: 'u10', x: 2, y: 1, ori: 0, shape: '1x2', name: '1×2' },
    { id: 'c11', x: 1, y: 3, ori: 0, shape: 'custom', name: '自绘1', rot: 'pivot',
      cells: [{ c: 0, r: 0, arc: null }, { c: 2, r: 0, arc: null }] },
    { id: 'c12', x: 0, y: 0, ori: 0, shape: 'custom', name: '自绘2', rot: 'pivot',
      cells: [{ c: 0, r: 0, arc: null }, { c: 2, r: 0, arc: null }] },
    { id: 'u13', x: 3, y: 0, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u14', x: 3, y: 1, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u15', x: 3, y: 2, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u16', x: 0, y: 1, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u17', x: 0, y: 2, ori: 0, shape: '1x1', name: '1×1' }
  ]
};

for (const lv of [HENG_DAO, SHANG_XIA]) {
  const raw = resolve(lv);
  const L = K.parse(raw), st = K.initialState(raw);
  const g = K.grid(L, st);
  let b = '';
  for (let r = 0; r < L.h; r++) {
    for (let c = 0; c < L.w; c++) b += g[r * L.w + c] < 0 ? '.' : String.fromCharCode(65 + g[r * L.w + c]);
    b += '\n';
  }
  console.log('\n════ ' + lv.name + ' ' + lv.w + '×' + lv.h + ' ════\n' + b);
  console.log('块: ' + L.pieces.map((p, i) => String.fromCharCode(65 + i) + '=' + p.name +
    '(rotPlay=' + p.rotPlay + ')').join(' '));
  const sol = K.solve(L, st, raw.goals, { maxNodes: 900000 });
  console.log('可解: ' + (sol.ok ? sol.moves.length + ' 步 / ' + K.mergeMoves(sol.moves).length + ' 手' : '无解(' + sol.reason + ')'));
  const an = K.analyze(L, st, raw.goals, { maxNodes: 1200000 });
  const d = K.difficulty(an);
  console.log('analyze: 态 ' + an.states + ' 路 ' + an.paths + ' 深度 ' + an.depth + ' 超限 ' + an.truncated +
    ' 干扰 ' + JSON.stringify(an.interference) + ' → ' + (d ? d.score + ' 分 ' + d.grade : '难度 null'));
  if (sol.ok) {
    const sofas = L.pieces.map((p, i) => (p.rotMode === 'sofa' ? i : -1)).filter(i => i >= 0);
    let cur = st, turns = 0;
    for (const m of sol.moves) { if (m.t === 'r' && sofas.indexOf(m.i) >= 0) turns++; cur = K.apply(cur, m); }
    console.log('沙发转体次数: ' + turns);
  }
}
