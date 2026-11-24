import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Download, Plus, Search, X } from 'lucide-react';
import { SuperAdminLayout } from '../SuperAdminLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { downloadCsv } from '../csvExport';
import {
  formatDateFr,
  formatFcfa,
  getPaymentMethodLabel,
} from '../../utils/format';
import type { Plan, Restaurant } from '../../types';

interface BillingInvoiceRow {
  id: string;
  invoiceNumber: string;
  restaurantId: string;
  restaurantName: string;
  planName?: string | null;
  billingCycle?: string | null;
  amountXof: number;
  status: string;
  paymentMethod: string;
  mode: string;
  paidAt?: string | null;
  createdAt: string;
}

type InvoiceFilter = 'ALL' | 'PAID' | 'PENDING' | 'CANCELLED' | 'FAILED';

export function PlatformBillingPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [invoices, setInvoices] = useState<BillingInvoiceRow[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceFilter>('ALL');

  const [confirmInvoice, setConfirmInvoice] =
    useState<BillingInvoiceRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [manualForm, setManualForm] = useState({
    restaurantId: '',
    planId: '',
    billingCycle: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    paymentMethod: 'WAVE',
    status: 'PENDING' as 'PENDING' | 'PAID',
    amountXof: 0,
  });

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ invoices: BillingInvoiceRow[] }>('/api/superadmin/billing'),
      apiFetch<{ restaurants: Restaurant[] }>('/api/superadmin/restaurants'),
      apiFetch<{ plans: Plan[] }>('/api/superadmin/plans'),
    ])
      .then(([invRes, restRes, planRes]) => {
        setInvoices(invRes.invoices);
        setRestaurants(restRes.restaurants);
        setPlans(planRes.plans);
        if (!manualForm.restaurantId && restRes.restaurants[0]) {
          setManualForm((prev) => ({
            ...prev,
            restaurantId: restRes.restaurants[0].id,
          }));
        }
        if (!manualForm.planId && planRes.plans[0]) {
          setManualForm((prev) => ({
            ...prev,
            planId: planRes.plans[0].id,
            amountXof: planRes.plans[0].priceMonthlyXof,
          }));
        }
      })
      .catch(() => {});
  }, [manualForm.planId, manualForm.restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.restaurantName.toLowerCase().includes(q) ||
        (inv.planName || '').toLowerCase().includes(q)
      );
    });
  }, [invoices, search, statusFilter]);

  const totals = useMemo(() => {
    let paid = 0;
    let pending = 0;
    for (const inv of filteredInvoices) {
      if (inv.status === 'PAID') paid += inv.amountXof;
      else if (inv.status === 'PENDING') pending += inv.amountXof;
    }
    return { paid, pending };
  }, [filteredInvoices]);

  const markPaid = async (id: string) => {
    try {
      await apiFetch(`/api/superadmin/billing/${id}/mark-paid`, {
        method: 'POST',
      });
      notify(
        'Facture validée et abonnement du restaurant activé/prolongé.',
        'success',
      );
      setConfirmInvoice(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const cancelInvoice = async (id: string) => {
    try {
      await apiFetch(`/api/superadmin/billing/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      notify('Facture annulée.', 'info');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/superadmin/billing', {
        method: 'POST',
        body: JSON.stringify(manualForm),
      });
      notify('Facture SaaS créée.', 'success');
      setShowCreate(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      `restomax-facturation-saas-${new Date().toISOString().slice(0, 10)}.csv`,
      ['N° Facture', 'Établissement', 'Plan', 'Cycle', 'Méthode', 'Mode', 'Statut', 'Montant (FCFA)', 'Date'],
      filteredInvoices.map((inv) => [
        inv.invoiceNumber,
        inv.restaurantName,
        inv.planName || '',
        inv.billingCycle || '',
        inv.paymentMethod,
        inv.mode,
        inv.status,
        inv.amountXof,
        inv.createdAt,
      ]),
    );
  };

  return (
    <SuperAdminLayout
      title={t('superadmin.billingTitle')}
      onRealtimeEvent={load}
      actions={
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] hover:bg-[var(--rm-surface-muted)] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nouvelle facture</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-[var(--rm-ink-muted)]">
            {t('superadminPages.billing.isolationBanner')}
          </span>
          <div className="flex items-center gap-4 tabular-nums font-semibold">
            <span className="text-[#14B8A6]">
              Encaissé : {formatFcfa(totals.paid)}
            </span>
            <span className="text-[#E5A32A]">
              En attente : {formatFcfa(totals.pending)}
            </span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-[var(--rm-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par n° facture, établissement ou plan..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--rm-surface-muted)] rounded-lg">
            {(['ALL', 'PAID', 'PENDING', 'CANCELLED', 'FAILED'] as InvoiceFilter[]).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-[var(--rm-surface)] text-[var(--rm-ink)] shadow-sm'
                      : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                  }`}
                >
                  {st === 'ALL' ? `Toutes (${invoices.length})` : st}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--rm-surface-muted)] text-xs text-[var(--rm-ink-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.billing.colInvoiceNo')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.billing.colVenue')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.billing.colMethod')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.billing.colStatus')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('superadminPages.billing.colAmount')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('superadminPages.billing.colDate')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('superadminPages.billing.colAction')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-xs text-[var(--rm-ink-muted)]"
                    >
                      Aucune facture trouvée.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-[var(--rm-surface-hover)] transition-colors"
                    >
                      <td className="px-5 py-3 font-mono font-bold text-[var(--rm-ink)] text-xs">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-[var(--rm-ink)]">
                          {inv.restaurantName}
                        </p>
                        {inv.planName && (
                          <p className="text-[11px] text-[var(--rm-ink-muted)]">
                            {inv.planName} · {inv.billingCycle || 'MONTHLY'}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--rm-ink-muted)]">
                        {getPaymentMethodLabel(inv.paymentMethod)} ({inv.mode})
                      </td>
                      <td className="px-5 py-3 text-xs font-bold">
                        <span
                          className={
                            inv.status === 'PAID'
                              ? 'text-[#14B8A6]'
                              : inv.status === 'CANCELLED' || inv.status === 'FAILED'
                                ? 'text-[#E05252]'
                                : 'text-[#E5A32A]'
                          }
                        >
                          {inv.status === 'PAID'
                            ? t('superadminPages.billing.paidStatus')
                            : inv.status === 'PENDING'
                              ? t('superadminPages.billing.pendingStatus')
                              : inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-[var(--rm-ink)] tabular-nums">
                        {formatFcfa(inv.amountXof)}
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-[var(--rm-ink-muted)] tabular-nums">
                        {formatDateFr(inv.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {inv.status === 'PENDING' && (
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setConfirmInvoice(inv)}
                              className="text-xs font-semibold text-[#FF8738] hover:underline cursor-pointer whitespace-nowrap"
                            >
                              {t('superadminPages.billing.validatePayBtn')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void cancelInvoice(inv.id)}
                              className="text-xs font-semibold text-[#E05252] hover:underline cursor-pointer whitespace-nowrap"
                            >
                              Annuler
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Confirm Manual Payment Modal */}
      {confirmInvoice && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--rm-ink)]">
              <CheckCircle2 className="w-5 h-5 text-[#14B8A6]" />
              <span>Confirmer l’encaissement manuel</span>
            </div>
            <p className="text-[var(--rm-ink-muted)] leading-relaxed">
              Vous êtes sur le point de valider la facture{' '}
              <strong className="font-mono text-[var(--rm-ink)]">
                {confirmInvoice.invoiceNumber}
              </strong>{' '}
              ({formatFcfa(confirmInvoice.amountXof)}) pour{' '}
              <strong className="text-[var(--rm-ink)]">
                {confirmInvoice.restaurantName}
              </strong>
              . Cette action activera ou prolongera automatiquement son abonnement et réactivera l’établissement s’il était suspendu.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmInvoice(null)}
                className="flex-1 py-2 rounded-lg border border-[var(--rm-border)] font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void markPaid(confirmInvoice.id)}
                className="flex-1 py-2 rounded-lg bg-[#14B8A6] hover:bg-[#0D9488] text-white font-semibold cursor-pointer"
              >
                Valider et activer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Invoice Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateInvoice}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Créer une facture SaaS
              </h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Établissement</label>
                <select
                  required
                  value={manualForm.restaurantId}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, restaurantId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                >
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.city})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Plan</label>
                  <select
                    value={manualForm.planId}
                    onChange={(e) => {
                      const plan = plans.find((p) => p.id === e.target.value);
                      setManualForm({
                        ...manualForm,
                        planId: e.target.value,
                        amountXof: plan
                          ? manualForm.billingCycle === 'YEARLY'
                            ? plan.priceYearlyXof
                            : plan.priceMonthlyXof
                          : manualForm.amountXof,
                      });
                    }}
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
                    value={manualForm.billingCycle}
                    onChange={(e) => {
                      const nextCycle = e.target.value as 'MONTHLY' | 'YEARLY';
                      const plan = plans.find((p) => p.id === manualForm.planId);
                      setManualForm({
                        ...manualForm,
                        billingCycle: nextCycle,
                        amountXof: plan
                          ? nextCycle === 'YEARLY'
                            ? plan.priceYearlyXof
                            : plan.priceMonthlyXof
                          : manualForm.amountXof,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                  >
                    <option value="MONTHLY">Mensuel</option>
                    <option value="YEARLY">Annuel</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    Montant (FCFA)
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={manualForm.amountXof}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        amountXof: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Méthode</label>
                  <select
                    value={manualForm.paymentMethod}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        paymentMethod: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                  >
                    <option value="WAVE">Wave</option>
                    <option value="ORANGE_MONEY">Orange Money</option>
                    <option value="MTN_MOMO">MTN MoMo</option>
                    <option value="CARD">Carte bancaire</option>
                    <option value="CASH">Virement / Espèces</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">Statut initial</label>
                <select
                  value={manualForm.status}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      status: e.target.value as 'PENDING' | 'PAID',
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                >
                  <option value="PENDING">En attente de règlement</option>
                  <option value="PAID">Déjà payée (active l’abonnement)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 rounded-lg border border-[var(--rm-border-input)] font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white font-semibold cursor-pointer"
              >
                Émettre la facture
              </button>
            </div>
          </form>
        </div>
      )}
    </SuperAdminLayout>
  );
}
