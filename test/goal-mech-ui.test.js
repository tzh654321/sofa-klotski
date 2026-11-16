/* 目标新机制（界面层，真实 Chrome 页面）：空格目标 / 多落点 / 成组任一·全部
 *   node test/goal-mech-ui.test.js
 *
 * 重点不只是"按钮能用"：还把「界面不冗杂」写成断言 ——
 * 一条目标只占一行、检查器一次只展开一条、规则说明默认收起、按钮数有上限。
 */
const path = require('path');
const { launch, sleep } = require('./cdp.js');

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  let pass = 0, fail = 0;
  const ok = (c, m, x) => {
    c ? (pass++, console.log('  ok  ' + m))
      : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
  };
  const txt = sel => ev(`document.querySelector(${JSON.stringify(sel)}).textContent`);
  const shown = sel => ev(`(function(){const e=document.querySelector(${JSON.stringify(sel)});
    return !!e && getComputedStyle(e).display !== 'none';})()`);
  const cellPt = async (cx, cy) => JSON.parse(await ev(`(function(){
    const r=svg.getBoundingClientRect(), s=Math.min(r.width/L.w, r.height/L.h);
    return JSON.stringify({x:(r.left+(r.width-s*L.w)/2)+(${cx}+0.5)*s,
                           y:(r.top+(r.height-s*L.h)/2)+(${cy}+0.5)*s});})()`));
  const clickCell = async (cx, cy) => {
    const p = await cellPt(cx, cy);
    await b.mouse('mousePressed', p.x, p.y);
    await b.mouse('mouseReleased', p.x, p.y);
    await sleep(190);
  };
  const dragCell = async (a, c) => {
    const p = await cellPt(a[0], a[1]), q = await cellPt(c[0], c[1]);
    await b.mouse('mousePressed', p.x, p.y);
    await b.mouse('mouseMoved', q.x, q.y);
    await b.mouse('mouseReleased', q.x, q.y);
    await sleep(200);
  };
  const put = (i, x, y) => ev(`st[${i}].x=${x};st[${i}].y=${y};render();updateUI();true`);
  const goals = () => ev('JSON.stringify(raw.goals)').then(JSON.parse);

  const PIECES = [
    { id: 'a', x: 0, y: 0, ori: 0, shape: '1x1', color: '#ff7f27', name: '甲' },
    { id: 'b', x: 2, y: 0, ori: 0, shape: '1x1', color: '#00a2e8', name: '乙' }
  ];
  const load = () => ev(`loadLevel(${JSON.stringify({ name: '目标机制', w: 4, h: 3, goals: [], pieces: PIECES })})`);

  console.log('\n[1] 默认视图：目标卡只有一行一条 + 一排按钮');
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(160);
  await load(); await sleep(320);
  ok(await ev(`document.getElementById('goalHelp').open`) === false, '规则说明默认收起');
  ok(await shown('#goalInsp') === false, '没选中目标时检查器不占位');
  ok(await ev(`document.querySelectorAll('#goalList .prow').length`) === 0, '目标列表为空');
  ok((await txt('#goalList')).indexOf('还没有目标') >= 0, '空列表只写一句「还没有目标」');
  const btnCount = () => ev(`Array.from(document.getElementById('goalList').parentElement
    .querySelectorAll('button')).filter(x=>x.offsetParent!==null).length`);
  ok(await btnCount() === 3, '默认只有 3 个可见按钮（设置目标 / ＋空格 / 清空）', await btnCount());

  console.log('\n[2] 单块 → 一个落点：老写法仍是一行');
  await ev('sel = 0; updateUI();');
  await ev(`document.getElementById('btnSetGoalOne').click()`); await sleep(190);
  let G = await goals();
  ok(G.length === 1 && G[0].piece === 'a' && JSON.stringify(G[0].cells) === '[[0,0]]',
    '生成 {piece:"a", cells:[[0,0]]}', G);
  ok((await txt('#goalList .prow .nm')).indexOf('甲') >= 0, '列表文案带块名', await txt('#goalList .prow .nm'));
  ok(await shown('#goalInsp') === true, '选中后检查器才展开');
  ok(await shown('#giNeed') === false, '单块时「全部/任一」不显示（没意义就不摆）');
  ok(await shown('#giPlace') === true, '单块时只显示 ＋落点 / ＋块');
  ok(await ev('checkWin()') === true, '甲就在落点上 → 已达成');
  await put(0, 1, 0); await sleep(140);
  ok(await ev('checkWin()') === false, '挪开一格 → 未达成');

  console.log('\n[3] ＋落点：某块到几个位置之一，落点编号代替重复块名');
  await ev(`document.getElementById('btnGoalSpot').click()`); await sleep(190);
  G = await goals();
  ok(Array.isArray(G[0].spots) && G[0].spots.length === 2 && !('cells' in G[0]),
    '升级成 spots 数组（2 个落点）', G[0]);
  ok(await ev(`K.goalText(L, raw.goals[0])`) === '甲 → 2 个落点之一', '文案是「2 个落点之一」');
  ok(await ev(`document.querySelectorAll('#gGoalTop [data-spot]').length`) === 2,
    '棋盘上画出 2 个落点框', await ev(`document.querySelectorAll('#gGoalTop [data-spot]').length`));
  const labels = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#gGoalTop text')]
    .map(t=>t.textContent).filter(t=>/^[0-9]+$/.test(t)))`));
  ok(labels.length === 2 && labels.join(',') === '1,2', '多落点用 1/2 编号，不重复写块名', labels);
  ok(await txt('#btnGoalMove') === '结束设置', '加落点自动进入「设置目标」以便拖动');
  const s1 = JSON.parse(await ev('JSON.stringify(goalSpots(raw.goals[0])[1][0])'));
  await dragCell(s1, [s1[0] + 2, s1[1] + 1]); await sleep(160);
  const s1b = JSON.parse(await ev('JSON.stringify(goalSpots(raw.goals[0])[1][0])'));
  ok(JSON.stringify(s1b) === JSON.stringify([s1[0] + 2, s1[1] + 1]),
    '拖目标框就能改落点，不用填坐标', { from: s1, to: s1b });
  await put(0, s1b[0], s1b[1]); await sleep(140);
  ok(await ev('checkWin()') === true, '落在第二个落点同样达成');
  await put(0, 2, 2); await sleep(140);
  ok(await ev('checkWin()') === false, '两个落点都不在 → 未达成');

  console.log('\n[4] ＋块 → 成组：全部就位（位置可换）/ 任一就位');
  await clickCell(2, 0);
  ok(await ev('sel') === 1, '点棋盘选中第二块', await ev('sel'));
  await ev(`document.getElementById('btnGoalPiece').click()`); await sleep(190);
  G = await goals();
  ok(JSON.stringify(G[0].pieces) === '["a","b"]' && G[0].need === undefined,
    '两块并入一条目标（默认全部就位）', G[0]);
  ok(await shown('#giNeed') === true, '两块时才出现「全部/任一」这一排');
  ok(await ev(`K.goalText(L, raw.goals[0])`) === '全部：甲／乙 → 2 个落点', '成组·全部 文案');
  await put(0, 0, 0); await put(1, s1b[0], s1b[1]); await sleep(160);
  ok(await ev('checkWin()') === true, '两块各占一个落点 → 达成');
  await put(0, s1b[0], s1b[1]); await put(1, 0, 0); await sleep(160);
  ok(await ev('checkWin()') === true, '两块互换位置照样达成（位置可换）');
  await put(1, 2, 2); await sleep(140);
  ok(await ev('checkWin()') === false, '只有一块到位 → 全部就位下不算达成');
  await ev(`document.getElementById('btnGoalAny').click()`); await sleep(180);
  ok((await goals())[0].need === 'any', '切成「任一就位」');
  ok(await ev('checkWin()') === true, '任一就位：一块到位就达成');
  ok(await ev(`K.goalText(L, raw.goals[0])`) === '任一：甲／乙 → 2 个落点', '成组·任一 文案');
  await ev(`document.getElementById('btnGoalAll').click()`); await sleep(180);
  ok((await goals())[0].need === 'all', '可以切回「全部就位」');

  console.log('\n[5] ＋空格：点格子选空格目标，斜纹 + 「空」字');
  await put(0, 0, 0); await put(1, s1b[0], s1b[1]); await sleep(150);
  await ev(`document.getElementById('btnGoalEmpty').click()`); await sleep(190);
  G = await goals();
  ok(G.length === 2 && JSON.stringify(G[1]) === '{"empty":[]}', '新增一条待选格的空格目标', G[1]);
  ok((await txt('#goalList .prow:last-child .nm')).indexOf('待选格') >= 0,
    '没选格时列表写「待选格」而不是「无效目标」', await txt('#goalList .prow:last-child .nm'));
  ok(await shown('#giPlace') === false && await shown('#giNeed') === false,
    '空格目标下把归位类按钮全收起');
  ok(await shown('#giEmptyHint') === true, '只留一句点格提示');
  await clickCell(1, 2); await sleep(160);
  G = await goals();
  ok(JSON.stringify(G[1].empty) === '[[1,2]]', '点空格子加进目标', G[1].empty);
  ok(await ev(`document.querySelectorAll('#gGoalTop [data-kind="empty"]').length`) === 1, '画出空格轮廓');
  ok(await ev(`document.querySelectorAll('#gGhost rect[fill="url(#emptyHatch)"]').length`) === 1,
    '铺了一格斜纹');
  ok(await ev('checkWin()') === true, '两格都空 + 成组到位 → 全目标达成');
  await put(1, 1, 2); await sleep(150);
  ok(await ev('checkWin()') === false, '空格被乙占住 → 未达成');
  await clickCell(1, 2); await sleep(160);
  ok((await goals())[1].empty.length === 0, '已选的格子后来被块占了，再点一下仍能移出');
  await put(1, 2, 2); await sleep(150);
  await clickCell(2, 2); await sleep(160);
  ok((await goals())[1].empty.length === 0, '点在有块、又不是已选空格的地方不会误加格');
  ok(await ev('sel') === 1, '此时它仍然是「选中这块」', await ev('sel'));

  console.log('\n[6] 导出 → 载入：新字段一个不丢');
  await put(1, s1b[0], s1b[1]); await sleep(140);
  await clickCell(1, 2); await sleep(160);
  await ev(`document.getElementById('btnDump').click()`); await sleep(160);
  const dump = JSON.parse(await ev(`document.getElementById('jsonBox').value`));
  ok(Array.isArray(dump.goals[0].spots) && dump.goals[0].pieces.length === 2 && dump.goals[0].need === 'all',
    '导出里有 spots / pieces / need', dump.goals[0]);
  ok(Array.isArray(dump.goals[1].empty) && dump.goals[1].empty.length === 1,
    '导出里有 empty', dump.goals[1]);
  await ev(`document.getElementById('btnLoad').click()`); await sleep(320);
  ok(JSON.stringify(await goals()) === JSON.stringify(dump.goals), '载入后目标逐字段一致');
  ok(await ev(`K.goalText(L, raw.goals[1])`) === '空格 1 格', '载入后文案正确');
  ok(await ev('checkWin()') === true, '载入后判定仍然一致');

  console.log('\n[7] 不冗杂：一次只展开一条 + 列表封顶滚动 + 截图');
  ok(await ev(`document.getElementById('goalHelp').open`) === false, '规则说明仍是收起的');
  ok(await shown('#goalInsp') === false, '刚载入时检查器收起');
  ok(await ev(`document.querySelectorAll('#goalList .prow').length`) === 2, '两条目标 = 两行');
  await ev(`document.querySelectorAll('#goalList .prow')[0].click()`); await sleep(180);
  ok(await ev(`document.querySelectorAll('#goalList .prow.on').length`) === 1, '同时只有一条展开');
  ok(await ev(`document.querySelectorAll('#goalInsp').length`) === 1, '检查器只有一个（复用，不叠加）');
  ok(await ev(`getComputedStyle(document.getElementById('goalList')).maxHeight`) === '220px',
    '长列表封顶 220px 内部滚动');
  ok(await btnCount() <= 7, '目标卡可见按钮不超过 7 个', await btnCount());
  await b.shot(path.join(__dirname, '..', 'shots', 'goal-mech-ui.png'));
  ok(require('fs').statSync(path.join(__dirname, '..', 'shots', 'goal-mech-ui.png')).size > 10000,
    '整页截图已落盘');
  // 把右侧栏滚到目标卡，再单独截一张侧栏，直观检查信息密度
  await ev(`(function(){const a=document.querySelector('aside'),c=document.getElementById('goalList').parentElement;
    a.scrollTop += c.getBoundingClientRect().top - a.getBoundingClientRect().top - 12;})()`);
  await sleep(220);
  const clip = JSON.parse(await ev(`(function(){const r=document.querySelector('aside').getBoundingClientRect();
    return JSON.stringify({x:r.left,y:r.top,width:r.width,height:r.height});})()`));
  const cap = await b.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
    clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 }
  });
  const panelFile = path.join(__dirname, '..', 'shots', 'goal-mech-panel.png');
  require('fs').writeFileSync(panelFile, Buffer.from(cap.result.data, 'base64'));
  ok(require('fs').statSync(panelFile).size > 5000, '目标卡局部截图已落盘');

  console.log('\n[8] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed'
    : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})();
