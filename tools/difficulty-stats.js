/* 难度指标实测：打印每关的深度/手数/岔路干扰/唯一性，用于标定公式常数 */
const K = require('../sofa-klotski.js');
const { resolve } = require('../shapes.js');
const LEVELS = require('../levels.js');

const only = process.argv[2];
const rows = [];
for (const key of Object.keys(LEVELS)) {
  if (key === 'blank' || key === 'fifteen') continue;
  if (only && key !== only) continue;
  const raw = resolve(LEVELS[key]());
  const L = K.parse(raw), st = K.initialState(raw);
  const t0 = Date.now();
  const res = K.analyze(L, st, raw.goals, { maxNodes: 1200000 });
  const d = K.difficulty(res);
  rows.push({ key, name: raw.name, res, d, ms: Date.now() - t0 });
}
for (const r of rows) {
  const s = r.res, it = s.interference || {};
  console.log(
    (r.key + '            ').slice(0, 13),
    (r.name + '        ').slice(0, 8),
    s.truncated ? '超限' : (s.depth < 0 ? '无解' : `深度 ${s.depth}/${s.hands}手`),
    '态', String(s.states).padStart(7),
    '路', String(s.paths).padStart(9),
    '| 岔路/步', String(it.branches).padStart(5),
    '代价/步', String(it.waste).padStart(6),
    '同优/步', String(it.same).padStart(5),
    '死路', String(it.dead).padStart(3),
    '|', r.d ? (r.d.score + ' 分 ' + r.d.grade) : '—',
    JSON.stringify(r.d ? r.d.parts : null),
    r.ms + 'ms');
}
