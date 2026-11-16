/* 从解法视频里读「空格 + 沙发姿态」序列（视频画了完整网格线，没法靠黑边分块，
 * 但空格是灰的、沙发有个灰色缺口，这两个特征够用）。
 *   node tools/gen/parse-video2.js
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
const isGray = p => Math.abs(p[0] - p[1]) < 30 && Math.abs(p[1] - p[2]) < 30;
const at = (f, c, r, fx, fy) => px(f, Math.round(c * CW + fx * CW), Math.round(r * CH + fy * CH));

/** 动画帧里块的边会扫过格子中心 → 有黑就跳过 */
function settled(f) {
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (isDark(at(f, c, r, 0.5, 0.5))) return false;
  }
  return true;
}

/** 占用：格子四角多数是彩色即占（沙发缺口只吃中间半边） */
function occupied(f, c, r) {
  const pts = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
  let col = 0;
  for (const [fx, fy] of pts) if (!isGray(at(f, c, r, fx, fy))) col++;
  return col >= 2;
}

/** 沙发：occupied 的中格里有灰缺口的那个格子；再判断缺口朝哪边 */
function findSofa(f, occ) {
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!occ[r][c]) continue;
    // 中格：灰点在中心附近（缺口向外凹进半格）
    const mid = [[0.5, 0.5], [0.5, 0.4], [0.5, 0.6], [0.4, 0.5], [0.6, 0.5], [0.35, 0.5], [0.65, 0.5]];
    let gray = 0;
    for (const [fx, fy] of mid) if (isGray(at(f, c, r, fx, fy))) gray++;
    if (gray < 3) continue;
    // 判断这个沙发是竖的还是横的：看上下/左右哪边还有占用
    const up = r > 0 && occ[r - 1][c], down = r + 1 < H && occ[r + 1][c];
    const left = c > 0 && occ[r][c - 1], right = c + 1 < W && occ[r][c + 1];
    // 缺口方向：中格里靠哪侧的灰最深
    let dir = '?';
    if (right && left) dir = '?';
    else if (right) dir = 'down/up?' ;
    return { c, r, vertical: !!up || !!down, up, down, left, right };
  }
  return null;
}

let prev = null, n = 0;
for (let f = 0; f < N; f++) {
  if (!settled(f)) continue;
  const occ = [];
  for (let r = 0; r < H; r++) {
    occ.push([]);
    for (let c = 0; c < W; c++) occ[r].push(occupied(f, c, r));
  }
  const key = occ.map(row => row.map(v => (v ? '#' : '.')).join('')).join('/') + '|' + JSON.stringify(findSofa(f, occ));
  if (key === prev) continue;
  prev = key; n++;
  const s = findSofa(f, occ);
  console.log('── t=' + (f / FPS).toFixed(1) + 's 帧' + f + ' 第' + n + '态  沙发=' +
    (s ? '(' + s.c + ',' + s.r + ') ' + (s.vertical ? '竖' : '横') + ' 邻[上' + (s.up ? 1 : 0) + ' 下' + (s.down ? 1 : 0) +
      ' 左' + (s.left ? 1 : 0) + ' 右' + (s.right ? 1 : 0) + ']' : '未识别'));
  for (let r = 0; r < H; r++) {
    let row = '';
    for (let c = 0; c < W; c++) row += (occ[r][c] ? '#' : '.') + ' ';
    console.log('   ' + row);
  }
}
console.log('共 ' + n + ' 个状态变化');
