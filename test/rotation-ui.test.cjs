const {launch,sleep}=require('./cdp');const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const b=await launch(path.join(__dirname,'../index.html'));try{
 const result=await b.evalJs(`(()=>{loadLevel({name:'旋转回归',w:7,h:7,pieces:[{id:'s',x:2,y:2,cells:[[0,0],[0,1],[0,2]],art:'sofa',open:0,rot:'sofa',nodedup:true,name:'沙发'}],goals:[]}); const before=st;const mv=K.moves(L,st).find(m=>m.t==='r'); if(!mv)throw Error('无旋转动作');st=K.apply(st,mv);playMoveAll(before,1000,mv);anim.t0=performance.now()-500;render();return {count:gPieces.querySelectorAll('path').length,tf:gPieces.querySelector('path').getAttribute('transform')};})()`);
 assert(result.count>0);assert(!result.tf.includes('NaN'));await sleep(700);assert.equal(await b.evalJs('anim===null'),true);assert.deepEqual(b.errors,[]);console.log('Chrome 实际页面旋转动画通过',result);
 }finally{b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
