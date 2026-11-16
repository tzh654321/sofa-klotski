/* 汉诺塔关卡专用求解：把「整盘搬动」当宏动作，绕开单格 BFS 的组合爆炸
 *
 *   node tools/solve-hanoi.js <关卡json> [--write]
 *
 * 结构：3 根柱位（由锁定柱右侧 + 左右边界确定）、N 个嵌套 U 形盘（按初始 y 从小到大 = 大到小）。
 * 经典递归 2^N-1 次宏搬动，每次宏搬动展开成「下到通道 → 横移 → 上到目标层」的单格走法，
 * 每一步都从引擎 K.moves() 里取，因此解一定能在引擎里原样回放。
 *
 * 这是**可证明的汉诺塔最优解**（在宏动作层面），但不是单格步数最短：
 * 页面/说明里要明确写「整盘搬动最优，不保证单格最短」。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const { resolve } = require('../shapes.js');

/** 递归生成宏搬动：disk 0 = 最小盘，from/to/via 是槽位下标 */
function hanoiPlan(n, from, to, via, out) {
  if (n <= 0) return;
  hanoiPlan(n - 1, from, via, to, out);
  out.push({ disk: n - 1, from, to });
  hanoiPlan(n - 1, via, to, from, out);
}

function solveHanoi(rawIn, opts) {
  opts = opts || {};
  const raw = resolve(JSON.parse(JSON.stringify(rawIn)));
  const L = K.parse(raw);
  let st = K.initialState(raw);

  // 1) 找盘：非锁定、至少 5 格的自绘块；初始 y 越小 = 越大的盘
  const disks = [];
  for (let i = 0; i < L.pieces.length; i++) {
    const p = L.pieces[i];
    if (p.lock) continue;
    if (p.oris[0].cells.length < 5) continue;
    disks.push({ i, x: st[i].x, y: st[i].y });
  }
  disks.sort((a, b) => a.y - b.y || a.x - b.x || b.i - a.i);
  if (disks.length < 2) throw new Error('没识别出多个嵌套盘');
  const N = disks.length;

  // 2) 槽位 x：左边界 + 每根锁定柱右边；目标槽由 goal 的最小列确定
  const pillars = [];
  for (let i = 0; i < L.pieces.length; i++) {
    if (L.pieces[i].lock) pillars.push({ x: st[i].x, w: L.pieces[i].oris[0].w });
  }
  pillars.sort((a, b) => a.x - b.x);
  const slotX = [0].concat(pillars.map(p => p.x + p.w));
  const goalCells = (raw.goals[0] && raw.goals[0].cells) ||
    (raw.goals[0] && raw.goals[0].spots && raw.goals[0].spots[0]) || [];
  const goalX = goalCells.length ? Math.min.apply(null, goalCells.map(c => c[0])) : slotX[slotX.length - 1];
  let toSlot = slotX.findIndex(x => x === goalX);
  if (toSlot < 0) throw new Error('目标列 ' + goalX + ' 不在槽位里：' + JSON.stringify(slotX));
  const fromSlot = slotX.findIndex(x => x === disks[0].x);
  if (fromSlot < 0) throw new Error('盘的初始列不在槽位里');
  const viaSlot = [0, 1, 2].find(s => s !== fromSlot && s !== toSlot);
  if (viaSlot == null) throw new Error('三根柱位不足');

  // 3) 通道 y：盘高 5 时就是 h-5（柱高 h-5，柱下方留出一整个盘的高度）
  const diskH = opts.diskH || 5;
  const channelY = L.h - diskH;
  if (channelY < 0) throw new Error('棋盘高度不够');

  const stepTo = (idx, dx, dy, out) => {
    const mv = K.moves(L, st).find(m => m.i === idx && m.t === 'm' && m.dx === dx && m.dy === dy);
    if (!mv) throw new Error('走不通：块 ' + idx + ' 在 (' + st[idx].x + ',' + st[idx].y + ') ' +
      '方向 (' + dx + ',' + dy + ')');
    out.push(mv);
    st = K.apply(st, mv);
  };

  /** 把一个盘整体搬到目标槽的目标层：盘内 y 从 0 连续堆叠，最小盘放最内层 */
  const moveDisk = (pieceIdx, tx, ty, out) => {
    while (st[pieceIdx].y < channelY) stepTo(pieceIdx, 0, 1, out);
    while (st[pieceIdx].x < tx) stepTo(pieceIdx, 1, 0, out);
    while (st[pieceIdx].x > tx) stepTo(pieceIdx, -1, 0, out);
    while (st[pieceIdx].y > ty) stepTo(pieceIdx, 0, -1, out);
  };

  // 4) 经典递归 + 逐盘展开（slots[k] 里按「大到小」存盘编号 0..N-1）
  const slots = [[], [], []];
  for (let d = 0; d < N; d++) slots[fromSlot].push(d);
  const plan = [];
  hanoiPlan(N, fromSlot, toSlot, viaSlot, plan);

  const moves = [];
  for (const mv of plan) {
    // mv.disk 0 = 最小盘 ⇒ 对应 disks[N-1]
    const d = N - 1 - mv.disk;
    const pieceIdx = disks[d].i;
    const ty = slots[mv.to].length;       // 目标槽已有 ty 个更大的盘，新盘落在 ty 层
    moveDisk(pieceIdx, slotX[mv.to], ty, moves);
    slots[mv.from].splice(slots[mv.from].indexOf(d), 1);
    slots[mv.to].push(d);
  }

  const L2 = K.parse(raw);
  const ok = K.isGoal(L2, st, raw.goals);
  return {
    ok, moves, macroMoves: plan.length, steps: moves.length,
    hands: K.mergeMoves(moves).length,
    slotX, fromSlot, toSlot, viaSlot, disks: disks.length,
    optimal: '宏动作层面最优（2^N-1），不保证单格最短'
  };
}

module.exports = { solveHanoi, hanoiPlan };

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  const write = args.indexOf('--write') >= 0;
  if (!file) { console.error('用法：node tools/solve-hanoi.js <关卡json> [--write]'); process.exit(1); }
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lv = rec.level || rec;
  const t0 = Date.now();
  try {
    const r = solveHanoi(lv);
    console.log('槽位', JSON.stringify(r.slotX), '盘数', r.disks,
      '从槽', r.fromSlot, '到槽', r.toSlot, '经槽', r.viaSlot);
    console.log('宏搬动', r.macroMoves, '次 = 2^' + r.disks + '-1；展开',
      r.steps, '步 /', r.hands, '手；到目标', r.ok, '；用时', (Date.now() - t0) + 'ms');
    console.log(r.optimal);
    if (write && r.ok) {
      rec.solution = {
        solver: 'hanoi', optimal: false, steps: r.steps, hands: r.hands, moves: r.moves
      };
      fs.writeFileSync(file, JSON.stringify(rec, null, 1) + '\n', 'utf8');
      console.log('已写入 solution 到', path.basename(file));
    }
  } catch (e) {
    console.error('求解失败：', e.message);
    process.exit(1);
  }
}
