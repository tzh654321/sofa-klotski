/* v9：十五子专用求解器（快速解 / 最短解 / 分层解 / 打乱） */
const path = require('path');
const { launch, sleep } = require('./cdp');
const PAGE = path.join(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  const b = await launch(PAGE);
  const ev = b.evalJs;
  const txt = s => ev('document.querySelector("' + s + '").textContent.trim()');

  console.log('\n[1] 载入十五子，检测生效');
  await ev('document.getElementById("btnN15").click()'); await sleep(300);
  ok(await ev('L.w') === 4 && await ev('L.h') === 4, '4×4');
  ok(await ev('raw.pieces.length') === 15, '15 块');
  const info = JSON.parse(await ev('JSON.stringify(p15info())'));
  ok(info && info.start.length === 16, 'detect 返回 16 格盘面');
  ok(JSON.stringify(info.goal) === '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0]', '目标盘面 = 1..15 + 空格');
  ok(info.start.filter(x => x === 0).length === 1, '恰好一个空格');
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="solve"]\').click()'); await sleep(150);
  ok(await ev('getComputedStyle(document.getElementById("p15Card")).display') !== 'none', '十五子专用面板可见');

  console.log('\n[2] 快速解');
  await ev('document.getElementById("btnFast").click()');
  await b.waitFor('/^\\d+ 手$/.test(document.getElementById("svSteps").textContent)', 60000, 200);
  const f1 = await txt('#svSteps'), m1 = await txt('#svMsg');
  console.log('     ' + f1 + ' | ' + m1);
  ok(/^\d+ 手$/.test(f1), '给出解的手数', f1);
  ok(/快速解/.test(m1) && /ms/.test(m1), '报告模式与耗时', m1.slice(0, 60));

  console.log('\n[3] 跳到最后一手应通关');
  await ev('[...document.querySelectorAll("#steps div")].pop().click()'); await sleep(500);
  ok(await ev('checkWin()') === true, '所有目标达成');
  const allHome = await ev('(function(){var ok=true;for(var i=0;i<15;i++){var g=raw.goals.find(x=>x.piece===raw.pieces[i].id);if(!g)continue;var c=K.pieceCells(L,st,i);if(c[0][0]!==g.cells[0][0]||c[0][1]!==g.cells[0][1])ok=false;}return ok;})()');
  ok(allHome === true, '15 个数字都在自己的目标格');

  console.log('\n[4] 最短解（预制局面；深局面允许超预算，但必须说实话）');
  await ev('document.getElementById("btnN15").click()'); await sleep(300);
  await ev('document.getElementById("btnOpt").click()');
  // 等最短解跑完（PDB 构建 + IDA*；成功写手数，失败写"超限/无解"）
  await b.waitFor('/手|超限|无解/.test(document.getElementById("svSteps").textContent)', 120000, 300);
  const o1 = await txt('#svSteps'), om = await txt('#p15Msg');
  console.log('     ' + o1 + ' | ' + om.slice(0, 90));
  if (/^\d+ 手$/.test(o1)) {
    ok(/已证明最短/.test(await txt('#svMsg')), '给出"已证明最短"结论');
    await ev('[...document.querySelectorAll("#steps div")].pop().click()'); await sleep(400);
    ok(await ev('checkWin()') === true, '最短解回放到终局');
  } else {
    ok(o1 === '超限' || o1 === '无解', '诚实报告超预算', o1);
    ok(/快速解|分层解/.test(om), '提示改用其它模式', om.slice(0, 60));
  }

  console.log('\n[5] 分层解（A/B/C 三层）');
  await ev('document.getElementById("btnN15").click()'); await sleep(350);   // 上一段把盘面走完了，重新载入
  await ev('document.getElementById("btnLayer").click()');
  await b.waitFor('/^\\d+ 手$/.test(document.getElementById("svSteps").textContent)', 60000, 200);
  const l1 = await txt('#svSteps'), lm = await txt('#svMsg');
  console.log('     ' + l1 + ' | ' + lm);
  ok(/^\d+ 手$/.test(l1), '分层解给出解', l1);
  ok(/分层解/.test(lm), '报告模式', lm.slice(0, 40));
  await ev('[...document.querySelectorAll("#steps div")].pop().click()'); await sleep(400);
  ok(await ev('checkWin()') === true, '分层解回放到终局');

  console.log('\n[6] 打乱后仍能快速解');
  await ev('reset()'); await sleep(400);          // 随机型关卡：复位就是重新出一道题
  const scrambled = await ev('checkWin()');
  ok(scrambled === false, '复位（随机打乱）后未完成');
  await ev('document.getElementById("btnFast").click()');
  await b.waitFor('/^\\d+ 手$/.test(document.getElementById("svSteps").textContent)', 60000, 200);
  const f2 = await txt('#svSteps');
  console.log('     打乱后快速解 ' + f2);
  ok(/^\d+ 手$/.test(f2), '打乱后仍能出解', f2);
  await ev('[...document.querySelectorAll("#steps div")].pop().click()'); await sleep(500);
  ok(await ev('checkWin()') === true, '打乱后也回放到终局');

  console.log('\n[6b] 随机打乱是关卡属性：复位就换一道题，不再有专用打乱按钮');
  {
    await ev('document.getElementById("btnN15").click()'); await sleep(320);
    ok(await ev('raw.shuffle === true && raw.shuffleSteps === 300'),
      '关卡带 shuffle / shuffleSteps=300', await ev('JSON.stringify([raw.shuffle, raw.shuffleSteps])'));
    ok(await ev('!document.getElementById("btnScramble") && !document.getElementById("btnScramble300")'),
      '老的「打乱 60/300 步」按钮已撤掉');
    // 载入即打乱：一进来就不是终局
    ok(await ev('checkWin()') === false, '载入后就已经是打乱的局面');
    const before = await ev('JSON.stringify(st)');
    await ev('reset()'); await sleep(400);
    const after = await ev('JSON.stringify(st)');
    ok(after !== before, '再点复位又换了一道题');
    ok(await ev('checkWin()') === false, '复位后不在终局');
    ok(await ev('p15info() && true'), '仍是合法的 4×4 盘面');
    // 连续复位 5 次应该出 5 个不同局面（300 步打乱，撞车概率可忽略）
    const seen = new Set();
    for (let k = 0; k < 5; k++) { await ev('reset()'); seen.add(await ev('JSON.stringify(st)')); }
    ok(seen.size === 5, '连续 5 次复位得到 5 个不同局面', seen.size);
  }

  console.log('\n[7] 非十五子关卡不该出现专用面板');
  await ev('document.getElementById("btnClassic").click()'); await sleep(300);
  ok(await ev('getComputedStyle(document.getElementById("p15Card")).display') === 'none', '非十五子关隐藏专用面板');
  ok(await ev('p15info() === null'), 'detect 返回 null');

  console.log('\n[8] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
