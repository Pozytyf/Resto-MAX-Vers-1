import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { SuperAdminLayout } from '../SuperAdminLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateFr, formatFcfa } from '../../utils/format';
import type { Plan } from '../../types';

interface SubscriptionRow {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantStatus?: string;
  planId: string;
  planName: string;
  planCode: string;
  priceMonthlyXof: number;
  priceYearlyXof?: number;
  effectiveAmountXof?: number;
  billingCycle: 'MONTHLY' | 'YEARLY';
  status: string;
  autoRenew?: boolean;
  currentPeriodEnd: string;
}

type SubFilter = 'ALL' | 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED';

export function PlansSubscriptionsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [featuresText, setFeaturesText] = useState('');
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [newPlan, setNewPlan] = useState({
    code: '',
    name: '',
    tagline: '',
    priceMonthlyXof: 35000,
    priceYearlyXof: 350000,
    trialDays: 14,
    maxTables: 20,
    maxStaff: 10,
    maxMenuItems: 100,
    featuresText: 'POS tactile complet\nMenu QR client\nRapports financiers',
    isFeatured: false,
  });

  const [subSearch, setSubSearch] = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState<SubFilter>('ALL');
  const [editingSub, setEditingSub] = useState<SubscriptionRow | null>(null);
  const [subPatch, setSubPatch] = useState({
    planId: '',
    billingCycle: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    status: 'ACTIVE',
    extendDays: 0,
    autoRenew: true,
  });

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ plans: Plan[] }>('/api/superadmin/plans'),
      apiFetch<{ subscriptions: SubscriptionRow[] }>(
        '/api/superadmin/subscriptions',
      ),
    ])
      .then(([p, s]) => {
        setPlans(p.plans);
        setSubs(s.subscriptions);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEditPlan = (p: Plan) => {
    setEditing({ ...p });
    setFeaturesText((p.features || []).join('\n'));
  };

  const savePlan = async () => {
    if (!editing) return;
    try {
      await apiFetch(`/api/superadmin/plans/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editing.name,
          tagline: editing.tagline,
          priceMonthlyXof: editing.priceMonthlyXof,
          priceYearlyXof: editing.priceYearlyXof,
          trialDays: editing.trialDays,
          maxTables: editing.maxTables,
          maxStaff: editing.maxStaff,
          maxMenuItems: editing.maxMenuItems,
          isFeatured: editing.isFeatured,
          active: editing.active,
          features: featuresText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      notify(t('superadminPages.subscriptions.planUpdatedToast'), 'success');
      setEditing(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/superadmin/plans', {
        method: 'POST',
        body: JSON.stringify({
          code: newPlan.code,
          name: newPlan.name,
          tagline: newPlan.tagline,
          priceMonthlyXof: newPlan.priceMonthlyXof,
          priceYearlyXof: newPlan.priceYearlyXof,
          trialDays: newPlan.trialDays,
          maxTables: newPlan.maxTables,
          maxStaff: newPlan.maxStaff,
          maxMenuItems: newPlan.maxMenuItems,
          isFeatured: newPlan.isFeatured,
          features: newPlan.featuresText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      notify('Nouveau plan SaaS créé.', 'success');
      setShowCreatePlan(false);
      setNewPlan({
        code: '',
        name: '',
        tagline: '',
        priceMonthlyXof: 35000,
        priceYearlyXof: 350000,
        trialDays: 14,
        maxTables: 20,
        maxStaff: 10,
        maxMenuItems: 100,
        featuresText: 'POS tactile complet\nMenu QR client\nRapports financiers',
        isFeatured: false,
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const openEditSub = (s: SubscriptionRow) => {
    setEditingSub(s);
    setSubPatch({
      planId: s.planId,
      billingCycle: s.billingCycle,
      status: s.status,
      extendDays: 0,
      autoRenew: s.autoRenew !== false,
    });
  };

  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;
    try {
      await apiFetch(`/api/superadmin/subscriptions/${editingSub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          planId: subPatch.planId,
          billingCycle: subPatch.billingCycle,
          status: subPatch.status,
          autoRenew: subPatch.autoRenew,
          ...(subPatch.extendDays > 0 ? { extendDays: subPatch.extendDays } : {}),
        }),
      });
      notify('Abonnement mis à jour.', 'success');
      setEditingSub(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const filteredSubs = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    return subs.filter((s) => {
      if (subStatusFilter !== 'ALL' && s.status !== subStatusFilter) return false;
      if (!q) return true;
      return (
        s.restaurantName.toLowerCase().includes(q) ||
        s.planName.toLowerCase().includes(q)
      );
    });
  }, [subs, subSearch, subStatusFilter]);

  return (
    <SuperAdminLayout
      title={t('superadmin.subscriptionsTitle')}
      onRealtimeEvent={load}
      actions={
        <button
          type="button"
          onClick={() => setShowCreatePlan(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Créer un plan</span>
        </button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6 flex flex-col justify-between ${
                !p.active ? 'opacity-65' : ''
              }`}
            >
              <div>
                <div className="flex justify-between items-center gap-2">
                  <h2 className="text-lg font-bold text-[var(--rm-ink)]">
                    {p.name}
                  </h2>
                  <span className="text-xs font-mono text-[var(--rm-ink-muted)]">
                    {p.code} {!p.active ? '· INACTIF' : p.isFeatured ? '· POPULAIRE' : ''}
                  </span>
                </div>
                <p className="text-xs text-[var(--rm-ink-muted)] mt-1">
                  {p.tagline}
                </p>
                <p className="mt-4 text-2xl font-extrabold text-[var(--rm-ink)] tabular-nums">
                  {t('superadminPages.subscriptions.perMonth', {
                    amount: formatFcfa(p.priceMonthlyXof),
                  })}
                </p>
                <p className="text-xs text-[var(--rm-ink-muted)] tabular-nums">
                  {t('superadminPages.subscriptions.yearlyTrialMeta', {
                    amount: formatFcfa(p.priceYearlyXof),
                    days: p.trialDays,
                  })}
                </p>
                <p className="mt-3 text-xs text-[var(--rm-ink)] tabular-nums">
                  {t('superadminPages.subscriptions.limitsMeta', {
                    tables: p.maxTables,
                    staff: p.maxStaff,
                  })}{' '}
                  · {p.maxMenuItems} articles
                </p>
              </div>
              <button
                type="button"
                onClick={() => openEditPlan(p)}
                className="mt-5 w-full py-2 rounded-lg border border-[var(--rm-border)] hover:border-[#FF8738] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer transition-colors"
              >
                {t('superadminPages.subscriptions.editPlanBtn')}
              </button>
            </div>
          ))}
        </div>

        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--rm-border)] flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-[var(--rm-ink)]">
              {t('superadminPages.subscriptions.activeSubsTitle')} ({filteredSubs.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--rm-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  placeholder="Filtrer par restaurant..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-[var(--rm-ink)]"
                />
              </div>
              <div className="flex items-center gap-1 p-1 bg-[var(--rm-surface-muted)] rounded-lg">
                {(['ALL', 'ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELLED'] as SubFilter[]).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSubStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        subStatusFilter === st
                          ? 'bg-[var(--rm-surface)] text-[var(--rm-ink)] shadow-sm'
                          : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                      }`}
                    >
                      {st === 'ALL' ? 'Tous' : st}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--rm-surface-muted)] text-xs text-[var(--rm-ink-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.subscriptions.colRestaurant')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.subscriptions.colPlan')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.subscriptions.colCycle')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.subscriptions.colStatus')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('superadminPages.subscriptions.colAmount')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('superadminPages.subscriptions.colPeriodEnd')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                {filteredSubs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-xs text-[var(--rm-ink-muted)]"
                    >
                      Aucun abonnement correspondant.
                    </td>
                  </tr>
                ) : (
                  filteredSubs.map((s) => {
                    const displayAmount =
                      s.effectiveAmountXof ??
                      (s.billingCycle === 'YEARLY'
                        ? Number(s.priceYearlyXof || s.priceMonthlyXof * 10)
                        : s.priceMonthlyXof);
                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-[var(--rm-surface-hover)] transition-colors"
                      >
                        <td className="px-5 py-3 font-semibold text-[var(--rm-ink)]">
                          {s.restaurantName}
                        </td>
                        <td className="px-5 py-3 text-xs text-[var(--rm-ink)]">
                          {s.planName}
                        </td>
                        <td className="px-5 py-3 text-xs text-[var(--rm-ink-muted)]">
                          {s.billingCycle === 'YEARLY' ? 'Annuel' : 'Mensuel'} ·{' '}
                          {s.autoRenew ? 'Auto' : 'Manuel'}
                        </td>
                        <td className="px-5 py-3 text-xs font-bold">
                          <span
                            className={
                              s.status === 'ACTIVE'
                                ? 'text-[#14B8A6]'
                                : s.status === 'PAST_DUE' || s.status === 'CANCELLED'
                                  ? 'text-[#E05252]'
                                  : 'text-[#FF8738]'
                            }
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-[var(--rm-ink)] tabular-nums">
                          {formatFcfa(displayAmount)}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-[var(--rm-ink-muted)] tabular-nums">
                          {formatDateFr(s.currentPeriodEnd)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEditSub(s)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF8738] hover:underline cursor-pointer whitespace-nowrap"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span>Gérer</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Plan Modal */}
      {showCreatePlan && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePlan}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--rm-ink)]">
                Nouveau plan SaaS
              </h3>
              <button
                type="button"
                onClick={() => setShowCreatePlan(false)}
                className="text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Code technique</label>
                <input
                  required
                  type="text"
                  placeholder="EX: ENTERPRISE"
                  value={newPlan.code}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, code: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] font-mono uppercase"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Nom affiché</label>
                <input
                  required
                  type="text"
                  placeholder="Entreprise Multi-Sites"
                  value={newPlan.name}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold mb-1">Accroche</label>
                <input
                  type="text"
                  value={newPlan.tagline}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, tagline: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Mensuel (FCFA)</label>
                <input
                  type="number"
                  value={newPlan.priceMonthlyXof}
                  onChange={(e) =>
                    setNewPlan({
                      ...newPlan,
                      priceMonthlyXof: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Annuel (FCFA)</label>
                <input
                  type="number"
                  value={newPlan.priceYearlyXof}
                  onChange={(e) =>
                    setNewPlan({
                      ...newPlan,
                      priceYearlyXof: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Essai (jours)</label>
                <input
                  type="number"
                  value={newPlan.trialDays}
                  onChange={(e) =>
                    setNewPlan({
                      ...newPlan,
                      trialDays: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Max tables</label>
                <input
                  type="number"
                  value={newPlan.maxTables}
                  onChange={(e) =>
                    setNewPlan({
                      ...newPlan,
                      maxTables: Number(e.target.value) || 1,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Max équipe</label>
                <input
                  type="number"
                  value={newPlan.maxStaff}
                  onChange={(e) =>
                    setNewPlan({
                      ...newPlan,
                      maxStaff: Number(e.target.value) || 1,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Max articles</label>
                <input
                  type="number"
                  value={newPlan.maxMenuItems}
                  onChange={(e) =>
                    setNewPlan({
                      ...newPlan,
                      maxMenuItems: Number(e.target.value) || 1,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold mb-1">
                  Fonctionnalités (une par ligne)
                </label>
                <textarea
                  rows={3}
                  value={newPlan.featuresText}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, featuresText: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreatePlan(false)}
                className="flex-1 py-2 rounded-lg border border-[var(--rm-border-input)] text-xs font-semibold cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
              >
                Créer le plan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Full Edit Plan Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[var(--rm-ink)]">
              {t('superadminPages.subscriptions.editModalTitle', {
                name: editing.name,
              })}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                  Nom du plan
                </label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                  Essai (jours)
                </label>
                <input
                  type="number"
                  value={editing.trialDays}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      trialDays: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                  Slogan / Accroche
                </label>
                <input
                  type="text"
                  value={editing.tagline}
                  onChange={(e) =>
                    setEditing({ ...editing, tagline: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                  {t('superadminPages.subscriptions.monthlyXofLabel')}
                </label>
                <input
                  type="number"
                  value={editing.priceMonthlyXof}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      priceMonthlyXof: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                  {t('superadminPages.subscriptions.yearlyXofLabel')}
                </label>
                <input
                  type="number"
                  value={editing.priceYearlyXof}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      priceYearlyXof: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                  {t('superadminPages.subscriptions.maxTablesLabel')}
                </label>
                <input
                  type="number"
                  value={editing.maxTables}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      maxTables: Number(e.target.value) || 1,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                  {t('superadminPages.subscriptions.maxStaffLabel')}
                </label>
                <input
                  type="number"
                  value={editing.maxStaff}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      maxStaff: Number(e.target.value) || 1,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                  Max articles menu
                </label>
                <input
                  type="number"
                  value={editing.maxMenuItems}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      maxMenuItems: Number(e.target.value) || 1,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                  Fonctionnalités affichées (une par ligne)
                </label>
                <textarea
                  rows={3}
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) =>
                    setEditing({ ...editing, active: e.target.checked })
                  }
                />
                <span>Plan actif sur le site vitrine</span>
              </label>
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.isFeatured}
                  onChange={(e) =>
                    setEditing({ ...editing, isFeatured: e.target.checked })
                  }
                />
                <span>Mettre en avant (Populaire)</span>
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 py-2 rounded-lg border border-[var(--rm-border-input)] text-[var(--rm-ink)] hover:bg-[var(--rm-surface-hover)] text-xs font-semibold cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={savePlan}
                className="flex-1 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Subscription Modal */}
      {editingSub && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveSub}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--rm-ink)]">
                  Gérer l’abonnement
                </h3>
                <p className="text-[var(--rm-ink-muted)]">
                  {editingSub.restaurantName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSub(null)}
                className="text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Plan</label>
                <select
                  value={subPatch.planId}
                  onChange={(e) =>
                    setSubPatch({ ...subPatch, planId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Cycle</label>
                <select
                  value={subPatch.billingCycle}
                  onChange={(e) =>
                    setSubPatch({
                      ...subPatch,
                      billingCycle: e.target.value as 'MONTHLY' | 'YEARLY',
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                >
                  <option value="MONTHLY">Mensuel</option>
                  <option value="YEARLY">Annuel</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Statut</label>
                <select
                  value={subPatch.status}
                  onChange={(e) =>
                    setSubPatch({ ...subPatch, status: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TRIAL">TRIAL</option>
                  <option value="PAST_DUE">PAST_DUE</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  Ajouter jours d’échéance
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={subPatch.extendDays}
                  onChange={(e) =>
                    setSubPatch({
                      ...subPatch,
                      extendDays: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={subPatch.autoRenew}
                onChange={(e) =>
                  setSubPatch({ ...subPatch, autoRenew: e.target.checked })
                }
              />
              <span>Renouvellement automatique activé</span>
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSub(null)}
                className="flex-1 py-2 rounded-lg border border-[var(--rm-border-input)] font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white font-semibold cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Appliquer</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </SuperAdminLayout>
  );
}
