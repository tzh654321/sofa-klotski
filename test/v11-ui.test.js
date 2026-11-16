/* v11：本轮需求的页面回归
 *   1 半圆只能绕圆心转   2 编辑器 QE / WASD / 拖动   3 允许叠放但拦截试玩求解
 *   4 自绘滑块（四分之一圆 + 不相邻部分重心连线）   5 锁定状态与视觉
 *   6 难度分 UI   7 设计关卡与分数   8 JSON 往返   9 无异常 + 截图
 *   node test/v11-ui.test.js
 */
const path = require('path');
const { launch, sleep } = require('./cdp');
const PAGE = path.join(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

const HELPERS = [
  'window.__pp = function(x,y){',
  '  var r = svg.getBoundingClientRect(), s = Math.min(r.width/L.w, r.height/L.h);',
  '  return {x: r.left + (r.width - s*L.w)/2 + x*s, y: r.top + (r.height - s*L.h)/2 + y*s};',
  '};',
  'window.__key = function(k){ document.dispatchEvent(new KeyboardEvent("keydown",{key:k,bubbles:true})); };',
  'window.__flatMid = function(i){ var p=K.flatMid(L,st,i,st[i].ori,st[i].x,st[i].y); return p[0]+","+p[1]; };',
  'void 0'
].join('\n');

(async () => {
  const b = await launch(PAGE);
  const ev = b.evalJs;
  await ev(HELPERS);
  const PP = async (x, y) => JSON.parse(await ev('JSON.stringify(__pp(' + x + ',' + y + '))'));
  const pose = async i => JSON.parse(await ev('JSON.stringify([st[' + i + '].x,st[' + i + '].y,st[' + i + '].ori])'));
  const tab = async m => { await ev('document.getElementById("tabs").querySelector(\'[data-mode="' + m + '"]\').click()'); await sleep(130); };
  const key = async k => { await ev('__key(' + JSON.stringify(k) + ')'); await sleep(90); };
  const cellBox = async sel => JSON.parse(await ev('JSON.stringify((function(){var r=document.querySelector(' + JSON.stringify(sel) + ').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})())'));
  const paint = async (i, brushK) => {
    await ev('document.querySelectorAll("#brush button")[' + brushK + '].click()');
    // 编辑面板很长，画布下沿可能不在视口里；先滚进去再按，否则 CDP 鼠标事件落空
    await ev('document.querySelector(\'#paint button[data-i="' + i + '"]\').scrollIntoView({block:"center"})');
    await sleep(80);
    const q = await cellBox('#paint button[data-i="' + i + '"]');
    await b.mouse('mousePressed', q.x, q.y);
    await b.mouse('mouseReleased', q.x, q.y);
    await sleep(70);
  };

  console.log('\n[1] 半圆：任何时候只能绕自己的圆心转');
  await ev('loadLevel({name:"单半圆",w:4,h:4,goals:[],pieces:[{id:"s",x:1,y:1,shape:"semi",color:"#a349a4",name:"半圆"}]})');
  await sleep(220);
  await tab('edit');
  await ev('sel = 0; updateUI(); void 0');
  const mid0 = await ev('__flatMid(0)');
  await key('e');
  const p1 = await pose(0), mid1 = await ev('__flatMid(0)');
  console.log('     E 后 ' + JSON.stringify(p1) + ' 圆心 ' + mid0 + ' → ' + mid1);
  ok(p1[2] === 1, 'E = 顺时针 90°', p1);
  ok(mid1 === mid0, '转完圆心仍在原位（编辑器也遵守）', [mid0, mid1]);
  const pivotMoves = JSON.parse(await ev(`JSON.stringify(K.moves(L,st).filter(m=>m.t==="r"&&m.i===0).map(m=>{
    var pb=K.flatMid(L,st,0,m.ori,m.x,m.y); return pb[0]+","+pb[1];}))`));
  ok(pivotMoves.length === 2 && pivotMoves.every(x => x === mid1),
    '引擎给出的两个旋转落点都保持圆心不动', pivotMoves);
  await key('q');
  ok((await pose(0))[2] === 0 && await ev('__flatMid(0)') === mid0, 'Q 转回去，圆心仍不变');

  console.log('\n[2] 编辑器：QE 旋转、WASD 与拖动自由移动（不判碰撞）');
  await ev('loadLevel({name:"L块",w:5,h:5,goals:[],pieces:[{id:"l",x:1,y:1,shape:"L3",color:"#00a2e8",name:"L"}]})');
  await sleep(220);
  await tab('edit');
  await ev('sel = 0; updateUI(); void 0');
  const p0 = await pose(0);
  await key('d'); const pd = await pose(0);
  await key('a'); const pa = await pose(0);
  await key('s'); const ps = await pose(0);
  await key('w'); const pw = await pose(0);
  ok(pd[0] === p0[0] + 1, 'D 右移一格', pd);
  ok(pa[0] === p0[0], 'A 移回来', pa);
  ok(ps[1] === p0[1] + 1, 'S 下移一格', ps);
  ok(pw[1] === p0[1], 'W 移回来', pw);
  await key('e');
  ok((await pose(0))[2] === 1, 'E 在编辑态也能转 L 块（不再靠手势）');
  // 真实鼠标拖动：抓块心往右拖一格
  const from = await PP(1.6, 1.6), to = await PP(2.6, 1.6);
  await b.mouse('mousePressed', from.x, from.y);
  for (let k = 1; k <= 8; k++) {
    const q = await PP(1.6 + k * 0.125, 1.6);
    await b.mouse('mouseMoved', q.x, q.y); await sleep(12);
  }
  await b.mouse('mouseReleased', to.x, to.y); await sleep(160);
  const dragged = await pose(0);
  ok(dragged[0] === p0[0] + 1, '拖动 = 自由移动一格', dragged);

  console.log('\n[3] 放置允许暂时叠放；试玩/求解被拦截');
  await ev('loadLevel(LV.blank())'); await sleep(180);
  await tab('edit');
  await ev('document.querySelectorAll("#pal button")[0].click()');
  { const q = await PP(1.5, 1.5); await b.click(q.x, q.y); }
  // 放置是一次性动作，再点一次调色板才能继续放；这次故意压在同一格上
  await ev('document.querySelectorAll("#pal button")[0].click()');
  { const q = await PP(1.5, 1.5); await b.click(q.x, q.y); }
  await sleep(150);
  const ov = JSON.parse(await ev('JSON.stringify(overlapInfo())'));
  ok(await ev('raw.pieces.length') === 2, '两块都放下了（不再拒绝重叠）');
  ok(ov.total > 0, '编辑器如实统计出叠放', ov);
  ok((await ev('document.getElementById("stVerdict").textContent')).indexOf('重叠') >= 0,
    '界面上有叠放提示');
  await tab('play');
  ok(await ev('playable()') === false, '试玩被拦住');
  await tab('solve');
  await ev('document.getElementById("btnSolve").click()'); await sleep(150);
  ok((await ev('document.getElementById("svMsg").textContent')).indexOf('BFS 穷举') >= 0 || (await ev('document.getElementById("svSteps").textContent')) === '—',
    '叠放时求解不会给出假结果');
  await tab('edit');
  // 两块都是 2×2，挪到 (1,3) 才既不出界也不与 (1,1) 重叠
  await ev('st[1]={x:1,y:3,ori:0}; syncRaw(); render(); updateUI(); void 0');
  ok(await ev('overlapInfo().total') === 0, '挪开后叠放清零');
  await tab('play');
  ok(await ev('playable()') === true, '修好后可以试玩');

  console.log('\n[4] 自绘滑块：四分之一圆 + 不相邻部分重心连线');
  await ev('loadLevel(LV.blank())'); await sleep(180);
  await tab('edit');
  await ev('document.getElementById("btnClearPaint").click()');
  const brushes = await ev('document.querySelectorAll("#brush button").length');
  ok(brushes === 5, '5 种组件笔刷（实心 / 1/4 圆 / 弓形 / 内切圆 / 擦除）', brushes);
  await paint(0, 0);                 // 实心，左上
  await paint(24, 0);                // 实心，右下（与左上不相邻）
  await paint(12, 1);                // 四分之一圆，中间
  const painted = JSON.parse(await ev('JSON.stringify(paintCells)'));
  ok(painted[0] === 0 && painted[24] === 0 && painted[12] === 1, '三种格子都画上了', [painted[0], painted[12], painted[24]]);
  await ev('document.getElementById("btnNewCustom").click()'); await sleep(200);
  const custom = JSON.parse(await ev('JSON.stringify(raw.pieces[raw.pieces.length-1])'));
  ok(custom.shape === 'custom' && custom.cells.length === 3, '生成 3 格自绘块', custom.cells);
  ok(custom.cells.some(q => q.arc && q.arc.length === 2), '四分之一圆格带 arc 圆心', custom.cells);
  const comps = await ev('K.components(raw.pieces[raw.pieces.length-1].cells.map(q=>[q.c,q.r])).length');
  ok(comps === 3, '三块互不相邻（3 个连通分量）', comps);
  const links = await ev('document.querySelectorAll(\'#board [data-part="link"]\').length');
  ok(links >= 3, '棋盘上画出了滑块色的重心连线与端点', links);
  await b.shot(path.join(__dirname, '..', 'shots', 'v11-custom.png'));

  console.log('\n[5] 锁定：试玩/求解都不许动，且有视觉表现');
  await ev('sel = 0; updateUI(); void 0');
  await ev('setPieceKind(0, "lock")'); await sleep(160);
  ok(await ev('raw.pieces[0].lock') === true, '锁定标志写进关卡');
  ok(await ev('K.moves(L,st).filter(m=>m.i===0).length') === 0, '引擎不给锁定块任何走法');
  const lockVis = await ev('document.querySelectorAll(\'#board [data-part="lock"]\').length');
  ok(lockVis >= 1, '斜线阴影覆盖锁定块', lockVis);
  ok(await ev('!!document.getElementById("lockHatch")') === true, '定义了锁定图案');
  ok(await ev('document.querySelector("#board g[pointer-events=\'none\'] rect") !== null' ||
    'document.querySelectorAll("#board rect").length > 0') === true, '有小锁图标');
  await b.shot(path.join(__dirname, '..', 'shots', 'v11-lock.png'));
  await ev('setPieceKind(0, "normal")'); await sleep(140);
  ok(await ev('raw.pieces[0].lock') === false, '可以解锁');

  console.log('\n[6] 难度分 UI：最短路 / 岔路干扰 / 路径条数');
  await ev('loadLevel(LV.classic())'); await sleep(200);
  await tab('solve');
  await ev('document.getElementById("btnDiff").click()');
  await b.waitFor('/\\d+ · /.test(document.getElementById("dfScore").textContent)', 120000, 250);
  const df = JSON.parse(await ev(`JSON.stringify({
    score: document.getElementById("dfScore").textContent.trim(),
    states: document.getElementById("dfStates").textContent.trim(),
    depth: document.getElementById("dfDepth").textContent.trim(),
    paths: document.getElementById("dfPaths").textContent.trim(),
    branch: document.getElementById("dfBranch").textContent.trim(),
    waste: document.getElementById("dfWaste").textContent.trim(),
    msg: document.getElementById("dfMsg").textContent.trim()
  })`));
  console.log('     ' + JSON.stringify(df));
  const cscore = await ev('LV.classic().meta.score');
  ok(/\d+/.test(df.score) && df.score.indexOf(String(cscore)) >= 0,
    '难度分 = 关卡库 meta 的 ' + cscore, df.score);
  ok(+df.states.replace(/[^\d]/g, '') > 1000, '显示可达状态空间', df.states);
  ok(df.depth.indexOf('76') >= 0, '显示最短解长度', df.depth);
  ok(df.paths.length > 1, '显示通向解的路径条数', df.paths);
  ok(/条/.test(df.branch) && /步/.test(df.waste), '显示岔路条数与岔路代价', [df.branch, df.waste]);
  ok(/操作长度/.test(df.msg) && /调度/.test(df.msg) && /选择干扰/.test(df.msg),
    '给出分项构成（操作长度/调度/选择干扰）', df.msg);

  console.log('\n[7] 关卡库：设计关与分数');
  const lvs = JSON.parse(await ev('JSON.stringify([...document.querySelectorAll("#lvList button")].map(b=>b.textContent.trim()))'));
  console.log('     ' + JSON.stringify(lvs));
  for (const nm of ['阴晴圆缺', '锁门', '重门叠锁', '家具城', '沙发入座', '横刀弯马', '上下交汇'])
    ok(lvs.some(s => s.indexOf(nm) >= 0), '关卡列表里有「' + nm + '」');
  for (const nm of ['半月', '一线天', '圆角', '沙半', '三角板', '双归位'])
    ok(!lvs.some(s => s.indexOf(nm) >= 0), '已删掉/改名的「' + nm + '」不在列表里');
  ok(lvs.filter(s => /分/.test(s)).length >= 6, '每关都标出难度分', lvs.filter(s => /分/.test(s)).length);
  ok(await ev('LV.brokenBridge === undefined'), '断桥类（全部无解/低分）已从关卡库舍弃');

  console.log('\n[8] JSON 导出/载入保留 ori / lock / 自绘规则');
  await ev(`loadLevel({name:'导出测试',w:4,h:4,goals:[],pieces:[
    {id:'moon',x:0,y:0,shape:'custom',cells:[{c:0,r:0,arc:[1,1]},{c:1,r:0,arc:[0,1]}],rot:'pivot',flat:90,pair:'disc',nodedup:true,color:'#a349a4',name:'半圆'},
    {id:'k',x:2,y:2,shape:'1x1',color:'#ed1c24',name:'卒'}]})`); await sleep(180);
  await tab('edit');
  await ev('sel = 0; editTurn(0,1); toggleLock(0); void 0'); await sleep(220);
  await ev('document.getElementById("btnDump").click()');
  const dumped = JSON.parse(await ev('document.getElementById("jsonBox").value'));
  const moon = dumped.pieces.find(p => p.id === 'moon');
  ok(!!moon && moon.ori === 1 && moon.lock === true, '导出带朝向与锁定', moon && { ori: moon.ori, lock: moon.lock });
  ok(!!moon && moon.rot === 'pivot' && moon.flat === 90 && moon.pair === 'disc',
    '导出保留自绘半圆的规则字段', moon && { rot: moon.rot, flat: moon.flat, pair: moon.pair });
  await ev('document.getElementById("btnLoad").click()'); await sleep(200);
  const back = JSON.parse(await ev('JSON.stringify({ori:st[0].ori,lock:raw.pieces[0].lock,rot:raw.pieces[0].rot,flat:raw.pieces[0].flat})'));
  ok(back.ori === 1 && back.lock === true && back.rot === 'pivot' && back.flat === 90,
    '载入后规则一致（往返无损）', back);
  await b.shot(path.join(__dirname, '..', 'shots', 'v11-play.png'));

  console.log('\n[9] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
