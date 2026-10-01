import { useState, type KeyboardEvent } from 'react';
import { ArrowUp, Check, Compass, Expand, Footprints, Keyboard, MousePointer2, Move, Pause, Settings2, Shield, Smartphone, Sparkles, Trophy, Zap } from 'lucide-react';
import { audio } from '../game/audio';
import type { ScoreEntry, Settings } from '../game/types';
import { Key, Modal, PrimaryButton } from './ui';

export function HowToPlay({ onClose, onPlay, inGame }: { onClose: () => void; onPlay: () => void; inGame: boolean }) {
  const [tab, setTab] = useState<'keyboard' | 'touch'>(() => window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard');
  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'keyboard' : event.key === 'End' ? 'touch' : tab === 'keyboard' ? 'touch' : 'keyboard';
    setTab(next);
    document.getElementById(`${next}-tab`)?.focus();
  };
  return <Modal onClose={onClose} titleId="help-title" className="help-modal">
    <span className="eyebrow"><Compass size={15} /> THE EXPLORER'S FIELD GUIDE</span>
    <h2 id="help-title">A little courage.<br />A lot of possibility.</h2>
    <p className="modal-description">Gather 12 sunshards to awaken the portal.<br className="desktop-break" /> The next island is just a leap of faith away.</p>
    <div className="control-tabs" role="tablist" aria-label="Control scheme">
      <button role="tab" aria-selected={tab === 'keyboard'} aria-controls="control-panel" id="keyboard-tab" tabIndex={tab === 'keyboard' ? 0 : -1} onKeyDown={navigateTabs} onClick={() => setTab('keyboard')} className={tab === 'keyboard' ? 'active' : ''}><Keyboard size={17} /> Keyboard & mouse</button>
      <button role="tab" aria-selected={tab === 'touch'} aria-controls="control-panel" id="touch-tab" tabIndex={tab === 'touch' ? 0 : -1} onKeyDown={navigateTabs} onClick={() => setTab('touch')} className={tab === 'touch' ? 'active' : ''}><Smartphone size={17} /> Touch</button>
    </div>
    <div className="controls-table" id="control-panel" role="tabpanel" aria-labelledby={`${tab}-tab`}>
      {tab === 'keyboard' ? <>
        <div className="control-row"><span><Footprints />Move</span><div><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key><span className="or-label">or arrow keys</span></div></div>
        <div className="control-row"><span><ArrowUp />Jump / double jump</span><div><Key wide>SPACE</Key><span className="or-label">press twice</span></div></div>
        <div className="control-row"><span><Zap />Dash attack</span><div><Key wide>SHIFT</Key><span className="or-label">or</span><Key>F</Key></div></div>
        <div className="control-row"><span><MousePointer2 />Look around</span><div><span className="or-label">Drag the world or</span><Key>Q</Key><Key>E</Key></div></div>
        <div className="control-row"><span><Pause />Take a breather</span><div><Key wide>ESC</Key><span className="or-label">or</span><Key>P</Key></div></div>
      </> : <>
        <div className="control-row touch-help-row"><span><Move />Move</span><p>Drag the left thumbstick</p></div>
        <div className="control-row touch-help-row"><span><ArrowUp />Jump / double jump</span><p>Tap JUMP once or twice</p></div>
        <div className="control-row touch-help-row"><span><Zap />Dash attack</span><p>Tap DASH to burst forward</p></div>
        <div className="control-row touch-help-row"><span><MousePointer2 />Look around</span><p>Swipe anywhere in the world</p></div>
        <div className="control-row touch-help-row"><span><Pause />Pause</span><p>Tap the pause icon at the top</p></div>
      </>}
    </div>
    <div className="field-tip"><Sparkles size={20} /><p><strong>A little insider knowledge</strong>Collect sunshards quickly for up to a 5x streak. Dash through guardians for bonus points. Each portal adds up to 35 seconds and restores a heart.</p></div>
    <PrimaryButton onClick={onPlay}>{inGame ? 'Back to the adventure' : "Let's explore"}</PrimaryButton>
  </Modal>;
}

export function HighScores({ scores, onClose, onPlay, onClear, latestId }: {
  scores: ScoreEntry[]; onClose: () => void; onPlay: () => void; onClear: () => void; latestId: string | null;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  return <Modal onClose={onClose} titleId="scores-title" className="scores-modal">
    <span className="eyebrow"><Trophy size={15} /> THE HALL OF WANDERERS</span>
    <h2 id="scores-title">Leave your mark.</h2>
    <p className="modal-description">Small steps. Daring leaps. Your ten greatest adventures.</p>
    {scores.length ? <div className="leaderboard-wrap">
      <table className="leaderboard">
        <thead><tr><th scope="col">RANK</th><th scope="col">EXPLORER</th><th scope="col">REALM</th><th scope="col">SCORE</th></tr></thead>
        <tbody>{scores.map((score, index) => <tr key={score.id} className={`${index === 0 ? 'first-place' : ''} ${latestId === score.id ? 'latest-score' : ''}`}>
          <td>{index === 0 ? <Trophy size={17} /> : String(index + 1).padStart(2, '0')}</td>
          <td><strong>{score.name}</strong>{latestId === score.id && <span className="you-label">YOU</span>}<small>{new Date(score.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></td>
          <td>{String(score.realm).padStart(2, '0')}</td><td>{score.score.toLocaleString()}</td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="empty-scores">
      <div className="empty-trophy"><Trophy size={38} strokeWidth={1.2} /><span /><span /></div>
      <h3>Every legend starts somewhere.</h3>
      <p>The sky is wide open. Make the first adventure yours.</p>
      <PrimaryButton onClick={onPlay}>Take the first leap</PrimaryButton>
    </div>}
    <div className="leaderboard-footer">
      {confirmClear ? <><span>Clear every saved expedition?</span><div className="inline-actions"><button className="text-button" onClick={() => setConfirmClear(false)}>Cancel</button><button className="text-button danger" onClick={() => { onClear(); setConfirmClear(false); }}>Yes, clear scores</button></div></> : <><span><Shield size={13} /> Saved on this device. Just for you.</span>{scores.length > 0 && <button className="text-button muted" onClick={() => setConfirmClear(true)}>Clear scores</button>}</>}
    </div>
  </Modal>;
}

export function SettingsModal({ settings, onChange, onClose, onFullscreen, fullscreen }: {
  settings: Settings; onChange: (settings: Settings) => void; onClose: () => void; onFullscreen: () => void; fullscreen: boolean;
}) {
  return <Modal onClose={onClose} titleId="settings-title" className="settings-modal">
    <span className="eyebrow"><Settings2 size={15} /> MAKE YOURSELF AT HOME</span>
    <h2 id="settings-title">Your kind of adventure.</h2>
    <p className="modal-description">A few little things to make the journey yours.</p>
    <div className="settings-list">
      <div className="setting-row"><div><h3>Sound effects</h3><p>Crystal chimes, dashes, and little victories.</p></div><button role="switch" aria-checked={settings.sound} aria-label="Sound effects" className={`toggle ${settings.sound ? 'on' : ''}`} onClick={() => { audio.unlock(); onChange({ ...settings, sound: !settings.sound }); }}><span /></button></div>
      <div className="setting-row"><div><h3>Screen shake</h3><p>A little extra impact with every daring move.</p></div><button role="switch" aria-checked={settings.shake} aria-label="Screen shake" className={`toggle ${settings.shake ? 'on' : ''}`} onClick={() => onChange({ ...settings, shake: !settings.shake })}><span /></button></div>
      <div className="setting-row"><div><h3><label htmlFor="graphics-quality">Graphics</label></h3><p>Auto balances detail and a smooth frame rate.</p></div><select id="graphics-quality" value={settings.quality} onChange={(event) => onChange({ ...settings, quality: event.target.value as Settings['quality'] })}><option value="auto">Auto</option><option value="high">High detail</option><option value="low">Battery saver</option></select></div>
      <div className="setting-row"><div><h3>Fullscreen</h3><p>A little less browser. A little more sky.</p></div><button className="subtle-button" onClick={onFullscreen}><Expand size={16} />{fullscreen ? 'Exit' : 'Expand'}</button></div>
    </div>
    <p className="settings-note">Your preferences are saved automatically.</p>
    <PrimaryButton onClick={onClose} icon={<Check size={18} />}>Just right</PrimaryButton>
  </Modal>;
}