/* 断桥类关卡搜索：把若干小卒换成一个「不相邻部分」的刚体块。
 * 之前直接焊两个小卒会锁死棋盘（全部无解），所以这里额外留空格、换摆法再试。
 *   node tools/probe-bridge.js
 */
const path = require('path');
const K = require(path.join(__dirname, '..', 'sofa-klotski.js'));
const { resolve } = require(path.join(__dirname, '..', 'shapes.js'));
const LV = require(path.join(__dirname, '..', 'levels.js'));
const clone = o => JSON.parse(JSON.stringify(o));
const CAP = 400000;

function probe(tag, v) {
  const r = resolve(v), L = K.parse(r), st = K.initialState(r);
  const used = new Set();
  for (let i = 0; i < L.pieces.length; i++) for (const [c, rr] of K.pieceCells(L, st, i)) {
    const k = c + ',' + rr;
    if (c < 0 || rr < 0 || c >= L.w || rr >= L.h || used.has(k)) return;
    used.add(k);
  }
  const s = K.solve(L, st, r.goals, { maxNodes: CAP });
  if (!s.ok) return null;
  const a = K.analyze(L, st, r.goals, { maxNodes: CAP });
  const d = K.difficulty(a);
  if (!d || a.truncated) return null;
  const rec = { tag, raw: v, steps: s.moves.length, hands: K.mergeMoves(s.moves).length,
    states: a.states, paths: a.paths, score: d.score, grade: d.grade };
  console.log(tag.padEnd(34), s.moves.length + '步/' + rec.hands + '手', a.states + '态',
    a.paths + '路', d.score + '分 ' + d.grade);
  return rec;
}

const base = LV.classic();
const small = base.pieces.filter(p => p.shape === '1x1');
const res = [];
// 删 2~3 个小卒，再用一个「斜对角两格」的块占回去（两格不相邻）
const combos = [];
for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) combos.push([small[i], small[j]]);
for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) for (let k = j + 1; k < small.length; k++)
  combos.push([small[i], small[j], small[k]]);

for (const del of combos) {
  const ids = new Set(del.map(p => p.id));
  const v = clone(base);
  v.pieces = v.pieces.filter(p => !ids.has(p.id));
  const occupied = new Set();
  for (const p of v.pieces) {
    const sh = { '1x2': [[0, 0], [0, 1]], '2x1': [[0, 0], [1, 0]], '2x2': [[0, 0], [1, 0], [0, 1], [1, 1]] }[p.shape] || [];
    for (const [c, r] of sh) occupied.add((p.x + c) + ',' + (p.y + r));
  }
  // 在空格里找一对斜对角的格位
  for (let y = 0; y < v.h - 1; y++) for (let x = 0; x < v.w - 1; x++) {
    for (const pair of [[[0, 0], [1, 1]], [[1, 0], [0, 1]]]) {
      const cells = pair.map(([dx, dy]) => [x + dx, y + dy]);
      if (cells.some(([c, r]) => occupied.has(c + ',' + r))) continue;
      for (const rot of [false, 'pivot']) {
        const w = clone(v);
        w.pieces.splice(1, 0, {
          id: 'bridge', x, y, shape: 'custom', name: '断桥', color: '#a349a4',
          cells: pair.map(([dx, dy]) => ({ c: dx, r: dy })), rot
        });
        const r = probe('删' + [...ids].join('') + ' 对角@' + x + ',' + y + (rot ? ' 可转' : ' 固定'), w);
        if (r) res.push(r);
      }
    }
  }
}
res.sort((a, b) => b.score - a.score);
console.log('\n可解且可评分 ' + res.length + ' 关，最佳：');
for (const r of res.slice(0, 5))
  console.log('  ' + r.tag + '  ' + r.score + '分 / ' + r.steps + '步 / ' + r.states + '态');
if (res.length) {
  require('fs').writeFileSync(path.join(__dirname, 'bridge-candidates.json'), JSON.stringify(res, null, 1));
  console.log('写出 tools/bridge-candidates.json');
}
