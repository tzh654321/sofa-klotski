/* 从「华容道ex」的两个文本文件导入关卡 → levels/华容之书/*.json
 *
 * 用法：node tools/import-hrs.js
 * 源：D:/Download/华容道ex/levels/华容之书.txt（GB18030） + D:/Download/华容道ex/游戏说明.txt
 *   - 游戏说明里只有「横刀立马」这一局（作为格式示例），正好用我们自己的「横刀立马」顶替
 *   - 华容之书里与我们 3 关同构成的直接换成我们的版本（用户指定：重门叠锁/曲径通幽/横刀立马/层层设卡）
 *   - 其余每关起一个新名字，原名（含源步数）存进 origin，悬停时显示
 */
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');
const { parseFile, readText } = require('./hrs-parse.js');
const { buildLevel, verify } = require('./hrs2level.js');
const LV = require('../levels.js');

const SRC = 'D:/Download/华容道ex';
const ROOT = path.join(__dirname, '..', 'levels');
const SET = '华容之书';

/* 新名字（按源文件里的顺序；被我们顶替的那几关不在这里） */
const NAMES = {
  '原版4竖 93': '四竖撑天',
  '原版5竖 28': '五柱擎天',
  '原版6竖 7': '六柱连城',
  '原版3横 135': '积木盒',
  '原版4横 97': '书山',
  '原版5横 56': '五线谱',
  '原版6横 53': '六弦',
  '原版+墙 208': '铁壁铜墙',
  '原版+2沙发 129': '双榻横陈',
  '原版+3沙发 95': '三榻为阵',
  '原版+4沙发 23': '四榻满堂',
  '原版+1半圆 130': '一叶帆',
  '原版+2半圆 96': '双拱桥',
  '原版+4半圆 62': '四弧环生',
  '原版+7半圆 27': '七彩阳光',
  '原版+1月亮 131': '观星台',
  '原版+2月亮 145': '街机厅',
  '原版+3月亮 51': '提瓦特',
  '原版+4月亮 11': '月相',
  '原版+1cubeL 121': '花瓣',
  '原版+2cubeL 202': '双翼',
  '原版+4cubeL 27': '江河湖海',
  '0小兵 149': '无卒之局',
  '1小兵 239': '工具箱',
  '2星星 41': '半人马座α',
  '已知最长 301': '长夜未央',
  '状态最多 15,2e7': '万象森罗',
  '求解很久 24': '思之弥艰'
};
/* 悬停第一行的来历（短，别堆废话） */
const NOTES = {
  '原版最长 138': '原版最长',
  '原版4竖 93': '原版4竖最难'
};
/* 每关一套主题：块名必须同一套词汇（形状拟物 + 曹操谐音随你挑）。
 * 三国只留给「1 曹操 + 5 长条 + 4 卒」的原版关（横刀立马 / 四竖撑天），其余一律换主题。 */
const STYLE = {
  /* ── 竖多：柱子 / 城垛 ── */
  '原版5竖 28': {
    hero: '神像',
    names: { '1x2': ['青石柱', '白石柱', '红漆柱', '木纹柱', '雕花柱'], '2x1': ['门楣'], '1x1': ['石墩', '香炉'] }
  },
  '原版6竖 7': {
    hero: '城门',
    names: { '1x2': ['垛口', '箭垛', '女墙', '望孔', '马面', '角楼'], '1x1': ['哨兵', '弓手'] }
  },
  /* ── 横多：积木 / 书架 / 谱线 / 琴弦 ── */
  '原版3横 135': {
    hero: '大积木',
    names: {
      '2x1': ['长条积木', '中方积木', '厚板积木'], '1x2': ['立柱积木', '拱形积木'],
      '1x1': ['骰子', '弹珠', '积木块', '拼片']
    }
  },
  '原版4横 97': {
    hero: '大辞典',
    names: {
      '2x1': ['摊开的书', '合上的书', '厚词典', '薄册子'], '1x2': ['竖放的书'],
      '1x1': ['书签', '橡皮', '钢笔', '便利贴']
    }
  },
  '原版5横 56': {
    hero: '谱号',
    names: { '2x1': ['第一线', '第二线', '第三线', '第四线', '第五线'], '1x1': ['四分音符', '八分音符', '附点音符', '休止符'] }
  },
  '原版6横 53': {
    hero: '琴身',
    names: { '2x1': ['宫弦', '商弦', '角弦', '徵弦', '羽弦', '变宫弦'], '1x1': ['拨片', '琴码'] }
  },
  /* ── 墙：金库 ── */
  '原版+墙 208': {
    hero: '保险柜',
    names: {
      '1x2': ['铁栅', '铜栅'], '2x1': ['托盘', '钱箱'],
      '1x1': ['金条', '银锭', '珠宝', '存单', '印章'], wall: ['混凝土墙']
    }
  },
  /* ── 沙发 = 家具（可当榻、也可当沙发） ── */
  '原版+2沙发 129': { hero: '拔步床', names: { sofa: ['卧榻', '软榻'], '1x2': ['屏风'], '2x1': ['茶几', '条案'], '1x1': ['香炉'] } },
  '原版+3沙发 95': { hero: '拔步床', names: { sofa: ['卧榻', '软榻', '竹榻'], '1x2': ['屏风'], '1x1': ['香炉', '灯台'] } },
  '原版+4沙发 23': { hero: '拔步床', names: { sofa: ['卧榻', '软榻', '竹榻', '藤榻'], '1x1': ['香炉', '灯台'] } },
  /* ── 半圆 = 帆 / 拱 / 拱窗 ── */
  '原版+1半圆 130': {
    hero: '货轮',
    names: { semi: ['船帆'], '1x2': ['主桅', '前桅', '斜桅'], '2x1': ['甲板', '舵板'], '1x1': ['浮标', '缆桩'] }
  },
  '原版+2半圆 96': {
    hero: '主桥',
    names: { semi: ['左拱', '右拱'], '1x2': ['桥墩', '中墩', '侧墩'], '2x1': ['桥面'], '1x1': ['路灯', '系船柱'] }
  },
  '原版+4半圆 62': {
    hero: '祭坛',
    names: { semi: ['拱窗', '玫瑰窗', '侧窗', '天窗'], '2x1': ['长椅'], '1x1': ['蜡烛', '香炉', '圣水盆', '烛台'] }
  },
  '原版+7半圆 27': {
    hero: '阳光', heroColor: '#ffffff',
    names: { semi: ['赤', '橙', '黄', '绿', '青', '蓝', '紫'] },
    colors: { semi: ['#e53935', '#f97316', '#fdd835', '#43a047', '#00acc1', '#3b82f6', '#a855f7'] }
  },
  /* ── 月亮（3/4 圆）= 残月 / 吃豆人 / 提瓦特的月 / 月相 ── */
  '原版+1月亮 131': {
    hero: '天文台',
    colors: { threeQuarter: ['#8ecae6'] },
    names: { threeQuarter: ['残月'], '1x2': ['望远镜', '天球仪'], '2x1': ['星图', '星盘'], '1x1': ['星子', '流星', '陨石'] }
  },
  '原版+2月亮 145': {
    hero: '弹珠台',
    colors: { threeQuarter: ['#fbbf24', '#38bdf8'] },
    names: { threeQuarter: ['吃豆人', '蓝幽灵'], '1x2': ['摇杆', '街机柜'], '1x1': ['金币', '代币', '手柄', '按钮'] }
  },
  '原版+3月亮 51': {
    hero: '绽放', heroColor: '#A5C73E',
    colors: {
      threeQuarter: ['#A4D2E5', '#DAC8B3', '#FBD3DA'],
      '1x1': ['#74C2A8', '#FCB632', '#AF8FC1', '#EF7939', '#9ED6E3']
    },
    names: { threeQuarter: ['霜月', '恒月', '虹月'], '1x1': ['风', '岩', '雷', '火', '冰'] }
  },
  '原版+4月亮 11': {
    hero: '地球',
    colors: { threeQuarter: ['#1e293b', '#64748b', '#e2e8f0', '#475569'] },
    names: { threeQuarter: ['朔月', '上弦月', '望月', '下弦月'], '1x1': ['流星'] }
  },
  /* ── 立体 L（水滴）= 花瓣 / 蝶翼 / 江河湖海 ── */
  '原版+1cubeL 121': {
    hero: '花盆',
    names: { diagSemi: ['花瓣'], '1x2': ['花茎'], '2x1': ['叶', '萼片'], '1x1': ['花粉', '露珠', '蜜蜂', '蝴蝶', '瓢虫'] }
  },
  '原版+2cubeL 202': {
    hero: '花丛',
    names: { diagSemi: ['左翼', '右翼'], '2x1': ['触角', '花茎'], '1x1': ['花蜜', '露珠', '蜜蜂', '瓢虫'] }
  },
  '原版+4cubeL 27': {
    hero: '汪洋',
    names: { diagSemi: ['江', '河', '湖', '海'], '1x1': ['水滴'] }
  },
  /* ── 混搭形状：一关一个说得通的场景 ── */
  '0小兵 149': {
    hero: '餐盘',
    names: { semi: ['煎蛋', '半块饼'], sofa: ['牛角包'], threeQuarter: ['甜甜圈'], '2x1': ['吐司'], '1x2': ['牛奶盒'] }
  },
  '1小兵 239': {
    hero: '工具包',
    names: { L3: ['扳手'], diagSemi: ['油壶'], semi: ['安全帽'], '2x1': ['锤子'], '1x2': ['螺丝刀'], '1x1': ['螺丝'] }
  },
  '2星星 41': {
    hero: '南门二A',
    names: { semi: ['巨行星'], '1x1': ['卫星', '陨石', '彗星', '星尘'], '2x2': ['南门二B', '比邻星'] },
    colors: { '2x2': ['#ff8a65', '#e0f2fe'] }
  },
  '已知最长 301': {
    hero: '高塔',
    names: { semi: ['拱月'], diagSemi: ['塔楼', '钟楼'], '2x1': ['天桥'], '1x1': ['灯火', '车灯', '窗光'], wall: ['围墙'] }
  },
  '状态最多 15,2e7': {
    hero: '古树',
    names: { semi: ['蘑菇', '松菇', '毒伞'], '1x2': ['树干'], '1x1': ['孢子', '松鼠', '苔藓', '甲虫'] }
  },
  '求解很久 24': {
    hero: '鲸',
    names: { semi: ['水母', '海月水母', '霞水母', '灯塔水母'], '1x2': ['水草'], '1x1': ['气泡', '海星', '小丑鱼'] }
  }
};
const POOL = {
  vert: ['张飞', '赵云', '马超', '黄忠', '魏延', '姜维', '关平'],
  horz: ['关羽', '张辽', '徐晃', '许褚', '夏侯惇', '曹仁', '于禁'],
  pawn: ['卒', '兵', '甲', '骑', '弓', '哨', '斥'],
  star: ['周仓', '关平'],
  semi: ['圆盾', '铁盾', '藤盾'],
  moon: ['月牙', '弯月'],
  L: ['云梯'],
  C: ['水滴'],
  sofa: ['胡床'],
  wall: ['拒马']
};
const SHAPE_KEY = { '1x2': 'vert', '2x1': 'horz', '1x1': 'pawn', '2x2': 'star', semi: 'semi', threeQuarter: 'moon', L3: 'L', diagSemi: 'C', sofa: 'sofa' };
/* 同构成 → 用我们已有关卡顶替（不留源版本，也不改名） */
const REPLACE = {
  '横刀立马': 'classic',            // 游戏说明里的示例局 = 我们已有的「横刀立马」
  '原版最长 138': 'ambush',          // 重门叠锁（同构成：3 竖 2 横 4 卒）
  '原版+1沙发 249': 'quJingTongYou'  // 曲径通幽（同构成：2 竖 2 横 3 卒 + 沙发）
};

/** 解析「游戏说明」里的示例局（以 ==========分隔线========== 包起来的块） */
function parseManual(file) {
  const txt = readText(file).replace(/\r/g, '');
  const i = txt.indexOf('==========分隔线==========');
  if (i < 0) return [];
  const body = txt.slice(i).split('\n');
  const inner = [];
  for (let k = 1; k < body.length && body[k].indexOf('=====') !== 0; k++) inner.push(body[k]);
  const rows = +inner[1].trim().split(/\s+/)[0] || 0;
  return [{
    name: inner[0].trim(), rows, cols: +inner[1].trim().split(/\s+/)[1],
    goal: [+inner[1].trim().split(/\s+/)[2] - 1, +inner[1].trim().split(/\s+/)[3] - 1],
    grid: inner.slice(2, 2 + rows).map(s => {
      const row = [];
      for (let c = 0; c < 4; c++) row.push(s[2 * c] || ' ');
      return row;
    })
  }];
}

/** 难度信息 + 一条解法（都用本引擎算，步数与源游戏可能不同：我们有连推） */
function analyze(lv) {
  const raw = SH.resolve(JSON.parse(JSON.stringify(lv)));
  const L = K.parse(raw), st = K.initialState(raw);
  const out = { meta: null, solution: null };
  const t0 = Date.now();
  let quick = K.quickSolve(L, st, raw.goals, { maxNodes: 200000, weight: 4 });
  if (!quick || !quick.ok) quick = K.quickSolve(L, st, raw.goals, { maxNodes: 1500000, weight: 6 });
  if (!quick || !quick.ok) quick = K.quickSolve(L, st, raw.goals, { maxNodes: 4000000, weight: 10 });
  if (quick && quick.ok) {
    out.solution = {
      solver: 'quick-A*', optimal: false,
      steps: quick.moves.length,
      hands: K.mergeMoves ? K.mergeMoves(quick.moves).length : null,
      moves: quick.moves
    };
  }
  let res = null;
  try { res = K.analyze(L, st, raw.goals, { maxNodes: 400000 }); } catch (e) { res = null; }
  if (res) {
    const d = K.difficulty(res);
    out.meta = {
      score: d ? d.score : null, grade: d ? d.grade : null,
      depth: res.depth > 0 ? res.depth : null, hands: res.hands > 0 ? res.hands : null,
      states: res.states, paths: res.paths,
      waste: res.interference ? res.interference.waste : null,
      same: res.interference ? res.interference.same : null,
      estimated: !!(res.truncated || (d && d.estimated)),
      ms: Date.now() - t0
    };
    if (out.solution && res.depth > 0 && res.depth < out.solution.steps) out.solution.steps = res.depth;
  }
  return out;
}

/** 按词汇表给每块起名、按 STYLE 上色 */
function dressPieces(lv, st) {
  const o = st || {};
  const used = {}, cnt = {};
  for (const p of lv.pieces) {
    const k = p.lock ? 'wall' : (SHAPE_KEY[p.shape] || p.shape);
    cnt[k] = (cnt[k] || 0) + 1;
    const n = cnt[k];
    if (p.hero) { p.name = o.hero || '曹操'; if (o.heroColor) p.color = o.heroColor; continue; }
    const key = p.lock ? 'wall' : p.shape;
    const pool = (o.names && o.names[key]) || POOL[k] || ['块'];
    const nm = pool[(n - 1) % pool.length];
    p.name = used[nm] ? nm + n : nm;          // 池子不够长时补编号
    used[nm] = true;
    const cols = o.colors && o.colors[key];
    if (cols) p.color = cols[(n - 1) % cols.length];
  }
  if (o.hero) {
    const h = lv.pieces.find(p => p.hero);
    if (h) { h.name = o.hero; if (o.heroColor) h.color = o.heroColor; }
  }
}


/** 把目录里不在名单内的 json 挪到 levels/_trash/<集>/（沙箱里 unlink 常被拦，rename 稳） */
function pruneDir(dir, keep) {
  const trash = path.join(ROOT, '_trash', path.basename(dir));
  let moved = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.json$/.test(f) || f[0] === '_') continue;
    if (keep.indexOf(f) >= 0) continue;
    try {
      fs.mkdirSync(trash, { recursive: true });
      fs.renameSync(path.join(dir, f), path.join(trash, f));
      moved++;
    } catch (e) { console.warn('  ！挪不动 ' + f + '（' + e.message + '）'); }
  }
  if (moved) console.log('  ' + moved + ' 个旧文件挪到 levels/_trash/' + path.basename(dir) + '/');
}

function main() {
  const srcDir = path.join(ROOT, SET);
  fs.mkdirSync(srcDir, { recursive: true });
  const keep = [];
  const book = parseFile(path.join(SRC, 'levels/华容之书.txt'));
  const manual = parseManual(path.join(SRC, '游戏说明.txt'));
  console.log('华容之书 ' + book.length + ' 关，游戏说明 ' + manual.length + ' 关');

  const entries = [];
  for (const s of manual.concat(book)) {
    if (REPLACE[s.name]) {
      const key = REPLACE[s.name];
      const lv = LV[key]();
      entries.push({
        name: lv.name, origin: s.name, note: NOTES[s.name] || s.name, replace: key, lvKey: key,
      level: Object.assign({}, lv, { meta: undefined })
      });
      continue;
    }
    const nm = NAMES[s.name];
    if (!nm) { console.log('！没有新名字，跳过：' + s.name); continue; }
    const lv = buildLevel(s, { name: nm });
    verify(s, lv);
    entries.push({ name: nm, origin: s.name, note: NOTES[s.name] || s.name.replace(/ \d+.*$/, ''), level: lv, style: STYLE[s.name] });
  }

  let idx = 0;
  const manifest = [];
  for (const e of entries) {
    idx++;
    const num = String(idx).padStart(2, '0');
    const file = num + '_' + e.name + '.json';
    const full = path.join(srcDir, file);
    const lv = JSON.parse(JSON.stringify(e.level));
    delete lv.origin;
    if (!e.replace) dressPieces(lv, e.style);     // 顶替关（我们自己的）已经有名字了
    const an0 = analyze(lv);
    const an = e.replace ? { meta: LV[e.replace]().meta || an0.meta, solution: an0.solution } : an0;
    const rec = {
      set: SET, id: SET + '-' + num, name: e.name, origin: e.origin, lvKey: e.lvKey || null,
      note: e.note || '',
      source: /游戏说明/.test(e.origin) ? '游戏说明.txt' : '华容之书.txt',
      tip: e.replace ? '源游戏里的这一局，用我们已有的「' + e.name + '」顶替（同构成）' : '',
      level: lv, meta: an.meta, solution: an.solution
    };
    keep.push(file);
    fs.writeFileSync(full, JSON.stringify(rec, null, 1) + '\n', 'utf8');
    manifest.push({ file, name: e.name, origin: e.origin, meta: an.meta, ok: !!an.solution });
    console.log(String(idx).padStart(2) + ' ' + e.name.padEnd(6) + ' ← ' + e.origin.padEnd(16) +
      (an.meta ? ' 分' + an.meta.score + ' 深' + an.meta.depth + ' 态' + an.meta.states +
        (an.meta.estimated ? '(估)' : '') : ' —') +
      (an.solution ? ' 解' + an.solution.steps + '步' : ' 无解'));
  }
  pruneDir(srcDir, keep);
  console.log('\n写出 ' + idx + ' 个文件到 levels/' + SET + '/');
}

main();
