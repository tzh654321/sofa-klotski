const path = require('path');
const { launch, sleep } = require('./cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(800);
  const r = await ev(`(function(){
    const e=lib.find(x=>x.name==='织布机');
    loadLibEntry(lib.indexOf(e));
    return JSON.stringify({n:raw.pieces.length,w:L.w,h:L.h,shuffle:raw.shuffle,steps:raw.shuffleSteps,
      atStart:K.isGoal(L,st,raw.goals), goalCount:raw.goals.length,
      names:raw.pieces.slice(0,6).map(p=>p.name), colors:raw.pieces.filter(p=>p.shape==='1x1').slice(0,4).map(p=>p.color)});
  })()`);
  console.log(r);
  await sleep(400);
  await b.shot(path.join(__dirname, '..', 'shots', 'loom-play.png'));
  const a = await ev(`JSON.stringify(st)`);
  await ev(`reset()`); await sleep(300);
  const c = await ev(`JSON.stringify(st)`);
  console.log('复位换题:', a !== c);
  await b.shot(path.join(__dirname, '..', 'shots', 'loom-reset.png'));
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(500);
  console.log('编辑态=基准态:', await ev(`JSON.stringify(st)===JSON.stringify(K.initialState(raw))`));
  console.log('libOps 显示:', await ev(`getComputedStyle(document.getElementById('libOps')).display`));
  console.log('恢复内置显示:', await ev(`getComputedStyle(document.getElementById('btnLibReset')).display`));
  await b.shot(path.join(__dirname, '..', 'shots', 'loom-edit.png'));
  console.log('errors', b.errors);
  b.close();
})();
