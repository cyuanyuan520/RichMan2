export interface RngState {
  readonly s: number;
}

export function seedFromString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: number): RngState {
  return { s: (seed >>> 0) || 0x9e3779b9 };
}

export function rngNext(state: RngState): [number, RngState] {
  const s = (state.s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { s }];
}

export function rngInt(
  state: RngState,
  min: number,
  max: number,
): [number, RngState] {
  const [value, next] = rngNext(state);
  const span = max - min + 1;
  return [min + Math.floor(value * span), next];
}

export function rngChance(
  state: RngState,
  probability: number,
): [boolean, RngState] {
  const [value, next] = rngNext(state);
  return [value < probability, next];
}

export function rngPick<T>(state: RngState, items: readonly T[]): [T, RngState] {
  const [index, next] = rngInt(state, 0, items.length - 1);
  return [items[index] as T, next];
}

export function rngShuffle<T>(
  state: RngState,
  items: readonly T[],
): [T[], RngState] {
  const result = [...items];
  let next = state;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const [j, advanced] = rngInt(next, 0, i);
    next = advanced;
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return [result, next];
}
