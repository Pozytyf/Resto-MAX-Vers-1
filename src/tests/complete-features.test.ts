import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { getDb, setTestDb } from '../server/db.ts';
import { createExpressApp } from '../server/app.ts';

let server: http.Server;
let baseUrl: string;

async function req(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}

test.before(async () => {
  const db = getDb(':memory:');
  setTestDb(db);
  const app = createExpressApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('1. Public QR online checkout & double-payment protection', async () => {
  const ownerLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  assert.equal(ownerLogin.status, 200);
  const ownerToken = ownerLogin.data.token as string;

  const tablesRes = await req('/api/restaurant/tables', { token: ownerToken });
  assert.equal(tablesRes.status, 200);
  const firstTable = tablesRes.data.tables[0] as { qrToken: string };
  assert.ok(firstTable.qrToken);

  const ctx = await req(`/api/public/qr/${firstTable.qrToken}`);
  assert.equal(ctx.status, 200);
  const item = ctx.data.items[0] as { id: string; priceXof: number };

  const orderRes = await req(`/api/public/qr/${firstTable.qrToken}/orders`, {
    method: 'POST',
    body: {
      sessionId: ctx.data.sessionId,
      customerName: 'Awa Koné',
      items: [{ menuItemId: item.id, quantity: 2 }],
    },
  });
  assert.equal(orderRes.status, 201);
  const orderId = orderRes.data.order.id as string;
  const totalXof = Number(orderRes.data.order.totalXof);
  assert.ok(totalXof > 0);

  // Mobile Money requires phone number
  const missingPhone = await req(
    `/api/public/qr/${firstTable.qrToken}/orders/${orderId}/pay`,
    {
      method: 'POST',
      body: { method: 'WAVE', amountXof: totalXof },
    },
  );
  assert.equal(missingPhone.status, 400);

  // Valid Wave checkout with idempotency key
  const pay1 = await req(
    `/api/public/qr/${firstTable.qrToken}/orders/${orderId}/pay`,
    {
      method: 'POST',
      body: {
        method: 'WAVE',
        phoneNumber: '+225 07 11 22 33 44',
        amountXof: totalXof,
        idempotencyKey: 'qr_pay_idem_1',
      },
    },
  );
  assert.equal(pay1.status, 201);
  assert.equal(pay1.data.payment.fullyPaid, true);

  // Deduplicated replay returns 200
  const replay = await req(
    `/api/public/qr/${firstTable.qrToken}/orders/${orderId}/pay`,
    {
      method: 'POST',
      body: {
        method: 'WAVE',
        phoneNumber: '+225 07 11 22 33 44',
        amountXof: totalXof,
        idempotencyKey: 'qr_pay_idem_1',
      },
    },
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.data.deduplicated, true);

  // Second attempt with new key must reject with 409
  const doublePay = await req(
    `/api/public/qr/${firstTable.qrToken}/orders/${orderId}/pay`,
    {
      method: 'POST',
      body: {
        method: 'CARD',
        amountXof: totalXof,
        idempotencyKey: 'qr_pay_idem_2',
      },
    },
  );
  assert.equal(doublePay.status, 409);

  const track = await req(`/api/public/qr/${firstTable.qrToken}/orders/${orderId}`);
  assert.equal(track.status, 200);
  assert.equal(track.data.order.status, 'PAID');
  assert.equal(track.data.order.paidXof, totalXof);
});

test('2. Email verification, forgot/reset password, and POS PIN quick-switch', async () => {
  const reg = await req('/api/auth/register-restaurant', {
    method: 'POST',
    body: {
      restaurantName: 'Bistro Plateau',
      city: 'Abidjan',
      ownerName: 'Jean Kouassi',
      email: 'jean.plateau@example.ci',
      phone: '+225 05 00 11 22 33',
      password: 'PasswordInit123!',
      planCode: 'ESSENTIEL',
    },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.emailVerified, false);
  const verifyToken = reg.data.previewVerifyToken as string;
  assert.ok(verifyToken);

  const verified = await req('/api/auth/verify-email', {
    method: 'POST',
    body: { token: verifyToken },
  });
  assert.equal(verified.status, 200);

  // Forgot & reset password
  const forgot = await req('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'jean.plateau@example.ci' },
  });
  assert.equal(forgot.status, 200);
  const resetToken = forgot.data.previewResetToken as string;
  assert.ok(resetToken);

  const reset = await req('/api/auth/reset-password', {
    method: 'POST',
    body: { token: resetToken, newPassword: 'NewStrongPassword99!' },
  });
  assert.equal(reset.status, 200);

  // Old password rejected, new password accepted
  const badLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'jean.plateau@example.ci', password: 'PasswordInit123!' },
  });
  assert.equal(badLogin.status, 401);

  const goodLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'jean.plateau@example.ci', password: 'NewStrongPassword99!' },
  });
  assert.equal(goodLogin.status, 200);
  assert.equal(goodLogin.data.user.emailVerified, true);
  const ownerToken = goodLogin.data.token as string;
  const ownerUserId = goodLogin.data.user.id as string;

  // Set POS PIN and create a cashier with PIN
  const setPinRes = await req('/api/auth/pin', {
    method: 'POST',
    token: ownerToken,
    body: { currentPassword: 'NewStrongPassword99!', pin: '2468' },
  });
  assert.equal(setPinRes.status, 200);

  const staffCreate = await req('/api/restaurant/staff', {
    method: 'POST',
    token: ownerToken,
    body: {
      fullName: 'Caissier Rapide',
      email: 'caissier.pin@example.ci',
      role: 'CASHIER',
      password: 'CashierPass123!',
      pin: '1357',
    },
  });
  assert.equal(staffCreate.status, 201);

  const pinDir = await req('/api/restaurant/staff/pin-directory', { token: ownerToken });
  assert.equal(pinDir.status, 200);
  const cashierEntry = (pinDir.data.directory as Array<{ userId: string; hasPin: boolean; role: string }>)
    .find((d) => d.role === 'CASHIER');
  assert.ok(cashierEntry?.hasPin);

  // Switch active terminal session to cashier via PIN
  const pinSwitch = await req('/api/auth/pin-login', {
    method: 'POST',
    token: ownerToken,
    body: { userId: cashierEntry!.userId, pin: '1357' },
  });
  assert.equal(pinSwitch.status, 200);
  assert.equal(pinSwitch.data.user.role, 'CASHIER');

  // Switch back to owner via PIN using cashier token
  const switchBack = await req('/api/auth/pin-login', {
    method: 'POST',
    token: pinSwitch.data.token,
    body: { userId: ownerUserId, pin: '2468' },
  });
  assert.equal(switchBack.status, 200);
  assert.equal(switchBack.data.user.role, 'OWNER');

  // Wrong PIN returns 401
  const wrongPin = await req('/api/auth/pin-login', {
    method: 'POST',
    token: ownerToken,
    body: { userId: ownerUserId, pin: '0000' },
  });
  assert.equal(wrongPin.status, 401);
});

test('3. Floor 2D plan, table edit/delete, transfer & merge orders', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  const token = login.data.token as string;

  // Create two tables with 2D visual coordinates
  const t1 = await req('/api/restaurant/tables', {
    method: 'POST',
    token,
    body: { zone: 'VIP', label: 'VIP-1', capacity: 4, posX: 120, posY: 140, shape: 'ROUND' },
  });
  assert.equal(t1.status, 201);
  const t2 = await req('/api/restaurant/tables', {
    method: 'POST',
    token,
    body: { zone: 'VIP', label: 'VIP-2', capacity: 6, posX: 300, posY: 140, shape: 'RECT' },
  });
  assert.equal(t2.status, 201);

  // Update 2D coordinates & shape
  const patchTable = await req(`/api/restaurant/tables/${t1.data.id}`, {
    method: 'PATCH',
    token,
    body: { posX: 180, posY: 200, shape: 'RECT', label: 'VIP-1A' },
  });
  assert.equal(patchTable.status, 200);

  // Place order on Table 1
  const order1 = await req('/api/restaurant/orders', {
    method: 'POST',
    token,
    body: {
      orderType: 'DINE_IN',
      tableId: t1.data.id,
      customerName: 'Table VIP 1A',
      items: [{ menuItemId: 'itm_capitaine', quantity: 1 }],
    },
  });
  assert.equal(order1.status, 201);

  // Transfer active order from Table 1 -> empty Table 2
  const transfer = await req(`/api/restaurant/tables/${t1.data.id}/transfer`, {
    method: 'POST',
    token,
    body: { targetTableId: t2.data.id },
  });
  assert.equal(transfer.status, 200);

  // Now create a second order on Table 1 and merge Table 1 into Table 2
  const order2 = await req('/api/restaurant/orders', {
    method: 'POST',
    token,
    body: {
      orderType: 'DINE_IN',
      tableId: t1.data.id,
      customerName: 'Table VIP 1A bis',
      items: [{ menuItemId: 'itm_capitaine', quantity: 1 }],
    },
  });
  assert.equal(order2.status, 201);

  const merge = await req(`/api/restaurant/tables/${t2.data.id}/merge`, {
    method: 'POST',
    token,
    body: { sourceTableId: t1.data.id },
  });
  assert.equal(merge.status, 200);

  // Table 2 now holds merged order -> cannot delete occupied Table 2
  const delOccupied = await req(`/api/restaurant/tables/${t2.data.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delOccupied.status, 409);

  // Table 1 is now freed -> delete succeeds
  const delFree = await req(`/api/restaurant/tables/${t1.data.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delFree.status, 200);
});

test('4. Menu category/item CRUD & deletion constraints, Staff/Customer/Expense edit & delete', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  const token = login.data.token as string;

  // Menu Category & Item CRUD
  const catRes = await req('/api/restaurant/menu/categories', {
    method: 'POST',
    token,
    body: { name: 'Pâtisseries', station: 'KITCHEN' },
  });
  assert.equal(catRes.status, 201);
  const catId = catRes.data.category.id as string;

  const updCat = await req(`/api/restaurant/menu/categories/${catId}`, {
    method: 'PATCH',
    token,
    body: { name: 'Desserts & Pâtisseries', station: 'BAR' },
  });
  assert.equal(updCat.status, 200);

  const itemRes = await req('/api/restaurant/menu/items', {
    method: 'POST',
    token,
    body: { categoryId: catId, name: 'Fondant Chocolat', priceXof: 4500 },
  });
  assert.equal(itemRes.status, 201);
  const itemId = itemRes.data.id as string;

  // Cannot delete non-empty category -> 409
  const delCatBusy = await req(`/api/restaurant/menu/categories/${catId}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delCatBusy.status, 409);

  // Delete item then category succeeds
  const delItem = await req(`/api/restaurant/menu/items/${itemId}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delItem.status, 200);

  const delCat = await req(`/api/restaurant/menu/categories/${catId}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delCat.status, 200);

  // Staff full edit & delete
  const stRes = await req('/api/restaurant/staff', {
    method: 'POST',
    token,
    body: {
      fullName: 'Serveur Alpha',
      email: 'alpha.serveur@lesillage.ci',
      role: 'WAITER',
      password: 'PasswordAlpha1!',
      pin: '4321',
    },
  });
  assert.equal(stRes.status, 201);
  const memberId = stRes.data.id as string;

  const stPatch = await req(`/api/restaurant/staff/${memberId}`, {
    method: 'PATCH',
    token,
    body: {
      fullName: 'Manager Alpha',
      email: 'alpha.manager@lesillage.ci',
      role: 'MANAGER',
      newPassword: 'PasswordBeta2!',
      pin: '8765',
    },
  });
  assert.equal(stPatch.status, 200);

  const newStaffLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'alpha.manager@lesillage.ci', password: 'PasswordBeta2!' },
  });
  assert.equal(newStaffLogin.status, 200);
  assert.equal(newStaffLogin.data.user.role, 'MANAGER');

  const stDelete = await req(`/api/restaurant/staff/${memberId}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(stDelete.status, 200);

  // Customer edit & delete
  const custCreate = await req('/api/restaurant/customers', {
    method: 'POST',
    token,
    body: { fullName: 'Client Fidèle', phone: '+225 07 88 99 00 11' },
  });
  assert.equal(custCreate.status, 201);
  const custPatch = await req(`/api/restaurant/customers/${custCreate.data.id}`, {
    method: 'PATCH',
    token,
    body: { fullName: 'Client VIP Fidèle', preferences: 'Sans piment' },
  });
  assert.equal(custPatch.status, 200);
  const custDel = await req(`/api/restaurant/customers/${custCreate.data.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(custDel.status, 200);

  // Expense edit & delete
  const expCreate = await req('/api/restaurant/expenses', {
    method: 'POST',
    token,
    body: { category: 'Livraison', description: 'Glace pilée', amountXof: 12000 },
  });
  assert.equal(expCreate.status, 201);
  const expPatch = await req(`/api/restaurant/expenses/${expCreate.data.id}`, {
    method: 'PATCH',
    token,
    body: { amountXof: 15000, description: 'Glace pilée + transport' },
  });
  assert.equal(expPatch.status, 200);
  const expDel = await req(`/api/restaurant/expenses/${expCreate.data.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(expDel.status, 200);
});

test('5. Stocks edit/delete & Purchase Orders receipt stock increment', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  const token = login.data.token as string;

  const stkRes = await req('/api/restaurant/stocks', {
    method: 'POST',
    token,
    body: {
      name: 'Huile de palme test',
      unit: 'L',
      quantity: 5,
      minThreshold: 2,
      unitCostXof: 1500,
      supplierName: 'Marché Adjamé',
    },
  });
  assert.equal(stkRes.status, 201);
  const stockId = stkRes.data.id as string;

  const updStk = await req(`/api/restaurant/stocks/${stockId}`, {
    method: 'PATCH',
    token,
    body: { name: 'Huile de palme raffinée', minThreshold: 3 },
  });
  assert.equal(updStk.status, 200);

  // Create Purchase Order for +10 L
  const poCreate = await req('/api/restaurant/purchase-orders', {
    method: 'POST',
    token,
    body: {
      supplierName: 'Grossiste Cocody',
      status: 'ORDERED',
      items: [{ stockId, quantity: 10, unitCostXof: 1400 }],
    },
  });
  assert.equal(poCreate.status, 201);
  assert.equal(poCreate.data.purchaseOrder.totalCostXof, 14000);
  const poId = poCreate.data.purchaseOrder.id as string;

  // Mark PO as RECEIVED -> stock quantity becomes 5 + 10 = 15
  const poReceive = await req(`/api/restaurant/purchase-orders/${poId}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'RECEIVED' },
  });
  assert.equal(poReceive.status, 200);

  const stocksAfter = await req('/api/restaurant/stocks', { token });
  assert.equal(stocksAfter.status, 200);
  const updatedRow = (stocksAfter.data.stocks as Array<{ id: string; quantity: number }>)
    .find((s) => s.id === stockId);
  assert.equal(updatedRow?.quantity, 15);

  const movement = (stocksAfter.data.movements as Array<{ stockName: string; movementType: string; quantityDelta: number }>)
    .find((m) => m.stockName === 'Huile de palme raffinée' && m.movementType === 'PURCHASE');
  assert.equal(movement?.quantityDelta, 10);

  const delStock = await req(`/api/restaurant/stocks/${stockId}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delStock.status, 200);
});

test('6. Self-service SaaS subscription portal, WhatsApp connector & Super-Admin Lead CRM', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  const ownerToken = login.data.token as string;

  // SaaS portal & self-service checkout
  const portal = await req('/api/restaurant/subscription', { token: ownerToken });
  assert.equal(portal.status, 200);
  assert.ok(Array.isArray(portal.data.plans) && portal.data.plans.length >= 2);
  const targetPlan = portal.data.plans[portal.data.plans.length - 1] as { id: string };

  const checkout = await req('/api/restaurant/subscription/checkout', {
    method: 'POST',
    token: ownerToken,
    body: { planId: targetPlan.id, billingCycle: 'YEARLY', paymentMethod: 'WAVE' },
  });
  assert.equal(checkout.status, 201);
  assert.ok(checkout.data.invoiceNumber);

  const portalAfter = await req('/api/restaurant/subscription', { token: ownerToken });
  assert.equal(portalAfter.status, 200);
  assert.equal(portalAfter.data.currentSubscription.planId, targetPlan.id);
  assert.equal(portalAfter.data.currentSubscription.billingCycle, 'YEARLY');
  assert.equal(portalAfter.data.invoices[0].status, 'PAID');

  // WhatsApp settings never leak secret access token
  const waSettingsPatch = await req('/api/restaurant/settings', {
    method: 'PATCH',
    token: ownerToken,
    body: {
      whatsappEnabled: true,
      whatsappPhoneNumberId: '1092837465',
      whatsappAccessToken: 'EAAG_SECRET_TOKEN_XYZ',
    },
  });
  assert.equal(waSettingsPatch.status, 200);

  const settingsGet = await req('/api/restaurant/settings', { token: ownerToken });
  assert.equal(settingsGet.status, 200);
  assert.equal(settingsGet.data.restaurant.whatsappEnabled, true);
  assert.equal(settingsGet.data.restaurant.whatsappConfigured, true);
  assert.equal(settingsGet.data.restaurant.whatsappAccessToken, undefined);

  // Reservation with automatic WhatsApp confirmation log
  const resv = await req('/api/restaurant/reservations', {
    method: 'POST',
    token: ownerToken,
    body: {
      customerName: 'Mariam Touré',
      customerPhone: '+225 07 55 44 33 22',
      partySize: 4,
      reservedAt: new Date(Date.now() + 86400000).toISOString(),
      notifyWhatsapp: true,
    },
  });
  assert.equal(resv.status, 201);
  assert.ok(String(resv.data.whatsappResult?.waMeLink || '').includes('https://wa.me/'));

  const ordersRes = await req('/api/restaurant/orders', { token: ownerToken });
  const sampleOrder = ordersRes.data.orders[0] as { id: string };
  const waReceipt = await req(`/api/restaurant/orders/${sampleOrder.id}/whatsapp-receipt`, {
    method: 'POST',
    token: ownerToken,
    body: { phoneNumber: '0755443322' },
  });
  assert.equal(waReceipt.status, 200);
  assert.ok(String(waReceipt.data.waMeLink || '').includes('https://wa.me/'));

  const waLogs = await req('/api/restaurant/whatsapp/logs', { token: ownerToken });
  assert.equal(waLogs.status, 200);
  assert.ok((waLogs.data.logs as unknown[]).length >= 2);

  // Super-Admin Lead CRM + 1-click convert
  const demoReq = await req('/api/public/demo-requests', {
    method: 'POST',
    body: {
      fullName: 'Koffi Yao',
      restaurantName: 'Chez Koffi Grill',
      city: 'Yamoussoukro',
      email: 'koffi.grill@example.ci',
      phone: '+225 01 02 03 04 05',
      message: 'Souhaite une démo complète',
    },
  });
  assert.equal(demoReq.status, 201);

  const saLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'superadmin@restomax.ci', password: 'RestoMax2026!' },
  });
  assert.equal(saLogin.status, 200);
  const saToken = saLogin.data.token as string;

  const saTickets = await req('/api/superadmin/tickets', { token: saToken });
  assert.equal(saTickets.status, 200);
  const lead = (saTickets.data.leads as Array<{ id: string; email: string }>)
    .find((l) => l.email === 'koffi.grill@example.ci');
  assert.ok(lead);

  const leadPatch = await req(`/api/superadmin/leads/${lead!.id}`, {
    method: 'PATCH',
    token: saToken,
    body: { status: 'CONTACTED', adminNotes: 'Appel prévu demain 10h' },
  });
  assert.equal(leadPatch.status, 200);

  const convert = await req(`/api/superadmin/leads/${lead!.id}/convert`, {
    method: 'POST',
    token: saToken,
    body: { planCode: 'PRO' },
  });
  assert.equal(convert.status, 201);
  assert.ok(convert.data.restaurantId);
});

test('7. Subscription auto-renew, immediate renewal, usage quotas & PayDunya IPN webhook verification', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  assert.equal(login.status, 200);
  const ownerToken = login.data.token as string;
  const rid = login.data.user.restaurantId as string;

  const portal = await req('/api/restaurant/subscription', { token: ownerToken });
  assert.equal(portal.status, 200);
  assert.ok(typeof portal.data.usage?.tablesCount === 'number');
  assert.ok(typeof portal.data.usage?.staffCount === 'number');
  assert.ok(typeof portal.data.usage?.menuItemsCount === 'number');
  assert.equal(typeof portal.data.currentSubscription.autoRenew, 'boolean');

  // Toggle auto-renew off then back on with preferred payment method
  const toggleOff = await req('/api/restaurant/subscription/auto-renew', {
    method: 'PATCH',
    token: ownerToken,
    body: { autoRenew: false, preferredPaymentMethod: 'ORANGE_MONEY' },
  });
  assert.equal(toggleOff.status, 200);
  assert.equal(toggleOff.data.autoRenew, false);

  const renewNow = await req('/api/restaurant/subscription/renew-now', {
    method: 'POST',
    token: ownerToken,
    body: { paymentMethod: 'ORANGE_MONEY' },
  });
  assert.equal(renewNow.status, 201);
  assert.equal(renewNow.data.status, 'PAID');

  const portalAfter = await req('/api/restaurant/subscription', { token: ownerToken });
  assert.equal(portalAfter.status, 200);
  assert.equal(portalAfter.data.currentSubscription.autoRenew, false);
  assert.equal(portalAfter.data.currentSubscription.preferredPaymentMethod, 'ORANGE_MONEY');
  assert.equal(portalAfter.data.invoices[0].isRenewal, true);

  // PayDunya IPN Webhook verification: unsigned / bad signature rejected (401)
  const db = getDb();
  const invId = 'inv_pdx_ipn_test_1';
  const pdxToken = 'pdx_tok_test_12345';
  const masterKeyTest = 'test_master_key_secret_987';
  db.prepare(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run('paydunya_master_key', masterKeyTest, new Date().toISOString());
  db.prepare(
    `INSERT INTO platform_invoices (
      id, invoice_number, restaurant_id, subscription_id, amount_xof,
      status, payment_method, mode, paydunya_token, checkout_url,
      plan_id, billing_cycle, is_renewal, created_at
    ) VALUES (?, 'INV-IPN-001', ?, 'sub_1', 55000, 'PENDING', 'WAVE', 'TEST', ?, '', 'plan_pro', 'MONTHLY', 1, ?)`,
  ).run(invId, rid, pdxToken, new Date().toISOString());

  const badWebhook = await req('/api/public/webhooks/paydunya', {
    method: 'POST',
    body: {
      data: {
        hash: '0'.repeat(128),
        status: 'completed',
        invoice: { token: pdxToken, total_amount: 55000 },
        custom_data: { invoice_id: invId },
      },
    },
  });
  assert.equal(badWebhook.status, 401);

  const validHash = crypto.createHash('sha512').update(masterKeyTest).digest('hex');
  const goodWebhook = await req('/api/public/webhooks/paydunya', {
    method: 'POST',
    body: {
      data: {
        hash: validHash,
        status: 'completed',
        invoice: { token: pdxToken, total_amount: 55000 },
        custom_data: { invoice_id: invId },
      },
    },
  });
  assert.equal(goodWebhook.status, 200);
  assert.equal(goodWebhook.data.ok, true);

  const updatedInv = db
    .prepare('SELECT status, paid_at FROM platform_invoices WHERE id = ?')
    .get(invId) as { status: string; paid_at: string | null };
  assert.equal(updatedInv.status, 'PAID');
  assert.ok(updatedInv.paid_at);
});

test('8. Password reset token validation, prior token invalidation & platform secret masking', async () => {
  // First reset request
  const forgot1 = await req('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'manager@lesillage.ci' },
  });
  assert.equal(forgot1.status, 200);
  const token1 = forgot1.data.previewResetToken as string;
  assert.ok(token1);

  // Second reset request invalidates token1
  const forgot2 = await req('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'manager@lesillage.ci' },
  });
  assert.equal(forgot2.status, 200);
  const token2 = forgot2.data.previewResetToken as string;
  assert.ok(token2 && token2 !== token1);

  const checkOld = await req(
    `/api/auth/reset-password/validate?token=${encodeURIComponent(token1)}`,
  );
  assert.equal(checkOld.status, 200);
  assert.equal(checkOld.data.valid, false);
  assert.equal(checkOld.data.reason, 'USED');

  const checkNew = await req(
    `/api/auth/reset-password/validate?token=${encodeURIComponent(token2)}`,
  );
  assert.equal(checkNew.status, 200);
  assert.equal(checkNew.data.valid, true);
  assert.ok(checkNew.data.expiresAt);

  // Consume token2 once, then verify replay fails
  const consume = await req('/api/auth/reset-password', {
    method: 'POST',
    body: { token: token2, newPassword: 'ManagerReset2026!' },
  });
  assert.equal(consume.status, 200);

  const replay = await req('/api/auth/reset-password', {
    method: 'POST',
    body: { token: token2, newPassword: 'AnotherPassword2026!' },
  });
  assert.equal(replay.status, 400);

  // Platform secrets never leak on public or superadmin settings endpoints
  const saLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'superadmin@restomax.ci', password: 'RestoMax2026!' },
  });
  const saToken = saLogin.data.token as string;
  await req('/api/superadmin/settings', {
    method: 'PATCH',
    token: saToken,
    body: { smtp_pass: 'SuperSecretSmtpPass!', paydunya_private_key: 'live_priv_key_xyz' },
  });

  const publicSet = await req('/api/public/settings');
  assert.equal(publicSet.status, 200);
  assert.equal(publicSet.data.settings.smtp_pass, undefined);
  assert.equal(publicSet.data.settings.paydunya_master_key, undefined);
  assert.equal(publicSet.data.settings.paydunya_private_key, undefined);

  const saSet = await req('/api/superadmin/settings', { token: saToken });
  assert.equal(saSet.status, 200);
  assert.equal(saSet.data.settings.smtp_pass, undefined);
  assert.equal(saSet.data.settings.smtp_pass_configured, 'true');
  assert.equal(saSet.data.settings.paydunya_private_key, undefined);
  assert.equal(saSet.data.settings.paydunya_private_key_configured, 'true');
});

test('9. Dedicated POS PIN operators, waiter/cashier fast switching & email verification lifecycle', async () => {
  const ownerLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  assert.equal(ownerLogin.status, 200);
  const ownerToken = ownerLogin.data.token as string;

  // 1. POS operators endpoint lists WAITER/CASHIER/MANAGER/OWNER, excludes KITCHEN_BAR
  const opsRes = await req('/api/restaurant/pos/operators', { token: ownerToken });
  assert.equal(opsRes.status, 200);
  const operators = opsRes.data.operators as Array<{
    userId: string;
    role: string;
    hasPin: boolean;
  }>;
  assert.ok(operators.some((op) => op.userId === 'usr_waiter_1' && op.role === 'WAITER' && op.hasPin));
  assert.ok(operators.some((op) => op.userId === 'usr_cashier_1' && op.role === 'CASHIER' && op.hasPin));
  assert.equal(operators.some((op) => op.userId === 'usr_kitchen_1' || op.role === 'KITCHEN_BAR'), false);

  // 2. Fast POS switch: Owner -> Waiter
  const switchWaiter = await req('/api/restaurant/pos/pin-switch', {
    method: 'POST',
    token: ownerToken,
    body: { userId: 'usr_waiter_1', pin: '1234' },
  });
  assert.equal(switchWaiter.status, 200);
  assert.equal(switchWaiter.data.user.role, 'WAITER');
  assert.equal(switchWaiter.data.user.id, 'usr_waiter_1');
  assert.ok(String(switchWaiter.headers.get('set-cookie') || '').includes('restomax_token='));
  const waiterToken = switchWaiter.data.token as string;

  // 3. Fast POS switch: Waiter -> Cashier
  const switchCashier = await req('/api/restaurant/pos/pin-switch', {
    method: 'POST',
    token: waiterToken,
    body: { userId: 'usr_cashier_1', pin: '1234' },
  });
  assert.equal(switchCashier.status, 200);
  assert.equal(switchCashier.data.user.role, 'CASHIER');
  assert.equal(switchCashier.data.user.id, 'usr_cashier_1');
  assert.ok(String(switchCashier.headers.get('set-cookie') || '').includes('restomax_token='));
  const cashierToken = switchCashier.data.token as string;

  // 4. KITCHEN_BAR cannot take over a POS terminal via POS PIN switch
  const switchKitchen = await req('/api/restaurant/pos/pin-switch', {
    method: 'POST',
    token: cashierToken,
    body: { userId: 'usr_kitchen_1', pin: '1234' },
  });
  assert.equal(switchKitchen.status, 403);

  // 5. Cross-tenant checks: explicit restaurantId mismatch rejected with 403; non-member user rejected with 401; wrong PIN rejected with 401
  const crossTenantExplicit = await req('/api/restaurant/pos/pin-switch', {
    method: 'POST',
    token: cashierToken,
    body: { restaurantId: 'rest_other_tenant', userId: 'usr_owner_2', pin: '1234' },
  });
  assert.equal(crossTenantExplicit.status, 403);

  const crossTenantImplicit = await req('/api/restaurant/pos/pin-switch', {
    method: 'POST',
    token: cashierToken,
    body: { userId: 'usr_owner_2', pin: '1234' },
  });
  assert.equal(crossTenantImplicit.status, 401);

  const wrongPin = await req('/api/restaurant/pos/pin-switch', {
    method: 'POST',
    token: cashierToken,
    body: { userId: 'usr_waiter_1', pin: '9999' },
  });
  assert.equal(wrongPin.status, 401);

  // 6. Email verification lifecycle: registration -> resend invalidates prior token -> atomic verify -> replay blocked
  const unauthResend = await req('/api/auth/send-verification', { method: 'POST' });
  assert.equal(unauthResend.status, 401);

  const reg = await req('/api/auth/register-restaurant', {
    method: 'POST',
    body: {
      restaurantName: 'Table d’Abidjan',
      city: 'Abidjan',
      ownerName: 'Fatou Diallo',
      email: 'fatou.abidjan@example.ci',
      phone: '+225 07 44 55 66 77',
      password: 'FatouPassword123!',
      planCode: 'ESSENTIEL',
    },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.emailVerified, false);
  const firstVerifyToken = reg.data.previewVerifyToken as string;
  const fatouToken = reg.data.token as string;
  assert.ok(firstVerifyToken);

  const resend = await req('/api/auth/send-verification', {
    method: 'POST',
    token: fatouToken,
  });
  assert.equal(resend.status, 200);
  const secondVerifyToken = resend.data.previewVerifyToken as string;
  assert.ok(secondVerifyToken && secondVerifyToken !== firstVerifyToken);

  // Superseded token must fail
  const verifyOld = await req('/api/auth/verify-email', {
    method: 'POST',
    body: { token: firstVerifyToken },
  });
  assert.equal(verifyOld.status, 400);

  // Latest token succeeds and marks user verified
  const verifyLatest = await req('/api/auth/verify-email', {
    method: 'POST',
    body: { token: secondVerifyToken },
  });
  assert.equal(verifyLatest.status, 200);
  assert.equal(verifyLatest.data.ok, true);

  // Replay of already-used token fails
  const replayVerify = await req('/api/auth/verify-email', {
    method: 'POST',
    body: { token: secondVerifyToken },
  });
  assert.equal(replayVerify.status, 400);

  // /api/auth/me now reflects verified account
  const meAfterVerify = await req('/api/auth/me', { token: fatouToken });
  assert.equal(meAfterVerify.status, 200);
  assert.equal(meAfterVerify.data.user.emailVerified, true);
});

test('10. Super-Admin upgrades: PRO->PROFESSIONNEL mapping, random temp password, atomic invoice activation, CRUD & SSRF guard', async () => {
  const saLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'superadmin@restomax.ci', password: 'RestoMax2026!' },
  });
  assert.equal(saLogin.status, 200);
  const saToken = saLogin.data.token as string;

  // 1. Dashboard includes new MRR, conversionRatePct, trialExpiringSoonCount & monthlyPlatformSeries
  const dash = await req('/api/superadmin/dashboard', { token: saToken });
  assert.equal(dash.status, 200);
  assert.equal(typeof dash.data.kpis.mrrXof, 'number');
  assert.equal(typeof dash.data.kpis.conversionRatePct, 'number');
  assert.equal(typeof dash.data.kpis.trialExpiringSoonCount, 'number');
  assert.ok(Array.isArray(dash.data.monthlyPlatformSeries));

  // 2. Lead conversion with legacy 'PRO' maps to 'PROFESSIONNEL', sets random password (not hardcoded) & verified email
  const leadRes = await req('/api/public/demo-requests', {
    method: 'POST',
    body: {
      fullName: 'Awa Koné',
      restaurantName: 'La Terrazza Cocody',
      city: 'Abidjan',
      email: 'awa.terrazza@example.ci',
      phone: '+225 07 88 99 00 11',
      message: 'Intéressée par offre Pro',
    },
  });
  assert.equal(leadRes.status, 201);

  const ticketsRes = await req('/api/superadmin/tickets', { token: saToken });
  const lead = (ticketsRes.data.leads as Array<{ id: string; email: string }>).find(
    (l) => l.email === 'awa.terrazza@example.ci',
  );
  assert.ok(lead);

  const convert = await req(`/api/superadmin/leads/${lead!.id}/convert`, {
    method: 'POST',
    token: saToken,
    body: { planCode: 'PRO' },
  });
  assert.equal(convert.status, 201);
  assert.equal(convert.data.planCode, 'PROFESSIONNEL');
  assert.ok(convert.data.tempPassword);
  assert.notEqual(convert.data.tempPassword, 'RestoMax2026!');
  assert.ok(convert.data.previewResetToken);

  const convertedRid = convert.data.restaurantId as string;
  const detail = await req(`/api/superadmin/restaurants/${convertedRid}`, { token: saToken });
  assert.equal(detail.status, 200);
  assert.equal(detail.data.restaurant.planCode, 'PROFESSIONNEL');
  assert.equal(detail.data.restaurant.ownerEmail, 'awa.terrazza@example.ci');

  const usersCheck = await req('/api/superadmin/users', { token: saToken });
  assert.equal(usersCheck.status, 200);
  const awaUserRow = (
    usersCheck.data.users as Array<{ id: string; email: string; emailVerified: boolean }>
  ).find((u) => u.email === 'awa.terrazza@example.ci');
  assert.ok(awaUserRow);
  assert.equal(awaUserRow!.emailVerified, true);

  // 3. Edit restaurant profile
  const patchRest = await req(`/api/superadmin/restaurants/${convertedRid}`, {
    method: 'PATCH',
    token: saToken,
    body: { name: 'La Terrazza Riviera', city: 'Abidjan Cocody', phone: '+225 05 11 22 33 44' },
  });
  assert.equal(patchRest.status, 200);

  // 4. Suspend restaurant, create manual PENDING invoice, then mark-paid atomically reactivates restaurant & subscription
  const suspendRes = await req(`/api/superadmin/restaurants/${convertedRid}/status`, {
    method: 'PATCH',
    token: saToken,
    body: { status: 'SUSPENDED', reason: 'Test facturation' },
  });
  assert.equal(suspendRes.status, 200);

  const manualInv = await req('/api/superadmin/billing', {
    method: 'POST',
    token: saToken,
    body: {
      restaurantId: convertedRid,
      planId: detail.data.restaurant.planId,
      billingCycle: 'YEARLY',
      paymentMethod: 'WIRE',
      status: 'PENDING',
    },
  });
  assert.equal(manualInv.status, 201);

  const markPaid = await req(`/api/superadmin/billing/${manualInv.data.id}/mark-paid`, {
    method: 'POST',
    token: saToken,
  });
  assert.equal(markPaid.status, 200);
  assert.equal(markPaid.data.alreadyPaid, false);

  const detailAfterPaid = await req(`/api/superadmin/restaurants/${convertedRid}`, {
    token: saToken,
  });
  assert.equal(detailAfterPaid.status, 200);
  assert.equal(detailAfterPaid.data.restaurant.status, 'ACTIVE');

  const subsRes = await req('/api/superadmin/subscriptions', { token: saToken });
  const updatedSub = (
    subsRes.data.subscriptions as Array<{
      id: string;
      restaurantId: string;
      status: string;
      billingCycle: string;
      effectiveAmountXof: number;
    }>
  ).find((s) => s.restaurantId === convertedRid);
  assert.ok(updatedSub);
  assert.equal(updatedSub!.status, 'ACTIVE');
  assert.equal(updatedSub!.billingCycle, 'YEARLY');
  assert.ok(updatedSub!.effectiveAmountXof > 0);

  // 5. Create custom plan and update subscription
  const planCreate = await req('/api/superadmin/plans', {
    method: 'POST',
    token: saToken,
    body: {
      code: 'ENTERPRISE_VIP',
      name: 'Enterprise VIP',
      tagline: 'Multi-sites sur mesure',
      priceMonthlyXof: 120000,
      priceYearlyXof: 1200000,
      trialDays: 30,
      maxTables: 120,
      maxStaff: 60,
      maxMenuItems: 500,
      features: ['Multi-sites', 'Support 24/7'],
      isFeatured: false,
    },
  });
  assert.equal(planCreate.status, 201);

  const subUpdate = await req(`/api/superadmin/subscriptions/${updatedSub!.id}`, {
    method: 'PATCH',
    token: saToken,
    body: { planId: planCreate.data.id, extendDays: 15, autoRenew: true },
  });
  assert.equal(subUpdate.status, 200);

  // 6. User session revocation & deduplicated users list
  const awaLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'awa.terrazza@example.ci', password: convert.data.tempPassword },
  });
  assert.equal(awaLogin.status, 200);
  const awaToken = awaLogin.data.token as string;
  const awaUserId = awaLogin.data.user.id as string;

  const usersList = await req('/api/superadmin/users', { token: saToken });
  assert.equal(usersList.status, 200);
  const userIds = (usersList.data.users as Array<{ id: string }>).map((u) => u.id);
  assert.equal(userIds.length, new Set(userIds).size); // deduplicated rows

  const revokeRes = await req(`/api/superadmin/users/${awaUserId}/revoke-sessions`, {
    method: 'POST',
    token: saToken,
  });
  assert.equal(revokeRes.status, 200);

  const meAfterRevoke = await req('/api/auth/me', { token: awaToken });
  assert.equal(meAfterRevoke.status, 401);

  // 7. Filtered audit log query
  const auditFiltered = await req('/api/superadmin/audit?targetType=INVOICE&limit=20', {
    token: saToken,
  });
  assert.equal(auditFiltered.status, 200);
  assert.ok(auditFiltered.data.total >= 1);
  assert.ok(
    (auditFiltered.data.logs as Array<{ targetType: string }>).every(
      (l) => l.targetType === 'INVOICE',
    ),
  );

  // 8. SMTP host SSRF guard rejects loopback/metadata hosts on settings update
  const badSmtp1 = await req('/api/superadmin/settings', {
    method: 'PATCH',
    token: saToken,
    body: { smtp_host: '127.0.0.1' },
  });
  assert.equal(badSmtp1.status, 400);

  const badSmtp2 = await req('/api/superadmin/settings', {
    method: 'PATCH',
    token: saToken,
    body: { smtp_host: '169.254.169.254' },
  });
  assert.equal(badSmtp2.status, 400);
});

test('11. Storefront Click & Collect & Delivery, Combos, Happy Hour & Promo Code', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  assert.equal(login.status, 200);
  const token = login.data.token as string;

  // Read storefront context
  const storeCtx = await req('/api/public/store/le-sillage-lagune');
  assert.equal(storeCtx.status, 200);
  assert.equal(storeCtx.data.restaurant.storefrontEnabled, true);
  assert.ok(Array.isArray(storeCtx.data.restaurant.deliveryZones));
  assert.ok(storeCtx.data.restaurant.deliveryZones.length >= 1);
  assert.ok(Array.isArray(storeCtx.data.restaurant.pickupSlots));

  const firstItem = storeCtx.data.items[0] as { id: string; categoryId: string; priceXof: number };
  const zone = storeCtx.data.restaurant.deliveryZones[0] as {
    id: string;
    name: string;
    feeXof: number;
    minOrderXof: number;
  };

  // Create a Combo
  const comboRes = await req('/api/restaurant/combos', {
    method: 'POST',
    token,
    body: {
      name: 'Menu Midi Lagune',
      description: 'Plat + Boisson',
      priceXof: 8500,
      isDailySpecial: true,
      items: [{ menuItemId: firstItem.id, label: 'Plat principal', quantity: 1 }],
    },
  });
  assert.equal(comboRes.status, 201);
  const comboId = comboRes.data.combo.id as string;

  // Create an all-day Happy Hour promo (-20%) on firstItem's category
  const hhRes = await req('/api/restaurant/promotions', {
    method: 'POST',
    token,
    body: {
      name: 'Happy Hour Test',
      promoType: 'HAPPY_HOUR',
      discountType: 'PERCENT',
      discountValue: 20,
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
      categoryId: firstItem.categoryId,
    },
  });
  assert.equal(hhRes.status, 201);

  const menuCheck = await req('/api/restaurant/menu', { token });
  const discountedItem = (menuCheck.data.items as Array<{ id: string; priceXof: number; effectivePriceXof: number }>)
    .find((i) => i.id === firstItem.id);
  assert.ok(discountedItem);
  assert.ok(discountedItem!.effectivePriceXof < discountedItem!.priceXof);

  // Delivery order below minimum rejected (when minOrderXof > 0)
  if (zone.minOrderXof > discountedItem!.effectivePriceXof) {
    const lowDelivery = await req('/api/public/store/le-sillage-lagune/orders', {
      method: 'POST',
      body: {
        orderType: 'DELIVERY',
        customerName: 'Jean Kouassi',
        customerPhone: '+225 07 12 34 56 78',
        deliveryZoneId: zone.id,
        deliveryAddress: 'Cocody Angré 8e tranche',
        items: [{ menuItemId: firstItem.id, quantity: 1 }],
      },
    });
    assert.equal(lowDelivery.status, 400);
  }

  // Click & Collect order with seeded BIENVENUE10 promo + combo + payNow
  const ccOrder = await req('/api/public/store/le-sillage-lagune/orders', {
    method: 'POST',
    body: {
      orderType: 'CLICK_COLLECT',
      customerName: 'Mariam Bamba',
      customerPhone: '+225 07 77 88 99 00',
      scheduledSlot: storeCtx.data.restaurant.pickupSlots[0] || '12:30 - 13:00',
      promoCode: 'BIENVENUE10',
      combos: [{ comboId, quantity: 1 }],
      items: [{ menuItemId: firstItem.id, quantity: 1 }],
      payNow: true,
      paymentMethod: 'WAVE',
      paymentPhone: '+225 07 77 88 99 00',
    },
  });
  assert.equal(ccOrder.status, 201);
  assert.equal(ccOrder.data.order.status, 'PAID');
  assert.ok(Number(ccOrder.data.order.discountXof) > 0);
  assert.ok(Number(ccOrder.data.order.pointsEarned) > 0);

  // Delivery order with valid zone fee added
  const delivOrder = await req('/api/public/store/le-sillage-lagune/orders', {
    method: 'POST',
    body: {
      orderType: 'DELIVERY',
      customerName: 'Paul Koné',
      customerPhone: '+225 05 44 33 22 11',
      deliveryZoneId: zone.id,
      deliveryAddress: 'Marcory Zone 4, Rue Lumière',
      items: [{ menuItemId: firstItem.id, quantity: 4 }],
      payNow: false,
    },
  });
  assert.equal(delivOrder.status, 201);
  assert.equal(delivOrder.data.order.deliveryFeeXof, zone.feeXof);

  // Track storefront order & submit customer review on paid Click & Collect order
  const trackCc = await req(
    `/api/public/store/le-sillage-lagune/orders/${ccOrder.data.order.id}`,
  );
  assert.equal(trackCc.status, 200);
  assert.equal(trackCc.data.order.canReview, true);

  const reviewRes = await req(
    `/api/public/store/le-sillage-lagune/orders/${ccOrder.data.order.id}/review`,
    {
      method: 'POST',
      body: { rating: 5, comment: 'Retrait ultra rapide et chaud !' },
    },
  );
  assert.equal(reviewRes.status, 201);

  // Cleanup test Happy Hour promotion so subsequent tests see standard base prices
  const delHh = await req(`/api/restaurant/promotions/${hhRes.data.promotion.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delHh.status, 200);
});

test('12. Cash Register Z-Report, Mixed/Split Payments, OptionGroups & QR Table Calls', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  const token = login.data.token as string;

  // Open Cash Register
  const openReg = await req('/api/restaurant/pos/register/open', {
    method: 'POST',
    token,
    body: { openingFloatXof: 25000, notes: 'Service midi' },
  });
  assert.equal(openReg.status, 201);

  // Double-open returns 409 Conflict
  const doubleOpen = await req('/api/restaurant/pos/register/open', {
    method: 'POST',
    token,
    body: { openingFloatXof: 10000 },
  });
  assert.equal(doubleOpen.status, 409);

  // Create menu item with required optionGroups
  const menuBefore = await req('/api/restaurant/menu', { token });
  const catId = menuBefore.data.categories[0].id as string;
  const optItemRes = await req('/api/restaurant/menu/items', {
    method: 'POST',
    token,
    body: {
      categoryId: catId,
      name: 'Entrecôte Grillée Option Test',
      priceXof: 10000,
      optionGroups: [
        {
          id: 'grp_cuisson',
          name: 'Cuisson',
          required: true,
          multiple: false,
          choices: [
            { id: 'c_saignant', label: 'Saignant', priceDeltaXof: 0 },
            { id: 'c_bien_cuit', label: 'Bien cuit', priceDeltaXof: 0 },
          ],
        },
        {
          id: 'grp_supps',
          name: 'Suppléments',
          required: false,
          multiple: true,
          choices: [{ id: 's_fromage', label: 'Sauce Roquefort', priceDeltaXof: 1500 }],
        },
      ],
    },
  });
  assert.equal(optItemRes.status, 201);
  const optItemId = optItemRes.data.id as string;

  // Missing required option group must fail with 400
  const missingOptOrder = await req('/api/restaurant/orders', {
    method: 'POST',
    token,
    body: {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: optItemId, quantity: 1 }],
    },
  });
  assert.equal(missingOptOrder.status, 400);

  // Selecting required + extra adds delta
  const validOptOrder = await req('/api/restaurant/orders', {
    method: 'POST',
    token,
    body: {
      orderType: 'TAKEAWAY',
      customerName: 'Client Mixte',
      items: [
        {
          menuItemId: optItemId,
          quantity: 1,
          optionIds: ['c_saignant', 's_fromage'],
        },
      ],
    },
  });
  assert.equal(validOptOrder.status, 201);
  const ordId = validOptOrder.data.order.id as string;
  const ordTotal = Number(validOptOrder.data.order.totalXof);
  assert.equal(ordTotal, 11500);

  // Mixed / Split payment (Wave + Cash)
  const firstHalf = 6500;
  const secondHalf = ordTotal - firstHalf;
  const mixedPay = await req(`/api/restaurant/orders/${ordId}/pay`, {
    method: 'POST',
    token,
    body: {
      payments: [
        { method: 'WAVE', amountXof: firstHalf },
        { method: 'CASH', amountXof: secondHalf },
      ],
      idempotencyKey: 'mixed_pay_test_1',
    },
  });
  assert.equal(mixedPay.status, 201);
  assert.equal(mixedPay.data.fullyPaid, true);
  assert.equal(mixedPay.data.payments.length, 2);

  // Close register and check Z-report
  const regState = await req('/api/restaurant/pos/register', { token });
  assert.equal(regState.status, 200);
  assert.ok(regState.data.activeSession);
  const expCash = Number(regState.data.liveTotals.expectedCashXof);
  const expMob = Number(regState.data.liveTotals.expectedMobileXof);
  const expCard = Number(regState.data.liveTotals.expectedCardXof);

  const closeReg = await req('/api/restaurant/pos/register/close', {
    method: 'POST',
    token,
    body: {
      countedCashXof: expCash,
      countedMobileXof: expMob,
      countedCardXof: expCard,
      notes: 'Caisse équilibrée',
    },
  });
  assert.equal(closeReg.status, 200);
  assert.ok(String(closeReg.data.report.zNumber).startsWith('Z-'));
  assert.equal(closeReg.data.report.varianceXof, 0);

  // QR Waiter/Bill call -> list -> acknowledge
  const tablesRes = await req('/api/restaurant/tables', { token });
  const qrTok = tablesRes.data.tables[0].qrToken as string;
  const callRes = await req(`/api/public/qr/${qrTok}/call`, {
    method: 'POST',
    body: { callType: 'BILL', note: 'Carte bancaire svp' },
  });
  assert.equal(callRes.status, 201);
  const callId = callRes.data.call.id as string;

  const listCalls = await req('/api/restaurant/table-calls', { token });
  assert.equal(listCalls.status, 200);
  assert.ok((listCalls.data.calls as Array<{ id: string }>).some((c) => c.id === callId));

  const ackCall = await req(`/api/restaurant/table-calls/${callId}/ack`, {
    method: 'POST',
    token,
  });
  assert.equal(ackCall.status, 200);
});

test('13. Loyalty Points Ledger/Redemption, Customer Reviews Reply, Inventory Counts & Typed Waste', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  const token = login.data.token as string;

  // Lookup loyalty points earned by Mariam Bamba in Test 11
  const lookup = await req(
    '/api/public/store/le-sillage-lagune/loyalty?phone=' +
      encodeURIComponent('+225 07 77 88 99 00'),
  );
  assert.equal(lookup.status, 200);
  assert.ok(Number(lookup.data.customer?.loyaltyPoints) > 0);

  // Find customer & test history + manual adjustment
  const custs = await req('/api/restaurant/customers', { token });
  const mariam = (custs.data.customers as Array<{ id: string; phone: string }>)
    .find((c) => c.phone.includes('0777889900'));
  assert.ok(mariam);

  const adj = await req(`/api/restaurant/customers/${mariam!.id}/loyalty/adjust`, {
    method: 'POST',
    token,
    body: { pointsDelta: 40, reason: 'Geste commercial anniversaire' },
  });
  assert.equal(adj.status, 200);

  const hist = await req(`/api/restaurant/customers/${mariam!.id}/loyalty`, { token });
  assert.equal(hist.status, 200);
  assert.ok((hist.data.transactions as unknown[]).length >= 2);

  // Customer reviews list & owner reply
  const revList = await req('/api/restaurant/reviews', { token });
  assert.equal(revList.status, 200);
  assert.ok(revList.data.summary.total >= 1);
  const firstRevId = revList.data.reviews[0].id as string;

  const replyRes = await req(`/api/restaurant/reviews/${firstRevId}/reply`, {
    method: 'POST',
    token,
    body: { reply: 'Merci Mariam, à très vite au Sillage !' },
  });
  assert.equal(replyRes.status, 200);

  // Inventory Count & Typed Waste
  const stocksRes = await req('/api/restaurant/stocks', { token });
  const firstStock = stocksRes.data.stocks[0] as { id: string; quantity: number };
  const targetQty = Math.max(0, firstStock.quantity - 2);

  const countRes = await req('/api/restaurant/inventory-counts', {
    method: 'POST',
    token,
    body: {
      title: 'Inventaire test mensuel',
      notes: 'Écart contrôlé',
      lines: [{ stockId: firstStock.id, countedQty: targetQty }],
    },
  });
  assert.equal(countRes.status, 201);
  assert.equal(countRes.data.count.lines[0].countedQty, targetQty);

  const wasteRes = await req(`/api/restaurant/stocks/${firstStock.id}/waste`, {
    method: 'POST',
    token,
    body: {
      wasteCategory: 'EXPIRED',
      quantity: 1,
      reason: 'Lot périmé',
    },
  });
  assert.equal(wasteRes.status, 200);
  assert.equal(wasteRes.data.wasteCategory, 'EXPIRED');
});

test('14. Staff Shifts & PIN Time Clock, B2B Proforma Conversion & Multi-Venue Consolidation', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  const token = login.data.token as string;

  // Create Shift
  const shiftRes = await req('/api/restaurant/shifts', {
    method: 'POST',
    token,
    body: {
      userId: 'usr_waiter_1',
      shiftDate: '2026-11-30',
      startTime: '18:00',
      endTime: '23:30',
      notes: 'Service terrasse',
    },
  });
  assert.equal(shiftRes.status, 201);
  const shiftId = shiftRes.data.shift.id as string;

  // Wrong PIN rejected (401)
  const badClock = await req('/api/restaurant/shifts/clock', {
    method: 'POST',
    token,
    body: { userId: 'usr_waiter_1', pin: '9999' },
  });
  assert.equal(badClock.status, 401);

  // Valid PIN clock-in then clock-out
  const clockIn = await req('/api/restaurant/shifts/clock', {
    method: 'POST',
    token,
    body: { userId: 'usr_waiter_1', pin: '1234', notes: 'Prise de poste' },
  });
  assert.equal(clockIn.status, 200);
  assert.equal(clockIn.data.action, 'CLOCK_IN');

  const clockOut = await req('/api/restaurant/shifts/clock', {
    method: 'POST',
    token,
    body: { userId: 'usr_waiter_1', pin: '1234' },
  });
  assert.equal(clockOut.status, 200);
  assert.equal(clockOut.data.action, 'CLOCK_OUT');

  const delShift = await req(`/api/restaurant/shifts/${shiftId}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delShift.status, 200);

  // B2B Proforma -> Convert to Invoice
  const profRes = await req('/api/restaurant/b2b-invoices', {
    method: 'POST',
    token,
    body: {
      docType: 'PROFORMA',
      clientName: 'Mme Touré',
      clientCompany: 'Banque Atlantique CI',
      clientTaxId: 'CI-ABJ-2020-B-1122',
      taxRatePercent: 18,
      items: [
        { description: 'Cocktail dînatoire 50 pax', quantity: 50, unitPriceXof: 12000 },
      ],
    },
  });
  assert.equal(profRes.status, 201);
  assert.equal(profRes.data.document.subtotalHtXof, 600000);
  assert.equal(profRes.data.document.totalTtcXof, 708000);
  const profId = profRes.data.document.id as string;

  const convRes = await req(`/api/restaurant/b2b-invoices/${profId}/convert`, {
    method: 'POST',
    token,
  });
  assert.equal(convRes.status, 201);
  assert.equal(convRes.data.invoice.docType, 'INVOICE');

  // Multi-Venue: create branch -> consolidated overview -> switch venue
  const branchRes = await req('/api/restaurant/venues', {
    method: 'POST',
    token,
    body: {
      name: 'Le Sillage Plateau',
      city: 'Abidjan',
      address: 'Avenue Chardy, Plateau',
    },
  });
  assert.equal(branchRes.status, 201);
  const newVenueId = branchRes.data.venue.restaurantId as string;

  const consolidated = await req('/api/restaurant/venues/consolidated', { token });
  assert.equal(consolidated.status, 200);
  assert.ok(consolidated.data.totals.venuesCount >= 2);

  const switchRes = await req('/api/auth/switch-venue', {
    method: 'POST',
    token,
    body: { restaurantId: newVenueId },
  });
  assert.equal(switchRes.status, 200);
  assert.equal(switchRes.data.user.restaurantId, newVenueId);
});

test('15. Stock units, Kitchen vs Beverage stock separation, scoped inventory & multi-criteria service rating', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'proprietaire@lesillage.ci', password: 'RestoMax2026!' },
  });
  assert.equal(login.status, 200);
  const token = login.data.token as string;

  // 1. Create a Beverage stock with preset unit ('bouteille') and update to custom unit ('bidon 5L')
  const createBev = await req('/api/restaurant/stocks', {
    method: 'POST',
    token,
    body: {
      name: 'Sirop de bissap artisanal',
      unit: 'bouteille',
      stockSection: 'BEVERAGE',
      quantity: 18,
      minThreshold: 5,
      unitCostXof: 2200,
      supplierName: 'Atelier Lagune',
    },
  });
  assert.equal(createBev.status, 201);
  const bevStockId = createBev.data.id as string;
  assert.ok(bevStockId);

  const stocksAfterCreate = await req('/api/restaurant/stocks', { token });
  assert.equal(stocksAfterCreate.status, 200);
  const createdBevItem = (
    stocksAfterCreate.data.stocks as Array<{ id: string; stockSection: string; unit: string }>
  ).find((s) => s.id === bevStockId);
  assert.ok(createdBevItem);
  assert.equal(createdBevItem!.stockSection, 'BEVERAGE');
  assert.equal(createdBevItem!.unit, 'bouteille');

  const updateBev = await req(`/api/restaurant/stocks/${bevStockId}`, {
    method: 'PATCH',
    token,
    body: { unit: 'bidon 5L', stockSection: 'BEVERAGE' },
  });
  assert.equal(updateBev.status, 200);

  const stocksAfterUpdate = await req('/api/restaurant/stocks', { token });
  const updatedBevItem = (
    stocksAfterUpdate.data.stocks as Array<{ id: string; unit: string }>
  ).find((s) => s.id === bevStockId);
  assert.equal(updatedBevItem?.unit, 'bidon 5L');

  // 2. Create a Kitchen stock and verify section-scoped physical inventory count validation
  const createKitchen = await req('/api/restaurant/stocks', {
    method: 'POST',
    token,
    body: {
      name: 'Beurre demi-sel gastronomie',
      unit: 'plaquette',
      stockSection: 'KITCHEN',
      quantity: 12,
      minThreshold: 4,
      unitCostXof: 3500,
      supplierName: 'Fournisseur Frais',
    },
  });
  assert.equal(createKitchen.status, 201);
  const kitchenStockId = createKitchen.data.id as string;

  // Scoped BEVERAGE count rejects a KITCHEN stock line (400)
  const badScopedCount = await req('/api/restaurant/inventory-counts', {
    method: 'POST',
    token,
    body: {
      title: 'Inventaire Boissons Erroné',
      stockSection: 'BEVERAGE',
      lines: [{ stockId: kitchenStockId, countedQty: 10 }],
    },
  });
  assert.equal(badScopedCount.status, 400);

  // Scoped BEVERAGE count succeeds for BEVERAGE stock line
  const goodScopedCount = await req('/api/restaurant/inventory-counts', {
    method: 'POST',
    token,
    body: {
      title: 'Inventaire Bar Soir',
      stockSection: 'BEVERAGE',
      lines: [{ stockId: bevStockId, countedQty: 16 }],
    },
  });
  assert.equal(goodScopedCount.status, 201);
  assert.equal(goodScopedCount.data.count.stockSection, 'BEVERAGE');
  assert.equal(goodScopedCount.data.count.lines[0].stockSection, 'BEVERAGE');

  // 3. QR Menu & Storefront contexts include ratingSummary & QR includes waiters
  const qrCtx = await req('/api/public/qr/sillage-table-01-v1');
  assert.equal(qrCtx.status, 200);
  assert.ok(qrCtx.data.ratingSummary);
  assert.ok(Array.isArray(qrCtx.data.waiters));

  const storeCtx = await req('/api/public/store/le-sillage-lagune');
  assert.equal(storeCtx.status, 200);
  assert.ok(storeCtx.data.ratingSummary);

  // 4. Standalone QR service rating (no order required) + multi-criteria scores + waiterName
  const qrServiceRate = await req('/api/public/qr/sillage-table-01-v1/service-rating', {
    method: 'POST',
    body: {
      serviceRating: 5,
      foodRating: 4,
      speedRating: 5,
      waiterName: 'Moussa Diallo',
      customerName: 'Jean-Marc',
      comment: 'Service irréprochable en terrasse !',
    },
  });
  assert.equal(qrServiceRate.status, 201);
  assert.equal(qrServiceRate.data.review.channel, 'QR_SERVICE');
  assert.equal(qrServiceRate.data.review.waiterName, 'Moussa Diallo');
  assert.equal(qrServiceRate.data.review.serviceRating, 5);

  // 5. Standalone Storefront service rating
  const storeServiceRate = await req('/api/public/store/le-sillage-lagune/service-rating', {
    method: 'POST',
    body: {
      rating: 4,
      serviceRating: 5,
      foodRating: 4,
      speedRating: 4,
      customerName: 'Nadia',
      comment: 'Commande prête à l’heure.',
    },
  });
  assert.equal(storeServiceRate.status, 201);
  assert.equal(storeServiceRate.data.review.channel, 'STOREFRONT_SERVICE');

  // 6. Owner reviews endpoint computes sub-rating averages and waiterStats
  const reviewsRes = await req('/api/restaurant/reviews', { token });
  assert.equal(reviewsRes.status, 200);
  assert.ok(reviewsRes.data.summary.total >= 2);
  assert.ok(reviewsRes.data.summary.avgServiceRating > 0);
  assert.ok(reviewsRes.data.summary.avgFoodRating > 0);
  assert.ok(reviewsRes.data.summary.avgSpeedRating > 0);
  assert.ok(
    (reviewsRes.data.summary.waiterStats as Array<{ waiterName: string }>).some(
      (w) => w.waiterName === 'Moussa Diallo',
    ),
  );
});




