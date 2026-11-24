import { getDb, generateId } from '../db.ts';
import { BaseRepository } from './BaseRepository.ts';
import type { Permission, Role } from '../../types/index.ts';

export class RestaurantRepository extends BaseRepository {
  constructor() {
    super({ tableName: 'restaurants', tenantColumn: 'restaurant_id' });
  }

  getDashboardMetrics(rid: string) {
    this.requireTenantId(rid);
    const db = this.db;
    const revenueRow = db
      .prepare(
        `SELECT COALESCE(SUM(total_xof), 0) as total_revenue,
                COUNT(*) as orders_count,
                COALESCE(AVG(total_xof), 0) as avg_basket
         FROM orders
         WHERE restaurant_id = ? AND status != 'CANCELLED'`,
      )
      .get(rid) as {
      total_revenue: number;
      orders_count: number;
      avg_basket: number;
    };

    const pendingRow = db
      .prepare(
        `SELECT COUNT(*) as c FROM orders
         WHERE restaurant_id = ? AND status IN ('PENDING', 'IN_PREPARATION', 'READY')`,
      )
      .get(rid) as { c: number };

    const tablesStats = db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END) as occupied,
                SUM(CASE WHEN status = 'RESERVED' THEN 1 ELSE 0 END) as reserved
         FROM dining_tables WHERE restaurant_id = ?`,
      )
      .get(rid) as { total: number; occupied: number; reserved: number };

    const revenueSeries = db
      .prepare(
        `SELECT substr(created_at, 1, 10) as day,
                COALESCE(SUM(total_xof), 0) as revenue_xof,
                COUNT(*) as orders
         FROM orders
         WHERE restaurant_id = ? AND status != 'CANCELLED'
         GROUP BY substr(created_at, 1, 10)
         ORDER BY day ASC
         LIMIT 14`,
      )
      .all(rid);

    const topItems = db
      .prepare(
        `SELECT oi.name, SUM(oi.quantity) as qty, SUM(oi.line_total_xof) as revenue_xof
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.restaurant_id = ? AND o.status != 'CANCELLED'
         GROUP BY oi.name
         ORDER BY revenue_xof DESC
         LIMIT 5`,
      )
      .all(rid);

    const lowStocks = db
      .prepare(
        `SELECT id, name, unit, quantity, min_threshold, supplier_name
         FROM stocks
         WHERE restaurant_id = ? AND quantity <= min_threshold
         ORDER BY (quantity - min_threshold) ASC`,
      )
      .all(rid);

    const paymentBreakdown = db
      .prepare(
        `SELECT method, COALESCE(SUM(amount_xof), 0) as total_xof, COUNT(*) as count
         FROM payments
         WHERE restaurant_id = ? AND status = 'PAID'
         GROUP BY method`,
      )
      .all(rid);

    const recentOrders = db
      .prepare(
        `SELECT o.id, o.order_number, o.order_type, o.customer_name, o.status,
                o.total_xof, o.paid_xof, o.created_at, t.label as table_label
         FROM orders o
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.restaurant_id = ?
         ORDER BY o.created_at DESC
         LIMIT 6`,
      )
      .all(rid);

    const staffActivity = db
      .prepare(
        `SELECT actor_email, actor_role, action, details, created_at
         FROM audit_logs
         WHERE restaurant_id = ?
         ORDER BY created_at DESC
         LIMIT 6`,
      )
      .all(rid);

    const expensesRow = db
      .prepare(
        `SELECT COALESCE(SUM(amount_xof), 0) as total_expenses
         FROM expenses WHERE restaurant_id = ?`,
      )
      .get(rid) as { total_expenses: number };

    const collectedRow = db
      .prepare(
        `SELECT COALESCE(SUM(amount_xof), 0) as total_paid
         FROM payments WHERE restaurant_id = ? AND status = 'PAID'`,
      )
      .get(rid) as { total_paid: number };

    return {
      revenueRow,
      pendingRow,
      tablesStats,
      revenueSeries,
      topItems,
      lowStocks,
      paymentBreakdown,
      recentOrders,
      staffActivity,
      expensesRow,
      collectedRow,
    };
  }

  findMenuCategories(rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, restaurant_id as restaurantId, name, station, sort_order as sortOrder, active
         FROM menu_categories WHERE restaurant_id = ? ORDER BY sort_order ASC`,
      )
      .all(rid) as Array<Record<string, unknown>>;
  }

  findMenuItems(rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT m.id, m.restaurant_id as restaurantId, m.category_id as categoryId,
                c.name as categoryName, c.station,
                m.name, m.description, m.price_xof as priceXof, m.cost_price_xof as costPriceXof,
                m.image_url as imageUrl, m.available, m.sort_order as sortOrder,
                m.options_json, COALESCE(m.option_groups_json, '[]') as option_groups_json
         FROM menu_items m
         JOIN menu_categories c ON c.id = m.category_id
         WHERE m.restaurant_id = ?
         ORDER BY m.sort_order ASC, m.name ASC`,
      )
      .all(rid) as Array<Record<string, unknown>>;
  }

  countCategories(rid: string): number {
    const db = getDb();
    return (
      db
        .prepare('SELECT COUNT(*) as c FROM menu_categories WHERE restaurant_id = ?')
        .get(rid) as { c: number }
    ).c;
  }

  createCategory(rid: string, name: string, station: string, sortOrder: number) {
    const db = getDb();
    const id = generateId('cat');
    db.prepare(
      `INSERT INTO menu_categories (id, restaurant_id, name, station, sort_order, active)
       VALUES (?, ?, ?, ?, ?, 1)`,
    ).run(id, rid, name, station, sortOrder);
    return id;
  }

  findCategory(categoryId: string, rid: string) {
    const db = getDb();
    return db
      .prepare('SELECT id, name, station, sort_order as sortOrder, active FROM menu_categories WHERE id = ? AND restaurant_id = ?')
      .get(categoryId, rid) as
      | { id: string; name: string; station: string; sortOrder: number; active: number }
      | undefined;
  }

  updateCategory(
    categoryId: string,
    rid: string,
    updates: {
      name?: string;
      station?: string;
      sortOrder?: number;
      active?: boolean;
    },
  ) {
    const db = getDb();
    if (updates.name !== undefined) {
      db.prepare('UPDATE menu_categories SET name = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.name,
        categoryId,
        rid,
      );
    }
    if (updates.station !== undefined) {
      db.prepare('UPDATE menu_categories SET station = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.station,
        categoryId,
        rid,
      );
    }
    if (updates.sortOrder !== undefined) {
      db.prepare('UPDATE menu_categories SET sort_order = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.sortOrder,
        categoryId,
        rid,
      );
    }
    if (typeof updates.active === 'boolean') {
      db.prepare('UPDATE menu_categories SET active = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.active ? 1 : 0,
        categoryId,
        rid,
      );
    }
  }

  countItemsInCategory(categoryId: string, rid: string): number {
    const db = getDb();
    return (
      db
        .prepare('SELECT COUNT(*) as c FROM menu_items WHERE category_id = ? AND restaurant_id = ?')
        .get(categoryId, rid) as { c: number }
    ).c;
  }

  deleteCategory(categoryId: string, rid: string) {
    const db = getDb();
    db.prepare('DELETE FROM menu_categories WHERE id = ? AND restaurant_id = ?').run(categoryId, rid);
  }

  createMenuItem(params: {
    rid: string;
    categoryId: string;
    name: string;
    description: string;
    priceXof: number;
    costPriceXof: number;
    imageUrl: string | null;
    available: boolean;
    sortOrder: number;
    optionsJson: string;
    optionGroupsJson?: string;
  }) {
    const db = getDb();
    const id = generateId('itm');
    db.prepare(
      `INSERT INTO menu_items (
        id, restaurant_id, category_id, name, description, price_xof, cost_price_xof,
        image_url, available, sort_order, options_json, option_groups_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.rid,
      params.categoryId,
      params.name,
      params.description,
      params.priceXof,
      params.costPriceXof,
      params.imageUrl,
      params.available ? 1 : 0,
      params.sortOrder,
      params.optionsJson,
      params.optionGroupsJson || '[]',
      new Date().toISOString(),
    );
    return id;
  }

  findMenuItemById(itemId: string, rid: string) {
    const db = getDb();
    return db
      .prepare('SELECT id, name FROM menu_items WHERE id = ? AND restaurant_id = ?')
      .get(itemId, rid) as { id: string; name: string } | undefined;
  }

  countOrderReferencesForMenuItem(itemId: string): number {
    const db = getDb();
    return (
      db
        .prepare('SELECT COUNT(*) as c FROM order_items WHERE menu_item_id = ?')
        .get(itemId) as { c: number }
    ).c;
  }

  deleteMenuItem(itemId: string, rid: string) {
    const db = getDb();
    db.prepare('DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?').run(itemId, rid);
  }

  updateMenuItem(
    itemId: string,
    rid: string,
    updates: {
      categoryId?: string;
      available?: boolean;
      priceXof?: number;
      costPriceXof?: number;
      name?: string;
      description?: string;
      imageUrl?: string | null;
      sortOrder?: number;
      optionsJson?: string;
      optionGroupsJson?: string;
    },
  ) {
    const db = getDb();
    if (updates.categoryId !== undefined) {
      db.prepare(
        'UPDATE menu_items SET category_id = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.categoryId, itemId, rid);
    }
    if (typeof updates.available === 'boolean') {
      db.prepare(
        'UPDATE menu_items SET available = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.available ? 1 : 0, itemId, rid);
    }
    if (updates.priceXof !== undefined) {
      db.prepare(
        'UPDATE menu_items SET price_xof = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.priceXof, itemId, rid);
    }
    if (updates.costPriceXof !== undefined) {
      db.prepare(
        'UPDATE menu_items SET cost_price_xof = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.costPriceXof, itemId, rid);
    }
    if (updates.name !== undefined) {
      db.prepare(
        'UPDATE menu_items SET name = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.name, itemId, rid);
    }
    if (updates.description !== undefined) {
      db.prepare(
        'UPDATE menu_items SET description = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.description, itemId, rid);
    }
    if (updates.imageUrl !== undefined) {
      db.prepare(
        'UPDATE menu_items SET image_url = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.imageUrl, itemId, rid);
    }
    if (updates.sortOrder !== undefined) {
      db.prepare(
        'UPDATE menu_items SET sort_order = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.sortOrder, itemId, rid);
    }
    if (updates.optionsJson !== undefined) {
      db.prepare(
        'UPDATE menu_items SET options_json = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.optionsJson, itemId, rid);
    }
    if (updates.optionGroupsJson !== undefined) {
      db.prepare(
        'UPDATE menu_items SET option_groups_json = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.optionGroupsJson, itemId, rid);
    }
  }

  findMenuRecipes(rid: string, menuItemId?: string) {
    const db = getDb();
    const sql = `
      SELECT r.id, r.menu_item_id as menuItemId, r.stock_id as stockId,
             r.quantity_per_unit as quantityPerUnit,
             s.name as stockName, s.unit, s.unit_cost_xof as unitCostXof,
             s.quantity as currentStockQty
      FROM menu_item_recipes r
      JOIN stocks s ON s.id = r.stock_id
      WHERE r.restaurant_id = ?
      ${menuItemId ? 'AND r.menu_item_id = ?' : ''}
      ORDER BY s.name ASC
    `;
    const rows = (
      menuItemId
        ? db.prepare(sql).all(rid, menuItemId)
        : db.prepare(sql).all(rid)
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      menuItemId: String(row.menuItemId),
      stockId: String(row.stockId),
      stockName: String(row.stockName),
      unit: String(row.unit),
      quantityPerUnit: Number(row.quantityPerUnit),
      unitCostXof: Number(row.unitCostXof || 0),
      currentStockQty: Number(row.currentStockQty || 0),
    }));
  }

  replaceMenuItemRecipe(
    rid: string,
    menuItemId: string,
    lines: Array<{ stockId: string; quantityPerUnit: number }>,
  ) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      'DELETE FROM menu_item_recipes WHERE restaurant_id = ? AND menu_item_id = ?',
    ).run(rid, menuItemId);

    const ins = db.prepare(
      `INSERT INTO menu_item_recipes (
        id, restaurant_id, menu_item_id, stock_id, quantity_per_unit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    let computedCostXof = 0;
    for (const line of lines) {
      const stock = this.findStockById(line.stockId, rid);
      if (!stock) {
        continue;
      }
      ins.run(
        generateId('rec'),
        rid,
        menuItemId,
        line.stockId,
        line.quantityPerUnit,
        now,
        now,
      );
      const costRow = db
        .prepare('SELECT unit_cost_xof FROM stocks WHERE id = ?')
        .get(line.stockId) as { unit_cost_xof: number } | undefined;
      computedCostXof += Number(costRow?.unit_cost_xof || 0) * line.quantityPerUnit;
    }

    if (lines.length > 0 && computedCostXof > 0) {
      db.prepare(
        'UPDATE menu_items SET cost_price_xof = ? WHERE id = ? AND restaurant_id = ?',
      ).run(Math.round(computedCostXof), menuItemId, rid);
    }

    return this.findMenuRecipes(rid, menuItemId);
  }

  deductStocksForOrderItems(params: {
    rid: string;
    orderNumber: string;
    items: Array<{ menuItemId: string; quantity: number }>;
    userId: string | null;
    now: string;
  }) {
    const db = getDb();
    const qtyByMenuItem = new Map<string, number>();
    for (const it of params.items) {
      qtyByMenuItem.set(
        it.menuItemId,
        (qtyByMenuItem.get(it.menuItemId) || 0) + Number(it.quantity || 0),
      );
    }

    const deductionByStock = new Map<string, number>();
    const findRecipeStmt = db.prepare(
      'SELECT stock_id, quantity_per_unit FROM menu_item_recipes WHERE restaurant_id = ? AND menu_item_id = ?',
    );

    for (const [menuItemId, orderedQty] of qtyByMenuItem.entries()) {
      if (orderedQty <= 0) continue;
      const recipeRows = findRecipeStmt.all(params.rid, menuItemId) as Array<{
        stock_id: string;
        quantity_per_unit: number;
      }>;
      for (const rec of recipeRows) {
        const amount = Number(rec.quantity_per_unit) * orderedQty;
        if (amount > 0) {
          deductionByStock.set(
            rec.stock_id,
            (deductionByStock.get(rec.stock_id) || 0) + amount,
          );
        }
      }
    }

    const lowStocksTriggered: Array<{
      id: string;
      name: string;
      quantity: number;
      minThreshold: number;
      unit: string;
      supplierName: string;
    }> = [];

    const updateStockStmt = db.prepare(
      'UPDATE stocks SET quantity = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?',
    );
    const insertMoveStmt = db.prepare(
      `INSERT INTO stock_movements (id, restaurant_id, stock_id, movement_type, quantity_delta, reason, created_by_user_id, created_at)
       VALUES (?, ?, ?, 'AUTO_ORDER', ?, ?, ?, ?)`,
    );

    for (const [stockId, rawDeduct] of deductionByStock.entries()) {
      const stock = this.findStockById(stockId, params.rid);
      if (!stock) continue;
      const deduct = Math.round(rawDeduct * 1000) / 1000;
      const nextQty = Math.max(
        0,
        Math.round((Number(stock.quantity) - deduct) * 1000) / 1000,
      );
      updateStockStmt.run(nextQty, params.now, stockId, params.rid);
      insertMoveStmt.run(
        generateId('smv'),
        params.rid,
        stockId,
        -deduct,
        `Déduction auto · ${params.orderNumber}`,
        params.userId,
        params.now,
      );

      if (nextQty <= Number(stock.min_threshold) && nextQty !== Number(stock.quantity)) {
        lowStocksTriggered.push({
          id: stock.id,
          name: stock.name,
          quantity: nextQty,
          minThreshold: Number(stock.min_threshold),
          unit: stock.unit,
          supplierName: stock.supplier_name,
        });
      }
    }

    return {
      deductedCount: deductionByStock.size,
      lowStocksTriggered,
    };
  }

  findOrdersWithItems(rid: string) {
    const db = getDb();
    const orders = db
      .prepare(
        `SELECT o.id, o.restaurant_id as restaurantId, o.order_number as orderNumber,
                o.order_type as orderType, o.table_id as tableId, t.label as tableLabel,
                t.zone as tableZone,
                o.customer_name as customerName,
                COALESCE(o.customer_phone, '') as customerPhone,
                COALESCE(o.delivery_address, '') as deliveryAddress,
                COALESCE(o.delivery_zone, '') as deliveryZone,
                COALESCE(o.delivery_fee_xof, 0) as deliveryFeeXof,
                COALESCE(o.scheduled_slot, '') as scheduledSlot,
                COALESCE(o.promo_code, '') as promoCode,
                COALESCE(o.loyalty_points_used, 0) as loyaltyPointsUsed,
                COALESCE(o.loyalty_points_earned, 0) as loyaltyPointsEarned,
                o.status, o.subtotal_xof as subtotalXof,
                o.discount_xof as discountXof, o.tax_xof as taxXof, o.total_xof as totalXof,
                o.paid_xof as paidXof, o.notes, o.created_by_user_id as createdByUserId,
                o.created_at as createdAt, o.updated_at as updatedAt
         FROM orders o
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.restaurant_id = ?
         ORDER BY o.created_at DESC
         LIMIT 100`,
      )
      .all(rid) as Array<Record<string, unknown>>;

    const getLines = db.prepare(
      `SELECT id, order_id as orderId, menu_item_id as menuItemId, name, station,
              unit_price_xof as unitPriceXof, options_summary as optionsSummary,
              options_delta_xof as optionsDeltaXof, quantity, line_total_xof as lineTotalXof,
              notes, prep_status as prepStatus
       FROM order_items WHERE order_id = ?`,
    );

    return orders.map((o) => ({
      ...o,
      items: getLines.all(String(o.id)),
    }));
  }

  findOrderByIdempotencyKey(rid: string, key: string) {
    const db = getDb();
    return db
      .prepare(
        'SELECT id, order_number, total_xof FROM orders WHERE restaurant_id = ? AND idempotency_key = ?',
      )
      .get(rid, key);
  }

  findRestaurantTaxAndMode(rid: string) {
    const db = getDb();
    return db
      .prepare('SELECT tax_rate_percent, paydunya_mode FROM restaurants WHERE id = ?')
      .get(rid) as { tax_rate_percent: number; paydunya_mode: string };
  }

  findTableById(tableId: string, rid: string) {
    const db = getDb();
    return db
      .prepare('SELECT id, label FROM dining_tables WHERE id = ? AND restaurant_id = ?')
      .get(tableId, rid) as { id: string; label: string } | undefined;
  }

  countOrders(rid: string): number {
    const db = getDb();
    return (
      db
        .prepare('SELECT COUNT(*) as c FROM orders WHERE restaurant_id = ?')
        .get(rid) as { c: number }
    ).c;
  }

  findMenuItemWithStation(menuItemId: string, rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT m.id, m.category_id, m.name, m.price_xof, m.available, m.options_json,
                COALESCE(m.option_groups_json, '[]') as option_groups_json, c.station
         FROM menu_items m
         JOIN menu_categories c ON c.id = m.category_id
         WHERE m.id = ? AND m.restaurant_id = ?`,
      )
      .get(menuItemId, rid) as Record<string, unknown> | undefined;
  }

  insertPosOrder(params: {
    orderId: string;
    rid: string;
    orderNumber: string;
    orderType: string;
    tableId: string | null;
    customerName: string;
    customerPhone?: string;
    deliveryAddress?: string;
    deliveryZone?: string;
    deliveryFeeXof?: number;
    scheduledSlot?: string;
    promoCode?: string;
    loyaltyPointsUsed?: number;
    subtotalXof: number;
    discountXof: number;
    taxXof: number;
    totalXof: number;
    notes: string;
    idempotencyKey: string | null;
    userId: string;
    now: string;
    lines: Array<{
      id: string;
      menuItemId: string;
      name: string;
      station: string;
      unitPriceXof: number;
      optionsSummary: string;
      optionsDeltaXof: number;
      quantity: number;
      lineTotalXof: number;
      notes: string;
    }>;
  }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO orders (
        id, restaurant_id, order_number, order_type, table_id, customer_name,
        customer_phone, delivery_address, delivery_zone, delivery_fee_xof,
        scheduled_slot, promo_code, loyalty_points_used,
        status, subtotal_xof, discount_xof, tax_xof, total_xof, paid_xof,
        notes, idempotency_key, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    ).run(
      params.orderId,
      params.rid,
      params.orderNumber,
      params.orderType,
      params.tableId,
      params.customerName,
      params.customerPhone || '',
      params.deliveryAddress || '',
      params.deliveryZone || '',
      params.deliveryFeeXof || 0,
      params.scheduledSlot || '',
      params.promoCode || '',
      params.loyaltyPointsUsed || 0,
      params.subtotalXof,
      params.discountXof,
      params.taxXof,
      params.totalXof,
      params.notes,
      params.idempotencyKey,
      params.userId,
      params.now,
      params.now,
    );

    const insLine = db.prepare(
      `INSERT INTO order_items (
        id, order_id, menu_item_id, name, station, unit_price_xof,
        options_summary, options_delta_xof, quantity, line_total_xof, notes, prep_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    );
    for (const l of params.lines) {
      insLine.run(
        l.id,
        params.orderId,
        l.menuItemId,
        l.name,
        l.station,
        l.unitPriceXof,
        l.optionsSummary,
        l.optionsDeltaXof,
        l.quantity,
        l.lineTotalXof,
        l.notes,
      );
    }

    if (params.tableId) {
      db.prepare(
        `UPDATE dining_tables SET status = 'OCCUPIED' WHERE id = ? AND restaurant_id = ?`,
      ).run(params.tableId, params.rid);
    }
  }

  findOrderForUpdate(orderId: string, rid: string) {
    const db = getDb();
    return db
      .prepare(
        'SELECT id, table_id, total_xof, paid_xof, status FROM orders WHERE id = ? AND restaurant_id = ?',
      )
      .get(orderId, rid) as
      | {
          id: string;
          table_id: string | null;
          total_xof: number;
          paid_xof: number;
          status: string;
        }
      | undefined;
  }

  updateOrderAndPrepStatus(
    orderId: string,
    rid: string,
    status: string,
    tableId: string | null,
  ) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?',
    ).run(status, now, orderId, rid);

    if (status === 'IN_PREPARATION') {
      db.prepare(
        `UPDATE order_items SET prep_status = 'PREPARING' WHERE order_id = ? AND prep_status = 'PENDING'`,
      ).run(orderId);
    } else if (status === 'READY') {
      db.prepare(`UPDATE order_items SET prep_status = 'READY' WHERE order_id = ?`).run(
        orderId,
      );
    } else if (status === 'SERVED') {
      db.prepare(`UPDATE order_items SET prep_status = 'SERVED' WHERE order_id = ?`).run(
        orderId,
      );
    } else if (status === 'CANCELLED' && tableId) {
      db.prepare(
        `UPDATE dining_tables SET status = 'AVAILABLE' WHERE id = ? AND restaurant_id = ?`,
      ).run(tableId, rid);
    }
  }

  findPayments(rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT p.id, p.restaurant_id as restaurantId, p.order_id as orderId,
                o.order_number as orderNumber, p.amount_xof as amountXof,
                p.method, p.status, p.mode, p.reference, p.created_at as createdAt
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE p.restaurant_id = ?
         ORDER BY p.created_at DESC
         LIMIT 100`,
      )
      .all(rid);
  }

  findPaymentByIdempotencyKey(rid: string, key: string) {
    const db = getDb();
    return db
      .prepare(
        'SELECT id, reference, amount_xof FROM payments WHERE restaurant_id = ? AND idempotency_key = ?',
      )
      .get(rid, key);
  }

  insertPaymentAndSettleOrder(params: {
    paymentId: string;
    rid: string;
    orderId: string;
    amountXof: number;
    method: string;
    mode: string;
    reference: string;
    idempotencyKey: string | null;
    userId: string;
    newPaid: number;
    fullyPaid: boolean;
    tableId: string | null;
    now: string;
  }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO payments (
        id, restaurant_id, order_id, amount_xof, method, status, mode,
        reference, idempotency_key, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?, ?, ?, ?)`,
    ).run(
      params.paymentId,
      params.rid,
      params.orderId,
      params.amountXof,
      params.method,
      params.mode,
      params.reference,
      params.idempotencyKey,
      params.userId,
      params.now,
    );

    db.prepare(
      `UPDATE orders
       SET paid_xof = ?, status = CASE WHEN ? THEN 'PAID' ELSE status END, updated_at = ?
       WHERE id = ? AND restaurant_id = ?`,
    ).run(
      params.newPaid,
      params.fullyPaid ? 1 : 0,
      params.now,
      params.orderId,
      params.rid,
    );

    if (params.fullyPaid && params.tableId) {
      db.prepare(
        `UPDATE dining_tables SET status = 'AVAILABLE' WHERE id = ? AND restaurant_id = ?`,
      ).run(params.tableId, params.rid);
    }
  }

  findPaymentForRefund(paymentId: string, rid: string) {
    const db = getDb();
    return db
      .prepare(
        'SELECT id, order_id, amount_xof, status FROM payments WHERE id = ? AND restaurant_id = ?',
      )
      .get(paymentId, rid) as
      | { id: string; order_id: string; amount_xof: number; status: string }
      | undefined;
  }

  markPaymentRefunded(paymentId: string, rid: string, orderId: string, amountXof: number) {
    const db = getDb();
    db.prepare(
      `UPDATE payments SET status = 'REFUNDED' WHERE id = ? AND restaurant_id = ?`,
    ).run(paymentId, rid);

    db.prepare(
      `UPDATE orders SET paid_xof = MAX(0, paid_xof - ?), status = 'SERVED', updated_at = ? WHERE id = ? AND restaurant_id = ?`,
    ).run(amountXof, new Date().toISOString(), orderId, rid);
  }

  findTablesWithQrAndActiveOrder(rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT t.id, t.restaurant_id as restaurantId, t.zone, t.label, t.capacity, t.status,
                t.pos_x as posX, t.pos_y as posY, t.shape,
                q.token as qrToken, q.version as qrVersion, q.status as qrStatus,
                (SELECT id FROM orders o WHERE o.table_id = t.id AND o.restaurant_id = t.restaurant_id AND o.status NOT IN ('PAID', 'CANCELLED') ORDER BY o.created_at DESC LIMIT 1) as activeOrderId,
                (SELECT total_xof FROM orders o WHERE o.table_id = t.id AND o.restaurant_id = t.restaurant_id AND o.status NOT IN ('PAID', 'CANCELLED') ORDER BY o.created_at DESC LIMIT 1) as activeOrderTotalXof
         FROM dining_tables t
         LEFT JOIN qr_codes q ON q.table_id = t.id AND q.status = 'ACTIVE'
         WHERE t.restaurant_id = ?
         ORDER BY t.zone ASC, t.label ASC`,
      )
      .all(rid);
  }

  createTableWithQr(
    rid: string,
    zone: string,
    label: string,
    capacity: number,
    posX?: number,
    posY?: number,
    shape: 'ROUND' | 'RECT' = 'ROUND',
  ) {
    const db = getDb();
    const tableId = generateId('tbl');
    const qrToken = `${rid.slice(-6)}-${generateId('q').slice(-8)}-v1`;
    const now = new Date().toISOString();
    const countRow = db
      .prepare('SELECT COUNT(*) as c FROM dining_tables WHERE restaurant_id = ?')
      .get(rid) as { c: number };
    const idx = Number(countRow?.c || 0);
    const defaultX = 60 + (idx % 4) * 180;
    const defaultY = 60 + Math.floor(idx / 4) * 150;

    db.prepare(
      `INSERT INTO dining_tables (id, restaurant_id, zone, label, capacity, status, pos_x, pos_y, shape)
       VALUES (?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?)`,
    ).run(
      tableId,
      rid,
      zone,
      label,
      capacity,
      posX ?? defaultX,
      posY ?? defaultY,
      shape,
    );

    db.prepare(
      `INSERT INTO qr_codes (id, restaurant_id, table_id, token, version, status, created_at)
       VALUES (?, ?, ?, ?, 1, 'ACTIVE', ?)`,
    ).run(generateId('qr'), rid, tableId, qrToken, now);

    return { tableId, qrToken };
  }

  updateTable(
    tableId: string,
    rid: string,
    updates: {
      zone?: string;
      label?: string;
      capacity?: number;
      status?: string;
      posX?: number;
      posY?: number;
      shape?: 'ROUND' | 'RECT';
    },
  ) {
    const db = getDb();
    if (updates.zone !== undefined) {
      db.prepare('UPDATE dining_tables SET zone = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.zone,
        tableId,
        rid,
      );
    }
    if (updates.label !== undefined) {
      db.prepare('UPDATE dining_tables SET label = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.label,
        tableId,
        rid,
      );
    }
    if (updates.capacity !== undefined) {
      db.prepare('UPDATE dining_tables SET capacity = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.capacity,
        tableId,
        rid,
      );
    }
    if (updates.status !== undefined) {
      db.prepare('UPDATE dining_tables SET status = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.status,
        tableId,
        rid,
      );
    }
    if (updates.posX !== undefined && updates.posY !== undefined) {
      db.prepare(
        'UPDATE dining_tables SET pos_x = ?, pos_y = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.posX, updates.posY, tableId, rid);
    }
    if (updates.shape !== undefined) {
      db.prepare('UPDATE dining_tables SET shape = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.shape,
        tableId,
        rid,
      );
    }
  }

  findActiveOrdersForTable(tableId: string, rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, order_number, subtotal_xof, discount_xof, tax_xof, total_xof, paid_xof, notes, status
         FROM orders
         WHERE table_id = ? AND restaurant_id = ? AND status NOT IN ('PAID', 'CANCELLED')
         ORDER BY created_at ASC`,
      )
      .all(tableId, rid) as Array<{
      id: string;
      order_number: string;
      subtotal_xof: number;
      discount_xof: number;
      tax_xof: number;
      total_xof: number;
      paid_xof: number;
      notes: string;
      status: string;
    }>;
  }

  deleteTable(tableId: string, rid: string) {
    const db = getDb();
    db.prepare('UPDATE orders SET table_id = NULL WHERE table_id = ? AND restaurant_id = ?').run(
      tableId,
      rid,
    );
    db.prepare(
      'UPDATE reservations SET table_id = NULL WHERE table_id = ? AND restaurant_id = ?',
    ).run(tableId, rid);
    db.prepare('DELETE FROM dining_tables WHERE id = ? AND restaurant_id = ?').run(tableId, rid);
  }

  transferTableOrders(rid: string, sourceTableId: string, targetTableId: string) {
    const db = getDb();
    db.prepare(
      `UPDATE orders
       SET table_id = ?, updated_at = ?
       WHERE table_id = ? AND restaurant_id = ? AND status NOT IN ('PAID', 'CANCELLED')`,
    ).run(targetTableId, new Date().toISOString(), sourceTableId, rid);
    db.prepare(
      `UPDATE dining_tables SET status = 'AVAILABLE' WHERE id = ? AND restaurant_id = ?`,
    ).run(sourceTableId, rid);
    db.prepare(
      `UPDATE dining_tables SET status = 'OCCUPIED' WHERE id = ? AND restaurant_id = ?`,
    ).run(targetTableId, rid);
  }

  mergeTablesOrders(
    rid: string,
    sourceTableId: string,
    targetTableId: string,
    sourceOrders: Array<{
      id: string;
      order_number: string;
      subtotal_xof: number;
      discount_xof: number;
      tax_xof: number;
      total_xof: number;
      paid_xof: number;
      notes: string;
    }>,
    targetActiveOrderId: string | null,
  ) {
    const db = getDb();
    const now = new Date().toISOString();

    if (targetActiveOrderId) {
      for (const src of sourceOrders) {
        db.prepare('UPDATE order_items SET order_id = ? WHERE order_id = ?').run(
          targetActiveOrderId,
          src.id,
        );
        db.prepare(
          'UPDATE payments SET order_id = ? WHERE order_id = ? AND restaurant_id = ?',
        ).run(targetActiveOrderId, src.id, rid);
        db.prepare(
          `UPDATE orders
           SET subtotal_xof = subtotal_xof + ?,
               discount_xof = discount_xof + ?,
               tax_xof = tax_xof + ?,
               total_xof = total_xof + ?,
               paid_xof = paid_xof + ?,
               notes = CASE WHEN ? != '' THEN TRIM(notes || ' | Fusion ' || ? || ': ' || ?) ELSE TRIM(notes || ' | Fusion ' || ?) END,
               updated_at = ?
           WHERE id = ? AND restaurant_id = ?`,
        ).run(
          src.subtotal_xof,
          src.discount_xof,
          src.tax_xof,
          src.total_xof,
          src.paid_xof,
          src.notes || '',
          src.order_number,
          src.notes || '',
          src.order_number,
          now,
          targetActiveOrderId,
          rid,
        );
        db.prepare('DELETE FROM orders WHERE id = ? AND restaurant_id = ?').run(src.id, rid);
      }
    } else {
      db.prepare(
        `UPDATE orders
         SET table_id = ?, updated_at = ?
         WHERE table_id = ? AND restaurant_id = ? AND status NOT IN ('PAID', 'CANCELLED')`,
      ).run(targetTableId, now, sourceTableId, rid);
    }

    db.prepare(
      `UPDATE dining_tables SET status = 'AVAILABLE' WHERE id = ? AND restaurant_id = ?`,
    ).run(sourceTableId, rid);
    db.prepare(
      `UPDATE dining_tables SET status = 'OCCUPIED' WHERE id = ? AND restaurant_id = ?`,
    ).run(targetTableId, rid);
  }

  updateTableStatus(tableId: string, rid: string, status: string) {
    const db = getDb();
    db.prepare(
      'UPDATE dining_tables SET status = ? WHERE id = ? AND restaurant_id = ?',
    ).run(status, tableId, rid);
  }

  regenerateTableQr(tableId: string, rid: string) {
    const db = getDb();
    const now = new Date().toISOString();
    const maxVer = (
      db
        .prepare('SELECT COALESCE(MAX(version), 0) as v FROM qr_codes WHERE table_id = ?')
        .get(tableId) as { v: number }
    ).v;
    const nextVer = maxVer + 1;
    const newToken = `${rid.slice(-6)}-${generateId('q').slice(-8)}-v${nextVer}`;

    db.prepare(
      `UPDATE qr_codes SET status = 'REVOKED', revoked_at = ?
       WHERE table_id = ? AND restaurant_id = ? AND status = 'ACTIVE'`,
    ).run(now, tableId, rid);

    db.prepare(
      `INSERT INTO qr_codes (id, restaurant_id, table_id, token, version, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    ).run(generateId('qr'), rid, tableId, newToken, nextVer, now);

    return { token: newToken, version: nextVer };
  }

  findStocksAndMovements(rid: string) {
    const db = getDb();
    const stocks = db
      .prepare(
        `SELECT s.id, s.restaurant_id as restaurantId, s.name, s.unit,
                COALESCE(s.stock_section, 'KITCHEN') as stockSection,
                s.quantity, s.min_threshold as minThreshold, s.unit_cost_xof as unitCostXof,
                s.supplier_name as supplierName, s.updated_at as updatedAt,
                (SELECT COUNT(*) FROM menu_item_recipes r WHERE r.stock_id = s.id AND r.restaurant_id = s.restaurant_id) as usedInRecipesCount
         FROM stocks s WHERE s.restaurant_id = ? ORDER BY s.name ASC`,
      )
      .all(rid);

    const movements = db
      .prepare(
        `SELECT m.id, s.name as stockName,
                COALESCE(s.stock_section, 'KITCHEN') as stockSection,
                s.unit as stockUnit,
                m.movement_type as movementType,
                COALESCE(m.waste_category, '') as wasteCategory,
                m.quantity_delta as quantityDelta, m.reason, m.created_at as createdAt
         FROM stock_movements m
         JOIN stocks s ON s.id = m.stock_id
         WHERE m.restaurant_id = ?
         ORDER BY m.created_at DESC LIMIT 40`,
      )
      .all(rid);

    return { stocks, movements };
  }

  createStockItem(params: {
    rid: string;
    name: string;
    unit: string;
    stockSection: 'KITCHEN' | 'BEVERAGE';
    quantity: number;
    minThreshold: number;
    unitCostXof: number;
    supplierName: string;
  }) {
    const db = getDb();
    const id = generateId('stk');
    db.prepare(
      `INSERT INTO stocks (id, restaurant_id, name, unit, stock_section, quantity, min_threshold, unit_cost_xof, supplier_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.rid,
      params.name,
      params.unit,
      params.stockSection,
      params.quantity,
      params.minThreshold,
      params.unitCostXof,
      params.supplierName,
      new Date().toISOString(),
    );
    return id;
  }

  findStockById(stockId: string, rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, quantity, name, unit, COALESCE(stock_section, 'KITCHEN') as stock_section,
                min_threshold, unit_cost_xof, supplier_name
         FROM stocks WHERE id = ? AND restaurant_id = ?`,
      )
      .get(stockId, rid) as
      | {
          id: string;
          quantity: number;
          name: string;
          unit: string;
          stock_section: string;
          min_threshold: number;
          unit_cost_xof: number;
          supplier_name: string;
        }
      | undefined;
  }

  updateStockItem(
    stockId: string,
    rid: string,
    updates: {
      name?: string;
      unit?: string;
      stockSection?: 'KITCHEN' | 'BEVERAGE';
      minThreshold?: number;
      unitCostXof?: number;
      supplierName?: string;
    },
  ) {
    const db = getDb();
    const now = new Date().toISOString();
    if (updates.name !== undefined) {
      db.prepare('UPDATE stocks SET name = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.name,
        now,
        stockId,
        rid,
      );
    }
    if (updates.unit !== undefined) {
      db.prepare('UPDATE stocks SET unit = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.unit,
        now,
        stockId,
        rid,
      );
    }
    if (updates.stockSection !== undefined) {
      db.prepare('UPDATE stocks SET stock_section = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.stockSection,
        now,
        stockId,
        rid,
      );
    }
    if (updates.minThreshold !== undefined) {
      db.prepare(
        'UPDATE stocks SET min_threshold = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.minThreshold, now, stockId, rid);
    }
    if (updates.unitCostXof !== undefined) {
      db.prepare(
        'UPDATE stocks SET unit_cost_xof = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.unitCostXof, now, stockId, rid);
    }
    if (updates.supplierName !== undefined) {
      db.prepare(
        'UPDATE stocks SET supplier_name = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.supplierName, now, stockId, rid);
    }
  }

  deleteStockItem(stockId: string, rid: string) {
    const db = getDb();
    db.prepare('DELETE FROM stocks WHERE id = ? AND restaurant_id = ?').run(stockId, rid);
  }

  findPurchaseOrders(rid: string) {
    const db = getDb();
    const orders = db
      .prepare(
        `SELECT id, restaurant_id as restaurantId, po_number as poNumber,
                supplier_name as supplierName, status, total_cost_xof as totalCostXof,
                notes, expected_date as expectedDate, received_at as receivedAt,
                created_at as createdAt, updated_at as updatedAt
         FROM purchase_orders
         WHERE restaurant_id = ?
         ORDER BY created_at DESC`,
      )
      .all(rid) as Array<Record<string, unknown>>;

    const getItems = db.prepare(
      `SELECT id, purchase_order_id as purchaseOrderId, stock_id as stockId,
              stock_name as stockName, unit, quantity, unit_cost_xof as unitCostXof,
              line_total_xof as lineTotalXof
       FROM purchase_order_items WHERE purchase_order_id = ?`,
    );

    return orders.map((po) => ({
      ...po,
      items: getItems.all(String(po.id)),
    }));
  }

  countPurchaseOrders(rid: string): number {
    const db = getDb();
    return (
      db
        .prepare('SELECT COUNT(*) as c FROM purchase_orders WHERE restaurant_id = ?')
        .get(rid) as { c: number }
    ).c;
  }

  insertPurchaseOrder(params: {
    id: string;
    rid: string;
    poNumber: string;
    supplierName: string;
    status: string;
    totalCostXof: number;
    notes: string;
    expectedDate: string | null;
    userId: string;
    now: string;
    items: Array<{
      id: string;
      stockId: string;
      stockName: string;
      unit: string;
      quantity: number;
      unitCostXof: number;
      lineTotalXof: number;
    }>;
  }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO purchase_orders (
        id, restaurant_id, po_number, supplier_name, status, total_cost_xof,
        notes, expected_date, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      params.id,
      params.rid,
      params.poNumber,
      params.supplierName,
      params.status,
      params.totalCostXof,
      params.notes,
      params.expectedDate,
      params.userId,
      params.now,
      params.now,
    );

    const insItem = db.prepare(
      `INSERT INTO purchase_order_items (
        id, purchase_order_id, stock_id, stock_name, unit, quantity, unit_cost_xof, line_total_xof
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of params.items) {
      insItem.run(
        item.id,
        params.id,
        item.stockId,
        item.stockName,
        item.unit,
        item.quantity,
        item.unitCostXof,
        item.lineTotalXof,
      );
    }
  }

  findPurchaseOrderById(poId: string, rid: string) {
    const db = getDb();
    const po = db
      .prepare(
        `SELECT id, po_number, supplier_name, status, total_cost_xof
         FROM purchase_orders WHERE id = ? AND restaurant_id = ?`,
      )
      .get(poId, rid) as
      | {
          id: string;
          po_number: string;
          supplier_name: string;
          status: string;
          total_cost_xof: number;
        }
      | undefined;
    if (!po) return undefined;
    const items = db
      .prepare(
        `SELECT id, stock_id, stock_name, unit, quantity, unit_cost_xof, line_total_xof
         FROM purchase_order_items WHERE purchase_order_id = ?`,
      )
      .all(poId) as Array<{
      id: string;
      stock_id: string;
      stock_name: string;
      unit: string;
      quantity: number;
      unit_cost_xof: number;
      line_total_xof: number;
    }>;
    return { po, items };
  }

  updatePurchaseOrderStatus(
    poId: string,
    rid: string,
    status: string,
    receivedAt?: string | null,
  ) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE purchase_orders
       SET status = ?, received_at = COALESCE(?, received_at), updated_at = ?
       WHERE id = ? AND restaurant_id = ?`,
    ).run(status, receivedAt ?? null, now, poId, rid);
  }

  applyStockMovement(params: {
    rid: string;
    stockId: string;
    nextQty: number;
    movementType: string;
    delta: number;
    reason: string;
    userId: string;
    unitCostXof?: number;
  }) {
    const db = getDb();
    const now = new Date().toISOString();
    if (params.unitCostXof !== undefined && params.unitCostXof > 0) {
      db.prepare(
        'UPDATE stocks SET quantity = ?, unit_cost_xof = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?',
      ).run(params.nextQty, params.unitCostXof, now, params.stockId, params.rid);
    } else {
      db.prepare('UPDATE stocks SET quantity = ?, updated_at = ? WHERE id = ?').run(
        params.nextQty,
        now,
        params.stockId,
      );
    }
    db.prepare(
      `INSERT INTO stock_movements (id, restaurant_id, stock_id, movement_type, quantity_delta, reason, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      generateId('smv'),
      params.rid,
      params.stockId,
      params.movementType,
      params.delta,
      params.reason,
      params.userId,
      now,
    );
  }

  findRestaurantNameById(rid: string): string {
    const db = getDb();
    const row = db
      .prepare('SELECT name FROM restaurants WHERE id = ?')
      .get(rid) as { name: string } | undefined;
    return row?.name || 'Établissement Resto’MAX';
  }

  findStockAlertSettings(rid: string) {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT restaurant_id as restaurantId, in_app_enabled as inAppEnabled,
                email_enabled as emailEnabled, recipient_emails as recipientEmails,
                smtp_host as smtpHost, smtp_port as smtpPort, smtp_secure as smtpSecure,
                smtp_user as smtpUser, smtp_pass as smtpPass, smtp_from as smtpFrom,
                updated_at as updatedAt
         FROM stock_alert_settings WHERE restaurant_id = ?`,
      )
      .get(rid) as
      | {
          restaurantId: string;
          inAppEnabled: number;
          emailEnabled: number;
          recipientEmails: string;
          smtpHost: string;
          smtpPort: number;
          smtpSecure: number;
          smtpUser: string;
          smtpPass: string;
          smtpFrom: string;
          updatedAt: string;
        }
      | undefined;

    if (!row) {
      return {
        restaurantId: rid,
        inAppEnabled: true,
        emailEnabled: true,
        recipientEmails: '',
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpPass: '',
        smtpFrom: '',
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      restaurantId: row.restaurantId,
      inAppEnabled: Boolean(row.inAppEnabled),
      emailEnabled: Boolean(row.emailEnabled),
      recipientEmails: row.recipientEmails,
      smtpHost: row.smtpHost || '',
      smtpPort: Number(row.smtpPort || 587),
      smtpSecure: Boolean(row.smtpSecure),
      smtpUser: row.smtpUser || '',
      smtpPass: row.smtpPass || '',
      smtpFrom: row.smtpFrom || '',
      updatedAt: row.updatedAt,
    };
  }

  upsertStockAlertSettings(params: {
    rid: string;
    inAppEnabled: boolean;
    emailEnabled: boolean;
    recipientEmails: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass?: string;
    smtpFrom: string;
  }) {
    const db = getDb();
    const now = new Date().toISOString();
    const current = this.findStockAlertSettings(params.rid);
    const nextPass =
      params.smtpPass && params.smtpPass.trim().length > 0
        ? params.smtpPass
        : current.smtpPass;

    db.prepare(
      `INSERT INTO stock_alert_settings (
        restaurant_id, in_app_enabled, email_enabled, recipient_emails,
        smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(restaurant_id) DO UPDATE SET
         in_app_enabled = excluded.in_app_enabled,
         email_enabled = excluded.email_enabled,
         recipient_emails = excluded.recipient_emails,
         smtp_host = excluded.smtp_host,
         smtp_port = excluded.smtp_port,
         smtp_secure = excluded.smtp_secure,
         smtp_user = excluded.smtp_user,
         smtp_pass = excluded.smtp_pass,
         smtp_from = excluded.smtp_from,
         updated_at = excluded.updated_at`,
    ).run(
      params.rid,
      params.inAppEnabled ? 1 : 0,
      params.emailEnabled ? 1 : 0,
      params.recipientEmails,
      params.smtpHost,
      params.smtpPort,
      params.smtpSecure ? 1 : 0,
      params.smtpUser,
      nextPass,
      params.smtpFrom,
      now,
    );
    return this.findStockAlertSettings(params.rid);
  }

  findManagerEmailsForRestaurant(rid: string): string[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT DISTINCT u.email
         FROM restaurant_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.restaurant_id = ?
           AND rm.status = 'ACTIVE'
           AND u.status = 'ACTIVE'
           AND rm.role IN ('OWNER', 'MANAGER')`,
      )
      .all(rid) as Array<{ email: string }>;
    return rows.map((r) => r.email);
  }

  createNotification(params: {
    rid: string;
    type: string;
    title: string;
    message: string;
    stockId: string | null;
    emailDispatched: boolean;
    emailRecipients: string;
    emailStatus: 'SENT' | 'QUEUED_NO_SMTP' | 'SKIPPED' | 'FAILED';
  }) {
    const db = getDb();
    const id = generateId('ntf');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO notifications (
        id, restaurant_id, type, title, message, stock_id,
        email_dispatched, email_recipients, email_status, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      id,
      params.rid,
      params.type,
      params.title,
      params.message,
      params.stockId,
      params.emailDispatched ? 1 : 0,
      params.emailRecipients,
      params.emailStatus,
      now,
    );
    return {
      id,
      restaurantId: params.rid,
      type: params.type,
      title: params.title,
      message: params.message,
      stockId: params.stockId,
      emailDispatched: params.emailDispatched,
      emailRecipients: params.emailRecipients,
      emailStatus: params.emailStatus,
      isRead: false,
      createdAt: now,
    };
  }

  findNotificationsForRestaurant(rid: string, limit = 30) {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, restaurant_id as restaurantId, type, title, message,
                stock_id as stockId, email_dispatched as emailDispatched,
                email_recipients as emailRecipients, email_status as emailStatus,
                is_read as isRead, created_at as createdAt
         FROM notifications
         WHERE restaurant_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(rid, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      restaurantId: String(r.restaurantId),
      type: String(r.type),
      title: String(r.title),
      message: String(r.message),
      stockId: r.stockId ? String(r.stockId) : null,
      emailDispatched: Boolean(r.emailDispatched),
      emailRecipients: String(r.emailRecipients || ''),
      emailStatus: String(r.emailStatus || 'SKIPPED') as
        | 'SENT'
        | 'QUEUED_NO_SMTP'
        | 'SKIPPED'
        | 'FAILED',
      isRead: Boolean(r.isRead),
      createdAt: String(r.createdAt),
    }));
  }

  markNotificationsRead(rid: string, notificationId?: string) {
    const db = getDb();
    if (notificationId) {
      db.prepare(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND restaurant_id = ?',
      ).run(notificationId, rid);
      return;
    }
    db.prepare('UPDATE notifications SET is_read = 1 WHERE restaurant_id = ?').run(
      rid,
    );
  }

  findRecentStockAlerts(rid: string, limit = 15) {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, restaurant_id as restaurantId, type, title, message,
                stock_id as stockId, email_dispatched as emailDispatched,
                email_recipients as emailRecipients, email_status as emailStatus,
                is_read as isRead, created_at as createdAt
         FROM notifications
         WHERE restaurant_id = ? AND type = 'STOCK_CRITICAL'
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(rid, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      restaurantId: String(r.restaurantId),
      type: String(r.type),
      title: String(r.title),
      message: String(r.message),
      stockId: r.stockId ? String(r.stockId) : null,
      emailDispatched: Boolean(r.emailDispatched),
      emailRecipients: String(r.emailRecipients || ''),
      emailStatus: String(r.emailStatus || 'SKIPPED') as
        | 'SENT'
        | 'QUEUED_NO_SMTP'
        | 'SKIPPED'
        | 'FAILED',
      isRead: Boolean(r.isRead),
      createdAt: String(r.createdAt),
    }));
  }

  findStaffMembers(rid: string) {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT rm.id, rm.user_id as userId, u.full_name as fullName, u.email, u.phone,
                rm.role, rm.status, rm.custom_permissions_json, rm.created_at as createdAt,
                CASE WHEN u.pin_hash IS NOT NULL AND u.pin_hash != '' THEN 1 ELSE 0 END as hasPin
         FROM restaurant_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.restaurant_id = ?
         ORDER BY rm.created_at ASC`,
      )
      .all(rid) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      ...(r as {
        id: string;
        userId: string;
        fullName: string;
        email: string;
        phone: string | null;
        role: string;
        status: string;
        custom_permissions_json: string | null;
        createdAt: string;
        hasPin: number;
      }),
      hasPin: Boolean(r.hasPin),
    }));
  }

  findPinDirectory(rid: string) {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT rm.user_id as userId, u.full_name as fullName, rm.role,
                CASE WHEN u.pin_hash IS NOT NULL AND u.pin_hash != '' THEN 1 ELSE 0 END as hasPin
         FROM restaurant_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.restaurant_id = ? AND rm.status = 'ACTIVE' AND u.status = 'ACTIVE'
         ORDER BY u.full_name ASC`,
      )
      .all(rid) as Array<{
      userId: string;
      fullName: string;
      role: string;
      hasPin: number;
    }>;
    return rows.map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      role: r.role as Role,
      hasPin: Boolean(r.hasPin),
    }));
  }

  findPosPinOperators(rid: string) {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT rm.user_id as userId, u.full_name as fullName, rm.role,
                CASE WHEN u.pin_hash IS NOT NULL AND u.pin_hash != '' THEN 1 ELSE 0 END as hasPin
         FROM restaurant_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.restaurant_id = ?
           AND rm.status = 'ACTIVE'
           AND u.status = 'ACTIVE'
           AND rm.role IN ('WAITER', 'CASHIER', 'MANAGER', 'OWNER')
         ORDER BY
           CASE rm.role
             WHEN 'CASHIER' THEN 1
             WHEN 'WAITER' THEN 2
             WHEN 'MANAGER' THEN 3
             ELSE 4
           END ASC,
           u.full_name ASC`,
      )
      .all(rid) as Array<{
      userId: string;
      fullName: string;
      role: string;
      hasPin: number;
    }>;
    return rows.map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      role: r.role as Role,
      hasPin: Boolean(r.hasPin),
    }));
  }

  findUserByEmail(email: string) {
    const db = getDb();
    return db
      .prepare('SELECT id FROM users WHERE lower(email) = lower(?)')
      .get(email) as { id: string } | undefined;
  }

  createStaffUserAndMember(params: {
    rid: string;
    email: string;
    passwordHash: string;
    fullName: string;
    phone: string | null;
    role: Role;
    customPermissions: Permission[];
    pinHash?: string | null;
  }) {
    const db = getDb();
    const now = new Date().toISOString();
    const userId = generateId('usr');
    const memberId = generateId('mem');

    db.prepare(
      `INSERT INTO users (id, tenant_id, email, password_hash, full_name, phone, role, global_role, permissions_json, status, email_verified, pin_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'USER', ?, 'ACTIVE', 1, ?, ?)`,
    ).run(
      userId,
      params.rid,
      params.email,
      params.passwordHash,
      params.fullName,
      params.phone,
      params.role,
      JSON.stringify(params.customPermissions),
      params.pinHash ?? null,
      now,
    );

    db.prepare(
      `INSERT INTO restaurant_members (id, restaurant_id, user_id, role, custom_permissions_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    ).run(
      memberId,
      params.rid,
      userId,
      params.role,
      JSON.stringify(params.customPermissions),
      now,
    );

    return { memberId, userId };
  }

  findMemberById(memberId: string, rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT rm.id, rm.user_id, rm.role, u.email as currentEmail
         FROM restaurant_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.id = ? AND rm.restaurant_id = ?`,
      )
      .get(memberId, rid) as
      | { id: string; user_id: string; role: Role; currentEmail: string }
      | undefined;
  }

  updateStaffMember(
    memberId: string,
    rid: string,
    userId: string,
    updates: {
      status?: string;
      role?: string;
      customPermissions?: Permission[];
      fullName?: string;
      email?: string;
      phone?: string | null;
      passwordHash?: string;
      pinHash?: string | null;
    },
  ) {
    const db = getDb();
    if (updates.status) {
      db.prepare(
        'UPDATE restaurant_members SET status = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.status, memberId, rid);

      if (updates.status !== 'ACTIVE') {
        db.prepare(
          'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
        ).run(new Date().toISOString(), userId);
      }
    }
    if (updates.role) {
      db.prepare(
        'UPDATE restaurant_members SET role = ? WHERE id = ? AND restaurant_id = ?',
      ).run(updates.role, memberId, rid);
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(updates.role, userId);
    }
    if (updates.customPermissions) {
      db.prepare(
        'UPDATE restaurant_members SET custom_permissions_json = ? WHERE id = ? AND restaurant_id = ?',
      ).run(JSON.stringify(updates.customPermissions), memberId, rid);
      db.prepare('UPDATE users SET permissions_json = ? WHERE id = ?').run(
        JSON.stringify(updates.customPermissions),
        userId,
      );
    }
    if (updates.fullName !== undefined) {
      db.prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?').run(
        updates.fullName,
        new Date().toISOString(),
        userId,
      );
    }
    if (updates.email !== undefined) {
      db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').run(
        updates.email,
        new Date().toISOString(),
        userId,
      );
    }
    if (updates.phone !== undefined) {
      db.prepare('UPDATE users SET phone = ?, updated_at = ? WHERE id = ?').run(
        updates.phone,
        new Date().toISOString(),
        userId,
      );
    }
    if (updates.passwordHash !== undefined) {
      db.prepare(
        'UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?',
      ).run(updates.passwordHash, new Date().toISOString(), userId);
      db.prepare(
        'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
      ).run(new Date().toISOString(), userId);
    }
    if (updates.pinHash !== undefined) {
      db.prepare('UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?').run(
        updates.pinHash,
        new Date().toISOString(),
        userId,
      );
    }
  }

  deleteStaffMember(memberId: string, rid: string, userId: string) {
    const db = getDb();
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
      new Date().toISOString(),
      userId,
    );
    db.prepare('UPDATE orders SET created_by_user_id = NULL WHERE created_by_user_id = ? AND restaurant_id = ?').run(
      userId,
      rid,
    );
    db.prepare('UPDATE payments SET created_by_user_id = NULL WHERE created_by_user_id = ? AND restaurant_id = ?').run(
      userId,
      rid,
    );
    db.prepare('UPDATE stock_movements SET created_by_user_id = NULL WHERE created_by_user_id = ? AND restaurant_id = ?').run(
      userId,
      rid,
    );
    db.prepare('UPDATE purchase_orders SET created_by_user_id = NULL WHERE created_by_user_id = ? AND restaurant_id = ?').run(
      userId,
      rid,
    );
    db.prepare('DELETE FROM restaurant_members WHERE id = ? AND restaurant_id = ?').run(
      memberId,
      rid,
    );
    const otherMemberships = (
      db.prepare('SELECT COUNT(*) as c FROM restaurant_members WHERE user_id = ?').get(userId) as {
        c: number;
      }
    ).c;
    const u = db.prepare('SELECT global_role FROM users WHERE id = ?').get(userId) as
      | { global_role: string }
      | undefined;
    if (otherMemberships === 0 && u && u.global_role !== 'SUPER_ADMIN') {
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    }
  }

  findCustomers(rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, restaurant_id as restaurantId, full_name as fullName, phone, email,
                loyalty_points as loyaltyPoints, total_spent_xof as totalSpentXof,
                visits_count as visitsCount, preferences, created_at as createdAt
         FROM customers WHERE restaurant_id = ? ORDER BY total_spent_xof DESC`,
      )
      .all(rid);
  }

  findCustomerById(customerId: string, rid: string) {
    const db = getDb();
    return db
      .prepare('SELECT id FROM customers WHERE id = ? AND restaurant_id = ?')
      .get(customerId, rid) as { id: string } | undefined;
  }

  createCustomer(params: {
    rid: string;
    fullName: string;
    phone: string;
    email: string;
    preferences: string;
  }) {
    const db = getDb();
    const id = generateId('cust');
    db.prepare(
      `INSERT INTO customers (id, restaurant_id, full_name, phone, email, loyalty_points, total_spent_xof, visits_count, preferences, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
    ).run(
      id,
      params.rid,
      params.fullName,
      params.phone,
      params.email,
      params.preferences,
      new Date().toISOString(),
    );
    return id;
  }

  updateCustomer(
    customerId: string,
    rid: string,
    updates: {
      fullName?: string;
      phone?: string;
      email?: string;
      preferences?: string;
    },
  ) {
    const db = getDb();
    if (updates.fullName !== undefined) {
      db.prepare('UPDATE customers SET full_name = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.fullName,
        customerId,
        rid,
      );
    }
    if (updates.phone !== undefined) {
      db.prepare('UPDATE customers SET phone = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.phone,
        customerId,
        rid,
      );
    }
    if (updates.email !== undefined) {
      db.prepare('UPDATE customers SET email = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.email,
        customerId,
        rid,
      );
    }
    if (updates.preferences !== undefined) {
      db.prepare('UPDATE customers SET preferences = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.preferences,
        customerId,
        rid,
      );
    }
  }

  deleteCustomer(customerId: string, rid: string) {
    const db = getDb();
    db.prepare('DELETE FROM customers WHERE id = ? AND restaurant_id = ?').run(customerId, rid);
  }

  findReservations(rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT r.id, r.restaurant_id as restaurantId, r.customer_name as customerName,
                r.customer_phone as customerPhone, r.party_size as partySize,
                r.reserved_at as reservedAt, r.table_id as tableId, t.label as tableLabel,
                r.status, r.notes
         FROM reservations r
         LEFT JOIN dining_tables t ON t.id = r.table_id
         WHERE r.restaurant_id = ?
         ORDER BY r.reserved_at ASC`,
      )
      .all(rid);
  }

  createReservation(params: {
    rid: string;
    customerName: string;
    customerPhone: string;
    partySize: number;
    reservedAt: string;
    tableId: string | null;
    notes: string;
  }) {
    const db = getDb();
    const id = generateId('res');
    db.prepare(
      `INSERT INTO reservations (id, restaurant_id, customer_name, customer_phone, party_size, reserved_at, table_id, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)`,
    ).run(
      id,
      params.rid,
      params.customerName,
      params.customerPhone,
      params.partySize,
      params.reservedAt,
      params.tableId,
      params.notes,
      new Date().toISOString(),
    );
    return id;
  }

  findReservationById(id: string, rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT r.id, r.restaurant_id as restaurantId, r.customer_name as customerName,
                r.customer_phone as customerPhone, r.party_size as partySize,
                r.reserved_at as reservedAt, r.table_id as tableId, t.label as tableLabel,
                r.status, r.notes
         FROM reservations r
         LEFT JOIN dining_tables t ON t.id = r.table_id
         WHERE r.id = ? AND r.restaurant_id = ?`,
      )
      .get(id, rid) as
      | {
          id: string;
          restaurantId: string;
          customerName: string;
          customerPhone: string;
          partySize: number;
          reservedAt: string;
          tableId: string | null;
          tableLabel: string | null;
          status: string;
          notes: string;
        }
      | undefined;
  }

  findOrderForReceipt(orderId: string, rid: string) {
    const db = getDb();
    const order = db
      .prepare(
        `SELECT o.id, o.order_number as orderNumber, o.order_type as orderType,
                o.customer_name as customerName, o.status, o.subtotal_xof as subtotalXof,
                o.discount_xof as discountXof, o.tax_xof as taxXof, o.total_xof as totalXof,
                o.paid_xof as paidXof, o.created_at as createdAt, t.label as tableLabel
         FROM orders o
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.id = ? AND o.restaurant_id = ?`,
      )
      .get(orderId, rid) as
      | {
          id: string;
          orderNumber: string;
          orderType: string;
          customerName: string;
          status: string;
          subtotalXof: number;
          discountXof: number;
          taxXof: number;
          totalXof: number;
          paidXof: number;
          createdAt: string;
          tableLabel: string | null;
        }
      | undefined;
    if (!order) return undefined;
    const items = db
      .prepare(
        `SELECT name, quantity, unit_price_xof as unitPriceXof, line_total_xof as lineTotalXof, options_summary as optionsSummary
         FROM order_items WHERE order_id = ?`,
      )
      .all(orderId) as Array<{
      name: string;
      quantity: number;
      unitPriceXof: number;
      lineTotalXof: number;
      optionsSummary: string;
    }>;
    return { order, items };
  }

  updateReservationStatus(id: string, rid: string, status: string) {
    const db = getDb();
    db.prepare(
      'UPDATE reservations SET status = ? WHERE id = ? AND restaurant_id = ?',
    ).run(status, id, rid);
  }

  findFinanceSummary(rid: string) {
    const db = getDb();
    const todayDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Abidjan',
    }).format(new Date());
    const startOfTodayIso = `${todayDate}T00:00:00.000Z`;
    const endOfTodayIso = new Date(
      new Date(startOfTodayIso).getTime() + 86_400_000,
    ).toISOString();

    const sales = db
      .prepare(
        `SELECT COALESCE(SUM(total_xof), 0) as gross_sales,
                COALESCE(SUM(tax_xof), 0) as total_tax,
                COALESCE(SUM(paid_xof), 0) as collected
         FROM orders WHERE restaurant_id = ? AND status != 'CANCELLED'`,
      )
      .get(rid) as { gross_sales: number; total_tax: number; collected: number };

    const todaySales = db
      .prepare(
        `SELECT COALESCE(SUM(total_xof), 0) as revenue_xof,
                COUNT(*) as orders_count,
                COALESCE(AVG(total_xof), 0) as avg_basket
         FROM orders
         WHERE restaurant_id = ? AND status != 'CANCELLED'
           AND created_at >= ? AND created_at < ?`,
      )
      .get(rid, startOfTodayIso, endOfTodayIso) as {
      revenue_xof: number;
      orders_count: number;
      avg_basket: number;
    };

    const todayPayments = db
      .prepare(
        `SELECT COALESCE(SUM(amount_xof), 0) as collected_xof
         FROM payments
         WHERE restaurant_id = ? AND status = 'PAID'
           AND created_at >= ? AND created_at < ?`,
      )
      .get(rid, startOfTodayIso, endOfTodayIso) as { collected_xof: number };

    const cogsRow = db
      .prepare(
        `SELECT COALESCE(SUM(oi.quantity * mi.cost_price_xof), 0) as total_cogs
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.restaurant_id = ? AND o.status != 'CANCELLED'`,
      )
      .get(rid) as { total_cogs: number };

    const expenses = db
      .prepare(
        `SELECT id, category, description, amount_xof as amountXof, expense_date as expenseDate
         FROM expenses WHERE restaurant_id = ? ORDER BY expense_date DESC`,
      )
      .all(rid) as Array<Record<string, unknown>>;

    const byMethod = db
      .prepare(
        `SELECT method, COALESCE(SUM(amount_xof), 0) as amountXof, COUNT(*) as count
         FROM payments WHERE restaurant_id = ? AND status = 'PAID'
         GROUP BY method`,
      )
      .all(rid);

    return {
      sales,
      todayDate,
      todaySales,
      todayPayments,
      cogsRow,
      expenses,
      byMethod,
    };
  }

  findExpenseById(expenseId: string, rid: string) {
    const db = getDb();
    return db
      .prepare('SELECT id FROM expenses WHERE id = ? AND restaurant_id = ?')
      .get(expenseId, rid) as { id: string } | undefined;
  }

  createExpense(params: {
    rid: string;
    category: string;
    description: string;
    amountXof: number;
    expenseDate?: string;
  }) {
    const db = getDb();
    const id = generateId('exp');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO expenses (id, restaurant_id, category, description, amount_xof, expense_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.rid,
      params.category,
      params.description,
      params.amountXof,
      params.expenseDate || now,
      now,
    );
    return id;
  }

  updateExpense(
    expenseId: string,
    rid: string,
    updates: {
      category?: string;
      description?: string;
      amountXof?: number;
      expenseDate?: string;
    },
  ) {
    const db = getDb();
    if (updates.category !== undefined) {
      db.prepare('UPDATE expenses SET category = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.category,
        expenseId,
        rid,
      );
    }
    if (updates.description !== undefined) {
      db.prepare('UPDATE expenses SET description = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.description,
        expenseId,
        rid,
      );
    }
    if (updates.amountXof !== undefined) {
      db.prepare('UPDATE expenses SET amount_xof = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.amountXof,
        expenseId,
        rid,
      );
    }
    if (updates.expenseDate !== undefined) {
      db.prepare('UPDATE expenses SET expense_date = ? WHERE id = ? AND restaurant_id = ?').run(
        updates.expenseDate,
        expenseId,
        rid,
      );
    }
  }

  deleteExpense(expenseId: string, rid: string) {
    const db = getDb();
    db.prepare('DELETE FROM expenses WHERE id = ? AND restaurant_id = ?').run(expenseId, rid);
  }

  findOrdersForCsvExport(rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT order_number, order_type, customer_name, status, total_xof, paid_xof, created_at
         FROM orders WHERE restaurant_id = ? ORDER BY created_at DESC`,
      )
      .all(rid) as Array<Record<string, unknown>>;
  }

  findRestaurantSettings(rid: string) {
    const db = getDb();
    const resto = db
      .prepare(
        `SELECT id, name, slug, email, phone, address, city, country, currency, timezone,
                tax_rate_percent as taxRatePercent, service_fee_percent as serviceFeePercent,
                opening_hours as openingHours, paydunya_mode as paydunyaMode,
                paydunya_public_key, paydunya_private_key, paydunya_token,
                whatsapp_enabled as whatsappEnabled,
                whatsapp_phone_number_id as whatsappPhoneNumberId,
                whatsapp_access_token as whatsappAccessToken,
                printer_settings_json as printerSettingsJson,
                COALESCE(storefront_enabled, 1) as storefrontEnabled,
                COALESCE(delivery_enabled, 1) as deliveryEnabled,
                COALESCE(delivery_zones_json, '[]') as deliveryZonesJson,
                COALESCE(pickup_slots_json, '[]') as pickupSlotsJson,
                COALESCE(loyalty_enabled, 1) as loyaltyEnabled,
                COALESCE(loyalty_points_per_1000_xof, 10) as loyaltyPointsPer1000Xof,
                COALESCE(loyalty_xof_per_point, 25) as loyaltyXofPerPoint,
                status, created_at as createdAt
         FROM restaurants WHERE id = ?`,
      )
      .get(rid) as Record<string, unknown>;

    const sub = db
      .prepare(
        `SELECT s.id, s.plan_id as planId, s.status, s.billing_cycle as billingCycle, s.trial_ends_at as trialEndsAt,
                s.current_period_start as currentPeriodStart, s.current_period_end as currentPeriodEnd,
                p.code as planCode, p.name as planName, p.price_monthly_xof as priceMonthlyXof,
                p.price_yearly_xof as priceYearlyXof
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         WHERE s.restaurant_id = ?
         ORDER BY s.created_at DESC LIMIT 1`,
      )
      .get(rid);

    return { resto, sub };
  }

  findSubscriptionPortal(rid: string) {
    const db = getDb();
    const currentSubscription = db
      .prepare(
        `SELECT s.id, s.plan_id as planId, s.billing_cycle as billingCycle, s.status,
                s.trial_ends_at as trialEndsAt, s.current_period_start as currentPeriodStart,
                s.current_period_end as currentPeriodEnd,
                COALESCE(s.auto_renew, 1) as autoRenew,
                COALESCE(s.preferred_payment_method, 'WAVE') as preferredPaymentMethod,
                p.name as planName, p.code as planCode,
                p.price_monthly_xof as priceMonthlyXof, p.price_yearly_xof as priceYearlyXof,
                p.max_tables as maxTables, p.max_staff as maxStaff, p.max_menu_items as maxMenuItems
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         WHERE s.restaurant_id = ?
         ORDER BY s.created_at DESC LIMIT 1`,
      )
      .get(rid) as Record<string, unknown> | undefined;

    const tablesRow = db
      .prepare('SELECT COUNT(*) as c FROM dining_tables WHERE restaurant_id = ?')
      .get(rid) as { c: number };
    const staffRow = db
      .prepare(
        "SELECT COUNT(*) as c FROM restaurant_members WHERE restaurant_id = ? AND status = 'ACTIVE'",
      )
      .get(rid) as { c: number };
    const menuRow = db
      .prepare('SELECT COUNT(*) as c FROM menu_items WHERE restaurant_id = ?')
      .get(rid) as { c: number };

    const plansRows = db
      .prepare(
        `SELECT id, code, name, tagline, price_monthly_xof as priceMonthlyXof,
                price_yearly_xof as priceYearlyXof, trial_days as trialDays,
                max_tables as maxTables, max_staff as maxStaff, max_menu_items as maxMenuItems,
                is_featured as isFeatured, features_json
         FROM plans WHERE active = 1 ORDER BY price_monthly_xof ASC`,
      )
      .all() as Array<Record<string, unknown>>;

    const invoices = db
      .prepare(
        `SELECT id, invoice_number as invoiceNumber, restaurant_id as restaurantId,
                subscription_id as subscriptionId, amount_xof as amountXof, status,
                payment_method as paymentMethod, mode,
                COALESCE(paydunya_token, '') as paydunyaToken,
                COALESCE(checkout_url, '') as checkoutUrl,
                plan_id as planId,
                COALESCE(billing_cycle, 'MONTHLY') as billingCycle,
                COALESCE(is_renewal, 0) as isRenewal,
                paid_at as paidAt, created_at as createdAt
         FROM platform_invoices
         WHERE restaurant_id = ?
         ORDER BY created_at DESC LIMIT 30`,
      )
      .all(rid) as Array<Record<string, unknown>>;

    return {
      currentSubscription: currentSubscription
        ? {
            ...currentSubscription,
            autoRenew: Boolean(currentSubscription.autoRenew),
          }
        : null,
      usage: {
        tablesCount: Number(tablesRow?.c || 0),
        staffCount: Number(staffRow?.c || 0),
        menuItemsCount: Number(menuRow?.c || 0),
      },
      plans: plansRows.map((p) => ({
        ...p,
        isFeatured: Boolean(p.isFeatured),
        features: JSON.parse(String(p.features_json || '[]')),
      })),
      invoices: invoices.map((inv) => ({
        ...inv,
        isRenewal: Boolean(inv.isRenewal),
      })),
    };
  }

  findPlanById(planId: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, code, name, price_monthly_xof, price_yearly_xof, active
         FROM plans WHERE id = ? AND active = 1`,
      )
      .get(planId) as
      | {
          id: string;
          code: string;
          name: string;
          price_monthly_xof: number;
          price_yearly_xof: number;
          active: number;
        }
      | undefined;
  }

  findCurrentSubscriptionRow(rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, plan_id, billing_cycle, status, current_period_start, current_period_end,
                COALESCE(auto_renew, 1) as auto_renew,
                COALESCE(preferred_payment_method, 'WAVE') as preferred_payment_method
         FROM subscriptions
         WHERE restaurant_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(rid) as
      | {
          id: string;
          plan_id: string;
          billing_cycle: 'MONTHLY' | 'YEARLY';
          status: string;
          current_period_start: string;
          current_period_end: string;
          auto_renew: number;
          preferred_payment_method: string;
        }
      | undefined;
  }

  updateSubscriptionAutoRenew(
    rid: string,
    autoRenew: boolean,
    preferredPaymentMethod?: string,
  ) {
    const db = getDb();
    const current = this.findCurrentSubscriptionRow(rid);
    if (!current) return null;
    if (preferredPaymentMethod) {
      db.prepare(
        `UPDATE subscriptions
         SET auto_renew = ?, preferred_payment_method = ?
         WHERE id = ? AND restaurant_id = ?`,
      ).run(autoRenew ? 1 : 0, preferredPaymentMethod, current.id, rid);
    } else {
      db.prepare(
        `UPDATE subscriptions
         SET auto_renew = ?
         WHERE id = ? AND restaurant_id = ?`,
      ).run(autoRenew ? 1 : 0, current.id, rid);
    }
    return current.id;
  }

  createPendingSubscriptionInvoice(params: {
    invoiceId: string;
    invoiceNumber: string;
    rid: string;
    subscriptionId: string | null;
    planId: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    amountXof: number;
    paymentMethod: string;
    mode: string;
    paydunyaToken: string;
    checkoutUrl: string;
    isRenewal: boolean;
    now: string;
  }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO platform_invoices (
        id, invoice_number, restaurant_id, subscription_id, amount_xof,
        status, payment_method, mode, paydunya_token, checkout_url,
        plan_id, billing_cycle, is_renewal, paid_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    ).run(
      params.invoiceId,
      params.invoiceNumber,
      params.rid,
      params.subscriptionId,
      params.amountXof,
      params.paymentMethod,
      params.mode,
      params.paydunyaToken,
      params.checkoutUrl,
      params.planId,
      params.billingCycle,
      params.isRenewal ? 1 : 0,
      params.now,
    );
  }

  findSubscriptionInvoiceByIdOrToken(params: {
    rid?: string;
    invoiceId?: string;
    paydunyaToken?: string;
  }) {
    const db = getDb();
    if (params.invoiceId && params.rid) {
      return db
        .prepare(
          `SELECT * FROM platform_invoices WHERE id = ? AND restaurant_id = ?`,
        )
        .get(params.invoiceId, params.rid) as Record<string, unknown> | undefined;
    }
    if (params.invoiceId) {
      return db
        .prepare(`SELECT * FROM platform_invoices WHERE id = ?`)
        .get(params.invoiceId) as Record<string, unknown> | undefined;
    }
    if (params.paydunyaToken && params.rid) {
      return db
        .prepare(
          `SELECT * FROM platform_invoices WHERE paydunya_token = ? AND restaurant_id = ?`,
        )
        .get(params.paydunyaToken, params.rid) as Record<string, unknown> | undefined;
    }
    if (params.paydunyaToken) {
      return db
        .prepare(`SELECT * FROM platform_invoices WHERE paydunya_token = ?`)
        .get(params.paydunyaToken) as Record<string, unknown> | undefined;
    }
    return undefined;
  }

  completePendingSubscriptionInvoice(params: {
    invoiceId: string;
    rid: string;
    planId: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    paymentMethod: string;
    paydunyaToken: string;
    autoRenew?: boolean;
    periodStart: string;
    periodEnd: string;
    now: string;
  }) {
    const db = getDb();
    const existingSub = this.findCurrentSubscriptionRow(params.rid);
    let subscriptionId: string;
    if (existingSub) {
      subscriptionId = existingSub.id;
      db.prepare(
        `UPDATE subscriptions
         SET plan_id = ?, billing_cycle = ?, status = 'ACTIVE',
             current_period_start = ?, current_period_end = ?,
             preferred_payment_method = ?,
             last_paydunya_token = ?,
             auto_renew = COALESCE(?, auto_renew)
         WHERE id = ? AND restaurant_id = ?`,
      ).run(
        params.planId,
        params.billingCycle,
        params.periodStart,
        params.periodEnd,
        params.paymentMethod,
        params.paydunyaToken,
        typeof params.autoRenew === 'boolean' ? (params.autoRenew ? 1 : 0) : null,
        subscriptionId,
        params.rid,
      );
    } else {
      subscriptionId = generateId('sub');
      db.prepare(
        `INSERT INTO subscriptions (
          id, restaurant_id, plan_id, billing_cycle, status, trial_ends_at,
          current_period_start, current_period_end, auto_renew,
          preferred_payment_method, last_paydunya_token, created_at
        ) VALUES (?, ?, ?, ?, 'ACTIVE', NULL, ?, ?, ?, ?, ?, ?)`,
      ).run(
        subscriptionId,
        params.rid,
        params.planId,
        params.billingCycle,
        params.periodStart,
        params.periodEnd,
        params.autoRenew === false ? 0 : 1,
        params.paymentMethod,
        params.paydunyaToken,
        params.now,
      );
    }

    db.prepare(`UPDATE restaurants SET status = 'ACTIVE' WHERE id = ?`).run(params.rid);
    db.prepare(
      `UPDATE platform_invoices
       SET status = 'PAID', subscription_id = ?, paid_at = ?
       WHERE id = ? AND restaurant_id = ?`,
    ).run(subscriptionId, params.now, params.invoiceId, params.rid);

    return subscriptionId;
  }

  activateRestaurantSubscriptionCheckout(params: {
    rid: string;
    planId: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    amountXof: number;
    paymentMethod: string;
    mode: string;
    paydunyaToken?: string;
    autoRenew?: boolean;
    isRenewal?: boolean;
    periodStart: string;
    periodEnd: string;
    now: string;
  }) {
    const db = getDb();
    const existingSub = db
      .prepare(
        'SELECT id, auto_renew FROM subscriptions WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(params.rid) as { id: string; auto_renew?: number } | undefined;

    let subscriptionId: string;
    if (existingSub) {
      subscriptionId = existingSub.id;
      const nextAutoRenew =
        typeof params.autoRenew === 'boolean'
          ? params.autoRenew
            ? 1
            : 0
          : existingSub.auto_renew ?? 1;
      db.prepare(
        `UPDATE subscriptions
         SET plan_id = ?, billing_cycle = ?, status = 'ACTIVE',
             current_period_start = ?, current_period_end = ?,
             auto_renew = ?, preferred_payment_method = ?,
             last_paydunya_token = ?
         WHERE id = ? AND restaurant_id = ?`,
      ).run(
        params.planId,
        params.billingCycle,
        params.periodStart,
        params.periodEnd,
        nextAutoRenew,
        params.paymentMethod,
        params.paydunyaToken || '',
        subscriptionId,
        params.rid,
      );
    } else {
      subscriptionId = generateId('sub');
      db.prepare(
        `INSERT INTO subscriptions (
          id, restaurant_id, plan_id, billing_cycle, status, trial_ends_at,
          current_period_start, current_period_end, auto_renew,
          preferred_payment_method, last_paydunya_token, created_at
        ) VALUES (?, ?, ?, ?, 'ACTIVE', NULL, ?, ?, ?, ?, ?, ?)`,
      ).run(
        subscriptionId,
        params.rid,
        params.planId,
        params.billingCycle,
        params.periodStart,
        params.periodEnd,
        params.autoRenew === false ? 0 : 1,
        params.paymentMethod,
        params.paydunyaToken || '',
        params.now,
      );
    }

    db.prepare(`UPDATE restaurants SET status = 'ACTIVE' WHERE id = ?`).run(params.rid);

    const invoiceId = generateId('inv');
    const year = new Date().getFullYear();
    const seq = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${year}-${seq}`;

    db.prepare(
      `INSERT INTO platform_invoices (
        id, invoice_number, restaurant_id, subscription_id, amount_xof,
        status, payment_method, mode, paydunya_token, checkout_url,
        plan_id, billing_cycle, is_renewal, paid_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?, ?, '', ?, ?, ?, ?, ?)`,
    ).run(
      invoiceId,
      invoiceNumber,
      params.rid,
      subscriptionId,
      params.amountXof,
      params.paymentMethod,
      params.mode,
      params.paydunyaToken || '',
      params.planId,
      params.billingCycle,
      params.isRenewal ? 1 : 0,
      params.now,
      params.now,
    );

    return { subscriptionId, invoiceId, invoiceNumber };
  }

  findWhatsappLogs(rid: string, limit = 30) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, restaurant_id as restaurantId, recipient_phone as recipientPhone,
                message_type as messageType, body, status, external_message_id as externalMessageId,
                error_message as errorMessage, created_at as createdAt
         FROM whatsapp_logs
         WHERE restaurant_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(rid, limit);
  }

  updateRestaurantSettings(
    rid: string,
    params: {
      name: string | null;
      phone: string | null;
      address: string | null;
      city: string | null;
      openingHours: string | null;
      taxRatePercent: number | null;
      paydunyaMode: string | null;
      paydunyaPublicKey?: string;
      paydunyaPrivateKey?: string;
      paydunyaToken?: string;
      printerSettingsJson?: string;
      whatsappEnabled?: boolean;
      whatsappPhoneNumberId?: string;
      whatsappAccessToken?: string;
      storefrontEnabled?: boolean;
      deliveryEnabled?: boolean;
      deliveryZonesJson?: string;
      pickupSlotsJson?: string;
      loyaltyEnabled?: boolean;
      loyaltyPointsPer1000Xof?: number;
      loyaltyXofPerPoint?: number;
    },
  ) {
    const db = getDb();
    db.prepare(
      `UPDATE restaurants
       SET name = COALESCE(?, name),
           phone = COALESCE(?, phone),
           address = COALESCE(?, address),
           city = COALESCE(?, city),
           opening_hours = COALESCE(?, opening_hours),
           tax_rate_percent = COALESCE(?, tax_rate_percent),
           paydunya_mode = COALESCE(?, paydunya_mode),
           printer_settings_json = COALESCE(?, printer_settings_json)
       WHERE id = ?`,
    ).run(
      params.name,
      params.phone,
      params.address,
      params.city,
      params.openingHours,
      params.taxRatePercent,
      params.paydunyaMode,
      params.printerSettingsJson ?? null,
      rid,
    );

    if (
      params.paydunyaPublicKey ||
      params.paydunyaPrivateKey ||
      params.paydunyaToken
    ) {
      db.prepare(
        `UPDATE restaurants
         SET paydunya_public_key = COALESCE(NULLIF(?, ''), paydunya_public_key),
             paydunya_private_key = COALESCE(NULLIF(?, ''), paydunya_private_key),
             paydunya_token = COALESCE(NULLIF(?, ''), paydunya_token)
         WHERE id = ?`,
      ).run(
        params.paydunyaPublicKey || '',
        params.paydunyaPrivateKey || '',
        params.paydunyaToken || '',
        rid,
      );
    }

    if (typeof params.whatsappEnabled === 'boolean') {
      db.prepare('UPDATE restaurants SET whatsapp_enabled = ? WHERE id = ?').run(
        params.whatsappEnabled ? 1 : 0,
        rid,
      );
    }
    if (params.whatsappPhoneNumberId !== undefined) {
      db.prepare('UPDATE restaurants SET whatsapp_phone_number_id = ? WHERE id = ?').run(
        params.whatsappPhoneNumberId,
        rid,
      );
    }
    if (params.whatsappAccessToken && params.whatsappAccessToken.trim().length > 0) {
      db.prepare('UPDATE restaurants SET whatsapp_access_token = ? WHERE id = ?').run(
        params.whatsappAccessToken.trim(),
        rid,
      );
    }
    if (typeof params.storefrontEnabled === 'boolean') {
      db.prepare('UPDATE restaurants SET storefront_enabled = ? WHERE id = ?').run(
        params.storefrontEnabled ? 1 : 0,
        rid,
      );
    }
    if (typeof params.deliveryEnabled === 'boolean') {
      db.prepare('UPDATE restaurants SET delivery_enabled = ? WHERE id = ?').run(
        params.deliveryEnabled ? 1 : 0,
        rid,
      );
    }
    if (params.deliveryZonesJson !== undefined) {
      db.prepare('UPDATE restaurants SET delivery_zones_json = ? WHERE id = ?').run(
        params.deliveryZonesJson,
        rid,
      );
    }
    if (params.pickupSlotsJson !== undefined) {
      db.prepare('UPDATE restaurants SET pickup_slots_json = ? WHERE id = ?').run(
        params.pickupSlotsJson,
        rid,
      );
    }
    if (typeof params.loyaltyEnabled === 'boolean') {
      db.prepare('UPDATE restaurants SET loyalty_enabled = ? WHERE id = ?').run(
        params.loyaltyEnabled ? 1 : 0,
        rid,
      );
    }
    if (params.loyaltyPointsPer1000Xof !== undefined) {
      db.prepare('UPDATE restaurants SET loyalty_points_per_1000_xof = ? WHERE id = ?').run(
        params.loyaltyPointsPer1000Xof,
        rid,
      );
    }
    if (params.loyaltyXofPerPoint !== undefined) {
      db.prepare('UPDATE restaurants SET loyalty_xof_per_point = ? WHERE id = ?').run(
        params.loyaltyXofPerPoint,
        rid,
      );
    }
  }

  findTicketsForRestaurant(rid: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, subject, category, priority, status, created_at as createdAt
         FROM support_tickets WHERE restaurant_id = ? ORDER BY created_at DESC`,
      )
      .all(rid);
  }

  createSupportTicket(params: {
    rid: string;
    email: string;
    fullName: string;
    role: string;
    subject: string;
    category: string;
    priority: string;
    message: string;
  }) {
    const db = getDb();
    const id = generateId('tkt');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO support_tickets (id, restaurant_id, created_by_email, subject, category, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
    ).run(
      id,
      params.rid,
      params.email,
      params.subject,
      params.category,
      params.priority,
      now,
    );
    db.prepare(
      `INSERT INTO ticket_messages (id, ticket_id, author, role, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('tmsg'), id, params.fullName, params.role, params.message, now);
    return id;
  }
}

export const restaurantRepository = new RestaurantRepository();
