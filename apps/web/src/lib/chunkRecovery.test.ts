import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunkRecovery';

describe('isChunkLoadError', () => {
  it('recognises the messages browsers actually throw for a missing chunk', () => {
    // Chrome / Firefox / Safari wording differs, so all three must match.
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/notes-abc.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Loading chunk 42 failed.'))).toBe(true);
    expect(isChunkLoadError('ChunkLoadError')).toBe(true);
  });

  it('ignores ordinary runtime errors so real bugs still reach the boundary UI', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(42)).toBe(false);
  });

  it('accepts plain objects that only carry a message', () => {
    expect(isChunkLoadError({ message: 'Loading chunk vendor-abc failed.' })).toBe(true);
    expect(isChunkLoadError({ message: 'boom' })).toBe(false);
  });
});
