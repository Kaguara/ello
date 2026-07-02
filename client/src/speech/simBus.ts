import type { ListenResult } from './types';

// Lets the interviewer-panel demo controls (Says "owl" / Says something
// else / Stays silent) resolve whichever listenFor() call is currently
// in flight, regardless of which adapter is active.
let pending: ((r: ListenResult) => void) | null = null;

export function setPendingResolver(fn: ((r: ListenResult) => void) | null): void {
  pending = fn;
}

export function resolvePending(r: ListenResult): boolean {
  if (!pending) return false;
  const fn = pending;
  pending = null;
  fn(r);
  return true;
}
