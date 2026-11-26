import {
  addDays,
  buildAllDayRange,
  getEventDateRange,
  getLocalTimezone,
  getTodayDateKey,
  isValidDateKey,
} from '@/features/calendar/utils/calendarDateUtils';
import type { CalendarEventRecord, EventCategory } from '@/services/storage/db';

export interface ParsedIcsEvent {
  readonly uid?: string;
  readonly title: string;
  readonly description?: string;
  readonly location?: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly allDay: boolean;
  readonly timezone?: string;
  readonly category: EventCategory;
}

export interface IcsParseResult {
  readonly events: readonly ParsedIcsEvent[];
  readonly skippedCancelled: number;
  readonly warnings: readonly string[];
}

function unescapeIcsText(raw: string): string {
  return raw
    .replace(/\\\\/g, '\u0000')
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\u0000/g, '\\')
    .trim();
}

function escapeIcsText(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let offset = 75;
  while (offset < line.length) {
    parts.push(` ${line.slice(offset, offset + 74)}`);
    offset += 74;
  }
  return parts.join('\r\n');
}

function zonedWallTimeToIso(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
  timeZone?: string,
): string {
  if (timeZone) {
    try {
      const utcGuess = Date.UTC(y, m - 1, d, hh, mm, ss);
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const getWallMs = (utcMs: number): number => {
        const parts = fmt.formatToParts(new Date(utcMs));
        const map: Record<string, number> = {};
        for (const p of parts) {
          if (p.type !== 'literal') {
            map[p.type] = Number(p.value);
          }
        }
        return Date.UTC(
          map.year ?? y,
          (map.month ?? m) - 1,
          map.day ?? d,
          map.hour === 24 ? 0 : (map.hour ?? hh),
          map.minute ?? mm,
          map.second ?? ss,
        );
      };
      const offset1 = getWallMs(utcGuess) - utcGuess;
      const pass1 = utcGuess - offset1;
      const offset2 = getWallMs(pass1) - pass1;
      return new Date(utcGuess - offset2).toISOString();
    } catch {
      // Fallback to local timezone for non-IANA TZID strings
    }
  }
  return new Date(y, m - 1, d, hh, mm, ss, 0).toISOString();
}

function parseIcsPropertyLine(line: string): {
  name: string;
  params: Record<string, string>;
  value: string;
} | null {
  let inQuotes = false;
  let colonIdx = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ':' && !inQuotes) {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx <= 0) return null;

  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const segments: string[] = [];
  let current = '';
  inQuotes = false;
  for (let i = 0; i < left.length; i += 1) {
    const ch = left[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ';' && !inQuotes) {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);

  const name = (segments[0] ?? '').trim().toUpperCase();
  if (!name) return null;

  const params: Record<string, string> = {};
  for (const param of segments.slice(1)) {
    const eqIdx = param.indexOf('=');
    if (eqIdx > 0) {
      const k = param.slice(0, eqIdx).trim().toUpperCase();
      const v = param.slice(eqIdx + 1).trim().replace(/^"|"$/g, '');
      params[k] = v;
    }
  }

  return { name, params, value };
}

interface ParsedDateToken {
  readonly isDateOnly: boolean;
  readonly dateKey: string;
  readonly iso: string;
  readonly timezone?: string;
}

function parseIcsDateValue(
  rawValue: string,
  params: Record<string, string>,
  calendarTimezone?: string,
): ParsedDateToken | null {
  const val = rawValue.trim();
  const tzid = params.TZID || calendarTimezone;

  // Date-only: YYYYMMDD (e.g. 20261126)
  const dateOnlyMatch = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch || params.VALUE?.toUpperCase() === 'DATE') {
    const digits = val.replace(/\D/g, '');
    if (digits.length >= 8) {
      const dateKey = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
      if (!isValidDateKey(dateKey)) return null;
      return {
        isDateOnly: true,
        dateKey,
        iso: `${dateKey}T00:00:00.000Z`,
        ...(tzid ? { timezone: tzid } : {}),
      };
    }
    return null;
  }

  // DateTime: YYYYMMDDTHHMMSS(Z)
  const dtMatch = val.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i,
  );
  if (!dtMatch) return null;

  const y = Number(dtMatch[1]);
  const m = Number(dtMatch[2]);
  const d = Number(dtMatch[3]);
  const hh = Number(dtMatch[4]);
  const mm = Number(dtMatch[5]);
  const ss = Number(dtMatch[6] ?? '0');
  const isUtc = Boolean(dtMatch[7]);

  const dateKey = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!isValidDateKey(dateKey)) return null;

  const iso = isUtc
    ? new Date(Date.UTC(y, m - 1, d, hh, mm, ss)).toISOString()
    : zonedWallTimeToIso(y, m, d, hh, mm, ss, tzid);

  return {
    isDateOnly: false,
    dateKey,
    iso,
    ...(isUtc ? { timezone: 'UTC' } : tzid ? { timezone: tzid } : {}),
  };
}

function parseIcsDurationMs(rawDuration: string): number | null {
  const match = rawDuration
    .trim()
    .match(
      /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i,
    );
  if (!match) return null;
  const weeks = Number(match[1] ?? 0);
  const days = Number(match[2] ?? 0);
  const hours = Number(match[3] ?? 0);
  const mins = Number(match[4] ?? 0);
  const secs = Number(match[5] ?? 0);
  const totalSeconds =
    weeks * 7 * 86400 + days * 86400 + hours * 3600 + mins * 60 + secs;
  return totalSeconds * 1000;
}

function mapIcsCategory(
  nexusCategory?: string,
  categoriesRaw?: string,
): EventCategory {
  const candidates = [
    nexusCategory?.trim().toLowerCase(),
    ...(categoriesRaw
      ?.split(',')
      .map((s) => s.trim().toLowerCase()) ?? []),
  ];

  for (const cand of candidates) {
    if (!cand) continue;
    if (
      cand === 'study' ||
      cand === 'work' ||
      cand === 'personal' ||
      cand === 'meeting' ||
      cand === 'other'
    ) {
      return cand;
    }
    if (cand.includes('meet')) return 'meeting';
    if (cand.includes('study') || cand.includes('class') || cand.includes('lecture')) {
      return 'study';
    }
    if (cand.includes('work') || cand.includes('project')) return 'work';
  }
  return 'personal';
}

/**
 * Parses an RFC 5545 `.ics` string (including Google Calendar `.ics` exports)
 * into Nexus calendar event records, skipping `VALARM` blocks and cancelled events.
 */
export function parseIcsContent(icsText: string): IcsParseResult {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events: ParsedIcsEvent[] = [];
  const warnings: string[] = [];
  let skippedCancelled = 0;

  let calendarTimezone: string | undefined;
  let inEvent = false;
  let alarmDepth = 0;

  let uid: string | undefined;
  let summary: string | undefined;
  let description: string | undefined;
  let location: string | undefined;
  let status: string | undefined;
  let categoriesRaw: string | undefined;
  let nexusCategory: string | undefined;
  let dtStart: ParsedDateToken | null = null;
  let dtEnd: ParsedDateToken | null = null;
  let durationMs: number | null = null;

  const resetEventFields = () => {
    uid = undefined;
    summary = undefined;
    description = undefined;
    location = undefined;
    status = undefined;
    categoriesRaw = undefined;
    nexusCategory = undefined;
    dtStart = null;
    dtEnd = null;
    durationMs = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      alarmDepth = 0;
      resetEventFields();
      continue;
    }

    if (upper === 'END:VEVENT') {
      if (inEvent) {
        if (status?.toUpperCase() === 'CANCELLED') {
          skippedCancelled += 1;
        } else if (!dtStart) {
          warnings.push(
            `Skipped event "${summary || uid || 'Untitled'}" (missing DTSTART).`,
          );
        } else {
          const allDay = dtStart.isDateOnly;
          let startAt: string;
          let endAt: string;

          if (allDay) {
            const startKey = dtStart.dateKey;
            let inclusiveEndKey = startKey;
            if (dtEnd) {
              const candidate = addDays(dtEnd.dateKey, -1);
              inclusiveEndKey = candidate < startKey ? startKey : candidate;
            } else if (durationMs && durationMs >= 86_400_000) {
              const spanDays = Math.max(
                1,
                Math.round(durationMs / 86_400_000),
              );
              inclusiveEndKey = addDays(startKey, spanDays - 1);
            }
            const range = buildAllDayRange(startKey, inclusiveEndKey);
            startAt = range.startAt;
            endAt = range.endAt;
          } else {
            startAt = dtStart.iso;
            if (dtEnd) {
              endAt =
                Date.parse(dtEnd.iso) >= Date.parse(startAt)
                  ? dtEnd.iso
                  : startAt;
            } else if (durationMs && durationMs > 0) {
              endAt = new Date(Date.parse(startAt) + durationMs).toISOString();
            } else {
              endAt = new Date(
                Date.parse(startAt) + 60 * 60 * 1000,
              ).toISOString();
            }
          }

          const title = summary ? unescapeIcsText(summary) : '(No title)';
          const cleanedDesc = description
            ? unescapeIcsText(description)
            : undefined;
          const cleanedLoc = location ? unescapeIcsText(location) : undefined;
          const tz = dtStart.timezone || calendarTimezone;

          events.push({
            ...(uid ? { uid } : {}),
            title: title || '(No title)',
            ...(cleanedDesc ? { description: cleanedDesc } : {}),
            ...(cleanedLoc ? { location: cleanedLoc } : {}),
            startAt,
            endAt,
            allDay,
            ...(tz ? { timezone: tz } : {}),
            category: mapIcsCategory(nexusCategory, categoriesRaw),
          });
        }
      }
      inEvent = false;
      alarmDepth = 0;
      continue;
    }

    if (inEvent) {
      if (upper === 'BEGIN:VALARM') {
        alarmDepth += 1;
        continue;
      }
      if (upper === 'END:VALARM') {
        alarmDepth = Math.max(0, alarmDepth - 1);
        continue;
      }
      if (alarmDepth > 0) continue;
    }

    const prop = parseIcsPropertyLine(line);
    if (!prop) continue;

    if (!inEvent) {
      if (prop.name === 'X-WR-TIMEZONE' && prop.value.trim()) {
        calendarTimezone = prop.value.trim();
      }
      continue;
    }

    switch (prop.name) {
      case 'UID':
        uid = prop.value.trim() || undefined;
        break;
      case 'SUMMARY':
        summary = prop.value;
        break;
      case 'DESCRIPTION':
        description = prop.value;
        break;
      case 'LOCATION':
        location = prop.value;
        break;
      case 'STATUS':
        status = prop.value.trim();
        break;
      case 'CATEGORIES':
        categoriesRaw = prop.value;
        break;
      case 'X-NEXUS-CATEGORY':
        nexusCategory = prop.value;
        break;
      case 'DTSTART':
        dtStart = parseIcsDateValue(prop.value, prop.params, calendarTimezone);
        break;
      case 'DTEND':
        dtEnd = parseIcsDateValue(prop.value, prop.params, calendarTimezone);
        break;
      case 'DURATION':
        durationMs = parseIcsDurationMs(prop.value);
        break;
      default:
        break;
    }
  }

  return { events, skippedCancelled, warnings };
}

/**
 * Reads `.ics` files directly and extracts nested `.ics` files from Google
 * Calendar `.ics.zip` export archives using dynamic JSZip loading.
 */
export async function extractIcsFilesFromUploads(
  files: FileList | readonly File[],
): Promise<{
  readonly contents: readonly { name: string; text: string }[];
  readonly warnings: readonly string[];
}> {
  const contents: { name: string; text: string }[] = [];
  const warnings: string[] = [];
  const list = Array.from(files);

  for (const file of list) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.ics') || file.type === 'text/calendar') {
      contents.push({ name: file.name, text: await file.text() });
    } else if (
      lower.endsWith('.zip') ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed'
    ) {
      const { default: JSZip } = await import('jszip');
      const archive = await JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(archive.files).filter(
        (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.ics'),
      );
      if (entries.length === 0) {
        warnings.push(`No .ics files found inside "${file.name}".`);
      }
      for (const entry of entries) {
        contents.push({
          name: entry.name,
          text: await entry.async('string'),
        });
      }
    } else {
      warnings.push(
        `Unsupported file "${file.name}". Please upload .ics or Google Calendar .zip exports.`,
      );
    }
  }

  return { contents, warnings };
}

function formatIsoToIcsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return formatIsoToIcsUtc(new Date().toISOString());
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

/**
 * Serializes Nexus calendar events into a standards-compliant RFC 5545 `.ics`
 * file ready for import into Google Calendar, Apple Calendar, or Outlook.
 */
export function exportEventsToIcs(
  events: readonly CalendarEventRecord[],
  calendarName = 'Nexus Calendar',
): string {
  const nowStamp = formatIsoToIcsUtc(new Date().toISOString());
  const timezone = getLocalTimezone();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nexus//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(calendarName)}`),
    foldIcsLine(`X-WR-TIMEZONE:${escapeIcsText(timezone)}`),
  ];

  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    const rawUid = ev.googleEventId?.startsWith('ics:')
      ? ev.googleEventId.slice(4)
      : `${ev.id}@nexus.local`;
    lines.push(foldIcsLine(`UID:${rawUid}`));
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`CREATED:${formatIsoToIcsUtc(ev.createdAt)}`);
    lines.push(`LAST-MODIFIED:${formatIsoToIcsUtc(ev.updatedAt)}`);

    if (ev.allDay) {
      const { startDateKey, endDateKey } = getEventDateRange(ev);
      const exclusiveEnd = addDays(
        endDateKey < startDateKey ? startDateKey : endDateKey,
        1,
      );
      lines.push(`DTSTART;VALUE=DATE:${startDateKey.replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${exclusiveEnd.replace(/-/g, '')}`);
    } else {
      lines.push(`DTSTART:${formatIsoToIcsUtc(ev.startAt)}`);
      lines.push(`DTEND:${formatIsoToIcsUtc(ev.endAt)}`);
    }

    lines.push(foldIcsLine(`SUMMARY:${escapeIcsText(ev.title)}`));
    if (ev.description) {
      lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(ev.description)}`));
    }
    if (ev.location) {
      lines.push(foldIcsLine(`LOCATION:${escapeIcsText(ev.location)}`));
    }
    lines.push(`CATEGORIES:${ev.category.toUpperCase()}`);
    lines.push(`X-NEXUS-CATEGORY:${ev.category}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Triggers a browser file download for an exported `.ics` calendar string.
 */
export function triggerIcsDownload(
  icsContent: string,
  fileName = `nexus-calendar-${getTodayDateKey()}.ics`,
): void {
  const blob = new Blob([icsContent], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
