import { describe, expect, it } from 'vitest';
import { createNoteSearchIndex, highlightedTerms, searchNotes, tokenizeThai } from './thaiSearch';

const notes = [
  {
    id: 'n1',
    title: 'ประชุมทีมการตลาดวันจันทร์',
    content: 'สรุปแผนเปิดตัวสินค้าใหม่และงบประมาณโฆษณา',
  },
  {
    id: 'n2',
    title: 'รายการซื้อของ',
    content: 'นม ไข่ ข้าวสาร และผักสด',
  },
  {
    id: 'n3',
    title: 'Weekly review',
    content: 'ทบทวนเป้าหมายสัปดาห์และงานค้าง',
  },
];

describe('Thai search', () => {
  it('segments Thai sentences into words', () => {
    const tokens = tokenizeThai('ประชุมทีมการตลาดวันจันทร์');
    expect(tokens).toContain('ประชุม');
    expect(tokens).toContain('การตลาด');
  });

  it('finds notes by a Thai word inside a sentence', () => {
    const index = createNoteSearchIndex(notes);
    const hits = searchNotes(index, 'การตลาด');
    expect(hits.map((hit) => hit.id)).toEqual(['n1']);
  });

  it('supports prefix search while typing', () => {
    const index = createNoteSearchIndex(notes);
    const hits = searchNotes(index, 'ประชุ');
    expect(hits.map((hit) => hit.id)).toContain('n1');
  });

  it('finds Latin words case-insensitively', () => {
    const index = createNoteSearchIndex(notes);
    expect(searchNotes(index, 'weekly').map((hit) => hit.id)).toEqual(['n3']);
  });

  it('returns no hits for blank or unrelated queries', () => {
    const index = createNoteSearchIndex(notes);
    expect(searchNotes(index, '   ')).toEqual([]);
    expect(searchNotes(index, 'เรือดำน้ำ')).toEqual([]);
  });

  it('returns longest terms first for highlighting', () => {
    const terms = highlightedTerms('ประชุม การตลาด ประชุม');
    expect(terms[0].length).toBeGreaterThanOrEqual(terms[terms.length - 1].length);
    expect(new Set(terms).size).toBe(terms.length);
  });
});
