export type TextChunk = {
  content: string;
  index: number;
  charStart: number;
  charEnd: number;
};

export type ChunkOptions = {
  /** Soft max characters per chunk (default 800). */
  maxChars?: number;
  /** Overlap between consecutive hard-split chunks (default 100). */
  overlapChars?: number;
};

const DEFAULT_MAX = 800;
const DEFAULT_OVERLAP = 100;

/**
 * Split full article text into multiple non-empty chunks for hybrid RAG.
 * Prefers paragraph boundaries; falls back to size windows with overlap.
 */
export function chunkFullText(
  fullText: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX;
  const overlapChars = Math.min(
    options.overlapChars ?? DEFAULT_OVERLAP,
    Math.max(0, maxChars - 1),
  );
  const text = fullText.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  if (text.length <= maxChars) {
    return [
      {
        content: text,
        index: 0,
        charStart: 0,
        charEnd: text.length,
      },
    ];
  }

  const paragraphs = splitKeepingOffsets(text, /\n\s*\n/g);
  const packed: Array<{ content: string; charStart: number; charEnd: number }> =
    [];

  let buf = "";
  let bufStart = 0;
  let bufEnd = 0;

  const flush = () => {
    const content = buf.trim();
    if (!content) {
      buf = "";
      return;
    }
    // Map trimmed content back toward original span as best-effort.
    packed.push({ content, charStart: bufStart, charEnd: bufEnd });
    buf = "";
  };

  for (const para of paragraphs) {
    const piece = para.text.trim();
    if (!piece) continue;

    if (piece.length > maxChars) {
      flush();
      for (const window of hardWindows(piece, maxChars, overlapChars)) {
        const absStart = para.start + window.localStart;
        packed.push({
          content: window.content,
          charStart: absStart,
          charEnd: absStart + window.content.length,
        });
      }
      continue;
    }

    if (!buf) {
      buf = piece;
      bufStart = para.start;
      bufEnd = para.end;
      continue;
    }

    const candidate = `${buf}\n\n${piece}`;
    if (candidate.length <= maxChars) {
      buf = candidate;
      bufEnd = para.end;
    } else {
      flush();
      buf = piece;
      bufStart = para.start;
      bufEnd = para.end;
    }
  }
  flush();

  // If packing somehow left a single oversized block, hard-split it.
  const expanded: Array<{ content: string; charStart: number; charEnd: number }> =
    [];
  for (const block of packed) {
    if (block.content.length <= maxChars) {
      expanded.push(block);
      continue;
    }
    for (const window of hardWindows(block.content, maxChars, overlapChars)) {
      expanded.push({
        content: window.content,
        charStart: block.charStart + window.localStart,
        charEnd: block.charStart + window.localStart + window.content.length,
      });
    }
  }

  return expanded
    .filter((item) => item.content.trim().length > 0)
    .map((item, index) => ({
      content: item.content.trim(),
      index,
      charStart: item.charStart,
      charEnd: item.charEnd,
    }));
}

function splitKeepingOffsets(
  text: string,
  re: RegExp,
): Array<{ text: string; start: number; end: number }> {
  const parts: Array<{ text: string; start: number; end: number }> = [];
  let last = 0;
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    parts.push({ text: text.slice(last, match.index), start: last, end: match.index });
    last = match.index + match[0].length;
  }
  parts.push({ text: text.slice(last), start: last, end: text.length });
  return parts;
}

function hardWindows(
  text: string,
  maxChars: number,
  overlapChars: number,
): Array<{ content: string; localStart: number }> {
  const windows: Array<{ content: string; localStart: number }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      // Prefer break on whitespace near the end of the window.
      const slice = text.slice(start, end);
      const breakAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
      if (breakAt > maxChars * 0.5) {
        end = start + breakAt;
      }
    }
    const content = text.slice(start, end).trim();
    if (content) {
      windows.push({ content, localStart: start });
    }
    if (end >= text.length) break;
    const next = end - overlapChars;
    start = next <= start ? end : next;
  }
  return windows;
}
