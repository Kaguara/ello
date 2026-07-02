import type { SpeechAdapter, ListenResult } from './types';
import { webSpeechSpeak } from './shared';
import { setPendingResolver } from './simBus';

// Production pronunciation scoring. TTS stays Web Speech (ElevenLabs is the
// TTS upgrade, azure is the STT/scoring upgrade); only listenFor() changes.
// Kids' speech scores low — PronScore >= 60 is treated as a match.
const MATCH_THRESHOLD = 60;

let tokenCache: { token: string; region: string; fetchedAt: number } | null = null;
const TOKEN_TTL_MS = 9 * 60 * 1000; // Azure tokens are valid ~10 min.

async function getToken(): Promise<{ token: string; region: string }> {
  if (tokenCache && Date.now() - tokenCache.fetchedAt < TOKEN_TTL_MS) return tokenCache;
  const res = await fetch('/api/azure-token');
  if (!res.ok) throw new Error(`azure-token failed: ${res.status}`);
  const data = await res.json();
  tokenCache = { token: data.token, region: data.region, fetchedAt: Date.now() };
  return tokenCache;
}

export function createAzureAdapter(onMicBlocked: () => void): SpeechAdapter {
  return {
    speak: webSpeechSpeak,
    async listenFor(word: string, ms: number): Promise<ListenResult> {
      let sdk: typeof import('microsoft-cognitiveservices-speech-sdk');
      try {
        sdk = await import('microsoft-cognitiveservices-speech-sdk');
      } catch {
        onMicBlocked();
        return { type: 'silence' };
      }

      let token: { token: string; region: string };
      try {
        token = await getToken();
      } catch {
        onMicBlocked();
        return { type: 'silence' };
      }

      return new Promise<ListenResult>((resolve) => {
        let done = false;
        let recognizer: import('microsoft-cognitiveservices-speech-sdk').SpeechRecognizer | null = null;
        // Hard safety timeout in case the SDK callback never fires.
        const hardTimer = setTimeout(() => finish({ type: 'silence' }), ms + 3000);

        const finish = (r: ListenResult) => {
          if (done) return;
          done = true;
          setPendingResolver(null);
          clearTimeout(hardTimer);
          try {
            recognizer?.close();
          } catch {
            /* noop */
          }
          resolve(r);
        };
        setPendingResolver(finish);

        try {
          const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region);
          speechConfig.speechRecognitionLanguage = 'en-US';
          speechConfig.setProperty(
            sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
            String(ms)
          );

          const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
          recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

          const pronConfig = new sdk.PronunciationAssessmentConfig(
            word,
            sdk.PronunciationAssessmentGradingSystem.HundredMark,
            sdk.PronunciationAssessmentGranularity.Phoneme,
            false
          );
          pronConfig.applyTo(recognizer);

          recognizer.recognizeOnceAsync(
            (result) => {
              if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const pron = sdk.PronunciationAssessmentResult.fromResult(result);
                const score = pron.pronunciationScore ?? 0;
                if (score >= MATCH_THRESHOLD) finish({ type: 'match' });
                else finish({ type: 'miss', heard: result.text || '' });
              } else if (result.reason === sdk.ResultReason.NoMatch) {
                finish({ type: 'silence' });
              } else {
                finish({ type: 'silence' });
              }
            },
            () => {
              onMicBlocked();
              finish({ type: 'silence' });
            }
          );
        } catch {
          onMicBlocked();
          finish({ type: 'silence' });
        }
      });
    },
  };
}
