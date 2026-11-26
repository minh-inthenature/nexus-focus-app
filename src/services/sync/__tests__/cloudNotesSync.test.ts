import { describe, expect, it } from 'vitest';
import type { FolderRecord, NoteRecord } from '@/services/storage/db';
import { buildSyncPlan } from '@/services/sync/syncPlanner';
import type {
  RemoteCloudNoteMetadata,
  RemoteFolderMetadata,
  SyncChange,
} from '@/services/sync/syncTypes';

function makeNote(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id: 'note-1',
    folderId: null,
    title: 'Laptop Note',
    content: '# Laptop Note\n\n#study',
    type: 'markdown',
    isFavorite: false,
    isDaily: false,
    revision: 1,
    createdAt: '2026-11-26T10:00:00.000Z',
    updatedAt: '2026-11-26T10:05:00.000Z',
    ...overrides,
  };
}

function makeRemoteNote(
  overrides: Partial<RemoteCloudNoteMetadata> = {},
): RemoteCloudNoteMetadata {
  return {
    id: 'note-remote-1',
    userId: 'user-1',
    folderId: 'folder-1',
    title: 'Cloud Architecture',
    content: '# Cloud Architecture\n\n#algorithms',
    type: 'markdown',
    language: null,
    isFavorite: true,
    isDaily: false,
    dailyDate: null,
    revision: 2,
    createdAt: '2026-11-26T09:00:00.000Z',
    updatedAt: '2026-11-26T11:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('cross-device cloud notes sync planning', () => {
  it('pulls remote cloud folders and notes (Recent/Starred/Code) onto a newly signed-in PC even when Drive is disconnected', () => {
    const remoteFolders: RemoteFolderMetadata[] = [
      {
        localFolderId: 'folder-1',
        name: 'Research',
        parentFolderId: null,
        revision: 1,
        deletedAt: null,
        createdAt: '2026-11-26T08:00:00.000Z',
        updatedAt: '2026-11-26T08:00:00.000Z',
      },
    ];
    const remoteCloudNotes: RemoteCloudNoteMetadata[] = [
      makeRemoteNote(),
      makeRemoteNote({
        id: 'note-code-1',
        folderId: null,
        title: 'binary_search.cpp',
        content: 'int main() { return 0; }',
        type: 'code',
        language: 'cpp',
        isFavorite: false,
        revision: 1,
      }),
    ];

    const plan = buildSyncPlan({
      localNotes: [],
      localFolders: [],
      localAttachments: [],
      localMappings: [],
      pendingChanges: [],
      remoteFolders,
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
      remoteCloudNotes,
      includeDriveSync: false,
      includeCloudNotesSync: true,
    });

    expect(plan.actions).toContainEqual({
      type: 'pull_remote_folder',
      folder: remoteFolders[0],
    });
    expect(plan.actions).toContainEqual({
      type: 'pull_remote_cloud_note',
      note: remoteCloudNotes[0],
    });
    expect(plan.actions).toContainEqual({
      type: 'pull_remote_cloud_note',
      note: remoteCloudNotes[1],
    });
  });

  it('backfills existing offline laptop notes & folders up to Supabase on sign-in', () => {
    const folder: FolderRecord = {
      id: 'folder-local',
      name: 'Projects',
      parentId: null,
      revision: 1,
      createdAt: '2026-11-26T10:00:00.000Z',
      updatedAt: '2026-11-26T10:00:00.000Z',
    };
    const localNote = makeNote({
      id: 'local-only-note',
      folderId: folder.id,
      isFavorite: true,
    });

    const plan = buildSyncPlan({
      localNotes: [localNote],
      localFolders: [folder],
      localAttachments: [],
      localMappings: [],
      pendingChanges: [],
      remoteFolders: [],
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
      remoteCloudNotes: [],
      includeDriveSync: false,
      includeCloudNotesSync: true,
    });

    expect(plan.actions).toContainEqual({
      type: 'push_folder',
      folderId: 'folder-local',
    });
    expect(plan.actions).toContainEqual({
      type: 'push_cloud_note',
      noteId: 'local-only-note',
    });
  });

  it('pushes pending note edits and deletes and cleans up remotely deleted notes', () => {
    const editedNote = makeNote({ id: 'note-edit', revision: 3 });
    const locallyKeptNote = makeNote({ id: 'note-delete-me', revision: 1 });
    const pending: SyncChange[] = [
      {
        id: 'chg-1',
        entityType: 'note',
        entityId: 'note-edit',
        operation: 'update',
        localRevision: 3,
        createdAt: '2026-11-26T12:00:00.000Z',
        status: 'pending',
        retryCount: 0,
      },
      {
        id: 'chg-2',
        entityType: 'note',
        entityId: 'note-remove-remote',
        operation: 'delete',
        localRevision: 2,
        createdAt: '2026-11-26T12:01:00.000Z',
        status: 'pending',
        retryCount: 0,
      },
    ];

    const plan = buildSyncPlan({
      localNotes: [editedNote, locallyKeptNote],
      localFolders: [],
      localAttachments: [],
      localMappings: [],
      pendingChanges: pending,
      remoteFolders: [],
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
      remoteCloudNotes: [
        makeRemoteNote({ id: 'note-edit', revision: 2 }),
        makeRemoteNote({
          id: 'note-delete-me',
          deletedAt: '2026-11-26T12:05:00.000Z',
        }),
      ],
      includeDriveSync: false,
      includeCloudNotesSync: true,
    });

    expect(plan.actions).toContainEqual({
      type: 'push_cloud_note',
      noteId: 'note-edit',
      changeId: 'chg-1',
    });
    expect(plan.actions).toContainEqual({
      type: 'delete_remote_cloud_note',
      noteId: 'note-remove-remote',
      changeId: 'chg-2',
    });
    expect(plan.actions).toContainEqual({
      type: 'delete_local_cloud_note',
      noteId: 'note-delete-me',
    });
  });
});
