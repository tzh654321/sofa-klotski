/* 把 tools/inbox/new-levels.js 里的手工关写进 levels/<集>/(算难度、算解法、改名配色)
 *
 *   node tools/add-levels.js           # 全部写入（同名会原地覆盖，重复跑不会重复加）
 *   node tools/add-levels.js --dry      # 只算不写
 *
 * 每关一个文件：levels/<集>/NN_<名字>.json（列表就是目录本身，没有清单文件）。
 * 大迷宫这类「一整张迷宫图」的关卡用 mazeText 给，工具会还原格子、把墙做成 lock 块、
 * 把 2×2 主角放到最远的可达位置（迷宫没有目标标记时的兜底）。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');

const ROOT = path.join(__dirname, '..', 'levels');
const LIST = require('./inbox/new-levels.js');
const DRY = process.argv.indexOf('--dry') >= 0;

/* ══════════ 命名 / 配色（同一关一套词汇；用户存档的原名进 note） ══════════ */
const THEME = {
  '深夜食堂': {
    hero: 'u10',
    p: {
      u10: ['寿司拼盘', '#E8B04B'], u11: ['玉子烧', '#F6D55C'], u12: ['黄瓜卷', '#4CAF50'],
      u13: ['芥末', '#A5D6A7'], u14: ['饭团', '#F2F2F2'], u15: ['天妇罗', '#D98324']
    }
  },
  '抓娃娃机': {
    hero: 'u13',
    p: {
      c9: ['钢爪', '#B0BEC5'], c11: ['铜爪', '#FFB74D'], c12: ['铁爪', '#78909C'],
      c14: ['出货口', '#FFD54F'], u13: ['摇杆', '#EF5350'], u15: ['娃娃', '#F06292']
    }
  },
  '冰箱贴': {
    hero: 'u10',
    p: {
      u8: ['冰箱门', '#607D8B'], u9: ['鸡蛋', '#FFF8E1'], u10: ['西瓜', '#E53935'],
      u11: ['牛奶盒', '#ECEFF1'], u12: ['香蕉', '#FFCA28']
    }
  },
  '冷冻室': {
    hero: 'u10',
    p: {
      u8: ['冰箱门', '#607D8B'], u9: ['冰块', '#B3E5FC'], u10: ['冰淇淋桶', '#F48FB1'],
      u11: ['速冻饺子', '#FFF3E0'], u12: ['雪糕', '#FFE082'], u15: ['保鲜盒', '#B2DFDB'],
      u22: ['甜筒', '#D7CCC8'], u24: ['冰格', '#81D4FA'], u25: ['霜花', '#E1F5FE']
    }
  },
  '电路板': {
    hero: 'u10',
    p: {
      u8: ['焊盘', '#FFB300'], u10: ['芯片', '#455A64'], u11: ['排线', '#FFD54F'],
      u24: ['螺丝孔', '#90A4AE'], u10b: ['电阻', '#8D6E63'], u11b: ['散热片', '#B0BEC5']
    }
  },
  '巨石阵': {
    hero: 'hero',
    p: { hero: ['巨石', '#9E9E9E'] },
    wall: ['立石', '#616161']
  },
  '集装箱': {
    hero: 'u10',
    p: {
      u8: ['小柜', '#00897B'], u10: ['大柜', '#1E88E5'], u24: ['迷你柜', '#6D4C41'],
      u10b: ['长柜', '#43A047'], u7: ['扁柜', '#F4511E'], u8b: ['竖柜', '#8E24AA'],
      u9: ['高柜', '#FDD835']
    }
  },
  '气球摊': {
    hero: 'u10',
    p: {
      u8: ['挡板', '#795548'], u24: ['摊柱', '#6D4C41'], u8b: ['铁架', '#8D6E63'],
      u9: ['打气筒', '#78909C'], u10b: ['气罐', '#26A69A'], u11: ['绳子', '#FFEE58'],
      u10: ['气球串', '#FF7043'],
      u12: ['红气球', '#EF5350'], u13: ['黄气球', '#FFCA28'], u14: ['蓝气球', '#42A5F5'],
      u15: ['绿气球', '#66BB6A']
    }
  },
};

function dress(lv, th) {
  const miss = [];
  for (const p of lv.pieces) {
    const spec = (th.p && th.p[p.id]) || (p.lock && th.wall) || null;
    if (!spec) { miss.push(p.id); continue; }
    p.name = spec[0];
    if (spec[1]) p.color = spec[1];
    if (th.hero === p.id) p.hero = true;
  }
  if (miss.length) console.log('   ！这些块没有命名：' + miss.join(' '));
}

/* ══════════ 迷宫图 → 关卡（"/" 墙，O O = 2×2 主角） ══════════ */
function parseMaze(text) {
  for (let W = 4; W <= 24; W++) {
    const step = 2 * W;                       // 每行 2W-1 个字符 + 1 个换行
    if ((text.length + 1) % step) continue;
    const H = (text.length + 1) / step;
    if (H < 4) continue;
    let ok = true; const grid = [];
    for (let r = 0; r < H && ok; r++) {
      const row = text.slice(r * step, r * step + 2 * W - 1);
      const cells = [];
      for (let c = 0; c < W; c++) {
        const gap = row[2 * c + 1];
        if (gap != null && gap !== ' ') ok = false;   // 格子之间必须是空格，否则行宽猜错
        cells.push(row[2 * c] || ' ');
      }
      grid.push(cells);
    }
    if (!ok) continue;
    let hero = null;
    for (let r = 0; r < H - 1 && !hero; r++) {
      for (let c = 0; c < W - 1; c++) {
        if (grid[r][c] === 'O' && grid[r][c + 1] === 'O' && grid[r + 1][c] === 'O' && grid[r + 1][c + 1] === 'O') {
          hero = [c, r]; break;
        }
      }
    }
    if (hero) return { w: W, h: H, grid, hero };
  }
  return null;
}

function buildMaze(e) {
  const m = parseMaze(e.mazeText);
  if (!m) throw new Error('迷宫图认不出来（行宽/换行对不上）');
  const { w, h, grid } = m;
  const pieces = [];
  let n = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[r][c] !== '/') continue;
      pieces.push({ id: 'w' + (++n), x: c, y: r, ori: 0, shape: '1x1', color: '#616161', name: '立石', lock: true });
    }
  }
  pieces.push({ id: 'hero', x: m.hero[0], y: m.hero[1], ori: 0, shape: '2x2', color: '#9E9E9E', name: '巨石', hero: true });
  const lv = { name: e.name, w, h, pieces, goals: [] };
  // 目标：2×2 能挪到的最远位置（迷宫图里没画终点时的兜底）
  const wall = (c, r) => c < 0 || r < 0 || c >= w || r >= h || grid[r][c] === '/';
  const free2 = (x, y) => !wall(x, y) && !wall(x + 1, y) && !wall(x, y + 1) && !wall(x + 1, y + 1);
  const key = (x, y) => x + ',' + y;
  const dist = new Map([[key(m.hero[0], m.hero[1]), 0]]);
  const q = [[m.hero[0], m.hero[1]]];
  let far = [m.hero[0], m.hero[1]], farD = 0;
  for (let head = 0; head < q.length; head++) {
    const [x, y] = q[head], d = dist.get(key(x, y));
    if (d > farD) { farD = d; far = [x, y]; }
    for (const [dx, dy] of K.DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (!free2(nx, ny) || dist.has(key(nx, ny))) continue;
      dist.set(key(nx, ny), d + 1);
      q.push([nx, ny]);
    }
  }
  const [gx, gy] = far;
  lv.goals = [{ piece: 'hero', label: '最远可达', cells: [[gx, gy], [gx + 1, gy], [gx, gy + 1], [gx + 1, gy + 1]] }];
  console.log('   迷宫 ' + w + '×' + h + '，墙 ' + n + ' 块；2×2 可达 ' + dist.size + ' 个位置，' +
    '最远 ' + farD + ' 步 @(' + gx + ',' + gy + ')');
  return lv;
}

/* ══════════ 难度 + 解法 ══════════ */
function analyze(lv) {
  const raw = SH.resolve(JSON.parse(JSON.stringify(lv)));
  const L = K.parse(raw), st = K.initialState(raw);
  const out = { meta: null, solution: null };
  const t0 = Date.now();
  let q = K.quickSolve(L, st, raw.goals, { maxNodes: 300000, weight: 4 });
  if (!q || !q.ok) q = K.quickSolve(L, st, raw.goals, { maxNodes: 1500000, weight: 6 });
  if (!q || !q.ok) q = K.quickSolve(L, st, raw.goals, { maxNodes: 4000000, weight: 10 });
  if (q && q.ok) {
    out.solution = {
      solver: 'quick-A*', optimal: false,
      steps: q.moves.length, hands: K.mergeMoves(q.moves).length, moves: q.moves
    };
  }
  let res = null;
  try { res = K.analyze(L, st, raw.goals, { maxNodes: 900000 }); } catch (e) { res = null; }
  if (res) {
    const d = K.difficulty(res);
    out.meta = {
      score: d ? d.score : null, grade: d ? d.grade : null,
      depth: res.depth > 0 ? res.depth : null, hands: res.hands > 0 ? res.hands : null,
      states: res.states, paths: res.paths,
      waste: res.interference ? res.interference.waste : null,
      same: res.interference ? res.interference.same : null,
      estimated: !!(res.truncated || (d && d.estimated)),
      ms: Date.now() - t0
    };
    if (out.solution && res.depth > 0 && res.depth < out.solution.steps) {
      out.solution.steps = res.depth;
      out.solution.optimal = true;
    }
  }
  return out;
}

/* ══════════ 落盘：按名字幂等；换了关卡集就搬过去；清单从磁盘重建 ══════════ */
function scanAll() {
  const out = [];
  for (const set of fs.readdirSync(ROOT)) {
    if (set[0] === '_') continue;
    const dir = path.join(ROOT, set);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.json$/.test(f) || f[0] === '_') continue;
      let rec = null;
      try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
      out.push({ set, file: f, rec });
    }
  }
  return out;
}
function trashIt(set, file) {
  const trash = path.join(ROOT, '_trash', set);
  fs.mkdirSync(trash, { recursive: true });
  try { fs.renameSync(path.join(ROOT, set, file), path.join(trash, file)); }
  catch (e) { console.warn('   ！挪不动 ' + set + '/' + file + '（' + e.message + '）'); }
}
function nextNum(set) {
  const dir = path.join(ROOT, set);
  fs.mkdirSync(dir, { recursive: true });
  const nums = fs.readdirSync(dir).filter(f => /^\d+_/.test(f)).map(f => parseInt(f, 10));
  return String((nums.length ? Math.max.apply(null, nums) : 0) + 1).padStart(2, '0');
}
const dirty = new Set();
let added = 0;
for (const e of LIST) {
  console.log('\n▶ ' + e.name + '（' + e.set + '，原「' + (e.was || e.name) + '」）');
  let lv;
  if (e.hrs) {
    const { parseFile } = require('./hrs-parse.js');
    const { buildLevel, verify } = require('./hrs2level.js');
    const src = parseFile(e.hrs.file).find(x => x.name === e.hrs.name);
    if (!src) throw new Error('源文件里没有这一关：' + e.hrs.name);
    lv = buildLevel(src, { name: e.name });
    console.log('   源 ' + src.cols + '×' + src.rows + '，目标 ' + JSON.stringify(src.goal) +
      '，校验 ' + JSON.stringify(verify(src, lv)));
  } else if (e.mazeText) {
    lv = buildMaze(e);
  } else {
    lv = JSON.parse(JSON.stringify(e.level));
  }
  const th = THEME[e.name];
  if (th) dress(lv, th); else console.log('   （没有主题表：用关卡里自带的名字/颜色）');
  const an = analyze(lv);
  console.log('   ' + lv.pieces.length + ' 块 · ' +
    (an.meta ? an.meta.score + ' 分 ' + an.meta.grade + ' / 深 ' + an.meta.depth + ' 手 ' + an.meta.hands +
      ' / 态 ' + an.meta.states + (an.meta.estimated ? '（估）' : '') : '无难度') +
    (an.solution ? ' · 解 ' + an.solution.steps + ' 步' : ' · 无解'));
  if (DRY) continue;

  // 同名的旧记录（可能还在别的关卡集里）：换了集就搬，名字变了也算同一条
  const prev = scanAll().find(x => x.rec.name === e.name ||
    (e.was && (x.rec.origin === e.was || x.rec.name === e.was)));
  let num;
  if (prev && prev.set === e.set) num = String(prev.file).slice(0, 2);
  else {
    num = nextNum(e.set);
    if (prev) { trashIt(prev.set, prev.file); dirty.add(prev.set); console.log('   从 ' + prev.set + '/' + prev.file + ' 搬到 ' + e.set); }
  }
  const file = num + '_' + e.name + '.json';
  const rec = {
    set: e.set, id: e.set + '-' + num, name: e.name,
    origin: e.was || '', lvKey: null, note: e.note || ('用户存档「' + (e.was || e.name) + '」'),
    source: e.hrs ? 'hrs' : (e.mazeText ? 'maze' : 'inbox'),
    level: lv, meta: an.meta, solution: an.solution
  };
  if (e.hrs) rec.hrsFrom = e.hrs.name;
  fs.writeFileSync(path.join(ROOT, e.set, file), JSON.stringify(rec, null, 1) + '\n', 'utf8');
  dirty.add(e.set);
  added++;
}
console.log('\n' + (DRY ? '（dry-run，没有写文件）' : '写入 ' + added + ' 关，重建清单：' + [...dirty].join(' / ')) +
  '\n记得跑 node tools/build-levelpacks.js');
