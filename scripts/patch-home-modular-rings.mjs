import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.join(path.resolve(import.meta.dirname, '..'), 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

function stripSvgAttrs(openTag) {
  return openTag.replace(/\s*fill="none"\s*stroke="currentColor"\s*stroke-width="1.5"\s*stroke-linecap="round"\s*stroke-linejoin="round"/g, '');
}

function extractSvgBody(block) {
  const inner = block.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '';
  return inner.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

html = html.replace(
  /<motion class="so-b2b__picon" aria-hidden="true">[\s\S]*?<\/motion>/g,
  () => '',
);
html = html.replace(
  /<div class="so-b2b__picon" aria-hidden="true">\s*<svg[\s\S]*?<\/svg>\s*<\/div>/g,
  (block) => {
    if (block.includes('so-modular-ring')) return block;
    const body = extractSvgBody(block);
    return `<motion class="so-modular-ring so-modular-ring--sm so-b2b__picon" aria-hidden="true">
            <span class="so-modular-ring__inner">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${body}</svg>
            </span>
          </motion>`;
  },
);

html = html.replace(
  /<div class="home-lp__card-icon-wrap"([^>]*)>\s*<svg[\s\S]*?<\/svg>\s*<\/div>/g,
  (block, attrs) => {
    if (block.includes('so-modular-ring')) return block;
    const body = extractSvgBody(block);
    return `<div class="so-modular-ring so-modular-ring--lg home-lp__card-icon-wrap"${attrs}>
              <span class="so-modular-ring__inner">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${body}</svg>
              </span>
            </motion>`;
  },
);

html = html.replace(
  /<span class="so-b2b__icon-pill" aria-hidden="true"><svg[^>]*>([\s\S]*?)<\/svg><\/span>/g,
  (_, body) =>
    `<span class="so-modular-ring so-modular-ring--md so-b2b__icon-pill" aria-hidden="true"><span class="so-modular-ring__inner"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${body}</svg></span></span>`,
);

html = html.replace(
  /(<span class="so-modular-ring so-modular-ring--md so-b2b__icon-pill" aria-hidden="true"><span class="so-modular-ring__inner"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">)<circle cx="12" cy="12" r="10"\/>/,
  '$1',
);
html = html.replace(
  /(<span class="so-modular-ring so-modular-ring--md so-b2b__icon-pill" aria-hidden="true"><span class="so-modular-ring__inner"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">)<circle cx="11" cy="11" r="8"\/>/,
  '$1',
);

const jackBefore = html.includes('so-modular-ring--avatar');
if (!jackBefore) {
  html = html.replace(
    /<div class="so-b2b__jack-avatar-col">\s*<div class="so-b2b__jack-avatar"/,
    `<div class="so-b2b__jack-avatar-col">
        <div class="so-modular-ring so-modular-ring--avatar so-modular-ring--on-dark" aria-hidden="true">
          <span class="so-modular-ring__inner so-modular-ring__inner--photo">
        <div class="so-b2b__jack-avatar"`,
  );
  html = html.replace(
    /<span class="so-b2b__jack-avatar-fallback" aria-hidden="true">J<\/span>\s*<\/div>\s*<\/motion>\s*<div class="so-b2b__jack-main">/,
    `<span class="so-b2b__jack-avatar-fallback" aria-hidden="true">J</span>
        </div>
          </span>
        </div>
      </div>
      <div class="so-b2b__jack-main">`,
  );
  html = html.replace(
    /<span class="so-b2b__jack-avatar-fallback" aria-hidden="true">J<\/span>\s*<\/div>\s*<\/div>\s*<div class="so-b2b__jack-main">/,
    `<span class="so-b2b__jack-avatar-fallback" aria-hidden="true">J</span>
        </motion>
          </span>
        </motion>
      </motion>
      <div class="so-b2b__jack-main">`,
  );
}

html = html.replace(
  /<span class="so-b2b__jack-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"\/><\/svg><\/span>/g,
  `<span class="so-modular-ring so-modular-ring--xs so-modular-ring--on-dark so-b2b__jack-check" aria-hidden="true"><span class="so-modular-ring__inner"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6L9 17l-5-5"/></svg></span></span>`,
);

html = html.replace(
  /<svg class="so-b2b-footer__mark so-brand-ring-svg"[\s\S]*?<\/svg>/,
  `<span class="so-modular-ring so-modular-ring--2xs so-b2b-footer__mark" aria-hidden="true"><span class="so-modular-ring__inner" aria-hidden="true"></span></span>`,
);

html = html.replace(/<\/motion>/g, '</div>');

fs.writeFileSync(indexPath, html);
console.log('Patched modular rings in', indexPath);
