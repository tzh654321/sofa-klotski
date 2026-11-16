/* 一次性：给「密林穿行」按主题调色 + 给 135 个墙块起有意义的名字。
 * 分档依据 = 墙格的 4 连通块大小：大树盘踞 / 灌木丛 / 单株荆棘，颜色也分三档绿。 */
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'levels', '迷宫', '12_密林穿行.json');
const rec = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const lv = rec.level, W = lv.w, H = lv.h;

const STYLE = [
  { min: 4, name: '古树', color: '#1f7a4d' },   // 成片的深林
  { min: 2, name: '灌木', color: '#35a06a' },   // 两三格一丛
  { min: 1, name: '荆棘', color: '#63c188' }    // 单格挡路
];
const HERO_COLOR = '#ffb03a';                   // 暖琥珀，从一片绿里一眼找到求生者

/* 4 连通分量：只统计锁定墙格 */
const at = new Map(lv.pieces.map(p => [p.x + ',' + p.y, p]));
const left = new Set(lv.pieces.filter(p => p.lock).map(p => p.x + ',' + p.y));
const sizeOf = new Map();
for (const seed of [...left]) {
  if (!left.has(seed)) continue;
  const q = [seed], comp = [];
  left.delete(seed);
  while (q.length) {
    const k = q.pop(); comp.push(k);
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (x + dx) + ',' + (y + dy);
      if (left.has(n)) { left.delete(n); q.push(n); }
    }
  }
  for (const k of comp) sizeOf.set(k, comp.length);
}

const tally = {};
for (const p of lv.pieces) {
  if (p.lock) {
    const n = sizeOf.get(p.x + ',' + p.y);
    const s = STYLE.find(s => n >= s.min);
    p.name = s.name; p.color = s.color;
    const key = s.name + '(' + s.color + ')';
    tally[key] = (tally[key] || 0) + 1;
  } else {
    p.color = HERO_COLOR;                       // 主角「求生者」名字与 hero 标记保持原样
    tally['求生者(' + HERO_COLOR + ')'] = (tally['求生者(' + HERO_COLOR + ')'] || 0) + 1;
  }
}

/* 目标点给个人话标签；列表文案也不再是编辑器占位符 */
lv.goals[0].label = '密林出口';
rec.origin = '传统迷宫';
rec.note = '19×19 密林迷宫；墙分古树／灌木／荆棘三档，求生者从西北角穿到东南出口。' +
  '评分按「手」计：全程一次连续拖动 = 1 手，难度分偏低是评分口径，不代表关卡简单。';
rec.tip = '19×19 · 密林穿行';

fs.writeFileSync(FILE, JSON.stringify(rec, null, 1) + '\n', 'utf8');
console.log('墙连通块分档统计：');
for (const [k, v] of Object.entries(tally)) console.log('  ' + k + ' × ' + v);
console.log('块数', lv.pieces.length, '颜色种数', new Set(lv.pieces.map(p => p.color)).size,
  '名称种数', new Set(lv.pieces.map(p => p.name)).size);
console.log('goal', JSON.stringify(lv.goals[0]));
