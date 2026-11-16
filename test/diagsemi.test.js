/* 斜半圆 + 1×1 方（diagSemi）：占三格、只绕自身圆心转 */
const path = require('path');
const K = require('../sofa-klotski.js');
const { resolve } = require('../shapes.js');
const { launch, sleep } = require('./cdp');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL  ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

(async () => {
  console.log('[1] 引擎：占三格、四朝向、绕自身圆心');
  const base = () => resolve({ w: 5, h: 5, pieces: [{ id: 'x', x: 1, y: 1, shape: 'diagSemi' }] });
  {
    const raw = base();
    const L = K.parse(raw), st = K.initialState(raw);
    const p = L.pieces[0];
    ok(K.pieceCells(L, st, 0).length === 3, '占 3 格', K.pieceCells(L, st, 0).length);
    ok(p.rotMode === 'pivot' && p.rotPlay === true, '可转（rotMode=pivot / rotPlay=true）', [p.rotMode, p.rotPlay]);
    ok(p.oris.length === 4, '4 个朝向', p.oris.length);
    // ori0：本格 (1,2)、上格 (1,1)、右格 (2,2) —— 即「上 / 中 / 右」三格
    const cs = K.pieceCells(L, st, 0).map(c => c.join(',')).sort();
    ok(JSON.stringify(cs) === JSON.stringify(['1,1', '1,2', '2,2']), 'ori0 占「上 / 中 / 右」三格', cs);
  }
  {
    const raw = base();
    const L = K.parse(raw);
    let st = K.initialState(raw);
    const pivots = [];
    for (let k = 0; k < 4; k++) {
      const mv = K.moves(L, st).filter(m => m.t === 'r' && m.d === 1)[0];
      if (!mv) break;
      st = K.apply(st, mv);
      const o = L.pieces[0].oris[mv.ori];
      pivots.push([mv.x + o.pivot[0], mv.y + o.pivot[1]].join(','));
    }
    console.log('     每次转完的圆心：' + pivots.join('  '));
    ok(pivots.length === 4 && new Set(pivots).size === 1, '四圈都在同一个世界圆心上转', pivots);
    ok(JSON.stringify(st[0]) === JSON.stringify({ x: 1, y: 1, ori: 0 }), '转 4 次回到原位', st[0]);
  }

  const b = await launch(path.join(__dirname, '..', 'index.html'));
  const ev = b.evalJs;

  console.log('\n[2] 渲染：方块 + 斜半圆的并集');
  await ev(`loadLevel({name:"斜半圆",w:5,h:6,goals:[],pieces:[
    {id:'a',x:0,y:0,ori:0,shape:'diagSemi',color:'#22b14c',name:'斜0'},
    {id:'b',x:2,y:0,ori:1,shape:'diagSemi',color:'#00a2e8',name:'斜1'},
    {id:'c',x:0,y:3,ori:2,shape:'diagSemi',color:'#ff7f27',name:'斜2'},
    {id:'d',x:2,y:3,ori:3,shape:'diagSemi',color:'#a349a4',name:'斜3'}
  ]})`);
  await sleep(450);
  const paths = JSON.parse(await ev('JSON.stringify([...document.querySelectorAll("#board path[data-i]")]' +
    '.filter(e=>e.querySelector("x")==null&&e.getAttribute("data-part")==="fill")' +
    '.map(e=>({i:+e.dataset.i,d:e.getAttribute("d").slice(0,60),tf:e.getAttribute("transform")})))'));
  const mine = paths.filter(p => /A0\.7071 0\.7071/.test(p.d));
  console.log('     命中 ' + mine.length + ' 条；示例 ' + JSON.stringify(mine[0] || null));
  ok(mine.length === 4, '四个朝向都用了「弧 R=√2/2」的并集路径', mine.length);
  const degs = mine.map(p => { const m = /rotate\((-?\d+(?:\.\d+)?)\)/.exec(p.tf || ''); return m ? +m[1] : null; }).sort((a, b2) => a - b2);
  ok(JSON.stringify(degs) === '[0,90,180,270]', '路径按朝向转了 0/90/180/270', degs);

  console.log('\n[3] 文字在实体内');
  const lab = JSON.parse(await ev('JSON.stringify([0,1,2,3].map(function(i){' +
    'var o=L.pieces[i].oris[st[i].ori%L.pieces[i].oris.length];' +
    'var cs=pieceCells(st,i);var sp=labelSpot(cs,o,L.pieces[i]);' +
    'var inside=cs.some(function(q){return sp.x>=q[0]&&sp.x<=q[0]+1&&sp.y>=q[1]&&sp.y<=q[1]+1;});' +
    'return {i:i,x:sp.x,y:sp.y,inside:inside};}))'));
  lab.forEach(r => ok(r.inside, '第 ' + r.i + ' 块文字落在实体内 (' + r.x.toFixed(1) + ',' + r.y.toFixed(1) + ')', r));

  console.log('\n[4] 调色板里有这个形状，且预览是并集');
  const pal = JSON.parse(await ev('JSON.stringify([...document.querySelectorAll("#pal button")].map(b=>b.dataset.k))'));
  console.log('     调色板 ' + pal.join(' '));
  ok(pal.indexOf('diagSemi') >= 0, '调色板含 diagSemi', pal.indexOf('diagSemi'));
  const palPath = await ev('(function(){var b=[...document.querySelectorAll("#pal button")].find(x=>x.dataset.k==="diagSemi");' +
    'var p=b&&b.querySelector("path");return p?p.getAttribute("d"):"";})()');
  ok(/A0\.7071 0\.7071/.test(String(palPath)), '预览用的也是并集路径', String(palPath).slice(0, 40));

  console.log('\n[5] 拖动：只能绕圆心转，不能自己乱转朝向');
  ok(await ev('L.pieces[0].rotPlay === true'), '试玩可转（扇形/沙发同一类）');

  console.log('\n[6] 无异常');
  ok(b.errors.length === 0, '没有未捕获异常', b.errors.slice(0, 3));

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
  b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
