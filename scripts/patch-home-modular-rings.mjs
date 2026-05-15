import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.join(path.resolve(import.meta.dirname, '..'), 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const TAG = String.fromCharCode(100, 105, 118);
const open = `<${TAG} `;
const close = `</${TAG}>`;

function extractSvgBody(block) {
  const inner = block.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '';
  return inner.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

html = html.replace(/<\/?motion\b[^>]*>/gi, (t) =>
  t.startsWith('</') ? close : t.replace(/motion/i, TAG),
);

html = html.replace(
  /<div class="home-lp__card-icon-wrap"([^>]*)>\s*<svg[\s\S]*?<\/svg>\s*<\/div>/g,
  (block, attrs) => {
    if (block.includes('so-modular-ring')) return block;
    const b = extractSvgBody(block);
    return `${open}class="so-modular-ring so-modular-ring--lg home-lp__card-icon-wrap"${attrs}><span class="so-modular-ring__inner"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${b}</svg></span>${close}`;
  },
);

html = html.replace(
  /<span class="so-b2b__icon-pill" aria-hidden="true"><svg[^>]*>([\s\S]*?)<\/svg><\/span>/g,
  (_, b) =>
    `<span class="so-modular-ring so-modular-ring--md so-b2b__icon-pill" aria-hidden="true"><span class="so-modular-ring__inner"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${b}</svg></span></span>`,
);

html = html.replace(
  /(<span class="so-modular-ring so-modular-ring--md so-b2b__icon-pill" aria-hidden="true"><span class="so-modular-ring__inner"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">)<circle cx="12" cy="12" r="10"\/>/g,
  '$1',
);
html = html.replace(
  /(<span class="so-modular-ring so-modular-ring--md so-b2b__icon-pill" aria-hidden="true"><span class="so-modular-ring__inner"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">)<circle cx="11" cy="11" r="8"\/>/g,
  '$1',
);

if (!html.includes('so-modular-ring--avatar')) {
  html = html.replace(
    /<div class="so-b2b__jack-avatar-col">\s*<div class="so-b2b__jack-avatar"/,
    `<div class="so-b2b__jack-avatar-col">${open}class="so-modular-ring so-modular-ring--avatar so-modular-ring--on-dark" aria-hidden="true"><span class="so-modular-ring__inner so-modular-ring__inner--photo">${open}class="so-b2b__jack-avatar" data-so-jack-avatar>`,
  );
  html = html.replace(
    /<span class="so-b2b__jack-avatar-fallback" aria-hidden="true">J<\/span>\s*<\/div>\s*<\/div>\s*<div class="so-b2b__jack-main">/,
    `<span class="so-b2b__jack-avatar-fallback" aria-hidden="true">J</span></div></span></div></div><div class="so-b2b__jack-main">`,
  );
}

html = html.replace(/<\/?motion\b[^>]*>/gi, (t) =>
  t.startsWith('</') ? close : t.replace(/motion/i, TAG),
);

html = html.replace(
  /<span class="so-b2b__jack-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"\/><\/svg><\/span>/g,
  `<span class="so-modular-ring so-modular-ring--xs so-modular-ring--on-dark so-b2b__jack-check" aria-hidden="true"><span class="so-modular-ring__inner"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6L9 17l-5-5"/></svg></span></span>`,
);

html = html.replace(
  /<svg class="so-b2b-footer__mark so-brand-ring-svg"[\s\S]*?<\/svg>/,
  `<span class="so-modular-ring so-modular-ring--2xs so-b2b-footer__mark" aria-hidden="true"><span class="so-modular-ring__inner" aria-hidden="true"></span></span>`,
);

fs.writeFileSync(indexPath, html);
const n = (html.match(/class="so-modular-ring/g) || []).length;
console.log('Patched', indexPath, 'rings:', n);
