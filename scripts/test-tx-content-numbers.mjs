/**
 * Unit-style checks for public/tx-content-numbers.js
 * Run: node scripts/test-tx-content-numbers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'public/tx-content-numbers.js'), 'utf8');

const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(src, context);
const CN = context.window.TxContentNumbers;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const thaiFansItem = {
  title: 'Thai Fans — meeting ricorrente martedì su Google Meet',
  summary:
    'Nota vocale del 2026-05-17: impostare un meeting ricorrente ogni martedì tramite Google Meet con G-Cos e Giovanni per il progetto della dating app Thai Fans.',
  importantPoints: [
    'Riunione ricorrente prevista ogni martedì su Google Meet',
    'Partecipanti indicati: G-Cos e Giovanni',
  ],
  tasks: ['Impostare meeting ricorrente martedì su Google Meet con G-Cos e Giovanni — owner to confirm'],
  processedAt: '2026-05-17T15:04:34Z',
  processedDate: '2026-05-17',
  date: '2026-05-17',
  sourceTranscriptionContent: `# Transcription
- **Modified:** 2026-05-17 11:15:13 UTC
- **Processed:** 2026-05-17 15:04:34 UTC
**[00:00.000 → 00:21.000]** Tramite Google Meet dovremmo impostare un meeting.`,
};

const pattayaItem = {
  title: 'Gruppo WhatsApp «italiani a Pattaya»',
  summary:
    'Gruppo creato 2023, attivo 2024–2025. Temi crypto, visto DTV Thailandia (requisiti 500k THB).',
  importantPoints: ['Rete italiani a Pattaya per serate e sauna'],
  sourceTranscriptionContent: '11/3/24, 20:56 - Koragon Gicos: 6\n11/8/24, 20:27 - € 11\n?q=5,%20View%2E',
};

const koragonPattayaItem = {
  title: 'WhatsApp Koragon Gicos — Pattaya e vita sociale',
  summary:
    'Chat 1:1 WhatsApp con Koragon Gicos (Gicos) dal 2021, prevalentemente da Pattaya. Argomenti ricorrenti: tamponi COVID in inglese, affitto scooter Morotino per due-tre mesi, mappe di locali e nightlife, contenuti OnlyFans e video (prezzi intorno a 1.500 THB, qualità, marketing), sauna (Sauna Bar, Sands), app budget senza export Excel, nickname «Birillo».',
  importantPoints: [
    'Contatto stabile in Thailandia per logistica quotidiana e uscite',
    'Discussione economica su contenuti adulti e piattaforme (OnlyFans, Fansly)',
  ],
  category: 'notes',
};

const ratioText = 'We agreed on 50/50 ownership split for the project.';
const moneyPair =
  'Budget totale 57.000 € mortgage; remaining rimanente 12.000 € per ristrutturazione.';

let n = CN.extractContentNumbers(thaiFansItem);
assert(n.length === 0, 'Thai Fans should have no display numbers, got: ' + JSON.stringify(n));
assert(CN.toDonutSegments(n) === null, 'Thai Fans should not produce donut');

n = CN.extractContentNumbers(pattayaItem);
assert(!n.some((s) => String(s.raw).trim() === '6'), 'Pattaya must not extract bare 6');
assert(!n.some((s) => /€\s*11/.test(String(s.raw))), 'Pattaya must ignore isolated € 11');
assert(CN.toDonutSegments(n) === null, 'Pattaya must not produce junk donut');

n = CN.extractContentNumbers({ summary: ratioText });
assert(CN.toDonutSegments(n) && CN.toDonutSegments(n).length === 2, '50/50 should yield 2-slice donut');

n = CN.extractContentNumbers({ summary: moneyPair });
const donut = CN.toDonutSegments(n);
assert(donut && donut.length === 2, 'Comparable EUR pair should donut');

n = CN.extractContentNumbers({ summary: '?q=5,%20View%2E 20504% %E0%B8%81' });
assert(n.length === 0, 'URL/encoding junk should produce no numbers');

n = CN.extractContentNumbers({ summary: '200€ per affitto scooter Morotino' });
assert(n.length === 1 && n[0].kind === 'money', 'Semantic money should extract');

n = CN.extractContentNumbers(koragonPattayaItem);
assert(n.length === 0, 'Koragon Pattaya summary must not yield stat segments, got: ' + JSON.stringify(n));
assert(CN.toDonutSegments(n) === null, 'Koragon Pattaya must not produce donut');
assert(
  !n.some((s) => /…/.test(String(s.label || ''))),
  'Koragon must not have ellipsis labels'
);
assert(
  !n.some((s) => /…\d{2,}\s*THB/i.test(String(s.label || ''))),
  'Koragon must not have truncated THB labels'
);

console.log('test-tx-content-numbers.mjs: all checks passed');
