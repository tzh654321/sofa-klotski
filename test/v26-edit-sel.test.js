/* v26：编辑态选择/调色/重叠点选/自绘落位的回归
 *  ① 选中块与框选合并成一个「选中」板块（单选 = 只有一块的选择集）
 *  ② 颜色对整组生效，并成为之后新块的颜色（不再每块随机）
 *  ③ 重叠处再点一下往下翻一层，到底回到最上面
 *  ④ 自绘画布展开时，建出来的块落在画的那几格
 *   node test/v26-edit-sel.test.js
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
    await sleep(180);
  };

  console.log('[0] 页面无异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  console.log('\n[1] 面板合并成一个');
  const heads = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#editPane h3')].map(h=>h.textContent.trim()))`));
  console.log('  标题：' + JSON.stringify(heads));
  ok(!heads.some(t => /^框选/.test(t)), '没有单独的「框选」板块');
  ok(heads.filter(t => /^选中/.test(t)).length === 1, '只有一个「选中」板块');
  const miss = JSON.parse(await ev(`JSON.stringify(['inName','inColor','btnKind','btnSetGoalOne','btnBoxDel','btnBoxCopy','btnBoxAll','btnBoxClear','selInfo','selBoxInfo','selCount'].filter(id=>!document.getElementById(id)))`));
  ok(miss.length === 0, '合并后按钮/输入框都还在', miss);

  console.log('\n[2] 单选就是"只有一块的选择集"');
  await ev(`(function(){ loadLevel({name:'选中',w:10,h:10,pieces:[
      {id:'a',x:1,y:1,shape:'1x1',color:'#db5243',name:'甲'},
      {id:'b',x:4,y:1,shape:'1x1',color:'#43db44',name:'乙'}],goals:[]});
    document.querySelector('#tabs [data-mode="edit"]').click(); })()`);
  await sleep(400);
  await click(1.5, 1.5);
  const s1 = JSON.parse(await ev(`JSON.stringify({sel, set:[...selSet], cnt:document.getElementById('selCount').textContent,
    info:document.getElementById('selInfo').textContent, name:document.getElementById('inName').value})`));
  ok(s1.set.length === 1 && s1.set[0] === s1.sel, '点一块 → 选择集里正好是它', s1);
  ok(s1.cnt === '1', '面板角标显示 1', s1.cnt);

  console.log('\n[3] 批量调色');
  await ev(`selSet = new Set([0,1]); sel = 1; updateUI();`);
  await sleep(150);
  await ev(`(function(){ const i=document.getElementById('inColor'); i.value='#123456'; i.dispatchEvent(new Event('input')); })()`);
  await sleep(220);
  const cols = JSON.parse(await ev(`JSON.stringify(raw.pieces.map(p=>p.color))`));
  ok(cols[0] === '#123456' && cols[1] === '#123456', '两块都改成 #123456', cols);

  console.log('\n[4] 新块不再随机取色');
  const cols4 = [];
  for (let k = 0; k < 3; k++) {
    await ev(`(function(){ palShape='1x1'; paintPalOn(); addPiece(${2 + k}, 6, '1x1'); })()`);
    await sleep(140);
    cols4.push(await ev(`raw.pieces[raw.pieces.length-1].color`));
  }
  ok(cols4.every(c => c === '#123456'), '连放三块都是面板上的颜色', cols4);

  console.log('\n[5] 重叠处再点一下换下一层');
  await ev(`(function(){ loadLevel({name:'叠',w:8,h:8,pieces:[
      {id:'x1',x:2,y:2,shape:'1x1',color:'#ff0000',name:'下'},
      {id:'x2',x:2,y:2,shape:'1x1',color:'#00ff00',name:'中'},
      {id:'x3',x:2,y:2,shape:'1x1',color:'#0000ff',name:'上'}],goals:[]});
    document.querySelector('#tabs [data-mode="edit"]').click(); })()`);
  await sleep(400);
  const seq = [];
  for (let k = 0; k < 4; k++) {
    await click(2.5, 2.5);
    seq.push(await ev(`raw.pieces[sel] ? raw.pieces[sel].name : null`));
  }
  console.log('  连点四次的选中顺序：' + JSON.stringify(seq));
  ok(seq[0] === '上', '第一下选最上面那块', seq[0]);
  ok(seq[1] === '中' && seq[2] === '下', '再点往下翻一层', seq);
  ok(seq[3] === '上', '到底后回到最上面', seq);

  console.log('\n[6] 自绘滑块落在画的地方');
  await ev(`(function(){ loadLevel({name:'画',w:8,h:8,pieces:[],goals:[]});
    document.querySelector('#tabs [data-mode="edit"]').click(); })()`);
  await sleep(350);
  await ev(`(function(){ togglePaintBig(); setPaintSize(8,8); paintCells.fill(-1);
    paintCells[6*8+6] = 0; paintCells[7*8+6] = 0;   // 画在 (6,6)-(6,7)
    renderPaint(); addCustomPiece(); })()`);
  await sleep(320);
  const made = JSON.parse(await ev(`JSON.stringify((()=>{const p=raw.pieces[raw.pieces.length-1];return {x:p.x,y:p.y,cells:(p.cells||[]).map(q=>[q.c,q.r])};})())`));
  console.log('  建出来的块：' + JSON.stringify(made));
  ok(made.x === 6 && made.y === 6, '落在画布上画的那一格 (6,6)', made);

  b.close();
  console.log('\n' + (fail ? 'FAILED  ' + fail + ' failed, ' + pass + ' passed'
  : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
