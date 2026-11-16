/* 把社区「推箱子文本关卡」转成我们的关卡 json（LURD 解法一并复现）
 *
 *   node tools/import-wall-text.js --in 关卡.txt --style sokoban --set 推箱子 --no 09 \
 *        --style community --name "狼烟四起2-1" --origin "Zou Yongzhong(20603)"
 *   node tools/import-wall-text.js --text "...@@..." --name ... --dry
 *
 * 字符表（社区通行写法）：
 *   @  人            +  人站在目标点上
 *   $  箱子          *  箱子已在目标点上
 *   #  墙            .  目标点
 *   - / _ / 空格     空地
 * 解法用 LURD 记：小写 l r u d = 走一格，大写 L R U D = 推动一格。
 * 目标与其余推箱子关一致：所有箱子 → 所有目标点（任意箱占任意点）。
 *
 * 墙按 4 连通合并成一块（紧挨的墙本来就是一堵墙）；箱子一律 1×1 一次被动块。
 * 复现不出来的字母会列出来（作者笔误通常 1~2 处），但绝不静默改解法。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');

/* 两套块名/配色，用来在同一个「推箱子」关卡集里一眼分开两类关：
 *   ports     —— 老游戏「仓库番」移植关，与 tools/gen-sokoban.js 完全一致
 *   community —— 社区文本关，岩石色系（岩壁／乱石／石匠） */
const STYLES = {
  ports: {
    wall: { name: '砖墙', color: '#9c3a2e' },
    box: { name: '木箱', color: '#d9a441' },
    player: { name: '推箱人', color: '#3f7fd6' }
  },
  community: {
    wall: { name: '岩壁', color: '#3f4756' },
    box: { name: '乱石', color: '#a08b6a' },
    player: { name: '石匠', color: '#ffb03a' }
  }
};

const DIRS = { r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1] };
const WALL = '#', FLOOR = '-_. ';

/** 从一行文本里抠出棋盘、标题、作者、解法 */
function parseText(txt) {
  const flat = txt.replace(/\r/g, '').replace(/\n/g, ' ').trim();
  const mSol = flat.match(/Solution\s*:\s*([RLUDrlud]+)/);
  const mTitle = flat.match(/Title\s*:\s*([^\n]*?)\s*(?:Author\s*:|$)/);
  const mAuthor = flat.match(/Author\s*:\s*([^\n]*?)\s*(?:Solution\s*:|$)/);
  const board = flat.split(/Title\s*:/)[0].replace(/\s+/g, '');
  const bad = [...new Set(board.replace(/[#\-_.@+$*o]/g, ''))];
  if (bad.length) throw new Error('版面里有不认识的字符：' + JSON.stringify(bad));
  return {
    board,
    title: mTitle ? mTitle[1].trim() : '',
    author: mAuthor ? mAuthor[1].trim() : '',
    solution: mSol ? mSol[1] : ''
  };
}

/** 只靠版面反推宽度：长度能整除、且每行都「以墙开头、以墙结尾」的那个解 */
function inferWidth(s) {
  let best = null;
  for (let w = 3; w <= s.length / 3; w++) {
    if (s.length % w) continue;
    const h = s.length / w;
    let bad = 0;
    for (let r = 0; r < h; r++) {
      const row = s.slice(r * w, (r + 1) * w);
      if (row[0] !== '#' || row[w - 1] !== '#') bad++;
    }
    const score = bad * 100 + Math.abs(w - h);   // 同样「坏行数」时取更接近正方形的
    if (!best || score < best.score) best = { w, h, bad, score };
  }
  if (!best) throw new Error('版面长度 ' + s.length + ' 反推不出宽度');
  if (best.bad) throw new Error('反推宽度 ' + best.w + ' 时仍有 ' + best.bad + ' 行不以墙收口，格式不对');
  return best;
}

function buildLevel(spec) {
  const { board, w, h } = spec;
  const S = STYLES[spec.style] || STYLES.ports;
  const at = (c, r) => (c < 0 || r < 0 || c >= w || r >= h) ? WALL : board[r * w + c];
  const pieces = [], wallCells = [], spots = [], boxIds = [];
  let uid = 0, hasPlayer = false;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = at(c, r);
      if (ch === WALL) { wallCells.push([c, r]); continue; }
      if (ch === '$' || ch === '*') {
        const id = 'box' + (uid++);
        boxIds.push(id);
        pieces.push({ id, x: c, y: r, ori: 0, shape: '1x1', onceOnly: true, color: S.box.color, name: S.box.name });
        if (ch === '*') spots.push([[c, r]]);          // 开局就站在目标点上
      } else if (ch === '@' || ch === '+') {
        if (hasPlayer) throw new Error('人不止一个 @' + c + ',' + r);
        hasPlayer = true;
        pieces.push({
          id: 'player', x: c, y: r, ori: 0, shape: '1x1',
          color: S.player.color, name: S.player.name, hero: true
        });
        if (ch === '+') spots.push([[c, r]]);
      } else if (ch === '.') {
        spots.push([[c, r]]);
      } else if (FLOOR.indexOf(ch) >= 0) {
        /* 空地 */
      } else {
        throw new Error('未处理的字符 ' + JSON.stringify(ch) + ' @' + c + ',' + r);
      }
    }
  }
  if (!hasPlayer) throw new Error('没有 @ 主角');
  if (!boxIds.length) throw new Error('没有 $ 箱子');
  if (boxIds.length !== spots.length) {
    throw new Error('箱子 ' + boxIds.length + ' 只 / 目标点 ' + spots.length +
      ' 个，对不上（推箱子的目标是「所有箱子到所有点」）');
  }

  /* 紧挨的墙合成一块：4 连通分量 → 一个自绘锁定块 */
  const left = new Set(wallCells.map(([c, r]) => c + ',' + r));
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
    pieces.unshift({
      id: 'w' + (++uid), x: c0, y: r0, shape: 'custom',
      cells: comp.map(([x, y]) => [x - c0, y - r0]),
      rot: false, lock: true, color: S.wall.color, name: S.wall.name
    });
  }

  return {
    name: spec.name, w, h,
    note: spec.note,
    pieces,
    // 与其余推箱子关同一 schema：任意箱占任意点，need:'all' 要求全部归位
    goals: [{ pieces: boxIds, spots, need: 'all' }]
  };
}

/** 去掉「整圈全是墙」的装饰边框：外圈全是 # 就裁一圈，反复裁到不再是纯墙圈
 *  （裁掉的都是锁定墙，几何与解法只差一个平移，箱子/目标的位置关系不变） */
function cropFrame(board, w, h) {
  let cut = 0;
  while (w > 3 && h > 3) {
    let solid = true;
    for (let c = 0; c < w && solid; c++) if (board[c] !== '#' || board[(h - 1) * w + c] !== '#') solid = false;
    for (let r = 0; r < h && solid; r++) if (board[r * w] !== '#' || board[r * w + w - 1] !== '#') solid = false;
    if (!solid) break;
    const next = [];
    for (let r = 1; r < h - 1; r++) next.push(board.slice(r * w + 1, r * w + w - 1));
    board = next.join(''); w -= 2; h -= 2; cut++;
  }
  return { board, w, h, cut };
}

/** 按 LURD 复现作者解法：小写=走、大写=推；返回 { moves, misses, ok, pushes } */
function replay(lv, sol) {
  const raw = SH.resolve(JSON.parse(JSON.stringify(lv)));
  const L = K.parse(raw);
  const st = K.initialState(raw);
  const back = new Map(L.pieces.map((p, i) => [p.id, i]));
  const playerIdx = back.get('player');
  let s = st, misses = [];
  const moves = [];
  for (let i = 0; i < sol.length; i++) {
    const ch = sol[i], [dx, dy] = DIRS[ch.toLowerCase()];
    if (!dx && !dy) { misses.push([i, ch, '方向字符不认识']); break; }
    const push = /[A-Z]/.test(ch);
    const cand = K.moves(L, s).filter(m => m.i === playerIdx && m.dx === dx && m.dy === dy);
    const want = cand.find(m => (m.t === 'p') === push);
    if (!want) {
      const alt = cand[0];
      misses.push([i, ch, push
        ? (alt ? '大写要推，但这一步推不动' : '没有这个方向的走法')
        : (alt ? '小写是走，但这一步只能推' : '没有这个方向的走法')]);
      break;
    }
    moves.push({ i: want.i, t: want.t, dx: want.dx, dy: want.dy, ...(want.chain ? { chain: want.chain } : {}) });
    s = K.apply(s, want);
  }
  return {
    moves, misses,
    ok: misses.length === 0 && K.isGoal(L, s, raw.goals),
    pushes: moves.filter(m => m.t === 'p').length,
    hands: K.mergeMoves(moves).length
  };
}

function main() {
  const argv = process.argv.slice(2);
  const argOf = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const has = k => argv.indexOf(k) >= 0;
  let txt = argOf('--text');
  if (!txt) {
    const f = argOf('--in');
    if (!f) throw new Error('用法：--in 关卡.txt 或 --text "版面..."');
    txt = fs.readFileSync(f, 'utf8');
  }
  const p = parseText(txt);
  const dim = inferWidth(p.board);
  const style = argOf('--style') === 'community' ? 'community' : 'ports';
  // 默认裁掉「整圈都是墙」的装饰边框；--keep-frame 保留
  let board = p.board, w = dim.w, h = dim.h;
  if (!has('--keep-frame')) {
    const cr = cropFrame(board, w, h);
    board = cr.board; w = cr.w; h = cr.h;
    if (cr.cut) console.log('裁掉装饰边框 ' + cr.cut + ' 圈：' + dim.w + '×' + dim.h + ' → ' + w + '×' + h);
  }
  console.log('版面 ' + w + '×' + h + '  Title=' + JSON.stringify(p.title) +
    '  Author=' + JSON.stringify(p.author) + '  解法 ' + p.solution.length + ' 个字母');

  const no = (argOf('--no') || '99').padStart(2, '0');
  const name = argOf('--name') || (style === 'community' ? (p.title || '未命名') : '仓库番 ' + no.replace(/^0/, ''));
  const origin = argOf('--origin') || p.title || '';
  const lv = buildLevel({
    board, w, h, name, style,
    note: (argOf('--note') || '') || (w + '×' + h + ' 推箱子；墙=锁定块、箱=一次被动块、人=普通块。' +
      '评分按「手」计：全程一次连续拖动 = 1 手，难度分偏低是评分口径，不代表关卡简单。')
  });

  const rows = [];
  for (let r = 0; r < h; r++) rows.push(board.slice(r * w, (r + 1) * w));
  console.log(rows.map((s, i) => String(i).padStart(2) + ' ' + s).join('\n'));
  console.log('块数 ' + lv.pieces.length + '（墙 ' + lv.pieces.filter(x => x.lock).length +
    ' / 箱 ' + lv.pieces.filter(x => x.onceOnly).length + ' / 人 ' +
    lv.pieces.filter(x => !x.lock && !x.onceOnly).length + '）  目标点 ' + lv.goals[0].spots.length);

  const rep = replay(lv, p.solution);
  console.log('复现解法：' + rep.moves.length + '/' + p.solution.length + ' 步（' + rep.pushes + ' 推），' +
    rep.hands + ' 手，全部箱子归位=' + rep.ok);
  if (rep.misses.length) console.log('复现存疑：' + JSON.stringify(rep.misses.slice(0, 8)));
  if (!rep.ok) throw new Error('解法复现不到「箱全归位」，先核对版面/解法');

  if (has('--dry')) return;
  const set = argOf('--set') || '推箱子';
  // 文件名不带空格、跟关卡名一致（「狼烟四起2-1」→ 09_狼烟四起2-1.json）
  const file = argOf('--file') || (no + '_' + name.replace(/\s+/g, '') + '.json');
  const dest = path.join(__dirname, '..', 'levels', set, file);
  const rec = {
    set, id: '推箱子-' + no, name, origin, lvKey: null,
    note: lv.note,
    tip: (style === 'community' ? '社区关卡 · ' : '推箱子改编 · ') + w + '×' + h,
    source: 'sokoban-text',
    level: lv, meta: null,
    solution: {
      solver: 'imported-lurd', optimal: false,
      steps: rep.moves.length, hands: rep.hands, moves: rep.moves
    }
  };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(rec, null, 1) + '\n', 'utf8');
  console.log('已写入 ' + path.relative(path.join(__dirname, '..'), dest).replace(/\\/g, '/') +
    '；接着跑 node tools/solve-sokoban.js <file> 与 node tools/recompute.js --file <file>');
}

module.exports = { parseText, inferWidth, cropFrame, buildLevel, replay, STYLES };
if (require.main === module) main();
