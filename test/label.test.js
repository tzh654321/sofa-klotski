/* 文字落点：任意形状都必须写在实体内部 */
const path = require('path');
const { launch, sleep } = require('./cdp');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;

  /** 在页面里算一遍所有块的落点与「是否在实体内」 */
  const check = async () => JSON.parse(await ev(`(function(){
    const out = [];
    for (let i = 0; i < L.pieces.length; i++) {
      const p = L.pieces[i], o = p.oris[st[i].ori % p.oris.length];
      const cs = pieceCells(st, i);
      const sp = labelSpot(cs, o, p);
      const isSec = !!(o.desc && o.desc.length && o.desc.every(q => q.arc));
      let inside = false, extra = null;
      if (isSec) {
        // 圆心是世界坐标 = 块原点 + 局部 pivot；块原点由第一格反推
        const ox = cs[0][0] - o.cells[0][0], oy = cs[0][1] - o.cells[0][1];
        const d = Math.hypot(sp.x - (ox + o.pivot[0]), sp.y - (oy + o.pivot[1]));
        inside = d <= 0.82;
        extra = { d: +d.toFixed(3) };
      } else {
        const comps = K.components(cs);
        const use = comps.length > 1 ? comps.reduce((a, c) => (c.length > a.length ? c : a)) : cs;
        inside = use.some(([c, r]) => sp.x >= c - 1e-9 && sp.x <= c + 1 + 1e-9 && sp.y >= r - 1e-9 && sp.y <= r + 1 + 1e-9);
        extra = { comps: comps.length };
      }
      out.push({ id: p.id, name: p.name || '', x: +sp.x.toFixed(3), y: +sp.y.toFixed(3),
        half: +sp.half.toFixed(3), inside, isSec, extra });
    }
    return JSON.stringify(out);
  })()`));

  const fails = list => list.filter(o => o.name && !o.inside);

  console.log('\n[1] 各种自绘形状：文字锚点都在实体里');
  const shapes = [
    ['L 形（3 格 / 2×2 盒）', [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 0, r: 1 }]],
    ['斜对角双格（两分量）', [{ c: 0, r: 0 }, { c: 1, r: 1 }]],
    ['隔一格双格（两分量）', [{ c: 0, r: 0 }, { c: 2, r: 0 }]],
    ['T 形 4 格', [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 1, r: 1 }]],
    ['细长 1×4', [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 }]],
    ['U 形 5 格（中间空）', [{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 2, r: 0 }, { c: 2, r: 1 }, { c: 1, r: 1 }]]
  ];
  for (const [tag, cells] of shapes) {
    await ev('loadLevel({name:"t",w:6,h:6,goals:[],pieces:[{id:"x",x:1,y:1,color:"#8ab72a",name:"文字测试",cells:' +
      JSON.stringify(cells.map(q => ({ c: q.c, r: q.r }))) + '}]})');
    await sleep(160);
    const r = (await check())[0];
    ok(r.inside, tag + ' → 落在实体内', r);
    const txt = JSON.parse(await ev('JSON.stringify([...document.querySelectorAll("#board text[data-part=label]")].map(t=>({x:+t.getAttribute("x"),y:+t.getAttribute("y"),fs:+t.getAttribute("font-size")})))'));
    ok(txt.length === 1, tag + ' → 渲染出一个文字', txt.length);
    ok(Math.abs(txt[0].x - r.x) < 1e-6 && Math.abs(txt[0].y - r.y) < 1e-6, tag + ' → DOM 里的坐标就是锚点', txt[0]);
    // 文字的半宽不能超过实体可用空间
    const halfW = 0.62 * txt[0].fs * 5 / 2;
    ok(halfW <= r.half * 1.02 + 0.02, tag + ' → 文字宽度被压进实体', { halfW: +halfW.toFixed(3), half: r.half });
  }

  console.log('\n[2] 扇形 / 半圆 / 沙发');
  {
    const secs = [
      ['1/4 圆', [{ c: 0, r: 0, arc: [1, 1] }]],
      ['1/2 圆', [{ c: 0, r: 0, arc: [1, 1] }, { c: 1, r: 0, arc: [0, 1] }]],
      ['3/4 圆', [{ c: 0, r: 0, arc: [1, 1] }, { c: 1, r: 0, arc: [0, 1] }, { c: 0, r: 1, arc: [1, 0] }]]
    ];
    for (const [tag, cells] of secs) {
      await ev('loadLevel({name:"t",w:5,h:5,goals:[],pieces:[{id:"x",x:1,y:1,color:"#a349a4",name:"半圆A",cells:' +
        JSON.stringify(cells) + '}]})');
      await sleep(160);
      const r = (await check())[0];
      ok(r.isSec, tag + ' → 识别为扇形', r.isSec);
      ok(r.inside, tag + ' → 文字在弧内侧（不贴弧边）', r.extra);
      ok(r.half >= 0.35, tag + ' → 留有足够空间', r.half);
    }
    await ev('loadLevel({name:"t",w:4,h:5,goals:[],pieces:[{id:"s",x:1,y:1,shape:"sofa",color:"#22b14c",name:"沙发"}]})');
    await sleep(160);
    const rs = (await check())[0];
    ok(rs.inside, '沙发 → 文字落在 1×3 的某一格里', rs);
  }

  console.log('');
  console.log('[2b] 满矩形居中 / C 形避让凹槽');
  {
    // 1x2 竖块：锚点必须在两格中缝上，而不是某一格中心
    await ev('loadLevel({name:"t",w:4,h:4,goals:[],pieces:[{id:"v",x:1,y:1,color:"#3f48cc",name:"竖条",shape:"1x2"}]})');
    await sleep(150);
    const r1 = (await check())[0];
    ok(Math.abs(r1.x - 1.5) < 1e-6 && Math.abs(r1.y - 2.0) < 1e-6, '1x2 的锚点在块中心 (1.5,2.0)', r1);
    // 2x2：锚点正好是中心格点
    await ev('loadLevel({name:"t",w:4,h:4,goals:[],pieces:[{id:"q",x:0,y:0,color:"#ff7f27",name:"二乘二",shape:"2x2"}]})');
    await sleep(150);
    const r2 = (await check())[0];
    ok(Math.abs(r2.x - 1) < 1e-6 && Math.abs(r2.y - 1) < 1e-6, '2x2 的锚点在中心格点 (1,1)', r2);
    // 沙发（缺口朝右）：锚点应偏到块身（x 更小），不压凹槽
    await ev('loadLevel({name:"t",w:4,h:5,goals:[],pieces:[{id:"s",x:0,y:1,shape:"sofa",color:"#22b14c",name:"沙发"}]})');
    await sleep(160);
    const r3 = (await check())[0];
    const info = JSON.parse(await ev('JSON.stringify({pivot:L.pieces[0].oris[0].pivot,h:L.pieces[0].oris[0].h})'));
    console.log('     沙发锚点 ' + r3.x + ',' + r3.y + ' / 缺口中心 ' + JSON.stringify(info.pivot));
    ok(r3.x < 0.45, '缺口朝右 → 文字偏到块身（靠左）', r3);
    ok(r3.inside, '沙发文字仍在实体内', r3);
    // 缺口朝左（转 180 度）时镜像
    await ev('st[0].ori = 2; render(); void 0');
    await sleep(160);
    const r4 = (await check())[0];
    ok(r4.x > 0.55, '缺口朝左 → 文字靠右（跟着缺口方向镜像）', r4);
  }

  console.log('\n[3] 所有预设关卡 × 所有块');
  const keys = JSON.parse(await ev('JSON.stringify(Object.keys(LV).filter(k => k !== "META" && typeof LV[k] === "function"))'));
  console.log('     关卡 ' + keys.join(' '));
  let total = 0;
  for (const k of keys) {
    await ev('loadLevel(LV["' + k + '"]())');
    await sleep(180);
    const list = await check();
    total += list.length;
    const bad = fails(list);
    const named = list.filter(o => o.name).length;
    ok(bad.length === 0, k + ' → ' + named + ' 个带名字的块，文字全在实体内', bad.map(o => o.id + '@' + o.x + ',' + o.y));
  }
  console.log('     合计检查 ' + total + ' 块');

  console.log('\n[4] 长名字自动缩字号，不出块');
  await ev('loadLevel({name:"t",w:3,h:3,goals:[],pieces:[{id:"a",x:1,y:1,color:"#ed1c24",name:"一个特别长的名字"},{id:"b",x:0,y:0,color:"#fff200",name:"短"}]})');
  await sleep(180);
  const fsList = JSON.parse(await ev('JSON.stringify([...document.querySelectorAll("#board text[data-part=label]")].map(t=>+t.getAttribute("font-size")))'));
  console.log('     字号 ' + fsList.map(f => f.toFixed(3)).join(' / '));
  ok(fsList.length === 2, '两段文字都画了', fsList.length);
  ok(fsList.every(f => f >= 0.085 && f <= 0.31), '字号在合理区间（不消失、不撑破）', fsList);
  const lc = await check();
  ok(lc.every(o => o.inside), '1×1 上写 7 个字也不出格', lc);

  console.log('\n[5] 无 JS 异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
