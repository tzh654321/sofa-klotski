/* 用**关卡里已经存好的解法**重新打分（不跑搜索）
 *
 *   node tools/score-solution.js levels/合移位/11_汉诺塔·塞块29.json
 *   node tools/score-solution.js --only 合移位
 *
 * 什么时候用它：局面太大、analyze 一跑就把内存撑爆的关（塞块 29/41、织布机那种 8×8 以上、
 * 或者一百多个 1×1 的关）。这些关的分数本来也只能按"参考解的结构"估，跑搜索既没有意义也跑不动。
 *
 * 和 tools/recompute.js 的分工：
 *   - recompute：正常关，跑 analyze 拿最短解/估算，顺带把解法也写回；
 *   - 本工具：只认已有解法，重算 meta 里的分与认知结构，**不动 solution**。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');

const ROOT = path.join(__dirname, '..', 'levels');
const argv = process.argv.slice(2);
const argOf = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };

function listFiles() {
  const one = p => p;
  const out = [];
  const walk = d => {
    for (const f of fs.readdirSync(d)) {
      if (f[0] === '_') continue;
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (/\.json$/.test(f)) out.push(p);
    }
  };
  const only = argOf('--only');
  const files = argv.filter(a => a.endsWith('.json'));
  if (files.length) return files.map(f => path.resolve(f));
  if (only) { const d = path.join(ROOT, only); return fs.existsSync(d) ? (walk(d), out) : []; }
  walk(ROOT);
  return out;
}

let done = 0, skipped = 0;
for (const file of listFiles()) {
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { continue; }
  if (!rec || !rec.level || !rec.level.pieces) continue;
  const mv = rec.solution && rec.solution.moves;
  if (!mv || !mv.length) { skipped++; console.log('跳过（没有解）', path.relative(path.join(__dirname, '..'), file)); continue; }
  const raw = SH.resolve(JSON.parse(JSON.stringify(rec.level)));
  const L = K.parse(raw), st = K.initialState(raw);
  const t0 = Date.now();
  let cur = st;
  for (const m of mv) cur = K.apply(cur, m);
  if (!K.isGoal(L, cur, raw.goals)) { skipped++; console.log('跳过（解法回放没达成）', path.relative(path.join(__dirname, '..'), file)); continue; }
  const est = K.estimatePath(L, st, raw.goals, mv);
  if (!est) { skipped++; continue; }
  const d = K.difficulty({ depth: -1, estimate: est, truncated: true, stopped: false, states: 0 });
  const c = est.cognition || {};
  rec.meta = {
    score: d ? d.score : null, grade: d ? d.grade : null,
    depth: null,
    hands: est.hands,
    states: 0, paths: 0, waste: 0, same: 0,
    estimated: true,
    scoringVersion: 3,
    estimate: { ...est, moves: undefined },
    parts: d ? d.parts : null,
    version: d ? (d.version || null) : null,
    unsolved: true,
    confidence: d ? d.confidence : null,
    cognition: {
      active: c.active, switches: c.switches, revisits: c.revisits, retreats: c.retreats,
      maxSetup: c.maxSetup, temptation: +(+c.temptation || 0).toFixed(2)
    },
    ms: Date.now() - t0
  };
  rec.solution = { ...rec.solution, steps: mv.length, hands: est.hands };
  fs.writeFileSync(file, JSON.stringify(rec, null, 1) + '\n', 'utf8');
  done++;
  console.log(path.relative(path.join(__dirname, '..'), file).padEnd(36) +
    String(rec.meta.score).padStart(4) + ' 分 ' + String(rec.meta.grade || '').padEnd(3) +
    ' 手' + est.hands + ' 步' + mv.length);
}
console.log('\n打了 ' + done + ' 关' + (skipped ? '，跳过 ' + skipped + ' 关' : '') + '。记得跑 node tools/build-levelpacks.js');
