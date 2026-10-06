// Refresh browser cache keys before publishing. No website build is needed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const index = path.join(root, 'index.html');
let html = fs.readFileSync(index, 'utf8');
for (const [attribute, file] of [
  ['href', 'style.css'],
  ['src', 'app.js'],
  ['src', 'assets/night-express.svg'],
]) {
  const version = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 12);
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const url = new RegExp(`${attribute}="${escaped}(?:\\?v=[^"]*)?"`, 'g');
  if (!url.test(html)) throw new Error(`Missing asset in index.html: ${file}`);
  html = html.replace(url, `${attribute}="${file}?v=${version}"`);
}
if (html !== fs.readFileSync(index, 'utf8')) {
  fs.writeFileSync(index, html);
  console.log('Updated asset versions in index.html.');
} else {
  console.log('Asset versions are current.');
}
