// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
class Param {
  value = 1;
  events: Array<[string, number, number]> = [];
  cancelScheduledValues(t: number) {
    this.events.push(['cancel', 0, t]);
  }
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['ramp', v, t]);
  }
}
class Buffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  channels: Float32Array[];
  constructor(channels = 2, length = 2000, rate = 1000) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = rate;
    this.channels = Array.from({ length: channels }, () =>
      Float32Array.from({ length }, (_, i) => Math.sin(i / 50) * 0.3),
    );
  }
  getChannelData(i: number) {
    return this.channels[i];
  }
}
class Source {
  buffer: Buffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  stops: number[] = [];
  starts: number[][] = [];
  onended: (() => void) | null = null;
  disconnected = false;
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
  start(...values: number[]) {
    this.starts.push(values);
  }
  stop(t = 0) {
    this.stops.push(t);
  }
  end() {
    this.onended?.();
  }
}
class Context {
  static last: Context;
  currentTime = 10;
  state = 'running';
  destination = {};
  sources: Source[] = [];
  gains: Array<{ gain: Param; connect: () => void; disconnect: () => void }> = [];
  constructor() {
    Context.last = this;
  }
  addEventListener() {}
  resume() {
    return Promise.resolve();
  }
  createBuffer(c: number, n: number, r: number) {
    return new Buffer(c, n, r);
  }
  decodeAudioData() {
    return Promise.resolve(new Buffer());
  }
  createGain() {
    const g = { gain: new Param(), connect() {}, disconnect() {} };
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new Source();
    this.sources.push(s);
    return s;
  }
}
let bgm: typeof import('../src/game/bgm');
beforeEach(async () => {
  localStorage.clear();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) }));
  // A single module instance avoids installing duplicate document gesture handlers.
  bgm = await import('../src/game/bgm');
  bgm.stopBgm();
});
afterEach(() => {
  bgm.stopBgm();
  vi.unstubAllGlobals();
});
const playing = (id: string) => vi.waitFor(() => expect(bgm.getBgmPlaybackState().trackId).toBe(id));
describe('audio-clock looping and transitions', () => {
  it('joins the final sample to the adjacent head sample and trims encoder padding', async () => {
    const { MUSIC_TRACKS } = await import('../src/music/catalog');
    const decoded = new Buffer(2, 2200, 1000);
    const loop = bgm.prepareMusicLoop(new Context() as unknown as BaseAudioContext, decoded as unknown as AudioBuffer, {
      ...MUSIC_TRACKS[0],
      duration: 2,
      loopOverlap: 0.02,
    });
    expect(loop.buffer.length).toBe(2000);
    expect(loop.loopStart).toBe(0.02);
    expect(loop.loopEnd).toBe(2);
    for (let c = 0; c < 2; c++) {
      const pcm = loop.buffer.getChannelData(c);
      expect(pcm[1999]).toBeCloseTo(decoded.getChannelData(c)[19], 7);
      expect(pcm[20]).toBe(decoded.getChannelData(c)[20]);
    }
  });
  it('preloads before fading the old music and schedules a 450ms audio transition', async () => {
    bgm.playBgm('normal');
    await playing('nine-lights');
    const ctx = Context.last;
    const old = ctx.sources.at(-1)!;
    let release!: (response: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    );
    bgm.playBgm('wild');
    expect(old.stops).toHaveLength(0);
    expect(bgm.getBgmPlaybackState().loadingId).toBe('between-moves');
    release({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) });
    await playing('between-moves');
    expect(old.stops.at(-1)).toBeCloseTo(ctx.currentTime + 0.45);
    expect(ctx.sources.at(-1)!.loop).toBe(true);
    expect(ctx.gains.at(-1)!.gain.events).toContainEqual(['ramp', 1, ctx.currentTime + 0.45]);
  });
  it('does not restart after stopping an unfinished request', async () => {
    let release!: (response: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    );
    bgm.previewBgm('pipa-battle');
    expect(bgm.getBgmPlaybackState().loadingId).toBe('pipa-battle');
    bgm.stopBgm();
    release({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bgm.getBgmPlaybackState()).toMatchObject({ trackId: null, loadingId: null, mode: null });
  });
  it('restores game music after the 15-second preview and never resurrects after mute', async () => {
    bgm.playBgm('normal');
    await playing('nine-lights');
    bgm.previewBgm('shamisen-battle');
    await playing('shamisen-battle');
    const preview = Context.last.sources.at(-1)!;
    expect(preview.stops.at(-1)).toBe(Context.last.currentTime + 15);
    preview.end();
    await playing('nine-lights');
    bgm.previewBgm('shamisen-battle');
    await playing('shamisen-battle');
    const second = Context.last.sources.at(-1)!;
    const { saveAudioSettings } = await import('../src/game/audioSettings');
    saveAudioSettings({ bgmEnabled: false });
    bgm.applyBgmEnabled(false);
    second.end();
    expect(bgm.getBgmPlaybackState()).toMatchObject({ mode: 'normal', trackId: null });
    saveAudioSettings({ bgmEnabled: true });
    bgm.applyBgmEnabled(true);
    await playing('nine-lights');
  });
  it('keeps the previous voice if a newly selected track cannot load', async () => {
    bgm.playBgm('normal');
    await playing('nine-lights');
    const old = Context.last.sources.at(-1)!;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    bgm.previewBgm('step-pressure');
    await vi.waitFor(() => expect(bgm.getBgmPlaybackState().error).toBe('offline'));
    expect(bgm.getBgmPlaybackState().trackId).toBe('nine-lights');
    expect(old.stops).toHaveLength(0);
  });
});
