import { useEffect, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LoadingState } from '@/components/common/LoadingState';
import { useCalendarStore } from '@/features/calendar/stores/useCalendarStore';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import { getTodayDateString } from '@/features/tasks/utils/taskFilters';
import { formatFullDate, getTimeOfDayGreeting } from '@/utils/date';
import { DashboardCustomizePanel } from './components/DashboardCustomizePanel';
import { DashboardHeader } from './components/DashboardHeader';
import { RecentActivityWidget } from './components/RecentActivityWidget';
import { TaskOverviewWidget } from './components/TaskOverviewWidget';
import { TodayOverviewStrip } from './components/TodayOverviewStrip';
import { TodayScheduleWidget } from './components/TodayScheduleWidget';
import { UpcomingEventsWidget } from './components/UpcomingEventsWidget';
import { useDashboardStore } from './stores/useDashboardStore';
import {
  computeDashboardMetrics,
  selectDashboardTaskBuckets,
  selectRecentActivity,
  selectTodaysEvents,
  selectUpcomingEvents,
} from './utils/dashboardSelectors';

/**
 * Minimalist, Linear/Notion-inspired unified Home dashboard deriving live metrics,
 * schedule, tasks, and activity directly from existing IndexedDB stores.
 */
export function HomePage() {
  const navigate = useNavigate();

  const notes = useNotesStore((state) => state.notes);
  const notesInitialized = useNotesStore((state) => state.initialized);
  const notesLoading = useNotesStore((state) => state.loading);
  const notesError = useNotesStore((state) => state.saveError);
  const initializeNotes = useNotesStore((state) => state.initialize);
  const createNote = useNotesStore((state) => state.createNote);
  const openDailyNote = useNotesStore((state) => state.openDailyNote);

  const tasks = useTasksStore((state) => state.tasks);
  const tasksInitialized = useTasksStore((state) => state.initialized);
  const tasksLoading = useTasksStore((state) => state.loading);
  const tasksError = useTasksStore((state) => state.error);
  const initializeTasks = useTasksStore((state) => state.initialize);
  const toggleTaskCompleted = useTasksStore((state) => state.toggleCompleted);
  const openCreateTaskModal = useTasksStore((state) => state.openCreateModal);

  const events = useCalendarStore((state) => state.events);
  const eventsInitialized = useCalendarStore((state) => state.initialized);
  const eventsLoading = useCalendarStore((state) => state.loading);
  const eventsError = useCalendarStore((state) => state.error);
  const initializeEvents = useCalendarStore((state) => state.initialize);
  const openCreateEventModal = useCalendarStore(
    (state) => state.openCreateModal,
  );

  const {
    sectionOrder,
    hiddenSections,
    customizeOpen,
    setCustomizeOpen,
    toggleSectionVisibility,
    moveSection,
    resetLayout,
  } = useDashboardStore();

  useEffect(() => {
    void initializeNotes();
    void initializeTasks();
    void initializeEvents();
  }, [initializeNotes, initializeTasks, initializeEvents]);

  const now = new Date();
  const todayKey = getTodayDateString(now);
  const greeting = getTimeOfDayGreeting(now);
  const formattedDate = formatFullDate(now);

  const notesById = useMemo(
    () => new Map(notes.map((n) => [n.id, n])),
    [notes],
  );
  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  );

  const metrics = useMemo(
    () => computeDashboardMetrics(tasks, events, todayKey),
    [tasks, events, todayKey],
  );
  const todaysEvents = useMemo(
    () => selectTodaysEvents(events, todayKey),
    [events, todayKey],
  );
  const upcomingEvents = useMemo(
    () => selectUpcomingEvents(events, todayKey, 7, 5),
    [events, todayKey],
  );
  const taskBuckets = useMemo(
    () => selectDashboardTaskBuckets(tasks, todayKey),
    [tasks, todayKey],
  );
  const recentActivity = useMemo(
    () => selectRecentActivity(notes, tasks, events, 8),
    [notes, tasks, events],
  );

  const combinedError = notesError || tasksError || eventsError;
  const coldLoading =
    (!notesInitialized && notesLoading) ||
    (!tasksInitialized && tasksLoading) ||
    (!eventsInitialized && eventsLoading);

  if (
    coldLoading &&
    !notesInitialized &&
    !tasksInitialized &&
    !eventsInitialized
  ) {
    return <LoadingState label="Loading workspace…" />;
  }

  const handleNewNote = () => {
    void createNote().then((created) => navigate(`/notes/${created.id}`));
  };

  const handleNewTask = () => {
    openCreateTaskModal();
    navigate('/tasks');
  };

  const handleNewEvent = () => {
    openCreateEventModal({ startDateKey: todayKey, endDateKey: todayKey });
    navigate('/calendar');
  };

  const handleDailyNote = () => {
    void openDailyNote().then((daily) => navigate(`/notes/${daily.id}`));
  };

  const visibleOrder = sectionOrder.filter(
    (id) => !hiddenSections.includes(id),
  );
  const showOverview = visibleOrder.includes('overview');
  const showSchedule = visibleOrder.includes('schedule');
  const showUpcoming = visibleOrder.includes('upcoming');
  const showTasks = visibleOrder.includes('tasks');
  const showActivity = visibleOrder.includes('activity');

  // Preserve custom vertical ordering between Today's Schedule & Upcoming Events in left column
  const leftColumnOrder = visibleOrder.filter(
    (id) => id === 'schedule' || id === 'upcoming',
  );
  const hasTwoColContent = leftColumnOrder.length > 0 || showTasks;

  // Determine high-level ordering of overview vs 2-col main area vs activity
  const showOverviewAfterMain =
    showOverview &&
    visibleOrder.indexOf('overview') >
      Math.max(
        visibleOrder.indexOf('schedule'),
        visibleOrder.indexOf('upcoming'),
        visibleOrder.indexOf('tasks'),
      );
  const showActivityBeforeMain =
    showActivity &&
    visibleOrder.indexOf('activity') <
      Math.min(
        ...[
          visibleOrder.indexOf('schedule'),
          visibleOrder.indexOf('upcoming'),
          visibleOrder.indexOf('tasks'),
        ].filter((i) => i !== -1),
      );

  const overviewBlock = showOverview ? (
    <TodayOverviewStrip metrics={metrics} todayKey={todayKey} />
  ) : null;

  const activityBlock = showActivity ? (
    <RecentActivityWidget items={recentActivity} />
  ) : null;

  return (
    <div className="space-y-8">
      <DashboardHeader
        greeting={greeting}
        formattedDate={formattedDate}
        metrics={metrics}
        customizeOpen={customizeOpen}
        onToggleCustomize={() => setCustomizeOpen(!customizeOpen)}
        onNewNote={handleNewNote}
        onNewTask={handleNewTask}
        onNewEvent={handleNewEvent}
        onOpenDailyNote={handleDailyNote}
      />

      {combinedError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
        >
          <AlertCircle
            className="h-3.5 w-3.5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <span>{combinedError}</span>
        </div>
      ) : null}

      {customizeOpen ? (
        <DashboardCustomizePanel
          sectionOrder={sectionOrder}
          hiddenSections={hiddenSections}
          onToggleVisibility={toggleSectionVisibility}
          onMoveSection={moveSection}
          onReset={resetLayout}
        />
      ) : null}

      {visibleOrder.length === 0 ? (
        <div className="rounded-lg border border-border/70 px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            All dashboard sections are currently hidden
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Open Customize above to show panels or restore the default layout.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {!showOverviewAfterMain ? overviewBlock : null}
          {showActivityBeforeMain ? activityBlock : null}

          {hasTwoColContent ? (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
              {leftColumnOrder.length > 0 ? (
                <div className="space-y-8">
                  {leftColumnOrder.map((id) =>
                    id === 'schedule' && showSchedule ? (
                      <TodayScheduleWidget
                        key="schedule"
                        todayKey={todayKey}
                        events={todaysEvents}
                        notesById={notesById}
                        tasksById={tasksById}
                        onCreateEvent={handleNewEvent}
                      />
                    ) : id === 'upcoming' && showUpcoming ? (
                      <UpcomingEventsWidget
                        key="upcoming"
                        events={upcomingEvents}
                        onCreateEvent={handleNewEvent}
                      />
                    ) : null,
                  )}
                </div>
              ) : null}

              {showTasks ? (
                <div className={leftColumnOrder.length === 0 ? 'lg:col-span-2' : ''}>
                  <TaskOverviewWidget
                    buckets={taskBuckets}
                    hasAnyTasks={tasks.length > 0}
                    onToggleComplete={async (taskId) => {
                      await toggleTaskCompleted(taskId);
                    }}
                    onCreateTask={handleNewTask}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {showOverviewAfterMain ? overviewBlock : null}
          {!showActivityBeforeMain ? activityBlock : null}
        </div>
      )}
    </div>
  );
}
