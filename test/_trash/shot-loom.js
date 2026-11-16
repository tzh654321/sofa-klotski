const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  await ev(`(function(){const e=lib.find(x=>x.name==='织布机');loadLibEntry(lib.indexOf(e));})()`);
  await sleep(900);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'loom-play2.png'));
  console.log('ok', b.errors);
  b.close();
})();
