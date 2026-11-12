/** A chunk is cut at a break at or after this many characters, when one exists… */
export const CHUNK_MIN_CHARS = 800;
/** …and is never longer than this. */
export const CHUNK_MAX_CHARS = 1000;
/** Roughly how many characters each chunk repeats from the end of the one before. */
export const CHUNK_OVERLAP_CHARS = 150;

/** Break kinds in order of preference: paragraph, sentence end, line, word. */
const BREAKS: RegExp[] = [/\n\s*\n/g, /[.!?…]["')\]]*\s/g, /\n/g, /\s/g];

/**
 * Splits text into chunks of about CHUNK_MIN_CHARS–CHUNK_MAX_CHARS characters,
 * each overlapping the previous one by about CHUNK_OVERLAP_CHARS. Cuts at the
 * best break in the window (paragraph, then sentence, then line, then word);
 * text with no break at all is cut hard at CHUNK_MAX_CHARS. Chunks are trimmed
 * and empty ones dropped. Pure.
 */
export function chunkText(input: string): string[] {
  const text = input.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_MAX_CHARS, text.length);
    if (end < text.length) end = cutPoint(text, start, end);

    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;

    start = overlapStart(text, start, end);
  }
  return chunks;
}

/** Where to end a chunk that starts at `start` and may run to `limit` (exclusive). */
function cutPoint(text: string, start: number, limit: number): number {
  const window = text.slice(start, limit);
  const min = CHUNK_MIN_CHARS;
  for (const pattern of BREAKS) {
    let best = -1;
    for (const m of window.matchAll(pattern)) {
      const after = m.index + m[0].length;
      if (after >= min) best = after;
    }
    if (best > 0) return start + best;
  }
  // No break: hard cut, but never between the halves of a surrogate pair.
  return isHighSurrogate(text.charCodeAt(limit - 1)) ? limit - 1 : limit;
}

/** Start of the next chunk: about CHUNK_OVERLAP_CHARS before `end`, moved forward to a word start. */
function overlapStart(text: string, prevStart: number, end: number): number {
  let next = Math.max(end - CHUNK_OVERLAP_CHARS, prevStart + 1);
  const space = text.slice(next, end).search(/\s/);
  // Start after the first space in the overlap so we don't begin mid-word.
  if (space >= 0) next += space + 1;
  else if (isLowSurrogate(text.charCodeAt(next))) next += 1;
  return Math.min(next, end);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
