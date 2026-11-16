/* 推箱子关卡集回归：8 张截图 + 1 段社区文本改编的华容道关
 *   node test/sokoban.test.js
 *
 * 校验：墙=锁定块 / 箱=一次被动块 / 玩家=普通块 / 目标=多落点任意匹配 /
 *       箱子不能自己走、只能被直接推且一次只推一个 / 预存解法回放真的把箱子推到亮点 /
 *       棋盘裁到最小。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const { resolve } = require('../shapes.js');
global.window = global;
require('../levelpacks.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

const pack = LEVELPACKS.find(p => p.set === '推箱子');
console.log('[1] 关卡集');
ok(!!pack, '有「推箱子」关卡集');
const all = pack ? pack.levels : [];
ok(all.length === 9, '恰好 9 关（STAGE 1 ROOM 1~7 + STAGE 25 ROOM 241 + 社区文本「狼烟四起 2-1」）', all.length);
// 1~8 关是老游戏「仓库番」移植（第 8 关按原游戏 ROOM 号叫 241），第 9 关是社区文本关
ok(all.slice(0, 8).every(l => /^仓库番 (\d+|241)$/.test(l.name)) && all[7].name === '仓库番 241' &&
  all[8].name === '狼烟四起2-1', '名字区分移植关（仓库番 N）与社区关', all.map(l => l.name));
ok(all.every(l => /^推箱子\/[0-9]{2}_(仓库番(\d+|241)|狼烟四起2-1)\.json$/.test(l.file)),
  '一关一文件、文件名与关卡名一致', all.map(l => l.file));
const lvDir = path.join(__dirname, '..', 'levels');
const lists = [];
for (const d of fs.readdirSync(lvDir)) {
  const p = path.join(lvDir, d, '_list.json');
  if (fs.existsSync(p)) lists.push(d + '/_list.json');
}
ok(lists.length === 0, '全库都不再有 _list.json（目录即清单）', lists);
ok(fs.readdirSync(path.join(lvDir, '推箱子')).filter(f => f.endsWith('.json')).length === 9,
  '推箱子目录里只有 9 个关卡文件');

console.log('\n[2] 每关的块语义');
for (const lv of all) {
  const raw = resolve(JSON.parse(JSON.stringify(lv.level)));
  const L = K.parse(raw), st = K.initialState(raw);
  const walls = L.pieces.filter(p => p.lock);
  const boxes = L.pieces.filter(p => p.onceOnly);
  const actors = L.pieces.filter(p => !p.lock && !p.chainOnly && !p.onceOnly);
  ok(walls.length > 0, lv.name + ' 有锁定墙块', walls.length);
  ok(boxes.length > 0, lv.name + ' 有一次被动箱块', boxes.length);
  ok(actors.length === 1 && actors[0].id === 'player', lv.name + ' 只有一个普通块（玩家）', actors.map(p => p.id));
  ok(boxes.every(p => !p.chainOnly), lv.name + ' 箱子不再带旧的被动标记');
  ok(walls.length + boxes.length + actors.length === L.pieces.length, lv.name + ' 每块只属于一种档位');
  // 两套口径：移植关（仓库番）= 砖墙/木箱/推箱人；社区关 = 岩壁/乱石/石匠，一眼能分开
  const PAL = /狼烟四起/.test(lv.name)
    ? { wall: ['岩壁', '#3f4756'], box: ['乱石', '#a08b6a'], player: ['石匠', '#ffb03a'] }
    : { wall: ['砖墙', '#9c3a2e'], box: ['木箱', '#d9a441'], player: ['推箱人', '#3f7fd6'] };
  ok(walls.every(p => p.name === PAL.wall[0] && p.color === PAL.wall[1]),
    lv.name + ' 墙统一叫「' + PAL.wall[0] + '」/ 同色');
  ok(boxes.every(p => p.name === PAL.box[0] && p.color === PAL.box[1]),
    lv.name + ' 箱统一叫「' + PAL.box[0] + '」/ 同色');
  ok(actors.every(p => p.name === PAL.player[0] && p.color === PAL.player[1]),
    lv.name + ' 玩家统一叫「' + PAL.player[0] + '」/ 同色');
  ok(walls.every(p => p.oris[0].cells.length >= 1), lv.name + ' 墙块都是多格横条/单格');
  ok(boxes.every(p => p.oris[0].cells.length === 1), lv.name + ' 箱子都是 1×1');
  ok(actors.every(p => p.oris[0].cells.length === 1), lv.name + ' 玩家是 1×1');
  ok(walls.every(p => !p.rotPlay), lv.name + ' 墙不可转');
  ok(boxes.every(p => p.rotPlay !== true), lv.name + ' 箱子不可转');
  // 紧挨的墙必须合成一块：墙格 4 连通分量数 == 墙块数
  const wc = [];
  for (let i = 0; i < L.pieces.length; i++)
    if (L.pieces[i].lock) for (const [c, r] of K.pieceCells(L, st, i)) wc.push(c + ',' + r);
  const ws = new Set(wc), seen = new Set();
  let comps = 0;
  for (const k of wc) {
    if (seen.has(k)) continue;
    comps++; const q = [k]; seen.add(k);
    while (q.length) {
      const [c, r] = q.pop().split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (c + dx) + ',' + (r + dy);
        if (ws.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
      }
    }
  }
  ok(comps === walls.length, lv.name + ' 相邻墙已合并（4 连通分量 = 墙块数）', [comps, walls.length]);
}

console.log('\n[3] 目标：一条 goal、任意箱子占任意亮点');
for (const lv of all) {
  const raw = resolve(JSON.parse(JSON.stringify(lv.level)));
  const L = K.parse(raw), st = K.initialState(raw);
  const boxIds = L.pieces.filter(p => p.onceOnly).map(p => p.id);
  const goals = raw.goals;
  ok(goals.length === 1, lv.name + ' 只有一条目标');
  const g = goals[0];
  ok(Object.keys(g).sort().join(',') === 'need,pieces,spots' && g.need === 'all',
    lv.name + ' 目标是 {pieces,spots,need:"all"}（几块全到位、位置可换）', Object.keys(g));
  ok(Array.isArray(g.pieces) && g.pieces.length === boxIds.length &&
    g.pieces.every(id => boxIds.indexOf(id) >= 0), lv.name + ' goal.pieces 就是全部箱子', g.pieces);
  ok(Array.isArray(g.spots) && g.spots.length === boxIds.length, lv.name + ' 亮点数 = 箱子数',
    [g.spots && g.spots.length, boxIds.length]);
  ok(g.spots.every(s => s.length === 1), lv.name + ' 每个亮点占 1 格');
  const norm = K.goalNorm(L, g);
  ok(norm && norm.kind === 'place' && norm.need === boxIds.length, lv.name + ' 引擎按「全部匹配」判定');
  ok(!K.isGoal(L, st, goals), lv.name + ' 开局还没把箱子推完');
  if (lv.name === '仓库番 3') {
    // 截图里 (2,5) 有一只「已经站在亮点上」的蓝灰木箱，夹在第 3、4 个亮点之间
    const starts = lv.level.pieces.filter(p => p.onceOnly);
    const spotCells = new Set(g.spots.map(s => s[0][0] + ',' + s[0][1]));
    ok(boxIds.length === 5 && g.spots.length === 5, 'ROOM 3 补回 5 箱 5 亮点', [boxIds.length, g.spots.length]);
    ok(starts.some(p => p.x === 2 && p.y === 5), 'ROOM 3 漏掉的木箱补在 (2,5)');
    ok(starts.filter(p => spotCells.has(p.x + ',' + p.y)).length === 1,
      'ROOM 3 恰有 1 只木箱开局已站在亮点上',
      starts.filter(p => spotCells.has(p.x + ',' + p.y)).length);
  }
}

console.log('\n[4] 布局与最小棋盘');
for (const lv of all) {
  const raw = resolve(JSON.parse(JSON.stringify(lv.level)));
  const L = K.parse(raw), st = K.initialState(raw);
  const used = new Set(); let bad = 0;
  for (let i = 0; i < L.pieces.length; i++) {
    for (const [c, r] of K.pieceCells(L, st, i)) {
      const k = c + ',' + r;
      if (c < 0 || r < 0 || c >= L.w || r >= L.h || used.has(k)) bad++;
      used.add(k);
    }
  }
  ok(bad === 0, lv.name + ' 不越界不重叠', bad);
  // ROOM 6 按截图的真实版面录入 11×9 5 箱；其余关仍裁到最小包围盒
  const compact = lv.name === '仓库番 6' ? (L.w === 11 && L.h === 9)
    : lv.name === '仓库番 241' ? (L.w === 8 && L.h === 4)
    : lv.name === '狼烟四起2-1' ? (L.w === 9 && L.h === 9)
    : (L.w <= 8 && L.h <= 7);
  ok(compact, lv.name + ' 棋盘尺寸符合该关版面（' + L.w + '×' + L.h + '）', [L.w, L.h]);
  const boxIdx = L.pieces.map((p, i) => p.onceOnly ? i : -1).filter(i => i >= 0);
  const playerIdx = L.pieces.findIndex(p => p.id === 'player');
  const ms = K.moves(L, st);
  ok(ms.some(m => m.i === playerIdx), lv.name + ' 玩家能主动走');
  ok(!ms.some(m => boxIdx.indexOf(m.i) >= 0 && (m.t === 'm' || m.t === 'r')),
    lv.name + ' 箱子不会自己产生走法');
  ok(ms.filter(m => m.t === 'p').every(m => (m.chain || []).filter(i => boxIdx.indexOf(i) >= 0).length <= 1),
    lv.name + ' 没有任何一步能连推两个箱子');
}

console.log('\n[5] 解法回放：直接推真的把箱子推到亮点');
for (const lv of all) {
  const raw = resolve(JSON.parse(JSON.stringify(lv.level)));
  const L = K.parse(raw);
  let st = K.initialState(raw);
  const boxIdx = new Set(L.pieces.map((p, i) => p.onceOnly ? i : -1).filter(i => i >= 0));
  let pushes = 0, maxBoxesPerPush = 0;
  for (const m of (lv.solution && lv.solution.moves) || []) {
    if (m.t === 'p') {
      const n = (m.chain || []).filter(i => boxIdx.has(i)).length;
      if (n) pushes++;
      maxBoxesPerPush = Math.max(maxBoxesPerPush, n);
    }
    st = K.apply(st, m);
  }
  ok(pushes > 0, lv.name + ' 解法里用到了直接推箱子', pushes);
  ok(maxBoxesPerPush === 1, lv.name + ' 每次推只带动一个箱子（没有连推）', maxBoxesPerPush);
  ok(K.isGoal(L, st, raw.goals), lv.name + ' 回放结束所有箱子都归位');
  ok(lv.solution.steps === lv.solution.moves.length, lv.name + ' 记录的步数与解法一致',
    [lv.solution.steps, lv.solution.moves.length]);
}

console.log('\n[6] 生成器 MAPS 与八关截图文件逐格一致（重新导入不会再退回旧版面）');
{
  const { MAPS, buildLevel } = require('../tools/gen-sokoban.js');
  const sig = lv => {
    const r = resolve(JSON.parse(JSON.stringify(lv)));
    const LL = K.parse(r), ss = K.initialState(r);
    const out = [];
    LL.pieces.forEach((p, i) => {
      const tag = p.lock ? 'w' : (p.onceOnly || p.chainOnly ? 'b' : 'p');
      for (const [c, rr] of K.pieceCells(LL, ss, i)) out.push(tag + ':' + c + ',' + rr);
    });
    (lv.goals || []).forEach(g => (g.spots || []).forEach(s =>
      s.forEach(([c, rr]) => out.push('s:' + c + ',' + rr))));
    return out.sort().join('|');
  };
  for (const spec of MAPS) {
    const gen = buildLevel(spec);
    const lv = all.find(x => x.name === '仓库番 ' + (spec.label || spec.room));
    ok(!!lv && sig(gen) === sig(lv.level), 'ROOM ' + spec.room + ' 墙/箱/人/亮点逐格一致',
      lv ? [gen.w + '×' + gen.h, lv.level.w + '×' + lv.level.h] : '缺关卡');
  }
}

console.log('\n' + (fail ? 'FAILED  ' + fail + ' / ' + (pass + fail) : 'ALL PASS  ' + pass + ' 条'));
process.exit(fail ? 1 : 0);
