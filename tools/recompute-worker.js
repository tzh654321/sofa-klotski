/* 重算一关的难度与解法，写回 json（由 tools/recompute.js 派活；一次只接一个任务）
 *   IPC：{ file, cap } → { ok, file, name, meta }
 */
const fs = require('fs');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');

process.on('message', job => {
  const t0 = Date.now();
  try {
    const rec = JSON.parse(fs.readFileSync(job.file, 'utf8'));
    const lv = rec.level || {};
    const goals = lv.goals || [];
    if (!goals.length || !lv.pieces || !lv.pieces.length) {
      rec.meta = rec.meta || null;
      process.send({ ok: true, file: job.file, name: rec.name, meta: rec.meta, note: '无目标，跳过' });
      return;
    }
    const raw = SH.resolve(JSON.parse(JSON.stringify(lv)));
    const L = K.parse(raw), st = K.initialState(raw);
    const cap = job.cap || 900000;
    let res = null;
    try { res = K.analyze(L, st, raw.goals, { maxNodes: cap, candidateMoves: rec.solution && rec.solution.moves }); } catch (e) { res = null; }

    let meta = null, sol = null;
    if (res) {
      const d = K.difficulty(res);
      meta = {
        score: d ? d.score : null, grade: d ? d.grade : null,
        depth: res.depth > 0 ? res.depth : null,
        // 证不出最短解时（res.estimate 那套），手数用参考估算的手数，别留 null —— 分数就是从它算的
        hands: res.hands > 0 ? res.hands : (res.estimate ? res.estimate.hands : null),
        states: res.states, paths: res.paths,
        waste: res.interference ? res.interference.waste : null,
        same: res.interference ? res.interference.same : null,
        estimated: !!(res.truncated || (d && d.estimated)),
        scoringVersion: 3, estimate: res.estimate ? { ...res.estimate, moves: undefined } : null,
        parts: d ? d.parts : null,
        version: d ? (d.version || null) : null,      // 评分算法版本（2 = 认知结构那套）
        unsolved: d ? !!d.unsolved : null,            // true = 没证出最短解，分数是按参考解估的
        confidence: d ? d.confidence : null,           // 面板/悬停里直接显示这句
        cognition: res.cognition ? {
          active: res.cognition.active, switches: res.cognition.switches,
          revisits: res.cognition.revisits, retreats: res.cognition.retreats,
          maxSetup: res.cognition.maxSetup,
          temptation: +(+res.cognition.temptation).toFixed(2)
        } : null,
        ms: Date.now() - t0
      };
      if (res.estimate) sol = {solver:'budget-estimate',optimal:false,steps:res.estimate.steps,
        hands:res.estimate.hands,moves:res.estimate.moves};
      if (res.moves && res.moves.length) {
        // 手数直接用 analyze 算好的（它做过「关键点二次合并」），别再用 mergeMoves 重算 —— 会差 1~2 手
        sol = {
          solver: 'bfs-optimal', optimal: true,
          steps: res.moves.length,
          hands: res.hands != null ? res.hands : K.mergeMoves(res.moves).length,
          moves: res.moves
        };
      }
    }
    // 分析被截断/没找到解时，退一步用加权 A* 保一份"参考解法"，别把旧解法弄丢
    if (!sol) {
      const q = K.quickSolve(L, st, raw.goals, { maxNodes: 1500000, weight: 6 });
      if (q && q.ok) {
        sol = {
          solver: 'quick-A*', optimal: false,
          steps: q.moves.length, hands: K.mergeMoves(q.moves).length, moves: q.moves
        };
      }
    }
    rec.meta = meta;
    rec.solution = sol;
    fs.writeFileSync(job.file, JSON.stringify(rec, null, 1) + '\n', 'utf8');
    process.send({ ok: true, file: job.file, name: rec.name, meta, sol: !!sol, ms: Date.now() - t0 });
  } catch (e) {
    process.send({ ok: false, file: job.file, err: String((e && e.message) || e), ms: Date.now() - t0 });
  }
});
