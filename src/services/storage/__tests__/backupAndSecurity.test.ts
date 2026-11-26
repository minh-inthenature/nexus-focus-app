import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  buildAllDayRange,
  buildTimedRange,
} from '@/features/calendar/utils/calendarDateUtils';
import {
  MAX_LOCAL_ATTACHMENT_BYTES,
  sanitizeAttachmentFileName,
  validateAttachmentFile,
} from '../attachment.service';
import {
  buildFullBackupZipBlob,
  inspectBackupArchive,
  NEXUS_BACKUP_FORMAT,
  NEXUS_BACKUP_SCHEMA_VERSION,
} from '../backup.service';
import type {
  AttachmentRecord,
  CalendarEventRecord,
  FolderRecord,
  NoteRecord,
  TaskRecord,
} from '../db';

describe('Attachment filename & payload security validation', () => {
  it('strips directory traversal segments and unsafe filename characters', () => {
    expect(sanitizeAttachmentFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeAttachmentFileName('C:\\Windows\\system32\\cmd.pdf')).toBe(
      'cmd.pdf',
    );
    expect(sanitizeAttachmentFileName('  diagram <1>?.png  ')).toBe(
      'diagram 1.png',
    );
  });

  it('rejects empty files, oversized payloads, and HTML/script uploads while accepting safe binaries', () => {
    expect(() =>
      validateAttachmentFile(new Blob([]), 'empty.png'),
    ).toThrow(/empty/i);

    const oversized = {
      size: MAX_LOCAL_ATTACHMENT_BYTES + 1,
      type: 'image/png',
    };
    expect(() => validateAttachmentFile(oversized, 'huge.png')).toThrow(
      /10 MB/i,
    );

    const htmlPayload = new Blob(['<script>alert(1)</script>'], {
      type: 'text/html',
    });
    expect(() => validateAttachmentFile(htmlPayload, 'xss.html')).toThrow(
      /not permitted/i,
    );

    const jsExtensionPayload = new Blob(['console.log(1)'], {
      type: 'text/plain',
    });
    expect(() =>
      validateAttachmentFile(jsExtensionPayload, 'payload.js'),
    ).toThrow(/not permitted/i);

    const validPng = new Blob([new Uint8Array([137, 80, 78, 71])], {
      type: 'image/png',
    });
    expect(() => validateAttachmentFile(validPng, 'diagram.png')).not.toThrow();
  });
});

describe('Full portable ZIP backup generation & validation', () => {
  it('exports manifest, portable Markdown notes, attachments, folders, tasks, events, and safe settings cleanly', async () => {
    const folders: FolderRecord[] = [
      {
        id: 'folder-1',
        name: 'Research',
        parentId: null,
        revision: 1,
        createdAt: '2026-11-25T08:00:00.000Z',
        updatedAt: '2026-11-25T08:00:00.000Z',
      },
    ];
    const attachments: AttachmentRecord[] = [
      {
        id: 'att-1',
        noteId: 'note-1',
        fileName: 'diagram.png',
        mimeType: 'image/png',
        size: 4,
        data: new Blob([new Uint8Array([137, 80, 78, 71])], {
          type: 'image/png',
        }),
        createdAt: '2026-11-25T08:05:00.000Z',
      },
    ];
    const notes: NoteRecord[] = [
      {
        id: 'note-1',
        folderId: 'folder-1',
        title: 'Consensus Spec',
        content: '# Raft\n\n![diagram](nexus-attachment://att-1)',
        isFavorite: true,
        isDaily: false,
        revision: 2,
        createdAt: '2026-11-25T08:00:00.000Z',
        updatedAt: '2026-11-25T08:10:00.000Z',
      },
    ];
    const tasks: TaskRecord[] = [
      {
        id: 'task-1',
        userId: 'user-1',
        title: 'Submit Spec',
        status: 'todo',
        priority: 'high',
        dueDate: '2026-11-26',
        tags: ['research'],
        linkedNoteIds: ['note-1'],
        createdAt: '2026-11-25T08:00:00.000Z',
        updatedAt: '2026-11-25T08:00:00.000Z',
        revision: 1,
      },
    ];
    const timed = buildTimedRange('2026-11-25', '10:00', '2026-11-25', '11:00');
    const calendarEvents: CalendarEventRecord[] = [
      {
        id: 'ev-1',
        userId: 'user-1',
        title: 'Spec Walkthrough',
        startAt: timed.startAt,
        endAt: timed.endAt,
        allDay: false,
        category: 'meeting',
        linkedNoteIds: ['note-1'],
        linkedTaskIds: ['task-1'],
        createdAt: '2026-11-25T08:00:00.000Z',
        updatedAt: '2026-11-25T08:00:00.000Z',
        revision: 1,
      },
      {
        id: 'ev-allday',
        userId: 'user-1',
        title: 'Workshop',
        ...buildAllDayRange('2026-11-27', '2026-11-27'),
        allDay: true,
        category: 'study',
        linkedNoteIds: [],
        linkedTaskIds: [],
        createdAt: '2026-11-25T08:00:00.000Z',
        updatedAt: '2026-11-25T08:00:00.000Z',
        revision: 1,
      },
    ];

    const { blob, manifest } = await buildFullBackupZipBlob({
      folders,
      notes,
      attachments,
      tasks,
      calendarEvents,
      settings: { themePreference: 'dark' },
    });

    expect(manifest.format).toBe(NEXUS_BACKUP_FORMAT);
    expect(manifest.schemaVersion).toBe(NEXUS_BACKUP_SCHEMA_VERSION);
    expect(manifest.counts).toEqual({
      notes: 1,
      folders: 1,
      attachments: 1,
      tasks: 1,
      calendarEvents: 2,
    });

    const buffer = await blob.arrayBuffer();
    const rawZip = await JSZip.loadAsync(buffer);
    const portableMd = await rawZip
      .file('notes/Research/Consensus Spec.md')
      ?.async('string');
    expect(portableMd).toContain('../../attachments/att-1-diagram.png');

    const inspected = await inspectBackupArchive(buffer);
    expect(inspected.warnings).toEqual([]);
    expect(inspected.notes).toHaveLength(1);
    expect(inspected.tasks[0]?.title).toBe('Submit Spec');
    expect(inspected.calendarEvents).toHaveLength(2);
    expect(inspected.binaryBlobsByAttachmentId.get('att-1')?.size).toBe(4);
    expect(inspected.settings.themePreference).toBe('dark');
  });

  it('rejects non-Nexus or invalid schema ZIP archives before altering local state', async () => {
    const badZip = new JSZip();
    badZip.file(
      'manifest.json',
      JSON.stringify({ format: 'wrong-format', schemaVersion: 1 }),
    );
    const bytes = await badZip.generateAsync({ type: 'uint8array' });

    await expect(inspectBackupArchive(bytes)).rejects.toThrow(
      /unrecognized manifest format/i,
    );

    const invalidDateZip = new JSZip();
    invalidDateZip.file(
      'manifest.json',
      JSON.stringify({ format: NEXUS_BACKUP_FORMAT, schemaVersion: 1 }),
    );
    invalidDateZip.file('data/folders.json', '[]');
    invalidDateZip.file('data/notes.json', '[]');
    invalidDateZip.file('data/tasks.json', '[]');
    invalidDateZip.file('data/attachments.json', '[]');
    invalidDateZip.file(
      'data/calendar_events.json',
      JSON.stringify([
        {
          id: 'bad-ev',
          title: 'Reversed',
          startAt: '2026-11-26T10:00:00.000Z',
          endAt: '2026-11-25T10:00:00.000Z',
        },
      ]),
    );
    const badEventBytes = await invalidDateZip.generateAsync({
      type: 'uint8array',
    });

    await expect(inspectBackupArchive(badEventBytes)).rejects.toThrow(
      /malformed record/i,
    );
  });
});
