// 独立反向 BFS 校验最短性；固定种子基准比较优化前后。
const assert = require('node:assert/strict');
const P = require('../puzzle15.js');
const B = require('./puzzle15-baseline.cjs');
const goal = P.goalBoard();
function edges(s, chain=true) {
  const z=s.indexOf(0), out=[];
  for(let to=0;to<16;to++) {
    if(to===z || ((to>>2)!==(z>>2) && (to&3)!==(z&3))) continue;
    const step=(to>>2)===(z>>2)?Math.sign(to-z):4*Math.sign(to-z);
    if(!chain && to!==z+step) continue;
    const b=s.slice(); for(let p=z;p!==to;p+=step)b[p]=b[p+step]; b[to]=0; out.push(b);
  } return out;
}
function replay(s,r) {
  assert(r.ok); s=s.slice();
  for(const m of r.moves){assert.equal(s[m.from],0);assert(edges(s).some(b=>{const a=s.slice();for(let p=m.from;p!==m.to;p+=m.step)a[p]=a[p+m.step];a[m.to]=0;return a.join()==b.join();}));for(let p=m.from;p!==m.to;p+=m.step)s[p]=s[p+m.step];s[m.to]=0;}
  assert.deepEqual(s,goal);
}
// 单轮/部分根分支只能报告找到解，不能自行认证全局最优。
assert.equal(P.solve15(goal,goal,{oneBound:20}).optimal,false);
assert.equal(P.solve15(goal,goal,{rootOnly:[0]}).optimal,false);
for(const chain of [true,false]) {
 const q=[[goal,0]], seen=new Set([goal.join()]);
 for(let i=0;i<q.length;i++) {
  const [s,d]=q[i];
  for(const tt of [true,false]) {const r=P.solve15(s,goal,{chain,tt,timeLimitMs:5000});assert.equal(r.moves?.length,d);replay(s,r);}
  if(d===5)continue;
  for(const b of edges(s,chain))if(!seen.has(b.join())){seen.add(b.join());q.push([b,d+1]);}
 }
 console.log('BFS 校验',chain?'连锁':'单格',q.length,'盘面通过');
}
let seed=918273;
function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
function shuffled(){const s=goal.slice();for(let i=15;i>0;i--){const j=rnd(i+1);[s[i],s[j]]=[s[j],s[i]];}if(P.parity(s)!==P.parity(goal)){const a=s.indexOf(1),b=s.indexOf(2);[s[a],s[b]]=[s[b],s[a]];}return s;}
const results=[];
for(let i=0;i<6;i++) {
 let s=goal.slice();if(i<3){for(let j=0;j<35+5*i;j++){const e=edges(s);s=e[rnd(e.length)];}}else s=shuffled();
 const row={case:i,kind:i<3?'随机游走':'随机排列',board:s};
 for(const [name,solver] of [['before',B],['after',P]]) {const r=solver.solve15(s,goal,{timeLimitMs:3000});if(r.ok)replay(s,r);row[name]={ok:r.ok,steps:r.moves?.length,expanded:r.expanded,ms:r.ms,lowerBound:r.lowerBound};}
 if(row.before.ok&&row.after.ok)assert.equal(row.before.steps,row.after.steps);
 results.push(row);console.log(JSON.stringify(row));
}
require('node:fs').writeFileSync(require('node:path').join(__dirname,'p15-benchmark.json'),JSON.stringify(results,null,2));
console.log('全部通过');
