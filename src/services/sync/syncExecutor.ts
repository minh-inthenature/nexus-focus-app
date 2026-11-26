import { getSupabaseClient } from '@/services/auth/supabase.client';
import {
  DriveError,
  type DriveFileRef,
} from '@/services/google-drive/drive.service';
import { googleDriveService } from '@/services/google-drive/google-drive.service';
import {
  applyRemoteAttachmentUpsert,
  purgeDeletedAttachmentTombstone,
} from '@/services/storage/attachment.service';
import { db } from '@/services/storage/db';
import {
  deleteMappingByLocalNoteId,
  listDriveMappings,
  upsertDriveMapping,
} from '@/services/storage/driveMappings.repository';
import {
  applyRemoteFolderUpsert,
  listAllFoldersIncludingDeleted,
  purgeDeletedFolderTombstone,
} from '@/services/storage/folders.repository';
import {
  applyRemoteNoteDelete,
  applyRemoteNoteUpsert,
  listAllNotesIncludingDeleted,
  purgeDeletedNoteTombstone,
} from '@/services/storage/notes.repository';
import {
  applyRemoteCalendarEventUpsert,
  listAllCalendarEventsIncludingDeleted,
  purgeDeletedCalendarEventTombstone,
} from '@/services/storage/calendarEvents.repository';
import {
  applyRemoteTaskUpsert,
  listAllTasksIncludingDeleted,
  purgeDeletedTaskTombstone,
} from '@/services/storage/tasks.repository';
import {
  mapRemoteCalendarEventToLocal,
  mapRemoteTaskToLocal,
  recordSyncConflict,
} from './conflictResolver';
import { buildSyncPlan } from './syncPlanner';
import {
  listActionableChanges,
  markChangeFailed,
  markChangeSynced,
  markChangeSyncing,
  purgeSyncedChanges,
} from './syncQueue';
import type {
  RemoteAttachmentMetadata,
  RemoteCalendarEventMetadata,
  RemoteFolderMetadata,
  RemoteNoteMappingMetadata,
  RemoteTaskMetadata,
} from './syncTypes';

export interface SyncExecutionResult {
  readonly appliedRemoteChanges: boolean;
  readonly conflictsRecorded: number;
  readonly syncedCount: number;
  readonly errorCount: number;
  readonly fatalError?: string;
}

function isFatalConnectivityOrAuthError(err: unknown): boolean {
  if (err instanceof DriveError) {
    return (
      err.code === 'NETWORK_ERROR' ||
      err.code === 'UNAUTHORIZED' ||
      err.code === 'NOT_CONNECTED' ||
      err.code === 'DRIVE_REVOKED' ||
      err.code === 'NOT_CONFIGURED'
    );
  }
  return false;
}

/**
 * Executes a full hybrid sync cycle against Supabase metadata and Google Drive
 * files while keeping IndexedDB transactional and conflict-safe.
 */
export async function executeSyncCycle(
  userId: string,
  notesFolderId: string | null,
): Promise<SyncExecutionResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      appliedRemoteChanges: false,
      conflictsRecorded: 0,
      syncedCount: 0,
      errorCount: 0,
      fatalError: 'Supabase is not configured.',
    };
  }

  const includeDriveSync = Boolean(notesFolderId);

  // 1. Gather local state and pending outbox changes
  const [
    localNotes,
    localFolders,
    localAttachments,
    localMappings,
    localTasks,
    localCalendarEvents,
    pendingChanges,
  ] = await Promise.all([
    listAllNotesIncludingDeleted(),
    listAllFoldersIncludingDeleted(),
    db.attachments.toArray(),
    listDriveMappings(userId),
    listAllTasksIncludingDeleted(),
    listAllCalendarEventsIncludingDeleted(),
    listActionableChanges(),
  ]);

  // 2. Gather remote Supabase tasks & calendar events (always) and Drive metadata (when connected)
  const [
    { data: taskRows, error: taskErr },
    { data: eventRows, error: eventErr },
    folderQuery,
    mappingQuery,
    attQuery,
    driveFiles,
  ] = await Promise.all([
    client.from('tasks').select('*').eq('user_id', userId),
    client.from('calendar_events').select('*').eq('user_id', userId),
    includeDriveSync
      ? client.from('sync_folders').select('*').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    includeDriveSync
      ? client.from('drive_note_mappings').select('*').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    includeDriveSync
      ? client.from('sync_attachments').select('*').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    includeDriveSync
      ? googleDriveService.listMarkdownFiles()
      : Promise.resolve([]),
  ]);

  if (
    taskErr ||
    eventErr ||
    folderQuery.error ||
    mappingQuery.error ||
    attQuery.error
  ) {
    throw new Error(
      taskErr?.message ||
        eventErr?.message ||
        folderQuery.error?.message ||
        mappingQuery.error?.message ||
        attQuery.error?.message ||
        'Failed to read synchronization metadata from Supabase.',
    );
  }

  const folderRows = folderQuery.data;
  const mappingRows = mappingQuery.data;
  const attachmentRows = attQuery.data;

  const remoteTasks: RemoteTaskMetadata[] = (taskRows ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    title: String(r.title),
    description: typeof r.description === 'string' ? r.description : null,
    status: r.status as RemoteTaskMetadata['status'],
    priority: r.priority as RemoteTaskMetadata['priority'],
    startDate: typeof r.start_date === 'string' ? r.start_date : null,
    dueDate: typeof r.due_date === 'string' ? r.due_date : null,
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    category: typeof r.category === 'string' ? r.category : null,
    linkedNoteIds: Array.isArray(r.linked_note_ids)
      ? r.linked_note_ids.map(String)
      : [],
    revision: Number(r.revision ?? 1),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    completedAt: typeof r.completed_at === 'string' ? r.completed_at : null,
    deletedAt: typeof r.deleted_at === 'string' ? r.deleted_at : null,
  }));

  const remoteCalendarEvents: RemoteCalendarEventMetadata[] = (
    eventRows ?? []
  ).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    title: String(r.title),
    description: typeof r.description === 'string' ? r.description : null,
    location: typeof r.location === 'string' ? r.location : null,
    startAt: String(r.start_at),
    endAt: String(r.end_at),
    allDay: Boolean(r.all_day),
    timezone: typeof r.timezone === 'string' ? r.timezone : null,
    category: r.category as RemoteCalendarEventMetadata['category'],
    color: typeof r.color === 'string' ? r.color : null,
    linkedNoteIds: Array.isArray(r.linked_note_ids)
      ? r.linked_note_ids.map(String)
      : [],
    linkedTaskIds: Array.isArray(r.linked_task_ids)
      ? r.linked_task_ids.map(String)
      : [],
    revision: Number(r.revision ?? 1),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: typeof r.deleted_at === 'string' ? r.deleted_at : null,
  }));

  const remoteFolders: RemoteFolderMetadata[] = (folderRows ?? []).map((r) => ({
    localFolderId: String(r.local_folder_id),
    name: String(r.name),
    parentFolderId:
      typeof r.parent_folder_id === 'string' ? r.parent_folder_id : null,
    revision: Number(r.revision ?? 1),
    deletedAt: typeof r.deleted_at === 'string' ? r.deleted_at : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));

  const remoteMappings: RemoteNoteMappingMetadata[] = (mappingRows ?? []).map(
    (r) => ({
      localNoteId: String(r.local_note_id),
      driveFileId: String(r.drive_file_id),
      driveFolderId: String(r.drive_folder_id),
      driveFileName:
        typeof r.drive_file_name === 'string' ? r.drive_file_name : null,
      title: typeof r.title === 'string' ? r.title : null,
      localFolderId:
        typeof r.local_folder_id === 'string' ? r.local_folder_id : null,
      isFavorite: Boolean(r.is_favorite),
      isDaily: Boolean(r.is_daily),
      dailyDate: typeof r.daily_date === 'string' ? r.daily_date : null,
      localRevision: Number(r.local_revision ?? 1),
      lastKnownModifiedTime:
        typeof r.last_known_modified_time === 'string'
          ? r.last_known_modified_time
          : null,
      lastKnownChecksum:
        typeof r.last_known_checksum === 'string'
          ? r.last_known_checksum
          : null,
      deletedAt: typeof r.deleted_at === 'string' ? r.deleted_at : null,
      updatedAt: String(r.updated_at),
    }),
  );

  const remoteAttachments: RemoteAttachmentMetadata[] = (
    attachmentRows ?? []
  ).map((r) => ({
    localAttachmentId: String(r.local_attachment_id),
    localNoteId: String(r.local_note_id),
    driveFileId: String(r.drive_file_id),
    fileName: String(r.file_name),
    mimeType: String(r.mime_type),
    sizeBytes: Number(r.size_bytes ?? 0),
    deletedAt: typeof r.deleted_at === 'string' ? r.deleted_at : null,
    updatedAt: String(r.updated_at),
  }));

  const plan = buildSyncPlan({
    localNotes,
    localFolders,
    localAttachments,
    localMappings,
    pendingChanges,
    remoteFolders,
    remoteMappings,
    remoteAttachments,
    driveFiles,
    localTasks,
    remoteTasks,
    localCalendarEvents,
    remoteCalendarEvents,
    includeDriveSync,
  });

  let appliedRemoteChanges = false;
  let conflictsRecorded = 0;
  let syncedCount = 0;
  let errorCount = 0;

  const localFolderMap = new Map(localFolders.map((f) => [f.id, f]));
  const localAttachmentMap = new Map(localAttachments.map((a) => [a.id, a]));
  const localNoteMap = new Map(localNotes.map((n) => [n.id, n]));
  const localMappingByNoteId = new Map(
    localMappings.map((m) => [m.localNoteId, m]),
  );
  const localTaskMap = new Map(localTasks.map((t) => [t.id, t]));
  const localEventMap = new Map(localCalendarEvents.map((e) => [e.id, e]));

  for (const action of plan.actions) {
    try {
      switch (action.type) {
        case 'push_folder': {
          await markChangeSyncing(action.changeId);
          const folder = localFolderMap.get(action.folderId);
          if (folder && !folder.deletedAt) {
            const { error } = await client.from('sync_folders').upsert(
              {
                user_id: userId,
                local_folder_id: folder.id,
                name: folder.name,
                parent_folder_id: folder.parentId,
                revision: folder.revision ?? 1,
                deleted_at: null,
                created_at: folder.createdAt,
              },
              { onConflict: 'user_id,local_folder_id' },
            );
            if (error) throw new Error(error.message);
          }
          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'delete_remote_folder': {
          await markChangeSyncing(action.changeId);
          const now = new Date().toISOString();
          const { error } = await client
            .from('sync_folders')
            .update({ deleted_at: now })
            .eq('user_id', userId)
            .eq('local_folder_id', action.folderId);
          if (error) throw new Error(error.message);
          await purgeDeletedFolderTombstone(action.folderId);
          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'pull_remote_folder': {
          await applyRemoteFolderUpsert({
            id: action.folder.localFolderId,
            name: action.folder.name,
            parentId: action.folder.parentFolderId,
            revision: action.folder.revision,
            createdAt: action.folder.createdAt,
            updatedAt: action.folder.updatedAt,
          });
          appliedRemoteChanges = true;
          break;
        }

        case 'delete_local_folder': {
          await purgeDeletedFolderTombstone(action.folderId);
          appliedRemoteChanges = true;
          break;
        }

        case 'upload_attachment': {
          await markChangeSyncing(action.changeId);
          const att = localAttachmentMap.get(action.attachmentId);
          if (att && !att.deletedAt) {
            const uploaded = await googleDriveService.uploadAttachmentFile({
              localAttachmentId: att.id,
              fileName: att.fileName,
              mimeType: att.mimeType,
              data: att.data,
            });
            const { error } = await client.from('sync_attachments').upsert(
              {
                user_id: userId,
                local_attachment_id: att.id,
                local_note_id: att.noteId,
                drive_file_id: uploaded.id,
                file_name: att.fileName,
                mime_type: att.mimeType,
                size_bytes: att.size,
                deleted_at: null,
              },
              { onConflict: 'user_id,local_attachment_id' },
            );
            if (error) throw new Error(error.message);
          }
          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'delete_remote_attachment': {
          await markChangeSyncing(action.changeId);
          if (action.driveFileId) {
            try {
              await googleDriveService.deleteAttachmentFile(action.driveFileId);
            } catch (err) {
              if (!(err instanceof DriveError && err.code === 'FILE_NOT_FOUND')) {
                throw err;
              }
            }
          }
          await client
            .from('sync_attachments')
            .update({ deleted_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('local_attachment_id', action.attachmentId);
          await purgeDeletedAttachmentTombstone(action.attachmentId);
          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'download_attachment': {
          const { data } = await googleDriveService.downloadAttachmentFile(
            action.attachment.driveFileId,
          );
          await applyRemoteAttachmentUpsert({
            id: action.attachment.localAttachmentId,
            noteId: action.attachment.localNoteId,
            fileName: action.attachment.fileName,
            mimeType: action.attachment.mimeType,
            size: data.size,
            data,
            createdAt: action.attachment.updatedAt,
          });
          appliedRemoteChanges = true;
          break;
        }

        case 'delete_local_attachment': {
          await purgeDeletedAttachmentTombstone(action.attachmentId);
          appliedRemoteChanges = true;
          break;
        }

        case 'upload_note':
        case 'update_remote_note': {
          await markChangeSyncing(action.changeId);
          const note = localNoteMap.get(action.noteId);
          if (!note || note.deletedAt) {
            await markChangeSynced(action.changeId);
            break;
          }

          let uploadedFile: DriveFileRef;
          if (action.type === 'upload_note') {
            uploadedFile = await googleDriveService.uploadMarkdownFile({
              localNoteId: note.id,
              name: note.title,
              content: note.content,
            });
          } else {
            const localMapping = localMappingByNoteId.get(note.id);
            try {
              uploadedFile = await googleDriveService.updateMarkdownFile({
                fileId: action.driveFileId,
                name: note.title,
                content: note.content,
                ...(localMapping?.lastKnownModifiedTime
                  ? { expectedModifiedTime: localMapping.lastKnownModifiedTime }
                  : {}),
                ...(localMapping?.lastKnownChecksum
                  ? { expectedChecksum: localMapping.lastKnownChecksum }
                  : {}),
              });
            } catch (err) {
              if (
                err instanceof DriveError &&
                err.code === 'DRIVE_CONFLICT' &&
                err.conflict
              ) {
                await recordSyncConflict({
                  entityType: 'note',
                  entityId: note.id,
                  noteTitle: note.title,
                  driveFileId: action.driveFileId,
                  localRevision: note.revision,
                  localUpdatedAt: note.updatedAt,
                  remoteModifiedTime: err.conflict.remoteModifiedTime,
                  ...(err.conflict.remoteChecksum
                    ? { remoteChecksum: err.conflict.remoteChecksum }
                    : {}),
                  ...(err.conflict.remoteContent !== undefined
                    ? { remoteContent: err.conflict.remoteContent }
                    : {}),
                  reason: 'both_modified',
                });
                await markChangeFailed(action.changeId, 'Conflict detected');
                conflictsRecorded += 1;
                continue;
              }
              throw err;
            }
          }

          const folderId = uploadedFile.parentId ?? notesFolderId ?? '';
          await upsertDriveMapping({
            userId,
            localNoteId: note.id,
            driveFileId: uploadedFile.id,
            driveFolderId: folderId,
            driveFileName: uploadedFile.name,
            lastKnownModifiedTime: uploadedFile.modifiedTime,
            ...(uploadedFile.md5Checksum
              ? { lastKnownChecksum: uploadedFile.md5Checksum }
              : {}),
          });

          const { error: mapErr } = await client
            .from('drive_note_mappings')
            .upsert(
              {
                user_id: userId,
                local_note_id: note.id,
                drive_file_id: uploadedFile.id,
                drive_folder_id: folderId,
                drive_file_name: uploadedFile.name,
                title: note.title,
                local_folder_id: note.folderId,
                is_favorite: note.isFavorite,
                is_daily: note.isDaily,
                daily_date: note.dailyDate ?? null,
                local_revision: note.revision,
                last_known_modified_time: uploadedFile.modifiedTime,
                last_known_checksum: uploadedFile.md5Checksum ?? null,
                deleted_at: null,
              },
              { onConflict: 'user_id,local_note_id' },
            );
          if (mapErr) throw new Error(mapErr.message);

          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'delete_remote_note': {
          await markChangeSyncing(action.changeId);
          if (action.driveFileId) {
            try {
              await googleDriveService.deleteFile(action.driveFileId);
            } catch (err) {
              if (!(err instanceof DriveError && err.code === 'FILE_NOT_FOUND')) {
                throw err;
              }
            }
          }
          await client
            .from('drive_note_mappings')
            .update({ deleted_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('local_note_id', action.noteId);

          await deleteMappingByLocalNoteId(action.noteId);
          await purgeDeletedNoteTombstone(action.noteId);
          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'download_remote_note': {
          const { file, content } = await googleDriveService.readMarkdownFile(
            action.mapping.driveFileId,
          );
          const existingLocal = localNoteMap.get(action.mapping.localNoteId);
          const resolvedTitle =
            action.mapping.title?.trim() ||
            file.name.replace(/\.(md|markdown)$/i, '').trim() ||
            'Untitled Note';

          await applyRemoteNoteUpsert({
            id: action.mapping.localNoteId,
            folderId: action.mapping.localFolderId ?? null,
            title: resolvedTitle,
            content,
            isFavorite: action.mapping.isFavorite,
            isDaily: action.mapping.isDaily,
            ...(action.mapping.dailyDate
              ? { dailyDate: action.mapping.dailyDate }
              : {}),
            revision: Math.max(
              action.mapping.localRevision,
              (existingLocal?.revision ?? 0) + 1,
            ),
            createdAt: existingLocal?.createdAt ?? file.modifiedTime,
            updatedAt: file.modifiedTime,
          });

          await upsertDriveMapping({
            userId,
            localNoteId: action.mapping.localNoteId,
            driveFileId: file.id,
            driveFolderId: file.parentId ?? notesFolderId ?? '',
            driveFileName: file.name,
            lastKnownModifiedTime: file.modifiedTime,
            ...(file.md5Checksum
              ? { lastKnownChecksum: file.md5Checksum }
              : {}),
          });
          appliedRemoteChanges = true;
          break;
        }

        case 'push_task': {
          await markChangeSyncing(action.changeId);
          const task = localTaskMap.get(action.taskId);
          if (!task || task.deletedAt) {
            await markChangeSynced(action.changeId);
            break;
          }

          const { data: upsertedRow, error: taskUpsertErr } = await client
            .from('tasks')
            .upsert(
              {
                id: task.id,
                user_id: userId,
                title: task.title,
                description: task.description ?? null,
                status: task.status,
                priority: task.priority,
                start_date: task.startDate ?? null,
                due_date: task.dueDate ?? null,
                tags: [...task.tags],
                category: task.category ?? null,
                linked_note_ids: [...task.linkedNoteIds],
                revision: task.revision,
                created_at: task.createdAt,
                updated_at: task.updatedAt,
                completed_at: task.completedAt ?? null,
                deleted_at: null,
              },
              { onConflict: 'id' },
            )
            .select('updated_at, revision')
            .single();

          if (taskUpsertErr) {
            throw new Error(taskUpsertErr.message);
          }

          await applyRemoteTaskUpsert({
            ...task,
            userId,
            revision: Number(upsertedRow?.revision ?? task.revision),
            lastSyncedRevision: Number(upsertedRow?.revision ?? task.revision),
            lastSyncedUpdatedAt:
              typeof upsertedRow?.updated_at === 'string'
                ? upsertedRow.updated_at
                : task.updatedAt,
          });

          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'delete_remote_task': {
          await markChangeSyncing(action.changeId);
          const { error: delTaskErr } = await client
            .from('tasks')
            .update({ deleted_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('id', action.taskId);
          if (delTaskErr) {
            throw new Error(delTaskErr.message);
          }
          await purgeDeletedTaskTombstone(action.taskId);
          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'pull_remote_task': {
          await applyRemoteTaskUpsert(mapRemoteTaskToLocal(action.task, userId));
          appliedRemoteChanges = true;
          break;
        }

        case 'delete_local_task': {
          await purgeDeletedTaskTombstone(action.taskId);
          appliedRemoteChanges = true;
          break;
        }

        case 'record_task_conflict': {
          const localTask = localTaskMap.get(action.taskId);
          await recordSyncConflict({
            entityType: 'task',
            entityId: action.taskId,
            noteTitle: localTask?.title ?? action.remoteTask.title,
            localRevision: localTask?.revision ?? 1,
            localUpdatedAt:
              localTask?.updatedAt ?? new Date().toISOString(),
            remoteModifiedTime: action.remoteTask.updatedAt,
            remoteTaskSnapshot: action.remoteTask,
            reason: action.reason,
          });
          conflictsRecorded += 1;
          break;
        }

        case 'push_calendar_event': {
          await markChangeSyncing(action.changeId);
          const ev = localEventMap.get(action.eventId);
          if (!ev || ev.deletedAt) {
            await markChangeSynced(action.changeId);
            break;
          }

          const { data: upsertedEvRow, error: evUpsertErr } = await client
            .from('calendar_events')
            .upsert(
              {
                id: ev.id,
                user_id: userId,
                title: ev.title,
                description: ev.description ?? null,
                location: ev.location ?? null,
                start_at: ev.startAt,
                end_at: ev.endAt,
                all_day: ev.allDay,
                timezone: ev.timezone ?? null,
                category: ev.category,
                color: ev.color ?? null,
                linked_note_ids: [...ev.linkedNoteIds],
                linked_task_ids: [...ev.linkedTaskIds],
                revision: ev.revision,
                created_at: ev.createdAt,
                updated_at: ev.updatedAt,
                deleted_at: null,
              },
              { onConflict: 'id' },
            )
            .select('updated_at, revision')
            .single();

          if (evUpsertErr) {
            throw new Error(evUpsertErr.message);
          }

          await applyRemoteCalendarEventUpsert({
            ...ev,
            userId,
            revision: Number(upsertedEvRow?.revision ?? ev.revision),
            lastSyncedRevision: Number(upsertedEvRow?.revision ?? ev.revision),
            lastSyncedUpdatedAt:
              typeof upsertedEvRow?.updated_at === 'string'
                ? upsertedEvRow.updated_at
                : ev.updatedAt,
          });

          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'delete_remote_calendar_event': {
          await markChangeSyncing(action.changeId);
          const { error: delEvErr } = await client
            .from('calendar_events')
            .update({ deleted_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('id', action.eventId);
          if (delEvErr) {
            throw new Error(delEvErr.message);
          }
          await purgeDeletedCalendarEventTombstone(action.eventId);
          await markChangeSynced(action.changeId);
          syncedCount += 1;
          break;
        }

        case 'pull_remote_calendar_event': {
          await applyRemoteCalendarEventUpsert(
            mapRemoteCalendarEventToLocal(action.event, userId),
          );
          appliedRemoteChanges = true;
          break;
        }

        case 'delete_local_calendar_event': {
          await purgeDeletedCalendarEventTombstone(action.eventId);
          appliedRemoteChanges = true;
          break;
        }

        case 'record_calendar_event_conflict': {
          const localEv = localEventMap.get(action.eventId);
          await recordSyncConflict({
            entityType: 'calendar_event',
            entityId: action.eventId,
            noteTitle: localEv?.title ?? action.remoteEvent.title,
            localRevision: localEv?.revision ?? 1,
            localUpdatedAt:
              localEv?.updatedAt ?? new Date().toISOString(),
            remoteModifiedTime: action.remoteEvent.updatedAt,
            remoteCalendarEventSnapshot: action.remoteEvent,
            reason: action.reason,
          });
          conflictsRecorded += 1;
          break;
        }

        case 'delete_local_note': {
          await applyRemoteNoteDelete(action.noteId);
          await deleteMappingByLocalNoteId(action.noteId);
          appliedRemoteChanges = true;
          break;
        }

        case 'record_conflict': {
          const localNote = localNoteMap.get(action.noteId);
          let remoteContent: string | undefined;
          if (action.reason === 'both_modified') {
            try {
              const res = await googleDriveService.readMarkdownFile(
                action.driveFileId,
              );
              remoteContent = res.content;
            } catch {
              // Keep conflict record even if remote preview could not be fetched
            }
          }

          await recordSyncConflict({
            entityType: 'note',
            entityId: action.noteId,
            noteTitle: localNote?.title ?? 'Untitled Note',
            driveFileId: action.driveFileId,
            localRevision: localNote?.revision ?? 1,
            localUpdatedAt: localNote?.updatedAt ?? new Date().toISOString(),
            remoteModifiedTime: action.remoteModifiedTime,
            ...(action.remoteChecksum
              ? { remoteChecksum: action.remoteChecksum }
              : {}),
            ...(remoteContent !== undefined ? { remoteContent } : {}),
            reason: action.reason,
          });
          conflictsRecorded += 1;
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync action failed.';
      if ('changeId' in action && action.changeId) {
        await markChangeFailed(action.changeId, msg);
      }
      errorCount += 1;

      if (isFatalConnectivityOrAuthError(err)) {
        return {
          appliedRemoteChanges,
          conflictsRecorded,
          syncedCount,
          errorCount,
          fatalError: msg,
        };
      }
    }
  }

  await purgeSyncedChanges();

  if (errorCount === 0) {
    const now = new Date().toISOString();
    await client.from('sync_state').upsert(
      {
        user_id: userId,
        last_synced_at: now,
        sync_version: Date.now(),
      },
      { onConflict: 'user_id' },
    );
  }

  return {
    appliedRemoteChanges,
    conflictsRecorded,
    syncedCount,
    errorCount,
  };
}
