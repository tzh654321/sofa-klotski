/* 拍「后台分析/求解」的界面：进度条 + 终止按钮 + 缓存标记
 *   node tools/gen/shot-jobs.js
 */
const path = require('path');
const { launch, sleep } = require('../../test/cdp.js');

(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  const shots = path.join(__dirname, '..', '..', 'shots');

  await ev('document.querySelector(\'#tabs [data-mode="solve"]\').click()'); await sleep(150);
  await ev('setJobCap(400000)');
  await ev('loadLevel(LV.sofaBend())'); await sleep(300);

  // ① 分析中（进度条 + 终止）
  await ev('document.getElementById("btnDiff").click()');
  await sleep(1800);
  await b.shot(path.join(shots, 'v18-job-running.png'));
  console.log('分析中: ' + await ev('document.getElementById("jobText").textContent') + ' / ' +
    await ev('document.getElementById("jobBar").style.width') + ' / ' +
    await ev('document.getElementById("jobDetail").textContent'));

  // ② 算完（分数 + 构成 + 已存）
  await b.waitFor('/\\d+ · /.test(document.getElementById("dfScore").textContent)', 180000, 250);
  await b.shot(path.join(shots, 'v18-job-done.png'));
  console.log('算完: ' + await ev('document.getElementById("dfScore").textContent') + ' | ' +
    (await ev('document.getElementById("dfMsg").textContent')).slice(0, 70));

  // ③ 再点「求解」，再切走：回来时看到缓存标记
  await ev('document.getElementById("btnSolve").click()');
  await b.waitFor('/手|封顶|无解/.test(document.getElementById("svSteps").textContent)', 120000, 200);
  await ev('loadLibEntry(lib.findIndex(e=>e.key==="classic"))'); await sleep(400);
  await ev('loadLevel(LV.sofaBend())'); await sleep(500);
  await b.shot(path.join(shots, 'v18-job-cached.png'));
  console.log('缓存回来: ' + await ev('document.getElementById("dfScore").textContent') + ' | 步表 ' +
    await ev('document.querySelectorAll("#steps div").length') + ' 行 | ' +
    (await ev('document.getElementById("dfMsg").textContent')).slice(-30));

  console.log('JS 异常: ' + JSON.stringify(b.errors));
  b.close();
})().catch(e => { console.error(e); process.exit(1); });
