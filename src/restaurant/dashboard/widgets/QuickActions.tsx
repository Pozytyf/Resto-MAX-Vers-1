import type React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CreditCard,
  LayoutGrid,
  PlusCircle,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../app/providers/AuthProvider';
import type { Permission } from '../../../types';

export interface DashboardQuickActionItem {
  id:
    | 'new-order'
    | 'quick-checkout'
    | 'tables-management'
    | 'stock-alerts';
  to: string;
  labelKey: string;
  permission: Permission;
  tone: 'primary' | 'teal' | 'neutral' | 'alert';
  icon: React.ComponentType<{ className?: string }>;
}

export const OWNER_DASHBOARD_QUICK_ACTIONS: DashboardQuickActionItem[] = [
  {
    id: 'new-order',
    to: '/app/pos',
    labelKey: 'quickActions.newOrder',
    permission: 'pos:use',
    tone: 'primary',
    icon: PlusCircle,
  },
  {
    id: 'quick-checkout',
    to: '/app/pos?focus=checkout',
    labelKey: 'quickActions.quickCheckout',
    permission: 'pos:pay',
    tone: 'teal',
    icon: CreditCard,
  },
  {
    id: 'tables-management',
    to: '/app/floor',
    labelKey: 'quickActions.tablesManagement',
    permission: 'floor:read',
    tone: 'neutral',
    icon: LayoutGrid,
  },
  {
    id: 'stock-alerts',
    to: '/app/stocks?alerts=1',
    labelKey: 'quickActions.stockAlerts',
    permission: 'stocks:read',
    tone: 'alert',
    icon: AlertTriangle,
  },
];

export function filterDashboardQuickActions(
  can: (permission: Permission) => boolean,
): DashboardQuickActionItem[] {
  return OWNER_DASHBOARD_QUICK_ACTIONS.filter((item) => can(item.permission));
}

export function QuickActions({
  lowStockCount = 0,
}: {
  lowStockCount?: number;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const actions = filterDashboardQuickActions(can);

  if (actions.length === 0) return null;

  return (
    <section
      aria-label={t('quickActions.title')}
      data-testid="quick-actions-banner"
      className="bg-[var(--rm-surface)] border border-[var(--rm-border)] rounded-xl p-4 sm:px-5 sm:py-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 shadow-2xs no-print"
    >
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="w-7 h-7 rounded-lg bg-[#FF8738]/12 text-[#FF8738] flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4" />
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--rm-ink-muted)]">
          {t('quickActions.title')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2.5">
        {actions.map((action) => {
          const Icon = action.icon;
          const isAlertActive =
            action.id === 'stock-alerts' && lowStockCount > 0;

          const toneClass =
            action.tone === 'primary'
              ? 'bg-[#FF8738] hover:bg-[#F07322] text-white border border-transparent'
              : action.tone === 'teal'
                ? 'bg-[#14B8A6]/12 hover:bg-[#14B8A6]/20 text-[#0F766E] dark:text-[#2DD4BF] border border-[#14B8A6]/35'
                : isAlertActive
                  ? 'bg-red-50 dark:bg-red-950/35 hover:bg-red-100/80 dark:hover:bg-red-950/50 text-[#C83737] dark:text-[#FCA5A5] border border-[#E05252]/45'
                  : 'bg-[var(--rm-surface-muted)] hover:bg-[var(--rm-surface-hover)] text-[var(--rm-ink)] border border-[var(--rm-border)]';

          const iconClass =
            action.tone === 'primary'
              ? 'text-white'
              : action.tone === 'teal'
                ? 'text-[#14B8A6]'
                : isAlertActive
                  ? 'text-[#E05252]'
                  : 'text-[#FF8738]';

          return (
            <Link
              key={action.id}
              to={action.to}
              data-testid={`quick-action-${action.id}`}
              className={`inline-flex items-center justify-center sm:justify-start gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${toneClass}`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
              <span>{t(action.labelKey)}</span>
              {isAlertActive && (
                <span
                  data-testid="quick-action-stock-alerts-count"
                  className="ml-0.5 px-1.5 py-0.5 rounded-md bg-[#E05252] text-white text-[11px] font-bold leading-none tabular-nums"
                >
                  {lowStockCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
