/* ────────────────────────────────────────────────────────────────
 * levels.js — 内置关卡库（浏览器与 node 共用）
 *
 * 每个关卡是工厂函数，返回 { name, w, h, pieces, goals, meta }
 *   meta 由 tools/grade.js / tools/gen/verify-candidates.js 实算出来
 *   （最短步数、手数、可达状态、最短路径条数、岔路代价、难度分），
 *   test/levels.test.js 会重算并逐项断言，避免"分数是编的"。
 *
 * 设计取舍：
 *   - 沙发不是刚体：转体只看「落点三格空闲 + 缺口正对的那格也空闲」，
 *     所以沙发关必须**在缺口前方留出空位**，否则它一步也转不了；
 *   - 扇形块（1/4、1/2、3/4、整圆）只能绕自身圆心转，同心多块整体联动；
 *   - 「半月 / 一线天 / 圆角」已删：前两个是现有关的下位替代，
 *     圆角是横刀立马的同构改版（多一块只会原地打转的扇形，思路完全一致）；
 *   - 「满月与半月」更名为「阴晴圆缺」（三个半圆拼月相，与"满月/半月"的叫法不符）；
 *   - 「不相邻断块」做过多次尝试：4×5/4×6 上都会把紧凑棋盘焊死（全程无解），
 *     机制本身仍由引擎/编辑器支持，只是不适合当预设关；
 *   - 关卡的可达状态尽量压在 15 万以内：难度分不看状态空间（见 sofa-klotski.js
 *     的 difficulty），但状态太多会让"分析难度"按钮等太久。
 * ──────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const T = {
    red: '#ed1c24', org: '#ff7f27', yel: '#fff200', cyn: '#00a2e8', blu: '#3f48cc',
    pnk: '#ffaec9', brn: '#b97a57', mag: '#a349a4', grn: '#22b14c', gry: '#6b6480',
    lime: '#8ab72a', pur: '#5c00e6'
  };

  /** 2×2 主角回到底行正中 */
  function goalBottom(w, h, piece) {
    const x0 = Math.floor((w - 2) / 2);
    return {
      piece: piece || 'hero', label: '底行正中',
      cells: [[x0, h - 2], [x0 + 1, h - 2], [x0, h - 1], [x0 + 1, h - 1]]
    };
  }
  function goalCorner(w, h, piece) {
    return {
      piece: piece || 'hero', label: '右下角',
      cells: [[w - 2, h - 2], [w - 1, h - 2], [w - 2, h - 1], [w - 1, h - 1]]
    };
  }
  /** 半圆格：arc 指圆心所在的那个角 */
  const semiCells = () => [{ c: 0, r: 0, arc: [1, 1] }, { c: 1, r: 0, arc: [0, 1] }];
  const P = (id, x, y, shape, color, name, extra) =>
    Object.assign({ id, x, y, ori: 0, shape, color, name }, extra || {});

  /* 预置评分：用 tools/gen/refresh-meta.js 重算后贴回来（test 会逐项核对）
   * 难度 = 长度 45 + 岔路干扰 43 + 路径唯一性 12，再乘长度门槛；状态空间不参与打分 */
  const META = {
    classic: { score: 70, grade: '极难', depth: 76, hands: 63, states: 25955, paths: 620544, waste: 5.2, same: 1.16 },
    yinQingYuanQue: { score: 52, grade: '中等', depth: 40, hands: 35, states: 10988, paths: 2496, waste: 2.45, same: 1.3 },
    lockedGate: { score: 54, grade: '困难', depth: 39, hands: 34, states: 26745, paths: 845680, waste: 5.15, same: 1.54 },
    ambush: { score: 75, grade: '极难', depth: 114, hands: 100, states: 81340, paths: 1788272640, waste: 4.74, same: 1.25 },
    furnitureMall: { score: 75, grade: '极难', depth: 109, hands: 96, states: 8932, paths: 3840, waste: 4.11, same: 1.12 },
    sofaSeat: { score: 35, grade: '简单', depth: 21, hands: 17, states: 64061, paths: 348, waste: 5.48, same: 1.48 },
    hengDaoWanMa: { score: 67, grade: '极难', depth: 66, hands: 58, states: 26470, paths: 80, waste: 4, same: 1.09 },
    shangXiaHui: { score: 65, grade: '困难', depth: 61, hands: 58, states: 21528, paths: 1419264, waste: 4.33, same: 1.43 },
    quJingTongYou: { score: 87, grade: '极难', depth: 239, hands: 212, states: 95944, paths: 3380045980631040, waste: 3.71, same: 1.22 },
    wanLiZhengTu: { score: 78, grade: '极难', depth: 1348, hands: 1144, states: 1200002, paths: 4.5138687416092e+59, waste: 0, same: 0 },
    cengCengSheKa: { score: 77, grade: '极难', depth: 118, hands: 101, states: 25476, paths: 1990656, waste: 3.25, same: 1.19 },
    // blank 无解/工具关，不写入 meta
    // 4阶数字华容道（fifteen）：分数来自 tools/score-p15.js 的抽样平均，标 estimated
    fifteen: { score: 48, grade: '中等', depth: 0, hands: 23, states: 0, paths: 0, waste: 0, same: 0, estimated: true },
  };


  /* ══════════ 2. 横刀立马 ══════════ */
  function classic() {
    return {
      name: '横刀立马', w: 4, h: 5, meta: META.classic,
      pieces: [
        P('zhang', 0, 0, '1x2', T.blu, '张飞'), P('hero', 1, 0, '2x2', T.org, '曹操', { hero: true }),
        P('zhao', 3, 0, '1x2', T.blu, '赵云'), P('ma', 0, 2, '1x2', T.blu, '马超'),
        P('guan', 1, 2, '2x1', T.cyn, '关羽'), P('huang', 3, 2, '1x2', T.blu, '黄忠'),
        P('z1', 1, 3, '1x1', T.pnk, '卒1'), P('z2', 2, 3, '1x1', T.pnk, '卒2'),
        P('z3', 0, 4, '1x1', T.pnk, '卒3'), P('z4', 3, 4, '1x1', T.pnk, '卒4')
      ],
      goals: [goalBottom(4, 5)]
    };
  }

  /* ══════════ 3. 阴晴圆缺（4×4，三个半圆） ══════════
   * 三个半圆围出「月相」：两块同心能拼出整圆，第三块只能绕自己的圆心转。
   * 目标是把方块送到右下角 —— 半圆转错方向就会把自己锁死。 */
  function yinQingYuanQue() {
    return {
      name: '阴晴圆缺', w: 4, h: 4, meta: META.yinQingYuanQue,
      pieces: [
        P('sq', 0, 0, '2x2', T.org, '月宫', { hero: true }),
        P('vv', 3, 0, '1x2', T.blu, '云柱'),
        P('hh', 2, 2, '2x1', T.cyn, '云带'),
        P('s1', 0, 2, 'semi', '#8e6bd0', '上弦月', { ori: 0 }),
        P('s2', 0, 3, 'semi', T.mag, '下弦月', { ori: 2 }),
        P('s3', 2, 3, 'semi', '#6f4fbf', '残月', { ori: 0 })
      ],
      goals: [goalCorner(4, 4, 'sq')]
    };
  }

  /* ══════════ 4. 4阶数字华容道（十五子） ══════════
   * 按「随机型关卡」的规则来写：文件里存的是**还原态**，开局由 shuffle 属性随机打乱，
   * 不再在代码里塞一个写死种子的打乱。 */
  function fifteen() {
    const slot = k => [k % 4, Math.floor(k / 4)];
    // 配色 = 还原态的配色：颜色跟着**目标格**走（第 1 格最红、第 15 格最蓝），
    // 所以拼回去的那一刻整盘是一条彩虹；打乱时颜色是散的，正好当找块的线索。
    const PAL = ['#ed1c24', '#d72d33', '#c03539', '#ab3b3e', '#ff7f27',
      '#fff200', '#cfc817', '#aba526', '#d97736', '#7ddc9a',
      '#00a2e8', '#1188bb', '#b16939', '#7ebe91', '#3f48cc'];
    const pieces = [], goals = [];
    for (let i = 0; i < 15; i++) {
      pieces.push({ id: 'n' + (i + 1), x: slot(i)[0], y: slot(i)[1], shape: '1x1', color: PAL[i], name: String(i + 1) });
      goals.push({ piece: 'n' + (i + 1), cells: [slot(i)] });
    }
    return {
      name: '4阶数字华容道', w: 4, h: 4, pieces, goals,
      shuffle: true, shuffleSteps: 300, meta: META.fifteen || null
    };
  }

  /* ══════════ 5. 锁门（锁定石块当墙） ══════════
   * 横刀立马去掉一个卒腾出空间，再把赵云焊死 —— 不动的墙逼着换路线。 */
  function lockedGate() {
    return {
      name: '锁门', w: 4, h: 5, meta: META.lockedGate,
      pieces: [
        P('zhang', 0, 0, '1x2', T.blu, '门框'),
        P('hero', 1, 0, '2x2', T.org, '门环', { hero: true }),
        P('zhao', 3, 0, '1x2', T.gry, '石闩', { lock: true }),
        P('ma', 0, 2, '1x2', T.blu, '门扇'),
        P('guan', 1, 2, '2x1', T.cyn, '门闩'),
        P('huang', 3, 2, '1x2', T.blu, '门轴'),
        P('z2', 2, 3, '1x1', T.pnk, '铺首'),
        P('z3', 0, 4, '1x1', T.pnk, '门钹'), P('z4', 3, 4, '1x1', T.pnk, '门钉')
      ],
      goals: [goalBottom(4, 5)]
    };
  }

  /* ══════════ 6. 重门叠锁（用户提供的传统华容道最难布局） ══════════
   * 原名「传统华容道最难关」；10 块把 2×2 围在右上，只有 2 个空格。 */
  function ambush() {
    return {
      name: '重门叠锁', w: 4, h: 5, meta: META.ambush,
      pieces: [
        P('u13', 0, 0, '1x2', T.grn, '门框'),
        P('u14', 0, 2, '1x2', T.brn, '门扇'),
        P('u15', 0, 4, '2x1', T.cyn, '门闩'),
        P('u16', 1, 3, '2x1', T.blu, '门槛'),
        P('u17', 1, 1, '1x2', T.cyn, '门轴'),
        P('u18', 1, 0, '1x1', T.pur, '铺首'),
        P('u19', 2, 0, '1x1', T.yel, '门钹'),
        P('u20', 3, 0, '1x1', T.pnk, '门钉'),
        P('u21', 2, 4, '1x1', T.mag, '门枕'),
        P('u23', 2, 1, '2x2', T.lime, '门环')
      ],
      goals: [{ piece: 'u23', label: '底行正中', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }]
    };
  }

  /* ══════════ 7. 家具城（5×5，两块各自归位） ══════════
   * 唯一一关"两个目标"：2×2 大柜要绕到左上角，1×2 立柜要沉到右下角。
   * 两者方向相反，一路让谁先走都得重排 —— 97 手但只有 8932 个可达状态，
   * 是"路很长、空间很小"的深局（`tools/gen/logs/twoGoals-u8.jsonl` 里搜出来的 #2）。 */
  function furnitureMall() {
    return {
      name: '家具城', w: 5, h: 5, meta: META.furnitureMall,
      pieces: [
        P('hero', 0, 3, '2x2', T.org, '大柜', { hero: true }),
        P('bar', 3, 1, '1x2', T.cyn, '立柜'),
        P('f3', 1, 1, '2x2', T.lime, '方几'),
        P('f4', 2, 3, '2x1', T.brn, '木箱'),
        P('f5', 1, 0, '1x1', T.pnk, '石墩'),
        P('f6', 3, 0, '2x1', T.blu, '坐垫'),
        P('f7', 4, 3, '1x2', T.grn, '台灯'),
        P('f8', 2, 4, '2x1', T.mag, '花架'),
        P('f9', 0, 1, '1x2', '#7ddc9a', '鞋柜'),
        P('f10', 4, 2, '1x1', T.yel, '书柜'),
        P('f11', 4, 1, '1x1', T.red, '凳子')
      ],
      goals: [
        { piece: 'hero', label: '左上角', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
        { piece: 'bar', label: '右下角', cells: [[4, 3], [4, 4]] }
      ]
    };
  }

  /* ══════════ 8. 沙发入座（5×4，目标块就是沙发） ══════════
   * 唯一一关"把沙发搬到指定位置"：沙发竖在左列、缺口朝右，要横到底行右端。
   * 沙发只能围着缺口前那一格转身，所以先得把右下方腾出可叼的墙角。 */
  function sofaSeat() {
    return {
      name: '沙发入座', w: 5, h: 4, meta: META.sofaSeat,
      pieces: [
        P('sofa', 0, 0, 'sofa', T.grn, '沙发', { hero: true }),
        P('wall', 4, 0, '1x2', T.gry, '承重墙', { lock: true }),
        P('f3', 3, 2, '2x1', T.cyn, '茶几'),
        P('f4', 2, 0, '1x2', T.brn, '木箱'),
        P('f5', 0, 3, '2x1', T.pnk, '石墩'),
        P('f6', 2, 3, '2x1', T.blu, '坐垫'),
        P('f7', 4, 3, '1x1', T.yel, '台灯'),
        P('f8', 3, 0, '1x2', T.mag, '花架'),
        P('f9', 1, 0, '1x1', T.lime, '鞋柜')
      ],
      goals: [{ piece: 'sofa', label: '底行右端横放', cells: [[2, 3], [3, 3], [4, 3]] }]
    };
  }

  /* ══════════ 9. 横刀弯马（4×5，用户设计） ══════════
   * 横刀立马的桌上放一把沙发：沙发贴左列、缺口朝右叼住卒子转身，
   * 一路要转 6 次才把底行让给曹操。沙发的转体判定就是"绕缺口前那一格"，
   * 这一关正是这套规则的代表局（解法视频：Videos\v\4B4\未标题-1.mp4）。 */
  function hengDaoWanMa() {
    return {
      name: '横刀弯马', w: 4, h: 5, meta: META.hengDaoWanMa,
      pieces: [
        P('zhang', 0, 0, '1x2', T.blu, '张飞'),
        P('hero', 1, 0, '2x2', T.org, '曹操', { hero: true }),
        P('zhao', 3, 0, '1x2', T.blu, '赵云'),
        P('guan', 1, 2, '2x1', T.cyn, '关羽'),
        P('huang', 3, 2, '1x2', T.blu, '黄忠'),
        P('z1', 1, 3, '1x1', T.pnk, '卒1'),
        P('z2', 2, 3, '1x1', T.pnk, '卒2'),
        P('z4', 3, 4, '1x1', T.pnk, '卒4'),
        P('sofa', 0, 2, 'sofa', T.grn, '胡床', { ori: 0 })
      ],
      goals: [goalBottom(4, 5)]
    };
  }

  /* ══════════ 9. 上下交汇（4×4，两个异形块各自归位） ══════════
   * 用户设计：两块"隔格双联"（同一行上隔一格的两块，刚性平移、不能转）。
   * 一个要从下往上、一个要从上往下，正好在半路交汇 —— 谁先让谁后让全得算清。 */
  function shangXiaHui() {
    return {
      name: '上下交汇', w: 4, h: 4, meta: META.shangXiaHui,
      pieces: [
        P('u9', 1, 1, '1x2', T.blu, '上桥'),
        P('u10', 2, 1, '1x2', T.cyn, '下桥'),
        P('c11', 1, 3, 'custom', T.grn, '左栈道', {
          ori: 0, rot: 'pivot', cells: [{ c: 0, r: 0, arc: null }, { c: 2, r: 0, arc: null }]
        }),
        P('c12', 0, 0, 'custom', T.pnk, '右栈道', {
          ori: 0, rot: 'pivot', cells: [{ c: 0, r: 0, arc: null }, { c: 2, r: 0, arc: null }]
        }),
        P('u13', 3, 0, '1x1', '#105b27', '青石'),
        P('u14', 3, 1, '1x1', T.mag, '卵石'),
        P('u15', 3, 2, '1x1', T.grn, '碎石'),
        P('u16', 0, 1, '1x1', T.mag, '河石'),
        P('u17', 0, 2, '1x1', '#ca4974', '暗礁'),
        // 玩家在编辑器里补的那颗卒（原 id 与上面的 u10 撞了，这里改名 z18）
        P('z18', 0, 3, '1x1', T.yel, '浅滩')
      ],
      goals: [
        { piece: 'c11', label: '隔格到顶行', cells: [[0, 0], [2, 0]] },
        { piece: 'c12', label: '隔格到底行', cells: [[1, 3], [3, 3]] }
      ]
    };
  }

  /* ══════════ 曲径通幽（同构成下的最长最短解，已证明） ══════════
   * 构成：4×5 / 草丛 2×2 / 沙发 / 2 横条 / 2 竖条 / 3 卒 = 18 格（2 空格）。
   * 来源：把「草丛已在底行正中」的 482,880 个布局全部当多源起点做 BFS，
   *       主分量 95,944 态，取离目标集最远的那个 ——
   *       所以 239 步是这个构成下「最少步数」的最大值，不是抽样碰巧找到的。
   * 布局：草丛窝在左上角，沙发横躺在底行封住出口，长条与卒把两个空格挤在右上与中腰。 */
  function quJingTongYou() {
    return {
      name: '曲径通幽', w: 4, h: 5, meta: META.quJingTongYou,
      pieces: [
        P('hero', 0, 0, '2x2', T.org, '假山', { hero: true }),
        P('sofa', 1, 3, 'sofa', T.grn, '曲廊', { ori: 3 }),
        P('h1', 2, 4, '2x1', T.cyn, '石桥'),
        P('h2', 2, 2, '2x1', T.cyn, '廊桥'),
        P('v1', 0, 2, '1x2', T.blu, '修竹'),
        P('v2', 3, 0, '1x2', T.blu, '老松'),
        P('z1', 0, 4, '1x1', T.pnk, '苔石'),
        P('z2', 2, 1, '1x1', T.pnk, '石灯'),
        P('z3', 1, 4, '1x1', T.pnk, '落花')
      ],
      goals: [goalBottom(4, 5)]
    };
  }

  /* ══════════ 万里征途（玩家在编辑器里做的 4×7 长关） ══════════
   * 20 格被占、留 8 个空格，目标是把棕色 2×2 送到底行正中。
   * 1348 单位步 / 1165 手，可达 133 万态 —— 全库最长的一关（分析一次约 1 分钟）。
   * 原样搬运玩家存档（含 1×3、L3、3/4 圆各一块）；只有 id 撞车的部件改了名。 */
  function wanLiZhengTu() {
    return {
      name: '万里征途', w: 4, h: 7, meta: META.wanLiZhengTu,
      pieces: [
        P('u12', 0, 0, '2x1', T.grn, '货箱'),
        P('u13', 2, 0, '2x1', T.pnk, '粮袋'),
        P('u14', 0, 1, '2x2', T.brn, '车头', { hero: true }),
        P('u15', 2, 1, '1x2', T.cyn, '货柜'),
        P('u16', 3, 1, '1x3', T.red, '旗杆'),
        P('u17', 1, 3, '1x2', '#bf456e', '木柱'),
        P('u18', 2, 3, '1x2', T.yel, '布幡'),
        P('u19', 0, 3, '1x1', '#84cee7', '油灯'),
        P('u20', 3, 4, '1x1', '#d1b8b9', '陶坛'),
        P('u21', 3, 6, '1x1', '#33b72a', '界石'),
        P('u23', 0, 4, 'L3', '#43df8f', '车辕'),
        P('u25', 2, 5, 'threeQuarter', '#113a4b', '车轮')
      ],
      goals: [{ piece: 'u14', label: '底行正中', cells: [[1, 5], [2, 5], [1, 6], [2, 6]] }]
    };
  }

  /* ══════════ 层层设卡（同构成「3 横 1 竖」下的最长最短解，已证明） ══════════
   * 构成：4×5 / 草丛 2×2 / 沙发 / 3 横条 + 1 竖条 / 3 卒 = 18 格（2 空格）。
   * 做法同「曲径通幽」：把 305,280 个「草丛已在底行正中」的布局当多源起点做 BFS，
   * 全图 65,884 态，取最远 —— 118 步就是这套构成下最少步数的最大值。
   * 布局：草丛在顶行中段，沙发竖着贴右墙，三根横条层层压在下面。 */
  function cengCengSheKa() {
    return {
      name: '层层设卡', w: 4, h: 5, meta: META.cengCengSheKa,
      pieces: [
        P('hero', 1, 0, '2x2', T.org, '山寨', { hero: true }),
        P('sofa', 3, 0, 'sofa', T.grn, '吊桥', { ori: 2 }),
        P('b1', 0, 2, '2x1', T.cyn, '拒马'),
        P('b2', 0, 4, '2x1', T.cyn, '鹿角'),
        P('b3', 1, 3, '2x1', T.cyn, '铁蒺藜'),
        P('b4', 3, 3, '1x2', T.blu, '望楼'),
        P('z1', 0, 3, '1x1', T.pnk, '哨兵'),
        P('z2', 0, 0, '1x1', T.pnk, '号手'),
        P('z3', 2, 4, '1x1', T.pnk, '传令')
      ],
      goals: [goalBottom(4, 5)]
    };
  }

  const LEVELS = {
    classic, yinQingYuanQue, fifteen,
    lockedGate, ambush, furnitureMall, sofaSeat, hengDaoWanMa, shangXiaHui, quJingTongYou, wanLiZhengTu, cengCengSheKa,
    // 「空盘」这一关已经从关卡库删掉了（编辑器里改用「清空棋盘」按钮）。
    // 工厂留着：编辑器清空棋盘、老脚本和几个回归用例还要一个空白盘面。
    blank: () => ({ name: '空盘', w: 4, h: 5, pieces: [], goals: [] })
  };
  global.LEVELS = LEVELS;
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
