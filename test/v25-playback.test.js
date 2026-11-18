/* v25：解法播放的暂停 / 倍速 / 进度条 / 复位
 *   node test/v25-playback.test.js
 *
 * ① 播到一半点「复位」：状态回到开局，屏幕上的块也必须真的画回开局（以前缓动会把块
 *   继续画在旧位置，看着像"没复位干净"）
 * ② 暂停后不再推进，继续后接着播
 * ③ 倍速改的是播放间隔与缓动时长，并且记进 localStorage
 * ④ 大解法（>1200 手）不建步骤 DOM，改用进度条，拖到任意一手都落在对应的状态上
 */
const path = require('path');
const { launch, sleep } = require('./cdp.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);

  const loadByName = async (name) => {
    await ev(`(function(){const e=lib.find(x=>x.name===${JSON.stringify(name)});
      if(!e) throw new Error('找不到关卡'); loadLibEntry(lib.indexOf(e));})()`);
    await sleep(700);
  };
  // 按关卡 JSON 里声明的 solverJs 找关（不写死名字/编号）：取解法最长的一关。
  // 「播放/进度条」需要一个带大解法的关，它叫什么名字都无所谓。
  const loadBySolverJs = async (solverJs) => {
    await ev(`(function(){
      const cand=lib.filter(x=>x.level && x.level.solverJs===${JSON.stringify(solverJs)} &&
        x.solution && x.solution.moves && x.solution.moves.length);
      if(!cand.length) throw new Error('没有声明该 solverJs 且带解法的关卡');
      cand.sort((a,b)=>b.solution.moves.length-a.solution.moves.length);
      loadLibEntry(lib.indexOf(cand[0]));})()`);
    await sleep(900);
  };
  const pose = () => ev('JSON.stringify(st.map(s=>[s.x,s.y,s.ori]))');
  const html = () => ev("document.getElementById('gPieces').innerHTML");

  console.log('[1] 播到一半点复位：状态和画面都要真的回到开局');
  {
    await loadBySolverJs('tools/solve-hanoi.js');
    // 开局画面留一份基准
    const startPose = await pose();
    const startHtml = await html();
    ok((await ev('!!fileSolution')) === true, '关卡自带参考解法（fileSolution 有值）', await ev('fileSolution && fileSolution.moves.length'));

    // 点「参考解法 N 步」→ 开始播
    ok(await ev(`document.getElementById('btnPlay').dataset.act`) === 'ref', '按钮是「参考解法」态',
      await ev(`document.getElementById('btnPlay').dataset.act`));
    await ev(`document.getElementById('btnPlay').click()`);
    await sleep(1000);
    ok(await ev('!!playTimer') === true, '开始播放（playTimer 在跑）');
    const midPose = await pose();
    ok(midPose !== startPose, '播了几手，局面已经不是开局');
    ok(await ev('hands > 0') === true, '手数在走', await ev('hands'));

    // 关键：缓动进行中直接复位
    await ev(`document.getElementById('btnPlay').click()`);       // act 已变成 reset
    await sleep(120);
    ok(await ev('!playTimer') === true, '复位后播放停了');
    ok(await ev('anim === null') === true, '复位后没有残留缓动（这是"复位不完全"的根因）');
    ok(await pose() === startPose, '状态回到开局');
    ok(await ev('hands') === 0, '手数清零', await ev('hands'));
    await sleep(500);
    ok(await pose() === startPose, '500ms 后还是开局（缓存/定时器没把它又推走）');
    ok(await html() === startHtml, '画面标记与开局逐字节一致（块没有停在半路）');
    ok(await ev(`document.querySelectorAll('#steps div').length`) === 0, '步骤列表收掉了（没有残留上一份解）');
    ok(await ev(`getComputedStyle(document.getElementById('seekCard')).display`) === 'none', '进度条也收掉了');
  }

  console.log('\n[2] 暂停 / 继续');
  {
    await ev(`document.getElementById('btnPlay').click()`);      // 参考解法 → 又开播
    await sleep(700);
    const h1 = await ev('hands'), a1 = await ev('playAt');
    ok(a1 > 0, '播放确实往前走了', { h1, a1, sp: await ev('playSpeed'), iv: await ev('playInterval()') });
    await ev(`document.getElementById('btnPause').click()`);
    ok(await ev('!playTimer && playPaused') === true, '暂停：定时器停了，记着"是用户按的暂停"');
    ok(await ev(`document.getElementById('btnPause').textContent`) === '继续', '按钮文字变「继续」');
    await sleep(600);
    ok(await ev('hands') === h1 && await ev('playAt') === a1, '暂停期间手数/进度都不动',
      { h1, now: await ev('hands'), a1, at: await ev('playAt') });
    const posePaused = await pose();
    await ev(`document.getElementById('btnPause').click()`);
    await sleep(700);
    ok(await ev('!!playTimer') === true, '继续：定时器又起来了');
    ok(await pose() !== posePaused, '继续后接着往前走');
    ok(await ev('playAt') > a1, '从暂停处接着往前走（单步下标变大）',
      { a1, at: await ev('playAt'), h1, hands: await ev('hands') });
  }

  console.log('\n[3] 倍速');
  {
    const base = await ev('playInterval()');
    await ev(`setPlaySpeed(4)`);
    ok(await ev('playSpeed') === 4, '倍速设成 4×');
    ok(await ev('playInterval()') < base, '间隔变短', { base, now: await ev('playInterval()') });
    ok((await ev(`document.getElementById('playSpeedVal').textContent`)).indexOf('4') >= 0,
      '倍速标签显示 4×', await ev(`document.getElementById('playSpeedVal').textContent`));
    ok(await ev(`localStorage.getItem('sofa-klotski.playspeed')`) === '4', '倍速记进了 localStorage');
    ok(await ev(`+document.getElementById('playSpeed').value`) === 4, '滑块位置跟着走');
    // 播放中改速度要立刻生效（不打断播放）
    ok(await ev('!!playTimer') === true, '改倍速不打断播放');
    const h2 = await ev('hands');
    await sleep(500);
    ok(await ev('hands') > h2, '4× 下 500ms 里走了好几手', { h2, now: await ev('hands') });
    await ev('setPlaySpeed(1)');
    ok(await ev(`localStorage.getItem('sofa-klotski.playspeed')`) === '1', '改回 1×（存盘也跟着改）');
    await ev(`document.getElementById('btnPlay').click()`);      // 复位
    await sleep(150);
  }

  console.log('\n[4] 大解法走进度条（几万手不建 DOM）');
  {
    await loadBySolverJs('tools/solve-hanoi.js');
    await ev(`document.getElementById('btnPlay').click()`);      // 参考解法
    await sleep(500);
    ok(await ev('solution.hands.length') > 1200, '这份解法手数 > 1200', await ev('solution.hands.length'));
    ok(await ev(`document.querySelectorAll('#steps div').length`) === 0, '没有建步骤 DOM（否则页面会卡死）');
    ok(await ev(`getComputedStyle(document.getElementById('seekCard')).display`) !== 'none', '进度条卡片出来了');
    ok(await ev(`+document.getElementById('seekBar').max`) === (await ev('solution.hands.length')),
      '进度条上限 = 手数');

    // 拖到第 1000 手：状态要等于解法里那一步的状态
    await ev(`(function(){const bar=document.getElementById('seekBar');bar.value='1000';
      bar.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await sleep(200);
    ok(await ev('hands') === 1000, '跳到第 1000 手', await ev('hands'));
    const si = await ev(`(function(){let n=0;for(let i=0;i<1000;i++)n+=solution.hands[i].n||1;return n;})()`);
    // 大解法（>4000 单步）页面不预存状态序列，按需回放：比对"从头回放到 si"的结果
    const same = await ev(`(function(){
      let s = K.initialState(raw);
      for (let i = 0; i < ${si}; i++) s = K.apply(s, solution.moves[i]);
      return JSON.stringify(s)===JSON.stringify(st);
    })()`);
    ok(same === true, '局面等于解法里第 1000 手对应的状态', { si });
    ok(/1000/.test(await ev(`document.getElementById('seekText').textContent`)), '进度文案跟着变',
      await ev(`document.getElementById('seekText').textContent`));

    // 拖回 0 = 开局
    await ev(`document.getElementById('seekBar').value='0';
      document.getElementById('seekBar').dispatchEvent(new Event('input',{bubbles:true}))`);
    await sleep(150);
    ok(await ev('hands') === 0, '拖回 0 手');
    ok(await ev('JSON.stringify(st)===JSON.stringify(K.initialState(raw))') === true, '回到开局状态');
  }

  console.log('\n[5] 没有 JS 异常');
  ok(b.errors.length === 0, '页面没有未捕获异常', b.errors);

  await b.close();
  console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed' : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
