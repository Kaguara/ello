import type { SpeechAdapter, ListenResult } from './types';
import { webSpeechSpeak, webSpeechListen } from './shared';

export function createWebSpeechAdapter(onMicBlocked: () => void): SpeechAdapter {
  return {
    speak: webSpeechSpeak,
    listenFor(word: string, ms: number): Promise<ListenResult> {
      return webSpeechListen(word, ms, onMicBlocked);
    },
  };
}
