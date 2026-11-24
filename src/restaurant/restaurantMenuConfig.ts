import type { Permission } from '../types/index.ts';

export type RestaurantNavIconKey =
  | 'dashboard'
  | 'pos'
  | 'orders'
  | 'floor'
  | 'kitchen'
  | 'menu'
  | 'stocks'
  | 'reservations'
  | 'customers'
  | 'reviews'
  | 'finance'
  | 'staff'
  | 'subscription'
  | 'settings'
  | 'qr'
  | 'plus';

export interface RestaurantNavItemDef {
  to: string;
  labelKey: string;
  icon: RestaurantNavIconKey;
  end?: boolean;
  permission: Permission;
}

export interface RestaurantNavSectionDef {
  id: 'service' | 'catalogAndGuests' | 'management';
  titleKey: string;
  items: RestaurantNavItemDef[];
}

export interface RestaurantQuickActionDef {
  id: string;
  to: string;
  labelKey: string;
  icon: RestaurantNavIconKey;
  permission: Permission;
  primary?: boolean;
}

export const RESTAURANT_NAV_SECTIONS: RestaurantNavSectionDef[] = [
  {
    id: 'service',
    titleKey: 'navGroups.service',
    items: [
      {
        to: '/app',
        labelKey: 'nav.dashboard',
        icon: 'dashboard',
        end: true,
        permission: 'dashboard:read',
      },
      {
        to: '/app/pos',
        labelKey: 'nav.pos',
        icon: 'pos',
        permission: 'pos:use',
      },
      {
        to: '/app/orders',
        labelKey: 'nav.orders',
        icon: 'orders',
        permission: 'orders:read',
      },
      {
        to: '/app/floor',
        labelKey: 'nav.floor',
        icon: 'floor',
        permission: 'floor:read',
      },
      {
        to: '/app/kitchen',
        labelKey: 'nav.kitchen',
        icon: 'kitchen',
        permission: 'kitchen:read',
      },
    ],
  },
  {
    id: 'catalogAndGuests',
    titleKey: 'navGroups.catalogAndGuests',
    items: [
      {
        to: '/app/menu',
        labelKey: 'nav.menu',
        icon: 'menu',
        permission: 'menu:read',
      },
      {
        to: '/app/stocks',
        labelKey: 'nav.stocks',
        icon: 'stocks',
        permission: 'stocks:read',
      },
      {
        to: '/app/reservations',
        labelKey: 'nav.reservations',
        icon: 'reservations',
        permission: 'reservations:read',
      },
      {
        to: '/app/customers',
        labelKey: 'nav.customers',
        icon: 'customers',
        permission: 'customers:read',
      },
      {
        to: '/app/reviews',
        labelKey: 'nav.reviews',
        icon: 'reviews',
        permission: 'customers:read',
      },
    ],
  },
  {
    id: 'management',
    titleKey: 'navGroups.management',
    items: [
      {
        to: '/app/finance',
        labelKey: 'nav.finance',
        icon: 'finance',
        permission: 'finance:read',
      },
      {
        to: '/app/staff',
        labelKey: 'nav.staff',
        icon: 'staff',
        permission: 'staff:read',
      },
      {
        to: '/app/subscription',
        labelKey: 'nav.subscription',
        icon: 'subscription',
        permission: 'settings:read',
      },
      {
        to: '/app/settings',
        labelKey: 'nav.settings',
        icon: 'settings',
        permission: 'settings:read',
      },
    ],
  },
];

export const RESTAURANT_QUICK_ACTIONS: RestaurantQuickActionDef[] = [
  {
    id: 'new-order',
    to: '/app/pos',
    labelKey: 'quickActions.newOrder',
    icon: 'plus',
    permission: 'pos:use',
    primary: true,
  },
  {
    id: 'kds',
    to: '/app/kitchen',
    labelKey: 'quickActions.kds',
    icon: 'kitchen',
    permission: 'kitchen:read',
  },
  {
    id: 'qr-tables',
    to: '/app/floor?tab=qr',
    labelKey: 'quickActions.qrTables',
    icon: 'qr',
    permission: 'qr:read',
  },
  {
    id: 'reservations',
    to: '/app/reservations',
    labelKey: 'quickActions.reservations',
    icon: 'reservations',
    permission: 'reservations:read',
  },
  {
    id: 'orders',
    to: '/app/orders',
    labelKey: 'quickActions.orders',
    icon: 'orders',
    permission: 'orders:read',
  },
];

export function filterNavSectionsByPermission(
  can: (permission: Permission) => boolean,
): RestaurantNavSectionDef[] {
  return RESTAURANT_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(item.permission)),
  })).filter((section) => section.items.length > 0);
}

export function filterQuickActionsByPermission(
  can: (permission: Permission) => boolean,
  maxItems = 4,
): RestaurantQuickActionDef[] {
  return RESTAURANT_QUICK_ACTIONS.filter((act) => can(act.permission)).slice(
    0,
    maxItems,
  );
}
