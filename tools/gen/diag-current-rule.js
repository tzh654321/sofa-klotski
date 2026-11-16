/* 用当前引擎核对 4 个关键局面（规则：落点 + 缺口正对的那一格不能变）
 *   node tools/gen/diag-current-rule.js
 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');
const LEVELS = require('../../levels.js');

const T_CASE = {
  name: 'T型通道（应无解）', w: 3, h: 3,
  goals: [{ piece: 'sofa', cells: [[0, 0], [1, 0], [2, 0]] }],
  pieces: [
    { id: 'a', x: 0, y: 1, shape: '1x2', name: '1×2' },
    { id: 'b', x: 2, y: 1, shape: '1x2', name: '1×2' },
    { id: 'sofa', x: 1, y: 0, ori: 2, shape: 'sofa', name: '沙发' }
  ]
};
const HENG_DAO = {
  name: '横刀弯马（应可解）', w: 4, h: 5,
  goals: [{ piece: 'hero', label: '底行正中', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
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

const cases = [['T型通道', T_CASE], ['横刀弯马', HENG_DAO]];
for (const key of ['sofaBend', 'sofaSeat', 'furnitureMall', 'shangXiaHui', 'classic', 'ambush',
  'yinQingYuanQue', 'lockedGate']) cases.push([key, LEVELS[key]()]);

for (const [name, lv] of cases) {
  const raw = resolve(lv);
  const L = K.parse(raw), st = K.initialState(raw);
  const t0 = Date.now();
  const sol = K.solve(L, st, raw.goals, { maxNodes: 900000 });
  const sofas = L.pieces.map((p, i) => (p.rotMode === 'sofa' ? i : -1)).filter(i => i >= 0);
  let turns = 0;
  if (sol.ok) for (const m of sol.moves) if (m.t === 'r' && sofas.indexOf(m.i) >= 0) turns++;
  const an = sol.ok ? K.analyze(L, st, raw.goals, { maxNodes: 1200000 }) : null;
  const d = an ? K.difficulty(an) : null;
  console.log((name + '                    ').slice(0, 20) +
    (sol.ok ? (sol.moves.length + ' 步 / ' + K.mergeMoves(sol.moves).length + ' 手 · 沙发转 ' + turns +
      ' 次 · 态 ' + an.states + ' · ' + (d ? d.score + ' 分 ' + d.grade : '难度 —'))
      : '无解(' + sol.reason + ')') + '  [' + (Date.now() - t0) + 'ms]');
}
