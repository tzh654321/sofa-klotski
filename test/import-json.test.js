/* tools/import-json.js：把「裸关卡 JSON」导成关卡记录（临时目录里跑，不碰真实 levels/）
 *   node test/import-json.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TOOL = path.join(__dirname, '..', 'tools', 'import-json.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sofa-import-'));
const LV = path.join(ROOT, 'levels');
fs.mkdirSync(LV, { recursive: true });
fs.mkdirSync(path.join(LV, '临时集'), { recursive: true });
/* 「待分类」= levels 根目录本身 */
const dirOf = set => (set === '待分类' ? LV : path.join(LV, set));

// 一个 3×3 的小关：1 块 1×1 走进右下角
const bare = {
  name: '裸关卡', w: 3, h: 3,
  goals: [{ piece: 'a', cells: [[2, 2]] }],
  pieces: [{ id: 'a', x: 0, y: 0, ori: 0, shape: '1x1', color: '#22b14c', name: '甲' }],
  note: '导出时带出来的备注'
};
const src = path.join(ROOT, '裸关卡.json');
fs.writeFileSync(src, JSON.stringify(bare, null, 1), 'utf8');

function run(args) {
  try {
    const out = execFileSync(process.execPath, [TOOL, src, '--root', LV, ...args], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status || 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}
const files = set => fs.readdirSync(dirOf(set)).filter(f => /\.json$/.test(f) && f[0] !== '_').sort();
const rec = (set, f) => JSON.parse(fs.readFileSync(path.join(dirOf(set), f), 'utf8'));

console.log('\n[1] 裸 JSON → 记录（补齐 level / meta / solution）');
{
  const r = run(['--set', '待分类', '--name', '一心二用']);
  ok(r.code === 0, '导入成功', r.out.slice(0, 200));
  const fs1 = files('待分类');
  ok(fs1.length === 1 && fs1[0] === '01_一心二用.json', '写成 01_一心二用.json', fs1);
  const x = rec('待分类', fs1[0]);
  ok(!!x.level && x.level.name === '一心二用', '有 level 包装且名字对', x.level && x.level.name);
  ok(x.source === 'import' && x.id, '带 source=import 与稳定 id', [x.source, x.id]);
  ok(x.meta && typeof x.meta.score === 'number', '算了难度分', x.meta && x.meta.score);
  ok(x.solution && x.solution.steps === 4 && x.solution.moves.length === 4, '存了 4 步最短解',
    x.solution && [x.solution.steps, x.solution.moves && x.solution.moves.length]);
  ok(!!x.note, '备注带过来了', x.note);
  ok(files('待分类').length === 1, '目录里就一关（没有额外的清单文件）', files('待分类'));
  ok(!fs.existsSync(path.join(LV, '_list.json')), '不再生成 _list.json');
}

console.log('\n[2] 幂等：同名再导一次 = 覆盖同一个文件，不新增');
{
  const before = files('待分类');
  const r = run(['--set', '待分类', '--name', '一心二用']);
  ok(r.code === 0, '再导一次也成功');
  const after = files('待分类');
  ok(after.length === before.length && after[0] === before[0], '文件数、编号都没变', after);
}

console.log('\n[3] 同名在别的集里 → 默认拒绝（不悄悄搬走别人的关）');
{
  const other = run(['--set', '临时集', '--name', '一心二用']);
  ok(other.code === 2, '退出码 2（拒绝）', other.code);
  ok(/同名关卡/.test(other.out), '提示里说明已有同名关', other.out.slice(-120));
  ok(files('临时集').length === 0, '别的集里没有写入任何文件', files('临时集'));
}

console.log('\n[4] --force 才搬（旧文件进 _trash，能找回）');
{
  const forced = run(['--set', '临时集', '--name', '一心二用', '--force']);
  ok(forced.code === 0, '带 --force 导入成功', forced.out.slice(0, 160));
  ok(files('临时集').length === 1, '那个集里有了这一关', files('临时集'));
  ok(files('待分类').length === 0, '待分类里那条已搬走', files('待分类'));
  const tr = path.join(LV, '_trash', '待分类');
  ok(fs.existsSync(tr) && fs.readdirSync(tr).some(f => f.indexOf('一心二用') >= 0),
    '旧文件在 _trash/待分类 里', fs.existsSync(tr) ? fs.readdirSync(tr) : null);
}

console.log('\n[5] 不是关卡的文件 → 明确报错');
{
  const bad = path.join(ROOT, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ foo: 1 }), 'utf8');
  let code = 0, out = '';
  try { execFileSync(process.execPath, [TOOL, bad, '--root', LV, '--set', '待分类', '--name', '坏'], { encoding: 'utf8' }); }
  catch (e) { code = e.status; out = String(e.stderr || ''); }
  ok(code === 1, '退出码 1', code);
  ok(/不是关卡记录|没有 w\/h\/pieces/.test(out), '说清楚哪里不对', out.slice(-100));
  ok(!files('待分类').some(f => f.indexOf('坏') >= 0), '没有写出半个文件');
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (e) { console.log('（临时目录需手动清理：' + ROOT + '）'); }
console.log('\n' + (fail ? 'FAILED  ' + fail + ' / ' + (pass + fail) : 'ALL PASS  ' + pass + ' 条'));
process.exit(fail ? 1 : 0);
