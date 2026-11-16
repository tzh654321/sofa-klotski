const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs, send = b.send;
  await sleep(900);
  const P = async (cx, cy) => JSON.parse(await ev('(function(){' +
    ' const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;' +
    ' const s=Math.min(r.width/vb.width, r.height/vb.height);' +
    ' return JSON.stringify({x: r.left+(r.width-s*vb.width)/2+((' + cx + ')-vb.x)*s,' +
    ' y: r.top+(r.height-s*vb.height)/2+((' + cy + ')-vb.y)*s}); })()'));
  const mouse = (t, x, y) => send('Input.dispatchMouseEvent',
    { type: t, x, y, button: 'left', buttons: t === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  await ev(`(function(){
    loadLevel({name:'框选批量',w:10,h:10,pieces:[
      {id:'a',x:1,y:1,shape:'semi',color:'#db5243',name:'甲'},
      {id:'b',x:4,y:1,shape:'2x1',color:'#43db44',name:'乙'},
      {id:'c',x:7,y:1,shape:'1x1',color:'#4397db',name:'丙'},
      {id:'d',x:2,y:5,shape:'2x2',color:'#dbbf43',name:'丁'}],goals:[]});
    document.querySelector('#tabs [data-mode="edit"]').click();
  })()`);
  await sleep(400);
  const a = await P(0.3, 0.3);
  await mouse('mousePressed', a.x, a.y);
  for (let i = 1; i <= 8; i++) { const q = await P(0.3 + 8.4 * i / 8, 0.3 + 2.4 * i / 8); await mouse('mouseMoved', q.x, q.y); await sleep(16); }
  const z = await P(8.7, 2.7);
  await mouse('mouseReleased', z.x, z.y);
  await sleep(300);
  // 整组往右下一格，截图看高亮与面板
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'d',bubbles:true})), void 0`);
  await sleep(150);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',bubbles:true})), void 0`);
  await sleep(300);
  await ev(`document.querySelector('aside').scrollTop = 260; void 0`);
  await sleep(200);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'box-keys.png'));
  console.log('sel', await ev('selSet.size'), 'errors', b.errors);
  b.close();
})();
