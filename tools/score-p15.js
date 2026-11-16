/* 4×4 数字华容道（原「十五子」）的难度分 —— 已并入 tools/score-shuffle.js
 *
 *   node tools/score-p15.js --write            # 等价于下面这条
 *   node tools/score-shuffle.js --file levels/随机型关卡/02_4阶数字华容道.json --write
 *
 * 为什么并进去：这一关现在是「随机型关卡」（level.shuffle），分数口径统一成
 * 「多轮随机关卡的**去头尾平均**」；织布机那类大棋盘也走同一个脚本，只是求解器不同
 * （4×4 滑块用 PDB+IDA*，别的大棋盘用加权 A* 参考解）。两套实现并存迟早算出两个数。
 * 这个文件只保留成转发入口，参数原样传下去（--rounds / --seed / --write）。
 */
const path = require('path');
const { execFileSync } = require('child_process');

const FILE = path.join(__dirname, '..', 'levels', '随机型关卡', '02_4阶数字华容道.json');
const pass = process.argv.slice(2).filter(a => a !== '--scramble' && !/^d+$/.test(a));
// --scramble 由关卡属性 shuffleSteps 决定，不再从命令行传
const argv = [path.join(__dirname, 'score-shuffle.js'), '--file', FILE].concat(pass);
console.log('→ 转给 tools/score-shuffle.js（随机型关卡统一口径）');
execFileSync(process.execPath, argv, { stdio: 'inherit' });
