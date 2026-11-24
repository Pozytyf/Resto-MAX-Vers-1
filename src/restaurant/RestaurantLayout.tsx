import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  BellRing,
  CalendarClock,
  Check,
  ChefHat,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Plus,
  QrCode,
  Receipt,
  Settings,
  Sparkles,
  Star,
  UserCheck,
  Users,
  Utensils,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AppShell,
  type NavItem,
  type NavSection,
  type ShellAlert,
} from '../components/AppShell';
import { useAuth } from '../app/providers/AuthProvider';
import { useRestaurantTheme } from '../app/hooks/useRestaurantTheme';
import { useWebSocketRoom } from '../hooks/useWebSocket';
import { apiFetch } from '../services/api';
import { formatTimeFr, getOrderStatusLabel } from '../utils/format';
import {
  filterNavSectionsByPermission,
  type RestaurantNavIconKey,
} from './restaurantMenuConfig';
import type { RestaurantNotification, TableCall } from '../types';

const ICON_MAP: Record<RestaurantNavIconKey, NavItem['icon']> = {
  dashboard: LayoutDashboard,
  pos: CreditCard,
  orders: ClipboardList,
  floor: LayoutGrid,
  kitchen: ChefHat,
  menu: Utensils,
  stocks: Package,
  reservations: CalendarClock,
  customers: UserCheck,
  reviews: Star,
  finance: BarChart3,
  staff: Users,
  subscription: Sparkles,
  settings: Settings,
  qr: QrCode,
  plus: Plus,
};

function playTableCallChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, ctx.currentTime);
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // Ignore autoplay restriction
  }
}

export function RestaurantLayout({
  title,
  actions,
  onRealtimeEvent,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  onRealtimeEvent?: (eventType: string) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const { theme, toggleTheme } = useRestaurantTheme();
  const [liveAlerts, setLiveAlerts] = useState<ShellAlert[]>([]);
  const [dbNotifications, setDbNotifications] = useState<
    RestaurantNotification[]
  >([]);
  const [pendingCalls, setPendingCalls] = useState<TableCall[]>([]);

  const loadNotifications = useCallback(() => {
    if (!user?.restaurantId) return;
    apiFetch<{ notifications: RestaurantNotification[] }>(
      '/api/restaurant/notifications',
    )
      .then((res) => setDbNotifications(res.notifications))
      .catch(() => {});
  }, [user?.restaurantId]);

  const loadTableCalls = useCallback(() => {
    if (!user?.restaurantId || !can('orders:read')) return;
    apiFetch<{ calls: TableCall[] }>('/api/restaurant/table-calls')
      .then((res) =>
        setPendingCalls(res.calls.filter((c) => c.status === 'PENDING')),
      )
      .catch(() => {});
  }, [user?.restaurantId, can]);

  useEffect(() => {
    loadNotifications();
    loadTableCalls();
  }, [loadNotifications, loadTableCalls]);

  const handleWs = useCallback(
    (msg: { type: string; payload?: unknown; timestamp?: string }) => {
      if (msg.type === 'connection:ready') return;
      const time = msg.timestamp
        ? formatTimeFr(msg.timestamp)
        : t('alerts.justNow');
      let text = '';
      if (msg.type === 'order:created') {
        const p = msg.payload as
          | { orderNumber?: string; orderType?: string }
          | undefined;
        text = t('alerts.newOrder', {
          orderNumber: p?.orderNumber || '',
          channel:
            p?.orderType === 'QR_TABLE'
              ? t('common.qrTable')
              : p?.orderType === 'DELIVERY'
                ? 'Livraison'
                : p?.orderType === 'CLICK_COLLECT'
                  ? 'Click & Collect'
                  : t('common.dineIn'),
        });
      } else if (msg.type === 'order:updated') {
        const p = msg.payload as { status?: string } | undefined;
        text = t('alerts.orderUpdated', {
          status: p?.status ? getOrderStatusLabel(p.status) : '',
        });
      } else if (msg.type === 'payment:created') {
        text = t('alerts.paymentCreated');
      } else if (msg.type === 'table:call') {
        const p = msg.payload as { call?: TableCall } | undefined;
        if (p?.call) {
          playTableCallChime();
          text =
            p.call.callType === 'BILL'
              ? `Addition demandée · ${p.call.tableLabel}`
              : `Appel serveur · ${p.call.tableLabel}`;
          loadTableCalls();
        }
      } else if (msg.type === 'table:call_ack') {
        loadTableCalls();
      } else if (msg.type === 'review:created') {
        const p = msg.payload as
          | { review?: { rating?: number; serviceRating?: number; customerName?: string } }
          | undefined;
        if (p?.review) {
          text = `Nouvel avis client · ${p.review.rating ?? p.review.serviceRating ?? 5}/5 (${p.review.customerName || 'Client'})`;
        }
      } else if (
        msg.type === 'stock:alert' ||
        msg.type === 'notifications:updated'
      ) {
        loadNotifications();
      }
      if (text) {
        setLiveAlerts((prev) => [
          { id: `${Date.now()}-${Math.random()}`, text, time, read: false },
          ...prev.slice(0, 10),
        ]);
      }
      if (onRealtimeEvent) {
        onRealtimeEvent(msg.type);
      }
    },
    [loadNotifications, loadTableCalls, onRealtimeEvent, t],
  );

  useWebSocketRoom(
    user?.restaurantId ? `restaurant:${user.restaurantId}` : null,
    handleWs,
  );

  const handleAckTableCall = async (callId: string) => {
    try {
      await apiFetch(`/api/restaurant/table-calls/${callId}/ack`, {
        method: 'POST',
      });
      setPendingCalls((prev) => prev.filter((c) => c.id !== callId));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    setLiveAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    try {
      await apiFetch('/api/restaurant/notifications/read', {
        method: 'PATCH',
        body: JSON.stringify({ all: true }),
      });
      loadNotifications();
    } catch {
      // ignore
    }
  };

  const handleMarkOneRead = async (id: string) => {
    try {
      await apiFetch('/api/restaurant/notifications/read', {
        method: 'PATCH',
        body: JSON.stringify({ id }),
      });
      loadNotifications();
    } catch {
      // ignore
    }
  };

  const persistentAlerts: ShellAlert[] = dbNotifications.map((n) => ({
    id: n.id,
    text: n.title,
    subtitle: n.message,
    time: formatTimeFr(n.createdAt),
    read: n.isRead,
    persistent: true,
  }));

  const mergedAlerts = [...persistentAlerts, ...liveAlerts].slice(0, 20);
  const unreadCount = mergedAlerts.filter((a) => !a.read).length;

  const navSections: NavSection[] = filterNavSectionsByPermission(can).map(
    (section) => ({
      id: section.id,
      title: t(section.titleKey),
      items: section.items.map((item) => ({
        to: item.to,
        label: t(item.labelKey),
        icon: ICON_MAP[item.icon],
        end: item.end,
      })),
    }),
  );

  const tableCallsBanner =
    pendingCalls.length > 0 ? (
      <div
        data-testid="live-table-calls-banner"
        className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 flex flex-col gap-2"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
          <BellRing className="w-4 h-4 text-[#FF8738] animate-pulse shrink-0" />
          <span>
            {pendingCalls.length} appel{pendingCalls.length > 1 ? 's' : ''} table en attente
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {pendingCalls.map((call) => (
            <div
              key={call.id}
              data-testid={`pending-table-call-${call.id}`}
              className="flex items-center gap-2.5 rounded-lg bg-[var(--rm-surface)] border border-amber-200 dark:border-amber-500/30 px-3 py-1.5 text-xs"
            >
              {call.callType === 'BILL' ? (
                <Receipt className="w-3.5 h-3.5 text-[#14B8A6] shrink-0" />
              ) : (
                <BellRing className="w-3.5 h-3.5 text-[#FF8738] shrink-0" />
              )}
              <span className="font-bold text-[var(--rm-ink)]">
                {call.tableLabel}
              </span>
              <span className="text-[var(--rm-ink-muted)]">
                {call.callType === 'BILL' ? 'Demande addition' : 'Appel serveur'}
                {call.note ? ` · ${call.note}` : ''}
              </span>
              <button
                type="button"
                onClick={() => handleAckTableCall(call.id)}
                data-testid={`ack-table-call-${call.id}`}
                className="inline-flex items-center gap-1 rounded-md bg-[#14B8A6] text-white px-2 py-1 text-[11px] font-semibold hover:bg-[#0D9488] cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Acquitter</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    ) : undefined;

  return (
    <AppShell
      title={title}
      breadcrumb={`${t('common.brand')} / ${user?.restaurantName || t('header.venueFallback')}`}
      navSections={navSections}
      topBanner={tableCallsBanner}
      alerts={mergedAlerts}
      unreadCount={unreadCount}
      onMarkAllRead={handleMarkAllRead}
      onMarkRead={handleMarkOneRead}
      actions={actions}
      themeToggle={{ theme, onToggle: toggleTheme }}
    >
      {children}
    </AppShell>
  );
}
