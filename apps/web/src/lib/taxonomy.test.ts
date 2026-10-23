import { describe, expect, it } from 'vitest';
import { MAX_TAXONOMY_IDS, normalizeTaxonomyName, sanitizeIds } from './taxonomy';

describe('taxonomy helpers', () => {
  it('keeps only unique non-empty string ids', () => {
    expect(sanitizeIds(['a', 'a', ' b ', '', null, 42, 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('caps the number of relations', () => {
    const ids = Array.from({ length: 80 }, (_, index) => `id-${index}`);
    expect(sanitizeIds(ids)).toHaveLength(MAX_TAXONOMY_IDS);
  });

  it('rejects non-arrays safely', () => {
    expect(sanitizeIds(undefined)).toEqual([]);
    expect(sanitizeIds('nope')).toEqual([]);
  });

  it('normalises names and enforces the length limit', () => {
    expect(normalizeTaxonomyName('  งานบ้าน  ')).toBe('งานบ้าน');
    expect(normalizeTaxonomyName('   ')).toBeNull();
    expect(normalizeTaxonomyName('x'.repeat(81))).toBeNull();
  });
});
