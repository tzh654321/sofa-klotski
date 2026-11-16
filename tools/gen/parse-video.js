/* 把解法视频逐帧解析成棋盘状态：4×5、格子 100×100、块同色只靠黑边分界
 *   node tools/gen/parse-video.js
 * 输出每个「变化点」的棋盘（字母=块、.=空），并标出沙发（三格直线那块）。
 */
const fs = require('fs');

const W = 4, H = 5, CW = 100, CH = 100, IW = 400, IH = 500, FPS = 2;
const buf = fs.readFileSync('D:/code/hrd/frame-check/fps.rgb');
const N = buf.length / (IW * IH * 3);
const px = (f, x, y) => {
  const o = ((f * IH + y) * IW + x) * 3;
  return [buf[o], buf[o + 1], buf[o + 2]];
};
const isDark = p => p[0] < 90 && p[1] < 90 && p[2] < 90;
const isGray = p => Math.abs(p[0] - p[1]) < 24 && Math.abs(p[1] - p[2]) < 24 && p[0] > 90 && p[0] < 190;

/* 格子是否被占：取格子内 4 个偏离中心点，多数是彩色即算占（沙发缺口是灰但并不空） */
function occupied(f, c, r) {
  const pts = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  let col = 0, gray = 0;
  for (const [fx, fy] of pts) {
    const p = px(f, c * CW + Math.round(fx * CW), r * CH + Math.round(fy * CH));
    if (isGray(p)) gray++; else col++;
  }
  return gray < 3;          // 三个点以上是灰 -> 空格（沙发缺口只占半个格）
}

/* 相邻两格中间那条线是否有黑边（有边=不同块） */
function wall(f, c1, r1, c2, r2) {
  let dark = 0;
  if (c2 !== c1) {                       // 左右相邻：竖边在 x = c2*CW
    const x = c2 * CW;
    for (const t of [0.3, 0.5, 0.7]) {
      const p = px(f, x, Math.round(r1 * CH + t * CH));
      if (isDark(p)) dark++;
    }
  } else {                               // 上下相邻：横边在 y = r2*CH
    const y = r2 * CH;
    for (const t of [0.3, 0.5, 0.7]) {
      const p = px(f, Math.round(c1 * CW + t * CW), y);
      if (isDark(p)) dark++;
    }
  }
  return dark >= 2;
}

function snapshot(f) {
  const cells = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) cells.push({ c, r, on: occupied(f, c, r) });
  const id = new Map();
  let next = 0;
  const key = (c, r) => c + ',' + r;
  const get = (c, r) => cells.find(q => q.c === c && q.r === r);
  // 并查集：同块 = 被占 + 中间没有黑边
  const par = new Map();
  const find = k => { while (par.get(k) !== k) k = par.get(k); return k; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par.set(a, b); };
  for (const q of cells) if (q.on) par.set(key(q.c, q.r), key(q.c, q.r));
  for (const q of cells) {
    if (!q.on) continue;
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const n = get(q.c + dc, q.r + dr);
      if (!n || !n.on) continue;
      if (!wall(f, q.c, q.r, n.c, n.r)) uni(key(q.c, q.r), key(n.c, n.r));
    }
  }
  const groups = new Map();
  for (const q of cells) {
    if (!q.on) { id.set(key(q.c, q.r), null); continue; }
    const root = find(key(q.c, q.r));
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(q);
  }
  const list = [...groups.values()];
  list.sort((a, b) => (a[0].r - b[0].r) || (a[0].c - b[0].c));
  const names = 'ABCDEFGHIJKLMNOP';
  list.forEach((g, i) => g.forEach(q => id.set(key(q.c, q.r), names[i])));
  let sofa = -1;
  list.forEach((g, i) => {
    if (g.length !== 3) return;
    const cs = g.map(q => [q.c, q.r]);
    const sameRow = cs.every(x => x[1] === cs[0][1]);
    const sameCol = cs.every(x => x[0] === cs[0][0]);
    if (sameRow || sameCol) sofa = i;
  });
  let out = '';
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) out += (id.get(key(c, r)) || '.');
    out += '\n';
  }
  return { out, sofa, shapes: list.map(g => g.map(q => q.c + ',' + q.r)) };
}

/* 判定这一帧是不是"停稳"的：动画帧里块的边会扫过格子中心（出现黑像素） */
function settled(f) {
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const p = px(f, c * CW + CW / 2, r * CH + CH / 2);
    if (isDark(p)) return false;
  }
  return true;
}

let prev = null, changes = 0, skipped = 0;
for (let f = 0; f < N; f++) {
  if (!settled(f)) { skipped++; continue; }
  const s = snapshot(f);
  if (s.out !== prev) {
    changes++;
    const t = (f / FPS).toFixed(1);
    console.log('── t=' + t + 's 帧' + f + ' (第 ' + changes + ' 个状态) 沙发=' +
      (s.sofa >= 0 ? String.fromCharCode(65 + s.sofa) : '?') + '\n' + s.out);
    prev = s.out;
  }
}
console.log('共 ' + changes + ' 个不同状态（跳过 ' + skipped + ' 个动画帧）/ ' + N + ' 帧');
