/* 规则候选 D：「缺口叼住的那一格在转体前后不能变」（沙发只能围着缺口前那个墙角转身）
 * 用字符串改造生成一个实验版引擎，跑 4 个局面 + 用户的 T 型局面。
 *   node tools/gen/diag-anchor.js
 */
const fs = require('fs');
const path = require('path');
const { resolve } = require('../../shapes.js');

const SRC = path.join(__dirname, '..', '..', 'sofa-klotski.js');
const src = fs.readFileSync(SRC, 'utf8');

function dropLine(s, needle) {
  const lines = s.split(/\r?\n/);
  const i = lines.findIndex(l => l.indexOf(needle) >= 0);
  if (i < 0) throw new Error('找不到: ' + needle);
  lines.splice(i, 1);
  return lines.join('\n');
}
function insertAfter(s, needle, add) {
  const lines = s.split(/\r?\n/);
  const i = lines.findIndex(l => l.indexOf(needle) >= 0);
  if (i < 0) throw new Error('找不到: ' + needle);
  lines.splice(i + 1, 0, add);
  return lines.join('\n');
}

/* 变体 D：删掉两条嘴检查，改成「起点嘴格 == 落点嘴格」 */
function engineAnchor() {
  let s = src;
  s = dropLine(s, 'notchClear(level, g, i, state[i].ori % nOri');
  s = dropLine(s, 'notchClear(level, g, i, no, nx, ny)');
  s = insertAfter(s, 'if (isSofa && !notchClear(level, g, i, no, nx, ny)) continue;'.replace('if (isSofa && !notchClear(level, g, i, no, nx, ny)) continue;', 'if (!openingInside(level, state, i, no, nx, ny)) continue;'),
    '            if (isSofa) {\n' +
    '              const m0 = openingCell(level, null, i, a === p.oris[state[i].ori % nOri] ? state[i].ori % nOri : state[i].ori % nOri, state[i].x, state[i].y);\n' +
    '              const m1 = openingCell(level, null, i, no, nx, ny);\n' +
    '              if (m0[0] !== m1[0] || m0[1] !== m1[1]) continue;\n' +
    '            }');
  const f = path.join(__dirname, '_engine_anchor.js');
  fs.writeFileSync(f, s, 'utf8');
  return require(f);
}

/** 变体 E：起点和落点的嘴格都必须是"被块占着"（缺口必须叼着东西） */
function engineGrip() {
  let s = src;
  s = dropLine(s, 'notchClear(level, g, i, state[i].ori % nOri');
  s = dropLine(s, 'notchClear(level, g, i, no, nx, ny)');
  s = insertAfter(s, 'if (!openingInside(level, state, i, no, nx, ny)) continue;',
    '            if (isSofa) {\n' +
    '              const m0 = openingCell(level, null, i, state[i].ori % nOri, state[i].x, state[i].y);\n' +
    '              const m1 = openingCell(level, null, i, no, nx, ny);\n' +
    '              const occ0 = (m0[0] < 0 || m0[1] < 0 || m0[0] >= level.w || m0[1] >= level.h) ? -1 : g[m0[1] * level.w + m0[0]];\n' +
    '              const occ1 = (m1[0] < 0 || m1[1] < 0 || m1[0] >= level.w || m1[1] >= level.h) ? -1 : g[m1[1] * level.w + m1[0]];\n' +
    '              if (occ0 === -1 || occ0 === i || occ1 === -1 || occ1 === i) continue;\n' +
    '            }');
  const f = path.join(__dirname, '_engine_grip.js');
  fs.writeFileSync(f, s, 'utf8');
  return require(f);
}

const T_CASE = {
  name: 'T型通道（期望无解）', w: 3, h: 3,
  goals: [{ piece: 'sofa', cells: [[0, 0], [1, 0], [2, 0]] }],
  pieces: [
    { id: 'a', x: 0, y: 1, shape: '1x2', name: '1×2' },
    { id: 'b', x: 2, y: 1, shape: '1x2', name: '1×2' },
    { id: 'sofa', x: 1, y: 0, ori: 2, shape: 'sofa', name: '沙发' }
  ]
};
const HENG_DAO = {
  name: '横刀弯马（期望可解）', w: 4, h: 5,
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

const LEVELS = require('../../levels.js');

const cases = [
  ['T 型通道（要无解）', T_CASE],
  ['横刀弯马（要有解）', HENG_DAO],
  ['沙发过弯（现有预设）', LEVELS.sofaBend()],
  ['沙发入座（现有预设）', LEVELS.sofaSeat()]
];

for (const [tag, mk] of [['D: 嘴格不能变', engineAnchor], ['E: 嘴必须叼着块', engineGrip]]) {
  const K = mk();
  console.log('\n════════ ' + tag + ' ════════');
  for (const [name, lv] of cases) {
    const raw = resolve(lv);
    const L = K.parse(raw), st = K.initialState(raw);
    const sol = K.solve(L, st, raw.goals, { maxNodes: 600000 });
    const sofas = L.pieces.map((p, i) => (p.rotMode === 'sofa' ? i : -1)).filter(i => i >= 0);
    let turns = 0;
    if (sol.ok) for (const m of sol.moves) if (m.t === 'r' && sofas.indexOf(m.i) >= 0) turns++;
    console.log('  ' + name.padEnd(24) + (sol.ok ? '可解 ' + sol.moves.length + ' 步 / ' + K.mergeMoves(sol.moves).length + ' 手，沙发转 ' + turns + ' 次'
      : '无解(' + sol.reason + ')'));
  }
}
