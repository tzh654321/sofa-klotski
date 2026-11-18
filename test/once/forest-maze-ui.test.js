/* 一次性体检（页面层）：「密林穿行」在真实页面里画出来对不对
 *   node test/once/forest-maze-ui.test.js
 *
 * 期望值全部从关卡文件里读，不写死数量：改内容不用改测试，只有"画错了"才会红。
 */
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('../cdp.js');
const FILE = path.join(__dirname, '..', '..', 'levels', '迷宫', '01_密林穿行.json');

(async () => {
  const rec = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const lv = rec.level;
  const fileNames = [...new Set(lv.pieces.map(p => p.name))].sort();
  const fileColors = [...new Set(lv.pieces.map(p => p.color))].sort();

  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  let pass = 0, fail = 0;
  const ok = (c, m, x) => {
    c ? (pass++, console.log('  ok  ' + m))
      : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
  };

  console.log('\n[1] 载入「迷宫 / 密林穿行」');
  await ev(`curSet='迷宫'; buildLevelList(); loadLibEntry(lib.findIndex(e=>e.name==='密林穿行')); void 0`);
  await sleep(600);
  const s = JSON.parse(await ev(`JSON.stringify({
    name: raw.name, w: L.w, h: L.h, pieces: raw.pieces.length,
    names: [...new Set(raw.pieces.map(p=>p.name))].sort(),
    colors: [...new Set(raw.pieces.map(p=>p.color))].sort(),
    fills: document.querySelectorAll('#gPieces [data-part="fill"]').length,
    goalMarks: document.querySelectorAll('#gGoalTop *').length,
    goalText: document.getElementById('goalText').textContent,
    score: document.getElementById('dfScore').textContent,
    depth: document.getElementById('dfDepth').textContent,
    states: document.getElementById('dfStates').textContent
  })`));
  ok(s.name === '密林穿行' && s.w === 19 && s.h === 19, '载入的是 19×19 密林穿行', [s.name, s.w, s.h]);
  ok(s.pieces === lv.pieces.length && s.fills >= lv.pieces.length,
    '文件里的 ' + lv.pieces.length + ' 块都画出来了', [s.pieces, s.fills]);
  ok(JSON.stringify(s.names) === JSON.stringify(fileNames), '页面上的名字与文件一致（没有占位名）', s.names);
  ok(JSON.stringify(s.colors) === JSON.stringify(fileColors), '页面上的颜色与文件一致', s.colors);

  console.log('\n[2] 目标与难度信息');
  ok(s.goalMarks > 0, '终点框画在棋盘上', s.goalMarks);
  ok(/密林出口/.test(s.goalText), '目标文案用人话标签', s.goalText);
  const m = rec.meta || {};
  ok(s.score.indexOf(String(m.score)) >= 0, '难度分面板显示 ' + m.score, s.score);
  ok(s.depth.indexOf(String(m.depth)) >= 0, '面板显示最短 ' + m.depth + ' 步', s.depth);
  ok(s.states.indexOf(String(m.states)) >= 0, '面板显示 ' + m.states + ' 个可达状态', s.states);

  console.log('\n[3] 截图');
  const shot = path.join(__dirname, '..', '..', 'shots', 'forest-maze.png');
  await b.shot(shot);
  ok(fs.statSync(shot).size > 10000, '截图已落盘');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed'
    : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
