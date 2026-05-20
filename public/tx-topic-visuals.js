/**
 * Semantic pictogram icons for /admin/transcriptions transcription cards.
 * Loaded before admin-transcriptions.js — exposes window.TxTopicVisuals.
 *
 * Each card gets icon_concept + icon_shape_signature from content analysis;
 * silhouettes differ by meaning, not just hue.
 */
(function () {
  'use strict';

  var CATEGORY_KEYS = {
    meetings: 'cat-meetings',
    notes: 'cat-notes',
    tasks: 'cat-tasks',
    calendar: 'cat-calendar',
    projects: 'cat-projects',
    decisions: 'cat-decisions',
    'open-points': 'cat-open',
  };

  /** @type {Array<{id:string,label:string,shapeSignature:string,keywords:string[],priority?:number,categoryBoost?:Object,svg:string}>} */
  var ICON_CONCEPTS = [
    {
      id: 'empty-transcript',
      label: 'Empty transcript',
      shapeSignature: 'blank-doc-warning-dot',
      priority: 100,
      keywords: ['trascrizione vuota', 'empty transcript', 'no speech', 'silenzio totale', 'blank transcript'],
      svg:
        '<rect x="22" y="14" width="36" height="50" rx="4" fill="#f8fafc" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<circle cx="58" cy="58" r="12" fill="#fef08a" stroke="#ca8a04" stroke-width="2"/>' +
        '<circle cx="58" cy="58" r="4" fill="#dc2626"/>',
    },
    {
      id: 'unclear-audio',
      label: 'Unclear audio',
      shapeSignature: 'broken-wave-question',
      priority: 99,
      keywords: [
        'inaudible',
        'unintelligible',
        'garbled',
        'unclear audio',
        'non intellegibile',
        'non decodificabile',
        'registrazione non intellegibile',
      ],
      svg:
        '<path d="M10 46c6-12 14-18 22-18s16 6 22 18" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M18 46c3-6 8-10 14-10" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="3 4"/>' +
        '<path d="M46 46c3-6 8-10 14-10" fill="none" stroke="#64748b" stroke-width="2" opacity="0.5"/>' +
        '<circle cx="58" cy="24" r="14" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/>' +
        '<text x="58" y="30" text-anchor="middle" font-size="18" font-weight="700" fill="#4338ca">?</text>',
    },
    {
      id: 'political-debate',
      label: 'Political debate',
      shapeSignature: 'podium-bubbles-scale',
      keywords: [
        'politic',
        'debate',
        'dibattit',
        'congresso',
        'parlament',
        'elezioni',
        'contraddittorio',
        'destra',
        'sinistra',
        'par condicio',
        'vaccini',
        'governo',
        'senato',
      ],
      svg:
        '<rect x="28" y="38" width="24" height="22" rx="2" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>' +
        '<path d="M24 60h32" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>' +
        '<ellipse cx="20" cy="28" rx="10" ry="8" fill="#bfdbfe" stroke="#2563eb" stroke-width="1.5"/>' +
        '<ellipse cx="60" cy="24" rx="10" ry="8" fill="#fecdd3" stroke="#e11d48" stroke-width="1.5"/>' +
        '<path d="M52 14h16v4H52z" fill="#f59e0b"/>' +
        '<path d="M56 18v8M52 22h8" stroke="#92400e" stroke-width="2"/>' +
        '<path d="M58 52l-6 8M58 52l6 8M52 60h12" stroke="#64748b" stroke-width="2" fill="none"/>',
    },
    {
      id: 'knee-injection',
      label: 'Knee medical injection',
      shapeSignature: 'knee-joint-syringe',
      keywords: [
        'condropatia',
        'infiltrazione',
        'acido ialuronico',
        'syringe',
        'injection',
        'ginocchio',
        'knee',
        'articol',
        'ortoped',
        'cartilag',
      ],
      svg:
        '<path d="M18 52c8-16 20-22 32-22s24 6 30 22" fill="none" stroke="#64748b" stroke-width="4" stroke-linecap="round"/>' +
        '<circle cx="34" cy="44" r="8" fill="#e2e8f0" stroke="#475569" stroke-width="2"/>' +
        '<circle cx="50" cy="44" r="8" fill="#e2e8f0" stroke="#475569" stroke-width="2"/>' +
        '<rect x="54" y="12" width="8" height="28" rx="2" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>' +
        '<path d="M58 12l4-6 4 6" fill="#94a3b8"/>' +
        '<line x1="58" y1="40" x2="58" y2="48" stroke="#dc2626" stroke-width="2"/>',
    },
    {
      id: 'youtube-schedule',
      label: 'YouTube planning',
      shapeSignature: 'play-button-calendar',
      keywords: [
        'youtube',
        'slot settimanale',
        'canale',
        'upload schedule',
        'content calendar',
        'video plan',
        'riprese canale',
        'tanti soldi',
      ],
      svg:
        '<rect x="14" y="22" width="34" height="26" rx="4" fill="#1e293b"/>' +
        '<path d="M28 30l12 7-12 7z" fill="#ef4444"/>' +
        '<rect x="44" y="18" width="26" height="30" rx="4" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>' +
        '<path d="M44 28h26" stroke="#fbbf24" stroke-width="2"/>' +
        '<rect x="48" y="12" width="6" height="10" rx="2" fill="#fcd34d"/>' +
        '<rect x="60" y="12" width="6" height="10" rx="2" fill="#fcd34d"/>' +
        '<circle cx="52" cy="36" r="3" fill="#f97316"/><circle cx="60" cy="36" r="3" fill="#10b981"/>',
    },
    {
      id: 'thaifans-community',
      label: 'ThaiFans business community',
      shapeSignature: 'users-pin-chat',
      keywords: [
        'thaifans',
        'thai fans',
        'google meet',
        'beta tester',
        'community business',
        'whatsapp',
        'chat with',
        'italiani a patta',
      ],
      svg:
        '<circle cx="26" cy="30" r="9" fill="#93c5fd"/><circle cx="44" cy="26" r="9" fill="#86efac"/>' +
        '<path d="M14 58c4-10 14-14 24-14s20 4 24 14" fill="#c4b5fd"/>' +
        '<path d="M58 18c0 6 4 10 4 10s4-4 4-10a4 4 0 10-8 0z" fill="#ef4444" stroke="#b91c1c" stroke-width="1.5"/>' +
        '<circle cx="58" cy="18" r="2" fill="#fff"/>' +
        '<rect x="50" y="44" width="22" height="16" rx="6" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>' +
        '<path d="M54 50h14M54 54h10" stroke="#15803d" stroke-width="2" stroke-linecap="round"/>',
    },
    {
      id: 'shared-house-finance',
      label: 'Shared house & money',
      shapeSignature: 'house-split-document',
      keywords: [
        'casa condivisa',
        'shared house',
        'mutuo',
        'mortgage',
        'affitto',
        'condominio',
        'spese casa',
        'split rent',
        'coinquil',
      ],
      svg:
        '<path d="M12 40l18-16 18 16v24H12z" fill="#fde68a" stroke="#d97706" stroke-width="2"/>' +
        '<rect x="22" y="44" width="10" height="20" fill="#92400e"/>' +
        '<rect x="46" y="20" width="24" height="32" rx="3" fill="#fff" stroke="#6366f1" stroke-width="2"/>' +
        '<path d="M58 20v32" stroke="#ef4444" stroke-width="2" stroke-dasharray="3 2"/>' +
        '<path d="M50 30h16M50 38h12M50 46h14" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>',
    },
    {
      id: 'family-inheritance-money',
      label: 'Family & inheritance',
      shapeSignature: 'family-tree-coins',
      keywords: ['eredità', 'eredit', 'inheritance', 'famiglia', 'family', 'figli', 'genitori', 'soldi senza condizioni'],
      svg:
        '<circle cx="40" cy="18" r="8" fill="#f9a8d4"/><circle cx="22" cy="36" r="7" fill="#93c5fd"/><circle cx="58" cy="36" r="7" fill="#86efac"/>' +
        '<path d="M40 26v8M40 34L22 42M40 34l18 8" stroke="#64748b" stroke-width="2"/>' +
        '<circle cx="28" cy="58" r="10" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>' +
        '<text x="28" y="63" text-anchor="middle" font-size="12" font-weight="700" fill="#b45309">$</text>' +
        '<circle cx="52" cy="58" r="10" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>' +
        '<text x="52" y="63" text-anchor="middle" font-size="12" font-weight="700" fill="#b45309">€</text>',
    },
    {
      id: 'crypto-finance',
      label: 'Crypto & finance',
      shapeSignature: 'bitcoin-chart-wallet',
      keywords: ['bitcoin', 'crypto', 'borsa', 'investimento', 'finance', 'soldi', 'stock', 'azioni'],
      svg:
        '<circle cx="28" cy="28" r="16" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>' +
        '<text x="28" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#b45309">₿</text>' +
        '<path d="M48 52l8-16 6 10 10-22" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<rect x="54" y="44" width="18" height="14" rx="3" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>',
    },
    {
      id: 'water-park-leisure',
      label: 'Water park outing',
      shapeSignature: 'pool-slide-sun',
      keywords: ['parco acquatico', 'water park', 'piscina', 'pool', 'vacation', 'vacanza', 'weekend'],
      svg:
        '<path d="M8 56c10-24 54-24 64 0z" fill="#38bdf8" opacity="0.85"/>' +
        '<path d="M48 20l16 14H48V20z" fill="#f472b6"/>' +
        '<circle cx="62" cy="16" r="10" fill="#fde047" stroke="#ca8a04" stroke-width="2"/>' +
        '<path d="M20 56h8M36 56h8M52 56h8" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round"/>',
    },
    {
      id: 'video-editing',
      label: 'Video editing',
      shapeSignature: 'film-strip-scissors',
      keywords: ['clip video', 'montaggio', 'editing', 'registrazioni insieme', 'timeline', 'ffmpeg'],
      svg:
        '<rect x="10" y="24" width="14" height="32" rx="2" fill="#1e293b"/>' +
        '<rect x="56" y="24" width="14" height="32" rx="2" fill="#1e293b"/>' +
        '<rect x="24" y="28" width="32" height="24" rx="2" fill="#334155"/>' +
        '<circle cx="14" cy="32" r="3" fill="#94a3b8"/><circle cx="14" cy="48" r="3" fill="#94a3b8"/>' +
        '<path d="M52 18l8 8-12 12-8-8z" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>' +
        '<circle cx="58" cy="24" r="3" fill="#ef4444"/>',
    },
    {
      id: 'recording-test',
      label: 'Recording test',
      shapeSignature: 'mic-waveform-check',
      keywords: ['prova registrazione', 'recording test', 'test audio', 'testo', 'audio/video'],
      svg:
        '<rect x="34" y="14" width="12" height="22" rx="6" fill="#64748b"/>' +
        '<path d="M28 36c0 8 6 14 12 14s12-6 12-14" fill="none" stroke="#475569" stroke-width="2"/>' +
        '<path d="M40 50v8M32 58h16" stroke="#475569" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M54 40v8M58 36v16M62 42v4" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M66 48l4 4 8-10" stroke="#10b981" stroke-width="3" fill="none" stroke-linecap="round"/>',
    },
    {
      id: 'memory-recall',
      label: 'Memory recall',
      shapeSignature: 'brain-question-lightbulb',
      keywords: ['ricorda', 'ricord', 'memory', 'cosa si ricorda', 'promemoria', 'reminder'],
      svg:
        '<path d="M40 14c-10 0-16 8-16 16 0 6 3 10 3 14v6h26v-6c0-4 3-8 3-14 0-8-6-16-16-16z" fill="#fbcfe8" stroke="#db2777" stroke-width="2"/>' +
        '<path d="M34 54h12v6H34z" fill="#f9a8d4"/>' +
        '<circle cx="58" cy="22" r="12" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>' +
        '<text x="58" y="28" text-anchor="middle" font-size="16" font-weight="700" fill="#a16207">?</text>',
    },
    {
      id: 'spanish-language',
      label: 'Spanish phrase',
      shapeSignature: 'globe-speech-es',
      keywords: ['spagnolo', 'spanish', 'español', 'limpio', 'frase in'],
      svg:
        '<circle cx="32" cy="36" r="20" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>' +
        '<ellipse cx="32" cy="36" rx="20" ry="8" fill="none" stroke="#3b82f6" stroke-width="1.5"/>' +
        '<line x1="12" y1="36" x2="52" y2="36" stroke="#3b82f6" stroke-width="1.5"/>' +
        '<rect x="48" y="18" width="24" height="18" rx="6" fill="#fecaca" stroke="#ef4444" stroke-width="2"/>' +
        '<text x="60" y="31" text-anchor="middle" font-size="11" font-weight="700" fill="#b91c1c">ES</text>',
    },
    {
      id: 'book-writing',
      label: 'Book writing',
      shapeSignature: 'open-book-quill',
      keywords: ['libro', 'scrittura', 'writing', 'narrativa', 'roman', 'autore', 'nulla è come sembra'],
      svg:
        '<path d="M16 24c8-4 16-4 24 0v40c-8-4-16-4-24 0V24z" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>' +
        '<path d="M64 24c-8-4-16-4-24 0v40c8-4 16-4 24 0V24z" fill="#fde68a" stroke="#d97706" stroke-width="2"/>' +
        '<path d="M40 24v40" stroke="#b45309" stroke-width="1.5"/>' +
        '<path d="M58 16l6 10-10 4" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M54 12l10 2-2 10" fill="#94a3b8"/>',
    },
    {
      id: 'space-science',
      label: 'Space & science',
      shapeSignature: 'rocket-planet-orbit',
      keywords: ['marte', 'mars', 'proxima', 'quantist', 'einstein', 'inception', 'spazio', 'space', 'fisica'],
      svg:
        '<circle cx="54" cy="26" r="14" fill="#fca5a5" stroke="#dc2626" stroke-width="2"/>' +
        '<ellipse cx="54" cy="30" rx="16" ry="4" fill="none" stroke="#f87171" stroke-width="1.5" transform="rotate(-20 54 30)"/>' +
        '<path d="M18 56l14-28 8 4 10-14 6 22-12 8-8-4-18 12z" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>' +
        '<circle cx="30" cy="40" r="4" fill="#ef4444"/>',
    },
    {
      id: 'school-youth-health',
      label: 'School & youth health',
      shapeSignature: 'grad-cap-heart-shield',
      keywords: ['scuola', 'school', 'minori', 'student', 'compiti', 'homework'],
      svg:
        '<path d="M12 34l28-12 28 12-28 12z" fill="#1e293b"/>' +
        '<rect x="36" y="46" width="8" height="10" fill="#334155"/>' +
        '<path d="M58 22c0 6-4 10-8 12-4-2-8-6-8-12 4 0 8-4 8-8 4 4 8 8 8 8z" fill="#ef4444" stroke="#b91c1c" stroke-width="1.5"/>' +
        '<path d="M62 48l8 4v8c0 4-6 8-14 8s-14-4-14-8v-8l8-4" fill="#bbf7d0" stroke="#16a34a" stroke-width="2"/>',
    },
    {
      id: 'journalism-paywall',
      label: 'Journalism paywall',
      shapeSignature: 'newspaper-lock-coins',
      keywords: [
        'paywall',
        'giornalismo',
        'journalism',
        'abbonamento',
        'huffington',
        'dagospia',
        'sunto',
        'telegiornale',
        'rai play',
        'mediaset',
      ],
      svg:
        '<rect x="14" y="18" width="36" height="44" rx="3" fill="#f8fafc" stroke="#64748b" stroke-width="2"/>' +
        '<path d="M20 28h24M20 36h20M20 44h16" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>' +
        '<rect x="50" y="32" width="18" height="16" rx="3" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>' +
        '<path d="M56 40h6v6h-6z" fill="#92400e"/>' +
        '<circle cx="58" cy="58" r="8" fill="#fde68a" stroke="#f59e0b" stroke-width="2"/>',
    },
    {
      id: 'meeting-conversation',
      label: 'Group meeting',
      shapeSignature: 'roundtable-speech-arrows',
      keywords: ['meeting', 'call', 'conversazione', 'dialogo', 'we can start', 'waiting someone', 'participants'],
      svg:
        '<ellipse cx="40" cy="48" rx="26" ry="10" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>' +
        '<circle cx="24" cy="30" r="8" fill="#93c5fd"/><circle cx="40" cy="24" r="8" fill="#86efac"/><circle cx="56" cy="30" r="8" fill="#fcd34d"/>' +
        '<path d="M14 18c4 2 8 2 12 0M54 18c4 2 8 2 12 0" stroke="#6366f1" stroke-width="2" fill="none" stroke-linecap="round"/>',
    },
    {
      id: 'italy-travel',
      label: 'Italy travel',
      shapeSignature: 'plane-italy-pin',
      keywords: ['italia', 'italy', 'viaggio', 'flight', 'aeroporto', 'partire', 'luglio'],
      svg:
        '<path d="M12 48l20-8 28 4-8 12-12-4-8 8z" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>' +
        '<path d="M48 20c0 6 4 10 4 10s4-4 4-10a4 4 0 10-8 0z" fill="#059669" stroke="#047857" stroke-width="2"/>' +
        '<circle cx="48" cy="20" r="2" fill="#fff"/>' +
        '<rect x="56" y="44" width="14" height="10" rx="2" fill="#fff" stroke="#dc2626" stroke-width="2"/>' +
        '<rect x="58" y="46" width="4" height="6" fill="#059669"/>',
    },
    {
      id: 'real-estate-property',
      label: 'Real estate',
      shapeSignature: 'building-key-contract',
      keywords: ['immobile', 'property', 'affitto', 'rent', 'lease', 'ristruttur'],
      svg:
        '<rect x="18" y="22" width="28" height="38" rx="2" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>' +
        '<rect x="24" y="30" width="6" height="6" fill="#7dd3fc"/><rect x="34" y="30" width="6" height="6" fill="#7dd3fc"/>' +
        '<rect x="28" y="46" width="8" height="14" fill="#64748b"/>' +
        '<circle cx="58" cy="36" r="10" fill="#fde68a" stroke="#d97706" stroke-width="2"/>' +
        '<path d="M58 32v8M54 36h8" stroke="#92400e" stroke-width="2"/>',
    },
    {
      id: 'health-clinic',
      label: 'Health clinic',
      shapeSignature: 'stethoscope-cross-pill',
      keywords: ['health', 'medical', 'doctor', 'medico', 'ospedale', 'hospital', 'clinic', 'terapia'],
      svg:
        '<path d="M20 20c0 12 8 18 8 26" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="28" cy="50" r="8" fill="#fecaca" stroke="#ef4444" stroke-width="2"/>' +
        '<rect x="46" y="24" width="24" height="24" rx="6" fill="#fee2e2" stroke="#ef4444" stroke-width="2"/>' +
        '<path d="M58 32v8M54 36h8" stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>' +
        '<rect x="52" y="54" width="16" height="8" rx="4" fill="#bfdbfe" stroke="#2563eb" stroke-width="1.5"/>',
    },
    {
      id: 'task-checklist',
      label: 'Tasks checklist',
      shapeSignature: 'clipboard-checks-pen',
      keywords: ['task', 'todo', 'checklist', 'action item', 'to-do'],
      categoryBoost: { tasks: 3 },
      svg:
        '<rect x="18" y="14" width="40" height="52" rx="6" fill="#ecfdf5" stroke="#10b981" stroke-width="2"/>' +
        '<rect x="30" y="8" width="16" height="8" rx="3" fill="#6ee7b7"/>' +
        '<path d="M26 32l5 5 10-10M26 46l5 5 10-10" stroke="#059669" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M58 52l8 12" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>',
    },
    {
      id: 'calendar-event',
      label: 'Calendar event',
      shapeSignature: 'calendar-clock-pin',
      keywords: ['calendar', 'event', 'appointment', 'appuntamento', 'schedule'],
      categoryBoost: { calendar: 4 },
      svg:
        '<rect x="16" y="20" width="40" height="38" rx="6" fill="#f5f3ff" stroke="#8b5cf6" stroke-width="2"/>' +
        '<path d="M16 32h40" stroke="#a78bfa" stroke-width="2"/>' +
        '<circle cx="28" cy="42" r="4" fill="#8b5cf6"/><circle cx="40" cy="42" r="4" fill="#ec4899"/>' +
        '<circle cx="58" cy="52" r="12" fill="#ede9fe" stroke="#7c3aed" stroke-width="2"/>' +
        '<path d="M58 48v6l4 2" stroke="#5b21b6" stroke-width="2" stroke-linecap="round"/>',
    },
    {
      id: 'project-roadmap',
      label: 'Project roadmap',
      shapeSignature: 'path-milestones-flag',
      keywords: ['project', 'roadmap', 'milestone', 'sprint', 'deliverable'],
      categoryBoost: { projects: 4 },
      svg:
        '<path d="M14 56c12-20 28-28 40-36 8-6 16-10 22-14" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="4 3"/>' +
        '<circle cx="22" cy="48" r="5" fill="#2563eb"/><circle cx="40" cy="36" r="5" fill="#10b981"/><circle cx="58" cy="24" r="5" fill="#f59e0b"/>' +
        '<path d="M58 24v16" stroke="#64748b" stroke-width="2"/>' +
        '<path d="M58 24l10-4v12l-10-4z" fill="#ef4444"/>',
    },
    {
      id: 'decision-balance',
      label: 'Decision',
      shapeSignature: 'scales-check-cross',
      keywords: ['decision', 'decided', 'approve', 'reject', 'verdict'],
      categoryBoost: { decisions: 4 },
      svg:
        '<path d="M40 16v44" stroke="#64748b" stroke-width="3"/>' +
        '<path d="M20 28h40" stroke="#64748b" stroke-width="3"/>' +
        '<path d="M20 28c-8 8-8 16 0 16s8-8 8-16M60 28c8 8 8 16 0 16s-8-8-8-16" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>' +
        '<path d="M28 58l6 6 14-18" stroke="#10b981" stroke-width="3" fill="none" stroke-linecap="round"/>',
    },
    {
      id: 'open-question',
      label: 'Open question',
      shapeSignature: 'magnifier-dotted-line',
      keywords: ['open point', 'unresolved', 'unclear', 'tbd', 'unknown'],
      categoryBoost: { 'open-points': 3 },
      svg:
        '<circle cx="34" cy="34" r="16" fill="none" stroke="#6366f1" stroke-width="3"/>' +
        '<path d="M46 46l14 14" stroke="#4338ca" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M26 34h16" stroke="#94a3b8" stroke-width="2" stroke-dasharray="3 3" stroke-linecap="round"/>' +
        '<circle cx="58" cy="20" r="8" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>' +
        '<text x="58" y="25" text-anchor="middle" font-size="12" font-weight="700" fill="#a16207">?</text>',
    },
    {
      id: 'legal-contract',
      label: 'Legal contract',
      shapeSignature: 'scroll-signature-stamp',
      keywords: ['legal', 'contract', 'contratto', 'lawyer', 'avvocato', 'notary'],
      svg:
        '<path d="M20 18h32c4 0 8 4 8 8v30c0 4-4 8-8 8H20c-4 0-8-4-8-8V26c0-4 4-8 8-8z" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>' +
        '<path d="M24 32h24M24 40h18M24 48h20" stroke="#a16207" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M48 52c2 0 4 2 4 4s-2 4-4 4" fill="none" stroke="#1e293b" stroke-width="2"/>' +
        '<rect x="52" y="44" width="16" height="16" rx="3" fill="#fecaca" stroke="#ef4444" stroke-width="2" transform="rotate(8 60 52)"/>',
    },
    {
      id: 'voice-note-generic',
      label: 'Voice note',
      shapeSignature: 'mic-note-lines',
      keywords: ['voice note', 'memo', 'nota vocale'],
      svg:
        '<rect x="20" y="16" width="36" height="46" rx="5" fill="#eef2ff" stroke="#6366f1" stroke-width="2"/>' +
        '<path d="M28 30h24M28 40h18M28 50h14" stroke="#818cf8" stroke-width="2.5" stroke-linecap="round"/>' +
        '<rect x="34" y="4" width="8" height="16" rx="4" fill="#64748b"/>' +
        '<path d="M30 20c0 6 4 10 10 10s10-4 10-10" fill="none" stroke="#475569" stroke-width="2"/>',
    },
  ];

  var CONCEPT_BY_ID = {};
  ICON_CONCEPTS.forEach(function (c) {
    CONCEPT_BY_ID[c.id] = c;
  });

  var FALLBACK_BY_CATEGORY = {
    meetings: 'meeting-conversation',
    notes: 'voice-note-generic',
    tasks: 'task-checklist',
    calendar: 'calendar-event',
    projects: 'project-roadmap',
    decisions: 'decision-balance',
    'open-points': 'open-question',
  };

  var CATEGORY_KEYS_LEGACY = CATEGORY_KEYS;

  function hashSeed(str) {
    var h = 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function itemSeed(item) {
    if (!item) return 0;
    return hashSeed(
      [item.id, item.path, item.filepath, item.title, item.project, item.sourceAudio || item.source_audio, item.icon_concept]
        .filter(Boolean)
        .join('|')
    );
  }

  function categoryVisualKey(cat) {
    var c = String(cat || 'notes').toLowerCase();
    return CATEGORY_KEYS_LEGACY[c] || 'cat-notes';
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function itemVisualCorpus(item) {
    if (!item || typeof item !== 'object') return '';
    var parts = [
      item.title,
      item.summary,
      item.preview,
      item.cardSummary,
      item.description,
      item.path,
      item.filepath,
      item.project,
      item.issue,
      item.taskText,
      item.decisionText,
    ];
    var tags = item.tags;
    if (Array.isArray(tags)) parts = parts.concat(tags);
    else if (tags) parts.push(String(tags));
    ['bullets', 'importantPoints', 'decisions', 'tasks', 'openPoints', 'nextSteps', 'possibleActions'].forEach(function (k) {
      var v = item[k];
      if (Array.isArray(v)) parts = parts.concat(v);
      else if (v != null && String(v).trim()) parts.push(v);
    });
    var extracted = item.extracted_items;
    if (extracted && typeof extracted === 'object') {
      Object.keys(extracted).forEach(function (k) {
        var v = extracted[k];
        if (Array.isArray(v)) parts = parts.concat(v);
        else if (v != null && String(v).trim()) parts.push(v);
      });
    }
    var rawSections = item.raw_sections;
    if (rawSections && typeof rawSections === 'object') {
      Object.keys(rawSections).forEach(function (k) {
        if (rawSections[k]) parts.push(rawSections[k]);
      });
    }
    return parts
      .filter(function (p) {
        return p != null && String(p).trim();
      })
      .join(' ')
      .toLowerCase();
  }

  function keywordHits(text, keywords) {
    var hits = [];
    if (!text) return hits;
    keywords.forEach(function (kw) {
      var token = normalizeText(kw);
      if (token && text.indexOf(token) !== -1) hits.push(kw);
    });
    return hits;
  }

  function isEmptyTranscriptItem(item) {
    if (!item) return false;
    var corpus = itemVisualCorpus(item);
    var title = normalizeText(item.title);
    if (title.indexOf('trascrizione vuota') !== -1 || title.indexOf('empty transcript') !== -1) return true;
    var summary = normalizeText(item.summary || item.preview || '');
    if ((!summary || summary.length < 12) && (title.indexOf('vuota') !== -1 || title.indexOf('empty') !== -1)) return true;
    return /\b(empty|vuota|no speech|silenzio)\b/.test(corpus);
  }

  function isUnclearItem(item) {
    if (!item) return false;
    if (isEmptyTranscriptItem(item)) return false;
    var corpus = itemVisualCorpus(item);
    if (corpus.indexOf('| confidence: low') !== -1) return true;
    if (/\b(inaudible|unintelligible|garbled|unclear audio|non intellegibile|non decodificabile)\b/.test(corpus)) return true;
    var title = normalizeText(item.title);
    if (/(non intellegibile|non decodificabile|unclear)/.test(title)) return true;
    if (corpus.length < 100 && !item.summary && !item.title) return true;
    return false;
  }

  function scoreConcept(concept, item, corpus) {
    var hits = keywordHits(corpus, concept.keywords || []);
    var score = hits.length * 2 + (concept.priority || 0);
    var cat = normalizeText(item.category || 'notes');
    if (concept.categoryBoost && concept.categoryBoost[cat]) score += concept.categoryBoost[cat];
    var project = normalizeText(item.project || '');
    if (project && project.indexOf('thaifans') !== -1 && concept.id === 'thaifans-community') score += 3;
    return { score: score, hits: hits };
  }

  function rankConceptsForItem(item) {
    if (isEmptyTranscriptItem(item)) {
      return [{ concept: CONCEPT_BY_ID['empty-transcript'], score: 1000, hits: ['empty transcript'] }];
    }
    if (isUnclearItem(item)) {
      return [{ concept: CONCEPT_BY_ID['unclear-audio'], score: 999, hits: ['unclear audio'] }];
    }
    var corpus = itemVisualCorpus(item);
    var ranked = [];
    ICON_CONCEPTS.forEach(function (concept) {
      if (concept.id === 'empty-transcript' || concept.id === 'unclear-audio') return;
      var scored = scoreConcept(concept, item, corpus);
      if (scored.score > 0) ranked.push({ concept: concept, score: scored.score, hits: scored.hits });
    });
    ranked.sort(function (a, b) {
      return b.score - a.score || (a.concept.id < b.concept.id ? -1 : 1);
    });
    if (ranked.length) return ranked;
    var cat = normalizeText(item.category || 'notes');
    var fbId = FALLBACK_BY_CATEGORY[cat] || 'voice-note-generic';
    return [{ concept: CONCEPT_BY_ID[fbId], score: 1, hits: [cat || 'fallback'] }];
  }

  function signaturesTooSimilar(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var ta = a.split('-');
    var tb = b.split('-');
    var setA = {};
    var setB = {};
    var union = 0;
    var overlap = 0;
    var i;
    for (i = 0; i < ta.length; i++) setA[ta[i]] = true;
    for (i = 0; i < tb.length; i++) setB[tb[i]] = true;
    for (i = 0; i < ta.length; i++) {
      union++;
      if (setB[ta[i]]) overlap++;
    }
    for (i = 0; i < tb.length; i++) {
      if (!setA[tb[i]]) union++;
    }
    return union > 0 && overlap / union >= 0.55;
  }

  function resolveIconConcept(item, usedSignatures) {
    usedSignatures = usedSignatures || [];
    var ranked = rankConceptsForItem(item);
    var chosen = ranked[0];
    var i;
    for (i = 0; i < ranked.length; i++) {
      var sig = ranked[i].concept.shapeSignature;
      var conflict = false;
      var u;
      for (u = 0; u < usedSignatures.length; u++) {
        if (signaturesTooSimilar(sig, usedSignatures[u])) {
          conflict = true;
          break;
        }
      }
      if (!conflict) {
        chosen = ranked[i];
        break;
      }
    }
    usedSignatures.push(chosen.concept.shapeSignature);
    return {
      icon_concept: chosen.concept.id,
      icon_keywords: chosen.hits.slice(0, 8),
      icon_shape_signature: chosen.concept.shapeSignature,
      icon_concept_label: chosen.concept.label,
    };
  }

  function applyIconConceptToItem(item, usedSignatures) {
    if (!item || typeof item !== 'object') return item;
    var fields = resolveIconConcept(item, usedSignatures);
    item.icon_concept = fields.icon_concept;
    item.icon_keywords = fields.icon_keywords;
    item.icon_shape_signature = fields.icon_shape_signature;
    item.icon_concept_label = fields.icon_concept_label;
    return item;
  }

  function assignIconConceptsForItems(items) {
    var used = [];
    if (!Array.isArray(items)) return items;
    items.forEach(function (item) {
      applyIconConceptToItem(item, used);
    });
    return items;
  }

  function conceptForItem(item) {
    if (item && item.icon_concept && CONCEPT_BY_ID[item.icon_concept]) {
      return CONCEPT_BY_ID[item.icon_concept];
    }
    var ranked = rankConceptsForItem(item || {});
    return ranked[0].concept;
  }

  function inferTopicVisualKey(item) {
    return conceptForItem(item).id;
  }

  function visualLabel(key) {
    if (CONCEPT_BY_ID[key]) return CONCEPT_BY_ID[key].label;
    return key || 'Transcription';
  }

  function renderTopicVisual(key, opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : 0;
    var concept = CONCEPT_BY_ID[key];
    if (!concept) {
      concept = CONCEPT_BY_ID[FALLBACK_BY_CATEGORY[opts.category || 'notes'] || 'voice-note-generic'];
    }
    var inner = concept.svg;
    inner = inner.replace(/\bid="([^"]+)"/g, function (_, id) {
      return 'id="' + concept.id + '-' + seed + '-' + id + '"';
    });
    inner = inner.replace(/url\(#([^)]+)\)/g, function (_, id) {
      return 'url(#' + concept.id + '-' + seed + '-' + id + ')';
    });
    var size = opts.size === 'hero' ? 'hero' : 'list';
    var extra = opts.extraClass ? ' ' + opts.extraClass : '';
    var mirror = seed % 5 === 0 ? ' tx-topic-visual--mirror' : '';
    var wrapCls = 'tx-topic-visual tx-topic-visual--' + size + extra + mirror;
    var hue = (seed % 12) * 12;
    return (
      '<div class="' +
      wrapCls +
      '" data-tx-visual-key="' +
      concept.id +
      '" data-tx-icon-concept="' +
      concept.id +
      '" data-tx-shape-signature="' +
      concept.shapeSignature +
      '" data-tx-visual-seed="' +
      seed +
      '" style="--tx-topic-hue:' +
      hue +
      'deg" role="img" aria-label="' +
      visualLabel(concept.id).replace(/"/g, '&quot;') +
      '">' +
      '<svg class="tx-topic-visual__svg" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      inner +
      '</svg></div>'
    );
  }

  function renderTopicVisualForItem(item, opts) {
    opts = opts || {};
    var concept = conceptForItem(item);
    return renderTopicVisual(concept.id, {
      seed: itemSeed(item),
      size: opts.size,
      extraClass: opts.extraClass,
      category: item && item.category,
    });
  }

  window.TxTopicVisuals = {
    inferTopicVisualKey: inferTopicVisualKey,
    categoryVisualKey: categoryVisualKey,
    renderTopicVisual: renderTopicVisual,
    renderTopicVisualForItem: renderTopicVisualForItem,
    visualLabel: visualLabel,
    itemSeed: itemSeed,
    isUnclearItem: isUnclearItem,
    isEmptyTranscriptItem: isEmptyTranscriptItem,
    resolveIconConcept: resolveIconConcept,
    applyIconConceptToItem: applyIconConceptToItem,
    assignIconConceptsForItems: assignIconConceptsForItems,
    rankConceptsForItem: rankConceptsForItem,
    signaturesTooSimilar: signaturesTooSimilar,
    ICON_CONCEPTS: ICON_CONCEPTS,
    CATEGORY_KEYS: CATEGORY_KEYS_LEGACY,
  };
})();
