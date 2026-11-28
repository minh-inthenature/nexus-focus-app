import type { NoteRecord } from '@/services/storage/db';

const TEXT_EXT_RE = /\.txt$/i;

/**
 * Returns true if the filename explicitly uses the `.txt` plain-text extension.
 */
export function isTextFileName(title: string): boolean {
  return TEXT_EXT_RE.test(title.trim());
}

/**
 * Returns true when a note is a plain-text writing note (`type: 'text'`).
 */
export function isTextNote(note?: Pick<NoteRecord, 'type'> | null): boolean {
  return note?.type === 'text';
}

export interface TextEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface PlainTextMetrics {
  lines: number;
  words: number;
  chars: number;
}

/**
 * Counts lines, whitespace-delimited words, and characters in plain text.
 */
export function countTextMetrics(content: string): PlainTextMetrics {
  if (!content) {
    return { lines: 0, words: 0, chars: 0 };
  }
  const lines = content.split(/\r\n|\r|\n/).length;
  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    lines,
    words,
    chars: content.length,
  };
}

function getSelectedLineBlockBounds(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number; blockStart: number; blockEnd: number } {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.min(value.length, Math.max(selectionStart, selectionEnd));
  const blockStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const searchFrom = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nextNewline = value.indexOf('\n', searchFrom);
  const blockEnd = nextNewline === -1 ? value.length : nextNewline;
  return { start, end, blockStart, blockEnd };
}

/**
 * Handles Tab / Shift+Tab indentation inside plain-text editors instead of
 * moving DOM focus away from the writing surface.
 */
export function applyPlainTextTab(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  shiftKey: boolean,
  indentUnit = '  ',
): TextEditResult {
  const { start, end, blockStart, blockEnd } = getSelectedLineBlockBounds(
    value,
    selectionStart,
    selectionEnd,
  );
  const selectedSlice = value.slice(start, end);

  if (!shiftKey && (start === end || !selectedSlice.includes('\n'))) {
    const nextValue = value.slice(0, start) + indentUnit + value.slice(end);
    const caret = start + indentUnit.length;
    return {
      value: nextValue,
      selectionStart: caret,
      selectionEnd: caret,
    };
  }

  const lines = value.slice(blockStart, blockEnd).split('\n');

  if (!shiftKey) {
    const updatedBlock = lines.map((line) => `${indentUnit}${line}`).join('\n');
    return {
      value: value.slice(0, blockStart) + updatedBlock + value.slice(blockEnd),
      selectionStart: start + indentUnit.length,
      selectionEnd: end + lines.length * indentUnit.length,
    };
  }

  const outdentRegex = new RegExp(`^(?: {1,${indentUnit.length}}|\\t)`);
  let firstLineRemoved = 0;
  let totalRemoved = 0;

  const updatedBlock = lines
    .map((line, index) => {
      const match = line.match(outdentRegex);
      const removed = match ? match[0].length : 0;
      if (index === 0) {
        firstLineRemoved = removed;
      }
      totalRemoved += removed;
      return line.slice(removed);
    })
    .join('\n');

  const nextStart =
    start - Math.min(firstLineRemoved, Math.max(0, start - blockStart));
  const nextEnd = Math.max(nextStart, end - totalRemoved);

  return {
    value: value.slice(0, blockStart) + updatedBlock + value.slice(blockEnd),
    selectionStart: nextStart,
    selectionEnd: nextEnd,
  };
}

/**
 * Inserts or toggles a non-Markdown line prefix (e.g. `• ` or `☐ `) across
 * the current line or multi-line selection while preserving leading indentation.
 */
export function togglePlainTextLinePrefix(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
): TextEditResult {
  const { start, end, blockStart, blockEnd } = getSelectedLineBlockBounds(
    value,
    selectionStart,
    selectionEnd,
  );
  const lines = value.slice(blockStart, blockEnd).split('\n');
  const isSingleLine = lines.length === 1;
  const candidateLines = isSingleLine
    ? lines
    : lines.filter((line) => line.trim().length > 0);
  const targetLines = candidateLines.length > 0 ? candidateLines : lines;

  const allHavePrefix = targetLines.every((line) => {
    const indentLen = line.match(/^[\t ]*/)?.[0].length ?? 0;
    return line.slice(indentLen).startsWith(prefix);
  });

  let firstLineDelta = 0;
  let totalDelta = 0;

  const updatedBlock = lines
    .map((line, index) => {
      if (!isSingleLine && line.trim().length === 0) {
        return line;
      }
      const indent = line.match(/^[\t ]*/)?.[0] ?? '';
      const rest = line.slice(indent.length);
      let nextLine: string;
      let delta: number;

      if (allHavePrefix) {
        nextLine = indent + rest.slice(prefix.length);
        delta = -prefix.length;
      } else {
        nextLine = indent + prefix + rest;
        delta = prefix.length;
      }

      if (index === 0) {
        firstLineDelta = delta;
      }
      totalDelta += delta;
      return nextLine;
    })
    .join('\n');

  const nextStart = Math.max(blockStart, start + firstLineDelta);
  const nextEnd = Math.max(nextStart, end + totalDelta);

  return {
    value: value.slice(0, blockStart) + updatedBlock + value.slice(blockEnd),
    selectionStart: nextStart,
    selectionEnd: nextEnd,
  };
}
