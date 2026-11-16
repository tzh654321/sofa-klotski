/* 写盘服务 API 回归：全部在临时目录里跑，绝不碰真实 levels/
 *   node test/disk-api.test.js
 *
 * 覆盖：ping / 列表 / 静态文件 / 增 / 改名 / 改分 / 改集 / 删（进 _trash）/
 *       非法布局拒绝 / 重名拒绝 / 路径穿越 / 自动重建 levelpacks.js / 并发写串行。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { createServer } = require('../tools/serve.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};
const PROJECT = path.join(__dirname, '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sofa-disk-'));
const LV = path.join(ROOT, 'levels');
const SET = '待分类';                          // 「待分类」= levels 根目录本身
const SET_DIR = LV;

function putLevel(file, name) {
  const src = fs.readdirSync(path.join(PROJECT, 'levels'))
    .filter(f => f.endsWith('.json') && f[0] !== '_').sort()[0];
  const rec = JSON.parse(fs.readFileSync(path.join(PROJECT, 'levels', src), 'utf8'));
  rec.set = SET; rec.id = SET + '-' + file.slice(0, 2);
  rec.name = name; rec.lvKey = null; rec.level.name = name;
  rec.solution = { solver: 'test', optimal: true, steps: 3, hands: 2, moves: [] };
  rec.meta = { score: 41, grade: '中等', depth: 3, hands: 2, states: 10, paths: 2 };
  fs.writeFileSync(path.join(SET_DIR, file), JSON.stringify(rec, null, 1) + '\n', 'utf8');
  return rec;
}
// 没有 _list.json 了：集的"清单"就是目录里的文件（按文件名排序）
function manifest(set) {
  const dir = !set || set === SET ? SET_DIR : path.join(LV, set);
  return fs.readdirSync(dir).filter(f => /^\d.*\.json$/.test(f)).sort()
    .map(f => ({ file: f, name: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).name }));
}
function packsJs() { return fs.readFileSync(path.join(ROOT, 'levelpacks.js'), 'utf8'); }
function rec(file) { return JSON.parse(fs.readFileSync(path.join(SET_DIR, file), 'utf8')); }
function exists(p) { return fs.existsSync(path.join(SET_DIR, p)); }

let BASE, srv;
async function api(method, url, body) {
  const o = { method, headers: {} };
  if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, o);
  let j; try { j = await r.json(); } catch (e) { j = { ok: false, error: '非 JSON 响应' }; }
  return { status: r.status, j };
}
function rawGet(p) {
  return new Promise((resolve, reject) => {
    const r = http.get({ host: '127.0.0.1', port: srv.address().port, path: p }, res => {
      let s = ''; res.on('data', c => s += c); res.on('end', () => resolve({ status: res.statusCode, text: s }));
    });
    r.on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(SET_DIR, { recursive: true });
  const base1 = putLevel('01_甲关.json', '甲关');
  putLevel('02_乙关.json', '乙关');

  srv = createServer({ root: ROOT, static: PROJECT });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + srv.address().port;

  console.log('[1] 探活与静态托管');
  {
    const p = await api('GET', '/api/ping');
    ok(p.status === 200 && p.j.ok && p.j.mode === 'disk', 'ping 返回写盘模式', p.j);
    ok(p.j.version === 0, '初始 version = 0', p.j.version);
    const page = await api('GET', '/index.html').catch(() => null);
    const html = await (await fetch(BASE + '/index.html')).text();
    ok(html.indexOf('<script src="levelstore.js">') >= 0, '页面引入了 levelstore.js');
    const js = await (await fetch(BASE + '/tools/serve.js')).text();
    ok(js.indexOf('createServer') >= 0, '静态目录能读到 tools/ 下的脚本');
    const esc = await rawGet('/..%2f..%2fwindows%2fwin.ini');
    ok(esc.status === 403 || esc.status === 404, '路径穿越被挡住', esc.status);
  }

  console.log('\n[2] 列表与磁盘一致');
  {
    const g = await api('GET', '/api/levels');
    ok(g.j.ok && g.j.count === 2, '返回 2 关', g.j.count);
    const names = g.j.packs.flatMap(p => p.levels.map(l => l.name));
    ok(names.indexOf('甲关') >= 0 && names.indexOf('乙关') >= 0, '中文关卡名无损', names);
    ok(g.j.packs.find(p => p.set === SET).levels[0].file === '01_甲关.json', '根目录的关卡 file 就是文件名（不再带集名）');
  }

  console.log('\n[3] 新增关卡真实写盘');
  let newKey;
  {
    const lv = JSON.parse(JSON.stringify(base1.level));
    lv.name = '新建关';
    const a = await api('POST', '/api/levels', {
      level: lv, set: SET, name: '新建关', note: '测试备注',
      solution: { solver: 'test', optimal: true, steps: 3, hands: 2, moves: [] }
    });
    ok(a.status === 200 && a.j.ok, 'POST 成功', a.j);
    newKey = a.j.key;
    ok(a.j.file === '03_新建关.json', '按下一编号命名', a.j.file);
    ok(exists('03_新建关.json'), '磁盘上真出现了 json');
    ok(manifest().some(x => x.file === '03_新建关.json'), '目录里能看到新关（列表就是从目录读的）');
    ok(packsJs().indexOf('03_新建关.json') >= 0, 'levelpacks.js 自动重建');
    ok(rec('03_新建关.json').level.name === '新建关', 'level.name 与文件名一致');
    ok(rec('03_新建关.json').note === '测试备注', '备注写入');
    const g = await api('GET', '/api/levels');
    ok(g.j.count === 3 && g.j.version === 1, '列表变成 3 关且 version 递增', [g.j.count, g.j.version]);
  }

  console.log('\n[4] 改名：文件重命名 + 旧文件进回收站');
  {
    // 先证「只带 name、不带 rename」不会改名（保存局面时顺手改名曾经把别的关挤掉）
    const noRe = await api('PUT', '/api/levels/' + encodeURIComponent(newKey), { name: '不该生效的名字' });
    ok(noRe.status === 200 && noRe.j.file === '03_新建关.json', '不带 rename 的 name 被忽略（文件没改名）', noRe.j.file);
    ok(rec('03_新建关.json').name === '新建关', '记录名也没变', rec('03_新建关.json').name);

    const a = await api('PUT', '/api/levels/' + encodeURIComponent(newKey), { name: '改过名', rename: true });
    ok(a.status === 200 && a.j.ok, 'PUT 改名成功', a.j);
    ok(a.j.file === '03_改过名.json', '新文件名保留编号', a.j.file);
    ok(exists('03_改过名.json') && !exists('03_新建关.json'), '旧文件名已不在关卡集里');
    ok(fs.existsSync(path.join(LV, '_trash', SET, '03_新建关.json')), '旧文件进了 _trash 可找回');
    ok(rec('03_改过名.json').level.name === '改过名', 'rec.level.name 同步');
    ok(manifest().some(x => x.name === '改过名'), '目录里那关的名字同步了');
    const g = await api('GET', '/api/levels');
    ok(g.j.packs.find(p => p.set === SET).levels.some(l => l.name === '改过名'), '打包数据里是新名字');
  }

  console.log('\n[5] 难度分写回（顺带同步 solution.hands）');
  {
    const meta = { score: 92, grade: '极难', depth: 1348, hands: 1165, states: 1338449, paths: 4.5e59 };
    const a = await api('PUT', '/api/levels/' + encodeURIComponent(newKey), { meta });
    ok(a.status === 200 && a.j.ok, 'PUT meta 成功', a.j);
    const r = rec('03_改过名.json');
    ok(r.meta && r.meta.score === 92, '92 分写进关卡文件', r.meta && r.meta.score);
    ok(r.solution.hands === 1165, 'solution.hands 跟着改', r.solution.hands);
    const g = await api('GET', '/api/levels');
    const e = g.j.packs.find(p => p.set === SET).levels.find(l => l.key === newKey);
    ok(e && e.meta.score === 92, '列表读到的分数不再是旧值/不计分', e && e.meta);
  }

  console.log('\n[6] 覆盖保存棋盘 / 非法数据拒绝');
  {
    const lv = JSON.parse(JSON.stringify(base1.level)); lv.name = '改过名';
    const good = await api('PUT', '/api/levels/' + encodeURIComponent(newKey), { level: lv, meta: null, solution: null });
    ok(good.status === 200 && good.j.ok, '覆盖保存成功', good.j);
    const bad = JSON.parse(JSON.stringify(lv));
    bad.pieces[1].x = bad.pieces[0].x; bad.pieces[1].y = bad.pieces[0].y;   // 故意叠放
    const e1 = await api('PUT', '/api/levels/' + encodeURIComponent(newKey), { level: bad });
    ok(e1.status === 400 && /重叠|越界/.test(e1.j.error), '重叠布局被拒绝', e1.j);
    ok(rec('03_改过名.json').level.pieces.length === base1.level.pieces.length, '失败后原文件没被破坏');
    const e2 = await api('POST', '/api/levels', { level: null, name: '坏关' });
    ok(e2.status === 400, '空 level 被拒绝', e2.j);
    const e3 = await api('PUT', '/api/levels/' + encodeURIComponent(newKey), { name: '乙关', rename: true });
    ok(e3.status === 409, '改成别人占用的文件名被拒绝', e3.j);
    const e4 = await api('DELETE', '/api/levels/no-such-key');
    ok(e4.status === 404, '删不存在的关返回 404', e4.j);
  }

  console.log('\n[7] 换关卡集 / 非法文件名净化 / 并发写串行');
  {
    const a = await api('PUT', '/api/levels/' + encodeURIComponent(newKey), { set: '新集' });
    ok(a.status === 200 && a.j.file.startsWith('新集/01_'), '跨集移动并重新编号', a.j.file);
    ok(fs.existsSync(path.join(LV, '新集')) && manifest('新集').length === 1, '新集里出现了关卡文件');
    ok(!exists('03_改过名.json'), '旧集里已移走');
    const c = await api('POST', '/api/levels', {
      level: Object.assign(JSON.parse(JSON.stringify(base1.level)), { name: '带/斜杠*名字' }),
      set: SET, name: '带/斜杠*名字'
    });
    ok(c.status === 200 && /^[0-9]+_[^\\/:*?"<>|]+\.json$/.test(path.basename(c.j.file)),
      'Windows 非法字符被净化', c.j.file);
    const before = (await api('GET', '/api/levels')).j.count;
    const three = await Promise.all([1, 2, 3].map(n => api('POST', '/api/levels', {
      level: Object.assign(JSON.parse(JSON.stringify(base1.level)), { name: '并发' + n }),
      set: SET, name: '并发' + n
    })));
    ok(three.every(x => x.status === 200 && x.j.ok), '3 个并发写都成功', three.map(x => x.j));
    const nums = three.map(x => path.basename(x.j.file).slice(0, 2));
    ok(new Set(nums).size === 3, '编号没有撞车', nums);
    const after = (await api('GET', '/api/levels')).j.count;
    ok(after === before + 3, '并发写没有丢', [before, after]);
  }

  console.log('\n[8] 删除进 _trash + 手动重建');
  {
    const d = await api('DELETE', '/api/levels/' + encodeURIComponent(newKey));
    ok(d.status === 200 && d.j.ok, 'DELETE 成功', d.j);
    ok(d.j.trashed && d.j.trashed.indexOf('_trash') >= 0, '返回回收站路径', d.j.trashed);
    ok(fs.existsSync(path.join(ROOT, d.j.trashed)), '回收站里真有文件');
    const g = await api('GET', '/api/levels');
    ok(!g.j.packs.some(p => p.levels.some(l => l.key === newKey)), '列表里已移除');
    const keys = g.j.packs.flatMap(p => p.levels.map(l => l.key));
    ok(new Set(keys).size === keys.length, '换集 + 编号复用后全库 key 仍唯一', keys);
    const rb = await api('POST', '/api/rebuild', {});
    ok(rb.status === 200 && rb.j.rebuilt && rb.j.version > g.j.version, 'rebuild 成功且 version 递增', rb.j);
  }

  console.log('\n[9] 坏文件（裸 JSON）也占着名字：改名/新建都拦得住');
  {
    fs.mkdirSync(path.join(LV, '临时集'), { recursive: true });
    const bare = { name: '坏文件占名', w: 3, h: 3, pieces: [{ id: 'a', x: 0, y: 0, shape: '1x1' }], goals: [] };
    fs.writeFileSync(path.join(LV, '临时集', '05_坏文件占名.json'), JSON.stringify(bare, null, 1), 'utf8');
    ok(!!bare, '（造了一个缺 level 包装的裸 JSON）');

    const c = await api('POST', '/api/levels', { set: SET, name: '坏文件占名', level: base1.level });
    ok(c.status === 409, '新建到这个名字被 409 拦住（关卡包看不到它，磁盘看得到）', c.status);

    // 取一条"活着的"关来试着改名（前面的用例把 key/文件名都改过了）
    const before = (await api('GET', '/api/levels')).j.packs
      .filter(p => p.set === SET).flatMap(p => p.levels)[0];
    const u = await api('PUT', '/api/levels/' + encodeURIComponent(before.key),
      { name: '坏文件占名', rename: true });
    ok(u.status === 409, '改名撞上它也被 409 拦住', u.status);
    const after = (await api('GET', '/api/levels')).j.packs
      .filter(p => p.set === SET).flatMap(p => p.levels).find(l => l.key === before.key);
    ok(!!after && after.name === before.name, '被拒之后那一关名字没变', after && after.name);

    const g = await api('GET', '/api/levels');
    const names = [];
    g.j.packs.forEach(p => p.levels.forEach(l => names.push(l.name)));
    ok(names.filter(n => n === before.name).length === 1, '列表里「' + before.name + '」只有一条',
      names.filter(n => n === before.name).length);
    ok(names.indexOf('坏文件占名') < 0, '坏文件不会出现在关卡列表里（被 readPacks 跳过）');
  }

  console.log('\n[10] 真实关卡目录零改动');
  {
    const real = path.join(PROJECT, 'levels');
    const n = fs.readdirSync(real).filter(f => f.endsWith('.json') && f[0] !== '_').length;
    ok(n >= 2, '真实目录仍完好（根目录 ' + n + ' 关）', n);
    ok(!fs.existsSync(path.join(real, '03_新建关.json')), '测试关卡没有污染真实目录');
  }

  await new Promise(r => srv.close(r));
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (e) { console.log('  （临时目录需手动清理：' + ROOT + '）'); }
  console.log('\n' + (fail ? 'FAILED  ' + fail + ' / ' + (pass + fail) : 'ALL PASS  ' + pass + ' 条'));
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(e);
  try { srv && srv.close(); } catch (x) { }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (x) { }
  process.exit(1);
});
