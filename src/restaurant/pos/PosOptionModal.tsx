import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { formatFcfa } from '../../utils/format';
import type { MenuItem } from '../../types';

export function PosOptionModal({
  item,
  onClose,
  onConfirm,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onConfirm: (item: MenuItem, optionIds: string[], note: string) => void;
}) {
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!item) return;
    const defaults: string[] = [];
    for (const grp of item.optionGroups || []) {
      if (grp.required && !grp.multiple && grp.choices[0]) {
        defaults.push(grp.choices[0].id);
      }
    }
    setChosenIds(defaults);
    setNote('');
  }, [item]);

  if (!item) return null;

  const basePrice = Number(item.effectivePriceXof ?? item.priceXof);
  const groups = item.optionGroups || [];
  const legacyOptions = item.options || [];

  let delta = 0;
  const counted = new Set<string>();
  for (const g of groups) {
    for (const c of g.choices) {
      if (chosenIds.includes(c.id)) {
        counted.add(c.id);
        delta += Number(c.priceDeltaXof || 0);
      }
    }
  }
  for (const leg of legacyOptions) {
    if (chosenIds.includes(leg.id) && !counted.has(leg.id)) {
      delta += Number(leg.priceDeltaXof || 0);
    }
  }

  const missingRequired = groups.some(
    (g) => g.required && !g.choices.some((c) => chosenIds.includes(c.id)),
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
      <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4 max-h-[88vh] overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--rm-ink)]">
              {item.name}
            </h3>
            <p className="text-sm font-bold text-[#FF8738] tabular-nums">
              {formatFcfa(basePrice + delta)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {groups.map((grp) => (
          <div key={grp.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[var(--rm-ink)]">{grp.name}</span>
              <span className="text-[11px] text-[var(--rm-ink-muted)]">
                {grp.required ? 'Obligatoire' : 'Facultatif'}
              </span>
            </div>
            {grp.choices.map((ch) => {
              const checked = chosenIds.includes(ch.id);
              return (
                <label
                  key={ch.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--rm-border)] text-xs cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type={grp.multiple ? 'checkbox' : 'radio'}
                      name={`pos_grp_${grp.id}`}
                      checked={checked}
                      onChange={(e) => {
                        if (grp.multiple) {
                          setChosenIds((prev) =>
                            e.target.checked
                              ? [...prev, ch.id]
                              : prev.filter((x) => x !== ch.id),
                          );
                        } else {
                          const ids = new Set(grp.choices.map((x) => x.id));
                          setChosenIds((prev) => [
                            ...prev.filter((x) => !ids.has(x)),
                            ch.id,
                          ]);
                        }
                      }}
                    />
                    <span className="font-medium text-[var(--rm-ink)]">
                      {ch.label}
                    </span>
                  </span>
                  <span className="tabular-nums text-[var(--rm-ink-muted)]">
                    {ch.priceDeltaXof > 0
                      ? `+${formatFcfa(ch.priceDeltaXof)}`
                      : 'Inclus'}
                  </span>
                </label>
              );
            })}
          </div>
        ))}

        {legacyOptions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-[var(--rm-ink)]">Suppléments</p>
            {legacyOptions.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--rm-border)] text-xs cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chosenIds.includes(opt.id)}
                    onChange={(e) =>
                      setChosenIds((prev) =>
                        e.target.checked
                          ? [...prev, opt.id]
                          : prev.filter((x) => x !== opt.id),
                      )
                    }
                  />
                  <span>{opt.label}</span>
                </span>
                <span className="tabular-nums text-[var(--rm-ink-muted)]">
                  {opt.priceDeltaXof > 0
                    ? `+${formatFcfa(opt.priceDeltaXof)}`
                    : 'Inclus'}
                </span>
              </label>
            ))}
          </div>
        )}

        <input
          type="text"
          placeholder="Note cuisine / cuisson (optionnel)…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
        />

        <button
          type="button"
          disabled={missingRequired}
          onClick={() => onConfirm(item, chosenIds, note)}
          className="w-full py-2.5 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-bold cursor-pointer disabled:opacity-50 tabular-nums"
        >
          Ajouter au ticket ({formatFcfa(basePrice + delta)})
        </button>
      </div>
    </div>
  );
}
