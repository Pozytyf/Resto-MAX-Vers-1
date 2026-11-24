import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultWidgetPreferences,
  moveWidgetOrder,
  normalizeWidgetPreferences,
  toggleWidgetVisibility,
} from '../restaurant/dashboard/widgets/widgetRegistry.ts';
import { filterDashboardQuickActions } from '../restaurant/dashboard/widgets/QuickActions.tsx';
import { ROLE_PERMISSION_CEILING } from '../server/rbac.ts';

test('dashboard widget registry includes Quick Actions, Daily Revenue, Active Orders, and Stock Alerts by default', () => {
  const defaults = getDefaultWidgetPreferences();
  const ids = defaults.map((w) => w.id);
  assert.equal(ids[0], 'quick-actions');
  assert.equal(ids.includes('daily-revenue'), true);
  assert.equal(ids.includes('active-orders'), true);
  assert.equal(ids.includes('stock-alerts'), true);
  assert.equal(
    defaults.every((w) => w.visible),
    true,
  );
});

test('toggleWidgetVisibility and moveWidgetOrder update preferences deterministically', () => {
  let prefs = getDefaultWidgetPreferences();
  prefs = toggleWidgetVisibility(prefs, 'quick-actions');
  const quickActionsWidget = prefs.find((w) => w.id === 'quick-actions');
  assert.equal(quickActionsWidget?.visible, false);

  prefs = toggleWidgetVisibility(prefs, 'stock-alerts');
  const stockWidget = prefs.find((w) => w.id === 'stock-alerts');
  assert.equal(stockWidget?.visible, false);

  prefs = moveWidgetOrder(prefs, 'active-orders', 'UP');
  assert.equal(prefs[1].id, 'active-orders');
  assert.equal(prefs[2].id, 'daily-revenue');
});

test('normalizeWidgetPreferences ignores invalid entries and fills missing defaults', () => {
  const normalized = normalizeWidgetPreferences([
    { id: 'stock-alerts', visible: false, order: 0 },
    { id: 'unknown-widget', visible: true, order: 1 },
  ]);
  assert.equal(normalized.length, getDefaultWidgetPreferences().length);
  assert.equal(normalized[0].id, 'stock-alerts');
  assert.equal(normalized[0].visible, false);
  assert.equal(
    normalized.some((w) => w.id === 'quick-actions' && w.visible),
    true,
  );
  assert.equal(
    normalized.some((w) => w.id === 'daily-revenue' && w.visible),
    true,
  );
});

test('QuickActions exposes New Order, Quick Checkout, Table Management, and Stock Alerts filtered by role', () => {
  const ownerPerms = new Set(ROLE_PERMISSION_CEILING.OWNER);
  const ownerActions = filterDashboardQuickActions((p) => ownerPerms.has(p));
  assert.deepEqual(
    ownerActions.map((a) => a.id),
    ['new-order', 'quick-checkout', 'tables-management', 'stock-alerts'],
  );

  const cashierPerms = new Set(ROLE_PERMISSION_CEILING.CASHIER);
  const cashierActions = filterDashboardQuickActions((p) =>
    cashierPerms.has(p),
  );
  assert.deepEqual(
    cashierActions.map((a) => a.id),
    ['new-order', 'quick-checkout', 'tables-management'],
  );
});
