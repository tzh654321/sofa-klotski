/* 重算所有关卡的难度 + 解法（"手"的定义改成"一次拖动可拐弯"之后必须重算一遍）
 *
 *   node tools/recompute.js                 # 全部重算
 *   node tools/recompute.js --only 待分类    # 只算某个关卡集
 *   node tools/recompute.js --file levels/待分类/09_深夜食堂.json
 *   node tools/recompute.js --cap 1200000   # 枚举上限（默认 90 万）
 *
 * 调度：**一个核专门派活**（父进程只做分发和汇总，自己不跑搜索），
 * 其余每个核各开一个 worker，**一次只拿一个任务**，干完再领下一个。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const ROOT = path.join(__dirname, '..', 'levels');
const argv = process.argv.slice(2);
const argOf = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ONLY_SET = argOf('--only');
const ONLY_FILE = argOf('--file');
const CAP = +(argOf('--cap') || 1200000);   // 与 test/levels 的体检上限一致（1.2M）
const JOBS_ARG = +(argOf('--jobs') || 0);

/* 不计分的关：
 *   - 空盘已删；老存档里若还有，按名字兜底跳过；
 *   - 随机型关卡（level.shuffle）每次局面都不一样，分数要用 tools/score-shuffle.js
 *     抽样去头尾平均，按单个局面算出来的分没有意义。 */
const SKIP_NAME = new Set(['空盘', '十五子']);
const SKIP_KEY = new Set();

function listFiles() {
  if (ONLY_FILE) return [path.resolve(ONLY_FILE)];
  const out = [];
  const one = (dir, f) => {
    if (!/\.json$/.test(f) || f[0] === '_') return;
    if (!fs.statSync(path.join(dir, f)).isFile()) return;
    let rec = null;
    try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { }
    if (!rec) return;
    if (rec.level && rec.level.shuffle) return;               // 随机型关卡：见 score-shuffle
    if (SKIP_NAME.has(rec.name) || SKIP_KEY.has(rec.lvKey)) return;
    out.push(path.join(dir, f));
  };
  const entries = fs.readdirSync(ROOT).filter(n => n[0] !== '_').sort();
  // 根目录平铺的关 = 「待分类」，只扫一遍
  if (!ONLY_SET || ONLY_SET === '待分类') for (const f of entries) {
    if (!fs.statSync(path.join(ROOT, f)).isDirectory()) one(ROOT, f);
  }
  for (const name of entries) {
    const abs = path.join(ROOT, name);
    if (!fs.statSync(abs).isDirectory()) continue;
    if (ONLY_SET && name !== ONLY_SET) continue;
    for (const f of fs.readdirSync(abs)) one(abs, f);
  }
  return out.sort();
}

const files = listFiles();
const cores = os.cpus().length;
// 留一个核专职调度；并发数还要压住内存（每个大局面 worker 能吃到 1GB+）
const NW = Math.max(1, Math.min(JOBS_ARG || 6, cores - 1, files.length));
console.log('共 ' + files.length + ' 关，' + cores + ' 核 → ' + NW + ' 个 worker（另 1 核调度）·上限 ' + CAP +
  ' · 可用内存 ' + (os.freemem() / 2 ** 30).toFixed(1) + 'GB');

const queue = files.slice();
const t0 = Date.now();
let done = 0, bad = 0;
const workers = [];
let stopping = false;

function feed(w) {
  if (stopping) return;
  const file = queue.shift();
  if (!file) { w.job = null; return; }
  w.job = file;
  w.child.send({ file, cap: CAP });
}

function finish() {
  stopping = true;
  workers.forEach(w => { try { w.child.kill(); } catch (e) { } });
  console.log('\n重算完成：' + done + ' 关' + (bad ? '，' + bad + ' 关出错' : '') +
    '，用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's（目录即清单，无需另行同步）');
  console.log('记得跑 node tools/build-levelpacks.js');
  process.exit(bad ? 1 : 0);
}

for (let k = 0; k < NW; k++) {
  const child = fork(path.join(__dirname, 'recompute-worker.js'), { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const w = { child, job: null };
  workers.push(w);
  child.on('message', m => {
    const rel = m.file ? path.relative(path.join(__dirname, '..'), m.file).replace(/\\/g, '/') : '?';
    if (m.ok) {
      done++;
      const meta = m.meta;
      console.log('[' + String(done).padStart(2) + '/' + files.length + '] ' + rel.padEnd(28) +
        (meta && meta.score != null
          ? ' ' + String(meta.score).padStart(3) + ' 分 ' + String(meta.grade || '').padEnd(3) +
            ' 深' + (meta.depth == null ? '—' : meta.depth) + ' 手' + (meta.hands == null ? '—' : meta.hands) +
            ' 态' + meta.states + (meta.estimated ? '(估)' : '')
          : ' —') + '  ' + (m.ms / 1000).toFixed(1) + 's');
    } else {
      bad++;
      console.log('[' + String(done + bad).padStart(2) + '/' + files.length + '] ' + rel + ' 出错：' + m.err);
    }
    w.job = null;
    if (!queue.length) {
      if (workers.every(x => !x.job)) finish();
      return;
    }
    feed(w);
  });
  child.on('exit', code => {
    if (stopping) return;
    if (w.job) {                      // worker 意外退出：这一关算失败，继续派后面的
      bad++;
      console.log('！worker 退出(code ' + code + ')，放弃 ' + path.basename(w.job));
      w.job = null;
      if (!queue.length && workers.every(x => !x.job)) finish();
    }
  });
  feed(w);
}
