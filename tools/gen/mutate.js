/* 从一个已验证可解的关出发做「变异爬山」，找带指定机制的新关
 *   node tools/gen/mutate.js <base> <需要机制> <seed> <毫秒预算>
 *   base: classic | yinQingYuanQue | lockedGate | sofaBend | shaBan
 *   机制: any | cr(同心扇形整体转) | lock | custom(断块) | sofaturn | minHands:N
 * 结果写到 stdout（JSON 行），最后一行汇总
 */
const { K, load, metrics, validate, fmt } = require('./lib.js');
const { resolve } = require('../../shapes.js');
const LEVELS = require('../../levels.js');

const BASE = process.argv[2] || 'yinQingYuanQue';
const NEED = process.argv[3] || 'any';
const SEED0 = +(process.argv[4] || 1);
const BUDGET = +(process.argv[5] || 120000);
let seed = SEED0 >>> 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ri = n => Math.floor(rnd() * n) % n;
const pick = a => a[ri(a.length)];
const clone = o => JSON.parse(JSON.stringify(o));

const EXTRA_PIECES = [
  { shape: '1x1', name: '石', color: '#6b6480' },
  { shape: '1x2', name: '柱', color: '#b97a57' },
  { shape: '2x1', name: '梁', color: '#00a2e8' },
  { shape: '2x2', name: '柜', color: '#5c00e6' },
  { shape: 'L3', name: 'L 石', color: '#8ab72a' },
  { shape: 'semi', name: '半圆', color: '#a349a4' },
  { shape: 'quarter', name: '一角', color: '#ffaec9' },
  { shape: 'threeQuarter', name: '三片', color: '#a349a4' },
  { shape: 'sofa', name: '沙发', color: '#22b14c' },
  { shape: '1x3', name: '长棍', color: '#3f48cc' }
];

function withIds(lv) {
  lv.pieces.forEach((p, i) => { if (!p.id) p.id = 'p' + i; });
  return lv;
}

/** 变异：挪一块 / 换形状 / 加一块 / 删一块 / 旋转一块 / 锁一块 */
function mutate(base) {
  const lv = withIds(clone(base));
  const used = new Set();
  const put = () => {
    lv.pieces.forEach(p => {
      const L = K.parse(resolve({ w: lv.w, h: lv.h, pieces: [p] }));
      for (const [c, r] of K.pieceCells(L, [{ x: p.x, y: p.y, ori: p.ori || 0 }], 0)) used.add(c + ',' + r);
    });
  };
  const free = (x, y) => !used.has(x + ',' + y);
  const op = pick(['move', 'move', 'move', 'shape', 'add', 'add', 'del', 'rot', 'lock']);
  if (op === 'move' && lv.pieces.length) {
    const i = ri(lv.pieces.length);
    const p = lv.pieces[i];
    let cells = null;
    try {
      const L = K.parse(resolve({ w: lv.w, h: lv.h, pieces: [p] }));
      cells = K.pieceCells(L, [{ x: p.x, y: p.y, ori: p.ori || 0 }], 0);
    } catch (e) { return null; }
    cells.forEach(([c, r]) => used.delete(c + ',' + r));
    const [dx, dy] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const nx = p.x + dx, ny = p.y + dy;
    // 越界/重叠就把这块放到棋盘上任意空位
    const fits = cells.every(([c, r]) => {
      const nc = c + dx, nr = r + dy;
      return nc >= 0 && nr >= 0 && nc < lv.w && nr < lv.h && (free(nc, nr) || cells.some(q => q[0] === nc && q[1] === nr));
    });
    if (fits) { p.x = nx; p.y = ny; return lv; }
    for (let t = 0; t < 40; t++) {
      const x = ri(lv.w), y = ri(lv.h);
      if (cells.every(([c, r]) => free(x + c - cells[0][0] + cells[0][0], y))) { }
    }
    return null;
  }
  if (op === 'shape' && lv.pieces.length) {
    const i = ri(lv.pieces.length);
    const p = lv.pieces[i];
    if (p.hero || p.lock) return null;
    const spec = pick(EXTRA_PIECES);
    const old = { shape: p.shape, color: p.color, name: p.name };
    Object.assign(p, { shape: spec.shape, name: spec.name, color: spec.color });
    for (const k of ['cells', 'rot', 'flat', 'pair', 'open', 'art', 'nodedup', 'pivot']) delete p[k];
    const errs = validate(lv);
    if (errs.length) { Object.assign(p, old); return null; }
    return lv;
  }
  if (op === 'add' && lv.pieces.length < 11) {
    const spec = pick(EXTRA_PIECES);
    for (let t = 0; t < 60; t++) {
      const x = ri(lv.w), y = ri(lv.h);
      const cand = { id: 'x' + (100 + ri(300)), x, y, ori: ri(4), shape: spec.shape, name: spec.name, color: spec.color };
      const test = clone(lv); test.pieces.push(cand);
      if (!validate(test).length) { lv.pieces.push(cand); return lv; }
    }
    return null;
  }
  if (op === 'del' && lv.pieces.length > 5) {
    const i = ri(lv.pieces.length);
    if (lv.pieces[i].hero || lv.goals.some(g => g.piece === lv.pieces[i].id)) return null;
    lv.pieces.splice(i, 1);
    return validate(lv).length ? null : lv;
  }
  if (op === 'rot' && lv.pieces.length) {
    const i = ri(lv.pieces.length);
    const p = lv.pieces[i];
    p.ori = ((p.ori || 0) + 1) % 4;
    return validate(lv).length ? null : lv;
  }
  if (op === 'lock' && lv.pieces.length) {
    const i = ri(lv.pieces.length);
    if (lv.pieces[i].hero) return null;
    lv.pieces[i].lock = !lv.pieces[i].lock;
    return lv;
  }
  return null;
}

function mapIdx(raw, L) {
  return L;
}

function needOk(raw, L, st, sol) {
  if (NEED === 'any') return true;
  if (NEED === 'cr') {
    const cr = sol.moves.filter(m => m.t === 'cr');
    if (!cr.length) return false;
    // 必须是"同心装配体"（成员 >= 2 且圆心相同）
    let cur = st;
    for (const m of sol.moves) {
      if (m.t === 'cr') return true;
      cur = K.apply(cur, m);
    }
    return false;
  }
  if (NEED === 'lock') return raw.pieces.some(p => p.lock);
  if (NEED === 'custom') {
    return raw.pieces.some((p, i) => p.shape === 'custom' &&
      K.components(L.pieces[i].desc.map(q => [q.c, q.r])).length > 1);
  }
  if (NEED === 'sofaturn') {
    const sofas = raw.pieces.map((p, i) => (p.shape === 'sofa' ? i : -1)).filter(i => i >= 0);
    return sol.moves.some(m => m.t === 'r' && sofas.indexOf(m.i) >= 0);
  }
  if (NEED.startsWith('minHands:')) return K.mergeMoves(sol.moves).length >= +NEED.split(':')[1];
  return true;
}

const bases = {
  classic: LEVELS.classic, yinQingYuanQue: LEVELS.yinQingYuanQue,
  lockedGate: LEVELS.lockedGate, sofaBend: LEVELS.sofaBend, shaBan: LEVELS.shaBan
};
if (!bases[BASE]) { console.error('未知 base: ' + Object.keys(bases).join(', ')); process.exit(1); }

const t0 = Date.now();
let tries = 0, solv = 0, hit = 0;
const out = [];
while (Date.now() - t0 < BUDGET) {
  let lv = null;
  try { lv = mutate(bases[BASE]()); } catch (e) { lv = null; }
  if (!lv) continue;
  lv.name = lv.name || '候选';
  tries++;
  const raw = resolve(lv);
  const L = K.parse(raw), st = K.initialState(raw);
  const sol = K.solve(L, st, raw.goals, { maxNodes: 120000 });
  if (!sol.ok) continue;
  solv++;
  if (!needOk(raw, L, st, sol)) continue;
  const hands = K.mergeMoves(sol.moves).length;
  if (hands < 24) continue;
  hit++;
  out.push({ steps: sol.moves.length, hands, level: JSON.parse(JSON.stringify(lv)) });
  out.sort((a, b) => b.hands - a.hands);
  if (out.length > 12) out.length = 12;
}
console.error('[' + BASE + '/' + NEED + '] 变异 ' + tries + ' 可解 ' + solv + ' 命中 ' + hit +
  ' 用时 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
console.log(JSON.stringify(out.map(o => ({ steps: o.steps, hands: o.hands, level: o.level }))));
