/* 一次性：实算两关（上下交汇新版 / 万里征途）的 meta */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');
const LEVELS = require('../../levels.js');

const keys = process.argv.slice(2);
for (const key of keys) {
  const raw = resolve(LEVELS[key]());
  const L = K.parse(raw), st = K.initialState(raw);
  const t0 = Date.now();
  const res = K.analyze(L, st, raw.goals, { maxNodes: 2200000 });
  const d = K.difficulty(res);
  const it = res.interference || {};
  console.log(key + ': ' + (d ? d.score + ' 分 ' + d.grade : 'null') +
    ' · ' + res.depth + ' 步 / ' + res.hands + ' 手 · ' + res.states + ' 态 · 路径 ' + res.paths +
    ' · waste ' + it.waste + ' same ' + it.same + ' measured ' + it.measured +
    ' · truncated ' + res.truncated + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  if (d) {
    console.log("    " + key + ": { score: " + d.score + ", grade: '" + d.grade + "', depth: " +
      res.depth + ', hands: ' + res.hands + ', states: ' + res.states + ', paths: ' + res.paths +
      ', waste: ' + it.waste + ', same: ' + it.same + ' },');
    console.log('    parts ' + JSON.stringify(d.parts) + ' estimated ' + d.estimated);
  }
}
