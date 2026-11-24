import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterNavSectionsByPermission,
  filterQuickActionsByPermission,
} from '../restaurant/restaurantMenuConfig.ts';
import { ROLE_PERMISSION_CEILING } from '../server/rbac.ts';

test('1. Owner sees all 3 intuitive restaurant navigation groups without standalone /app/qr', () => {
  const ownerPerms = new Set(ROLE_PERMISSION_CEILING.OWNER);
  const sections = filterNavSectionsByPermission((p) => ownerPerms.has(p));

  assert.deepEqual(
    sections.map((s) => s.id),
    ['service', 'catalogAndGuests', 'management'],
  );

  const allRoutes = sections.flatMap((s) => s.items.map((i) => i.to));
  assert.equal(allRoutes.includes('/app/qr'), false);
  assert.equal(allRoutes.includes('/app/floor'), true);
  assert.equal(allRoutes.includes('/app/pos'), true);
  assert.equal(allRoutes.includes('/app/kitchen'), true);
  assert.equal(allRoutes.includes('/app/subscription'), true);
});

test('2. Kitchen role sees only permitted operational groups and permitted quick actions', () => {
  const kitchenPerms = new Set(ROLE_PERMISSION_CEILING.KITCHEN_BAR);
  const sections = filterNavSectionsByPermission((p) => kitchenPerms.has(p));

  assert.deepEqual(
    sections.map((s) => s.id),
    ['service', 'catalogAndGuests'],
  );
  const kitchenRoutes = sections.flatMap((s) => s.items.map((i) => i.to));
  assert.equal(kitchenRoutes.includes('/app/subscription'), false);

  const actions = filterQuickActionsByPermission((p) => kitchenPerms.has(p));
  assert.deepEqual(
    actions.map((a) => a.id),
    ['kds', 'orders'],
  );
});

test('3. Owner quick actions prioritize New Order (POS), KDS, Table QR, and Reservations', () => {
  const ownerPerms = new Set(ROLE_PERMISSION_CEILING.OWNER);
  const actions = filterQuickActionsByPermission((p) => ownerPerms.has(p), 4);
  assert.deepEqual(
    actions.map((a) => a.id),
    ['new-order', 'kds', 'qr-tables', 'reservations'],
  );
  assert.equal(actions[0].primary, true);
  assert.equal(actions[2].to, '/app/floor?tab=qr');
});
