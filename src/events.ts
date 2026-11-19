import { TileType } from './types';

export interface GameEventMap {
  'polyminer:tile-changed': { gx: number; gy: number; tileType: TileType; hasElevator?: boolean };
  'polyminer:wallet-changed': { newMoney: number; changeAmount: number; reason: string; allowDebt?: boolean };
  'polyminer:relic-discovered': { relicId: string };
  'polyminer:museum-claim': undefined;
  'polyminer:victory': { winnerName: string };
  'polyminer:pre-join': undefined;
}

type VoidGameEvent = {
  [K in keyof GameEventMap]: GameEventMap[K] extends undefined ? K : never;
}[keyof GameEventMap];

export function emitGameEvent<K extends VoidGameEvent>(type: K): void;
export function emitGameEvent<K extends Exclude<keyof GameEventMap, VoidGameEvent>>(
  type: K,
  detail: GameEventMap[K]
): void;
export function emitGameEvent<K extends keyof GameEventMap>(
  type: K,
  detail?: GameEventMap[K]
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    detail === undefined ? new CustomEvent(type) : new CustomEvent(type, { detail })
  );
}

export function onGameEvent<K extends keyof GameEventMap>(
  type: K,
  handler: (detail: GameEventMap[K]) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    handler((e as CustomEvent<GameEventMap[K]>).detail);
  };
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}
