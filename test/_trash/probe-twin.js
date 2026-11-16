const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  console.log(await ev('(function(){' +
    ' loadLevel({name:"t",w:8,h:8,pieces:[{id:"s1",x:2,y:2,shape:"semi",ori:0},{id:"s2",x:2,y:2,shape:"semi",ori:2}],goals:[]});' +
    ' const a=K.sectorOf(L,st,0), c=K.sectorOf(L,st,1);' +
    ' return JSON.stringify({a,c,cells0:K.pieceCells(L,st,0),cells1:K.pieceCells(L,st,1),twin:isTwinPair(0,1),ov:overlapInfo(),playable:playable()});' +
    '})()'));
  b.close();
})();
