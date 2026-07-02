import type { SpeechAdapter, ListenResult } from './types';
import { webSpeechListen, fallbackDelayMs } from './shared';

// TTS is upgraded to ElevenLabs via the server proxy (key never touches the
// client). STT stays Web Speech per the design spec.

// A single persistent <audio> element, reused across every speak() call.
// Mobile browsers' autoplay policy only allows programmatic play() when
// tied to a recent user gesture; the fetch() below breaks that chain, so a
// freshly-created Audio() per call gets silently blocked. Priming *this*
// element inside a real click/tap once keeps it "unlocked" for the rest of
// the session, since later play() calls target the same already-gestured
// element rather than a brand-new one.
let sharedAudioEl: HTMLAudioElement | null = null;
let unlockAttached = false;

function getSharedAudioEl(): HTMLAudioElement {
  if (!sharedAudioEl) {
    sharedAudioEl = new Audio();
    sharedAudioEl.setAttribute('playsinline', 'true');
  }
  return sharedAudioEl;
}

function attachAutoplayUnlock(): void {
  if (unlockAttached) return;
  unlockAttached = true;
  const unlock = () => {
    const el = getSharedAudioEl();
    el.muted = true;
    el.play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      })
      .catch(() => {
        el.muted = false;
      });
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('click', unlock, { once: true });
}

export function createElevenLabsAdapter(onMicBlocked: () => void): SpeechAdapter {
  attachAutoplayUnlock();

  async function speak(text: string): Promise<void> {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`tts failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = getSharedAudioEl();
      const prevUrl = el.src;
      el.src = url;
      await new Promise<void>((resolve) => {
        let done = false;
        const fin = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        el.onended = fin;
        el.onerror = fin;
        // Safety timeout in case audio events never fire.
        setTimeout(fin, fallbackDelayMs(text));
        el.play().catch(fin);
      });
      if (prevUrl && prevUrl.startsWith('blob:')) URL.revokeObjectURL(prevUrl);
    } catch {
      // Fall back to a wait matching normal speech pacing so the flow
      // doesn't stall (or rush past) if the proxy/API key is misconfigured
      // or autoplay was blocked.
      await new Promise((r) => setTimeout(r, fallbackDelayMs(text)));
    }
  }

  return {
    speak,
    listenFor(word: string, ms: number): Promise<ListenResult> {
      return webSpeechListen(word, ms, onMicBlocked);
    },
  };
}
