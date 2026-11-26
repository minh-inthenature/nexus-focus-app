import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DashboardSectionId =
  | 'overview'
  | 'schedule'
  | 'upcoming'
  | 'tasks'
  | 'activity';

export const DASHBOARD_SECTION_LABELS: Record<DashboardSectionId, string> = {
  overview: "Today's Overview",
  schedule: "Today's Schedule",
  upcoming: 'Upcoming Events',
  tasks: 'Task Overview',
  activity: 'Recent Activity',
};

export const DEFAULT_DASHBOARD_SECTION_ORDER: readonly DashboardSectionId[] = [
  'overview',
  'schedule',
  'upcoming',
  'tasks',
  'activity',
];

const VALID_SECTION_SET = new Set<string>(DEFAULT_DASHBOARD_SECTION_ORDER);

interface DashboardStoreState {
  sectionOrder: DashboardSectionId[];
  hiddenSections: DashboardSectionId[];
  customizeOpen: boolean;

  setCustomizeOpen: (open: boolean) => void;
  toggleSectionVisibility: (id: DashboardSectionId) => void;
  moveSection: (id: DashboardSectionId, direction: 'up' | 'down') => void;
  resetLayout: () => void;
}

const DASHBOARD_UI_STORAGE_KEY = 'nexus-dashboard-ui-store';

export const useDashboardStore = create<DashboardStoreState>()(
  persist(
    (set, get) => ({
      sectionOrder: [...DEFAULT_DASHBOARD_SECTION_ORDER],
      hiddenSections: [],
      customizeOpen: false,

      setCustomizeOpen: (customizeOpen) => set({ customizeOpen }),

      toggleSectionVisibility: (id) => {
        const current = get().hiddenSections;
        const exists = current.includes(id);
        set({
          hiddenSections: exists
            ? current.filter((item) => item !== id)
            : [...current, id],
        });
      },

      moveSection: (id, direction) => {
        const current = [...get().sectionOrder];
        const idx = current.indexOf(id);
        if (idx === -1) return;

        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= current.length) return;

        const targetItem = current[targetIdx];
        const movingItem = current[idx];
        if (!targetItem || !movingItem) return;

        current[targetIdx] = movingItem;
        current[idx] = targetItem;
        set({ sectionOrder: current });
      },

      resetLayout: () =>
        set({
          sectionOrder: [...DEFAULT_DASHBOARD_SECTION_ORDER],
          hiddenSections: [],
        }),
    }),
    {
      name: DASHBOARD_UI_STORAGE_KEY,
      partialize: (state) => ({
        sectionOrder: state.sectionOrder,
        hiddenSections: state.hiddenSections,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<DashboardStoreState> | undefined;
        const rawOrder = Array.isArray(persisted?.sectionOrder)
          ? persisted.sectionOrder.filter((id): id is DashboardSectionId =>
              VALID_SECTION_SET.has(id),
            )
          : [];
        const normalizedOrder: DashboardSectionId[] = [...rawOrder];
        for (const fallback of DEFAULT_DASHBOARD_SECTION_ORDER) {
          if (!normalizedOrder.includes(fallback)) {
            normalizedOrder.push(fallback);
          }
        }
        const normalizedHidden = Array.isArray(persisted?.hiddenSections)
          ? persisted.hiddenSections.filter((id): id is DashboardSectionId =>
              VALID_SECTION_SET.has(id),
            )
          : [];

        return {
          ...currentState,
          sectionOrder: normalizedOrder,
          hiddenSections: normalizedHidden,
        };
      },
    },
  ),
);
