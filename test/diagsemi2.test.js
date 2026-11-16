/* 自绘组件扩充：弓形（斜半圆的凸边）+ 内切圆 + 一种 1/4 圆点自己转 90°
 *   1 引擎：三种格内容物的美术路径、弓形旋转、隐含圆心 = 斜半圆转轴
 *   2 页面：斜半圆模板 → 创建出「方块 + 两块弓形」，可转、绕方块中心
 *   3 笔刷：只剩 5 个；同一种图形再点一下转 90°
 *   4 斜半圆的旋转动画绕「方块中央」（转轴不跳）
 *   5 悬停光标：能转的块 = 旋转型，只能平移的块 = 平移型
 *   node test/diagsemi2.test.js
 */
const path = require('path');
const K = require('../sofa-klotski.js');
const { launch, sleep } = require('./cdp');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  console.log('[1] 引擎：弓形 / 内切圆的路径与旋转');
  {
    const one = s => K.artOf([{ c: 0, r: 0, seg: s }]).fill;
    const heads = [one(0), one(1), one(2), one(3)].map(d => d.slice(0, 4));
    ok(JSON.stringify(heads) === JSON.stringify(['M0 0', 'M0 0', 'M1 0', 'M0 1']),
      '弓形的弦贴在不同格边上（凸右/凸下/凸左/凸上）', heads);
    ok([0, 1, 2, 3].every(s => /A0\.7071\d* 0\.7071\d*/.test(one(s))), '弧半径恒为 √2/2');
    // 弦贴着邻格且邻格有内容时，不描弦（拼斜半圆不留中缝）
    const pair = K.artOf([{ c: 0, r: 0, seg: 3 }, { c: 0, r: 1 }]);
    ok(!/M0 1L1 1/.test(pair.stroke), '方块在弦外侧时弦不描边（无中缝）', pair.stroke);
    const lone = K.artOf([{ c: 0, r: 0, seg: 3 }]);
    ok(/M0 1L1 1/.test(lone.stroke), '弦外侧空着时要描出弦', lone.stroke);

    const disc = K.artOf([{ c: 0, r: 0, disc: true }]);
    ok(/A0\.5 0\.5 0 1 1/.test(disc.fill) && /A0\.5 0\.5/.test(disc.stroke), '内切圆画成 r=1/2 的整圆', disc.fill);
    const dSpin = K.spinDesc([{ c: 0, r: 0, disc: true }, { c: 1, r: 0 }], [1, 0], 1);
    ok(dSpin.desc.some(q => q.disc), '内切圆转 90° 后还是内切圆', dSpin.desc);

    // 弓形跟着块转：3 → 0 → 1 → 2 → 3（屏幕顺时针）
    const d0 = [{ c: 0, r: 0, seg: 3 }, { c: 0, r: 1 }, { c: 1, r: 1, seg: 0 }];
    const seen = [];
    let cur = d0, pv = [0.5, 1.5];
    for (let k = 0; k < 4; k++) {
      const sp = K.spinDesc(cur, pv, 1);
      cur = sp.desc; pv = sp.pivot;
      seen.push(cur.filter(q => q.seg != null).map(q => q.seg).sort().join('/'));
    }
    console.log('     每次转完的两块弓形朝向：' + seen.join('  '));
    ok(JSON.stringify(seen) === JSON.stringify(['0/1', '1/2', '2/3', '0/3']),
      '每次转 90° 两块弓形的朝向都 +1（跟着块一起转）', seen);
    const strip = d => JSON.stringify(d.map(q => ({ c: q.c, r: q.r, seg: q.seg == null ? null : q.seg, arc: q.arc || null })));
    ok(strip(cur) === strip(d0), '转 4 次回到原样（形状闭合）', strip(cur));
    ok(JSON.stringify(pv) === '[0.5,1.5]', '转 4 次转轴也不漂', pv);

    ok(JSON.stringify(K.segCenterOf(d0)) === '[0.5,1.5]', '两块弓形共用的隐含圆心 = 方块中心', K.segCenterOf(d0));
    ok(K.segCenterOf([{ c: 0, r: 0, seg: 3 }]) !== null, '只有一块弓形也能认出圆心');
    ok(K.segCenterOf([{ c: 0, r: 0, seg: 3 }, { c: 5, r: 5, seg: 0 }]) === null, '两块弓形不同心 → 不构成斜半圆');
  }

  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;
  await ev('window.__pp=function(x,y){var r=svg.getBoundingClientRect(),s=Math.min(r.width/L.w,r.height/L.h);' +
    'return {x:r.left+(r.width-s*L.w)/2+x*s, y:r.top+(r.height-s*L.h)/2+y*s};};void 0');
  const PP = async (x, y) => JSON.parse(await ev('JSON.stringify(__pp(' + x + ',' + y + '))'));
  const tab = async m => { await ev('document.getElementById("tabs").querySelector(\'[data-mode="' + m + '"]\').click()'); await sleep(140); };
  const txt = sel => ev('(document.querySelector(' + JSON.stringify(sel) + ')||{}).textContent');

  console.log('\n[2] 页面：斜半圆模板 → 创建滑块');
  await ev('loadLevel(LV.blank())'); await sleep(200);
  await tab('edit');
  await ev('document.getElementById("btnClearPaint").click()');
  // 斜半圆模板按钮已删：用「实心 + 两块弓形」自己画（这正是这次改动的目的）
  await ev('paintCells.fill(-1); paintCells[6]=0; paintCells[1]=8; paintCells[7]=5; renderPaint(); void 0');
  await sleep(140);
  const info = await txt('#paintInfo');
  console.log('     画布提示：' + info);
  ok(info.indexOf('斜半圆') >= 0 && info.indexOf('可旋转') >= 0, '画布认出「斜半圆，可旋转」', info);
  await ev('document.getElementById("btnNewCustom").click()'); await sleep(260);
  const pc = JSON.parse(await ev('JSON.stringify(raw.pieces[raw.pieces.length-1])'));
  ok(pc.shape === 'custom' && pc.cells.length === 3, '生成 3 格自绘块', pc.cells);
  ok(pc.cells.filter(q => q.seg != null).length === 2 && pc.cells.some(q => !q.seg && !q.arc && !q.disc),
    '1 个实心方 + 2 块弓形', pc.cells);
  ok(pc.rot === 'pivot' && pc.spin === true, '写成「绕自身格心转」的规则', [pc.rot, pc.spin]);
  const pv = JSON.parse(await ev('JSON.stringify(L.pieces[L.pieces.length-1].oris[0].pivot)'));
  ok(JSON.stringify(pv) === '[0.5,1.5]', '转轴 = 方块中心 (0.5,1.5)', pv);
  ok(await ev('L.pieces[L.pieces.length-1].rotPlay') === true, '试玩里可以转');
  ok(await ev('L.pieces[L.pieces.length-1].oris.length') === 4, '4 个朝向');
  const artD = await ev('JSON.stringify(L.pieces[L.pieces.length-1].oris[0].art.fill)');
  ok((String(artD).match(/A0\.7071/g) || []).length === 2, '两块弓形各画一段 R=√2/2 的弧', artD);

  console.log('\n[3] 笔刷：一段图形点自己转 90°');
  const nBrush = await ev('document.querySelectorAll("#brush button").length');
  ok(nBrush === 5, '5 个组件笔刷（实心 / 1/4 圆 / 弓形 / 内切圆 / 擦除）', nBrush);
  await ev('document.querySelectorAll("#brush button")[1].click()');
  const q1 = await ev('brush');
  const i1 = await ev('document.querySelectorAll("#brush button")[1].querySelector("path").getAttribute("d")');
  await ev('document.querySelectorAll("#brush button")[1].click()'); await sleep(80);
  const q2 = await ev('brush');
  const i2 = await ev('document.querySelectorAll("#brush button")[1].querySelector("path").getAttribute("d")');
  ok(q1 === 1 && q2 === 2, '1/4 圆：点一下转过 90°（1 → 2）', [q1, q2]);
  ok(i1 !== i2, '图标跟着转（预览路径变了）', [i1, i2]);
  await ev('document.querySelectorAll("#brush button")[2].click()');
  const s1 = await ev('brush');
  await ev('document.querySelectorAll("#brush button")[2].click()'); await sleep(80);
  const s2 = await ev('brush');
  ok(s1 === 8 && s2 === 5, '弓形：点一下转 90°（凸上 → 凸右）', [s1, s2]);
  const discBrush = await ev('(function(){document.querySelectorAll("#brush button")[3].click();return brush;})()');
  ok(discBrush === 9, '内切圆笔刷 = 9', discBrush);

  console.log('\n[4] 旋转动画绕「方块中央」');
  await ev(`loadLevel({name:"动画",w:9,h:4,goals:[],pieces:[
    {id:'a',x:0,y:0,ori:0,shape:'diagSemi',color:'#22b14c',name:'形状'},
    {id:'b',x:4,y:0,ori:0,shape:'custom',rot:'pivot',spin:true,pivot:[0.5,1.5],
     cells:[{c:0,r:0,seg:3},{c:0,r:1},{c:1,r:1,seg:0}],color:'#00a2e8',name:'自绘'}]})`);
  await sleep(240);
  const pivotWorld = JSON.parse(await ev('(function(){var o=L.pieces[0].oris[0];' +
    'return JSON.stringify([st[0].x+o.pivot[0], st[0].y+o.pivot[1]]);})()'));
  const animInfo = JSON.parse(await ev(`(function(){
    tryTurn(0,1);
    if(!anim) return JSON.stringify({err:'no anim'});
    anim.t0 = performance.now() - anim.dur*0.45;      // 停在动画中途
    render();
    var p = document.querySelector('#board path[data-i="0"][data-part="fill"]');
    var m = /translate\\(([-\\d.]+) ([-\\d.]+)\\) rotate\\(([-\\d.]+)\\)/.exec(p.getAttribute('transform'));
    return JSON.stringify({ tf: p.getAttribute('transform'),
      x:+m[1], y:+m[2], deg:+m[3],
      pivot: anim.list[0].pivot, from: anim.list[0].degFrom, to: anim.list[0].degTo });
  })()`));
  console.log('     动画中途 transform：' + animInfo.tf);
  ok(Math.abs(animInfo.x - pivotWorld[0]) < 1e-6 && Math.abs(animInfo.y - pivotWorld[1]) < 1e-6,
    '动画中被旋转的锚点 = 方块中心 ' + JSON.stringify(pivotWorld), [animInfo.x, animInfo.y]);
  ok(animInfo.deg > 0.5 && animInfo.deg < 89.5, '中途确实是「转到一半」', animInfo.deg);
  ok(Math.abs(animInfo.pivot.x - pivotWorld[0]) < 1e-6 && Math.abs(animInfo.pivot.y - pivotWorld[1]) < 1e-6,
    '引擎给的转轴就是方块中心（四圈同一个点）', animInfo.pivot);
  await sleep(320);

  // 首帧不能跳：动画 t=0 时画出来的位置必须和转之前一模一样（这才是"绕方块中央"）
  const noJump = JSON.parse(await ev(`(function(){
    function rect(i){ var p=document.querySelector('#board path[data-i="'+i+'"][data-part="fill"]');
      var r=p.getBoundingClientRect();
      return [+r.x.toFixed(1),+r.y.toFixed(1),+r.width.toFixed(1),+r.height.toFixed(1)]; }
    var res={};
    res.paintedBefore = rect(1);
    tryTurn(1,1);                    // 自绘斜半圆：走 artDeg 残余转角那条路
    anim.t0 = performance.now();     // t = 0
    render();
    res.paintedAt0 = rect(1);
    res.tfPainted = document.querySelector('#board path[data-i="1"][data-part="fill"]').getAttribute('transform');
    return JSON.stringify(res);
  })()`));
  console.log('     自绘块首帧：' + JSON.stringify(noJump.paintedBefore) + ' → ' + JSON.stringify(noJump.paintedAt0));
  ok(JSON.stringify(noJump.paintedBefore) === JSON.stringify(noJump.paintedAt0),
    '自绘斜半圆动画首帧与转前完全重合（没有跳一格）', noJump);
  ok(/rotate\(-90\)/.test(noJump.tfPainted), '残余转角绕的是转轴，不是包围盒中心', noJump.tfPainted);
  await sleep(340);

  console.log('\n[5] 悬停光标：平移型 / 旋转型');
  await ev('loadLevel({name:"光标",w:5,h:5,goals:[],pieces:[' +
    '{id:"s",x:0,y:0,shape:"semi",color:"#a349a4",name:"半圆"},' +
    '{id:"k",x:3,y:3,shape:"1x1",color:"#ed1c24",name:"卒"}]})');
  await sleep(220);
  await tab('play');
  // 半圆的转轴在世界 (1,1)（平边中点）：抓外圈 → 能拧；贴轴按 → 只会平移
  const atRim = await PP(0.6, 0.6), atPivot = await PP(0.92, 0.92);
  const atBlock = await PP(3.5, 3.5), atEmpty = await PP(4.5, 0.5);
  await b.mouse('mouseMoved', atRim.x, atRim.y); await sleep(90);
  const curRot = await ev('svg.style.cursor');
  await b.mouse('mouseMoved', atPivot.x, atPivot.y); await sleep(90);
  const curNear = await ev('svg.style.cursor');
  await b.mouse('mouseMoved', atBlock.x, atBlock.y); await sleep(90);
  const curMove = await ev('svg.style.cursor');
  await b.mouse('mouseMoved', atEmpty.x, atEmpty.y); await sleep(90);
  const curEmpty = await ev('svg.style.cursor');
  console.log('     半圆外圈=' + curRot + '  半圆贴轴=' + curNear + '  方块=' + curMove + '  空=' + curEmpty);
  ok(curRot === 'grab', '可转块的外圈 → 系统抓手（按下就是拧）', curRot);
  ok(curNear === 'move', '同一块贴着转轴按下去 → 平移光标（拧不起来）', curNear);
  ok(curMove === 'move', '只能平移的块 → 平移光标', curMove);
  ok(curEmpty === 'default', '空白处就是普通光标', curEmpty);
  // 光标必须是系统图标，不是自绘图片
  const allCur = JSON.stringify([curRot, curNear, curMove, curEmpty]);
  ok(allCur.indexOf('url(') < 0, '不再用自绘 SVG 光标', allCur);

  console.log('\n[6] 无异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));
  await b.shot(path.join(__dirname, '..', 'shots', 'diagsemi2.png'));
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
