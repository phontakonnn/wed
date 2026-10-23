import { describe, expect, it, vi } from 'vitest';
import { emitDataRefresh, subscribeDataRefresh } from './dataRefresh';

describe('dataRefresh bus', () => {
  it('notifies every subscriber', () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = subscribeDataRefresh(first);
    const offSecond = subscribeDataRefresh(second);

    emitDataRefresh();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    offFirst();
    offSecond();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const off = subscribeDataRefresh(listener);
    off();

    emitDataRefresh();

    expect(listener).not.toHaveBeenCalled();
  });

  it('survives a listener unsubscribing during dispatch', () => {
    const calls: string[] = [];
    const offSecond = subscribeDataRefresh(() => calls.push('second'));
    const offFirst = subscribeDataRefresh(() => {
      calls.push('first');
      offSecond();
    });

    expect(() => emitDataRefresh()).not.toThrow();
    // Dispatch iterates a copy, so a listener that unsubscribes mid-flight still
    // receives this round: the set is only mutated for the next emit.
    expect(calls).toEqual(['second', 'first']);

    offFirst();
  });
});
