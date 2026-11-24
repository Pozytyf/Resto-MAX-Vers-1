import { getDb, generateId } from '../db.ts';
import { BaseRepository } from './BaseRepository.ts';
import type {
  B2bInvoice,
  CashRegisterSession,
  CustomerReview,
  InventoryCount,
  MenuCombo,
  Promotion,
  StaffShift,
  StaffTimeClock,
  TableCall,
} from '../../types/index.ts';
import { mapPromotionRow } from '../services/pricingEngine.ts';

export class OperationsRepository extends BaseRepository {
  constructor() {
    super({ tableName: 'restaurants', tenantColumn: 'restaurant_id' });
  }

  // ── 1. Combos / Formules ─────────────────────────────────────────────────
  findCombos(rid: string, onlyActive = false): MenuCombo[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM menu_combos
         WHERE restaurant_id = ? ${onlyActive ? 'AND active = 1' : ''}
         ORDER BY is_daily_special DESC, created_at DESC`,
      )
      .all(rid) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      restaurantId: String(r.restaurant_id),
      name: String(r.name),
      description: String(r.description || ''),
      priceXof: Number(r.price_xof),
      imageUrl: r.image_url ? String(r.image_url) : null,
      isDailySpecial: Boolean(r.is_daily_special),
      active: Boolean(r.active),
      items: JSON.parse(String(r.items_json || '[]')),
      createdAt: String(r.created_at),
    }));
  }

  findComboById(id: string, rid: string): MenuCombo | null {
    const db = getDb();
    const r = db
      .prepare('SELECT * FROM menu_combos WHERE id = ? AND restaurant_id = ?')
      .get(id, rid) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      restaurantId: String(r.restaurant_id),
      name: String(r.name),
      description: String(r.description || ''),
      priceXof: Number(r.price_xof),
      imageUrl: r.image_url ? String(r.image_url) : null,
      isDailySpecial: Boolean(r.is_daily_special),
      active: Boolean(r.active),
      items: JSON.parse(String(r.items_json || '[]')),
      createdAt: String(r.created_at),
    };
  }

  createCombo(params: {
    rid: string;
    name: string;
    description: string;
    priceXof: number;
    imageUrl: string | null;
    isDailySpecial: boolean;
    items: Array<{ label: string; quantity: number; menuItemId?: string }>;
  }): string {
    const db = getDb();
    const id = generateId('cmb');
    db.prepare(
      `INSERT INTO menu_combos (
        id, restaurant_id, name, description, price_xof, image_url,
        is_daily_special, items_json, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(
      id,
      params.rid,
      params.name,
      params.description,
      params.priceXof,
      params.imageUrl,
      params.isDailySpecial ? 1 : 0,
      JSON.stringify(params.items),
      new Date().toISOString(),
    );
    return id;
  }

  updateCombo(
    id: string,
    rid: string,
    updates: {
      name?: string;
      description?: string;
      priceXof?: number;
      isDailySpecial?: boolean;
      active?: boolean;
      items?: Array<{ label: string; quantity: number; menuItemId?: string }>;
    },
  ) {
    const db = getDb();
    if (updates.name !== undefined) {
      db.prepare('UPDATE menu_combos SET name = ? WHERE id = ? AND restaurant_id = ?').run(updates.name, id, rid);
    }
    if (updates.description !== undefined) {
      db.prepare('UPDATE menu_combos SET description = ? WHERE id = ? AND restaurant_id = ?').run(updates.description, id, rid);
    }
    if (updates.priceXof !== undefined) {
      db.prepare('UPDATE menu_combos SET price_xof = ? WHERE id = ? AND restaurant_id = ?').run(updates.priceXof, id, rid);
    }
    if (typeof updates.isDailySpecial === 'boolean') {
      db.prepare('UPDATE menu_combos SET is_daily_special = ? WHERE id = ? AND restaurant_id = ?').run(updates.isDailySpecial ? 1 : 0, id, rid);
    }
    if (typeof updates.active === 'boolean') {
      db.prepare('UPDATE menu_combos SET active = ? WHERE id = ? AND restaurant_id = ?').run(updates.active ? 1 : 0, id, rid);
    }
    if (updates.items !== undefined) {
      db.prepare('UPDATE menu_combos SET items_json = ? WHERE id = ? AND restaurant_id = ?').run(JSON.stringify(updates.items), id, rid);
    }
  }

  deleteCombo(id: string, rid: string) {
    const db = getDb();
    return db.prepare('DELETE FROM menu_combos WHERE id = ? AND restaurant_id = ?').run(id, rid).changes;
  }

  // ── 2. Promotions & Happy Hour ───────────────────────────────────────────
  findPromotions(rid: string): Promotion[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM promotions WHERE restaurant_id = ? ORDER BY created_at DESC')
      .all(rid) as Array<Record<string, unknown>>;
    return rows.map(mapPromotionRow);
  }

  createPromotion(params: {
    rid: string;
    name: string;
    code: string | null;
    promoType: 'HAPPY_HOUR' | 'PROMO_CODE';
    discountType: 'PERCENT' | 'FIXED_XOF';
    discountValue: number;
    minOrderXof: number;
    days: number[];
    startTime: string;
    endTime: string;
    categoryId: string | null;
    maxUses: number | null;
  }): string {
    const db = getDb();
    const id = generateId('prm');
    db.prepare(
      `INSERT INTO promotions (
        id, restaurant_id, name, code, promo_type, discount_type, discount_value,
        min_order_xof, days_json, start_time, end_time, category_id, max_uses, uses_count, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
    ).run(
      id,
      params.rid,
      params.name,
      params.code,
      params.promoType,
      params.discountType,
      params.discountValue,
      params.minOrderXof,
      JSON.stringify(params.days),
      params.startTime,
      params.endTime,
      params.categoryId,
      params.maxUses,
      new Date().toISOString(),
    );
    return id;
  }

  updatePromotion(
    id: string,
    rid: string,
    updates: {
      name?: string;
      active?: boolean;
      discountValue?: number;
      startTime?: string;
      endTime?: string;
    },
  ) {
    const db = getDb();
    if (updates.name !== undefined) {
      db.prepare('UPDATE promotions SET name = ? WHERE id = ? AND restaurant_id = ?').run(updates.name, id, rid);
    }
    if (typeof updates.active === 'boolean') {
      db.prepare('UPDATE promotions SET active = ? WHERE id = ? AND restaurant_id = ?').run(updates.active ? 1 : 0, id, rid);
    }
    if (updates.discountValue !== undefined) {
      db.prepare('UPDATE promotions SET discount_value = ? WHERE id = ? AND restaurant_id = ?').run(updates.discountValue, id, rid);
    }
    if (updates.startTime !== undefined) {
      db.prepare('UPDATE promotions SET start_time = ? WHERE id = ? AND restaurant_id = ?').run(updates.startTime, id, rid);
    }
    if (updates.endTime !== undefined) {
      db.prepare('UPDATE promotions SET end_time = ? WHERE id = ? AND restaurant_id = ?').run(updates.endTime, id, rid);
    }
  }

  deletePromotion(id: string, rid: string) {
    const db = getDb();
    return db.prepare('DELETE FROM promotions WHERE id = ? AND restaurant_id = ?').run(id, rid).changes;
  }

  // ── 3. Cash Register & Z-Reports ─────────────────────────────────────────
  private mapRegisterRow(r: Record<string, unknown>): CashRegisterSession {
    return {
      id: String(r.id),
      restaurantId: String(r.restaurant_id),
      zNumber: String(r.z_number || ''),
      openedByUserId: r.opened_by_user_id ? String(r.opened_by_user_id) : null,
      openedByName: String(r.opened_by_name),
      openingFloatXof: Number(r.opening_float_xof || 0),
      openedAt: String(r.opened_at),
      closedByUserId: r.closed_by_user_id ? String(r.closed_by_user_id) : null,
      closedByName: r.closed_by_name ? String(r.closed_by_name) : null,
      closedAt: r.closed_at ? String(r.closed_at) : null,
      status: r.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
      expectedCashXof: Number(r.expected_cash_xof || 0),
      expectedMobileXof: Number(r.expected_mobile_xof || 0),
      expectedCardXof: Number(r.expected_card_xof || 0),
      countedCashXof: Number(r.counted_cash_xof || 0),
      countedMobileXof: Number(r.counted_mobile_xof || 0),
      countedCardXof: Number(r.counted_card_xof || 0),
      varianceXof: Number(r.variance_xof || 0),
      totalSalesXof: Number(r.total_sales_xof || 0),
      refundsXof: Number(r.refunds_xof || 0),
      ordersCount: Number(r.orders_count || 0),
      notes: String(r.notes || ''),
    };
  }

  findOpenRegister(rid: string): CashRegisterSession | null {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT * FROM cash_register_sessions
         WHERE restaurant_id = ? AND status = 'OPEN'
         ORDER BY opened_at DESC LIMIT 1`,
      )
      .get(rid) as Record<string, unknown> | undefined;
    return row ? this.mapRegisterRow(row) : null;
  }

  findClosedRegisters(rid: string, limit = 30): CashRegisterSession[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM cash_register_sessions
         WHERE restaurant_id = ? AND status = 'CLOSED'
         ORDER BY closed_at DESC LIMIT ?`,
      )
      .all(rid, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRegisterRow(r));
  }

  computeRegisterLiveTotals(rid: string, sinceIso: string, openingFloatXof: number) {
    const db = getDb();
    const payRows = db
      .prepare(
        `SELECT method, status, COALESCE(SUM(amount_xof), 0) as total
         FROM payments
         WHERE restaurant_id = ? AND created_at >= ?
         GROUP BY method, status`,
      )
      .all(rid, sinceIso) as Array<{ method: string; status: string; total: number }>;

    let cashSales = 0;
    let mobileSales = 0;
    let cardSales = 0;
    let cashRefunds = 0;
    let totalRefunds = 0;

    for (const row of payRows) {
      const amt = Number(row.total || 0);
      if (row.status === 'REFUNDED') {
        totalRefunds += amt;
        if (row.method === 'CASH') cashRefunds += amt;
        continue;
      }
      if (row.status !== 'PAID') continue;
      if (row.method === 'CASH') cashSales += amt;
      else if (row.method === 'CARD') cardSales += amt;
      else mobileSales += amt;
    }

    const ordersRow = db
      .prepare(
        `SELECT COUNT(*) as c FROM orders
         WHERE restaurant_id = ? AND created_at >= ? AND status != 'CANCELLED'`,
      )
      .get(rid, sinceIso) as { c: number };

    return {
      expectedCashXof: openingFloatXof + cashSales - cashRefunds,
      expectedMobileXof: mobileSales,
      expectedCardXof: cardSales,
      totalSalesXof: cashSales + mobileSales + cardSales,
      refundsXof: totalRefunds,
      ordersCount: Number(ordersRow?.c || 0),
    };
  }

  openRegisterSession(params: {
    rid: string;
    userId: string;
    userName: string;
    openingFloatXof: number;
    notes: string;
  }): CashRegisterSession {
    const db = getDb();
    const id = generateId('reg');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO cash_register_sessions (
        id, restaurant_id, z_number, opened_by_user_id, opened_by_name,
        opening_float_xof, opened_at, status, notes
      ) VALUES (?, ?, '', ?, ?, ?, ?, 'OPEN', ?)`,
    ).run(id, params.rid, params.userId, params.userName, params.openingFloatXof, now, params.notes);
    return this.findOpenRegister(params.rid)!;
  }

  closeRegisterSession(params: {
    id: string;
    rid: string;
    zNumber: string;
    userId: string;
    userName: string;
    expectedCashXof: number;
    expectedMobileXof: number;
    expectedCardXof: number;
    countedCashXof: number;
    countedMobileXof: number;
    countedCardXof: number;
    varianceXof: number;
    totalSalesXof: number;
    refundsXof: number;
    ordersCount: number;
    notes: string;
  }): CashRegisterSession {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE cash_register_sessions
       SET status = 'CLOSED', z_number = ?, closed_by_user_id = ?, closed_by_name = ?,
           closed_at = ?, expected_cash_xof = ?, expected_mobile_xof = ?, expected_card_xof = ?,
           counted_cash_xof = ?, counted_mobile_xof = ?, counted_card_xof = ?,
           variance_xof = ?, total_sales_xof = ?, refunds_xof = ?, orders_count = ?, notes = ?
       WHERE id = ? AND restaurant_id = ?`,
    ).run(
      params.zNumber,
      params.userId,
      params.userName,
      now,
      params.expectedCashXof,
      params.expectedMobileXof,
      params.expectedCardXof,
      params.countedCashXof,
      params.countedMobileXof,
      params.countedCardXof,
      params.varianceXof,
      params.totalSalesXof,
      params.refundsXof,
      params.ordersCount,
      params.notes,
      params.id,
      params.rid,
    );
    const row = db
      .prepare('SELECT * FROM cash_register_sessions WHERE id = ? AND restaurant_id = ?')
      .get(params.id, params.rid) as Record<string, unknown>;
    return this.mapRegisterRow(row);
  }

  // ── 4. Table Calls (Appeler serveur / Addition) ──────────────────────────
  findTableCalls(rid: string): TableCall[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM table_calls
         WHERE restaurant_id = ?
         ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, created_at DESC
         LIMIT 50`,
      )
      .all(rid) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      restaurantId: String(r.restaurant_id),
      tableId: String(r.table_id),
      tableLabel: String(r.table_label),
      callType: r.call_type === 'BILL' ? 'BILL' : 'WAITER',
      note: String(r.note || ''),
      status: r.status === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : 'PENDING',
      acknowledgedByName: r.acknowledged_by_name ? String(r.acknowledged_by_name) : null,
      acknowledgedAt: r.acknowledged_at ? String(r.acknowledged_at) : null,
      createdAt: String(r.created_at),
    }));
  }

  acknowledgeTableCall(id: string, rid: string, userName: string) {
    const db = getDb();
    const now = new Date().toISOString();
    return db
      .prepare(
        `UPDATE table_calls
         SET status = 'ACKNOWLEDGED', acknowledged_by_name = ?, acknowledged_at = ?
         WHERE id = ? AND restaurant_id = ?`,
      )
      .run(userName, now, id, rid).changes;
  }

  // ── 5. Loyalty History & Adjustment ──────────────────────────────────────
  findLoyaltyTransactions(rid: string, customerId: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, restaurant_id as restaurantId, customer_id as customerId,
                order_id as orderId, points_delta as pointsDelta, reason, created_at as createdAt
         FROM loyalty_transactions
         WHERE restaurant_id = ? AND customer_id = ?
         ORDER BY created_at DESC LIMIT 50`,
      )
      .all(rid, customerId);
  }

  // ── 6. Customer Reviews ──────────────────────────────────────────────────
  findCustomerReviews(rid: string): CustomerReview[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM customer_reviews
         WHERE restaurant_id = ?
         ORDER BY created_at DESC LIMIT 100`,
      )
      .all(rid) as Array<Record<string, unknown>>;
    return rows.map((r) => {
      const rating = Number(r.rating);
      return {
        id: String(r.id),
        restaurantId: String(r.restaurant_id),
        orderId: r.order_id ? String(r.order_id) : null,
        orderNumber: String(r.order_number || ''),
        tableLabel: String(r.table_label || ''),
        customerName: String(r.customer_name || 'Client'),
        rating,
        serviceRating: Number(r.service_rating || rating),
        foodRating: Number(r.food_rating || rating),
        speedRating: Number(r.speed_rating || rating),
        waiterName: String(r.waiter_name || ''),
        channel: String(r.channel || 'QR_ORDER'),
        comment: String(r.comment || ''),
        reply: String(r.reply || ''),
        createdAt: String(r.created_at),
      };
    });
  }

  replyToReview(id: string, rid: string, reply: string) {
    const db = getDb();
    return db
      .prepare('UPDATE customer_reviews SET reply = ? WHERE id = ? AND restaurant_id = ?')
      .run(reply, id, rid).changes;
  }

  // ── 7. Inventory Counts & Waste ──────────────────────────────────────────
  findInventoryCounts(rid: string): InventoryCount[] {
    const db = getDb();
    const headers = db
      .prepare(
        `SELECT * FROM inventory_counts WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 30`,
      )
      .all(rid) as Array<Record<string, unknown>>;

    const getLines = db.prepare(
      `SELECT l.id, l.inventory_count_id as inventoryCountId, l.stock_id as stockId,
              l.stock_name as stockName, COALESCE(s.stock_section, 'KITCHEN') as stockSection,
              l.unit, l.expected_qty as expectedQty,
              l.counted_qty as countedQty, l.variance_qty as varianceQty,
              l.unit_cost_xof as unitCostXof, l.variance_xof as varianceXof
       FROM inventory_count_lines l
       LEFT JOIN stocks s ON s.id = l.stock_id
       WHERE l.inventory_count_id = ?
       ORDER BY l.stock_name ASC`,
    );

    return headers.map((h) => ({
      id: String(h.id),
      restaurantId: String(h.restaurant_id),
      title: String(h.title),
      stockSection:
        h.stock_section === 'KITCHEN' || h.stock_section === 'BEVERAGE'
          ? h.stock_section
          : 'ALL',
      status: 'VALIDATED',
      notes: String(h.notes || ''),
      totalVarianceXof: Number(h.total_variance_xof || 0),
      createdByName: String(h.created_by_name || ''),
      validatedAt: h.validated_at ? String(h.validated_at) : null,
      createdAt: String(h.created_at),
      lines: getLines.all(String(h.id)) as InventoryCount['lines'],
    }));
  }

  // ── 8. Staff Shifts & PIN Time Clock ─────────────────────────────────────
  findStaffShifts(rid: string): StaffShift[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, restaurant_id as restaurantId, user_id as userId,
                staff_name as staffName, role, shift_date as shiftDate,
                start_time as startTime, end_time as endTime, notes, created_at as createdAt
         FROM staff_shifts WHERE restaurant_id = ?
         ORDER BY shift_date DESC, start_time ASC LIMIT 120`,
      )
      .all(rid) as StaffShift[];
  }

  findStaffTimeClocks(rid: string): StaffTimeClock[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, restaurant_id as restaurantId, user_id as userId,
                staff_name as staffName, role, clock_in_at as clockInAt,
                clock_out_at as clockOutAt, duration_minutes as durationMinutes, notes
         FROM staff_time_clocks WHERE restaurant_id = ?
         ORDER BY clock_in_at DESC LIMIT 120`,
      )
      .all(rid) as StaffTimeClock[];
  }

  // ── 9. B2B Proforma & Invoices ───────────────────────────────────────────
  findB2bInvoices(rid: string): B2bInvoice[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM b2b_invoices WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 100`,
      )
      .all(rid) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      restaurantId: String(r.restaurant_id),
      invoiceNumber: String(r.invoice_number),
      docType: r.doc_type === 'INVOICE' ? 'INVOICE' : 'PROFORMA',
      clientName: String(r.client_name),
      clientCompany: String(r.client_company || ''),
      clientTaxId: String(r.client_tax_id || ''),
      clientEmail: String(r.client_email || ''),
      clientPhone: String(r.client_phone || ''),
      clientAddress: String(r.client_address || ''),
      items: JSON.parse(String(r.items_json || '[]')),
      subtotalHtXof: Number(r.subtotal_ht_xof || 0),
      taxRatePercent: Number(r.tax_rate_percent || 18),
      taxXof: Number(r.tax_xof || 0),
      totalTtcXof: Number(r.total_ttc_xof || 0),
      status: String(r.status || 'DRAFT') as B2bInvoice['status'],
      dueDate: r.due_date ? String(r.due_date) : null,
      notes: String(r.notes || ''),
      createdAt: String(r.created_at),
    }));
  }
}

export const operationsRepository = new OperationsRepository();
