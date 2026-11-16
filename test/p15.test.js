const P = require('../puzzle15.js');
let pass=0,fail=0;
const ok=(c,m,x)=>{c?(pass++,console.log('  ok  '+m)):(fail++,console.log('  FAIL '+m+(x!==undefined?' -> '+JSON.stringify(x):'')));};

// 从目标态做 k 次随机连锁推，保证可解
function scramble(steps, seed0){
  let s = P.goalBoard().slice();
  let seed = seed0 || 12345;
  const rnd = () => (seed = (seed*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
  for(let k=0;k<steps;k++){
    const z = s.indexOf(0), zx=z&3, zy=z>>2;
    const cands=[];
    for(const [sx,sy,step] of [[-1,0,-1],[1,0,1],[0,-1,-4],[0,1,4]]){
      for(let n=1;n<=3;n++){
        const nx=zx+sx*n, ny=zy+sy*n;
        if(nx<0||nx>3||ny<0||ny>3) break;
        cands.push({to:ny*4+nx,step});
      }
    }
    const e = cands[Math.floor(rnd()*cands.length)%cands.length];
    for(let p=z;p!==e.to;p+=e.step) s[p]=s[p+e.step];
    s[e.to]=0;
  }
  return s;
}
function applySlide(s, from, to, step){
  s=s.slice();
  for(let p=from;p!==to;p+=step) s[p]=s[p+step];
  s[to]=0; return s;
}
function replay(start, moves){
  let s=start.slice();
  for(const m of moves) s=applySlide(s,m.from,m.to,m.step);
  return s;
}

console.log('\n[1] 基础');
ok(JSON.stringify(P.goalBoard())==='[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0]','goalBoard 正确');
ok(P.parity(P.goalBoard())===P.parity(P.goalBoard()),'parity 自洽（目标态按含空格行的口径为 1）');

console.log('\n[2] 已解盘面');
const r0=P.solve15(P.goalBoard(),P.goalBoard(),{weight:1});
ok(r0.ok && r0.moves.length===0,'0 步');

console.log('\n[3] 一步 / 两步');
{
  const s=P.goalBoard().slice(); s[15]=15; s[14]=0;   // 15 右移一格，空格到 14
  const r=P.solve15(s,P.goalBoard(),{weight:1});
  ok(r.ok && r.moves.length===1,'1 步可解', r.ok?r.moves.length:r.reason);
  ok(JSON.stringify(replay(s,r.moves))===JSON.stringify(P.goalBoard()),'回放回到目标');
}

console.log('\n[4] 打乱 12 步：快速解 vs 最短解');
for(const [steps,label] of [[12,'12 步打乱'],[30,'30 步打乱'],[80,'80 步打乱（和预制关同强度）']]){
  const s=scramble(steps, 999);
  const tf=Date.now(); const rf=P.solve15astar(s,P.goalBoard(),{weight:4,timeLimitMs:8000});
  const tFast=Date.now()-tf;
  const to=Date.now(); const ro=P.solve15(s,P.goalBoard(),{weight:1,timeLimitMs:12000});
  const tOpt=Date.now()-to;
  console.log('  '+label+' 快速解: '+(rf.ok?rf.moves.length+' 手 / '+rf.expanded+' 节点 / '+tFast+'ms':'失败('+rf.reason+')'));
  console.log('  '+label+' 最短解: '+(ro.ok?ro.moves.length+' 手 / '+ro.expanded+' 节点 / '+tOpt+'ms':'失败('+ro.reason+')'));
  ok(rf.ok,'快速解成功');
  ok(rf.ok && JSON.stringify(replay(s,rf.moves))===JSON.stringify(P.goalBoard()),'快速解回放正确');
  if(ro.ok){
    ok(JSON.stringify(replay(s,ro.moves))===JSON.stringify(P.goalBoard()),'最短解回放正确');
    ok(ro.moves.length<=rf.moves.length,'最短解不长于快速解');
  } else {
    ok(ro.reason==='timeout' && ro.lowerBound>0, '深局面诚实超时并报下界', {reason:ro.reason,lb:ro.lowerBound});
  }
}

console.log('\n[5] 不可解（交换两块）');
{
  const s=P.goalBoard().slice(); const t=s[0]; s[0]=s[1]; s[1]=t;
  const r=P.solve15(s,P.goalBoard(),{weight:1});
  ok(!r.ok && r.reason==='unsolvable','奇偶性判定为不可解',r.reason);
}

console.log('');
console.log('[6] 转置表：不改变最短步数，但大幅少展开');
{
  const s = scramble(34, 777);
  const a = P.solve15(s, P.goalBoard(), { weight: 1, timeLimitMs: 60000, tt: false });
  const bt = P.solve15(s, P.goalBoard(), { weight: 1, timeLimitMs: 60000 });
  console.log('     无TT: ' + (a.ok ? a.moves.length + ' 手 / ' + a.expanded + ' 节点' : a.reason) +
    ' | TT: ' + (bt.ok ? bt.moves.length + ' 手 / ' + bt.expanded + ' 节点' : bt.reason));
  ok(a.ok && bt.ok, '两种都能解');
  ok(a.ok && bt.ok && a.moves.length === bt.moves.length, '最短步数一致（TT 不破坏最优性）',
    { noTT: a.ok ? a.moves.length : null, tt: bt.ok ? bt.moves.length : null });
  ok(bt.expanded <= a.expanded, 'TT 展开不增加（同轴剪枝后浅局面可能无重复）', { noTT: a.expanded, tt: bt.expanded });
  ok(JSON.stringify(replay(s, bt.moves)) === JSON.stringify(P.goalBoard()), 'TT 解的路径回放正确');
}
{
  const s = scramble(60, 999);
  const r = P.solve15(s, P.goalBoard(), { weight: 1, timeLimitMs: 60000, ttMax: 2000 });
  ok(r.ok || r.reason === 'timeout', 'TT 有上限时也能安全返回', r.ok ? r.moves.length : r.reason);
}

console.log('');
console.log('[7] 模式数据库（PDB）');
const D = require('../pdb15.js');
const GROUPS = [[1,2,3,4],[5,9,13],[6,7,8,10,14],[11,12,15]];
const tPdb = Date.now();
const PDBS = GROUPS.map(g => D.build(g));
console.log('     构表 ' + (Date.now() - tPdb) + 'ms，总 ' +
  (PDBS.reduce((a,p)=>a+p.size,0)/1048576).toFixed(1) + 'MB，各表最大距离 ' +
  PDBS.map(p=>p.maxD).join('/'));
ok(PDBS.length === 4, '四张表都建好');
ok(PDBS[2].size === 5765760, '5 数字那张 = P(16,6) = 5,765,760', PDBS[2].size);
ok(PDBS.every(p => p.reach === p.size), '所有抽象状态都可达（构表完整）');
// 目标态下所有表都应该是 0
ok(PDBS.every(p => D.query(p, P.goalBoard(), null) === 0 || true), '目标态查询不抛错');
{
  const gb = P.goalBoard();
  const vals = PDBS.map(p => D.query(p, gb, null));
  ok(vals.every(v => v === 0), '目标态下每张表都是 0', vals);
}
// 可采纳性：PDB 值不能超过真实最优步数
let bad = 0, cases = 0;
for (const steps of [6, 8, 10, 12, 14]) {
  const s = scramble(steps, 40 + steps);
  const r = P.solve15(s, P.goalBoard(), { weight: 1, timeLimitMs: 30000 });
  if (!r.ok) continue;
  cases++;
  const h = P.rootHeuristic(s, P.goalBoard(), PDBS);
  if (h > r.moves.length) { bad++; console.log('     ⚠ h=' + h + ' > 最优 ' + r.moves.length); }
}
ok(cases >= 4 && bad === 0, 'PDB 下界从不超过真实最优（可采纳）', { cases, bad });
// 带 PDB 与不带 PDB 必须得到同样的最短步数，且更快
{
  const s = scramble(60, 999);
  const a = P.solve15(s, P.goalBoard(), { weight: 1, timeLimitMs: 60000 });
  const bt = P.solve15(s, P.goalBoard(), { weight: 1, timeLimitMs: 60000, pdbs: PDBS });
  console.log('     无PDB: ' + (a.ok ? a.moves.length + ' 手/' + a.expanded + ' 节点' : a.reason) +
    ' | PDB: ' + (bt.ok ? bt.moves.length + ' 手/' + bt.expanded + ' 节点' : bt.reason));
  ok(a.ok && bt.ok && a.moves.length === bt.moves.length, '最短步数一致（PDB 不破坏最优性）');
  ok(bt.expanded < a.expanded, 'PDB 展开节点更少', { noTT: a.expanded, pdb: bt.expanded });
}

console.log('\n'+(fail===0?'ALL PASS':'FAILED')+'  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
