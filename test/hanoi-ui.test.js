/* 汉诺塔 UI 回归：专用求解卡、命名显示、按钮秒出 31 手解、截图
 *   node test/hanoi-ui.test.js
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

  console.log('[1] 载入汉诺塔，专用卡出现');
  await ev(`loadLibEntry(lib.findIndex(e=>e.name==='汉诺塔')); void 0`);
  await sleep(400);
  const s = JSON.parse(await ev(`JSON.stringify({
    name: raw.name, solver: raw.solver,
    hanoi: isHanoiLevel(),
    card: document.getElementById('hanoiCard').style.display,
    gen: document.getElementById('btnSolve').style.display,
    names: raw.pieces.map(p=>p.name)
  })`));
  ok(s.name === '汉诺塔' && s.solver === 'hanoi', '载入的是带 hanoi 标记的关', [s.name, s.solver]);
  ok(s.hanoi === true && s.card === 'block', '汉诺塔专用求解卡可见', [s.hanoi, s.card]);
  ok(s.gen === 'none', '通用求解按钮被隐藏（避免跑 BFS）', s.gen);
  ok(s.names.indexOf('火环') >= 0 && s.names.indexOf('金环') >= 0 &&
    s.names.indexOf('门柱') >= 0, '滑块名显示在数据里（火·木·土·水·金 + 门柱）', s.names);
  await b.shot(path.join(__dirname, '..', 'shots', 'hanoi.png'));

  console.log('\n[2] 点「载入最优解」');
  const t0 = Date.now();
  await ev(`document.getElementById('btnHanoiFast').click()`);
  await sleep(300);
  const r = JSON.parse(await ev(`JSON.stringify({
    steps: document.getElementById('svSteps').textContent,
    states: document.getElementById('svStates').textContent,
    msg: document.getElementById('svMsg').textContent,
    hmsg: document.getElementById('hanoiMsg').textContent,
    hands: solution ? solution.hands.length : -1,
    moves: solution ? solution.moves.length : -1,
    rowCount: document.querySelectorAll('#steps > *').length
  })`));
  ok(r.hands === 31 && r.moves === 906, '拿到 31 手 / 906 步解', [r.hands, r.moves]);
  ok(/31 手/.test(r.steps), '解面板显示 31 手', r.steps);
  ok(/整盘搬动/.test(r.states), '面板说明是整盘搬动', r.states);
  ok(/不保证单格最短/.test(r.msg), '明确标注非单格最短', r.msg);
  ok(r.rowCount > 0, '步骤列表渲染出来了', r.rowCount);
  ok(Date.now() - t0 < 3000, '秒出（不是分钟级搜索）', (Date.now() - t0) + 'ms');

  console.log('\n[3] 解在页面里回放可到终点');
  const fin = await ev(`(()=>{
    let s = K.initialState(window.resolveShapes(raw));
    for (const m of solution.moves) s = K.apply(s, m);
    return K.isGoal(L, s, raw.goals);
  })()`);
  ok(fin === true, '906 步在页面引擎里回放后达成目标');

  b.close();
  console.log('\n' + (fail ? 'FAILED  ' + fail + ' / ' + (pass + fail) : 'ALL PASS  ' + pass + ' 条'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
