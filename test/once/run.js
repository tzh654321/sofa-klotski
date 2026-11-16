/* 跑 test/once/ 下的全部一次性体检
 *   node test/once/run.js            串行跑，最后汇总
 *   node test/once/run.js --only forest   只跑名字含 forest 的
 *
 * 这些测试**不在** test/run-all.js 里（锁的是某一关的具体内容，改关就会红）。
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
let files = fs.readdirSync(__dirname).filter(f => /\.test\.(js|cjs)$/.test(f)).sort();
if (only) files = files.filter(f => f.indexOf(only) >= 0);
if (!files.length) { console.log('没有要跑的文件'); process.exit(0); }

console.log('一次性体检 ' + files.length + ' 个（不参与全量回归）\n');
const runOne = f => new Promise(res => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join(__dirname, f)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => {
    const lines = out.split(/\r?\n/).filter(l => /ALL PASS|FAILED|通过|PASS/.test(l));
    res({ f, code, ms: Date.now() - t0, summary: lines.length ? lines[lines.length - 1].trim() : '', out });
  });
});

(async () => {
  const rows = [];
  for (const f of files) {
    const r = await runOne(f);
    rows.push(r);
    console.log('  ' + (r.ms / 1000).toFixed(1).padStart(6) + 's  ' + f.padEnd(30) +
      (r.code === 0 ? '✓ ' : '✗ ') + r.summary);
    if (r.code !== 0) console.log(r.out.split(/\r?\n/).filter(l => /FAIL|Error|error/.test(l)).slice(0, 6).map(l => '        ' + l).join('\n'));
  }
  const bad = rows.filter(r => r.code !== 0);
  console.log('\n' + (bad.length ? 'FAILED  ' + bad.length + ' / ' + rows.length + ' 个文件' : 'ALL PASS  ' + rows.length + ' 个文件'));
  process.exit(bad.length ? 1 : 0);
})();
