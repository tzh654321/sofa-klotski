/* 把 hrs-parse 拆出来的「源关卡」转成本项目的关卡 JSON。
 *
 * 形状映射（不新增滑块，全部用现有形状）：
 *   vert → 1x2      horz → 2x1      O → 2x2(曹操/主角)   o → 2x2(星星)
 *   pawn → 1x1      wall → 1x1(lock)
 *   semi → semi    sofa → sofa     moon → threeQuarter
 *   L    → L3      C    → diagSemi   ← 源游戏里那块"可翻转的 L"就是斜半圆
 *
 * 带数字的方块（沙发 #、半圆 *、月亮 &、梯形 L、立体L C）怎么定位：
 *   文档规定数字写在哪一格 —— 沙发/半圆写在「1 方向时的最左端」，月亮/L/C 写在「中间（拐角）」。
 *   1 方向 = 各自的标准朝向；第 n 方向 = 1 方向逆时针转 (n-1) 次。
 *   于是：拿 1 方向的布局 + 数字所在格，转 (n-1) 次逆时针，再把数字格对准实际格 —— 块就落定了。
 *   本引擎的 ori 每 +1 是顺时针 90°，所以 ori = (DIR_BASE + 3*(n-1)) % 4。
 */
const K = require('../sofa-klotski.js');

const SHAPE_OF = {
  vert: '1x2', horz: '2x1', O: '2x2', o: '2x2', pawn: '1x1', wall: '1x1',
  semi: 'semi', sofa: 'sofa', moon: 'threeQuarter', L: 'L3', C: 'diagSemi'
};
const COLORS = {
  O: '#ff7f27', vert: '#3f48cc', horz: '#00a2e8', pawn: '#ffaec9',
  sofa: '#22b14c', semi: '#a349a4', moon: '#b97a57', L: '#8ab72a', C: '#5c00e6',
  o: '#7ddc9a', wall: '#6b6480'
};
const FAM_LABEL = {
  vert: '竖条', horz: '横条', O: '曹操', o: '星', pawn: '卒', wall: '墙',
  sofa: '沙发', semi: '半圆', moon: '月亮', L: '梯形L', C: '立体L'
};
/* 1 方向时本引擎对应的 ori：
 *   semi 1 = 弧朝上 —— 本引擎 semi ori0 的圆心在两格底边中点，弧正好朝上 → 0
 *   sofa 1 = 开口朝下 —— 本引擎 sofa ori0 缺口朝右，顺时针转 1 步朝下 → 1
 *   moon 1 = 开口朝右上 —— threeQuarter ori0 缺的是右下角，顺时针转 3 步缺右上 → 3
 *   L/C  1 = 开口朝右上 —— L3 / diagSemi ori0 缺的就是右上角 → 0
 */
const DIR_BASE = { semi: 0, sofa: 1, moon: 3, L: 0, C: 0 };
const DIR_FAM = ['sofa', 'semi', 'moon', 'L', 'C'];

const ORI_CACHE = {};
function orisOf(shape) {
  if (ORI_CACHE[shape]) return ORI_CACHE[shape];
  const raw = require('../shapes.js').resolve({ w: 8, h: 8, pieces: [{ id: 'p', x: 0, y: 0, shape }] });
  const L = K.parse(raw);
  ORI_CACHE[shape] = L.pieces[0].oris.map(o => o.cells.map(c => [c[0], c[1]]));
  return ORI_CACHE[shape];
}
const bboxOf = cells => [Math.max(...cells.map(c => c[0])) + 1, Math.max(...cells.map(c => c[1])) + 1];
function normCells(cells) {
  const mc = Math.min(...cells.map(c => c[0])), mr = Math.min(...cells.map(c => c[1]));
  return cells.map(([c, r]) => [c - mc, r - mr]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
const keyOfSet = cells => cells.map(c => c.join(',')).sort().join(';');

/** 单格逆时针转 90°：包围盒宽 w 时，格子的新最小角 = (y, w-x-1) */
const rotCellCCW = ([x, y], w) => [y, w - x - 1];

/** 1 方向时数字写在哪一格：沙发/半圆 = 最左端；月亮/L/C = 中间（拐角，与另两格都相邻） */
function digitCellLocal(fam, cells) {
  if (fam === 'sofa' || fam === 'semi') {
    return cells.reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? b : a));
  }
  for (const c of cells) {
    const deg = cells.filter(o => o !== c && Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) === 1).length;
    if (deg === 2) return c;                       // 拐角
  }
  return cells[0];
}

/** 某方向下的布局 + 数字所在格（局部坐标，已归一化） */
function dirLayout(fam, dir) {
  const base = DIR_BASE[fam];
  let cells = orisOf(SHAPE_OF[fam])[base].map(c => c.slice());
  let d = digitCellLocal(fam, cells).slice();
  for (let k = 0; k < ((dir - 1 + 4) % 4); k++) {
    const w = bboxOf(cells)[0];
    const rc = cells.map(c => rotCellCCW(c, w));
    const rd = rotCellCCW(d, w);
    const mc = Math.min(...rc.map(c => c[0])), mr = Math.min(...rc.map(c => c[1]));
    cells = rc.map(([x, y]) => [x - mc, y - mr])
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    d = [rd[0] - mc, rd[1] - mr];
  }
  return { cells, digit: d };
}

/** 数字格落在 (wx,wy) 时，整块该占哪几格 + 对应引擎 ori */
function placeByDigit(fam, dir, wx, wy) {
  const { cells, digit } = dirLayout(fam, dir);
  const placed = cells.map(([x, y]) => [x - digit[0] + wx, y - digit[1] + wy]);
  return {
    cells: placed, ori: (DIR_BASE[fam] + 3 * (dir - 1)) % 4,
    x: Math.min(...placed.map(c => c[0])), y: Math.min(...placed.map(c => c[1]))
  };
}

/* ══════════ 带数字的块：先解「数字该归哪个家族」，再落格 ══════════
 * 数字格可能同时挨着两种填充字符（比如旁边既有 'L' 又有 '*'），单看邻格会判错。
 * 这里把「每个数字格挑哪个家族」当一个小的精确覆盖问题解：
 * 所有填充格 + 数字格必须被恰好覆盖一次，解的优先级按候选数从少到多。
 */
const FAM_CHARS = { '#': 'sofa', '*': 'semi', '&': 'moon', L: 'L', C: 'C' };

function resolveDigitPieces(src) {
  const { grid, rows, cols } = src;
  const at = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols) ? ' ' : grid[r][c];
  const all = new Set();          // 需要被覆盖的格子（填充格 + 数字格）
  const digitCells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const ch = at(r, c);
      if (FAM_CHARS[ch]) all.add(c + ',' + r);
      else if (/[1-4]/.test(ch)) {
        const fams = [];
        for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const f = FAM_CHARS[at(r + dr, c + dc)];
          if (f && fams.indexOf(f) < 0) fams.push(f);
        }
        if (fams.length) { all.add(c + ',' + r); digitCells.push({ r, c, dir: +ch, fams }); }
      }
    }
  if (!digitCells.length) return [];

  const cands = digitCells.map(d => {
    const list = [];
    for (const fam of d.fams) {
      let pl;
      try { pl = placeByDigit(fam, d.dir, d.c, d.r); } catch (e) { continue; }
      const keys = pl.cells.map(([c, r]) => c + ',' + r);
      if (!keys.every(k => all.has(k))) continue;
      if (!keys.every(k => { const ch = at(+k.split(',')[1], +k.split(',')[0]); return FAM_CHARS[ch] === fam || /[1-4]/.test(ch); })) continue;
      list.push({ fam, dir: d.dir, ori: pl.ori, x: pl.x, y: pl.y, cells: pl.cells, keys, c: d.c, r: d.r });
    }
    return list;
  });
  if (cands.some(l => !l.length)) return null;

  const order = cands.map((l, i) => i).sort((a, b) => cands[a].length - cands[b].length);
  const used = new Set();
  const out = [];
  function dfs(k) {
    if (k === order.length) return used.size === all.size;
    for (const cd of cands[order[k]]) {
      if (cd.keys.some(x => used.has(x))) continue;
      cd.keys.forEach(x => used.add(x));
      out.push(cd);
      if (dfs(k + 1)) return true;
      out.pop();
      cd.keys.forEach(x => used.delete(x));
    }
    return false;
  }
  return dfs(0) ? out : null;
}

/* ══════════ 组装成关卡 JSON ══════════ */
const SHAPE_CHAR = { sofa: '#', semi: '*', moon: '&', L: 'L', C: 'C' };

function buildLevel(src, opts) {
  const o = opts || {};
  const w = src.cols, h = src.rows;
  const list = require('./hrs-parse.js').pieces(src);
  const [gr, gc] = src.goal;
  const pieces = [], seen = new Map();
  const n = {};
  let heroId = null;
  const digitPieces = resolveDigitPieces(src);
  if (!digitPieces) throw new Error(src.name + '：带数字的块解不出唯一覆盖');
  const digitByCell = new Map();
  for (const dp of digitPieces) digitByCell.set(dp.c + ',' + dp.r, dp);

  // 先把带数字的块放进去（它们的位置由数字决定）
  for (const dp of digitPieces) {
    for (const [c, r] of dp.cells) {
      const k = c + ',' + r;
      if (seen.has(k)) throw new Error(src.name + '：' + k + ' 被 ' + seen.get(k) + ' 和 ' + dp.fam + ' 同时占用');
      seen.set(k, dp.fam);
    }
    const tag = (n[dp.fam] = (n[dp.fam] || 0) + 1);
    pieces.push({
      id: dp.fam + tag, x: dp.x, y: dp.y, ori: dp.ori, shape: SHAPE_OF[dp.fam],
      color: COLORS[dp.fam], name: FAM_LABEL[dp.fam] + (n[dp.fam] > 1 ? tag : '')
    });
  }

  for (const s of list) {
    if (DIR_FAM.indexOf(s.fam) >= 0) continue;      // 已由 digitPieces 处理
    const isDigit = DIR_FAM.indexOf(s.fam) >= 0;
    let shape, ori, x, y, cells;
    if (isDigit) {
      const [dr, dc] = s.cells[0];                 // 数字格
      const pl = placeByDigit(s.fam, s.dir, dc, dr);
      shape = SHAPE_OF[s.fam]; ori = pl.ori; x = pl.x; y = pl.y; cells = pl.cells;
      // 落下的每一格必须是本家族的填充格或数字格
      for (const [c, r] of cells) {
        const ch = (src.grid[r] || [])[c] || ' ';
        if (ch !== SHAPE_CHAR[s.fam] && !/[1-4]/.test(ch))
          throw new Error(src.name + '：' + s.fam + ' dir' + s.dir + ' 落到了 ' + JSON.stringify(ch) + ' @' + c + ',' + r);
      }
    } else {
      shape = SHAPE_OF[s.fam]; ori = 0;
      x = Math.min(...s.cells.map(q => q[1])); y = Math.min(...s.cells.map(q => q[0]));
      cells = s.cells.map(([r, c]) => [c, r]);
    }
    for (const [c, r] of cells) {
      const k = c + ',' + r;
      if (seen.has(k)) throw new Error(src.name + '：' + k + ' 被 ' + seen.get(k) + ' 和 ' + s.fam + ' 同时占用');
      seen.set(k, s.fam);
    }
    const tag = (n[s.fam] = (n[s.fam] || 0) + 1);
    const isHero = s.fam === 'O' && !heroId;
    const id = isHero ? 'hero' : s.fam + tag;
    if (isHero) heroId = id;
    const p = {
      id, x, y, ori, shape,
      color: COLORS[s.fam] || '#8b8b8b',
      name: FAM_LABEL[s.fam] + (n[s.fam] > 1 ? tag : '')
    };
    if (isHero) p.hero = true;
    if (s.fam === 'wall') p.lock = true;
    pieces.push(p);
  }
  if (!heroId) throw new Error('没有曹操：' + src.name);
  const goals = [{
    piece: heroId, label: o.goalLabel || '底行正中',
    cells: [[gc, gr], [gc + 1, gr], [gc, gr + 1], [gc + 1, gr + 1]]
  }];
  return { name: o.name || src.name, w, h, pieces, goals, origin: src.name };
}

/** 校验：转换后的占格必须和源网格逐格一致（少一格多一格都要报） */
function verify(src, lv) {
  const raw = JSON.parse(JSON.stringify(lv));
  const L = K.parse(require('../shapes.js').resolve(raw));
  const st = K.initialState(raw);
  const got = new Map();
  L.pieces.forEach((p, i) => {
    for (const [c, r] of K.pieceCells(L, st, i)) got.set(c + ',' + r, p.id);
  });
  const bad = [];
  for (let r = 0; r < src.rows; r++)
    for (let c = 0; c < src.cols; c++) {
      const ch = src.grid[r][c];
      const k = c + ',' + r;
      if (ch === ' ') { if (got.has(k)) bad.push('多格 ' + k); }
      else if (!got.has(k)) bad.push('缺格 ' + k);
    }
  if (bad.length) throw new Error(src.name + ' 占格不一致：' + bad.slice(0, 6).join(' '));
  return { cells: got.size, pieces: L.pieces.length };
}

module.exports = {
  SHAPE_OF, COLORS, FAM_LABEL, DIR_BASE, DIR_FAM,
  orisOf, normCells, keyOfSet, rotCellCCW, digitCellLocal, dirLayout, placeByDigit,
  buildLevel, verify
};
