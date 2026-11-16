/* v20 端到端：一个按钮切 普通/被动/锁定 + 编辑态 Q/W/A/S 直接拿块 + 放块继承属性
 *   node test/v20-ui.test.js
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
  const key = async k => {
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)},bubbles:true}))`);
    await sleep(130);
  };
  const cellPt = async (cx, cy) => JSON.parse(await ev(`(function(){
    const r=svg.getBoundingClientRect();const s=Math.min(r.width/L.w,r.height/L.h);
    return JSON.stringify({x:(r.left+(r.width-s*L.w)/2)+(${cx}+0.5)*s,
                           y:(r.top+(r.height-s*L.h)/2)+(${cy}+0.5)*s});})()`));
  const clickBoard = async (cx, cy) => {
    const p = await cellPt(cx, cy);
    await b.mouse('mousePressed', p.x, p.y);
    await b.mouse('mouseReleased', p.x, p.y);
    await sleep(220);
  };

  console.log('\n[1] 一个按钮循环 普通 → 被动 → 一次被动 → 锁定 → 普通');
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(160);
  await ev(`loadLevel({name:"四档",w:5,h:4,goals:[],pieces:[
    {id:"a",x:1,y:1,ori:0,shape:"1x1",name:"甲"},
    {id:"b",x:2,y:1,ori:0,shape:"1x1",name:"乙"}]})`);
  await sleep(280);
  await ev('sel = 0; updateUI();'); await sleep(140);
  ok((await ev(`document.getElementById('btnKind').textContent`)).indexOf('普通') >= 0,
    '一开始是「普通」', await ev(`document.getElementById('btnKind').textContent`));

  const seq = [];
  seq.push(await ev('pieceKind(raw.pieces[0])'));
  for (let k = 0; k < 4; k++) {
    await ev(`document.getElementById('btnKind').click()`); await sleep(180);
    seq.push(await ev('pieceKind(raw.pieces[0])'));
    if (k === 0) {
      ok(/被动/.test(await ev(`document.getElementById('btnKind').textContent`)), '第二档按钮写「被动」');
      ok(await ev('!!raw.pieces[0].chainOnly && !raw.pieces[0].lock'), '关卡数据里 chainOnly = true',
        await ev('JSON.stringify({lock:raw.pieces[0].lock,chainOnly:raw.pieces[0].chainOnly})'));
      ok(await ev(`K.moves(L,st).filter(m=>m.i===0).length`) === 0, '被动块自己没有任何走法');
      ok(await ev(`K.moves(L,st).filter(m=>m.t==='p'&&m.i===1).length`) > 0, '但能被旁边的乙推着走');
    }
    if (k === 1) {
      ok(/一次被动/.test(await ev(`document.getElementById('btnKind').textContent`)), '第三档按钮写「一次被动」');
      ok(await ev('!!raw.pieces[0].onceOnly && !raw.pieces[0].chainOnly && !raw.pieces[0].lock'),
        '关卡数据里 onceOnly = true，且与另外两档互斥',
        await ev('JSON.stringify({lock:raw.pieces[0].lock,chainOnly:raw.pieces[0].chainOnly,onceOnly:raw.pieces[0].onceOnly})'));
      ok(await ev(`K.moves(L,st).filter(m=>m.i===0).length`) === 0, '一次被动块自己没有任何走法');
      ok(await ev(`K.moves(L,st).filter(m=>m.t==='p'&&m.i===1).length`) > 0, '但能被旁边的乙直接推着走');
      ok(await ev(`document.querySelectorAll('#board path[data-i="0"][data-part="once"]').length`) === 1,
        '一次被动块铺了木箱 X 撑');
      ok(await ev(`document.querySelectorAll('#board path[data-i="0"][data-part="onceEdge"]').length`) === 1,
        '一次被动块有暖金实线边框（和被动的虚线链纹不同）');
      ok(await ev(`document.querySelectorAll('#board path[data-i="0"][data-part="chain"]').length`) === 0,
        '不再是被动块的链纹');
    }
    if (k === 2) {
      ok(/锁定/.test(await ev(`document.getElementById('btnKind').textContent`)), '第四档按钮写「锁定」');
      ok(await ev('!!raw.pieces[0].lock && !raw.pieces[0].chainOnly && !raw.pieces[0].onceOnly'),
        '四档互斥：锁定时不带 chainOnly / onceOnly');
      ok(await ev(`K.moves(L,st).filter(m=>m.i===0).length`) === 0, '锁定块没有任何走法');
      ok(await ev(`document.querySelectorAll('#board [data-part="lock"]').length`) >= 1, '锁定块有斜线阴影');
    }
  }
  ok(JSON.stringify(seq) === JSON.stringify(['normal', 'passive', 'once', 'lock', 'normal']),
    '顺序正好是 普通 → 被动 → 一次被动 → 锁定 → 普通（转一圈回到原点）', seq);

  console.log('\n[2] 没选中块时，按钮显示「新块 · 档位」');
  await ev('sel = null; updateUI();'); await sleep(140);
  ok(/新块/.test(await ev(`document.getElementById('btnKind').textContent`)),
    '未选中时按钮说的是新块属性', await ev(`document.getElementById('btnKind').textContent`));
  await ev(`document.getElementById('btnKind').click()`); await sleep(160);
  ok(await ev('newKind') === 'passive', '没选中块时点它只切「新块属性」', await ev('newKind'));
  ok(/被动/.test(await ev(`document.getElementById('btnKind').textContent`)), '按钮跟着变「新块 · 被动」');
  ok(!(await ev('raw.pieces[0].lock || raw.pieces[0].chainOnly')), '已放好的块属性没被顺手改掉');

  console.log('\n[3] 放块继承属性：被动');
  await ev(`[...document.querySelectorAll('#pal button')].find(b=>b.dataset.k==='1x1').click()`);
  await sleep(140);
  await clickBoard(3, 2);
  const p1 = JSON.parse(await ev(`JSON.stringify((function(){const q=raw.pieces[raw.pieces.length-1];
    return {n:raw.pieces.length, shape:q.shape, chainOnly:!!q.chainOnly, lock:!!q.lock};})())`));
  ok(p1.n === 3 && p1.shape === '1x1', '棋盘上多了一个 1×1', p1);
  ok(p1.chainOnly && !p1.lock, '新块自动是「被动」', p1);
  ok(await ev(`document.querySelectorAll('#board path[data-i="2"][data-part="chain"]').length`) === 1,
    '被动效果直接画出来了');

  console.log('\n[4] 放块继承属性：锁定 / 切回普通');
  await ev('sel = null; newKind = "lock"; updateUI();'); await sleep(120);
  await ev(`[...document.querySelectorAll('#pal button')].find(b=>b.dataset.k==='1x1').click()`);
  await sleep(120);
  await clickBoard(4, 2);
  const p2 = JSON.parse(await ev(`JSON.stringify((function(){const q=raw.pieces[raw.pieces.length-1];
    return {n:raw.pieces.length, lock:!!q.lock, chainOnly:!!q.chainOnly};})())`));
  ok(p2.lock && !p2.chainOnly, '切到锁定后放的块是锁定的', p2);
  await ev('sel = null; newKind = "normal"; updateUI();'); await sleep(120);
  await ev(`[...document.querySelectorAll('#pal button')].find(b=>b.dataset.k==='1x1').click()`);
  await sleep(120);
  await clickBoard(4, 3);
  const p3 = JSON.parse(await ev(`JSON.stringify((function(){const q=raw.pieces[raw.pieces.length-1];
    return {lock:!!q.lock, chainOnly:!!q.chainOnly};})())`));
  ok(!p3.lock && !p3.chainOnly, '普通档放出来的块就是普通块', p3);
  ok(await ev('newKind') === 'normal', '放块不会偷偷改档位');

  console.log('\n[5] 编辑态按 1/2/3/4 直接拿块（不需要先取消选中）');
  await ev(`loadLevel({name:"键盘",w:6,h:5,goals:[],pieces:[{id:"a",x:0,y:2,ori:0,shape:"1x1",name:"甲"}]})`);
  await sleep(260);
  await ev('sel = 0; palShape = null; paintPalOn(); updateUI();'); await sleep(120);   // 故意选中一块
  const table = [['1', '1x1'], ['2', '2x1'], ['3', '1x2'], ['4', '2x2']];
  for (const [k, shape] of table) {
    await key(k);
    const got = JSON.parse(await ev(`JSON.stringify({pal: palShape, sel,
      on: [...document.querySelectorAll('#pal button')].filter(b=>b.classList.contains('on')).map(b=>b.dataset.k)})`));
    ok(got.pal === shape, k + ' → ' + shape + '（选中着块也照样生效）', got);
    ok(got.on.length === 1 && got.on[0] === shape, '调色板上也高亮成 ' + shape, got.on);
  }
  await key('4');
  ok(await ev('palShape') === null, '同一个数字再按一次 = 取消', await ev('palShape'));

  console.log('\n[6] 数字键不抢旋转/移动（Q/E 旋转、WASD 移动照旧）');
  await ev('sel = 0; palShape = null; paintPalOn(); updateUI();'); await sleep(120);
  const ori0 = await ev('st[0].ori');
  await key('q');
  ok(await ev('palShape') === null, 'Q 不再拿去取块');
  ok((await ev('st[0].ori')) !== ori0 || (await ev('L.pieces[0].oris.length')) === 1,
    '选中块时 Q 仍然是逆时针转', [ori0, await ev('st[0].ori')]);
  await ev('sel = 0; updateUI();'); await sleep(100);
  const y0 = await ev('st[0].y');
  await key('w');
  const moved = JSON.parse(await ev(`JSON.stringify({y:st[0].y, pal:palShape})`));
  ok(moved.y === y0 - 1 && moved.pal === null, '选中块时 W 仍然是上移一格', { y0, moved });

  console.log('\n[7] Esc：清掉形状与选中');
  await ev('sel = null; choosePalette("2x2");'); await sleep(120);
  ok(await ev('palShape') === '2x2', '先用键盘/按钮拿一个形状');
  await key('Escape');
  const esc = JSON.parse(await ev(`JSON.stringify({pal: palShape, sel,
    on: document.querySelectorAll('#pal button.on').length})`));
  ok(esc.pal === null && esc.sel === null && esc.on === 0, 'Esc 把形状和选中都清掉', esc);

  console.log('\n[8] 「展开画布」= 和棋盘一样大，一格对一格');
  await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`); await sleep(150);
  await ev(`loadLevel({name:"画布",w:4,h:5,goals:[],pieces:[{id:"a",x:0,y:0,ori:0,shape:"1x1",color:"#22b14c",name:"甲"}]})`);
  await sleep(320);
  ok(await ev('document.querySelectorAll("#paint button").length') === 25, '收起时还是 5×5 = 25 格',
    await ev('document.querySelectorAll("#paint button").length'));
  await ev(`document.getElementById('btnPaintBig').click()`); await sleep(320);
  const big = JSON.parse(await ev(`(function(){
    const r = svg.getBoundingClientRect();
    const s2 = Math.min(r.width / L.w, r.height / L.h);
    const exp = { x: r.left + (r.width - s2 * L.w) / 2, y: r.top + (r.height - s2 * L.h) / 2,
                  w: s2 * L.w, h: s2 * L.h };
    const g = document.getElementById('paint').getBoundingClientRect();
    return JSON.stringify({ n: document.querySelectorAll('#paint button').length,
      float: document.getElementById('paint').classList.contains('float'),
      big: paintBig, w: paintW, h: paintH,
      got: { x: g.left, y: g.top, w: g.width, h: g.height }, exp });
  })()`));
  ok(big.float && big.big, '画布浮起来了（.float）', big.float);
  ok(big.n === 20 && big.w === 4 && big.h === 5, '格数 = 棋盘 4×5 = 20', [big.n, big.w, big.h]);
  const near = (a, c, t) => Math.abs(a - c) <= (t || 1.5);
  ok(near(big.got.x, big.exp.x) && near(big.got.y, big.exp.y) &&
     near(big.got.w, big.exp.w) && near(big.got.h, big.exp.h),
    '画布区域和棋盘逐格重合（位置/宽高都对得上）', { got: big.got, exp: big.exp });
  ok(await ev('document.body.contains(document.getElementById("paint"))') === true &&
     await ev(`document.getElementById('paint').parentNode === document.body`),
    '展开时画布挂在 body 上（盖在棋盘上方）');
  // 在展开的画布上画一格，再创建滑块：应当落在这个位置
  const cell = JSON.parse(await ev(`(function(){const g=document.getElementById('paint').getBoundingClientRect();
    return JSON.stringify({x:g.left + g.width/8, y:g.top + g.height/10});})()`));
  await b.mouse('mousePressed', cell.x, cell.y);
  await b.mouse('mouseReleased', cell.x, cell.y);
  await sleep(220);
  ok(await ev('paintedDesc().length') === 1, '在大画布上画出了一格');
  ok(await ev('paintedDesc()[0].c === 0 && paintedDesc()[0].r === 0'), '画在第 0 格');
  await ev(`document.getElementById('btnPaintBig').click()`); await sleep(300);
  ok(await ev('paintBig') === false && await ev('document.querySelectorAll("#paint button").length') === 25,
    '收起后回到 5×5');
  ok(await ev(`document.getElementById('paint').closest('.card') !== null`), '收起后回到侧栏卡片里');

  console.log('\n[9] 块列表里标出档位');
  await ev(`loadLevel({name:"列表",w:5,h:3,goals:[],pieces:[
    {id:"a",x:0,y:0,ori:0,shape:"1x1",name:"普通块"},
    {id:"b",x:1,y:0,ori:0,shape:"1x1",name:"被动块",chainOnly:true},
    {id:"c",x:2,y:0,ori:0,shape:"1x1",name:"一次被动块",onceOnly:true},
    {id:"d",x:3,y:0,ori:0,shape:"1x1",name:"锁定块",lock:true}]})`);
  await sleep(280);
  await ev('sel = null; updateUI();'); await sleep(140);
  const names = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#pillist .nm')].map(e=>e.textContent))`));
  ok(names.length === 4, '块列表四行', names.length);
  ok(!/🔗|▣|🔒/.test(names[0]), '普通块不带记号', names[0]);
  ok(/🔗/.test(names[1]), '被动块带 🔗', names[1]);
  ok(/▣/.test(names[2]), '一次被动块带 ▣', names[2]);
  ok(/🔒/.test(names[3]), '锁定块带 🔒', names[3]);

  console.log('\n[10] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  await b.close();
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
