# Ello — "Meet the Word"

A live, hosted vocabulary stall-recovery activity. When a child reading aloud stalls on an unknown word ("owl"), Ello steps in with a ~50-second detour — hear it, one game turn, say it into the mic — then returns the child to the exact sentence, word highlighted, ready to re-read.

Built from the [design handoff spec](./docs/design-handoff.md) as a production SPA (Vite + vanilla TS) served by a small Express server, deployable to Railway.

## Run it

```bash
npm install
npm run dev
```

- Client (Vite dev server, hot reload): http://localhost:5173
- Server (API + would-be static host): http://localhost:8080 — the Vite dev server proxies `/api/*` and `/healthz` to it.

Open http://localhost:5173, read the story aloud, tap **owl**, and complete the flow with your microphone (Chrome/Edge recommended — see [Browser support](#browser-support)).

### Production build (what Railway runs)

```bash
npm run build   # builds client/dist
npm start       # server serves client/dist + API on $PORT
```

Then open http://localhost:8080 (or `$PORT`).

## Project layout

```
/client   Vite + vanilla TypeScript SPA (the whole "Meet the Word" experience)
/server   Express: static hosting for client/dist, /api/tts, /api/azure-token, /healthz
```

## Env vars

The app boots with **none of these set** — it defaults to `webspeech`, which needs zero configuration.

| Var                    | Required for       | What it does                                            | Where to get it |
|-------------------------|---------------------|----------------------------------------------------------|------------------|
| `VOICE_ADAPTER`         | optional            | `webspeech` (default) \| `elevenlabs` \| `azure` — selects which speech stack the client uses. Read server-side and exposed to the client via `GET /api/config`, so switching doesn't require a rebuild. | n/a — you choose the value |
| `ELEVENLABS_API_KEY`    | `VOICE_ADAPTER=elevenlabs` | Server-side key used to proxy `POST /api/tts`. Never sent to the client. | ElevenLabs dashboard → Profile → API Keys |
| `ELEVENLABS_VOICE_ID`   | `VOICE_ADAPTER=elevenlabs` | Which ElevenLabs voice to use for Ello. | ElevenLabs → Voice Library → pick a voice → copy Voice ID |
| `AZURE_SPEECH_KEY`      | `VOICE_ADAPTER=azure` | Server-side key used to mint short-lived tokens via `GET /api/azure-token`. | Azure Portal → your Speech resource → Keys and Endpoint |
| `AZURE_SPEECH_REGION`   | `VOICE_ADAPTER=azure` | Azure region of the Speech resource (e.g. `eastus`). | Same Speech resource page |
| `PORT`                  | no                  | Set automatically by Railway. Only override for local testing. | n/a |

See [`.env.example`](./.env.example).

## How to get each credential (step by step)

You only need to do this for the adapter(s) you actually want to demo. `webspeech` needs nothing.

### ElevenLabs (TTS upgrade — nicer Ello voice)
1. Go to https://elevenlabs.io and sign up / log in.
2. Click your profile icon (top right) → **API Keys**.
3. Click **Create API Key**, copy it → this is `ELEVENLABS_API_KEY`.
4. Go to **Voice Library** in the left nav, pick a warm/friendly voice (or use one of the default voices like "Rachel"), open it, and copy its **Voice ID** from the voice's detail panel or via the API → this is `ELEVENLABS_VOICE_ID`.
5. Free tier includes a monthly character quota — enough for this demo's ~12 fixed lines (they're cached server-side after first generation).

### Azure Speech (Pronunciation Assessment — production say-it scoring)
1. Go to https://portal.azure.com (free tier available, needs a credit card on file but the Speech free tier (F0) doesn't charge for hackathon-scale usage).
2. Click **Create a resource** → search **"Speech"** → select **Speech** (by Microsoft) → **Create**.
3. Fill in: Subscription (your account), Resource group (create new, e.g. `ello-vocab`), Region (pick one close to you, e.g. `East US`), Name (e.g. `ello-vocab-speech`), Pricing tier (**Free F0** for a demo).
4. Click **Review + create** → **Create**. Wait for deployment to finish (~1 min).
5. Go to the resource → left nav **Keys and Endpoint**.
6. Copy **KEY 1** → this is `AZURE_SPEECH_KEY`.
7. Copy the **Location/Region** value shown there (e.g. `eastus`) → this is `AZURE_SPEECH_REGION`.

### Railway (hosting)
1. Go to https://railway.app and sign up / log in (GitHub login is easiest since this repo is on GitHub).
2. **New Project** → **Deploy from GitHub repo** → pick this repo → authorize Railway's GitHub App if prompted.
3. Railway auto-detects Node via Nixpacks and reads [`railway.json`](./railway.json) for the build/start commands — no Dockerfile needed.
4. Once the first deploy finishes, go to **Settings → Networking → Generate Domain** to get a public HTTPS URL. **HTTPS is required for microphone access** — Railway provides it automatically; never demo over plain `http`.
5. Go to **Variables** and add any of the env vars above you want (or leave unset to stay on `webspeech`).
6. Every `git push` to the connected branch triggers a redeploy.

### GitHub (source hosting, if you don't already have the repo pushed)
1. Go to https://github.com/new, create a repo (or use an existing one).
2. From this project directory: `git remote add origin <your-repo-url>` (skip if already set), then `git push -u origin main`.
3. Connect that repo to Railway as above.

## Browser support

Speech recognition (`webkitSpeechRecognition`) works in Chrome, Edge, and Android WebView. On unsupported browsers (e.g. Safari/iOS), the app automatically shows a fallback pill — **"I said 'owl' out loud!"** — that counts as success, so the flow never blocks a child who can't use the mic.

## Demo script (for the Loom)

1. **Reading** — read the three paragraphs aloud as the child. Point out the subtle highlight under "owl" and the coach mark ("If a word looks tricky, tap it!").
2. **Stall → tap "owl"** — the word card zooms in with a hoot sound and Ello's intro line. Tap the speaker icon to replay.
3. **Game** — Ello "goes first" and picks the dog on purpose (wrong on purpose, self-deprecating). Tap the wrong tiles (dog, butterfly) to show the gentle retry copy, then tap the owl tile for the success chime + bounce + glow.
4. **Say it** — the mic auto-starts listening. Say "owl" aloud for the celebration bounce-in. To demo without relying on live audio, use the **interviewer panel's demo controls** (desktop) or the floating ⓘ toggle (mobile): "Says 'owl' ✓", "Says something else", "Stays silent" — these inject outcomes into whichever mic listen is in flight.
5. **Return** — same reading screen, "owl" now shown in its "known" color, star counter pops 0→1, Ello prompts a re-read.
6. Use **↺ Restart journey** to reset and go again.

## Known limitations / pitfalls carried from the design reference

- `SpeechSynthesisUtterance.onend` is unreliable in some browsers — every TTS call races a length-based timeout so the flow never stalls.
- Speech recognition permission denial (`not-allowed`) flips to the mic-blocked fallback rather than retrying silently.
- Retry limit on "say it" is 2 attempts — the gate is attempt, not perfection; a child is never blocked here.
