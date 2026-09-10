# Interview recordings implementation plan

Goal: Merge the empty Mock daily option into behavioral practice; add Chinese basics and persistent, local-only recordings per behavioral/resume question.

Architecture: A shared RecordingPanel uses MediaRecorder and same-origin loopback-only APIs. Recordings and per-take metadata live under `.local/interview-recordings`, ignored by Git. Stable question keys provide history across days. No cloud service or new runtime dependency.

Approved scope: User's September 10 request, implemented directly in the current editor and its existing sibling diary data. Preserve unrelated working changes and historical diary records.

- [x] API/storage: add `lib/interviewRecordings.ts` and `app/api/interview/recordings/route.ts`; validate keys, IDs, MIME/size, names and local origin. Save each take independently, expose list/media with range support, rename and delete. Tests use a temporary directory and real HTTP Request objects for lifecycle, isolation, range and rejection cases.
- [x] Capture/UI: add `components/interview/RecordingPanel.tsx` and a browser capture helper; start/stop microphone explicitly, release tracks, retain failed saves for retry and local preview, list editable names and delete confirmation. Integrate into ChallengeRecord and behavioral question blocks using stable IDs rather than date/index. Verify MediaRecorder lifecycle with fake device boundaries and inspect browser UI.
- [x] Content: remove Mock block and replace its preset entry with bh-star; add Chinese basics to inventory and behavioral pool. Keep old logs, original IDs and existing STAR/English content. Verify loaded daily menu and question suggestions.
- [x] Run interview tests, TypeScript diagnostics and diff checks; review changes and verify `.local` is ignored. No commit, push or deployment is part of this request.

Verification: 33 interview tests passed. Live loopback API and browser playback/rename exercised with two synthetic WAVs, then cleaned. Device capture lifecycle tested at the MediaRecorder boundary; no user microphone was activated. TypeScript reports the same 12 unrelated baseline errors. Independent reviewer found no remaining blockers after navigation guards and loopback binding.

Waveform iteration: added live Web Audio amplitude display, conservative near-silence trimming with speech padding and preserved short pauses, original/processed waveform and seek controls. Original-first persistence protects against decode/processing failure. Near-silence threshold is fixed at -80 dBFS; uncertain quiet speech and noisy pauses are preserved. Tests: 40 pass; browser synthetic 5.5s to2.5s playback, original switch, waveform seek to2s and legacy offline decode verified; test recordings cleaned. Independent DSP review passed after mixed-volume regression fix.
