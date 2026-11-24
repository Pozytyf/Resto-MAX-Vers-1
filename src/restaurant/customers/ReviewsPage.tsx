import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { RestaurantLayout } from '../RestaurantLayout';
import { apiFetch } from '../../services/api';
import { ReviewsSection } from './ReviewsSection';
import type { CustomerReview, ReviewSummary } from '../../types';

export function ReviewsPage() {
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch<{ reviews: CustomerReview[]; summary: ReviewSummary }>(
      '/api/restaurant/reviews',
    )
      .then((res) => {
        setReviews(res.reviews);
        setSummary(res.summary);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <RestaurantLayout
      title="Notation du service & Avis clients"
      onRealtimeEvent={(eventType) => {
        if (eventType === 'review:created') {
          load();
        }
      }}
      actions={
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface)] text-xs font-semibold text-[var(--rm-ink)] hover:border-[#FF8738] cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      }
    >
      {loading ? (
        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-8 text-center text-xs text-[var(--rm-ink-muted)]">
          Chargement des évaluations…
        </div>
      ) : (
        <ReviewsSection reviews={reviews} summary={summary} onReplySuccess={load} />
      )}
    </RestaurantLayout>
  );
}
