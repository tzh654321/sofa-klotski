const assert=require('assert/strict'),K=require('../sofa-klotski.js');
const raw={w:4,h:4,pieces:[{id:'a',x:0,y:0,w:1,h:1},{id:'b',x:1,y:0,w:1,h:1}]};const L=K.parse(raw),s=K.initialState(raw),key=K.makeKeyer(L);
assert.equal(key(s),key([s[1],s[0]]));const tagged=K.makeKeyer(L,['a','b']);assert.notEqual(tagged(s),tagged([s[1],s[0]]));
const keys=new Set();for(let a=0;a<16;a++)for(let b=0;b<16;b++){if(a===b)continue;const k=tagged([{x:a%4,y:a>>2,ori:0},{x:b%4,y:b>>2,ori:0}]);assert(!keys.has(k));keys.add(k);}
L.pieces[1].chainOnly=true;const behavioral=K.makeKeyer(L);assert.notEqual(behavioral(s),behavioral([s[1],s[0]]));
assert.notEqual(tagged([{x:4,y:0,ori:0},s[1]]),tagged([{x:0,y:1,ori:0},s[1]]));console.log('紧凑键：全部240个带身份双块状态无碰撞，等价/目标/行为及越界回退通过');
