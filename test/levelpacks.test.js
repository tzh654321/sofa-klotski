/* 关卡包：一关一文件 + 打包数据一致
 *   1 目录结构：一个关卡集 = 一个文件夹，一关 = 一个 json
 *   2 每个文件都能解析、棋盘不越界不重叠、有名字
 *   3 文件里存了难度信息和解法；解法回放能到目标
 *   4 levelpacks.js 与文件夹内容一致（改了文件忘了重新打包会被这条抓住）
 *   5 四套关卡集齐全；华容之书的关都有来历（origin）
 *   node test/levelpacks.test.js
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');
const { resolve } = require('../shapes.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

const ROOT = path.join(__dirname, '..', 'levels');
const SETS = ['待分类', '华容之书', '合移位', '推箱子', '迷宫', '随机型关卡'];
/* 「待分类」不是文件夹：没归类的关直接平铺在 levels/ 根目录 */
const ROOT_SET = '待分类';

global.window = global;            // 让 levelpacks.js（给浏览器写的脚本）能在 node 里跑
global.window = global;
require('../levelpacks.js');
const PACKS = global.LEVELPACKS;

console.log('[1] 目录结构：关卡集 = 文件夹（待分类 = 根目录），一关 = 一个文件');
const dirs = fs.readdirSync(ROOT).filter(d => fs.statSync(path.join(ROOT, d)).isDirectory() && d[0] !== '_');
ok(dirs.length >= 5, 'levels/ 下有关卡集文件夹', dirs);
SETS.filter(s => s !== ROOT_SET).forEach(s => ok(dirs.indexOf(s) >= 0, '有「' + s + '」文件夹'));
ok(!fs.existsSync(path.join(ROOT, ROOT_SET)), '「待分类」不再是一个文件夹（关平铺在根目录）');

console.log('\n[2] 每个关卡文件都能用');
let bad = [];
const files = [];
const scanDir = (dir, rel) => {
  for (const f of fs.readdirSync(dir).filter(x => x[0] !== '_')) {
    // 关卡集里允许再套子文件夹（如 华容之书/中分最长）；根目录下的子文件夹本身就是关卡集，
    // 由下面按 dirs 逐个扫，别在这里重复进
    if (fs.statSync(path.join(dir, f)).isDirectory()) {
      if (rel) scanDir(path.join(dir, f), rel + '/' + f);
      continue;
    }
    if (!f.endsWith('.json')) continue;
    const p = path.join(dir, f);
    files.push(rel ? rel + '/' + f : f);
    try {
      const r = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!r.name || !r.level) throw new Error('缺 name/level');
      const raw = resolve(JSON.parse(JSON.stringify(r.level)));
      const L = K.parse(raw), st = K.initialState(raw);
      if (L.w < 1 || L.h < 1) throw new Error('棋盘尺寸');
      const g = K.grid(L, st);
      if (g.some(v => v < -1 || v >= L.pieces.length)) throw new Error('占格表非法');
      const cellCount = K.pieces || null;
      // 叠放/越界检查：每个块的所有格都必须落在棋盘内
      for (let i = 0; i < L.pieces.length; i++) {
        for (const [c, rr] of K.pieceCells(L, st, i)) {
          if (c < 0 || rr < 0 || c >= L.w || rr >= L.h) throw new Error('块越界 ' + r.name);
        }
      }
    } catch (e) { bad.push((rel ? rel + '/' : '') + f + '：' + e.message); }
  }
};
scanDir(ROOT, null);                                  // 根目录 = 待分类
for (const set of dirs) scanDir(path.join(ROOT, set), set);
ok(bad.length === 0, '全部 ' + files.length + ' 个关卡文件合法', bad.slice(0, 4));

console.log('\n[3] 难度信息 + 解法');
const all = PACKS.reduce((a, p) => a.concat(p.levels), []);
const withMeta = all.filter(l => l.meta && l.meta.score != null);
const withSol = all.filter(l => l.solution && l.solution.steps > 0);
console.log('     ' + all.length + ' 关：有难度分 ' + withMeta.length + '，有解法 ' + withSol.length);
// 空盘是工具关、4阶数字华容道走抽样估算；「祭」「思之弥艰」在 120 万态上限内证不出最短解，
// v2 评分模型对"没证明出来的局面"直接不给分（不再编下限），所以允许 4 关没有分数
const noScore = all.filter(l => !(l.meta && l.meta.score != null)).map(l => l.set + '/' + l.name);
ok(withMeta.length >= all.length - 4, '几乎每关都有难度分', { 无分: noScore });
// 随机型关卡每局都不一样，不存单一解法（难度分来自抽样）
const noSol = all.filter(l => !(l.solution && l.solution.steps > 0));
const shuffleNoSol = noSol.filter(l => l.level && l.level.shuffle).length;
ok(withSol.length >= all.length - 2 - shuffleNoSol,
  '除随机型关卡外每关都有解法', { 无解: noSol.map(l => l.name) });
// 抽三关把解法回放一遍，必须真的达成目标
let solved = 0, tried = 0;
for (const l of all.filter(x => x.solution && x.solution.moves && x.solution.moves.length).slice(0, 60)) {
  if (tried >= 4) break;
  tried++;
  const raw = resolve(JSON.parse(JSON.stringify(l.level)));
  let st = K.initialState(raw);
  for (const m of l.solution.moves) st = K.apply(st, m);
  const L = K.parse(raw);
  if (K.isGoal(L, st, raw.goals)) solved++;
  else console.log('     ' + l.name + ' 的解法没到目标');
}
ok(solved === tried, '随机抽的解法都能走到终点（' + solved + '/' + tried + '）', [solved, tried]);

console.log('\n[4] levelpacks.js 与文件夹一致');
const inPack = new Set();
PACKS.forEach(p => p.levels.forEach(l => inPack.add(l.file)));
const inDir = new Set(files);
const missing = files.filter(f => !inPack.has(f));
const extra = [...inPack].filter(f => !inDir.has(f));
ok(missing.length === 0, '文件夹里的每一关都打包进去了（改完记得 node tools/build-levelpacks.js）', missing.slice(0, 4));
ok(extra.length === 0, '打包数据里没有已删除的关', extra.slice(0, 4));

console.log('\n[5] 关卡集与来历');
SETS.forEach(s => {
  const p = PACKS.find(x => x.set === s);
  ok(!!p, '有关卡集「' + s + '」（可以暂时是空的）');
});
const book = PACKS.find(p => p.set === '华容之书');
ok(book && book.levels.length >= 30, '华容之书 ≥30 关', book && book.levels.length);
ok(book && book.levels.every(l => l.origin), '华容之书每关都记着来历（悬停能看到原名）');
const spec = PACKS.find(p => p.set === '随机型关卡');
const names2 = spec ? spec.levels.map(l => l.name) : [];
ok(spec && names2.indexOf('4阶数字华容道') >= 0 && names2.indexOf('织布机') >= 0,
  '4阶数字华容道、织布机在「随机型关卡」里', names2);
ok(!names2.some(n => n === '空盘'), '「空盘」已经删掉了', names2);
const shuffles = all.filter(l => l.level && l.level.shuffle);
ok(shuffles.length >= 2 && shuffles.every(l => (l.level.shuffleSteps | 0) > 0),
  '随机型关卡都带「打乱步数」属性', shuffles.map(l => l.name + ':' + l.level.shuffleSteps));
ok(spec && spec.levels.every(l => l.level.shuffle), '随机型关卡集里每一关都是随机的');
const seen = new Set();
let dup = [];
all.forEach(l => { if (seen.has(l.name)) dup.push(l.name); seen.add(l.name); });
ok(dup.length === 0, '关卡名字不重复', dup);

console.log('\n[5.5] 关卡里不再用斜半圆');
// 斜半圆是一整块 art：弧凸出到相邻格 0.207，占格表和真实几何对不上（引擎只按格子判碰撞）。
// 统一换成「小圆 + 两弓形」（每个组件都整格装在格子里），见 tools/replace-diagsemi.js
const semi = all.filter(l => (l.level.pieces || []).some(p => p.shape === 'diagSemi'));
ok(semi.length === 0, '没有关卡再用斜半圆', semi.map(l => l.name));

console.log('\n[6] levels.js 与关卡文件同步');
const LV = require('../levels.js');
const normLv = lv => JSON.stringify((lv.pieces || []).map(p => [p.id, p.x, p.y, p.ori, p.shape || '', p.cells || null, p.lock ? 1 : 0, p.name]));
const drift = [];
all.filter(l => l.key && typeof LV[l.key] === 'function').forEach(l => {
  const code = LV[l.key]();
  if (normLv(code) !== normLv(l.level)) drift.push(l.name);
});
ok(drift.length === 0, '改过 levels.js 的关要重新导出（node tools/export-builtin.js）', drift.slice(0, 4));

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
