import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUp, Compass, Gem, Heart, MousePointer2, Move, Pause, Sparkles, Timer, Volume2, VolumeX, Zap } from 'lucide-react';
import { RUN_TIME, SHARDS_TO_UNLOCK, formatTime, type GameEvent, type GameInput, type GameStats, type Settings } from '../game/types';
import { Brand, Key } from './ui';

export const REALM_NAMES = ['The Verdant Isles', 'Amberwild Reach', 'The Silent Canopy', 'Beyond the Blue'];

function TouchControls({ input, dashReady }: { input: GameInput; dashReady: number }) {
  const stick = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointer.current || !stick.current) return;
    const bounds = stick.current.getBoundingClientRect();
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy);
    const clamp = Math.min(1, 39 / (distance || 1));
    const x = dx * clamp;
    const y = dy * clamp;
    input.x = x / 39;
    input.z = y / 39;
    setPosition({ x, y });
  };
  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointer.current) return;
    pointer.current = null;
    input.x = input.z = 0;
    setPosition({ x: 0, y: 0 });
  };
  useEffect(() => () => { input.x = input.z = 0; }, [input]);
  return <div className="touch-controls">
    <div className="joystick" ref={stick} aria-label="Movement joystick" onPointerDown={(event) => {
      event.preventDefault();
      if (pointer.current !== null) return;
      pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      move(event);
    }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <span className="joystick-cross" /><div className="joystick-thumb" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}><Move size={23} /></div>
      <span className="touch-label">MOVE</span>
    </div>
    <div className="touch-actions">
      <button className={`touch-action dash-action ${dashReady < 0.98 ? 'recharging' : ''}`} aria-label="Dash attack" onPointerDown={(event) => { event.preventDefault(); input.dash = true; }} onClick={(event) => { if (event.detail === 0) input.dash = true; }}><svg className="touch-cooldown" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="207.35" strokeDashoffset={207.35 * (1 - dashReady)} /></svg><Zap size={25} /><span>DASH</span></button>
      <button className="touch-action jump-action" aria-label="Jump; tap twice to double jump" onPointerDown={(event) => { event.preventDefault(); input.jump = true; }} onClick={(event) => { if (event.detail === 0) input.jump = true; }}><ArrowUp size={30} /><span>JUMP</span></button>
    </div>
  </div>;
}

export function GameHUD({ stats, onPause, settings, onSound, input, event }: {
  stats: GameStats; onPause: () => void; settings: Settings; onSound: () => void; input: GameInput; event: GameEvent | null;
}) {
  return <div className="game-hud">
    <div className="hud-top">
      <div className="hud-left"><Brand onClick={onPause} small /><div className="lives" aria-label={`${stats.lives} lives remaining`}>{[0, 1, 2].map((life) => <Heart key={life} size={22} className={life < stats.lives ? 'heart-full' : 'heart-empty'} fill={life < stats.lives ? 'currentColor' : 'none'} strokeWidth={1.6} />)}</div></div>
      <div className={`objective ${stats.portalReady ? 'objective-complete' : ''}`}>
        <span className="realm-label">REALM {String(stats.realm).padStart(2, '0')}<span />{REALM_NAMES[(stats.realm - 1) % REALM_NAMES.length]}</span>
        <div className="objective-title">{stats.portalReady ? <><Sparkles size={17} /> The portal is open</> : <><Gem size={17} /> Gather the sunshards</>}<strong>{Math.min(SHARDS_TO_UNLOCK, stats.shards)}<span> / {SHARDS_TO_UNLOCK}</span></strong></div>
        <div className="objective-progress"><span style={{ width: `${Math.min(100, stats.shards / SHARDS_TO_UNLOCK * 100)}%` }} /></div>
      </div>
      <div className="hud-right"><div className="score-display"><span className="score-label">YOUR SCORE</span><strong key={stats.score}>{String(stats.score).padStart(6, '0')}</strong><span className={`run-timer ${stats.time < 20 ? 'time-low' : ''}`}><Timer size={13} />{formatTime(Math.ceil(stats.time))}<span>remaining</span></span></div><div className="hud-buttons"><button className="icon-button" onClick={onPause} aria-label="Pause game"><Pause size={19} fill="currentColor" /></button><button className="icon-button hud-sound" onClick={onSound} aria-label={settings.sound ? 'Mute sound' : 'Enable sound'}>{settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button></div></div>
    </div>
    {stats.combo > 1 && <div className="combo-indicator" key={stats.combo}><strong>{stats.combo}<span>x</span></strong><span>LIGHT STREAK</span></div>}
    {event && <div key={event.id} className={`game-feedback feedback-${event.kind}`} aria-live={event.kind === 'portal' || event.kind === 'hurt' ? 'polite' : 'off'}>{event.kind === 'portal' && <Sparkles size={22} />}{event.text}</div>}
    {event?.kind === 'hurt' && <div key={`hurt-${event.id}`} className="damage-flash" />}
    {event?.kind === 'portal' && <div key={`portal-${event.id}`} className="portal-flash" />}
    {stats.realm === 1 && stats.time > RUN_TIME - 9 && <div className="first-steps"><Compass size={18} /><span>{stats.shards < 1 ? 'Follow the stone path. Your first sunshard is just ahead.' : 'A little momentum goes a long way. Jump the gaps. Dash through guardians.'}</span></div>}
    <div className="hud-bottom"><div className="in-game-controls"><span><span className="key-group"><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key></span> Move</span><span><Key wide>SPACE</Key> Jump</span><span><Key wide>SHIFT</Key> Dash</span><span className="look-hint"><MousePointer2 size={15} /> Drag to look</span></div><div className={`dash-charge ${stats.dashReady > 0.98 ? 'ready' : ''}`}><Zap size={16} /><span>{stats.dashReady > 0.98 ? 'DASH READY' : 'RECHARGING'}<span className="dash-charge-track"><i style={{ transform: `scaleX(${stats.dashReady})` }} /></span></span></div></div>
    <TouchControls input={input} dashReady={stats.dashReady} />
  </div>;
}