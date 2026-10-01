import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, CircleHelp, Compass, Flag, Gem, Home, Maximize, RotateCcw, Settings2, Timer, Trophy, X } from 'lucide-react';
import { Brand, Emblem, Key, PrimaryButton } from './components/ui';
import { HighScores, HowToPlay, SettingsModal } from './components/Dialogs';
import { GameHUD, REALM_NAMES } from './components/GameHUD';
import { audio } from './game/audio';
import {
  INITIAL_STATS, formatTime, readScores, readSettings, saveScores, saveSettings,
  type GameEvent, type GameInput, type GameResult, type GameStats, type ScoreEntry, type Screen, type Settings,
} from './game/types';

const GameCanvas = lazy(() => import('./game/GameCanvas'));
type ModalName = 'help' | 'scores' | 'settings' | null;

function loadName() {
  try { return localStorage.getItem('skybound.explorer')?.trim().slice(0, 18) || 'Wanderer'; } catch { return 'Wanderer'; }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [modal, setModal] = useState<ModalName>(null);
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [scores, setScores] = useState<ScoreEntry[]>(readScores);
  const [stats, setStats] = useState<GameStats>({ ...INITIAL_STATS });
  const [runId, setRunId] = useState(0);
  const [gameReady, setGameReady] = useState(false);
  const [gameError, setGameError] = useState('');
  const [event, setEvent] = useState<GameEvent | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [name, setName] = useState(loadName);
  const [nameSaved, setNameSaved] = useState(true);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');
  const input = useRef<GameInput>({ x: 0, z: 0, jump: false, dash: false });
  const menu = useRef<HTMLDivElement>(null);
  const gameMounted = screen !== 'menu';
  const scoreListed = scores.some((score) => score.id === latestId);

  useEffect(() => { saveSettings(settings); audio.setMuted(!settings.sound); }, [settings]);
  useEffect(() => {
    if (!event) return;
    const timeout = window.setTimeout(() => setEvent(null), event.kind === 'portal' ? 2600 : 1500);
    return () => window.clearTimeout(timeout);
  }, [event]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    if ((screen === 'paused' || screen === 'over') && !modal) {
      document.querySelector<HTMLButtonElement>('.state-overlay .primary-button')?.focus({ preventScroll: true });
    }
  }, [screen, modal]);

  const start = useCallback(() => {
    audio.unlock();
    audio.play('click');
    if (screen === 'menu') setGameReady(false);
    input.current.x = input.current.z = 0;
    input.current.jump = input.current.dash = false;
    setStats({ ...INITIAL_STATS });
    setResult(null);
    setEvent(null);
    setGameError('');
    setRunId((id) => id + 1);
    setScreen('playing');
    setModal(null);
  }, [screen]);

  const resume = useCallback(() => { audio.unlock(); setScreen('playing'); setModal(null); }, []);
  const home = useCallback(() => { setScreen('menu'); setModal(null); setEvent(null); setGameReady(false); setGameError(''); }, []);
  const toggleSound = useCallback(() => { audio.unlock(); setSettings((current) => ({ ...current, sound: !current.sound })); }, []);
  const openModal = useCallback((next: ModalName) => { audio.unlock(); audio.play('click'); if (screen === 'playing') setScreen('paused'); setModal(next); }, [screen]);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setNotice('Fullscreen is not available in this browser.');
    } catch { setNotice('Fullscreen is not available in this browser.'); }
  }, []);

  const onEnd = useCallback((ended: GameResult) => {
    setResult(ended);
    setScreen('over');
    setEvent(null);
    setNewBest(ended.score > (scores[0]?.score || 0));
    const entry: ScoreEntry = { ...ended, name: name.trim() || 'Wanderer', id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: new Date().toISOString() };
    const nextScores = [...scores, entry].sort((a, b) => b.score - a.score).slice(0, 10);
    setLatestId(entry.id);
    setScores(nextScores);
    setStorageAvailable(saveScores(nextScores));
    setName(entry.name);
    setNameSaved(true);
  }, [name, scores]);

  const retire = () => {
    audio.play('over');
    onEnd({ score: stats.score, shards: stats.totalShards, realm: stats.realm, duration: stats.elapsed, reason: 'retired' });
  };

  const saveName = () => {
    const explorer = name.trim() || 'Wanderer';
    const next = scores.map((score) => score.id === latestId ? { ...score, name: explorer } : score);
    setName(explorer);
    setScores(next);
    setStorageAvailable(saveScores(next));
    try { localStorage.setItem('skybound.explorer', explorer); } catch { /* Keep the name for this session when storage is unavailable. */ }
    setNameSaved(true);
    audio.play('click');
  };

  useEffect(() => {
    const handleKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.target instanceof HTMLInputElement || keyEvent.target instanceof HTMLSelectElement) {
        if (keyEvent.code === 'Escape' && modal) setModal(null);
        return;
      }
      if (keyEvent.repeat) return;
      if (modal) {
        if (keyEvent.code === 'Escape') { keyEvent.preventDefault(); setModal(null); }
        return;
      }
      if (keyEvent.code === 'Escape' || keyEvent.code === 'KeyP') {
        if (screen === 'playing') { keyEvent.preventDefault(); setScreen('paused'); }
        else if (screen === 'paused' && !gameError) { keyEvent.preventDefault(); resume(); }
      }
      if (keyEvent.code === 'Enter' && !(keyEvent.target instanceof HTMLButtonElement)) {
        keyEvent.preventDefault();
        if (screen === 'menu' || screen === 'over') start();
        else if (screen === 'paused' && !gameError) resume();
      }
      if (keyEvent.code === 'KeyR' && screen !== 'menu' && !gameError) { keyEvent.preventDefault(); start(); }
      if (keyEvent.code === 'KeyM') { keyEvent.preventDefault(); toggleSound(); }
    };
    const pauseOnBlur = () => { setScreen((current) => current === 'playing' ? 'paused' : current); };
    const pauseOnHidden = () => { if (document.hidden) pauseOnBlur(); };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('blur', pauseOnBlur);
    document.addEventListener('visibilitychange', pauseOnHidden);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('blur', pauseOnBlur);
      document.removeEventListener('visibilitychange', pauseOnHidden);
    };
  }, [screen, modal, start, resume, toggleSound, gameError]);

  const menuParallax = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerEvent.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    menu.current?.style.setProperty('--scene-x', `${(pointerEvent.clientX / window.innerWidth - 0.5) * -9}px`);
    menu.current?.style.setProperty('--scene-y', `${(pointerEvent.clientY / window.innerHeight - 0.5) * -6}px`);
  };

  return <div className={`app-shell screen-${screen}`}>
    {screen === 'menu' && <div className="start-screen" ref={menu} onPointerMove={menuParallax}>
      <div className="menu-world"><img src="/images/skybound-world.jpg" alt="A tiny caped explorer looking toward a golden portal on a lush floating island" fetchPriority="high" draggable={false} /></div>
      <div className="menu-shade" />
      <div className="motes" aria-hidden="true">{Array.from({ length: 17 }, (_, i) => <i key={i} style={{ '--i': i, left: `${(i * 17 + 13) % 97}%`, top: `${(i * 29 + 38) % 95}%`, animationDelay: `${-i * 1.7}s` } as CSSProperties} />)}</div>
      <header className="site-header">
        <Brand onClick={home} />
        <nav className="main-nav" aria-label="Main navigation"><button className="nav-link active" onClick={home}>The adventure</button><button className="nav-link" onClick={() => openModal('help')}>How to play</button><button className="nav-link" onClick={() => openModal('scores')}>High scores<ArrowUpRight size={14} /></button></nav>
        <div className="header-tools"><button className={`sound-button ${settings.sound ? '' : 'is-muted'}`} onClick={toggleSound} aria-label={settings.sound ? 'Mute sound' : 'Enable sound'}><span className="sound-bars" aria-hidden="true"><i /><i /><i /><i /></span><span>Sound {settings.sound ? 'on' : 'off'}</span></button><span className="tool-divider" /><button className="icon-button" onClick={() => openModal('settings')} aria-label="Settings"><Settings2 size={20} /></button></div>
      </header>
      <main className="menu-content">
        <div className="hero-copy">
          <div className="hero-eyebrow"><span /> A LITTLE COURAGE. A LOT OF SKY.</div>
          <h1>SKYBOUND<span className="title-spark" aria-hidden="true">*</span></h1>
          <h2>Small hero. Boundless adventure.</h2>
          <p>Leap between floating islands. Chase the light.<br />Find out how far a little courage can take you.</p>
          <div className="hero-actions"><div onPointerEnter={() => { void import('./game/GameCanvas'); }}><PrimaryButton onClick={start}>Begin adventure</PrimaryButton><span className="enter-hint">or press <Key wide>ENTER</Key> to begin</span></div><button className="how-link" onClick={() => openModal('help')}><CircleHelp size={17} /><span>How to play</span></button></div>
          <div className="mobile-menu-links"><button onClick={() => openModal('scores')}><Trophy size={15} /> High scores</button></div>
        </div>
      </main>
      <footer className="menu-footer">
        <div className="footer-note"><span className="status-dot" /> A world worth wandering.</div>
        <div className="quick-controls"><span><span className="key-group"><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key></span>Move</span><span><Key wide>SPACE</Key>Jump</span><span><Key wide>SHIFT</Key>Dash</span></div>
        <div className="footer-right"><span>TAKE THE LEAP.</span><button className="icon-button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}><Maximize size={17} /></button></div>
      </footer>
    </div>}

    {gameMounted && <>
      <Suspense fallback={null}><GameCanvas input={input.current} active={screen === 'playing' && !modal && !gameError} runId={runId} settings={settings} onStats={setStats} onEvent={setEvent} onEnd={onEnd} onReady={() => setGameReady(true)} onError={setGameError} /></Suspense>
      <div className="game-vignette" />
      {!gameReady && !gameError && <div className="world-loading"><Emblem /><span>A little adventure is taking shape...</span><div className="loading-line"><i /></div></div>}
      {gameReady && screen === 'playing' && !gameError && <GameHUD stats={stats} onPause={() => setScreen('paused')} settings={settings} onSound={toggleSound} input={input.current} event={event} />}
      {screen === 'paused' && !gameError && <div className="state-overlay pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <button className="pause-settings icon-button" onClick={() => openModal('settings')} aria-label="Game settings"><Settings2 size={22} /></button>
        <div className="pause-content"><span className="eyebrow"><span className="tiny-diamond" /> ADVENTURE PAUSED</span><h2 id="pause-title">Take a breath.</h2><p>The sky will still be here.</p><div className="pause-buttons"><PrimaryButton onClick={resume}>Keep exploring</PrimaryButton><button className="secondary-button" onClick={start}><RotateCcw size={17} />Restart expedition<Key>R</Key></button><button className="text-button" onClick={retire} title="Finish this run and save your score"><Flag size={15} />End expedition & save</button></div><button className="pause-help text-button muted" onClick={() => openModal('help')}><CircleHelp size={15} />A quick reminder of the controls</button></div>
        <div className="pause-summary"><span>{REALM_NAMES[(stats.realm - 1) % REALM_NAMES.length]}</span><i />{stats.score.toLocaleString()} points<i />{formatTime(Math.ceil(stats.time))} left</div>
      </div>}
      {screen === 'over' && result && <div className="state-overlay gameover-overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
        <div className="gameover-content"><span className="eyebrow"><Emblem /> EXPEDITION COMPLETE</span><h2 id="gameover-title">What a journey.</h2><p>{result.reason === 'time' ? 'Time flies above the clouds. Shall we go again?' : result.reason === 'retired' ? "Every adventure leaves a story. This one's yours." : 'Every great explorer takes a tumble. The sky is calling.'}</p>
          <div className="final-score"><span>YOUR SCORE</span><strong>{result.score.toLocaleString()}</strong>{newBest && <span className="personal-best"><Trophy size={14} /> A NEW PERSONAL BEST</span>}</div>
          <div className="expedition-stats"><div><Gem size={16} /><strong>{result.shards}</strong><span>Sunshards</span></div><div><Compass size={16} /><strong>{String(result.realm).padStart(2, '0')}</strong><span>Realm reached</span></div><div><Timer size={16} /><strong>{formatTime(result.duration)}</strong><span>Time exploring</span></div></div>
          <form className="explorer-form" onSubmit={(formEvent) => { formEvent.preventDefault(); saveName(); }}><label htmlFor="explorer-name">MAKE A NAME FOR YOURSELF</label><div><input id="explorer-name" value={name} maxLength={18} autoComplete="nickname" placeholder="Wanderer" onChange={(change) => { setName(change.target.value); setNameSaved(false); }} /><button type="submit" disabled={nameSaved || !name.trim()}>{nameSaved ? <><Check size={15} /> Saved</> : <>Save name <ArrowRight size={15} /></>}</button></div><small>{!scoreListed ? 'Only your ten best expeditions are kept. The next one could be a record.' : storageAvailable ? 'Your expedition is saved to your local high scores.' : 'Saved for this visit. Browser storage is unavailable.'}</small></form>
          <div className="gameover-actions"><PrimaryButton onClick={start} icon={<RotateCcw size={17} />}>Go again <Key>R</Key></PrimaryButton><button className="secondary-button" onClick={() => openModal('scores')}><Trophy size={17} />High scores</button></div><button className="text-button back-to-camp" onClick={home}><Home size={14} />Back to camp</button>
        </div>
      </div>}
      {gameError && <div className="state-overlay error-overlay"><Compass size={42} /><h2>A small detour.</h2><p>{gameError}</p><PrimaryButton onClick={home} icon={<Home size={17} />}>Back to camp</PrimaryButton></div>}
    </>}

    {modal === 'help' && <HowToPlay onClose={() => setModal(null)} onPlay={() => { if (screen === 'paused') resume(); else start(); }} inGame={screen === 'paused'} />}
    {modal === 'scores' && <HighScores scores={scores} latestId={latestId} onClose={() => setModal(null)} onPlay={start} onClear={() => { setScores([]); setStorageAvailable(saveScores([])); }} />}
    {modal === 'settings' && <SettingsModal settings={settings} onChange={setSettings} onClose={() => setModal(null)} onFullscreen={() => void toggleFullscreen()} fullscreen={fullscreen} />}
    {notice && <div className="notice-toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}
    <div className="sr-only" aria-live="polite">{screen === 'paused' ? 'Game paused' : screen === 'over' ? `Expedition complete. ${result?.score || 0} points.` : ''}</div>
  </div>;
}
