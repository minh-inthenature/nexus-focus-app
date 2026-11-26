import {
  CATEGORY_LABELS,
  formatEventTimeRangeLabel,
  getEventDateRange,
} from '@/features/calendar/utils/calendarDateUtils';
import type {
  CalendarEventRecord,
  FolderRecord,
  NoteRecord,
  TaskRecord,
} from '@/services/storage/db';

export interface SearchHit {
  readonly id: string;
  readonly type: 'note' | 'task' | 'event';
  readonly entityId: string;
  readonly title: string;
  readonly context: string;
  readonly to: string;
  readonly score: number;
}

export interface GroupedWorkspaceSearchResults {
  readonly notes: readonly SearchHit[];
  readonly tasks: readonly SearchHit[];
  readonly events: readonly SearchHit[];
  readonly totalCount: number;
}

export interface HighlightSegment {
  readonly text: string;
  readonly matched: boolean;
}

function buildMatchSnippet(text: string, normalizedQuery: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  const idx = collapsed.toLowerCase().indexOf(normalizedQuery);
  if (idx === -1) {
    return collapsed.slice(0, 96) + (collapsed.length > 96 ? '…' : '');
  }
  const start = Math.max(0, idx - 28);
  const end = Math.min(collapsed.length, idx + normalizedQuery.length + 52);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < collapsed.length ? '…' : '';
  return `${prefix}${collapsed.slice(start, end)}${suffix}`;
}

/**
 * Splits `text` into matched and unmatched segments safely without HTML injection.
 */
export function highlightMatchSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const q = query.trim();
  if (!q) return [{ text, matched: false }];

  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const matchIdx = lowerText.indexOf(lowerQ, cursor);
    if (matchIdx === -1) {
      segments.push({ text: text.slice(cursor), matched: false });
      break;
    }
    if (matchIdx > cursor) {
      segments.push({ text: text.slice(cursor, matchIdx), matched: false });
    }
    segments.push({
      text: text.slice(matchIdx, matchIdx + q.length),
      matched: true,
    });
    cursor = matchIdx + q.length;
  }

  return segments.length > 0 ? segments : [{ text, matched: false }];
}

export interface SearchWorkspaceInput {
  readonly query: string;
  readonly notes: readonly NoteRecord[];
  readonly folders?: readonly FolderRecord[];
  readonly noteTagsMap?: ReadonlyMap<string, readonly string[]>;
  readonly tasks: readonly TaskRecord[];
  readonly events: readonly CalendarEventRecord[];
  readonly maxPerGroup?: number;
}

/**
 * Searches offline across local Notes (title, Markdown content, tags),
 * Tasks (title, description, tags, category), and Calendar Events
 * (title, description, location). Never leaves the user's device.
 */
export function searchWorkspace({
  query,
  notes,
  folders = [],
  noteTagsMap,
  tasks,
  events,
  maxPerGroup = 8,
}: SearchWorkspaceInput): GroupedWorkspaceSearchResults {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { notes: [], tasks: [], events: [], totalCount: 0 };
  }

  const folderNameMap = new Map(folders.map((f) => [f.id, f.name]));

  // 1. Notes
  const noteHits: SearchHit[] = [];
  for (const note of notes) {
    const titleLower = note.title.toLowerCase();
    const contentLower = note.content.toLowerCase();
    const tags = noteTagsMap?.get(note.id) ?? [];
    const matchingTags = tags.filter((t) =>
      t.toLowerCase().includes(normalized.replace(/^#/, '')),
    );

    const titleMatched = titleLower.includes(normalized);
    const contentMatched = contentLower.includes(normalized);
    const tagMatched = matchingTags.length > 0;

    if (!titleMatched && !contentMatched && !tagMatched) continue;

    let score = 0;
    if (titleLower === normalized) score += 100;
    else if (titleMatched) score += 60;
    if (tagMatched) score += 30;
    if (contentMatched) score += 20;

    const folderLabel = note.folderId
      ? folderNameMap.get(note.folderId)
      : undefined;
    const contextParts: string[] = [];
    if (folderLabel) contextParts.push(folderLabel);
    if (tagMatched) {
      contextParts.push(matchingTags.map((t) => `#${t}`).join(' '));
    }
    if (contentMatched) {
      contextParts.push(buildMatchSnippet(note.content, normalized));
    } else if (!contextParts.length) {
      contextParts.push(buildMatchSnippet(note.content, normalized) || 'Note');
    }

    noteHits.push({
      id: `note-${note.id}`,
      type: 'note',
      entityId: note.id,
      title: note.title,
      context: contextParts.join(' · '),
      to: `/notes/${note.id}`,
      score,
    });
  }

  // 2. Tasks
  const taskHits: SearchHit[] = [];
  for (const task of tasks) {
    const titleLower = task.title.toLowerCase();
    const descLower = (task.description ?? '').toLowerCase();
    const catLower = (task.category ?? '').toLowerCase();
    const matchingTags = task.tags.filter((t) =>
      t.toLowerCase().includes(normalized.replace(/^#/, '')),
    );

    const titleMatched = titleLower.includes(normalized);
    const descMatched = descLower.includes(normalized);
    const catMatched = catLower.includes(normalized);
    const tagMatched = matchingTags.length > 0;

    if (!titleMatched && !descMatched && !catMatched && !tagMatched) continue;

    let score = 0;
    if (titleLower === normalized) score += 100;
    else if (titleMatched) score += 60;
    if (descMatched) score += 25;
    if (tagMatched || catMatched) score += 20;

    const contextParts: string[] = [
      task.status === 'done'
        ? 'Completed'
        : task.dueDate
          ? `Due ${task.dueDate}`
          : task.priority,
    ];
    if (descMatched && task.description) {
      contextParts.push(buildMatchSnippet(task.description, normalized));
    } else if (task.category) {
      contextParts.push(task.category);
    }

    taskHits.push({
      id: `task-${task.id}`,
      type: 'task',
      entityId: task.id,
      title: task.title,
      context: contextParts.join(' · '),
      to: `/tasks?taskId=${task.id}`,
      score,
    });
  }

  // 3. Calendar Events
  const eventHits: SearchHit[] = [];
  for (const ev of events) {
    const titleLower = ev.title.toLowerCase();
    const descLower = (ev.description ?? '').toLowerCase();
    const locLower = (ev.location ?? '').toLowerCase();

    const titleMatched = titleLower.includes(normalized);
    const descMatched = descLower.includes(normalized);
    const locMatched = locLower.includes(normalized);

    if (!titleMatched && !descMatched && !locMatched) continue;

    let score = 0;
    if (titleLower === normalized) score += 100;
    else if (titleMatched) score += 60;
    if (locMatched) score += 25;
    if (descMatched) score += 20;

    const { startDateKey } = getEventDateRange(ev);
    const contextParts: string[] = [
      `${startDateKey} (${formatEventTimeRangeLabel(ev)})`,
      CATEGORY_LABELS[ev.category],
    ];
    if (locMatched && ev.location) {
      contextParts.push(ev.location);
    } else if (descMatched && ev.description) {
      contextParts.push(buildMatchSnippet(ev.description, normalized));
    }

    eventHits.push({
      id: `event-${ev.id}`,
      type: 'event',
      entityId: ev.id,
      title: ev.title,
      context: contextParts.join(' · '),
      to: `/calendar?date=${startDateKey}&eventId=${ev.id}`,
      score,
    });
  }

  const sortAndSlice = (hits: SearchHit[]) =>
    hits.sort((a, b) => b.score - a.score).slice(0, maxPerGroup);

  const groupedNotes = sortAndSlice(noteHits);
  const groupedTasks = sortAndSlice(taskHits);
  const groupedEvents = sortAndSlice(eventHits);

  return {
    notes: groupedNotes,
    tasks: groupedTasks,
    events: groupedEvents,
    totalCount:
      groupedNotes.length + groupedTasks.length + groupedEvents.length,
  };
}
