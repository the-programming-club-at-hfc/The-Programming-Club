// Game-show sound for the TV, all synthesized with Web Audio so there are no files to license.
// Music can be swapped for real tracks: put lobby.mp3 or think.mp3 in public/audio and they play instead.

let ctx: AudioContext | undefined;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noiseBuf: AudioBuffer;
let volume = 0.8;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.45;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

/** Browsers only allow sound after a click, so call this from one. Until then every sound is skipped. */
export const unlockAudio = () => audio().resume();
const running = () => ctx?.state === "running";

/** Master volume, 0 to 1. */
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

type ToneOpts = { freq: number; to?: number; type?: OscillatorType; dur: number; vol: number; at?: number; bus?: GainNode };

/** One note with a quick attack and an exponential fade. `at` is an absolute AudioContext time. */
function tone({ freq, to, type = "sine", dur, vol, at, bus = sfxBus }: ToneOpts) {
  if (!running()) return;
  const a = audio();
  const t = at ?? a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

type NoiseOpts = { dur: number; vol: number; freq: number; to?: number; filter?: BiquadFilterType; at?: number; bus?: GainNode };

/** A burst of filtered noise: hats, snares, whooshes. */
function noise({ dur, vol, freq, to, filter = "bandpass", at, bus = sfxBus }: NoiseOpts) {
  if (!running()) return;
  const a = audio();
  const t = at ?? a.currentTime;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

const now = () => ctx?.currentTime ?? 0;
const PENTA = [0, 2, 4, 7, 9];

export const sfx = {
  /** Someone joined. Each new player pops a step higher up the scale. */
  join(count: number) {
    const n = 72 + PENTA[count % 5] + 12 * (Math.floor(count / 5) % 2);
    tone({ freq: hz(n - 12), to: hz(n), type: "sine", dur: 0.12, vol: 0.35 });
    tone({ freq: hz(n + 12), type: "triangle", dur: 0.18, vol: 0.12, at: now() + 0.05 });
  },
  /** A new card, Wiki Race, or message goes up. */
  card() {
    const t = now();
    noise({ dur: 0.35, vol: 0.25, freq: 300, to: 5000 });
    for (const [i, n] of [67, 74, 79].entries()) tone({ freq: hz(n), type: "square", dur: 0.16, vol: 0.07, at: t + 0.22 + i * 0.07 });
  },
  /** The answer is revealed. */
  reveal() {
    const t = now();
    for (const [i, n] of [72, 76, 79, 84].entries()) tone({ freq: hz(n), type: "triangle", dur: 0.3, vol: 0.22, at: t + i * 0.06 });
    noise({ dur: 0.5, vol: 0.06, freq: 7000, filter: "highpass", at: t + 0.2 });
  },
  /** Timer started. */
  go() {
    const t = now();
    tone({ freq: hz(76), type: "square", dur: 0.1, vol: 0.08, at: t });
    tone({ freq: hz(88), type: "square", dur: 0.25, vol: 0.08, at: t + 0.1 });
  },
  /** One second left on the clock; `urgent` for the last three. */
  tick(urgent: boolean) {
    tone({ freq: urgent ? 1760 : 1320, type: "sine", dur: urgent ? 0.09 : 0.05, vol: urgent ? 0.3 : 0.18 });
    noise({ dur: 0.03, vol: 0.1, freq: 6000, filter: "highpass" });
  },
  /** Time’s up: a low buzzer over a gong. */
  timesUp() {
    for (const f of [110, 116.5]) tone({ freq: f, type: "sawtooth", dur: 0.9, vol: 0.12 });
    tone({ freq: hz(43), type: "sine", dur: 2, vol: 0.4 });
    tone({ freq: hz(43) * 2.76, type: "sine", dur: 1.4, vol: 0.06 });
  },
  /** Relay driver swap. */
  swap() {
    tone({ freq: 880, type: "sine", dur: 1.2, vol: 0.25 });
    tone({ freq: 880 * 2.76, type: "sine", dur: 0.8, vol: 0.05 });
  },
  /** A team scored. */
  point() {
    const t = now();
    tone({ freq: hz(83), type: "square", dur: 0.08, vol: 0.1, at: t });
    tone({ freq: hz(88), type: "square", dur: 0.4, vol: 0.1, at: t + 0.08 });
  },
  /** Points taken away. */
  minus() {
    tone({ freq: 330, to: 140, type: "triangle", dur: 0.35, vol: 0.25 });
  },
  /** Teams were made or reshuffled: a riffle of cards. */
  shuffle() {
    const t = now();
    for (let i = 0; i < 14; i++)
      noise({ dur: 0.04, vol: 0.18, freq: 2500 + Math.random() * 2500, at: t + i * 0.035 + Math.random() * 0.01 });
  },
  /** The standings go up: a drumroll, then a fanfare. */
  scoreboard() {
    const t = now();
    for (let i = 0; i < 40; i++) noise({ dur: 0.05, vol: 0.05 + (i / 40) * 0.2, freq: 1800, at: t + i * 0.035 });
    const hit = t + 1.45;
    tone({ freq: 120, to: 45, type: "sine", dur: 0.4, vol: 0.5, at: hit });
    noise({ dur: 0.6, vol: 0.2, freq: 6000, filter: "highpass", at: hit });
    for (const [i, n] of [67, 72, 76, 79].entries()) {
      tone({ freq: hz(n), type: "sawtooth", dur: 1.1, vol: 0.06, at: hit + i * 0.02 });
      tone({ freq: hz(n), type: "triangle", dur: 1.3, vol: 0.12, at: hit + i * 0.02 });
    }
  },
};

export type SfxName = keyof typeof sfx;

// ---- Music ----------------------------------------------------------------

export type Music = "lobby" | "think";

type Song = { bpm: number; step: (s: number, t: number, len: number) => void };

const kick = (t: number, vol = 0.5) => tone({ freq: 140, to: 40, type: "sine", dur: 0.22, vol, at: t, bus: musicBus });
const hat = (t: number, vol = 0.05) => noise({ dur: 0.04, vol, freq: 8000, filter: "highpass", at: t, bus: musicBus });
const snare = (t: number, vol = 0.12) => noise({ dur: 0.14, vol, freq: 1800, at: t, bus: musicBus });

// Four bars of 16 steps each. Chords are MIDI notes; roots are the bass.
const SONGS: Record<Music, Song> = {
  // Bouncy and easygoing for people walking in: C, Am, F, G.
  lobby: {
    bpm: 112,
    step(s, t, len) {
      const bar = (s >> 4) % 4;
      const pos = s & 15;
      const chord = [
        [60, 64, 67],
        [57, 60, 64],
        [53, 57, 60],
        [55, 59, 62],
      ][bar];
      const root = [36, 33, 29, 31][bar];
      if (pos === 0 || pos === 8) kick(t, 0.4);
      if (pos === 4 || pos === 12) snare(t, 0.07);
      if (pos % 2 === 0) hat(t, pos % 4 === 2 ? 0.05 : 0.025);
      if ([0, 3, 6, 8, 11, 14].includes(pos)) {
        tone({ freq: hz(root + (pos === 6 || pos === 14 ? 12 : 0)), type: "triangle", dur: len * 1.8, vol: 0.3, at: t, bus: musicBus });
      }
      if (pos === 2 || pos === 10) {
        for (const n of chord) tone({ freq: hz(n), type: "square", dur: len * 1.2, vol: 0.025, at: t, bus: musicBus });
      }
      if (pos % 2 === 0) {
        const n = chord[[0, 1, 2, 1][(pos / 2) % 4]] + 12;
        tone({ freq: hz(n), type: "triangle", dur: len * 1.5, vol: 0.07, at: t, bus: musicBus });
      }
    },
  },
  // Driving and a little tense while the clock runs: Am, F, C, G.
  think: {
    bpm: 138,
    step(s, t, len) {
      const bar = (s >> 4) % 4;
      const pos = s & 15;
      const chord = [
        [57, 60, 64],
        [53, 57, 60],
        [55, 60, 64],
        [55, 59, 62],
      ][bar];
      const root = [33, 29, 36, 31][bar];
      if (pos % 4 === 0) kick(t, 0.45);
      if (pos === 4 || pos === 12) snare(t, 0.1);
      hat(t, pos % 2 ? 0.02 : 0.045);
      if (pos % 2 === 0) {
        tone({ freq: hz(root + (pos % 4 === 2 ? 12 : 0)), type: "sawtooth", dur: len * 1.6, vol: 0.06, at: t, bus: musicBus });
        tone({ freq: hz(root), type: "sine", dur: len * 1.8, vol: 0.25, at: t, bus: musicBus });
      }
      const n = chord[[0, 1, 2, 1][pos % 4]] + 12;
      tone({ freq: hz(n), type: "square", dur: len * 0.8, vol: 0.022, at: t, bus: musicBus });
    },
  },
};

let playing: Music | null = null;
let seq: ReturnType<typeof setInterval> | undefined;
let track: HTMLAudioElement | undefined;
const hasFile: Partial<Record<Music, boolean>> = {};

function stopMusic() {
  clearInterval(seq);
  seq = undefined;
  track?.pause();
  track = undefined;
}

/** Synthesized loop, scheduled slightly ahead so it stays in time. */
function playSynth(song: Song) {
  const a = audio();
  const len = 60 / song.bpm / 4;
  let s = 0;
  let next = a.currentTime + 0.1;
  seq = setInterval(() => {
    while (next < a.currentTime + 0.15) {
      song.step(s++, next, len);
      next += len;
    }
  }, 25);
}

/** Switch the background music, or stop it with `null`. A file in public/audio wins over the built-in loop. */
export function playMusic(kind: Music | null) {
  if (kind === playing || (kind && !running())) return;
  playing = kind;
  stopMusic();
  if (!kind) return;
  if (hasFile[kind] === false) return playSynth(SONGS[kind]);
  const a = audio();
  const el = new Audio(`/audio/${kind}.mp3`);
  el.loop = true;
  a.createMediaElementSource(el).connect(musicBus);
  track = el;
  el.play().then(
    () => (hasFile[kind] = true),
    () => {
      hasFile[kind] = false;
      if (playing === kind && track === el) {
        track = undefined;
        playSynth(SONGS[kind]);
      }
    },
  );
}
