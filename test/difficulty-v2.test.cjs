const assert=require('node:assert/strict'),K=require('../sofa-klotski.js');
function analyze(raw,cap=30000){const l=K.parse(raw),r=K.analyze(l,K.initialState(raw),raw.goals,{maxNodes:cap});return {r,d:K.difficulty(r)};}
const reports=[];
for(const size of [3,5,8]){
 const a=analyze({w:size,h:size,pieces:[{id:'a',x:0,y:0,w:1,h:1}],goals:[{piece:'a',cells:[[size-1,size-1]]}]});
 assert(a.d.score<10);reports.push({case:'空盘直拖'+size,score:a.d.score,states:a.r.states,hands:a.r.hands});
}
function rooms(extra){return {w:5,h:3,pieces:[{id:'a',x:0,y:0,w:1,h:1},{id:'wall',x:2,y:0,w:1,h:3,lock:true},...(extra?[{id:'b',x:3,y:0,w:1,h:1}]:[])],goals:[{piece:'a',cells:[[1,2]]}]};}
const a=analyze(rooms(false)),b=analyze(rooms(true));assert.equal(a.d.score,b.d.score);assert(b.r.states>a.r.states);reports.push({case:'无关房间',before:a.d.score,after:b.d.score,states:[a.r.states,b.r.states]});
const cut=analyze({w:3,h:3,pieces:[{id:'a',x:0,y:0,w:1,h:1},{id:'b',x:2,y:0,w:1,h:1}],goals:[{piece:'a',cells:[[2,2]]}]},1);assert(cut.r.truncated);assert(cut.d.estimated);assert(cut.d.score<10);assert(cut.r.estimate && !cut.r.estimate.optimal);
const base={depth:60,hands:35,states:10,paths:1,cognition:{active:5,revisits:15,retreats:3,maxSetup:8,temptation:12,measured:true}};
assert.equal(K.difficulty(base).score,K.difficulty({...base,states:1e12,paths:1e100}).score);
assert(K.difficulty(base).score>K.difficulty({...base,cognition:{active:1,measured:true}}).score);
const saturated=K.difficulty({depth:10000,hands:10000,cognition:{active:1000,revisits:10000,retreats:10000,maxSetup:10000,temptation:10000,measured:true}});
assert(saturated.score>80 && saturated.score<100);
assert.equal(saturated.version,3);
assert.equal(saturated.parts.depth+saturated.parts.planning+saturated.parts.choice,80);
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
console.log(JSON.stringify(reports,null,2));console.log('难度v2反例回归通过');
