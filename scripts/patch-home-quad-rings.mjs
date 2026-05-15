import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.join(path.resolve(import.meta.dirname, '..'), 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const ARCS = `<circle class="so-quad-ring__outer" cx="24" cy="24" r="22.25" fill="var(--so-quad-fill,#fff)" stroke="var(--so-quad-outer-stroke,rgba(30,58,95,0.14))" stroke-width="0.9"/>
    <g class="so-quad-ring__arcs" fill="none" stroke-width="5.25" stroke-linecap="round">
      <path class="so-quad-ring__arc so-quad-ring__arc--ne" stroke="var(--so-quad-ne)" d="M34.158 10.998A16.5 16.5 0 0 1 37.002 13.842"/>
      <path class="so-quad-ring__arc so-quad-ring__arc--se" stroke="var(--so-quad-se)" d="M37.002 34.158A16.5 16.5 0 0 1 34.158 37.002"/>
      <path class="so-quad-ring__arc so-quad-ring__arc--sw" stroke="var(--so-quad-sw)" d="M13.842 37.002A16.5 16.5 0 0 1 10.998 34.158"/>
      <path class="so-quad-ring__arc so-quad-ring__arc--nw" stroke="var(--so-quad-nw)" d="M10.998 13.842A16.5 16.5 0 0 1 13.842 10.998"/>
    </g>`;

const QUADS = [
  { cls: 'ne', pos: '32.49 15.51' },
  { cls: 'se', pos: '32.49 32.49' },
  { cls: 'sw', pos: '15.51 32.49' },
  { cls: 'nw', pos: '15.51 15.51' },
];

const FOOTER_MARK =
  '<circle cx="0" cy="0" r="1.1" fill="currentColor" stroke="none"/><path d="M-2.5 0h5M0-2.5v5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>';

function extractSvgInner(svgBlock) {
  const m = svgBlock.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  return m ? m[1].trim() : '';
}

function quadrantIcons(iconInner) {
  const body = iconInner || FOOTER_MARK;
  return QUADS.map(
    (q) =>
      `<g class="so-quad-ring__qi so-quad-ring__qi--${q.cls}" transform="translate(${q.pos}) scale(0.38) translate(-12 -12)">${body}</g>`,
  ).join('');
}

function ringSvg(iconInner, { svgExtraClass = '', noIcons = false } = {}) {
  const icons = noIcons ? '' : `<g class="so-quad-ring__icons">${quadrantIcons(iconInner)}</g>`;
  return `<svg class="so-quad-ring__svg${svgExtraClass}" viewBox="0 0 48 48" focusable="false" aria-hidden="true">${ARCS}${icons}</svg>`;
}

function mapClasses(modularClasses) {
  return modularClasses
    .replace(/\bso-modular-ring\b/g, 'so-quad-ring')
    .replace(/so-modular-ring--/g, 'so-quad-ring--');
}

// Jack avatar (arcs only; photo in center)
html = html.replace(
  /<div class="so-modular-ring so-modular-ring--avatar so-modular-ring--on-dark" aria-hidden="true">\s*<span class="so-modular-ring__inner so-modular-ring__inner--photo">\s*([\s\S]*?)\s*<\/span>\s*<\/div>/,
  (_, photoInner) =>
    `<div class="so-quad-ring so-quad-ring--avatar so-quad-ring--on-dark" aria-hidden="true">${ringSvg('', { noIcons: true })}\n          <span class="so-quad-ring__center so-quad-ring__center--photo">\n            ${photoInner.trim()}\n          </span></div>`,
);

// Standard rings (span or div)
html = html.replace(
  /<(span|div)\s+class="so-modular-ring([^"]*)"([^>]*)>\s*<span class="so-modular-ring__inner"[^>]*>\s*(<svg[\s\S]*?<\/svg>)?\s*<\/span>\s*<\/\1>/gi,
  (full, tag, classes, attrs, svgBlock) => {
    const iconInner = svgBlock ? extractSvgInner(svgBlock) : '';
    const isMarkets = full.includes('so-b2b__markets-ico');
    const quadClasses = mapClasses(classes);
    const svgExtra = isMarkets ? ' so-b2b__markets-ico' : '';
    return `<${tag} class="so-quad-ring${quadClasses}"${attrs}>${ringSvg(iconInner, { svgExtraClass: svgExtra })}</${tag}>`;
  },
);

const count = (html.match(/<(span|div)\s+class="so-quad-ring\s/g) || []).length;
if (html.includes('so-modular-ring')) {
  const left = (html.match(/so-modular-ring/g) || []).length;
  console.warn('Warning: so-modular-ring still present:', left, 'occurrences');
}
fs.writeFileSync(indexPath, html);
console.log('Patched', indexPath, 'quad ring instances:', count);
