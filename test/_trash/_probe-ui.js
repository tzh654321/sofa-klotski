const path = require('path');
const { launch, sleep } = require('./cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  console.log(await ev(`JSON.stringify({
    mode: mode,
    libOps: getComputedStyle(document.getElementById('libOps')).display,
    reset: getComputedStyle(document.getElementById('btnLibReset')).display,
    sets: [...document.querySelectorAll('#setBar button')].map(b=>b.textContent)
  })`));
  await b.shot(path.join(__dirname, '..', 'shots', 'list-play.png'));
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(400);
  console.log('edit:', await ev(`getComputedStyle(document.getElementById('libOps')).display`));
  await ev(`document.querySelector('aside').scrollTop = 99999`); await sleep(250);
  await b.shot(path.join(__dirname, '..', 'shots', 'list-edit.png'));
  await ev(`document.querySelector('aside').scrollTop = 99999`); await sleep(200);
  await b.shot(path.join(__dirname, '..', 'shots', 'list-edit-bottom.png'));
  await ev(`document.querySelector('#tabs [data-mode="play"]').click()`); await sleep(300);
  await ev(`(function(){const e=lib.find(x=>x.name==='4阶数字华容道');loadLibEntry(lib.indexOf(e));})()`);
  await sleep(600);
  await ev(`document.querySelector('#tabs [data-mode="solve"]').click()`); await sleep(300);
  console.log('p15 meta:', await ev(`document.getElementById('dfDepth').textContent + ' | ' + document.getElementById('lvMeta').textContent`));
  await b.shot(path.join(__dirname, '..', 'shots', 'p15-solve.png'));
  console.log('errors', b.errors);
  b.close();
})();
