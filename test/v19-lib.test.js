/* v19 端到端：关卡列表不能出现同名重复（老版本/localStorage 里留下的同名副本要自动合并）
 *
 *   1 正常情况下列表没有重名
 *   2 陈旧副本（内容与内置关一致、只是分数旧）→ 只剩一条，用内置那份，localStorage 被清干净
 *   3 真的改过（同名但布局不同）→ 只剩一条，用改过的那份，并且可以删除（删了就回内置）
 *   4 「另存新关」碰到重名自动加序号，不会造出两条同名
 */
const path = require('path');
const { launch, sleep } = require('./cdp.js');

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  let pass = 0, fail = 0;
  const ok = (c, m, x) => {
    c ? (pass++, console.log('  ok  ' + m))
      : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
  };

  // 关卡总数会随加关变化：从关卡包算，别写死
  const TOTAL = await ev('LEVELPACKS.reduce((a,p)=>a+p.levels.length,0)');

  console.log('\n[1] 正常情况下列表没有重名，且 file:// 是只读库');
  ok(await ev('document.querySelectorAll("#lvList .ed").length') === 0, '不显示 ✎（重命名）');
  ok(await ev('document.querySelectorAll("#lvList .del").length') === 0, '不显示 ×（删除）');
  const names = JSON.parse(await ev(`JSON.stringify(lib.map(e => e.name))`));
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  ok(dup.length === 0, '没有重名条目（' + names.length + ' 条）', dup);

  console.log('\n[2] 陈旧同名副本 → 合并成一条，用内置那份');
  await ev(`(function(){
    const e = lib.find(x => x.name === '万里征途');
    const stale = { key:'uOLD', src:'custom', set:'待分类', name:'万里征途',
      level: JSON.parse(JSON.stringify(e.level)),
      meta: { score: 92, grade: '极难', depth: 1348, hands: 1165, states: 1338449 } };
    localStorage.setItem('sofa-klotski.libs.v2', JSON.stringify({ customs:[stale], names:{} }));
    return true;
  })()`);
  await ev('location.reload()'); await sleep(1300);
  const r2 = JSON.parse(await ev(`JSON.stringify({
    rows: [...document.querySelectorAll('#lvList button')].filter(x=>x.querySelector('.nm').textContent==='万里征途').length,
    one: lib.filter(x=>x.name==='万里征途').map(x=>[x.src, x.meta && x.meta.score]),
    total: lib.length,
    stored: (JSON.parse(localStorage.getItem('sofa-klotski.libs.v2')||'{}').customs||[]).length
  })`));
  ok(r2.rows === 1, '列表里只有一条', r2.rows);
  ok(r2.one.length === 1 && r2.one[0][0] === 'pack', '留下的是内置那条', r2.one);
  ok(r2.stored === 0, '陈旧副本已经从 localStorage 清掉', r2.stored);
  ok(r2.total === TOTAL, '总数回到关卡包总数（' + TOTAL + '）', r2.total);

  console.log('\n[3] 同名但内容不同 → 仍然以磁盘文件为准（浏览器副本一律丢）');
  await ev(`(function(){
    const e = lib.find(x => x.name === '上下交汇');
    const lv = JSON.parse(JSON.stringify(e.level));
    lv.pieces[0].x = 3; lv.pieces[0].y = 3;          // 动一格，内容就不一样了
    const c = { key:'uEDIT', src:'custom', set:'待分类', name:'上下交汇', level: lv,
      meta:{ score: 61, grade: '困难' } };
    localStorage.setItem('sofa-klotski.libs.v2', JSON.stringify({ customs:[c], names:{} }));
    return true;
  })()`);
  await ev('location.reload()'); await sleep(1300);
  const r3 = JSON.parse(await ev(`JSON.stringify({
    rows: [...document.querySelectorAll('#lvList button')].filter(x=>x.querySelector('.nm').textContent==='上下交汇').length,
    one: lib.filter(x=>x.name==='上下交汇').map(x=>[x.src, x.meta && x.meta.score]),
    canDel: !!document.querySelector('#lvList button[data-key="' + (lib.find(x=>x.name==='上下交汇')||{}).key + '"] .del'),
    total: lib.length
  })`));
  ok(r3.rows === 1, '列表里只有一条', r3.rows);
  ok(r3.one.length === 1 && r3.one[0][0] === 'pack', '留下的是磁盘那份（文件才是唯一真相）', r3.one);
  ok(typeof r3.one[0][1] === 'number', '分数用磁盘那份（当前是 ' + r3.one[0][1] + ' 分）');
  ok(!r3.canDel, 'file:// 下不提供删除按钮');
  ok(r3.total === TOTAL, '总数还是关卡包总数（' + TOTAL + '）', r3.total);

  console.log('\n[4] 「另存新关」重名时自动加序号');
  await ev(`localStorage.removeItem('sofa-klotski.libs.v2');`);
  await ev('location.reload()'); await sleep(1200);
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(150);
  await ev(`document.querySelectorAll('#lvList button')[0].click()`); await sleep(400);
  const nm0 = await ev('raw.name');
  await ev(`document.getElementById('btnLibAdd').click()`); await sleep(350);
  await ev(`document.getElementById('btnLibAdd').click()`); await sleep(350);
  const added = JSON.parse(await ev(`JSON.stringify(lib.filter(x=>x.src==='custom').map(x=>x.name))`));
  ok(added.length === 2 && added[0] !== added[1], '两次另存得到两个不同名字（原关名 + 序号）',
    { base: nm0, added });
  ok(added.every(n => n.indexOf(nm0) === 0), '都以原关卡名开头', added);
  const dup2 = added.filter((n, i) => added.indexOf(n) !== i);
  ok(dup2.length === 0, '没有造出同名副本', dup2);

  console.log('\n[5] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  await b.close();
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
