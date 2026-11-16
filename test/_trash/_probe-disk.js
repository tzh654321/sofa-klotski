const fs = require('fs');
const path = require('path');
const os = require('os');
const { createServer } = require('../tools/serve.js');
const { launch, sleep } = require('./cdp.js');
const PROJECT = path.join(__dirname, '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sofa-dbg-'));
const LV = path.join(ROOT, 'levels');
(async () => {
  fs.mkdirSync(LV, { recursive: true });
  const src = fs.readdirSync(path.join(PROJECT, 'levels')).filter(f => f.endsWith('.json') && f[0] !== '_').sort()[0];
  const rec = JSON.parse(fs.readFileSync(path.join(PROJECT, 'levels', src), 'utf8'));
  fs.writeFileSync(path.join(LV, '01_甲关.json'), JSON.stringify(rec, null, 1));
  const srv = createServer({ root: ROOT, static: PROJECT });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const ping = await (await fetch(base + '/api/ping')).text();
  console.log('ping', ping.slice(0, 120));
  const b = await launch(base + '/index.html');
  for (let i = 0; i < 30; i++) { await sleep(200); if (await b.evalJs('diskMode === true')) break; }
  console.log(await b.evalJs(`JSON.stringify({disk:diskMode,lib:lib.length,sets:(window.LEVELPACKS||[]).length,
    err:(window.__lastErr||null)})`));
  console.log('errors', b.errors);
  b.close(); await new Promise(r => srv.close(r));
})();
