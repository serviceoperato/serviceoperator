# Cursor Composer — per-file voice processing prompt

Use this when Phase 2 runs via `scripts/cursor_voice_phase2.mjs` (Cursor SDK, local workspace).

For each raw transcription file, read the markdown under `content/transcriptions/`, then create or update AI-ready outputs. **Do not invent** dates, people, decisions, owners, or projects. Use `to confirm` / `date/time to confirm` / `owner to confirm` when unclear.

## Outputs (only these folders)

| Type | Path pattern |
|------|----------------|
| Meeting | `content/meetings/YYYY-MM-DD-meeting-<slug>.md` |
| Note | `content/notes/YYYY-MM-DD-<category>-<slug>.md` |
| Tasks | append to `content/tasks/todo.md` |
| Calendar | append to `content/calendar/events.md` |
| Project | `content/projects/{serviceopera,thaifans,work-it,personal,uncategorized}.md` |
| Decisions | `content/decisions/YYYY-MM-DD-decisions.md` |
| Open points | `content/open-points/YYYY-MM-DD-open-points.md` |

## Meeting file sections

Source, Summary, Decisions, Tasks, Open Points, Next Steps, Full Transcription Reference

## Note file sections

Source, Clean Summary, Important Points, Possible Actions, Full Transcription Reference

## Registry

Update `content/processed/processed_files.json` for the matching audio entry:

- `aiOutputs`: `{ meeting, note, tasks, calendar, project, decisions, openPoints }` (null if N/A)
- `status`: `ready_for_site` only when primary note/meeting file exists on disk
- `readyForSite`: true only with valid primary output
- `aiProcessedAt`: ISO UTC now
- Add `<!-- PROCESSED: true | ... -->` header on the raw transcription file

## Do not

- Publish raw-only content to the main transcriptions index
- Mark `readyForSite` without creating the primary output file
