/* 解析「华容道ex」的关卡文本格式（GB18030，关卡之间用 ==== 行分隔）
 *   line0: 关卡名
 *   line1: 行数 列数  目标行 目标列   （行列从 1 开始；目标是「曹操左上角」）
 *   之后每行：行数行、列数格的字符
 *
 * 字符表（见 游戏说明.txt）：
 *   M/W 竖 1×2（M 在上）  < > 横 2×1    O 曹操 2×2    o 星星 2×2（四个小写 o）
 *   x 小兵 1×1    / 墙 1×1
 *   # 沙发 / * 半圆 / & 月亮 / L 梯形 / C 立体L：数字 1~4 是朝向锚点，其余格子用各自的填充字符
 * 朝向：1 = 标准方向，n = 1 方向「逆时针」转 n-1 次。
 *   沙发 1 = 开口向下；半圆 1 = 弧朝上；月亮/L/C 1 = 开口朝右上。
 */
const fs = require('fs');

const FILL = { '#': 'sofa', '*': 'semi', '&': 'moon', L: 'L', C: 'C' };

/** 源文件是 ANSI(GB18030)；先按 UTF-8 严格解码，失败再退回 GB18030 */
function readText(file) {
  const buf = fs.readFileSync(file);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder('gb18030').decode(buf); }
}

function parseFile(file) {
  const txt = readText(file).replace(/\r/g, '');
  const lines = txt.split('\n');
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    if (/^=+$/.test(line.trim())) {
      if (cur && cur.length) blocks.push(cur);
      cur = [];
      continue;
    }
    if (cur) cur.push(line);
  }
  if (cur && cur.length) blocks.push(cur);

  const out = [];
  for (const blk of blocks) {
    if (!blk.length) continue;
    const name = blk[0].trim();
    const dim = (blk[1] || '').trim().split(/\s+/).map(Number);
    if (dim.length < 4 || !dim[0]) { console.error('跳过（表头不认识）：' + name); continue; }
    const [rows, cols, gr, gc] = dim;
    const grid = [];
    for (let r = 0; r < rows; r++) {
      const s = (blk[2 + r] == null ? '' : blk[2 + r]).replace(/\s+$/, '');
      const row = [];
      // 文本里格子之间用一个空格分隔（"M x x x"），空格本身也是「空气格」，
      // 所以第 c 格永远在字符位置 2c 上；长行短的按空气补。
      const glued = s.length === cols && s.indexOf(' ') < 0;
      for (let c = 0; c < cols; c++) row.push((glued ? s[c] : s[2 * c]) || ' ');
      grid.push(row);
    }
    out.push({ name, rows, cols, goal: [gr - 1, gc - 1], grid });
  }
  return out;
}

/** 把一关的字符网格拆成「块」：每个块 = 一组格子 + 家族（M/W 竖、<> 横、O、o、x、/、#、*、&、L、C） */
function pieces(level) {
  const { grid, rows, cols } = level;
  const at = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols) ? ' ' : grid[r][c];
  const used = new Set();
  const out = [];
  const take = cells => { cells.forEach(([r, c]) => used.add(r + ',' + c)); };

  // 1) 数字锚点：先定家族（看 4-邻里有哪个填充字符）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(r, c);
      if (!/[1-4]/.test(ch)) continue;
      if (used.has(r + ',' + c)) continue;
      let fam = null;
      for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const f = FILL[at(r + dr, c + dc)];
        if (f) { fam = f; break; }
      }
      if (!fam) { console.error('  数字 ' + ch + ' 找不到填充字符 @' + r + ',' + c); continue; }
      const fillCh = Object.keys(FILL).find(k => FILL[k] === fam);
      // 从锚点做 4-邻洪水，收集「同家族的填充格 + 数字格」
      const cells = [], q = [[r, c]];
      used.add(r + ',' + c);
      while (q.length) {
        const [cr, cc] = q.pop();
        cells.push([cr, cc]);
        for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nr = cr + dr, nc = cc + dc;
          const nk = nr + ',' + nc;
          if (used.has(nk)) continue;
          const nch = at(nr, nc);
          if (nch === fillCh || (/[1-4]/.test(nch) && FILL[fillCh])) {
            if (nch !== fillCh && !/[1-4]/.test(nch)) continue;
            // 同族的其它数字也可能是另一块的一部分，交给外层循环；这里只吃本块
            if (nch !== fillCh) continue;
            used.add(nk); q.push([nr, nc]);
          }
        }
      }
      out.push({ fam, dir: +ch, cells });
    }
  }

  // 2) 无方向件
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r + ',' + c;
      if (used.has(k)) continue;
      const ch = at(r, c);
      if (ch === ' ') continue;
      if (ch === 'O' || ch === 'o') {
        const cells = [[r, c], [r + 1, c], [r, c + 1], [r + 1, c + 1]];
        cells.forEach(([a, b]) => { if (at(a, b) !== ch) console.error('  ' + ch + ' 不是 2×2 @' + r + ',' + c); });
        take(cells); out.push({ fam: ch, cells });
      } else if (ch === 'M') {
        const cells = [[r, c], [r + 1, c]];
        if (at(r + 1, c) !== 'W') console.error('  M 下面不是 W @' + r + ',' + c);
        take(cells); out.push({ fam: 'vert', cells });
      } else if (ch === 'W') {
        const cells = [[r - 1, c], [r, c]];
        if (at(r - 1, c) !== 'M') console.error('  W 上面不是 M @' + r + ',' + c);
        take(cells); out.push({ fam: 'vert', cells });
      } else if (ch === '<') {
        const cells = [[r, c], [r, c + 1]];
        if (at(r, c + 1) !== '>') console.error('  < 右边不是 > @' + r + ',' + c);
        take(cells); out.push({ fam: 'horz', cells });
      } else if (ch === '>') {
        const cells = [[r, c - 1], [r, c]];
        if (at(r, c - 1) !== '<') console.error('  > 左边不是 < @' + r + ',' + c);
        take(cells); out.push({ fam: 'horz', cells });
      } else if (ch === 'x' || ch === '/') {
        take([[r, c]]); out.push({ fam: ch === 'x' ? 'pawn' : 'wall', cells: [[r, c]] });
      } else if (FILL[ch]) {
        // 这里的按字符分组只是粗分；真正"哪几格属于同一块"由 hrs2level 的精确覆盖决定，
        // 所以走到这里不算错误（多块同族相邻时会先被数字锚点吃掉一部分）
        take([[r, c]]); out.push({ fam: FILL[ch], cells: [[r, c]] });
      } else if (/[1-4]/.test(ch)) {
        take([[r, c]]);
      } else {
        console.error('  未知字符 ' + JSON.stringify(ch) + ' @' + r + ',' + c);
      }
    }
  }
  return out;
}

module.exports = { parseFile, pieces, readText };

if (require.main === module) {
  const lv = parseFile(process.argv[2]);
  console.log('共 ' + lv.length + ' 关');
  for (const l of lv) {
    const ps = pieces(l);
    const tally = {};
    ps.forEach(p => { tally[p.fam] = (tally[p.fam] || 0) + 1; });
    const cells = ps.reduce((n, p) => n + p.cells.length, 0);
    console.log(l.name.padEnd(16) + ' ' + l.cols + '×' + l.rows + ' goal=' + l.goal.join(',') +
      ' 块=' + ps.length + ' 占格=' + cells + '/' + l.cols * l.rows + '  ' +
      Object.keys(tally).map(k => k + '×' + tally[k]).join(' '));
  }
}
