/* v21：随机型关卡（level.shuffle）+ 关卡集改版（待分类回到根目录 / 特殊 → 随机型关卡）
 *   node test/v21-shuffle.test.js
 *
 * 覆盖：
 *   1 文件布局：待分类 = levels 根目录；特殊已改名随机型关卡；空盘已删；织布机入册
 *   2 shuffle 属性：载入/复位都重新出题，编辑模式看基准态
 *   3 织布机的改造点：无被动块、1×1 是序号 + 渐变色、目标在自己脚下、步数够混
 *   4 抽样难度：多轮随机关卡 → 去头尾平均，写进 meta 并在界面标明估算
 *   5 编辑模式才出现「存为当前关 / 另存新关 / 清空棋盘」；写盘模式不显示「恢复内置」
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, sleep } = require('./cdp.js');
const { createServer } = require('../tools/serve.js');

const PROJECT = path.join(__dirname, '..');
const LVROOT = path.join(PROJECT, 'levels');
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));

console.log('[1] 文件布局：待分类 = levels 根目录，特殊 → 随机型关卡');
{
  ok(!fs.existsSync(path.join(LVROOT, '待分类')), '没有「待分类」文件夹了');
  ok(!fs.existsSync(path.join(LVROOT, '特殊')), '没有「特殊」文件夹了');
  ok(fs.existsSync(path.join(LVROOT, '随机型关卡')), '有「随机型关卡」文件夹');
  const rootFiles = fs.readdirSync(LVROOT).filter(f => f.endsWith('.json') && f[0] !== '_');
  ok(rootFiles.length >= 6, '根目录平铺着待分类的关（' + rootFiles.length + ' 个）', rootFiles.slice(0, 3));
  const rec = readJSON(path.join(LVROOT, rootFiles[0]));
  ok(rec.set === '待分类', '这些关的记录里 set 仍是「待分类」', rec.set);
  const specFiles = fs.readdirSync(path.join(LVROOT, '随机型关卡'));
  ok(specFiles.indexOf('01_织布机.json') >= 0, '织布机在随机型关卡里', specFiles);
  ok(!specFiles.some(f => f.indexOf('空盘') >= 0), '空盘已经删掉', specFiles);
  const loom = readJSON(path.join(LVROOT, '随机型关卡', '01_织布机.json'));
  ok(loom.set === '随机型关卡' && loom.id === '随机型关卡-01', '记录里的集名/编号同步', [loom.set, loom.id]);
  ok(loom.level.shuffle === true && loom.level.shuffleSteps >= 1000,
    '织布机带随机打乱属性', [loom.level.shuffle, loom.level.shuffleSteps]);
  const p15 = readJSON(path.join(LVROOT, '随机型关卡', '02_4阶数字华容道.json'));
  ok(p15.level.shuffle === true && p15.level.shuffleSteps === 300, '数字华容道也改成随机型',
    [p15.level.shuffle, p15.level.shuffleSteps]);
}

console.log('\n[2] 织布机的改造点');
{
  const loom = readJSON(path.join(LVROOT, '随机型关卡', '01_织布机.json'));
  const ps = loom.level.pieces;
  ok(ps.length === 36, '36 块', ps.length);
  ok(ps.every(p => !p.chainOnly && !p.onceOnly), '没有被动块（全部普通）');
  ok(ps.every(p => p.name && String(p.name).trim()), '每块都有名字');
  const ones = ps.filter(p => p.shape === '1x1');
  ok(ones.length === 24, '24 个 1×1', ones.length);
  const names = ones.map(p => p.name).sort((a, b) => a - b);
  ok(names.join(',') === Array.from({ length: 24 }, (_, i) => String(i + 1)).join(','),
    '1×1 统一改成序号 1..24', names);
  ok(new Set(ones.map(p => p.color)).size === 24, '24 个 1×1 颜色各不相同（渐变色带）',
    new Set(ones.map(p => p.color)).size);
  const goals = loom.level.goals;
  ok(goals.length === 24, '24 条目标', goals.length);
  ok(goals.every(g => {
    const p = ps.find(x => x.id === g.piece);
    return p && g.cells.length === 1 && g.cells[0][0] === p.x && g.cells[0][1] === p.y;
  }), '每个 1×1 的目标就在自己脚下');
}

(async () => {
  const b = await launch(path.join(PROJECT, 'index.html'));
  const ev = b.evalJs;
  await sleep(900);

  console.log('\n[3] 随机打乱：载入与复位都重新出题，编辑模式看基准态');
  {
    await ev(`(function(){const e=lib.find(x=>x.name==='织布机');loadLibEntry(lib.indexOf(e));})()`);
    await sleep(700);
    const s1 = await ev(`JSON.stringify(st)`);
    ok(await ev(`K.isGoal(L,st,raw.goals)`) === false, '载入后已经是打乱的局面（不是已通状态）');
    ok(await ev(`st.filter((s,i)=>s.x!==raw.pieces[i].x||s.y!==raw.pieces[i].y).length`) > 15,
      '大多数块都离开了原位');
    await ev(`reset()`); await sleep(500);
    const s2 = await ev(`JSON.stringify(st)`);
    ok(s1 !== s2, '点复位换了一道新题');
    // 基准态 = 关卡文件里的摆法；编辑模式必须回到基准态，否则一拖就把打乱后的局面存进关卡
    await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(500);
    ok(await ev(`JSON.stringify(st)===JSON.stringify(K.initialState(raw))`), '编辑模式显示基准态');
    ok(await ev(`K.isGoal(L,st,raw.goals)`) === true, '基准态就是还原态（24 个梭都在家）');
    await ev(`document.querySelector('#tabs [data-mode="play"]').click()`); await sleep(500);
    ok(await ev(`K.isGoal(L,st,raw.goals)`) === false, '回到试玩又出了一道新题');
  }

  console.log('\n[4] 抽样难度：去头尾平均 + 界面标明估算');
  {
    const loom = readJSON(path.join(LVROOT, '随机型关卡', '01_织布机.json'));
    const m = loom.meta;
    ok(m && m.score > 0 && m.estimated === true, '织布机有估算分', m && m.score);
    ok(m.sample && Array.isArray(m.sample.scores) && m.sample.scores.length >= 4,
      'meta 里记着每一轮的分数', m.sample && m.sample.scores);
    ok(m.sample.trimmed === true, '标了「去头尾」', m.sample.trimmed);
    const arr = m.sample.scores.slice().sort((x, y) => x - y);
    const mid = arr.slice(1, -1);
    const avg = Math.round(mid.reduce((a, x) => a + x, 0) / mid.length);
    ok(Math.abs(avg - m.score) <= 1, '总分就是去头尾后的平均（' + avg + ' vs ' + m.score + '）', [avg, m.score]);
    ok(loom.solution === null, '随机型关卡不存单一解法（每局都不同）');

    const p15 = readJSON(path.join(LVROOT, '随机型关卡', '02_4阶数字华容道.json'));
    ok(p15.meta && p15.meta.estimated === true && p15.meta.sample.trimmed === true,
      '数字华容道也是抽样去头尾', p15.meta && p15.meta.score);

    await ev(`(function(){const e=lib.find(x=>x.name==='织布机');loadLibEntry(lib.indexOf(e));})()`);
    await sleep(600);
    const depth = await ev(`document.getElementById('dfDepth').textContent`);
    const lvMeta = await ev(`document.getElementById('lvMeta').textContent`);
    console.log('     ' + depth);
    ok(/抽样/.test(depth) && /去头尾/.test(depth), '面板写明是抽样平均、去头尾', depth);
    ok(/估算/.test(lvMeta), '难度行标着（估算）', lvMeta);
  }

  console.log('\n[5] 保存类按钮只在编辑模式出现 + 清空棋盘');
  {
    await ev(`document.querySelector('#tabs [data-mode="play"]').click()`); await sleep(250);
    ok(await ev(`getComputedStyle(document.getElementById('libOps')).display`) === 'none',
      '试玩模式看不到保存按钮');
    await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(300);
    ok(await ev(`getComputedStyle(document.getElementById('libOps')).display`) !== 'none',
      '编辑模式才出现「存为当前关 / 另存新关 / 清空棋盘」');
    ok(await ev(`!!document.getElementById('btnLibBlank')`), '有「清空棋盘」按钮');
    ok(await ev(`!!document.getElementById('btnLibSave') && !!document.getElementById('btnLibAdd')`),
      '「存为当前关 / 另存新关」还在');

    await ev(`document.getElementById('btnLibBlank').click()`); await sleep(400);
    ok(await ev(`raw.pieces.length === 0 && raw.goals.length === 0`), '清空棋盘：块与目标都没了');
    ok(await ev(`raw.name === '新关卡'`), '名字回到「新关卡」（不会覆盖原关）', await ev('raw.name'));
    await ev(`document.getElementById('btnUndo').click()`); await sleep(350);
    ok(await ev(`raw.pieces.length > 0`), 'Ctrl+Z / 撤销能救回来（' + await ev('raw.pieces.length') + ' 块）');
    ok(await ev(`getComputedStyle(document.getElementById('btnLibReset')).display`) !== 'none',
      'file:// 模式下「恢复内置」还在');

    // 两个属性要能在编辑器里改：勾选框 + 步数
    await ev(`(function(){const e=lib.find(x=>x.name==='织布机');loadLibEntry(lib.indexOf(e));})()`);
    await sleep(600);
    ok(await ev(`document.getElementById('cbShuffle').checked === true`), '载入随机关时「随机打乱」是勾上的');
    ok(await ev(`document.getElementById('inShuffleSteps').value`) === String(await ev('raw.shuffleSteps')),
      '步数框显示关卡里的打乱步数');
    await ev(`document.getElementById('cbShuffle').click()`); await sleep(250);
    ok(await ev(`raw.shuffle === false`), '取消勾选 → 关卡不再是随机型');
    ok(await ev(`document.getElementById('inShuffleSteps').disabled === true`), '关掉随机后步数框禁用');
    await ev(`document.getElementById('cbShuffle').click()`); await sleep(200);
    await ev(`(function(){const i=document.getElementById('inShuffleSteps');i.value=800;i.dispatchEvent(new Event('change'));})()`);
    await sleep(200);
    ok(await ev(`raw.shuffle === true && raw.shuffleSteps === 800`), '改步数写回关卡属性',
      await ev('JSON.stringify([raw.shuffle, raw.shuffleSteps])'));
  }

  console.log('\n[6] 写盘模式：不显示「恢复内置」');
  {
    const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sofa-v21-'));
    const LV = path.join(ROOT, 'levels');
    fs.mkdirSync(LV, { recursive: true });
    const src = fs.readdirSync(LVROOT).filter(f => f.endsWith('.json') && f[0] !== '_').sort()[0];
    fs.copyFileSync(path.join(LVROOT, src), path.join(LV, src));
    const srv = createServer({ root: ROOT, static: PROJECT });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const b2 = await launch(url);
    await sleep(1200);
    ok(await b2.evalJs('diskMode === true'), '切到写盘模式');
    ok(await b2.evalJs(`lib.length`) >= 1, '列表来自磁盘', await b2.evalJs('lib.length'));
    await b2.evalJs(`document.querySelector('#tabs [data-mode="edit"]').click()`);
    await sleep(300);
    ok(await b2.evalJs(`getComputedStyle(document.getElementById('libOps')).display`) !== 'none',
      '写盘模式编辑态仍有保存按钮');
    ok(await b2.evalJs(`getComputedStyle(document.getElementById('btnLibReset')).display`) === 'none',
      '写盘模式（磁盘为唯一真相）不显示「恢复内置」');
    ok(b2.errors.length === 0, '写盘模式没有 JS 异常', b2.errors);
    b2.close();
    await new Promise(r => srv.close(r));
  }

  console.log('\n[7] 目标框：文字写在左上角 / 关掉后刷新仍然关着');
  {
    await ev(`(function(){const e=lib.find(x=>x.name==='横刀立马');loadLibEntry(lib.indexOf(e));})()`);
    await sleep(600);
    const t = JSON.parse(await ev(`(function(){
      const tx=[...document.querySelectorAll('#gGoalTop text')][0];
      return JSON.stringify({x:+tx.getAttribute('x'),y:+tx.getAttribute('y'),
        anchor:tx.getAttribute('text-anchor'),txt:tx.textContent,
        goals:raw.goals.length});
    })()`));
    console.log('     目标文字 ' + JSON.stringify(t));
    ok(t.anchor === 'start', '目标文字左对齐（从框的左边起笔）', t.anchor);
    ok(t.x % 1 > 0 && t.x % 1 < 0.3, 'x 落在格子左内侧（格边界 + 一点边距）', t.x);
    ok(t.y % 1 > 0 && t.y % 1 < 0.45, 'y 落在格子顶部附近（左上角）', t.y);

    // 关掉「目标框」→ 刷新 → 既不该画框，勾选框也不该还勾着
    await ev(`document.getElementById('cbGoalBox').click()`); await sleep(200);
    ok(await ev(`showGoalBox === false && document.querySelectorAll('#gGoalTop *').length === 0`),
      '取消勾选后目标框不再画', await ev('showGoalBox'));
    // 同一个浏览器里刷新（localStorage 才留得住；新开一个 profile 是空的）
    await b.send('Page.reload', {});
    await sleep(1500);
    ok(await ev(`showGoalBox === false`), '刷新后仍然是关着的（存进了 localStorage）');
    ok(await ev(`document.getElementById('cbGoalBox').checked === false`),
      '勾选框跟着状态走，不是一直勾着');
    ok(await ev(`document.querySelectorAll('#gGoalTop *').length === 0`), '刷新后目标框确实没画');
    await ev(`document.getElementById('cbGoalBox').click()`); await sleep(250);
    ok(await ev(`showGoalBox === true && document.querySelectorAll('#gGoalTop *').length > 0`),
      '再点一下能打开，框也画回来了');
  }

  console.log('\n[8] 织布机专用求解面板');
  {
    const b4 = await launch(path.join(PROJECT, 'index.html'));
    await sleep(900);
    ok(await b4.evalJs(`getComputedStyle(document.getElementById('loomCard')).display`) === 'none',
      '普通关卡不显示织布机面板');
    await b4.evalJs(`(function(){const e=lib.find(x=>x.name==='织布机');loadLibEntry(lib.indexOf(e));})()`);
    await sleep(700);
    await b4.evalJs(`document.querySelector('#tabs [data-mode="solve"]').click()`);
    await sleep(400);
    ok(await b4.evalJs(`getComputedStyle(document.getElementById('loomCard')).display`) !== 'none',
      '织布机关卡显示专用求解面板');
    ok(await b4.evalJs(`getComputedStyle(document.getElementById('btnSolve')).display`) === 'none',
      '通用「求解」按钮在织布机关掉（BFS 跑不动）');
    ok(await b4.evalJs(`!!document.getElementById('btnLoomFast')`), '有「快速解」按钮');
    // 真跑一次：期望十几秒出一条能回放的解
    await b4.evalJs(`document.getElementById('btnLoomFast').click()`);
    const done = await b4.waitFor(
      `/^\\d+ 手$/.test(document.getElementById('svSteps').textContent) || document.getElementById('svSteps').textContent === '封顶'`,
      180000, 500);
    const hands = await b4.evalJs(`document.getElementById('svSteps').textContent`);
    console.log('     织布机求解：' + hands);
    ok(done, '求解在预算内给出结论', hands);
    if (/^\d+ 手$/.test(hands)) {
      ok(await b4.evalJs(`!solution.optimal`), '如实标注「未证明最短」');
      ok(await b4.evalJs(`document.querySelectorAll('#steps div').length > 20`), '解法步骤列出来了');
      await b4.evalJs(`[...document.querySelectorAll('#steps div')].pop().click()`);
      await sleep(1500);
      ok(await b4.evalJs(`checkWin() === true`), '回放到终局确实达成');
    }
    ok(b4.errors.length === 0, '织布机求解没有 JS 异常', b4.errors);
    b4.close();
  }

  console.log('\n[9] 无 JS 异常');
  ok(b.errors.length === 0, 'file:// 页面没有未捕获异常', b.errors);

  b.close();
  console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed' : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})();
