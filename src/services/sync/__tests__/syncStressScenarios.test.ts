import { describe, expect, it } from 'vitest';
import type { DriveFileRef } from '@/services/google-drive/drive.service';
import type {
  CalendarEventRecord,
  DriveNoteMappingRecord,
  FolderRecord,
  NoteRecord,
  TaskRecord,
} from '@/services/storage/db';
import { buildSyncPlan } from '../syncPlanner';
import { computeCoalescedOperation } from '../syncQueue';
import type {
  RemoteCalendarEventMetadata,
  RemoteFolderMetadata,
  RemoteNoteMappingMetadata,
  RemoteTaskMetadata,
  SyncChange,
} from '../syncTypes';

const T0 = '2026-11-25T09:00:00.000Z';
const T1 = '2026-11-25T10:00:00.000Z';
const T2 = '2026-11-25T11:00:00.000Z';

function makeDriveFile(overrides: Partial<DriveFileRef> = {}): DriveFileRef {
  return {
    id: 'drive-note-1',
    name: 'Note.md',
    mimeType: 'text/markdown',
    modifiedTime: T1,
    md5Checksum: 'hash-v1',
    ...overrides,
  };
}

describe('Phase 8 Hybrid Synchronization Stress Scenarios', () => {
  it('Scenario A: syncs note creation from Device A -> Device B and propagates edits back', () => {
    const noteA: NoteRecord = {
      id: 'n-shared',
      folderId: null,
      title: 'Shared Note',
      content: 'Version 1 from A',
      isFavorite: false,
      isDaily: false,
      revision: 1,
      createdAt: T0,
      updatedAt: T0,
    };

    const uploadPlanA = buildSyncPlan({
      localNotes: [noteA],
      localFolders: [],
      localAttachments: [],
      localMappings: [],
      pendingChanges: [
        {
          id: 'chg-create-a',
          entityType: 'note',
          entityId: 'n-shared',
          operation: 'create',
          localRevision: 1,
          createdAt: T0,
          status: 'pending',
          retryCount: 0,
        },
      ],
      remoteFolders: [],
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
    });
    expect(uploadPlanA.actions).toEqual([
      { type: 'upload_note', noteId: 'n-shared', changeId: 'chg-create-a' },
    ]);

    const remoteMappingV1: RemoteNoteMappingMetadata = {
      localNoteId: 'n-shared',
      driveFileId: 'drive-note-1',
      driveFolderId: 'drive-folder-root',
      title: 'Shared Note',
      localRevision: 1,
      isFavorite: false,
      isDaily: false,
      lastKnownModifiedTime: T1,
      lastKnownChecksum: 'hash-v1',
      updatedAt: T1,
    };
    const driveV1 = makeDriveFile({ modifiedTime: T1, md5Checksum: 'hash-v1' });

    const pullPlanB = buildSyncPlan({
      localNotes: [],
      localFolders: [],
      localAttachments: [],
      localMappings: [],
      pendingChanges: [],
      remoteFolders: [],
      remoteMappings: [remoteMappingV1],
      remoteAttachments: [],
      driveFiles: [driveV1],
    });
    expect(pullPlanB.actions).toEqual([
      { type: 'download_remote_note', mapping: remoteMappingV1 },
    ]);

    // Now Device B edits -> Drive updates to v2; Device A sees modified remote file cleanly
    const mappingOnA: DriveNoteMappingRecord = {
      id: 'map-a',
      userId: 'u-1',
      localNoteId: 'n-shared',
      driveFileId: 'drive-note-1',
      driveFolderId: 'drive-folder-root',
      lastKnownModifiedTime: T1,
      lastKnownChecksum: 'hash-v1',
      createdAt: T0,
      updatedAt: T1,
    };
    const remoteMappingV2: RemoteNoteMappingMetadata = {
      ...remoteMappingV1,
      localRevision: 2,
      lastKnownModifiedTime: T2,
      lastKnownChecksum: 'hash-v2',
      updatedAt: T2,
    };
    const driveV2 = makeDriveFile({ modifiedTime: T2, md5Checksum: 'hash-v2' });

    const pullEditBackToA = buildSyncPlan({
      localNotes: [noteA],
      localFolders: [],
      localAttachments: [],
      localMappings: [mappingOnA],
      pendingChanges: [],
      remoteFolders: [],
      remoteMappings: [remoteMappingV2],
      remoteAttachments: [],
      driveFiles: [driveV2],
    });
    expect(pullEditBackToA.actions).toEqual([
      { type: 'download_remote_note', mapping: remoteMappingV2 },
    ]);
  });

  it('Scenario B: plans multi-entity offline batch (folder + note + task + event) together on reconnect', () => {
    const folder: FolderRecord = {
      id: 'f-offline',
      name: 'Offline Folder',
      parentId: null,
      revision: 1,
      createdAt: T0,
      updatedAt: T0,
    };
    const note: NoteRecord = {
      id: 'n-offline',
      folderId: 'f-offline',
      title: 'Offline Note',
      content: 'Offline draft',
      isFavorite: false,
      isDaily: false,
      revision: 1,
      createdAt: T0,
      updatedAt: T0,
    };
    const task: TaskRecord = {
      id: 't-offline',
      userId: 'u-1',
      title: 'Offline Task',
      status: 'todo',
      priority: 'high',
      tags: [],
      linkedNoteIds: ['n-offline'],
      createdAt: T0,
      updatedAt: T0,
      revision: 1,
    };
    const ev: CalendarEventRecord = {
      id: 'e-offline',
      userId: 'u-1',
      title: 'Offline Event',
      startAt: T0,
      endAt: T1,
      allDay: false,
      category: 'work',
      linkedNoteIds: ['n-offline'],
      linkedTaskIds: ['t-offline'],
      createdAt: T0,
      updatedAt: T0,
      revision: 1,
    };

    const changes: SyncChange[] = [
      {
        id: 'c-f',
        entityType: 'folder',
        entityId: 'f-offline',
        operation: 'create',
        localRevision: 1,
        createdAt: T0,
        status: 'pending',
        retryCount: 0,
      },
      {
        id: 'c-n',
        entityType: 'note',
        entityId: 'n-offline',
        operation: 'create',
        localRevision: 1,
        createdAt: T0,
        status: 'pending',
        retryCount: 0,
      },
      {
        id: 'c-t',
        entityType: 'task',
        entityId: 't-offline',
        operation: 'create',
        localRevision: 1,
        createdAt: T0,
        status: 'pending',
        retryCount: 0,
      },
      {
        id: 'c-e',
        entityType: 'calendar_event',
        entityId: 'e-offline',
        operation: 'create',
        localRevision: 1,
        createdAt: T0,
        status: 'pending',
        retryCount: 0,
      },
    ];

    const plan = buildSyncPlan({
      localNotes: [note],
      localFolders: [folder],
      localAttachments: [],
      localMappings: [],
      pendingChanges: changes,
      remoteFolders: [] as RemoteFolderMetadata[],
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
      localTasks: [task],
      remoteTasks: [],
      localCalendarEvents: [ev],
      remoteCalendarEvents: [],
    });

    expect(plan.actions.map((a) => a.type)).toEqual([
      'push_folder',
      'upload_note',
      'push_task',
      'push_calendar_event',
    ]);
  });

  it('Scenario C & E: detects concurrent modification & external Drive edits safely across all entities', () => {
    const localNote: NoteRecord = {
      id: 'n-c',
      folderId: null,
      title: 'Concurrent Note',
      content: 'Local edit',
      isFavorite: false,
      isDaily: false,
      revision: 2,
      createdAt: T0,
      updatedAt: T2,
    };
    const mapping: DriveNoteMappingRecord = {
      id: 'map-c',
      userId: 'u-1',
      localNoteId: 'n-c',
      driveFileId: 'drive-c',
      driveFolderId: 'root',
      lastKnownModifiedTime: T1,
      lastKnownChecksum: 'checksum-base',
      createdAt: T0,
      updatedAt: T1,
    };
    const externalDriveFile: DriveFileRef = {
      id: 'drive-c',
      name: 'Concurrent Note.md',
      mimeType: 'text/markdown',
      modifiedTime: T2,
      md5Checksum: 'checksum-external-edit',
    };

    const localTask: TaskRecord = {
      id: 't-c',
      userId: 'u-1',
      title: 'Concurrent Task',
      status: 'in_progress',
      priority: 'high',
      tags: [],
      linkedNoteIds: [],
      createdAt: T0,
      updatedAt: T2,
      revision: 2,
      lastSyncedRevision: 1,
    };
    const remoteTask: RemoteTaskMetadata = {
      id: 't-c',
      userId: 'u-1',
      title: 'Concurrent Task Remote',
      status: 'done',
      priority: 'high',
      tags: [],
      linkedNoteIds: [],
      revision: 2,
      createdAt: T0,
      updatedAt: T2,
    };

    const localEvent: CalendarEventRecord = {
      id: 'e-c',
      userId: 'u-1',
      title: 'Concurrent Event Local',
      startAt: T0,
      endAt: T1,
      allDay: false,
      category: 'meeting',
      linkedNoteIds: [],
      linkedTaskIds: [],
      createdAt: T0,
      updatedAt: T2,
      revision: 2,
      lastSyncedRevision: 1,
    };
    const remoteEvent: RemoteCalendarEventMetadata = {
      id: 'e-c',
      userId: 'u-1',
      title: 'Concurrent Event Remote',
      startAt: T0,
      endAt: T2,
      allDay: false,
      category: 'meeting',
      linkedNoteIds: [],
      linkedTaskIds: [],
      revision: 2,
      createdAt: T0,
      updatedAt: T2,
    };

    const plan = buildSyncPlan({
      localNotes: [localNote],
      localFolders: [],
      localAttachments: [],
      localMappings: [mapping],
      pendingChanges: [
        {
          id: 'c-note',
          entityType: 'note',
          entityId: 'n-c',
          operation: 'update',
          localRevision: 2,
          createdAt: T2,
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'c-task',
          entityType: 'task',
          entityId: 't-c',
          operation: 'update',
          localRevision: 2,
          createdAt: T2,
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'c-ev',
          entityType: 'calendar_event',
          entityId: 'e-c',
          operation: 'update',
          localRevision: 2,
          createdAt: T2,
          status: 'pending',
          retryCount: 0,
        },
      ],
      remoteFolders: [],
      remoteMappings: [
        {
          localNoteId: 'n-c',
          driveFileId: 'drive-c',
          driveFolderId: 'root',
          isFavorite: false,
          isDaily: false,
          localRevision: 1,
          lastKnownModifiedTime: T1,
          lastKnownChecksum: 'checksum-base',
          updatedAt: T1,
        },
      ],
      remoteAttachments: [],
      driveFiles: [externalDriveFile],
      localTasks: [localTask],
      remoteTasks: [remoteTask],
      localCalendarEvents: [localEvent],
      remoteCalendarEvents: [remoteEvent],
    });

    expect(plan.actions.map((a) => a.type)).toEqual([
      'record_conflict',
      'record_task_conflict',
      'record_calendar_event_conflict',
    ]);
  });

  it('Scenario D: coalesces rapid offline edits cleanly without duplicate queue operations', () => {
    expect(computeCoalescedOperation(null, 'create')).toEqual({
      action: 'insert',
      nextOperation: 'create',
    });
    expect(computeCoalescedOperation('create', 'update')).toEqual({
      action: 'update',
      nextOperation: 'create',
    });
    expect(computeCoalescedOperation('create', 'delete')).toEqual({
      action: 'delete_existing',
    });
    expect(computeCoalescedOperation('update', 'delete')).toEqual({
      action: 'update',
      nextOperation: 'delete',
    });
  });
});
