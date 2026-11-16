const K = require('../sofa-klotski.js'), SH = require('../shapes.js');
const rec = JSON.parse(require('fs').readFileSync(__dirname + '/../levels/随机型关卡/01_织布机.json', 'utf8'));
const raw = SH.resolve(JSON.parse(JSON.stringify(rec.level)));
const L = K.parse(raw), base = K.initialState(raw);
function rngOf(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; }
const mem = () => Math.round(process.memoryUsage().heapUsed / 1048576) + 'MB';
const st = K.scramble(L, base, 3000, { rng: rngOf(7011) });
let cur = st, moves = [];
const pending = () => raw.goals.filter(g => !K.goalOne(L, cur, g));
console.log('start', mem(), 'pending', pending().length);
let batch = +(process.argv[2]||6);
for (let guard = 0; guard < 120; guard++) {
  const left = pending();
  if (!left.length) { console.log('DONE', moves.length); break; }
  left.sort((a, b) => K.goalDistance(L, cur, b) - K.goalDistance(L, cur, a));
  const picked = left.slice(0, Math.min(batch, left.length));
  const t = Date.now();
  const q = K.quickSolve(L, cur, picked, { maxNodes: 20000, weight: 8 });
  console.log('  batch', picked.length, 'ok', q.ok, 'visited', q.visited, 'moves', q.moves && q.moves.length, (Date.now() - t) + 'ms', mem(), 'left', left.length);
  if (!q.ok) { if (batch > 1) { batch = Math.floor(batch / 2); continue; } break; }
  for (const m of q.moves) { cur = K.apply(cur, m); moves.push(m); }
}
console.log('end', mem(), 'pending', pending().length, 'moves', moves.length);
