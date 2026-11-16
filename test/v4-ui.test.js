/* v4 端到端：动画 / 手势识别 / 编辑器 / 多目标 */
const path = require('path');
const { launch, sleep } = require('./cdp');

const PAGE = path.join(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  const b = await launch(PAGE);
  const ev = b.evalJs;
  const txt = s => ev('document.querySelector("' + s + '").textContent.trim()');
  const rectNow = async () => JSON.parse(await ev('JSON.stringify(document.getElementById("board").getBoundingClientRect())'));
  const PP = async (x, y) => {
    const r = await rectNow();
    const cell = r.width / (+await ev('L.w'));
    return { x: r.left + x * cell, y: r.top + y * cell };
  };

  console.log('\n[1] 沙发形状 = 解析几何');
  await ev('loadLevel(LV.sofaSeat())'); await sleep(350);   // 默认关已改成横刀立马（没有沙发）
  ok(await ev('SOFA_PATH.indexOf("A1 1 0 0 0 0 1")>0'), '含 r=1 上四分之一圆');
  ok(await ev('SOFA_PATH.indexOf("A0.5 0.5 0 0 1 1 1")>0'), '含 r=0.5 缺口半圆');
  ok(await ev('[...document.querySelectorAll("#board path")].some(p=>p.getAttribute("d").indexOf("A0.5 0.5")>0)'), '沙发用解析 path 绘制');

  console.log('\n[2] 滑动有补间动画');
  await ev('loadLevel({name:"拖动测试",w:4,h:4,goals:[],pieces:[' +
    '{id:"a",x:1,y:3,color:"#ffaec9",name:"粉"},{id:"b",x:2,y:3,color:"#b97a57",name:"棕"}]})');
  await sleep(220);
  { const s0 = await PP(1.5, 3.4), s1 = await PP(1.5, 2.4); await b.drag(s0, s1, 10); }
  await sleep(160);
  ok(await ev('hands') === 1, '一次拖动只算 1 手', await ev('hands'));
  ok(await ev('JSON.stringify([st[0].x,st[0].y])') === '[1,2]', '粉块到 (1,2)',
    await ev('JSON.stringify([st[0].x,st[0].y])'));
  // 触发键盘移动 → 应产生 anim
  await ev('sel = 1; void 0');
  await ev('document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true}))');
  const hadAnim = await ev('!!anim');
  ok(hadAnim, '键盘移动触发了补间动画');
  await sleep(300);
  ok(!(await ev('!!anim')), '动画播完自动收起');
  ok(await ev('JSON.stringify([st[1].x,st[1].y])') === '[2,2]', '棕块上移一格', await ev('JSON.stringify([st[1].x,st[1].y])'));
  await ev('reset()'); await sleep(200);

  console.log('\n[3] 绕圈拖 = 自动识别旋转（在空盘上，沙发放得开）');
  await ev('document.getElementById("btnBlank").click()'); await sleep(250);
  await ev('document.getElementById("inW").value=6; document.getElementById("inH").value=6; document.getElementById("btnResize").click()'); await sleep(250);
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="edit"]\').click()'); await sleep(120);
  await ev('document.querySelectorAll("#pal button")[4].click()');
  { const q = await PP(2.0, 2.0); await b.click(q.x, q.y); } await sleep(200);
  ok(await ev('raw.pieces.length') === 1, '空盘上放下沙发');
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="play"]\').click()'); await sleep(150);
  const sofaI = await ev('L.pieces.findIndex(p=>p.shape==="sofa")');
  const box = JSON.parse(await ev('JSON.stringify(pieceBox(st,' + sofaI + '))'));
  const ccx = box.x + box.w / 2, ccy = box.y + box.h / 2, rr = 0.9;
  const rc = await rectNow(); const cellPx = rc.width / 6;
  const pp = a => ({ x: rc.left + (ccx + Math.cos(a) * rr) * cellPx, y: rc.top + (ccy + Math.sin(a) * rr) * cellPx });
  await b.mouse('mousePressed', pp(-Math.PI / 2).x, pp(-Math.PI / 2).y);
  for (let k = 1; k <= 16; k++) {
    const a = -Math.PI / 2 + (k / 16) * Math.PI * 0.85;
    const q = pp(a);
    await b.mouse('mouseMoved', q.x, q.y);
    await sleep(16);
  }
  await b.mouse('mouseReleased', pp(-Math.PI / 2 + Math.PI * 0.85).x, pp(-Math.PI / 2 + Math.PI * 0.85).y);
  await sleep(400);
  const ori = await ev('st[' + sofaI + '].ori');
  const turned = await ev('hands');
  console.log('     沙发朝向 ' + ori + '，手数 ' + turned);
  ok(ori !== 0, '绕圈手势把沙发转了 90°');
  ok(turned >= 1, '记 1 手');
  await b.shot(path.join(__dirname, '..', 'shots', 'v4-rotate.png'));

  console.log('\n[4] 多目标：十五子预设 15 个目标');
  await ev('document.getElementById("btnN15").click()');
  await sleep(400);
  ok(await ev('L.pieces.length') === 15, '15 个块');
  ok(await ev('raw.goals.length') === 15, '15 个目标');
  ok(await ev('L.w') === 4 && await ev('L.h') === 4, '棋盘 4×4');
  ok(!(await ev('checkWin()')), '开局不是已解');
  ok(await txt('#stGoals') === '15', '头部显示 15 个目标');
  await b.shot(path.join(__dirname, '..', 'shots', 'v4-15puzzle.png'));

  console.log('\n[5] 经典局面：求解（多目标接口）');
  // 注意：沙发关在「严格物理」下无解（转体会擦到邻块），这里改用可解的经典局面验证链路
  await ev('loadLevel(LV.classic())');
  await sleep(300);
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="solve"]\').click()');
  await sleep(150);
  await ev('document.getElementById("btnSolve").click()');
  // 求解现在切成 40ms 的小片跑（页面不卡），所以等结果而不是死等固定时间
  await b.waitFor('/手|封顶|无解/.test(document.getElementById("svSteps").textContent)', 120000, 200);
  const steps = await txt('#svSteps');
  console.log('     ' + steps + ' | ' + (await txt('#svMsg')));
  ok(/^\d+ 手$/.test(steps), '给出最短手数', steps);
  ok(await ev('!!solution'), '解存在（后面播放依赖它）');
  const list = await ev('[...document.querySelectorAll("#steps div")].slice(0,3).map(d=>d.textContent).join(" / ")');
  console.log('     前 3 步: ' + list);
  ok(await ev('document.querySelectorAll("#steps div").length') > 0, '步表已渲染');

  console.log('\n[6] 播放解法');
  await ev('document.getElementById("btnPlay").click()');
  await sleep(600);
  const m1 = await ev('hands');
  await sleep(1200);
  const m2 = await ev('hands');
  ok(m2 > m1, '播放中手数推进', { m1, m2 });
  await ev('stopPlay(); st = solution.states[solution.states.length-1].map(s=>({...s})); render(); updateUI();');
  await sleep(200);
  ok(await ev('checkWin()'), '末态达成全部目标');
  await b.shot(path.join(__dirname, '..', 'shots', 'v4-solved.png'));

  console.log('\n[7] 编辑器：改尺寸 / 改色改名 / 加块 / 设目标');
  await ev('document.getElementById("btnBlank").click()');
  await sleep(250);
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="edit"]\').click()');
  await sleep(150);
  await ev('document.getElementById("inW").value=6; document.getElementById("inH").value=6; document.getElementById("btnResize").click()');
  await sleep(250);
  ok(await ev('L.w') === 6 && await ev('L.h') === 6, '棋盘改成 6×6', [await ev('L.w'), await ev('L.h')]);
  // 放一个沙发 + 一个 2×2
  await ev('document.querySelectorAll("#pal button")[4].click()');   // 沙发
  await b.click(b.P(0.5, 0.5).x, b.P(0.5, 0.5).y);
  await sleep(200);
  await ev('document.querySelectorAll("#pal button")[0].click()');   // 2×2
  { const q = await PP(3.0, 1.0); await b.click(q.x, q.y); }
  await sleep(200);
  ok(await ev('raw.pieces.length') === 2, '放下两块', await ev('raw.pieces.length'));
  // 重命名 + 改色
  await ev('sel = 0; document.getElementById("inName").value="沙发A"; document.getElementById("inName").dispatchEvent(new Event("input"));');
  await sleep(150);
  ok(await ev('raw.pieces[0].name') === '沙发A', '改名生效');
  await ev('document.getElementById("inColor").value="#ff00aa"; document.getElementById("inColor").dispatchEvent(new Event("input"));');
  await sleep(150);
  ok(await ev('raw.pieces[0].color') === '#ff00aa', '改色生效');
  // 设两个目标
  await ev('sel=0; document.getElementById("btnSetGoalOne").click()');
  await sleep(120);
  await ev('sel=1; document.getElementById("btnSetGoalOne").click()');
  await sleep(120);
  ok(await ev('raw.goals.length') === 2, '两个目标', await ev('raw.goals.length'));
  ok(await ev('document.querySelectorAll("#goalList .prow").length') === 2, '目标列表渲染 2 行');
  await b.shot(path.join(__dirname, '..', 'shots', 'v4-edit.png'));

  console.log('\n[8] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
