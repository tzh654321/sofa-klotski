/* ────────────────────────────────────────────────────────────────
 * 设计关卡：以两个已知深局（横刀立马 76 步 / 沙发过弯 68 步）为底稿，
 * 逐个替换/删减小块来引入「锁定 / 自绘四分之一圆 / 不相邻块 / 半圆」，
 * 每关都真的跑一遍求解 + 难度分析，只留下可解且分数够高的。
 *
 *   node tools/variants.js
 *   node tools/variants.js --json   → 把入选关卡写成 tools/level-candidates.json
 * ──────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const { resolve, SEMI_CELLS } = require('../shapes.js');
const LV = require('../levels.js');

const CAP = 220000;
const clone = o => JSON.parse(JSON.stringify(o));
const SEMI = () => clone(SEMI_CELLS);

function score(raw, tag) {
  const r = resolve(raw);
  const L = K.parse(r), st = K.initialState(r);
  const used = new Set();
  for (let i = 0; i < L.pieces.length; i++)
    for (const [c, rr] of K.pieceCells(L, st, i)) {
      const k = c + ',' + rr;
      if (c < 0 || rr < 0 || c >= L.w || rr >= L.h || used.has(k)) return null;
      used.add(k);
    }
  const s = K.solve(L, st, r.goals, { maxNodes: CAP });
  if (!s.ok) return null;
  const a = K.analyze(L, st, r.goals, { maxNodes: CAP });
  const d = K.difficulty(a);
  if (!d || a.truncated) return null;
  const rec = {
    tag, raw, steps: s.moves.length, hands: K.mergeMoves(s.moves).length,
    states: a.states, paths: a.paths, depth: a.depth, score: d.score, grade: d.grade,
    parts: d.parts, ms: a.ms
  };
  console.log(tag.padEnd(22), (r.w + '×' + r.h).padEnd(5),
    (rec.steps + '步/' + rec.hands + '手').padEnd(12), (rec.states + '态').padEnd(10),
    (rec.paths + '路').padEnd(11), d.score + '分 ' + d.grade);
  return rec;
}

const out = [];
const bases = [
  ['横刀立马', LV.classic()],
  ['沙发过弯', LV.sofaBend()]
];

for (const [bname, base] of bases) {
  const small = base.pieces.filter(p => p.shape === '1x1');
  const bars = base.pieces.filter(p => p.shape === '2x1');

  // A) 删一个小卒腾出空间，再锁死另一块 —— 锁定块当墙
  for (const del of small) {
    const thinned = clone(base);
    thinned.pieces = thinned.pieces.filter(p => p.id !== del.id);
    for (const q of thinned.pieces.filter(p => !p.hero)) {
      const v = clone(thinned);
      const t = v.pieces.find(p => p.id === q.id);
      t.lock = true; t.color = '#6b6480'; t.name = '锁石';
      v.name = '锁门·' + del.id + '·' + q.id;
      const r = score(v, bname + ' 锁' + q.id + '(去' + del.id + ')');
      if (r) out.push(r);
    }
  }

  // B) 一个小卒换成自绘「四分之一圆」格（占格不变，但只能绕圆心转）
  for (const q of small) {
    const v = clone(base);
    const t = v.pieces.find(p => p.id === q.id);
    t.shape = 'custom'; t.cells = [{ c: 0, r: 0, arc: [1, 1] }];
    t.rot = 'pivot'; t.nodedup = true; t.name = '圆角'; t.color = '#a349a4';
    v.name = '圆角·' + q.id;
    const r = score(v, bname + ' 圆角' + q.id);
    if (r) out.push(r);
  }

  // C) 两个不相邻的小卒焊成一个块（视觉上用重心连线）
  for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) {
    const a = small[i], b = small[j];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 2) continue;
    const v = clone(base);
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    v.pieces = v.pieces.filter(p => p.id !== a.id && p.id !== b.id);
    v.pieces.splice(1, 0, {
      id: 'bridge', x: x0, y: y0, shape: 'custom', color: '#a349a4', name: '断桥',
      cells: [{ c: a.x - x0, r: a.y - y0 }, { c: b.x - x0, r: b.y - y0 }], rot: false
    });
    v.name = '断桥·' + a.id + b.id;
    const r = score(v, bname + ' 断桥' + a.id + b.id);
    if (r) out.push(r);
  }

  // D) 横条换成自绘半圆（占格不变，只能绕圆心转）
  for (const q of bars) {
    const v = clone(base);
    const t = v.pieces.find(p => p.id === q.id);
    t.shape = 'custom'; t.cells = SEMI(); t.rot = 'pivot';
    t.flat = 90; t.pair = 'disc'; t.nodedup = true;
    t.name = '半月'; t.color = '#a349a4';
    v.name = '半月·' + q.id;
    const r = score(v, bname + ' 半月' + q.id);
    if (r) out.push(r);
  }

  // E) 单纯删一个小卒（多一个空格的变体）
  for (const del of small) {
    const v = clone(base);
    v.pieces = v.pieces.filter(p => p.id !== del.id);
    v.name = '疏局·' + del.id;
    const r = score(v, bname + ' 疏' + del.id);
    if (r) out.push(r);
  }
}

out.sort((a, b) => b.score - a.score);
console.log('\n── 入选（分数 ≥ 40，且每类机制只取最好的两关）──');
const keep = [], perType = {};
for (const r of out) {
  if (r.score < 40) continue;                 // 难度分过低的直接舍弃
  const type = /锁/.test(r.tag) ? 'lock' : /圆角/.test(r.tag) ? 'arc'
    : /断桥/.test(r.tag) ? 'bridge' : /半月/.test(r.tag) ? 'semi' : 'plain';
  perType[type] = (perType[type] || 0);
  if (perType[type] >= 2) continue;
  perType[type]++;
  keep.push({ type, ...r });
  console.log(type.padEnd(8), r.tag.padEnd(22), r.score + '分', r.steps + '步', r.states + '态', r.paths + '路');
}
console.log('\n候选 ' + out.length + ' 关，保留 ' + keep.length + ' 关，舍弃 ' + (out.length - keep.length) + ' 关（<40 分或同类超额）');
if (process.argv.includes('--json')) {
  fs.writeFileSync(path.join(__dirname, 'level-candidates.json'), JSON.stringify(keep, null, 1));
  console.log('写出 tools/level-candidates.json');
}
