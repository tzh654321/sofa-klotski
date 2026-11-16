/* 给新关卡拍几张图（并核对关卡列表/难度的最终显示）
 *   node tools/gen/shots.js
 */
const path = require('path');
const { launch, sleep } = require('../../test/cdp.js');

(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  const shots = path.join(__dirname, '..', '..', 'shots');

  const lvs = JSON.parse(await ev('JSON.stringify(Object.keys(LV).filter(k=>typeof LV[k]==="function"&&k!=="META"))'));
  console.log('关卡 key: ' + lvs.join(', '));
  for (const key of lvs) {
    if (key === 'blank') continue;
    await ev('loadLevel(LV["' + key + '"]())'); await sleep(320);
    const info = JSON.parse(await ev(`JSON.stringify({
      name: raw.name, w: L.w, h: L.h, pieces: L.pieces.length, goals: raw.goals.length,
      score: document.getElementById('lvScore').textContent.trim(),
      meta: document.getElementById('lvMeta').textContent.trim()})`));
    console.log([info.name, info.w + '×' + info.h, info.pieces + ' 块', info.goals + ' 目标', info.score].join('  ') +
      '  | ' + info.meta);
    if (key === 'furnitureMall' || key === 'shangXiaHui' || key === 'sofaSeat' ||
      key === 'hengDaoWanMa' || key === 'sofaBend')
      await b.shot(path.join(shots, 'v17-' + key + '.png'));
  }
  // 家具城：再拍一张"选中 + 目标"的图
  await ev('loadLevel(LV.furnitureMall())'); await sleep(300);
  await ev('sel = 0; render(); void 0'); await sleep(200);
  await b.shot(path.join(shots, 'v17-furnitureMall-select.png'));
  console.log('\nJS 异常: ' + JSON.stringify(b.errors));
  b.close();
})().catch(e => { console.error(e); process.exit(1); });
