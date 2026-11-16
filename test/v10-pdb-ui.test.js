/* v10：PDB + 后台线程（走 http 才能用 Worker）
 *   自己起一个本地写盘服务（随机端口）再打开页面：Worker 需要 http，别依赖外部端口。 */
const path = require('path');
const { launch, sleep } = require('./cdp');
const { createServer } = require('../tools/serve.js');
const PROJECT = path.join(__dirname, '..');
let srv = null, URL = '';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  srv = createServer({ root: PROJECT, static: PROJECT });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  URL = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const b = await launch(URL);
  const ev = b.evalJs;
  const txt = s => ev('document.querySelector("' + s + '").textContent.trim()');

  console.log('\n[1] http 下 Worker 可用、PDB 脚本已加载');
  ok(await ev('typeof Puzzle15PDB === "object"'), 'pdb15.js 已加载');
  ok(await ev('p15WorkerOK()') === true, 'Worker 可用');

  console.log('\n[2] 载入十五子并跑最短解（首次会造 4 张模式库）');
  await ev('document.getElementById("btnN15").click()'); await sleep(300);
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="solve"]\').click()'); await sleep(150);
  // 关卡现在是「随机型」：载入就是 300 步打乱，随机局面的最优解 IDA* 要跑很久。
  // 这一段只验"PDB 最短解这条路通"，所以先摆一个离终局 12 步的局面（秒解）；
  // 真·随机局面会不会超限，留给 [4] 验"要么给解、要么诚实说超限"。
  await ev('st = K.scramble(L, K.initialState(raw), 12); render(); updateUI();');
  await sleep(150);
  const t0 = Date.now();
  await ev('document.getElementById("btnOpt").click()');
  await sleep(1200);
  const mid = await txt('#p15Msg');
  console.log('     1.2s 时面板：' + mid);
  ok(/模式库|搜索中/.test(mid), '期间有进度提示（主线程没被卡死）', mid);
  // 等出结果
  let steps = '', waited = 0;
  while (waited < 60000) {
    steps = await txt('#svSteps');
    if (/^\d+ 手$/.test(steps) || steps === '超限' || steps === '无解') break;
    await sleep(500); waited += 500;
  }
  console.log('     结果 ' + steps + ' | ' + (await txt('#svMsg')).slice(0, 80));
  ok(/^\d+ 手$/.test(steps), '给出最短手数', steps);
  const msg = await txt('#svMsg');
  ok(/已证明最短/.test(msg), '明确说明已证明最短', msg.slice(0, 60));
  const pdbs = await ev('JSON.stringify(p15Pdbs && p15Pdbs.map(p=>[p.k,p.size,p.maxD]))');
  console.log('     模式库 ' + pdbs);
  ok(pdbs.indexOf('5,5765760') > 0 || pdbs.indexOf('5765760') > 0, '含 5 数字那张表(5,765,760)', pdbs);

  console.log('\n[3] 结果回放到终局');
  await ev('[...document.querySelectorAll("#steps div")].pop().click()'); await sleep(400);
  ok(await ev('checkWin()') === true, '全部数字归位');

  console.log('\n[4] 打乱成深局面后最短解仍可用（这次模式库已有缓存）');
  await ev('reset()'); await sleep(300);           // 复位 = 随机打乱 300 步
  await ev('document.getElementById("btnOpt").click()');
  let steps2 = '', w2 = 0;
  while (w2 < 60000) {
    steps2 = await txt('#svSteps');
    if (/^\d+ 手$/.test(steps2) || steps2 === '超限') break;
    await sleep(500); w2 += 500;
  }
  console.log('     打乱后最短解 ' + steps2 + '（等了 ' + (w2 / 1000).toFixed(1) + 's）');
  ok(/^\d+ 手$/.test(steps2) || steps2 === '超限', '深局面给出解或诚实超限', steps2);

  console.log('\n[5] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
