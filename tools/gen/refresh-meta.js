/* 重算关卡库的全部 meta：把打印出来的 META 表贴回 levels.js
 *   node tools/gen/refresh-meta.js
 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');
const LEVELS = require('../../levels.js');

const rows = [];
for (const key of Object.keys(LEVELS)) {
  if (typeof LEVELS[key] !== 'function' || key === 'blank' || key === 'fifteen') continue;
  const raw = resolve(LEVELS[key]());
  const L = K.parse(raw), st = K.initialState(raw);
  const res = K.analyze(L, st, raw.goals, { maxNodes: 1200000 });
  const d = K.difficulty(res);
  const s = res.depth >= 0 ? K.solve(L, st, raw.goals, { maxNodes: 1500000 }) : null;
  // 手数一律用 analyze 那条最短路径的（= 页面难度面板显示的那个数）：
  // 最短路径不唯一，solve 的 tie-break 可能给出另一条、手数不一样 → 列表和面板会各说一个数。
  rows.push({ key, name: raw.name, res, d,
    hands: res.hands != null ? res.hands : (s && s.ok ? K.mergeMoves(s.moves).length : null) });
  console.error(key + ' 完成：' + (d ? d.score + ' 分 ' + d.grade : '无解/超限') +
    '（' + res.states + ' 态 / ' + res.ms + 'ms）');
}
console.log('  const META = {');
for (const r of rows) {
  if (!r.d) { console.log('    // ' + r.key + ' 无解或超限，不写入 meta'); continue; }
  console.log("    " + r.key + ": { score: " + r.d.score + ", grade: '" + r.d.grade + "', depth: " +
    r.res.depth + ', hands: ' + r.hands + ', states: ' + r.res.states + ', paths: ' + r.res.paths +
    ', waste: ' + r.res.interference.waste + ', same: ' + r.res.interference.same + ' },');
}
console.log('  };');
console.log('\n// 明细');
for (const r of rows) {
  console.log('  ' + (r.key + '              ').slice(0, 15) + (r.name + '        ').slice(0, 7) +
    ' 深度 ' + r.res.depth + '/' + r.hands + '手  态 ' + r.res.states + '  路 ' + r.res.paths +
    '  岔路代价/步 ' + r.res.interference.waste + '  同优/步 ' + r.res.interference.same +
    '  → ' + (r.d ? r.d.score + ' 分 ' + r.d.grade + ' ' + JSON.stringify(r.d.parts) : '—'));
}
