import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CalendarPlus,
  CheckSquare,
  FilePlus2,
  FileText,
  Home,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Settings,
  Sun,
  Trees,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useCalendarStore } from '@/features/calendar/stores/useCalendarStore';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import {
  highlightMatchSegments,
  searchWorkspace,
} from '@/features/search/utils/globalSearch';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import { useTheme } from '@/hooks/useTheme';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/utils/cn';

interface PaletteOption {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly group:
    | 'Notes'
    | 'Tasks'
    | 'Calendar'
    | 'Navigation'
    | 'Workspace'
    | 'Appearance';
  readonly keywords?: string;
  readonly icon: LucideIcon;
  readonly run: () => void;
}

function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const segments = highlightMatchSegments(text, query);
  return (
    <>
      {segments.map((seg, i) =>
        seg.matched ? (
          <mark
            key={i}
            className="rounded-xs bg-primary/15 px-0.5 font-semibold text-foreground"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Unified Global Search & Command Palette (`Ctrl+K` / `Cmd+K`) indexing
 * local Notes, Tasks, Calendar Events, and workspace actions completely offline.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const open = useAppStore((state) => state.commandPaletteOpen);
  const setOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const { setPreference } = useTheme();

  const notes = useNotesStore((state) => state.notes);
  const folders = useNotesStore((state) => state.folders);
  const noteTagsMap = useNotesStore((state) => state.noteTagsMap);
  const initializeNotes = useNotesStore((state) => state.initialize);
  const createNote = useNotesStore((state) => state.createNote);
  const openDailyNote = useNotesStore((state) => state.openDailyNote);

  const tasks = useTasksStore((state) => state.tasks);
  const initializeTasks = useTasksStore((state) => state.initialize);

  const events = useCalendarStore((state) => state.events);
  const initializeEvents = useCalendarStore((state) => state.initialize);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(0);
      void initializeNotes();
      void initializeTasks();
      void initializeEvents();
    }
  }, [open, initializeNotes, initializeTasks, initializeEvents]);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setDebouncedQuery('');
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const baseCommands = useMemo<readonly PaletteOption[]>(
    () => [
      {
        id: 'notes-new',
        label: 'New Note',
        group: 'Notes',
        keywords: 'create new markdown note',
        icon: FilePlus2,
        run: () => {
          void createNote().then((note) => navigate(`/notes/${note.id}`));
        },
      },
      {
        id: 'notes-daily',
        label: "Open Today's Daily Note",
        group: 'Notes',
        keywords: 'daily note today journal date',
        icon: CalendarPlus,
        run: () => {
          void openDailyNote().then((note) => navigate(`/notes/${note.id}`));
        },
      },
      {
        id: 'tasks-new',
        label: 'New Task',
        group: 'Tasks',
        keywords: 'create add task todo',
        icon: CheckSquare,
        run: () => {
          navigate('/tasks');
          useTasksStore.getState().openCreateModal();
        },
      },
      {
        id: 'calendar-new',
        label: 'New Event',
        group: 'Calendar',
        keywords: 'create add calendar event schedule meeting',
        icon: CalendarPlus,
        run: () => {
          navigate('/calendar');
          useCalendarStore.getState().openCreateModal();
        },
      },
      {
        id: 'nav-home',
        label: 'Go to Home',
        group: 'Navigation',
        keywords: 'home dashboard overview welcome',
        icon: Home,
        run: () => navigate('/'),
      },
      {
        id: 'nav-notes',
        label: 'Go to Notes',
        group: 'Navigation',
        keywords: 'notes markdown knowledge wiki',
        icon: FileText,
        run: () => navigate('/notes'),
      },
      {
        id: 'nav-calendar',
        label: 'Go to Calendar',
        group: 'Navigation',
        keywords: 'calendar schedule events time',
        icon: Calendar,
        run: () => navigate('/calendar'),
      },
      {
        id: 'nav-tasks',
        label: 'Go to Tasks',
        group: 'Navigation',
        keywords: 'tasks todo checklist',
        icon: CheckSquare,
        run: () => navigate('/tasks'),
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        group: 'Navigation',
        keywords: 'settings preferences appearance integrations',
        icon: Settings,
        run: () => navigate('/settings'),
      },
      {
        id: 'workspace-toggle-sidebar',
        label: 'Toggle Sidebar',
        group: 'Workspace',
        keywords: 'sidebar collapse expand panel',
        icon: PanelLeft,
        run: () => toggleSidebar(),
      },
      {
        id: 'theme-dark',
        label: 'Switch to Warm Charcoal Theme',
        group: 'Appearance',
        keywords: 'theme dark warm charcoal night',
        icon: Moon,
        run: () => setPreference('dark'),
      },
      {
        id: 'theme-forest',
        label: 'Switch to Forest Focus Theme',
        group: 'Appearance',
        keywords: 'theme forest green freedom focus calm',
        icon: Trees,
        run: () => setPreference('forest'),
      },
      {
        id: 'theme-light',
        label: 'Switch to Light Theme',
        group: 'Appearance',
        keywords: 'theme light paper day',
        icon: Sun,
        run: () => setPreference('light'),
      },
      {
        id: 'theme-system',
        label: 'Use System Theme',
        group: 'Appearance',
        keywords: 'theme system os auto',
        icon: Monitor,
        run: () => setPreference('system'),
      },
    ],
    [navigate, toggleSidebar, setPreference, createNote, openDailyNote],
  );

  const groupedSections = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase();

    if (!normalized) {
      return [
        {
          heading: 'Quick Actions & Navigation',
          items: baseCommands,
        },
      ];
    }

    const searchRes = searchWorkspace({
      query: debouncedQuery,
      notes,
      folders,
      noteTagsMap,
      tasks,
      events,
      maxPerGroup: 6,
    });

    const noteOptions: PaletteOption[] = searchRes.notes.map((hit) => ({
      id: hit.id,
      label: hit.title,
      subtitle: hit.context,
      group: 'Notes',
      icon: FileText,
      run: () => navigate(hit.to),
    }));

    const taskOptions: PaletteOption[] = searchRes.tasks.map((hit) => ({
      id: hit.id,
      label: hit.title,
      subtitle: hit.context,
      group: 'Tasks',
      icon: CheckSquare,
      run: () => navigate(hit.to),
    }));

    const eventOptions: PaletteOption[] = searchRes.events.map((hit) => ({
      id: hit.id,
      label: hit.title,
      subtitle: hit.context,
      group: 'Calendar',
      icon: Calendar,
      run: () => navigate(hit.to),
    }));

    const matchedCommands = baseCommands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(normalized) ||
        cmd.group.toLowerCase().includes(normalized) ||
        (cmd.keywords?.toLowerCase().includes(normalized) ?? false),
    );

    const sections: { heading: string; items: readonly PaletteOption[] }[] =
      [];
    if (noteOptions.length > 0) {
      sections.push({ heading: `Notes (${noteOptions.length})`, items: noteOptions });
    }
    if (taskOptions.length > 0) {
      sections.push({ heading: `Tasks (${taskOptions.length})`, items: taskOptions });
    }
    if (eventOptions.length > 0) {
      sections.push({
        heading: `Calendar Events (${eventOptions.length})`,
        items: eventOptions,
      });
    }
    if (matchedCommands.length > 0) {
      sections.push({
        heading: `Commands (${matchedCommands.length})`,
        items: matchedCommands,
      });
    }
    return sections;
  }, [
    debouncedQuery,
    baseCommands,
    notes,
    folders,
    noteTagsMap,
    tasks,
    events,
    navigate,
  ]);

  const flatItems = useMemo(
    () => groupedSections.flatMap((section) => section.items),
    [groupedSections],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [flatItems.length]);

  const executeOption = (option: PaletteOption) => {
    option.run();
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (flatItems.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatItems.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(
        (prev) => (prev - 1 + flatItems.length) % flatItems.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = flatItems[activeIndex];
      if (selected) {
        executeOption(selected);
      }
    }
  };

  let runningIndex = 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[12%] overflow-hidden p-0">
        <DialogTitle className="sr-only">Global Search &amp; Commands</DialogTitle>
        <DialogDescription className="sr-only">
          Search offline across Notes, Tasks, Calendar events, and workspace commands.
        </DialogDescription>

        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes, tasks, events, or type a command…"
            aria-label="Search workspace"
            autoFocus
            className="h-7 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div
          role="listbox"
          aria-label="Global search results"
          className="max-h-96 overflow-y-auto p-1.5"
        >
          {flatItems.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-xs font-medium text-foreground">
                No matching notes, tasks, events, or commands found.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Try another keyword, #tag, event location, or clear the search.
              </p>
            </div>
          ) : (
            groupedSections.map((section) => (
              <div key={section.heading} className="mb-1.5 last:mb-0">
                <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {section.heading}
                </div>
                {section.items.map((option) => {
                  const Icon = option.icon;
                  const itemIndex = runningIndex;
                  runningIndex += 1;
                  const isSelected = itemIndex === activeIndex;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(itemIndex)}
                      onClick={() => executeOption(option)}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors duration-100 cursor-pointer',
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground/85 hover:bg-accent/60',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-start gap-2.5">
                        <Icon
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            <HighlightedText
                              text={option.label}
                              query={debouncedQuery}
                            />
                          </span>
                          {option.subtitle ? (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              <HighlightedText
                                text={option.subtitle}
                                query={debouncedQuery}
                              />
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-[10px] text-muted-foreground">
                        {option.group}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
