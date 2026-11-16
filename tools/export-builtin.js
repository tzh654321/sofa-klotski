/* 把 levels.js 里的内置关卡导出成「一关一文件」，按关卡集分文件夹。
 *   用法：node tools/export-builtin.js
 * 华容之书那套由 tools/import-hrs.js 生成，这里只处理其余三套。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');
const LV = require('../levels.js');

const ROOT = path.join(__dirname, '..', 'levels');
const ROOT_SET = '待分类';                       // 这个"关卡集"= levels 根目录
const setDir = set => (set === ROOT_SET ? ROOT : path.join(ROOT, set));
/* 关卡集 → 目录：'待分类' 不是文件夹，写进 levels 根目录（见 tools/build-levelpacks.js 的 setDir） */
const PLAN = {
  '待分类': ['yinQingYuanQue', 'lockedGate', 'furnitureMall', 'sofaSeat', 'hengDaoWanMa', 'shangXiaHui', 'wanLiZhengTu', 'cengCengSheKa'],
  '随机型关卡': ['fifteen'],
  '合移位': []
};
const TIP = {
  yinQingYuanQue: '4×4 · 三个半圆拼月相',
  lockedGate: '4×5 · 横刀立马去掉一卒 + 一块焊死的墙',
  furnitureMall: '5×5 · 两块各自归位',
  sofaSeat: '5×4 · 把沙发搬到底行右端',
  hengDaoWanMa: '4×5 · 桌上放一把沙发',
  shangXiaHui: '4×4 · 两块隔格双联在半路交汇',
  wanLiZhengTu: '4×7 · 已知最长关',
  cengCengSheKa: '4×5 · 三横一竖沙发关最长',
  fifteen: '4×4 · 数字华容道'
};

function analyze(lv) {
  const raw = SH.resolve(JSON.parse(JSON.stringify(lv)));
  const L = K.parse(raw), st = K.initialState(raw);
  const out = { meta: lv.meta || null, solution: null };
  let q = K.quickSolve(L, st, raw.goals, { maxNodes: 200000, weight: 4 });
  if ((!q || !q.ok) && lv.pieces.length < 20) q = K.quickSolve(L, st, raw.goals, { maxNodes: 1500000, weight: 6 });
  if (q && q.ok) {
    out.solution = {
      solver: 'quick-A*', optimal: !!(lv.meta && lv.meta.depth === q.moves.length),
      steps: q.moves.length,
      hands: K.handsOf ? K.handsOf(L, q.states, q.moves).length : K.mergeMoves(q.moves).length,
      moves: q.moves
    };
  }
  // quickSolve 偶尔会放弃（加权启发式卡住）：退到精确 BFS，别把「参考解法」弄丢
  if (!out.solution) {
    const ex = K.solve(L, st, raw.goals, { maxNodes: 1500000 });
    if (ex && ex.ok) {
      out.solution = { solver: 'bfs-optimal', optimal: true, steps: ex.moves.length,
        hands: K.handsOf(L, ex.states, ex.moves).length, moves: ex.moves };
    }
  }
  return out;
}


/** 把目录里不在名单内的 json 挪到 levels/_trash/<集>/（沙箱里 unlink 常被拦，rename 稳） */
function pruneDir(dir, keep) {
  const trash = path.join(ROOT, '_trash', path.basename(dir));
  let moved = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.json$/.test(f) || f[0] === '_') continue;
    if (keep.indexOf(f) >= 0) continue;
    try {
      fs.mkdirSync(trash, { recursive: true });
      fs.renameSync(path.join(dir, f), path.join(trash, f));
      moved++;
    } catch (e) { console.warn('  ！挪不动 ' + f + '（' + e.message + '）'); }
  }
  if (moved) console.log('  ' + moved + ' 个旧文件挪到 levels/_trash/' + path.basename(dir) + '/');
}

let total = 0;
for (const set of Object.keys(PLAN)) {
  const dir = setDir(set);
  fs.mkdirSync(dir, { recursive: true });
  const keep = [];        // 写完后把不在名单里的旧文件挪走
  const manifest = [];
  PLAN[set].forEach((key, i) => {
    const fn = LV[key];
    if (typeof fn !== 'function') { console.log('！没有这一关：' + key); return; }
    const lv = fn();
    const num = String(i + 1).padStart(2, '0');
    const name = lv.name;
    // 4阶数字华容道走专用 PDB 求解，通用 analyze 只会给个没意义的"参考解"：
    // meta 用 levels.js 里的抽样估算分，文件里已有的 meta/解法原样保留
    const an = key === 'fifteen' ? { meta: null, solution: null } : analyze(lv);
    const rec = {
      set, id: set + '-' + num, name, origin: '', lvKey: key, note: TIP[key] || '',
      source: 'levels.js', tip: TIP[key] || '',
      level: JSON.parse(JSON.stringify(lv)),
      meta: an.meta, solution: an.solution
    };
    delete rec.level.meta;
    const fn2 = num + '_' + name + '.json';
    // 4阶数字华容道：meta 是 tools/score-p15.js 抽样算出来的（带 sample/optimal/parts），
    // 别用 levels.js 那张简化表覆盖它 —— 先读旧文件把 meta 原样接过来
    if (key === 'fifteen') {
      try {
        const oldF = JSON.parse(fs.readFileSync(path.join(dir, fn2), 'utf8'));
        if (oldF && oldF.meta) rec.meta = oldF.meta;
      } catch (e) { if (!rec.meta) rec.meta = lv.meta || null; }
    }
    // 同名旧文件里如果已经有解法，且回放还能走到目标，就继续用它（解法由 recompute 负责更新）
    if (!rec.solution) {
      try {
        const oldP = path.join(dir, fn2);
        if (fs.existsSync(oldP)) {
          const oldRec = JSON.parse(fs.readFileSync(oldP, 'utf8'));
          const ms = oldRec.solution && oldRec.solution.moves;
          if (ms && ms.length) {
            const raw2 = SH.resolve(JSON.parse(JSON.stringify(rec.level)));
            const L2 = K.parse(raw2);
            let st2 = K.initialState(raw2);
            for (const m of ms) st2 = K.apply(st2, m);
            if (K.isGoal(L2, st2, raw2.goals)) rec.solution = oldRec.solution;
          }
        }
      } catch (e) { /* 旧文件坏了就算了 */ }
    }
    keep.push(fn2);
    fs.writeFileSync(path.join(dir, fn2), JSON.stringify(rec, null, 1) + '\n', 'utf8');
    manifest.push({ file: fn2, name, origin: key, meta: an.meta, ok: !!an.solution });
    total++;
  });
  // 手工关（source 不是 levels.js，比如 tools/add-levels.js 写进来的）不能被清掉：
  // 原样保号接在后面，并一起写进清单（打包以清单为准）
  for (const f of fs.readdirSync(dir)) {
    if (!/\.json$/.test(f) || f[0] === '_') continue;
    let rec = null;
    try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    if (rec.source === 'levels.js') continue;          // 自己的旧文件：不在名单里就让 prune 挪走
    keep.push(f);
    manifest.push({ file: f, name: rec.name, origin: rec.origin || '', meta: rec.meta || null,
      ok: !!(rec.solution && rec.solution.moves) });
  }
  pruneDir(dir, keep);
  console.log(set.padEnd(4) + ' ' + manifest.length + ' 关' +
    (manifest.length ? '：' + manifest.map(m => m.name + '(' + (m.meta ? m.meta.score : '—') + ')').join(' ') : ''));
}
console.log('\n共 ' + total + ' 关写进 levels/');
