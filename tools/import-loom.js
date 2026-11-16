/* 织布机：把编辑器里做的原始关（tools/inbox/织布机.json）整理成「随机型关卡」
 *
 *   node tools/import-loom.js                 # 只打印统计
 *   node tools/import-loom.js --write         # 写进 levels/随机型关卡/01_织布机.json
 *   node tools/import-loom.js --write --steps 4000
 *
 * 相对原始稿做了这些改动（都是"入册前统一口径"）：
 *   1. 全部被动块（chainOnly）改成普通块 —— 这一关要能自己滑起来；
 *   2. 所有块都有名字：8 根长杆按经纬线编组，四个角是机架，24 个 1×1 统一改成序号；
 *   3. 24 个 1×1 换成一条渐变色带（按格子顺序铺彩虹）；
 *   4. 每个 1×1 的目标 = 自己脚下那一格（"哪里来回哪里去"）；
 *   5. 打乱步数是关卡属性：默认值来自 --steps，用同样的随机走法混合到"接近纯随机布置"。
 *
 * 第 5 点的判据（--probe）：从还原态随机走 N 步，比较三个统计量与"纯随机布置"的距离：
 *   home   还有几个 1×1 在自己家门口（纯随机 ≈ 24/25 ≈ 0.96 个）
 *   dist   离家的平均曼哈顿距离（饱和后不再涨）
 *   pair   两块"相对位置和原样一致"的比例（纯随机 = 1/N 量级）
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');

const ROOT = path.join(__dirname, '..', 'levels');
const SRC = path.join(__dirname, 'inbox', '织布机.json');
const SET = '随机型关卡';
const NAME = '织布机';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] && argv[i + 1][0] !== '-' ? argv[i + 1] : true); };
const has = n => argv.indexOf('--' + n) >= 0;

/* ── 颜色：HSL → #rrggbb ── */
function hsl2hex(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to = x => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return '#' + to(f(h + 1 / 3)) + to(f(h)) + to(f(h - 1 / 3));
}

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
raw.name = NAME;

/* ── 1. 被动 → 普通；3. 1×1 换渐变色；2. 统一命名 ── */
const tokens = raw.pieces.filter(p => p.shape === '1x1');
const barsH = raw.pieces.filter(p => p.shape === 'custom' && p.cells.some(c => c.c === 6));
const barsV = raw.pieces.filter(p => p.shape === 'custom' && p.cells.some(c => c.r === 6));
const frames = raw.pieces.filter(p => p.shape === '2x2');
const byPos = (a, b) => (a.y - b.y) || (a.x - b.x);
tokens.sort(byPos); barsH.sort(byPos); barsV.sort(byPos); frames.sort(byPos);

raw.pieces.forEach(p => { delete p.chainOnly; delete p.onceOnly; });

const HUE0 = 6, HUE_SPAN = 330;                    // 红 → 紫，避开又绕回红的断裂
tokens.forEach((p, i) => {
  p.name = String(i + 1);
  p.color = hsl2hex(HUE0 + HUE_SPAN * i / Math.max(1, tokens.length - 1), 68, 56);
});
const CN = ['一', '二', '三', '四', '五', '六', '七', '八'];
barsH.forEach((p, i) => { p.name = '纬' + (CN[i] || (i + 1)); });
barsV.forEach((p, i) => { p.name = '经' + (CN[i] || (i + 1)); });
frames.forEach((p, i) => { p.name = '机架' + (CN[i] || (i + 1)); });

/* ── 4. 目标：每个 1×1 回自己脚下 ── */
raw.goals = tokens.map(p => ({ piece: p.id, cells: [[p.x, p.y]] }));
raw.note = NAME + ' · 8×8 · 24 个线梭各归各位（每次复位随机打乱）';

/* ── 规则自检：不能有重叠/越界 ── */
const L = K.parse(require('../shapes.js').resolve(JSON.parse(JSON.stringify(raw))));
const st0 = K.initialState(raw);
const used = new Map();
let bad = 0;
for (let i = 0; i < L.pieces.length; i++) {
  for (const [c, r] of K.pieceCells(L, st0, i)) {
    if (c < 0 || r < 0 || c >= L.w || r >= L.h) { console.log('！越界 ' + L.pieces[i].id + ' (' + c + ',' + r + ')'); bad++; }
    const k = c + ',' + r;
    if (used.has(k)) { console.log('！重叠 (' + c + ',' + r + ')：' + used.get(k) + ' / ' + L.pieces[i].id); bad++; }
    used.set(k, L.pieces[i].id);
  }
}
console.log('棋盘 ' + L.w + '×' + L.h + '，' + L.pieces.length + ' 块（' +
  tokens.length + ' 梭 + ' + barsH.length + ' 纬 + ' + barsV.length + ' 经 + ' + frames.length + ' 机架），占 ' +
  used.size + ' 格' + (bad ? '，★ ' + bad + ' 处冲突' : '，无冲突'));

/* ── 5. 打乱步数：混合度probe ── */
function rngOf(seed) { let s = seed >>> 0; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; }
const home = st => tokens.reduce((a, p, i) => a + (st[L.of[p.id]].x === p.x && st[L.of[p.id]].y === p.y ? 1 : 0), 0);
const dist = st => tokens.reduce((a, p, i) => {
  const q = st[L.of[p.id]];
  return a + Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
}, 0) / tokens.length;
function pairsMatch(st) {
  // 两块之间的相对位置（Δx,Δy）和原样一致的比例 —— 越接近 0 越像"纯随机布置"
  let same = 0, all = 0;
  for (let i = 0; i < tokens.length; i++) for (let j = i + 1; j < tokens.length; j++) {
    const a = st[L.of[tokens[i].id]], b = st[L.of[tokens[j].id]];
    all++;
    if (a.x - b.x === tokens[i].x - tokens[j].x && a.y - b.y === tokens[i].y - tokens[j].y) same++;
  }
  return same / all;
}
function probe(steps, trials) {
  let h = 0, d = 0, pr = 0;
  for (let t = 0; t < trials; t++) {
    const s = K.scramble(L, st0, steps, { rng: rngOf(1000 + t * 7919) });
    h += home(s); d += dist(s); pr += pairsMatch(s);
  }
  return { home: h / trials, dist: d / trials, pair: pr / trials };
}
if (has('probe') || !has('write')) {
  console.log('\n每档 40 次随机走法的统计（"纯随机"参考：home≈' + (tokens.length / (tokens.length + 1)).toFixed(2) +
    '，pair≈' + (1 / (L.w * L.h)).toFixed(3) + '）');
  for (const n of [100, 400, 1000, 2000, 4000, 8000, 16000]) {
    const p = probe(n, 40);
    console.log('  ' + String(n).padStart(6) + ' 步  home ' + p.home.toFixed(2) +
      '  dist ' + p.dist.toFixed(2) + '  pair ' + p.pair.toFixed(3));
  }
}

if (!has('write')) {
  console.log('\n（只统计，没写文件。加 --write 落盘）');
  process.exit(0);
}

const steps = Math.max(1, parseInt(arg('steps', 4000), 10) || 4000);
raw.shuffle = true;
raw.shuffleSteps = steps;
raw.solver = 'loom';          // 页面据此显示「织布机专用求解」面板（通用 BFS 对这关无效）

const dir = path.join(ROOT, SET);
fs.mkdirSync(dir, { recursive: true });
const file = '01_' + NAME + '.json';
const dst = path.join(dir, file);
let old = null;
try { old = JSON.parse(fs.readFileSync(dst, 'utf8')); } catch (e) { }
const rec = {
  set: SET, id: '随机型关卡-01', name: NAME, origin: '编辑器草稿', lvKey: null,
  note: raw.note, tip: '8×8 · 24 个线梭各归各位',
  source: 'import',
  level: raw,
  meta: (old && old.meta) || null,
  solution: null
};
fs.writeFileSync(dst + '.tmp', JSON.stringify(rec, null, 1) + '\n');
fs.renameSync(dst + '.tmp', dst);
console.log('\n已写入 levels/' + SET + '/' + file + '（打乱 ' + steps + ' 步）');
console.log('下一步：node tools/build-levelpacks.js');
