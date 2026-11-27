import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { LoadingState } from '@/components/common/LoadingState';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { TaskEditorDialog } from '@/features/tasks/components/TaskEditorDialog';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import { extractAllTaskCategories } from '@/features/tasks/utils/taskFilters';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { useAuthStore } from '@/stores/useAuthStore';
import { useGoogleCalendarStore } from '@/stores/useGoogleCalendarStore';
import { CalendarAgendaView } from './components/CalendarAgendaView';
import { CalendarDayView } from './components/CalendarDayView';
import { CalendarEventDialog } from './components/CalendarEventDialog';
import { CalendarFiltersBar } from './components/CalendarFiltersBar';
import { CalendarHeader } from './components/CalendarHeader';
import { CalendarMonthView } from './components/CalendarMonthView';
import { CalendarQuickAdd } from './components/CalendarQuickAdd';
import { CalendarWeekView } from './components/CalendarWeekView';
import {
  useCalendarStore,
  type CalendarViewMode,
} from './stores/useCalendarStore';
import {
  addDays,
  addOneHourHHMM,
  filterCalendarEvents,
  getMonthGridDates,
  getWeekDates,
  isValidDateKey,
} from './utils/calendarDateUtils';
import { expandRecurringEventsForWindow } from './utils/recurrence';
import {
  exportEventsToIcs,
  triggerIcsDownload,
} from './utils/icsCalendar';

const VALID_VIEWS: readonly CalendarViewMode[] = [
  'month',
  'week',
  'day',
  'agenda',
];

/**
 * Local-first Calendar workspace integrating personal events, Tasks due dates,
 * and Markdown Notes links across Month, Week, Day, and Agenda views.
 */
export function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    events,
    initialized,
    loading,
    saveStatus,
    error,
    viewMode,
    selectedDate,
    searchQuery,
    categoryFilter,
    startDateFilter,
    endDateFilter,
    linkedNoteIdFilter,
    linkedTaskIdFilter,
    showTasks,
    showCompletedTasks,
    editorOpen,
    editingEventId,
    draftDefaults,
    taskModalDate,
    initialize,
    setViewMode,
    setSelectedDate,
    navigatePrev,
    navigateNext,
    goToday,
    goThisWeek,
    goThisMonth,
    setSearchQuery,
    setCategoryFilter,
    setStartDateFilter,
    setEndDateFilter,
    setLinkedNoteIdFilter,
    setLinkedTaskIdFilter,
    setShowTasks,
    setShowCompletedTasks,
    clearFilters,
    openCreateModal,
    openEditModal,
    closeEditor,
    openCreateTaskForDate,
    closeCreateTaskModal,
    createEvent,
    updateEvent,
    deleteEvent,
    importIcsFiles,
  } = useCalendarStore();

  const [importingIcs, setImportingIcs] = useState(false);
  const [icsNotice, setIcsNotice] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const notes = useNotesStore((state) => state.notes);
  const initializeNotes = useNotesStore((state) => state.initialize);
  const createNote = useNotesStore((state) => state.createNote);

  const tasks = useTasksStore((state) => state.tasks);
  const initializeTasks = useTasksStore((state) => state.initialize);
  const createTask = useTasksStore((state) => state.createTask);
  const toggleTaskCompleted = useTasksStore((state) => state.toggleCompleted);

  const authStatus = useAuthStore((state) => state.status);
  const isAuthenticated = authStatus === 'authenticated';
  const googleCalConn = useGoogleCalendarStore((state) => state.connection);
  const googleCalSyncing = useGoogleCalendarStore((state) => state.syncing);
  const googleCalError = useGoogleCalendarStore((state) => state.error);
  const googleCalSummary = useGoogleCalendarStore(
    (state) => state.lastSyncSummary,
  );
  const connectGoogleCalendar = useGoogleCalendarStore(
    (state) => state.connectCalendar,
  );
  const syncGoogleCalendar = useGoogleCalendarStore((state) => state.syncNow);

  useEffect(() => {
    void initialize();
    void initializeNotes();
    void initializeTasks();
  }, [initialize, initializeNotes, initializeTasks]);

  // Honor deep-links from Notes/Tasks/Home such as `/calendar?date=2026-11-28&view=day&eventId=...`
  useEffect(() => {
    const paramDate = searchParams.get('date');
    const paramView = searchParams.get('view');
    const paramEventId = searchParams.get('eventId');
    let consumed = false;
    const next = new URLSearchParams(searchParams);

    if (paramDate && isValidDateKey(paramDate)) {
      setSelectedDate(paramDate);
      next.delete('date');
      consumed = true;
    }
    if (
      paramView &&
      VALID_VIEWS.includes(paramView as CalendarViewMode)
    ) {
      setViewMode(paramView as CalendarViewMode);
      next.delete('view');
      consumed = true;
    }
    if (paramEventId && initialized) {
      if (events.some((ev) => ev.id === paramEventId)) {
        openEditModal(paramEventId);
      }
      next.delete('eventId');
      consumed = true;
    }

    if (consumed) {
      setSearchParams(next, { replace: true });
    }
  }, [
    searchParams,
    setSearchParams,
    initialized,
    events,
    setSelectedDate,
    setViewMode,
    openEditModal,
  ]);

  useKeyboardShortcut({ key: 'e', shift: true, ctrlOrMeta: true }, () =>
    openCreateModal({ startDateKey: selectedDate, endDateKey: selectedDate }),
  );

  const notesById = useMemo(
    () => new Map(notes.map((n) => [n.id, n])),
    [notes],
  );
  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  );
  const taskCategories = useMemo(
    () => extractAllTaskCategories(tasks),
    [tasks],
  );

  const activeWindow = useMemo(() => {
    if (viewMode === 'month') {
      const grid = getMonthGridDates(selectedDate);
      return {
        startKey: grid[0] ?? selectedDate,
        endKey: grid[grid.length - 1] ?? selectedDate,
      };
    }
    if (viewMode === 'week') {
      const week = getWeekDates(selectedDate);
      return {
        startKey: week[0] ?? selectedDate,
        endKey: week[week.length - 1] ?? selectedDate,
      };
    }
    if (viewMode === 'day') {
      return { startKey: selectedDate, endKey: selectedDate };
    }
    const minAgenda = startDateFilter || selectedDate;
    const maxAgenda =
      endDateFilter && endDateFilter >= minAgenda
        ? endDateFilter
        : addDays(minAgenda, 90);
    return { startKey: minAgenda, endKey: maxAgenda };
  }, [viewMode, selectedDate, startDateFilter, endDateFilter]);

  const expandedEvents = useMemo(
    () =>
      expandRecurringEventsForWindow(
        events,
        activeWindow.startKey,
        activeWindow.endKey,
      ),
    [events, activeWindow.startKey, activeWindow.endKey],
  );

  const visibleEvents = useMemo(
    () =>
      filterCalendarEvents(expandedEvents, {
        searchQuery,
        categoryFilter,
        startDateFilter,
        endDateFilter,
        linkedNoteId: linkedNoteIdFilter,
        linkedTaskId: linkedTaskIdFilter,
      }),
    [
      expandedEvents,
      searchQuery,
      categoryFilter,
      startDateFilter,
      endDateFilter,
      linkedNoteIdFilter,
      linkedTaskIdFilter,
    ],
  );

  const visibleTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (linkedNoteIdFilter && !t.linkedNoteIds.includes(linkedNoteIdFilter)) {
        return false;
      }
      if (linkedTaskIdFilter && t.id !== linkedTaskIdFilter) {
        return false;
      }
      if (query) {
        const matchTitle = t.title.toLowerCase().includes(query);
        const matchDesc = t.description?.toLowerCase().includes(query) ?? false;
        if (!matchTitle && !matchDesc) return false;
      }
      if (startDateFilter && t.dueDate && t.dueDate < startDateFilter) {
        return false;
      }
      if (endDateFilter && t.dueDate && t.dueDate > endDateFilter) {
        return false;
      }
      return true;
    });
  }, [
    tasks,
    searchQuery,
    linkedNoteIdFilter,
    linkedTaskIdFilter,
    startDateFilter,
    endDateFilter,
  ]);

  const editingEvent = editingEventId
    ? events.find((ev) => ev.id === editingEventId) ?? null
    : null;

  const openSlotModal = (dateKey: string, startTimeHHMM?: string) => {
    if (startTimeHHMM) {
      const next = addOneHourHHMM(startTimeHHMM);
      openCreateModal({
        startDateKey: dateKey,
        startTime: startTimeHHMM,
        endTime: next.time,
        allDay: false,
      });
    } else {
      openCreateModal({
        startDateKey: dateKey,
        endDateKey: dateKey,
      });
    }
  };

  if (loading && !initialized) {
    return <LoadingState label="Loading calendar…" />;
  }

  return (
    <div className="space-y-5">
      <CalendarHeader
        viewMode={viewMode}
        selectedDate={selectedDate}
        saveStatus={saveStatus}
        eventCount={visibleEvents.length}
        googleCalendarConnected={googleCalConn.status === 'connected'}
        googleCalendarRevoked={googleCalConn.status === 'revoked'}
        googleCalendarSyncing={googleCalSyncing}
        canConnectGoogleCalendar={isAuthenticated}
        importingIcs={importingIcs}
        onSyncGoogleCalendar={() => void syncGoogleCalendar()}
        onConnectGoogleCalendar={() => void connectGoogleCalendar()}
        onImportIcsFiles={(files) => {
          setImportingIcs(true);
          setIcsNotice(null);
          void importIcsFiles(files)
            .then((res) => {
              const parts: string[] = [];
              parts.push(
                `Imported ${res.imported} event${res.imported === 1 ? '' : 's'}`,
              );
              if (res.updated > 0) parts.push(`${res.updated} updated`);
              if (res.skipped > 0) parts.push(`${res.skipped} duplicate(s) skipped`);
              if (res.cancelled > 0) parts.push(`${res.cancelled} cancelled skipped`);
              setIcsNotice({
                kind: 'success',
                message: `${parts.join(', ')} from ${res.fileCount} .ics file${res.fileCount === 1 ? '' : 's'}.`,
              });
            })
            .catch((err) => {
              setIcsNotice({
                kind: 'error',
                message:
                  err instanceof Error
                    ? err.message
                    : 'Failed to import calendar file.',
              });
            })
            .finally(() => setImportingIcs(false));
        }}
        onExportIcs={() => {
          const icsText = exportEventsToIcs(visibleEvents);
          triggerIcsDownload(icsText);
          setIcsNotice({
            kind: 'success',
            message: `Exported ${visibleEvents.length} event${visibleEvents.length === 1 ? '' : 's'} as an .ics file ready for Google Calendar import.`,
          });
        }}
        onChangeViewMode={setViewMode}
        onPrev={navigatePrev}
        onNext={navigateNext}
        onToday={goToday}
        onThisWeek={goThisWeek}
        onThisMonth={goThisMonth}
        onNewEvent={() =>
          openCreateModal({
            startDateKey: selectedDate,
            endDateKey: selectedDate,
          })
        }
      />

      {error || googleCalError || icsNotice?.kind === 'error' ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
        >
          <div className="flex items-center gap-2">
            <AlertCircle
              className="h-3.5 w-3.5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <span>
              {icsNotice?.kind === 'error'
                ? icsNotice.message
                : error || googleCalError}
            </span>
          </div>
          {icsNotice?.kind === 'error' ? (
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setIcsNotice(null)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : icsNotice?.kind === 'success' ? (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-xl border border-focus-accent/50 bg-focus-surface/60 px-3 py-2 text-xs text-focus-foreground"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="h-3.5 w-3.5 shrink-0 text-focus-accent"
              aria-hidden="true"
            />
            <span>{icsNotice.message}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setIcsNotice(null)}
            className="rounded p-0.5 text-focus-foreground/75 hover:text-focus-foreground cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : googleCalConn.status === 'connected' && googleCalSummary ? (
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {googleCalSummary}
        </p>
      ) : null}

      <CalendarQuickAdd
        selectedDate={selectedDate}
        onCreateEvent={async (input) => {
          await createEvent(input);
        }}
        onCreateTaskForDate={openCreateTaskForDate}
      />

      <CalendarFiltersBar
        searchQuery={searchQuery}
        categoryFilter={categoryFilter}
        startDateFilter={startDateFilter}
        endDateFilter={endDateFilter}
        linkedNoteIdFilter={linkedNoteIdFilter}
        linkedTaskIdFilter={linkedTaskIdFilter}
        showTasks={showTasks}
        showCompletedTasks={showCompletedTasks}
        notes={notes}
        tasks={tasks}
        onChangeSearchQuery={setSearchQuery}
        onChangeCategoryFilter={setCategoryFilter}
        onChangeStartDateFilter={setStartDateFilter}
        onChangeEndDateFilter={setEndDateFilter}
        onChangeLinkedNoteIdFilter={setLinkedNoteIdFilter}
        onChangeLinkedTaskIdFilter={setLinkedTaskIdFilter}
        onChangeShowTasks={setShowTasks}
        onChangeShowCompletedTasks={setShowCompletedTasks}
        onClearFilters={clearFilters}
      />

      {viewMode === 'month' ? (
        <CalendarMonthView
          selectedDate={selectedDate}
          events={visibleEvents}
          tasks={visibleTasks}
          notesById={notesById}
          tasksById={tasksById}
          showTasks={showTasks}
          showCompletedTasks={showCompletedTasks}
          onSelectDate={setSelectedDate}
          onCreateEventOnDate={(dateKey) => openSlotModal(dateKey)}
          onCreateTaskOnDate={openCreateTaskForDate}
          onEditEvent={openEditModal}
          onChangeEventColor={async (eventId, nextColor) => {
            await updateEvent(eventId, { color: nextColor });
          }}
          onToggleTaskCompleted={async (id) => {
            await toggleTaskCompleted(id);
          }}
        />
      ) : viewMode === 'week' ? (
        <CalendarWeekView
          selectedDate={selectedDate}
          events={visibleEvents}
          tasks={visibleTasks}
          showTasks={showTasks}
          showCompletedTasks={showCompletedTasks}
          onSelectDate={setSelectedDate}
          onCreateEventAtSlot={(dateKey, startTime) =>
            openSlotModal(dateKey, startTime)
          }
          onEditEvent={openEditModal}
          onChangeEventColor={async (eventId, nextColor) => {
            await updateEvent(eventId, { color: nextColor });
          }}
          onToggleTaskCompleted={async (id) => {
            await toggleTaskCompleted(id);
          }}
        />
      ) : viewMode === 'day' ? (
        <CalendarDayView
          selectedDate={selectedDate}
          events={visibleEvents}
          tasks={visibleTasks}
          notesById={notesById}
          showTasks={showTasks}
          showCompletedTasks={showCompletedTasks}
          onCreateEventAtSlot={(dateKey, startTime) =>
            openSlotModal(dateKey, startTime)
          }
          onCreateTaskOnDate={openCreateTaskForDate}
          onEditEvent={openEditModal}
          onChangeEventColor={async (eventId, nextColor) => {
            await updateEvent(eventId, { color: nextColor });
          }}
          onToggleTaskCompleted={async (id) => {
            await toggleTaskCompleted(id);
          }}
        />
      ) : (
        <CalendarAgendaView
          selectedDate={selectedDate}
          startDateFilter={startDateFilter}
          endDateFilter={endDateFilter}
          events={visibleEvents}
          tasks={visibleTasks}
          notesById={notesById}
          tasksById={tasksById}
          showTasks={showTasks}
          showCompletedTasks={showCompletedTasks}
          onEditEvent={openEditModal}
          onCreateEventOnDate={(dateKey) => openSlotModal(dateKey)}
          onToggleTaskCompleted={async (id) => {
            await toggleTaskCompleted(id);
          }}
        />
      )}

      <CalendarEventDialog
        open={editorOpen}
        event={editingEvent}
        draftDefaults={draftDefaults}
        selectedDate={selectedDate}
        notes={notes}
        tasks={tasks}
        onCreateLinkedNote={async (noteTitle, initialBody) => {
          return createNote({ title: noteTitle, content: initialBody });
        }}
        onSave={async (payload) => {
          if (editingEvent) {
            await updateEvent(editingEvent.id, {
              title: payload.title,
              description: payload.description || null,
              location: payload.location || null,
              startAt: payload.startAt,
              endAt: payload.endAt,
              allDay: payload.allDay,
              timezone: payload.timezone,
              category: payload.category,
              color: payload.color || null,
              linkedNoteIds: payload.linkedNoteIds,
              linkedTaskIds: payload.linkedTaskIds,
              rrule: payload.rrule,
            });
          } else {
            await createEvent({
              title: payload.title,
              ...(payload.description
                ? { description: payload.description }
                : {}),
              ...(payload.location ? { location: payload.location } : {}),
              startAt: payload.startAt,
              endAt: payload.endAt,
              allDay: payload.allDay,
              timezone: payload.timezone,
              category: payload.category,
              color: payload.color,
              linkedNoteIds: payload.linkedNoteIds,
              linkedTaskIds: payload.linkedTaskIds,
              ...(payload.rrule ? { rrule: payload.rrule } : {}),
            });
          }
        }}
        onDelete={deleteEvent}
        onClose={closeEditor}
      />

      {/* Lightweight reuse of existing Tasks dialog to create a task due on a calendar date */}
      <TaskEditorDialog
        open={taskModalDate !== null}
        task={null}
        prefillLinkedNoteIds={[]}
        prefillDueDate={taskModalDate ?? selectedDate}
        notes={notes}
        existingCategories={taskCategories}
        onSave={async (payload) => {
          await createTask({
            title: payload.title,
            description: payload.description,
            status: payload.status,
            priority: payload.priority,
            ...(payload.startDate ? { startDate: payload.startDate } : {}),
            ...(payload.dueDate ? { dueDate: payload.dueDate } : {}),
            ...(payload.category ? { category: payload.category } : {}),
            ...(payload.group ? { group: payload.group } : {}),
            isBacklog: payload.isBacklog,
            tags: payload.tags,
            linkedNoteIds: payload.linkedNoteIds,
          });
        }}
        onClose={closeCreateTaskModal}
      />
    </div>
  );
}
