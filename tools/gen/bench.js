/* 速度基准：对既有内置关卡跑 solve + analyze，校准时间预算 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');
const LV = require('../../levels.js');

for (const name of ['classic', 'sofaBend', 'yinQingYuanQue', 'hengDaoWanMa', 'ambush']) {
  const raw = resolve(LV[name]());
  const L = K.parse(raw), st = K.initialState(raw);
  const t0 = Date.now();
  const s = K.solve(L, st, raw.goals, { maxNodes: 1500000 });
  const t1 = Date.now();
  if (!s.ok) { console.log(name, '无解', s.reason, s.visited, (t1 - t0) + 'ms'); continue; }
  const a = K.analyze(L, st, raw.goals, { maxNodes: 1200000 });
  const d = K.difficulty(a);
  console.log(name.padEnd(10),
    (raw.w + 'x' + raw.h).padEnd(5),
    (s.moves.length + '步/' + K.mergeMoves(s.moves).length + '手').padEnd(12),
    ('solve ' + (t1 - t0) + 'ms').padEnd(14),
    ('analyze ' + a.ms + 'ms').padEnd(18),
    a.states + '态', a.paths + '路', d ? d.score + '分 ' + d.grade : '—');
}
