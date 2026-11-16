/* v18 端到端：斜半圆外框 / 目标框开关 / 只被连锁 / 改名配色即刷 / 目标框拖动 /
 *            参考解法=归位一个按钮 / 同向多步一次缓动 / 分析完直接播放
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

  console.log('\n[1] 斜半圆：选中外框必须和块本身重合');
  await ev(`loadLevel({name:"斜",w:4,h:4,goals:[],pieces:[{id:"a",x:1,y:0,ori:0,shape:"diagSemi",color:"#22b14c",name:"斜"}]})`);
  await sleep(300);
  await ev('sel=0; render(); updateUI();');
  await sleep(150);
  const bb = JSON.parse(await ev(`(function(){
    const f=document.querySelector('#board path[data-i="0"][data-part="fill"]').getBoundingClientRect();
    const s=document.querySelector('#gSel path').getBoundingClientRect();
    return JSON.stringify({f:[f.x,f.y,f.width,f.height], s:[s.x,s.y,s.width,s.height]});
  })()`));
  const near = (a, c) => Math.abs(a - c) < 0.6;
  ok(near(bb.f[0], bb.s[0]) && near(bb.f[1], bb.s[1]) && near(bb.f[2], bb.s[2]) && near(bb.f[3], bb.s[3]),
    '选中光圈与斜半圆逐像素对齐（不再偏半格）', bb);

  console.log('\n[2] 标题栏「目标框」开关');
  await ev(`loadLevel(LEVELPACKS[0].levels[0].level)`); await sleep(450);
  const on = await ev(`document.querySelectorAll('#gGoalTop *').length`);
  await ev(`(function(){const c=document.getElementById('cbGoalBox');c.checked=false;c.dispatchEvent(new Event('change'));})()`);
  await sleep(150);
  const off = await ev(`document.querySelectorAll('#gGoalTop *').length`);
  await ev(`(function(){const c=document.getElementById('cbGoalBox');c.checked=true;c.dispatchEvent(new Event('change'));})()`);
  await sleep(150);
  const back = await ev(`document.querySelectorAll('#gGoalTop *').length`);
  ok(on > 0 && off === 0 && back === on, '关闭后棋盘上不画目标框、打开又回来', [on, off, back]);
  ok(await ev(`localStorage.getItem('sofa-klotski.goalbox')`) === '1', '开关记在本地（下次打开还是这个设置）');

  console.log('\n[3] 「被动」：自己动不了，只能被推');
  await ev(`loadLevel({name:"锁",w:4,h:2,goals:[],pieces:[
    {id:"a",x:1,y:0,ori:0,shape:"1x1",name:"甲",chainOnly:true},
    {id:"b",x:0,y:0,ori:0,shape:"1x1",name:"乙"}]})`);
  await sleep(300);
  const co = JSON.parse(await ev(`JSON.stringify({
    own: K.moves(L,st).filter(m=>m.i===0&&(m.t==='m'||m.t==='r')).length,
    push: K.moves(L,st).filter(m=>m.t==='p'&&m.i===1&&m.dx===1).length,
    parsed: !!L.pieces[0].chainOnly })`));
  ok(co.parsed, '解析后带上 chainOnly 标记');
  await ev('sel = 0; updateUI();'); await sleep(120);
  ok(/被动/.test(await ev(`document.getElementById('btnKind').textContent`)), '选中这块时三档按钮显示「被动」',
    await ev(`document.getElementById('btnKind').textContent`));
  ok(co.own === 0, '它自己没有任何平移/旋转走法', co.own);
  ok(co.push > 0, '但可以被别的块推着走', co.push);
  // 推一下：甲 应该被推到 (2,0)
  await ev(`document.querySelector('#tabs [data-mode="play"]').click()`); await sleep(120);
  const pushed = await ev(`(function(){const mv=K.moves(L,st).find(m=>m.t==='p'&&m.i===1&&m.dx===1); st=K.apply(st,mv); return JSON.stringify(st[0]);})()`);
  ok(JSON.parse(pushed).x === 2, '被推之后确实挪了一格', pushed);

  console.log('\n[4] 改名称/颜色：棋盘立刻跟着变');
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(140);
  await ev(`loadLevel({name:"改",w:3,h:3,goals:[],pieces:[{id:"a",x:0,y:0,ori:0,shape:"1x1",color:"#123456",name:"旧名"}]})`);
  await sleep(250);
  await ev('sel=0; render(); updateUI();'); await sleep(120);
  await ev(`(function(){const i=document.getElementById('inName'); i.value='新名'; i.dispatchEvent(new Event('input'));})()`);
  await sleep(150);
  const nm = await ev(`document.querySelector('#board text[data-part="label"]').textContent`);
  await ev(`(function(){const i=document.getElementById('inColor'); i.value='#ff0000'; i.dispatchEvent(new Event('input'));})()`);
  await sleep(150);
  const fill = await ev(`document.querySelector('#board path[data-i="0"][data-part="fill"]').getAttribute('fill')`);
  ok(nm === '新名', '名称即时生效', nm);
  ok(fill === '#ff0000', '颜色即时生效', fill);

  console.log('\n[5] 「设置目标」：可以拖着目标框走');
  await ev(`loadLevel({name:"目标",w:4,h:4,goals:[{piece:"a",cells:[[1,2],[2,2],[1,3],[2,3]]}],pieces:[{id:"a",x:0,y:0,ori:0,shape:"2x2",name:"甲"}]})`);
  await sleep(300);
  await ev(`document.getElementById('btnGoalMove').click()`); await sleep(150);
  ok(await ev(`document.getElementById('btnGoalMove').textContent`) === '结束设置', '按钮切成「结束设置」');
  const before = await ev('JSON.stringify(raw.goals[0].cells)');
  const pt = JSON.parse(await ev(`(function(){
    const r=svg.getBoundingClientRect(), s=Math.min(r.width/L.w, r.height/L.h);
    return JSON.stringify({x:(r.left+(r.width-s*L.w)/2)+1.5*s, y:(r.top+(r.height-s*L.h)/2)+2.5*s, s:s});})()`));
  await b.mouse('mousePressed', pt.x, pt.y);
  await b.mouse('mouseMoved', pt.x, pt.y - pt.s * 1.1);
  await b.mouse('mouseReleased', pt.x, pt.y - pt.s * 1.1);
  await sleep(200);
  const after = await ev('JSON.stringify(raw.goals[0].cells)');
  ok(before === '[[1,2],[2,2],[1,3],[2,3]]' && after === '[[1,1],[2,1],[1,2],[2,2]]', '拖一格，目标框整体上移', [before, after]);
  await ev('undo()'); await sleep(150);
  ok(await ev('JSON.stringify(raw.goals[0].cells)') === before, '可以撤销');
  await ev(`document.getElementById('btnGoalMove').click()`); await sleep(100);
  ok(await ev(`document.getElementById('btnGoalMove').textContent`) === '设置目标', '可以退出设置模式');

  console.log('\n[6] 求解器只有一个动作按钮：播放 / 参考解法 ↔ 复位（不再并排两个）');
  await ev(`[...document.querySelectorAll('#setBar button')].find(b=>b.dataset.set==='待分类').click()`); await sleep(200);
  await ev(`[...document.querySelectorAll('#lvList button')][0].click()`); await sleep(500);
  await ev(`document.querySelector('#tabs [data-mode="solve"]').click()`); await sleep(200);
  ok(await ev(`document.querySelectorAll('#btnPlay').length === 1`), '只有一个动作按钮');
  ok(await ev(`document.getElementById('btnRefSol') === null`), '「参考解法」不再是独立按钮（没有 #btnRefSol）');
  const label0 = await ev(`document.getElementById('btnPlay').textContent`);
  ok(/^(参考解法|播放)/.test(label0), '开局时按钮是「参考解法 N 步」或「播放」', label0);
  await ev(`document.getElementById('btnPlay').click()`); await sleep(1000);
  const midway = await ev(`document.getElementById('btnPlay').textContent`);
  ok(midway === '复位', '播放中/播放后同一个按钮变成「复位」', midway);
  await ev(`document.getElementById('btnPlay').click()`); await sleep(400);
  const resetOk = JSON.parse(await ev(`JSON.stringify({txt:document.getElementById('btnPlay').textContent, hands:hands})`));
  ok(resetOk.hands === 0 && /^(参考解法|播放)/.test(resetOk.txt), '点「复位」回到开局，按钮回到参考解法/播放', resetOk);

  console.log('\n[7] 同向多步：一次缓动走完');
  await ev(`loadLevel({name:"直线",w:4,h:1,goals:[{piece:"a",cells:[[3,0]]}],pieces:[{id:"a",x:0,y:0,ori:0,shape:"1x1",name:"甲"}]})`);
  await sleep(250);
  await ev(`window.__dur=[]; const _pm=playMoveAll; playMoveAll=function(prev,dur,mv){window.__dur.push(dur); return _pm(prev,dur,mv);};`);
  await ev(`document.getElementById('btnSolve').click()`); await sleep(500);
  await ev('playSolution()'); await sleep(1500);
  const durs = JSON.parse(await ev('JSON.stringify(window.__dur)'));
  const end = JSON.parse(await ev('JSON.stringify(st[0])'));
  ok(durs.length === 1, '3 格同向只补间一次（不是一格一顿）', durs);
  ok(durs[0] > 150, '整段的时长比单格长', durs[0]);
  ok(end.x === 3, '一次性走到位', end);

  console.log('\n[8] 分析完点播放：不再重算一遍解法');
  await ev(`loadLevel({name:"小",w:4,h:4,goals:[{piece:"a",cells:[[2,2]]}],pieces:[
    {id:"a",x:0,y:0,ori:0,shape:"1x1",name:"甲"},{id:"b",x:1,y:0,ori:0,shape:"1x1",name:"乙"}]})`);
  await sleep(300);
  await ev(`window.__solve=0; const _ds=doSolve; doSolve=function(){window.__solve++; return _ds();};`);
  await ev(`document.getElementById('btnDiff').click()`); await sleep(2500);
  const afterDiff = JSON.parse(await ev(`JSON.stringify({
    df: document.getElementById('dfDepth').textContent,
    sol: !!solution, msg: document.getElementById('svMsg').textContent})`));
  ok(afterDiff.sol && /分析得出/.test(afterDiff.msg), '分析结束就有可播放的最短解', afterDiff);
  await ev(`document.getElementById('btnPlay').click()`); await sleep(1200);
  ok(await ev('window.__solve') === 0, '点播放没有再调一次求解', await ev('window.__solve'));

  console.log('\n[9] 被动块有特殊显示（链纹 + 虚线内描边）');
  await ev(`loadLevel({name:"被动",w:4,h:3,goals:[],pieces:[
    {id:"a",x:0,y:0,ori:0,shape:"1x2",color:"#ff7f27",name:"甲的",chainOnly:true},
    {id:"b",x:2,y:0,ori:0,shape:"1x1",color:"#3f48cc",name:"乙"}]})`);
  await sleep(300);
  ok(await ev(`document.querySelectorAll('#board path[data-i="0"][data-part="chain"]').length`) === 1, '有链纹覆盖层');
  ok(await ev(`document.querySelectorAll('#board path[data-i="0"][data-part="chainline"]').length`) === 1, '有虚线内描边');
  ok(await ev(`document.querySelectorAll('#board path[data-i="1"][data-part="chain"]').length`) === 0, '普通块没有这层');

  console.log('\n[10] 棋盘属性里有「关卡名 / 备注」');
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(150);
  const props = JSON.parse(await ev(`JSON.stringify({
    name: document.getElementById('inLvName').value,
    note: !!document.getElementById('inLvNote') })`));
  ok(!!props.name, '关卡名输入框带出当前关卡名', props.name);
  ok(props.note, '有备注输入框');
  await ev(`(function(){const i=document.getElementById('inLvName'); i.value='改过的名字'; i.dispatchEvent(new Event('input'));})()`);
  await sleep(200);
  ok(await ev('raw.name') === '改过的名字', '改名写回关卡数据');
  ok((await ev(`document.getElementById('lvName').textContent`)) === '改过的名字', '顶栏标题同步');
  await ev(`(function(){const i=document.getElementById('inLvNote'); i.value='一句话备注'; i.dispatchEvent(new Event('input'));})()`);
  await sleep(150);
  ok(await ev('raw.note') === '一句话备注', '备注写回关卡数据');

  console.log('\n[11] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  await b.close();
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
