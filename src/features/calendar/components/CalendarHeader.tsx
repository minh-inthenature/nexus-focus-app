import { useRef, type ChangeEvent } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import type {
  CalendarSaveStatus,
  CalendarViewMode,
} from '@/features/calendar/stores/useCalendarStore';
import {
  formatDayHeaderLabel,
  formatMonthYearLabel,
  formatWeekRangeLabel,
  getWeekDates,
} from '@/features/calendar/utils/calendarDateUtils';
import { cn } from '@/utils/cn';

export interface CalendarHeaderProps {
  viewMode: CalendarViewMode;
  selectedDate: string;
  saveStatus: CalendarSaveStatus;
  eventCount: number;
  googleCalendarConnected?: boolean;
  googleCalendarRevoked?: boolean;
  googleCalendarSyncing?: boolean;
  canConnectGoogleCalendar?: boolean;
  importingIcs?: boolean;
  onSyncGoogleCalendar?: () => void;
  onConnectGoogleCalendar?: () => void;
  onImportIcsFiles?: (files: FileList) => void;
  onExportIcs?: () => void;
  onChangeViewMode: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onThisWeek: () => void;
  onThisMonth: () => void;
  onNewEvent: () => void;
}

const VIEW_MODES: readonly {
  id: CalendarViewMode;
  label: string;
  icon: typeof CalendarDays;
}[] = [
  { id: 'month', label: 'Month', icon: CalendarDays },
  { id: 'week', label: 'Week', icon: CalendarRange },
  { id: 'day', label: 'Day', icon: Clock },
  { id: 'agenda', label: 'Agenda', icon: List },
];

/**
 * Top workspace header and view/navigation bar for the Calendar module.
 */
export function CalendarHeader({
  viewMode,
  selectedDate,
  saveStatus,
  eventCount,
  googleCalendarConnected = false,
  googleCalendarRevoked = false,
  googleCalendarSyncing = false,
  canConnectGoogleCalendar = false,
  importingIcs = false,
  onSyncGoogleCalendar,
  onConnectGoogleCalendar,
  onImportIcsFiles,
  onExportIcs,
  onChangeViewMode,
  onPrev,
  onNext,
  onToday,
  onThisWeek,
  onThisMonth,
  onNewEvent,
}: CalendarHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0 && onImportIcsFiles) {
      onImportIcsFiles(files);
    }
    event.target.value = '';
  };

  const periodLabel =
    viewMode === 'month'
      ? formatMonthYearLabel(selectedDate)
      : viewMode === 'week'
        ? formatWeekRangeLabel(getWeekDates(selectedDate))
        : viewMode === 'day'
          ? formatDayHeaderLabel(selectedDate)
          : `From ${formatDayHeaderLabel(selectedDate)}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendar"
        subtitle={`${eventCount} scheduled event${eventCount === 1 ? '' : 's'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            >
              {saveStatus === 'saving' ? (
                <>
                  <Loader2
                    className="h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />
                  <span>Saving…</span>
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <AlertCircle
                    className="h-3 w-3 text-destructive"
                    aria-hidden="true"
                  />
                  <span className="text-destructive">Save error</span>
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" aria-hidden="true" />
                  <span>Saved</span>
                </>
              )}
            </span>

            {onImportIcsFiles ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ics,.zip,text/calendar,application/zip"
                  multiple
                  aria-label="Import .ics or Google Calendar .zip file"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={importingIcs}
                  title="Import .ics or Google Calendar .zip archive"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {importingIcs ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{importingIcs ? 'Importing…' : 'Import'}</span>
                </Button>
              </>
            ) : null}

            {onExportIcs ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={eventCount === 0}
                title="Export visible events as .ics for Google Calendar"
                onClick={onExportIcs}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Export</span>
              </Button>
            ) : null}

            {googleCalendarConnected && onSyncGoogleCalendar ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={googleCalendarSyncing}
                onClick={onSyncGoogleCalendar}
              >
                <RefreshCw
                  className={cn(
                    'h-3.5 w-3.5',
                    googleCalendarSyncing && 'animate-spin',
                  )}
                  aria-hidden="true"
                />
                <span>
                  {googleCalendarSyncing ? 'Syncing Google…' : 'Sync Google'}
                </span>
              </Button>
            ) : canConnectGoogleCalendar && onConnectGoogleCalendar ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onConnectGoogleCalendar}
              >
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {googleCalendarRevoked ? 'Reconnect Google' : 'Connect Google'}
                </span>
              </Button>
            ) : null}

            <Button type="button" size="sm" onClick={onNewEvent}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New Event</span>
            </Button>
          </div>
        }
      />

      {/* Period Navigation & View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={onToday}
              className="rounded px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={onThisWeek}
              className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
            >
              This week
            </button>
            <button
              type="button"
              onClick={onThisMonth}
              className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
            >
              This month
            </button>
          </div>

          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onPrev}
              aria-label="Previous period"
              className="h-7 w-7"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onNext}
              aria-label="Next period"
              className="h-7 w-7"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>

          <h2 className="pl-1 text-sm font-semibold text-foreground">
            {periodLabel}
          </h2>
        </div>

        <div
          role="group"
          aria-label="Calendar view mode"
          className="inline-flex rounded-md border border-border bg-card p-0.5"
        >
          {VIEW_MODES.map((mode) => {
            const Icon = mode.icon;
            const active = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChangeViewMode(mode.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
