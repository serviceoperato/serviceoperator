Full daily pipeline: see daily-voice-processing-pipeline.md (Phase 1 + Phase 2, Steps 0–7). Legacy Phase 2-only: cursor-voice-pipeline-prompt.md

Process the Voice Recorder pipeline.

Run the automation engine.

Steps:
1. Run the daily pipeline per content/voice-reports/daily-voice-processing-pipeline.md (Phase 1: scripts/process_voice_recorder_pipeline.py or .\scripts\run-voice-pipeline.ps1)
2. Read new files from G:\My Drive\Voice Recorder
3. Transcribe new audio with faster-whisper
4. Auto-detect spoken language
5. Save Markdown transcriptions
6. Classify content into notes, meetings, tasks, calendar events, and project updates
7. Update /content files
8. Generate the daily voice report
9. Show me the final summary
10. If everything is correct, run git status and ask before git commit/push unless I explicitly say "commit and push"
