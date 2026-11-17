/* v24：框选之后的整组编辑
 *   node test/v24-box-keys.test.js
 *
 * ① WASD / 方向键整组移动（贴边自动停，不出界）  ② Q/E 整组旋转（不可转的跳过）
 * ③ 拖住框里任意一块 = 整组一起挪，拖回原处能复原  ④ Ctrl+A / Ctrl+C / Ctrl+V
 * ⑤ L/P/O/N 整组改档位（再按一次回普通）        ⑥ Esc 取消框选、单块仍是老行为
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
  const ev = b.evalJs, send = b.send;
  await sleep(900);

  /* 格子坐标 → 屏幕坐标（折算缩放/平移，和页面里的 cellAt 一致） */
  const P = async (cx, cy) => JSON.parse(await ev('(function(){' +
    ' const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;' +
    ' const s=Math.min(r.width/vb.width, r.height/vb.height);' +
    ' return JSON.stringify({x: r.left+(r.width-s*vb.width)/2+((' + cx + ')-vb.x)*s,' +
    ' y: r.top+(r.height-s*vb.height)/2+((' + cy + ')-vb.y)*s}); })()'));
  const mouse = (t, x, y) => send('Input.dispatchMouseEvent',
    { type: t, x, y, button: 'left', buttons: t === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const KEY = (k, mod) => ev('document.dispatchEvent(new KeyboardEvent("keydown",{key:' +
    JSON.stringify(k) + ',ctrlKey:' + (!!mod) + ',bubbles:true})), void 0');

  /* 从格 (ax,ay) 拖到 (bx,by)：用于框选或拖块 */
  const dragCells = async (ax, ay, bx, by, steps) => {
    const a = await P(ax, ay);
    await mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= (steps || 10); i++) {
      const q = await P(ax + (bx - ax) * i / (steps || 10), ay + (by - ay) * i / (steps || 10));
      await mouse('mouseMoved', q.x, q.y);
      await sleep(16);
    }
    const z = await P(bx, by);
    await mouse('mouseReleased', z.x, z.y);
    await sleep(220);
  };

  const pos = async () => JSON.parse(await ev('JSON.stringify(st.map(s=>[s.x,s.y]))'));
  const bboxOf = list => {
    const xs = list.map(p => p[0]), ys = list.map(p => p[1]);
    return [Math.min.apply(null, xs), Math.min.apply(null, ys),
      Math.max.apply(null, xs), Math.max.apply(null, ys)];
  };

  /* 三块：左 2x1、中 1x1、右 1x1（中间留空，方便框选时起手落在空格） */
  const setup = async () => {
    await ev(`(function(){
      loadLevel({name:'框选快捷键',w:10,h:10,pieces:[
        {id:'a',x:1,y:1,shape:'semi',color:'#db5243',name:'甲'},
        {id:'b',x:4,y:1,shape:'1x1',color:'#43db44',name:'乙'},
        {id:'c',x:7,y:1,shape:'1x1',color:'#4397db',name:'丙'}],goals:[]});
      document.querySelector('#tabs [data-mode="edit"]').click();
    })()`);
    await sleep(320);
  };
  const boxSelect = async () => { await dragCells(0.3, 0.3, 8.6, 2.6, 8); };

  console.log('\n[0] 框住三块');
  await setup();
  await boxSelect();
  ok(await ev('selSet.size') === 3, '框住 3 块', await ev('selSet.size'));
  ok(await ev('boxBatch()') === true, '进入整组模式', await ev('boxBatch()'));
  ok(/整组/.test(await ev(`document.getElementById('selBoxInfo').textContent`) + await ev(`document.querySelector('#selBoxCard .hint:last-child').textContent`)),
    '面板上写了「整组」的用法');

  console.log('\n[1] WASD / 方向键整组移动');
  {
    const before = await pos();
    await KEY('d'); await sleep(120);
    const after = await pos();
    ok(after.every((p, i) => p[0] === before[i][0] + 1 && p[1] === before[i][1]),
      '按 D：三块一起右移 1 格', { before, after });
    await KEY('ArrowUp'); await sleep(120);
    const up = await pos();
    ok(up.every((p, i) => p[0] === after[i][0] && p[1] === after[i][1] - 1),
      '方向键同样整组移动', up);
    // 一直往右按到贴边：右边界是 x=9，之后必须停住
    for (let i = 0; i < 6; i++) { await KEY('ArrowRight'); await sleep(80); }
    const edge = await pos();
    ok(edge.every(p => p[0] <= 9), '贴边后停在 x=9（没出界）', edge);
    const again = await pos();
    await KEY('ArrowRight'); await sleep(120);
    ok(JSON.stringify(await pos()) === JSON.stringify(again), '贴边后再按不动', await pos());
    ok(await ev('raw.pieces.every(p=>p.x>=0&&p.x<10)') === true, '写回 raw 的坐标也在盘内');
  }

  await setup(); await boxSelect();
  console.log('\n[2] Q/E 整组旋转');
  {
    // 半圆 4 个朝向；两个 1×1 只有 1 个朝向（矩形块本来就不给转）
    const before = JSON.parse(await ev('JSON.stringify(st.map(s=>s.ori))'));
    await KEY('e'); await sleep(160);
    const after = JSON.parse(await ev('JSON.stringify(st.map(s=>s.ori))'));
    ok(after[0] === (before[0] + 1) % 4, '半圆转了 90°', { before, after });
    ok(after[1] === before[1] && after[2] === before[2],
      '不可转的块跳过，不影响别的块', { before, after });
    ok(await ev('piecesTurnable(selSet).length') === 1, '只有 1 块可转（其余跳过）', await ev('piecesTurnable(selSet)'));
    await KEY('q'); await sleep(160);
    const back = JSON.parse(await ev('JSON.stringify(st.map(s=>s.ori))'));
    ok(back[0] === before[0], '按 Q 转回去', { before, back });
  }

  await setup(); await boxSelect();
  console.log('\n[3] 拖住一块 = 整组一起挪');
  {
    const before = await pos();
    await dragCells(4.5, 1.5, 6.5, 3.5, 10);          // 抓中间的「乙」往右下拖 2,2
    const after = await pos();
    ok(after.every((p, i) => p[0] === before[i][0] + 2 && p[1] === before[i][1] + 2),
      '三块都跟着挪了 (2,2)', { before, after });
    ok(JSON.stringify(bboxOf(after.map(p => [p[0], p[1]])).map((v, i) => v - bboxOf(before.map(p => [p[0], p[1]]))[i])) === '[2,2,2,2]',
      '相对位置没变（整体平移）');
    ok(await ev('selSet.size') === 3, '拖完框选还在', await ev('selSet.size'));
    // 再拖回原处：位置应该精确复原（位移都基于按下时的快照）
    await dragCells(6.5, 3.5, 4.5, 1.5, 10);
    ok(JSON.stringify(await pos()) === JSON.stringify(before), '拖回原处能原样复原', await pos());
    // 撤销一次拖动
    await dragCells(4.5, 1.5, 5.5, 1.5, 6);
    await KEY('z', true); await sleep(220);
    ok(JSON.stringify(await pos()) === JSON.stringify(before), 'Ctrl+Z 撤回整组拖动', await pos());
    ok(await ev('selSet.size') === 3, '撤销后框选还留着（块数没变）', await ev('selSet.size'));
  }

  await setup(); await boxSelect();
  console.log('\n[4] Ctrl+A / Ctrl+C / Ctrl+V');
  {
    await ev('selSet.clear(); sel=null; render(); updateUI();'); await sleep(120);
    await KEY('a', true); await sleep(150);
    ok(await ev('selSet.size') === 3, 'Ctrl+A 全选 3 块', await ev('selSet.size'));
    await KEY('c', true); await sleep(120);
    ok(await ev('pieceClip && pieceClip.items.length') === 3, 'Ctrl+C 复制进剪贴板', await ev('pieceClip && pieceClip.items.length'));
    // 点一下第 9 行最左边，作为粘贴的左上角
    const p0 = await P(0.5, 9.5);
    await mouse('mousePressed', p0.x, p0.y); await mouse('mouseReleased', p0.x, p0.y);
    await sleep(200);
    await KEY('v', true); await sleep(300);
    ok(await ev('raw.pieces.length') === 6, 'Ctrl+V 粘上 3 块', await ev('raw.pieces.length'));
    const ids = JSON.parse(await ev('JSON.stringify(raw.pieces.map(p=>p.id))'));
    ok(new Set(ids).size === ids.length, '新块 id 都唯一', ids);
    const pasted = JSON.parse(await ev('JSON.stringify(raw.pieces.slice(3).map(p=>[p.x,p.y]))'));
    const bb = bboxOf(pasted);
    ok(bb[0] === 0 && bb[1] === 9, '整组贴在最后点过的那格（左上角 = (0,9)）', bb);
    ok(pasted[1][0] - pasted[0][0] === 3 && pasted[2][0] - pasted[0][0] === 6,
      '块之间的相对位置保持不变', pasted);
    ok(await ev('selSet.size') === 3, '粘完自动框选新块', await ev('selSet.size'));
  }

  await setup(); await boxSelect();
  console.log('\n[5] L/P/O/N 整组改档位');
  {
    await KEY('l'); await sleep(160);
    ok(await ev('raw.pieces.every(p=>p.lock===true)') === true, '按 L：三块都锁定');
    await KEY('l'); await sleep(160);
    ok(await ev('raw.pieces.every(p=>!p.lock&&!p.chainOnly&&!p.onceOnly)') === true,
      '再按一次 L：回普通（不是叠两层）');
    await KEY('p'); await sleep(160);
    ok(await ev('raw.pieces.every(p=>p.chainOnly===true)') === true, '按 P：三块都变被动');
    await KEY('o'); await sleep(160);
    ok(await ev('raw.pieces.every(p=>p.onceOnly===true&&!p.chainOnly)') === true,
      '按 O：换成一次被动（四档互斥）');
    await KEY('n'); await sleep(160);
    ok(await ev('raw.pieces.every(p=>!p.lock&&!p.chainOnly&&!p.onceOnly)') === true, '按 N：回普通');
  }

  await setup(); await boxSelect();
  console.log('\n[6] Esc 取消框选 / 单块仍是老行为');
  {
    await KEY('Escape'); await sleep(160);
    ok(await ev('selSet.size') === 0 && await ev('boxSel') === null, 'Esc 清掉框选');
    ok(await ev('boxBatch()') === false, '退出整组模式');
    // 单块：点一块再按 D，只动它
    const p1 = await P(4.5, 1.5);
    await mouse('mousePressed', p1.x, p1.y); await mouse('mouseReleased', p1.x, p1.y);
    await sleep(200);
    const before = await pos();
    await KEY('d'); await sleep(150);
    const after = await pos();
    ok(after[1][0] === before[1][0] + 1 && after[0][0] === before[0][0] && after[2][0] === before[2][0],
      '只选中一块时按 D 只动那一块', { before, after });
    ok(await ev('selSet.size') === 1 && await ev('[...selSet][0]') === 1,
      '点单块 = 选择集里只有它（单选并入选择集）', await ev('JSON.stringify([...selSet])'));
  }

  console.log('\n[7] 没有 JS 异常');
  ok(b.errors.length === 0, '页面无未捕获异常', b.errors);

  console.log('\nv24：' + pass + ' 通过 / ' + fail + ' 失败');
  b.close();
  process.exit(fail ? 1 : 0);
})();
