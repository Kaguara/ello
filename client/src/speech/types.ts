export type ListenResult =
  | { type: 'match' }
  | { type: 'miss'; heard: string }
  | { type: 'silence' };

export interface SpeechAdapter {
  /** Ello's voice (TTS). Resolves once speech has finished (or safety timeout hit). */
  speak(text: string): Promise<void>;
  /** Listen for `word` for up to `ms` milliseconds. */
  listenFor(word: string, ms: number): Promise<ListenResult>;
}
