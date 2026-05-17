# Phase 2 — Cursor Chat Composer (canonical)

**Use this document when processing voice transcriptions in the Cursor chat.**  
Do **not** rely on `CURSOR_API_KEY`, SDK scripts, or heuristic `classify_daily()` for normal runs.

## Trigger

User says: *lancia pipeline*, *processa voice*, *esegui pipeline*, etc.

**Cursor runs Phase 1 (script) and Phase 2 (this chat) back-to-back in the same request** — user does not run Phase 1 alone in PowerShell unless they choose to.

## Per-file workflow

For each `content/transcriptions/*.md` that is **not** already published:

1. **Skip if done** — registry entry has `readyForSite: true`, `status: ready_for_site`, primary output exists, raw has `<!-- PROCESSED: true -->`, checksum unchanged
2. **Read** the full raw markdown (strip PROCESSED header if present)
3. **Analyze** (Composer AI): meeting / personal note / voice-note / conversation / self-recap; extract tasks, calendar hints, decisions, open points, project (or `uncategorized`)
4. **Do not invent** facts — use `date/time to confirm`, `owner to confirm` when unclear
5. **Write outputs** (Markdown + YAML front-matter):

| Type | Path |
|------|------|
| Meeting | `content/meetings/YYYY-MM-DD-meeting-<slug>.md` |
| Note | `content/notes/YYYY-MM-DD-<category>-<slug>.md` |
| Tasks | append `content/tasks/todo.md` (with `<!-- src: id -->`) |
| Calendar | append `content/calendar/events.md` |
| Project | `content/projects/{serviceopera,thaifans,work-it,personal,uncategorized}.md` |
| Decisions | `content/decisions/YYYY-MM-DD-decisions.md` |
| Open points | `content/open-points/YYYY-MM-DD-open-points.md` |

**Multi-category:** one **primary** file (meeting **or** note) + append lines to task/calendar/decision/open-point files as needed.

### Meeting sections

Source, Summary, Decisions, Tasks, Open Points, Next Steps, Full Transcription Reference

### Note sections

Source, Clean Summary, Important Points, Possible Actions, Full Transcription Reference

6. **Registry** — update `content/processed/processed_files.json` for the audio key:

```json
"aiOutputs": {
  "meeting": null,
  "note": "content/notes/...",
  "tasks": "content/tasks/todo.md",
  "calendar": null,
  "project": "content/projects/uncategorized.md",
  "decisions": null,
  "openPoints": null
},
"status": "ready_for_site",
"readyForSite": true,
"aiProcessedAt": "<ISO UTC>"
```

7. **Raw header** — prepend or update:

`<!-- PROCESSED: true | date: ... | output: content/notes/... | checksum: ... -->`

## After all files

```bash
python scripts/index_transcriptions.py
python scripts/validate_voice_publish.py
```

Then git (when user requested full pipeline or explicit publish):

```powershell
.\scripts\git_publish_voice_outputs.ps1
```

Commit message: **`Update AI-ready voice transcription outputs`**

## Admin UI

- Main list: structured AI outputs only
- Detail view: AI sections + **reference** to raw path (not full raw text as primary body)
- Pending: raw_created, ai_processing_*, failed, needs_review — not in main categories
