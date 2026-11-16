/* 通用库：载入/校验/实测/表格 */
const fs = require('fs');
const path = require('path');
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const PALETTE = ['#ed1c24', '#ff7f27', '#fff200', '#00a2e8', '#3f48cc', '#ffaec9',
  '#b97a57', '#a349a4', '#22b14c', '#7ddc9a', '#8ab72a', '#5c00e6', '#6b6480'];
const SECTOR_SHAPES = ['semi', 'quarter', 'threeQuarter', 'disc'];

const clone = o => JSON.parse(JSON.stringify(o));

function load(level) {
  const raw = resolve(level);
  const L = K.parse(raw);
  const st = K.initialState(raw);
  return { raw, L, st };
}

/** 布局合法性：越界 / 重叠 / 颜色 / 尺寸 / 块数 / 名字 / hero */
function validate(level) {
  const errs = [];
  const { raw, L, st } = load(level);
  if (!(raw.w >= 4 && raw.w <= 6 && raw.h >= 4 && raw.h <= 6)) errs.push('尺寸 ' + raw.w + 'x' + raw.h);
  const area = raw.w * raw.h;
  if (area < 16 || area > 30) errs.push('面积 ' + area);
  if (raw.pieces.length < 5 || raw.pieces.length > 11) errs.push('块数 ' + raw.pieces.length);
  if (!raw.name || raw.name.length < 2 || raw.name.length > 4) errs.push('关名 ' + raw.name);
  if (!raw.goals || !raw.goals.length) errs.push('无目标');
  const used = new Map();
  let heroes = 0;
  raw.pieces.forEach((p, i) => {
    if (PALETTE.indexOf(p.color) < 0) errs.push('颜色 ' + p.id + ' ' + p.color);
    if (!p.name) errs.push('无名 ' + p.id);
    if (p.hero) heroes++;
    for (const [c, r] of K.pieceCells(L, st, i)) {
      if (c < 0 || r < 0 || c >= raw.w || r >= raw.h) { errs.push('越界 ' + p.id + ' ' + c + ',' + r); continue; }
      const k = c + ',' + r;
      if (used.has(k)) errs.push('重叠 ' + k + ' ' + p.id + '/' + used.get(k));
      else used.set(k, p.id);
    }
  });
  if (heroes > 1) errs.push('hero x' + heroes);
  (raw.goals || []).forEach(g => {
    if (!raw.pieces.some(p => p.id === g.piece)) errs.push('目标块不存在 ' + g.piece);
  });
  return errs;
}

/** 目标是不是「4×h 底行正中的 2×2」这种标准形 */
function standardGoal(raw) {
  return (raw.goals || []).every(g => {
    if (!g.cells || g.cells.length !== 4) return false;
    const cs = g.cells.map(c => c.join(',')).sort().join(';');
    const x0 = Math.floor((raw.w - 2) / 2);
    const ref = [[x0, raw.h - 2], [x0 + 1, raw.h - 2], [x0, raw.h - 1], [x0 + 1, raw.h - 1]]
      .map(c => c.join(',')).sort().join(';');
    return cs === ref;
  });
}

/** 实测：solve → analyze → difficulty + 机制扫描 */
function metrics(level, opt) {
  opt = opt || {};
  const errs = validate(level);
  if (errs.length) return { errs, ok: false };
  const { raw, L, st } = load(level);
  const tS = Date.now();
  const s = K.solve(L, st, raw.goals, { maxNodes: opt.solveCap || 1500000 });
  const solveMs = Date.now() - tS;
  if (!s.ok) return { errs, ok: false, reason: s.reason, visited: s.visited, solveMs };
  const hands = K.mergeMoves(s.moves).length;

  const sofaIdx = [], sectorIdx = [], lockIdx = [], customIdx = [];
  raw.pieces.forEach((p, i) => {
    if (p.shape === 'sofa') sofaIdx.push(i);
    if (SECTOR_SHAPES.indexOf(p.shape) >= 0) sectorIdx.push(i);
    if (p.lock) lockIdx.push(i);
    if (p.shape === 'custom') {
      const cells = L.pieces[i].desc.map(q => [q.c, q.r]);
      if (K.components(cells).length > 1) customIdx.push(i);
    }
  });
  const turns = s.moves.filter(m => m.t === 'r');
  const sofaTurns = turns.filter(m => sofaIdx.indexOf(m.i) >= 0);
  const sectorTurns = turns.filter(m => sectorIdx.indexOf(m.i) >= 0);

  // 同心扇形：初始状态里找圆心相同的块
  const centers = new Map();
  for (let i = 0; i < L.pieces.length; i++) {
    const sec = K.sectorOf(L, st, i);
    if (!sec) continue;
    const key = sec.center.join(',');
    if (!centers.has(key)) centers.set(key, []);
    centers.get(key).push(i);
  }
  const concentric = [...centers.values()].filter(v => v.length > 1);

  let a = null, d = null, analyzeMs = 0;
  if (opt.skipAnalyze !== true) {
    const tA = Date.now();
    a = K.analyze(L, st, raw.goals, { maxNodes: opt.analyzeCap || 1200000 });
    analyzeMs = Date.now() - tA;
    d = K.difficulty(a);
  }
  return {
    errs, ok: true, solveMs, analyzeMs,
    steps: s.moves.length, hands,
    sofaTurns: sofaTurns.length, sofaIdx, sectorTurns: sectorTurns.length,
    sectorIdx: sectorIdx.length, lockIdx: lockIdx.length,
    customIdx: customIdx.length, concentric: concentric.length,
    stdGoal: standardGoal(raw),
    a, d,
    states: a ? a.states : null, paths: a ? a.paths : null,
    score: d ? d.score : null, grade: d ? d.grade : null,
    truncated: a ? a.truncated : null
  };
}

function fmt(m) {
  if (!m || !m.ok) return '不可解/' + (m && m.reason) + ' ' + (m && m.visited);
  const secs = [];
  if (m.sofaTurns) secs.push('沙发转' + m.sofaTurns);
  if (m.sectorIdx) secs.push('扇形' + m.sectorIdx + (m.concentric ? '(同心x' + m.concentric + ')' : ''));
  if (m.lockIdx) secs.push('锁' + m.lockIdx);
  if (m.customIdx) secs.push('断块' + m.customIdx);
  if (!m.stdGoal) secs.push('异形目标');
  return [m.steps + '步/' + m.hands + '手', m.states + '态', m.paths + '路',
    (m.score != null ? m.score + '分 ' + m.grade : '—'), secs.join('+')].join(' | ');
}

function csvRow(name, level, m) {
  const { raw } = load(level);
  return [name, raw.w + 'x' + raw.h, raw.pieces.length, m.steps + '/' + m.hands,
    m.states, m.paths, m.score + ' ' + m.grade, fmt(m)].join('\t');
}

module.exports = { K, resolve, load, validate, metrics, fmt, standardGoal, PALETTE, SECTOR_SHAPES, clone };
