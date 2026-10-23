import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, parseImportPayload, parseSavedFilterCriteria } from './validation';

describe('parseImportPayload', () => {
  it('accepts a small backup object', () => {
    const parsed = parseImportPayload(JSON.stringify({ notes: [{ title: 'a' }], profile: { name: 'x' } }));
    expect(parsed.notes).toHaveLength(1);
  });

  it('rejects malformed json', () => {
    expect(() => parseImportPayload('{not json')).toThrow();
  });

  it('rejects a payload larger than the limit', () => {
    const huge = `{"notes":"${'x'.repeat(MAX_IMPORT_BYTES + 1)}"}`;
    expect(() => parseImportPayload(huge)).toThrow(/ใหญ่เกินไป/);
  });

  it('rejects too many collection rows', () => {
    const notes = Array.from({ length: 20_001 }, () => ({}));
    expect(() => parseImportPayload(JSON.stringify({ notes }))).toThrow();
  });

  it('rejects too many top level keys', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 201; i++) wide[`k${i}`] = i;
    expect(() => parseImportPayload(JSON.stringify(wide))).toThrow();
  });

  it('rejects a collection that is not an array', () => {
    expect(() => parseImportPayload(JSON.stringify({ notes: 'nope' }))).toThrow();
  });
});

describe('parseSavedFilterCriteria', () => {
  it('returns the known fields', () => {
    const parsed = parseSavedFilterCriteria(
      JSON.stringify({ query: 'โน้ต', sortOrder: 'az', types: ['notes', 'tasks'] }),
    );
    expect(parsed).toEqual({ query: 'โน้ต', sortOrder: 'az', types: ['notes', 'tasks'] });
  });

  it('returns null for invalid json', () => {
    expect(parseSavedFilterCriteria('{oops')).toBeNull();
  });

  it('returns null for an unknown sort order', () => {
    expect(parseSavedFilterCriteria(JSON.stringify({ sortOrder: 'sideways' }))).toBeNull();
  });

  it('returns null when there are too many types', () => {
    const types = Array.from({ length: 21 }, (_, i) => `t${i}`);
    expect(parseSavedFilterCriteria(JSON.stringify({ types }))).toBeNull();
  });
});
