/* 难度分是否写回「关卡数据」 + 路径条数的显示精度 */
const path = require('path');
const { launch, sleep } = require('./cdp');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  const txt = s => ev('document.querySelector("' + s + '").textContent.trim()');

  console.log('\n[1] 造一个自定义关并存进关卡库');
  await ev('loadLevel(LV.classic())');
  await sleep(250);
  await ev('raw.name = "写回测试关"; libAddCurrent(); void 0');
  await sleep(200);
  const e0 = JSON.parse(await ev('JSON.stringify(lib.find(x => x.name === "写回测试关"))'));
  ok(!!e0 && !!e0.level, '关卡已存进库（带 level 数据）', e0 && Object.keys(e0));
  ok(!e0.level.meta, '刚存进去时没有 meta', e0.level.meta);
  const rowBefore = await ev('[...document.querySelectorAll("#lvList .lvbtn")].map(b=>b.textContent).find(t=>t.indexOf("写回测试关")===0)');
  ok(/不计分/.test(rowBefore), '列表里显示「不计分」', rowBefore);

  console.log('\n[2] 分析难度 → 自动写回关卡数据');
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="solve"]\').click()');
  await sleep(150);
  await ev('document.getElementById("btnDiff").click()');
  let df = '', waited = 0;
  while (waited < 90000) {
    df = await txt('#dfScore');
    if (/\d/.test(df)) break;
    await sleep(500); waited += 500;
  }
  console.log('     难度 ' + df + '（等了 ' + (waited / 1000).toFixed(1) + 's）');
  ok(/\d+/.test(df), '算出难度分', df);

  const e1 = JSON.parse(await ev('JSON.stringify(lib.find(x => x.name === "写回测试关"))'));
  console.log('     写回后 meta = ' + JSON.stringify(e1.level.meta));
  ok(!!e1.level.meta, '自定义关的 meta 写进了 level 数据', e1.level.meta);
  ok(e1.level.meta && e1.level.meta.score >= 25, 'score 是算出来的分数', e1.level.meta && e1.level.meta.score);
  ok(e1.level.meta && e1.level.meta.depth > 0 && e1.level.meta.hands > 0, 'depth / hands 也一起存了', e1.level.meta);

  const rowAfter = await ev('[...document.querySelectorAll("#lvList .lvbtn")].map(b=>b.textContent).find(t=>t.indexOf("写回测试关")===0)');
  console.log('     列表行：' + rowAfter);
  ok(!/不计分/.test(rowAfter) && /\d+ 分/.test(rowAfter), '列表不再显示「不计分」，改为显示分数', rowAfter);

  console.log('\n[3] 导出 JSON 带上 meta（可以粘回 levels.js）');
  const dump = JSON.parse(await ev('document.getElementById("btnDump").click(), document.getElementById("jsonBox").value'));
  console.log('     导出的 meta = ' + JSON.stringify(dump.meta));
  ok(dump.meta && dump.meta.score === e1.level.meta.score, '导出含 meta 且分数一致', dump.meta);

  console.log('\n[4] 改了棋盘就不该沿用旧分');
  // 改的是「状态」（st 才是真相，raw.pieces 会被 syncRaw 反向覆盖）
  const snap = JSON.parse(await ev('(function(){var o=st[0];st[0]={x:o.x,y:o.y+1,ori:o.ori};' +
    'var s=snapshotCurrent();st[0]=o;return JSON.stringify({meta:s.meta||null});})()'));
  ok(snap.meta === null, '挪过块之后 snapshotCurrent 不带旧 meta（指纹对不上就不沿用）', snap);

  console.log('\n[5] 刷新页面：分数从 localStorage 回来');
  await ev('location.reload(); 1').catch(() => { });
  await sleep(2200);
  const rowsAfterReload = await ev('[...document.querySelectorAll("#lvList .lvbtn")].map(b=>b.textContent)').catch(() => '');
  console.log('     刷新后行：' + String(rowsAfterReload).indexOf('写回测试关'));
  ok(String(rowsAfterReload).indexOf('写回测试关') >= 0, '关卡记录还在', rowsAfterReload);
  const reloadRow = await ev('[...document.querySelectorAll("#lvList .lvbtn")].map(b=>b.textContent).find(t=>t.indexOf("写回测试关")===0)').catch(() => '');
  ok(/\d+ 分/.test(String(reloadRow)), '刷新后列表仍显示分数（不再重算）', reloadRow);

  console.log('\n[6] 路径条数：大数只报数量级');
  const fmt = JSON.parse(await ev('JSON.stringify([fmtPaths(6), fmtPaths(2520), fmtPaths(4.5138687416092e62), fmtPaths(Infinity)])'));
  console.log('     ' + JSON.stringify(fmt));
  ok(fmt[0] === '6', '小数原样显示', fmt[0]);
  ok(fmt[1] === '2,520', '安全整数范围内加千分位', fmt[1]);
  ok(/^约 4\.51×10⁶²$/.test(fmt[2]), '超过 2^53 改成「约 a×10ⁿ」', fmt[2]);
  ok(/溢出/.test(fmt[3]), 'Infinity 明确写溢出', fmt[3]);

  console.log('\n[7] 无异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
