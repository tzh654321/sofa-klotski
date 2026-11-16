const K=require('../sofa-klotski.js');
const {resolve}=require('../shapes.js');
const raw=resolve({name:'层层设卡',w:4,h:5,pieces:[
 {id:'hero',x:1,y:0,shape:'2x2',name:'草丛',hero:true},
 {id:'sofa',x:3,y:0,shape:'sofa',name:'沙发',ori:2},
 {id:'b1',x:0,y:2,shape:'2x1',name:'横条1'},
 {id:'b2',x:0,y:4,shape:'2x1',name:'横条2'},
 {id:'b3',x:1,y:3,shape:'2x1',name:'横条3'},
 {id:'b4',x:3,y:3,shape:'1x2',name:'竖条4'},
 {id:'z1',x:0,y:3,shape:'1x1',name:'卒1'},
 {id:'z2',x:0,y:0,shape:'1x1',name:'卒2'},
 {id:'z3',x:2,y:4,shape:'1x1',name:'卒3'}],
 goals:[{piece:'hero',label:'底行正中',cells:[[1,3],[2,3],[1,4],[2,4]]}]});
const L=K.parse(raw), st=K.initialState(raw);
const used=new Map(); let bad=0;
for(let i=0;i<L.pieces.length;i++) for(const [c,r] of K.pieceCells(L,st,i)){
  if(c<0||r<0||c>=L.w||r>=L.h){bad++;continue;}
  const k=c+','+r; if(used.has(k))bad++; else used.set(k,L.pieces[i].id);
}
console.log('占格',used.size,'问题',bad,'空',L.w*L.h-used.size, '沙发', JSON.stringify(K.pieceCells(L,st,1)));
const t=Date.now();
const a=K.analyze(L,st,raw.goals,{maxNodes:400000});
const d=K.difficulty(a);
const it=a.interference||{};
console.log(a.depth+'步/'+a.hands+'手', a.states+'态', 'paths',a.paths, 'waste',it.waste,'same',it.same,
  ((Date.now()-t)/1000).toFixed(1)+'s');
console.log('难度', d?d.score+' '+d.grade+' '+JSON.stringify(d.parts):'null');
console.log("    cengCengSheKa: { score: "+(d&&d.score)+", grade: '"+(d&&d.grade)+"', depth: "+a.depth+
  ', hands: '+a.hands+', states: '+a.states+', paths: '+a.paths+', waste: '+it.waste+', same: '+it.same+' },');
