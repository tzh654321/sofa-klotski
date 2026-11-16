const P=require('../puzzle15.js'),B=require('./puzzle15-baseline.cjs'),D=require('../pdb15.js'),assert=require('node:assert/strict');
const cases=require('./p15-benchmark.json');
const pdbs=[[1,2,3,4],[5,9,13],[6,7,8,10,14],[11,12,15]].map(t=>D.build(t));
const rows=[];
for(const c of cases.filter(c=>c.case>=2)){
 const row={case:c.case,board:c.board};
 for(const [name,solver] of [['before',B],['after',P]]){
  let bound;const r=solver.solve15(c.board,P.goalBoard(),{pdbs,timeLimitMs:5000,onIter:b=>bound=b});
  if(r.ok){const s=c.board.slice();for(const m of r.moves){assert.equal(s[m.from],0);for(let p=m.from;p!==m.to;p+=m.step)s[p]=s[p+m.step];s[m.to]=0;}assert.deepEqual(s,P.goalBoard());}
  row[name]={ok:r.ok,steps:r.moves?.length,ms:r.ms,expanded:r.expanded,bound};
 }
 if(row.before.ok&&row.after.ok)assert.equal(row.before.steps,row.after.steps);
 rows.push(row);console.log(JSON.stringify(row));
}
require('node:fs').writeFileSync(require('node:path').join(__dirname,'p15-pdb-benchmark.json'),JSON.stringify(rows,null,2));
