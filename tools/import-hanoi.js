/* 把「汉诺塔」导入 levels/合移位/：滑块命名 + 宏求解器出解 + 估算评分
 *
 *   node tools/import-hanoi.js
 *
 * 输入 tools/inbox/hanoi-raw.json（用户提供），输出 levels/合移位/05_汉诺塔.json。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const { solveHanoi } = require('./solve-hanoi.js');
const PK = require('./build-levelpacks.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'levels', '合移位');
const FILE = path.join(DIR, '05_汉诺塔.json');

const NAMES = {
  c8: '最大盘·朱', c9: '次大盘·翠', c10: '中盘·棕',
  c11: '次小盘·靛', c12: '最小盘·桃',
  c24: '左立柱', c25: '右立柱'
};

function main() {
  const lv = JSON.parse(fs.readFileSync(path.join(__dirname, 'inbox', 'hanoi-raw.json'), 'utf8'));
  for (const p of lv.pieces) {
    if (!NAMES[p.id]) throw new Error('没给滑块 ' + p.id + ' 起名');
    p.name = NAMES[p.id];
  }
  lv.solver = 'hanoi';
  lv.note = '五盘汉诺塔：三根柱位、五个嵌套 U 形盘，把朱色最大盘搬到最右柱。' +
    '求解走 tools/solve-hanoi.js（整盘搬动宏动作递归，31 手）；单格 BFS 在这关会组合爆炸。';

  const L = K.parse(lv), st0 = K.initialState(lv);
  const used = new Set(), bad = [];
  for (let i = 0; i < L.pieces.length; i++) {
    for (const [c, r] of K.pieceCells(L, st0, i)) {
      const k = c + ',' + r;
      if (c < 0 || r < 0 || c >= L.w || r >= L.h) bad.push([i, c, r, 'out']);
      if (used.has(k)) bad.push([i, c, r, 'overlap']);
      used.add(k);
    }
  }
  if (bad.length) throw new Error('布局非法：' + JSON.stringify(bad.slice(0, 5)));

  const t0 = Date.now();
  const sol = solveHanoi(lv);
  if (!sol.ok) throw new Error('宏求解器没能到目标');
  console.log('求解：' + sol.macroMoves + ' 次整盘搬动 / ' + sol.steps + ' 步 / ' + sol.hands +
    ' 手，' + (Date.now() - t0) + 'ms');

  const est = K.estimatePath(L, st0, lv.goals, sol.moves);
  const diff = K.difficulty({
    depth: -1, estimate: est, truncated: true, stopped: false, states: 243
  });
  console.log('估算评分：' + (diff ? diff.score + ' 分 ' + diff.grade : '无'));

  const rec = {
    set: '合移位', id: '合移位-05', name: lv.name,
    origin: '玩家提供的五盘汉诺塔', lvKey: null,
    note: lv.note, tip: '合移位改编 · ' + lv.w + '×' + lv.h + ' · 五盘汉诺塔',
    source: 'user-json',
    level: lv,
    meta: {
      score: diff ? diff.score : null, grade: diff ? diff.grade : '不计分',
      depth: sol.steps, hands: sol.hands, states: 243, paths: null,
      estimated: true, ms: Date.now() - t0
    },
    solution: {
      solver: 'hanoi', optimal: false, steps: sol.steps,
      hands: sol.hands, moves: sol.moves
    }
  };
  fs.writeFileSync(FILE, JSON.stringify(rec, null, 1) + '\n', 'utf8');
  console.log('写入 ' + path.relative(ROOT, FILE));
  const built = PK.writePacks(ROOT);
  console.log('levelpacks.js 重建：' + built.count + ' 关');
}

main();
