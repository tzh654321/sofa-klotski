/* 十五子后台线程：构模式数据库 + 跑搜索，避免主线程卡死 */
'use strict';
importScripts('pdb15.js', 'puzzle15.js');

let pdbs = null;
let goal = null;

self.onmessage = function (e) {
  const d = e.data || {};
  if (d.cmd === 'pdb') {
    const p = Puzzle15PDB.build(d.tiles, { chain: true });
    self.postMessage({ cmd: 'pdb', dist: p.dist, tiles: p.tiles, k: p.k, size: p.size, maxD: p.maxD },
      [p.dist.buffer]);
    return;
  }
  if (d.cmd === 'setPdbs') { pdbs = d.pdbs; return; }
  if (d.cmd === 'solve') {
    const opts = {
      weight: d.weight || 1,
      timeLimitMs: d.timeLimitMs || 60000,
      pdbs: d.pdbs || pdbs,
      onIter: d.progress ? function (bound, expanded) {
        self.postMessage({ cmd: 'iter', bound: bound, expanded: expanded });
      } : null
    };
    const r = Puzzle15.solve15(d.start, d.goal, opts);
    self.postMessage({ cmd: 'done', mode: d.mode, r: r });
  }
};
