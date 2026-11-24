import React, { useState } from 'react';
import { Star } from 'lucide-react';

export interface ServiceRatingPayload {
  rating: number;
  serviceRating: number;
  foodRating: number;
  speedRating: number;
  waiterName: string;
  customerName?: string;
  comment: string;
}

interface ServiceRatingFormProps {
  onSubmit: (payload: ServiceRatingPayload) => Promise<void>;
  waiters?: string[];
  allowWaiterInput?: boolean;
  askCustomerName?: boolean;
  defaultCustomerName?: string;
  submitting?: boolean;
  submitLabel?: string;
  testIdPrefix?: string;
}

function StarRow({
  label,
  value,
  onChange,
  testIdPrefix,
  size = 'md',
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  testIdPrefix?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-[var(--rm-ink)]">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            aria-label={`${label} : ${star} sur 5`}
            data-testid={testIdPrefix ? `${testIdPrefix}-${star}` : undefined}
            className="p-0.5 cursor-pointer"
          >
            <Star
              className={`${size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} transition-colors ${
                star <= value
                  ? 'text-[#FF8738] fill-[#FF8738]'
                  : 'text-slate-300 dark:text-slate-600'
              }`}
            />
          </button>
        ))}
        <span className="ml-1.5 w-6 text-right text-[11px] font-bold text-[var(--rm-ink-muted)] tabular-nums">
          {value}/5
        </span>
      </div>
    </div>
  );
}

export function ServiceRatingForm({
  onSubmit,
  waiters = [],
  allowWaiterInput = true,
  askCustomerName = false,
  defaultCustomerName = '',
  submitting = false,
  submitLabel = 'Publier mon avis',
  testIdPrefix = 'rating',
}: ServiceRatingFormProps) {
  const [serviceRating, setServiceRating] = useState(5);
  const [foodRating, setFoodRating] = useState(5);
  const [speedRating, setSpeedRating] = useState(5);
  const [manualOverall, setManualOverall] = useState<number | null>(null);
  const [selectedWaiter, setSelectedWaiter] = useState('');
  const [customWaiter, setCustomWaiter] = useState('');
  const [customerName, setCustomerName] = useState(defaultCustomerName);
  const [comment, setComment] = useState('');

  const computedOverall = Math.max(
    1,
    Math.min(5, Math.round((serviceRating + foodRating + speedRating) / 3)),
  );
  const overallRating = manualOverall ?? computedOverall;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedWaiter =
      selectedWaiter === '__OTHER__'
        ? customWaiter.trim()
        : selectedWaiter || customWaiter.trim();

    await onSubmit({
      rating: overallRating,
      serviceRating,
      foodRating,
      speedRating,
      waiterName: resolvedWaiter,
      ...(askCustomerName ? { customerName: customerName.trim() } : {}),
      comment: comment.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-3.5 space-y-2.5">
        <StarRow
          label="Accueil & Service"
          value={serviceRating}
          onChange={setServiceRating}
          testIdPrefix={`${testIdPrefix}-service`}
          size="sm"
        />
        <StarRow
          label="Plats & Boissons"
          value={foodRating}
          onChange={setFoodRating}
          testIdPrefix={`${testIdPrefix}-food`}
          size="sm"
        />
        <StarRow
          label="Rapidité"
          value={speedRating}
          onChange={setSpeedRating}
          testIdPrefix={`${testIdPrefix}-speed`}
          size="sm"
        />
        <div className="pt-2 border-t border-[var(--rm-border)]">
          <StarRow
            label="Note globale"
            value={overallRating}
            onChange={(n) => setManualOverall(n)}
            testIdPrefix={`${testIdPrefix}-overall`}
            size="md"
          />
        </div>
      </div>

      {(waiters.length > 0 || allowWaiterInput) && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[var(--rm-ink)]">
            Serveur / Équipe (optionnel)
          </label>
          {waiters.length > 0 ? (
            <>
              <select
                value={selectedWaiter}
                onChange={(e) => setSelectedWaiter(e.target.value)}
                data-testid={`${testIdPrefix}-waiter-select`}
                className="w-full px-3 py-2 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-[var(--rm-ink)]"
              >
                <option value="">Non précisé</option>
                {waiters.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
                <option value="__OTHER__">Autre personne…</option>
              </select>
              {selectedWaiter === '__OTHER__' && (
                <input
                  type="text"
                  maxLength={80}
                  placeholder="Prénom du serveur"
                  value={customWaiter}
                  onChange={(e) => setCustomWaiter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-[var(--rm-ink)]"
                />
              )}
            </>
          ) : (
            <input
              type="text"
              maxLength={80}
              placeholder="Nom du serveur (si connu)"
              value={customWaiter}
              onChange={(e) => setCustomWaiter(e.target.value)}
              data-testid={`${testIdPrefix}-waiter-input`}
              className="w-full px-3 py-2 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-[var(--rm-ink)]"
            />
          )}
        </div>
      )}

      {askCustomerName && (
        <div>
          <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
            Votre prénom (optionnel)
          </label>
          <input
            type="text"
            maxLength={80}
            placeholder="Ex: Awa, Kouadio…"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-[var(--rm-ink)]"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
          Votre commentaire (optionnel)
        </label>
        <textarea
          rows={3}
          maxLength={600}
          placeholder="Un mot sur l’accueil, le service, la cuisine ou la rapidité…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          data-testid={`${testIdPrefix}-comment`}
          className="w-full px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-[var(--rm-ink)]"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        data-testid={`${testIdPrefix}-submit-btn`}
        className="w-full py-2.5 px-4 rounded-xl bg-[#182333] dark:bg-[#FF8738] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
      >
        {submitting ? 'Envoi en cours…' : submitLabel}
      </button>
    </form>
  );
}
