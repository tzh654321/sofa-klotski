/* 本地写盘服务：让 index.html 的「增 / 改 / 删关卡」直接作用到 levels/ 目录
 *
 *   node tools/serve.js [--port 8765] [--root 数据目录] [--static 页面目录]
 *   浏览器打开 http://127.0.0.1:8765/index.html
 *
 * 只用 Node 内置模块，零依赖。设计要点：
 *  - 关卡是「一关一文件」：levels/<关卡集>/NN_<名字>.json（没有清单文件，列表就是目录里读出来的）
 *  - 写操作串行排队，先写 .tmp 再 rename（原子替换，不留半个文件）
 *  - 删除不 unlink，移进 levels/_trash/<关卡集>/，随时能找回
 *  - 每次写完自动重建 levelpacks.js，用 file:// 打开也能看到改动
 *  - 写入前用同一份内核校验：尺寸 / 唯一 id / 越界 / 重叠 / 目标引用
 *  - 只接受 levels/ 内的路径，拒绝 .. 和非法的 Windows 文件名字符
 *  - --root 与 --static 可分离：测试把数据放临时目录，不碰真实关卡
 *
 * 页面在 http 下探测到 /api/ping 才切到「写盘模式」；
 * 用 file:// 打开时行为与以前完全一致（改动存浏览器本地存储）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const K = require('../sofa-klotski.js');
const SH = require('../shapes.js');
const PK = require('./build-levelpacks.js');

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function parseArgv(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) o[a.slice(2, eq)] = a.slice(eq + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) o[a.slice(2)] = argv[++i];
    else o[a.slice(2)] = true;
  }
  return o;
}

function createServer(opts) {
  opts = opts || {};
  const root = path.resolve(opts.root || path.join(__dirname, '..'));
  const staticDir = path.resolve(opts.static || root);
  const levelsDir = path.join(root, 'levels');
  const packsOut = path.join(root, 'levelpacks.js');
  let version = 0;
  let chain = Promise.resolve();
  const queued = fn => {
    const p = chain.then(fn);
    chain = p.catch(() => { });
    return p;
  };

  /* ────────── 名字 / 路径 ────────── */
  function safeName(s) {
    let n = String(s == null ? '' : s).trim()
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .replace(/\.+$/, '').trim();
    if (!n) n = '新关卡';
    if (n.length > 60) n = n.slice(0, 60);
    return n;
  }
  /** 关卡集可以带子文件夹（华容之书/古谱）：逐段净化，禁止 .. 与下划线开头 */
  function safeSet(s) {
    const raw2 = String(s == null ? '' : s).trim() || '待分类';
    const segs = raw2.split(/[\\/]+/).filter(Boolean);
    if (!segs.length) return '待分类';
    for (const seg of segs) {
      if (seg.startsWith('_') || seg === '.' || seg === '..')
        throw new HttpError(400, '关卡集路径不合法：' + raw2);
    }
    return segs.map(seg => safeName(seg)).join('/');
  }
  function inside(p, dir) {
    const a = path.resolve(p), d = path.resolve(dir);
    return a === d || a.startsWith(d + path.sep);
  }
  function nextNum(set) {
    const dir = PK.setDir(root, set);
    fs.mkdirSync(dir, { recursive: true });
    const nums = fs.readdirSync(dir).filter(f => /^\d+_/.test(f) && f.endsWith('.json'))
      .map(f => parseInt(f, 10));
    return String((nums.length ? Math.max.apply(null, nums) : 0) + 1).padStart(2, '0');
  }
  function trashFile(set, file) {
    const src = path.join(PK.setDir(root, set), file);
    if (!fs.existsSync(src)) return null;
    if (!inside(src, levelsDir)) throw new HttpError(403, '路径越界');
    const dir = path.join(levelsDir, '_trash', set);
    fs.mkdirSync(dir, { recursive: true });
    let dst = path.join(dir, file);
    if (fs.existsSync(dst)) dst = path.join(dir, Date.now() + '_' + file);
    fs.renameSync(src, dst);
    return dst;
  }

  /* ────────── 写入前的关卡校验（跟试玩用的是同一份内核） ────────── */
  function validateLevel(lv) {
    if (!lv || typeof lv !== 'object' || !Array.isArray(lv.pieces))
      throw new HttpError(400, 'level 缺少 pieces');
    const w = Number(lv.w), h = Number(lv.h);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 2 || h < 2 || w > 1000 || h > 1000)
      throw new HttpError(400, '棋盘尺寸不合法（2~1000）');
    const ids = new Set();
    for (const p of lv.pieces) {
      if (!p || typeof p.id !== 'string' || !p.id) throw new HttpError(400, '有块缺少 id');
      if (ids.has(p.id)) throw new HttpError(400, '块 id 重复：' + p.id);
      ids.add(p.id);
    }
    let r, L, st;
    try {
      const copy = JSON.parse(JSON.stringify(lv));
      r = SH.resolve(copy);
      L = K.parse(r);
      st = K.initialState(r);
    } catch (e) {
      throw new HttpError(400, '关卡解析失败：' + (e && e.message || e));
    }
    const used = new Set();
    for (let i = 0; i < L.pieces.length; i++) {
      for (const cell of K.pieceCells(L, st, i)) {
        const c = cell[0], rr = cell[1];
        if (c < 0 || rr < 0 || c >= L.w || rr >= L.h)
          throw new HttpError(400, '有块越界于 (' + c + ',' + rr + ')');
        const k = c + ',' + rr;
        if (used.has(k)) throw new HttpError(400, '有块重叠于 (' + c + ',' + rr + ')');
        used.add(k);
      }
    }
    for (const g of (lv.goals || [])) {
      if (g && g.piece != null && !ids.has(g.piece))
        throw new HttpError(400, '目标引用了不存在的块：' + g.piece);
    }
    return lv;
  }

  /* ────────── 找到一条关卡记录 ────────── */
  function findEntry(key) {
    const packs = PK.readPacks(root);
    for (const p of packs) {
      for (const lv of p.levels) {
        if (lv.key !== key && lv.id !== key && lv.file !== key) continue;
        const abs = path.resolve(levelsDir, lv.file);
        if (!inside(abs, levelsDir)) throw new HttpError(403, '路径越界');
        let rec;
        try { rec = JSON.parse(fs.readFileSync(abs, 'utf8')); }
        catch (e) { throw new HttpError(500, '关卡文件读取失败：' + lv.file); }
        return { entry: lv, abs, rec, set: p.set, file: path.basename(abs) };
      }
    }
    throw new HttpError(404, '找不到关卡：' + key);
  }
  function finish(extra) {
    const built = PK.writePacks(root, packsOut);
    version++;
    return Object.assign({ ok: true, version, count: built.count }, extra || {});
  }
  /** 目录里的全部关卡名（**直接扫磁盘**，不查关卡包）。
   *  坏文件（缺 level 包装的裸 JSON）会被 readPacks 跳过，只看包的话它占着的名字查不出来
   *  → 改名/新建就会撞出两条同名关（2026-11-15 阴晴圆缺被改名就是这么来的）。 */
  function diskNames() {
    const out = [];
    if (!fs.existsSync(levelsDir)) return out;
    const scan = (dir, set) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name[0] === '_') continue;
        if (ent.isDirectory()) { scan(path.join(dir, ent.name), set + '/' + ent.name); continue; }
        const f = ent.name;
        if (!f.endsWith('.json')) continue;
        let rec = null;
        try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
        const nm = (rec && rec.name) || f.replace(/^\d+_/, '').replace(/\.json$/, '');
        out.push({ set, file: f, name: nm, id: (rec && rec.id) || '' });
      }
    };
    for (const name of fs.readdirSync(levelsDir)) {
      if (name[0] === '_') continue;
      const abs = path.join(levelsDir, name);
      if (fs.statSync(abs).isDirectory()) scan(abs, name);
      else if (name.endsWith('.json')) scan(levelsDir, PK.ROOT_SET);   // 根目录 = 「待分类」
    }
    return out;
  }
  /** 全库关卡名唯一：UI 的列表/另存都按名字找关，重名会认错 */
  function assertNameFree(name, except) {
    for (const x of diskNames()) {
      if (x.name !== name) continue;
      if (except && (x.id === except.key || (except.file && x.file === except.file && x.set === except.set)))
        continue;
      throw new HttpError(409, '关卡名已被占用：' + name + '（' + x.set + '/' + x.file + '）');
    }
  }

  /* ────────── 三种写操作 ────────── */
  function opCreate(body) {
    const set = safeSet(body.set);
    const name = safeName(body.name || (body.level && body.level.name));
    const level = validateLevel(body.level);
    level.name = name;
    assertNameFree(name, null);
    const dir = PK.setDir(root, set);
    const num = nextNum(set);
    const file = num + '_' + name + '.json';
    const dst = path.join(dir, file);
    if (fs.existsSync(dst)) throw new HttpError(409, '文件已存在：' + set + '/' + file);
    // id 不能用「集名 + 编号」：换集后编号会在原集里被复用，两条关就撞同一个 key，
    // 删除/改名会认错对象。编辑器建的关一律给一个不与文件名绑定的稳定 id。
    const uid = 'u' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
    const rec = {
      set, id: uid, name, origin: '', lvKey: null,
      note: body.note || '', tip: body.tip || '编辑器里新建的关',
      source: 'editor', level,
      meta: body.meta || null, solution: body.solution || null
    };
    PK.atomicWrite(dst, JSON.stringify(rec, null, 1) + '\n');
    return finish({ key: rec.lvKey || rec.id, file: PK.relFile(set, file) });
  }

  function opUpdate(key, patch) {
    const f = findEntry(key);
    const rec = f.rec;
    const oldSet = f.set, oldFile = f.file;
    const newSet = patch.set !== undefined ? safeSet(patch.set) : oldSet;
    // 只有显式 rename:true 才动文件名：单纯「保存内容」时带来的 name 一律忽略，
    // 免得保存局面顺手把这一关改名（页面两个保存入口都会带 name）
    const wantsRename = patch.rename === true && patch.name !== undefined;
    const newName = wantsRename ? safeName(patch.name) : safeName(rec.name);
    if (newName !== safeName(rec.name)) assertNameFree(newName, f.entry);
    if (patch.level !== undefined) {
      rec.level = validateLevel(patch.level);
      rec.level.name = newName;
    } else if (rec.level) rec.level.name = newName;
    if (patch.note !== undefined) rec.note = patch.note;
    if (patch.tip !== undefined) rec.tip = patch.tip;
    if (patch.origin !== undefined) rec.origin = patch.origin;
    if (patch.meta !== undefined) {
      rec.meta = patch.meta;
      // 手数口径变了要一起改，否则 test/levels 的「meta.hands == solution.hands」会挂
      if (patch.meta && patch.meta.hands != null && rec.solution) rec.solution.hands = patch.meta.hands;
    }
    if (patch.solution !== undefined) rec.solution = patch.solution;
    rec.name = newName;
    rec.set = newSet;

    const sameSet = newSet === oldSet;
    let num = (/^(\d+)_/.exec(oldFile) || [])[1] || '01';
    if (!sameSet) num = nextNum(newSet);
    const newFile = num + '_' + newName + '.json';
    const dir = PK.setDir(root, newSet);
    fs.mkdirSync(dir, { recursive: true });
    const dst = path.join(dir, newFile);
    const moved = path.resolve(dst) !== path.resolve(f.abs);
    if (moved && fs.existsSync(dst))
      throw new HttpError(409, '目标文件名已被占用：' + newSet + '/' + newFile);
    PK.atomicWrite(dst, JSON.stringify(rec, null, 1) + '\n');
    if (moved) trashFile(oldSet, oldFile);
    return finish({ key: rec.lvKey || rec.id, file: PK.relFile(newSet, newFile) });
  }

  function opDelete(key) {
    const f = findEntry(key);
    const to = trashFile(f.set, f.file);
    return finish({ trashed: to ? path.relative(root, to).replace(/\\/g, '/') : null });
  }

  function opRebuild() { return finish({ rebuilt: true }); }

  /* ────────── HTTP ────────── */
  function json(res, status, obj) {
    const s = JSON.stringify(obj);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(s),
      'Cache-Control': 'no-store'
    });
    res.end(s);
  }
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let s = '', size = 0, done = false;
      req.on('data', c => {
        size += c.length;
        if (size > 16 * 1024 * 1024) {
          done = true; reject(new HttpError(413, '请求体过大（>16MB）')); req.destroy(); return;
        }
        s += c;
      });
      req.on('end', () => {
        if (done) return;
        try { resolve(s ? JSON.parse(s) : {}); }
        catch (e) { reject(new HttpError(400, 'JSON 解析失败：' + e.message)); }
      });
      req.on('error', reject);
    });
  }
  function serveStatic(res, p) {
    const rel = (p === '/' ? '/index.html' : p).replace(/\\/g, '/');
    const abs = path.resolve(staticDir, '.' + rel);
    if (!inside(abs, staticDir)) return json(res, 403, { ok: false, error: '路径越界' });
    fs.stat(abs, (err, st) => {
      if (err || !st.isFile()) return json(res, 404, { ok: false, error: '找不到：' + rel });
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(abs).pipe(res);
    });
  }
  async function handleApi(req, res, p) {
    try {
      if (p === '/api/ping' && req.method === 'GET')
        return json(res, 200, { ok: true, mode: 'disk', version, levels: levelsDir, packs: packsOut });
      if (p === '/api/levels' && req.method === 'GET') {
        const packs = PK.readPacks(root);
        return json(res, 200, {
          ok: true, version, packs,
          count: packs.reduce((a, x) => a + x.levels.length, 0)
        });
      }
      if (p === '/api/levels' && req.method === 'POST') {
        const body = await readBody(req);
        return json(res, 200, await queued(() => opCreate(body)));
      }
      if (p === '/api/rebuild' && req.method === 'POST')
        return json(res, 200, await queued(() => opRebuild()));
      const m = /^\/api\/levels\/(.+)$/.exec(p);
      if (m) {
        const key = decodeURIComponent(m[1]);
        if (req.method === 'PUT') {
          const body = await readBody(req);
          return json(res, 200, await queued(() => opUpdate(key, body)));
        }
        if (req.method === 'DELETE')
          return json(res, 200, await queued(() => opDelete(key)));
        return json(res, 405, { ok: false, error: '不支持的方法：' + req.method });
      }
      return json(res, 404, { ok: false, error: '未知接口：' + p });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error('[api]', e);
      return json(res, status, { ok: false, error: e.message || String(e) });
    }
  }
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch (e) { return json(res, 400, { ok: false, error: 'URL 解码失败' }); }
    if (p.startsWith('/api/')) handleApi(req, res, p);
    else serveStatic(res, p);
  });
  server.disk = { root, staticDir, levelsDir, packsOut, get version() { return version; }, validateLevel };
  return server;
}

function main() {
  const a = parseArgv(process.argv.slice(2));
  const root = path.resolve(a.root || path.join(__dirname, '..'));
  const srv = createServer({ root, static: a.static || root });
  let port = Number(a.port || 8765), tries = 0;
  const listen = p => {
    srv.once('error', e => {
      if (e.code === 'EADDRINUSE' && tries++ < 10) {
        console.log('端口 ' + p + ' 被占用，换 ' + (p + 1));
        listen(p + 1);
      } else { console.error(e); process.exit(1); }
    });
    srv.listen(p, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
      console.log('写盘服务已启动 → ' + url);
      console.log('关卡目录：' + path.join(root, 'levels'));
      console.log('关掉这个窗口即停止服务。');
      if (a.open) {
        try {
          require('child_process').exec('start "" "' + url + '"', { windowsHide: true }, err => {
            if (err) console.log('没能自动打开浏览器，请手动访问 ' + url);
          });
        } catch (e) { console.log('没能自动打开浏览器，请手动访问 ' + url); }
      }
    });
  };
  listen(port);
}

if (require.main === module) main();
module.exports = { createServer, HttpError, parseArgv };

[EXIT=0]
