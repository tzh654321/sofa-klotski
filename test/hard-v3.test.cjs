const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');const c={console};c.window=c;c.globalThis=c;vm.createContext(c);for(const f of ['sofa-klotski.js','shapes.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),c);const K=c.Klotski,rows=[];
// 按编号前缀找文件：关卡改名（如 31_思之弥艰 → 31_深度求索）不该让测试炸
// dir 传空串 = levels 根目录（「待分类」已经不是一个文件夹了）
const findByNo=(dir,no)=>{const p=path.join(__dirname,'../levels',dir||'');
 // 关卡集里允许再套子文件夹（如 华容之书/半圆最长），逐层找；返回相对 levels 的路径
 const look=(d,rel)=>{for(const x of fs.readdirSync(d)){const q=path.join(d,x);
   if(fs.statSync(q).isDirectory()){const r=look(q,rel?rel+'/'+x:x);if(r)return r;continue;}
   if(x.startsWith(no)&&x.endsWith('.json')&&x[0]!=='_')return rel?rel+'/'+x:x;}return null;};
 const f=look(p,'');
 if(!f)throw new Error('找不到 '+(dir||'levels')+'/'+no+'*.json');return (dir?dir+'/':'')+f;};
for(const file of [findByNo('华容之书','17_'),findByNo('华容之书','31_'),findByNo('','07_')]){
 const e=JSON.parse(fs.readFileSync(path.join(__dirname,'../levels',file))),raw=c.resolveShapes(e.level),L=K.parse(raw),s=K.initialState(raw),t=Date.now();
 const r=K.analyze(L,s,raw.goals,{maxNodes:20000,estimateNodes:100000,candidateMoves:e.solution?.moves}),d=K.difficulty(r);
 assert(d && d.version===3 && d.estimated && d.score<100);assert(r.estimate);assert.equal(r.depth,-1);assert.equal(r.estimate.optimal,false);
 rows.push({name:e.name,score:d.score,parts:d.parts,states:r.states,steps:r.estimate.steps,hands:r.estimate.hands,cognition:r.estimate.cognition,ms:Date.now()-t});console.log(JSON.stringify(rows.at(-1)));
}
assert.notEqual(rows[0].score,rows[1].score);
const long=n=>K.difficulty({depth:n,hands:n,cognition:{active:8,revisits:n,retreats:100,maxSetup:100,temptation:1000,measured:true}}).score;
assert(long(500)>long(200));assert(long(2000)>long(500));
fs.writeFileSync(path.join(__dirname,'hard-v3-results.json'),JSON.stringify(rows,null,2));console.log('v3高难长尾与预算估算通过');
