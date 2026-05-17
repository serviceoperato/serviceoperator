PHASE 1 — Lancia la pipeline Voice Recorder transcript del progetto
ServiceOperator. Attendi che tutti i file audio della giornata siano
trascritti in raw markdown sotto content/transcriptions/.

PHASE 2 — Per OGNI nuovo raw transcript prodotto dalla Phase 1, esegui
il processing AI seguente. Non saltare file. Non duplicare file già
processati (controlla content/processed/transcriptions_index.json).

------------------------------------
STEP 1 — CLASSIFICA L'INPUT
------------------------------------
Determina UNA categoria primaria:
- meeting       → 2+ voci, contesto professionale
- conversation  → 2+ voci, contesto personale/informale
- self-recap    → 1 voce, riepilogo della giornata o riflessione
- voice-note    → 1 voce, idea/appunto breve (<3 min)
- self-talk     → 1 voce, elaborazione emotiva/sfogo (NO output operativo)

Determina il PROGETTO (se chiaro):
serviceopera | thaifans | work-it | personal | uncategorized

Determina i TAG: max 5, lowercase, kebab-case.

------------------------------------
STEP 2 — ROUTING OUTPUT PER CATEGORIA
------------------------------------
- MEETING       → content/meetings/
- CONVERSATION  → content/notes/  + flag conversation:true
- SELF-RECAP    → content/notes/  + estrai task/decisioni aggressivamente
- VOICE-NOTE    → content/notes/
- SELF-TALK     → content/notes/  + flag self_talk:true
                  NO task/eventi/decisioni. Solo summary.
                  Mai pushare nulla su Google.

In parallelo, per ogni item estratto, appendi a:
- content/tasks/todo.md
- content/calendar/events.md
- content/decisions/<data>.md
- content/open-points/<data>.md
- content/projects/<progetto>.md  (se progetto identificato)

------------------------------------
STEP 3 — FORMATO FILE OUTPUT
------------------------------------
Frontmatter YAML obbligatorio:

---
title: <max 60 char>
category: <una delle 5>
project: <progetto | uncategorized>
date: <ISO 8601 del contenuto>
processing_date: <ISO 8601 ora>
source_audio: <path file audio>
source_transcription: <path raw transcript>
tags: [tag1, tag2]
self_talk: <true|false>
conversation: <true|false>
visual:
  type: ring | icon
  ring_data:                # solo se type: ring
    - { label: "Decisions", value: N, color: "#F59E0B" }
    - { label: "Tasks",     value: N, color: "#3B82F6" }
    - { label: "Events",    value: N, color: "#10B981" }
    - { label: "Open",      value: N, color: "#EF4444" }
    - { label: "Next",      value: N, color: "#8B5CF6" }
    # includi solo slice con value > 0
  icon:                     # solo se type: icon
    name: <lucide-icon-name>
    color: <hex dalla mappa>
    bg_color: <stesso hex con alpha 0.15>
    label: <max 3 parole italiano>
---

Sezioni markdown nell'ordine (omettere se vuote):
## Source
## Summary               (detail 150–220 words; up to 250 for long chats/meetings; card preview 40–70 words derived at index)
## Top 3 Important Points
## Decisions             (solo decisioni esplicite)
## Tasks                 (- [ ] task | due: <data|null> | priority: <h|m|l>)
## Calendar Events       (- <titolo> | <data> <ora> | confidence: <high|low>)
## Open Points           (- <domanda> | owner: <nome|to confirm>)
## Next Steps
## Full Transcription Reference

------------------------------------
STEP 4 — VISUAL HEADER (anello O icona)
------------------------------------
REGOLA TYPE:
- type: ring → se ≥2 categorie tra decisions/tasks/open_points/
  calendar_events/next_steps hanno count > 0
- type: icon → in tutti gli altri casi (incluso UNA sola categoria attiva
  e zero categorie attive)

MAPPATURA ICON PER TEMA (non per categoria tecnica):
Scegli in base al TEMA dominante del transcript.

- riflessione / introspezione   → Brain         #8B5CF6
- emozioni / sfogo (self-talk)  → Heart         #EC4899
- idea / brainstorm             → Lightbulb     #F59E0B
- promemoria / appunto          → StickyNote    #FBBF24
- conversazione personale       → MessageCircle #06B6D4
- recap giornata                → Sunset        #F97316
- progetto tech / codice        → Code2         #3B82F6
- progetto business             → Briefcase     #6366F1
- viaggio / spostamento         → Plane         #10B981
- salute / corpo                → Activity      #EF4444
- finanza / soldi               → Wallet        #22C55E
- relazioni / persone           → Users         #14B8A6
- contenuto creativo (youtube)  → Video         #EF4444
- learning / studio             → BookOpen      #8B5CF6
- altro / generico              → FileText      #64748B

Label sotto l'icona: max 3 parole italiano, descrive il contenuto.
Esempi: "Sfogo serale", "Idea ThaiFans", "Recap giornata", "Note viaggio".

NON inventare colori. Solo quelli mappati.

------------------------------------
STEP 5 — REGOLE DI ESTRAZIONE
------------------------------------
- MAI inventare date, ore, owner, deadline. Ambiguo → "to confirm" o null.
- Decisioni: solo frasi esplicite ("decidiamo di", "facciamo così",
  "ok andiamo con X"). Mai dedotte.
- Task: solo verbi d'azione espliciti ("devo X", "ricordami di X",
  "farò X").
- Eventi: solo con data o riferimento temporale concreto. Calcolare
  "domani", "lunedì", "fra 3 giorni" da processing_date.
- Lingua output: stessa del transcript. Misto IT/EN → IT.
- Self-talk: registra contenuto, non analizzare clinicamente.

------------------------------------
STEP 6 — INDICE E AGGIORNAMENTI
------------------------------------
- Aggiungi entry in content/processed/transcriptions_index.json
- Calcola has_chart_data (true se ≥2 categorie attive)
- Se progetto identificato → aggiorna content/projects/<progetto>.md
  con sezione datata "## Update <data>"

------------------------------------
STEP 7 — OUTPUT FINALE IN CONSOLE
------------------------------------
Per ogni file processato ritorna:
- Path file creati
- Categoria + confidence (0-100)
- Progetto + confidence (0-100)
- N decisioni / task / eventi / open points estratti
- Visual type scelto (ring o icon + nome icona)
- Warning se confidence < 60 su categoria o progetto
- Ambiguità non risolte (date, owner, progetto)

Alla fine della Phase 2, ritorna riepilogo totale:
- N raw transcript processati
- N file output creati per cartella
- N item totali estratti per tipo
- File con warning (lista)

NON pushare automaticamente su Google. Il sync è gestito dal
frontend admin /admin/transcriptions.
