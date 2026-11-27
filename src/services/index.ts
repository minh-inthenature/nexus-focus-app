export {
  db,
  createUuid,
  NexusDatabase,
  type AttachmentRecord,
  type CalendarEventRecord,
  type CodeLanguage,
  type DriveNoteMappingRecord,
  type EventCategory,
  type EventColor,
  type FolderRecord,
  type NoteLinkRecord,
  type NoteRecord,
  type NoteRevisionRecord,
  type NoteTagRecord,
  type NoteType,
  type TagRecord,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
} from './storage/db';
export {
  applyRemoteCalendarEventUpsert,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEventByGoogleId,
  getCalendarEventById,
  listAllCalendarEventsIncludingDeleted,
  listCalendarEvents,
  listEventsForNote,
  listEventsForTask,
  purgeDeletedCalendarEventTombstone,
  updateCalendarEvent,
  updateCalendarEventGoogleMeta,
  type CreateCalendarEventInput,
  type UpdateCalendarEventPatch,
} from './storage/calendarEvents.repository';
export {
  localCalendarProvider,
  type CalendarProvider,
} from './calendar/calendarProvider';
export {
  applyRemoteTaskUpsert,
  createTask,
  deleteTask,
  getTaskById,
  listAllTasksIncludingDeleted,
  listTasks,
  listTasksForNote,
  purgeDeletedTaskTombstone,
  toggleTaskCompleted,
  updateTask,
  type CreateTaskInput,
  type UpdateTaskPatch,
} from './storage/tasks.repository';
export {
  clearUserDriveMappings,
  deleteMappingByDriveFileId,
  deleteMappingByLocalNoteId,
  getMappingByDriveFileId,
  getMappingByLocalNoteId,
  listDriveMappings,
  upsertDriveMapping,
  type UpsertDriveMappingInput,
} from './storage/driveMappings.repository';
export {
  DISCONNECTED_CALENDAR_INFO,
  GoogleCalendarError,
  googleCalendarService,
  type CalendarSyncErrorCode,
} from './google-calendar/google-calendar.service';
export {
  googleEventToNexusRecord,
  nexusEventToGooglePayload,
  planGoogleCalendarTwoWaySync,
  type CalendarConnectionInfo,
  type CalendarConnectionStatus,
  type GoogleCalendarEventDateTime,
  type GoogleCalendarEventDto,
  type GoogleCalendarEventPayload,
  type GoogleCalendarListResponse,
  type GoogleCalendarSyncPlan,
} from './google-calendar/googleCalendarMapper';
export {
  getSupabaseClient,
} from './auth/supabase.client';
export {
  supabaseAuthService,
  SupabaseAuthService,
} from './auth/supabase-auth.service';
export {
  DISCONNECTED_DRIVE_INFO,
  EdgeGoogleDriveService,
  googleDriveService,
} from './google-drive/google-drive.service';
export {
  DriveError,
  type DriveConflictPayload,
  type DriveConnectionInfo,
  type DriveConnectionStatus,
  type DriveErrorCode,
  type DriveFileRef,
  type DriveFolderRef,
  type GoogleDriveService,
  type NexusDriveFolderStructure,
} from './google-drive/drive.service';
export {
  buildFolderPathMap,
  createFolder,
  deleteFolder,
  ensureFolderHierarchy,
  getFolderDescendantStats,
  listFolders,
  renameFolder,
  type DeleteFolderMode,
  type FolderDescendantStats,
} from './storage/folders.repository';
export {
  createNote,
  deleteNote,
  disambiguateWikiLink,
  getAdjacentDailyNotes,
  getBacklinks,
  getNoteById,
  getOrCreateDailyNote,
  listNotes,
  listTagsAndMappings,
  moveNote,
  renameNote,
  toggleFavoriteNote,
  updateNoteContent,
  updateNoteLanguage,
  type CreateNoteInput,
  type TagWithCount,
} from './storage/notes.repository';
export {
  attachmentService,
  IndexedDBAttachmentService,
  MAX_LOCAL_ATTACHMENT_BYTES,
  sanitizeAttachmentFileName,
  validateAttachmentFile,
  type AttachmentStorageAdapter,
} from './storage/attachment.service';
export {
  buildFullBackupZipBlob,
  downloadFullBackupZip,
  inspectBackupArchive,
  NEXUS_APP_VERSION,
  NEXUS_BACKUP_FORMAT,
  NEXUS_BACKUP_SCHEMA_VERSION,
  restoreBackupArchive,
  type BackupAttachmentMeta,
  type BackupManifest,
  type BackupRestoreMode,
  type BackupRestoreSummary,
  type BackupSettingsSnapshot,
  type BackupSnapshotInput,
  type ParsedBackupInspection,
} from './storage/backup.service';
export {
  exportNoteAsMarkdown,
  exportVaultAsZip,
  importMarkdownFiles,
  type ImportResult,
} from './storage/importExport.service';
export type {
  AuthService,
  AuthSession,
  AuthStateListener,
  AuthUser,
} from './auth/auth.service';
export type {
  LocalCalendarEventRecord,
  LocalNoteRecord,
  LocalStorageService,
  LocalTaskRecord,
  OfflineOperation,
  OfflineOperationEntity,
  OfflineOperationKind,
} from './storage/storage.service';
export type {
  SyncConflict,
  SyncService,
  SyncState,
  SyncSummary,
} from './sync/sync.service';
export {
  listSyncConflicts,
  recordSyncConflict,
  resolveSyncConflict,
} from './sync/conflictResolver';
export {
  NexusSyncEngine,
  syncEngine,
  type SyncRuntimeContext,
} from './sync/syncEngine';
export {
  buildSyncPlan,
  type SyncPlannerInput,
} from './sync/syncPlanner';
export {
  clearPendingChangesForEntity,
  computeCoalescedOperation,
  enqueueSyncChangeInTx,
  getOutboxCounts,
  listActionableChanges,
  notifySyncQueueMutated,
  purgeSyncedChanges,
  recoverStuckSyncingChanges,
  resetFailedChangesToPending,
  subscribeSyncQueueMutation,
} from './sync/syncQueue';
export type {
  RemoteAttachmentMetadata,
  RemoteCalendarEventMetadata,
  RemoteCloudNoteMetadata,
  RemoteFolderMetadata,
  RemoteNoteMappingMetadata,
  RemoteTaskMetadata,
  SyncChange,
  SyncChangeStatus,
  SyncConflictRecord,
  SyncConflictResolution,
  SyncEngineState,
  SyncEntityType,
  SyncMetaRecord,
  SyncOperation,
  SyncPlan,
  SyncPlanAction,
  SyncStatusSnapshot,
  SyncTrigger,
} from './sync/syncTypes';
