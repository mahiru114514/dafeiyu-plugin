// Read-only inspection of the official installation. Writes reference copies only here.
const fs = require('node:fs');
const path = require('node:path');
const archive = process.env.HARNESS_ASAR || 'E:/deepseek_harness/resources/app.asar';
const fd = fs.openSync(archive, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, head.length, 0);
const json = Buffer.alloc(head.readUInt32LE(12));
fs.readSync(fd, json, 0, json.length, 16);
const root = JSON.parse(json.toString());
const base = 8 + head.readUInt32LE(4);
function entry(p) { return p.split('/').reduce((n, s) => n.files[s], root); }
function read(p, n = entry(p)) {
  if (n.unpacked) return fs.readFileSync(archive + '.unpacked/' + p);
  const buf = Buffer.alloc(Number(n.size));
  fs.readSync(fd, buf, 0, buf.length, base + Number(n.offset));
  return buf;
}
function walk(n, prefix, fn) {
  for (const [key, value] of Object.entries(n.files || {})) {
    const p = prefix + key;
    if (value.files) walk(value, p + '/', fn);
    else fn(p, value);
  }
}
try {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'read') {
    for (const p of args) console.log(read(p).toString());
  } else if (mode === 'list') {
    walk(root, '', p => { if (!args[0] || p.includes(args[0])) console.log(p); });
  } else if (mode === 'extract') {
    const dest = path.resolve(__dirname, '../.harness-reference/node_modules/@deepseek-ai');
    for (const pkg of args) {
      if (!/^[-a-z0-9]+$/.test(pkg)) throw Error('Invalid package name');
      const prefix = 'dsh/node_modules/@deepseek-ai/' + pkg + '/';
      walk(entry(prefix.slice(0, -1)), '', (p, n) => {
        if (n.link || /(?:^|\/)AGENTS\.md$/.test(p)) return;
        const target = path.resolve(dest, pkg, p);
        if (!target.startsWith(dest + path.sep)) throw Error('Unsafe reference path');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, read(prefix + p, n));
      });
      console.log('Copied reference:', pkg);
    }
  } else throw Error('Usage: inspect-harness.cjs read|list|extract [paths or packages]');
} finally { fs.closeSync(fd); }
