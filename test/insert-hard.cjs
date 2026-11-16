const fs=require('fs'),p=require('path').join(__dirname,'../sofa-klotski.js');let s=fs.readFileSync(p,'utf8');const marker='  function* analyzeGen(level, rawState, goal, opts) {';const helper=`  // 对可回放的候选解提取结构，不要求先证明最短。所有长度均为该候选路径的上界。
  function estimatePath(level, start, goal, path) {
    let state = start, last = -1, setup = 0, maxSetup = 0, retreats = 0, switches = 0;
    let plateau = 0, maxPlateau = 0, rebuilds = 0, previousH = heuristic(level, state, goal);
    const states = [state], active = new Set(), touchedBefore = new Set();
    let temptation = 0;
    const keyOf = makeKeyer(level, tagsFor(level, goal));
    for (let j = 0; j < path.length; j++) {
      const mv = path[j], legal = moves(level, state);
      const wanted = keyOf(apply(state, mv));
      if (!legal.some(m => keyOf(apply(state, m)) === wanted)) return null;
      const next = apply(state, mv), h = heuristic(level, next, goal);
      const newHand = mv.i !== last || !['m','p'].includes(mv.t);
      if (newHand) {
        switches++; active.add(mv.i);
        if (touchedBefore.has(mv.i)) rebuilds++;
        touchedBefore.add(mv.i);
        if (h > previousH) retreats++;
        if (h >= previousH) { plateau++; maxPlateau = Math.max(maxPlateau, plateau); }
        else plateau = 0;
        // 局部候选数仅作低权重代理，排除立即返回和不涉及解法的块后再计。
        const choices = new Set();
        for (const m of legal) if (m.i === mv.i) {
          const ns = apply(state,m), k = keyOf(ns);
          if (k !== wanted && (j === 0 || k !== keyOf(states[j-1])) && heuristic(level,ns,goal) <= previousH) choices.add(k);
        }
        temptation += Math.log2(1+choices.size);
      }
      if (h === previousH && newHand) { setup++; maxSetup=Math.max(maxSetup,setup); }
      else if (h !== previousH) setup=0;
      last=mv.i; previousH=h; state=next; states.push(state);
    }
    if (!isGoal(level,state,goal)) return null;
    return { steps:path.length, hands:handsOf(level,states,path).length, moves:path,
      cognition:{active:active.size,revisits:rebuilds,retreats,maxSetup,
        switches,temptation,measured:false,proxy:true,maxPlateau}, optimal:false };
  }

`;if(!s.includes(marker))throw Error('标记不存在');s=s.replace(marker,helper+marker);fs.writeFileSync(p,s);
