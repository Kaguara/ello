# Deployment guide

Covers standing up your own copy of this app: environment variables, how to get each credential, and connecting Railway/GitHub. See the [main README](../README.md) for what the app is and how to try the live demo.

## Env vars

The app boots with **none of these set** — it defaults to `webspeech`, which needs zero configuration.

| Var | Required for | What it does | Where to get it |
|---|---|---|---|
| `VOICE_ADAPTER` | optional | `webspeech` (default) \| `elevenlabs` \| `azure` — selects which speech stack the client uses. Read server-side and exposed to the client via `GET /api/config`, so switching doesn't require a rebuild. | n/a — you choose the value |
| `ELEVENLABS_API_KEY` | `VOICE_ADAPTER=elevenlabs` | Server-side key used to proxy `POST /api/tts`. Never sent to the client. | ElevenLabs dashboard → Profile → API Keys |
| `ELEVENLABS_VOICE_ID` | `VOICE_ADAPTER=elevenlabs` | Which ElevenLabs voice to use for Ello. Must be a **Premade/"My Voices"** voice, not one added from the Voice Library — library voices require a paid plan to use via the API and will 402 otherwise. | ElevenLabs → Voices → "My Voices" → pick a voice → copy Voice ID |
| `AZURE_SPEECH_KEY` | `VOICE_ADAPTER=azure` | Server-side key used to mint short-lived tokens via `GET /api/azure-token`. | Azure Portal → your Speech resource → Keys and Endpoint |
| `AZURE_SPEECH_REGION` | `VOICE_ADAPTER=azure` | Azure region of the Speech resource (e.g. `eastus`). | Same Speech resource page |
| `PORT` | no | Set automatically by Railway. Only override for local testing. | n/a |

See [`.env.example`](../.env.example).

## How to get each credential

You only need to do this for the adapter(s) you actually want to run. `webspeech` needs nothing.

### ElevenLabs (TTS upgrade — nicer Ello voice)
1. Go to https://elevenlabs.io and sign up / log in.
2. Click your profile icon (top right) → **API Keys**.
3. Click **Create API Key**, copy it → this is `ELEVENLABS_API_KEY`.
4. Go to **Voices** → **My Voices** (the default voices every account starts with, e.g. Rachel, Bella, Adam) — **not** the Voice Library/Explore tab, those require a paid plan to use via the API. Open one, copy its **Voice ID** → this is `ELEVENLABS_VOICE_ID`.
5. Free tier includes a monthly character quota — enough for this app's ~12 fixed lines (they're cached server-side after first generation).

### Azure Speech (Pronunciation Assessment — production say-it scoring)
1. Go to https://portal.azure.com (free tier available; needs a credit card on file, but the Speech free tier (F0) doesn't charge at this scale).
2. Click **Create a resource** → search **"Speech"** → select **Speech** (by Microsoft) → **Create**.
3. Fill in: Subscription (your account), Resource group (create new, e.g. `ello-vocab`), Region (pick one close to you, e.g. `East US`), Name (e.g. `ello-vocab-speech`), Pricing tier (**Free F0**).
4. Click **Review + create** → **Create**. Wait for deployment to finish (~1 min).
5. Go to the resource → left nav **Keys and Endpoint**.
6. Copy **KEY 1** → this is `AZURE_SPEECH_KEY`.
7. Copy the **Location/Region** value shown there (e.g. `eastus`) → this is `AZURE_SPEECH_REGION`.

### Railway (hosting)
1. Go to https://railway.app and sign up / log in (GitHub login is easiest).
2. **New Project** → **Deploy from GitHub repo** → pick this repo → authorize Railway's GitHub App if prompted.
3. **Use one service rooted at the repo root — not two.** If Railway auto-splits the monorepo into separate `client` and `server` services (one per `package.json`), delete the `client` service and make sure the remaining service's **Settings → Source → Root Directory** is blank/`/`, not `/server`. This app is a single Express process that builds the client into `client/dist` and serves both the static SPA and the API from one process on one port — a separate client service has nothing to run and breaks the same-origin setup mic access depends on.
4. Railway auto-detects Node via Nixpacks and reads [`railway.json`](../railway.json) for the build/start commands (`npm run build` / `npm start`) — no Dockerfile needed. Don't add a redundant `npm ci` to the build command; Nixpacks already runs it in its install phase, and running it again collides with the cache-mounted `node_modules/.cache` directory (`EBUSY` on build).
5. Once the first deploy finishes, go to **Settings → Networking → Generate Domain**, port `8080`, to get a public HTTPS URL. **HTTPS is required for microphone access** — Railway provides it automatically; never demo over plain `http`.
6. Go to **Variables** and add any of the env vars above you want (or leave unset to stay on `webspeech`).
7. If deploys stop triggering on push, check **Settings → Source → Watch Paths** — an overly narrow filter there can silently skip deploys for files outside it. Clear it or broaden it to cover `client/**`, `server/**`, and the root config files.
8. Every `git push` to the connected branch triggers a redeploy.

### GitHub (source hosting, if you don't already have the repo pushed)
1. Go to https://github.com/new, create a repo (or use an existing one).
2. From this project directory: `git remote add origin <your-repo-url>` (skip if already set), then `git push -u origin main`.
3. Connect that repo to Railway as above.
