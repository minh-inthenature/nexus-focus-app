import { NavLink } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { NavItemConfig } from '@/types/navigation';
import { cn } from '@/utils/cn';

export interface SidebarNavItemProps {
  item: NavItemConfig;
  collapsed: boolean;
  onNavigate?: () => void;
}

/**
 * Navigation row used inside the persistent sidebar with active indicator,
 * subtle hover highlight, and collapsed tooltip support.
 */
export function SidebarNavItem({
  item,
  collapsed,
  onNavigate,
}: SidebarNavItemProps) {
  const Icon = item.icon;

  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          collapsed && 'h-8 justify-center px-0',
          isActive
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-colors duration-150',
              isActive
                ? 'text-primary'
                : 'text-sidebar-foreground/70 group-hover:text-sidebar-foreground',
            )}
            aria-hidden="true"
          />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
