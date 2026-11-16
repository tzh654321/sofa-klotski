/* 把 7 张推箱子截图改编成华容道关卡，写进 levels/推箱子/
 *
 *   node tools/gen-sokoban.js
 *
 * 映射规则：
 *   #  砖墙  → 锁定块（lock:true，4 连通的墙格合成一个自绘块）
 *   $  木箱  → 一次被动块（onceOnly:true，只受发起块的直接推力、不再传力）
 *   @  玩家  → 普通 1×1 块（唯一能主动走的块）
 *   o  亮点  → 一条 {pieces,spots,need:'all'} 目标：几块全到位、位置可换
 *   *  木箱＋亮点 / +  玩家＋亮点（同一格两种含义）
 *   .  地板  → 空格
 *
 * 版面照截图逐格录入（ROOM 6 是 11×9 的真实版面，不再自行裁切）。
 * 一次被动天然实现「一次只能推一个箱子」：箱子后面还有箱子/墙时，整推作废。
 * 大局面（ROOM 6 的 11×9）通用 BFS 会在节点上限内截断，此时改调
 * tools/solve-sokoban.js 保住参考解，分数再交给 node tools/recompute.js 补算。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const PK = require('./build-levelpacks.js');
const SO = require('./solve-sokoban.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'levels', '推箱子');
const SET = '推箱子';

const MAPS = [
  { room: 1, rows: ['##o###', '##.###', '##$.$o', 'o.$@##', '###$##', '###o##'] },
  { room: 2, rows: ['@..####', '.$$####', '.$.###o', '##.###o', '##....o', '#...#..', '#...###'] },
  // 末行 oo*o：(2,5) 是「已经站在亮点上的木箱」，夹在第 3、4 个亮点之间，别再读成地板
  { room: 3, rows: ['#..#', '@$.#', '#$.#', '#.$.', 'o$..', 'oo*o'] },
  { room: 4, rows: ['#.....##', '#$###...', '.@.$..$.', '.oo#.$.#', '#oo#...#'] },
  { room: 5, rows: ['#@.###', '#.$..#', '##.#.#', 'o#.#..', 'o$..#.', 'o...$.'] },
  // ROOM 6：11×9 真实截图版面，5 箱 5 亮点；中心 (4,4) 是「箱子已站在亮点上」
  { room: 6, rows: [
    '###.....#..',
    '...o###.#..',
    '.#.#....##.',
    '.#.$.$#o.#.',
    '.#..*..#.#.',
    '..#$.$.#.#.',
    '#o...#.#.##',
    '#.###o....@',
    '#.....##...'
  ] },
  { room: 7, rows: ['###..#.@', '##...#..', '##$.$.$.', '##.$##..', '##.$.#.#', 'ooooo..#'] },
  /* ROOM 8 = 截图 STAGE 25 ROOM 241：只留真实玩法区（裁掉截图里那圈装饰砖墙边框，
     10×6 → 8×4），顶上右半仍是「墙」、左边中段两格是「墙」，其余是 8×4 的房间。
     6 只木箱对中腹 2×3 的六个亮点。裁掉的边框本来只是锁定墙，几何/解法完全不变。 */
  { room: 8, stage: 25, from: 241, label: 241, pushSolve: true, rows: [
    '...#####',
    '.$.oo.$.',
    '#$.oo$$@',
    '#..oo.$.'
  ] }
];

const C_WALL = '#9c3a2e', C_BOX = '#d9a441', C_PLAYER = '#3f7fd6';

/** 截图上的关卡号：ROOM 8 之后不一定连号，所以允许 stage/from 覆盖 */
const stageOf = spec => spec.stage || 1;
const fromOf = spec => spec.from || spec.room;
const originOf = spec => 'STAGE ' + stageOf(spec) + ' ROOM ' + fromOf(spec);
/* 显示名用「仓库番 + 原游戏 ROOM 号」（第 8 关是 ROOM 241，所以叫仓库番 241；
   文件前缀仍按序号 01..08，保证列表顺序稳定）。label 缺省 = 序号。 */
const labelOf = spec => spec.label || spec.room;
const nameOf = spec => '仓库番 ' + labelOf(spec);
const fileOf = spec => String(spec.room).padStart(2, '0') + '_仓库番' + labelOf(spec) + '.json';

function buildLevel(spec) {
  const h = spec.rows.length, w = spec.rows[0].length;
  const pieces = [], spots = [], boxIds = [], wallCells = [];
  let uid = 0;
  for (let r = 0; r < h; r++) {
    for (let k = 0; k < w; k++) {
      const ch = spec.rows[r][k];
      if (ch === '#') { wallCells.push([k, r]); continue; }
      if (ch === '$' || ch === '*') {
        const id = 'box' + (uid++); boxIds.push(id);
        pieces.push({ id, x: k, y: r, ori: 0, shape: '1x1', onceOnly: true, color: C_BOX, name: '木箱' });
        if (ch === '*') spots.push([[k, r]]);          // 箱子开局就站在亮点上
      } else if (ch === '@' || ch === '+') {
        pieces.push({ id: 'player', x: k, y: r, ori: 0, shape: '1x1', color: C_PLAYER, name: '推箱人' });
        if (ch === '+') spots.push([[k, r]]);
      } else if (ch === 'o') {
        spots.push([[k, r]]);
      }
    }
  }
  /* 紧挨的墙合成一块：4 连通分量各生成一个自绘锁定块，块列表不再被一堆 1×1 撑满。
   * 只改分组、不改占格，所以关卡几何与解法语义不变（走法里的块下标需重算）。 */
  const left = new Set(wallCells.map(([c, r]) => c + ',' + r));
  const walls = [];
  for (const [c, r] of wallCells) {
    if (!left.has(c + ',' + r)) continue;
    const comp = [], q = [[c, r]];
    left.delete(c + ',' + r);
    for (let head = 0; head < q.length; head++) {
      const [x, y] = q[head];
      comp.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (x + dx) + ',' + (y + dy);
        if (left.has(k)) { left.delete(k); q.push([x + dx, y + dy]); }
      }
    }
    const c0 = Math.min(...comp.map(a => a[0])), r0 = Math.min(...comp.map(a => a[1]));
    walls.push({
      id: 'w' + (uid++), x: c0, y: r0, shape: 'custom',
      cells: comp.map(([x, y]) => [x - c0, y - r0]),
      rot: false, lock: true, color: C_WALL, name: '砖墙'
    });
  }
  pieces.unshift(...walls);
  return {
    name: nameOf(spec), w, h,
    note: '改编自 ' + originOf(spec) + '；墙=锁定块，箱=一次被动块，玩家=普通块。' +
      '评分按「手」计：玩家全程一次连续拖动 = 1 手，所以难度分偏低是评分口径，不代表关卡简单。',
    pieces,
    // 「几块全到位、位置可换」：任意木箱占任意亮点，need:'all' 要求全部归位
    goals: [{ pieces: boxIds, spots, need: 'all' }]
  };
}

function main() {
  fs.mkdirSync(DIR, { recursive: true });
  /* --only 8 / --only 6,7：只重建指定 ROOM，避免顺手把大局面（需 recompute 补分）冲掉 */
  const argv = process.argv.slice(2);
  const iOnly = argv.indexOf('--only');
  const only = iOnly >= 0 ? new Set(String(argv[iOnly + 1] || '').split(',').map(Number)) : null;
  const specs = only ? MAPS.filter(s => only.has(s.room)) : MAPS;
  if (!specs.length) throw new Error('--only 没匹配到任何 ROOM：' + argv[iOnly + 1]);
  // 目录就是清单：只写 NN_名字.json，不再生成 _list.json（该格式已淘汰）
  for (const spec of specs) {
    const lv = buildLevel(spec);
    const L = K.parse(lv), st = K.initialState(lv);
    const bad = [];
    const used = new Set();
    for (let i = 0; i < L.pieces.length; i++) {
      for (const [c, r] of K.pieceCells(L, st, i)) {
        if (c < 0 || r < 0 || c >= L.w || r >= L.h) bad.push([i, c, r, 'out']);
        const k = c + ',' + r;
        if (used.has(k)) bad.push([i, c, r, 'overlap']);
        used.add(k);
      }
    }
    if (bad.length) throw new Error('ROOM ' + spec.room + ' 布局非法：' + JSON.stringify(bad));

    const num = String(spec.room).padStart(2, '0');
    const file = fileOf(spec);
    const t0 = Date.now();
    /* 6 箱级别（ROOM 8）通用 BFS 会直接把 node 的 zone 撑爆（V8 原生 OOM，catch 不住），
       这类局面一律跳过通用搜索，直接交给按推搜索 + recompute */
    const sol = spec.pushSolve ? { ok: false, reason: 'skip-generic' } : K.solve(L, st, lv.goals, { maxNodes: 1500000 });
    if (!sol.ok && sol.reason === 'unsolvable') throw new Error('ROOM ' + spec.room + ' 无解');
    // 大局面（ROOM 6/7）通用 BFS 常撞节点上限：只落版面，解法与分数交给 recompute.js
    if (!sol.ok) {
      const dest = path.join(DIR, file);
      fs.writeFileSync(dest, JSON.stringify({
        set: SET, id: '仓库番-' + num, name: lv.name,
        origin: originOf(spec), lvKey: null,
        note: lv.note, tip: '推箱子改编 · ' + lv.w + '×' + lv.h,
        source: 'sokoban-screenshot', level: lv, meta: null, solution: null
      }, null, 1) + '\n', 'utf8');
      const big = SO.solveFile(dest);      // 大局面改走「按推」搜索，保住一份参考解
      console.log('ROOM ' + spec.room + '  ' + lv.w + '×' + lv.h +
        '  通用搜索截断（' + sol.reason + '）→ 推箱子专用求解 ' +
        (big.ok ? big.steps + ' 步 / ' + big.pushes + ' 推' : big.reason) +
        '；随后跑 node tools/recompute.js --only 推箱子');
      continue;
    }
    const hands = K.mergeMoves(sol.moves).length;
    const ana = K.analyze(L, st, lv.goals, { maxNodes: 1500000 });
    const diff = K.difficulty(ana);
    const meta = diff ? {
      score: diff.score, grade: diff.grade,
      depth: ana.depth, hands, states: ana.states, paths: ana.paths,
      estimated: !!diff.estimated || !!ana.truncated,
      ms: Date.now() - t0
    } : {
      score: null, grade: '不计分', depth: ana.depth, hands,
      states: ana.states, paths: ana.paths, estimated: true, ms: Date.now() - t0
    };
    const rec = {
      set: SET, id: '仓库番-' + num, name: lv.name,
      origin: originOf(spec), lvKey: null,
      note: lv.note, tip: '推箱子改编 · ' + lv.w + '×' + lv.h,
      source: 'sokoban-screenshot',
      level: lv, meta,
      solution: {
        solver: 'bfs', optimal: true, steps: sol.moves.length,
        hands, moves: sol.moves
      }
    };
    fs.writeFileSync(path.join(DIR, file), JSON.stringify(rec, null, 1) + '\n', 'utf8');
    console.log('ROOM ' + spec.room + '  ' + lv.w + '×' + lv.h +
      '  墙/箱/人 ' + L.pieces.length + ' 块  ' + sol.moves.length + ' 步 / ' + hands + ' 手  ' +
      ana.states + ' 态  ' + (diff ? diff.score + ' 分 ' + diff.grade : '不计分') +
      '  ' + (Date.now() - t0) + 'ms  → ' + file);
  }
  // 打包器按目录扫描（文件名排序 = 编号顺序），不需要额外清单文件
  const built = PK.writePacks(ROOT);
  console.log('\nlevelpacks.js 重建：' + built.count + ' 关；「推箱子」' + MAPS.length + ' 关');
}

module.exports = { MAPS, buildLevel, originOf };
if (require.main === module) main();
