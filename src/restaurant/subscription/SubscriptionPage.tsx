import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Receipt,
  AlertTriangle,
} from 'lucide-react';
import { RestaurantLayout } from '../RestaurantLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import {
  formatDateFr,
  formatDateTimeFr,
  formatFcfa,
} from '../../utils/format';
import type { PaymentMethod, Plan, PlatformInvoice } from '../../types';

interface SubscriptionPortalPayload {
  currentSubscription: {
    id: string;
    planId: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    status: string;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    autoRenew: boolean;
    preferredPaymentMethod: Exclude<PaymentMethod, 'CASH'>;
    planName: string;
    planCode: string;
    priceMonthlyXof: number;
    priceYearlyXof: number;
    maxTables: number;
    maxStaff: number;
    maxMenuItems: number;
  } | null;
  usage: {
    tablesCount: number;
    staffCount: number;
    menuItemsCount: number;
  };
  plans: Plan[];
  invoices: Array<
    PlatformInvoice & {
      paydunyaToken?: string;
      checkoutUrl?: string;
      billingCycle?: string;
      isRenewal?: boolean;
    }
  >;
  paydunyaStatus: {
    configured: boolean;
    mode: 'TEST' | 'LIVE';
  };
}

interface CheckoutApiResult {
  status: 'PAID' | 'PENDING_PAYMENT' | 'CANCELLED';
  providerMode: 'PAYDUNYA_API' | 'SANDBOX_SIMULATION';
  invoiceId: string;
  invoiceNumber: string;
  paydunyaToken: string;
  checkoutUrl: string | null;
  planName: string;
  billingCycle: 'MONTHLY' | 'YEARLY';
  amountXof: number;
}

const PAYMENT_CHANNELS: Array<{
  id: Exclude<PaymentMethod, 'CASH'>;
  label: string;
  sublabel: string;
}> = [
  { id: 'WAVE', label: 'Wave Mobile', sublabel: 'Validation instantanée PayDunya' },
  { id: 'ORANGE_MONEY', label: 'Orange Money', sublabel: 'Côte d’Ivoire & UEMOA' },
  { id: 'MTN_MOMO', label: 'MTN MoMo', sublabel: 'Mobile Money direct' },
  { id: 'CARD', label: 'Carte Bancaire', sublabel: 'Visa / Mastercard' },
];

export function SubscriptionPage() {
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [portal, setPortal] = useState<SubscriptionPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [paymentMethod, setPaymentMethod] =
    useState<Exclude<PaymentMethod, 'CASH'>>('WAVE');
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [renewingNow, setRenewingNow] = useState(false);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);
  const [verifyingInvoiceId, setVerifyingInvoiceId] = useState<string | null>(null);
  const [pendingPaydunya, setPendingPaydunya] = useState<CheckoutApiResult | null>(
    null,
  );

  const loadPortal = useCallback(() => {
    setLoading(true);
    apiFetch<SubscriptionPortalPayload>('/api/restaurant/subscription')
      .then((res) => {
        setPortal(res);
        if (res.currentSubscription) {
          setBillingCycle(res.currentSubscription.billingCycle || 'MONTHLY');
          setPaymentMethod(
            res.currentSubscription.preferredPaymentMethod || 'WAVE',
          );
          setSelectedPlanId((prev) => prev || res.currentSubscription!.planId);
        } else if (res.plans[0]) {
          setSelectedPlanId((prev) => prev || res.plans[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  // Verify PayDunya return callback automatically if query param is present
  useEffect(() => {
    const pdxStatus = searchParams.get('paydunya_status');
    const invoiceParam = searchParams.get('invoice');
    if (pdxStatus === 'return' && invoiceParam) {
      setVerifyingInvoiceId(invoiceParam);
      apiFetch<{ status: string; invoiceNumber?: string; message?: string }>(
        '/api/restaurant/subscription/verify',
        {
          method: 'POST',
          body: JSON.stringify({ invoiceId: invoiceParam }),
        },
      )
        .then((res) => {
          if (res.status === 'PAID') {
            notify(
              `Paiement PayDunya confirmé (${res.invoiceNumber || ''}). Votre abonnement est actif.`,
              'success',
            );
            setPendingPaydunya(null);
            loadPortal();
          } else {
            notify(res.message || 'Paiement en cours de confirmation.', 'info');
          }
        })
        .catch(() => {})
        .finally(() => {
          setVerifyingInvoiceId(null);
          setSearchParams({}, { replace: true });
        });
    } else if (pdxStatus === 'cancel') {
      notify('Le paiement PayDunya a été annulé.', 'info');
      setSearchParams({}, { replace: true });
    }
  }, [loadPortal, notify, searchParams, setSearchParams]);

  const handleToggleAutoRenew = async () => {
    if (!portal?.currentSubscription) return;
    const nextVal = !portal.currentSubscription.autoRenew;
    setTogglingAutoRenew(true);
    try {
      await apiFetch('/api/restaurant/subscription/auto-renew', {
        method: 'PATCH',
        body: JSON.stringify({
          autoRenew: nextVal,
          preferredPaymentMethod: paymentMethod,
        }),
      });
      notify(
        nextVal
          ? 'Renouvellement automatique PayDunya activé.'
          : 'Renouvellement automatique désactivé.',
        'success',
      );
      loadPortal();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Impossible de modifier le renouvellement.',
        'error',
      );
    } finally {
      setTogglingAutoRenew(false);
    }
  };

  const handleCheckout = async () => {
    if (!selectedPlanId) return;
    setSubmittingCheckout(true);
    try {
      const res = await apiFetch<CheckoutApiResult>(
        '/api/restaurant/subscription/checkout',
        {
          method: 'POST',
          body: JSON.stringify({
            planId: selectedPlanId,
            billingCycle,
            paymentMethod,
            autoRenew: portal?.currentSubscription?.autoRenew ?? true,
          }),
        },
      );
      if (res.status === 'PENDING_PAYMENT' && res.checkoutUrl) {
        setPendingPaydunya(res);
        notify(
          `Facture ${res.invoiceNumber} créée sur PayDunya. Finalisez le paiement via le lien sécurisé.`,
          'info',
        );
      } else {
        setPendingPaydunya(null);
        notify(
          `Abonnement ${res.planName} activé — Facture ${res.invoiceNumber} (${formatFcfa(res.amountXof)}) réglée.`,
          'success',
        );
      }
      loadPortal();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Erreur lors du changement de plan.',
        'error',
      );
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleRenewNow = async () => {
    setRenewingNow(true);
    try {
      const res = await apiFetch<CheckoutApiResult>(
        '/api/restaurant/subscription/renew-now',
        {
          method: 'POST',
          body: JSON.stringify({ paymentMethod }),
        },
      );
      if (res.status === 'PENDING_PAYMENT' && res.checkoutUrl) {
        setPendingPaydunya(res);
        notify(
          `Renouvellement ${res.invoiceNumber} initié sur PayDunya.`,
          'info',
        );
      } else {
        notify(
          `Abonnement renouvelé avec succès (${res.invoiceNumber}).`,
          'success',
        );
      }
      loadPortal();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Erreur lors du renouvellement.',
        'error',
      );
    } finally {
      setRenewingNow(false);
    }
  };

  const handleVerifyInvoice = async (invoiceId: string) => {
    setVerifyingInvoiceId(invoiceId);
    try {
      const res = await apiFetch<{
        status: string;
        invoiceNumber?: string;
        message?: string;
      }>('/api/restaurant/subscription/verify', {
        method: 'POST',
        body: JSON.stringify({ invoiceId }),
      });
      if (res.status === 'PAID') {
        notify(
          `Paiement PayDunya vérifié (${res.invoiceNumber || ''}). Abonnement activé.`,
          'success',
        );
        setPendingPaydunya(null);
        loadPortal();
      } else {
        notify(
          res.message || 'Le paiement est toujours en attente de validation PayDunya.',
          'info',
        );
      }
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Erreur lors de la vérification.',
        'error',
      );
    } finally {
      setVerifyingInvoiceId(null);
    }
  };

  const currentSub = portal?.currentSubscription || null;
  const selectedPlan =
    portal?.plans.find((p) => p.id === selectedPlanId) || null;
  const selectedAmountXof = selectedPlan
    ? billingCycle === 'YEARLY'
      ? selectedPlan.priceYearlyXof
      : selectedPlan.priceMonthlyXof
    : 0;

  const daysRemaining = currentSub
    ? Math.max(
        0,
        Math.ceil(
          (new Date(currentSub.currentPeriodEnd).getTime() - Date.now()) /
            86_400_000,
        ),
      )
    : 0;

  const isPlanChange =
    Boolean(currentSub && selectedPlan && selectedPlan.id !== currentSub.planId) ||
    Boolean(currentSub && billingCycle !== currentSub.billingCycle);

  return (
    <RestaurantLayout title="Mon Abonnement">
      {loading && !portal ? (
        <div className="p-8 rounded-2xl bg-[var(--rm-surface)] border border-[var(--rm-border)] text-sm text-[var(--rm-ink-muted)]">
          Chargement de votre espace d’abonnement et facturation PayDunya...
        </div>
      ) : portal ? (
        <div className="space-y-6">
          {/* Active Subscription Overview + Usage Quotas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-[#182333] text-white rounded-2xl p-6 space-y-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#FF8738]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Abonnement SaaS Resto’MAX</span>
                  </div>
                  <h2 className="mt-1.5 text-2xl font-extrabold">
                    Formule {currentSub?.planName || 'Essentiel'}
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Facturation{' '}
                    {currentSub?.billingCycle === 'YEARLY'
                      ? 'annuelle'
                      : 'mensuelle'}{' '}
                    · Échéance le{' '}
                    <span className="font-semibold text-white">
                      {currentSub
                        ? formatDateFr(currentSub.currentPeriodEnd)
                        : '—'}
                    </span>
                  </p>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      currentSub?.status === 'ACTIVE'
                        ? 'bg-[#14B8A6]/20 text-[#5EEAD4]'
                        : currentSub?.status === 'TRIAL'
                          ? 'bg-[#FF8738]/20 text-[#FFB07A]'
                          : 'bg-rose-500/20 text-rose-200'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {currentSub?.status === 'ACTIVE'
                        ? 'Actif'
                        : currentSub?.status === 'TRIAL'
                          ? 'Période d’essai'
                          : 'Renouvellement requis'}
                    </span>
                  </span>
                  <p className="mt-2 text-xs text-slate-300 tabular-nums">
                    {daysRemaining} jour{daysRemaining > 1 ? 's' : ''} restant
                    {daysRemaining > 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Auto-renewal & quick renew bar */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-white flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-[#FF8738]" />
                    <span>Renouvellement automatique via PayDunya</span>
                  </p>
                  <p className="text-[11px] text-slate-300">
                    Moyen mémorisé :{' '}
                    <span className="font-semibold text-white">
                      {currentSub?.preferredPaymentMethod || paymentMethod}
                    </span>{' '}
                    ·{' '}
                    {currentSub?.autoRenew
                      ? 'Activé à chaque échéance'
                      : 'Désactivé (renouvellement manuel)'}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    data-testid="toggle-autorenew-btn"
                    disabled={togglingAutoRenew || !currentSub}
                    onClick={() => void handleToggleAutoRenew()}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                      currentSub?.autoRenew
                        ? 'bg-[#14B8A6] text-[#0F172A] hover:bg-[#2DD4BF]'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    {currentSub?.autoRenew ? 'Auto-renouvellement ON' : 'Auto-renouvellement OFF'}
                  </button>

                  <button
                    type="button"
                    data-testid="renew-now-btn"
                    disabled={renewingNow || !currentSub}
                    onClick={() => void handleRenewNow()}
                    className="px-3.5 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {renewingNow ? 'Traitement...' : 'Renouveler maintenant'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-[#FF8738]" />
                  <span>
                    Passerelle PayDunya :{' '}
                    {portal.paydunyaStatus.configured
                      ? `API Connectée (${portal.paydunyaStatus.mode})`
                      : 'Mode Sandbox Démo (activation immédiate)'}
                  </span>
                </span>
                <span className="tabular-nums font-semibold text-white">
                  Tarif actuel :{' '}
                  {currentSub
                    ? formatFcfa(
                        currentSub.billingCycle === 'YEARLY'
                          ? currentSub.priceYearlyXof
                          : currentSub.priceMonthlyXof,
                      )
                    : '—'}
                </span>
              </div>
            </div>

            {/* Quota meters */}
            <div className="lg:col-span-5 bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--rm-ink)]">
                  Quotas de votre forfait actuel
                </h3>
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  Utilisation en temps réel de vos ressources établissement.
                </p>
              </div>

              {(
                [
                  {
                    label: 'Tables configurées',
                    used: portal.usage.tablesCount,
                    max: currentSub?.maxTables || 15,
                  },
                  {
                    label: 'Comptes équipe actifs',
                    used: portal.usage.staffCount,
                    max: currentSub?.maxStaff || 6,
                  },
                  {
                    label: 'Articles au menu',
                    used: portal.usage.menuItemsCount,
                    max: currentSub?.maxMenuItems || 80,
                  },
                ] as const
              ).map((q) => {
                const pct = Math.min(100, Math.round((q.used / Math.max(1, q.max)) * 100));
                const high = pct >= 85;
                return (
                  <div key={q.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--rm-ink)]">
                        {q.label}
                      </span>
                      <span className="tabular-nums font-bold text-[var(--rm-ink-muted)]">
                        {q.used} / {q.max}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--rm-surface-muted)] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          high ? 'bg-[#FF8738]' : 'bg-[#14B8A6]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending PayDunya external checkout banner */}
          {pendingPaydunya && pendingPaydunya.checkoutUrl && (
            <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    Paiement PayDunya en attente — Facture{' '}
                    {pendingPaydunya.invoiceNumber} (
                    {formatFcfa(pendingPaydunya.amountXof)})
                  </span>
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Ouvrez la page sécurisée PayDunya pour valider votre règlement, puis cliquez sur « Vérifier le paiement ».
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={pendingPaydunya.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-bold"
                >
                  <span>Payer sur PayDunya</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  disabled={verifyingInvoiceId === pendingPaydunya.invoiceId}
                  onClick={() => void handleVerifyInvoice(pendingPaydunya.invoiceId)}
                  className="px-4 py-2 rounded-lg bg-[#182333] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {verifyingInvoiceId === pendingPaydunya.invoiceId
                    ? 'Vérification...'
                    : 'Vérifier le paiement'}
                </button>
              </div>
            </div>
          )}

          {/* Self-service Plan Upgrade / Switch & PayDunya Checkout */}
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[var(--rm-ink)]">
                  Changer de formule en libre-service
                </h3>
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  Passez au plan supérieur à tout moment ou économisez 2 mois avec la facturation annuelle.
                </p>
              </div>

              <div className="inline-flex rounded-xl border border-[var(--rm-border)] p-1 bg-[var(--rm-surface-muted)]">
                <button
                  type="button"
                  onClick={() => setBillingCycle('MONTHLY')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    billingCycle === 'MONTHLY'
                      ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                      : 'text-[var(--rm-ink-muted)]'
                  }`}
                >
                  Mensuel
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('YEARLY')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    billingCycle === 'YEARLY'
                      ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                      : 'text-[var(--rm-ink-muted)]'
                  }`}
                >
                  Annuel (-17%)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {portal.plans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                const isCurrent = currentSub?.planId === plan.id;
                const price =
                  billingCycle === 'YEARLY'
                    ? plan.priceYearlyXof
                    : plan.priceMonthlyXof;
                const monthlyEquivalent =
                  billingCycle === 'YEARLY'
                    ? Math.round(plan.priceYearlyXof / 12)
                    : plan.priceMonthlyXof;

                return (
                  <button
                    key={plan.id}
                    type="button"
                    data-testid={`plan-card-${plan.code}`}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`rounded-2xl border p-5 text-left flex flex-col justify-between gap-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#FF8738] ring-2 ring-[#FF8738]/25 bg-[#FF8738]/5'
                        : 'border-[var(--rm-border)] hover:border-[#FF8738]/60'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold text-[var(--rm-ink)]">
                          {plan.name}
                        </span>
                        {isCurrent ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#14B8A6]/15 text-[#14B8A6] text-[10px] font-bold">
                            Plan actuel
                          </span>
                        ) : plan.isFeatured ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#FF8738]/15 text-[#FF8738] text-[10px] font-bold">
                            Populaire
                          </span>
                        ) : null}
                      </div>

                      <p className="text-xs text-[var(--rm-ink-muted)]">
                        {plan.tagline}
                      </p>

                      <div>
                        <p className="text-2xl font-extrabold text-[var(--rm-ink)] tabular-nums">
                          {formatFcfa(price)}
                          <span className="text-xs font-medium text-[var(--rm-ink-muted)]">
                            /{billingCycle === 'YEARLY' ? 'an' : 'mois'}
                          </span>
                        </p>
                        {billingCycle === 'YEARLY' && (
                          <p className="text-[11px] text-[#14B8A6] font-semibold tabular-nums">
                            Soit {formatFcfa(monthlyEquivalent)} / mois
                          </p>
                        )}
                      </div>

                      <ul className="space-y-1.5 pt-2 border-t border-[var(--rm-border-subtle)] text-xs text-[var(--rm-ink)]">
                        {plan.features.slice(0, 5).map((feat) => (
                          <li key={feat} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-[#14B8A6] shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-xs font-bold">
                      <span className="text-[var(--rm-ink-muted)]">
                        {plan.maxTables} tables · {plan.maxStaff} équipiers
                      </span>
                      {isSelected && (
                        <span className="text-[#FF8738] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Sélectionné</span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* PayDunya Channel Selector & Checkout Action */}
            <div className="pt-4 border-t border-[var(--rm-border-subtle)] grid grid-cols-1 lg:grid-cols-12 gap-5 items-end">
              <div className="lg:col-span-8 space-y-2">
                <label className="block text-xs font-bold text-[var(--rm-ink)]">
                  Moyen de règlement PayDunya
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {PAYMENT_CHANNELS.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setPaymentMethod(ch.id)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                        paymentMethod === ch.id
                          ? 'border-[#182333] dark:border-[#FF8738] bg-[#182333] dark:bg-[#FF8738] text-white'
                          : 'border-[var(--rm-border)] text-[var(--rm-ink)] hover:border-[#FF8738]/50'
                      }`}
                    >
                      <p className="text-xs font-bold">{ch.label}</p>
                      <p
                        className={`text-[10px] mt-0.5 ${
                          paymentMethod === ch.id
                            ? 'text-white/80'
                            : 'text-[var(--rm-ink-muted)]'
                        }`}
                      >
                        {ch.sublabel}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="subscription-paydunya-checkout-btn"
                  disabled={submittingCheckout || !selectedPlanId}
                  onClick={() => void handleCheckout()}
                  className="w-full py-3 px-4 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    {submittingCheckout
                      ? 'Connexion à PayDunya...'
                      : isPlanChange
                        ? `Changer vers ${selectedPlan?.name || ''} · ${formatFcfa(selectedAmountXof)}`
                        : `Régler ${formatFcfa(selectedAmountXof)} via PayDunya`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* SaaS Invoices History */}
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-bold text-[var(--rm-ink)] flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#FF8738]" />
                <span>Historique des factures & renouvellements</span>
              </h3>
              <span className="text-xs text-[var(--rm-ink-muted)] tabular-nums">
                {portal.invoices.length} facture(s)
              </span>
            </div>

            {portal.invoices.length === 0 ? (
              <p className="text-xs text-[var(--rm-ink-muted)]">
                Aucune facture générée pour le moment (période d’essai gratuite en cours).
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--rm-border)] text-[var(--rm-ink-muted)]">
                      <th className="py-2.5 pr-3 font-semibold">N° Facture</th>
                      <th className="py-2.5 pr-3 font-semibold">Date</th>
                      <th className="py-2.5 pr-3 font-semibold">Type</th>
                      <th className="py-2.5 pr-3 font-semibold">Canal PayDunya</th>
                      <th className="py-2.5 pr-3 font-semibold">Montant</th>
                      <th className="py-2.5 pr-3 font-semibold">Statut</th>
                      <th className="py-2.5 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                    {portal.invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-3 pr-3 font-mono font-bold text-[var(--rm-ink)]">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 pr-3 text-[var(--rm-ink-muted)]">
                          {formatDateTimeFr(inv.createdAt)}
                        </td>
                        <td className="py-3 pr-3 text-[var(--rm-ink)]">
                          {inv.isRenewal ? 'Renouvellement' : 'Souscription'}{' '}
                          {inv.billingCycle === 'YEARLY' ? '(Annuel)' : '(Mensuel)'}
                        </td>
                        <td className="py-3 pr-3 text-[var(--rm-ink)]">
                          {inv.paymentMethod} ·{' '}
                          <span className="text-[11px] text-[var(--rm-ink-muted)]">
                            {inv.mode}
                          </span>
                        </td>
                        <td className="py-3 pr-3 font-bold tabular-nums text-[var(--rm-ink)]">
                          {formatFcfa(inv.amountXof)}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              inv.status === 'PAID'
                                ? 'bg-[#14B8A6]/15 text-[#14B8A6]'
                                : 'bg-amber-500/15 text-amber-600'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {inv.status === 'PENDING' ? (
                            <div className="inline-flex items-center gap-2">
                              {inv.checkoutUrl && (
                                <a
                                  href={inv.checkoutUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#FF8738] font-semibold hover:underline"
                                >
                                  Payer
                                </a>
                              )}
                              <button
                                type="button"
                                disabled={verifyingInvoiceId === inv.id}
                                onClick={() => void handleVerifyInvoice(inv.id)}
                                className="text-[var(--rm-ink)] font-semibold hover:underline cursor-pointer"
                              >
                                {verifyingInvoiceId === inv.id
                                  ? 'Vérif...'
                                  : 'Vérifier'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => window.print()}
                              className="text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] font-semibold cursor-pointer"
                            >
                              Imprimer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </RestaurantLayout>
  );
}
