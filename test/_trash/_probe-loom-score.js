const K = require('../sofa-klotski.js'), SH = require('../shapes.js');
const rec = JSON.parse(require('fs').readFileSync(__dirname + '/../levels/随机型关卡/01_织布机.json', 'utf8'));
const raw = SH.resolve(JSON.parse(JSON.stringify(rec.level)));
const L = K.parse(raw), base = K.initialState(raw);
function rngOf(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; }
const mem = () => Math.round(process.memoryUsage().heapUsed / 1048576) + 'MB';
const st = K.scramble(L, base, 3000, { rng: rngOf(7011) });
console.log('scrambled', mem(), 'moves', K.moves(L, st).length);
let t = Date.now();
const q = K.quickSolve(L, st, raw.goals, { maxNodes: 120000, weight: 10 });
console.log('quickSolve', q.ok, q.visited, q.moves && q.moves.length, (Date.now() - t) + 'ms', mem());
t = Date.now();
const est = K.estimatePath(L, st, raw.goals, q.moves);
console.log('estimatePath', est && est.steps, est && est.hands, (Date.now() - t) + 'ms', mem());
const d = K.difficulty({ depth: -1, estimate: est, truncated: true, stopped: false, states: q.visited });
console.log('difficulty', JSON.stringify(d));
