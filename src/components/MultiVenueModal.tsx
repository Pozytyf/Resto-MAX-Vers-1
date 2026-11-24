import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, MapPin, Plus, TrendingUp, X } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../app/providers/AuthProvider';
import { useToast } from './Toast';
import { formatFcfa } from '../utils/format';

interface ConsolidatedVenueRow {
  restaurantId: string;
  name: string;
  slug: string;
  city: string;
  status: string;
  role: string;
  totalRevenueXof: number;
  ordersCount: number;
  totalTables: number;
  occupiedTables: number;
  lowStocksCount: number;
}

interface ConsolidatedPayload {
  totals: {
    venuesCount: number;
    totalRevenueXof: number;
    totalOrdersCount: number;
    totalLowStocksCount: number;
  };
  venues: ConsolidatedVenueRow[];
}

export function MultiVenueModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, switchVenue, refreshUser } = useAuth();
  const { notify } = useToast();
  const [data, setData] = useState<ConsolidatedPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    city: 'Abidjan',
    address: '',
    phone: '',
  });

  const loadConsolidated = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<ConsolidatedPayload>(
        '/api/restaurant/venues/consolidated',
      );
      setData(res);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur chargement multi-sites.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadConsolidated();
    }
  }, [open]);

  if (!open) return null;

  const handleSwitch = async (restaurantId: string) => {
    setSwitchingId(restaurantId);
    try {
      await switchVenue(restaurantId);
      notify('Établissement actif changé.', 'success');
      onClose();
      window.location.reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de basculer.', 'error');
    } finally {
      setSwitchingId(null);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch<{
        venue: { restaurantId: string; name: string };
      }>('/api/restaurant/venues', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      notify(`Établissement « ${res.venue.name} » créé.`, 'success');
      setForm({ name: '', city: 'Abidjan', address: '', phone: '' });
      setShowCreate(false);
      await refreshUser();
      await loadConsolidated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur création filiale.', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 no-print">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--rm-surface)] border border-[var(--rm-border)] shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--rm-border-subtle)] pb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--rm-ink)] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#FF8738]" />
              <span>Groupe & Vue consolidée multi-établissements</span>
            </h2>
            <p className="text-xs text-[var(--rm-ink-muted)] mt-1">
              Pilotez l’ensemble de vos points de vente et basculez d’un établissement à l’autre.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--rm-surface-hover)] text-[var(--rm-ink-muted)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && !data ? (
          <div className="py-10 text-center text-sm text-[var(--rm-ink-muted)]">
            Chargement de la vue consolidée…
          </div>
        ) : (
          data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-3.5">
                  <p className="text-[11px] uppercase font-semibold text-[var(--rm-ink-muted)]">
                    Établissements
                  </p>
                  <p className="text-xl font-bold text-[var(--rm-ink)] tabular-nums mt-1">
                    {data.totals.venuesCount}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-3.5">
                  <p className="text-[11px] uppercase font-semibold text-[var(--rm-ink-muted)]">
                    CA Consolidé
                  </p>
                  <p className="text-xl font-bold text-[#14B8A6] tabular-nums mt-1">
                    {formatFcfa(data.totals.totalRevenueXof)}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-3.5">
                  <p className="text-[11px] uppercase font-semibold text-[var(--rm-ink-muted)]">
                    Commandes totales
                  </p>
                  <p className="text-xl font-bold text-[var(--rm-ink)] tabular-nums mt-1">
                    {data.totals.totalOrdersCount}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-3.5">
                  <p className="text-[11px] uppercase font-semibold text-[var(--rm-ink-muted)]">
                    Alertes stocks
                  </p>
                  <p className="text-xl font-bold text-amber-600 tabular-nums mt-1">
                    {data.totals.totalLowStocksCount}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {data.venues.map((v) => {
                  const isCurrent = v.restaurantId === user?.restaurantId;
                  return (
                    <div
                      key={v.restaurantId}
                      data-testid={`venue-row-${v.restaurantId}`}
                      className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isCurrent
                          ? 'border-[#FF8738] bg-[#FF8738]/5'
                          : 'border-[var(--rm-border)] bg-[var(--rm-surface)]'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-sm text-[var(--rm-ink)]">
                            {v.name}
                          </h3>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF8738]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Site actif
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--rm-ink-muted)] flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {v.city}
                          </span>
                          <span>Vitrine : /c/{v.slug}</span>
                          <span>
                            Tables : {v.occupiedTables}/{v.totalTables} occupées
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold text-[var(--rm-ink)] tabular-nums flex items-center justify-end gap-1">
                            <TrendingUp className="w-3.5 h-3.5 text-[#14B8A6]" />
                            {formatFcfa(v.totalRevenueXof)}
                          </p>
                          <p className="text-[11px] text-[var(--rm-ink-muted)] tabular-nums">
                            {v.ordersCount} cmd · {v.lowStocksCount} alerte(s)
                          </p>
                        </div>
                        {!isCurrent && (
                          <button
                            type="button"
                            disabled={switchingId === v.restaurantId}
                            onClick={() => handleSwitch(v.restaurantId)}
                            className="px-3 py-1.5 rounded-lg bg-[#182333] text-white text-xs font-semibold hover:bg-[#223044] cursor-pointer disabled:opacity-50"
                          >
                            {switchingId === v.restaurantId ? 'Bascule…' : 'Basculer'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}

        {user?.role === 'OWNER' && (
          <div className="border-t border-[var(--rm-border-subtle)] pt-4">
            {!showCreate ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                data-testid="open-create-branch-btn"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8738] text-white text-xs font-semibold hover:bg-[#e57328] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Ouvrir un nouvel établissement / filiale</span>
              </button>
            ) : (
              <form
                onSubmit={handleCreateBranch}
                className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[var(--rm-ink)]">
                    Nouveau point de vente rattaché au groupe
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="text-xs text-[var(--rm-ink-muted)] hover:underline cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Nom de l'établissement (ex: Maquis Zone 4)"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface)] text-sm text-[var(--rm-ink)]"
                  />
                  <input
                    type="text"
                    placeholder="Ville"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface)] text-sm text-[var(--rm-ink)]"
                  />
                  <input
                    type="text"
                    placeholder="Adresse / Quartier"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface)] text-sm text-[var(--rm-ink)]"
                  />
                  <input
                    type="text"
                    placeholder="Téléphone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface)] text-sm text-[var(--rm-ink)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-[#14B8A6] text-white text-xs font-semibold hover:bg-[#0D9488] cursor-pointer disabled:opacity-50"
                >
                  {creating ? 'Création en cours…' : 'Créer l’établissement'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
