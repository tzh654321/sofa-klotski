import io
p = 'test/editor.test.js'
s = io.open(p, encoding='utf-8').read()
if "loadLevel(LV.classic())" in s:
    print('already')
    raise SystemExit

old = """  await ev('loadLevel(LV.sofaBend())'); await sleep(250);
  await ev('document.getElementById("tabs").querySelector('[data-mode="solve"]').click()'); await sleep(150);
  await ev('document.getElementById("btnDiff").click()');"""
new = """  // 沙发关在「严格物理」下无解（转体会擦邻块），难度分要能算就必须选可解局面
  await ev('loadLevel(LV.classic())'); await sleep(250);
  await ev('document.getElementById("tabs").querySelector('[data-mode="solve"]').click()'); await sleep(150);
  await ev('document.getElementById("btnDiff").click()');"""
assert old in s, 'loadLevel line'
s = s.replace(old, new, 1)

old2 = """  const mine = JSON.parse(await ev('(function(){var a=K.analyze(L,st,raw.goals,{maxNodes:300000});' +
    'return JSON.stringify({score:K.difficulty(a).score,states:a.states,depth:a.depth,paths:a.paths});})()'));"""
new2 = """  const mine = JSON.parse(await ev('(function(){var a=K.analyze(L,st,raw.goals,{maxNodes:300000});' +
    'var d=K.difficulty(a);return JSON.stringify({score:d?d.score:null,states:a.states,depth:a.depth,paths:a.paths});})()'));
  ok(mine.score != null, '可解局面给出难度分', mine);"""
assert old2 in s, 'mine line'
s = s.replace(old2, new2, 1)
io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
