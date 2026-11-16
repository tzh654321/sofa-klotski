const fs=require('fs'),K=require('../../sofa-klotski.js'),{resolve}=require('../../shapes.js');
const raw=resolve(JSON.parse(fs.readFileSync('tools/inbox/hanoi-raw.json','utf8')));
const L=K.parse(raw),st=K.initialState(raw);
console.log('w/h',L.w,L.h,'pieces',L.pieces.length);
const used=new Map(),bad=[];
for(let i=0;i<L.pieces.length;i++)for(const [c,r] of K.pieceCells(L,st,i)){
  const k=c+','+r;
  if(c<0||r<0||c>=L.w||r>=L.h) bad.push([i,c,r,'out']);
  if(used.has(k)) bad.push([i,c,r,'overlap with '+used.get(k)]);
  used.set(k,i);
}
console.log('layout bad',bad.length,JSON.stringify(bad.slice(0,6)),'occupied',used.size);
console.log('goal',JSON.stringify(K.goalNorm(L,raw.goals[0])&&{kind:K.goalNorm(L,raw.goals[0]).kind,need:K.goalNorm(L,raw.goals[0]).need,spots:K.goalNorm(L,raw.goals[0]).spots.length}));
console.log('isGoal at start',K.isGoal(L,st,raw.goals));
console.log('start moves',K.moves(L,st).length);
for(const cap of [100000,500000,2000000]){
  const t=Date.now();
  try{
    const s=K.solve(L,st,raw.goals,{maxNodes:cap});
    console.log('cap',cap,'=>',s.ok?s.moves.length+'步/'+K.mergeMoves(s.moves).length+'手':'NO '+s.reason,'visited',s.visited,(Date.now()-t)+'ms');
    if(s.ok){fs.writeFileSync('tools/inbox/hanoi-sol.json',JSON.stringify(s.moves));break;}
  }catch(e){console.log('cap',cap,'ERR',e.message,(Date.now()-t)+'ms');break;}
}
