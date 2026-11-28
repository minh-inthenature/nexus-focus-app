import { describe, expect, it } from 'vitest';
import { getNoteType } from '@/features/notes/utils/codeNote';
import {
  applyPlainTextTab,
  countTextMetrics,
  isTextFileName,
  isTextNote,
  togglePlainTextLinePrefix,
} from '@/features/notes/utils/textNote';

describe('plain text note utilities', () => {
  it('detects .txt file extensions accurately', () => {
    expect(isTextFileName('scratchpad.txt')).toBe(true);
    expect(isTextFileName('  Draft Notes.TXT  ')).toBe(true);
    expect(isTextFileName('notes.md')).toBe(false);
    expect(isTextFileName('script.ts')).toBe(false);
    expect(isTextFileName('txt')).toBe(false);
    expect(isTextFileName('')).toBe(false);
  });

  it('identifies text note records and resolves note types', () => {
    expect(isTextNote({ type: 'text' })).toBe(true);
    expect(isTextNote({ type: 'markdown' })).toBe(false);
    expect(isTextNote({ type: 'code' })).toBe(false);
    expect(isTextNote({ type: 'canvas' })).toBe(false);
    expect(isTextNote(null)).toBe(false);
    expect(isTextNote(undefined)).toBe(false);

    expect(getNoteType({ type: 'text' })).toBe('text');
    expect(getNoteType({ type: 'markdown' })).toBe('markdown');
    expect(getNoteType({ type: 'code' })).toBe('code');
    expect(getNoteType({ type: 'canvas' })).toBe('canvas');
    expect(getNoteType(undefined)).toBe('markdown');
  });

  it('counts lines including multiple blank lines and Vietnamese text', () => {
    expect(countTextMetrics('')).toEqual({ lines: 0, words: 0, chars: 0 });
    expect(countTextMetrics('Đề 1\n\n\nNối song song')).toEqual({
      lines: 4,
      words: 5,
      chars: 20,
    });
  });

  it('handles Tab indentation and Shift+Tab outdentation cleanly', () => {
    const inserted = applyPlainTextTab('# Heading\n*star*', 10, 10, false);
    expect(inserted.value).toBe('# Heading\n  *star*');
    expect(inserted.selectionStart).toBe(12);
    expect(inserted.selectionEnd).toBe(12);

    const multi = applyPlainTextTab('alpha\nbeta\ngamma', 0, 10, false);
    expect(multi.value).toBe('  alpha\n  beta\ngamma');
    expect(multi.selectionStart).toBe(2);
    expect(multi.selectionEnd).toBe(14);

    const outdented = applyPlainTextTab('  alpha\n  beta\ngamma', 2, 14, true);
    expect(outdented.value).toBe('alpha\nbeta\ngamma');
    expect(outdented.selectionStart).toBe(0);
    expect(outdented.selectionEnd).toBe(10);
  });

  it('toggles plain bullet and checklist prefixes while keeping indentation', () => {
    const added = togglePlainTextLinePrefix('  first item', 12, 12, '• ');
    expect(added.value).toBe('  • first item');
    expect(added.selectionStart).toBe(14);

    const toggledOff = togglePlainTextLinePrefix(
      added.value,
      added.selectionStart,
      added.selectionEnd,
      '• ',
    );
    expect(toggledOff.value).toBe('  first item');
    expect(toggledOff.selectionStart).toBe(12);

    const checklist = togglePlainTextLinePrefix('Task A\n\nTask B', 0, 14, '☐ ');
    expect(checklist.value).toBe('☐ Task A\n\n☐ Task B');
  });
});
