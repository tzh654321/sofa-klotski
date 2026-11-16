const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  await ev(`(function(){const e=lib.find(x=>x.name==='4阶数字华容道');loadLibEntry(lib.indexOf(e));})()`);
  await sleep(700);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'p15-play.png'));
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(400);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'p15-edit.png'));
  console.log('ok', b.errors);
  b.close();
})();
