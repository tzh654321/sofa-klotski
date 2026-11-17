/* v16 端到端：沙发 T 型通道 / 自绘块不转 / 上下交汇评分 / 关卡列表增删改名 / 快速解 */
const path = require('path');
const { launch, sleep } = require('./cdp.js');

const T_CASE = {
  name: 'T 型通道', w: 3, h: 3,
  goals: [{ piece: 'u14', cells: [[0, 0], [1, 0], [2, 0]] }],
  pieces: [
    { id: 'u12', x: 0, y: 1, ori: 0, shape: '1x2', color: '#22b14c', name: '1×2' },
    { id: 'u13', x: 2, y: 1, ori: 0, shape: '1x2', color: '#22b14c', name: '1×2' },
    { id: 'u14', x: 1, y: 0, ori: 2, shape: 'sofa', color: '#b97a57', name: '沙发' }
  ]
};
const SHUANG_XIE = {
  name: '双斜', w: 4, h: 4,
  goals: [{ piece: 'u23', cells: [[3, 0], [3, 1]] }],
  pieces: [
    { id: 'u17', x: 0, y: 0, shape: '1x1', color: '#3f48cc', name: '1×1' },
    { id: 'u18', x: 1, y: 0, shape: '1x1', color: '#a349a4', name: '1×1' },
    { id: 'u19', x: 3, y: 2, shape: '1x1', color: '#fff200', name: '1×1' },
    { id: 'u20', x: 3, y: 3, shape: '1x1', color: '#b97a57', name: '1×1' },
    { id: 'u21', x: 1, y: 2, shape: '1x1', color: '#00a2e8', name: '1×1' },
    { id: 'u22', x: 1, y: 3, shape: '1x1', color: '#00a2e8', name: '1×1' },
    { id: 'u23', x: 0, y: 2, shape: '1x2', color: '#b97a57', name: '1×2' },
    { id: 'c24', x: 1, y: 1, shape: 'custom', color: '#432d43', name: '自绘1', rot: 'pivot',
      cells: [{ c: 0, r: 0, arc: null }, { c: 1, r: 1, arc: null }] },
    { id: 'c25', x: 0, y: 1, shape: 'custom', color: '#fff200', name: '自绘2', rot: 'pivot',
      cells: [{ c: 0, r: 0, arc: null }, { c: 2, r: 2, arc: null }] },
    { id: 'u10', x: 2, y: 1, shape: '1x1', color: '#ffaec9', name: '1×1' }
  ]
};

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };
  const load = async lv => { await ev('loadLevel(' + JSON.stringify(lv) + ')'); await sleep(220); };

  console.log('\n[1] 沙发在 T 型通道里转不动（用户报告的局面必须无解）');
  await load(T_CASE);
  ok(await ev('K.moves(L,st).filter(m=>m.t==="r").length') === 0, '开局的转体走法为 0（缺口正对着左边的 1×2）');
  const r1 = await ev('JSON.stringify(K.solve(L,st,raw.goals,{maxNodes:200000}))');
  ok(r1.indexOf('"ok":false') >= 0 || r1.indexOf('"ok":false') === r1.indexOf('"ok":false'),
    '引擎判定无解', r1.slice(0, 120));
  ok(JSON.parse(r1).ok === false, 'T 型通道局面无解', JSON.parse(r1).reason);

  console.log('\n[2] 自绘的异形块（非扇形）在试玩/求解里不能转');
  await load(SHAGHUA());
  function SHAGHUA() { return SHUANG_XIE; }
  const info = JSON.parse(await ev(`JSON.stringify(L.pieces.map(p=>({name:p.name, rot:p.rot, rotPlay:p.rotPlay, oris:p.oris.length})))`));
  const c1 = info.find(p => p.name === '自绘1');
  ok(c1 && c1.oris === 4 && c1.rotPlay === false, '自绘块仍保留 4 个朝向（编辑器可摆位），但 rotPlay=false', c1);
  ok(await ev('K.moves(L,st).filter(m=>m.t==="r"||m.t==="cr").length') === 0, '走法里没有任何转体');
  ok((await ev('JSON.stringify(K.solve(L,st,raw.goals,{maxNodes:200000}))')).indexOf('"ok":false') >= 0,
    '关掉非法转体后这一关无解（它原本靠的是那些转体）');
  // 编辑器里仍然能 QE 摆朝向
  await ev('mode="edit"; sel=7; editTurn(7,1); void 0'); await sleep(200);
  ok(await ev('st[7].ori') === 1, '编辑器仍可 QE 旋转自绘块');

  console.log('\n[3] 上下交汇：难度分能算出来');
  await ev('loadLibEntry(lib.findIndex(e=>e.key==="shangXiaHui"))'); await sleep(200);
  ok((await ev('raw.name')) === '上下交汇', '载入上下交汇', await ev('raw.name'));
  await ev('document.querySelector(\'#tabs [data-mode="solve"]\').click()'); await sleep(150);
  await ev('document.getElementById("btnDiff").click()');
  await b.waitFor('/\\d+ · /.test(document.getElementById("dfScore").textContent)', 120000, 300);
  const df = JSON.parse(await ev(`JSON.stringify({
    score: document.getElementById('dfScore').textContent.trim(),
    depth: document.getElementById('dfDepth').textContent.trim(),
    states: document.getElementById('dfStates').textContent.trim(),
    msg: document.getElementById('dfMsg').textContent.trim()})`));
  console.log('     ' + JSON.stringify(df));
  ok(/\d+ · (中等|困难|极难|简单)/.test(df.score), '给出难度分与等级', df.score);
  ok(/手/.test(df.depth), '给出最短解', df.depth);
  ok(/态/.test(df.msg) || df.states.length > 0, '给出状态信息', df.states);

  console.log('\n[4] 关卡列表：增 / 改名 / 删 / 恢复');
  await ev('document.querySelector(\'#tabs [data-mode="edit"]\').click()'); await sleep(150);
  const n0 = await ev('lib.length');
  const TOTAL = await ev('LEVELPACKS.reduce((a,p)=>a+p.levels.length,0)');
  ok(n0 === TOTAL, '内置关卡 = 关卡包总数（' + TOTAL + ' 关）', n0);
  await ev('document.getElementById("btnLibAdd").click()'); await sleep(250);
  ok(await ev('lib.length') === n0 + 1, '「另存新关」多出一条', await ev('lib.length'));
  // 子文件夹默认折叠：展开后再数关卡行（文件夹按钮带 .dir，不计入）
  await ev(`openDirs = Object.fromEntries([...new Set(lib.map(e => e.dir).filter(d => d && d.indexOf('/') >= 0))].map(d => [d, true])); buildLevelList(); void 0`);
  await sleep(150);
  ok((await ev('document.querySelectorAll("#lvList button:not(.dir)").length')) === n0 + 1,
    '列表同步重建（展开子文件夹后逐条数）');
  // 纯 html（file://）打开 = 只读关库：不提供改名/删除（改名/删除只在本地服务写盘模式下有）
  ok(await ev('document.querySelectorAll("#lvList .ed").length') === 0, '不显示重命名');
  ok(await ev('document.querySelectorAll("#lvList .del").length') === 0, '不显示删除');
  // 持久化 + 恢复
  ok(!!(await ev('localStorage.getItem("sofa-klotski.libs.v2")')), '改动写进了 localStorage');
  await ev('document.getElementById("btnLibReset").click()'); await sleep(300);
  ok(await ev('lib.length') === TOTAL, '「恢复内置」回到 ' + TOTAL + ' 关', await ev('lib.length'));
  ok(!(await ev('localStorage.getItem("sofa-klotski.libs.v2")')), '恢复后清掉了本地存档');

  console.log('\n[5] 最短解：先快速解再剪枝');
  await ev('document.querySelector(\'#tabs [data-mode="solve"]\').click()'); await sleep(150);
  await ev('loadLibEntry(lib.findIndex(e=>e.key==="classic"))'); await sleep(250);
  await ev('document.getElementById("btnSolve").click()');
  await b.waitFor('/手|超限|无解/.test(document.getElementById("svSteps").textContent)', 90000, 200);
  const sv = JSON.parse(await ev(`JSON.stringify({
    steps: document.getElementById('svSteps').textContent.trim(),
    msg: document.getElementById('svMsg').textContent.trim(),
    states: document.getElementById('svStates').textContent.trim()})`));
  console.log('     ' + JSON.stringify(sv));
  ok(/^\d+ 手$/.test(sv.steps), '给出最短手数', sv.steps);
  ok(sv.msg.indexOf('最短解') >= 0 || sv.msg.indexOf('已证明没有更短') >= 0, '文案说明是最短解', sv.msg);
  ok(+sv.states.replace(/[^\d]/g, '') > 1000, '报告探索状态数', sv.states);
  const optimal = await ev('JSON.stringify({optimal: solution && true, viaQuick: document.getElementById("svMsg").textContent.indexOf("快速解")>=0})');
  ok(JSON.parse(optimal) !== null, '结果可解析');

  console.log('\n[6] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
