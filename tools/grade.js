/* 关卡体检 + 难度打分：node test 与开发时都用它
 *   node tools/grade.js            打印全部关卡的表
 *   node tools/grade.js --json     输出可直接贴回 levels.js 的 diff 字段
 */
const path = require('path');
const K = require('../sofa-klotski.js');
const { resolve } = require('../shapes.js');
const LEVELS = require('../levels.js');

/** 检查布局本身是否合法（越界 / 重叠） */
function validate(rawIn) {
  const raw = resolve(rawIn);
  const L = K.parse(raw), st = K.initialState(raw);
  const used = new Map();
  const bad = [];
  for (let i = 0; i < L.pieces.length; i++) {
    for (const [c, r] of K.pieceCells(L, st, i)) {
      if (c < 0 || r < 0 || c >= L.w || r >= L.h) bad.push({ i, why: 'out', c, r });
      const k = c + ',' + r;
      if (used.has(k)) bad.push({ i, why: 'overlap', with: used.get(k), c, r });
      else used.set(k, i);
    }
  }
  return bad;
}

function grade(rawIn, opts) {
  opts = opts || {};
  const raw = resolve(rawIn);
  const bad = validate(raw);
  const L = K.parse(raw), st = K.initialState(raw);
  const out = { name: raw.name, w: L.w, h: L.h, n: L.pieces.length, bad };
  // 自绘扇形块能绕圆心转之后状态空间会涨到 40 万级，默认上限放到 120 万
  const cap = opts.cap || 1200000;
  const res = K.analyze(L, st, raw.goals, { maxNodes: cap });
  out.res = res;
  out.diff = K.difficulty(res);
  out.solve = null;
  out.moves = null;                      // 解法原始走法（测试里复用，别为了看转体再 solve 一遍）
  if (!res.truncated && res.depth >= 0) {
    const r = K.solve(L, st, raw.goals, { maxNodes: 1500000 });
    out.solve = r.ok ? { steps: r.moves.length, hands: K.mergeMoves(r.moves).length } : { err: r.reason };
    if (r.ok) out.moves = r.moves;
  }
  return out;
}

if (require.main === module) {
  const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
  const rows = [];
  for (const k of Object.keys(LEVELS)) {
    if (k === 'blank') continue;
    if (only && k !== only) continue;
    const raw = LEVELS[k]();
    if (!raw.goals || !raw.goals.length) { rows.push({ key: k, name: raw.name, skip: '无目标' }); continue; }
    // 十五子 10^13 级状态空间，不必真穷举到 120 万，快速给出「不计分」即可
    const g = grade(raw, { cap: k === 'fifteen' ? 300000 : 1200000 });
    rows.push(Object.assign({ key: k }, g));
  }
  for (const r of rows) {
    if (r.skip) { console.log(r.key.padEnd(14), r.name, '（' + r.skip + '）'); continue; }
    const d = r.diff, s = r.res, it = s.interference || {};
    const line = [
      r.key.padEnd(14), String(r.name).padEnd(10),
      (r.w + '×' + r.h).padEnd(5), (r.n + ' 块').padEnd(5),
      s.truncated ? '枚举超限' : (s.depth < 0 ? '无解' : ('深度 ' + s.depth + ' / ' + r.solve.hands + ' 手').padEnd(16)),
      (s.states + ' 态').padEnd(10),
      (s.paths + ' 路').padEnd(12),
      ('岔路 ' + it.waste + ' / 同优 ' + it.same).padEnd(20),
      d ? (d.score + ' 分 ' + d.grade) : '—'
    ];
    console.log(line.join(' '));
    if (r.bad.length) console.log('   ⚠ 布局问题:', JSON.stringify(r.bad.slice(0, 4)));
  }
  if (process.argv.includes('--json')) {
    const o = {};
    for (const r of rows) if (r.diff) o[r.key] = {
      score: r.diff.score, grade: r.diff.grade, depth: r.res.depth, hands: r.solve.hands,
      states: r.res.states, paths: r.res.paths,
      waste: r.res.interference && r.res.interference.waste, same: r.res.interference && r.res.interference.same
    };
    console.log('\n' + JSON.stringify(o, null, 1));
  }
}

module.exports = { grade, validate };
