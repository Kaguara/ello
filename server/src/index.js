import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');

const PORT = process.env.PORT || 8080;
const VOICE_ADAPTER = (process.env.VOICE_ADAPTER || 'webspeech').toLowerCase();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '';
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || '';
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || '';

const app = express();
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, voiceAdapter: VOICE_ADAPTER });
});

// Tells the client which adapter to use without needing a rebuild.
app.get('/api/config', (_req, res) => {
  res.json({ voiceAdapter: VOICE_ADAPTER });
});

// --- ElevenLabs TTS proxy ---------------------------------------------
// Never expose ELEVENLABS_API_KEY to the client. Cache generated clips in
// memory keyed by text since the script is fixed (~12 lines total).
const ttsCache = new Map();

app.post('/api/tts', async (req, res) => {
  if (VOICE_ADAPTER !== 'elevenlabs') {
    return res.status(400).json({ error: 'VOICE_ADAPTER is not set to elevenlabs' });
  }
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not configured' });
  }
  const text = (req.body && req.body.text) || '';
  if (!text.trim()) return res.status(400).json({ error: 'text is required' });

  if (ttsCache.has(text)) {
    const cached = ttsCache.get(text);
    res.set('Content-Type', 'audio/mpeg');
    return res.send(cached);
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
        }),
      }
    );

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: 'ElevenLabs request failed', detail });
    }

    const audioBuffer = Buffer.from(await upstream.arrayBuffer());
    ttsCache.set(text, audioBuffer);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (err) {
    res.status(502).json({ error: 'ElevenLabs proxy error', detail: String(err) });
  }
});

// --- Azure Speech token mint -------------------------------------------
// Short-lived (10 min) token; client uses Azure Speech SDK Pronunciation
// Assessment against reference text "owl" with this token + region.
app.get('/api/azure-token', async (_req, res) => {
  if (VOICE_ADAPTER !== 'azure') {
    return res.status(400).json({ error: 'VOICE_ADAPTER is not set to azure' });
  }
  if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
    return res.status(500).json({ error: 'AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not configured' });
  }
  try {
    const upstream = await fetch(
      `https://${AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY } }
    );
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: 'Azure token mint failed', detail });
    }
    const token = await upstream.text();
    res.json({ token, region: AZURE_SPEECH_REGION });
  } catch (err) {
    res.status(502).json({ error: 'Azure token proxy error', detail: String(err) });
  }
});

// --- Static client -------------------------------------------------------
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(200).send('Client build not found. Run "npm run build" first.');
  });
}

app.listen(PORT, () => {
  console.log(`Ello Vocab server listening on :${PORT} (VOICE_ADAPTER=${VOICE_ADAPTER})`);
});
