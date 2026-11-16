const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs, send = b.send;
  await sleep(900);
  console.log('页面错误', b.errors);

  // 视口：滚轮缩放 + 右键平移
  await ev('(function(){ loadLevel({name:"大画布",w:200,h:200,pieces:[{id:"a",x:100,y:100,shape:"1x1"}],goals:[]}); document.querySelector(\'#tabs [data-mode="play"]\').click(); })()');
  await sleep(400);
  const box = JSON.parse(await ev('(function(){const r=svg.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,r:[r.left,r.top,r.width,r.height]});})()'));
  console.log('初始 view', await ev('JSON.stringify(view)'));
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -120 });
  await sleep(200);
  console.log('滚轮后 view', await ev('JSON.stringify(view)'));
  // 右键拖动平移
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', buttons: 2, clickCount: 1 });
  for (let k = 1; k <= 6; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x - k * 12, y: box.y, button: 'right', buttons: 2 }); await sleep(16); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x - 72, y: box.y, button: 'right', buttons: 0, clickCount: 1 });
  await sleep(200);
  console.log('右键平移后 view', await ev('JSON.stringify(view)'));

  // 缩放后点块还能点中（坐标换算是否一致）
  const hit = await ev('(function(){ const r=svg.getBoundingClientRect(); const vb=svg.viewBox.baseVal;' +
    ' const s=Math.min(r.width/vb.width, r.height/vb.height);' +
    ' const X=r.left+(r.width-s*vb.width)/2+(100.5-vb.x)*s, Y=r.top+(r.height-s*vb.height)/2+(100.5-vb.y)*s;' +
    ' return JSON.stringify({X,Y}); })()');
  const p = JSON.parse(hit);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.X, y: p.Y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.X, y: p.Y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(200);
  console.log('缩放后点块 sel =', await ev('sel'));

  // 框选
  await ev('(function(){ loadLevel({name:"框选",w:8,h:8,pieces:[{id:"a",x:1,y:1,shape:"1x1",name:"甲"},{id:"b",x:3,y:3,shape:"1x1",name:"乙"},{id:"c",x:6,y:6,shape:"1x1",name:"丙"}],goals:[]}); document.querySelector(\'#tabs [data-mode="edit"]\').click(); })()');
  await sleep(400);
  const c0 = JSON.parse(await ev('(function(){const r=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal; const s=Math.min(r.width/vb.width,r.height/vb.height);' +
    ' return JSON.stringify({x0:r.left+(r.width-s*vb.width)/2, y0:r.top+(r.height-s*vb.height)/2, s});})()'));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c0.x0 + 0.5 * c0.s, y: c0.y0 + 0.5 * c0.s, button: 'left', buttons: 1, clickCount: 1 });
  for (let k = 1; k <= 8; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c0.x0 + (0.5 + k * 0.5) * c0.s, y: c0.y0 + (0.5 + k * 0.5) * c0.s, button: 'left', buttons: 1 }); await sleep(16); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c0.x0 + 4.5 * c0.s, y: c0.y0 + 4.5 * c0.s, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(250);
  console.log('框选到', await ev('JSON.stringify([...selSet])'), '面板', await ev('document.getElementById("selBoxInfo").textContent'));
  await ev('document.getElementById("btnBoxCopy").click()'); await sleep(300);
  console.log('复制后块数', await ev('raw.pieces.length'), 'ids', await ev('JSON.stringify(raw.pieces.map(p=>p.id))'));
  await ev('document.getElementById("btnBoxDel").click()'); await sleep(300);
  console.log('删除后块数', await ev('raw.pieces.length'));

  // 自绘连续放块
  await ev('(function(){ paintCells.fill(-1); paintW=8; paintH=8; brush=0; painting=true; lastPaintCell=null; paintLine(0); })()');
  console.log('paintLine 存在', await ev('typeof paintLine'));
  console.log('errors', b.errors);
  b.close();
})();
