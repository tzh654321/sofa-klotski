const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const K=require('../sofa-klotski.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
// 编译整个内联脚本，防止中断编辑留下语法错误。
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
const source=html.slice(html.indexOf('function animationPose('),html.indexOf('\nfunction render()',html.indexOf('function animationPose(')));
const ctx={lerp:(a,b,t)=>a+(b-a)*t};vm.createContext(ctx);vm.runInContext(source,ctx);
const e={from:{x:1,y:1,w:2,h:1},to:{x:2,y:1,w:1,h:2},degFrom:0,degTo:90,pivot:{x:2,y:2},drift:[0,0]};
for(const t of [0,.25,.5,.75,1]){
 const p=ctx.animationPose(e,t);assert.equal(p.box.w,1);assert.equal(p.box.h,2);
 // 目标半圆局部圆心(0,1)经动画变换，必须恒为世界圆心(2,2)。
 const a=p.artDeg*Math.PI/180,cx=p.box.x+.5,cy=p.box.y+1;
 assert(Math.abs(cx-.5*Math.cos(a)-2)<1e-10);
 assert(Math.abs(cy-.5*Math.sin(a)-2)<1e-10);
}
const sofa={id:'s',x:2,y:2,cells:[[0,0],[0,1],[0,2]],art:'sofa',open:0,rot:'sofa',nodedup:true};
const raw={w:7,h:7,pieces:[sofa]},L=K.parse(raw),s=K.initialState(raw);
const turns=K.moves(L,s).filter(m=>m.t==='r');assert(turns.length>0);
for(const m of turns){const next=K.apply(s,m);assert(K.moves(L,next).some(r=>r.t==='r'&&r.d===-m.d&&r.x===s[0].x&&r.y===s[0].y&&r.ori===s[0].ori));}
const edge={w:4,h:5,pieces:[{...sofa,x:0,y:2}]},LE=K.parse(edge),se=K.initialState(edge);
assert(K.moves(LE,se).some(m=>m.t==='r'));
vm.runInContext(html.slice(html.indexOf('function sofaDragIntent('),html.indexOf('let drag = null;')),ctx);
for(let ori=0;ori<4;ori++){
 const pose={x:2,y:2,ori},o=L.pieces[0].oris[ori],a=ori*Math.PI/2,u=[Math.round(Math.cos(a)),Math.round(Math.sin(a))];
 for(const [zone,expected] of [[-1,1],[0,0],[1,-1]]) {
  const x=2+o.w/2-zone*u[1],y=2+o.h/2+zone*u[0];
  assert.equal(ctx.sofaDragIntent(L.pieces[0],pose,x,y,u[0]*.6,u[1]*.6),expected);
 }
}
assert(!html.includes('chkSweep'));
console.log('旋转回归通过：固定圆心、网格落点、四朝向三区拖动、无严格物理选项');
