import { useEffect, useRef } from 'react';
import { GameEngine } from './engine';
import type { GameEvent, GameInput, GameResult, GameStats, Settings } from './types';

interface Props {
  input: GameInput;
  active: boolean;
  runId: number;
  settings: Settings;
  onStats: (stats: GameStats) => void;
  onEvent: (event: GameEvent) => void;
  onEnd: (result: GameResult) => void;
  onReady: () => void;
  onError: (message: string) => void;
}

export default function GameCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<GameEngine | null>(null);
  const current = useRef(props);
  current.current = props;

  useEffect(() => {
    if (!host.current) return;
    const hostElement = host.current;
    const handleContextLoss = (event: Event) => {
      event.preventDefault();
      engine.current?.setActive(false);
      current.current.onError('The 3D world lost its graphics connection. Head back to camp, then start a fresh expedition.');
    };
    hostElement.addEventListener('webglcontextlost', handleContextLoss, true);
    try {
      engine.current = new GameEngine(host.current, current.current.input, {
        onStats: (stats) => current.current.onStats(stats),
        onEvent: (event) => current.current.onEvent(event),
        onEnd: (result) => current.current.onEnd(result),
      }, current.current.settings);
      engine.current.setActive(current.current.active);
      current.current.onReady();
    } catch (error) {
      console.error('Unable to initialize Skybound:', error);
      current.current.onError('Your browser could not start the 3D world. Enable hardware acceleration or try a recent version of Chrome, Firefox, or Safari.');
    }
    return () => {
      hostElement.removeEventListener('webglcontextlost', handleContextLoss, true);
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => { engine.current?.setActive(props.active); }, [props.active]);
  useEffect(() => { engine.current?.applySettings(props.settings); }, [props.settings]);
  useEffect(() => {
    engine.current?.reset();
    engine.current?.setActive(current.current.active);
  }, [props.runId]);

  return <div className="game-canvas" ref={host} />;
}