import {
  Calendar,
  CheckSquare,
  FileText,
  Home,
  Settings,
} from 'lucide-react';
import type { NavItemConfig } from '@/types/navigation';

export const PRIMARY_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    id: 'home',
    label: 'Home',
    to: '/',
    icon: Home,
  },
  {
    id: 'notes',
    label: 'Notes',
    to: '/notes',
    icon: FileText,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    to: '/calendar',
    icon: Calendar,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    to: '/tasks',
    icon: CheckSquare,
  },
];

export const SETTINGS_NAV_ITEM: NavItemConfig = {
  id: 'settings',
  label: 'Settings',
  to: '/settings',
  icon: Settings,
};
