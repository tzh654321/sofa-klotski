const {launch}=require('./cdp'),path=require('path'),assert=require('assert/strict');
(async()=>{const b=await launch(path.join(__dirname,'../index.html'));try{
const result=await b.evalJs(`(()=>{loadLevel({name:'预算估算回归',w:3,h:3,pieces:[{id:'a',x:0,y:0,w:1,h:1},{id:'b',x:2,y:0,w:1,h:1}],goals:[{piece:'a',cells:[[2,2]]}]});const r=K.analyze(L,K.initialState(raw),raw.goals,{maxNodes:1});showDiffResult(r,K.difficulty(r),r.ms);const cached=cacheGet();applyCached();return {score:document.getElementById('dfScore').textContent,depth:document.getElementById('dfDepth').textContent,optimal:cached.solved.optimal,estimate:!!cached.detail.estimate,msg:document.getElementById('dfMsg').textContent};})()`);
assert(result.score.includes('估算'));assert(result.depth.includes('未证明最短'));assert.equal(result.optimal,false);assert(result.estimate);assert(result.msg.includes('长程调度'));assert.deepEqual(b.errors,[]);console.log(result);
}finally{b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
