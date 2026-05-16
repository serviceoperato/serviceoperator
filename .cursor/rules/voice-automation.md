# Voice automation

## Scope — files agents may modify

Agents working on voice notes and transcription automation **may modify only**:

- `/content` (transcriptions, notes, meetings, tasks, calendar, processed registry, etc.)
- `/scripts` (e.g. `transcribe_voice_recorder.py` and related helpers)
- `/.cursor/rules/voice-automation.md` (this file)

## Scope — do not modify

Do **not** modify application, deployment, or environment files, including:

- `/app`, `/components`, `/pages`
- `/package.json`, `/package-lock.json`
- `/.env`, `/.env.example`
- `/next.config.js`
- Deployment configs (Dockerfile, CI, hosting redirects, etc.)

## Voice notes content rules

1. **Never delete** previous voice-derived content; preserve history.
2. **Append** or use **dated files** when adding new material.
3. Every derived document must include **source filename** and **date** (from recording or processing metadata when available).
4. **Separate** content by purpose under `/content`:
   - `transcriptions` — raw or timestamped speech-to-text
   - `notes` — distilled personal or operational notes
   - `meetings` — meeting-specific summaries and action items
   - `tasks` — actionable items extracted from voice
   - `calendar` — events and scheduling hints
5. If date or time is **ambiguous**, label it as **"date/time to confirm"**; do not guess.
6. **Do not invent** facts, names, numbers, or commitments not present in the source audio or transcription.
7. Use **clean Markdown**: headings, lists, and short paragraphs; consistent filenames and cross-links where helpful.

## Transcription pipeline

- Batch input: `G:\My Drive\Voice Recorder`
- Runner: `python scripts/transcribe_voice_recorder.py`
- Registry: `/content/processed/processed_files.json` — skip files already processed with unchanged path, size, and modified time.
