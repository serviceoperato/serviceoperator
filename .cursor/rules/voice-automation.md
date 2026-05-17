# Voice Automation Rules

Cursor may modify only:

- `/content`
- `/scripts`
- `/.cursor/rules/voice-automation.md`
- the existing admin voice recorder page
- the API/backend route strictly required to start the voice pipeline from the admin button

Cursor must not modify:

- `/app` unrelated files
- `/components` unrelated files
- `/pages` unrelated files
- `package.json` unless absolutely necessary and explicitly explained
- `.env`
- `next.config.js`
- deployment config files
- authentication logic
- payment logic
- user account logic

When processing voice notes:

- never delete previous content
- always append or create dated Markdown files
- always include source filename and processing date
- never invent missing facts
- never invent missing dates
- never invent names
- if a date/time is ambiguous, write `date/time to confirm`
- separate content into:
  - `transcriptions`
  - `notes`
  - `meetings`
  - `tasks`
  - `calendar`
  - `projects`
  - `voice-reports`
- keep Markdown clean and readable
- prefer concise operational summaries
- preserve the full transcription reference

## Daily pipeline (Cursor)

When the user asks to launch or run the voice pipeline, follow **`.cursor/rules/daily-voice-processing-pipeline.mdc`** and execute the full runbook in **`content/voice-reports/daily-voice-processing-pipeline.md`** (Phase 1 transcription + Phase 2 AI processing, Steps 0–7). Do not auto-push to Google/GitHub; sync via `/admin/transcriptions`. Git push only if explicitly requested.

## Transcription pipeline (local Windows only)

- Do **not** add `faster-whisper` to the Railway Node Docker image
- Local deps: `pip install -r requirements-voice.txt` and `winget install Gyan.FFmpeg`
- Batch input: `G:\My Drive\Voice Recorder`
- Preferred runner: `.\scripts\run-voice-pipeline.ps1`
- Full pipeline: `python scripts/process_voice_recorder_pipeline.py`
- Registry: `content/processed/processed_files.json` — stable identity: full path + file size + modified time
- Run log: `content/processed/pipeline_runs.json`

## Security

- `/admin/voice-recorder` is **admin-only** (operator JWT / admin gate); `noindex, nofollow` on admin HTML
- API: only `GET|POST /api/admin/voice-recorder/*` with `requireAdmin`; never add public `/api/voice-recorder/*`
- Sanitize API JSON: no Windows paths, `/app/…`, or absolute host paths in `stdout`/`stderr`/`error` (log full detail server-side only)
- Static admin HTML may document local paths; public marketing pages and unauthenticated responses must not
- do not expose secrets or hardcoded tokens
