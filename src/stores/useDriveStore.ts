import { create } from 'zustand';
import { getSupabaseClient } from '@/services/auth/supabase.client';
import {
  DriveError,
  type DriveConflictPayload,
  type DriveConnectionInfo,
  type DriveFileRef,
} from '@/services/google-drive/drive.service';
import {
  DISCONNECTED_DRIVE_INFO,
  googleDriveService,
} from '@/services/google-drive/google-drive.service';
import type { DriveNoteMappingRecord, NoteRecord } from '@/services/storage/db';
import {
  deleteMappingByDriveFileId,
  deleteMappingByLocalNoteId,
  listDriveMappings,
  upsertDriveMapping,
} from '@/services/storage/driveMappings.repository';

export interface PendingDriveConflict {
  readonly localNote: NoteRecord;
  readonly driveFileId: string;
  readonly conflict: DriveConflictPayload;
}

interface DriveStoreState {
  connection: DriveConnectionInfo;
  remoteFiles: DriveFileRef[];
  mappingsByLocalNoteId: Record<string, DriveNoteMappingRecord>;
  loadingStatus: boolean;
  busyAction: string | null;
  error: string | null;
  lastOperationSummary: string | null;
  pendingConflict: PendingDriveConflict | null;

  refreshStatus: (userId?: string) => Promise<void>;
  connectDrive: () => Promise<void>;
  completeOAuthCallback: (code: string, state: string) => Promise<DriveConnectionInfo>;
  disconnectDrive: () => Promise<void>;
  ensureFolders: () => Promise<void>;
  listRemoteNotes: () => Promise<DriveFileRef[]>;
  uploadOrUpdateLocalNote: (
    note: NoteRecord,
    userId: string,
    forceOverwrite?: boolean,
  ) => Promise<DriveFileRef | null>;
  readRemoteNote: (
    fileId: string,
  ) => Promise<{ file: DriveFileRef; content: string }>;
  recordMapping: (params: {
    userId: string;
    localNoteId: string;
    file: DriveFileRef;
    folderId: string;
  }) => Promise<void>;
  deleteRemoteFile: (fileId: string) => Promise<void>;
  clearConflict: () => void;
  clearError: () => void;
  reset: () => void;
}

async function syncMappingToSupabase(record: DriveNoteMappingRecord): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  await client.from('drive_note_mappings').upsert(
    {
      user_id: record.userId,
      local_note_id: record.localNoteId,
      drive_file_id: record.driveFileId,
      drive_folder_id: record.driveFolderId,
      drive_file_name: record.driveFileName ?? null,
      last_known_modified_time: record.lastKnownModifiedTime ?? null,
      last_known_checksum: record.lastKnownChecksum ?? null,
    },
    { onConflict: 'user_id,local_note_id' },
  );
}

async function deleteMappingFromSupabase(
  userId: string | undefined,
  driveFileId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId) return;

  await client
    .from('drive_note_mappings')
    .delete()
    .eq('user_id', userId)
    .eq('drive_file_id', driveFileId);
}

function buildMappingIndex(
  records: readonly DriveNoteMappingRecord[],
): Record<string, DriveNoteMappingRecord> {
  const map: Record<string, DriveNoteMappingRecord> = {};
  for (const item of records) {
    map[item.localNoteId] = item;
  }
  return map;
}

export const useDriveStore = create<DriveStoreState>((set, get) => ({
  connection: DISCONNECTED_DRIVE_INFO,
  remoteFiles: [],
  mappingsByLocalNoteId: {},
  loadingStatus: false,
  busyAction: null,
  error: null,
  lastOperationSummary: null,
  pendingConflict: null,

  refreshStatus: async (userId) => {
    set({ loadingStatus: true, error: null });
    try {
      const localMappings = await listDriveMappings(userId);
      let nextMappings = buildMappingIndex(localMappings);

      const client = getSupabaseClient();
      if (client && userId) {
        const { data: remoteRows } = await client
          .from('drive_note_mappings')
          .select('*')
          .eq('user_id', userId);

        if (Array.isArray(remoteRows)) {
          for (const row of remoteRows) {
            const saved = await upsertDriveMapping({
              userId,
              localNoteId: String(row.local_note_id),
              driveFileId: String(row.drive_file_id),
              driveFolderId: String(row.drive_folder_id),
              ...(typeof row.drive_file_name === 'string'
                ? { driveFileName: row.drive_file_name }
                : {}),
              ...(typeof row.last_known_modified_time === 'string'
                ? { lastKnownModifiedTime: row.last_known_modified_time }
                : {}),
              ...(typeof row.last_known_checksum === 'string'
                ? { lastKnownChecksum: row.last_known_checksum }
                : {}),
            });
            nextMappings[saved.localNoteId] = saved;
          }
        }
      }

      const connection = await googleDriveService.getConnectionStatus();
      set({
        connection,
        mappingsByLocalNoteId: nextMappings,
        loadingStatus: false,
      });
    } catch (err) {
      set({
        loadingStatus: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to check Google Drive status.',
      });
    }
  },

  connectDrive: async () => {
    set({ busyAction: 'Connecting Google Drive…', error: null });
    try {
      const authUrl = await googleDriveService.startOAuthAuthorization();
      window.location.assign(authUrl);
    } catch (err) {
      set({
        busyAction: null,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to start Google Drive authorization.',
      });
    }
  },

  completeOAuthCallback: async (code, state) => {
    set({ busyAction: 'Completing Google Drive setup…', error: null });
    try {
      const connection = await googleDriveService.completeOAuthAuthorization(
        code,
        state,
      );
      set({
        connection,
        busyAction: null,
        lastOperationSummary: 'Connected Google Drive (Nexus/ folder ready)',
      });
      return connection;
    } catch (err) {
      set({
        busyAction: null,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to finalize Google Drive connection.',
      });
      throw err;
    }
  },

  disconnectDrive: async () => {
    set({ busyAction: 'Disconnecting Google Drive…', error: null });
    try {
      await googleDriveService.disconnect();
      set({
        connection: DISCONNECTED_DRIVE_INFO,
        remoteFiles: [],
        busyAction: null,
        lastOperationSummary: 'Disconnected Google Drive',
      });
    } catch (err) {
      set({
        busyAction: null,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to disconnect Google Drive.',
      });
    }
  },

  ensureFolders: async () => {
    set({ busyAction: 'Verifying Nexus/ Drive folders…', error: null });
    try {
      const folders = await googleDriveService.ensureWorkspaceFolders();
      set((state) => ({
        connection: {
          ...state.connection,
          status: 'connected',
          ...folders,
          lastOperationAt: new Date().toISOString(),
        },
        busyAction: null,
        lastOperationSummary: 'Verified Nexus/ folder structure',
      }));
    } catch (err) {
      if (err instanceof DriveError && err.code === 'DRIVE_REVOKED') {
        set((state) => ({
          connection: { ...state.connection, status: 'revoked' },
        }));
      }
      set({
        busyAction: null,
        error:
          err instanceof Error ? err.message : 'Unable to verify Drive folders.',
      });
    }
  },

  listRemoteNotes: async () => {
    set({ busyAction: 'Loading Notes from Drive…', error: null });
    try {
      const files = await googleDriveService.listMarkdownFiles();
      set({
        remoteFiles: files,
        busyAction: null,
        lastOperationSummary: `Listed ${files.length} file(s) from Nexus/Notes`,
      });
      return files;
    } catch (err) {
      if (err instanceof DriveError && err.code === 'DRIVE_REVOKED') {
        set((state) => ({
          connection: { ...state.connection, status: 'revoked' },
        }));
      }
      set({
        busyAction: null,
        error:
          err instanceof Error ? err.message : 'Unable to list Drive notes.',
      });
      return [];
    }
  },

  uploadOrUpdateLocalNote: async (note, userId, forceOverwrite = false) => {
    set({ busyAction: `Saving "${note.title}" to Drive…`, error: null });
    const existingMapping = get().mappingsByLocalNoteId[note.id];
    const notesFolderId = get().connection.notesFolderId ?? '';

    try {
      let driveFile: DriveFileRef;

      if (existingMapping) {
        try {
          driveFile = await googleDriveService.updateMarkdownFile({
            fileId: existingMapping.driveFileId,
            name: note.title,
            content: note.content,
            ...(existingMapping.lastKnownModifiedTime
              ? { expectedModifiedTime: existingMapping.lastKnownModifiedTime }
              : {}),
            ...(existingMapping.lastKnownChecksum
              ? { expectedChecksum: existingMapping.lastKnownChecksum }
              : {}),
            forceOverwrite,
          });
        } catch (err) {
          if (err instanceof DriveError && err.code === 'DRIVE_CONFLICT' && err.conflict) {
            set({
              busyAction: null,
              pendingConflict: {
                localNote: note,
                driveFileId: existingMapping.driveFileId,
                conflict: err.conflict,
              },
            });
            return null;
          }

          if (err instanceof DriveError && err.code === 'FILE_NOT_FOUND') {
            // Remote file was removed externally; upload fresh and replace stale mapping
            await deleteMappingByLocalNoteId(note.id);
            driveFile = await googleDriveService.uploadMarkdownFile({
              localNoteId: note.id,
              name: note.title,
              content: note.content,
            });
          } else {
            throw err;
          }
        }
      } else {
        driveFile = await googleDriveService.uploadMarkdownFile({
          localNoteId: note.id,
          name: note.title,
          content: note.content,
        });
      }

      const savedMapping = await upsertDriveMapping({
        userId,
        localNoteId: note.id,
        driveFileId: driveFile.id,
        driveFolderId: driveFile.parentId ?? notesFolderId,
        driveFileName: driveFile.name,
        lastKnownModifiedTime: driveFile.modifiedTime,
        ...(driveFile.md5Checksum
          ? { lastKnownChecksum: driveFile.md5Checksum }
          : {}),
      });
      await syncMappingToSupabase(savedMapping);

      set((state) => ({
        mappingsByLocalNoteId: {
          ...state.mappingsByLocalNoteId,
          [note.id]: savedMapping,
        },
        remoteFiles: [
          driveFile,
          ...state.remoteFiles.filter((f) => f.id !== driveFile.id),
        ],
        busyAction: null,
        pendingConflict: null,
        lastOperationSummary: existingMapping
          ? `Updated "${driveFile.name}" on Drive`
          : `Uploaded "${driveFile.name}" to Nexus/Notes`,
      }));
      return driveFile;
    } catch (err) {
      if (err instanceof DriveError && err.code === 'DRIVE_REVOKED') {
        set((state) => ({
          connection: { ...state.connection, status: 'revoked' },
        }));
      }
      set({
        busyAction: null,
        error:
          err instanceof Error ? err.message : 'Drive upload/update failed.',
      });
      return null;
    }
  },

  readRemoteNote: async (fileId) => {
    set({ busyAction: 'Downloading note from Drive…', error: null });
    try {
      const res = await googleDriveService.readMarkdownFile(fileId);
      set({
        busyAction: null,
        lastOperationSummary: `Downloaded "${res.file.name}" from Drive`,
      });
      return res;
    } catch (err) {
      if (err instanceof DriveError && err.code === 'DRIVE_REVOKED') {
        set((state) => ({
          connection: { ...state.connection, status: 'revoked' },
        }));
      }
      set({
        busyAction: null,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to download note from Drive.',
      });
      throw err;
    }
  },

  recordMapping: async ({ userId, localNoteId, file, folderId }) => {
    const saved = await upsertDriveMapping({
      userId,
      localNoteId,
      driveFileId: file.id,
      driveFolderId: folderId,
      driveFileName: file.name,
      lastKnownModifiedTime: file.modifiedTime,
      ...(file.md5Checksum ? { lastKnownChecksum: file.md5Checksum } : {}),
    });
    await syncMappingToSupabase(saved);

    set((state) => ({
      mappingsByLocalNoteId: {
        ...state.mappingsByLocalNoteId,
        [localNoteId]: saved,
      },
    }));
  },

  deleteRemoteFile: async (fileId) => {
    set({ busyAction: 'Deleting file from Drive…', error: null });
    try {
      await googleDriveService.deleteFile(fileId);
      const mappings = get().mappingsByLocalNoteId;
      let userId: string | undefined;
      const nextMappings = { ...mappings };
      for (const [localId, mapping] of Object.entries(nextMappings)) {
        if (mapping.driveFileId === fileId) {
          userId = mapping.userId;
          delete nextMappings[localId];
        }
      }

      await deleteMappingByDriveFileId(fileId);
      await deleteMappingFromSupabase(userId, fileId);

      set((state) => ({
        remoteFiles: state.remoteFiles.filter((f) => f.id !== fileId),
        mappingsByLocalNoteId: nextMappings,
        busyAction: null,
        lastOperationSummary: 'Deleted file from Google Drive',
      }));
    } catch (err) {
      set({
        busyAction: null,
        error:
          err instanceof Error ? err.message : 'Unable to delete Drive file.',
      });
    }
  },

  clearConflict: () => set({ pendingConflict: null }),
  clearError: () => set({ error: null }),
  reset: () =>
    set({
      connection: DISCONNECTED_DRIVE_INFO,
      remoteFiles: [],
      mappingsByLocalNoteId: {},
      loadingStatus: false,
      busyAction: null,
      error: null,
      lastOperationSummary: null,
      pendingConflict: null,
    }),
}));
