/**
 * A tiny invalidation bus for the data loaders that still live in effects.
 *
 * TanStack Query owns everything that has been migrated, but a few screens are
 * still loaded by an effect. Those effects subscribe here instead of watching a
 * counter in state, so a save notifies them directly: no extra render is
 * needed to bump a number, and the dependency arrays stay honest.
 *
 * Every subscriber must return its unsubscribe function from the effect
 * cleanup, otherwise a remount leaks a listener.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeDataRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitDataRefresh(): void {
  // Copy first: a listener may unsubscribe while we iterate.
  for (const listener of [...listeners]) {
    listener();
  }
}
