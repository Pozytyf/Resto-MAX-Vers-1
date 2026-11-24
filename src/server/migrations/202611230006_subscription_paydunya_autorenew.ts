import type { Knex } from 'knex';

/**
 * Migration Knex pour la gestion avancée des abonnements SaaS :
 * - Renouvellement automatique (`auto_renew`, `preferred_payment_method`, `last_paydunya_token`)
 * - Suivi des checkout/IPN PayDunya sur `platform_invoices` (`paydunya_token`, `checkout_url`, `plan_id`, `billing_cycle`, `is_renewal`)
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('subscriptions')) {
    if (!(await knex.schema.hasColumn('subscriptions', 'auto_renew'))) {
      await knex.schema.alterTable('subscriptions', (t) => {
        t.integer('auto_renew').notNullable().defaultTo(1);
        t.string('preferred_payment_method').notNullable().defaultTo('WAVE');
        t.string('last_paydunya_token').notNullable().defaultTo('');
      });
    }
  }

  if (await knex.schema.hasTable('platform_invoices')) {
    if (!(await knex.schema.hasColumn('platform_invoices', 'paydunya_token'))) {
      await knex.schema.alterTable('platform_invoices', (t) => {
        t.string('paydunya_token').notNullable().defaultTo('');
        t.text('checkout_url').notNullable().defaultTo('');
        t.string('plan_id');
        t.string('billing_cycle').notNullable().defaultTo('MONTHLY');
        t.integer('is_renewal').notNullable().defaultTo(0);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('platform_invoices')) {
    await knex.schema.alterTable('platform_invoices', (t) => {
      t.dropColumn('paydunya_token');
      t.dropColumn('checkout_url');
      t.dropColumn('plan_id');
      t.dropColumn('billing_cycle');
      t.dropColumn('is_renewal');
    });
  }
  if (await knex.schema.hasTable('subscriptions')) {
    await knex.schema.alterTable('subscriptions', (t) => {
      t.dropColumn('auto_renew');
      t.dropColumn('preferred_payment_method');
      t.dropColumn('last_paydunya_token');
    });
  }
}
