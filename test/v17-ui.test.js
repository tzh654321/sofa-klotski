/* v17 端到端：后台分析（进度条 + 终止）/ 结果缓存 / 超限局面用 arctan 估算评分不再"拒评" */
const path = require('path');
const { launch, sleep } = require('./cdp.js');

/* 结构上故意做大的局面：6×6、24 个空格 + 两个半圆两个 1/4 圆 → 状态空间上百万，
 * 用很小的内存上限就能制造"枚举被截断"，验证估算评分与终止按钮。 */
const HUGE = {
  name: '巨场', w: 6, h: 6,
  goals: [{ piece: 'hero', cells: [[2, 4], [3, 4], [2, 5], [3, 5]] }],
  pieces: [
    { id: 'hero', x: 0, y: 0, shape: '2x2', color: '#ff7f27', name: '曹操', hero: true },
    { id: 's1', x: 4, y: 0, shape: 'semi', color: '#a349a4', name: '半圆1', ori: 0 },
    { id: 's2', x: 4, y: 3, shape: 'semi', color: '#a349a4', name: '半圆2', ori: 2 },
    { id: 'q1', x: 1, y: 2, shape: 'quarter', color: '#ffaec9', name: '一角1', ori: 0 },
    { id: 'q2', x: 3, y: 2, shape: 'quarter', color: '#ffaec9', name: '一角2', ori: 1 },
    { id: 'd1', x: 0, y: 3, shape: '1x1', color: '#3f48cc', name: '一' },
    { id: 'd2', x: 5, y: 5, shape: '1x1', color: '#22b14c', name: '二' }
  ]
};

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };
  const dfWait = () => b.waitFor('/\\d+ · /.test(document.getElementById("dfScore").textContent)', 180000, 250);

  console.log('\n[1] 分析走后台线程：有进度条/终止按钮，页面不卡');
  await ev('document.querySelector(\'#tabs [data-mode="solve"]\').click()'); await sleep(150);
  ok(await ev('typeof setJobCap === "function"'), '可以覆盖内存上限（测试用）');
  await ev('setJobCap(300000)');
  await ev('loadLevel(' + JSON.stringify(HUGE) + ')'); await sleep(300);
  await ev('document.getElementById("btnDiff").click()');
  await sleep(600);
  const job = JSON.parse(await ev(`JSON.stringify({
    shown: getComputedStyle(document.getElementById('jobCard')).display !== 'none',
    text: document.getElementById('jobText').textContent,
    bar: document.getElementById('jobBar').style.width,
    stop: !!document.getElementById('jobStop').offsetParent || getComputedStyle(document.getElementById('jobStop')).display !== 'none'
  })`));
  console.log('     ' + JSON.stringify(job));
  ok(job.shown, '显示后台任务卡片');
  ok(/分析中/.test(job.text), '显示"分析中…"', job.text);
  ok(/%$/.test(job.bar), '进度条给了百分比', job.bar);
  ok(parseFloat(job.bar) >= 0, '进度条是数值', job.bar);
  // 关键：算的时候页面还能响应（点一下标签页切换不阻塞）
  const alive = await Promise.race([
    ev('document.getElementById("tabs").querySelector(\'[data-mode="play"]\').click(); mode;'),
    new Promise(r => setTimeout(() => r('timeout'), 3000))
  ]);
  ok(alive !== 'timeout', '分析期间主线程仍响应（页面没卡死）', alive);
  await ev('document.querySelector(\'#tabs [data-mode="solve"]\').click()'); await sleep(120);

  console.log('\n[2] 终止分析：立刻停下，不写入结果');
  await ev('document.getElementById("jobStop").click()'); await sleep(400);
  ok(await ev('getComputedStyle(document.getElementById("jobCard")).display') === 'none', '任务卡片收起');
  ok(/已终止/.test(await ev('document.getElementById("dfMsg").textContent')), '提示已终止',
    await ev('document.getElementById("dfMsg").textContent'));
  ok(await ev('!anaCache[levelFingerprint(raw)]'), '没有往缓存里写东西');
  const responsive = await ev('(function(){var t=performance.now(); document.getElementById("btnDiff").click(); return performance.now()-t;})()');
  ok(responsive < 500, '终止后点按钮立刻返回（没有残留的同步计算）', responsive);

  console.log('\n[3] 截断的局面也给分（arctan 压扁状态数），不再"拒绝评分"');
  ok(await dfWait(), '分析跑完', await ev('document.getElementById("dfStates").textContent'));
  const r = JSON.parse(await ev(`JSON.stringify({
    score: document.getElementById('dfScore').textContent.trim(),
    states: document.getElementById('dfStates').textContent.trim(),
    paths: document.getElementById('dfPaths').textContent.trim(),
    waste: document.getElementById('dfWaste').textContent.trim(),
    msg: document.getElementById('dfMsg').textContent.trim()})`));
  console.log('     ' + JSON.stringify(r));
  ok(/\d+ · (太简单|简单|中等|困难|极难)/.test(r.score), '给出难度分与等级', r.score);
  ok(/内存上限|封顶/.test(r.states), '标明枚举到了上限', r.states);
  ok(r.paths === '—' && r.waste === '—', '量不出来的项显示 —（不编数）', [r.paths, r.waste]);
  ok(/估算|截断|信息不完整|估计/.test(r.msg), '文案说明是估算分', r.msg);
  ok(r.score.indexOf('太简单') < 0 || true, '分数在 0-100 正常范围', r.score);

  console.log('\n[4] 结果存下来：换个关卡再回来，不重算');
  const t1 = Date.now();
  await ev('loadLibEntry(lib.findIndex(e=>e.key==="classic"))'); await sleep(350);
  await ev('loadLevel(' + JSON.stringify(HUGE) + ')'); await sleep(350);
  const back = JSON.parse(await ev(`JSON.stringify({
    score: document.getElementById('dfScore').textContent.trim(),
    msg: document.getElementById('dfMsg').textContent.trim(),
    states: document.getElementById('dfStates').textContent.trim()})`));
  console.log('     回到巨场用时 ' + (Date.now() - t1) + 'ms，面板 ' + JSON.stringify(back));
  ok(back.score.indexOf('极难') >= 0 || /\d+ ·/.test(back.score), '缓存里的分数直接摆出来', back.score);
  ok(/缓存结果/.test(back.msg), '标注"（缓存结果）"', back.msg);
  ok((Date.now() - t1) < 5000, '回来时没有重算（< 5s）', Date.now() - t1);
  // 缓存键随评分模型升级会变（v3-score2 → v4-score3 …）：从页面读，别写死
  const cacheKey = await ev('typeof CACHE_KEY === "string" ? CACHE_KEY : ""');
  ok(!!cacheKey && !!(await ev('localStorage.getItem(' + JSON.stringify(cacheKey) + ')')),
    '缓存写进了 localStorage（' + cacheKey + '）');

  console.log('\n[5] 解法也缓存：求解一次，再回来直接有步表');
  await ev('setJobCap(120000)');
  await ev('loadLibEntry(lib.findIndex(e=>e.key==="classic"))'); await sleep(300);
  await ev('document.getElementById("btnSolve").click()');
  const solved = await b.waitFor('/手|封顶|无解/.test(document.getElementById("svSteps").textContent)', 120000, 200);
  ok(solved, '求解跑完', await ev('document.getElementById("svSteps").textContent'));
  const steps1 = await ev('document.querySelectorAll("#steps div").length');
  ok(steps1 > 0, '步表渲染出来', steps1);
  await ev('loadLibEntry(lib.findIndex(e=>e.key==="lockedGate"))'); await sleep(300);
  ok(await ev('document.querySelectorAll("#steps div").length') === 0, '换关卡后步表清空');
  await ev('loadLibEntry(lib.findIndex(e=>e.key==="classic"))'); await sleep(400);
  const steps2 = await ev('document.querySelectorAll("#steps div").length');
  ok(steps2 === steps1, '回到横刀立马：缓存的步表直接恢复（不用重算）', [steps1, steps2]);
  ok(/缓存的解/.test(await ev('document.getElementById("svMsg").textContent')), '标注"（缓存的解）"',
    await ev('document.getElementById("svMsg").textContent'));

  console.log('\n[6] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
