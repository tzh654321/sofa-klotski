/* v22：块 id 不许重复（删块再添加会撞 id 的 bug）
 *   node test/v22-piece-id.test.js
 *
 * 复现路径（用户报的）：编辑器里删掉几个小序号块 → 再添加新块 → 新块的 id 撞上还活着的块。
 *   旧代码 uid = 块数 + 1，36 块时是 37，删 3 块后仍从 37 发号，新块叫 u37/u38，跟现有的撞车。
 * 撞 id 的关导出后：引擎按第一个解析（目标恰好还对），但写盘服务以「块 id 重复」拒收。
 */
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  c ? (pass++, console.log('  ok  ' + m))
    : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));
};
const dupOf = ids => [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);

  console.log('\n[1] 载入带重复 id 的关：自动改名，目标仍指向原来那块');
  {
    // 用户导出的那版织布机：u37 既是 24 号梭（1×1 @5,6），又是 (3,3) 的 2×1
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'inbox', '织布机-20目标.test.json'), 'utf8'));
    const before = dupOf(raw.pieces.map(p => p.id));
    ok(before.length === 1 && before[0] === 'u37', '这份导出里确实有一对重复 id（u37）', before);
    await ev(`loadLevel(${JSON.stringify(raw)})`);
    await sleep(700);
    const after = JSON.parse(await ev(`JSON.stringify({
      ids: raw.pieces.map(p=>p.id),
      goal: raw.goals.find(g=>g.piece==='u37'),
      atStart: K.isGoal(L, st, raw.goals),
      n: raw.pieces.length
    })`));
    ok(dupOf(after.ids).length === 0, '载入后 id 全都唯一了', dupOf(after.ids));
    ok(after.n === raw.pieces.length, '块数没变（没有丢块）', after.n);
    ok(after.goal && JSON.stringify(after.goal.cells) === '[[5,6]]', 'u37 那条目标还在', after.goal);
    ok(after.atStart === true, '基准态仍是"已达成"（目标没指错块）');
    // 目标解析到的那块必须还是 1×1 的 24 号梭
    const which = JSON.parse(await ev(`(function(){
      const g = raw.goals.find(x=>x.piece==='u37');
      const i = K.pieceIdx(L, g.piece);
      return JSON.stringify({name:L.pieces[i].name, shape:L.pieces[i].shape});
    })()`));
    ok(which.name === '24' && which.shape === '1x1', '目标指向 24 号梭（不是那块 2×1）', which);
  }

  console.log('\n[2] 复现原 bug：删掉几个小序号块，再添加新块');
  {
    await ev(`(function(){const e=lib.find(x=>x.name==='织布机');loadLibEntry(lib.indexOf(e));})()`);
    await sleep(700);
    const before = JSON.parse(await ev(`JSON.stringify({n:raw.pieces.length, ids:raw.pieces.map(p=>p.id), uid:uid})`));
    console.log('     出厂织布机 ' + before.n + ' 块，最大 id = u' + Math.max(...before.ids.map(x => +String(x).replace(/\D/g, '') || 0)));
    // 删 3 个（按 id 找下标，删完下标会变，所以每次重新找）
    await ev(`(function(){
      ['u16','u28','u30'].forEach(id=>{
        const i = raw.pieces.findIndex(p=>p.id===id);
        if (i >= 0) { sel = i; delPiece(i); }
      });
    })()`);
    await sleep(400);
    ok(await ev(`raw.pieces.length`) === before.n - 3, '删掉 3 块', await ev('raw.pieces.length'));
    // 加两块 1×1（走真实的调色板点击）
    await ev(`[...document.querySelectorAll('#pal button')].find(b=>b.dataset.k==='1x1').click()`);
    await sleep(150);
    await ev(`document.getElementById('tabs').querySelector('[data-mode="edit"]').click()`);
    await sleep(200);
    await ev(`palShape='1x1'`);                                  // 确保调色板选着
    await ev(`addPiece(0, 0, '1x1')`); await sleep(200);
    await ev(`addPiece(1, 0, '1x1')`); await sleep(200);
    const after = JSON.parse(await ev(`JSON.stringify({n:raw.pieces.length, ids:raw.pieces.map(p=>p.id),
      new2:raw.pieces.slice(-2).map(p=>p.id)})`));
    ok(after.n === before.n - 1, '现在共 ' + after.n + ' 块', after.n);
    ok(dupOf(after.ids).length === 0, '加完以后 id 仍然唯一（旧代码这里会撞 u37/u38）', dupOf(after.ids));
    ok(after.new2.every(id => before.ids.indexOf(id) < 0), '新块拿的是从没出现过的 id', after.new2);
    // 自绘块同样不该撞
    await ev(`palShape=null; brush=0; brushSlot='solid'; paintCells[0]=0; paintCells[1]=0; addCustomPiece();`);
    await sleep(300);
    const ids2 = JSON.parse(await ev(`JSON.stringify(raw.pieces.map(p=>p.id))`));
    ok(dupOf(ids2).length === 0, '加自绘块也不撞 id', dupOf(ids2));
    ok(/^c\d+$/.test(ids2[ids2.length - 1]), '自绘块用 c 前缀', ids2[ids2.length - 1]);
  }

  console.log('\n[3] 导出的 JSON 里 id 唯一，且能原样读回来');
  {
    await ev(`document.getElementById('btnDump').click()`);
    await sleep(300);
    const txt = await ev(`document.getElementById('jsonBox').value`);
    const out = JSON.parse(txt);
    const ids = out.pieces.map(p => p.id);
    ok(dupOf(ids).length === 0, '导出结果里没有重复 id', dupOf(ids));
    ok(out.pieces.length === (await ev('raw.pieces.length')), '块数一致', out.pieces.length);
    await ev(`loadLevel(${JSON.stringify(out)})`);
    await sleep(500);
    ok(await ev(`raw.pieces.map(p=>p.id).length === new Set(raw.pieces.map(p=>p.id)).size`),
      '读回来还是唯一');
  }

  console.log('\n[4] 写盘服务那一侧：重复 id 依然会被拒（这条不能松）');
  {
    const { createServer } = require('../tools/serve.js');
    const os = require('os');
    const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sofa-v22-'));
    const srv = createServer({ root: ROOT, static: path.join(__dirname, '..') });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/api/levels';
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'inbox', '织布机-20目标.test.json'), 'utf8'));
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set: '临时', name: '重复id', level: raw })
    });
    const j = await r.json();
    ok(r.status === 400 && /重复/.test(j.error || ''), '重复 id 的新建被 400 挡住', [r.status, j.error]);
    await new Promise(r2 => srv.close(r2));
  }

  console.log('\n[5] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors);

  await b.close();
  console.log('\n' + (fail ? 'FAILED  ' + pass + ' passed, ' + fail + ' failed' : 'ALL PASS  ' + pass + ' passed, 0 failed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
