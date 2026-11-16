/* 关卡写盘通道（浏览器侧）
 *
 * 页面用 http://127.0.0.1:PORT/index.html 打开时，探测本地 tools/serve.js：
 * 探测成功 → 增改删、改名、难度分都直接写 levels/ 目录。
 * 用 file:// 打开（或没启动服务）→ probe() 立刻返回 false，页面行为与旧版完全一致。
 *
 * 只有这一层知道 HTTP，index.html 里只调用 DiskStore 的方法。
 */
(function (global) {
  var API = '/api/levels';
  var enabled = false;
  var version = 0;

  function probe() {
    // file:// 下不发请求，避免控制台刷 CORS 报错，也让旧测试零延迟
    if (global.location && global.location.protocol !== 'http:' && global.location.protocol !== 'https:')
      return Promise.resolve(false);
    return fetch('/api/ping', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        enabled = !!(j && j.ok && j.mode === 'disk');
        version = (j && j.version) || 0;
        return enabled;
      })
      .catch(function () { enabled = false; return false; });
  }

  function req(method, url, body) {
    var o = { method: method, cache: 'no-store', headers: {} };
    if (body !== undefined) {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(body);
    }
    return fetch(url, o).then(function (r) {
      return r.json().catch(function () { throw new Error('服务返回的不是 JSON'); })
        .then(function (j) {
          if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
          if (j.version != null) version = j.version;
          return j;
        });
    });
  }

  global.DiskStore = {
    probe: probe,
    list: function () { return req('GET', API); },
    create: function (entry) { return req('POST', API, entry); },
    update: function (key, patch) { return req('PUT', API + '/' + encodeURIComponent(key), patch); },
    remove: function (key) { return req('DELETE', API + '/' + encodeURIComponent(key)); },
    rebuild: function () { return req('POST', '/api/rebuild', {}); },
    get enabled() { return enabled; },
    get version() { return version; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
