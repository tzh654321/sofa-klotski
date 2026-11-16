const path = require('path');
const { launch, sleep } = require('../cdp.js');

(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  const send = b.send;
  await sleep(900);

  const setup = async lv => ev('(function(){ loadLevel(' + JSON.stringify(lv) + ');' +
    ' document.querySelector(\'#tabs [data-mode="play"]\').click();' +
    ' return JSON.stringify({w:L.w,h:L.h}); })()');

  const px = async (cx, cy) => JSON.parse(await ev('(function(){' +
    ' const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;' +
    ' return JSON.stringify({x: r.left + (' + cx + ' - vb.x) / vb.width * r.width,' +
    ' y: r.top + (' + cy + ' - vb.y) / vb.height * r.height, vb:[vb.x,vb.y,vb.width,vb.height], box:[r.left,r.top,r.width,r.height]});' +
    '})()'));

  const mouse = (type, x, y, extra) => send('Input.dispatchMouseEvent',
    Object.assign({ type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, extra || {}));

  const drag = async (from, to, steps) => {
    const a = await px(from[0], from[1]), z = await px(to[0], to[1]);
    await mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= (steps || 8); i++) {
      await mouse('mouseMoved', a.x + (z.x - a.x) * i / (steps || 8), a.y + (z.y - a.y) * i / (steps || 8));
      await sleep(20);
    }
    await mouse('mouseReleased', z.x, z.y);
    await sleep(120);
  };

  console.log('--- A. 双半圆（同格）拖动那半 ---');
  await setup({ name: '双半圆', w: 8, h: 8, pieces: [
    { id: 's1', x: 2, y: 2, shape: 'semi', ori: 0 },
    { id: 's2', x: 2, y: 2, shape: 'semi', ori: 2 }], goals: [] });
  console.log('起始', await ev('JSON.stringify({p:[st[0],st[1]], ov:overlapInfo().total, playable:playable()})'));
  await drag([2.5, 2.1], [4.5, 2.1], 10);
  console.log('拖到右边 2 格后', await ev('JSON.stringify({p:[st[0],st[1]], ov:overlapInfo().total, playable:playable()})'));

  console.log('--- B. 一次拖动走 L 形 ---');
  await setup({ name: 'L路', w: 8, h: 8, pieces: [{ id: 'a', x: 1, y: 1, shape: '1x1' }], goals: [] });
  const a1 = await px(1.5, 1.5), a2 = await px(4.5, 1.5), a3 = await px(4.5, 4.5);
  await mouse('mousePressed', a1.x, a1.y);
  for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', a1.x + (a2.x - a1.x) * i / 6, a1.y); await sleep(16); }
  for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', a2.x, a2.y + (a3.y - a2.y) * i / 6); await sleep(16); }
  await mouse('mouseReleased', a3.x, a3.y); await sleep(120);
  console.log('终点', await ev('JSON.stringify({pos:[st[0].x,st[0].y], hands})'));

  console.log('--- C. 1000×1000 画布能不能点到块 ---');
  await setup({ name: '大画布', w: 1000, h: 1000, pieces: [{ id: 'a', x: 500, y: 500, shape: '1x1' }], goals: [] });
  console.log('svg 尺寸', await ev('JSON.stringify((function(){const r=svg.getBoundingClientRect();return {w:r.width,h:r.height,vb:[svg.viewBox.baseVal.width,svg.viewBox.baseVal.height]}})())'));
  const big = await px(500.5, 500.5);
  console.log('格子屏幕坐标', JSON.stringify({ x: Math.round(big.x), y: Math.round(big.y), box: big.box }));
  await mouse('mousePressed', big.x, big.y);
  await mouse('mouseReleased', big.x, big.y);
  console.log('选中 sel =', await ev('sel'));

  console.log('errors', b.errors);
  b.close();
})();
