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

/* 五层同心环按「五行」取名（从外到内 火·木·土·水·金），两根锁定条叫门柱；
 * 配色只微调两处：金环从粉改成金 #e8b923，门柱从近黑改成深石板灰 #4a4a55（深色底上还能看清轮廓） */
const NAMES = {
  c8: '火环', c9: '木环', c10: '土环', c11: '水环', c12: '金环',
  c24: '门柱', c25: '门柱'
};
const COLORS = {
  c8: '#d42b63', c9: '#22b14c', c10: '#b97a57', c11: '#2b4d91', c12: '#e8b923',
  c24: '#4a4a55', c25: '#4a4a55'
};

function main() {
  const lv = JSON.parse(fs.readFileSync(path.join(__dirname, 'inbox', 'hanoi-raw.json'), 'utf8'));
  for (const p of lv.pieces) {
    if (!NAMES[p.id]) throw new Error('没给滑块 ' + p.id + ' 起名');
    p.name = NAMES[p.id];
    if (COLORS[p.id]) p.color = COLORS[p.id];
    if (p.id === 'c8') p.hero = true;          // 目标块 = 最外一层火环
  }
  lv.solver = 'hanoi';
  lv.note = '五层同心环（火·木·土·水·金）套在左厅，两根门柱隔出三厅，只有第 9~13 行是贯通走廊；' +
    '目标是把最外层的火环整块搬进右厅，所以得先一层层把里面的环卸下来。' +
    '求解走 tools/solve-hanoi.js（整盘搬动的宏动作递归，31 次），单格 BFS 在这关会组合爆炸。';

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
    note: lv.note, tip: '玩家提供 · ' + lv.w + '×' + lv.h + ' · 五盘汉诺塔',
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
