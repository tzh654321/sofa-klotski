const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  // 合成 8×8：中间一个斜半圆，四周空
  console.log(await ev(`(function(){
    loadLevel({name:'斜半圆测试',w:8,h:8,pieces:[{id:'d1',x:3,y:3,shape:'diagSemi'}],goals:[]});
    const ms=K.moves(L,st).filter(m=>m.t==='r'||m.t==='cr');
    return JSON.stringify({rot:ms.length, rotPlay:L.pieces[0].rotPlay, tryTurn:tryTurn(0,1), ori:st[0].ori});
  })()`));
  // 两个半圆同心 → 整圆，能否单独平移
  console.log(await ev(`(function(){
    loadLevel({name:'双半圆',w:8,h:8,pieces:[
      {id:'s1',x:2,y:2,shape:'semi',ori:0},
      {id:'s2',x:2,y:2,shape:'semi',ori:2}],goals:[]});
    const ms=K.moves(L,st);
    return JSON.stringify({n:ms.length, sample:ms.slice(0,8).map(m=>({t:m.t,i:m.i,ids:m.ids,dx:m.dx,dy:m.dy,d:m.d}))});
  })()`));
  console.log('errors', b.errors);
  b.close();
})();
