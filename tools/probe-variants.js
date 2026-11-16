/* 机制变体探针：逐个试「圆角 / 断桥 / 半月」能不能造出可解且不超限的关
 *   node tools/probe-variants.js
 * 只是设计期的探针，正式筛选在 tools/variants.js。
 */
const path = require('path');
const K = require(path.join(__dirname, '..', 'sofa-klotski.js'));
const { resolve, SEMI_CELLS } = require(path.join(__dirname, '..', 'shapes.js'));
const LV = require(path.join(__dirname, '..', 'levels.js'));
const clone = o => JSON.parse(JSON.stringify(o));
const CAP = 500000;

function probe(tag, v) {
  const r = resolve(v), L = K.parse(r), st = K.initialState(r);
  const used = new Set();
  for (let i = 0; i < L.pieces.length; i++) for (const [c, rr] of K.pieceCells(L, st, i)) {
    const k = c + ',' + rr;
    if (c < 0 || rr < 0 || c >= L.w || rr >= L.h || used.has(k)) return;
    used.add(k);
  }
  const s = K.solve(L, st, r.goals, { maxNodes: CAP });
  if (!s.ok) { console.log(tag.padEnd(26), 'NO', s.reason, s.visited + '态'); return; }
  const a = K.analyze(L, st, r.goals, { maxNodes: CAP });
  const d = K.difficulty(a);
  console.log(tag.padEnd(26), s.moves.length + '步', a.states + '态', a.paths + '路',
    'trunc=' + a.truncated, d ? d.score + '分' : '—');
}

for (const [bn, base] of [['横刀', LV.classic()], ['沙发', LV.sofaBend()]]) {
  const small = base.pieces.filter(p => p.shape === '1x1');
  // 圆角格（不自转，纯粹自绘外观）
  for (const q of small) {
    const v = clone(base), t = v.pieces.find(p => p.id === q.id);
    t.shape = 'custom'; t.cells = [{ c: 0, r: 0, arc: [1, 1] }]; t.rot = false; t.nodedup = true;
    probe(bn + ' 圆角静止 ' + q.id, v);
  }
  // 断桥：把两个不相邻小卒焊成一块
  for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) {
    const a = small[i], b = small[j];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 2) continue;
    for (const rot of [false, 'pivot']) {
      const v = clone(base), x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
      v.pieces = v.pieces.filter(p => p.id !== a.id && p.id !== b.id);
      v.pieces.splice(1, 0, {
        id: 'bridge', x: x0, y: y0, shape: 'custom', name: '断桥', color: '#a349a4',
        cells: [{ c: a.x - x0, r: a.y - y0 }, { c: b.x - x0, r: b.y - y0 }], rot
      });
      probe(bn + ' 断桥 ' + a.id + b.id + (rot ? ' 可转' : ' 固定'), v);
    }
  }
  // 半月：横条换成两个四分之一圆拼的半圆
  for (const q of base.pieces.filter(p => p.shape === '2x1')) {
    const v = clone(base), t = v.pieces.find(p => p.id === q.id);
    t.shape = 'custom'; t.cells = clone(SEMI_CELLS); t.rot = 'pivot';
    t.flat = 90; t.pair = 'disc'; t.nodedup = true;
    probe(bn + ' 半月 ' + q.id, v);
  }
}
