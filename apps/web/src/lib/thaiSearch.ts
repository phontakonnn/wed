import MiniSearch, { type SearchResult } from 'minisearch';

export interface SearchableNote {
  id: string;
  title: string;
  content: string;
  updatedAt?: number;
  categoryIds?: string[];
  tagIds?: string[];
}

export interface NoteSearchHit {
  id: string;
  title: string;
  score: number;
  match: Record<string, string[]>;
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('th', { granularity: 'word' })
    : null;

// Thai vowels and tone marks are combining marks (\p{M}), not letters, so they
// must be kept inside a chunk or words are split at every vowel.
const CHUNK_SEPARATOR = /[^\p{L}\p{N}\p{M}]+/u;

function normalizedChunks(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(CHUNK_SEPARATOR)
    .filter(Boolean);
}

/**
 * Intl.Segmenter is dictionary-based, but Thai dictionaries split compounds
 * such as "การตลาด" into "การ" + "ตลาด". Indexing adjacent word pairs (and
 * triples) keeps those compounds searchable without pulling in a large Thai
 * dictionary at runtime.
 */
function segmentWords(chunk: string): string[] {
  if (segmenter) {
    return [...segmenter.segment(chunk)]
      .filter((part) => part.isWordLike)
      .map((part) => part.segment.trim())
      .filter(Boolean);
  }

  if (/^[\u0E00-\u0E7F]+$/.test(chunk)) {
    const chars = [...chunk];
    const fallback: string[] = [chunk];
    for (let index = 0; index < chars.length; index += 1) {
      fallback.push(chars[index]);
      if (index + 1 < chars.length) fallback.push(chars[index] + chars[index + 1]);
    }
    return fallback;
  }

  return [chunk];
}

/**
 * Terms stored in the index: every whitespace/punctuation-delimited chunk, its
 * segmented words, and adjacent 2–3 word compounds. Whole chunks make exact
 * sentence queries work; compounds make Thai words that the segmenter splits
 * (for example "การตลาด") findable.
 */
export function tokenizeThai(text: string): string[] {
  const tokens = new Set<string>();
  for (const chunk of normalizedChunks(text)) {
    tokens.add(chunk);
    const words = segmentWords(chunk);
    for (const word of words) tokens.add(word);
    for (let index = 0; index < words.length - 1; index += 1) {
      tokens.add(words[index] + words[index + 1]);
      if (index < words.length - 2) tokens.add(words[index] + words[index + 1] + words[index + 2]);
    }
  }
  return [...tokens];
}

/**
 * Query terms stay as whole chunks so a partially typed Thai word such as
 * "ประชุ" can prefix-match the indexed word "ประชุม". Splitting a query into
 * the segmenter's pieces would require every piece to match and break typing
 * before a word boundary is reached.
 */
function tokenizeQuery(text: string): string[] {
  return normalizedChunks(text);
}

export function createNoteSearchIndex(notes: SearchableNote[]): MiniSearch<SearchableNote> {
  const index = new MiniSearch<SearchableNote>({
    fields: ['title', 'content'],
    storeFields: ['title', 'updatedAt'],
    tokenize: tokenizeThai,
    searchOptions: {
      boost: { title: 2 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
      tokenize: tokenizeQuery,
    },
  });
  index.addAll(notes);
  return index;
}

export function searchNotes(index: MiniSearch<SearchableNote>, query: string, limit = 30): NoteSearchHit[] {
  const normalized = query.normalize('NFC').trim();
  if (!normalized) return [];
  const results: SearchResult[] = index.search(normalized);
  return results.slice(0, limit).map((result) => ({
    id: String(result.id),
    title: String(result.title ?? ''),
    score: result.score,
    match: result.match,
  }));
}

/** Small helper used by the highlight renderer. */
export function highlightedTerms(query: string): string[] {
  return [...new Set(tokenizeThai(query))].sort((left, right) => right.length - left.length);
}
