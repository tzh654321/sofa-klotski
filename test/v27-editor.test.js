/* v27：形状库折叠与数字快捷键、自绘画布（不限尺寸/转角度/缩放平移/编辑形状）、改尺寸后点选不偏移
 *  ① 形状库默认只露前两行，角标 1~9、0 就是快捷键；1×1↔2×2、大L↔月亮已互换
 *  ② 展开不再限 24 格；同一格再点一下 = 转 90°；滚轮缩放 / 中键拖动平移
 *  ③ 选中自绘块时「展开」变「编辑形状」，改完「保存形状」覆盖原块
 *  ④ 改完宽高再点块，选中对象不能偏
 *   node test/v27-editor.test.js
 */
const path = require('path');
const { launch, sleep } = require('D:/code/hrd/sofa-klotski/test/cdp.js');
const ROOT = 'D:/code/hrd/sofa-klotski';

(async () => {
  const b = await launch(path.join(ROOT, 'index.html'));
  const ev = b.evalJs, send = b.send;
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };
  await sleep(800);

  const P = async (cx, cy) => JSON.parse(await ev('(function(){' +
    ' const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;' +
    ' const s=Math.min(r.width/vb.width, r.height/vb.height);' +
    ' return JSON.stringify({x: r.left+(r.width-s*vb.width)/2+((' + cx + ')-vb.x)*s,' +
    ' y: r.top+(r.height-s*vb.height)/2+((' + cy + ')-vb.y)*s}); })()'));
  const click = async (cx, cy) => {
    const p = await P(cx, cy);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(160);
  };

  await ev(`(function(){ loadLevel({name:'画布',w:30,h:30,pieces:[
      {id:'a',x:2,y:2,shape:'1x1',color:'#db5243',name:'甲'}],goals:[]});
    document.querySelector('#tabs [data-mode="edit"]').click(); })()`);
  await sleep(450);

  console.log('[1] 形状库折叠 + 顺序 + 快捷键角标');
  const pal = JSON.parse(await ev(`JSON.stringify({
    collapsed: document.getElementById('pal').classList.contains('collapsed'),
    keys: [...document.querySelectorAll('#pal button')].map(b=>b.dataset.k),
    visible: [...document.querySelectorAll('#pal button')].filter(b=>b.offsetParent!==null).map(b=>b.dataset.k),
    badges: [...document.querySelectorAll('#pal button .kb')].map(x=>x.textContent)
  })`));
  ok(pal.collapsed, '默认折叠');
  ok(pal.visible.length === 10, '收起时只露前两行 10 个', pal.visible);
  ok(pal.keys[0] === '1x1' && pal.keys[3] === '2x2', '1×1 与 2×2 已互换', [pal.keys[0], pal.keys[3]]);
  ok(pal.keys[8] === 'L3' && pal.keys[9] === 'threeQuarter' && pal.keys.indexOf('L4') > 9,
    '大 L 与月亮已互换', [pal.keys[8], pal.keys[9], pal.keys.indexOf('L4')]);
  ok(pal.badges.join('') === '1234567890', '前两行左上角标 1~9、0', pal.badges);
  await ev(`document.getElementById('btnPalMore').click(), void 0`);
  await sleep(120);
  ok(await ev(`document.querySelectorAll('#pal button').length`) > 10 &&
     await ev(`[...document.querySelectorAll('#pal button')].filter(b=>b.offsetParent!==null).length`) > 10, '「更多形状」能展开');
  await ev(`document.getElementById('btnPalMore').click(), void 0`);
  await sleep(120);
  ok(await ev(`palShape`) !== 'L4', '收起不会误选');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'4',bubbles:true})), void 0`);
  await sleep(120);
  ok(await ev(`palShape`) === '2x2', '按 4 = 2×2', await ev(`palShape`));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'0',bubbles:true})), void 0`);
  await sleep(120);
  ok(await ev(`palShape`) === 'threeQuarter', '按 0 = 月亮(3/4 圆)', await ev(`palShape`));
  await ev(`palShape=null; paintPalOn(); void 0`);

  console.log('\n[2] 画布：不再限 24 格 + 同一格再点转 90°');
  await ev(`(function(){ paintCells.fill(-1); brushSlot='quarter'; brush=brushValue('quarter');
    togglePaintBig(); })()`);
  await sleep(350);
  const p2 = JSON.parse(await ev(`JSON.stringify({w:paintW,h:paintH,big:paintBig,label:document.getElementById('btnPaintBig').textContent})`));
  ok(p2.big && p2.w === 30 && p2.h === 30, '展开到棋盘原尺寸 30×30（原来上限 24）', p2);
  const cellIdx = 5 * 30 + 5;
  await ev(`(function(){ paintCells[${cellIdx}] = -1; turnPaintCell(${cellIdx}); })()`);
  const rot = JSON.parse(await ev(`JSON.stringify((()=>{ paintCells[${cellIdx}]=1; const a=turnPaintCell(${cellIdx}); return {ok:a, v:paintCells[${cellIdx}]}; })())`));
  ok(rot.ok && rot.v === 2, '同格再点 = 1/4 圆转 90°', rot);
  const seg = JSON.parse(await ev(`JSON.stringify((()=>{ paintCells[${cellIdx}]=5; const a=turnPaintCell(${cellIdx}); return {ok:a, v:paintCells[${cellIdx}]}; })())`));
  ok(seg.ok && seg.v === 6, '同格再点 = 弓形转 90°', seg);
  // 连点四次要能走完四个方向（之前 4→3 之后就不再等于笔刷，只在两个方向来回跳）
  await ev(`(function(){ paintCells[${cellIdx}] = -1; brushSlot='quarter'; brush=brushValue('quarter'); renderPaint(); })()`);
  const cyc = [];
  for (let k = 0; k < 5; k++) {
    await ev(`(function(){ const el=document.getElementById('paint').children[${cellIdx}];
      el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1})); })()`);
    await sleep(60);
    cyc.push(await ev(`paintCells[${cellIdx}]`));
  }
  ok(new Set(cyc.slice(0, 4)).size === 4 && cyc[4] === cyc[0], '同一格连点能转到 4 个方向（第 5 下回到起点）', cyc);

  console.log('\n[3] 画布展开时滚轮缩放 / 中键平移');
  const mid = JSON.parse(await ev(`(()=>{const r=svg.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));
  const z0 = await ev(`view.z`);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: -120 });
  await sleep(200);
  ok((await ev(`view.z`)) > z0, '滚轮放大（画布盖着棋盘也能缩）', [z0, await ev(`view.z`)]);
  const vy0 = await ev(`view.y`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mid.x, y: mid.y, button: 'middle', buttons: 4, clickCount: 1 });
  for (let k = 1; k <= 5; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mid.x, y: mid.y - k * 14, button: 'middle', buttons: 4 }); await sleep(20); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mid.x, y: mid.y - 70, button: 'middle', buttons: 0, clickCount: 1 });
  await sleep(200);
  ok((await ev(`view.y`)) > vy0, '中键拖动平移了视野', [vy0, await ev(`view.y`)]);
  await ev(`(function(){ if (paintBig) togglePaintBig(); })()`);
  await sleep(200);

  console.log('\n[4] 选中自绘块 → 展开变「编辑形状」，改完能保存');
  await ev(`(function(){ paintCells.fill(-1); paintCells[0]=0; paintCells[1]=0;
    brush=0; addCustomPiece(); })()`);
  await sleep(300);
  const p4 = JSON.parse(await ev(`JSON.stringify({sel, custom: raw.pieces[sel] && raw.pieces[sel].shape,
    label: document.getElementById('btnPaintBig').textContent, id: raw.pieces[sel] && raw.pieces[sel].id})`));
  ok(p4.custom === 'custom', '刚建的块是自绘块', p4);
  ok(/编辑/.test(p4.label), '选中自绘块后按钮变成「编辑形状」', p4.label);
  await ev(`document.getElementById('btnPaintBig').click(), void 0`);
  await sleep(350);
  const loaded = JSON.parse(await ev(`JSON.stringify({big:paintBig, cells:paintCells.filter(v=>v>=0).length,
    save:document.getElementById('btnNewCustom').textContent, edit:paintEdit})`));
  ok(loaded.big && loaded.cells === 2 && /保存/.test(loaded.save), '画布按那块现有形状铺开，按钮变「保存形状」', loaded);
  // 加画一格再保存
  const n0 = await ev(`raw.pieces.length`);
  await ev(`(function(){ paintCells[2]=0; renderPaint(); document.getElementById('btnNewCustom').click(); })()`);
  await sleep(350);
  const saved = JSON.parse(await ev(`JSON.stringify({n:raw.pieces.length, cells:(raw.pieces.find(p=>p.id===${JSON.stringify(p4.id)}).cells||[]).length})`));
  ok(saved.n === n0 && saved.cells === 3, '保存是覆盖那一块（不新增块），形状变成 3 格', [n0, saved]);
  await ev(`(function(){ if (paintBig) togglePaintBig(); })()`);
  await sleep(200);

  console.log('\n[5] 改尺寸后点选不偏移');
  await ev(`(function(){ loadLevel({name:'尺寸',w:6,h:6,pieces:[
      {id:'a',x:1,y:1,shape:'1x1',color:'#db5243',name:'甲'},
      {id:'b',x:5,y:4,shape:'1x1',color:'#43db44',name:'乙'}],goals:[]});
    document.querySelector('#tabs [data-mode="edit"]').click(); })()`);
  await sleep(400);
  await ev(`(function(){ document.getElementById('inW').value=14; document.getElementById('inH').value=12;
    document.getElementById('btnResize').click(); })()`);
  await sleep(450);
  await click(5.5, 4.5);
  const picked = JSON.parse(await ev(`JSON.stringify({sel, name: raw.pieces[sel] && raw.pieces[sel].name})`));
  ok(picked.name === '乙', '改尺寸后点 (5,4) 选中的还是「乙」', picked);
  await click(1.5, 1.5);
  const picked2 = JSON.parse(await ev(`JSON.stringify({sel, name: raw.pieces[sel] && raw.pieces[sel].name})`));
  ok(picked2.name === '甲', '点 (1,1) 选中的还是「甲」', picked2);

  console.log('\n[6] Q/E 旋转任意数量、任意形状');
  {
    const sig = async () => JSON.parse(await ev(`JSON.stringify(raw.pieces.map(p=>({
      id:p.id, x:p.x, y:p.y, cells:(p.cells||[]).map(q=>[q.c,q.r]) })))`));
    await ev(`(function(){ loadLevel({name:'转',w:10,h:10,pieces:[
        {id:'a',x:1,y:1,shape:'custom',color:'#f00',name:'单朝向',
         cells:[{c:0,r:0},{c:0,r:1},{c:1,r:1}]},
        {id:'b',x:5,y:1,shape:'2x1',color:'#0f0',name:'横条'}],goals:[]});
      document.querySelector('#tabs [data-mode="edit"]').click(); })()`);
    await sleep(420);
    const before = await sig();
    await ev(`sel = 0; selSet = new Set([0]); updateUI(); void 0`);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'q',bubbles:true})), void 0`);
    await sleep(240);
    const q1 = await sig();
    ok(JSON.stringify(q1[0].cells) === JSON.stringify([[0, 1], [1, 1], [1, 0]]),
      '单朝向的自绘块按 Q 逆时针转了 90°', q1[0].cells);
    for (let k = 0; k < 3; k++) { await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'q',bubbles:true})), void 0`); await sleep(150); }
    ok(JSON.stringify((await sig())[0].cells) === JSON.stringify(before[0].cells), '转 4 次回到最初');
    // 多选：L 形 + 横条一起转
    await ev(`selSet = new Set([0,1]); sel = 1; updateUI(); void 0`);
    const b4 = await sig();
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'e',bubbles:true})), void 0`);
    await sleep(300);
    const a4 = await sig();
    ok(JSON.stringify(a4[0].cells) !== JSON.stringify(b4[0].cells) &&
       JSON.stringify(a4[1].cells) !== JSON.stringify(b4[1].cells),
      '多选时两块都转了（自绘 + 库形状）', [a4[0].cells, b4[0].cells]);
  }

  b.close();
  console.log('\n' + (fail ? 'FAILED  ' + fail + ' failed, ' + pass + ' passed' : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
