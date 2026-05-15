/**
 * Rebuild home page so-quad-ring SVGs: white outer circle, mono-color 4-segment ring
 * (diagonal gaps), single center icon per ring.
 */
import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.join(path.resolve(import.meta.dirname, '..'), 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

/** Ring geometry (viewBox 48×48). */
const RING_R = 17.5;
const RING_STROKE = 4;
const GAP_DEG = 1.5;
const ARC_DEG = 90 - GAP_DEG;
const GAP_CENTERS = [45, 135, 225, 315];
/** Option C — icon nearly flush with inner ring (viewBox 48, icon drawn in 24×24). */
const CENTER_SCALE = 0.93;

function arcPaths(cx, cy, r) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const pt = (deg) => {
    const a = toRad(deg);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  return GAP_CENTERS.map((gap) => {
    const start = gap + GAP_DEG / 2;
    const end = start + ARC_DEG;
    const [x1, y1] = pt(start);
    const [x2, y2] = pt(end);
    return `M${x1.toFixed(3)} ${y1.toFixed(3)}A${r} ${r} 0 0 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`;
  });
}

const arcD = arcPaths(24, 24, RING_R);
const RING_SVG_BODY = `<circle class="so-quad-ring__outer" cx="24" cy="24" r="22.5" fill="var(--so-quad-fill,#fff)" stroke="var(--so-quad-outer-stroke,rgba(30,58,95,0.12))" stroke-width="0.75"/>
    <g class="so-quad-ring__arcs" fill="none" stroke="var(--so-quad-accent, #4f46e5)" stroke-width="${RING_STROKE}" stroke-linecap="butt">
      <path d="${arcD[0]}"/>
      <path d="${arcD[1]}"/>
      <path d="${arcD[2]}"/>
      <path d="${arcD[3]}"/>
    </g>`;

const FOOTER_MARK =
  '<circle cx="0" cy="0" r="1.1" fill="currentColor" stroke="none"/><path d="M-2.5 0h5M0-2.5v5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>';

function centerIconGroup(iconInner) {
  const body = (iconInner || FOOTER_MARK).trim();
  return `<g class="so-quad-ring__icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" transform="translate(24 24) scale(${CENTER_SCALE}) translate(-12 -12)">${body}</g>`;
}

function buildRingSvg({ extraClass = '', iconInner = '', withIcon = true } = {}) {
  const icon = withIcon ? centerIconGroup(iconInner) : '';
  return `<svg class="so-quad-ring__svg${extraClass}" viewBox="0 0 48 48" focusable="false" aria-hidden="true">${RING_SVG_BODY}${icon}</svg>`;
}

function extractFirstQuadrantIcon(svgBlock) {
  const m = svgBlock.match(
    /<g class="so-quad-ring__qi so-quad-ring__qi--ne"[^>]*>([\s\S]*?)<\/g>/,
  );
  if (m) return m[1].trim();
  const legacy = svgBlock.match(/<g class="so-quad-ring__icon"[^>]*>([\s\S]*?)<\/g>/);
  return legacy ? legacy[1].trim() : '';
}

let replaced = 0;
html = html.replace(
  /<svg class="so-quad-ring__svg([^"]*)"[^>]*>[\s\S]*?<\/svg>/g,
  (full, classSuffix) => {
    const extraClass = classSuffix.trim() ? ` ${classSuffix.trim()}` : '';
    const isAvatar =
      full.includes('so-quad-ring__center--photo') || /so-quad-ring--avatar/.test(full);
    const hasIcons =
      full.includes('so-quad-ring__icon') ||
      full.includes('so-quad-ring__icons') ||
      full.includes('so-quad-ring__qi');
    const iconInner = hasIcons ? extractFirstQuadrantIcon(full) : '';
    const withIcon = hasIcons && !isAvatar;
    if (withIcon || (hasIcons && iconInner)) replaced += 1;
    return buildRingSvg({ extraClass, iconInner, withIcon });
  },
);

fs.writeFileSync(indexPath, html);
console.log(
  `[rebuild-home-quad-rings] Patched ${indexPath} — ring SVGs rebuilt: ${replaced} (r=${RING_R}, gap=${GAP_DEG}°, scale=${CENTER_SCALE})`,
);
