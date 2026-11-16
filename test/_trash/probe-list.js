const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  console.log('errors', b.errors);
  console.log('列表行数', await ev('document.querySelectorAll("#lvList .lvbtn").length'),
    '| 排序下拉', await ev('document.getElementById("lvSort").value'));
  // 排序切换
  for (const v of ['scoreAsc', 'scoreDesc', 'size', 'default']) {
    await ev('(function(){const s=document.getElementById("lvSort");s.value="' + v + '";s.dispatchEvent(new Event("change"));})()');
    await sleep(200);
    const rows = JSON.parse(await ev('JSON.stringify([...document.querySelectorAll("#lvList .lvbtn")].slice(0,4).map(b=>b.querySelector(".nm").textContent))'));
    console.log(v, rows.join(' | '));
  }
  // 自绘块落在点击处
  console.log(await ev('(function(){' +
    ' loadLevel({name:"放置",w:10,h:10,pieces:[],goals:[]});' +
    ' document.querySelector(\'#tabs [data-mode="edit"]\').click();' +
    ' lastBoardCell=[6,6];' +
    ' paintW=3; paintH=2; paintCells=new Array(6).fill(-1); paintCells[0]=0; paintCells[1]=0;' +
    ' addCustomPiece();' +
    ' return JSON.stringify({x:raw.pieces[0].x,y:raw.pieces[0].y});' +
    '})()'));
  console.log('errors2', b.errors);
  b.close();
})();
