/* 把关卡里的「斜半圆」换成「小圆 + 两弓形」
 *
 *   node tools/replace-diagsemi.js [--dry] [--only 关卡文件]
 *
 * 为什么换：斜半圆是一整块 art（圆心在格角、半径 √2/2 的弧），弧会凸出到相邻格 0.207，
 * 于是「占格表」和真实几何对不上（引擎只按格子判碰撞）。改成三个都**整格装在格子里**的组件
 * （右下 1/4 圆的圆心角 + 该格里的内切圆 + 上方的弓形）后，占的格子不变、转轴不变，
 * 但画出来的每一块都不越界，占格=几何。
 *
 * 占格与转轴完全等价（都是 [[0,0],[0,1],[1,1]] / pivot [0.5,1.5]），所以解法、难度都不用重算。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'levels');

/* 自绘1 的样子：上面一条弓形、左下内切圆、右下一条弓形 */
const TEMPLATE = [
  { c: 0, r: 0, seg: 3 },
  { c: 0, r: 1, disc: true },
  { c: 1, r: 1, seg: 0 }
];
const PIVOT = [0.5, 1.5];

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    if (f[0] === '_') continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { walk(p, out); continue; }
    if (f.endsWith('.json')) out.push(p);
  }
  return out;
}

let files = 0, pieces = 0;
for (const file of walk(ROOT, [])) {
  if (only && file.indexOf(only) < 0) continue;
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lv = rec.level || rec;
  if (!lv || !Array.isArray(lv.pieces)) continue;
  let n = 0;
  for (const p of lv.pieces) {
    if (p.shape !== 'diagSemi') continue;
    p.shape = 'custom';
    p.cells = TEMPLATE.map(q => ({ ...q }));
    p.rot = 'pivot';
    p.pivot = PIVOT.slice();
    delete p.art; delete p.spin; delete p.flat;
    n++;
  }
  if (!n) continue;
  files++;
  pieces += n;
  const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
  console.log((DRY ? '[dry] ' : '') + rel + '：' + n + ' 块斜半圆 → 小圆+两弓形');
  if (!DRY) fs.writeFileSync(file, JSON.stringify(rec, null, 1) + '\n', 'utf8');
}
console.log('\n共 ' + files + ' 个文件 / ' + pieces + ' 块' + (DRY ? '（未写盘）' : '已替换'));
