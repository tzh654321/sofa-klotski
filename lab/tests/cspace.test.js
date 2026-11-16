/* 位形空间求解器无头测试：node test/cspace.test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, Date, Uint8Array, Int32Array, window: {} };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['sofa-shape.js', 'sofa-geom.js', 'sofa-cspace.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const SOFA = ctx.SOFA_OUTLINE, G = ctx.SofaGeom, C = ctx.SofaCspace;

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ok  ' + m)) : (fail++, console.log('  FAIL ' + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };

const LV = {
  name: '参考图', w: 4, h: 5,
  blocks: [
    { id: 'r', x: 0, y: 0, w: 1, h: 2 }, { id: 'o', x: 1, y: 0, w: 2, h: 2 }, { id: 'y', x: 3, y: 0, w: 1, h: 2 },
    { id: 'c', x: 1, y: 2, w: 2, h: 1 }, { id: 'b', x: 3, y: 2, w: 1, h: 2 },
    { id: 'p', x: 1, y: 4, w: 1, h: 1 }, { id: 'n', x: 2, y: 4, w: 1, h: 1 }, { id: 'm', x: 3, y: 4, w: 1, h: 1 }
  ]
};
const REF = { cx: 0.5, cy: 3.5, deg: 0 };

console.log('\n[1] 位形空间栅格化');
let t = Date.now();
const cs = C.build(LV, LV.blocks, SOFA, { step: 0.1, thStep: 5 });
const buildMs = Date.now() - t;
console.log(`     ${cs.ni}x${cs.nj}x${cs.nth} = ${cs.free.length} 个节点, 判定 ${cs.stats.tested} 次, 精确求交 ${cs.stats.exact} 次, ${buildMs}ms`);
ok(buildMs < 4000, '构建耗时 < 4s');
ok(cs.free.length === 41 * 51 * 72, '节点数正确');

console.log('\n[2] 出生点的连通分量');
t = Date.now();
const r1 = C.reach(cs, REF);
const reachMs = Date.now() - t;
console.log(`     可达节点 ${r1.visited} 个, 覆盖 ${r1.posCount} 个重心格位 (${reachMs}ms)`);
ok(r1.ok, '起点本身合法');
ok(r1.posCount > 0, '至少能待着不动');
ok(r1.posCount < 41 * 51, '可达域远小于整个棋盘（沙发被卡在 L 形走廊里）');

console.log('\n[3] 走廊里的两个极端位姿互不可达');
const horiz = { cx: 1.5, cy: 3.5, deg: 90 };
ok(G.conflict(LV, LV.blocks, horiz, SOFA) === null, '横躺在第 3 行是合法的');
const r2 = C.reach(cs, REF, horiz);
ok(r2.ok, '求解器跑通');
console.log(`     reached=${r2.reached}  visited=${r2.visited}`);
ok(!r2.reached, '竖着 -> 横躺 走不通（1 格宽直角走廊转不过 2.92 格长的沙发，正是题目核心）');

console.log('\n[3b] 干净的 1 格宽 L 形走廊：2.92 格的沙发应该转不过去');
// 造一条 1 格宽的 L：竖臂 x∈[0,1] 全高，横臂 y∈[4,5] 全宽，其余用 1×1 填成墙
const lvL = { w: 4, h: 5, blocks: [] };
for (let x = 1; x < 4; x++) for (let y = 0; y < 4; y++) lvL.blocks.push({ id: 'w' + x + '_' + y, x, y, w: 1, h: 1 });
const vPose = { cx: 0.5, cy: 1.5, deg: 0 };
const hPose = { cx: 2.5, cy: 4.5, deg: 90 };
ok(G.conflict(lvL, lvL.blocks, vPose, SOFA) === null, '竖着能待在竖臂里');
ok(G.conflict(lvL, lvL.blocks, hPose, SOFA) === null, '横着能待在横臂里');
const csL = C.build(lvL, lvL.blocks, SOFA, { step: 0.05, thStep: 2.5 });
const rL = C.reach(csL, vPose, hPose);
console.log(`     可达位姿 ${rL.visited}，能转到横臂? ${rL.reached}`);
// 理论：1 格宽直角走廊能转的极限长度 = (1^(2/3)+1^(2/3))^(3/2) = 2.828 格 < 我们的 2.92
console.log(`     理论极限 ${(Math.pow(Math.pow(1, 2 / 3) + Math.pow(1, 2 / 3), 1.5)).toFixed(3)} 格，沙发长 2.919 格`);
ok(!rL.reached, '转不过去 —— 与"梯子过拐角"理论一致');

console.log('\n[4] 卡死局面的破局点：把浅蓝 2×1 往下挪一格');
const lv2 = JSON.parse(JSON.stringify(LV));
lv2.blocks.find(b => b.id === 'c').y = 3;
const cs2 = C.build(lv2, lv2.blocks, SOFA, { step: 0.05, thStep: 2.5 });
const r3 = C.reach(cs2, REF);
console.log(`     可达位姿 ${r3.visited}（原 ${r1.visited}），重心格位 ${r3.posCount}，空闲节点 ${cs2.freeCount}`);
ok(r1.visited <= 2, '参考局面下沙发基本动不了（0.05 格精度也只有个位数位姿）');
ok(r3.visited > 50, '挪开浅蓝后可达位姿数量级上升', r3.visited);
ok(cs2.freeCount > 100, '空闲位形节点明显增多', cs2.freeCount);

console.log('\n[5] 空场里应能到达任意姿态，并能给出路径');
const empty = { w: 4, h: 5, blocks: [] };
const cs3 = C.build(empty, [], SOFA, { step: 0.1, thStep: 5 });
const from = { cx: 2, cy: 1.5, deg: 0 };
const to = { cx: 2, cy: 3.5, deg: 90 };
const r4 = C.reach(cs3, from, to);
ok(r4.reached, '空场里 0°->90° 可达');
ok(r4.path && r4.path.length > 1, '拿到路径节点 ' + (r4.path ? r4.path.length : 0));
const sc = C.shortcut(cs3, r4.path);
console.log(`     路径 ${r4.path.length} 节点 -> 捷径后 ${sc.length} 段`);
ok(sc.length <= r4.path.length, '捷径没有变长');
// 校验捷径每段都真的无碰撞
let segOk = true;
for (let i = 0; i < sc.length - 1; i++) if (!C.segmentFree(cs3, sc[i], sc[i + 1])) segOk = false;
ok(segOk, '捷径每一段都通过真实碰撞校验');
// 端点必须与目标一致
const last = sc[sc.length - 1];
ok(Math.abs(last.cx - to.cx) < 1e-9 && Math.abs(last.cy - to.cy) < 1e-9 && Math.abs(last.deg - to.deg) < 1e-9, '终点等于目标位姿');

console.log('\n[6] 起点被方块压住时要能识别');
const bad = C.reach(cs, { cx: 1.5, cy: 0.5, deg: 0 });
ok(!bad.ok && bad.reason === 'start-blocked', '压住时返回 start-blocked');

console.log('\n[7] 一层前瞻：挪哪块能扩大可达域');
const cands = [];
for (const b of LV.blocks) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!G.fits(LV, LV.blocks, REF, SOFA, b, b.x + dx, b.y + dy)) continue;
    const lvx = JSON.parse(JSON.stringify(LV));
    const bb = lvx.blocks.find(z => z.id === b.id);
    bb.x += dx; bb.y += dy;
    const csx = C.build(lvx, lvx.blocks, SOFA, { step: 0.05, thStep: 2.5 });
    const rx = C.reach(csx, REF);
    cands.push({ id: b.id, dx, dy, pos: rx.posCount, visited: rx.visited });
  }
}
cands.sort((a, b) => b.visited - a.visited);
console.log('     候选: ' + cands.slice(0, 5).map(c => `${c.id}(${c.dx},${c.dy}) 可达${c.visited}`).join('  '));
ok(cands.length > 0, '存在合法的一步挪动');
ok(cands[0].id === 'c' && cands[0].dy === 1, '首选是浅蓝 2×1 下移一格');
ok(cands[0].visited > 50, '首选能把可达位姿提到 50 以上', cands[0].visited);

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
