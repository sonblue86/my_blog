# Reader tools — progress log (branch feat/reader)

## Done
- src/scripts/text-fragment.ts + tests/unit/text-fragment.test.ts (13 tests)
- src/scripts/reader-settings.ts prefs model + tests/unit/reader-settings.test.ts (7 tests)
- src/components/post/ReaderSettings.astro: bottom sheet (<768, swipe-down/drag handle) / non-modal floating
  panel (desktop, Esc + outside click), font/size(7 steps + bars)/leading/width/theme, focus mode
  (html[data-focus-mode], exit pill, Esc, `ns:toggle-focus`), reset, cross-tab sync, keeps reading position on reflow.
  `astro build` OK; NOT yet browser-verified.
- src/scripts/tts.ts (chunking, voice ranking/labels, platform detect, Reader state machine) + tests/unit/tts.test.ts (20 tests)
- src/components/post/ListenPlayer.astro: mini player (play/pause, prev/next, rate, voice select, câu i/n + bar, close), no-voice sheet per platform, highlight, follow-scroll, wake lock, pagehide stop. Builds; NOT browser-verified.

## Next
6. src/scripts/selection-share.ts + src/components/post/SelectionShare.astro
7. Verify: astro build, astro check, vitest, browser 390x844 + 1440x900 light/dark

## Notes
- Test page: /bai-viet/xin-chao/ ; preview port 4413 ; playwright-cli session "reader".
- Icons missing from Icon.astro (minus/plus/rotate-ccw/focus/minimize-2/skip-*) → inlined from lucide-static.
- Don't use `python -` in bash here (Windows store stub hangs). Use Write tool for file edits.
