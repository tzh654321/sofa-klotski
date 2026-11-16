const path = require('path');
const { launch, sleep } = require('../cdp.js');
(async () => {
  const b = await launch(path.join(__dirname, '..', '..', 'index.html'));
  const ev = b.evalJs;
  await sleep(900);
  await ev(`document.querySelector('#tabs [data-mode="play"]').click()`);
  await sleep(200);
  // 用假条目演示"嵌套文件夹 + 排序"，不动磁盘
  await ev(`(function(){
    lib.push({key:'demo1',src:'pack',set:'华容之书',dir:'华容之书/古谱',name:'古谱甲',level:{name:'古谱甲',w:4,h:5,pieces:[],goals:[]},meta:{score:71,grade:'极难'}});
    lib.push({key:'demo2',src:'pack',set:'华容之书',dir:'华容之书/古谱',name:'古谱乙',level:{name:'古谱乙',w:4,h:5,pieces:[],goals:[]},meta:{score:45,grade:'中等'}});
    curSet='华容之书'; lvSort='default'; openDirs['华容之书/古谱']=true; buildLevelList();
  })()`);
  await sleep(300);
  await ev(`document.getElementById('lvList').scrollIntoView({block:'start'})`);
  await sleep(300);
  await b.shot(path.join(__dirname, '..', '..', 'shots', 'list-folder-sort.png'));
  console.log('ok', b.errors);
  b.close();
})();
