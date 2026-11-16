const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  await ev('(function(){ loadLevel({name:"同格",w:8,h:8,pieces:[{id:"s1",x:2,y:2,shape:"semi",ori:0,color:"#3f48cc",name:"下"},{id:"s2",x:2,y:2,shape:"semi",ori:2,color:"#ed1c24",name:"上"}],goals:[]}); })()');
  await sleep(300);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'semi-same-cell.png'));
  await ev('(function(){ loadLevel({name:"错行",w:8,h:8,pieces:[{id:"s1",x:2,y:2,shape:"semi",ori:0,color:"#3f48cc",name:"下"},{id:"s2",x:2,y:3,shape:"semi",ori:2,color:"#ed1c24",name:"上"}],goals:[]}); })()');
  await sleep(300);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'semi-next-row.png'));
  console.log(await ev('JSON.stringify({s1:K.sectorOf(L,st,0)?K.sectorOf(L,st,0).center:null, s2:K.sectorOf(L,st,1)?K.sectorOf(L,st,1).center:null, ov:overlapInfo().total})'));
  console.log(await ev('JSON.stringify(K.moves(L,st).map(m=>[m.t,m.i,m.dx,m.dy]))'));
  b.close();
})();
