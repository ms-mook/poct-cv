// Build img/icons.svg (Lucide sprite) from icons.json → <svg class="icon"><use href="img/icons.svg#name"/></svg>
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'node_modules/lucide-static/icons');
const names = [...new Set(JSON.parse(fs.readFileSync(path.join(here, 'icons.json'), 'utf8')))];
const missing = [];
const symbols = names.map((n) => {
  const f = path.join(dir, n + '.svg');
  if (!fs.existsSync(f)) { missing.push(n); return ''; }
  const inner = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return `<symbol id="${n}" viewBox="0 0 24 24">${inner}</symbol>`;
}).filter(Boolean);
if (missing.length) { console.error('Missing icons:', missing.join(', ')); process.exit(1); }
const out = path.join(here, '../../img/icons.svg'); fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols.join('')}</svg>\n`);
console.log('icons:', symbols.length, '→', out);
