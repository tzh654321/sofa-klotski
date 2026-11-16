/* PowerShell 的 `>` 会写 UTF-16LE，这里转成 UTF-8，方便后续读取 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'logs');
for (const f of fs.readdirSync(dir)) {
  if (!/\.jsonl?$/.test(f) || /-u8\.json$/.test(f)) continue;
  const p = path.join(dir, f);
  const buf = fs.readFileSync(p);
  if (buf.length > 1 && buf[0] === 0xFF && buf[1] === 0xFE) {
    const s = buf.toString('utf16le').replace(/^\uFEFF/, '');
    const out = p.replace(/\.jsonl?$/, m => '-u8' + m);
    fs.writeFileSync(out, s, 'utf8');
    console.log('转换 ' + f + ' → ' + path.basename(out) + ' (' + s.length + ' 字符)');
  } else {
    console.log(f + ' 已经是 UTF-8 / ASCII');
  }
}
