/* 找一个"枚举到 200 万态都跑不完"的局面，用来验证：
 *   - analyze 截断时 difficulty 仍给出正常分数（arctan 压扁 + 分支代理）
 *   - UI 的进度条/终止按钮有活可干
 *   node tools/gen/diag-huge.js
 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const HUGE = {
  name: '巨场', w: 6, h: 6,
  goals: [{ piece: 'hero', cells: [[2, 4], [3, 4], [2, 5], [3, 5]] }],
  pieces: [
    { id: 'hero', x: 0, y: 0, shape: '2x2', name: '曹操', hero: true },
    { id: 's1', x: 4, y: 0, shape: 'semi', name: '半圆1', ori: 0 },
    { id: 's2', x: 4, y: 3, shape: 'semi', name: '半圆2', ori: 2 },
    { id: 'q1', x: 1, y: 2, shape: 'quarter', name: '一角1', ori: 0 },
    { id: 'q2', x: 3, y: 2, shape: 'quarter', name: '一角2', ori: 1 },
    { id: 'd1', x: 0, y: 3, shape: '1x1', name: '一' },
    { id: 'd2', x: 5, y: 5, shape: '1x1', name: '二' }
  ]
};

const raw = resolve(HUGE);
const L = K.parse(raw), st = K.initialState(raw);
let free = L.w * L.h - L.pieces.reduce((n, p, i) => n + K.pieceCells(L, st, i).length, 0);
console.log('棋盘 ' + L.w + '×' + L.h + '，空格 ' + free);
const t0 = Date.now();
const res = K.analyze(L, st, raw.goals, { maxNodes: 2000000 });
console.log('analyze: 态 ' + res.states + ' 深度 ' + res.depth + ' 手 ' + res.hands +
  ' 截断=' + res.truncated + ' 干扰measured=' + res.interference.measured +
  ' branch ' + res.branching.toFixed(2) + ' 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('difficulty:', JSON.stringify(K.difficulty(res)));

/* 顺便确认一个"枚举完整但很大"的关也正常 */
{
  const LV = require('../../levels.js');
  const c = LV.classic();
  const ran = K.analyze(K.parse(resolve(c)), K.initialState(c), c.goals, { maxNodes: 2000000 });
  console.log('\n对照 classic:', JSON.stringify(K.difficulty(ran)));
}
