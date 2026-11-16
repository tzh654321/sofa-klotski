/* 求解器 UI 测试：node test/solver-ui.test.js */
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp');

const PAGE = path.join(__dirname, '..', 'index.html');
const OUT = path.join(__dirname, '..', 'shots');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  const b = await launch(PAGE);
  const ev = b.evalJs;
  const txt = sel => ev(`document.querySelector("${sel}").textContent.trim()`);

  console.log('\n[1] 参考局面：分析可达域');
  ok(await ev('typeof SofaCspace === "object"'), '位形空间模块已加载');
  await ev('document.getElementById("btnReach").click()');
  await sleep(900);
  const reachTxt = await txt('#sReach');
  const posTxt = await txt('#sPos');
  const msg = await txt('#solverMsg');
  console.log(`     可达位姿 ${reachTxt} / 重心格位 ${posTxt}`);
  console.log(`     ${msg}`);
  ok(+reachTxt.replace(/,/g, '') >= 1, '至少 1 个可达位姿');
  ok(+reachTxt.replace(/,/g, '') <= 5, '参考局面下沙发基本被卡死（个位数）', reachTxt);
  ok(await ev('gReach.children.length > 0'), '棋盘上画出了可达域覆盖层');
  ok(await ev('+document.getElementById("solverBadge").textContent.replace(/\\D/g,"") > 0'), '空闲位形数已显示');

  console.log('\n[2] 一步前瞻：该先挪哪块');
  await ev('document.getElementById("btnRank").click()');
  await sleep(2500);
  const rank = await txt('#rankList');
  const links = await ev('[...document.querySelectorAll("#rankList a")].map(a=>a.textContent.trim()).join(" | ")');
  console.log('     排序: ' + links);
  ok(await ev('document.querySelectorAll("#rankList a").length >= 1'), '给出了候选移动');
  ok(links.includes('c 挪'), '包含浅蓝 2×1 的移动建议');

  console.log('\n[3] 执行首选建议后，可达域应显著变大');
  const before = +(await txt('#sReach')).replace(/,/g, '');
  await ev('document.querySelectorAll("#rankList a")[0].click()');
  await sleep(1200);
  const after = +(await txt('#sReach')).replace(/,/g, '');
  const cpos = JSON.parse(await ev('JSON.stringify([blocks.find(z=>z.id==="c").x, blocks.find(z=>z.id==="c").y])'));
  console.log(`     浅蓝块 -> (${cpos}) , 可达位姿 ${before} -> ${after}`);
  ok(cpos[0] === 1 && cpos[1] === 3, '浅蓝 2×1 下移一格到 (1,3)');
  ok(after > before * 5, '可达位姿数量级上升', { before, after });
  await b.shot(path.join(OUT, 'solver-reach.png'));

  console.log('\n[4] 目标合法但不可达时要说清楚');
  await ev('loadLevel(levelRef())'); await sleep(200);
  // 横躺 (1.5,3.5) 在此布局里是合法姿态，但沙发从竖着那儿过不去
  ok(await ev('SofaGeom.conflict(L, blocks, {cx:1.5,cy:3.5,deg:90}, SOFA) === null'), '目标姿态本身合法');
  await ev('goal = {cx:1.5, cy:3.5, deg:90}; syncScene(); document.getElementById("btnSolve").click()');
  await sleep(1500);
  const m4 = await txt('#solverMsg');
  console.log('     ' + m4);
  ok(m4.includes('不可达'), '明确报告目标不可达');
  ok(await txt('#sGoalOk') === '不可达', '目标可达性标记为不可达');

  console.log('\n[5] 空白棋盘：设目标 -> 重置 -> 求解并播放');
  await ev('loadLevel(levelBlank())'); await sleep(200);
  await ev('goal = {cx:2, cy:3.6, deg:90}; syncScene()');
  ok(await ev('SofaGeom.conflict(L, blocks, goal, SOFA) === null'), '目标姿态合法');
  await ev('reset()'); await sleep(200);
  const startPose = JSON.parse(await ev('JSON.stringify(sofa)'));
  console.log('     起点 ' + JSON.stringify(startPose));
  ok(Math.abs(startPose.cy - 2.5) < 0.01 && Math.abs(startPose.deg) < 0.01, '已重置回起点 (2, 2.5, 0°)');

  await ev('document.getElementById("btnSolve").click()');
  await sleep(700);
  const m5 = await txt('#solverMsg');
  console.log('     ' + m5);
  ok(m5.includes('目标可达'), '报告目标可达并开始播放');
  const p1 = JSON.parse(await ev('JSON.stringify({cx:sofa.cx,cy:sofa.cy,deg:sofa.deg})'));
  await sleep(1000);
  const p2 = JSON.parse(await ev('JSON.stringify({cx:sofa.cx,cy:sofa.cy,deg:sofa.deg})'));
  console.log(`     播放中 ${JSON.stringify(p1)} -> ${JSON.stringify(p2)}`);
  ok(Math.abs(p2.deg - p1.deg) > 1 || Math.abs(p2.cy - p1.cy) > 0.05, '沙发在动（自动播放）');
  ok(await ev('sofaConflict(sofa)===null'), '播放中的姿态始终合法');
  await sleep(4000);
  await b.shot(path.join(OUT, 'solver-play.png'));
  const endPose = JSON.parse(await ev('JSON.stringify(sofa)'));
  console.log('     结束位姿 ' + JSON.stringify(endPose));
  ok(Math.abs(endPose.cx - 2) < 0.06 && Math.abs(endPose.cy - 3.6) < 0.06, '停在目标位置', endPose);
  ok(Math.abs(((endPose.deg - 90) % 360 + 360) % 360) < 3, '角度到达 90°', endPose.deg);

  console.log('\n[6] 页面无未捕获异常');
  ok(b.errors.length === 0, '没有 JS 异常', b.errors.slice(0, 2));

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}  ${pass} passed, ${fail} failed`);
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
