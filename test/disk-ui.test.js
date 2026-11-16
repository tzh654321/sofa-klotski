/* 写盘模式 UI 端到端：页面点一下，levels/ 里的 json 真的变
 *   node test/disk-ui.test.js
 *
 * 服务的数据目录是临时目录，页面静态文件用真实项目目录 —— 不碰真实关卡。
 * 同时验证 file:// 打开时仍走旧的 localStorage 模式（零回归）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createServer } = require('../tools/serve.js');
const { launch, sleep } = require('./cdp.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};
const PROJECT = path.join(__dirname, '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sofa-disk-ui-'));
const LV = path.join(ROOT, 'levels');
const SET = '待分类';            // 「待分类」= levels 根目录本身
const DIR = LV;
const SHOTS = path.join(PROJECT, 'shots');

function fixture(file, name) {
  const src = fs.readdirSync(path.join(PROJECT, 'levels'))
    .filter(f => f.endsWith('.json') && f[0] !== '_').sort()[0];
  const rec = JSON.parse(fs.readFileSync(path.join(PROJECT, 'levels', src), 'utf8'));
  rec.set = SET; rec.id = SET + '-' + file.slice(0, 2);
  rec.name = name; rec.lvKey = null; rec.level.name = name;
  rec.solution = { solver: 'test', optimal: true, steps: 3, hands: 2, moves: [] };
  rec.meta = { score: 41, grade: '中等', depth: 3, hands: 2, states: 10, paths: 2 };
  fs.writeFileSync(path.join(DIR, file), JSON.stringify(rec, null, 1) + '\n', 'utf8');
}
function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function waitDisk(fn, ms) {
  const t0 = Date.now();
  return new Promise(resolve => {
    const tick = () => {
      let v = false; try { v = !!fn(); } catch (e) { }
      if (v) return resolve(true);
      if (Date.now() - t0 > (ms || 15000)) return resolve(false);
      setTimeout(tick, 120);
    };
    tick();
  });
}
function rectOf(ev, sel) {
  return ev(`JSON.stringify(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`)
    .then(s => JSON.parse(s));
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  fixture('01_甲关.json', '甲关');
  fixture('02_乙关.json', '乙关');

  const srv = createServer({ root: ROOT, static: PROJECT });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const b = await launch(url);
  const ev = b.evalJs;

  console.log('[1] 写盘模式探测');
  {
    const s = JSON.parse(await ev(`JSON.stringify({
      disk: diskMode, lib: lib.length, packs: diskPacks && diskPacks.length,
      del: document.querySelectorAll('#lvList .del').length,
      hint: (document.getElementById('libHint')||{}).textContent || ''
    })`));
    ok(s.disk === true, 'http 打开自动切到写盘模式', s.disk);
    // 临时目录里只有 2 关 ⇒ 列表必须是磁盘来的；集数跟着 ORDER 变，别写死
    ok(s.lib === 2, '列表来自磁盘而不是 levelpacks.js（临时目录只有 2 关）', [s.lib, s.packs]);
    ok(s.del === 2, '内置关也出现删除按钮', s.del);
    ok(/写盘模式/.test(s.hint), '界面提示写明会改磁盘文件', s.hint);
  }

  console.log('\n[2] 难度分写回：92 分真的进 json，列表不再显示旧分');
  {
    const before = await ev(`document.querySelector('#lvList .lvbtn .sc').textContent`);
    ok(/41/.test(before), '一开始是文件里的 41 分', before);
    await ev(`commitMetaToLib({score:92,grade:'极难',estimated:false},
      {depth:1348,hands:1165,states:1338449,paths:4.5e59}); void 0`);
    const done = await waitDisk(() => readJSON(path.join(DIR, '01_甲关.json')).meta.score === 92);
    ok(done, '磁盘里的 meta.score 变成 92');
    // 文件落盘 ≠ 页面已重拉列表：还要等 diskRun 的 reloadDisk 走完
    await b.waitFor('diskBusy===0 && /92/.test(document.querySelector("#lvList .lvbtn .sc").textContent)', 15000);
    const list = await ev(`document.querySelector('#lvList .lvbtn .sc').textContent`);
    ok(/92/.test(list), '关卡列表显示 92 分', list);
    await b.shot(path.join(SHOTS, 'disk-write.png'));
  }

  console.log('\n[3] 改名：只在保存时发生（输入框里打字不会即时改文件名），旧文件进回收站，分数不丢');
  {
    await ev(`(()=>{const n=document.getElementById('inLvName');
      n.value='甲关改名'; n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    // 关键：打字只改内存里的名字，不该去动文件名（否则重名时会把别的关挤掉）
    await sleep(1400);
    ok(fs.existsSync(path.join(DIR, '01_甲关.json')), '打字后磁盘上的文件名没变（不再每敲一个字就改名）');
    ok(!fs.existsSync(path.join(DIR, '01_甲关改名.json')), '还没出现新文件名');

    await ev(`document.getElementById('btnLibSave').click()`);          // 「存为当前关」才真正改名
    const done = await waitDisk(() => fs.existsSync(path.join(DIR, '01_甲关改名.json')));
    ok(done, '点「存为当前关」后磁盘上出现新文件名');
    await b.waitFor('diskBusy===0 && lib.some(e=>e.name==="甲关改名")', 15000);
    ok(!fs.existsSync(path.join(DIR, '01_甲关.json')), '旧文件名已移走');
    ok(fs.existsSync(path.join(LV, '_trash', SET, '01_甲关.json')), '旧文件进了 levels/_trash');
    const r = readJSON(path.join(DIR, '01_甲关改名.json'));
    ok(r.level.name === '甲关改名' && r.name === '甲关改名', '记录里的名字同步更新', [r.name, r.level.name]);
    ok(r.meta.score === 92, '改名没有把难度分弄丢', r.meta.score);
  }

  console.log('\n[4] 另存新关：页面点一下，磁盘多一个 json');
  {
    await ev(`document.getElementById('btnLibAdd').click()`);
    const done = await waitDisk(() => fs.readdirSync(DIR).some(f => /^03_/.test(f)));
    ok(done, '磁盘出现 03_ 开头的新关卡文件');
    await b.waitFor('diskBusy===0 && lib.length===3', 15000);
    ok(await ev('lib.length') === 3, '页面列表同步变成 3 关', await ev('lib.length'));
    const f = fs.readdirSync(DIR).filter(x => /^03_/.test(x))[0];
    const r = readJSON(path.join(DIR, f));
    ok(Array.isArray(r.level.pieces) && r.level.pieces.length > 0, '新关卡内容完整', f);
    ok(fs.readdirSync(DIR).filter(y => /^\d.*\.json$/.test(y)).length === 3, '目录里正好 3 关（没有清单文件）');
    ok(fs.readFileSync(path.join(ROOT, 'levelpacks.js'), 'utf8').indexOf(f) >= 0, 'levelpacks.js 自动重建');
  }

  console.log('\n[5] 覆盖保存内置/新建关（写盘模式下不再另存副本）');
  {
    const v0 = await ev('DiskStore.version');
    await ev(`document.getElementById('btnLibSave').click()`);
    const done = await b.waitFor('diskBusy===0 && DiskStore.version>' + v0, 15000);
    ok(done, '覆盖保存请求成功且磁盘版本推进', [v0, await ev('DiskStore.version')]);
    const f = fs.readdirSync(DIR).filter(x => /^03_/.test(x))[0];
    ok(!!f && Array.isArray(readJSON(path.join(DIR, f)).level.pieces), '目标文件内容仍是合法关卡', f);
    ok(await ev('lib.length') === 3, '没有多出一条「另存」副本', await ev('lib.length'));
  }

  console.log('\n[6] 删除：两次确认后文件进 _trash');
  {
    const idx = await ev(`lib.findIndex(e=>e.key===curLib)`);
    const sel = '#lvList .lvbtn[data-i="' + idx + '"] .del';
    // 列表现在多了"排序"那一行，条目可能被挤到可视区外——先滚进来再点
    await ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'center'})`);
    await sleep(150);
    const q = await rectOf(ev, sel);
    const x = q.x + q.width / 2, y = q.y + q.height / 2;
    await b.click(x, y);
    const confirm = await ev(`document.querySelector(${JSON.stringify(sel)}).textContent`);
    ok(/确认/.test(confirm), '第一次点击变成「确认×」', confirm);
    await b.click(x, y);
    const done = await waitDisk(() => fs.readdirSync(path.join(LV, '_trash', SET)).length >= 2);
    ok(done, '回收站里又多了一份');
    await b.waitFor('diskBusy===0 && lib.length===2', 15000);
    ok(await ev('lib.length') === 2, '列表回到 2 关', await ev('lib.length'));
  }

  console.log('\n[7] file:// 打开时零回归');
  {
    const f = await launch(path.join(PROJECT, 'index.html'));
    const s = JSON.parse(await f.evalJs(`JSON.stringify({
      disk: diskMode, lib: lib.length,
      del: document.querySelectorAll('#lvList .del').length,
      hint: (document.getElementById('libHint')||{}).textContent || ''
    })`));
    ok(s.disk === false, '仍是本地存储模式', s.disk);
    ok(s.lib > 40, '关卡数来自真实 levelpacks.js', s.lib);
    ok(/localStorage/.test(s.hint), '提示文案保持原样', s.hint);
    f.close();
  }

  b.close();
  await new Promise(r => srv.close(r));
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (e) { }
  console.log('\n' + (fail ? 'FAILED  ' + fail + ' / ' + (pass + fail) : 'ALL PASS  ' + pass + ' 条'));
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(e);
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (x) { }
  process.exit(1);
});
