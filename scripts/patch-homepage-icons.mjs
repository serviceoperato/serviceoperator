import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const indexPath = path.join(root, 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

html = html.replace(
  /<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/@tabler\/icons-webfont[^>]*>\s*\n?/,
  ''
);

const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>');
if (styleStart === -1 || styleEnd === -1) throw new Error('style block not found');

const head = html.slice(0, styleStart + '<style>'.length);
const css = html.slice(styleStart + '<style>'.length, styleEnd);
const tail = html.slice(styleEnd);

const lines = css.split('\n');
const patched = lines.map((line) => {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('.') && !trimmed.startsWith('[')) return line;
  if (line.includes('.page-home')) return line;
  const m = line.match(/^(\s+)((?:\[data-theme="dark"\]\s+)?)(\.so-b2b)/);
  if (!m) return line;
  return line.replace(/^(\s+)((?:\[data-theme="dark"\]\s+)?)(\.so-b2b)/, '$1$2.page-home $3');
});

let newCss = patched.join('\n');

newCss = newCss.replace(
  '  /* Homepage B2B landing — scoped to .so-b2b */',
  '  /* Homepage B2B landing — scoped to .page-home .so-b2b */'
);

const blocks = [
  [
    `  .page-home .so-b2b__btn--ghost .so-b2b__btn-play {
    color: #312e81;
  }
  .page-home .so-b2b__btn--ghost:hover .so-b2b__btn-play {
    color: var(--so-indigo);
  }`,
    `  .page-home .so-b2b__btn--ghost .so-b2b__btn-play {
    color: var(--amber-deep);
  }
  [data-theme="dark"] .page-home .so-b2b__btn--ghost .so-b2b__btn-play {
    color: var(--amber-2);
  }
  .page-home .so-b2b__btn--ghost:hover .so-b2b__btn-play {
    color: var(--amber);
  }`,
  ],
  [
    `  .page-home .so-b2b__btn-play-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    color: #312e81;
    pointer-events: none;
  }
  [data-theme="dark"] .page-home .so-b2b__btn-play-ring {
    color: #a5b4fc;
  }`,
    `  .page-home .so-b2b__btn-play-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    color: var(--amber-deep);
    pointer-events: none;
  }
  [data-theme="dark"] .page-home .so-b2b__btn-play-ring {
    color: var(--amber-2);
  }`,
  ],
  [
    `  .page-home .so-b2b__markets-ico {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    color: #64748b;
    opacity: 0.95;
  }
  .page-home .so-b2b__markets-ico-slot {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-right: 0.1rem;
  }
  .page-home .so-b2b .home-lp__card-icon-wrap .so-icon-override-img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    display: block;
  }
  [data-theme="dark"] .page-home .so-b2b__markets-ico {
    color: #94a3b8;
    opacity: 0.95;
  }`,
    `  .page-home .so-b2b__markets-ico {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    color: currentColor;
    opacity: 0.95;
  }
  .page-home .so-b2b__markets-ico-slot {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-right: 0.1rem;
    color: var(--amber-deep);
  }
  [data-theme="dark"] .page-home .so-b2b__markets-ico-slot {
    color: var(--amber-2);
  }
  .page-home .so-b2b .home-lp__card-icon-wrap .so-icon-override-img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    display: block;
  }
  [data-theme="dark"] .page-home .so-b2b__markets-ico {
    color: currentColor;
    opacity: 0.95;
  }`,
  ],
  [
    `  .page-home .so-b2b .home-lp__card-icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-bottom: 14px;
    background: #eef2ff;
    border: 1px solid rgba(49, 46, 129, 0.18);
  }
  .page-home .so-b2b .home-lp__card-icon-wrap svg {
    width: 22px;
    height: 22px;
    stroke: #312e81;
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }`,
    `  .page-home .so-b2b .home-lp__card-icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-bottom: 14px;
    color: var(--amber-deep);
    background: color-mix(in srgb, var(--amber) 10%, #ffffff);
    border: 1px solid color-mix(in srgb, var(--amber-deep) 18%, transparent);
  }
  [data-theme="dark"] .page-home .so-b2b .home-lp__card-icon-wrap {
    color: var(--amber-2);
    background: color-mix(in srgb, var(--amber) 14%, var(--so-surface));
    border-color: color-mix(in srgb, var(--amber-2) 28%, transparent);
  }
  .page-home .so-b2b .home-lp__card-icon-wrap svg {
    width: 22px;
    height: 22px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }`,
  ],
  [
    `  .page-home .so-b2b__picon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #312e81;
    border: 1px solid rgba(255, 255, 255, 0.12);
    flex-shrink: 0;
  }
  .page-home .so-b2b__picon svg {
    width: 1.2rem;
    height: 1.2rem;
    stroke: #ffffff;
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  [data-theme="dark"] .page-home .so-b2b__picon {
    background: #3730a3;
  }`,
    `  .page-home .so-b2b__picon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--amber-deep);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.12);
    flex-shrink: 0;
  }
  .page-home .so-b2b__picon svg {
    width: 1.2rem;
    height: 1.2rem;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  [data-theme="dark"] .page-home .so-b2b__picon {
    background: var(--amber);
  }`,
  ],
  [
    `  .page-home .so-b2b__feat-ico {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #312e81;
    color: #ffffff;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 1px 2px rgba(30, 27, 75, 0.15);
  }
  [data-theme="dark"] .page-home .so-b2b__feat-ico {
    background: #3730a3;
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.14);
  }`,
    `  .page-home .so-b2b__feat-ico {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--amber-deep);
    color: #ffffff;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--amber-deep) 25%, transparent);
  }
  [data-theme="dark"] .page-home .so-b2b__feat-ico {
    background: var(--amber);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.14);
  }`,
  ],
  [
    `  .page-home .so-b2b__step-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    color: #312e81;
    pointer-events: none;
  }
  [data-theme="dark"] .page-home .so-b2b__step-ring {
    color: #a5b4fc;
  }
  .page-home .so-b2b__step-num {
    position: relative;
    z-index: 1;
    width: 1.625rem;
    height: 1.625rem;
    border-radius: 50%;
    background: #312e81;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  [data-theme="dark"] .page-home .so-b2b__step-num {
    background: #4338ca;
    color: #fff;
  }`,
    `  .page-home .so-b2b__step-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    color: var(--amber-deep);
    pointer-events: none;
  }
  [data-theme="dark"] .page-home .so-b2b__step-ring {
    color: var(--amber-2);
  }
  .page-home .so-b2b__step-num {
    position: relative;
    z-index: 1;
    width: 1.625rem;
    height: 1.625rem;
    border-radius: 50%;
    background: var(--amber-deep);
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  [data-theme="dark"] .page-home .so-b2b__step-num {
    background: var(--amber);
    color: #fff;
  }`,
  ],
  [
    `  .page-home .so-b2b__jack-check {
    position: relative;
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 0;
  }
  .page-home .so-b2b__jack-check::before {
    content: "";
    position: absolute;
    inset: -2px;
    background: url("/assets/icons/segmented-ring-on-dark.svg") center / 100% 100% no-repeat;
    opacity: 0.95;
    pointer-events: none;
  }
  .page-home .so-b2b__jack-check svg {
    position: relative;
    z-index: 1;
    width: 0.65rem;
    height: 0.65rem;
    stroke: #fff;
    stroke-width: 2.5;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }`,
    `  .page-home .so-b2b__jack-check {
    position: relative;
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 0;
    color: #fff;
  }
  .page-home .so-b2b__jack-check::before {
    content: "";
    position: absolute;
    inset: -2px;
    background: url("/assets/icons/segmented-ring-on-dark.svg") center / 100% 100% no-repeat;
    opacity: 0.95;
    pointer-events: none;
  }
  .page-home .so-b2b__jack-check svg {
    position: relative;
    z-index: 1;
    width: 0.65rem;
    height: 0.65rem;
    stroke: currentColor;
    stroke-width: 2.5;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }`,
  ],
  [
    `  .page-home .so-b2b-footer__mark {
    width: 0.9rem;
    height: 0.9rem;
    flex-shrink: 0;
    color: #4338ca;
    opacity: 0.88;
    margin-right: 0.35rem;
  }
  [data-theme="dark"] .page-home .so-b2b-footer__mark {
    color: #a5b4fc;
  }`,
    `  .page-home .so-b2b-footer__mark {
    width: 0.9rem;
    height: 0.9rem;
    flex-shrink: 0;
    color: var(--amber);
    opacity: 0.88;
    margin-right: 0.35rem;
  }
  [data-theme="dark"] .page-home .so-b2b-footer__mark {
    color: var(--amber-2);
  }`,
  ],
  [
    `  .page-home .so-b2b-footer a {
    color: #1e1b4b;
    text-decoration: none;
    font-weight: 600;
  }
  [data-theme="dark"] .page-home .so-b2b-footer a {
    color: #a5b4fc;
  }`,
    `  .page-home .so-b2b-footer a {
    color: var(--amber-deep);
    text-decoration: none;
    font-weight: 600;
  }
  [data-theme="dark"] .page-home .so-b2b-footer a {
    color: var(--amber-2);
  }`,
  ],
];

for (const [from, to] of blocks) {
  if (!newCss.includes(from)) {
    console.error('Block not found, aborting:', from.slice(0, 80));
    process.exit(1);
  }
  newCss = newCss.replace(from, to);
}

html = head + newCss + tail;

const sectorSvgs = [
  [
    '<div class="home-lp__card-icon-wrap" data-so-icon="home-sector-hotels" aria-hidden="true">\n              <svg viewBox="0 0 24 24" focusable="false">',
    '<div class="home-lp__card-icon-wrap" data-so-icon="home-sector-hotels" aria-hidden="true">\n              <svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
  ],
  [
    '<div class="home-lp__card-icon-wrap" data-so-icon="home-sector-clinics" aria-hidden="true">\n              <svg viewBox="0 0 24 24" focusable="false">',
    '<div class="home-lp__card-icon-wrap" data-so-icon="home-sector-clinics" aria-hidden="true">\n              <svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
  ],
  [
    '<div class="home-lp__card-icon-wrap" data-so-icon="home-sector-property" aria-hidden="true">\n              <svg viewBox="0 0 24 24" focusable="false">',
    '<div class="home-lp__card-icon-wrap" data-so-icon="home-sector-property" aria-hidden="true">\n              <svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
  ],
  [
    '<div class="so-b2b__picon" aria-hidden="true">\n            <svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8"/>',
    '<div class="so-b2b__picon" aria-hidden="true">\n            <svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/>',
  ],
];

for (const [from, to] of sectorSvgs) {
  if (!html.includes(from)) {
    console.error('SVG snippet not found:', from.slice(0, 60));
    process.exit(1);
  }
  html = html.replace(from, to);
}

const painSvgs = [
  '            <svg viewBox="0 0 24 24" focusable="false"><path d="M17 21v-2a4 4 0 0 0-3-3.87"/>',
  '            <svg viewBox="0 0 24 24" focusable="false"><path d="M12 2.5l2.8 8.6h9l-7.3 5.3 2.8 8.6-7.3-5.3-7.3 5.3 2.8-8.6-7.3-5.3h9L12 2.5z"/>',
  '            <svg viewBox="0 0 24 24" focusable="false"><path d="M3 3v18h18"/><path d="M7 16l4-5 3 3 6-7"/><path d="M17 9V5h-4"/>',
];
for (const start of painSvgs) {
  const full = start;
  if (html.includes(full) && !full.includes('stroke="currentColor"')) {
    html = html.replace(
      full,
      full.replace('<svg viewBox="0 0 24 24" focusable="false">', '<svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">')
    );
  }
}

fs.writeFileSync(indexPath, html);
console.log('Patched', indexPath);
