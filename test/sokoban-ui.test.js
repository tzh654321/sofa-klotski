/* 推箱子关卡集 UI 回归：关卡集栏、载入、渲染与截图
 *   node test/sokoban-ui.test.js
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

  console.log('[1] 关卡集栏出现「推箱子」');
  const has = await ev(`SET_ORDER.indexOf('推箱子')>=0 && [...document.querySelectorAll('#setBar button')].some(x=>x.textContent.indexOf('推箱子')>=0)`);
  ok(has === true, 'SET_ORDER 和关卡集栏都有推箱子');
  const n = await ev(`lib.filter(e=>e.set==='推箱子').length`);
  ok(n === 9, '关卡库里有 9 关推箱子', n);

  console.log('\n[2] 载入 仓库番 1');
  await ev(`curSet='推箱子'; buildLevelList(); loadLibEntry(lib.findIndex(e=>e.set==='推箱子')); void 0`);
  await sleep(350);
  const s1 = JSON.parse(await ev(`JSON.stringify({
    name: raw.name, w: L.w, h: L.h,
    locks: raw.pieces.filter(p=>p.lock).length,
    boxes: raw.pieces.filter(p=>p.onceOnly).length,
    oldBoxes: raw.pieces.filter(p=>p.chainOnly).length,
    player: raw.pieces.filter(p=>!p.lock&&!p.chainOnly&&!p.onceOnly).length,
    spots: raw.goals[0].spots.length,
    need: raw.goals[0].need,
    keys: Object.keys(raw.goals[0]).sort().join(','),
    normNeed: K.goalNorm(L, raw.goals[0]).need,
    bricks: document.querySelectorAll('#gPieces [data-part="fill"]').length,
    onceMarks: document.querySelectorAll('#gPieces [data-part="once"]').length,
    onceEdges: document.querySelectorAll('#gPieces [data-part="onceEdge"]').length,
    maxBoxesPerPush: (function(){
      const bi=new Set(L.pieces.map((p,i)=>p.onceOnly?i:-1).filter(i=>i>=0));
      return Math.max(0,...K.moves(L,st).filter(m=>m.t==='p')
        .map(m=>(m.chain||[]).filter(i=>bi.has(i)).length));})()
  })`));
  ok(s1.name === '仓库番 1', '载入的是仓库番 1', s1.name);
  ok(s1.need === 'all' && s1.keys === 'need,pieces,spots' && s1.normNeed === 4,
    '页面读到 {pieces,spots,need:"all"} 并解析成「4 块全部就位、位置可换」', s1);
  ok(s1.locks > 0 && s1.boxes === 4 && s1.oldBoxes === 0 && s1.player === 1,
    '墙 / 一次被动箱 / 玩家数量正确，且没有残留旧被动箱', s1);
  ok(s1.spots === 4, '4 个亮点目标', s1.spots);
  ok(s1.bricks >= s1.locks + s1.boxes + s1.player, '所有块都画出来了', s1.bricks);
  ok(s1.onceMarks === 4 && s1.onceEdges === 4, '4 个箱子都带新显示效果（X 撑 + 暖金边框）', s1);
  ok(s1.maxBoxesPerPush <= 1, '页面里没有任何一步能连推两个箱子', s1.maxBoxesPerPush);
  await b.shot(path.join(__dirname, '..', 'shots', 'sokoban-1.png'));

  console.log('\n[3] 载入 仓库番 7（5 箱 5 亮点）');
  await ev(`loadLibEntry(lib.findIndex(e=>e.name==='仓库番 7')); void 0`);
  await sleep(350);
  const s7 = JSON.parse(await ev(`JSON.stringify({
    name: raw.name, w: L.w, h: L.h,
    boxes: raw.pieces.filter(p=>p.onceOnly).length, spots: raw.goals[0].spots.length,
    goalMarks: document.querySelectorAll('#gGoalTop *').length,
    onceMarks: document.querySelectorAll('#gPieces [data-part="once"]').length
  })`));
  ok(s7.name === '仓库番 7' && s7.boxes === 5 && s7.spots === 5, '5 箱对 5 亮点', s7);
  ok(s7.onceMarks === 5, 'ROOM 7 的 5 个箱子都是一次被动显示', s7.onceMarks);
  ok(s7.goalMarks > 0, '亮点在棋盘上画出来了', s7.goalMarks);
  await b.shot(path.join(__dirname, '..', 'shots', 'sokoban-7.png'));

  console.log('\n[4] 仓库番 6：11×9 真实版面，命名/颜色统一');
  await ev(`loadLibEntry(lib.findIndex(e=>e.name==='仓库番 6')); void 0`);
  await sleep(350);
  const s6 = JSON.parse(await ev(`JSON.stringify({
    name: raw.name, w: L.w, h: L.h,
    boxes: raw.pieces.filter(p=>p.onceOnly).length, spots: raw.goals[0].spots.length,
    names: [...new Set(raw.pieces.map(p=>p.name))].sort(),
    colors: [...new Set(raw.pieces.map(p=>p.color))].sort(),
    onceMarks: document.querySelectorAll('#gPieces [data-part="once"]').length
  })`));
  ok(s6.w === 11 && s6.h === 9, '载入的是 11×9 真实版面', s6);
  ok(s6.boxes === 5 && s6.spots === 5, '5 箱对 5 亮点', s6);
  ok(s6.names.length === 3 && ['木箱', '砖墙', '推箱人'].every(n => s6.names.includes(n)),
    '名称只留三种：木箱 / 砖墙 / 推箱人', s6.names);
  ok(JSON.stringify(s6.colors) === JSON.stringify(['#3f7fd6', '#9c3a2e', '#d9a441']),
    '颜色只留三种：箱 / 墙 / 人', s6.colors);
  ok(s6.onceMarks === 5, '5 个箱子都是一次被动显示', s6.onceMarks);
  await b.shot(path.join(__dirname, '..', 'shots', 'sokoban-6.png'));

  console.log('\n[5] 仓库番 3：补回「已在终点」的木箱，墙块合并');
  await ev(`loadLibEntry(lib.findIndex(e=>e.name==='仓库番 3')); void 0`);
  await sleep(350);
  const s3 = JSON.parse(await ev(`JSON.stringify({
    name: raw.name, w: L.w, h: L.h,
    boxes: raw.pieces.filter(p=>p.onceOnly).length, spots: raw.goals[0].spots.length,
    walls: raw.pieces.filter(p=>p.lock).length,
    at25: raw.pieces.some(p=>p.onceOnly && p.x===2 && p.y===5),
    onGoal: (function(){const cs=new Set(raw.goals[0].spots.map(s=>s[0][0]+','+s[0][1]));
      return raw.pieces.filter(p=>p.onceOnly&&cs.has(p.x+','+p.y)).length;})(),
    onceMarks: document.querySelectorAll('#gPieces [data-part="once"]').length,
    goalMarks: document.querySelectorAll('#gGoalTop *').length
  })`));
  ok(s3.boxes === 5 && s3.spots === 5, 'ROOM 3 是 5 箱 5 亮点', s3);
  ok(s3.at25 === true && s3.onGoal === 1, '(2,5) 那只木箱开局已站在亮点上', s3);
  ok(s3.walls === 3, '相邻墙合并后只剩 3 块', s3.walls);
  ok(s3.onceMarks === 5, '5 只箱子都画出一次被动效果', s3.onceMarks);
  ok(s3.goalMarks > 0, '5 个亮点都画出来了', s3.goalMarks);
  await b.shot(path.join(__dirname, '..', 'shots', 'sokoban-3.png'));

  console.log('\n[6] 仓库番 241：STAGE 25 ROOM 241 裁掉装饰边框后的 8×4 版面（6 箱 6 亮点）');
  await ev(`loadLibEntry(lib.findIndex(e=>e.name==='仓库番 241')); void 0`);
  await sleep(350);
  const s8 = JSON.parse(await ev(`JSON.stringify({
    name: raw.name, origin: lib[lib.findIndex(e=>e.name==='仓库番 241')].origin,
    w: L.w, h: L.h,
    boxes: raw.pieces.filter(p=>p.onceOnly).length, spots: raw.goals[0].spots.length,
    walls: raw.pieces.filter(p=>p.lock).length,
    spotsAt: raw.goals[0].spots.map(s=>s[0][0]+','+s[0][1]).sort().join(' '),
    onceMarks: document.querySelectorAll('#gPieces [data-part="once"]').length,
    goalMarks: document.querySelectorAll('#gGoalTop *').length
  })`));
  ok(s8.name === '仓库番 241' && s8.origin === 'STAGE 25 ROOM 241', '载入的是 ROOM 8 且来自 STAGE 25 ROOM 241', s8);
  ok(s8.w === 8 && s8.h === 4, '8×4 版面（宽高各比截图少 2）', s8);
  ok(s8.boxes === 6 && s8.spots === 6, '6 箱对 6 亮点', s8);
  ok(s8.spotsAt === '3,1 3,2 3,3 4,1 4,2 4,3', '亮点是腹地 2×3 的六格', s8.spotsAt);
  ok(s8.walls === 2, '残留的边界墙合并成 2 块（顶右半条 + 左边两格）', s8.walls);
  ok(s8.onceMarks === 6, '6 个箱子都画出一次被动效果', s8.onceMarks);
  ok(s8.goalMarks > 0, '6 个亮点都画出来了', s8.goalMarks);
  await b.shot(path.join(__dirname, '..', 'shots', 'sokoban-8.png'));

  console.log('\n[7] 狼烟四起2-1：社区文本关，11 箱 11 点全归位（岩石色系，与移植关一眼分开）');
  await ev(`loadLibEntry(lib.findIndex(e=>e.name==='狼烟四起2-1')); void 0`);
  await sleep(350);
  const s9 = JSON.parse(await ev(`JSON.stringify({
    name: raw.name, w: L.w, h: L.h,
    boxes: raw.pieces.filter(p=>p.onceOnly).length,
    spots: raw.goals[0].spots.length, goalPieces: raw.goals[0].pieces,
    names: [...new Set(raw.pieces.map(p=>p.name))].sort(),
    colors: [...new Set(raw.pieces.map(p=>p.color))].sort(),
    onceMarks: document.querySelectorAll('#gPieces [data-part="once"]').length,
    goalMarks: document.querySelectorAll('#gGoalTop *').length,
    score: document.getElementById('dfScore').textContent,
    depth: document.getElementById('dfDepth').textContent
  })`));
  ok(s9.name === '狼烟四起2-1' && s9.w === 9 && s9.h === 9, '载入的是 9×9 社区关（外墙已裁掉）', s9);
  ok(s9.boxes === 11 && s9.spots === 11 && s9.goalPieces.length === 11 && s9.goalPieces.indexOf('player') < 0,
    '11 只木箱对 11 个亮点，goal.pieces 就是全部木箱', s9);
  ok(s9.names.length === 3 && ['乱石', '岩壁', '石匠'].every(n => s9.names.includes(n)),
    '命名换成岩石色系（岩壁／乱石／石匠），与移植关一眼分开', s9.names);
  ok(JSON.stringify(s9.colors) === JSON.stringify(['#3f4756', '#a08b6a', '#ffb03a']),
    '配色换成岩石色系', s9.colors);
  ok(s9.onceMarks === 11, '11 颗乱石都画出一次被动效果', s9.onceMarks);
  ok(s9.goalMarks > 0, '11 个亮点都画出来了', s9.goalMarks);
  ok(/203/.test(s9.depth) && /未证明最短/.test(s9.depth), '面板标的是参考解 203 步、未证明最短', s9.depth);
  await b.shot(path.join(__dirname, '..', 'shots', 'sokoban-9.png'));

  b.close();
  console.log('\n' + (fail ? 'FAILED  ' + fail + ' / ' + (pass + fail) : 'ALL PASS  ' + pass + ' 条'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
