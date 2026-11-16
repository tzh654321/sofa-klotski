/* 关卡体检的工作线程：在主线程池里并行跑 analyze + solve
 *   （levels.test.js 用它把 9 个关卡的穷举摊到多核上，整体从 ~2 分钟压到 ~20 秒）
 */
const { parentPort, workerData } = require('worker_threads');
const { grade } = require('../tools/grade.js');

try {
  const g = grade(workerData.raw, { cap: workerData.cap || 1200000 });
  parentPort.postMessage({ ok: true, res: g.res, diff: g.diff, solve: g.solve, moves: g.moves, bad: g.bad });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String((e && e.stack) || e) });
}
