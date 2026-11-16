/* 复现：自绘（非扇形）块在求解里被旋转的情况；顺带看 上下交汇 的难度为何算不出来 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const SHUANG_XIE = {
  name: '双斜', w: 4, h: 4,
  goals: [{ piece: 'u23', cells: [[3, 0], [3, 1]] }],
  pieces: [
    { id: 'u17', x: 0, y: 0, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u18', x: 1, y: 0, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u19', x: 3, y: 2, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u20', x: 3, y: 3, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u21', x: 1, y: 2, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u22', x: 1, y: 3, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u23', x: 0, y: 2, ori: 0, shape: '1x2', name: '1×2' },
    { id: 'c24', x: 1, y: 1, ori: 0, shape: 'custom', name: '自绘1', rot: 'pivot',
      cells: [{ c: 0, r: 0, arc: null }, { c: 1, r: 1, arc: null }] },
    { id: 'c25', x: 0, y: 1, ori: 0, shape: 'custom', name: '自绘2', rot: 'pivot',
      cells: [{ c: 0, r: 0, arc: null }, { c: 2, r: 2, arc: null }] },
    { id: 'u10', x: 2, y: 1, ori: 0, shape: '1x1', name: '1×1' }
  ]
};

const KUO_HAO = {
  name: '「」', w: 4, h: 4,
  goals: [{ piece: 'u12', cells: [[1, 3], [2, 3]] }],
  pieces: [
    { id: 'u10', x: 0, y: 0, ori: 1, shape: 'L3', name: 'L 3格' },
    { id: 'u11', x: 2, y: 1, ori: 3, shape: 'L3', name: 'L 3格' },
    { id: 'u12', x: 1, y: 1, ori: 0, shape: '2x1', name: '2×1' },
    { id: 'u13', x: 3, y: 0, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u14', x: 0, y: 3, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u15', x: 1, y: 3, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u16', x: 2, y: 3, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u17', x: 3, y: 3, ori: 0, shape: '1x1', name: '1×1' },
    { id: 'u9', x: 2, y: 0, ori: 0, shape: '1x1', name: '1×1' }
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

function boardStr(L, st) {
  const g = K.grid(L, st);
  let s = '';
  for (let r = 0; r < L.h; r++) {
    for (let c = 0; c < L.w; c++) s += g[r * L.w + c] < 0 ? '.' : String.fromCharCode(65 + g[r * L.w + c]);
    s += '\n';
  }
  return s;
}

function probe(tag, lv) {
  const raw = resolve(lv);
  const L = K.parse(raw), st = K.initialState(raw);
  console.log('\n════ ' + tag + ' ════');
  console.log(boardStr(L, st));
  console.log('块: ' + L.pieces.map((p, i) => String.fromCharCode(65 + i) + '=' + p.name +
    ' rotMode=' + p.rotMode + ' oris=' + p.oris.length).join('  '));
  const rots = K.moves(L, st).filter(m => m.t === 'r' || m.t === 'cr');
  console.log('开局转体走法: ' + JSON.stringify(rots.map(m => ({ i: m.i, d: m.d, to: [m.x, m.y, m.ori] }))));
  const sol = K.solve(L, st, raw.goals, { maxNodes: 400000 });
  console.log('求解: ' + (sol.ok ? sol.moves.length + ' 步 / ' + K.mergeMoves(sol.moves).length + ' 手' : '无解(' + sol.reason + ')'));
  if (sol.ok) {
    let cur = st, bad = 0, turns = [];
    for (const m of sol.moves) {
      if (m.t === 'r' || m.t === 'cr') turns.push(String.fromCharCode(65 + m.i) + (m.t === 'cr' ? '(同心)' : '') +
        ' ori' + cur[m.i].ori + '→' + (m.ori !== undefined ? m.ori : JSON.stringify(m.poses.map(p => p.ori))) +
        ' d=' + m.d);
      cur = K.apply(cur, m);
      const used = new Map();
      for (let i = 0; i < L.pieces.length; i++) {
        for (const [c, r] of K.pieceCells(L, cur, i)) {
          if (c < 0 || r < 0 || c >= L.w || r >= L.h) bad++;
          const k = c + ',' + r;
          if (used.has(k)) bad++;
          used.set(k, i);
        }
      }
    }
    console.log('解法里的转体: ' + (turns.length ? turns.join(' | ') : '（没有）'));
    console.log('回放后越界/重叠次数: ' + bad);
  }
  const an = K.analyze(L, st, raw.goals, { maxNodes: 1200000 });
  console.log('analyze: 态 ' + an.states + ' 路径 ' + an.paths + ' 深度 ' + an.depth +
    ' 超限=' + an.truncated + ' → 难度 ' + JSON.stringify(K.difficulty(an)));
}

probe('双斜（用户报告）', SHUANG_XIE);
probe('「」（用户报告）', KUO_HAO);
probe('上下交汇（难度算不出来）', SHANG_XIA);
