// 【已归档的一次性迁移脚本】只更新指定两关的 v3 估算元数据与参考解，不改变棋盘。
// 2026-11-15 之后这些数据已由 tools/recompute.js 全量重算覆盖，留着备查。
const fs=require('fs'),path=require('path'),K=require('../../sofa-klotski.js'),SH=require('../../shapes.js');
const dir=path.join(__dirname,'../../levels/华容之书');
for(const file of ['17_祭.json','31_思之弥艰.json']){
 const target=path.join(dir,file),e=JSON.parse(fs.readFileSync(target,'utf8')),raw=SH.resolve(e.level),L=K.parse(raw),s=K.initialState(raw);
 const r=K.analyze(L,s,raw.goals,{maxNodes:20000,estimateNodes:100000,candidateMoves:e.solution?.moves}),d=K.difficulty(r);
 if(!d||!r.estimate)throw Error('未取得可靠参考解 '+file);
 const {moves,...estimate}=r.estimate;
 e.meta={score:d.score,grade:d.grade,version:3,scoringVersion:3,revision:'long-tail-1',estimated:true,
  depth:null,hands:null,states:r.states,paths:0,parts:d.parts,estimate,cognition:estimate.cognition,
  budget:{analysisNodes:20000,estimateNodes:100000},ms:r.ms};
 e.solution={solver:'budget-estimate',optimal:false,steps:estimate.steps,hands:estimate.hands,moves};
 fs.writeFileSync(target,JSON.stringify(e,null,1)+'\n');
 console.log(e.name,d.score,estimate.steps,estimate.hands);
}
