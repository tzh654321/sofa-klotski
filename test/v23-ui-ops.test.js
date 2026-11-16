/* v23：交互与列表的一批改进
 *   node test/v23-ui-ops.test.js
 *
 * ①一次拖动走折线（密林穿行那种要拐弯的）  ②手绘弓形（水滴）能转  ③双半圆拼的整圆能拆开
 * ④列表排序（默认/难度/难度倒序/大小）     ⑤嵌套文件夹条目（▸/▿ + 关数）
 * ⑥框选批量复制·删除·改属性                ⑦自绘块落在"画的地方"
 * ⑧游玩区滚轮缩放 / 右键平移 / 缩放后仍点得中
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

  const P = async (cx, cy) => JSON.parse(await ev('(function(){' +
    ' const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;' +
    ' const s=Math.min(r.width/vb.width, r.height/vb.height);' +
    ' return JSON.stringify({x: r.left+(r.width-s*vb.width)/2+((' + cx + ')-vb.x)*s,' +
    ' y: r.top+(r.height-s*vb.height)/2+((' + cy + ')-vb.y)*s}); })()'));
  const mouse = (t, x, y, btn) => send('Input.dispatchMouseEvent',
    { type: t, x, y, button: btn || 'left', buttons: t === 'mouseReleased' ? 0 : 1, clickCount: 1 });

  console.log('\n[1] 一次拖动走折线');
  {
    await ev(`loadLevel({name:'折线',w:8,h:8,pieces:[{id:'a',x:1,y:1,shape:'1x1'}],goals:[]})`);
    await ev(`document.querySelector('#tabs [data-mode="play"]').click()`);
    await sleep(300);
    const p1 = await P(1.5, 1.5), p2 = await P(4.5, 1.5), p3 = await P(4.5, 4.5);
    await mouse('mousePressed', p1.x, p1.y);
    for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', p1.x + (p2.x - p1.x) * i / 6, p1.y); await sleep(16); }
    for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', p2.x, p2.y + (p3.y - p2.y) * i / 6); await sleep(16); }
    await mouse('mouseReleased', p3.x, p3.y);
    await sleep(200);
    const pos = JSON.parse(await ev('JSON.stringify([st[0].x, st[0].y])'));
    ok(pos[0] === 4 && pos[1] === 4, '横 3 格再竖 3 格，一次拖动走完（' + pos.join(',') + '）', pos);
    ok(await ev('hands') === 1, '整段只算 1 手', await ev('hands'));
  }

  console.log('\n[2] 手绘弓形（水滴）能转');
  {
    const r = JSON.parse(await ev(`(function(){
      loadLevel({name:'水滴',w:8,h:8,pieces:[{id:'d',x:3,y:3,shape:'custom',cells:[{c:0,r:0,seg:3},{c:1,r:1,seg:0}],rot:false}],goals:[]});
      document.querySelector('#tabs [data-mode="play"]').click();
      const before = st[0].ori;
      const n = K.moves(L,st).filter(m=>m.t==='r').length;
      tryTurn(0,1);
      return JSON.stringify({rot:n, rotPlay:L.pieces[0].rotPlay, before, after:st[0].ori});
    })()`));
    ok(r.rotPlay === true, '弓形拼出来的块判定为可转', r.rotPlay);
    ok(r.rot > 0, '空地上有旋转走法', r.rot);
    ok(r.after !== r.before, '真的转过去了', r);
  }

  console.log('\n[3] 双半圆拼成的整圆：能拆开');
  {
    await ev(`loadLevel({name:'正圆',w:8,h:8,pieces:[
      {id:'s1',x:2,y:2,shape:'semi',ori:0,name:'上'},
      {id:'s2',x:2,y:3,shape:'semi',ori:2,name:'下'}],goals:[]})`);
    await ev(`document.querySelector('#tabs [data-mode="play"]').click()`);
    await sleep(300);
    ok(await ev('overlapInfo().total') === 0, '拼成整圆不算叠放');
    ok(await ev('playable()') === true, '可以下手拖动');
    const a = await P(2.5, 2.5), z = await P(4.5, 2.5);
    await mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', a.x + (z.x - a.x) * i / 8, a.y); await sleep(20); }
    await mouse('mouseReleased', z.x, z.y);
    await sleep(250);
    const s = JSON.parse(await ev('JSON.stringify(st.map(q=>[q.x,q.y]))'));
    ok(s[0][0] === 4 && s[1][0] === 2, '只拖走被抓住的那一半（另一半没动）', s);
    ok(await ev('overlapInfo().total') === 0, '拆开以后也没有叠放');
  }

  console.log('\n[4] 关卡列表排序');
  {
    const head = async v => {
      await ev(`(function(){const s=document.getElementById('lvSort');s.value='${v}';s.dispatchEvent(new Event('change'));})()`);
      await sleep(200);
      return JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#lvList .lvbtn')].slice(0,3).map(b=>b.querySelector('.nm').textContent))`));
    };
    ok(await ev(`!!document.getElementById('lvSort')`), '有关联排序下拉');
    const asc = await head('scoreAsc');
    const desc = await head('scoreDesc');
    console.log('     易→难 ' + asc.join(' / ') + '　难→易 ' + desc.join(' / '));
    ok(asc.length === 3 && desc.length === 3 && asc[0] !== desc[0], '两种难度排序的头不一样', [asc[0], desc[0]]);
    const scoreOf = async nm => JSON.parse(await ev(`(function(){
      const e=lib.find(x=>x.name===${JSON.stringify(nm)}); const m=metaOfEntry(e); return JSON.stringify(m&&m.score);})()`));
    ok((await scoreOf(asc[0])) <= (await scoreOf(asc[1])), '「难度」是从易到难', [asc[0], asc[1]]);
    ok((await scoreOf(desc[0])) >= (await scoreOf(desc[1])), '「难度倒序」是从难到易', [desc[0], desc[1]]);
    const big = await head('size');
    const area = async nm => JSON.parse(await ev(`(function(){
      const e=lib.find(x=>x.name===${JSON.stringify(nm)}); const lv=levelOfEntry(e); return JSON.stringify(lv.w*lv.h);})()`));
    ok((await area(big[0])) >= (await area(big[1])), '「关卡大小」从大到小', [big[0], big[1]]);
    const def = await head('default');
    ok(def[0] === '阴晴圆缺', '「默认」回到文件编号顺序', def);
  }

  console.log('\n[5] 嵌套文件夹条目');
  {
    // 直接往关卡库里塞两条带 dir 的假条目（不动磁盘）
    await ev(`(function(){
      lib.push({key:'t-f1',src:'pack',set:'临时集',dir:'临时集/子夹',name:'子夹关一',level:{name:'子夹关一',w:4,h:4,pieces:[{id:'a',x:0,y:0,shape:'1x1'}],goals:[]},meta:{score:30,grade:'简单'}});
      lib.push({key:'t-f2',src:'pack',set:'临时集',dir:'临时集/子夹',name:'子夹关二',level:{name:'子夹关二',w:4,h:4,pieces:[{id:'a',x:0,y:0,shape:'1x1'}],goals:[]},meta:{score:60,grade:'困难'}});
      lib.push({key:'t-f3',src:'pack',set:'临时集',dir:'临时集',name:'平铺关',level:{name:'平铺关',w:4,h:4,pieces:[{id:'a',x:0,y:0,shape:'1x1'}],goals:[]},meta:{score:10,grade:'太简单'}});
      lvSort='default'; curSet='临时集'; buildLevelList();
    })()`);
    await sleep(250);
    const rows = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#lvList .lvbtn')].map(b=>b.className+'|'+b.textContent))`));
    console.log('     ' + rows.join('  ·  '));
    ok(rows.some(r => r.indexOf('lvbtn dir') >= 0 && /子夹/.test(r) && /2 关/.test(r)), '文件夹条目带关数');
    ok(rows.some(r => r.indexOf('平铺关') >= 0), '同集的平铺关还在');
    ok(await ev(`document.querySelectorAll('#lvList .lvbtn.sub').length`) === 0, '文件夹默认收起');
    await ev(`document.querySelector('#lvList .lvbtn.dir').click()`);
    await sleep(250);
    ok(await ev(`document.querySelectorAll('#lvList .lvbtn.sub').length`) === 2, '点开后露出两个子条目');
    ok(/▿/.test(await ev(`document.querySelector('#lvList .lvbtn.dir').textContent`)), '展开后图标变 ▿');
    // 清掉假条目
    await ev(`(function(){ lib = lib.filter(e=>e.key.indexOf('t-f')!==0); curSet='全部'; lvSort='default'; buildLevelList(); })()`);
    await sleep(150);
  }

  console.log('\n[6] 框选 → 批量复制 / 删除 / 改属性');
  {
    await ev(`loadLevel({name:'框选',w:8,h:8,pieces:[
      {id:'a',x:1,y:1,shape:'1x1',name:'甲'},{id:'b',x:3,y:3,shape:'1x1',name:'乙'},
      {id:'c',x:6,y:6,shape:'1x1',name:'丙'}],goals:[{piece:'a',cells:[[6,1]]}]})`);
    await ev(`document.querySelector('#tabs [data-mode="edit"]').click()`);
    await sleep(350);
    const p0 = await P(0.4, 0.4), p1 = await P(4.4, 4.4);
    await mouse('mousePressed', p0.x, p0.y);
    for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', p0.x + (p1.x - p0.x) * i / 8, p0.y + (p1.y - p0.y) * i / 8); await sleep(16); }
    await mouse('mouseReleased', p1.x, p1.y);
    await sleep(300);
    const sel = JSON.parse(await ev('JSON.stringify([...selSet])'));
    ok(sel.length === 2, '框住了左上两块（' + sel.length + '）', sel);
    ok(await ev('document.getElementById("selCount").textContent') === '2', '面板显示已选 2 块');

    await ev(`document.getElementById('btnBoxLock').click()`); await sleep(250);
    ok(await ev(`JSON.stringify([...selSet].map(i=>!!raw.pieces[i].lock))`) === '[true,true]', '批量设为锁定');

    await ev(`document.getElementById('btnBoxCopy').click()`); await sleep(300);
    ok(await ev('raw.pieces.length') === 5, '复制后 5 块', await ev('raw.pieces.length'));
    const ids = JSON.parse(await ev('JSON.stringify(raw.pieces.map(p=>p.id))'));
    ok(new Set(ids).size === ids.length, '复制的块 id 不重复', ids);

    await ev(`document.getElementById('btnBoxDel').click()`); await sleep(300);
    ok(await ev('raw.pieces.length') === 3, '删掉刚复制的块，回到 3 块', await ev('raw.pieces.length'));
    ok(await ev('raw.goals.length') === 1, '目标还在（它挂在原块上，没被误删）', await ev('raw.goals.length'));

    // 再框住「甲」并删除：挂在它身上的目标要一起消失
    const a = await P(0.3, 0.3), z = await P(1.9, 1.9);   // 从空格起手才是框选
    await mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= 5; i++) { await mouse('mouseMoved', a.x + (z.x - a.x) * i / 5, a.y + (z.y - a.y) * i / 5); await sleep(16); }
    await mouse('mouseReleased', z.x, z.y);
    await sleep(250);
    ok(await ev('selSet.size') === 1, '框住了 1 块', await ev('selSet.size'));
    await ev(`document.getElementById('btnBoxDel').click()`); await sleep(300);
    ok(await ev('raw.pieces.length') === 2, '删掉后剩 2 块', await ev('raw.pieces.length'));
    ok(await ev('raw.goals.length') === 0, '引用被删块的目标一起删掉', await ev('raw.goals.length'));
  }

  console.log('\n[7] 自绘块落在"画的地方"');
  {
    const r = JSON.parse(await ev(`(function(){
      loadLevel({name:'放置',w:10,h:10,pieces:[],goals:[]});
      document.querySelector('#tabs [data-mode="edit"]').click();
      lastBoardCell = [6,6];
      paintW=3; paintH=2; paintCells = new Array(6).fill(-1); paintCells[0]=0; paintCells[1]=0;
      addCustomPiece();
      return JSON.stringify({x:raw.pieces[0].x, y:raw.pieces[0].y});
    })()`));
    ok(r.x === 6 && r.y === 6, '落在最后点的那一格（' + r.x + ',' + r.y + '）', r);
  }

  console.log('\n[8] 游玩区缩放与平移');
  {
    await ev(`loadLevel({name:'大棋盘',w:200,h:200,pieces:[{id:'a',x:100,y:100,shape:'1x1'}],goals:[]})`);
    await ev(`document.querySelector('#tabs [data-mode="play"]').click()`);
    await sleep(300);
    const mid = JSON.parse(await ev(`(function(){const r=svg.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));
    ok(await ev('JSON.stringify(view)') === '{"z":1,"x":0,"y":0}', '进场是 1 倍、左上对齐');
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: -120 });
    await sleep(200);
    const v1 = JSON.parse(await ev('JSON.stringify(view)'));
    ok(v1.z > 1, '滚轮放大（z=' + v1.z.toFixed(2) + '）', v1);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mid.x, y: mid.y, button: 'right', buttons: 2, clickCount: 1 });
    for (let k = 1; k <= 6; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mid.x - k * 12, y: mid.y, button: 'right', buttons: 2 }); await sleep(16); }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mid.x - 72, y: mid.y, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    const v2 = JSON.parse(await ev('JSON.stringify(view)'));
    ok(v2.x > v1.x, '右键拖动平移了视口', [v1.x, v2.x]);
    // 缩放+平移之后，块的位置仍然能点中
    const q = await ev(`(function(){ const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;
      const s=Math.min(r.width/vb.width, r.height/vb.height);
      return JSON.stringify({x:r.left+(r.width-s*vb.width)/2+(100.5-vb.x)*s, y:r.top+(r.height-s*vb.height)/2+(100.5-vb.y)*s}); })()`);
    const qq = JSON.parse(q);
    await mouse('mousePressed', qq.x, qq.y); await mouse('mouseReleased', qq.x, qq.y);
    await sleep(200);
    ok(await ev('sel') === 0, '缩放平移后仍点得中块', await ev('sel'));
    // 换关就复位
    await ev(`loadLevel({name:'小',w:6,h:6,pieces:[],goals:[]})`);
    await sleep(200);
    ok(await ev('JSON.stringify(view)') === '{"z":1,"x":0,"y":0}', '换关后视口复位');
  }

  console.log('\n[9] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed' : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
