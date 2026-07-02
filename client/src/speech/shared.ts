// Shared TTS/STT helpers used by the webspeech adapter directly, and
// re-used by the elevenlabs adapter (STT stays Web Speech per the design
// spec) and the azure adapter (TTS stays Web Speech; only say-it scoring
// is upgraded).
import type { ListenResult } from './types';
import { setPendingResolver, resolvePending } from './simBus';

// Kids' speech recognition mangles words a lot — a false positive here is
// far cheaper than a false negative. Fuzzy alternates are per target word;
// unknown words fall back to a substring/soundalike check.
const FUZZY_ALTERNATES: Record<string, string[]> = {
  owl: ['owl', 'owls', 'oul', 'ol', 'aul', 'owel', 'al', 'ow', 'aow', 'hour', 'ouch'],
};

// How long to wait before giving up on a speech-engine "did it finish"
// event (onend/onended) that may never fire. Used both as the primary
// safety timeout and as the fallback delay when TTS setup fails outright,
// so pacing stays consistent regardless of which path a given utterance
// takes.
export function fallbackDelayMs(text: string): number {
  return Math.max(2500, text.length * 110);
}

export function matchWord(text: string, word: string): boolean {
  const t = (text || '').toLowerCase();
  const w = word.toLowerCase();
  if (t.includes(w)) return true;
  if (w === 'owl' && t.includes('howl')) return true;
  const alternates = FUZZY_ALTERNATES[w] || [w];
  return t.split(/[^a-z]+/).some((tok) => alternates.includes(tok));
}

let voicesReadyPromise: Promise<void> | null = null;
function ensureVoicesLoaded(): Promise<void> {
  if (voicesReadyPromise) return voicesReadyPromise;
  voicesReadyPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    if (synth.getVoices().length > 0) return resolve();
    const onChange = () => {
      synth.removeEventListener('voiceschanged', onChange);
      resolve();
    };
    synth.addEventListener('voiceschanged', onChange);
    // Safety: some browsers never fire voiceschanged.
    setTimeout(resolve, 500);
  });
  return voicesReadyPromise;
}

export async function webSpeechSpeak(text: string): Promise<void> {
  await ensureVoicesLoaded();
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return setTimeout(resolve, fallbackDelayMs(text));
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const pick =
        voices.find((v) => /Google US English|Samantha|Google UK English Female/i.test(v.name)) ||
        voices.find((v) => v.lang && v.lang.startsWith('en'));
      if (pick) u.voice = pick;
      u.pitch = 1.25;
      u.rate = 0.95;
      let done = false;
      const fin = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      u.onend = fin;
      u.onerror = fin;
      // SpeechSynthesisUtterance.onend is unreliable — race it with a timeout.
      setTimeout(fin, fallbackDelayMs(text));
      synth.speak(u);
    } catch {
      setTimeout(resolve, fallbackDelayMs(text));
    }
  });
}

export function webSpeechListen(
  word: string,
  ms: number,
  onMicBlocked: () => void
): Promise<ListenResult> {
  return new Promise((resolve) => {
    let done = false;
    let rec: any = null;
    const finish = (r: ListenResult) => {
      if (done) return;
      done = true;
      setPendingResolver(null);
      clearTimeout(timer);
      try {
        rec && rec.abort();
      } catch {
        /* noop */
      }
      resolve(r);
    };
    setPendingResolver(finish);

    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      onMicBlocked();
    } else {
      try {
        rec = new SR();
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 5;
        rec.onresult = (e: any) => {
          const text = Array.from(e.results[0])
            .map((a: any) => a.transcript)
            .join(' ');
          finish(matchWord(text, word) ? { type: 'match' } : { type: 'miss', heard: text });
        };
        rec.onerror = (e: any) => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
            onMicBlocked();
          }
        };
        rec.start();
      } catch {
        onMicBlocked();
      }
    }
    const timer = setTimeout(() => finish({ type: 'silence' }), ms);
  });
}

export { resolvePending };
