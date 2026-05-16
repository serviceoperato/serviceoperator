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

## Transcription pipeline

- Batch input: `G:\My Drive\Voice Recorder`
- Transcription runner: `python scripts/transcribe_voice_recorder.py`
- Full pipeline: `python scripts/process_voice_recorder_pipeline.py`
- Registry: `content/processed/processed_files.json` — stable identity: full path + file size + modified time
- Run log: `content/processed/pipeline_runs.json`

## Security

- do not expose local Windows paths publicly except inside admin-only pages
- do not expose secrets
- do not add hardcoded tokens
