import { describe, expect, it } from 'vitest';
import { sortTreeNotes } from '../components/FolderTree';
import type { NoteRecord } from '@/services';

function makeNote(overrides: Partial<NoteRecord>): NoteRecord {
  return {
    id: 'n-1',
    title: 'Alpha',
    content: '',
    folderId: null,
    isFavorite: false,
    isDaily: false,
    createdAt: '2026-11-27T00:00:00.000Z',
    updatedAt: '2026-11-27T00:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

describe('sortTreeNotes', () => {
  it('pins starred notes above unstarred notes while preserving alphabetical order within each group', () => {
    const notes: NoteRecord[] = [
      makeNote({ id: '1', title: 'Alpha', isFavorite: false }),
      makeNote({ id: '2', title: 'Zebra', isFavorite: true }),
      makeNote({ id: '3', title: 'Beta', isFavorite: true }),
      makeNote({ id: '4', title: 'Charlie', isFavorite: false }),
    ];

    const sorted = sortTreeNotes(notes);
    expect(sorted.map((n) => n.title)).toEqual([
      'Beta',
      'Zebra',
      'Alpha',
      'Charlie',
    ]);
  });
});
