export function habitLogEntityId(
  habitId: string,
  completedDate: string,
): string {
  return `${habitId}|${completedDate}`;
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseHabitLogEntityId(
  entityId: string,
): { habitId: string; completedDate: string } | null {
  const idx = entityId.lastIndexOf('|');
  if (idx <= 0) return null;
  const habitId = entityId.slice(0, idx);
  const completedDate = entityId.slice(idx + 1);
  if (!habitId || !ISO_DAY_RE.test(completedDate)) {
    return null;
  }
  return { habitId, completedDate };
}
