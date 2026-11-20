/* v26：汉诺塔 · 塞块 171（正式关）
 *   node test/v26-hanoi171.test.js
 *
 * 这一关是「最多能塞几块」的上界证书，塞块 171 个：文件层先验（块/目标/解法回放/手数/分数/关卡包一致），
 * 页面层再验（载入、块名留空不画字、按需回放状态、进度条跳转、复位）。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');
const { launch, sleep } = require('./cdp.js');
const { solverJsOf, loadSolver, findLevelBySolver, ROOT } = require('../tools/load-solver.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

// 按「关卡 JSON 里声明的 solverJs」找关卡，不写死文件名/编号/关卡名：
// 合移位里两关都指向 solve-hanoi.js，用「178 块 / 171 无名块」这一结构特征挑出塞块关。
const WANT_JS = 'tools/solve-hanoi.js';
const hits = findLevelBySolver('合移位', WANT_JS) || [];
const hit = hits.find(h => {
  const ps = (h.rec.level || h.rec).pieces || [];
  return ps.length === 178 && ps.filter(p => !p.name).length === 171;
});
ok(!!hit, '按 solverJs 属性找到塞块关（不依赖文件名/编号/name）', hits.map(h => h.file));

console.log('[1] 文件层：块 / 目标 / 解法');
const rec = hit.rec;
const NAME = rec.name;                       // 期望值从文件自身读，改名不影响断言
ok(typeof NAME === 'string' && NAME.length > 0, '关卡名非空（从文件读取）', NAME);
ok(rec.level.w === 29 && rec.level.h === 14, '29×14 棋盘', [rec.level.w, rec.level.h]);
ok(rec.level.solver === 'hanoi', '声明 hanoi 专用求解（通用 BFS 会爆炸）', rec.level.solver);
ok(solverJsOf(rec.level) === WANT_JS, 'solverJs 指向求解器 js', solverJsOf(rec.level));
{
  let loaded = null, err = null;
  try { loaded = loadSolver(rec.level); } catch (e) { err = e.message; }
  ok(loaded && typeof loaded.solve === 'function', '按 solverJs 动态载入求解器成功', err || (loaded && loaded.js));
}

const pieces = rec.level.pieces;
const unnamed = pieces.filter(p => !p.name).length;
ok(pieces.length === 178, '178 个块（5 环 + 2 门柱 + 171 塞块）', pieces.length);
ok(unnamed === 171, '171 个塞块没有名字（界面不画字）', unnamed);
// 环的名字会改（比如换成 MC 段位），这里只认结构：5 个环 + 2 根门柱
const named = pieces.filter(p => p.name);
const pillars = named.filter(p => p.name === '门柱').length;
ok(named.length === 7 && pillars === 2, '五个环 + 两根门柱都在（名字可变）', named.map(p => p.name));

const goal = rec.level.goals[0];
ok(rec.level.goals.length === 1 && goal.piece === 'c8' && goal.cells.length === 17,
  '目标只有一条：火环 17 格搬到右厅', { piece: goal.piece, cells: goal.cells.length });

const raw = SH.resolve(JSON.parse(JSON.stringify(rec.level)));
const L = K.parse(raw), st0 = K.initialState(raw);
let st = st0;
const states = [st];
for (const m of rec.solution.moves) { st = K.apply(st, m); states.push(st); }
ok(K.isGoal(L, st, raw.goals), '解法回放到终局达成');
ok(rec.solution.moves.length === rec.solution.steps, 'solution.steps 与走法数一致', [rec.solution.steps, rec.solution.moves.length]);
const hands = K.handsOf(L, states, rec.solution.moves).length;
ok(hands === rec.solution.hands, '手数（同块连续 = 一手）与文件一致', [hands, rec.solution.hands]);
ok(hands <= 5977, '新版手数不高于旧版 5977 手', hands);
ok(rec.solution.steps < 54178 &&
  (rec.solution.unitSteps == null || rec.solution.unitSteps === rec.solution.steps),
  '严格单位步参考解，比旧版 54178 条指令短', rec.solution.steps);
ok(rec.meta && Number.isFinite(rec.meta.score) && rec.meta.estimate.steps === rec.solution.steps,
  '难度分已按新版解法重算', rec.meta && [rec.meta.score, rec.meta.grade]);
ok(rec.meta && rec.meta.hands === hands, 'meta.hands 与实测一致', rec.meta && rec.meta.hands);

console.log('\n[2] 解法合法性：逐步 chainShift 校验（含推链成员）');
{
  let bad = -1, s = st0, pushes = 0;
  for (let j = 0; j < rec.solution.moves.length; j++) {
    const m = rec.solution.moves[j];
    if (Math.abs(m.dx) + Math.abs(m.dy) !== 1 || !['m', 'p'].includes(m.t)) { bad = j; break; }
    const ch = K.chainShift(L, s, K.grid(L, s), m.i, m.dx, m.dy);
    if (!ch || (m.t === 'm' && ch.length !== 1)) { bad = j; break; }
    if (m.t === 'p') {
      pushes++;
      const a = [...ch].sort((x, y) => x - y), b = [...(m.chain || [])].sort((x, y) => x - y);
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) { bad = j; break; }
    }
    s = K.apply(s, m);
    if (K.isGoal(L, s, raw.goals) !== (j === rec.solution.moves.length - 1)) { bad = j; break; }
  }
  ok(bad < 0, '每一步都合法且首次达标即结束（含 ' + pushes + ' 条推链）', bad);
}

console.log('\n[2b] 没有穿墙瞬移：跨多格的一步必须是"沿直线压着空格滑过去"');
{
  // 1×1 块的超覆盖 Bresenham：直线真正扫过的格子（两端点除外）必须都是空的
  const sweepClear = (g, x0, y0, x1, y1, self) => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let x = x0, y = y0, err = dx - dy;
    const seen = new Set();
    for (let guard = 0; guard < 400; guard++) {
      const k = y * raw.w + x;
      if (!seen.has(k)) {
        seen.add(k);
        if (!(x === x0 && y === y0) && !(x === x1 && y === y1)) {
          const o = g[k];
          if (o !== -1 && o !== self) return false;
        }
      }
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return true;
  };
  let cut = -1, multi = 0, maxJump = 0, s = st0;
  for (let j = 0; j < rec.solution.moves.length; j++) {
    const m = rec.solution.moves[j];
    const jump = Math.abs(m.dx) + Math.abs(m.dy);
    if (jump > 1) {
      multi++; maxJump = Math.max(maxJump, jump);
      const x0 = s[m.i].x, y0 = s[m.i].y;
      if (!sweepClear(K.grid(L, s), x0, y0, x0 + m.dx, y0 + m.dy, m.i)) { cut = j; break; }
    }
    s = K.apply(s, m);
  }
  ok(cut < 0, '没有一步压着别的块/墙滑过去（跨多格 ' + multi + ' 步，最大 ' + maxJump + ' 格）', cut);
}

console.log('\n[3] 关卡包与磁盘一致');
{
  global.window = {};
  delete require.cache[require.resolve('../levelpacks.js')];
  require('../levelpacks.js');
  const pack = global.window.LEVELPACKS.find(p => p.set === '合移位');
  const e = pack && pack.levels.find(l => l.name === NAME);
  ok(!!e, '关卡包里有这一关（按关卡名找，名字从文件读）');
  ok(e && e.meta && e.meta.score === rec.meta.score, '关卡包里的分数同步', e && e.meta && e.meta.score);
  ok(e && e.solution && e.solution.moves.length === rec.solution.moves.length,
    '关卡包里带着完整解法（播放器要用）', e && e.solution && e.solution.moves.length);
  ok(e && e.file === hit.file.replace(/^levels\//, ''), 'file 字段与磁盘找出的路径一致', e && e.file);
}

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);

  console.log('\n[4] 页面层：载入 / 不画块名 / 参考解 / 进度条');
  await ev(`(function(){const e=lib.find(x=>x.name===${JSON.stringify(NAME)});
    if(!e) throw new Error('找不到关卡'); loadLibEntry(lib.indexOf(e));})()`);
  await sleep(1200);
  ok(await ev('raw.pieces.length') === 178, '页面里 178 个块', await ev('raw.pieces.length'));
  ok(await ev('raw.pieces.filter(p=>p.name).length') === 7, '只有 7 个块有名字（五环 + 两柱）',
    await ev('raw.pieces.filter(p=>p.name).length'));
  ok(await ev(`[...document.querySelectorAll('#gPieces text')].length`) === 7,
    '画面上只写了 7 个字（塞块不画字）', await ev(`[...document.querySelectorAll('#gPieces text')].length`));
  ok(await ev('playable()') === true, '开局可玩（没有叠放/越界）');

  // 点「播放」→ 载入关卡文件里的参考解
  await ev(`document.getElementById('btnPlay').click()`); await sleep(700);
  await ev(`document.getElementById('btnPause').click()`); await sleep(200);
  ok(await ev('!!solution') === true, '参考解已载入');
  ok(await ev('solution.hands.length') === hands, '页面手数与磁盘一致', await ev('solution.hands.length'));
  ok(await ev(`getComputedStyle(document.getElementById('seekCard')).display`) !== 'none',
    '大解法用进度条');
  ok(await ev(`document.querySelectorAll('#steps div').length`) === 0, '不建步骤 DOM（上万手会卡死）');

  console.log('\n[5] 进度条跳转：落在对应局面上');
  const t0 = Date.now();
  const seekTo = Math.min(5000, hands - 1);
  await ev(`(function(){const bar=document.getElementById('seekBar');
    bar.value='${seekTo}'; bar.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(500);
  ok(await ev('hands') === seekTo, '跳到第 ' + seekTo + ' 手', await ev('hands'));
  ok(await ev('st.length') === 178, '局面仍是 178 块');
  ok(Date.now() - t0 < 5000, '按需回放不算慢（' + (Date.now() - t0) + 'ms）');
  // 落点必须等于"从头回放 5000 手"的结果
  const same = await ev(`(function(){
    let s = K.initialState(raw);
    for (let i = 0; i < playAt; i++) s = K.apply(s, solution.moves[i]);
    return JSON.stringify(s.map(p=>[p.x,p.y,p.ori])) === JSON.stringify(st.map(p=>[p.x,p.y,p.ori]));
  })()`);
  ok(same === true, '跳过去的局面 = 从头回放到那一步');

  console.log('\n[6] 复位');
  await ev(`reset()`); await sleep(400);
  ok(await ev('hands') === 0 && await ev('!!solution') === false, '复位清掉进度与解');
  ok(await ev(`getComputedStyle(document.getElementById('seekCard')).display`) === 'none', '进度条收掉');
  ok(await ev('st.length') === 178 && await ev('playable()') === true, '回到开局仍可玩');

  ok(b.errors.length === 0, '没有未捕获异常', b.errors);
  await b.close();
  console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed' : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
