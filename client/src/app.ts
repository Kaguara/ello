import { hoot, chime } from './audio';
import { createSpeechAdapter } from './speech';
import type { SpeechAdapter, ListenResult } from './speech/types';
import { resolvePending } from './speech/simBus';

type Phase = 'welcome' | 'reading' | 'card' | 'game' | 'sayit' | 'return';
type GameStep = 'intro' | 'kid' | 'done';
type SayStatus = 'idle' | 'listening' | 'celebrate';

interface State {
  phase: Phase;
  stars: number;
  starPop: boolean;
  caption: string;
  showCoach: boolean;
  gameStep: GameStep;
  dogWiggle: boolean;
  shakeTile: 'dog' | 'bfly' | null;
  owlPicked: boolean;
  sayStatus: SayStatus;
  sayHint: string;
  attempts: number;
  micBlocked: boolean;
  /** true = child actually said the word; false = retry-limit exit (never faked as success). */
  earned: boolean;
}

const qs = new URLSearchParams(location.search);
const LISTEN_MS = (Number(qs.get('listenSeconds')) || 5) * 1000;
const RETRY_LIMIT = Number(qs.get('retryLimit')) || 2;

const P1_WORDS = ['One', 'night,', 'Zuri', 'could', 'not', 'sleep.', 'She', 'looked', 'out', 'at', 'the', 'big,', 'round', 'moon.'];
const P2_WORDS = ['A', 'small', 'owl', 'sat', 'in', 'the', 'mango', 'tree.', '“Whoo!', 'Whoo!”', 'it', 'sang.'];
const P3_WORDS = ['Zuri', 'smiled.', '“You', 'sing', 'to', 'the', 'moon!”', 'she', 'said.'];

function wordSpans(words: string[]): string {
  return words
    .map((w) => {
      const clean = w.toLowerCase().replace(/[^a-z]/g, '');
      const isOwl = clean === 'owl';
      const cls = isOwl ? 'word owl-word' : 'word';
      return `<span class="${cls}" data-word="${clean}">${w}</span>`;
    })
    .join(' ');
}

const JOURNEY_STEPS: Array<[string, Phase]> = [
  ['Welcome back, Brian', 'welcome'],
  ['Reading the story', 'reading'],
  ['Stall → word card (hear it, see it)', 'card'],
  ['One game turn (find the owl)', 'game'],
  ['Say it (real mic)', 'sayit'],
  ['Back to the sentence', 'return'],
];

export class App {
  private state: State = {
    phase: 'welcome',
    stars: 0,
    starPop: false,
    caption: '',
    showCoach: true,
    gameStep: 'intro',
    dogWiggle: false,
    shakeTile: null,
    owlPicked: false,
    sayStatus: 'idle',
    sayHint: '',
    attempts: 0,
    micBlocked: false,
    earned: true,
  };

  private adapter!: SpeechAdapter;
  private coachTimer: number | undefined;
  private starPopTimer: number | undefined;
  private shakeTimer: number | undefined;

  private root: HTMLElement;
  private el: Record<string, HTMLElement> = {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.buildDom();
    this.init();
  }

  private async init() {
    try {
      window.speechSynthesis && window.speechSynthesis.getVoices();
    } catch {
      /* noop */
    }
    this.adapter = await createSpeechAdapter(() => this.setState({ micBlocked: true }));
    this.render();
  }

  private setState(partial: Partial<State>) {
    Object.assign(this.state, partial);
    this.render();
  }

  // ---------------- flow (ported 1:1 from the reference state machine) ----------------

  private toReading = async () => {
    this.setState({ phase: 'reading', caption: '' });
    this.coachTimer = window.setTimeout(() => this.setState({ showCoach: false }), 10000);
    await this.speak('Yay! Here we go, Brian. Read with me — nice and loud!');
    this.setState({ caption: '' });
  };

  private startFlow = async () => {
    clearTimeout(this.coachTimer);
    this.setState({ phase: 'card', showCoach: false, caption: '' });
    hoot();
    await this.speak('Owl! An owl is a bird. It flies at night, and it says: whoo, whoo!');
  };

  private onWordTap = (word: string) => {
    if (!word) return;
    if (word === 'owl') this.startFlow();
    else this.speak(word);
  };

  private replayWord = () => {
    hoot();
    this.speak('Owl. An owl is a bird that flies at night.');
  };

  private toGame = async () => {
    this.setState({ phase: 'game', gameStep: 'intro', caption: '' });
    await wait(400);
    this.setState({ dogWiggle: true });
    await this.speak('My turn first! Hmm… is the owl this one?');
    await wait(300);
    this.setState({ dogWiggle: false });
    await this.speak('No! That is a dog! Silly me. Can YOU find the owl?');
    this.setState({ gameStep: 'kid' });
  };

  private pick = async (which: 'dog' | 'owl' | 'bfly') => {
    if (this.state.gameStep !== 'kid') return;
    if (which === 'owl') {
      this.setState({ gameStep: 'done', owlPicked: true });
      chime();
      await this.speak('Yes! Whoo, whoo! You found the owl!');
      this.toSayit();
    } else {
      this.setState({ shakeTile: which });
      clearTimeout(this.shakeTimer);
      this.shakeTimer = window.setTimeout(() => this.setState({ shakeTile: null }), 600);
      await this.speak(
        which === 'dog'
          ? 'That is the dog! An owl has big, round eyes. Try again!'
          : 'That is a butterfly! An owl is a bird with big, round eyes. Try again!'
      );
    }
  };

  private toSayit = async () => {
    this.setState({ phase: 'sayit', attempts: 0, sayStatus: 'idle', sayHint: '', caption: '' });
    await this.speak('Your turn! Say: owl!');
    this.startListening();
  };

  private micTap = () => {
    if (this.state.sayStatus !== 'listening') this.startListening();
  };

  private startListening = async () => {
    if (this.state.phase !== 'sayit' || this.state.sayStatus === 'celebrate') return;
    this.setState({ sayStatus: 'listening', sayHint: 'Listening…' });
    // listenFor() calls onMicBlocked() synchronously (before its promise
    // settles) when the platform is known upfront to be unsupported —
    // catch that here so the hint reflects reality instead of claiming to
    // listen for the full window.
    const listenPromise = this.adapter.listenFor('owl', LISTEN_MS);
    if (this.state.micBlocked) {
      this.setState({ sayHint: 'Mic not supported on this browser — simulating…' });
    }
    const res = await listenPromise;
    if (this.state.phase !== 'sayit') return;
    if (res.type === 'match') return this.saySuccess();
    if (res.type === 'miss') return this.sayMiss(false, res.heard);
    return this.sayMiss(true, '');
  };

  private saySuccess = async () => {
    this.setState({ sayStatus: 'celebrate', sayHint: 'You said it!' });
    chime();
    await this.speak('Owl! You said it! That word is yours now.');
    this.toReturn(true);
  };

  private sayMiss = async (silent: boolean, heard: string) => {
    const attempts = this.state.attempts + 1;
    this.setState({
      attempts,
      sayStatus: 'idle',
      sayHint: silent ? 'I didn’t hear you…' : `I heard: “${heard.trim()}”`,
    });
    if (attempts >= RETRY_LIMIT) {
      await this.speak('Owl is a tricky word — that’s okay! We’ll practice it again soon. Let’s keep reading.');
      return this.toReturn(false);
    }
    await this.speak(
      silent ? 'I didn’t hear you. Say it with me, nice and big: OWL!' : 'Almost! Listen: owl. Now you try — say owl!'
    );
    this.startListening();
  };

  private toReturn = async (earned: boolean) => {
    this.setState({
      phase: 'return',
      earned,
      stars: earned ? 1 : this.state.stars,
      starPop: earned,
      sayStatus: 'idle',
      caption: '',
    });
    if (earned) {
      this.starPopTimer = window.setTimeout(() => this.setState({ starPop: false }), 900);
    }
    await this.speak(
      earned
        ? 'Now you know owl! Read that line again — I’m listening.'
        : 'Remember: owl, the bird that says whoo! Read that line again — I’m listening.'
    );
  };

  private speak(text: string): Promise<void> {
    this.setState({ caption: text });
    return this.adapter.speak(text);
  }

  // ---------------- demo controls (interviewer panel) ----------------

  private sim(res: ListenResult) {
    if (this.state.phase !== 'sayit') return;
    if (resolvePending(res)) return;
    if (res.type === 'match') this.saySuccess();
    else if (res.type === 'miss') this.sayMiss(false, res.heard);
    else this.sayMiss(true, '');
  }
  private simCorrect = () => this.sim({ type: 'match' });
  private simWrong = () => this.sim({ type: 'miss', heard: 'apple' });
  private simSilent = () => this.sim({ type: 'silence' });

  private restart = () => {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
    clearTimeout(this.coachTimer);
    // Note: any in-flight listenFor() is intentionally abandoned here (not
    // aborted) — its phase guard means a stale resolution is a no-op. Mirrors
    // the reference implementation's restart() behavior.
    this.setState({
      phase: 'welcome',
      stars: 0,
      starPop: false,
      caption: '',
      showCoach: true,
      gameStep: 'intro',
      dogWiggle: false,
      shakeTile: null,
      owlPicked: false,
      sayStatus: 'idle',
      sayHint: '',
      attempts: 0,
      earned: true,
    });
  };

  // ---------------- DOM ----------------

  private buildDom() {
    this.root.innerHTML = `
      <div class="phone-frame">
        <div class="view-welcome" data-el="viewWelcome">
          <img class="welcome-ello anim-floaty" src="/uploads/Ello_Character.png" alt="Ello">
          <div class="welcome-heading">Welcome back, Brian!</div>
          <div class="welcome-subtext">I saved our next story for you.<br>It happens at night… under a big moon!</div>
          <div class="welcome-card">
            <div class="welcome-card-tile">🌙</div>
            <div class="welcome-card-text">
              <div class="welcome-card-label">TODAY'S STORY</div>
              <div class="welcome-card-title">The Song in the Mango Tree</div>
            </div>
          </div>
          <button class="welcome-cta" data-el="toReadingBtn">Let's read! →</button>
        </div>

        <div class="view-reading hidden" data-el="viewReading">
          <div class="topbar">
            <div class="back-circle">←</div>
            <div class="progress-track">
              <div class="progress-fill"></div>
              <div class="progress-knob"></div>
            </div>
            <div class="star-pill">
              <span style="font-size:16px">⭐</span>
              <span class="star-count" data-el="starCount">0</span>
            </div>
          </div>
          <div class="story" data-el="story">
            <p class="read" data-el="p1">${wordSpans(P1_WORDS)}</p>
            <p class="current p2" data-el="p2">${wordSpans(P2_WORDS)}</p>
            <p class="current" data-el="p3">${wordSpans(P3_WORDS)}</p>
          </div>
          <div class="coach-mark" data-el="coachMark">If a word looks tricky, tap it!</div>
          <img class="footer-img" src="/assets/ello_calm_footer.png" alt="Ello">
        </div>

        <div class="view-card hidden" data-el="viewCard">
          <div class="word-card anim-cardZoom">
            <img src="/uploads/real_owl.png" alt="A real owl at dusk">
            <div class="word-card-row">
              <div class="word-card-word">owl</div>
              <button class="speaker-btn" data-el="replayBtn">🔊</button>
            </div>
          </div>
          <button class="cta-pill" data-el="toGameBtn">Let’s find the owl! →</button>
        </div>

        <div class="view-game hidden" data-el="viewGame">
          <div class="title-chip">Who is the owl?</div>
          <div class="tile-grid">
            <div class="tile-wrap" data-el="dogTile">
              <div class="tile-frame"><img src="/assets/tile_dog.png" alt="dog"></div>
            </div>
            <div class="tile-wrap" data-el="owlTile">
              <div class="tile-frame" data-el="owlTileFrame"><img src="/uploads/real_owl.png" alt="owl"></div>
            </div>
            <div class="tile-wrap bfly" data-el="bflyTile">
              <div class="tile-frame"><img src="/assets/tile_butterfly.png" alt="butterfly"></div>
            </div>
          </div>
          <img class="footer-img" src="/assets/ello_wave_footer.png" alt="Ello waving">
        </div>

        <div class="view-sayit hidden" data-el="viewSayit">
          <div class="title-chip small">Your turn! Say it:</div>
          <div class="sayit-word">owl</div>
          <img class="sayit-celebrate-img hidden anim-bounceIn-slow" src="/uploads/owl.png" alt="owl celebrating" data-el="celebrateImg">
          <button class="mic-btn" data-el="micBtn">🎤</button>
          <div class="say-hint" data-el="sayHint"></div>
          <button class="fallback-pill hidden" data-el="fallbackBtn">I said “owl” out loud!</button>
          <img class="footer-img" src="/assets/ello_wave_footer.png" alt="Ello waving">
        </div>

        <div class="caption-bubble hidden" data-el="captionBubble">
          <img src="/uploads/Ello_Character.png" alt="Ello">
          <div class="caption-text" data-el="captionText"></div>
        </div>
      </div>

      <button class="panel-toggle" data-el="panelToggle">ⓘ</button>
      <div class="panel" data-el="panel">
        <div class="panel-title">Brian meets “owl”</div>
        <div class="panel-intro">Read the story aloud as Brian. When you hit <b>owl</b>, tap it — that's the stall. (In production, Ello is already listening and offers help after ~4s of silence; tap is the child-initiated path.)</div>
        <div class="panel-card">
          <div class="panel-section-label">The journey</div>
          <div data-el="journey"></div>
        </div>
        <div class="panel-card">
          <div class="panel-section-label">Demo controls · Say-it step</div>
          <div class="panel-desc">The mic is real (Web Speech API, or the configured voice adapter). These simulate outcomes if you're demoing without audio:</div>
          <div class="chip-row">
            <button class="chip chip-correct" data-el="simCorrectBtn">Says “owl” ✓</button>
            <button class="chip chip-wrong" data-el="simWrongBtn">Says something else</button>
            <button class="chip chip-silent" data-el="simSilentBtn">Stays silent</button>
          </div>
          <button class="restart-btn" data-el="restartBtn">↺ Restart journey</button>
        </div>
        <div class="panel-card">
          <div class="panel-section-label">Voice stack</div>
          <div class="voice-stack-text"><b>Default:</b> Web Speech API (recognition) + browser TTS (Ello's voice).<br><b>Upgrade:</b> ElevenLabs TTS for Ello's voice.<br><b>Production:</b> Azure Pronunciation Assessment for phoneme-level say-it scoring.</div>
        </div>
      </div>
    `;

    const els = this.root.querySelectorAll<HTMLElement>('[data-el]');
    els.forEach((node) => {
      const key = node.dataset.el!;
      this.el[key] = node;
    });

    this.el.story.addEventListener('click', (e) => {
      const span = (e.target as HTMLElement).closest<HTMLElement>('.word');
      if (span) this.onWordTap(span.dataset.word || '');
    });
    this.el.toReadingBtn.addEventListener('click', this.toReading);
    this.el.replayBtn.addEventListener('click', this.replayWord);
    this.el.toGameBtn.addEventListener('click', this.toGame);
    this.el.dogTile.addEventListener('click', () => this.pick('dog'));
    this.el.owlTile.addEventListener('click', () => this.pick('owl'));
    this.el.bflyTile.addEventListener('click', () => this.pick('bfly'));
    this.el.micBtn.addEventListener('click', this.micTap);
    this.el.fallbackBtn.addEventListener('click', this.simCorrect);
    this.el.simCorrectBtn.addEventListener('click', this.simCorrect);
    this.el.simWrongBtn.addEventListener('click', this.simWrong);
    this.el.simSilentBtn.addEventListener('click', this.simSilent);
    this.el.restartBtn.addEventListener('click', this.restart);
    this.el.panelToggle.addEventListener('click', () => {
      const open = this.el.panel.classList.toggle('panel-open');
      this.el.panelToggle.textContent = open ? '✕' : 'ⓘ';
    });

    this.el.journey.innerHTML = JOURNEY_STEPS.map(
      () => `<div class="journey-row"><div class="journey-dot"></div><div class="journey-label"></div></div>`
    ).join('');
  }

  // ---------------- render ----------------

  private render() {
    const s = this.state;
    const teal = '#12A5A0';
    const grey = '#C7D3D9';
    const navy = '#1D4E63';
    const dim = '#93A9B3';

    this.el.viewWelcome.classList.toggle('hidden', s.phase !== 'welcome');

    // reading/return
    const showStory = s.phase === 'reading' || s.phase === 'return';
    this.el.viewReading.classList.toggle('hidden', !showStory);
    this.el.viewCard.classList.toggle('hidden', s.phase !== 'card');
    this.el.viewGame.classList.toggle('hidden', s.phase !== 'game');
    this.el.viewSayit.classList.toggle('hidden', s.phase !== 'sayit');

    this.el.starCount.textContent = String(s.stars);
    this.el.starCount.classList.toggle('anim-starpop', s.starPop);

    const coachVisible = s.showCoach && s.phase === 'reading';
    this.el.coachMark.classList.toggle('hidden', !coachVisible);
    this.el.coachMark.classList.toggle('anim-floaty', coachVisible);

    const isReturn = s.phase === 'return';
    this.el.p2.classList.toggle('p2-return', isReturn && s.earned);
    this.el.p2.classList.toggle('p2-return-amber', isReturn && !s.earned);
    const owlSpan = this.el.p2.querySelector<HTMLElement>('[data-word="owl"]');
    if (owlSpan) {
      owlSpan.classList.toggle('owl-return', isReturn && s.earned);
      owlSpan.classList.toggle('owl-return-amber', isReturn && !s.earned);
    }

    // caption
    const hasCaption = !!s.caption;
    this.el.captionBubble.classList.toggle('hidden', !hasCaption);
    this.el.captionText.textContent = s.caption;

    // game
    this.el.dogTile.classList.toggle('anim-wiggle', s.dogWiggle);
    this.el.dogTile.classList.toggle('anim-shake', s.shakeTile === 'dog');
    this.el.bflyTile.classList.toggle('anim-shake', s.shakeTile === 'bfly');
    this.el.owlTile.classList.toggle('anim-bounceIn', s.owlPicked);
    this.el.owlTileFrame.classList.toggle('glow', s.owlPicked);

    // sayit
    const celebrating = s.sayStatus === 'celebrate';
    this.el.celebrateImg.classList.toggle('hidden', !celebrating);
    this.el.micBtn.classList.toggle('hidden', celebrating);
    this.el.micBtn.classList.toggle('listening', s.sayStatus === 'listening');
    this.el.micBtn.classList.toggle('anim-micpulse', s.sayStatus === 'listening');
    this.el.sayHint.textContent = s.sayHint;
    const fallbackVisible = s.micBlocked && s.phase === 'sayit' && !celebrating;
    this.el.fallbackBtn.classList.toggle('hidden', !fallbackVisible);

    // journey (interviewer panel)
    const rows = this.el.journey.querySelectorAll<HTMLElement>('.journey-row');
    JOURNEY_STEPS.forEach(([label, phase], i) => {
      const row = rows[i];
      if (!row) return;
      const active = s.phase === phase;
      const dot = row.querySelector<HTMLElement>('.journey-dot')!;
      const lbl = row.querySelector<HTMLElement>('.journey-label')!;
      dot.style.background = active ? teal : grey;
      lbl.style.color = active ? navy : dim;
      lbl.textContent = label;
    });
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
