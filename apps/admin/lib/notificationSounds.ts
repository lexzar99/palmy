export const SOUND_OPTIONS = [
  { id: "signal-1", label: "Signal 1" },
  { id: "signal-2", label: "Signal 2" },
  { id: "signal-3", label: "Signal 3" },
  { id: "signal-4", label: "Signal 4" },
  { id: "signal-5", label: "Signal 5" },
  { id: "signal-6", label: "Signal 6" },
  { id: "signal-7", label: "Signal 7" },
  { id: "signal-8", label: "Signal 8" },
  { id: "signal-9", label: "Signal 9" },
  { id: "signal-10", label: "Signal 10" },
] as const;

export type NotificationSoundId = (typeof SOUND_OPTIONS)[number]["id"];

let sharedAudioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === "undefined") return null;

  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return null;

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextCtor();
  }

  return sharedAudioContext;
};

const sequenceMap: Record<NotificationSoundId, Array<{ freq: number; delay: number; duration: number; volume: number; type?: OscillatorType }>> = {
  "signal-1": [
    { freq: 880, delay: 0, duration: 0.9, volume: 0.12 },
    { freq: 1174, delay: 0.08, duration: 0.8, volume: 0.08 },
    { freq: 1318, delay: 0.16, duration: 0.7, volume: 0.06 },
  ],
  "signal-2": [
    { freq: 659, delay: 0, duration: 0.3, volume: 0.12, type: "triangle" },
    { freq: 784, delay: 0.14, duration: 0.3, volume: 0.12, type: "triangle" },
    { freq: 988, delay: 0.28, duration: 0.5, volume: 0.1, type: "triangle" },
  ],
  "signal-3": [
    { freq: 523, delay: 0, duration: 0.25, volume: 0.1 },
    { freq: 659, delay: 0.12, duration: 0.25, volume: 0.1 },
    { freq: 784, delay: 0.24, duration: 0.5, volume: 0.12 },
  ],
  "signal-4": [
    { freq: 932, delay: 0, duration: 0.18, volume: 0.08, type: "square" },
    { freq: 932, delay: 0.22, duration: 0.18, volume: 0.08, type: "square" },
    { freq: 1244, delay: 0.45, duration: 0.55, volume: 0.08, type: "square" },
  ],
  "signal-5": [
    { freq: 440, delay: 0, duration: 0.2, volume: 0.11 },
    { freq: 660, delay: 0.1, duration: 0.2, volume: 0.1 },
    { freq: 880, delay: 0.2, duration: 0.2, volume: 0.1 },
    { freq: 1320, delay: 0.3, duration: 0.7, volume: 0.12 },
  ],
  "signal-6": [
    { freq: 740, delay: 0, duration: 0.4, volume: 0.1, type: "sawtooth" },
    { freq: 554, delay: 0.16, duration: 0.4, volume: 0.08, type: "sawtooth" },
    { freq: 932, delay: 0.32, duration: 0.65, volume: 0.1, type: "sawtooth" },
  ],
  "signal-7": [
    { freq: 1046, delay: 0, duration: 0.22, volume: 0.1 },
    { freq: 880, delay: 0.12, duration: 0.22, volume: 0.1 },
    { freq: 698, delay: 0.24, duration: 0.6, volume: 0.12 },
  ],
  "signal-8": [
    { freq: 587, delay: 0, duration: 0.2, volume: 0.1, type: "triangle" },
    { freq: 740, delay: 0.08, duration: 0.2, volume: 0.1, type: "triangle" },
    { freq: 932, delay: 0.16, duration: 0.2, volume: 0.1, type: "triangle" },
    { freq: 1174, delay: 0.24, duration: 0.7, volume: 0.1, type: "triangle" },
  ],
  "signal-9": [
    { freq: 784, delay: 0, duration: 0.12, volume: 0.08, type: "square" },
    { freq: 932, delay: 0.14, duration: 0.12, volume: 0.08, type: "square" },
    { freq: 1108, delay: 0.28, duration: 0.12, volume: 0.08, type: "square" },
    { freq: 1396, delay: 0.42, duration: 0.6, volume: 0.08, type: "square" },
  ],
  "signal-10": [
    { freq: 494, delay: 0, duration: 0.4, volume: 0.09 },
    { freq: 659, delay: 0.1, duration: 0.45, volume: 0.09 },
    { freq: 988, delay: 0.2, duration: 0.8, volume: 0.1 },
  ],
};

export async function playNotificationSound(soundId: string) {
  if (typeof window === "undefined") return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const now = ctx.currentTime + 0.01;
    const sequence = sequenceMap[(soundId as NotificationSoundId) || "signal-1"] || sequenceMap["signal-1"];

    sequence.forEach((tone) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      /* eslint-disable @typescript-eslint/no-explicit-any */
      osc.type = tone.type || "sine" as any;
      osc.frequency.setValueAtTime(tone.freq, now + tone.delay);
      gain.gain.setValueAtTime(0.0001, now + tone.delay);
      gain.gain.linearRampToValueAtTime(tone.volume, now + tone.delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.delay + tone.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + tone.delay);
      osc.stop(now + tone.delay + tone.duration);
    });
  } catch (error) {
    console.warn("Could not play notification sound", error);
  }
}

export async function primeNotificationAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}
