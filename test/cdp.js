/* 极简 CDP 驱动：node 内置 WebSocket/fetch，不依赖 puppeteer */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(pageFile, port) {
  const isUrl = /^https?:/.test(pageFile);
  const targetUrl = isUrl ? pageFile : 'file:///' + pageFile.replace(/\\/g, '/');
  const userDir = path.join(os.tmpdir(), 'sofa-cdp-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
  // 端口交给系统挑（--remote-debugging-port=0），从 DevToolsActivePort 读回来：
  // 并行跑多个测试时固定端口段会撞车，撞了就是"无法连上 Chrome"。
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--remote-debugging-port=' + (port || 0),
    '--user-data-dir=' + userDir,
    '--window-size=1500,900', targetUrl
  ], { stdio: 'ignore' });

  let target = null, realPort = port || 0;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    if (!realPort) {
      try {
        const f = path.join(userDir, 'DevToolsActivePort');
        if (fs.existsSync(f)) realPort = +fs.readFileSync(f, 'utf8').split(/\r?\n/)[0] || 0;
      } catch (e) { }
    }
    if (!realPort) continue;
    try {
      const list = await (await fetch('http://127.0.0.1:' + realPort + '/json/list')).json();
      target = list.find(t => t.type === 'page' && (isUrl
        ? t.url.indexOf(targetUrl.split('?')[0]) === 0
        : t.url.includes(path.basename(pageFile))));
    } catch (e) { }
  }
  if (!target) {
    chrome.kill();
    // 机器忙/瞬时失败时重试一次
    if (!port) return launch(pageFile);
    throw new Error('无法连上 Chrome');
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  };
  await new Promise(r => ws.onopen = r);
  const send = (method, params) => new Promise(res => {
    const i = ++id; pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error(((d.exception && d.exception.description) || d.text) + ' :: ' + expr);
    }
    return r.result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  // 等页面真正初始化完（机器忙的时候 700ms 不够，会读到 undefined 的全局）
  for (let i = 0; i < 200; i++) {
    try { if (await evalJs('window.__ready === true')) break; } catch (e) { }
    await sleep(100);
  }

  const rect = JSON.parse(await evalJs('JSON.stringify(document.getElementById("board").getBoundingClientRect())'));
  const cellPx = rect.width / 4;
  const P = (x, y) => ({ x: rect.left + x * cellPx, y: rect.top + y * cellPx });

  const mouse = (type, x, y, mod) => send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1,
    buttons: type === 'mouseReleased' ? 0 : 1, modifiers: mod || 0
  });
  const drag = async (a, b, steps, mod) => {
    steps = steps || 14;
    await mouse('mousePressed', a.x, a.y, mod);
    for (let i = 1; i <= steps; i++) {
      await mouse('mouseMoved', a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps, mod);
      await sleep(14);
    }
    await mouse('mouseReleased', b.x, b.y, mod);
    await sleep(90);
  };
  const click = async (x, y) => { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(140); };
  const wheel = async (at, dy, mod) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: dy, button: 'none', modifiers: mod || 0 });
    await sleep(120);
  };
  const shot = async file => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  };
  /** 轮询等待页面里的条件成立（比定长 sleep 快、也更稳）
   *   expr 是一段页面内 JS 表达式，返回真即通过；超时返回 false */
  const waitFor = async (expr, timeoutMs, stepMs) => {
    const t0 = Date.now();
    timeoutMs = timeoutMs || 60000;
    stepMs = stepMs || 150;
    for (;;) {
      let v = false;
      try { v = await evalJs(expr); } catch (e) { v = false; }
      if (v) return true;
      if (Date.now() - t0 > timeoutMs) return false;
      await sleep(stepMs);
    }
  };
  return {
    send, evalJs, mouse, drag, click, wheel, shot, waitFor, P, rect, errors,
    close: () => { try { ws.close(); } catch (e) { } chrome.kill(); }
  };
}

module.exports = { launch, sleep };
