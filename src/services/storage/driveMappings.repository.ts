import { createUuid, db, type DriveNoteMappingRecord } from './db';

export interface UpsertDriveMappingInput {
  readonly userId: string;
  readonly localNoteId: string;
  readonly driveFileId: string;
  readonly driveFolderId: string;
  readonly driveFileName?: string;
  readonly lastKnownModifiedTime?: string;
  readonly lastKnownChecksum?: string;
}

/**
 * Lists locally cached Google Drive <-> local note mappings.
 */
export async function listDriveMappings(
  userId?: string,
): Promise<DriveNoteMappingRecord[]> {
  if (userId) {
    return db.drive_note_mappings.where('userId').equals(userId).toArray();
  }
  return db.drive_note_mappings.toArray();
}

export async function getMappingByLocalNoteId(
  localNoteId: string,
  userId?: string,
): Promise<DriveNoteMappingRecord | null> {
  const record = await db.drive_note_mappings
    .where('localNoteId')
    .equals(localNoteId)
    .first();
  if (!record) return null;
  if (userId && record.userId !== userId) return null;
  return record;
}

export async function getMappingByDriveFileId(
  driveFileId: string,
  userId?: string,
): Promise<DriveNoteMappingRecord | null> {
  const record = await db.drive_note_mappings
    .where('driveFileId')
    .equals(driveFileId)
    .first();
  if (!record) return null;
  if (userId && record.userId !== userId) return null;
  return record;
}

export async function upsertDriveMapping(
  input: UpsertDriveMappingInput,
): Promise<DriveNoteMappingRecord> {
  const existing = await db.drive_note_mappings
    .where('localNoteId')
    .equals(input.localNoteId)
    .first();
  const now = new Date().toISOString();

  const record: DriveNoteMappingRecord = {
    id: existing?.id ?? createUuid(),
    userId: input.userId,
    localNoteId: input.localNoteId,
    driveFileId: input.driveFileId,
    driveFolderId: input.driveFolderId,
    ...(input.driveFileName !== undefined
      ? { driveFileName: input.driveFileName }
      : existing?.driveFileName !== undefined
        ? { driveFileName: existing.driveFileName }
        : {}),
    ...(input.lastKnownModifiedTime !== undefined
      ? { lastKnownModifiedTime: input.lastKnownModifiedTime }
      : existing?.lastKnownModifiedTime !== undefined
        ? { lastKnownModifiedTime: existing.lastKnownModifiedTime }
        : {}),
    ...(input.lastKnownChecksum !== undefined
      ? { lastKnownChecksum: input.lastKnownChecksum }
      : existing?.lastKnownChecksum !== undefined
        ? { lastKnownChecksum: existing.lastKnownChecksum }
        : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.drive_note_mappings.put(record);
  return record;
}

export async function deleteMappingByLocalNoteId(
  localNoteId: string,
): Promise<void> {
  await db.drive_note_mappings.where('localNoteId').equals(localNoteId).delete();
}

export async function deleteMappingByDriveFileId(
  driveFileId: string,
): Promise<void> {
  await db.drive_note_mappings.where('driveFileId').equals(driveFileId).delete();
}

export async function clearUserDriveMappings(userId: string): Promise<void> {
  await db.drive_note_mappings.where('userId').equals(userId).delete();
}
