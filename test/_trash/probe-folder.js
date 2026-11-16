const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  await ev(`curSet='华容之书'; buildLevelList();`);
  await sleep(300);
  console.log('行', await ev('JSON.stringify([...document.querySelectorAll("#lvList .lvbtn")].slice(0,3).map(x=>x.className+"|"+x.textContent))'));
  console.log('文件夹行', await ev('JSON.stringify([...document.querySelectorAll("#lvList .lvbtn.dir")].map(x=>x.textContent))'));
  await ev('document.querySelector("#lvList .lvbtn.dir").click()'); await sleep(300);
  console.log('展开后', await ev('JSON.stringify([...document.querySelectorAll("#lvList .lvbtn")].slice(0,3).map(x=>x.className+"|"+x.textContent))'));
  console.log('子条目数', await ev('document.querySelectorAll("#lvList .lvbtn.sub").length'));
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'list-folder.png'));
  console.log('errors', b.errors);
  b.close();
})();
