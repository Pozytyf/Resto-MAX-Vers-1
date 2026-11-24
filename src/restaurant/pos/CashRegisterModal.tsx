import React, { useCallback, useEffect, useState } from 'react';
import { Calculator, CheckCircle2, LockOpen, Printer, Receipt, X } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateFr, formatFcfa } from '../../utils/format';
import type { CashRegisterSession } from '../../types';

interface RegisterStateResponse {
  activeSession: CashRegisterSession | null;
  liveTotals: {
    expectedCashXof: number;
    expectedMobileXof: number;
    expectedCardXof: number;
    totalSalesXof: number;
    refundsXof: number;
    ordersCount: number;
  } | null;
  history: CashRegisterSession[];
}

export function CashRegisterModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { notify } = useToast();
  const [state, setState] = useState<RegisterStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [openingFloat, setOpeningFloat] = useState(25000);
  const [openNotes, setOpenNotes] = useState('');

  const [countedCash, setCountedCash] = useState(0);
  const [countedMobile, setCountedMobile] = useState(0);
  const [countedCard, setCountedCard] = useState(0);
  const [closeNotes, setCloseNotes] = useState('');
  const [selectedZ, setSelectedZ] = useState<CashRegisterSession | null>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<RegisterStateResponse>(
        '/api/restaurant/pos/register',
      );
      setState(res);
      if (res.liveTotals) {
        setCountedCash(res.liveTotals.expectedCashXof);
        setCountedMobile(res.liveTotals.expectedMobileXof);
        setCountedCard(res.liveTotals.expectedCardXof);
      }
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Erreur chargement caisse.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (open) {
      setSelectedZ(null);
      void loadState();
    }
  }, [open, loadState]);

  if (!open) return null;

  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/restaurant/pos/register/open', {
        method: 'POST',
        body: JSON.stringify({
          openingFloatXof: Math.max(0, Math.round(openingFloat)),
          notes: openNotes.trim(),
        }),
      });
      notify('Session de caisse ouverte.', 'success');
      setOpenNotes('');
      await loadState();
      onChanged?.();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Impossible d’ouvrir la caisse.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch<{ report: CashRegisterSession }>(
        '/api/restaurant/pos/register/close',
        {
          method: 'POST',
          body: JSON.stringify({
            countedCashXof: Math.max(0, Math.round(countedCash)),
            countedMobileXof: Math.max(0, Math.round(countedMobile)),
            countedCardXof: Math.max(0, Math.round(countedCard)),
            notes: closeNotes.trim(),
          }),
        },
      );
      notify(`Clôture ${res.report.zNumber} enregistrée.`, 'success');
      setSelectedZ(res.report);
      setCloseNotes('');
      await loadState();
      onChanged?.();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Erreur lors de la clôture Z.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const expectedTotal = state?.liveTotals
    ? state.liveTotals.expectedCashXof +
      state.liveTotals.expectedMobileXof +
      state.liveTotals.expectedCardXof
    : 0;
  const countedTotal = countedCash + countedMobile + countedCard;
  const liveVariance = countedTotal - expectedTotal;

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
      <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--rm-border-subtle)] pb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--rm-ink)] flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#FF8738]" />
              <span>Caisse & Rapport Z journalier</span>
            </h2>
            <p className="text-xs text-[var(--rm-ink-muted)] mt-0.5">
              Ouverture avec fond de caisse, rapprochement Espèces / Mobile Money / Carte et clôture horodatée.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--rm-ink-muted)] hover:bg-[var(--rm-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && !state ? (
          <div className="py-10 text-center text-xs text-[var(--rm-ink-muted)]">
            Chargement de l’état de caisse…
          </div>
        ) : (
          <>
            {selectedZ && (
              <div
                data-testid="z-report-preview"
                className="rounded-xl border border-[#14B8A6]/40 bg-[#14B8A6]/8 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#14B8A6]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Rapport Z {selectedZ.zNumber}</span>
                  </div>
                  <div className="flex items-center gap-2 no-print">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#182333] text-white text-xs font-semibold cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedZ(null)}
                      className="text-xs text-[var(--rm-ink-muted)] hover:underline cursor-pointer"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[var(--rm-ink-muted)]">CA Encaissé : </span>
                    <strong className="tabular-nums">{formatFcfa(selectedZ.totalSalesXof)}</strong>
                  </div>
                  <div>
                    <span className="text-[var(--rm-ink-muted)]">Espèces comptées : </span>
                    <strong className="tabular-nums">{formatFcfa(selectedZ.countedCashXof)}</strong>
                  </div>
                  <div>
                    <span className="text-[var(--rm-ink-muted)]">Mobile Money : </span>
                    <strong className="tabular-nums">{formatFcfa(selectedZ.countedMobileXof)}</strong>
                  </div>
                  <div>
                    <span className="text-[var(--rm-ink-muted)]">Écart total : </span>
                    <strong
                      className={`tabular-nums ${
                        selectedZ.varianceXof === 0
                          ? 'text-[#14B8A6]'
                          : 'text-[#E05252]'
                      }`}
                    >
                      {selectedZ.varianceXof > 0
                        ? `+${formatFcfa(selectedZ.varianceXof)}`
                        : formatFcfa(selectedZ.varianceXof)}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {!state?.activeSession ? (
              <form
                onSubmit={handleOpenRegister}
                data-testid="open-register-form"
                className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-5 space-y-4"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--rm-ink)]">
                  <LockOpen className="w-4 h-4 text-[#14B8A6]" />
                  <span>Ouvrir une session de caisse</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                      Fond de caisse initial (FCFA)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={openingFloat}
                      onChange={(e) => setOpeningFloat(Number(e.target.value) || 0)}
                      data-testid="opening-float-input"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                      Note d’ouverture (optionnel)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Service midi"
                      value={openNotes}
                      onChange={(e) => setOpenNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  data-testid="open-register-submit-btn"
                  className="px-4 py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#0D9488] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {busy ? 'Ouverture…' : 'Ouvrir la caisse'}
                </button>
              </form>
            ) : (
              <form
                onSubmit={handleCloseRegister}
                data-testid="close-register-form"
                className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#14B8A6]">
                      Session ouverte par {state.activeSession.openedByName}
                    </p>
                    <p className="text-[11px] text-[var(--rm-ink-muted)]">
                      Depuis {formatDateFr(state.activeSession.openedAt)} · Fond de caisse :{' '}
                      <strong className="tabular-nums">
                        {formatFcfa(state.activeSession.openingFloatXof)}
                      </strong>
                    </p>
                  </div>
                  {state.liveTotals && (
                    <div className="text-right">
                      <p className="text-xs font-bold text-[var(--rm-ink)] tabular-nums">
                        Ventes session : {formatFcfa(state.liveTotals.totalSalesXof)}
                      </p>
                      <p className="text-[11px] text-[var(--rm-ink-muted)] tabular-nums">
                        {state.liveTotals.ordersCount} commande(s) · Remboursements :{' '}
                        {formatFcfa(state.liveTotals.refundsXof)}
                      </p>
                    </div>
                  )}
                </div>

                {state.liveTotals && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg bg-[var(--rm-surface)] border border-[var(--rm-border)] p-3 space-y-1.5">
                      <div className="flex justify-between text-[11px] text-[var(--rm-ink-muted)]">
                        <span>Espèces attendues</span>
                        <span className="font-bold tabular-nums">
                          {formatFcfa(state.liveTotals.expectedCashXof)}
                        </span>
                      </div>
                      <label className="block text-[11px] font-semibold">
                        Comptage réel Espèces
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={countedCash}
                        onChange={(e) => setCountedCash(Number(e.target.value) || 0)}
                        data-testid="counted-cash-input"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm font-bold tabular-nums"
                      />
                    </div>
                    <div className="rounded-lg bg-[var(--rm-surface)] border border-[var(--rm-border)] p-3 space-y-1.5">
                      <div className="flex justify-between text-[11px] text-[var(--rm-ink-muted)]">
                        <span>Mobile Money attendu</span>
                        <span className="font-bold tabular-nums">
                          {formatFcfa(state.liveTotals.expectedMobileXof)}
                        </span>
                      </div>
                      <label className="block text-[11px] font-semibold">
                        Relevé Wave / OM / MoMo
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={countedMobile}
                        onChange={(e) => setCountedMobile(Number(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm font-bold tabular-nums"
                      />
                    </div>
                    <div className="rounded-lg bg-[var(--rm-surface)] border border-[var(--rm-border)] p-3 space-y-1.5">
                      <div className="flex justify-between text-[11px] text-[var(--rm-ink-muted)]">
                        <span>TPE Carte attendu</span>
                        <span className="font-bold tabular-nums">
                          {formatFcfa(state.liveTotals.expectedCardXof)}
                        </span>
                      </div>
                      <label className="block text-[11px] font-semibold">
                        Télécollecte TPE Carte
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={countedCard}
                        onChange={(e) => setCountedCard(Number(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm font-bold tabular-nums"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <input
                    type="text"
                    placeholder="Commentaire de clôture (justification d'écart…)"
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                  />
                  <div className="text-xs font-bold tabular-nums shrink-0">
                    Écart estimé :{' '}
                    <span
                      className={
                        liveVariance === 0 ? 'text-[#14B8A6]' : 'text-[#E05252]'
                      }
                    >
                      {liveVariance > 0
                        ? `+${formatFcfa(liveVariance)}`
                        : formatFcfa(liveVariance)}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    data-testid="close-register-submit-btn"
                    className="px-4 py-2.5 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-bold cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {busy ? 'Clôture…' : 'Clôturer & Générer Rapport Z'}
                  </button>
                </div>
              </form>
            )}

            {/* Archive Z Reports */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--rm-ink-muted)] flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                <span>Historique des clôtures Z ({state?.history.length || 0})</span>
              </h3>
              {!state?.history.length ? (
                <p className="text-xs text-[var(--rm-ink-muted)] py-3">
                  Aucun rapport Z archivé pour le moment.
                </p>
              ) : (
                <div className="divide-y divide-[var(--rm-border-subtle)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
                  {state.history.map((z) => (
                    <div
                      key={z.id}
                      className="p-3 bg-[var(--rm-surface)] flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-mono font-bold text-[var(--rm-ink)]">
                          {z.zNumber} · {z.closedByName}
                        </p>
                        <p className="text-[11px] text-[var(--rm-ink-muted)]">
                          {z.closedAt ? formatDateFr(z.closedAt) : ''} · {z.ordersCount} cmd
                        </p>
                      </div>
                      <div className="flex items-center gap-4 tabular-nums">
                        <div className="text-right">
                          <p className="font-bold text-[var(--rm-ink)]">
                            {formatFcfa(z.totalSalesXof)}
                          </p>
                          <p
                            className={`text-[11px] font-semibold ${
                              z.varianceXof === 0
                                ? 'text-[#14B8A6]'
                                : 'text-[#E05252]'
                            }`}
                          >
                            Écart :{' '}
                            {z.varianceXof > 0
                              ? `+${formatFcfa(z.varianceXof)}`
                              : formatFcfa(z.varianceXof)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedZ(z)}
                          className="px-2.5 py-1 rounded-lg border border-[var(--rm-border)] hover:border-[#FF8738] text-[11px] font-semibold cursor-pointer"
                        >
                          Détail Z
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
