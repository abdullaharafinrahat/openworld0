export type Screen = 'menu' | 'playing' | 'paused' | 'over';
export type Quality = 'auto' | 'high' | 'low';

export interface Settings {
  sound: boolean;
  shake: boolean;
  quality: Quality;
}

export interface GameInput {
  x: number;
  z: number;
  jump: boolean;
  dash: boolean;
}

export interface GameStats {
  score: number;
  shards: number;
  totalShards: number;
  lives: number;
  time: number;
  elapsed: number;
  realm: number;
  combo: number;
  dashReady: number;
  portalReady: boolean;
}

export interface GameResult {
  score: number;
  shards: number;
  realm: number;
  duration: number;
  reason: 'time' | 'lives' | 'retired';
}

export interface ScoreEntry extends GameResult {
  id: string;
  name: string;
  date: string;
}

export interface GameEvent {
  id: number;
  text: string;
  kind: 'shard' | 'hurt' | 'portal' | 'dash' | 'info';
}

export const SHARDS_TO_UNLOCK = 12;
export const RUN_TIME = 100;

export const INITIAL_STATS: GameStats = {
  score: 0,
  shards: 0,
  totalShards: 0,
  lives: 3,
  time: RUN_TIME,
  elapsed: 0,
  realm: 1,
  combo: 1,
  dashReady: 1,
  portalReady: false,
};

const SCORE_KEY = 'skybound.scores.v1';
const SETTINGS_KEY = 'skybound.settings.v1';

export function readScores(): ScoreEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SCORE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is ScoreEntry => (
      entry !== null && typeof entry === 'object' &&
      typeof entry.id === 'string' && typeof entry.name === 'string' &&
      typeof entry.date === 'string' && Number.isFinite(Date.parse(entry.date)) &&
      Number.isFinite(entry.score) && entry.score >= 0 &&
      Number.isFinite(entry.shards) && entry.shards >= 0 &&
      Number.isInteger(entry.realm) && entry.realm >= 1 &&
      Number.isFinite(entry.duration) && entry.duration >= 0 &&
      ['time', 'lives', 'retired'].includes(entry.reason)
    )).sort((a, b) => b.score - a.score).slice(0, 10);
  } catch {
    return [];
  }
}

export function saveScores(scores: ScoreEntry[]): boolean {
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(scores.slice(0, 10)));
    return true;
  } catch {
    return false;
  }
}

export function readSettings(): Settings {
  const defaults: Settings = {
    sound: true,
    shake: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    quality: 'auto',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      sound: typeof saved.sound === 'boolean' ? saved.sound : defaults.sound,
      shake: typeof saved.shake === 'boolean' ? saved.shake : defaults.shake,
      quality: ['auto', 'high', 'low'].includes(saved.quality) ? saved.quality : 'auto',
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing may make storage unavailable; the game still works.
  }
}

export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}