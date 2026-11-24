import type { Database as SqliteDatabase } from 'better-sqlite3';
import { generateId } from '../db.ts';
import { AppError } from './errors.ts';
import type {
  DeliveryZone,
  MenuOption,
  MenuOptionGroup,
  Promotion,
} from '../../types/index.ts';

export function parseOptionGroups(raw: unknown): MenuOptionGroup[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((g) => {
        const grp = (g || {}) as Record<string, unknown>;
        const name = String(grp.name || '').trim();
        if (!name) return null;
        const choicesRaw = Array.isArray(grp.choices) ? grp.choices : [];
        const choices: MenuOption[] = choicesRaw
          .map((c) => {
            const ch = (c || {}) as Record<string, unknown>;
            const label = String(ch.label || '').trim();
            if (!label) return null;
            return {
              id:
                typeof ch.id === 'string' && ch.id.trim()
                  ? ch.id.trim()
                  : generateId('opt'),
              label,
              priceDeltaXof: Math.max(
                0,
                Math.round(Number(ch.priceDeltaXof || 0)),
              ),
            };
          })
          .filter((x): x is MenuOption => x !== null);
        if (choices.length === 0) return null;
        return {
          id:
            typeof grp.id === 'string' && grp.id.trim()
              ? grp.id.trim()
              : generateId('grp'),
          name,
          required: Boolean(grp.required),
          multiple: Boolean(grp.multiple),
          choices,
        };
      })
      .filter((x): x is MenuOptionGroup => x !== null);
  } catch {
    return [];
  }
}

export function sanitizeOptionGroups(raw: unknown): MenuOptionGroup[] {
  return parseOptionGroups(raw);
}

export function parseDeliveryZones(raw: unknown): DeliveryZone[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((z) => {
        const obj = (z || {}) as Record<string, unknown>;
        const name = String(obj.name || '').trim();
        if (!name) return null;
        return {
          id:
            typeof obj.id === 'string' && obj.id.trim()
              ? obj.id.trim()
              : generateId('zone'),
          name,
          feeXof: Math.max(0, Math.round(Number(obj.feeXof || 0))),
          minOrderXof: Math.max(0, Math.round(Number(obj.minOrderXof || 0))),
        };
      })
      .filter((x): x is DeliveryZone => x !== null);
  } catch {
    return [];
  }
}

export function parsePickupSlots(raw: unknown): string[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => String(s || '').trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

export function mapPromotionRow(r: Record<string, unknown>): Promotion {
  let days: number[] = [0, 1, 2, 3, 4, 5, 6];
  try {
    const parsed = JSON.parse(String(r.days_json || '[0,1,2,3,4,5,6]'));
    if (Array.isArray(parsed)) {
      days = parsed.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    }
  } catch {
    days = [0, 1, 2, 3, 4, 5, 6];
  }
  return {
    id: String(r.id),
    restaurantId: String(r.restaurant_id),
    name: String(r.name),
    code: r.code ? String(r.code) : null,
    promoType: r.promo_type === 'HAPPY_HOUR' ? 'HAPPY_HOUR' : 'PROMO_CODE',
    discountType: r.discount_type === 'FIXED_XOF' ? 'FIXED_XOF' : 'PERCENT',
    discountValue: Number(r.discount_value || 0),
    minOrderXof: Number(r.min_order_xof || 0),
    days,
    startTime: String(r.start_time || '00:00'),
    endTime: String(r.end_time || '23:59'),
    categoryId: r.category_id ? String(r.category_id) : null,
    maxUses: r.max_uses != null ? Number(r.max_uses) : null,
    usesCount: Number(r.uses_count || 0),
    active: Boolean(r.active),
    createdAt: String(r.created_at),
  };
}

export function isScheduleActiveNow(
  days: number[],
  startTime: string,
  endTime: string,
  now = new Date(),
): boolean {
  const day = now.getDay();
  if (days.length > 0 && !days.includes(day)) return false;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const cur = `${hh}:${mm}`;
  if (startTime <= endTime) {
    return cur >= startTime && cur <= endTime;
  }
  // Overnight range e.g. 22:00 - 02:00
  return cur >= startTime || cur <= endTime;
}

export function loadActivePromotions(
  db: SqliteDatabase,
  restaurantId: string,
): Promotion[] {
  const rows = db
    .prepare('SELECT * FROM promotions WHERE restaurant_id = ? AND active = 1')
    .all(restaurantId) as Array<Record<string, unknown>>;
  return rows.map(mapPromotionRow);
}

export function computeHappyHourForItem(params: {
  basePriceXof: number;
  categoryId: string;
  promotions: Promotion[];
  now?: Date;
}): { effectivePriceXof: number; promoLabel: string | null } {
  const now = params.now || new Date();
  let bestPrice = params.basePriceXof;
  let bestLabel: string | null = null;

  for (const promo of params.promotions) {
    if (promo.promoType !== 'HAPPY_HOUR' || !promo.active) continue;
    if (promo.categoryId && promo.categoryId !== params.categoryId) continue;
    if (!isScheduleActiveNow(promo.days, promo.startTime, promo.endTime, now)) {
      continue;
    }
    const candidate =
      promo.discountType === 'PERCENT'
        ? Math.max(
            0,
            Math.round(params.basePriceXof * (1 - promo.discountValue / 100)),
          )
        : Math.max(0, params.basePriceXof - promo.discountValue);
    if (candidate < bestPrice) {
      bestPrice = candidate;
      bestLabel =
        promo.discountType === 'PERCENT'
          ? `${promo.name} (-${promo.discountValue}%)`
          : `${promo.name} (-${promo.discountValue} FCFA)`;
    }
  }

  return { effectivePriceXof: bestPrice, promoLabel: bestLabel };
}

export function resolveItemOptionsSelection(params: {
  itemName: string;
  legacyOptionsJson: unknown;
  optionGroupsJson: unknown;
  selectedOptionIds: string[];
}): { optionsSummary: string; optionsDeltaXof: number } {
  const selectedSet = new Set(params.selectedOptionIds.map(String));
  const groups = parseOptionGroups(params.optionGroupsJson);
  const legacyOptions = (() => {
    try {
      const arr = JSON.parse(String(params.legacyOptionsJson || '[]'));
      return Array.isArray(arr)
        ? (arr as Array<{ id: string; label: string; priceDeltaXof: number }>)
        : [];
    } catch {
      return [];
    }
  })();

  const pickedLabels: string[] = [];
  const usedIds = new Set<string>();
  let totalDelta = 0;

  for (const group of groups) {
    const chosenInGroup = group.choices.filter((c) => selectedSet.has(c.id));
    if (group.required && chosenInGroup.length === 0) {
      throw new AppError(
        400,
        `Veuillez sélectionner une option obligatoire pour « ${group.name} » (${params.itemName}).`,
      );
    }
    const effectiveChosen = group.multiple
      ? chosenInGroup
      : chosenInGroup.slice(0, 1);
    for (const c of effectiveChosen) {
      usedIds.add(c.id);
      pickedLabels.push(`${group.name}: ${c.label}`);
      totalDelta += Number(c.priceDeltaXof || 0);
    }
  }

  for (const leg of legacyOptions) {
    if (selectedSet.has(leg.id) && !usedIds.has(leg.id)) {
      usedIds.add(leg.id);
      pickedLabels.push(String(leg.label));
      totalDelta += Number(leg.priceDeltaXof || 0);
    }
  }

  return {
    optionsSummary: pickedLabels.join(' · '),
    optionsDeltaXof: Math.max(0, Math.round(totalDelta)),
  };
}

export function normalizePhoneKey(raw: string): string {
  return raw.replace(/[^\d+]/g, '').trim();
}

export function resolveLoyaltyForPhone(
  db: SqliteDatabase,
  restaurantId: string,
  phone: string,
) {
  const cleanPhone = normalizePhoneKey(phone);
  if (cleanPhone.length < 6) return null;
  const digitsTail = cleanPhone.replace(/\D/g, '').slice(-8);
  const resto = db
    .prepare(
      `SELECT loyalty_enabled, loyalty_points_per_1000_xof, loyalty_xof_per_point
       FROM restaurants WHERE id = ?`,
    )
    .get(restaurantId) as
    | {
        loyalty_enabled: number;
        loyalty_points_per_1000_xof: number;
        loyalty_xof_per_point: number;
      }
    | undefined;

  const customer = db
    .prepare(
      `SELECT id, full_name, phone, loyalty_points, total_spent_xof, visits_count
       FROM customers
       WHERE restaurant_id = ? AND (phone = ? OR replace(replace(phone, ' ', ''), '+', '') LIKE ?)
       LIMIT 1`,
    )
    .get(restaurantId, cleanPhone, `%${digitsTail}`) as
    | {
        id: string;
        full_name: string;
        phone: string;
        loyalty_points: number;
        total_spent_xof: number;
        visits_count: number;
      }
    | undefined;

  return {
    loyaltyEnabled: Boolean(resto?.loyalty_enabled ?? 1),
    pointsPer1000Xof: Number(resto?.loyalty_points_per_1000_xof || 10),
    xofPerPoint: Number(resto?.loyalty_xof_per_point || 25),
    customer: customer
      ? {
          id: customer.id,
          fullName: customer.full_name,
          phone: customer.phone,
          loyaltyPoints: Number(customer.loyalty_points || 0),
          totalSpentXof: Number(customer.total_spent_xof || 0),
          visitsCount: Number(customer.visits_count || 0),
        }
      : null,
  };
}

export function applyOrderPromoAndLoyaltyDiscounts(params: {
  db: SqliteDatabase;
  restaurantId: string;
  grossXof: number;
  manualDiscountXof?: number;
  promoCode?: string;
  customerPhone?: string;
  loyaltyPointsToUse?: number;
  orderId: string;
  orderNumber: string;
  nowIso: string;
}): {
  discountXof: number;
  appliedPromoCode: string;
  loyaltyPointsUsed: number;
} {
  let discount = Math.max(0, Math.round(Number(params.manualDiscountXof || 0)));
  let appliedPromoCode = '';

  const rawCode = String(params.promoCode || '').trim().toUpperCase();
  if (rawCode) {
    const promoRow = params.db
      .prepare(
        `SELECT * FROM promotions
         WHERE restaurant_id = ? AND upper(code) = ? AND promo_type = 'PROMO_CODE' AND active = 1`,
      )
      .get(params.restaurantId, rawCode) as Record<string, unknown> | undefined;

    if (!promoRow) {
      throw new AppError(400, `Code promo « ${rawCode} » invalide ou expiré.`);
    }
    const promo = mapPromotionRow(promoRow);
    if (!isScheduleActiveNow(promo.days, promo.startTime, promo.endTime)) {
      throw new AppError(
        400,
        `Le code promo « ${rawCode} » n’est pas actif sur ce créneau.`,
      );
    }
    if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
      throw new AppError(
        400,
        `Le code promo « ${rawCode} » a atteint son nombre maximum d’utilisations.`,
      );
    }
    if (params.grossXof < promo.minOrderXof) {
      throw new AppError(
        400,
        `Minimum de commande requis pour « ${rawCode} » : ${promo.minOrderXof} FCFA.`,
      );
    }

    const promoDiscount =
      promo.discountType === 'PERCENT'
        ? Math.round((params.grossXof * promo.discountValue) / 100)
        : promo.discountValue;

    discount += Math.max(0, promoDiscount);
    appliedPromoCode = rawCode;
    params.db
      .prepare('UPDATE promotions SET uses_count = uses_count + 1 WHERE id = ?')
      .run(promo.id);
  }

  let loyaltyPointsUsed = 0;
  const requestedPts = Math.max(
    0,
    Math.floor(Number(params.loyaltyPointsToUse || 0)),
  );
  if (requestedPts > 0) {
    const cleanPhone = normalizePhoneKey(String(params.customerPhone || ''));
    if (cleanPhone.length < 6) {
      throw new AppError(
        400,
        'Numéro de téléphone requis pour utiliser vos points de fidélité.',
      );
    }
    const loyaltyInfo = resolveLoyaltyForPhone(
      params.db,
      params.restaurantId,
      cleanPhone,
    );
    if (!loyaltyInfo || !loyaltyInfo.loyaltyEnabled) {
      throw new AppError(
        400,
        'Le programme de fidélité n’est pas activé sur cet établissement.',
      );
    }
    if (!loyaltyInfo.customer || loyaltyInfo.customer.loyaltyPoints < requestedPts) {
      throw new AppError(
        400,
        'Solde de points fidélité insuffisant pour ce numéro.',
      );
    }

    const loyaltyDiscount = requestedPts * loyaltyInfo.xofPerPoint;
    loyaltyPointsUsed = requestedPts;
    discount += loyaltyDiscount;

    params.db
      .prepare(
        `UPDATE customers
         SET loyalty_points = MAX(0, loyalty_points - ?)
         WHERE id = ? AND restaurant_id = ?`,
      )
      .run(loyaltyPointsUsed, loyaltyInfo.customer.id, params.restaurantId);

    params.db
      .prepare(
        `INSERT INTO loyalty_transactions (
          id, restaurant_id, customer_id, order_id, points_delta, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        generateId('ltx'),
        params.restaurantId,
        loyaltyInfo.customer.id,
        params.orderId,
        -loyaltyPointsUsed,
        `Échange remise · ${params.orderNumber}`,
        params.nowIso,
      );
  }

  return {
    discountXof: Math.min(params.grossXof, discount),
    appliedPromoCode,
    loyaltyPointsUsed,
  };
}

export function awardLoyaltyPointsOnPaidOrder(
  db: SqliteDatabase,
  restaurantId: string,
  orderId: string,
): number {
  const order = db
    .prepare(
      `SELECT id, order_number, customer_name, customer_phone, total_xof, status, loyalty_points_earned
       FROM orders WHERE id = ? AND restaurant_id = ?`,
    )
    .get(orderId, restaurantId) as
    | {
        id: string;
        order_number: string;
        customer_name: string;
        customer_phone: string;
        total_xof: number;
        status: string;
        loyalty_points_earned: number;
      }
    | undefined;

  if (!order || order.status !== 'PAID') return 0;
  if (Number(order.loyalty_points_earned || 0) > 0) {
    return Number(order.loyalty_points_earned);
  }

  const cleanPhone = normalizePhoneKey(String(order.customer_phone || ''));
  if (cleanPhone.length < 6) return 0;

  const info = resolveLoyaltyForPhone(db, restaurantId, cleanPhone);
  if (!info || !info.loyaltyEnabled) return 0;

  const earned = Math.floor(
    (Number(order.total_xof || 0) / 1000) * info.pointsPer1000Xof,
  );
  const now = new Date().toISOString();

  let customerId = info.customer?.id;
  if (!customerId) {
    customerId = generateId('cust');
    db.prepare(
      `INSERT INTO customers (
        id, restaurant_id, full_name, phone, email, loyalty_points,
        total_spent_xof, visits_count, preferences, created_at
      ) VALUES (?, ?, ?, ?, '', ?, ?, 1, '', ?)`,
    ).run(
      customerId,
      restaurantId,
      String(order.customer_name || 'Client').slice(0, 80),
      cleanPhone,
      earned,
      Number(order.total_xof || 0),
      now,
    );
  } else {
    db.prepare(
      `UPDATE customers
       SET loyalty_points = loyalty_points + ?,
           total_spent_xof = total_spent_xof + ?,
           visits_count = visits_count + 1
       WHERE id = ? AND restaurant_id = ?`,
    ).run(earned, Number(order.total_xof || 0), customerId, restaurantId);
  }

  if (earned > 0) {
    db.prepare(
      `INSERT INTO loyalty_transactions (
        id, restaurant_id, customer_id, order_id, points_delta, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      generateId('ltx'),
      restaurantId,
      customerId,
      order.id,
      earned,
      `Commande payée · ${order.order_number}`,
      now,
    );
    db.prepare(
      'UPDATE orders SET loyalty_points_earned = ? WHERE id = ? AND restaurant_id = ?',
    ).run(earned, order.id, restaurantId);
  }

  return earned;
}
