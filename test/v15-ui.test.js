/* 浏览器冒烟：选择框/终点框/无转轴图标 + 关卡库 + 试玩一步（截图为证） */
const path = require('path');
const { launch, sleep } = require('./cdp.js');

(async () => {
  const page = path.join(__dirname, '..', 'index.html');
  const b = await launch(page);
  const ev = b.evalJs;
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };
  const txt = sel => ev('(document.querySelector(' + JSON.stringify(sel) + ')||{}).textContent');

  console.log('\n[1] 首屏：默认是第一套关卡集的第一关');
  ok((await ev('raw.name')) === '阴晴圆缺', '默认关卡 = 待分类里的「阴晴圆缺」', await ev('raw.name'));
  // 关卡数每次加关都会变：从页面里的关卡包算，别写死数字
  const TOTAL0 = await ev('LEVELPACKS.reduce((a,p)=>a+p.levels.length,0)');
  // 默认排序会把子文件夹折叠成一行：先全部展开，再数「关卡行」（不含文件夹按钮本身）
  await ev(`openDirs = Object.fromEntries([...new Set(lib.map(e => e.dir).filter(d => d && d.indexOf('/') >= 0))].map(d => [d, true])); buildLevelList(); void 0`);
  await sleep(150);
  ok((await ev('document.querySelectorAll("#lvList button:not(.dir)").length')) === TOTAL0,
    '关卡列表 = 关卡包总数（' + TOTAL0 + ' 关，展开子文件夹后逐条列出）',
    await ev('document.querySelectorAll("#lvList button:not(.dir)").length'));
  ok((await ev('document.querySelectorAll(\'#board [data-part="axis"]\').length')) === 0, '不再画旋转中心图标');
  await b.shot(path.join(__dirname, '..', 'shots', 'v15-cover.png'));

  console.log('\n[2] 选中块的框：贴形状描边（不是每格虚线）');
  await ev('sel = 5; render(); void 0'); await sleep(120);
  const selPaths = await ev('document.querySelectorAll("#gSel path").length');
  const blur = await ev('!!document.getElementById("selGlow")');
  ok(blur, '定义了选中柔光滤镜');
  ok(selPaths >= 2, '选中块画了两层轮廓（柔光 + 实线）', selPaths);
  ok((await ev('document.querySelectorAll(\'#board [data-part="axis"]\').length')) === 0, '选中沙发也不显示转轴');
  await b.shot(path.join(__dirname, '..', 'shots', 'v15-select.png'));

  console.log('\n[3] 终点框：并集轮廓 + 目标块名，浮在块上面也看得见');
  const goalPaths = await ev('document.querySelectorAll("#gGhost path").length + document.querySelectorAll("#gGoalTop path").length');
  ok(goalPaths >= 2, '终点框画成整块轮廓（底色 + 浮在块上的虚线框）', goalPaths);
  ok((await ev('document.querySelectorAll("#gGoalTop text").length')) >= 1, '终点框里写着目标块名字');
  ok((await ev('JSON.stringify([...document.querySelectorAll("#gGoalTop text")].map(t=>t.textContent))')).indexOf('月宫') >= 0,
    '终点标的是「月宫」');
  await b.shot(path.join(__dirname, '..', 'shots', 'v15-goal.png'));

  console.log('\n[4] 难度面板：新分项');
  await ev('document.querySelector(\'#tabs [data-mode="solve"]\').click()'); await sleep(150);
  await ev('document.getElementById("btnDiff").click()');
  // 等分析结束：dfScore 从 "—" 变成 "NN · 等级"（横刀立马几十万态，机器忙时要几十秒）
  await b.waitFor('/\\d+ · /.test(document.getElementById("dfScore").textContent)', 120000, 300);
  const df = JSON.parse(await ev(`JSON.stringify({
    score: document.getElementById("dfScore").textContent.trim(),
    depth: document.getElementById("dfDepth").textContent.trim(),
    branch: document.getElementById("dfBranch").textContent.trim(),
    waste: document.getElementById("dfWaste").textContent.trim(),
    same: document.getElementById("dfSame").textContent.trim(),
    msg: document.getElementById("dfMsg").textContent.trim()})`));
  console.log('     ' + JSON.stringify(df));
  ok(/困难|极难|中等/.test(df.score), '给出难度分与等级', df.score);
  ok(/手/.test(df.depth), '最短解（步/手）', df.depth);
  ok(/条/.test(df.same) && /步/.test(df.waste), '岔路代价与同优走法都有数', [df.waste, df.same]);
  ok(/操作长度/.test(df.msg) && /调度/.test(df.msg), '分项文案更新（v2 三项）', df.msg);
  await b.shot(path.join(__dirname, '..', 'shots', 'v15-diff.png'));

  console.log('\n[5] 试玩：缺口嘴被堵时沙发转不动（提示不合法）');
  await ev('document.querySelector(\'#tabs [data-mode="play"]\').click()'); await sleep(120);
  const rots = await ev('K.moves(L,st).filter(m=>m.t==="r").length');
  console.log('     开局转体走法数: ' + rots);

  console.log('\n[6] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
