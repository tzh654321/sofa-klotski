const path = require('path');
const { launch, sleep } = require('./cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  const out = {};
  await ev(`(function(){const e=lib.find(x=>x.name==='织布机');loadLibEntry(lib.indexOf(e));})()`);
  await sleep(500);
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(400);
  out.cb = await ev(`document.getElementById('cbShuffle').checked`);
  out.steps = await ev(`document.getElementById('inShuffleSteps').value`);
  out.disabled = await ev(`document.getElementById('inShuffleSteps').disabled`);
  // 关掉随机
  await ev(`document.getElementById('cbShuffle').click()`); await sleep(300);
  out.off = await ev(`JSON.stringify([raw.shuffle, raw.shuffleSteps||null, document.getElementById('inShuffleSteps').disabled])`);
  // 再打开并改步数
  await ev(`document.getElementById('cbShuffle').click()`); await sleep(200);
  await ev(`(function(){const i=document.getElementById('inShuffleSteps');i.value=500;i.dispatchEvent(new Event('change'));})()`);
  await sleep(200);
  out.on = await ev(`JSON.stringify([raw.shuffle, raw.shuffleSteps])`);
  await ev(`document.querySelector('aside').scrollTop = 0`); await sleep(200);
  await b.shot(path.join(__dirname, '..', 'shots', 'edit-shuffle.png'));
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', b.errors);
  b.close();
})();
