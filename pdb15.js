/* ────────────────────────────────────────────────────────────────
 * pdb15.js — 十五子模式数据库（Pattern Database）
 *
 * 干什么：把 15 个数字分成几组，每组单独造一张「抽象状态 → 最少动作数」的距离表。
 *   抽象状态只记「本组数字 + 空格」的位置，其余数字当成不可区分的填充块。
 *   搜索时 h = max(曼哈顿/3, PDB_A1, PDB_A2, PDB_B, PDB_C)。
 *
 * 为什么取 max 而不是相加：一次连锁推可能同时挪动不同组的数字，
 *   两张表会把同一步的代价各算一次，相加就不再是下界了。取 max 一定安全。
 *
 * 动作集：必须用**连锁推**（空格沿直线跳 1~3 格）来建表，否则表值对应的是
 *   另一种动作代价，会变成"不可采纳"的启发式。
 *
 * 编码：本组 K 个数字 + 空格 = K+1 个带标签对象，位置是 16 个格子里的有序选择，
 *   总数 P(16, K+1)。K=5 → 5,765,760 项（5.5MB，一字节存距离）。
 *   K=7（A={1,2,3,4,5,9,13}）→ P(16,8)=518,918,400 项 ≈ 500MB，页面里做不了，
 *   所以 A 拆成 A1={1,2,3,4} 与 A2={5,9,13} 两张小表。
 * ──────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const N = 16;

  // perms[n][k] = P(n, k) = n!/(n-k)!
  const perms = [];
  for (let n = 0; n <= 16; n++) {
    perms.push(new Float64Array(9));
    perms[n][0] = 1;
    for (let k = 1; k <= 8; k++) perms[n][k] = n - k + 1 >= 1 ? perms[n][k - 1] * (n - k + 1) : 0;
  }

  function goalBoard() {
    const g = new Array(N);
    for (let i = 0; i < N; i++) g[i] = (i + 1) % N;
    return g;
  }

  /** 有序选择的排名：pos 是 K+1 个互不相同的位置 */
  function rankOf(pos, k) {
    let rank = 0;
    for (let i = 0; i < k; i++) {
      const p = pos[i];
      let c = p;
      for (let j = 0; j < i; j++) if (pos[j] < p) c--;
      rank += c * perms[15 - i][k - 1 - i];
    }
    return rank;
  }

  /**
   * 建一张 PDB。
   * tiles: 本组数字（1..15）
   * opts.chain: 是否按连锁推动作（默认 true，和本项目规则一致）
   * 返回 { dist, tiles, size, isGoalRank }
   */
  function build(tiles, opts) {
    opts = opts || {};
    const chain = opts.chain !== false;
    const k = tiles.length + 1;              // 加空格
    const size = perms[16][k];
    if (size > 4e8) throw new Error('PDB 太大：P(16,' + k + ')=' + size);
    const dist = new Uint8Array(size).fill(255);
    const g = goalBoard();
    const targetPos = new Array(N).fill(-1);
    for (let p = 0; p < N; p++) targetPos[g[p]] = p;

    const goalTiles = tiles.map(t => targetPos[t]);
    const jump = chain ? 3 : 1;
    const q = new Int32Array(size);
    let qh = 0, qt = 0;

    const packArr = a => {
      let v = 0;
      for (let i = 0; i < k; i++) v |= a[i] << (i * 4);
      return v;
    };

    const pos = new Int32Array(k);
    // 多源：本组数字归位，空格在哪都算"已完成"
    for (let b = 0; b < N; b++) {
      pos[0] = b;
      let bad = false;
      for (let i = 0; i < goalTiles.length; i++) {
        pos[i + 1] = goalTiles[i];
        if (goalTiles[i] === b) bad = true;
      }
      if (bad) continue;
      const r = rankOf(pos, k);
      if (dist[r] !== 255) continue;
      dist[r] = 0;
      q[qt++] = packArr(pos);
    }

    const nxt = new Int32Array(k);
    const DIRS = [[-1, 0, -1], [1, 0, 1], [0, -1, -4], [0, 1, 4]];
    while (qh < qt) {
      const v = q[qh++];
      for (let i = 0; i < k; i++) pos[i] = (v >>> (i * 4)) & 15;
      const cur = dist[rankOf(pos, k)];
      const z = pos[0], zx = z & 3, zy = z >> 2;
      for (let d = 0; d < 4; d++) {
        const sx = DIRS[d][0], sy = DIRS[d][1], stp = DIRS[d][2];
        for (let n = 1; n <= jump; n++) {
          const nx = zx + sx * n, ny = zy + sy * n;
          if (nx < 0 || nx > 3 || ny < 0 || ny > 3) break;
          const to = ny * 4 + nx;
          nxt[0] = to;
          // 段内格子是 z+stp, z+2stp, ..., to —— 竖滑时必须同列，(p-z) % stp === 0
          const dz = to - z;
          for (let i = 1; i < k; i++) {
            const p = pos[i];
            const dd = p - z;
            const inSeg = stp > 0
              ? (dd > 0 && dd <= dz && dd % stp === 0)
              : (dd < 0 && dd >= dz && (-dd) % (-stp) === 0);
            nxt[i] = inSeg ? p - stp : p;
          }
          const r = rankOf(nxt, k);
          if (dist[r] === 255) {
            dist[r] = cur + 1;
            q[qt++] = packArr(nxt);
          }
        }
      }
    }

    let maxD = 0, reach = 0;
    for (let i = 0; i < size; i++) {
      if (dist[i] === 255) continue;
      reach++;
      if (dist[i] > maxD) maxD = dist[i];
    }
    return { dist, tiles: tiles.slice(), k, size, maxD, reach };
  }

  /** 查询：board 是 16 格数组（0=空格），targetPos[t] = 数字 t 的目标格 */
  function query(pdb, board, targetPos) {
    const k = pdb.k;
    const pos = new Int32Array(k);
    let blank = 0;
    for (let p = 0; p < N; p++) if (board[p] === 0) { blank = p; break; }
    pos[0] = blank;
    for (let i = 0; i < pdb.tiles.length; i++) {
      const t = pdb.tiles[i];
      let at = -1;
      for (let p = 0; p < N; p++) if (board[p] === t) { at = p; break; }
      pos[i + 1] = at;
    }
    const d = pdb.dist[rankOf(pos, k)];
    return d === 255 ? 0 : d;
  }

  global.Puzzle15PDB = { build, query, rankOf, perms, goalBoard };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Puzzle15PDB;
})(typeof window !== 'undefined' ? window : globalThis);
