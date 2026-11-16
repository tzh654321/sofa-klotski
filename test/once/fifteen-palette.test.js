/* 4阶数字华容道：还原态配色（跟着目标格走的 15 个色值）
 *   node test/fifteen-palette.test.js
 *
 * 关卡文件 / levels.js / levelpacks.js 三处必须同源；把盘面摆回目标格后，
 * 棋盘上每一格的实绘颜色要和用户给的还原态配色逐格一致。
 */
const path = require('path');
const { launch, sleep } = require('../cdp.js');

const WANT = ['#ed1c24', '#d72d33', '#c03539', '#ab3b3e', '#ff7f27',
  '#fff200', '#cfc817', '#aba526', '#d97736', '#7ddc9a',
  '#00a2e8', '#1188bb', '#b16939', '#7ebe91', '#3f48cc'];

(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  let pass = 0, fail = 0;
  const ok = (c, m, x) => {
    c ? (pass++, console.log('  ok  ' + m))
      : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
  };

  console.log('\n[1] 三个数据源的 15 个色值逐一对齐');
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(160);
  const builtin = JSON.parse(await ev(`JSON.stringify(LEVELS.fifteen().pieces.map(p=>p.color))`));
  ok(JSON.stringify(builtin) === JSON.stringify(WANT), 'levels.js 内置关', builtin);
  const pack = JSON.parse(await ev(`(function(){
    for(const s of LEVELPACKS) for(const r of s.levels) if(r.level && r.level.name==='4阶数字华容道')
      return JSON.stringify(r.level.pieces.map(p=>p.color));
    return 'null';})()`));
  ok(pack && JSON.stringify(pack) === JSON.stringify(WANT), 'levelpacks.js 关卡包', pack);

  console.log('\n[2] 摆回目标格：颜色按 (0,0)→(2,3) 铺成还原态');
  await ev(`(function(){
    for(const s of LEVELPACKS) for(const r of s.levels)
      if(r.level && r.level.name==='4阶数字华容道'){ loadLevel(r.level); return; }
  })()`); await sleep(350);
  ok(await ev(`raw.pieces.length`) === 15 && await ev(`raw.goals.length`) === 15, '15 块 / 15 个目标格');
  const byGoal = JSON.parse(await ev(`JSON.stringify(raw.goals.map((g,i)=>({
    cell:g.cells[0], color:raw.pieces[i].color })))`));
  ok(byGoal.every((o, i) => o.cell[0] === i % 4 && o.cell[1] === Math.floor(i / 4) && o.color === WANT[i]),
    '第 i 块的目标格就是第 i 格，颜色就是该格该有的颜色', byGoal.slice(0, 3));

  await ev(`(function(){
    for(let i=0;i<raw.goals.length;i++){ st[i].x=raw.goals[i].cells[0][0]; st[i].y=raw.goals[i].cells[0][1]; }
    const c=document.getElementById('cbGoalBox'); c.checked=false; c.dispatchEvent(new Event('change'));
    render(); updateUI(); })()`); await sleep(250);
  ok(await ev('checkWin()') === true, '还原态就是通关态');
  const drawn = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#board path[data-part="fill"]')]
    .map(p=>({i:+p.getAttribute('data-i'), c:p.getAttribute('fill')}))
    .sort((a,b)=>a.i-b.i).map(o=>o.c))`));
  ok(drawn.length === 15 && JSON.stringify(drawn) === JSON.stringify(WANT),
    '棋盘实绘颜色逐格 = 还原态配色', drawn);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'fifteen-solved.png'));
  ok(require('fs').statSync(path.join(__dirname, '..', '..', 'shots', 'fifteen-solved.png')).size > 10000,
    '还原态截图已落盘');

  console.log('\n[3] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed'
    : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})();
