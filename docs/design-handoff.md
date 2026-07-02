# Handoff: Ello "Meet the Word" — Vocabulary Stall-Recovery Activity

## Overview

A live, hosted prototype for an Ello PM interview task. When a child reading aloud stalls on an unknown word ("owl"), Ello steps in with a ~50-second detour — hear it, one game turn, say it into the mic — then returns the child to the exact sentence, word highlighted, ready to re-read. The story is the main event; this is a recovery loop, not a lesson.

**Deployment target: a small production web app on Railway, source on GitHub.** Interviewers will open a public URL on desktop or a tablet, read the story aloud, tap "owl", and complete the flow with a real microphone.

## About the Design Files

The files in this bundle are **design references created in HTML** — a working prototype showing the intended look and behavior, not production code to copy directly. Your task is to **recreate this as a small production web app**:

- **Recommended stack:** a single-page app (plain Vite + vanilla JS/TS or React — keep it light) served by a tiny Node/Express server. The server exists for two things only: static hosting and the voice-service token/proxy endpoints described below.
- `Ello Vocab Prototype.dc.html` is the primary reference — it contains the full state machine in a `class Component` (readable JS, no framework magic). Port that logic directly.
- `ios-frame.jsx` and `support.js` are prototype-runtime scaffolding — **do not port them**. In production, render the experience full-viewport on mobile/tablet, and inside a centered phone-shaped container (max-width ~402px, rounded corners) on desktop.
- `Vocab Directions.dc.html` is an exploration board of the three design directions considered — context only, do not implement.

## Fidelity

**High-fidelity.** Colors, typography, spacing, copy, and interaction timings are final. Recreate pixel-close.

## Design Tokens

- **Teal (primary / Ello brand):** `#12A5A0`; light teal fill `#EAF7F5`; mid teal `#8FDCD9`; highlight `#BFEDE8`; success text `#0E8A85`
- **Navy (headings/body):** `#1D4E63`; story text `#33454F`; dimmed/unread story text `#B4C4CC`; secondary text `#4A6B7A`, `#5A7684`; muted labels `#8AA3AE`
- **Backgrounds:** app gradient `linear-gradient(180deg,#D9F1E7 0%,#EDF8F3 40%,#FFFFFF 100%)`; word-card overlay `#54767F` (opaque, replaces screen); white cards `#FFF`
- **Alerts:** warm chip `#FDF1E4` / text `#B06A1F`
- **Typography:** display/story font **'Baloo 2'** (500–800); UI font **'Quicksand'** (500–700). Google Fonts. Story text 23px / line-height 1.62; word-card word 46px/800; say-it word 64px/800; buttons 17–20px Baloo 800.
- **Radii:** cards 18–26px; tiles 20px outer / 14px inner; pills 999px. **Shadows:** cards `0 4px 12px rgba(29,78,99,.10)`; overlay card `0 16px 40px rgba(0,0,0,.28)`.
- **Hit targets:** every tappable element ≥44px.

## Screens / Views (one SPA, five phases)

The whole app is a single screen with a `phase` state machine: `reading → card → game → sayit → return`.

### 1. Reading (phase: `reading`)
- Top bar (66px top padding for safe area): back circle (38px, white), progress pill (white track, 22% teal fill `#8FDCD9`, teal dot knob), star counter pill (`⭐ 0`, Baloo 800 teal).
- Story text, three paragraphs (23px Baloo 2, lh 1.62, 30px side padding). Paragraph 1 is "already read" (`#B4C4CC`, weight 500); paragraphs 2–3 are current (`#33454F`, weight 600).
- **Story copy (exact):**
  - P1: `One night, Zuri could not sleep. She looked out at the big, round moon.`
  - P2: `A small owl sat in the mango tree. “Whoo! Whoo!” it sang.`
  - P3: `Zuri smiled. “You sing to the moon!” she said.`
- The word **owl** in P2 has a persistent subtle highlight: `background: rgba(18,165,160,.12)`, radius 8px, padding 0 5px.
- **Every word is tappable.** Tapping any word speaks it (TTS). Tapping **owl** starts the flow.
- Coach mark: floating white pill above Ello, `If a word looks tricky, tap it!`, gentle 2.4s float animation, auto-dismisses after 10s or on flow start.
- Bottom: Ello character footer image (calm pose), full width (asset `assets/ello_calm_footer.png`).

### 2. Word Card (phase: `card`)
- Full-screen opaque `#54767F` backdrop, fades in.
- White card (radius 26px) zooms in (scale .15 → 1.05 → 1, ~500ms, transform-only — **never animate opacity from 0 as the entrance**, see Pitfalls): real owl photo (250×170, cover, radius 18px), word `owl` 46px teal Baloo 800, speaker button (44px circle `#EAF7F5`, 🔊) that replays the word.
- On entry: play an owl "hoot" sound (two descending sine sweeps 520→340Hz — WebAudio, see reference), then Ello speaks: `Owl! An owl is a bird. It flies at night, and it says: whoo, whoo!`
- CTA pill below card: `Let’s find the owl! →` (teal bg, white Baloo 800 20px) → game.

### 3. Game (phase: `game`)
- App gradient background. Title chip: `Who is the owl?` (white pill, teal Baloo 800 23px).
- 2×2 grid (last tile centered, spanning row): **dog** photo tile, **real owl** photo tile, **butterfly** photo tile. White frames 7px padding, radius 20px, images 108px tall cover.
- **Turn-taking script (Ello goes first, wrong on purpose):**
  1. Dog tile wiggles; Ello: `My turn first! Hmm… is the owl this one?`
  2. Ello: `No! That is a dog! Silly me. Can YOU find the owl?` — taps now enabled.
- Child taps:
  - **Owl** → tile bounces + teal glow ring (4px), success chime (triad 523/659/784Hz), Ello: `Yes! Whoo, whoo! You found the owl!` → say-it.
  - **Dog** → tile shakes; Ello: `That is the dog! An owl has big, round eyes. Try again!`
  - **Butterfly** → tile shakes; Ello: `That is a butterfly! An owl is a bird with big, round eyes. Try again!`
  - Wrong picks never end the game; unlimited gentle retries.
- Bottom: Ello waving footer image (`assets/ello_wave_footer.png`).

### 4. Say It (phase: `sayit`)
- Title chip `Your turn! Say it:`; the word `owl` at 64px navy Baloo 800.
- Mic button: 88px teal circle 🎤. States: idle `#8FDCD9`; listening `#12A5A0` + pulsing ring animation; hint line below (`Listening…` / `I didn’t hear you…` / `I heard: “apple”`).
- On entry Ello says `Your turn! Say: owl!` then the mic auto-starts listening (5s window, configurable).
- **Outcomes:**
  - **Match** (fuzzy — accept `owl/owls/howl/oul/ol/aul/owel/al/ow/aow/hour/ouch`, plus any transcript containing "owl"): celebrate — cartoon owl bounces in replacing the mic, chime, Ello: `Owl! You said it! That word is yours now.` → return.
  - **Silence** (nothing in window): Ello: `I didn’t hear you. Say it with me, nice and big: OWL!` → auto re-listen.
  - **Wrong word:** show `I heard: “…”`; Ello: `Almost! Listen: owl. Now you try — say owl!` → auto re-listen.
  - **Retry limit = 2 attempts.** On the second miss, effort wins: Ello: `We found the owl together! Let’s keep reading.` → return. **The gate is attempt, not perfection — never block a child here.**
  - **Mic blocked / unsupported:** show fallback pill `I said “owl” out loud!` (white, teal border) that counts as success.

### 5. Return (phase: `return`)
- Same reading screen. P2 gets a soft `#E3F6F0` background wash; **owl** now `#BFEDE8` bg / `#0E8A85` text. Star counter increments 0→1 with a pop animation.
- Ello: `Now you know owl! Read that line again — I’m listening.`

### Ello caption bubble (all phases)
Whenever Ello speaks, show a bottom-anchored bubble: small Ello character (62px, asset `uploads/Ello_Character.png`) + white speech bubble (radius 16/16/16/4, navy 14.5px/700) containing the caption text. Non-interactive (pointer-events none). Clears when speech ends per the reference logic.

### Interviewer side panel (desktop only)
Next to the phone: title `Brian meets “owl”`, intro copy, journey tracker (5 steps, active dot teal), **demo controls** — `Says “owl” ✓` / `Says something else` / `Stays silent` chips that inject outcomes into the say-it step, `↺ Restart journey` button — and a voice-stack info card. On small screens hide this panel (or put behind an ⓘ toggle); the demo controls must still be reachable for the Loom (a small floating gear is fine).

## Voice Architecture (the important part)

Build a **pluggable adapter interface** so services swap without touching flow logic:

```ts
interface SpeechAdapter {
  speak(text: string): Promise<void>;                       // Ello's voice (TTS)
  listenFor(word: string, ms: number): Promise<
    { type: 'match' } | { type: 'miss', heard: string } | { type: 'silence' }>;
}
```

Three implementations, selected by env var `VOICE_ADAPTER`:

1. **`webspeech` (default, zero-config):** `SpeechSynthesis` for TTS (prefer a female en-US voice, pitch 1.25, rate 0.95) + `webkitSpeechRecognition` for STT with the fuzzy owl-match above. No server calls. Note: recognition works in Chrome/Edge/Android; on unsupported browsers set micBlocked and show the fallback pill.
2. **`elevenlabs` (TTS upgrade):** server endpoint `POST /api/tts` proxies ElevenLabs text-to-speech (key in `ELEVENLABS_API_KEY` env var, **never in client code**), returns audio; client plays it. Use a warm, friendly voice; cache generated clips in memory keyed by text (the script is fixed — ~12 lines total). STT stays Web Speech.
3. **`azure` (production pronunciation scoring):** server endpoint `GET /api/azure-token` mints a short-lived token (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`); client uses the Azure Speech SDK **Pronunciation Assessment** with reference text "owl", accepting `PronScore ≥ 60` as a match (kids' speech scores low — be generous). This adapter is the "here's what we'd ship" talking point; implement it but webspeech must remain the reliable default.

**Safety rails:** every TTS call needs a timeout fallback (resolve after `max(2.5s, len×110ms)` even if `onend` never fires); `speechSynthesis.getVoices()` may be empty until the `voiceschanged` event; WebAudio contexts need `resume()` after a user gesture.

## Interactions & Behavior — timings

- Screen transitions: 300–400ms ease fades (opacity from .35 not 0 — see Pitfalls); word-card zoom 500ms `cubic-bezier(.2,.8,.3,1.1)`.
- Tile wiggle: ±5° 0.5s loop while Ello "considers". Tile shake on wrong pick: ±7px, 450ms. Owl bounce-in: scale 0→1.15→1, 500–600ms.
- Star pop: scale 1→1.5→1, 800ms. Coach-mark float: ±6px, 2.4s loop.
- Listen window 5s; retry limit 2 (both configurable).

## State Management

Single state machine, exactly as in the reference logic class: `phase`, `stars`, `caption`, `showCoach`, `gameStep (intro|kid|done)`, tile animation flags, `sayStatus (idle|listening|celebrate)`, `attempts`, `micBlocked`. All async flow is sequential `await speak(...)` chains — keep that structure; it makes the turn-taking script trivially readable. The demo-control chips resolve the in-flight `listenFor` promise if one is pending.

## Assets (in `assets/` and `uploads/` of this bundle)

- `uploads/real_owl.png` — real owl photo (word card + game tile). Deliberate choice: kids should recognize a *real* owl.
- `uploads/owl.png` — cartoon owl (say-it celebration).
- `uploads/Ello_Character.png` — Ello elephant, transparent (caption bubble).
- `assets/ello_calm_footer.png` / `assets/ello_wave_footer.png` — Ello footer strips (reading / activity screens).
- `assets/tile_dog.png`, `assets/tile_butterfly.png` — game tiles.
- Sounds are synthesized in code (WebAudio hoot + chime) — no audio files needed; port the two functions from the reference.

## Deployment (Railway + GitHub)

- Repo layout: `/client` (SPA) + `/server` (Express: static serve, `/api/tts`, `/api/azure-token`, `/healthz`). One Dockerfile or Nixpacks default; `PORT` from env.
- Env vars: `VOICE_ADAPTER` (`webspeech|elevenlabs|azure`), `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`. App must boot with none set (webspeech default).
- **HTTPS is required for mic access** — Railway provides it; never demo over plain http.
- README in the repo should include: one-click run (`npm i && npm run dev`), env var table, and a "demo script" section for the Loom.

## Known Pitfalls (learned building the reference)

1. **Never gate a screen's visibility on an entrance keyframe that starts at `opacity:0`.** If rAF stalls (background tab, throttling) the screen stays invisible forever. Fade from `.35`, or animate transform only.
2. Web Speech recognition fires `onerror('not-allowed')` — catch it and flip to the mic-blocked fallback, don't retry silently.
3. `SpeechSynthesisUtterance.onend` is unreliable — always race it with a length-based timeout.
4. Kids' TTS: keep pitch ~1.25 / rate ~0.95; default voices at pitch 1 sound corporate.
5. Fuzzy matching must be generous — ASR mangles 6-year-old speech; a false positive is far cheaper than a false negative here.

## Files in this bundle

- `Ello Vocab Prototype.dc.html` — **primary reference**: full template + state machine.
- `Vocab Directions.dc.html` — the three directions explored (context only).
- `assets/`, `uploads/` — all images listed above.
