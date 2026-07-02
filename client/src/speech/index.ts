import type { SpeechAdapter } from './types';
import { createWebSpeechAdapter } from './webspeech';
import { createElevenLabsAdapter } from './elevenlabs';
import { createAzureAdapter } from './azure';

export type VoiceAdapterName = 'webspeech' | 'elevenlabs' | 'azure';

async function fetchVoiceAdapterName(): Promise<VoiceAdapterName> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return 'webspeech';
    const data = await res.json();
    if (data.voiceAdapter === 'elevenlabs' || data.voiceAdapter === 'azure') return data.voiceAdapter;
    return 'webspeech';
  } catch {
    return 'webspeech';
  }
}

export async function createSpeechAdapter(onMicBlocked: () => void): Promise<SpeechAdapter> {
  const name = await fetchVoiceAdapterName();
  if (name === 'elevenlabs') return createElevenLabsAdapter(onMicBlocked);
  if (name === 'azure') return createAzureAdapter(onMicBlocked);
  return createWebSpeechAdapter(onMicBlocked);
}

export type { SpeechAdapter, ListenResult } from './types';
