/* 「狼烟四起2-1」回归：社区 LURD 文本关 → 推箱子记关法（社区关配色 + 去外墙）
 *   node test/wall-maze.test.js
 *
 * 来源：社区文本关「狼烟四起 2-1」（作者 Zou Yongzhong 20603）。字符表按社区通行写法：
 *   @ 人 / + 人在目标点 / $ 箱子 / * 箱子在目标点 / # 墙 / . 目标点 / - _ 空格 空地
 *   解法 LURD：小写 l r u d = 走一格，大写 L R U D = 推动一格
 * 目标与集内其余关一致：所有箱子 → 所有目标点（任意箱占任意点）。
 * 原文 11×11 外圈全是装饰墙 → 裁成 9×9；开局 10 只箱已在点上，只有 (6,1) 那只不在成 (6,0)；
 * 作者 203 步（41 推）必须逐字复现到「11 箱全归位」。
 */
const fs = require('fs');
const path = require('path');
const K = require('../../sofa-klotski.js');
const { resolve } = require('../../shapes.js');
const { parseText, inferWidth, cropFrame, buildLevel, replay } = require('../../tools/import-wall-text.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

const FILE = path.join(__dirname, '..', '..', 'levels', '推箱子', '09_狼烟四起2-1.json');
const rec = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const lv = rec.level;
const raw = resolve(JSON.parse(JSON.stringify(lv)));
const L = K.parse(raw), st = K.initialState(raw);

console.log('\n[1] 关卡元信息按推箱子记关法落盘');
ok(lv.w === 9 && lv.h === 9, '9×9 棋盘（原文 11×11 的外墙已裁掉）', [lv.w, lv.h]);
ok(rec.set === '推箱子' && rec.id === '推箱子-09', 'set/id 与集内一致', [rec.set, rec.id]);
ok(rec.name === '狼烟四起2-1' && /^09_狼烟四起2-1\.json$/.test(path.basename(FILE)),
  '名字用回社区原名，文件名与之一致', [rec.name, path.basename(FILE)]);
ok(rec.origin === 'Zou Yongzhong(20603)', 'origin 放作者，和移植关的「STAGE x ROOM y」区分开', rec.origin);
ok(rec.tip === '社区关卡 · 9×9', 'tip 标明是社区关卡', rec.tip);

console.log('\n[2] 字符表：$ 箱 / * 箱在点上 / . 目标点 / @ 人');
const walls = lv.pieces.filter(p => p.lock);
const boxes = lv.pieces.filter(p => p.onceOnly);
const actors = lv.pieces.filter(p => !p.lock && !p.chainOnly && !p.onceOnly);
const spots = lv.goals[0].spots.map(s => s[0][0] + ',' + s[0][1]).sort();
ok(boxes.length === 11, '11 只木箱（10 个 * + 1 个 $）', boxes.length);
ok(actors.length === 1 && actors[0].id === 'player', '只有一个人，id 是 player', actors.map(p => p.id));
ok(actors[0].x === 0 && actors[0].y === 0, '人从 @ 的 (0,0) 开始');
ok(spots.length === 11, '11 个目标点（10 个 * + 1 个 .）', spots.length);
ok(spots.filter(s => boxes.some(b => (b.x + ',' + b.y) === s)).length === 10,
  '开局 10 只箱已经站在目标点上', spots.filter(s => boxes.some(b => (b.x + ',' + b.y) === s)).length);
ok(spots.indexOf('6,0') >= 0 && boxes.some(b => b.x === 6 && b.y === 1),
  '唯一空着的是 (6,0)，唯一没归位的是 (6,1) 那只');
ok(walls.every(p => p.name === '岩壁' && p.color === '#3f4756' && !p.rot), '墙：岩壁 / #3f4756 / 不可转');
ok(boxes.every(p => p.name === '乱石' && p.color === '#a08b6a'), '箱：乱石 / #a08b6a');
ok(actors.every(p => p.name === '石匠' && p.color === '#ffb03a'), '人：石匠 / #ffb03a');

console.log('\n[3] 紧挨的墙合并成一块');
{
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
  ok(comps === walls.length, '4 连通分量 = 墙块数', [comps, walls.length]);
  ok(walls.length < 10, '墙没有退化成一堆 1×1', walls.length);
}

console.log('\n[4] 目标与局面：所有箱子 → 所有目标点');
{
  const g = lv.goals[0];
  ok(lv.goals.length === 1, '只有一条目标');
  ok(Object.keys(g).sort().join(',') === 'need,pieces,spots' && g.need === 'all',
    '目标是 {pieces,spots,need:"all"}', Object.keys(g));
  ok(JSON.stringify(g.pieces) === JSON.stringify(boxes.map(b => b.id)),
    'goal.pieces 就是全部 11 只木箱', g.pieces.length);
  const norm = K.goalNorm(L, g);
  ok(norm && norm.kind === 'place' && norm.need === 11, '引擎解析成「11 块全部匹配」', norm && norm.need);
  ok(!K.isGoal(L, st, raw.goals), '开局还没全归位');
  const used = new Set(); let bad = 0;
  for (let i = 0; i < L.pieces.length; i++)
    for (const [c, r] of K.pieceCells(L, st, i)) {
      const k = c + ',' + r;
      if (c < 0 || r < 0 || c >= L.w || r >= L.h || used.has(k)) bad++;
      used.add(k);
    }
  ok(bad === 0, '不越界不重叠', bad);
  const ms = K.moves(L, st);
  ok(!ms.some(m => L.pieces[m.i].onceOnly && (m.t === 'm' || m.t === 'r')), '木箱不会自己产生走法');
  ok(ms.filter(m => m.t === 'p').every(m => (m.chain || []).filter(i => L.pieces[i].onceOnly).length <= 1),
    '任何一步都推不动两只木箱');
}

console.log('\n[5] 解法与难度');
{
  let s = st, pushes = 0, maxBox = 0;
  for (const m of rec.solution.moves) {
    if (m.t === 'p') { pushes++; maxBox = Math.max(maxBox, (m.chain || []).filter(i => L.pieces[i].onceOnly).length); }
    s = K.apply(s, m);
  }
  ok(K.isGoal(L, s, raw.goals), '存的解法回放后 11 只箱子全部归位');
  ok(rec.solution.steps === rec.solution.moves.length, 'steps 与 moves 长度一致');
  ok(rec.solution.steps === 203 && pushes === 41, '仍是作者那 203 步 / 41 推（逐字复现）',
    [rec.solution.steps, pushes]);
  ok(maxBox === 1, '每次推只带动一只箱子', maxBox);
  ok(rec.meta && rec.meta.score != null && rec.meta.grade, '难度分与档位都记了',
    rec.meta && [rec.meta.score, rec.meta.grade]);
  ok(rec.meta.estimated === true && rec.meta.depth == null,
    '状态上限内没穷尽：不给假的最短步数，只留参考解', rec.meta && [rec.meta.depth, rec.meta.estimated]);
  ok(/未证明最短/.test(rec.meta.confidence || ''), '界面文案标明非最短', rec.meta && rec.meta.confidence);
}

console.log('\n[6] 导入工具：原文解析 + LURD 复现 + 与文件逐格一致');
{
  const blob = '############@--###.####--*-*-$*-###-#-*----###-#-*-#--###-#-**-#-###-#----#*##-*##-*---##----###-###--#-----#############' +
    'Title: 狼烟四起2-1 Author: Zou Yongzhong(20603)Solution: ' +
    'rdddddDlddrUrrdrrrruulullluuRDluuuRDrrULdrrruLdllllddrUluuLulldRddddDlddrUrrdrrrruuluuLrddrrUUUlullDllddRUluuuLulldR' +
    'ddddDlddrUrrdrrrruuluLUlldRdRUruLdlluuuuLulldRddddDlddrUrrdrrrruuLrruuuluurDDDuulllDuuR';
  const p = parseText(blob);
  ok(p.title === '狼烟四起2-1' && /20603/.test(p.author), 'Title / Author 读对了', [p.title, p.author]);
  const dim = inferWidth(p.board);
  ok(dim.w === 11 && dim.h === 11, '只靠版面反推出 11×11', dim);
  // 外圈全是装饰墙 → 工具默认裁掉一圈
  const cr = cropFrame(p.board, dim.w, dim.h);
  ok(cr.cut === 1 && cr.w === 9 && cr.h === 9, '整圈都是墙时自动裁掉 1 圈：11×11 → 9×9', [cr.cut, cr.w, cr.h]);
  ok(cropFrame(cr.board, cr.w, cr.h).cut === 0, '裁到不再是纯墙圈就停手');

  const gen = buildLevel({ board: cr.board, w: cr.w, h: cr.h, name: 'x', note: 'x', style: 'community' });
  const sig = l => {
    const r = resolve(JSON.parse(JSON.stringify(l)));
    const LL = K.parse(r), ss = K.initialState(r), out = [];
    LL.pieces.forEach((pp, i) => {
      const tag = pp.lock ? 'w' : (pp.onceOnly ? 'b' : 'p');
      for (const [c, rr] of K.pieceCells(LL, ss, i)) out.push(tag + ':' + c + ',' + rr);
    });
    (l.goals || []).forEach(g => (g.spots || []).forEach(s =>
      s.forEach(([c, rr]) => out.push('g:' + c + ',' + rr))));
    return out.sort().join('|');
  };
  ok(sig(gen) === sig(lv), '工具（社区样式 + 裁边框）重跑出来的版面与本关文件逐格一致');

  const rep = replay(gen, p.solution);
  ok(rep.moves.length === p.solution.length && rep.ok, '作者那 203 个字母全部合法且 11 箱归位',
    [rep.moves.length, p.solution.length, rep.ok]);
  ok(rep.pushes === 41 && rep.misses.length === 0, '41 次推动、零存疑（大小写与推/走严格对应）',
    [rep.pushes, rep.misses.slice(0, 3)]);
  ok(gen.pieces.filter(x => x.onceOnly).every(x => x.name === '乱石') &&
    gen.pieces.filter(x => x.lock).every(x => x.name === '岩壁'),
    '工具按社区样式出块名（岩壁／乱石／石匠）');
}

console.log('\n[7] 关卡包与磁盘一致');
{
  global.window = global;
  require('../../levelpacks.js');
  const all = LEVELPACKS.reduce((a, p) => a.concat(p.levels), []);
  const e = all.find(x => x.name === '狼烟四起2-1');
  ok(!!e && e.set === '推箱子', '关卡包「推箱子」里有社区关「狼烟四起2-1」', all.filter(x => x.set === '推箱子').map(x => x.name));
  ok(e && e.meta && e.meta.score === rec.meta.score, '包里的难度分与文件一致', e && e.meta && e.meta.score);
  ok(e && e.solution && e.solution.steps === rec.solution.steps, '包里的解法与文件一致');
  ok(!all.some(x => /乱石当道|推箱子 9/.test(x.name)), '旧名字的拷贝都已清掉');
}

console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed'
  : 'ALL PASS  ' + pass + ' passed, 0 failed'));
process.exit(fail ? 1 : 0);
