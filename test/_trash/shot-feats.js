const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs, send = b.send;
  await sleep(900);

  // 1) 列表 + 排序
  await ev(`curSet='全部'; lvSort='scoreDesc'; buildLevelList();`);
  await sleep(300);
  await ev(`document.querySelector('aside').scrollTop = 240`);
  await sleep(200);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'list-sort.png'));

  // 2) 框选（编辑态）
  await ev(`(function(){
    loadLevel({name:'框选演示',w:8,h:8,pieces:[
      {id:'a',x:1,y:1,shape:'2x2',name:'甲',color:'#3f48cc'},
      {id:'b',x:4,y:1,shape:'1x1',name:'乙',color:'#ed1c24'},
      {id:'c',x:2,y:4,shape:'1x2',name:'丙',color:'#22b14c'}],goals:[]});
    document.querySelector('#tabs [data-mode="edit"]').click();
  })()`);
  await sleep(500);
  const P = async (cx, cy) => JSON.parse(await ev('(function(){ const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;' +
    ' const s=Math.min(r.width/vb.width, r.height/vb.height);' +
    ' return JSON.stringify({x: r.left+(r.width-s*vb.width)/2+((' + cx + ')-vb.x)*s,' +
    ' y: r.top+(r.height-s*vb.height)/2+((' + cy + ')-vb.y)*s}); })()'));
  const a = await P(0.4, 0.4), z = await P(4.6, 2.6);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (z.x - a.x) * i / 10, y: a.y + (z.y - a.y) * i / 10, button: 'left', buttons: 1 });
    await sleep(20);
  }
  // 停在中途截图（能看到框选矩形）
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'box-select.png'));
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: z.x, y: z.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(300);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'box-select-done.png'));

  // 3) 缩放
  await ev(`(function(){ loadLevel({name:'缩放演示',w:60,h:60,pieces:[{id:'a',x:20,y:20,shape:'2x2',name:'大块',color:'#ffb03a'},{id:'b',x:30,y:30,shape:'1x1',name:'小点',color:'#22b14c'}],goals:[{piece:'a',cells:[[40,40]]}]}); document.querySelector('#tabs [data-mode="play"]').click(); })()`);
  await sleep(400);
  const mid = JSON.parse(await ev(`(function(){const r=svg.getBoundingClientRect();return JSON.stringify({x:r.left+r.width*0.4,y:r.top+r.height*0.4});})()`));
  for (let k = 0; k < 4; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: -120 }); await sleep(120); }
  await sleep(200);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'zoom.png'));
  console.log('view', await ev('JSON.stringify(view)'), 'errors', b.errors);
  b.close();
})();
