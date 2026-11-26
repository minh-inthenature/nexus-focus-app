import type { DriveFileRef } from '@/services/google-drive/drive.service';
import type {
  AttachmentRecord,
  CalendarEventRecord,
  DriveNoteMappingRecord,
  FolderRecord,
  NoteRecord,
  TaskRecord,
} from '@/services/storage/db';
import type {
  RemoteAttachmentMetadata,
  RemoteCalendarEventMetadata,
  RemoteCloudNoteMetadata,
  RemoteFolderMetadata,
  RemoteNoteMappingMetadata,
  RemoteTaskMetadata,
  SyncChange,
  SyncPlan,
  SyncPlanAction,
} from './syncTypes';

export interface SyncPlannerInput {
  readonly localNotes: readonly NoteRecord[];
  readonly localFolders: readonly FolderRecord[];
  readonly localAttachments: readonly AttachmentRecord[];
  readonly localMappings: readonly DriveNoteMappingRecord[];
  readonly pendingChanges: readonly SyncChange[];
  readonly remoteFolders: readonly RemoteFolderMetadata[];
  readonly remoteMappings: readonly RemoteNoteMappingMetadata[];
  readonly remoteAttachments: readonly RemoteAttachmentMetadata[];
  readonly driveFiles: readonly DriveFileRef[];
  readonly remoteCloudNotes?: readonly RemoteCloudNoteMetadata[];
  readonly localTasks?: readonly TaskRecord[];
  readonly remoteTasks?: readonly RemoteTaskMetadata[];
  readonly localCalendarEvents?: readonly CalendarEventRecord[];
  readonly remoteCalendarEvents?: readonly RemoteCalendarEventMetadata[];
  readonly includeDriveSync?: boolean;
  readonly includeCloudNotesSync?: boolean;
}

function getFolderDepth(
  folderId: string,
  folderMap: ReadonlyMap<string, FolderRecord>,
): number {
  let depth = 0;
  let current = folderMap.get(folderId);
  const visited = new Set<string>();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = folderMap.get(current.parentId);
  }
  return depth;
}

function getRemoteFolderDepth(
  folderId: string,
  folderMap: ReadonlyMap<string, RemoteFolderMetadata>,
): number {
  let depth = 0;
  let current = folderMap.get(folderId);
  const visited = new Set<string>();
  while (current?.parentFolderId && !visited.has(current.localFolderId)) {
    visited.add(current.localFolderId);
    depth += 1;
    current = folderMap.get(current.parentFolderId);
  }
  return depth;
}

/**
 * Pure deterministic synchronization planner.
 * Computes an ordered list of folder, attachment, and note actions without
 * mutating any state or performing network I/O.
 */
export function buildSyncPlan(input: SyncPlannerInput): SyncPlan {
  const actions: SyncPlanAction[] = [];

  const includeDriveSync = input.includeDriveSync ?? true;
  const includeCloudNotesSync = input.includeCloudNotesSync ?? false;
  const remoteCloudNotes = input.remoteCloudNotes ?? [];
  const localTasks = input.localTasks ?? [];
  const remoteTasks = input.remoteTasks ?? [];
  const localCalendarEvents = input.localCalendarEvents ?? [];
  const remoteCalendarEvents = input.remoteCalendarEvents ?? [];

  const localFolderMap = new Map(input.localFolders.map((f) => [f.id, f]));
  const localNoteMap = new Map(input.localNotes.map((n) => [n.id, n]));
  const localAttachmentMap = new Map(
    input.localAttachments.map((a) => [a.id, a]),
  );
  const localMappingByNoteId = new Map(
    input.localMappings.map((m) => [m.localNoteId, m]),
  );
  const localTaskMap = new Map(localTasks.map((t) => [t.id, t]));
  const localEventMap = new Map(localCalendarEvents.map((e) => [e.id, e]));

  const remoteFolderMap = new Map(
    input.remoteFolders.map((f) => [f.localFolderId, f]),
  );
  const remoteMappingByNoteId = new Map(
    input.remoteMappings.map((m) => [m.localNoteId, m]),
  );
  const remoteAttachmentMap = new Map(
    input.remoteAttachments.map((a) => [a.localAttachmentId, a]),
  );
  const remoteCloudNoteMap = new Map(
    remoteCloudNotes.map((n) => [n.id, n]),
  );
  const remoteTaskMap = new Map(remoteTasks.map((t) => [t.id, t]));
  const remoteEventMap = new Map(remoteCalendarEvents.map((e) => [e.id, e]));
  const driveFileById = new Map(input.driveFiles.map((f) => [f.id, f]));

  const pendingFolderChanges = new Map<string, SyncChange>();
  const pendingAttachmentChanges = new Map<string, SyncChange>();
  const pendingNoteChanges = new Map<string, SyncChange>();
  const pendingTaskChanges = new Map<string, SyncChange>();
  const pendingEventChanges = new Map<string, SyncChange>();

  for (const change of input.pendingChanges) {
    if (change.entityType === 'folder') {
      pendingFolderChanges.set(change.entityId, change);
    } else if (change.entityType === 'attachment') {
      pendingAttachmentChanges.set(change.entityId, change);
    } else if (change.entityType === 'note') {
      pendingNoteChanges.set(change.entityId, change);
    } else if (change.entityType === 'task') {
      pendingTaskChanges.set(change.entityId, change);
    } else if (change.entityType === 'calendar_event') {
      pendingEventChanges.set(change.entityId, change);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Folders (synced via Supabase `sync_folders` when signed in or Drive connected)
  // ---------------------------------------------------------------------------
  if (includeDriveSync || includeCloudNotesSync) {
    const folderPushList = Array.from(pendingFolderChanges.values())
      .filter((c) => c.operation !== 'delete')
      .sort(
        (a, b) =>
          getFolderDepth(a.entityId, localFolderMap) -
          getFolderDepth(b.entityId, localFolderMap),
      );

    for (const change of folderPushList) {
      const localFolder = localFolderMap.get(change.entityId);
      if (localFolder && !localFolder.deletedAt) {
        actions.push({
          type: 'push_folder',
          folderId: localFolder.id,
          changeId: change.id,
        });
      }
    }

    if (includeCloudNotesSync) {
      const missingRemoteFolders = input.localFolders
        .filter(
          (f) =>
            !f.deletedAt &&
            !pendingFolderChanges.has(f.id) &&
            !remoteFolderMap.has(f.id),
        )
        .sort(
          (a, b) =>
            getFolderDepth(a.id, localFolderMap) -
            getFolderDepth(b.id, localFolderMap),
        );

      for (const folder of missingRemoteFolders) {
        actions.push({
          type: 'push_folder',
          folderId: folder.id,
        });
      }
    }

    const folderDeleteList = Array.from(pendingFolderChanges.values())
      .filter((c) => c.operation === 'delete')
      .sort(
        (a, b) =>
          getFolderDepth(b.entityId, localFolderMap) -
          getFolderDepth(a.entityId, localFolderMap),
      );

    for (const change of folderDeleteList) {
      actions.push({
        type: 'delete_remote_folder',
        folderId: change.entityId,
        changeId: change.id,
      });
    }

    const remoteFoldersSorted = [...input.remoteFolders].sort(
      (a, b) =>
        getRemoteFolderDepth(a.localFolderId, remoteFolderMap) -
        getRemoteFolderDepth(b.localFolderId, remoteFolderMap),
    );

    for (const remote of remoteFoldersSorted) {
      if (pendingFolderChanges.has(remote.localFolderId)) continue;
      const local = localFolderMap.get(remote.localFolderId);

      if (remote.deletedAt) {
        if (local && !local.deletedAt) {
          actions.push({
            type: 'delete_local_folder',
            folderId: remote.localFolderId,
          });
        }
        continue;
      }

      const localRev = local?.revision ?? 0;
      if (
        !local ||
        local.deletedAt ||
        remote.revision > localRev ||
        remote.name !== local.name ||
        remote.parentFolderId !== local.parentId
      ) {
        actions.push({ type: 'pull_remote_folder', folder: remote });
      }
    }
  }

  if (includeDriveSync) {

  // ---------------------------------------------------------------------------
  // 2. Attachments
  // ---------------------------------------------------------------------------
  for (const change of pendingAttachmentChanges.values()) {
    if (change.operation === 'delete') {
      const remoteAtt = remoteAttachmentMap.get(change.entityId);
      actions.push({
        type: 'delete_remote_attachment',
        attachmentId: change.entityId,
        ...(remoteAtt?.driveFileId
          ? { driveFileId: remoteAtt.driveFileId }
          : {}),
        changeId: change.id,
      });
      continue;
    }

    const localAtt = localAttachmentMap.get(change.entityId);
    if (localAtt && !localAtt.deletedAt) {
      actions.push({
        type: 'upload_attachment',
        attachmentId: localAtt.id,
        changeId: change.id,
      });
    }
  }

  for (const remoteAtt of input.remoteAttachments) {
    if (pendingAttachmentChanges.has(remoteAtt.localAttachmentId)) continue;
    const localAtt = localAttachmentMap.get(remoteAtt.localAttachmentId);

    if (remoteAtt.deletedAt) {
      if (localAtt && !localAtt.deletedAt) {
        actions.push({
          type: 'delete_local_attachment',
          attachmentId: remoteAtt.localAttachmentId,
        });
      }
      continue;
    }

    if (!localAtt || localAtt.deletedAt) {
      actions.push({ type: 'download_attachment', attachment: remoteAtt });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Notes (outbound changes + conflict checks + inbound changes)
  // ---------------------------------------------------------------------------
  for (const change of pendingNoteChanges.values()) {
    const localNote = localNoteMap.get(change.entityId);
    const localMapping = localMappingByNoteId.get(change.entityId);
    const remoteMapping = remoteMappingByNoteId.get(change.entityId);
    const knownDriveFileId =
      localMapping?.driveFileId ?? remoteMapping?.driveFileId;

    if (change.operation === 'delete') {
      actions.push({
        type: 'delete_remote_note',
        noteId: change.entityId,
        ...(knownDriveFileId ? { driveFileId: knownDriveFileId } : {}),
        changeId: change.id,
      });
      continue;
    }

    if (!localNote || localNote.deletedAt) continue;

    if (change.operation === 'create' && !knownDriveFileId) {
      actions.push({
        type: 'upload_note',
        noteId: localNote.id,
        changeId: change.id,
      });
      continue;
    }

    // Update operation or mapped note
    if (!knownDriveFileId) {
      actions.push({
        type: 'upload_note',
        noteId: localNote.id,
        changeId: change.id,
      });
      continue;
    }

    const driveFile = driveFileById.get(knownDriveFileId);
    if (remoteMapping?.deletedAt || !driveFile) {
      actions.push({
        type: 'record_conflict',
        noteId: localNote.id,
        driveFileId: knownDriveFileId,
        reason: 'deleted_remotely',
        remoteModifiedTime:
          remoteMapping?.updatedAt ?? new Date().toISOString(),
      });
      continue;
    }

    const expectedModified =
      localMapping?.lastKnownModifiedTime ??
      remoteMapping?.lastKnownModifiedTime;
    const expectedChecksum =
      localMapping?.lastKnownChecksum ?? remoteMapping?.lastKnownChecksum;

    const modifiedChanged = Boolean(
      expectedModified && driveFile.modifiedTime !== expectedModified,
    );
    const checksumChanged = Boolean(
      expectedChecksum &&
        driveFile.md5Checksum &&
        driveFile.md5Checksum !== expectedChecksum,
    );

    if (modifiedChanged || checksumChanged) {
      actions.push({
        type: 'record_conflict',
        noteId: localNote.id,
        driveFileId: knownDriveFileId,
        reason: 'both_modified',
        remoteModifiedTime: driveFile.modifiedTime,
        ...(driveFile.md5Checksum
          ? { remoteChecksum: driveFile.md5Checksum }
          : {}),
      });
    } else {
      actions.push({
        type: 'update_remote_note',
        noteId: localNote.id,
        driveFileId: knownDriveFileId,
        changeId: change.id,
      });
    }
  }

  for (const remote of input.remoteMappings) {
    if (pendingNoteChanges.has(remote.localNoteId)) continue;

    const localNote = localNoteMap.get(remote.localNoteId);
    const localMapping = localMappingByNoteId.get(remote.localNoteId);

    if (remote.deletedAt) {
      if (localNote && !localNote.deletedAt) {
        actions.push({
          type: 'delete_local_note',
          noteId: remote.localNoteId,
        });
      }
      continue;
    }

    const driveFile = driveFileById.get(remote.driveFileId);
    if (!driveFile) continue;

    const contentChanged =
      !localNote ||
      Boolean(localNote.deletedAt) ||
      localMapping?.lastKnownModifiedTime !== driveFile.modifiedTime ||
      (Boolean(driveFile.md5Checksum) &&
        localMapping?.lastKnownChecksum !== driveFile.md5Checksum);

    const metadataChanged =
      Boolean(localNote) &&
      ((remote.title && remote.title !== localNote?.title) ||
        (remote.localFolderId ?? null) !== (localNote?.folderId ?? null) ||
        remote.isFavorite !== localNote?.isFavorite ||
        remote.localRevision > (localNote?.revision ?? 0));

    if (contentChanged || metadataChanged) {
      actions.push({
        type: 'download_remote_note',
        mapping: remote,
      });
    }
  }
  } // end if (includeDriveSync)

  // ---------------------------------------------------------------------------
  // 3b. Direct Cloud Notes Sync (Supabase `public.notes`, independent of Drive)
  // ---------------------------------------------------------------------------
  if (includeCloudNotesSync) {
    for (const change of pendingNoteChanges.values()) {
      const localNote = localNoteMap.get(change.entityId);

      if (change.operation === 'delete') {
        actions.push({
          type: 'delete_remote_cloud_note',
          noteId: change.entityId,
          ...(includeDriveSync ? {} : { changeId: change.id }),
        });
        continue;
      }

      if (localNote && !localNote.deletedAt) {
        actions.push({
          type: 'push_cloud_note',
          noteId: localNote.id,
          ...(includeDriveSync ? {} : { changeId: change.id }),
        });
      }
    }

    // Backfill local notes created offline / before sign-in so nothing on laptop is left behind
    for (const localNote of input.localNotes) {
      if (localNote.deletedAt || pendingNoteChanges.has(localNote.id)) continue;
      const remote = remoteCloudNoteMap.get(localNote.id);

      if (
        !remote ||
        (!remote.deletedAt &&
          (localNote.revision > remote.revision ||
            (localNote.revision === remote.revision &&
              localNote.updatedAt > remote.updatedAt)))
      ) {
        actions.push({
          type: 'push_cloud_note',
          noteId: localNote.id,
        });
      }
    }

    for (const remote of remoteCloudNotes) {
      if (pendingNoteChanges.has(remote.id)) continue;
      const localNote = localNoteMap.get(remote.id);

      if (remote.deletedAt) {
        if (localNote && !localNote.deletedAt) {
          actions.push({
            type: 'delete_local_cloud_note',
            noteId: remote.id,
          });
        }
        continue;
      }

      if (
        !localNote ||
        localNote.deletedAt ||
        remote.revision > localNote.revision ||
        remote.updatedAt > localNote.updatedAt
      ) {
        actions.push({
          type: 'pull_remote_cloud_note',
          note: remote,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Tasks (Supabase structured records, independent of Drive connectivity)
  // ---------------------------------------------------------------------------
  for (const change of pendingTaskChanges.values()) {
    const localTask = localTaskMap.get(change.entityId);
    const remoteTask = remoteTaskMap.get(change.entityId);

    if (change.operation === 'delete') {
      actions.push({
        type: 'delete_remote_task',
        taskId: change.entityId,
        changeId: change.id,
      });
      continue;
    }

    if (!localTask || localTask.deletedAt) continue;

    if (!remoteTask) {
      actions.push({
        type: 'push_task',
        taskId: localTask.id,
        changeId: change.id,
      });
      continue;
    }

    if (remoteTask.deletedAt) {
      actions.push({
        type: 'record_task_conflict',
        taskId: localTask.id,
        reason: 'deleted_remotely',
        remoteTask,
      });
      continue;
    }

    const baselineRev = localTask.lastSyncedRevision;
    const remoteChangedSinceSync =
      baselineRev === undefined || remoteTask.revision > baselineRev;

    if (remoteChangedSinceSync) {
      actions.push({
        type: 'record_task_conflict',
        taskId: localTask.id,
        reason: 'both_modified',
        remoteTask,
      });
    } else {
      actions.push({
        type: 'push_task',
        taskId: localTask.id,
        changeId: change.id,
      });
    }
  }

  for (const remoteTask of remoteTasks) {
    if (pendingTaskChanges.has(remoteTask.id)) continue;
    const localTask = localTaskMap.get(remoteTask.id);

    if (remoteTask.deletedAt) {
      if (localTask && !localTask.deletedAt) {
        actions.push({
          type: 'delete_local_task',
          taskId: remoteTask.id,
        });
      }
      continue;
    }

    if (
      !localTask ||
      localTask.deletedAt ||
      remoteTask.revision > (localTask.lastSyncedRevision ?? 0) ||
      remoteTask.updatedAt > localTask.updatedAt
    ) {
      actions.push({
        type: 'pull_remote_task',
        task: remoteTask,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Calendar Events (Supabase structured records, independent of Drive)
  // ---------------------------------------------------------------------------
  for (const change of pendingEventChanges.values()) {
    const localEvent = localEventMap.get(change.entityId);
    const remoteEvent = remoteEventMap.get(change.entityId);

    if (change.operation === 'delete') {
      actions.push({
        type: 'delete_remote_calendar_event',
        eventId: change.entityId,
        changeId: change.id,
      });
      continue;
    }

    if (!localEvent || localEvent.deletedAt) continue;

    if (!remoteEvent) {
      actions.push({
        type: 'push_calendar_event',
        eventId: localEvent.id,
        changeId: change.id,
      });
      continue;
    }

    if (remoteEvent.deletedAt) {
      actions.push({
        type: 'record_calendar_event_conflict',
        eventId: localEvent.id,
        reason: 'deleted_remotely',
        remoteEvent,
      });
      continue;
    }

    const baselineRev = localEvent.lastSyncedRevision;
    const remoteChangedSinceSync =
      baselineRev === undefined || remoteEvent.revision > baselineRev;

    if (remoteChangedSinceSync) {
      actions.push({
        type: 'record_calendar_event_conflict',
        eventId: localEvent.id,
        reason: 'both_modified',
        remoteEvent,
      });
    } else {
      actions.push({
        type: 'push_calendar_event',
        eventId: localEvent.id,
        changeId: change.id,
      });
    }
  }

  for (const remoteEvent of remoteCalendarEvents) {
    if (pendingEventChanges.has(remoteEvent.id)) continue;
    const localEvent = localEventMap.get(remoteEvent.id);

    if (remoteEvent.deletedAt) {
      if (localEvent && !localEvent.deletedAt) {
        actions.push({
          type: 'delete_local_calendar_event',
          eventId: remoteEvent.id,
        });
      }
      continue;
    }

    if (
      !localEvent ||
      localEvent.deletedAt ||
      remoteEvent.revision > (localEvent.lastSyncedRevision ?? 0) ||
      remoteEvent.updatedAt > localEvent.updatedAt
    ) {
      actions.push({
        type: 'pull_remote_calendar_event',
        event: remoteEvent,
      });
    }
  }

  return { actions };
}
