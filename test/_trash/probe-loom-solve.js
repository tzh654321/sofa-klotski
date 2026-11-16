const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  await ev(`(function(){const e=lib.find(x=>x.name==='织布机');loadLibEntry(lib.indexOf(e));})()`);
  await sleep(700);
  await ev(`document.querySelector('#tabs [data-mode="solve"]').click()`);
  await sleep(400);
  console.log('卡片:', await ev(`getComputedStyle(document.getElementById('loomCard')).display`),
    '| 通用求解按钮:', await ev(`getComputedStyle(document.getElementById('btnSolve')).display`));
  const t0 = Date.now();
  await ev(`document.getElementById('btnLoomFast').click()`);
  const done = await b.waitFor(`/^\\d+ 手$/.test(document.getElementById('svSteps').textContent) || document.getElementById('svSteps').textContent==='封顶'`, 180000, 500);
  console.log('完成:', done, ((Date.now()-t0)/1000).toFixed(1)+'s');
  console.log('步骤:', await ev(`document.getElementById('svSteps').textContent`),
    '| 消息:', (await ev(`document.getElementById('svMsg').textContent`)).slice(0, 90));
  console.log('解法条数:', await ev(`document.querySelectorAll('#steps div').length`));
  // 回放到最后一步
  await ev(`[...document.querySelectorAll('#steps div')].pop().click()`); await sleep(1200);
  console.log('回放后达成:', await ev(`checkWin()`));
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'loom-solve.png'));
  console.log('errors', b.errors);
  b.close();
})();
