/* 从 mutate 的结果里挑最有意思的几个：打印盘面 + 关键数字，方便人工挑选 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');
const fs = require('fs');

const files = process.argv.slice(2);
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const list = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('\n════ ' + f + '：' + list.length + ' 个候选 ════');
  list.slice(0, 5).forEach((c, i) => {
    const lv = c.level;
    const raw = resolve(lv);
    const L = K.parse(raw), st = K.initialState(raw);
    const g = K.grid(L, st);
    let board = '';
    for (let r = 0; r < L.h; r++) {
      for (let col = 0; col < L.w; col++) board += g[r * L.w + col] < 0 ? '.' : String.fromCharCode(65 + g[r * L.w + col]);
      board += '\n';
    }
    const sol = K.solve(L, st, raw.goals, { maxNodes: 400000 });
    const turns = sol.ok ? sol.moves.filter(m => m.t === 'r').length : 0;
    const crs = sol.ok ? sol.moves.filter(m => m.t === 'cr').length : 0;
    console.log('\n--- #' + i + ' 手数 ' + c.hands + ' / 步 ' + c.steps + ' / 转体 ' + turns + '（含同心 ' + crs + '）');
    console.log('块: ' + L.pieces.map((p, k) => String.fromCharCode(65 + k) + '=' + p.name +
      (p.lock ? '🔒' : '') + '(' + (p.shape || 'custom') + ')').join(' '));
    console.log(board);
    console.log(JSON.stringify(lv));
  });
}
