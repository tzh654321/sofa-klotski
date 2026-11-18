const fs=require('fs'),path=require('path'),p=path.join(__dirname,'../sofa-klotski.js');let s=fs.readFileSync(p,'utf8');const marker='  // 对可回放的候选解提取结构';const helper=`  /** 认知决策不等于鼠标松开次数：路口、推箱方向与重复套路分开统计。 */
  function pathDecisions(level, states, path) {
    const tokens = [], actors = new Set();
    let junctions = 0, pushes = 0, pushChanges = 0, lastPush = '', previousDir = '', turns = 0;
    for (let j=0;j<path.length;j++) {
      const m=path[j], ids=m.chain || m.ids || [m.i];
      actors.add(m.i);
      const dir=m.t==='r'||m.t==='cr'?'r'+m.d:(m.dx || 0)+','+(m.dy || 0);
      if (previousDir && dir!==previousDir) turns++;
      previousDir=dir;
      const pushed=ids.filter(i=>i!==m.i && (level.pieces[i].onceOnly || level.pieces[i].chainOnly));
      if(pushed.length){pushes++;const k=pushed.join(',')+':'+dir;if(k!==lastPush)pushChanges++;lastPush=k;}
      // 移动同一操作者时，扣除来路后仍有多个去向才是需判断的路口。
      const alternatives=new Set();
      for(const v of moves(level,states[j])) if(v.i===m.i){
        const ns=apply(states[j],v);
        if(j && ns.every((q,i)=>q.x===states[j-1][i].x&&q.y===states[j-1][i].y&&q.ori===states[j-1][i].ori))continue;
        alternatives.add(v.t+':'+(v.dx||0)+','+(v.dy||0)+':'+(v.d||0));
      }
      if(alternatives.size>1)junctions+=Math.log2(alternatives.size);
      // 同一块同方向长拖只形成一个操作符；重复序列按结构而不是状态位置去重。
      const token=m.i+':'+dir+':'+pushed.join(',');
      if(tokens[tokens.length-1]!==token)tokens.push(token);
    }
    const grams=new Set();
    for(let i=0;i+3<tokens.length;i++)grams.add(tokens.slice(i,i+4).join('|'));
    const novelty=tokens.length<40?1:Math.min(1,grams.size/Math.max(1,tokens.length-3));
    const movers=level.pieces.filter(p=>!p.lock&&!p.onceOnly&&!p.chainOnly).length;
    return {junctions,pushes,pushChanges,turns,sequenceNovelty:novelty,actionRuns:tokens.length,
      navigation: movers<=2 && level.pieces.some(p=>p.lock), boxPuzzle:pushes>0};
  }

`;if(!s.includes(marker))throw Error('missing');s=s.replace(marker,helper+marker).replace('switches,temptation,measured:false,proxy:true,maxPlateau}', 'switches,temptation,measured:false,proxy:true,maxPlateau,...pathDecisions(level,states,path)}');s=s.replace('      movesOut = mv;','      movesOut = mv;\n      const decisions = pathDecisions(level,pathStates,mv);').replace('decisions: 0, temptation: 0, measured: false };','decisions: 0, temptation: 0, measured: false, ...decisions };');fs.writeFileSync(p,s);
