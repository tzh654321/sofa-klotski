const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs, send = b.send;
  await sleep(900);
  await ev('(function(){ loadLevel({name:"正圆",w:8,h:8,pieces:[{id:"s1",x:2,y:2,shape:"semi",ori:0,name:"下",color:"#3f48cc"},{id:"s2",x:2,y:3,shape:"semi",ori:2,name:"上",color:"#ed1c24"}],goals:[]});' +
    ' document.querySelector(\'#tabs [data-mode="play"]\').click(); })()');
  await sleep(300);
  const px = async (cx, cy) => JSON.parse(await ev('(function(){ const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;' +
    ' return JSON.stringify({x:r.left+(' + cx + '-vb.x)/vb.width*r.width, y:r.top+(' + cy + '-vb.y)/vb.height*r.height}); })()'));
  const mouse = (t, x, y) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: t === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const drag = async (from, to, n) => {
    const a = await px(from[0], from[1]), z = await px(to[0], to[1]);
    await mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= (n || 8); i++) { await mouse('mouseMoved', a.x + (z.x - a.x) * i / (n || 8), a.y + (z.y - a.y) * i / (n || 8)); await sleep(20); }
    await mouse('mouseReleased', z.x, z.y); await sleep(150);
  };
  console.log('起始', await ev('JSON.stringify({p:[st[0],st[1]],ov:overlapInfo().total,playable:playable()})'));
  await drag([2.5, 2.5], [4.5, 2.5], 8);
  console.log('拖蓝半圆向右', await ev('JSON.stringify({p:[st[0],st[1]],ov:overlapInfo().total,hands,sel})'));
  await drag([3.5, 3.5], [3.5, 5.5], 8);
  console.log('再拖红半圆向下', await ev('JSON.stringify({p:[st[0],st[1]],ov:overlapInfo().total,hands})'));
  console.log('errors', b.errors);
  b.close();
})();
