/* 把 levels/<关卡集>/*.json 打包成浏览器能直接读的 levelpacks.js
 *
 *   node tools/build-levelpacks.js
 *
 * 关卡是「一关一文件」存在磁盘上的（一个关卡集 = 一个文件夹），
 * 页面用 file:// 打开时没法 fetch 本地目录，所以这里生成一份数据副本。
 * 改了关卡文件后重新跑一次这个脚本即可；test/levelpacks.test.js 会核对
 * 「文件夹里的文件」和「打包出来的数据」是否一致，防止忘了重新生成。
 *
 * 同时导出 readPacks / writePacks 给 tools/serve.js 复用：
 * 写盘服务每次增改删后调 writePacks 重建，file:// 打开也能看到新数据。
 */
const fs = require('fs');
const path = require('path');

const ORDER = ['待分类', '华容之书', '合移位', '推箱子', '迷宫', '随机型关卡'];
/* 「待分类」不是文件夹，而是 levels/ 根目录本身：
 * 没归类的关直接平铺在 levels/NN_名字.json，网页里仍显示成一个关卡集。 */
const ROOT_SET = '待分类';
const HEADER = '/* 自动生成：node tools/build-levelpacks.js —— 不要手改 */\n';

function levelsDir(root) { return path.join(root, 'levels'); }
/** 关卡集 → 目录（待分类 = levels 根目录） */
function setDir(root, set) {
  return set === ROOT_SET ? levelsDir(root) : path.join(levelsDir(root), set);
}
/** 记录里的相对路径：根目录的关就是纯文件名 */
function relFile(set, f) { return set === ROOT_SET ? f : set + '/' + f; }

/* 一个关卡集可以继续往下分文件夹：levels/华容之书/古谱/01_x.json。
 *   - `set` 仍是顶层集名（页面按它分组、分排序）
 *   - `file` 是从 levels/ 起算的相对路径（写盘服务按它找文件）
 *   - `dir` 是文件所在的目录（相对 levels/），页面用它渲染"可展开的文件夹条目"
 * 待分类（= levels 根目录）不往下递归，否则会把所有关卡集都算进来。 */
function walkLevels(base, rel, out) {
  let ents = [];
  try { ents = fs.readdirSync(base, { withFileTypes: true }); } catch (e) { return; }
  ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const ent of ents) {
    if (ent.name[0] === '_') continue;                        // _trash / _xxx 一律跳过
    if (ent.isDirectory()) { walkLevels(path.join(base, ent.name), rel ? rel + '/' + ent.name : ent.name, out); continue; }
    if (!ent.name.endsWith('.json')) continue;
    out.push(rel ? rel + '/' + ent.name : ent.name);
  }
}

function readPack(root, set) {
  const dir = setDir(root, set);
  if (!fs.existsSync(dir)) return [];
  const files = [];
  if (set === ROOT_SET) {
    // 根目录 = 待分类：只认平铺的文件，不进子目录
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith('.json') && f[0] !== '_' && fs.statSync(path.join(dir, f)).isFile()) files.push(f);
    }
  } else {
    walkLevels(dir, set, files);
  }
  return files.map(rel => {
    const abs = path.join(levelsDir(root), rel);
    const r = JSON.parse(fs.readFileSync(abs, 'utf8'));
    // 写盘测试可能把「裸关卡 JSON」丢进目录：没有 level 记录结构的直接跳过，别污染关卡包
    if (!r || !r.level || !Array.isArray(r.level.pieces)) {
      console.warn(' ！跳过不是关卡记录的文件：' + rel);
      return null;
    }
    const sol = r.solution || null;
    const declared = / (\d+)$/.exec(r.origin || '');
    const id = r.id || (set + '-' + path.basename(rel));
    return {
      file: rel,
      id,
      // levels.js 里来的关沿用原来的 key（classic / sofaSeat…），老脚本、老测试按 key 找还找得到
      key: r.lvKey || id,
      set,
      dir: path.dirname(rel).replace(/\\/g, '/'),   // 待分类的平铺文件这里是 '.'
      name: r.name,
      origin: r.origin || '',
      tip: r.tip || r.origin || '',
      note: r.note || r.tip || '',
      source: r.source || '',
      declared: declared ? +declared[1] : null,   // 源游戏标注的最短步数（对比用）
      level: r.level,
      meta: r.meta || null,
      solution: sol ? {
        solver: sol.solver, optimal: !!sol.optimal,
        steps: sol.steps, hands: sol.hands,
        moves: sol.moves || null            // 带着走法，页面里可以直接回放
      } : null
    };
  }).filter(Boolean);                      // 上面「不是关卡记录」的守卫会返回 null
}

function scanSets(root) {
  const dir = levelsDir(root);
  if (!fs.existsSync(dir)) return ORDER.slice();
  const extra = fs.readdirSync(dir)
    .filter(d => d[0] !== '_' && fs.statSync(path.join(dir, d)).isDirectory())
    .filter(d => ORDER.indexOf(d) < 0);
  return ORDER.concat(extra);
}

function readPacks(root) {
  return scanSets(root).map(set => ({ set, levels: readPack(root, set) }));
}

/** 重建 levelpacks.js（原子替换），返回打包结果 */
function writePacks(root, out) {
  const dst = out || path.join(root, 'levelpacks.js');
  const packs = readPacks(root);
  const js = HEADER + 'window.LEVELPACKS = ' + JSON.stringify(packs, null, 1) + ';\n';
  atomicWrite(dst, js);
  return { packs, count: packs.reduce((a, p) => a + p.levels.length, 0), size: fs.statSync(dst).size };
}

/** 先写同目录临时文件再 rename：断电/异常不会留下半个文件 */
function atomicWrite(dst, text) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const tmp = dst + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, dst);
}

function main() {
  const root = path.join(__dirname, '..');
  const { packs, count, size } = writePacks(root);
  console.log('levelpacks.js：' + packs.length + ' 个关卡集、' + count + ' 关、' +
    (size / 1024).toFixed(0) + ' KB');
  packs.forEach(p => console.log('  ' + p.set.padEnd(5) + ' ' + p.levels.length + ' 关'));
}

if (require.main === module) main();
module.exports = { ORDER, ROOT_SET, readPack, scanSets, readPacks, writePacks, atomicWrite, setDir, relFile };
