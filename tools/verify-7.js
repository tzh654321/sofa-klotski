/* 抽查 7 关：文件里存的 meta/solution 与「现算」是否一致、解法是否真能走到目标
 *   node tools/verify-7.js
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');

// 阴晴圆缺 后来改名叫「一心二用」了，两个名字都认
const ALIAS = { '阴晴圆缺': '一心二用' };
const WANT = ['万里征途', '祭', '思之弥艰', '横刀立马', '横刀弯马', '阴晴圆缺', '重门叠锁'];
const CAP = 1200000;
const ROOT = path.join(__dirname, '..', 'levels');

function findByName(nm) {
  for (const set of fs.readdirSync(ROOT)) {
    if (set[0] === '_') continue;
    const dir = path.join(ROOT, set);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f[0] === '_') continue;
      const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (rec.name === nm || rec.name === ALIAS[nm]) return { set, file: f, rec };
    }
  }
  return null;
}

let bad = 0;
for (const nm of WANT) {
  const hit = findByName(nm);
  if (!hit) { console.log(' ！找不到关卡 ' + nm); bad++; continue; }
  const { set, file, rec } = hit;
  const raw = SH.resolve(JSON.parse(JSON.stringify(rec.level)));
  const L = K.parse(raw), st0 = K.initialState(raw);

  // 1) 文件里的解法能不能真的走到目标
  let replay = '无解法';
  if (rec.solution && rec.solution.moves && rec.solution.moves.length) {
    let st = st0;
    try {
      for (const m of rec.solution.moves) st = K.apply(st, m);
      replay = K.isGoal(L, st, raw.goals) ? '到目标 ✓' : '没到目标 ✗';
    } catch (e) { replay = '回放出错 ✗ ' + e.message; }
  }

  // 2) 现算一遍，和文件里存的比
  const t0 = Date.now();
  const res = K.analyze(L, st0, raw.goals, { maxNodes: CAP,
    candidateMoves: rec.solution && rec.solution.moves });
  const d = K.difficulty(res);
  const ms = Date.now() - t0;
  const m = rec.meta || {};
  const same = d && m.score === d.score && m.grade === d.grade;
  const ev = res.estimate;

  console.log('\n' + nm + '   （' + set + '/' + file + '）');
  console.log('  现算：' + (d ? d.score + ' 分 · ' + d.grade : '无分') +
    '   步=' + (res.depth > 0 ? res.depth : '未证明') +
    '   手=' + (res.hands > 0 ? res.hands : (ev ? ev.hands + '(估)' : '—')) +
    '   态=' + res.states + (res.truncated ? '(截断)' : '') +
    '   ' + ms + 'ms');
  if (d) {
    console.log('  分项：' + JSON.stringify(d.parts) + '  unsolved=' + d.unsolved);
    console.log('  认知：' + JSON.stringify({
      active: res.cognition && res.cognition.active,
      revisits: res.cognition && res.cognition.revisits,
      retreats: res.cognition && res.cognition.retreats,
      maxSetup: res.cognition && res.cognition.maxSetup,
      maxPlateau: res.cognition && res.cognition.maxPlateau,
      temptation: res.cognition && +(+res.cognition.temptation).toFixed(2)
    }));
  }
  console.log('  文件：' + (m.score == null ? '无分' : m.score + ' 分 · ' + m.grade) +
    '   步=' + (m.depth == null ? '未证明' : m.depth) +
    '   手=' + (m.hands == null ? '—' : m.hands) +
    '   态=' + m.states + (m.estimated ? '(估)' : '') +
    '   解法=' + (rec.solution ? rec.solution.solver + ' ' + rec.solution.steps + '步/' + rec.solution.hands + '手' : '无'));
  console.log('  解法回放：' + replay + '    分数一致：' + (same ? '✓' : '✗'));
  if (!same) bad++;
  if (replay.indexOf('✗') >= 0) bad++;
}

console.log('\n' + (bad ? '发现 ' + bad + ' 处问题' : '7 关全部一致 ✓'));
process.exit(bad ? 1 : 0);
