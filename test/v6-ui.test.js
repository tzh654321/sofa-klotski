/* v6：半圆显示位置 / 调色板预览 / 半圆三段式操控 / 整圆同步转动 / 关卡名 / 4×4 可解 */
const path = require('path');
const { launch, sleep } = require('./cdp');
const PAGE = path.join(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

const HELPERS = [
  'window.__cb = function(i){',
  '  var r = svg.getBoundingClientRect();',
  '  var s = Math.min(r.width/L.w, r.height/L.h);',
  '  var ox = r.left + (r.width - s*L.w)/2, oy = r.top + (r.height - s*L.h)/2;',
  '  var e = gPieces.querySelector("[data-i=\\"" + i + "\\"]");',
  '  if(!e) return null;',
  '  var b = e.getBoundingClientRect();',
  '  return {x:(b.left-ox)/s, y:(b.top-oy)/s, w:b.width/s, h:b.height/s};',
  '};',
  'window.__pp = function(x,y){',
  '  var r = svg.getBoundingClientRect();',
  '  var s = Math.min(r.width/L.w, r.height/L.h);',
  '  return {x: r.left + (r.width - s*L.w)/2 + x*s, y: r.top + (r.height - s*L.h)/2 + y*s};',
  '}; void 0'
].join('\n');

function clean(n) { return Math.abs(n) < 1e-6 ? 0 : n; }

(async () => {
  const b = await launch(PAGE);
  const ev = b.evalJs;
  await ev(HELPERS);
  const PP = async (x, y) => JSON.parse(await ev('JSON.stringify(__pp(' + x + ',' + y + '))'));
  const cb = async i => JSON.parse(await ev('JSON.stringify(__cb(' + i + '))'));
  const pose = async i => JSON.parse(await ev('JSON.stringify([st[' + i + '].x,st[' + i + '].y,st[' + i + '].ori])'));
  async function dragV(from, dy, steps) {
    const a = await PP(from[0], from[1]);
    await b.mouse('mousePressed', a.x, a.y);
    for (let k = 1; k <= steps; k++) {
      const q = await PP(from[0], from[1] + dy * k / steps);
      await b.mouse('mouseMoved', q.x, q.y); await sleep(16);
    }
    const e = await PP(from[0], from[1] + dy);
    await b.mouse('mouseReleased', e.x, e.y); await sleep(360);
  }
  async function dragH(from, dx, steps) {
    const a = await PP(from[0], from[1]);
    await b.mouse('mousePressed', a.x, a.y);
    for (let k = 1; k <= steps; k++) {
      const q = await PP(from[0] + dx * k / steps, from[1]);
      await b.mouse('mouseMoved', q.x, q.y); await sleep(16);
    }
    const e = await PP(from[0] + dx, from[1]);
    await b.mouse('mouseReleased', e.x, e.y); await sleep(360);
  }

  console.log('\n[1] 半圆画在自己的格子里（这就是关卡显示错位那个 bug）');
  await ev('document.getElementById("btnSemi").click()'); await sleep(500);
  const semiIdx = JSON.parse(await ev('JSON.stringify(L.pieces.map((p,i)=>p.shape==="semi"?i:-1).filter(i=>i>=0))'));
  console.log('     半圆下标 ' + JSON.stringify(semiIdx));
  let allIn = true, detail = [];
  for (const i of semiIdx) {
    const box = JSON.parse(await ev('JSON.stringify(pieceBox(st,' + i + '))'));
    const g = await cb(i);
    const d = [g.x - box.x, g.y - box.y, (g.x + g.w) - (box.x + box.w), (g.y + g.h) - (box.y + box.h)]
      .map(v => Math.round(v * 1000) / 1000);
    detail.push({ i, box, g, d });
    if (Math.max(...d.map(Math.abs)) > 0.02) allIn = false;
  }
  console.log('     ' + detail.map(o => L0(o)).join(' | '));
  function L0(o) { return '#' + o.i + '[' + [o.box.x, o.box.y, o.box.w, o.box.h].join(',') + '] 偏差 ' + o.d.join(','); }
  ok(allIn, '每块半圆的绘制包围盒 = 它占的格子');
  const inBoard = detail.every(o => o.g.y >= -0.02 && o.g.y + o.g.h <= 4.02 && o.g.x >= -0.02 && o.g.x + o.g.w <= 4.02);
  ok(inBoard, '没有任何半圆画到棋盘外面');

  console.log('\n[2] 编辑界面：调色板里的半圆预览看得见');
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="edit"]\').click()'); await sleep(250);
  const pal = JSON.parse(await ev([
    '(function(){',
    '  var b = document.querySelectorAll("#pal button")[5];',
    '  var p = b.querySelector("path");',
    '  var sr = b.querySelector("svg").getBoundingClientRect();',
    '  var pr = p.getBoundingClientRect();',
    '  return JSON.stringify({has:!!p, w:pr.width, h:pr.height, inside: pr.left>=sr.left-0.5 && pr.right<=sr.right+0.5 && pr.top>=sr.top-0.5 && pr.bottom<=sr.bottom+0.5, d:p.getAttribute("d")});',
    '})()'].join('\n')));
  console.log('     预览 ' + JSON.stringify(pal));
  ok(pal.has, '半圆按钮里是真实 path');
  ok(pal.h > 6 && pal.w > 6, '预览有可见尺寸（不再是一条 0 高度的线）', { w: pal.w, h: pal.h });
  ok(pal.inside, '预览没有溢出按钮');
  ok(pal.d.indexOf('A1 1 0 0 1') > 0, '用的是能填满 2×1 盒的那条弧', pal.d);

  console.log('\n[3] 半圆三段式：缺口朝右（竖放）时上端右拖=顺时针');
  const lv1 = { name: '单半圆', w: 4, h: 4, goals: [], pieces: [
    { id: 's', x: 1, y: 1, shape: 'semi', color: '#a349a4', name: '半圆', ori: 3 }] };
  await ev('loadLevel(' + JSON.stringify(lv1) + ')'); await sleep(300);
  // 编辑器现在用 Q/E 旋转、拖动只移动（需求变更），手势回归必须在试玩模式跑
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="play"]\').click()'); await sleep(120);
  const b0 = JSON.parse(await ev('JSON.stringify(pieceBox(st,0))'));
  console.log('     初始盒 ' + JSON.stringify(b0) + ' ori=3（平边朝右）');
  await dragH([b0.x + 0.5, b0.y + 0.35], 1.1, 11);
  const o1 = (await pose(0))[2];
  console.log('     上端右拖 -> ori ' + o1);
  ok(o1 === 0, '上端右拖 = 顺时针 90°（3 → 0）', o1);

  await ev('st[0]={x:1,y:1,ori:3}; anim=null; render(); updateUI();'); await sleep(120);
  await dragH([b0.x + 0.5, b0.y + b0.h - 0.35], 1.1, 11);
  const o2 = (await pose(0))[2];
  console.log('     下端右拖 -> ori ' + o2);
  ok(o2 === 2, '下端右拖 = 逆时针 90°（3 → 2）', o2);

  await ev('st[0]={x:1,y:1,ori:3}; anim=null; render(); updateUI();'); await sleep(120);
  await dragH([b0.x + 0.5, b0.y + b0.h / 2], 1.1, 11);
  const p3 = await pose(0);
  console.log('     中段右拖 -> ' + JSON.stringify(p3));
  ok(p3[0] === 2 && p3[2] === 3, '中段拖动 = 平移，朝向不变', p3);

  console.log('\n[4] 整圆：拖任一半圆 → 两块同步转 90° 互换位置（视频第一步）');
  await ev('document.getElementById("btnSemi").click()'); await sleep(400);
  const before = JSON.parse(await ev('JSON.stringify([st[3],st[4]])'));
  console.log('     起点 s1/s2 = ' + JSON.stringify(before));
  await dragV([0.3, 3.5], -1.0, 12);
  const after = JSON.parse(await ev('JSON.stringify([st[3],st[4]])'));
  console.log('     转后 s1/s2 = ' + JSON.stringify(after));
  ok(after[0].ori === 1 && after[1].ori === 3, '两块都转了 90°', after);
  ok(after[0].x === 1 && after[1].x === 0 && after[0].y === 2 && after[1].y === 2,
    '互换格位：s1 到右半 (1,2)、s2 到左半 (0,2)', after);
  ok(after[0].ori === 1 && after[1].ori === 3, '平边相对（s1 平边朝左 / s2 平边朝右），仍是一个整圆');
  const overlap = await ev('(function(){var g=K.grid(L,st),n=0;for(var i=0;i<g.length;i++)if(g[i]===3||g[i]===4)n++;return n;})()');
  ok(overlap === 4, '两块正好占 4 格，无重叠', overlap);
  const single = await ev('K.moves(L,st).filter(m=>m.t==="r"&&(m.i===3||m.i===4)).length');
  ok(single === 0, '拼成整圆后不再提供"单块转"（避免破形）', single);
  await b.shot(path.join(__dirname, '..', 'shots', 'v6-disc.png'));

  console.log('');
  console.log('[4b] 旋转按钮同样带动整圆；动画绕圆心走弧线');
  await ev('document.getElementById("btnSemi").click()'); await sleep(400);
  await ev('sel = 3; tryTurn(3, 1); void 0');
  await sleep(80);
  const animInfo = JSON.parse(await ev('JSON.stringify((anim&&anim.list||[]).map(e=>[e.i, !!e.pivot]))'));
  console.log('     动画条目 ' + JSON.stringify(animInfo));
  ok(animInfo.length === 2, '一次动作同时补间两块', animInfo.length);
  ok(animInfo.every(a => a[1]), '两块都带圆心枢轴（走圆弧，不是直线穿过圆心）');
  await sleep(420);
  const afterBtn = JSON.parse(await ev('JSON.stringify([st[3],st[4]])'));
  ok(afterBtn[0].ori === 1 && afterBtn[1].ori === 3, '按钮旋转 = 整圆同步 90°', afterBtn);

  console.log('');
console.log('[4c] 成功判定：曹操必须正好在底行正中 2×2');
await ev('document.getElementById("btnClassic").click()'); await sleep(350);
const g0 = JSON.parse(await ev('JSON.stringify(raw.goals[0])'));
console.log('     目标 ' + JSON.stringify(g0));
ok(!g0.bottom, '不再用"贴到底行就算赢"的宽松判定');
ok(JSON.stringify(g0.cells) === '[[1,3],[2,3],[1,4],[2,4]]', '目标是精确的底行正中 2×2', g0.cells);
const hi = await ev('L.pieces.findIndex(p=>p.hero)');
ok(hi >= 0, '找到主角块', hi);
await ev('st[' + hi + ']={x:2,y:3,ori:0}; anim=null; render(); void 0');
ok(await ev('checkWin()') === false, '曹操在右下角 (2,3) 不算赢');
await ev('st[' + hi + ']={x:0,y:3,ori:0}; anim=null; render(); void 0');
ok(await ev('checkWin()') === false, '曹操在左下角 (0,3) 也不算赢');
await ev('st[' + hi + ']={x:1,y:3,ori:0}; anim=null; render(); void 0');
ok(await ev('checkWin()') === true, '只有正中 2×2 才算赢');

console.log('');
console.log('[4d] 两个半圆拼成的整圆：单半圆能单独拖开（以前永远整圆一起动，分不开）');
const lvS = { name: '整圆平移', w: 5, h: 4, goals: [], pieces: [
  { id: 'a', x: 0, y: 2, shape: 'semi', color: '#a349a4', name: 'A', ori: 0 },
  { id: 'b', x: 0, y: 3, shape: 'semi', color: '#a349a4', name: 'B', ori: 2 }] };
await ev('loadLevel(' + JSON.stringify(lvS) + ')'); await sleep(300);
console.log('     起始 ' + await ev('JSON.stringify(st.map(s=>[s.x,s.y,s.ori]))'));
ok(await ev('K.moves(L,st).some(m=>m.t==="ps")'), '引擎给出整圆整体平移走法');   // 拆开以后就没了
// 抓上半圆正中（半径≈0 → 平移），右拖 1.2 格
{ const a = await PP(1.0, 2.5); const e2 = await PP(2.0, 2.5);
  await b.mouse('mousePressed', a.x, a.y);
  for (let k = 1; k <= 12; k++) { const q = await PP(1.0 + k * 0.1, 2.5); await b.mouse('mouseMoved', q.x, q.y); await sleep(16); }
  await b.mouse('mouseReleased', e2.x, e2.y); }
await sleep(400);
const sD = JSON.parse(await ev('JSON.stringify(st.map(s=>[s.x,s.y,s.ori]))'));
console.log('     拖后 ' + JSON.stringify(sD));
// 抓的是上半圆 → 上半圆单独右移，下半圆留在原地（"在空地分不开"就是这个 bug）
ok(sD[0][0] === 1 && sD[1][0] === 0, '只拖走被抓住的那半圆，另一半不动', sD);
ok(sD[0][2] === 0 && sD[1][2] === 2, '平移不改朝向', sD);
ok(await ev('overlapInfo().total') === 0, '拖开以后没有叠放');
// 引擎那侧在"还没拆开"时仍然给整圆整体平移的走法（求解器用得到），只是手动拖动优先单块
// 再把下半圆也拖开，两块彻底分开
{ const a = await PP(0.5, 3.5); const e2 = await PP(0.5, 1.5);
  await b.mouse('mousePressed', a.x, a.y);
  for (let k = 1; k <= 10; k++) { const q = await PP(0.5, 3.5 + k * 0.2); await b.mouse('mouseMoved', q.x, q.y); await sleep(16); }
  await b.mouse('mouseReleased', e2.x, e2.y); }
await sleep(300);

console.log('\n[5] 每一关都有名字');
  const presets = [['btnClassic', '横刀立马'], ['btnSemi', '阴晴圆缺'], ['btnN15', '4阶数字华容道'], ['btnBlank', '空盘']];
  for (const [id, nm] of presets) {
    await ev('document.getElementById("' + id + '").click()'); await sleep(180);
    const shown = await ev('document.getElementById("lvName").textContent.trim()');
    const label = await ev('document.getElementById("' + id + '").textContent.trim()');
    ok(shown === nm && label === nm, nm + '（标题与按钮一致）', { shown, label });
  }

  console.log('\n[6] 阴晴圆缺：求解 + 一步跳到终局');
  await ev('document.getElementById("btnSemi").click()'); await sleep(300);
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="solve"]\').click()'); await sleep(150);
  await ev('document.getElementById("btnSolve").click()'); await sleep(2500);
  const steps6 = await ev('document.getElementById("svSteps").textContent.trim()');
  const msg6 = await ev('document.getElementById("svMsg").textContent.trim()');
  console.log('     ' + steps6 + ' | ' + msg6);
  ok(/^\d+ 手$/.test(steps6), '给出最短手数', steps6);
  const labels = JSON.parse(await ev('JSON.stringify([...document.querySelectorAll("#steps div span")].map(e=>e.textContent))'));
  const disc = labels.filter(s => s.indexOf('整圆') >= 0);
  console.log('     整圆步骤：' + JSON.stringify(disc));
  ok(disc.length >= 1, '解法里包含"整圆同步 90°"', disc);
  ok(labels.some(s => s.indexOf('推') >= 0), '解法里包含连锁推', labels.slice(0, 4));
  await ev('[...document.querySelectorAll("#steps div")].pop().click()'); await sleep(400);
  const win = await ev('checkWin()');
  ok(win === true, '跳到最后一手即通关', win);

  console.log('\n[7] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
