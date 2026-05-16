Process the Voice Recorder pipeline.

Run the automation engine.

Steps:
1. Run scripts/process_voice_recorder_pipeline.py
2. Read new files from G:\My Drive\Voice Recorder
3. Transcribe new audio with faster-whisper
4. Auto-detect spoken language
5. Save Markdown transcriptions
6. Classify content into notes, meetings, tasks, calendar events, and project updates
7. Update /content files
8. Generate the daily voice report
9. Show me the final summary
10. If everything is correct, run git status and ask before git commit/push unless I explicitly say "commit and push"
