import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function findDupesWithContext(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const re = /<g class="so-quad-ring__icon"[^>]*>([\s\S]*?)<\/g>/g;
  const icons = [];
  let m;
  while ((m = re.exec(html))) {
    const start = Math.max(0, m.index - 500);
    const ctx = html.slice(start, m.index).replace(/\s+/g, ' ');
    const label =
      (ctx.match(/<strong>([^<]+)<\/strong>/) ||
        ctx.match(/>([^<]{4,60})<\/dt>/) ||
        ctx.match(/>([^<]{8,80})<\/li>/) || ['', '?'])[1];
    icons.push({
      i: icons.length + 1,
      inner: m[1].replace(/\s+/g, ' ').trim(),
      label: label.trim().slice(0, 70),
    });
  }
  const map = new Map();
  for (const ic of icons) {
    if (!map.has(ic.inner)) map.set(ic.inner, []);
    map.get(ic.inner).push(ic);
  }
  const dups = [...map.entries()].filter(([, arr]) => arr.length > 1);
  if (dups.length) {
    console.log(`\n=== ${path.relative(root, filePath)} ===`);
    for (const [, arr] of dups) {
      console.log(`  x${arr.length}: ${arr.map((a) => `#${a.i} "${a.label}"`).join(' | ')}`);
    }
  } else {
    console.log(`OK: ${path.relative(root, filePath)} — ${icons.length} icons, all unique`);
  }
}

findDupesWithContext(path.join(root, 'public', 'index.html'));
