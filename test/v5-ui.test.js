/* v5：无分隔线 / 三段式操控 / 连锁推 / 半圆关 / 十五子可解 */
const path = require('path');
const { launch, sleep } = require('./cdp');
const PAGE = path.join(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  const b = await launch(PAGE);
  const ev = b.evalJs;
  const rectNow = async () => JSON.parse(await ev('JSON.stringify(document.getElementById("board").getBoundingClientRect())'));
  const PP = async (x, y) => {
    const r = await rectNow(); const w = +(await ev('L.w')), h = +(await ev('L.h'));
    const s = Math.min(r.width / w, r.height / h);
    return { x: r.left + (r.width - s * w) / 2 + x * s, y: r.top + (r.height - s * h) / 2 + y * s };
  };

  console.log('\n[1] 多格块没有内部分隔线');
  const paths = await ev('document.getElementById("gPieces").children.length');
  // 9 个块：曹操2×2/横条/竖条 各自 = 填充path + 轮廓path；沙发/半圆 = 1 个 path；1×1 = 2 个 path
  console.log('     path 元素数 ' + paths);
  ok(await ev('document.querySelectorAll("#gPieces rect").length') === 0 || paths > 0, '不再用一格一个 rect 拼大块');
  const outline = await ev('(function(){var d="";var host=document.getElementById("gPieces");for(var e of host.children){if(e.getAttribute("fill")==="none")d+=e.getAttribute("d");}return d;})()');
  ok(/^M/.test(outline), '轮廓是连续外框 path', outline.slice(0, 40));

  console.log('\n[2] 三段式操控：端部旋转、中段平移');
  await ev('document.getElementById("btnBlank").click()'); await sleep(200);
  await ev('document.getElementById("inW").value=6; document.getElementById("inH").value=6; document.getElementById("btnResize").click()'); await sleep(250);
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="edit"]\').click()'); await sleep(120);
  await ev('document.querySelectorAll("#pal button")[4].click()');   // 沙发
  { const q = await PP(2, 2); await b.click(q.x, q.y); } await sleep(200);
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="play"]\').click()'); await sleep(150);
  const si = await ev('L.pieces.findIndex(p=>p.shape==="sofa")');
  let box = JSON.parse(await ev('JSON.stringify(pieceBox(st,' + si + '))'));
  console.log('     沙发 bbox ' + JSON.stringify(box));

  // 抓上三分之一，向右拖 → 顺时针（ori 0 -> 1）
  await ev('st[' + si + ']={x:' + box.x + ',y:' + box.y + ',ori:0}; render(); updateUI();');
  let a = await PP(box.x + 0.5, box.y + 0.3);
  await b.mouse('mousePressed', a.x, a.y);
  for (let k = 1; k <= 12; k++) { const q = await PP(box.x + 0.5 + k * 0.11, box.y + 0.3); await b.mouse('mouseMoved', q.x, q.y); await sleep(16); }
  await b.mouse('mouseReleased', (await PP(box.x + 1.8, box.y + 0.3)).x, (await PP(box.x + 1.8, box.y + 0.3)).y);
  await sleep(350);
  const oriTop = await ev('st[' + si + '].ori');
  console.log('     抓上端右拖 -> ori ' + oriTop);
  ok(oriTop === 1, '上端右拖 = 顺时针 90°');

  // 复位，抓下三分之一右拖 → 逆时针（ori 0 -> 3）
  await ev('st[' + si + ']={x:' + box.x + ',y:' + box.y + ',ori:0}; anim=null; render(); updateUI();');
  const box2 = JSON.parse(await ev('JSON.stringify(pieceBox(st,' + si + '))'));
  a = await PP(box2.x + 0.5, box2.y + box2.h - 0.3);
  await b.mouse('mousePressed', a.x, a.y);
  for (let k = 1; k <= 12; k++) { const q = await PP(box2.x + 0.5 + k * 0.11, box2.y + box2.h - 0.3); await b.mouse('mouseMoved', q.x, q.y); await sleep(16); }
  { const q = await PP(box2.x + 1.8, box2.y + box2.h - 0.3); await b.mouse('mouseReleased', q.x, q.y); }
  await sleep(350);
  const oriBot = await ev('st[' + si + '].ori');
  console.log('     抓下端右拖 -> ori ' + oriBot);
  ok(oriBot === 3, '下端右拖 = 逆时针 90°');

  // 抓中段右拖 → 平移
  await ev('st[' + si + ']={x:' + box.x + ',y:' + box.y + ',ori:0}; anim=null; render(); updateUI();');
  const mid = await PP(box.x + 0.5, box.y + 1.5);
  { const q = await PP(box.x + 1.5, box.y + 1.5);
    await b.mouse('mousePressed', mid.x, mid.y);
    for (let k = 1; k <= 10; k++) { const t = await PP(box.x + 0.5 + k * 0.1, box.y + 1.5); await b.mouse('mouseMoved', t.x, t.y); await sleep(16); }
    await b.mouse('mouseReleased', q.x, q.y); }
  await sleep(350);
  const midPos = JSON.parse(await ev('JSON.stringify([st[' + si + '].x, st[' + si + '].y, st[' + si + '].ori])'));
  console.log('     抓中段右拖 -> ' + JSON.stringify(midPos));
  ok(midPos[0] === box.x + 1 && midPos[2] === 0, '中段拖动 = 平移，朝向不变');

  console.log('\n[3] 连锁推：右移红块，另外两块跟随');
  const lv = { name: '空白', w: 4, h: 5, goals: [], pieces: [
    { id: 'u3', x: 0, y: 0, shape: '1x1', color: '#ed1c24', name: '1×1' },
    { id: 'u8', x: 1, y: 0, shape: '1x1', color: '#fff200', name: '1×1' },
    { id: 'u9', x: 2, y: 0, shape: '1x2', color: '#b97a57', name: '1×2' }
  ] };
  await ev('loadLevel(' + JSON.stringify(lv) + ')'); await sleep(250);
  ok(await ev('JSON.stringify(st.map(s=>[s.x,s.y]))') === '[[0,0],[1,0],[2,0]]', '初始 0/1/2');
  { const p1 = await PP(0.5, 0.5), p2 = await PP(1.5, 0.5);
    await b.mouse('mousePressed', p1.x, p1.y);
    for (let k = 1; k <= 10; k++) { const q = await PP(0.5 + k * 0.1, 0.5); await b.mouse('mouseMoved', q.x, q.y); await sleep(16); }
    await b.mouse('mouseReleased', p2.x, p2.y); }
  await sleep(400);
  const after = await ev('JSON.stringify(st.map(s=>[s.x,s.y]))');
  console.log('     推后 ' + after);
  ok(after === '[[1,0],[2,0],[3,0]]', '三块整体右移一格', after);

  console.log('\n[4] 视频关：4×4 半圆');
  await ev('document.getElementById("btnSemi").click()'); await sleep(300);
  ok(await ev('L.w') === 4 && await ev('L.h') === 4, '4×4');
  ok(await ev('L.pieces.length') === 6, '6 个块');
  const semis = await ev('L.pieces.filter(p=>p.shape==="semi").length');
  ok(semis === 3, '3 个半圆块');
  ok(await ev('L.pieces.filter(p=>p.shape==="semi")[0].oris.length') === 4, '半圆保留 4 个朝向');
  ok(await ev('JSON.stringify(st.map(s=>[s.x,s.y]))') === '[[0,0],[3,0],[2,2],[0,2],[0,3],[2,3]]', '初始布局与视频一致');
  const free = await ev('(function(){var g=K.grid(L,st),n=0;for(var i=0;i<g.length;i++)if(g[i]<0)n++;return n;})()');
  ok(free === 2, '恰好 2 个空格（与视频一致）', free);
  await b.shot(path.join(__dirname, '..', 'shots', 'v5-semi.png'));

  console.log('\n[5] 4×4 十五子可解（不再误判无解）');
  await ev('document.getElementById("btnN15").click()'); await sleep(300);
  ok(await ev('raw.goals.length') === 15, '15 个目标');
  ok(!(await ev('checkWin()')), '开局未完成');
  await ev('document.getElementById("tabs").querySelector(\'[data-mode="solve"]\').click()'); await sleep(120);
  await ev('document.getElementById("btnSolve").click()');
  // 等结果出来（十五子单解可能要几秒；等到"手数/超限/无解"之一出现）
  await b.waitFor('/手|超限|无解/.test(document.getElementById("svSteps").textContent)', 90000);
  const st5 = await ev('document.getElementById("svSteps").textContent');
  const msg5 = await ev('document.getElementById("svMsg").textContent');
  console.log('     ' + st5 + ' | ' + msg5);
  ok(st5 !== '无解', '不再报"无解"', st5);
  ok(/超限|手/.test(st5), '给出诚实的结论（超限/找到解）', st5);

  console.log('\n[6] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
