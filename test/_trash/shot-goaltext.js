const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  await ev(`(function(){const e=lib.find(x=>x.name==='横刀立马');loadLibEntry(lib.indexOf(e));})()`);
  await sleep(700);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'goaltext-classic.png'));
  await ev(`(function(){const e=lib.find(x=>x.name==='4阶数字华容道');loadLibEntry(lib.indexOf(e));})()`);
  await sleep(800);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'goaltext-p15.png'));
  console.log('ok', b.errors);
  b.close();
})();
