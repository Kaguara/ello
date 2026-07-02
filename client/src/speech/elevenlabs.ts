import type { SpeechAdapter, ListenResult } from './types';
import { webSpeechListen } from './shared';

// TTS is upgraded to ElevenLabs via the server proxy (key never touches the
// client). STT stays Web Speech per the design spec.
export function createElevenLabsAdapter(onMicBlocked: () => void): SpeechAdapter {
  let audioEl: HTMLAudioElement | null = null;

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
      if (audioEl) {
        audioEl.pause();
        URL.revokeObjectURL(audioEl.src);
      }
      audioEl = new Audio(url);
      await new Promise<void>((resolve) => {
        let done = false;
        const fin = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        audioEl!.onended = fin;
        audioEl!.onerror = fin;
        // Safety timeout in case audio events never fire.
        setTimeout(fin, Math.max(2500, text.length * 110));
        audioEl!.play().catch(fin);
      });
    } catch {
      // Fall back to a silent-ish wait so the flow doesn't stall if the
      // proxy/API key is misconfigured.
      await new Promise((r) => setTimeout(r, Math.max(1200, text.length * 55)));
    }
  }

  return {
    speak,
    listenFor(word: string, ms: number): Promise<ListenResult> {
      return webSpeechListen(word, ms, onMicBlocked);
    },
  };
}
