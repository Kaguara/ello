let ctx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Two descending sine sweeps 520→340Hz, played back to back. */
export function hoot(): void {
  try {
    const ac = getContext();
    [0, 0.45].forEach((off) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      const t = ac.currentTime + off;
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(340, t + 0.28);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {
    /* noop */
  }
}

/** Triad success chime: 523/659/784Hz. */
export function chime(): void {
  try {
    const ac = getContext();
    [523, 659, 784].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      const t = ac.currentTime + i * 0.09;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {
    /* noop */
  }
}
