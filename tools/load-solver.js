/* 关卡 → 求解器 js 的通用解析
 *
 * 关卡 JSON 里用 level.solverJs 显式声明「我这关用哪个 js 求解」，
 * 例："solverJs": "tools/solve-hanoi.js"。工具/测试据此动态 require，
 * 关卡文件改名（文件名或 name）都不影响 —— 不再硬编码关卡名/编号，
 * 也不靠 solver 这种策略别名去猜脚本路径。
 *
 * 兼容：没写 solverJs 的旧关回退到 solver 别名映射（hanoi/loom/sokoban），
 * 这样老关卡不会突然失效，新关一律用 solverJs。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 旧关的 solver 别名 → js（仅在没有 solverJs 时兜底）
const LEGACY = {
  hanoi: 'tools/solve-hanoi.js',
  sokoban: 'tools/solve-sokoban.js'
};

/** 取关卡声明的求解器 js 路径（相对仓库根）；没有则 null */
function solverJsOf(level) {
  if (!level) return null;
  if (typeof level.solverJs === 'string' && level.solverJs) return level.solverJs;
  const alias = LEGACY[level.solver];
  return alias || null;
}

/** 动态载入求解器，返回归一化后的 { solve, mod, js }
 *  solve(raw, opts) —— raw 是 level 对象
 *  不同脚本导出名不一（solveHanoi / solveFile / solve），这里统一包裹 */
function loadSolver(level) {
  const js = solverJsOf(level);
  if (!js) throw new Error('关卡没有声明 solverJs，也没有可回退的 solver 别名');
  const abs = path.isAbsolute(js) ? js : path.join(ROOT, js);
  if (!fs.existsSync(abs)) throw new Error('求解器 js 不存在：' + abs);
  delete require.cache[require.resolve(abs)];
  const mod = require(abs);
  const fn = mod.solve || mod.solveHanoi || mod.solveLevel;
  let solve = fn;
  if (!solve && mod.solveFile) {
    // solveFile 接受文件路径；包成接受 level 对象
    solve = (raw, opts) => mod.solveFile(raw, opts);
  }
  if (typeof solve !== 'function') throw new Error('求解器 js 没有可调用的求解函数：' + js);
  return { solve, mod, js };
}

/** 在 levels/<dir>/ 下按 solverJs 属性找关卡文件（只读文件头，不载入整份大 json 也行）
 *  返回 { file（相对仓库根）, abs, rec }；找不到返回 null。
 *  注意：不依赖文件名、编号或 name —— 关卡随便改名都能找到。 */
function findLevelBySolver(relDir, solverJs) {
  const dir = path.join(ROOT, 'levels', relDir);
  if (!fs.existsSync(dir)) return null;
  const hits = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json') || f[0] === '_') continue;
    const abs = path.join(dir, f);
    if (!fs.statSync(abs).isFile()) continue;
    let rec;
    try { rec = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { continue; }
    const lv = rec.level || rec;
    if (solverJsOf(lv) === solverJs) {
      hits.push({ file: ('levels/' + relDir + '/' + f).split(path.sep).join('/'), abs, rec });
    }
  }
  return hits.length ? hits : null;
}

module.exports = { solverJsOf, loadSolver, findLevelBySolver, LEGACY, ROOT };
