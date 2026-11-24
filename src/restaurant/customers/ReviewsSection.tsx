import { useMemo, useState } from 'react';
import { Award, MessageSquare, Star, UserCheck } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateTimeFr } from '../../utils/format';
import type { CustomerReview, ReviewSummary } from '../../types';

function formatChannelLabel(channel?: string): string {
  switch (channel) {
    case 'QR_SERVICE':
      return 'Notation salle (QR)';
    case 'STOREFRONT_SERVICE':
      return 'Notation vitrine en ligne';
    case 'STOREFRONT_ORDER':
      return 'Click & Collect / Livraison';
    case 'QR_ORDER':
    default:
      return 'Commande QR table';
  }
}

export function ReviewsSection({
  reviews,
  summary,
  onReplySuccess,
}: {
  reviews: CustomerReview[];
  summary: ReviewSummary | null;
  onReplySuccess: () => void;
}) {
  const { notify } = useToast();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<'ALL' | 'HIGH' | 'LOW'>('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'QR' | 'SERVICE' | 'STOREFRONT'>('ALL');

  const handleReplyReview = async (reviewId: string) => {
    const reply = (replyDrafts[reviewId] || '').trim();
    if (reply.length < 2) {
      notify('Saisissez une réponse de 2 caractères minimum.', 'error');
      return;
    }
    setSendingReplyId(reviewId);
    try {
      await apiFetch(`/api/restaurant/reviews/${reviewId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply }),
      });
      notify('Réponse publiée sur l’avis client.', 'success');
      setReplyDrafts((prev) => ({ ...prev, [reviewId]: '' }));
      onReplySuccess();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur lors de la publication.', 'error');
    } finally {
      setSendingReplyId(null);
    }
  };

  const filteredReviews = useMemo(() => {
    return reviews.filter((rev) => {
      if (ratingFilter === 'HIGH' && rev.rating < 4) return false;
      if (ratingFilter === 'LOW' && rev.rating > 3) return false;
      if (channelFilter === 'QR' && rev.channel !== 'QR_ORDER') return false;
      if (
        channelFilter === 'SERVICE' &&
        rev.channel !== 'QR_SERVICE' &&
        rev.channel !== 'STOREFRONT_SERVICE'
      ) {
        return false;
      }
      if (
        channelFilter === 'STOREFRONT' &&
        rev.channel !== 'STOREFRONT_ORDER' &&
        rev.channel !== 'STOREFRONT_SERVICE'
      ) {
        return false;
      }
      return true;
    });
  }, [reviews, ratingFilter, channelFilter]);

  return (
    <div className="space-y-6" data-testid="customer-reviews-panel">
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5">
            <p className="text-xs text-[var(--rm-ink-muted)]">Note globale</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-[var(--rm-ink)] tabular-nums">
                {summary.avgRating.toFixed(1)}
              </span>
              <span className="text-xs text-[var(--rm-ink-muted)]">/ 5 · {summary.total} avis</span>
            </div>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-4 h-4 ${
                    s <= Math.round(summary.avgRating)
                      ? 'text-[#FF8738] fill-[#FF8738]'
                      : 'text-[var(--rm-border)]'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5">
            <p className="text-xs text-[var(--rm-ink-muted)]">Accueil & Service</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-[#14B8A6] tabular-nums">
                {summary.avgServiceRating.toFixed(1)}
              </span>
              <span className="text-xs text-[var(--rm-ink-muted)]">/ 5</span>
            </div>
            <p className="mt-2 text-[11px] text-[var(--rm-ink-muted)]">
              Qualité d’accueil et attention en salle
            </p>
          </div>

          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5">
            <p className="text-xs text-[var(--rm-ink-muted)]">Plats & Boissons</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-[#FF8738] tabular-nums">
                {summary.avgFoodRating.toFixed(1)}
              </span>
              <span className="text-xs text-[var(--rm-ink-muted)]">/ 5</span>
            </div>
            <p className="mt-2 text-[11px] text-[var(--rm-ink-muted)]">
              Qualité culinaire, température & bar
            </p>
          </div>

          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5">
            <p className="text-xs text-[var(--rm-ink-muted)]">Rapidité</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-[var(--rm-ink)] tabular-nums">
                {summary.avgSpeedRating.toFixed(1)}
              </span>
              <span className="text-xs text-[var(--rm-ink-muted)]">/ 5</span>
            </div>
            <p className="mt-2 text-[11px] text-[var(--rm-ink-muted)]">
              Délai d’attente et cadence de service
            </p>
          </div>

          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.breakdown[star] || 0;
              const pct =
                summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-[11px]">
                  <span className="w-6 font-semibold text-[var(--rm-ink)] tabular-nums">
                    {star}★
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-[var(--rm-surface-muted)] overflow-hidden">
                    <div className="h-full bg-[#FF8738]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right text-[var(--rm-ink-muted)] tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {summary && summary.waiterStats && summary.waiterStats.length > 0 && (
        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#FF8738]" />
            <h3 className="text-sm font-bold text-[var(--rm-ink)]">
              Performance service par serveur
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.waiterStats.map((w) => (
              <div
                key={w.waiterName}
                className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--rm-ink)] truncate flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-[#14B8A6] shrink-0" />
                    <span className="truncate">{w.waiterName}</span>
                  </p>
                  <p className="text-[11px] text-[var(--rm-ink-muted)] tabular-nums mt-0.5">
                    {w.count} évaluation{w.count > 1 ? 's' : ''} · Global {w.avgRating.toFixed(1)}/5
                  </p>
                </div>
                <span className="text-sm font-extrabold text-[#FF8738] tabular-nums shrink-0">
                  ★ {w.avgServiceRating.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1">
          {(
            [
              { id: 'ALL', label: `Tous (${reviews.length})` },
              { id: 'HIGH', label: '4★ et +' },
              { id: 'LOW', label: 'À traiter (≤ 3★)' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setRatingFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                ratingFilter === f.id
                  ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                  : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="inline-flex flex-wrap p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1">
          {(
            [
              { id: 'ALL', label: 'Tous canaux' },
              { id: 'SERVICE', label: 'Notation directe' },
              { id: 'QR', label: 'Commandes QR' },
              { id: 'STOREFRONT', label: 'Click & Collect / Livraison' },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChannelFilter(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                channelFilter === c.id
                  ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                  : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] divide-y divide-[var(--rm-border-subtle)]">
        {filteredReviews.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <MessageSquare className="w-6 h-6 text-[var(--rm-ink-muted)] mx-auto" />
            <p className="text-xs text-[var(--rm-ink-muted)]">
              Aucun avis client ne correspond aux filtres sélectionnés.
            </p>
          </div>
        ) : (
          filteredReviews.map((rev) => (
            <div key={rev.id} className="p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= rev.rating
                            ? 'text-[#FF8738] fill-[#FF8738]'
                            : 'text-[var(--rm-border)]'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-[var(--rm-ink)]">
                    {rev.customerName || 'Client'}
                  </span>
                  <span className="text-[11px] text-[var(--rm-ink-muted)]">
                    {formatChannelLabel(rev.channel)}
                    {rev.orderNumber ? ` · ${rev.orderNumber}` : ''}
                    {rev.tableLabel ? ` · ${rev.tableLabel}` : ''}
                    {rev.waiterName ? ` · Serveur : ${rev.waiterName}` : ''}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--rm-ink-muted)] tabular-nums">
                  {formatDateTimeFr(rev.createdAt)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--rm-ink-muted)] tabular-nums">
                <span>
                  Service : <strong className="text-[var(--rm-ink)]">{rev.serviceRating ?? rev.rating}/5</strong>
                </span>
                <span>
                  Plats & Boissons : <strong className="text-[var(--rm-ink)]">{rev.foodRating ?? rev.rating}/5</strong>
                </span>
                <span>
                  Rapidité : <strong className="text-[var(--rm-ink)]">{rev.speedRating ?? rev.rating}/5</strong>
                </span>
              </div>

              {rev.comment && (
                <p className="text-xs text-[var(--rm-ink)] leading-relaxed">{rev.comment}</p>
              )}

              {rev.reply ? (
                <div className="p-3 rounded-lg bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] text-xs">
                  <span className="font-bold text-[#14B8A6]">Réponse du restaurant : </span>
                  <span className="text-[var(--rm-ink)]">{rev.reply}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Rédiger une réponse au client…"
                    value={replyDrafts[rev.id] || ''}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({
                        ...prev,
                        [rev.id]: e.target.value,
                      }))
                    }
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                  />
                  <button
                    type="button"
                    disabled={sendingReplyId === rev.id}
                    onClick={() => void handleReplyReview(rev.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#182333] dark:bg-[#FF8738] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Répondre
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
