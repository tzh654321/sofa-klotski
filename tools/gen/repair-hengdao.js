/* 给「横刀弯马」找等价可解版：同一套块（2×2 曹操 + 4 将 + 3 卒 + 沙发），
 * 逐个做小改动（删一个卒 / 挪一块 / 换个朝向），要求可解且沙发在解里转过体。 */
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');

const BASE = {
  name: '横刀弯马', w: 4, h: 5,
  goals: [{ piece: 'hero', label: '底行正中', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
  pieces: [
    { id: 'zhang', x: 0, y: 0, ori: 0, shape: '1x2', name: '张飞' },
    { id: 'hero', x: 1, y: 0, ori: 0, shape: '2x2', name: '曹操', hero: true },
    { id: 'zhao', x: 3, y: 0, ori: 0, shape: '1x2', name: '赵云' },
    { id: 'guan', x: 1, y: 2, ori: 0, shape: '2x1', name: '关羽' },
    { id: 'huang', x: 3, y: 2, ori: 0, shape: '1x2', name: '黄忠' },
    { id: 'z1', x: 1, y: 3, ori: 0, shape: '1x1', name: '卒1' },
    { id: 'z2', x: 2, y: 3, ori: 0, shape: '1x1', name: '卒2' },
    { id: 'z4', x: 3, y: 4, ori: 0, shape: '1x1', name: '卒4' },
    { id: 'u11', x: 0, y: 2, ori: 0, shape: 'sofa', name: '沙发' }
  ]
};

const clone = o => JSON.parse(JSON.stringify(o));

function valid(lv) {
  try {
    const raw = resolve(lv);
    const L = K.parse(raw), st = K.initialState(raw);
    const used = new Set();
    for (let i = 0; i < L.pieces.length; i++) {
      for (const [c, r] of K.pieceCells(L, st, i)) {
        if (c < 0 || r < 0 || c >= L.w || r >= L.h) return null;
        const k = c + ',' + r;
        if (used.has(k)) return null;
        used.add(k);
      }
    }
    if (raw.goals.some(g => !raw.pieces.some(p => p.id === g.piece))) return null;
    return { raw, L, st };
  } catch (e) { return null; }
}

const results = [];
function tryLayout(tag, lv) {
  const v = valid(lv);
  if (!v) return;
  const sol = K.solve(v.L, v.st, v.raw.goals, { maxNodes: 300000 });
  if (!sol.ok) return;
  const hands = K.mergeMoves(sol.moves).length;
  const sofas = v.L.pieces.map((p, i) => (p.rotMode === 'sofa' ? i : -1)).filter(i => i >= 0);
  let turns = 0, cur = v.st;
  for (const m of sol.moves) { if (m.t === 'r' && sofas.indexOf(m.i) >= 0) turns++; cur = K.apply(cur, m); }
  results.push({ tag, steps: sol.moves.length, hands, turns, lv: clone(lv) });
  console.log(tag + ' → ' + sol.moves.length + ' 步 / ' + hands + ' 手 / 沙发转 ' + turns);
}

/* 1) 删掉一个卒 */
for (const drop of ['z1', 'z2', 'z4']) {
  const lv = clone(BASE);
  lv.pieces = lv.pieces.filter(p => p.id !== drop);
  tryLayout('删 ' + drop, lv);
}
/* 2) 把某个卒挪到别的空格（枚举所有空格） */
for (const pid of ['z1', 'z2', 'z4']) {
  for (let x = 0; x < 4; x++) for (let y = 0; y < 5; y++) {
    const lv = clone(BASE);
    const p = lv.pieces.find(q => q.id === pid);
    p.x = x; p.y = y;
    tryLayout('挪 ' + pid + ' → (' + x + ',' + y + ')', lv);
  }
}
/* 3) 沙发换朝向 / 换位置 */
for (const ori of [0, 1, 2, 3]) {
  for (let x = 0; x < 4; x++) for (let y = 0; y < 5; y++) {
    const lv = clone(BASE);
    const p = lv.pieces.find(q => q.id === 'u11');
    p.x = x; p.y = y; p.ori = ori;
    tryLayout('沙发(' + x + ',' + y + ') ori' + ori, lv);
  }
}
/* 4) 把关羽换成 1×2 竖放 / 挪走 */
for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
  const lv = clone(BASE);
  const p = lv.pieces.find(q => q.id === 'guan');
  p.shape = '1x2'; p.x = x; p.y = y;
  tryLayout('关羽改 1×2 @(' + x + ',' + y + ')', lv);
}

results.sort((a, b) => (b.turns - a.turns) || (b.hands - a.hands));
console.log('\n可解方案 ' + results.length + ' 个，最好的 8 个：');
for (const r of results.slice(0, 8)) console.log('  ' + r.tag + ' → ' + r.steps + ' 步 / ' + r.hands + ' 手 / 沙发转 ' + r.turns);
require('fs').writeFileSync(__dirname + '/logs/hengdao-repair.json', JSON.stringify(results.slice(0, 40), null, 1), 'utf8');
