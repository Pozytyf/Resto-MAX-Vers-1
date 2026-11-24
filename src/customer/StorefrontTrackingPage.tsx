import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Gift,
  RefreshCw,
  Smartphone,
  Star,
  Store,
  Truck,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useWebSocketRoom } from '../hooks/useWebSocket';
import { useToast } from '../components/Toast';
import {
  formatFcfa,
  formatTimeFr,
  getDeliveryStatusLabel,
} from '../utils/format';
import { ServiceRatingForm, type ServiceRatingPayload } from './ServiceRatingForm';
import type { CustomerReview } from '../types';

interface TrackedStorefrontOrder {
  id: string;
  orderNumber: string;
  orderType: 'CLICK_COLLECT' | 'DELIVERY';
  status: string;
  discountXof: number;
  deliveryFeeXof: number;
  deliveryZone: string;
  deliveryAddress: string;
  scheduledSlot: string;
  totalXof: number;
  paidXof: number;
  customerName: string;
  customerPhone: string;
  promoCode: string;
  loyaltyPointsEarned: number;
  notes: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantAddress: string;
  restaurantPhone: string;
  createdAt: string;
  canReview: boolean;
  review: CustomerReview | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    options_summary: string;
    line_total_xof: number;
  }>;
}

export function StorefrontTrackingPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const { notify } = useToast();
  const [order, setOrder] = useState<TrackedStorefrontOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<
    'WAVE' | 'ORANGE_MONEY' | 'MTN_MOMO' | 'CARD'
  >('WAVE');
  const [paying, setPaying] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = useCallback(() => {
    if (!slug || !orderId) return;
    apiFetch<{ order: TrackedStorefrontOrder }>(
      `/api/public/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}`,
    )
      .then((res) => {
        setOrder(res.order);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Commande introuvable.');
      })
      .finally(() => setLoading(false));
  }, [slug, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  useWebSocketRoom(orderId ? `order:${orderId}` : null, () => load());

  const handlePayNow = async () => {
    if (!slug || !order || paying) return;
    setPaying(true);
    try {
      await apiFetch(
        `/api/public/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(order.id)}/pay`,
        {
          method: 'POST',
          body: JSON.stringify({
            method: payMethod,
            phoneNumber: order.customerPhone,
          }),
        },
      );
      notify('Paiement en ligne confirmé !', 'success');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur paiement.', 'error');
    } finally {
      setPaying(false);
    }
  };

  const handleSubmitReview = async (payload: ServiceRatingPayload) => {
    if (!slug || !order || submittingReview) return;
    setSubmittingReview(true);
    try {
      await apiFetch(
        `/api/public/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(order.id)}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            customerName: order.customerName,
          }),
        },
      );
      notify('Merci pour votre avis !', 'success');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur avis client.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--rm-canvas)] flex items-center justify-center p-6 text-sm text-[var(--rm-ink-muted)]">
        Chargement du suivi…
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[var(--rm-canvas)] flex items-center justify-center p-6">
        <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-7 text-center space-y-3">
          <XCircle className="w-8 h-8 text-[#E05252] mx-auto" />
          <h1 className="text-base font-bold text-[var(--rm-ink)]">
            Commande introuvable
          </h1>
          <p className="text-xs text-[var(--rm-ink-muted)]">{error}</p>
          {slug && (
            <Link
              to={`/c/${encodeURIComponent(slug)}`}
              className="inline-flex px-4 py-2 rounded-xl bg-[#182333] text-white text-xs font-semibold"
            >
              Retour à la boutique
            </Link>
          )}
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, order.totalXof - order.paidXof);

  return (
    <div className="min-h-screen bg-[var(--rm-canvas)] text-[var(--rm-ink)] pb-16">
      <header className="sticky top-0 z-30 bg-[#182333] text-white px-4 py-3.5 border-b border-white/10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link
            to={`/c/${encodeURIComponent(slug || '')}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Boutique</span>
          </Link>
          <div className="text-center min-w-0">
            <h1 className="text-sm font-bold truncate">{order.restaurantName}</h1>
            <p className="text-[11px] text-slate-300 font-mono">
              {order.orderNumber} · {formatTimeFr(order.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-5">
        <section className="bg-[#182333] text-white rounded-2xl p-6 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            {order.orderType === 'DELIVERY' ? (
              <Truck className="w-4 h-4 text-[#FF8738]" />
            ) : (
              <Store className="w-4 h-4 text-[#14B8A6]" />
            )}
            <span>
              {order.orderType === 'DELIVERY'
                ? `Livraison · ${order.deliveryZone}`
                : `Click & Collect · Créneau ${order.scheduledSlot}`}
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-[#14B8A6]">
            {getDeliveryStatusLabel(order.status)}
          </h2>
          {order.orderType === 'DELIVERY' && order.deliveryAddress && (
            <p className="text-xs text-slate-300">
              Adresse : {order.deliveryAddress}
            </p>
          )}
        </section>

        <section className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-5 space-y-4">
          <h3 className="text-sm font-bold text-[var(--rm-ink)]">
            Détails de la commande
          </h3>
          <div className="divide-y divide-[var(--rm-border-subtle)] text-xs">
            {order.items.map((it) => (
              <div key={it.id} className="py-2.5 flex justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--rm-ink)]">
                    {it.quantity}× {it.name}
                  </p>
                  {it.options_summary && (
                    <p className="text-[var(--rm-ink-muted)]">{it.options_summary}</p>
                  )}
                </div>
                <span className="font-bold tabular-nums">
                  {formatFcfa(it.line_total_xof)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[var(--rm-border)] space-y-1 text-xs">
            {order.deliveryFeeXof > 0 && (
              <div className="flex justify-between text-[var(--rm-ink-muted)]">
                <span>Frais de livraison</span>
                <span className="tabular-nums">{formatFcfa(order.deliveryFeeXof)}</span>
              </div>
            )}
            {order.discountXof > 0 && (
              <div className="flex justify-between text-[#14B8A6] font-semibold">
                <span>Remise</span>
                <span className="tabular-nums">-{formatFcfa(order.discountXof)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-[var(--rm-ink)] pt-1">
              <span>Total TTC</span>
              <span className="tabular-nums">{formatFcfa(order.totalXof)}</span>
            </div>
          </div>

          {remaining > 0 && order.status !== 'CANCELLED' ? (
            <div className="pt-3 border-t border-[var(--rm-border)] space-y-3">
              <p className="text-xs font-bold text-[var(--rm-ink)]">
                Régler en ligne ({formatFcfa(remaining)})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'WAVE', label: 'Wave' },
                    { id: 'ORANGE_MONEY', label: 'Orange Money' },
                    { id: 'MTN_MOMO', label: 'MTN MoMo' },
                    { id: 'CARD', label: 'Carte' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPayMethod(m.id)}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                      payMethod === m.id
                        ? 'border-[#FF8738] bg-[#FF8738]/12 text-[#FF8738]'
                        : 'border-[var(--rm-border)] bg-[var(--rm-surface-muted)]'
                    }`}
                  >
                    {m.id === 'CARD' ? (
                      <CreditCard className="w-3.5 h-3.5" />
                    ) : (
                      <Smartphone className="w-3.5 h-3.5" />
                    )}
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={paying}
                onClick={handlePayNow}
                className="w-full h-11 rounded-xl bg-[#14B8A6] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {paying
                  ? 'Validation…'
                  : `Payer maintenant (${formatFcfa(remaining)})`}
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[#14B8A6]/10 border border-[#14B8A6]/30 text-xs text-[#14B8A6] space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Commande payée en ligne</span>
              </div>
              {order.loyaltyPointsEarned > 0 && (
                <p className="flex items-center gap-1 pl-6 font-semibold">
                  <Gift className="w-3.5 h-3.5" />
                  +{order.loyaltyPointsEarned} points fidélité cumulés
                </p>
              )}
            </div>
          )}
        </section>

        {(order.canReview || order.review) && (
          <section className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-5 space-y-3">
            <h3 className="text-sm font-bold text-[var(--rm-ink)] flex items-center gap-2">
              <Star className="w-4 h-4 text-[#FF8738] fill-[#FF8738]" />
              <span>Votre avis sur cette commande</span>
            </h3>
            {order.review ? (
              <div className="space-y-2 text-xs">
                <p className="font-bold text-[#FF8738] tabular-nums">
                  Note globale : {order.review.rating}/5 ★
                </p>
                <div className="flex flex-wrap gap-3 text-[11px] text-[var(--rm-ink-muted)] tabular-nums">
                  <span>Service : {order.review.serviceRating ?? order.review.rating}/5</span>
                  <span>Plats & Boissons : {order.review.foodRating ?? order.review.rating}/5</span>
                  <span>Rapidité : {order.review.speedRating ?? order.review.rating}/5</span>
                  {order.review.waiterName && (
                    <span>Serveur : {order.review.waiterName}</span>
                  )}
                </div>
                {order.review.comment && (
                  <p className="italic text-[var(--rm-ink-muted)]">
                    « {order.review.comment} »
                  </p>
                )}
                {order.review.reply && (
                  <div className="p-3 rounded-xl bg-[var(--rm-surface-muted)] text-[var(--rm-ink)]">
                    <span className="font-bold">Réponse de l’établissement : </span>
                    {order.review.reply}
                  </div>
                )}
              </div>
            ) : (
              <ServiceRatingForm
                allowWaiterInput={false}
                submitting={submittingReview}
                submitLabel="Envoyer mon avis"
                testIdPrefix="storefront-review"
                onSubmit={handleSubmitReview}
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}
