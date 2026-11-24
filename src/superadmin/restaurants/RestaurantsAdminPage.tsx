import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Check,
  Copy,
  KeyRound,
  Plus,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { SuperAdminLayout } from '../SuperAdminLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateFr, formatFcfa } from '../../utils/format';
import type { Plan, Restaurant } from '../../types';

type StatusFilter = 'ALL' | 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'DELETED';

interface CreatedCreds {
  restaurantName: string;
  ownerEmail: string;
  tempPassword: string;
  emailStatus?: string;
  previewResetToken?: string;
}

export function RestaurantsAdminPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const [showAdd, setShowAdd] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<CreatedCreds | null>(null);
  const [copiedPwd, setCopiedPwd] = useState(false);

  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [modalTab, setModalTab] = useState<'INFO' | 'SUB' | 'STATUS'>('INFO');
  const [editForm, setEditForm] = useState({
    name: '',
    city: '',
    phone: '',
    email: '',
    address: '',
  });
  const [subForm, setSubForm] = useState({
    planId: '',
    billingCycle: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    status: 'ACTIVE',
    extendDays: 0,
  });
  const [statusReason, setStatusReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState({
    name: '',
    city: 'Abidjan',
    ownerName: '',
    ownerEmail: '',
    phone: '',
    planCode: 'PROFESSIONNEL',
  });

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ restaurants: Restaurant[] }>('/api/superadmin/restaurants'),
      apiFetch<{ plans: Plan[] }>('/api/superadmin/plans'),
    ])
      .then(([rRes, pRes]) => {
        setRestaurants(rRes.restaurants);
        setPlans(pRes.plans);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openManageModal = (r: Restaurant) => {
    setSelected(r);
    setModalTab('INFO');
    setEditForm({
      name: r.name || '',
      city: r.city || '',
      phone: r.phone || '',
      email: r.email || '',
      address: r.address || '',
    });
    setSubForm({
      planId: r.planId || plans[0]?.id || '',
      billingCycle: 'MONTHLY',
      status: r.subscriptionStatus || 'ACTIVE',
      extendDays: 0,
    });
    setStatusReason('');
    setConfirmDelete(false);
  };

  const filteredRestaurants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return restaurants.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        (r.ownerName || '').toLowerCase().includes(q) ||
        (r.ownerEmail || r.email || '').toLowerCase().includes(q)
      );
    });
  }, [restaurants, search, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{
        id: string;
        tempPassword?: string;
        emailStatus?: string;
        previewResetToken?: string;
      }>('/api/superadmin/restaurants', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      notify(t('superadminPages.restaurants.createdToast'), 'success');
      if (res.tempPassword) {
        setCreatedCreds({
          restaurantName: form.name,
          ownerEmail: form.ownerEmail,
          tempPassword: res.tempPassword,
          emailStatus: res.emailStatus,
          previewResetToken: res.previewResetToken,
        });
        setCopiedPwd(false);
      }
      setShowAdd(false);
      setForm({
        name: '',
        city: 'Abidjan',
        ownerName: '',
        ownerEmail: '',
        phone: '',
        planCode: 'PROFESSIONNEL',
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await apiFetch(`/api/superadmin/restaurants/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      notify('Informations de l’établissement mises à jour.', 'success');
      setSelected(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected?.subscriptionId) return;
    try {
      await apiFetch(`/api/superadmin/subscriptions/${selected.subscriptionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          planId: subForm.planId,
          billingCycle: subForm.billingCycle,
          status: subForm.status,
          ...(subForm.extendDays > 0 ? { extendDays: subForm.extendDays } : {}),
        }),
      });
      notify('Abonnement du restaurant mis à jour.', 'success');
      setSelected(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const changeStatus = async (id: string, status: string) => {
    if (status === 'DELETED' && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await apiFetch(`/api/superadmin/restaurants/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          reason:
            statusReason.trim() || `Action Super-admin -> ${status}`,
        }),
      });
      notify(
        t('superadminPages.restaurants.statusUpdatedToast', { status }),
        'info',
      );
      setSelected(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  return (
    <SuperAdminLayout
      title={t('superadmin.restaurantsTitle')}
      onRealtimeEvent={load}
      actions={
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('superadmin.createRestaurantBtn')}</span>
        </button>
      }
    >
      <div className="space-y-5">
        {showAdd && (
          <form
            onSubmit={handleCreate}
            className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end"
          >
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('superadminPages.restaurants.nameLabel')}
              </label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('superadminPages.restaurants.cityLabel')}
              </label>
              <input
                required
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('superadminPages.restaurants.ownerLabel')}
              </label>
              <input
                required
                type="text"
                value={form.ownerName}
                onChange={(e) =>
                  setForm({ ...form, ownerName: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('superadminPages.restaurants.ownerEmailLabel')}
              </label>
              <input
                required
                type="email"
                value={form.ownerEmail}
                onChange={(e) =>
                  setForm({ ...form, ownerEmail: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                Téléphone
              </label>
              <input
                type="text"
                placeholder="+225 07..."
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('superadminPages.restaurants.planLabel')}
              </label>
              <select
                value={form.planCode}
                onChange={(e) => setForm({ ...form, planCode: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-sm bg-[var(--rm-surface)] text-[var(--rm-ink)]"
              >
                <option value="ESSENTIEL">{t('auth.plans.ESSENTIEL')}</option>
                <option value="PROFESSIONNEL">{t('auth.plans.PROFESSIONNEL')}</option>
                <option value="PREMIUM">{t('auth.plans.PREMIUM')}</option>
              </select>
            </div>
            <button
              type="submit"
              className="py-2.5 px-4 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {t('superadminPages.restaurants.createBtn')}
            </button>
          </form>
        )}

        {/* Filter & Search Bar */}
        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-[var(--rm-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, ville, propriétaire ou e-mail..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--rm-surface-muted)] rounded-lg">
            {(['ALL', 'ACTIVE', 'TRIAL', 'SUSPENDED', 'DELETED'] as StatusFilter[]).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-[var(--rm-surface)] text-[var(--rm-ink)] shadow-sm'
                      : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                  }`}
                >
                  {st === 'ALL' ? `Tous (${restaurants.length})` : st}
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
                    {t('superadminPages.restaurants.colVenue')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.restaurants.colOwner')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.restaurants.colPlan')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.restaurants.colStatus')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    CA 30j / Cmd
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('superadminPages.restaurants.colAction')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-xs text-[var(--rm-ink-muted)]"
                    >
                      Chargement des établissements...
                    </td>
                  </tr>
                ) : filteredRestaurants.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center text-xs text-[var(--rm-ink-muted)]"
                    >
                      Aucun restaurant ne correspond à vos critères de filtrage.
                    </td>
                  </tr>
                ) : (
                  filteredRestaurants.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-[var(--rm-surface-hover)] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <p className="font-semibold text-[var(--rm-ink)]">
                          {r.name}
                        </p>
                        <p className="text-xs text-[var(--rm-ink-muted)]">
                          {r.city} · {r.tablesCount ?? 0} tables ·{' '}
                          {r.staffCount ?? 0} équipe
                        </p>
                      </td>
                      <td className="px-5 py-3 text-xs">
                        <p className="font-medium text-[var(--rm-ink)]">
                          {r.ownerName || '—'}
                        </p>
                        <p className="text-[var(--rm-ink-muted)] font-mono">
                          {r.ownerEmail || r.email}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-xs">
                        <p className="font-semibold text-[var(--rm-ink)]">
                          {r.planName || '—'}
                        </p>
                        {r.currentPeriodEnd && (
                          <p className="text-[11px] text-[var(--rm-ink-muted)] tabular-nums">
                            Fin {formatDateFr(r.currentPeriodEnd)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs font-bold">
                        <span
                          className={
                            r.status === 'ACTIVE'
                              ? 'text-[#14B8A6]'
                              : r.status === 'SUSPENDED' || r.status === 'DELETED'
                                ? 'text-[#E05252]'
                                : 'text-[#FF8738]'
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-xs tabular-nums">
                        <p className="font-bold text-[var(--rm-ink)]">
                          {formatFcfa(r.monthlyVolumeXof ?? 0)}
                        </p>
                        <p className="text-[11px] text-[var(--rm-ink-muted)]">
                          {r.ordersCount ?? 0} cmd
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openManageModal(r)}
                          className="text-xs font-semibold text-[#FF8738] hover:underline cursor-pointer whitespace-nowrap"
                        >
                          {t('common.manage')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Onboarding Credentials Modal */}
      {createdCreds && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#14B8A6]" />
                <h3 className="text-base font-bold text-[var(--rm-ink)]">
                  Accès propriétaire générés
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCreatedCreds(null)}
                className="text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--rm-ink-muted)]">
              L’établissement <strong>{createdCreds.restaurantName}</strong> est créé avec un mot de passe temporaire unique (non stocké en clair). Transmettez-le au gérant ou invitez-le à définir son mot de passe via le lien envoyé.
            </p>
            <div className="bg-[var(--rm-surface-muted)] rounded-xl p-3.5 space-y-2 text-xs">
              <p>
                <span className="text-[var(--rm-ink-muted)]">E-mail :</span>{' '}
                <strong className="font-mono text-[var(--rm-ink)]">
                  {createdCreds.ownerEmail}
                </strong>
              </p>
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="text-[var(--rm-ink-muted)]">
                    Mot de passe temporaire :
                  </span>{' '}
                  <strong className="font-mono text-[var(--rm-ink)]">
                    {createdCreds.tempPassword}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(createdCreds.tempPassword);
                    setCopiedPwd(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--rm-border)] text-[11px] font-semibold cursor-pointer"
                >
                  {copiedPwd ? (
                    <Check className="w-3 h-3 text-[#14B8A6]" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedPwd ? 'Copié' : 'Copier'}</span>
                </button>
              </div>
              {createdCreds.previewResetToken && (
                <p className="text-[11px] text-[var(--rm-ink-muted)] break-all pt-1 border-t border-[var(--rm-border-subtle)]">
                  Jeton réinitialisation (aperçu sans SMTP) :{' '}
                  <span className="font-mono">{createdCreds.previewResetToken}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCreatedCreds(null)}
              className="w-full py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Restaurant Manage Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-[#FF8738]" />
                <div>
                  <h3 className="text-lg font-bold text-[var(--rm-ink)]">
                    {selected.name}
                  </h3>
                  <p className="text-xs text-[var(--rm-ink-muted)]">
                    {t('superadminPages.restaurants.createdAtMeta', {
                      city: selected.city,
                      date: formatDateFr(selected.createdAt),
                    })}{' '}
                    · {selected.ownerName || '—'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>

            <div className="flex gap-1 p-1 rounded-lg bg-[var(--rm-surface-muted)]">
              {(
                [
                  { id: 'INFO', label: 'Établissement' },
                  { id: 'SUB', label: 'Abonnement & Plan' },
                  { id: 'STATUS', label: 'Statut & Accès' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModalTab(tab.id)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    modalTab === tab.id
                      ? 'bg-[var(--rm-surface)] text-[var(--rm-ink)] shadow-sm'
                      : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {modalTab === 'INFO' && (
              <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">Nom</label>
                    <input
                      required
                      type="text"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Ville</label>
                    <input
                      required
                      type="text"
                      value={editForm.city}
                      onChange={(e) =>
                        setEditForm({ ...editForm, city: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Téléphone</label>
                    <input
                      type="text"
                      value={editForm.phone}
                      onChange={(e) =>
                        setEditForm({ ...editForm, phone: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">
                      E-mail établissement
                    </label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) =>
                        setEditForm({ ...editForm, email: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Adresse</label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) =>
                      setEditForm({ ...editForm, address: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white font-semibold cursor-pointer"
                >
                  Enregistrer les modifications
                </button>
              </form>
            )}

            {modalTab === 'SUB' && (
              <form onSubmit={handleSaveSubscription} className="space-y-3 text-xs">
                {!selected.subscriptionId ? (
                  <p className="text-[var(--rm-ink-muted)] py-4 text-center">
                    Aucun abonnement rattaché à cet établissement.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold mb-1">Offre</label>
                        <select
                          value={subForm.planId}
                          onChange={(e) =>
                            setSubForm({ ...subForm, planId: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                        >
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatFcfa(p.priceMonthlyXof)}/mois)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold mb-1">Cycle</label>
                        <select
                          value={subForm.billingCycle}
                          onChange={(e) =>
                            setSubForm({
                              ...subForm,
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
                        <label className="block font-semibold mb-1">
                          Statut abonnement
                        </label>
                        <select
                          value={subForm.status}
                          onChange={(e) =>
                            setSubForm({ ...subForm, status: e.target.value })
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
                          Prolonger (jours ajoutés)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={subForm.extendDays}
                          onChange={(e) =>
                            setSubForm({
                              ...subForm,
                              extendDays: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] tabular-nums"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white font-semibold cursor-pointer"
                    >
                      Mettre à jour l’abonnement
                    </button>
                  </>
                )}
              </form>
            )}

            {modalTab === 'STATUS' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-[var(--rm-ink)] mb-1">
                    Motif de l’action (enregistré au journal d’audit)
                  </label>
                  <input
                    type="text"
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="Ex. Impayé SaaS, demande du gérant, vérification..."
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                  />
                </div>

                {confirmDelete && (
                  <div className="p-3 rounded-lg bg-[#E05252]/10 border border-[#E05252]/30 text-[#E05252] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      Confirmez-vous la suppression logique ? Toutes les sessions du restaurant seront révoquées.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {selected.status !== 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => changeStatus(selected.id, 'ACTIVE')}
                      className="py-2 rounded-lg bg-[#14B8A6] text-white font-semibold cursor-pointer"
                    >
                      {t('superadminPages.restaurants.activateBtn')}
                    </button>
                  )}
                  {selected.status !== 'SUSPENDED' && (
                    <button
                      type="button"
                      onClick={() => changeStatus(selected.id, 'SUSPENDED')}
                      className="py-2 rounded-lg bg-[#E5A32A] text-white font-semibold cursor-pointer"
                    >
                      {t('superadminPages.restaurants.suspendBtn')}
                    </button>
                  )}
                  {selected.status !== 'DELETED' && (
                    <button
                      type="button"
                      onClick={() => changeStatus(selected.id, 'DELETED')}
                      className="col-span-2 py-2 rounded-lg border border-red-200 dark:border-red-900/60 text-[#E05252] font-semibold cursor-pointer"
                    >
                      {confirmDelete
                        ? 'Confirmer la suppression logique'
                        : t('superadminPages.restaurants.softDeleteBtn')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
}
