// Calm sounds made in the browser with the Web Audio API, so the library needs no audio files.
// Wellness content points at them with media_url "builtin:<name>" (see lib/meditations.ts too).

export const SOUNDS = {
  rain: "Rain",
  ocean: "Ocean waves",
  wind: "Night wind",
  fireplace: "Crackling fireplace",
  "brown-noise": "Soft brown noise",
} as const;
export type SoundName = keyof typeof SOUNDS;

const BUILTIN = "builtin:";

/** "builtin:rain" -> "rain"; anything else (a real audio link) -> null. */
export function builtinName(url: string | null | undefined): string | null {
  return url?.startsWith(BUILTIN) ? url.slice(BUILTIN.length) : null;
}

export const builtinUrl = (name: string) => `${BUILTIN}${name}`;
export const isSound = (name: string): name is SoundName => name in SOUNDS;

let shared: AudioContext | null = null;

/** One context for the whole app. Call it from a click first: browsers block audio that starts on its own. */
export function audioContext(): AudioContext {
  shared ??= new AudioContext();
  if (shared.state === "suspended") void shared.resume();
  return shared;
}

// ---- building blocks ----

type Color = "white" | "pink" | "brown";
const buffers = new Map<string, AudioBuffer>();

/** A few seconds of stereo noise that loops without a click. */
function noise(ctx: AudioContext, color: Color, seconds = 8): AudioBuffer {
  const key = `${color}-${seconds}`;
  const cached = buffers.get(key);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      if (color === "white") {
        d[i] = w * 0.5;
      } else if (color === "pink") {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // brown noise wanders; pull the end back to the start so the loop point is seamless
    const drift = (d[length - 1] - d[0]) / (length - 1);
    for (let i = 0; i < length; i++) d[i] -= drift * i;
  }
  buffers.set(key, buffer);
  return buffer;
}

/** Short random taps (rain drops, fire crackles): `perSecond` of them, each fading over `decayMs`. */
function taps(ctx: AudioContext, perSecond: number, decayMs: number, seconds = 9): AudioBuffer {
  const key = `taps-${perSecond}-${decayMs}-${seconds}`;
  const cached = buffers.get(key);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const decay = (decayMs / 1000) * ctx.sampleRate;
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    for (let n = 0; n < perSecond * seconds; n++) {
      const start = Math.floor(Math.random() * length);
      const amp = Math.random() ** 2.5; // mostly soft, a few loud
      for (let j = 0; j < decay * 6; j++) d[(start + j) % length] += amp * (Math.random() * 2 - 1) * Math.exp(-j / decay);
    }
  }
  buffers.set(key, buffer);
  return buffer;
}

function loop(ctx: AudioContext, buffer: AudioBuffer) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

function gain(ctx: AudioContext, value: number) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** A slow wobble of `depth` around the param's own value, `rate` times per second. */
function lfo(ctx: AudioContext, rate: number, depth: number, target: AudioParam) {
  const osc = ctx.createOscillator();
  osc.frequency.value = rate;
  osc.connect(gain(ctx, depth)).connect(target);
  return osc;
}

type Source = AudioScheduledSourceNode;

// ---- the sounds ----

const BUILD: Record<SoundName, (ctx: AudioContext, out: AudioNode) => Source[]> = {
  rain(ctx, out) {
    const bed = loop(ctx, noise(ctx, "pink"));
    bed.connect(filter(ctx, "highpass", 500)).connect(filter(ctx, "lowpass", 6000)).connect(gain(ctx, 0.55)).connect(out);
    const drops = loop(ctx, taps(ctx, 70, 2));
    drops.connect(filter(ctx, "bandpass", 3200, 0.8)).connect(gain(ctx, 0.9)).connect(out);
    const rumble = loop(ctx, noise(ctx, "brown"));
    rumble.connect(filter(ctx, "lowpass", 300)).connect(gain(ctx, 0.35)).connect(out);
    return [bed, drops, rumble];
  },

  ocean(ctx, out) {
    const surf = loop(ctx, noise(ctx, "brown"));
    const tone = filter(ctx, "lowpass", 700);
    const swell = gain(ctx, 0.5);
    surf.connect(tone).connect(swell).connect(out);
    const foam = loop(ctx, noise(ctx, "pink"));
    const foamLevel = gain(ctx, 0.07);
    foam.connect(filter(ctx, "highpass", 1500)).connect(foamLevel).connect(out);
    // two slow waves at different speeds, so no two waves sound the same
    return [surf, foam,
      lfo(ctx, 0.08, 0.35, swell.gain), lfo(ctx, 0.13, 0.15, swell.gain),
      lfo(ctx, 0.08, 350, tone.frequency), lfo(ctx, 0.08, 0.07, foamLevel.gain)];
  },

  wind(ctx, out) {
    const air = loop(ctx, noise(ctx, "pink"));
    const band = filter(ctx, "bandpass", 450, 0.9);
    const level = gain(ctx, 0.9);
    air.connect(band).connect(level).connect(out);
    const low = loop(ctx, noise(ctx, "brown"));
    low.connect(filter(ctx, "lowpass", 200)).connect(gain(ctx, 0.4)).connect(out);
    return [air, low,
      lfo(ctx, 0.05, 250, band.frequency), lfo(ctx, 0.09, 120, band.frequency), lfo(ctx, 0.07, 0.4, level.gain)];
  },

  fireplace(ctx, out) {
    const roar = loop(ctx, noise(ctx, "brown"));
    const roarLevel = gain(ctx, 0.55);
    roar.connect(filter(ctx, "lowpass", 400)).connect(roarLevel).connect(out);
    const crackle = loop(ctx, taps(ctx, 8, 1));
    crackle.connect(filter(ctx, "highpass", 1200)).connect(gain(ctx, 1)).connect(out);
    const pops = loop(ctx, taps(ctx, 1.5, 6));
    pops.connect(filter(ctx, "bandpass", 700, 1)).connect(gain(ctx, 0.9)).connect(out);
    return [roar, crackle, pops, lfo(ctx, 0.3, 0.12, roarLevel.gain)];
  },

  "brown-noise"(ctx, out) {
    const hum = loop(ctx, noise(ctx, "brown"));
    hum.connect(filter(ctx, "lowpass", 1200)).connect(gain(ctx, 0.8)).connect(out);
    return [hum];
  },
};

export type SoundHandle = { setVolume: (volume: number) => void; stop: (fadeSeconds?: number) => void };

/** Starts a sound with a gentle 2-second fade in. */
export function startSound(name: SoundName, volume = 0.5): SoundHandle {
  const ctx = audioContext();
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2);
  master.connect(ctx.destination);
  const sources = BUILD[name](ctx, master);
  sources.forEach((s) => s.start());
  let stopped = false;
  return {
    setVolume: (v) => { if (!stopped) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1); },
    stop: (fade = 1.5) => {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + fade);
      sources.forEach((s) => s.stop(t + fade + 0.1));
      setTimeout(() => master.disconnect(), (fade + 0.5) * 1000);
    },
  };
}

/** A soft bell: start and end of a meditation, and breathing cues. */
export function chime(frequency = 528, seconds = 3, volume = 0.25) {
  const ctx = audioContext();
  const t = ctx.currentTime;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  env.connect(ctx.destination);
  // a bell is a few inharmonic partials that fade together
  for (const [ratio, level] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency * ratio;
    osc.connect(gain(ctx, level)).connect(env);
    osc.start(t);
    osc.stop(t + seconds);
  }
}
