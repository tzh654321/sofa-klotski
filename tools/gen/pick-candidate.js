/* 从 twoGoals 搜索结果里挑出想要的一关，打印盘面 + 验算，并输出可直接入库的 JSON */
const fs = require('fs');
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const idx = +(process.argv[2] || 2);
const lines = fs.readFileSync(__dirname + '/logs/twoGoals-u8.jsonl', 'utf8').split(/\r?\n/).filter(Boolean);
const pick = JSON.parse(lines[idx]);
const lv = pick.level;
const raw = resolve(lv);
const L = K.parse(raw), st = K.initialState(raw);
const g = K.grid(L, st);
let board = '';
for (let r = 0; r < L.h; r++) {
  for (let c = 0; c < L.w; c++) board += g[r * L.w + c] < 0 ? '.' : String.fromCharCode(65 + g[r * L.w + c]);
  board += '\n';
}
console.log('块: ' + L.pieces.map((p, k) => String.fromCharCode(65 + k) + '=' + p.name +
  '(' + (p.shape || 'custom') + ')' + (p.lock ? '🔒' : '')).join(' '));
console.log(board);
console.log('目标: ' + JSON.stringify(lv.goals));
const sol = K.solve(L, st, raw.goals, { maxNodes: 1200000 });
console.log('可解', sol.ok, '步', sol.moves.length, '手', K.mergeMoves(sol.moves).length);
const an = K.analyze(L, st, raw.goals, { maxNodes: 1200000 });
console.log('状态', an.states, '路径', an.paths, '干扰', JSON.stringify(an.interference),
  '难度', JSON.stringify(K.difficulty(an)));
console.log('\nJSON:\n' + JSON.stringify(lv, null, 1));
