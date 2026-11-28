import type { LucideIcon } from 'lucide-react';

export type NavRouteId =
  | 'home'
  | 'notes'
  | 'calendar'
  | 'tasks'
  | 'habits'
  | 'settings';

export interface NavItemConfig {
  id: NavRouteId;
  label: string;
  to: string;
  icon: LucideIcon;
  shortcutHint?: string;
}
