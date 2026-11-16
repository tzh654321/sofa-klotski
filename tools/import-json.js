/* 把一个「裸关卡 JSON」（编辑器里导出的那份：只有 name/w/h/goals/pieces）导入成关卡记录
 *
 *   node tools/import-json.js <文件.json> --set 待分类 --name 一心二用 [--note "说明"] [--dry]
 *
 * 为什么要有它：直接往 levels/<集>/ 里丢一个裸 JSON，打包/列表都会认不出（缺 `level` 包装），
 * 页面里还会出现"有这一关但打不开"的幽灵条目。这个脚本负责：
 *   1. 识别裸 JSON 或已有记录，取出关卡本体；
 *   2. 算难度 + 最短解（analyze，1.2M 上限，带候选解法保证估算可复现）；
 *   3. 按名字幂等写入 levels/<集>/NN_<名字>.json（同名就覆盖，编号不变）；
 *   4. 目录就是清单：不需要额外的 _list.json。
 * 跑完记得 node tools/build-levelpacks.js（或者直接让 tools/serve.js 自动重建）。
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');

let ROOT = path.join(__dirname, '..', 'levels');
const CAP = 1200000;
/* 「待分类」不是文件夹：它就是 levels 根目录本身（没归类的关平铺在根目录） */
const SET_ROOT = '待分类';
const dirOf = set => (set === SET_ROOT ? ROOT : path.join(ROOT, set));

// --root：把关卡导到别的目录（测试用临时目录，别碰真实关卡）
function applyRoot() {
  const r = arg('root', null);
  if (r) ROOT = path.resolve(String(r));
}
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v && v[0] !== '-' ? v : true;
}

function scanAll() {
  const out = [];
  if (!fs.existsSync(ROOT)) return out;
  const read = (dir, set, only) => {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f[0] === '_') continue;
      if (only && f !== only) continue;
      if (!fs.statSync(path.join(dir, f)).isFile()) continue;
      let rec = null;
      try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
      out.push({ set, file: f, rec });
    }
  };
  for (const name of fs.readdirSync(ROOT)) {
    if (name[0] === '_') continue;
    const abs = path.join(ROOT, name);
    if (fs.statSync(abs).isDirectory()) read(abs, name);
    else if (name.endsWith('.json')) read(ROOT, SET_ROOT, name);   // 根目录 = 「待分类」
  }
  return out;
}

function nextNum(set) {
  const dir = dirOf(set);
  fs.mkdirSync(dir, { recursive: true });
  const nums = fs.readdirSync(dir).filter(f => /^\d+_/.test(f)).map(f => parseInt(f, 10));
  return String((nums.length ? Math.max.apply(null, nums) : 0) + 1).padStart(2, '0');
}

applyRoot();
const file = process.argv[2];
if (!file) {
  console.log('用法：node tools/import-json.js <关卡.json> --set 待分类 --name 名字 [--note 说明] [--dry]');
  process.exit(1);
}
const src = JSON.parse(fs.readFileSync(file, 'utf8'));
// 裸 JSON 还是「关卡记录」？
const lv = src.level ? JSON.parse(JSON.stringify(src.level)) : JSON.parse(JSON.stringify(src));
if (!lv || !Array.isArray(lv.pieces) || !lv.pieces.length || !lv.w || !lv.h) {
  console.error('这个文件既不是关卡记录也没有 w/h/pieces：' + file);
  process.exit(1);
}
const set = String(arg('set', '待分类'));
const name = String(arg('name', lv.name || path.basename(file, '.json').replace(/^\d+_/, '')));
const note = arg('note', src.note || '');
lv.name = name;

/* 块 id 必须唯一：编辑器老版本有个 bug（uid = 块数 + 1，删块再添加会撞 id）。
 * 这里跟页面一样先修：后面的重复项改名，目标仍指向第一个 —— 不然写盘/打包那一步会以
 * 「块 id 重复」拒收，用户只会在入库时报错。 */
(function repairDupIds() {
  const seen = new Set();
  let max = 0;
  for (const p of lv.pieces) { const m = /^[uc](\d+)$/.exec(String(p.id || '')); if (m) max = Math.max(max, +m[1]); }
  let uid = max + 1;
  for (const p of lv.pieces) {
    if (p.id && !seen.has(p.id)) { seen.add(p.id); continue; }
    let id = 'u' + uid++;
    while (seen.has(id)) id = 'u' + uid++;
    console.log('！块 id 重复，已改名：' + (p.id || '(空)') + ' → ' + id);
    p.id = id;
    seen.add(id);
  }
})();
const raw = SH.resolve(JSON.parse(JSON.stringify(lv)));
const L = K.parse(raw), st = K.initialState(raw);

const t0 = Date.now();
// 随机型关卡（level.shuffle）别在这里算：一张图代表不了"每局都不同"的难度，
// 而且像织布机这种 8×8 / 36 块的局面，1.2M 上限足够把进程撑爆。
// 需要分数就单独跑 node tools/score-shuffle.js --file <json> --write。
const res = lv.shuffle
  ? { states: 0, depth: -1, paths: 0, hands: 0, moves: null, truncated: true, stopped: false,
    interference: { same: 0, branches: 0, waste: 0, dead: 0, worst: 0, measured: false } }
  : K.analyze(L, st, raw.goals, { maxNodes: CAP, candidateMoves: src.solution && src.solution.moves });
const d = K.difficulty(res);
let solution = null;
if (res.moves && res.moves.length) {
  solution = { solver: 'bfs-optimal', optimal: true, steps: res.moves.length,
    hands: res.hands != null ? res.hands : K.mergeMoves(res.moves).length, moves: res.moves };
} else if (res.estimate) {
  solution = { solver: 'budget-estimate', optimal: false, steps: res.estimate.steps,
    hands: res.estimate.hands, moves: res.estimate.moves };
}
const meta = d ? {
  score: d.score, grade: d.grade,
  depth: res.depth > 0 ? res.depth : null,
  hands: res.hands > 0 ? res.hands : (res.estimate ? res.estimate.hands : null),
  states: res.states, paths: res.paths,
  waste: res.interference ? res.interference.waste : null,
  same: res.interference ? res.interference.same : null,
  estimated: !!(res.truncated || d.estimated),
  version: d.version, scoringVersion: 3,
  unsolved: !!d.unsolved, confidence: d.confidence, parts: d.parts,
  cognition: res.cognition ? {
    active: res.cognition.active, switches: res.cognition.switches,
    revisits: res.cognition.revisits, retreats: res.cognition.retreats,
    maxSetup: res.cognition.maxSetup, temptation: +(+res.cognition.temptation).toFixed(2)
  } : null,
  ms: Date.now() - t0
} : null;

console.log((d ? d.score + ' 分 · ' + d.grade : '无分') +
  '   步 ' + (res.depth > 0 ? res.depth : '未证明') + '   手 ' + (meta ? meta.hands : '—') +
  '   态 ' + res.states + (res.truncated ? '(截断)' : '') + '   ' + (Date.now() - t0) + 'ms');
if (!d) console.log('！这一关没解出/没算出分数（先在页面里确认目标可达）');

if (arg('dry', false)) { console.log('（dry-run，没有写文件）'); process.exit(0); }

// 同名就覆盖（编号不变）；换集就搬
const prev = scanAll().find(x => x.rec.name === name);
let num;
if (prev && prev.set !== set && arg('force', false) !== true) {
  console.error('已经有同名关卡在 ' + prev.set + '/' + prev.file +
    '；换个 --name，或者加 --force 把它搬过来（旧文件进 _trash）');
  process.exit(2);
}
if (prev && prev.set === set) num = String(prev.file).slice(0, 2);
else {
  num = nextNum(set);
  if (prev) {
    fs.mkdirSync(path.join(ROOT, '_trash', prev.set), { recursive: true });
    fs.renameSync(path.join(dirOf(prev.set), prev.file), path.join(ROOT, '_trash', prev.set, prev.file));
    console.log('同名旧记录从 ' + prev.set + '/' + prev.file + ' 搬到 _trash');
  }
}
const rec = {
  set, id: (prev && prev.rec.id) || ('u' + Date.now().toString(36)),
  name, origin: src.origin || '', lvKey: null,
  note: note || ('导入自 ' + path.basename(file)),
  source: 'import', tip: note || '',
  level: lv, meta, solution
};
const out = num + '_' + name + '.json';
fs.mkdirSync(dirOf(set), { recursive: true });
fs.writeFileSync(path.join(dirOf(set), out), JSON.stringify(rec, null, 1) + '\n', 'utf8');
console.log('已写入 levels/' + (set === SET_ROOT ? '' : set + '/') + out);
console.log('记得跑 node tools/build-levelpacks.js');
