/**
 * Vietnamese read-aloud (Web Speech API) for article pages.
 *
 * Strategy: ONE utterance per sentence. That sidesteps Chrome's ~15 s cut-off on long utterances and gives a
 * reliable per-sentence highlight via `onstart` (the `boundary` event is not fired by Edge natural voices or
 * Android Google voices). Pause = cancel() + remember the sentence index (native pause/resume is broken on
 * Android). A generation token makes callbacks from cancelled utterances harmless.
 *
 * Pure-ish: no UI here. The player component wires DOM, storage and highlight/scroll.
 */

export type TtsState = 'idle' | 'playing' | 'paused';
export interface Chunk {
  text: string;
  range: Range;
}

/** Minimal surface of `speechSynthesis` we rely on (injectable for tests). */
export interface SynthLike {
  speaking: boolean;
  pending: boolean;
  paused: boolean;
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  addEventListener(type: 'voiceschanged', fn: () => void): void;
  removeEventListener(type: 'voiceschanged', fn: () => void): void;
}

export function getSynth(): SynthLike | undefined {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
    ? (window.speechSynthesis as unknown as SynthLike)
    : undefined;
}

// ---------------------------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------------------------
export const isVietnamese = (v: Pick<SpeechSynthesisVoice, 'lang'>) => /^vi([-_]|$)/i.test(v.lang);

const RANK: Array<[RegExp, number]> = [
  [/HoaiMy|NamMinh|Online \(Natural\)/i, 100], // Edge neural voices (online-only, best quality)
  [/Google|vi-vn-x-/i, 80], // Android / ChromeOS / Chrome desktop Google voices
  [/\bLinh\b/i, 60], // Apple (macOS / iOS)
  [/Microsoft An\b/i, 40], // Windows SAPI (offline, robotic)
];
export function voiceScore(v: Pick<SpeechSynthesisVoice, 'name' | 'localService'>): number {
  return (RANK.find(([re]) => re.test(v.name))?.[1] ?? 10) + (v.localService ? 1 : 0);
}

/** Vietnamese voices only, best first. */
export function rankVoices<T extends Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>>(all: T[]): T[] {
  return all.filter(isVietnamese).sort((a, b) => voiceScore(b) - voiceScore(a));
}

/** Short, friendly label for the voice picker. */
export function voiceLabel(v: Pick<SpeechSynthesisVoice, 'name' | 'localService'>): string {
  const n = v.name;
  if (/NamMinh/i.test(n)) return 'Nam Minh (tự nhiên)';
  if (/HoaiMy/i.test(n)) return 'Hoài My (tự nhiên)';
  if (/Google/i.test(n)) return 'Google tiếng Việt';
  if (/vi-vn-x-/i.test(n)) return `Google ${n.replace(/.*vi-vn-x-/i, '').replace(/-.*$/, '').toUpperCase()}`;
  if (/\bLinh\b/i.test(n)) return 'Linh';
  if (/Microsoft An\b/i.test(n)) return 'An (Windows)';
  return n.replace(/^Microsoft\s+/i, '').replace(/\s*[-–]\s*Vietnamese.*$/i, '').trim() || n;
}

/** Resolve the voice list; Chromium fills it asynchronously (voiceschanged). */
export function loadVoices(synth = getSynth(), timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!synth) return resolve([]);
    let timer: ReturnType<typeof setTimeout>;
    const finish = (v: SpeechSynthesisVoice[]) => {
      synth.removeEventListener('voiceschanged', check);
      clearTimeout(timer);
      resolve(v);
    };
    const check = () => {
      const v = synth.getVoices();
      if (v.length) finish(v);
    };
    timer = setTimeout(() => finish(synth.getVoices()), timeoutMs);
    synth.addEventListener('voiceschanged', check);
    check(); // Safari / Firefox answer synchronously
  });
}

export interface VoicePick {
  voices: SpeechSynthesisVoice[];
  /** No Vietnamese voice listed, but Android usually speaks lang="vi-VN" anyway (Google TTS). */
  bestEffort: boolean;
}
export async function pickVietnameseVoices(synth = getSynth(), ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): Promise<VoicePick> {
  const voices = rankVoices(await loadVoices(synth));
  return { voices, bestEffort: voices.length === 0 && /Android/i.test(ua) };
}

export type Platform = 'windows' | 'mac' | 'ios' | 'android' | 'linux' | 'other';
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Linux|CrOS/i.test(ua)) return 'linux';
  return 'other';
}

// ---------------------------------------------------------------------------------------------
// Text → sentence chunks mapped to DOM Ranges
// ---------------------------------------------------------------------------------------------
export const BLOCKS = 'h2,h3,h4,p,li,figcaption,td,th,dt,dd';
export const SKIP = [
  'pre',
  'code',
  'kbd',
  'samp',
  'script',
  'style',
  'svg',
  'math',
  'button',
  'nav',
  'aside',
  'figure.expressive-code',
  '.expressive-code',
  '[aria-hidden="true"]',
  '[data-tts-skip]',
  '[hidden]',
  'section[data-footnotes]',
  'a[data-footnote-ref]', // no :has() here — closest() would throw in older engines
  'a[data-footnote-backref]',
  '.sr-only',
].join(',');

const WS = /\s/;

function sentenceSpans(text: string): Array<[number, number]> {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return [...new Seg('vi', { granularity: 'sentence' }).segment(text)].map((s) => [s.index, s.index + s.segment.length]);
  }
  // Fallback (very old engines): split after . ! ? … followed by whitespace.
  const out: Array<[number, number]> = [];
  const re = /[.!?…]+["'”’)\]]*\s+/g;
  let a = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push([a, m.index + m[0].length]);
    a = m.index + m[0].length;
  }
  if (a < text.length) out.push([a, text.length]);
  return out;
}

export function buildChunks(root: Element, maxLen = 220, minLen = 24): Chunk[] {
  const out: Chunk[] = [];
  const doc = root.ownerDocument;
  for (const block of root.querySelectorAll(BLOCKS)) {
    // Skip ignored regions and blocks nested in another block (e.g. <p> inside <li>).
    if (block.closest(SKIP) || block.parentElement?.closest(BLOCKS)) continue;
    const nodes: Text[] = [];
    const starts: number[] = [];
    let text = '';
    const tw = doc.createTreeWalker(block, 4 /* NodeFilter.SHOW_TEXT */, {
      acceptNode: (n) => (n.parentElement?.closest(SKIP) ? 2 /* FILTER_REJECT */ : 1 /* FILTER_ACCEPT */),
    });
    for (let n = tw.nextNode() as Text | null; n; n = tw.nextNode() as Text | null) {
      nodes.push(n);
      starts.push(text.length);
      text += n.data;
    }
    if (!text.trim()) continue;

    const at = (off: number): [Text, number] => {
      let i = starts.length - 1;
      while (i > 0 && starts[i] > off) i--;
      return [nodes[i], Math.min(off - starts[i], nodes[i].length)];
    };
    const push = (a: number, b: number) => {
      while (a < b && WS.test(text[a])) a++;
      while (b > a && WS.test(text[b - 1])) b--;
      const t = text.slice(a, b).replace(/\s+/g, ' ').trim().normalize('NFC');
      if (!/[\p{L}\p{N}]/u.test(t)) return;
      const r = doc.createRange();
      r.setStart(...at(a));
      r.setEnd(...at(b));
      out.push({ text: t, range: r });
    };

    // Merge tiny segments ("TP. ", "PGS.TS. ") into the next one; split long ones at , ; : (or a space).
    const spans: Array<[number, number]> = [];
    for (const [a, b] of sentenceSpans(text)) {
      const last = spans[spans.length - 1];
      if (last && text.slice(last[0], last[1]).trim().length < minLen) last[1] = b;
      else spans.push([a, b]);
    }
    for (let [a, b] of spans) {
      while (b - a > maxLen) {
        const win = text.slice(a, a + maxLen);
        let cut = Math.max(win.lastIndexOf(', '), win.lastIndexOf('; '), win.lastIndexOf(': '));
        if (cut <= minLen) cut = win.lastIndexOf(' ');
        const end = cut > minLen ? a + cut + 1 : a + maxLen;
        push(a, end);
        a = end;
      }
      push(a, b);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Player state machine
// ---------------------------------------------------------------------------------------------
export interface ReaderOptions {
  rate?: number;
  synth?: SynthLike;
  /** Any state / index change. */
  onChange?: (r: Reader) => void;
  /** A sentence started being spoken (highlight it). */
  onSentence?: (chunk: Chunk, index: number) => void;
  /** An online voice failed and was dropped; `voice` is the one now in use. */
  onVoiceFallback?: (voice: SpeechSynthesisVoice | undefined) => void;
  /** Unrecoverable: the engine can't speak Vietnamese / was blocked. */
  onFatal?: (error: string) => void;
}

export class Reader {
  state: TtsState = 'idle';
  index = 0;
  rate: number;
  private gen = 0;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  /** Strong ref: Chromium may GC an in-flight utterance and never fire onend. */
  utterance?: SpeechSynthesisUtterance;
  private synth?: SynthLike;

  constructor(
    readonly chunks: Chunk[],
    public voices: SpeechSynthesisVoice[],
    private opts: ReaderOptions = {},
  ) {
    this.rate = opts.rate ?? 1;
    this.synth = opts.synth ?? getSynth();
  }

  get total() {
    return this.chunks.length;
  }
  get voice(): SpeechSynthesisVoice | undefined {
    return this.voices[0];
  }
  get progress() {
    return this.total ? Math.min(1, this.index / this.total) : 0;
  }

  play(from = this.index) {
    const synth = this.synth;
    if (!synth || !this.chunks.length) return;
    this.index = Math.max(0, Math.min(from, this.chunks.length - 1));
    this.state = 'playing';
    const g = ++this.gen;
    this.clearTimers();
    if (synth.speaking || synth.pending) {
      synth.cancel();
      // speak() right after cancel() is silently dropped by some Chromium builds.
      this.restartTimer = setTimeout(() => this.speak(g), 80);
    } else {
      this.speak(g); // stay synchronous inside the click handler (iOS needs the user activation)
    }
    this.emit();
  }
  pause() {
    if (this.state !== 'playing') return;
    this.halt();
    this.state = 'paused';
    this.emit();
  }
  resume() {
    if (this.state === 'paused') this.play(this.index); // restarts the current sentence
  }
  toggle() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
    else this.play(this.index);
  }
  stop() {
    this.halt();
    this.state = 'idle';
    this.index = 0;
    this.emit();
  }
  next() {
    if (this.index < this.total - 1) this.seek(this.index + 1);
  }
  prev() {
    this.seek(this.index - 1);
  }
  /** Jump to a sentence; keeps the paused state when paused. */
  seek(i: number) {
    if (this.state === 'playing') this.play(i);
    else {
      this.index = Math.max(0, Math.min(i, this.total - 1));
      this.emit();
    }
  }
  setRate(rate: number) {
    this.rate = rate;
    if (this.state === 'playing') this.play(this.index);
    else this.emit();
  }
  /** Put `voice` first (others stay as fallbacks). */
  setVoice(voice: SpeechSynthesisVoice) {
    this.voices = [voice, ...this.voices.filter((v) => v !== voice)];
    if (this.state === 'playing') this.play(this.index);
    else this.emit();
  }
  destroy() {
    this.halt();
    this.state = 'idle';
  }

  private emit() {
    this.opts.onChange?.(this);
  }
  private clearTimers() {
    clearTimeout(this.watchdog);
    clearTimeout(this.restartTimer);
  }
  private halt() {
    this.gen++;
    this.clearTimers();
    this.synth?.cancel();
  }

  private speak(g: number, retried = false): void {
    if (g !== this.gen) return;
    const synth = this.synth!;
    const c = this.chunks[this.index];
    if (!c) return this.stop(); // finished the article
    const voice = this.voices[0];
    const u = new SpeechSynthesisUtterance(c.text);
    u.lang = voice ? voice.lang.replace('_', '-') : 'vi-VN';
    if (voice) u.voice = voice;
    u.rate = this.rate;
    let advanced = false;
    const advance = () => {
      if (g !== this.gen || advanced) return;
      advanced = true;
      clearTimeout(this.watchdog);
      this.index++;
      if (this.index >= this.chunks.length) return this.stop();
      this.emit();
      this.speak(g);
    };
    u.onstart = () => {
      if (g !== this.gen) return;
      this.opts.onSentence?.(c, this.index);
    };
    u.onend = advance;
    u.onerror = (e) => {
      if (g !== this.gen || advanced) return;
      const err = (e as SpeechSynthesisErrorEvent).error;
      if (err === 'interrupted' || err === 'canceled') return;
      if (err === 'not-allowed') {
        // Blocked (no user activation): fall back to paused so the next tap works.
        this.halt();
        this.state = 'paused';
        this.emit();
        return;
      }
      // Online voice failed (offline / network): drop it and retry this sentence with the next voice.
      if (!retried && voice && !voice.localService && this.voices.length > 1) {
        advanced = true;
        clearTimeout(this.watchdog);
        this.voices = this.voices.slice(1);
        this.opts.onVoiceFallback?.(this.voices[0]);
        return this.speak(g, true);
      }
      if (err === 'language-unavailable' || err === 'voice-unavailable' || err === 'synthesis-unavailable') {
        this.stop();
        this.opts.onFatal?.(err);
        return;
      }
      advance();
    };
    // Watchdog: some Android builds never fire onend. Budget ~90 ms/char at rate 1, plus slack.
    const budget = (c.text.length * 90) / this.rate + 5000;
    const check = () => {
      if (g !== this.gen || advanced) return;
      if (synth.speaking && !synth.paused) this.watchdog = setTimeout(check, 1500);
      else advance();
    };
    this.watchdog = setTimeout(check, budget);
    this.utterance = u;
    synth.speak(u);
  }
}

// ---------------------------------------------------------------------------------------------
// DOM helpers (highlight + gentle follow-scroll)
// ---------------------------------------------------------------------------------------------
export const HIGHLIGHT = 'tts-sentence';

export function highlightRange(r?: Range) {
  const css = globalThis.CSS as (typeof CSS & { highlights?: Map<string, unknown> }) | undefined;
  const H = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!css?.highlights || !H) return; // CSS Custom Highlight API: Chrome 105, Safari 17.2, Firefox 140
  if (r) css.highlights.set(HIGHLIGHT, new H(r));
  else css.highlights.delete(HIGHLIGHT);
}

/** Is a rect outside the comfortable reading band (below the header, above the floating player)? */
export function isOutOfView(rect: Pick<DOMRect, 'top' | 'bottom'>, viewportH: number, topInset = 80, bottomInset = 150): boolean {
  return rect.top < topInset || rect.bottom > viewportH - bottomInset;
}
