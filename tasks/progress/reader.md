# Reader tools — progress log (branch feat/reader)

## Done
- src/scripts/text-fragment.ts + tests/unit/text-fragment.test.ts (13 tests)
- src/scripts/reader-settings.ts prefs model + tests/unit/reader-settings.test.ts (7 tests)
- src/components/post/ReaderSettings.astro: bottom sheet (<768, swipe-down/drag handle) / non-modal floating
  panel (desktop, Esc + outside click), font/size(7 steps + bars)/leading/width/theme, focus mode
  (html[data-focus-mode], exit pill, Esc, `ns:toggle-focus`), reset, cross-tab sync, keeps reading position on reflow.
- src/scripts/tts.ts (chunking, voice ranking/labels, platform detect, Reader state machine) + tests/unit/tts.test.ts (20 tests)
- src/components/post/ListenPlayer.astro: mini player, no-voice sheet per platform, highlight, follow-scroll, wake lock.
- src/scripts/selection-share.ts + tests/unit/text-fragment-selection.test.ts (7 tests); SelectionShare.astro toolbar.
- Browser pass (integrated main, /bai-viet/llm-hoat-dong-the-nao/, port 4423), DESKTOP 1440x900:
  settings panel open/Esc/outside-click/focus-return, all controls live + persisted (no flash, Head applies first),
  reading position kept on font-size change (ratio 0.682→0.686), focus mode + Esc + pill, reset, S shortcut,
  no-voice dialog (Windows), player with fake speechSynthesis (play/pause/next/prev/rate/voice, aria-pressed sync).
  Fixes committed 6e5c03d (backdrop-filter order, focus-mode reflow, pill focus, paused highlight, toast offset).

## Next
- Mobile 390x844 (playwright --device): settings sheet + swipe close, player vs action bar, no-voice sheet.
- SelectionShare desktop mouse + mobile programmatic range, clipboard, text-fragment navigation.
- Console clean; astro check; vitest; final commit.

## Notes
- Test page: /bai-viet/llm-hoat-dong-the-nao/ ; preview port 4423 (npx astro preview) ; playwright-cli session "reader".
- Fake TTS: scratchpad/shots-reader/fake-tts.js via page.addInitScript, active only with ?faketts.
- Lightning CSS (Vite 8): `backdrop-filter` followed by `-webkit-backdrop-filter` → only the prefixed one survives,
  Chrome ignores it. Write the prefixed one FIRST. Header.astro, ActionBar.astro, thu-vien/index.astro (not mine) still affected.
- /api/stats 404 on astro preview is expected (worker API not running) — not from reader components.
- Icons missing from Icon.astro (minus/plus/rotate-ccw/focus/minimize-2/skip-*) → inlined from lucide-static.
- Don't use `python -` in bash here (Windows store stub hangs). Use Write tool for file edits.
