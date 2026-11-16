/* levels.test.js — 关卡库体检
 *   1) 布局合法（界内、无重叠、有目标）
 *   2) 可解，且步数/手数/状态数/路径数与 meta 里记录的一致（改了布局就必须重算）
 *   3) meta 的难度分 == 现算的难度分，且不把状态空间当难度
 *   4) 每关的机制真的出现在最短解里（沙发转体 / 扇形 / 锁定 / 多目标 / 异形块）
 * 大局面（十五子）只检查布局，不做穷举。
 *
 * 穷举（analyze + solve）很贵，所以丢给 worker 线程池并行跑；核数越多越快。
 */
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const K = require('../sofa-klotski.js');
const { resolve } = require('../shapes.js');
const { validate } = require('../tools/grade.js');
const LEVELS = require('../levels.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

const WORKER = path.join(__dirname, '_grade-worker.js');

/* 不穷举的关：
 *   fifteen     —— 10^13 级状态空间
 *   wanLiZhengTu —— 1348 步 / 134 万态，重算一次 2 分钟；分数用关卡里预置的 meta
 * 想强制全量核对：SOFA_HEAVY=1 node test/levels.test.js */
const SKIP_GRADE = new Set(process.env.SOFA_HEAVY === '1' ? ['fifteen'] : ['fifteen', 'wanLiZhengTu']);

function gradeInWorker(raw) {
  return new Promise(resolveP => {
    const w = new Worker(WORKER, { workerData: { raw } });
    let done = false;
    w.on('message', m => { done = true; resolveP(m); w.terminate(); });
    w.on('error', e => { if (!done) { done = true; resolveP({ ok: false, error: String((e && e.stack) || e) }); } });
    w.on('exit', () => { if (!done) resolveP({ ok: false, error: 'worker 提前退出' }); });
  });
}

/** 简单并发池 */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

(async () => {
  const t0 = Date.now();
  const keys = Object.keys(LEVELS).filter(k => k !== 'blank');
  const raws = {}, parsed = {}, checks = {};

  for (const key of keys) {
    const raw = LEVELS[key]();
    raws[key] = raw;
    const rr = resolve(raw);
    const L = K.parse(rr), st = K.initialState(rr);
    parsed[key] = { L, st };
    // 有的关卡（用户导入的传统布局）没打 hero 标记，按目标块认主角
    const goalIdx = L.pieces.findIndex(p => p.id === raw.goals[0].piece);
    checks[key] = {
      bad: validate(raw),
      hero: L.pieces.find(p => p.hero) || (goalIdx >= 0 ? L.pieces[goalIdx] : null),
      goals: raw.goals.length
    };
  }

  // 十五子不穷举
  const heavy = keys.filter(k => !SKIP_GRADE.has(k));
  const cores = Math.max(2, Math.min(os.cpus().length - 1, 8));
  console.log('并行穷举 ' + heavy.length + ' 关（' + cores + ' 线程）…');
  const graded = await pool(heavy, cores, k => gradeInWorker(raws[k]));
  const G = {};
  heavy.forEach((k, i) => { G[k] = graded[i]; });

  for (const key of keys) {
    const raw = raws[key], L = parsed[key].L, st = parsed[key].st;
    console.log('\n[' + key + '] ' + raw.name + '  ' + raw.w + '×' + raw.h + '  ' + raw.pieces.length + ' 块');

    ok(!checks[key].bad.length, '布局合法（无越界/重叠）', checks[key].bad.slice(0, 3));
    if (key !== 'fifteen') ok(!!checks[key].hero, '有主角/目标块');
    ok(checks[key].goals > 0, '有目标');

    if (key === 'fifteen') {
      ok(!!raw.meta && raw.meta.score > 0, '4阶数字华容道带抽样估算分', raw.meta && raw.meta.score);
      ok(raw.meta && raw.meta.estimated === true, '标明是估算分');
      continue;
    }
    if (SKIP_GRADE.has(key)) {
      ok(!!raw.meta, '带预置评分（超大关，跳过穷举）');
      ok(raw.meta && raw.meta.score >= 38, '预置分数不低于 38', raw.meta && raw.meta.score);
      ok(raw.meta && raw.meta.depth > 0 && raw.meta.hands > 0, '预置分含深度与手数',
        raw.meta && [raw.meta.depth, raw.meta.hands]);
      continue;
    }

    const g = G[key];
    if (!g || !g.ok) { ok(false, '穷举跑完（worker）', g && g.error); continue; }
    const meta = raw.meta;
    ok(!g.res.truncated, '可达状态在枚举上限内', g.res.states);
    ok(g.res.depth >= 0, '可解', g.res.reason || g.res.visited);
    if (g.res.depth >= 0) {
      ok(!!g.solve && g.solve.steps === g.res.depth, 'BFS 最短步数与 analyze 一致', [g.solve && g.solve.steps, g.res.depth]);
    }
    ok(!!meta, '关卡带 meta（难度分）');
    if (!(meta && g.diff)) continue;

    console.log('     深度 ' + g.res.depth + ' 步 / ' + g.res.hands + ' 手 · 状态 ' + g.res.states +
      ' · 路径 ' + g.res.paths + ' · 岔路代价/步 ' + g.res.interference.waste +
      ' → ' + g.diff.score + ' 分 ' + g.diff.grade);
    ok(meta.score === g.diff.score, 'meta.score 与现算一致（改布局要重算）', [meta.score, g.diff.score]);
    ok(meta.depth === g.res.depth, 'meta.depth 一致', [meta.depth, g.res.depth]);
    // 手数记的是 analyze 那条最短路径的（面板显示的就是它）；最短路径不唯一，
    // solve 的 tie-break 可能给出另一条、手数差 1~2，所以别拿 solve.hands 比
    ok(meta.hands === g.res.hands, 'meta.hands 一致（与难度面板同源）', [meta.hands, g.res.hands]);
    ok(meta.grade === g.diff.grade, 'meta.grade 一致', [meta.grade, g.diff.grade]);
    ok(meta.states === g.res.states, 'meta.states 一致', [meta.states, g.res.states]);
    // 分数档位会随模型重标定（v2 的 38 分 = v3 的 54 分左右），所以按"档位"判，不按写死的分数
    ok(g.diff.grade !== '太简单', '不进关卡库的「太简单」不该出现', [g.diff.score, g.diff.grade]);
    // 评分模型：操作长度 + 调度结构 + 选择干扰；状态空间与路径总数不再计分。
    // 版本号会随模型迭代往上走（2 → 3 → …），别把具体数字写死，只要求是新版结构化模型
    ok(typeof g.diff.version === 'number' && g.diff.version >= 2,
      '难度分用当前结构化模型（v' + g.diff.version + '）', g.diff.version);
    ok(typeof g.diff.parts.depth === 'number' && typeof g.diff.parts.planning === 'number' &&
      typeof g.diff.parts.choice === 'number', '分项里有 操作长度 / 调度 / 选择干扰', Object.keys(g.diff.parts));
    ok(g.diff.parts.space === 0, '状态空间不再参与打分（space = 0）', g.diff.parts.space);
    ok(g.diff.parts.depth + g.diff.parts.planning + g.diff.parts.choice <= g.diff.score + 1,
      '三个分项加起来不超过总分（还要乘长度门槛）', [g.diff.parts, g.diff.score]);
    ok(!g.diff.estimated, '枚举完整时不是估算分', g.diff.estimated);
    ok(g.res.interference && g.res.interference.waste > 0, '量到了岔路代价', g.res.interference);

    /* 最短解里用到哪些机制（复用 worker 里那次 solve，不再重跑） */
    const mv = g.moves || [];
    const rotIds = mv.filter(m => m.t === 'r').map(m => m.i);
    const crCount = mv.filter(m => m.t === 'cr').length;
    if (key === 'hengDaoWanMa' || key === 'sofaSeat') {
      const sofa = L.pieces.map((p, i) => (p.rotMode === 'sofa' ? i : -1)).filter(i => i >= 0);
      ok(rotIds.some(i => sofa.indexOf(i) >= 0), '最短解里沙发真的转过体（' +
        rotIds.filter(i => sofa.indexOf(i) >= 0).length + ' 次）');
    }
    if (key === 'yinQingYuanQue') {
      ok(L.pieces.some(p => p.sector), '有只能绕圆心转的扇形块');
    }
    if (key === 'lockedGate') ok(L.pieces.some(p => p.lock), '有锁定块当墙');
    if (key === 'furnitureMall') ok(raw.goals.length === 2, '这一关有两个目标', raw.goals.length);
    if (key === 'shangXiaHui') {
      const multi = L.pieces.filter(p => p.custom &&
        K.components(p.desc.map(q => [q.c, q.r])).length > 1);
      ok(multi.length === 2, '两个自绘异形块（隔格双联）都是多段', multi.length);
      ok(multi.every(p => p.rotPlay === false), '多段自制块不能转（只许整体平移）');
      ok(raw.goals.length === 2, '两个目标', raw.goals.length);
    }
    // 全库通用：非扇形、非沙发的块在试玩/求解里都不能转
    const illegal = L.pieces.filter(p => p.rotPlay && !p.sector && p.rotMode !== 'sofa');
    ok(illegal.length === 0, '没有"非扇形/非沙发却可转"的块', illegal.map(p => p.name));
  }

  /* 关卡库的取舍：已删掉的同构/下位替代关不该再出现 */
  for (const gone of ['halfMoon', 'cornerStone', 'thinEscape', 'fullMoon', 'shaBan', 'setSquare', 'twinGoals'])
    ok(LEVELS[gone] === undefined, '已删除/改名的关卡 ' + gone);
  ok(Object.keys(LEVELS).length >= 10, '关卡列表有 10 关以上（含空盘）', Object.keys(LEVELS).length);

  console.log('\n穷举耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's（' + cores + ' 线程）');
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
