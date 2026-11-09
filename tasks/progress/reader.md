# Reader tools — progress log (branch feat/reader)

## Done
- (nothing yet) — read DESIGN.md, layouts, ActionBar, Toc, Shortcuts, theme/share/storage, reference TTS.

## Next
1. src/scripts/text-fragment.ts + tests/unit/text-fragment.test.ts
2. src/scripts/reader-settings.ts (pure: normalize/steps/apply) + tests/unit/reader-settings.test.ts
3. src/components/post/ReaderSettings.astro (dialog sheet/panel, focus mode)
4. src/scripts/tts.ts (chunking, voices, Reader state machine) + tests/unit/tts.test.ts
5. src/components/post/ListenPlayer.astro (mini player, no-voice sheet)
6. src/scripts/selection-share.ts + src/components/post/SelectionShare.astro
7. Verify: astro build, astro check, vitest, browser 390x844 + 1440x900 light/dark

## Notes
- Test page: /bai-viet/xin-chao/ ; preview port 4413 ; playwright-cli session "reader".
- Icons missing from Icon.astro (skip-back/forward, minus/plus, rotate-ccw, focus) → inline from lucide-static.
