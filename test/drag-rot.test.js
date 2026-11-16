/* 不可旋转的块：拖动时不能弹「转不动」，一律当平移 */
const path = require('path');
const { launch, sleep } = require('./cdp');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;

  await ev('window.__pp=function(x,y){var r=svg.getBoundingClientRect();var s=Math.min(r.width/L.w,r.height/L.h);' +
    'return {x:r.left+(r.width-s*L.w)/2+x*s,y:r.top+(r.height-s*L.h)/2+y*s};};void 0');
  const PP = async (x, y) => JSON.parse(await ev('JSON.stringify(__pp(' + x + ',' + y + '))'));
  const drag = async (x0, y0, x1, y1, steps) => {
    const a = await PP(x0, y0), e = await PP(x1, y1);
    await b.mouse('mousePressed', a.x, a.y);
    for (let k = 1; k <= steps; k++) {
      const q = await PP(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps);
      await b.mouse('mouseMoved', q.x, q.y);
      await sleep(18);
    }
    await b.mouse('mouseReleased', e.x, e.y);
    await sleep(260);
  };
  const toast = () => ev('document.getElementById("toast").textContent');
  const pose = () => ev('JSON.stringify(st[0])').then(JSON.parse);

  console.log('\n[1] L 形自绘块（数据里带 rot:pivot，但几何上不是扇形 → 试玩不可转）');
  await ev('loadLevel({name:"t",w:5,h:5,goals:[],pieces:[{id:"l",x:1,y:1,color:"#8ab72a",name:"L",' +
    'rot:"pivot",cells:[{c:0,r:0},{c:1,r:0},{c:0,r:1}]}]})');
  await sleep(300);
  const info = JSON.parse(await ev('JSON.stringify({rotMode:L.pieces[0].rotMode,rotPlay:L.pieces[0].rotPlay,oris:L.pieces[0].oris.length})'));
  console.log('     rotMode=' + info.rotMode + ' rotPlay=' + info.rotPlay + ' 朝向数=' + info.oris);
  ok(info.rotPlay === false, 'rotPlay=false（试玩/求解不许转）', info);
  ok(info.oris > 1, '朝向数 > 1（编辑器里仍能摆朝向）', info.oris);

  await ev('document.getElementById("toast").textContent=""');
  const before = await pose();
  // 抓右上端、横向拖 —— 这正是"绕着块心划圈"的判据，可转块会被判成旋转
  await drag(2.35, 1.5, 3.35, 1.5, 10);
  const after = await pose();
  const msg = await toast();
  console.log('     拖动前 ' + JSON.stringify(before) + ' → 后 ' + JSON.stringify(after) + ' | toast「' + msg + '」');
  ok(after.ori === before.ori, '朝向没变（没有被当成旋转）', [before.ori, after.ori]);
  ok(after.x === before.x + 1, '整块右移了一格（当平移处理）', [before.x, after.x]);
  ok(!/转不动/.test(msg), '没有弹「转不动」', msg);

  console.log('\n[2] 斜对角自绘块同理');
  await ev('loadLevel({name:"t",w:5,h:5,goals:[],pieces:[{id:"d",x:1,y:1,color:"#ff7f27",name:"对角",' +
    'rot:"pivot",cells:[{c:0,r:0},{c:1,r:1}]}]})');
  await sleep(300);
  ok(await ev('L.pieces[0].rotPlay') === false, '斜对角块 rotPlay=false');
  await ev('document.getElementById("toast").textContent=""');
  const b2 = await pose();
  await drag(1.5, 2.4, 2.5, 2.4, 10);
  const a2 = await pose();
  ok(a2.ori === b2.ori && !/转不动/.test(await toast()), '拖动不转、不报错', { b: b2, a: a2, t: await toast() });

  console.log('\n[3] 扇形仍然能转（不能把这功能一起关掉）');
  await ev('loadLevel({name:"t",w:5,h:5,goals:[],pieces:[{id:"q",x:1,y:1,shape:"semi",color:"#a349a4",name:"半圆"}]})');
  await sleep(300);
  ok(await ev('L.pieces[0].rotPlay') === true, '半圆 rotPlay=true');
  const b3 = await pose();
  await drag(1.5, 1.5, 1.5, 1.5, 1);            // 先点一下确定坐标
  // 绕块心划 1/4 圈
  {
    const box = JSON.parse(await ev('JSON.stringify(pieceBox(st,0))'));
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, rr = 0.35;   // 半圆只有 2×1，抓点得贴块心
    const p0 = await PP(cx, cy - rr);
    await b.mouse('mousePressed', p0.x, p0.y);
    for (let k = 1; k <= 14; k++) {
      const a = -Math.PI / 2 + (k / 14) * Math.PI * 0.8;
      const q = await PP(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      await b.mouse('mouseMoved', q.x, q.y);
      await sleep(18);
    }
    await b.mouse('mouseReleased', p0.x, p0.y);
    await sleep(360);
  }
  const a3 = await pose();
  console.log('     半圆 ' + JSON.stringify(b3) + ' → ' + JSON.stringify(a3));
  ok(a3.ori !== b3.ori, '半圆被绕圈拖转了', [b3.ori, a3.ori]);

  console.log('\n[4] 旋转按钮对不可转块：禁用 + 写明原因');
  await ev('loadLevel({name:"t",w:5,h:5,goals:[],pieces:[{id:"l",x:1,y:1,color:"#8ab72a",name:"L",' +
    'rot:"pivot",cells:[{c:0,r:0},{c:1,r:0},{c:0,r:1}]}]})');
  await sleep(280);
  await ev('document.getElementById("toast").textContent=""');
  await ev('sel = 0; render(); updateUI(); void 0');
  const r4 = JSON.parse(await ev('JSON.stringify({disabled:document.getElementById("btnRotate").disabled,' +
    'why:document.getElementById("btnRotate").dataset.why,' +
    'title:document.getElementById("btnRotate").title})'));
  console.log('     按钮 ' + JSON.stringify(r4));
  ok(r4.disabled === true, '旋转按钮被禁用（本来就没得转）', r4);
  ok(r4.why === 'norot' && /不能旋转/.test(r4.title), '禁用理由写的是「这块不能旋转」，不是「这里转不动」', r4);

  console.log('\n[5] 无异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
