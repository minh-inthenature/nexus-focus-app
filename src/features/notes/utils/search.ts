import type { FolderRecord, NoteRecord } from '@/services/storage/db';

export interface NoteSearchResult {
  readonly note: NoteRecord;
  readonly tags: readonly string[];
  readonly snippet: string;
  readonly matchSource: 'title' | 'tag' | 'content' | 'filter';
  readonly score: number;
}

export interface SearchNotesOptions {
  readonly notes: readonly NoteRecord[];
  readonly folders: readonly FolderRecord[];
  readonly noteTagsMap: ReadonlyMap<string, readonly string[]>;
  readonly query: string;
  readonly tagFilter?: string | null;
  readonly folderFilterId?: string | null;
}

function collectDescendantFolderIds(
  rootFolderId: string,
  folders: readonly FolderRecord[],
): Set<string> {
  const included = new Set<string>([rootFolderId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of folders) {
      if (folder.parentId && included.has(folder.parentId) && !included.has(folder.id)) {
        included.add(folder.id);
        added = true;
      }
    }
  }
  return included;
}

function buildContentSnippet(content: string, queryLower: string): string {
  const singleLine = content.replace(/\s+/g, ' ').trim();
  if (!singleLine) return 'Empty note';

  if (!queryLower) {
    return singleLine.length > 110 ? `${singleLine.slice(0, 110)}…` : singleLine;
  }

  const idx = singleLine.toLowerCase().indexOf(queryLower);
  if (idx === -1) {
    return singleLine.length > 110 ? `${singleLine.slice(0, 110)}…` : singleLine;
  }

  const start = Math.max(0, idx - 36);
  const end = Math.min(singleLine.length, idx + queryLower.length + 64);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < singleLine.length ? '…' : '';
  return `${prefix}${singleLine.slice(start, end)}${suffix}`;
}

/**
 * Offline full-text local search across note titles, Markdown content, and tags
 * with optional folder (including nested subfolders) and tag filters.
 */
export function searchNotes({
  notes,
  folders,
  noteTagsMap,
  query,
  tagFilter,
  folderFilterId,
}: SearchNotesOptions): NoteSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTag = tagFilter?.trim().toLowerCase() || null;
  const allowedFolderIds = folderFilterId
    ? collectDescendantFolderIds(folderFilterId, folders)
    : null;

  const results: NoteSearchResult[] = [];

  for (const note of notes) {
    if (allowedFolderIds && (!note.folderId || !allowedFolderIds.has(note.folderId))) {
      continue;
    }

    const tags = noteTagsMap.get(note.id) ?? [];
    if (normalizedTag && !tags.includes(normalizedTag)) {
      continue;
    }

    if (!normalizedQuery) {
      results.push({
        note,
        tags,
        snippet: buildContentSnippet(note.content, ''),
        matchSource: 'filter',
        score: 1,
      });
      continue;
    }

    const titleLower = note.title.toLowerCase();
    const contentLower = note.content.toLowerCase();
    const queryWithoutHash = normalizedQuery.startsWith('#')
      ? normalizedQuery.slice(1)
      : normalizedQuery;

    const titleMatch = titleLower.includes(normalizedQuery);
    const tagMatch =
      queryWithoutHash.length > 0 &&
      tags.some((tag) => tag.includes(queryWithoutHash));
    const contentMatch = contentLower.includes(normalizedQuery);

    if (!titleMatch && !tagMatch && !contentMatch) {
      continue;
    }

    let score = 0;
    let matchSource: NoteSearchResult['matchSource'] = 'content';
    if (titleLower === normalizedQuery) {
      score += 100;
      matchSource = 'title';
    } else if (titleMatch) {
      score += 60;
      matchSource = 'title';
    }
    if (tagMatch) {
      score += 40;
      if (matchSource === 'content') matchSource = 'tag';
    }
    if (contentMatch) {
      score += 20;
    }

    results.push({
      note,
      tags,
      snippet: buildContentSnippet(note.content, normalizedQuery),
      matchSource,
      score,
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.note.updatedAt.localeCompare(a.note.updatedAt);
  });

  return results;
}
