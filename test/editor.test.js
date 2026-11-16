/* editor.test.js — 本轮新增能力的端到端验证
 *   半圆只绕圆心 / 锁定块不动 / QE·WASD·拖动 / 允许叠放 / 自绘块 / 难度分 / 关卡库
 *   node test/editor.test.js
 */
const path = require('path');
const { launch, sleep } = require('./cdp');
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  const txt = s => ev('document.querySelector("' + s + '").textContent.trim()');
  const PP = async (x, y) => {
    const r = JSON.parse(await ev('JSON.stringify(document.getElementById("board").getBoundingClientRect())'));
    const lw = await ev('L.w'), lh = await ev('L.h');
    const s = Math.min(r.width / lw, r.height / lh);
    return { x: r.left + (r.width - s * lw) / 2 + x * s, y: r.top + (r.height - s * lh) / 2 + y * s };
  };
  const key = async k => {
    await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: ' + JSON.stringify(k) + ', bubbles: true })), void 0');
    await sleep(90);
  };
  const pose = async i => JSON.parse(await ev('JSON.stringify(st[' + i + '])'));
  const pickPal = async k => {
    const idx = await ev('[...document.querySelectorAll("#pal button")].findIndex(b=>b.dataset.k==="' + k + '")');
    if (idx < 0) throw new Error('调色板里没有 ' + k);
    await ev('document.querySelectorAll("#pal button")[' + idx + '].click()');
    await sleep(90);
  };
  const box = async i => JSON.parse(await ev('JSON.stringify(pieceBox(st,' + i + '))'));

  console.log('\n[1] 半圆只能绕圆心转');
  await ev('loadLevel({ name:"t1", w:4, h:5, goals:[], pieces:[{ id:"s", x:1, y:1, shape:"semi" }] })');
  await sleep(250);
  const pivotOf = async i => JSON.parse(await ev(
    '(function(){var p=L.pieces[' + i + '],o=p.oris[st[' + i + '].ori%p.oris.length];' +
    'return JSON.stringify([st[' + i + '].x+o.pivot[0], st[' + i + '].y+o.pivot[1]]);})()'));
  const c0 = await pivotOf(0);
  ok(c0[0] === 2 && c0[1] === 2, '半圆 (1,1) 的圆心在 (2,2)', c0);
  const rm = JSON.parse(await ev('JSON.stringify(K.moves(L,st).filter(m=>m.t==="r"))'));
  ok(rm.length === 2, '两个方向各只有一个落点（只绕圆心）', rm.length);
  for (const m of rm) {
    const c1 = JSON.parse(await ev(
      '(function(){var s2=K.apply(st,' + JSON.stringify(m) + ');var p=L.pieces[0],o=p.oris[s2[0].ori%p.oris.length];' +
      'return JSON.stringify([s2[0].x+o.pivot[0], s2[0].y+o.pivot[1]]);})()'));
    ok(c1[0] === c0[0] && c1[1] === c0[1], (m.d > 0 ? '顺时针' : '逆时针') + '转完圆心不动', c1);
  }
  {   // 四次同向回到原位
    let cur = JSON.parse(await ev('JSON.stringify(st)'));
    const seq = [];
    for (let k = 0; k < 4; k++) {
      const mv = JSON.parse(await ev('(function(){var s=' + JSON.stringify(cur) +
        ';return JSON.stringify(K.moves(L,s).filter(m=>m.t==="r"&&m.d===1)[0]||null);})()'));
      if (!mv) break;
      cur = JSON.parse(await ev('JSON.stringify(K.apply(' + JSON.stringify(cur) + ',' + JSON.stringify(mv) + '))'));
      seq.push([mv.ori, mv.x, mv.y]);
    }
    ok(seq.length === 4 && cur[0].ori === 0 && cur[0].x === 1 && cur[0].y === 1, '顺时针转 4 次回到原位', { seq, cur: cur[0] });
  }
  ok(await ev('[...document.querySelectorAll("#board path")].some(p=>/A1 1/.test(p.getAttribute("d")||""))'),
    '半圆用圆弧路径绘制');
  await ev('loadLevel(LV.yinQingYuanQue())'); await sleep(250);
  ok(await ev('K.moves(L,st).filter(m=>m.t==="cr").length') === 2, '两块半圆同心时仍可整圆同步转');

  console.log('\n[2] 锁定块：不动、推不动、求解时也不动');
  await ev('loadLevel(LV.lockedGate())'); await sleep(250);
  const li = await ev('L.pieces.findIndex(p=>p.lock)');
  ok(li >= 0, '锁门关有锁定块', li);
  ok(await ev('document.querySelectorAll("#board [data-part=lock]").length') > 0, '锁定块有斜线覆盖');
  ok(await ev('document.querySelectorAll("#board [data-part=lock]").length') > 0 &&
    await ev('document.getElementById("board").innerHTML.indexOf("lockHatch")>=0'), '用了斜线图案');
  ok(await ev('K.moves(L,st).filter(m=>m.i===' + li + ').length') === 0, '锁定块没有走法');
  const lb = await box(li), before = await pose(li);
  { const q = await PP(lb.x + lb.w / 2, lb.y + lb.h / 2);
    await b.drag(q, { x: q.x + 70, y: q.y }, 8); }
  const after = await pose(li);
  ok(before.x === after.x && before.y === after.y, '拖它不动', [before, after]);
  ok(/锁定/.test(await txt('#toast')), '给出"已锁定"提示', await txt('#toast'));
  const sol = JSON.parse(await ev('JSON.stringify(K.solve(L, st, raw.goals, { maxNodes: 400000 }))'));
  ok(sol.ok, '锁门关可解', sol.ok ? sol.moves.length : sol.reason);
  {
    let cur = JSON.parse(await ev('JSON.stringify(K.initialState(raw))')), moved = 0;
    for (const mv of sol.moves) {
      cur = JSON.parse(await ev('JSON.stringify(K.apply(' + JSON.stringify(cur) + ',' + JSON.stringify(mv) + '))'));
      if (cur[li].x !== before.x || cur[li].y !== before.y) moved++;
    }
    ok(moved === 0, '整条解法里锁定块一步没动', moved);
  }

  console.log('\n[3] 编辑器：QE 旋转 / WASD 移动 / 允许叠放');
  await ev('loadLevel(LV.blank())'); await sleep(200);
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="edit"]\').click()'); await sleep(180);
  ok(await ev('mode') === 'edit', '切到编辑');
  await pickPal('L3');
  { const a = await PP(1.5, 1.5); await b.click(a.x, a.y); } await sleep(200);
  ok(await ev('raw.pieces.length') === 1, '放下一个 L 形块', await ev('raw.pieces.length'));
  ok(await ev('L.pieces[0].oris.length') === 4, 'L 形块有 4 个朝向', await ev('L.pieces[0].oris.length'));
  ok(await ev('sel') === 0, '放下后自动选中');
  const o0 = (await pose(0)).ori;
  await key('e');
  ok((await pose(0)).ori !== o0, 'E 键转一格朝向', [(await pose(0)).ori, o0]);
  await key('q');
  ok((await pose(0)).ori === o0, 'Q 键转回来');
  const p0 = await pose(0);
  await key('a');
  const pL = await pose(0);
  ok(pL.x === p0.x - 1 && pL.y === p0.y, 'A 键左移一格', [p0, pL]);
  await key('d');
  ok((await pose(0)).x === p0.x, 'D 键右移回来', await pose(0));
  await key('s'); await key('w');
  ok((await pose(0)).y === p0.y, 'S/W 上下对称', await pose(0));

  // 再压一块 2×2 上去：编辑时不讲碰撞（每放一块要点一次调色板）
  await pickPal('2x2');
  ok(await ev('palShape') === '2x2', '调色板选中 2×2', await ev('palShape'));
  ok(await ev('JSON.stringify(L.pieces[0].oris[0].cells)') !== '[[0,0],[1,0]]', '第一块确实是 L 形（3 格）',
    await ev('JSON.stringify(L.pieces[0].oris[0].cells)'));
  { const a = await PP(p0.x + 1, p0.y + 1); await b.click(a.x, a.y); } await sleep(200);
  ok(await ev('raw.pieces.length') === 2, '又放下一块（压在 L 上）', await ev('raw.pieces.length'));
  const ov = JSON.parse(await ev('JSON.stringify(overlapInfo())'));
  ok(ov.total > 0, '允许暂时叠放（只统计、不拒绝）', ov);
  ok((await txt('#stVerdict')).indexOf('重叠') >= 0, '顶栏如实提示重叠', await txt('#stVerdict'));
  // 拖动（先把块摆到左上角，避免被边界夹住导致看起来没动）
  await ev('st[0]={x:0,y:0,ori:0}; syncRaw(); sel=0; render(); updateUI(); void 0');
  { const a = await PP(0.5, 0.5);
    await b.drag(a, { x: a.x + 90, y: a.y }, 10); }
  ok((await pose(0)).x === 1, '直接拖动也能移动（跟手吸附到下一格）', await pose(0));

  console.log('\n[4] 自绘：四分之一圆 + 不相邻的两段');
  await ev('loadLevel(LV.blank())'); await sleep(200);
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="edit"]\').click()'); await sleep(150);
  // 画布 5×5：索引 0=(0,0) 实心圆角, 1=(1,0) 另一侧圆角 → 拼成半圆；7=(2,1) 实心 → 第二段
  await ev('paintCells.fill(-1); paintCells[0]=1; paintCells[1]=2; paintCells[7]=0; renderPaint(); void 0');
  ok(await ev('document.querySelectorAll("#brush button").length') === 5, '5 种组件（实心/1/4 圆/弓形/内切圆/擦除）');
  ok(await ev('document.querySelectorAll("#paint button").length') === 25, '5×5 画布');
  await ev('document.getElementById("btnNewCustom").click()'); await sleep(250);
  ok(await ev('raw.pieces.length') === 1, '创建出一个自绘块', await ev('raw.pieces.length'));
  ok(await ev('raw.pieces[0].shape') === 'custom', 'shape = custom');
  const cells = await ev('JSON.stringify(raw.pieces[0].cells)');
  ok(cells.indexOf('arc') > 0, '带 arc（四分之一圆）数据', cells);
  ok(await ev('K.components(K.pieceCells(L,st,0)).length') === 2, '两段互不相邻',
    await ev('K.components(K.pieceCells(L,st,0)).length'));
  ok(await ev('document.querySelectorAll("#board [data-part=link]").length') > 0, '两段之间有重心连线');
  ok(await ev('[...document.querySelectorAll("#board path")].some(p=>/A1 1/.test(p.getAttribute("d")||""))'),
    '四分之一圆画成弧');
  // 新版规则：夹了实心格就不是纯扇形 → 自绘块不可旋转（只有 1/4、1/2、3/4、整圆才能绕圆心转）
  ok(await ev('L.pieces[0].oris.length') === 1 && await ev('L.pieces[0].rotMode') === false,
    '混了实心格的自绘块不可旋转', [await ev('L.pieces[0].oris.length'), await ev('L.pieces[0].rotMode')]);
  ok((await txt('#paintInfo')).indexOf('不可旋转') >= 0, '画布面板如实提示「不可旋转」', await txt('#paintInfo'));
  // 换成纯半圆（两个对称的 1/4 圆笔刷）后应立刻变成「可绕圆心旋转」
  // 模板按钮已删，这里直接用画布数据画：左格圆角在右下、右格圆角在左下 → 同心半圆
  await ev('paintCells.fill(-1); paintCells[0]=1; paintCells[1]=2; renderPaint(); void 0'); await sleep(120);
  ok((await txt('#paintInfo')).indexOf('可旋转') >= 0, '半圆模板识别为可绕圆心旋转', await txt('#paintInfo'));
  await ev('document.getElementById("btnNewCustom").click()'); await sleep(200);
  ok(await ev('L.pieces[1].sector && L.pieces[1].sector.quads.length') === 2,
    '创建出的半圆块被识别为 2 象限扇形');

  console.log('\n[5] 难度分');
  await ev('loadLevel(LV.classic())'); await sleep(250);
  ok((await ev('raw.name')) === '横刀立马', '已载入横刀立马（后面的比较要在同一关）', await ev('raw.name'));
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="solve"]\').click()'); await sleep(150);
  await ev('document.getElementById("btnDiff").click()');
  // 等界面算完（机器忙时可能十几秒）
  await b.waitFor('/\\d+ · /.test(document.getElementById("dfScore").textContent)', 120000, 300);
  const df = await txt('#dfScore');
  // 引擎侧独立算一遍（不读页面上的 L/st，避免被前一段的编辑状态带偏）
  const mine = JSON.parse(await ev('(function(){var r=resolveShapes(LV.classic());' +
    'var L2=K.parse(r), s2=K.initialState(r);' +
    'var a=K.analyze(L2,s2,r.goals,{maxNodes:1200000});' +
    'var d=K.difficulty(a);return JSON.stringify({score:d?d.score:null,states:a.states,depth:a.depth,paths:a.paths});})()'));
  ok(mine.score != null, '可解局面给出难度分', mine);
  console.log('     界面 ' + df + ' / 引擎 ' + JSON.stringify(mine));
  ok(df.indexOf(String(mine.score)) >= 0, '界面分数 = 引擎现算', [df, mine.score]);
  ok((await txt('#dfStates')).replace(/,/g, '') === String(mine.states), '显示可达状态数', await txt('#dfStates'));
  // 文案现在是「最短 76 步 / 该解 63 手」，别再要求以数字开头
  ok((await txt('#dfDepth')).indexOf(mine.depth + ' 步') >= 0, '显示最短路长度', await txt('#dfDepth'));
  ok((await txt('#dfPaths')).replace(/,/g, '') === String(mine.paths), '显示最短路径条数', await txt('#dfPaths'));

  console.log('\n[6] 关卡库与分数');
  const rows = JSON.parse(await ev('JSON.stringify([...document.querySelectorAll("#lvList .lvbtn")].map(b=>b.textContent))'));
  console.log('     ' + rows.join(' | '));
  ok(rows.length >= 6, '列出全部关卡', rows.length);
  ok(rows.filter(s => /\d+ 分/.test(s)).length >= 4, '设计关都带难度分', rows);
  ok(rows.some(s => s.indexOf('锁门') === 0), '包含锁定关');

  console.log('\n[7] 无异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  await ev('loadLevel(LV.lockedGate())'); await sleep(300);
  await b.shot(path.join(__dirname, '..', 'shots', 'v11-locked.png'));
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="edit"]\').click()'); await sleep(250);
  await b.shot(path.join(__dirname, '..', 'shots', 'v11-custom.png'));

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
