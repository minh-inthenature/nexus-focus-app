import { describe, expect, it } from 'vitest';
import type { DriveFileRef } from '@/services/google-drive/drive.service';
import type {
  AttachmentRecord,
  DriveNoteMappingRecord,
  FolderRecord,
  NoteRecord,
} from '@/services/storage/db';
import { buildSyncPlan } from '../syncPlanner';
import { computeCoalescedOperation } from '../syncQueue';
import type {
  RemoteAttachmentMetadata,
  RemoteFolderMetadata,
  RemoteNoteMappingMetadata,
  SyncChange,
} from '../syncTypes';

const NOW = '2026-11-25T10:00:00.000Z';
const LATER = '2026-11-25T10:05:00.000Z';

function makeNote(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id: 'note-1',
    folderId: null,
    title: 'Design Spec',
    content: '# Spec',
    isFavorite: false,
    isDaily: false,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeFolder(overrides: Partial<FolderRecord> = {}): FolderRecord {
  return {
    id: 'folder-1',
    name: 'Projects',
    parentId: null,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeDriveFile(overrides: Partial<DriveFileRef> = {}): DriveFileRef {
  return {
    id: 'drive-file-1',
    name: 'Design Spec.md',
    mimeType: 'text/markdown',
    modifiedTime: NOW,
    md5Checksum: 'abc123',
    ...overrides,
  };
}

function makeLocalMapping(
  overrides: Partial<DriveNoteMappingRecord> = {},
): DriveNoteMappingRecord {
  return {
    id: 'map-1',
    userId: 'user-1',
    localNoteId: 'note-1',
    driveFileId: 'drive-file-1',
    driveFolderId: 'drive-notes-folder',
    driveFileName: 'Design Spec.md',
    lastKnownModifiedTime: NOW,
    lastKnownChecksum: 'abc123',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRemoteMapping(
  overrides: Partial<RemoteNoteMappingMetadata> = {},
): RemoteNoteMappingMetadata {
  return {
    localNoteId: 'note-1',
    driveFileId: 'drive-file-1',
    driveFolderId: 'drive-notes-folder',
    driveFileName: 'Design Spec.md',
    title: 'Design Spec',
    localFolderId: null,
    isFavorite: false,
    isDaily: false,
    localRevision: 1,
    lastKnownModifiedTime: NOW,
    lastKnownChecksum: 'abc123',
    deletedAt: null,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('computeCoalescedOperation (Sync Outbox)', () => {
  it('keeps create when followed by update', () => {
    expect(computeCoalescedOperation('create', 'update')).toEqual({
      action: 'update',
      nextOperation: 'create',
    });
  });

  it('cancels pending create when deleted before first sync', () => {
    expect(computeCoalescedOperation('create', 'delete')).toEqual({
      action: 'delete_existing',
    });
  });

  it('collapses update followed by update into single update', () => {
    expect(computeCoalescedOperation('update', 'update')).toEqual({
      action: 'update',
      nextOperation: 'update',
    });
  });

  it('promotes update to delete when deleted locally', () => {
    expect(computeCoalescedOperation('update', 'delete')).toEqual({
      action: 'update',
      nextOperation: 'delete',
    });
  });
});

describe('buildSyncPlan (Deterministic Hybrid Sync Planner)', () => {
  it('orders parent folders before child folders and uploads pending notes & attachments on initial sync', () => {
    const parentFolder = makeFolder({ id: 'f-parent', name: 'AI', parentId: null });
    const childFolder = makeFolder({ id: 'f-child', name: 'Vision', parentId: 'f-parent' });
    const note = makeNote({ id: 'note-1', folderId: 'f-child' });
    const att: AttachmentRecord = {
      id: 'att-1',
      noteId: 'note-1',
      fileName: 'diagram.png',
      mimeType: 'image/png',
      size: 1024,
      data: new Blob(['png']),
      createdAt: NOW,
    };

    const pendingChanges: SyncChange[] = [
      {
        id: 'c-note',
        entityType: 'note',
        entityId: 'note-1',
        operation: 'create',
        localRevision: 1,
        createdAt: NOW,
        status: 'pending',
        retryCount: 0,
      },
      {
        id: 'c-child',
        entityType: 'folder',
        entityId: 'f-child',
        operation: 'create',
        localRevision: 1,
        createdAt: NOW,
        status: 'pending',
        retryCount: 0,
      },
      {
        id: 'c-parent',
        entityType: 'folder',
        entityId: 'f-parent',
        operation: 'create',
        localRevision: 1,
        createdAt: NOW,
        status: 'pending',
        retryCount: 0,
      },
      {
        id: 'c-att',
        entityType: 'attachment',
        entityId: 'att-1',
        operation: 'create',
        localRevision: 1,
        createdAt: NOW,
        status: 'pending',
        retryCount: 0,
      },
    ];

    const plan = buildSyncPlan({
      localNotes: [note],
      localFolders: [childFolder, parentFolder],
      localAttachments: [att],
      localMappings: [],
      pendingChanges,
      remoteFolders: [],
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
    });

    expect(plan.actions.map((a) => `${a.type}:${'folderId' in a ? a.folderId : 'attachmentId' in a ? a.attachmentId : 'noteId' in a ? a.noteId : ''}`)).toEqual([
      'push_folder:f-parent',
      'push_folder:f-child',
      'upload_attachment:att-1',
      'upload_note:note-1',
    ]);
  });

  it('downloads remote notes, folders, and attachments onto Computer B without duplicates', () => {
    const remoteFolder: RemoteFolderMetadata = {
      localFolderId: 'f-1',
      name: 'Research',
      parentFolderId: null,
      revision: 1,
      deletedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const remoteAtt: RemoteAttachmentMetadata = {
      localAttachmentId: 'att-1',
      localNoteId: 'note-1',
      driveFileId: 'drive-att-1',
      fileName: 'plot.png',
      mimeType: 'image/png',
      sizeBytes: 512,
      deletedAt: null,
      updatedAt: NOW,
    };
    const remoteMap = makeRemoteMapping({ localFolderId: 'f-1' });
    const driveFile = makeDriveFile();

    const plan = buildSyncPlan({
      localNotes: [],
      localFolders: [],
      localAttachments: [],
      localMappings: [],
      pendingChanges: [],
      remoteFolders: [remoteFolder],
      remoteMappings: [remoteMap],
      remoteAttachments: [remoteAtt],
      driveFiles: [driveFile],
    });

    expect(plan.actions.map((a) => a.type)).toEqual([
      'pull_remote_folder',
      'download_attachment',
      'download_remote_note',
    ]);
  });

  it('produces zero actions when local and remote devices are already synchronized', () => {
    const folder = makeFolder();
    const note = makeNote({ folderId: folder.id });
    const mapping = makeLocalMapping();
    const remoteFolder: RemoteFolderMetadata = {
      localFolderId: folder.id,
      name: folder.name,
      parentFolderId: null,
      revision: 1,
      deletedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const remoteMap = makeRemoteMapping({ localFolderId: folder.id });
    const driveFile = makeDriveFile();

    const plan = buildSyncPlan({
      localNotes: [note],
      localFolders: [folder],
      localAttachments: [],
      localMappings: [mapping],
      pendingChanges: [],
      remoteFolders: [remoteFolder],
      remoteMappings: [remoteMap],
      remoteAttachments: [],
      driveFiles: [driveFile],
    });

    expect(plan.actions).toEqual([]);
  });

  it('updates Drive when local note changed and Drive metadata matches last known baseline', () => {
    const note = makeNote({ revision: 2, updatedAt: LATER, content: '# Updated' });
    const mapping = makeLocalMapping();
    const driveFile = makeDriveFile({ modifiedTime: NOW, md5Checksum: 'abc123' });

    const plan = buildSyncPlan({
      localNotes: [note],
      localFolders: [],
      localAttachments: [],
      localMappings: [mapping],
      pendingChanges: [
        {
          id: 'c-1',
          entityType: 'note',
          entityId: note.id,
          operation: 'update',
          localRevision: 2,
          createdAt: LATER,
          status: 'pending',
          retryCount: 0,
        },
      ],
      remoteFolders: [],
      remoteMappings: [makeRemoteMapping()],
      remoteAttachments: [],
      driveFiles: [driveFile],
    });

    expect(plan.actions).toEqual([
      {
        type: 'update_remote_note',
        noteId: note.id,
        driveFileId: 'drive-file-1',
        changeId: 'c-1',
      },
    ]);
  });

  it('records a conflict instead of overwriting when both local and Drive modified a note offline', () => {
    const note = makeNote({ revision: 2, updatedAt: LATER });
    const mapping = makeLocalMapping({
      lastKnownModifiedTime: NOW,
      lastKnownChecksum: 'abc123',
    });
    const newerDriveFile = makeDriveFile({
      modifiedTime: LATER,
      md5Checksum: 'xyz999',
    });

    const plan = buildSyncPlan({
      localNotes: [note],
      localFolders: [],
      localAttachments: [],
      localMappings: [mapping],
      pendingChanges: [
        {
          id: 'c-1',
          entityType: 'note',
          entityId: note.id,
          operation: 'update',
          localRevision: 2,
          createdAt: LATER,
          status: 'pending',
          retryCount: 0,
        },
      ],
      remoteFolders: [],
      remoteMappings: [
        makeRemoteMapping({
          lastKnownModifiedTime: LATER,
          lastKnownChecksum: 'xyz999',
        }),
      ],
      remoteAttachments: [],
      driveFiles: [newerDriveFile],
    });

    expect(plan.actions).toEqual([
      {
        type: 'record_conflict',
        noteId: note.id,
        driveFileId: 'drive-file-1',
        reason: 'both_modified',
        remoteModifiedTime: LATER,
        remoteChecksum: 'xyz999',
      },
    ]);
  });

  it('propagates local deletions to Drive and remote deletions to local without losing locally modified notes', () => {
    // 1. Local tombstone delete -> delete_remote_note
    const deletedLocally = makeNote({ id: 'n-del-local', deletedAt: LATER });
    // 2. Remote deleted while local clean -> delete_local_note
    const deletedRemotelyClean = makeNote({ id: 'n-del-remote' });
    // 3. Remote deleted while local edited -> record_conflict (preserve local!)
    const deletedRemotelyEdited = makeNote({
      id: 'n-del-conflict',
      revision: 3,
      updatedAt: LATER,
    });

    const plan = buildSyncPlan({
      localNotes: [deletedLocally, deletedRemotelyClean, deletedRemotelyEdited],
      localFolders: [],
      localAttachments: [],
      localMappings: [
        makeLocalMapping({
          localNoteId: 'n-del-local',
          driveFileId: 'df-1',
        }),
        makeLocalMapping({
          id: 'map-2',
          localNoteId: 'n-del-remote',
          driveFileId: 'df-2',
        }),
        makeLocalMapping({
          id: 'map-3',
          localNoteId: 'n-del-conflict',
          driveFileId: 'df-3',
        }),
      ],
      pendingChanges: [
        {
          id: 'c-del-1',
          entityType: 'note',
          entityId: 'n-del-local',
          operation: 'delete',
          localRevision: 2,
          createdAt: LATER,
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'c-edit-3',
          entityType: 'note',
          entityId: 'n-del-conflict',
          operation: 'update',
          localRevision: 3,
          createdAt: LATER,
          status: 'pending',
          retryCount: 0,
        },
      ],
      remoteFolders: [],
      remoteMappings: [
        makeRemoteMapping({ localNoteId: 'n-del-local', driveFileId: 'df-1' }),
        makeRemoteMapping({
          localNoteId: 'n-del-remote',
          driveFileId: 'df-2',
          deletedAt: LATER,
        }),
        makeRemoteMapping({
          localNoteId: 'n-del-conflict',
          driveFileId: 'df-3',
          deletedAt: LATER,
          updatedAt: LATER,
        }),
      ],
      remoteAttachments: [],
      driveFiles: [makeDriveFile({ id: 'df-1' })],
    });

    expect(plan.actions).toEqual([
      {
        type: 'delete_remote_note',
        noteId: 'n-del-local',
        driveFileId: 'df-1',
        changeId: 'c-del-1',
      },
      {
        type: 'record_conflict',
        noteId: 'n-del-conflict',
        driveFileId: 'df-3',
        reason: 'deleted_remotely',
        remoteModifiedTime: LATER,
      },
      {
        type: 'delete_local_note',
        noteId: 'n-del-remote',
      },
    ]);
  });
});
