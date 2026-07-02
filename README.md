# Ello — "Meet the Word"

**Live demo:** https://server-production-af57.up.railway.app/

A vocabulary stall-recovery activity built as an Ello demo. When a child reading aloud stalls on an unknown word ("owl"), Ello steps in with a ~50-second detour — hear it, play a short game, say it into the mic — then hands the child back to the exact sentence, word highlighted, ready to re-read. The story stays the main event; this is a recovery loop, not a lesson.

Implemented as a production app: Vite SPA + Express server, deployed on Railway, source on GitHub.

## Try it

Open the live link above on desktop or a tablet (Chrome/Edge recommended for the live mic — see [Browser support](#browser-support)), or walk through it without needing a working mic at all:

1. **Welcome** — tap "Let's read! →".
2. **Reading** — read the three paragraphs aloud. Tap **owl** to trigger the stall.
3. **Word card** — Ello introduces the word with a hoot sound; tap the speaker to replay.
4. **Game** — Ello deliberately picks wrong first ("Silly me!"), then hands the turn over. Tap the owl tile.
5. **Say it** — the mic listens for 5s. On desktop, the panel on the right has demo buttons ("Says 'owl' ✓" / "Says something else" / "Stays silent") that simulate outcomes without live audio — useful for reviewing this without a mic. On mobile, the same controls live behind the ⓘ toggle in the top-right corner.
6. **Return** — same screen, "owl" now marked as known, star counter pops.

Use **↺ Restart journey** in the panel (or behind the ⓘ toggle on mobile) to reset and run through it again.

## Product decisions worth flagging

A few judgment calls made while building this out, beyond porting the design spec:

- **Never fake success.** If the child hits the 2-attempt retry limit without saying "owl," the app does *not* play the same success beat. It exits with different copy ("Owl is a tricky word — that's okay! We'll practice it again soon."), no star, and an amber "still learning" highlight instead of teal — so the word stays honestly earnable next time, and Ello never tells a child they got it right when they didn't.
- **The voice stack is a tiered upgrade path, not one fixed choice.** `webspeech` (free, zero-config) is the default and the reliability floor; `elevenlabs` swaps in a warmer TTS voice via a server-side proxy (key never touches the client); `azure` swaps in real phoneme-level Pronunciation Assessment for say-it scoring. Switching is one env var, no rebuild — meant to show both "what ships today" and "what we'd upgrade to in production" in the same codebase.
- **iOS gets a designed fallback, not a silent failure.** Every iOS browser (including "Chrome" on iPhone) runs on Apple's WebKit engine, which doesn't reliably deliver live speech-to-text — it shows the mic permission prompt and then often just never produces a transcript. Rather than let a child sit through a dead mic, the app detects this upfront and clearly labels the say-it attempt as simulated, while keeping the same 5-second pacing as everywhere else so it doesn't feel broken or inconsistent.
- **Welcome screen adds continuity.** added as the entry point so the activity reads as an ongoing relationship ("Welcome back, Brian!") rather than a cold-start demo.

## Architecture

```
/client   Vite + vanilla TypeScript SPA — the whole "Meet the Word" state machine
/server   Express — static hosting for client/dist, /api/tts, /api/azure-token, /healthz
```

One process, one origin: the server serves the built SPA and the two speech-proxy endpoints on the same port, so there's no CORS and mic access works cleanly over the single HTTPS domain Railway provides.

## Running it locally

```bash
npm install
npm run dev
```

- Client (Vite dev server, hot reload): http://localhost:5173
- Server (API): http://localhost:8080 — the Vite dev server proxies `/api/*` and `/healthz` to it.

Production build (what Railway runs): `npm run build && npm start`, then open `http://localhost:8080`.

## Browser support

Speech recognition (`webkitSpeechRecognition`) works reliably in Chrome, Edge, and Android WebView. On iOS or any other unsupported browser, the app shows a fallback pill — **"I said 'owl' out loud!"** — that counts as success, so the flow never blocks a child who can't use the mic.

## Further docs

- [docs/design-handoff.md](./docs/design-handoff.md) — the original design handoff spec this was built from.
- [docs/deployment.md](./docs/deployment.md) — env vars, how to obtain each credential, and Railway/GitHub setup, for standing up your own copy.

## Known limitations

- `SpeechSynthesisUtterance.onend` is unreliable in some browsers — every TTS call races a length-based timeout so the flow never stalls.
- Retry limit on "say it" is 2 attempts — the gate is attempt, not perfection; a child is never blocked here.
