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
- BROWSER PASS DONE (integrated main, /bai-viet/llm-hoat-dong-the-nao/, astro preview :4423), 1440x900, 820x1000,
  390x844 (Pixel 7 emulation: touch + coarse pointer), light + dark:
  - Settings: meta "Aa", rail, action bar, S shortcut; every control live + persisted, Head applies before paint;
    reading anchor kept on size change; Esc / outside click / backdrop tap / swipe (snap-back + close) ; focus mode +
    Esc + pill; reset; focus returns to the opener.
  - Listen: no-voice dialog (Windows desktop) + sheet (mobile, drag-to-close, sticky actions); fake speechSynthesis:
    play/pause/prev/next/rate/voice, ::highlight, aria-pressed on all 3 toggles, toast stacks above player,
    player sits above the action bar and drops into its place when the bar hides / in focus mode.
  - Selection: mouse drag (desktop, above), programmatic range (mobile, below), flip below at top edge, cross-paragraph
    quote, clipboard text, X/Facebook intent URLs, keyboard Tab/arrows/End/Enter/Esc, fragment link opened → ::target-text.
  - Console: only /api/stats 404 (worker API not running under astro preview; not reader code).
- Fix commits: 6e5c03d, 9aa0e49, 4faec55. astro check 0 errors; vitest 183/183.

## Next
- Nothing open for reader. Follow-ups for other owners are listed in Notes.

## Notes
- Test page: /bai-viet/llm-hoat-dong-the-nao/ ; preview port 4423 (npx astro preview) ; playwright-cli session "reader".
- Fake TTS: scratchpad/shots-reader/fake-tts.js via page.addInitScript, active only with ?faketts.
- Lightning CSS (Vite 8): `backdrop-filter` followed by `-webkit-backdrop-filter` → only the prefixed one survives,
  and Chrome ignores it (computed `none`). Write the prefixed one FIRST. Still broken (not my files):
  Header.astro (.site-header — header text bleeds through on scroll), ActionBar.astro (.action-bar), pages/thu-vien/index.astro.
- Header auto-hide: dragging a selection near the top edge autoscrolls up → header reappears and the selection grows
  into the nav. Header behaviour, not reader code.
- /api/stats 404 on astro preview is expected (worker API not running) — not from reader components.
- Icons missing from Icon.astro (minus/plus/rotate-ccw/focus/minimize-2/skip-*) → inlined from lucide-static.
- Don't use `python -` in bash here (Windows store stub hangs). Use Write tool for file edits.
