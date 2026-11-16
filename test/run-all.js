/* 全量回归：并行跑所有测试文件
 *   node test/run-all.js            并行（默认 min(6, 核数-1) 路）
 *   node test/run-all.js --serial   串行（定位卡点用）
 *   node test/run-all.js --only v11 只跑名字含 v11 的
 * 每个文件独立进程、独立 Chrome，互不干扰。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['cdp.js', '_grade-worker.js', 'run-all.js', '_time-all.js']);

const files = fs.readdirSync(__dirname)
  .filter(f => /\.test\.(js|cjs)$/.test(f) && !SKIP.has(f))
  .sort()
  .map(f => 'test/' + f);
/* test/once/ 放「检查已有关卡是否符合要求」这类一次性体检（锁某一关的具体内容），
 * 不参与全量：关卡内容一改它们就会红，要用时 node test/once/run.js 单独跑。 */
const ONCE = (() => {
  try { return fs.readdirSync(path.join(__dirname, 'once')).filter(f => /\.test\.(js|cjs)$/.test(f)).length; }
  catch (e) { return 0; }
})();

const argv = process.argv.slice(2);
const serial = argv.includes('--serial');
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
const list = only ? files.filter(f => f.indexOf(only) >= 0) : files;

const SUMMARY = /ALL PASS|FAILED|全部通过|旋转回归通过|Chrome 实际页面旋转动画通过/;

function runOne(f) {
  return new Promise(res => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [f], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => {
      const lines = out.split(/\r?\n/).filter(l => SUMMARY.test(l));
      res({ f, code, ms: Date.now() - t0, summary: lines.length ? lines[lines.length - 1].trim() : '', out });
    });
  });
}

(async () => {
  const t0 = Date.now();
  const cores = Math.max(2, Math.min(os.cpus().length - 1, 6));
  const width = serial ? 1 : Math.min(cores, list.length);
  console.log('跑 ' + list.length + ' 个测试文件（' + (serial ? '串行' : width + ' 路并行') + '）…' +
    (ONCE ? '　另有 ' + ONCE + ' 个一次性内容体检在 test/once/（node test/once/run.js）' : '') + '\n');

  const results = new Array(list.length);
  let next = 0, done = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      results[i] = await runOne(list[i]);
      done++;
      const r = results[i];
      console.log('  [' + String(done).padStart(2) + '/' + list.length + '] ' +
        (r.ms / 1000).toFixed(1).padStart(6) + 's  ' + r.f.padEnd(32) +
        (r.code === 0 ? '✓ ' : '✗ ') + r.summary);
    }
  };
  await Promise.all(new Array(width).fill(0).map(worker));

  const bad = results.filter(r => r.code !== 0);
  const totalPass = results.reduce((n, r) => {
    const m = r.summary.match(/(\d+) passed/);
    return n + (m ? +m[1] : 0);
  }, 0);
  console.log('\n总计 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's，' + results.length + ' 个文件，' +
    totalPass + ' 条断言，' + (bad.length ? bad.length + ' 个文件失败' : '全部通过'));
  if (bad.length) {
    console.log('\n失败文件：');
    for (const r of bad) {
      console.log('\n── ' + r.f + ' (exit ' + r.code + ') ──');
      console.log(r.out.split(/\r?\n/).filter(l => /FAIL|Error|error/i.test(l)).slice(0, 12).join('\n'));
    }
  }
  process.exit(bad.length ? 1 : 0);
})();
