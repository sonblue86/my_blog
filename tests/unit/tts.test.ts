// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildChunks,
  rankVoices,
  voiceLabel,
  detectPlatform,
  pickVietnameseVoices,
  isOutOfView,
  Reader,
  type Chunk,
  type SynthLike,
} from '../../src/scripts/tts';

// ---------------------------------------------------------------- mocks
class FakeUtterance {
  lang = '';
  voice: unknown = null;
  rate = 1;
  onstart: ((e: unknown) => void) | null = null;
  onend: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public text: string) {}
}
(globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;

type V = SpeechSynthesisVoice;
const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService, voiceURI: name, default: false }) as V;

function makeSynth(voices: V[] = []) {
  const s = {
    speaking: false,
    pending: false,
    paused: false,
    spoken: [] as FakeUtterance[],
    current: undefined as FakeUtterance | undefined,
    cancels: 0,
    speak(u: FakeUtterance) {
      s.spoken.push(u);
      s.current = u;
      s.speaking = true;
    },
    cancel() {
      s.cancels++;
      const u = s.current;
      s.current = undefined;
      s.speaking = false;
      u?.onerror?.({ error: 'interrupted' }); // real engines report the cut-off utterance as an error
    },
    getVoices: () => voices,
    addEventListener() {},
    removeEventListener() {},
    // test helpers
    start() {
      s.current?.onstart?.({});
    },
    end() {
      const u = s.current;
      s.current = undefined;
      s.speaking = false;
      u?.onend?.({});
    },
    fail(error: string) {
      const u = s.current;
      s.current = undefined;
      s.speaking = false;
      u?.onerror?.({ error });
    },
  };
  return s;
}

const chunks = (n: number): Chunk[] => Array.from({ length: n }, (_, i) => ({ text: `Câu số ${i}.`, range: {} as Range }));

// ---------------------------------------------------------------- chunking
describe('buildChunks', () => {
  const long =
    'Mô hình ngôn ngữ lớn là một mạng nơ-ron được huấn luyện trên lượng văn bản khổng lồ, ' +
    'nó học cách dự đoán từ tiếp theo trong câu, nghe thì đơn giản nhưng khi quy mô đủ lớn thì khả năng ấy ' +
    'biến thành năng lực viết, tóm tắt, dịch và lập luận ở mức đáng kinh ngạc mà ít ai ngờ tới trước đây, ' +
    'và đó là lý do cả thế giới đang nói về nó';

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="post-body">
        <p>Xin chào bạn. Đây là câu thứ hai khá dài để không bị gộp lại.</p>
        <h2 id="muc"><a class="heading-anchor" href="#muc">Tiêu đề mục</a></h2>
        <pre><code>const x = 1;</code></pre>
        <div class="expressive-code"><p>Không đọc khối code.</p></div>
        <p>Có <code>mã</code> ở giữa câu này nhé bạn<sup><a data-footnote-ref href="#fn1">1</a></sup>.</p>
        <ul><li><p>Mục một trong danh sách gạch đầu dòng.</p></li></ul>
        <aside><p>Bỏ qua phần ghi chú bên lề.</p></aside>
        <p data-tts-skip>Cũng bỏ qua đoạn này.</p>
        <p aria-hidden="true">Ẩn với trình đọc.</p>
        <p>TP. HCM là thành phố lớn nhất Việt Nam hiện nay.</p>
        <p>${long}</p>
        <p>   </p>
        <p>— · —</p>
        <p>${'Đ'.normalize('NFD')}ường dài.</p>
      </div>`;
  });

  it('reads prose blocks in order, skipping code, asides, skip markers and footnote refs', () => {
    const texts = buildChunks(document.getElementById('post-body')!).map((c) => c.text);
    expect(texts[0]).toBe('Xin chào bạn. Đây là câu thứ hai khá dài để không bị gộp lại.'); // tiny first sentence merged
    expect(texts[1]).toBe('Tiêu đề mục');
    expect(texts[2]).toBe('Có ở giữa câu này nhé bạn.');
    expect(texts[3]).toBe('Mục một trong danh sách gạch đầu dòng.');
    expect(texts[4]).toBe('TP. HCM là thành phố lớn nhất Việt Nam hiện nay.'); // "TP. " not split off
    const joined = texts.join(' | ');
    expect(joined).not.toContain('const x');
    expect(joined).not.toContain('Không đọc');
    expect(joined).not.toContain('Bỏ qua');
    expect(joined).not.toContain('Ẩn với');
    expect(joined).not.toMatch(/—/);
  });

  it('splits sentences longer than 220 chars at commas', () => {
    const cs = buildChunks(document.getElementById('post-body')!);
    const parts = cs.filter((c) => c.text.startsWith('Mô hình') || long.includes(c.text));
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.text.length).toBeLessThanOrEqual(220);
    expect(parts.map((p) => p.text).join(' ')).toBe(long);
    expect(parts[0].text.endsWith(',')).toBe(true);
  });

  it('maps each chunk to a DOM range covering the same text, NFC-normalised', () => {
    const cs = buildChunks(document.getElementById('post-body')!);
    expect(cs[0].range.toString()).toBe(cs[0].text);
    const last = cs[cs.length - 1];
    expect(last.text).toBe('Đường dài.');
    expect(last.text).toBe(last.text.normalize('NFC'));
  });
});

// ---------------------------------------------------------------- voices
describe('voices', () => {
  const all = [
    voice('Microsoft An - Vietnamese (Vietnam)', 'vi-VN'),
    voice('Google US English', 'en-US'),
    voice('Linh', 'vi_VN'),
    voice('Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', 'vi-VN', false),
    voice('Google Tiếng Việt', 'vi-VN', false),
    voice('vi-vn-x-gft-local', 'vi-VN'),
  ];
  it('keeps only Vietnamese voices, ranked natural > Google > Linh > An', () => {
    const names = rankVoices(all).map((v) => v.name);
    expect(names[0]).toMatch(/HoaiMy/);
    expect(names.slice(1, 3).sort()).toEqual(['Google Tiếng Việt', 'vi-vn-x-gft-local']);
    expect(names[3]).toBe('Linh');
    expect(names[4]).toMatch(/Microsoft An/);
    expect(names).not.toContain('Google US English');
  });
  it('makes friendly labels', () => {
    expect(voiceLabel(all[3])).toBe('Hoài My (tự nhiên)');
    expect(voiceLabel(voice('Microsoft NamMinh Online (Natural) - Vietnamese (Vietnam)', 'vi-VN'))).toBe('Nam Minh (tự nhiên)');
    expect(voiceLabel(all[2])).toBe('Linh');
    expect(voiceLabel(all[0])).toBe('An (Windows)');
  });
  it('flags best-effort mode on Android when no Vietnamese voice is listed', async () => {
    const synth = makeSynth([voice('English', 'en-US')]) as unknown as SynthLike;
    expect(await pickVietnameseVoices(synth, 'Mozilla/5.0 (Linux; Android 14)')).toEqual({ voices: [], bestEffort: true });
    expect((await pickVietnameseVoices(synth, 'Mozilla/5.0 (Windows NT 10.0)')).bestEffort).toBe(false);
  });
  it('detects the platform for install instructions', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios'); // iPadOS
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
  });
});

describe('isOutOfView', () => {
  it('detects rects under the header or behind the player', () => {
    expect(isOutOfView({ top: 40, bottom: 70 }, 800)).toBe(true);
    expect(isOutOfView({ top: 300, bottom: 330 }, 800)).toBe(false);
    expect(isOutOfView({ top: 700, bottom: 730 }, 800)).toBe(true);
  });
});

// ---------------------------------------------------------------- state machine
describe('Reader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('speaks one utterance per sentence with the chosen voice, lang and rate, then advances on end', () => {
    const synth = makeSynth();
    const hoaiMy = voice('HoaiMy Online', 'vi_VN', false);
    const seen: number[] = [];
    const r = new Reader(chunks(3), [hoaiMy], { synth: synth as unknown as SynthLike, rate: 1.2, onSentence: (_, i) => seen.push(i) });
    r.play(0);
    expect(r.state).toBe('playing');
    expect(synth.spoken).toHaveLength(1); // synchronous first speak (iOS user activation)
    const u = synth.spoken[0];
    expect(u.text).toBe('Câu số 0.');
    expect(u.lang).toBe('vi-VN');
    expect(u.voice).toBe(hoaiMy);
    expect(u.rate).toBe(1.2);
    synth.start();
    synth.end();
    expect(r.index).toBe(1);
    expect(synth.spoken[1].text).toBe('Câu số 1.');
    synth.start();
    expect(seen).toEqual([0, 1]);
  });

  it('falls back to lang vi-VN without a voice (Android best effort)', () => {
    const synth = makeSynth();
    new Reader(chunks(1), [], { synth: synth as unknown as SynthLike }).play();
    expect(synth.spoken[0].lang).toBe('vi-VN');
    expect(synth.spoken[0].voice).toBeNull();
  });

  it('pause = cancel + remember index; stale callbacks are ignored; resume restarts the sentence', () => {
    const synth = makeSynth();
    const states: string[] = [];
    const r = new Reader(chunks(5), [], { synth: synth as unknown as SynthLike, onChange: (x) => states.push(x.state) });
    r.play(2);
    const old = synth.spoken[0];
    r.pause();
    expect(r.state).toBe('paused');
    expect(r.index).toBe(2);
    expect(synth.cancels).toBe(1);
    old.onend?.({}); // late onend from the cancelled utterance
    expect(r.index).toBe(2);
    expect(synth.spoken).toHaveLength(1);
    r.toggle(); // resume
    expect(r.state).toBe('playing');
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1].text).toBe('Câu số 2.');
    expect(states).toEqual(['playing', 'paused', 'playing']);
  });

  it('waits ~80ms after cancel() before speaking again when the engine was busy', () => {
    const synth = makeSynth();
    const r = new Reader(chunks(5), [], { synth: synth as unknown as SynthLike });
    r.play(0);
    r.next(); // engine is speaking → cancel then delayed speak
    expect(synth.cancels).toBe(1);
    expect(synth.spoken).toHaveLength(1);
    vi.advanceTimersByTime(80);
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1].text).toBe('Câu số 1.');
  });

  it('prev/next clamp and keep the paused state', () => {
    const synth = makeSynth();
    const r = new Reader(chunks(3), [], { synth: synth as unknown as SynthLike });
    r.play(0);
    r.pause();
    r.prev();
    expect(r.index).toBe(0);
    r.next();
    r.next();
    r.next();
    expect(r.index).toBe(2);
    expect(r.state).toBe('paused');
  });

  it('stops (idle, index 0) after the last sentence', () => {
    const synth = makeSynth();
    const r = new Reader(chunks(2), [], { synth: synth as unknown as SynthLike });
    r.play(0);
    synth.end();
    synth.end();
    expect(r.state).toBe('idle');
    expect(r.index).toBe(0);
  });

  it('retries the same sentence with the next voice when an online voice errors', () => {
    const synth = makeSynth();
    const online = voice('HoaiMy Online', 'vi-VN', false);
    const local = voice('Microsoft An', 'vi-VN', true);
    const fallback = vi.fn();
    const r = new Reader(chunks(3), [online, local], { synth: synth as unknown as SynthLike, onVoiceFallback: fallback });
    r.play(1);
    synth.fail('network');
    expect(fallback).toHaveBeenCalledWith(local);
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1].text).toBe('Câu số 1.');
    expect(synth.spoken[1].voice).toBe(local);
    expect(r.index).toBe(1);
  });

  it('reports an unrecoverable language error and stops', () => {
    const synth = makeSynth();
    const fatal = vi.fn();
    const r = new Reader(chunks(3), [], { synth: synth as unknown as SynthLike, onFatal: fatal });
    r.play(0);
    synth.fail('language-unavailable');
    expect(fatal).toHaveBeenCalledWith('language-unavailable');
    expect(r.state).toBe('idle');
  });

  it('falls back to paused when speech is blocked (not-allowed)', () => {
    const synth = makeSynth();
    const r = new Reader(chunks(3), [], { synth: synth as unknown as SynthLike });
    r.play(1);
    synth.fail('not-allowed');
    expect(r.state).toBe('paused');
    expect(r.index).toBe(1);
  });

  it('watchdog advances when onend never fires', () => {
    const synth = makeSynth();
    const r = new Reader(chunks(3), [], { synth: synth as unknown as SynthLike });
    r.play(0);
    synth.speaking = false; // engine finished silently, no onend
    vi.advanceTimersByTime(6000);
    expect(r.index).toBe(1);
    expect(synth.spoken).toHaveLength(2);
  });

  it('watchdog keeps waiting while the engine is still speaking', () => {
    const synth = makeSynth();
    const r = new Reader(chunks(3), [], { synth: synth as unknown as SynthLike });
    r.play(0);
    vi.advanceTimersByTime(20000);
    expect(r.index).toBe(0);
  });

  it('setRate / setVoice restart the current sentence while playing', () => {
    const synth = makeSynth();
    const a = voice('A', 'vi-VN');
    const b = voice('B', 'vi-VN');
    const r = new Reader(chunks(3), [a, b], { synth: synth as unknown as SynthLike });
    r.play(1);
    r.setRate(1.5);
    vi.advanceTimersByTime(80);
    expect(synth.spoken.at(-1)!.rate).toBe(1.5);
    expect(synth.spoken.at(-1)!.text).toBe('Câu số 1.');
    r.setVoice(b);
    vi.advanceTimersByTime(80);
    expect(synth.spoken.at(-1)!.voice).toBe(b);
    expect(r.voices).toEqual([b, a]);
  });
});
