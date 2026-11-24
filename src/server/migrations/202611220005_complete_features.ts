import type { Knex } from 'knex';

/**
 * Migration Knex pour les fonctionnalités complètes :
 * - Vérification e-mail, tokens de réinitialisation, code PIN caisse
 * - Coordonnées plan de salle visuel sur dining_tables
 * - Configuration & journaux WhatsApp Cloud API
 * - Bons de commande fournisseurs (purchase_orders & purchase_order_items)
 * - Workflow de suivi des prospects sur contact_leads
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('users')) {
    if (!(await knex.schema.hasColumn('users', 'email_verified'))) {
      await knex.schema.alterTable('users', (t) => {
        t.integer('email_verified').notNullable().defaultTo(0);
        t.string('email_verified_at');
        t.string('pin_hash');
      });
    }
  }

  if (!(await knex.schema.hasTable('auth_tokens'))) {
    await knex.schema.createTable('auth_tokens', (t) => {
      t.string('id').primary();
      t.string('user_id').notNullable();
      t.string('email').notNullable();
      t.string('token_hash').notNullable();
      t.string('token_type').notNullable();
      t.string('expires_at').notNullable();
      t.string('used_at');
      t.string('created_at').notNullable();
    });
  }

  if (await knex.schema.hasTable('dining_tables')) {
    if (!(await knex.schema.hasColumn('dining_tables', 'pos_x'))) {
      await knex.schema.alterTable('dining_tables', (t) => {
        t.integer('pos_x').notNullable().defaultTo(40);
        t.integer('pos_y').notNullable().defaultTo(40);
        t.string('shape').notNullable().defaultTo('ROUND');
      });
    }
  }

  if (await knex.schema.hasTable('restaurants')) {
    if (!(await knex.schema.hasColumn('restaurants', 'whatsapp_enabled'))) {
      await knex.schema.alterTable('restaurants', (t) => {
        t.integer('whatsapp_enabled').notNullable().defaultTo(0);
        t.string('whatsapp_phone_number_id').notNullable().defaultTo('');
        t.string('whatsapp_access_token').notNullable().defaultTo('');
      });
    }
  }

  if (!(await knex.schema.hasTable('purchase_orders'))) {
    await knex.schema.createTable('purchase_orders', (t) => {
      t.string('id').primary();
      t.string('restaurant_id').notNullable();
      t.string('po_number').notNullable();
      t.string('supplier_name').notNullable();
      t.string('status').notNullable().defaultTo('DRAFT');
      t.integer('total_cost_xof').notNullable().defaultTo(0);
      t.text('notes').notNullable().defaultTo('');
      t.string('expected_date');
      t.string('received_at');
      t.string('created_by_user_id');
      t.string('created_at').notNullable();
      t.string('updated_at').notNullable();
    });
  }

  if (!(await knex.schema.hasTable('purchase_order_items'))) {
    await knex.schema.createTable('purchase_order_items', (t) => {
      t.string('id').primary();
      t.string('purchase_order_id').notNullable();
      t.string('stock_id').notNullable();
      t.string('stock_name').notNullable();
      t.string('unit').notNullable();
      t.float('quantity').notNullable();
      t.integer('unit_cost_xof').notNullable().defaultTo(0);
      t.integer('line_total_xof').notNullable().defaultTo(0);
    });
  }

  if (!(await knex.schema.hasTable('whatsapp_logs'))) {
    await knex.schema.createTable('whatsapp_logs', (t) => {
      t.string('id').primary();
      t.string('restaurant_id').notNullable();
      t.string('recipient_phone').notNullable();
      t.string('message_type').notNullable();
      t.text('body').notNullable();
      t.string('status').notNullable();
      t.string('external_message_id');
      t.text('error_message');
      t.string('created_at').notNullable();
    });
  }

  if (await knex.schema.hasTable('contact_leads')) {
    if (!(await knex.schema.hasColumn('contact_leads', 'status'))) {
      await knex.schema.alterTable('contact_leads', (t) => {
        t.string('status').notNullable().defaultTo('NEW');
        t.text('admin_notes').notNullable().defaultTo('');
        t.string('converted_restaurant_id');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('whatsapp_logs');
  await knex.schema.dropTableIfExists('purchase_order_items');
  await knex.schema.dropTableIfExists('purchase_orders');
  await knex.schema.dropTableIfExists('auth_tokens');
}
