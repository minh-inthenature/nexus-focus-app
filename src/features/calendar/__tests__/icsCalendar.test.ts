import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { CalendarEventRecord } from '@/services/storage/db';
import {
  exportEventsToIcs,
  extractIcsFilesFromUploads,
  parseIcsContent,
} from '../utils/icsCalendar';

describe('RFC 5545 .ics calendar parser, ZIP extractor & exporter', () => {
  it('parses folded lines, escaped text, VALARM blocks, TZID, DURATION, and skips cancelled events', () => {
    const sampleIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
      'BEGIN:VEVENT',
      'UID:google-uid-1@google.com',
      'DTSTART;TZID=Asia/Ho_Chi_Minh:20261126T090000',
      'DURATION:PT1H30M',
      'SUMMARY:Sprint Planning\\, Q4\\; Team',
      'DESCRIPTION:Line one\\nLine two ',
      ' continued line\\\\end',
      'LOCATION:Room 402\\, HQ',
      'CATEGORIES:WORK',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:This should NOT overwrite the event description',
      'SUMMARY:Alarm summary ignored',
      'END:VALARM',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:google-allday-1@google.com',
      'DTSTART;VALUE=DATE:20261128',
      'DTEND;VALUE=DATE:20261130',
      'SUMMARY:Company Retreat',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:cancelled-1@google.com',
      'DTSTART:20261127T120000Z',
      'DTEND:20261127T130000Z',
      'SUMMARY:Cancelled Sync',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const parsed = parseIcsContent(sampleIcs);

    expect(parsed.skippedCancelled).toBe(1);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.events).toHaveLength(2);

    const timed = parsed.events[0]!;
    expect(timed.uid).toBe('google-uid-1@google.com');
    expect(timed.title).toBe('Sprint Planning, Q4; Team');
    expect(timed.description).toBe('Line one\nLine two continued line\\end');
    expect(timed.location).toBe('Room 402, HQ');
    expect(timed.allDay).toBe(false);
    expect(timed.category).toBe('work');
    expect(timed.startAt).toBe('2026-11-26T02:00:00.000Z');
    expect(timed.endAt).toBe('2026-11-26T03:30:00.000Z');

    const allDay = parsed.events[1]!;
    expect(allDay.uid).toBe('google-allday-1@google.com');
    expect(allDay.title).toBe('Company Retreat');
    expect(allDay.allDay).toBe(true);
    expect(allDay.startAt).toBe('2026-11-28T00:00:00.000Z');
    expect(allDay.endAt).toBe('2026-11-29T23:59:59.999Z');
  });

  it('round-trips Nexus events through exportEventsToIcs and parseIcsContent', () => {
    const events: CalendarEventRecord[] = [
      {
        id: 'ev-timed-1',
        userId: 'local',
        title: 'Algorithms Review, Part 1',
        description: 'Cover graphs\nand dynamic programming',
        location: 'Library; Floor 2',
        startAt: '2026-11-26T14:00:00.000Z',
        endAt: '2026-11-26T15:30:00.000Z',
        allDay: false,
        timezone: 'UTC',
        category: 'study',
        linkedNoteIds: [],
        linkedTaskIds: [],
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        revision: 1,
      },
      {
        id: 'ev-allday-1',
        userId: 'local',
        title: 'Hackathon Weekend',
        startAt: '2026-12-05T00:00:00.000Z',
        endAt: '2026-12-06T23:59:59.999Z',
        allDay: true,
        category: 'personal',
        linkedNoteIds: [],
        linkedTaskIds: [],
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        revision: 1,
      },
    ];

    const ics = exportEventsToIcs(events);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261205');
    expect(ics).toContain('DTEND;VALUE=DATE:20261207');

    const roundTripped = parseIcsContent(ics);
    expect(roundTripped.events).toHaveLength(2);
    expect(roundTripped.events[0]).toMatchObject({
      uid: 'ev-timed-1@nexus.local',
      title: 'Algorithms Review, Part 1',
      description: 'Cover graphs\nand dynamic programming',
      location: 'Library; Floor 2',
      startAt: '2026-11-26T14:00:00.000Z',
      endAt: '2026-11-26T15:30:00.000Z',
      allDay: false,
      category: 'study',
    });
    expect(roundTripped.events[1]).toMatchObject({
      uid: 'ev-allday-1@nexus.local',
      title: 'Hackathon Weekend',
      startAt: '2026-12-05T00:00:00.000Z',
      endAt: '2026-12-06T23:59:59.999Z',
      allDay: true,
      category: 'personal',
    });
  });

  it('extracts .ics files from Google Calendar .zip export archives', async () => {
    const zip = new JSZip();
    zip.file(
      'personal@gmail.com.ics',
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:z1\r\nDTSTART:20261126T100000Z\r\nDTEND:20261126T110000Z\r\nSUMMARY:From Zip\r\nEND:VEVENT\r\nEND:VCALENDAR',
    );
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const blob = new Blob([bytes], { type: 'application/zip' });
    const mockZipFile = {
      name: 'google-calendar-export.zip',
      type: 'application/zip',
      arrayBuffer: () => blob.arrayBuffer(),
      text: () => blob.text(),
    } as unknown as File;

    const extracted = await extractIcsFilesFromUploads([mockZipFile]);
    expect(extracted.warnings).toEqual([]);
    expect(extracted.contents).toHaveLength(1);
    expect(extracted.contents[0]?.name).toBe('personal@gmail.com.ics');

    const parsed = parseIcsContent(extracted.contents[0]!.text);
    expect(parsed.events[0]?.title).toBe('From Zip');
  });

  it('imports and exports recurring RRULE, EXDATE, and RECURRENCE-ID overrides cleanly', () => {
    const googleRecurringIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:weekly-tue@google.com',
      'DTSTART;TZID=UTC:20261103T100000Z',
      'DTEND;TZID=UTC:20261103T110000Z',
      'RRULE:FREQ=WEEKLY;BYDAY=TU',
      'EXDATE;VALUE=DATE:20261110',
      'SUMMARY:Weekly Lecture',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:weekly-tue@google.com',
      'RECURRENCE-ID:20261117T100000Z',
      'DTSTART:20261118T140000Z',
      'DTEND:20261118T150000Z',
      'SUMMARY:Weekly Lecture (Rescheduled)',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const parsed = parseIcsContent(googleRecurringIcs);
    expect(parsed.events).toHaveLength(2);

    const master = parsed.events[0]!;
    expect(master.uid).toBe('weekly-tue@google.com');
    expect(master.rrule).toBe('FREQ=WEEKLY;BYDAY=TU');
    expect(master.exdates).toEqual(['2026-11-10', '2026-11-17']);

    const override = parsed.events[1]!;
    expect(override.uid).toBe('weekly-tue@google.com__2026-11-17');
    expect(override.rrule).toBeUndefined();
    expect(override.title).toBe('Weekly Lecture (Rescheduled)');

    const exported = exportEventsToIcs([
      {
        id: 'rec-1',
        userId: 'local',
        title: master.title,
        startAt: master.startAt,
        endAt: master.endAt,
        allDay: false,
        timezone: 'UTC',
        category: 'study',
        linkedNoteIds: [],
        linkedTaskIds: [],
        rrule: master.rrule,
        exdates: master.exdates,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
        revision: 1,
      },
    ]);
    expect(exported).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU');
    expect(exported).toContain('EXDATE;VALUE=DATE:20261110,20261117');
  });
});
