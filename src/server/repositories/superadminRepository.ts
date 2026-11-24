import { getDb, generateId } from '../db.ts';
import { BaseRepository } from './BaseRepository.ts';

export class SuperadminRepository extends BaseRepository {
  constructor() {
    super({ tableName: 'tenants', tenantColumn: 'id' });
  }

  getPlatformDashboardData() {
    const db = getDb();
    const nowIso = new Date().toISOString();
    const inSevenDaysIso = new Date(Date.now() + 7 * 86_400_000).toISOString();

    const counts = db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'TRIAL' THEN 1 ELSE 0 END) as trial,
          SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) as suspended
         FROM restaurants WHERE deleted_at IS NULL`,
      )
      .get() as {
      total: number;
      active: number;
      trial: number;
      suspended: number;
    };

    const activeSubs = db
      .prepare(
        `SELECT COUNT(*) as c FROM subscriptions WHERE status IN ('ACTIVE', 'TRIAL')`,
      )
      .get() as { c: number };

    const mrrRow = db
      .prepare(
        `SELECT COALESCE(SUM(
            CASE
              WHEN s.billing_cycle = 'YEARLY' THEN ROUND(p.price_yearly_xof / 12.0)
              ELSE p.price_monthly_xof
            END
          ), 0) as mrr_xof
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         JOIN restaurants r ON r.id = s.restaurant_id
         WHERE s.status = 'ACTIVE' AND r.deleted_at IS NULL`,
      )
      .get() as { mrr_xof: number };

    const trialExpiringRow = db
      .prepare(
        `SELECT COUNT(*) as c
         FROM subscriptions s
         JOIN restaurants r ON r.id = s.restaurant_id
         WHERE s.status = 'TRIAL'
           AND r.deleted_at IS NULL
           AND COALESCE(s.trial_ends_at, s.current_period_end) >= ?
           AND COALESCE(s.trial_ends_at, s.current_period_end) <= ?`,
      )
      .get(nowIso, inSevenDaysIso) as { c: number };

    const platformRev = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount_xof ELSE 0 END), 0) as paid_xof,
          COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount_xof ELSE 0 END), 0) as pending_xof
         FROM platform_invoices`,
      )
      .get() as { paid_xof: number; pending_xof: number };

    const openTickets = db
      .prepare(
        `SELECT COUNT(*) as c FROM support_tickets WHERE status IN ('OPEN', 'IN_PROGRESS')`,
      )
      .get() as { c: number };

    const usersCount = db
      .prepare(`SELECT COUNT(*) as c FROM users WHERE status = 'ACTIVE'`)
      .get() as { c: number };

    const leadsCount = db
      .prepare(`SELECT COUNT(*) as c FROM contact_leads`)
      .get() as { c: number };

    const recentRestaurants = db
      .prepare(
        `SELECT r.id, r.name, r.city, r.status, r.created_at as createdAt,
                p.name as planName, s.status as subscriptionStatus
         FROM restaurants r
         LEFT JOIN subscriptions s ON s.restaurant_id = r.id
         LEFT JOIN plans p ON p.id = s.plan_id
         WHERE r.deleted_at IS NULL
         ORDER BY r.created_at DESC
         LIMIT 6`,
      )
      .all();

    const recentAudit = db
      .prepare(
        `SELECT id, actor_email as actorEmail, actor_role as actorRole,
                action, target_type as targetType, details, created_at as createdAt
         FROM audit_logs ORDER BY created_at DESC LIMIT 8`,
      )
      .all();

    const monthlyPlatformSeries = db
      .prepare(
        `SELECT substr(created_at, 1, 7) as month,
                COALESCE(SUM(amount_xof), 0) as revenue_xof,
                COALESCE(SUM(amount_xof), 0) as revenueXof,
                COUNT(*) as invoices
         FROM platform_invoices
         WHERE status = 'PAID'
         GROUP BY substr(created_at, 1, 7)
         ORDER BY month ASC`,
      )
      .all();

    return {
      counts,
      activeSubs,
      mrrRow,
      trialExpiringRow,
      platformRev,
      openTickets,
      usersCount,
      leadsCount,
      recentRestaurants,
      recentAudit,
      monthlyPlatformSeries,
    };
  }

  findAllRestaurants() {
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    return db
      .prepare(
        `SELECT r.id, r.name, r.slug, r.email, r.phone, r.address, r.city, r.country, r.status,
                r.paydunya_mode as paydunyaMode, r.created_at as createdAt, r.deleted_at as deletedAt,
                p.id as planId, p.code as planCode, p.name as planName,
                s.id as subscriptionId, s.status as subscriptionStatus,
                s.current_period_end as currentPeriodEnd, s.trial_ends_at as trialEndsAt,
                (SELECT u.full_name FROM restaurant_members rm JOIN users u ON u.id = rm.user_id WHERE rm.restaurant_id = r.id AND rm.role = 'OWNER' LIMIT 1) as ownerName,
                (SELECT u.email FROM restaurant_members rm JOIN users u ON u.id = rm.user_id WHERE rm.restaurant_id = r.id AND rm.role = 'OWNER' LIMIT 1) as ownerEmail,
                (SELECT COUNT(*) FROM orders o WHERE o.restaurant_id = r.id) as ordersCount,
                (SELECT COUNT(*) FROM dining_tables dt WHERE dt.restaurant_id = r.id) as tablesCount,
                (SELECT COUNT(*) FROM restaurant_members rm WHERE rm.restaurant_id = r.id AND rm.status = 'ACTIVE') as staffCount,
                (SELECT COALESCE(SUM(o.total_xof), 0) FROM orders o WHERE o.restaurant_id = r.id AND o.status = 'PAID' AND o.created_at >= ?) as monthlyVolumeXof
         FROM restaurants r
         LEFT JOIN subscriptions s ON s.restaurant_id = r.id
         LEFT JOIN plans p ON p.id = s.plan_id
         ORDER BY r.created_at DESC`,
      )
      .all(thirtyDaysAgo);
  }

  findRestaurantDetail(rid: string) {
    const db = getDb();
    const restaurant = db
      .prepare(
        `SELECT r.id, r.name, r.slug, r.email, r.phone, r.address, r.city, r.country, r.status,
                r.currency, r.timezone, r.tax_rate_percent as taxRatePercent,
                r.service_fee_percent as serviceFeePercent, r.opening_hours as openingHours,
                r.paydunya_mode as paydunyaMode, r.created_at as createdAt, r.deleted_at as deletedAt,
                p.id as planId, p.code as planCode, p.name as planName,
                s.id as subscriptionId, s.status as subscriptionStatus, s.billing_cycle as billingCycle,
                s.current_period_start as currentPeriodStart, s.current_period_end as currentPeriodEnd,
                s.trial_ends_at as trialEndsAt, s.auto_renew as autoRenew,
                (SELECT u.id FROM restaurant_members rm JOIN users u ON u.id = rm.user_id WHERE rm.restaurant_id = r.id AND rm.role = 'OWNER' LIMIT 1) as ownerUserId,
                (SELECT u.full_name FROM restaurant_members rm JOIN users u ON u.id = rm.user_id WHERE rm.restaurant_id = r.id AND rm.role = 'OWNER' LIMIT 1) as ownerName,
                (SELECT u.email FROM restaurant_members rm JOIN users u ON u.id = rm.user_id WHERE rm.restaurant_id = r.id AND rm.role = 'OWNER' LIMIT 1) as ownerEmail,
                (SELECT COUNT(*) FROM orders o WHERE o.restaurant_id = r.id) as ordersCount,
                (SELECT COUNT(*) FROM dining_tables dt WHERE dt.restaurant_id = r.id) as tablesCount,
                (SELECT COUNT(*) FROM restaurant_members rm WHERE rm.restaurant_id = r.id AND rm.status = 'ACTIVE') as staffCount,
                (SELECT COUNT(*) FROM menu_items mi WHERE mi.restaurant_id = r.id) as menuItemsCount
         FROM restaurants r
         LEFT JOIN subscriptions s ON s.restaurant_id = r.id
         LEFT JOIN plans p ON p.id = s.plan_id
         WHERE r.id = ?`,
      )
      .get(rid) as Record<string, unknown> | undefined;

    if (!restaurant) return null;

    const invoices = db
      .prepare(
        `SELECT id, invoice_number as invoiceNumber, amount_xof as amountXof, status,
                payment_method as paymentMethod, mode, paid_at as paidAt, created_at as createdAt
         FROM platform_invoices
         WHERE restaurant_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
      )
      .all(rid);

    return { restaurant, invoices };
  }

  updateRestaurantProfile(
    rid: string,
    patch: {
      name?: string;
      city?: string;
      phone?: string;
      email?: string;
      address?: string;
      country?: string;
    },
  ) {
    const db = getDb();
    db.prepare(
      `UPDATE restaurants
       SET name = COALESCE(?, name),
           city = COALESCE(?, city),
           phone = COALESCE(?, phone),
           email = COALESCE(?, email),
           address = COALESCE(?, address),
           country = COALESCE(?, country)
       WHERE id = ?`,
    ).run(
      patch.name ?? null,
      patch.city ?? null,
      patch.phone ?? null,
      patch.email ?? null,
      patch.address ?? null,
      patch.country ?? null,
      rid,
    );
  }

  findUserByEmail(email: string) {
    const db = getDb();
    return db
      .prepare('SELECT id FROM users WHERE lower(email) = lower(?)')
      .get(email) as { id: string } | undefined;
  }

  findUserById(userId: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, email, full_name, global_role, status, email_verified
         FROM users WHERE id = ?`,
      )
      .get(userId) as
      | {
          id: string;
          email: string;
          full_name: string;
          global_role: string;
          status: string;
          email_verified: number;
        }
      | undefined;
  }

  findPlanById(planId: string) {
    const db = getDb();
    return db
      .prepare('SELECT id, code, name, price_monthly_xof, price_yearly_xof, trial_days FROM plans WHERE id = ?')
      .get(planId) as
      | {
          id: string;
          code: string;
          name: string;
          price_monthly_xof: number;
          price_yearly_xof: number;
          trial_days: number;
        }
      | undefined;
  }

  findPlanByCodeOrDefault(planCode: string) {
    const db = getDb();
    const raw = String(planCode || '').trim().toUpperCase();
    const normalized = raw === 'PRO' ? 'PROFESSIONNEL' : raw;
    return (
      (db
        .prepare('SELECT id, code, name, trial_days FROM plans WHERE code = ?')
        .get(normalized) as
        | { id: string; code: string; name: string; trial_days: number }
        | undefined) ||
      (db
        .prepare('SELECT id, code, name, trial_days FROM plans ORDER BY price_monthly_xof ASC LIMIT 1')
        .get() as { id: string; code: string; name: string; trial_days: number })
    );
  }

  createRestaurantAdmin(params: {
    rid: string;
    uid: string;
    name: string;
    slug: string;
    cleanEmail: string;
    phone: string;
    city: string;
    ownerName: string;
    passwordHash: string;
    planId: string;
    now: string;
    periodEnd: string;
  }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO restaurants (id, name, slug, email, phone, city, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    ).run(
      params.rid,
      params.name,
      params.slug,
      params.cleanEmail,
      params.phone,
      params.city,
      params.now,
    );

    db.prepare(
      `INSERT INTO users (id, tenant_id, email, password_hash, full_name, phone, role, global_role, permissions_json, status, email_verified, email_verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'OWNER', 'USER', '[]', 'ACTIVE', 1, ?, ?)`,
    ).run(
      params.uid,
      params.rid,
      params.cleanEmail,
      params.passwordHash,
      params.ownerName,
      params.phone,
      params.now,
      params.now,
    );

    db.prepare(
      `INSERT INTO restaurant_members (id, restaurant_id, user_id, role, custom_permissions_json, status, created_at)
       VALUES (?, ?, ?, 'OWNER', '[]', 'ACTIVE', ?)`,
    ).run(generateId('mem'), params.rid, params.uid, params.now);

    db.prepare(
      `INSERT INTO subscriptions (id, restaurant_id, plan_id, billing_cycle, status, current_period_start, current_period_end, created_at)
       VALUES (?, ?, ?, 'MONTHLY', 'ACTIVE', ?, ?, ?)`,
    ).run(
      generateId('sub'),
      params.rid,
      params.planId,
      params.now,
      params.periodEnd,
      params.now,
    );
  }

  updateRestaurantStatus(rid: string, status: string) {
    const db = getDb();
    const now = new Date().toISOString();
    if (status === 'DELETED') {
      db.prepare(
        `UPDATE restaurants SET status = 'DELETED', deleted_at = ? WHERE id = ?`,
      ).run(now, rid);
    } else {
      db.prepare(
        `UPDATE restaurants SET status = ?, deleted_at = NULL WHERE id = ?`,
      ).run(status, rid);
    }

    if (status === 'SUSPENDED' || status === 'DELETED') {
      db.prepare(
        `UPDATE sessions SET revoked_at = ? WHERE restaurant_id = ? AND revoked_at IS NULL`,
      ).run(now, rid);
    }
  }

  findAllPlans() {
    const db = getDb();
    return db
      .prepare('SELECT * FROM plans ORDER BY price_monthly_xof ASC')
      .all() as Array<Record<string, unknown>>;
  }

  createPlan(params: {
    id: string;
    code: string;
    name: string;
    tagline: string;
    priceMonthlyXof: number;
    priceYearlyXof: number;
    trialDays: number;
    maxTables: number;
    maxStaff: number;
    maxMenuItems: number;
    isFeatured: number;
    featuresJson: string;
    active: number;
    now: string;
  }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO plans (
        id, code, name, tagline, price_monthly_xof, price_yearly_xof,
        trial_days, max_tables, max_staff, max_menu_items,
        is_demo_pricing, is_featured, features_json, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    ).run(
      params.id,
      params.code,
      params.name,
      params.tagline,
      params.priceMonthlyXof,
      params.priceYearlyXof,
      params.trialDays,
      params.maxTables,
      params.maxStaff,
      params.maxMenuItems,
      params.isFeatured,
      params.featuresJson,
      params.active,
      params.now,
    );
  }

  updatePlan(
    planId: string,
    params: {
      name: string | null;
      tagline: string | null;
      priceMonthlyXof: number | null;
      priceYearlyXof: number | null;
      trialDays: number | null;
      maxTables: number | null;
      maxStaff: number | null;
      maxMenuItems: number | null;
      featuresJson: string | null;
      isFeatured: number | null;
      active: number | null;
    },
  ) {
    const db = getDb();
    db.prepare(
      `UPDATE plans
       SET name = COALESCE(?, name),
           tagline = COALESCE(?, tagline),
           price_monthly_xof = COALESCE(?, price_monthly_xof),
           price_yearly_xof = COALESCE(?, price_yearly_xof),
           trial_days = COALESCE(?, trial_days),
           max_tables = COALESCE(?, max_tables),
           max_staff = COALESCE(?, max_staff),
           max_menu_items = COALESCE(?, max_menu_items),
           features_json = COALESCE(?, features_json),
           is_featured = COALESCE(?, is_featured),
           active = COALESCE(?, active)
       WHERE id = ?`,
    ).run(
      params.name,
      params.tagline,
      params.priceMonthlyXof,
      params.priceYearlyXof,
      params.trialDays,
      params.maxTables,
      params.maxStaff,
      params.maxMenuItems,
      params.featuresJson,
      params.isFeatured,
      params.active,
      planId,
    );
  }

  findAllSubscriptions() {
    const db = getDb();
    return db
      .prepare(
        `SELECT s.id, s.restaurant_id as restaurantId, r.name as restaurantName, r.status as restaurantStatus,
                s.plan_id as planId, p.name as planName, p.code as planCode,
                p.price_monthly_xof as priceMonthlyXof, p.price_yearly_xof as priceYearlyXof,
                s.billing_cycle as billingCycle, s.status,
                s.auto_renew as autoRenew, s.preferred_payment_method as preferredPaymentMethod,
                s.trial_ends_at as trialEndsAt, s.current_period_start as currentPeriodStart,
                s.current_period_end as currentPeriodEnd
         FROM subscriptions s
         JOIN restaurants r ON r.id = s.restaurant_id
         JOIN plans p ON p.id = s.plan_id
         WHERE r.deleted_at IS NULL
         ORDER BY s.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>;
  }

  findSubscriptionById(subId: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, restaurant_id, plan_id, billing_cycle, status, trial_ends_at,
                current_period_start, current_period_end, auto_renew
         FROM subscriptions WHERE id = ?`,
      )
      .get(subId) as
      | {
          id: string;
          restaurant_id: string;
          plan_id: string;
          billing_cycle: string;
          status: string;
          trial_ends_at: string | null;
          current_period_start: string;
          current_period_end: string;
          auto_renew: number;
        }
      | undefined;
  }

  updateSubscription(
    subId: string,
    patch: {
      planId?: string;
      billingCycle?: string;
      status?: string;
      currentPeriodEnd?: string;
      trialEndsAt?: string | null;
      autoRenew?: number;
    },
  ) {
    const db = getDb();
    db.prepare(
      `UPDATE subscriptions
       SET plan_id = COALESCE(?, plan_id),
           billing_cycle = COALESCE(?, billing_cycle),
           status = COALESCE(?, status),
           current_period_end = COALESCE(?, current_period_end),
           trial_ends_at = CASE WHEN ? IS NOT NULL THEN ? ELSE trial_ends_at END,
           auto_renew = COALESCE(?, auto_renew)
       WHERE id = ?`,
    ).run(
      patch.planId ?? null,
      patch.billingCycle ?? null,
      patch.status ?? null,
      patch.currentPeriodEnd ?? null,
      patch.trialEndsAt === undefined ? null : 'SET',
      patch.trialEndsAt ?? null,
      patch.autoRenew ?? null,
      subId,
    );
  }

  findPlatformInvoices() {
    const db = getDb();
    return db
      .prepare(
        `SELECT i.id, i.invoice_number as invoiceNumber, i.restaurant_id as restaurantId,
                r.name as restaurantName, i.subscription_id as subscriptionId,
                i.plan_id as planId, p.name as planName,
                i.billing_cycle as billingCycle, i.is_renewal as isRenewal,
                i.amount_xof as amountXof, i.status,
                i.payment_method as paymentMethod, i.mode, i.paid_at as paidAt, i.created_at as createdAt
         FROM platform_invoices i
         JOIN restaurants r ON r.id = i.restaurant_id
         LEFT JOIN plans p ON p.id = i.plan_id
         ORDER BY i.created_at DESC`,
      )
      .all();
  }

  findInvoiceById(invoiceId: string) {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, invoice_number, restaurant_id, subscription_id, amount_xof,
                status, payment_method, mode, plan_id, billing_cycle, is_renewal, paid_at
         FROM platform_invoices WHERE id = ?`,
      )
      .get(invoiceId) as
      | {
          id: string;
          invoice_number: string;
          restaurant_id: string;
          subscription_id: string | null;
          amount_xof: number;
          status: string;
          payment_method: string;
          mode: string;
          plan_id: string | null;
          billing_cycle: string | null;
          is_renewal: number | null;
          paid_at: string | null;
        }
      | undefined;
  }

  markInvoicePaidAndActivate(invoiceId: string) {
    const db = getDb();
    const invoice = this.findInvoiceById(invoiceId);
    if (!invoice) return null;

    const now = new Date();
    const nowIso = now.toISOString();

    db.prepare(
      `UPDATE platform_invoices SET status = 'PAID', paid_at = ? WHERE id = ?`,
    ).run(nowIso, invoiceId);

    const rid = invoice.restaurant_id;
    const existingSub = db
      .prepare(
        `SELECT id, plan_id, billing_cycle, current_period_end
         FROM subscriptions WHERE restaurant_id = ? LIMIT 1`,
      )
      .get(rid) as
      | {
          id: string;
          plan_id: string;
          billing_cycle: string;
          current_period_end: string;
        }
      | undefined;

    const cycle =
      invoice.billing_cycle === 'YEARLY' || existingSub?.billing_cycle === 'YEARLY'
        ? 'YEARLY'
        : 'MONTHLY';
    const days = cycle === 'YEARLY' ? 365 : 30;
    const baseMs =
      invoice.is_renewal && existingSub?.current_period_end
        ? Math.max(now.getTime(), new Date(existingSub.current_period_end).getTime())
        : now.getTime();
    const periodEnd = new Date(baseMs + days * 86_400_000).toISOString();
    const planId = invoice.plan_id || existingSub?.plan_id || 'plan_essentiel';

    let subscriptionId = existingSub?.id || null;
    if (existingSub) {
      db.prepare(
        `UPDATE subscriptions
         SET plan_id = ?, billing_cycle = ?, status = 'ACTIVE',
             current_period_start = ?, current_period_end = ?, trial_ends_at = NULL
         WHERE id = ?`,
      ).run(planId, cycle, nowIso, periodEnd, existingSub.id);
    } else {
      subscriptionId = generateId('sub');
      db.prepare(
        `INSERT INTO subscriptions (
          id, restaurant_id, plan_id, billing_cycle, status, trial_ends_at,
          current_period_start, current_period_end, created_at
        ) VALUES (?, ?, ?, ?, 'ACTIVE', NULL, ?, ?, ?)`,
      ).run(subscriptionId, rid, planId, cycle, nowIso, periodEnd, nowIso);
    }

    db.prepare(
      `UPDATE restaurants
       SET status = 'ACTIVE', deleted_at = NULL
       WHERE id = ? AND status != 'DELETED'`,
    ).run(rid);

    return {
      restaurantId: rid,
      subscriptionId,
      invoiceNumber: invoice.invoice_number,
      periodEnd,
    };
  }

  createManualInvoice(params: {
    id: string;
    invoiceNumber: string;
    restaurantId: string;
    subscriptionId: string | null;
    planId: string | null;
    billingCycle: 'MONTHLY' | 'YEARLY';
    amountXof: number;
    paymentMethod: string;
    status: 'PENDING' | 'PAID';
    now: string;
  }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO platform_invoices (
        id, invoice_number, restaurant_id, subscription_id, amount_xof,
        status, payment_method, mode, plan_id, billing_cycle, is_renewal,
        paid_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'LIVE', ?, ?, 0, ?, ?)`,
    ).run(
      params.id,
      params.invoiceNumber,
      params.restaurantId,
      params.subscriptionId,
      params.amountXof,
      params.status,
      params.paymentMethod,
      params.planId,
      params.billingCycle,
      params.status === 'PAID' ? params.now : null,
      params.now,
    );
  }

  updateInvoiceStatus(invoiceId: string, status: string) {
    const db = getDb();
    db.prepare(`UPDATE platform_invoices SET status = ? WHERE id = ?`).run(
      status,
      invoiceId,
    );
  }

  findAllUsers() {
    const db = getDb();
    const nowIso = new Date().toISOString();
    return db
      .prepare(
        `SELECT u.id, u.email, u.full_name as fullName, u.phone, u.global_role as globalRole,
                u.status, u.email_verified as emailVerified, u.last_login_at as lastLoginAt,
                u.created_at as createdAt,
                MIN(r.name) as restaurantName,
                MIN(rm.role) as restaurantRole,
                (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ?) as activeSessionsCount
         FROM users u
         LEFT JOIN restaurant_members rm ON rm.user_id = u.id
         LEFT JOIN restaurants r ON r.id = rm.restaurant_id
         GROUP BY u.id
         ORDER BY u.created_at DESC`,
      )
      .all(nowIso);
  }

  createSuperAdminUser(params: {
    id: string;
    email: string;
    passwordHash: string;
    fullName: string;
    phone: string;
    now: string;
  }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO users (
        id, tenant_id, email, password_hash, full_name, phone,
        role, global_role, permissions_json, status, email_verified, email_verified_at, created_at
      ) VALUES (?, NULL, ?, ?, ?, ?, 'SUPER_ADMIN', 'SUPER_ADMIN', '["superadmin:all"]', 'ACTIVE', 1, ?, ?)`,
    ).run(
      params.id,
      params.email,
      params.passwordHash,
      params.fullName,
      params.phone,
      params.now,
      params.now,
    );
  }

  updateUserStatus(userId: string, status: string) {
    const db = getDb();
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
    if (status !== 'ACTIVE') {
      db.prepare(
        'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
      ).run(new Date().toISOString(), userId);
    }
  }

  findAllTicketsAndLeads() {
    const db = getDb();
    const tickets = db
      .prepare(
        `SELECT t.id, t.restaurant_id as restaurantId, r.name as restaurantName,
                t.created_by_email as createdByEmail, t.subject, t.category,
                t.priority, t.status, t.created_at as createdAt
         FROM support_tickets t
         LEFT JOIN restaurants r ON r.id = t.restaurant_id
         ORDER BY t.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>;

    const getMsgs = db.prepare(
      `SELECT id, author, role, body, created_at as createdAt
       FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`,
    );

    const leads = db
      .prepare(
        `SELECT id, lead_type as leadType, full_name as fullName, email, phone,
                restaurant_name as restaurantName, city, message,
                COALESCE(status, 'NEW') as status,
                COALESCE(admin_notes, '') as adminNotes,
                converted_restaurant_id as convertedRestaurantId,
                created_at as createdAt
         FROM contact_leads ORDER BY created_at DESC LIMIT 200`,
      )
      .all();

    return {
      tickets: tickets.map((t) => ({ ...t, messages: getMsgs.all(String(t.id)) })),
      leads,
    };
  }

  createSupportTicket(params: {
    ticketId: string;
    msgId: string;
    restaurantId: string | null;
    createdByEmail: string;
    author: string;
    subject: string;
    category: string;
    priority: string;
    body: string;
    now: string;
  }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO support_tickets (
        id, restaurant_id, created_by_email, subject, category, priority, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
    ).run(
      params.ticketId,
      params.restaurantId,
      params.createdByEmail,
      params.subject,
      params.category,
      params.priority,
      params.now,
    );
    db.prepare(
      `INSERT INTO ticket_messages (id, ticket_id, author, role, body, created_at)
       VALUES (?, ?, ?, 'SUPER_ADMIN', ?, ?)`,
    ).run(params.msgId, params.ticketId, params.author, params.body, params.now);
  }

  findLeadById(leadId: string) {
    const db = getDb();
    return db
      .prepare('SELECT * FROM contact_leads WHERE id = ?')
      .get(leadId) as
      | {
          id: string;
          lead_type: string;
          full_name: string;
          email: string;
          phone: string;
          restaurant_name: string;
          city: string;
          message: string;
          status: string;
          admin_notes: string;
          converted_restaurant_id: string | null;
        }
      | undefined;
  }

  updateLead(
    leadId: string,
    patch: {
      status?: string;
      adminNotes?: string;
      convertedRestaurantId?: string;
    },
  ) {
    const db = getDb();
    db.prepare(
      `UPDATE contact_leads
       SET status = COALESCE(?, status),
           admin_notes = COALESCE(?, admin_notes),
           converted_restaurant_id = COALESCE(?, converted_restaurant_id)
       WHERE id = ?`,
    ).run(
      patch.status ?? null,
      patch.adminNotes ?? null,
      patch.convertedRestaurantId ?? null,
      leadId,
    );
  }

  addTicketReply(ticketId: string, author: string, body?: string, status?: string) {
    const db = getDb();
    const now = new Date().toISOString();
    if (body && body.trim().length > 0) {
      db.prepare(
        `INSERT INTO ticket_messages (id, ticket_id, author, role, body, created_at)
         VALUES (?, ?, ?, 'SUPER_ADMIN', ?, ?)`,
      ).run(generateId('tmsg'), ticketId, author, body.trim(), now);
    }
    if (status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
      db.prepare('UPDATE support_tickets SET status = ? WHERE id = ?').run(
        status,
        ticketId,
      );
    }
  }

  findAuditLogs(filters?: {
    q?: string;
    action?: string;
    targetType?: string;
    restaurantId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const db = getDb();
    const where: string[] = ['1=1'];
    const args: unknown[] = [];

    if (filters?.q?.trim()) {
      const pattern = `%${filters.q.trim().toLowerCase()}%`;
      where.push(
        '(lower(actor_email) LIKE ? OR lower(action) LIKE ? OR lower(COALESCE(details, \'\')) LIKE ? OR lower(target_id) LIKE ?)',
      );
      args.push(pattern, pattern, pattern, pattern);
    }
    if (filters?.action?.trim()) {
      where.push('upper(action) LIKE ?');
      args.push(`%${filters.action.trim().toUpperCase()}%`);
    }
    if (filters?.targetType?.trim()) {
      where.push('upper(target_type) = ?');
      args.push(filters.targetType.trim().toUpperCase());
    }
    if (filters?.restaurantId?.trim()) {
      where.push('restaurant_id = ?');
      args.push(filters.restaurantId.trim());
    }
    if (filters?.from?.trim()) {
      where.push('created_at >= ?');
      args.push(filters.from.trim());
    }
    if (filters?.to?.trim()) {
      where.push('created_at <= ?');
      args.push(`${filters.to.trim()}T23:59:59.999Z`);
    }

    const whereSql = where.join(' AND ');
    const limit = Math.min(Math.max(Number(filters?.limit || 200), 1), 1000);
    const offset = Math.max(Number(filters?.offset || 0), 0);

    const totalRow = db
      .prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE ${whereSql}`)
      .get(...args) as { c: number };

    const logs = db
      .prepare(
        `SELECT id, actor_user_id as actorUserId, actor_email as actorEmail, actor_role as actorRole,
                restaurant_id as restaurantId, action, target_type as targetType,
                target_id as targetId, details, created_at as createdAt
         FROM audit_logs
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...args, limit, offset);

    return { logs, total: Number(totalRow.c || 0) };
  }

  findPlatformSettings() {
    const db = getDb();
    return db
      .prepare('SELECT key, value FROM platform_settings')
      .all() as Array<{ key: string; value: string }>;
  }

  upsertPlatformSettings(entries: Array<[string, string]>) {
    const db = getDb();
    const now = new Date().toISOString();
    const upsert = db.prepare(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );
    for (const [k, v] of entries) {
      upsert.run(k, v, now);
    }
  }
}

export const superadminRepository = new SuperadminRepository();
