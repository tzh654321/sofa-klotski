/* 把「紧挨的锁定墙」合并成一块：墙格按 4 连通分量分组，一组一个自绘锁定块
 *
 *   node tools/merge-walls.js --file levels/迷宫/12_密林穿行.json
 *   node tools/merge-walls.js --file <json> --dry
 *
 * 只改分组、不改占格，所以关卡几何与走法语义不变；但**块下标会重排**
 * （合并后的墙排在前面），所以解法与难度会一起清空，跑一遍
 *   node tools/recompute.js --file <json> && node tools/build-levelpacks.js
 * 重新生成。
 *
 * 合并后的名字/颜色取该连通分量里原本占多数的那个 —— 密林穿行这类
 * 「按连通块大小分档上色」的关，同一分量本来就是同一档，所以颜色不会串。
 */
const fs = require('fs');
const path = require('path');

function mergeWalls(rec) {
  const lv = rec.level || rec;
  const cells = new Map();          // 'c,r' -> { name, color }
  const others = [];
  for (const p of lv.pieces) {
    if (!p.lock) { others.push(p); continue; }
    const cs = p.cells ? p.cells.map(([c, r]) => [p.x + c, p.y + r])
      : (p.shape === '1x2' ? [[p.x, p.y], [p.x, p.y + 1]]
        : p.shape === '2x1' ? [[p.x, p.y], [p.x + 1, p.y]]
        : p.shape === '2x2' ? [[p.x, p.y], [p.x + 1, p.y], [p.x, p.y + 1], [p.x + 1, p.y + 1]]
        : [[p.x, p.y]]);
    for (const [c, r] of cs) cells.set(c + ',' + r, { name: p.name, color: p.color });
  }

  const left = new Set(cells.keys());
  const walls = [];
  let uid = 0;
  for (const seed of [...left]) {
    if (!left.has(seed)) continue;
    const comp = [], q = [seed];
    left.delete(seed);
    for (let head = 0; head < q.length; head++) {
      const [c, r] = q[head].split(',').map(Number);
      comp.push([c, r]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (c + dx) + ',' + (r + dy);
        if (left.has(k)) { left.delete(k); q.push(k); }
      }
    }
    // 分量里占多数的名字/颜色（同一分量通常本来就是同一档）
    const tally = new Map();
    for (const [c, r] of comp) {
      const s = cells.get(c + ',' + r);
      const key = s.name + '\u0000' + s.color;
      tally.set(key, (tally.get(key) || 0) + 1);
    }
    let bestKey = null, bestN = -1;
    for (const [k, n] of tally) if (n > bestN) { bestN = n; bestKey = k; }
    const [name, color] = bestKey.split('\u0000');
    const c0 = Math.min(...comp.map(a => a[0])), r0 = Math.min(...comp.map(a => a[1]));
    walls.push({
      id: 'w' + (++uid), x: c0, y: r0, ori: 0, shape: 'custom',
      cells: comp.map(([c, r]) => [c - c0, r - r0]), rot: false,
      lock: true, color, name
    });
  }
  // 墙统一排在前面：便于阅读，也让解法里的块下标稳定
  const before = lv.pieces.length;
  lv.pieces = walls.concat(others);
  return { walls: walls.length, cells: walls.reduce((n, w) => n + w.cells.length, 0), before, after: lv.pieces.length };
}

function main() {
  const argv = process.argv.slice(2);
  const argOf = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const file = argOf('--file');
  if (!file) throw new Error('用法：node tools/merge-walls.js --file <关卡 json> [--dry]');
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const st = mergeWalls(rec);
  console.log(path.basename(file) + '：块 ' + st.before + ' → ' + st.after +
    '（墙 ' + st.walls + ' 块 / ' + st.cells + ' 格）');
  if (argv.includes('--dry')) return;
  rec.meta = null;
  rec.solution = null;
  fs.writeFileSync(file, JSON.stringify(rec, null, 1) + '\n', 'utf8');
  console.log('已写回；接着跑 node tools/recompute.js --file ' + file + ' 再 node tools/build-levelpacks.js');
}

module.exports = { mergeWalls };
if (require.main === module) main();
