/* 用户手工补充的关卡（原样保存用户给的 JSON；起名/配色/难度/解法由 tools/add-levels.js 负责）
 * 想再加关：往这个数组里塞一条 { set, name, note, level } 或 { set, mazeText, ... } 即可。
 */
module.exports = [
  /* ── 1. 用户叫它「4*4最难」：4×4 里塞了半圆 + 沙发 + 3 个方块 ── */
  {
    set: '待分类',
    was: '4*4最难',
    name: '深夜食堂',
    note: '用户存档「4*4最难」',
    level: {
      name: '深夜食堂', w: 4, h: 4,
      goals: [{ piece: 'u10', cells: [[2, 2], [3, 2], [2, 3], [3, 3]] }],
      pieces: [
        { id: 'u10', x: 0, y: 0, ori: 0, shape: '2x2', color: '#22b14c', name: '2×2' },
        { id: 'u11', x: 2, y: 1, ori: 0, shape: '2x1', color: '#3f48cc', name: '2×1' },
        { id: 'u12', x: 3, y: 2, ori: 0, shape: '1x2', color: '#ed1c24', name: '1×2' },
        { id: 'u13', x: 0, y: 2, ori: 0, shape: '1x1', color: '#3f48cc', name: '1×1' },
        { id: 'u14', x: 1, y: 2, ori: 0, shape: 'semi', color: '#3f48cc', name: '半圆' },
        { id: 'u15', x: 0, y: 3, ori: 3, shape: 'sofa', color: '#00a2e8', name: '沙发' }
      ]
    }
  },

  /* ── 2. 「手指1」：只有合移位集合里才有的自绘"爪子"（3 格带缺口 + 2 格） ── */
  {
    set: '合移位',
    was: '手指1',
    name: '抓娃娃机',
    note: '用户存档「手指1」',
    level: {
      name: '抓娃娃机', w: 5, h: 5,
      goals: [{ piece: 'u13', cells: [[4, 3], [4, 4]] }],
      pieces: [
        { id: 'c9', x: 1, y: 0, ori: 0, shape: 'custom', color: '#f38227', name: '自绘1',
          cells: [{ c: 0, r: 0 }, { c: 2, r: 0 }, { c: 1, r: 1 }], rot: false },
        { id: 'c11', x: 3, y: 0, ori: 0, shape: 'custom', color: '#c151e1', name: '自绘2',
          cells: [{ c: 1, r: 0 }, { c: 0, r: 1 }, { c: 1, r: 2 }], rot: false },
        { id: 'c12', x: 0, y: 1, ori: 0, shape: 'custom', color: '#22b14c', name: '自绘3',
          cells: [{ c: 1, r: 0 }, { c: 0, r: 1 }, { c: 0, r: 2 }], rot: false },
        { id: 'u13', x: 1, y: 2, ori: 0, shape: '1x2', color: '#ff004c', name: '1×2' },
        { id: 'c14', x: 3, y: 2, ori: 0, shape: 'custom', color: '#fff200', name: '自绘4',
          cells: [{ c: 0, r: 0 }, { c: 1, r: 1 }], rot: false },
        { id: 'u15', x: 2, y: 2, ori: 0, shape: 'L3', color: '#00a2e8', name: 'L 3格' }
      ]
    }
  },

  /* ── 3. 「墙」 ── */
  {
    set: '合移位',
    was: '墙',
    name: '冰箱贴',
    note: '用户存档「墙」',
    level: {
      name: '冰箱贴', w: 4, h: 5,
      goals: [{ piece: 'u10', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
      pieces: [
        { id: 'u8', x: 0, y: 3, ori: 0, shape: '1x1', color: '#ff7f27', name: '1×1', lock: true },
        { id: 'u9', x: 0, y: 4, ori: 0, shape: '1x1', color: '#a349a4', name: '1×1' },
        { id: 'u10', x: 1, y: 2, ori: 0, shape: '2x2', color: '#ffaec9', name: '2×2' },
        { id: 'u11', x: 1, y: 4, ori: 0, shape: '2x1', color: '#d193d2', name: '2×1' },
        { id: 'u12', x: 0, y: 0, ori: 3, shape: 'sofa', color: '#531d54', name: '沙发' }
      ]
    }
  },

  /* ── 4. 「终极墙」 ── */
  {
    set: '合移位',
    was: '终极墙',
    name: '冷冻室',
    note: '用户存档「终极墙」',
    level: {
      name: '冷冻室', w: 4, h: 5,
      goals: [{ piece: 'u10', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
      pieces: [
        { id: 'u8', x: 0, y: 3, ori: 0, shape: '1x1', color: '#ff7f27', name: '1×1', lock: true },
        { id: 'u9', x: 0, y: 4, ori: 0, shape: '1x1', color: '#a349a4', name: '1×1' },
        { id: 'u10', x: 1, y: 2, ori: 0, shape: '2x2', color: '#ffaec9', name: '2×2' },
        { id: 'u11', x: 1, y: 4, ori: 0, shape: '2x1', color: '#d193d2', name: '2×1' },
        { id: 'u12', x: 0, y: 0, ori: 3, shape: 'sofa', color: '#531d54', name: '沙发' },
        { id: 'u15', x: 3, y: 0, ori: 0, shape: '1x2', color: '#ff7f27', name: '1×2' },
        { id: 'u22', x: 1, y: 1, ori: 0, shape: 'semi', color: '#00a2e8', name: '半圆' },
        { id: 'u24', x: 0, y: 1, ori: 0, shape: '1x1', color: '#ffaec9', name: '1×1' },
        { id: 'u25', x: 0, y: 2, ori: 0, shape: '1x1', color: '#00a2e8', name: '1×1' }
      ]
    }
  },

  /* ── 5. 「小迷宫」 ── */
  {
    set: '合移位',
    was: '小迷宫',
    name: '电路板',
    note: '用户存档「小迷宫」',
    level: {
      name: '电路板', w: 4, h: 5,
      goals: [{ piece: 'u10', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
      pieces: [
        { id: 'u8', x: 0, y: 3, ori: 0, shape: '1x1', color: '#ff7f27', name: '1×1', lock: true },
        { id: 'u10', x: 2, y: 1, ori: 0, shape: '2x2', color: '#ffaec9', name: '2×2' },
        { id: 'u11', x: 2, y: 4, ori: 0, shape: '2x1', color: '#d193d2', name: '2×1' },
        { id: 'u24', x: 1, y: 1, ori: 0, shape: '1x1', color: '#ffaec9', name: '1×1', lock: true },
        { id: 'u10b', x: 1, y: 3, ori: 0, shape: '2x1', color: '#22b14c', name: '2×1' },
        { id: 'u11b', x: 0, y: 4, ori: 0, shape: 'semi', color: '#b97a57', name: '半圆' }
      ]
    }
  },

  /* ── 6. 「大迷宫」：从华容道ex 的 预设.txt 正规导入（20×20，53 块墙） ── */
  {
    set: '合移位',
    was: '大迷宫',
    name: '巨石阵',
    note: '用户存档「大迷宫」（预设.txt 20×20）',
    hrs: { file: 'D:/Download/华容道ex/levels/预设.txt', name: '大迷宫' }
  },

  /* ── 7. 「看似无解」 ── */
  {
    set: '合移位',
    was: '看似无解',
    name: '集装箱',
    note: '用户存档「看似无解」',
    level: {
      name: '集装箱', w: 4, h: 4,
      goals: [{ piece: 'u10', cells: [[2, 2], [3, 2], [2, 3], [3, 3]] }],
      pieces: [
        { id: 'u8', x: 0, y: 3, ori: 0, shape: '1x1', color: '#ff7f27', name: '1×1' },
        { id: 'u10', x: 0, y: 0, ori: 0, shape: '2x2', color: '#ffaec9', name: '2×2' },
        { id: 'u24', x: 0, y: 2, ori: 0, shape: '1x1', color: '#ffaec9', name: '1×1' },
        { id: 'u10b', x: 2, y: 0, ori: 0, shape: '2x1', color: '#22b14c', name: '2×1' },
        { id: 'u7', x: 2, y: 1, ori: 0, shape: '2x1', color: '#a349a4', name: '2×1' },
        { id: 'u8b', x: 1, y: 2, ori: 0, shape: '1x2', color: '#ffaec9', name: '1×2' },
        { id: 'u9', x: 2, y: 2, ori: 0, shape: '1x2', color: '#ed1c24', name: '1×2' }
      ]
    }
  },

  /* ── 8. 「气与墙」：四个半圆顶在一起 ── */
  {
    set: '合移位',
    was: '气与墙',
    name: '气球摊',
    note: '用户存档「气与墙」',
    level: {
      name: '气球摊', w: 4, h: 5,
      goals: [{ piece: 'u10', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
      pieces: [
        { id: 'u8', x: 3, y: 4, ori: 0, shape: '1x1', color: '#ff7f27', name: '1×1', lock: true },
        { id: 'u10', x: 1, y: 0, ori: 0, shape: '2x2', color: '#ffaec9', name: '2×2' },
        { id: 'u24', x: 2, y: 2, ori: 0, shape: '1x1', color: '#ffaec9', name: '1×1', lock: true },
        { id: 'u8b', x: 3, y: 0, ori: 0, shape: '1x1', color: '#3f48cc', name: '1×1', lock: true },
        { id: 'u9', x: 3, y: 2, ori: 0, shape: '1x1', color: '#ff7f27', name: '1×1' },
        { id: 'u10b', x: 3, y: 3, ori: 0, shape: '1x1', color: '#a349a4', name: '1×1' },
        { id: 'u11', x: 0, y: 1, ori: 0, shape: '1x1', color: '#a349a4', name: '1×1' },
        { id: 'u12', x: 0, y: 2, ori: 0, shape: 'semi', color: '#3f48cc', name: '半圆' },
        { id: 'u13', x: 0, y: 3, ori: 1, shape: 'semi', color: '#b97a57', name: '半圆' },
        { id: 'u14', x: 1, y: 3, ori: 3, shape: 'semi', color: '#ffaec9', name: '半圆' },
        { id: 'u15', x: 2, y: 3, ori: 3, shape: 'semi', color: '#22b14c', name: '半圆' }
      ]
    }
  },

  /* ── 9. 「近在眼前」→「镜在眼前」：一副眼镜（近视眼/远视眼 + 瞳 + 凸/凹透镜） ── */
  {
    set: '合移位',
    was: '近在眼前',
    name: '镜在眼前',
    note: '用户存档「近在眼前」',
    level: {
      name: '镜在眼前', w: 4, h: 4,
      goals: [
        { piece: 'c18', cells: [[2, 1], [2, 3]] },
        { piece: 'c16', cells: [[1, 2], [3, 2]] }
      ],
      pieces: [
        { id: 'c16', x: 0, y: 1, ori: 0, shape: 'custom', color: '#5d4724ff', name: '近视眼',
          cells: [{ c: 0, r: 0 }, { c: 2, r: 0 }], rot: false },
        { id: 'u17', x: 1, y: 1, ori: 0, shape: '1x1', color: '#FFFFFF', name: '瞳' },
        { id: 'c18', x: 1, y: 0, ori: 0, shape: 'custom', color: '#181660ff', name: '远视眼', hero: true,
          cells: [{ c: 0, r: 0 }, { c: 0, r: 2 }], rot: false },
        { id: 'u19', x: 3, y: 0, ori: 0, shape: '1x2', color: '#8ca4ebff', name: '凸透镜' },
        { id: 'u20', x: 0, y: 3, ori: 0, shape: '2x1', color: '#80d8d0ff', name: '凹透镜' }
      ]
    }
  },
  /* ── 10. 「来拍照吧」：两只手比心 + 一颗圆脑袋（内切圆） ── */
  {
    set: '待分类',
    was: '来拍照吧',
    name: '来拍照吧',
    note: '用户存档「来拍照吧」',
    level: {
      name: '来拍照吧', w: 4, h: 5,
      goals: [{ piece: 'u28', cells: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
      pieces: [
        { id: 'u7', x: 0, y: 0, ori: 1, shape: 'L3', color: '#22b14c', name: '左手' },
        { id: 'u8', x: 2, y: 2, ori: 3, shape: 'L3', color: '#22b14c', name: '右手' },
        { id: 'u28', x: 1, y: 1, ori: 0, shape: 'disc', color: '#00a2e8', name: '可爱捏' },
        { id: 'u29', x: 0, y: 3, ori: 0, shape: '2x1', color: '#931ed2', name: '茄子' },
        { id: 'u30', x: 2, y: 0, ori: 0, shape: '2x1', color: '#ed1c24', name: '不甜' },
        { id: 'u32', x: 0, y: 4, ori: 0, shape: '1x1', color: '#ff7f27', name: '摄影大师' },
        { id: 'u33', x: 1, y: 4, ori: 0, shape: '1x1', color: '#ffaec9', name: '高端镜头' },
        { id: 'u36', x: 3, y: 1, ori: 0, shape: '1x1', color: '#fff200', name: '耶' }
      ]
    }
  }
];
