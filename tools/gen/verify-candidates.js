/* 校验候选关（JSON 文件，单个对象或数组）：布局 / 可解 / 机制 / 难度分
 *   node tools/gen/verify-candidates.js <file.json> [--meta]
 *   --meta 额外打印可直接粘进 levels.js 的 meta 对象
 */
const fs = require('fs');
const { K, load, metrics, fmt, validate } = require('./lib.js');

const file = process.argv[2];
if (!file) { console.error('用法: node tools/gen/verify-candidates.js <file.json> [--meta]'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const list = Array.isArray(data) ? data : [data];
let bad = 0;
for (const item of list) {
  const lv = item.level || item;
  const tag = item.key || lv.name;
  const errs = validate(lv);
  const m = metrics(lv, { solveCap: 1200000, analyzeCap: 1200000 });
  console.log('\n[' + tag + '] ' + lv.name + '  ' + lv.w + '×' + lv.h + '  ' + lv.pieces.length + ' 块' +
    (item.note ? '  — ' + item.note : ''));
  if (errs.length) { bad++; console.log('  ⚠ 布局/字段问题: ' + JSON.stringify(errs)); }
  if (!m.ok) { bad++; console.log('  ✗ 不可解 (' + m.reason + ') 探索 ' + m.visited); continue; }
  console.log('  ' + fmt(m));
  if (m.truncated) { bad++; continue; }
  if (m.score < 34) { bad++; console.log('  △ 分数偏低'); }
  if (process.argv.includes('--meta')) {
    console.log('  meta: { score: ' + m.score + ", grade: '" + m.grade + "', depth: " + m.steps +
      ', hands: ' + m.hands + ', states: ' + m.states + ', paths: ' + m.paths +
      ', waste: ' + m.a.interference.waste + ', same: ' + m.a.interference.same + ' }');
  }
  if (m.sofaIdx.length && !m.sofaTurns) console.log('  · 有沙发但最短解没用到转体');
  if (m.concentric.length) console.log('  · 同心扇形装配体: ' + JSON.stringify(m.concentric));
}
console.log('\n结论: ' + (bad ? bad + ' 项需要注意' : '全部通过'));
