import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Award,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { RestaurantLayout } from '../RestaurantLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateTimeFr, formatFcfa } from '../../utils/format';
import { ReviewsSection } from './ReviewsSection';
import type {
  CustomerProfile,
  CustomerReview,
  LoyaltyTransaction,
  ReviewSummary,
} from '../../types';

type CustomersTab = 'customers' | 'reviews';

export function CustomersPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<CustomersTab>('customers');
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);

  const [loyaltyCustomer, setLoyaltyCustomer] = useState<CustomerProfile | null>(
    null,
  );
  const [loyaltyHistory, setLoyaltyHistory] = useState<LoyaltyTransaction[]>([]);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyForm, setLoyaltyForm] = useState({
    pointsDelta: 50,
    reason: 'Bonus fidélité caisse',
  });
  const [savingLoyalty, setSavingLoyalty] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    preferences: '',
  });
  const [editingCustomer, setEditingCustomer] = useState<CustomerProfile | null>(
    null,
  );
  const [editForm, setEditForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    preferences: '',
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ customers: CustomerProfile[] }>('/api/restaurant/customers'),
      apiFetch<{ reviews: CustomerReview[]; summary: ReviewSummary }>(
        '/api/restaurant/reviews',
      ).catch(() => null),
    ])
      .then(([custRes, revRes]) => {
        setCustomers(custRes.customers);
        if (revRes) {
          setReviews(revRes.reviews);
          setReviewSummary(revRes.summary);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/restaurant/customers', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      notify(t('customers.createdToast'), 'success');
      setForm({ fullName: '', phone: '', email: '', preferences: '' });
      setShowAdd(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const openEdit = (c: CustomerProfile) => {
    setEditingCustomer(c);
    setEditForm({
      fullName: c.fullName,
      phone: c.phone,
      email: c.email || '',
      preferences: c.preferences || '',
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    try {
      await apiFetch(`/api/restaurant/customers/${editingCustomer.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      notify('Fiche client mise à jour.', 'success');
      setEditingCustomer(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/restaurant/customers/${id}`, { method: 'DELETE' });
      notify('Client supprimé.', 'info');
      setConfirmDeleteId(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const openLoyalty = async (c: CustomerProfile) => {
    setLoyaltyCustomer(c);
    setLoyaltyLoading(true);
    try {
      const res = await apiFetch<{ transactions: LoyaltyTransaction[] }>(
        `/api/restaurant/customers/${c.id}/loyalty`,
      );
      setLoyaltyHistory(res.transactions);
    } catch {
      setLoyaltyHistory([]);
    } finally {
      setLoyaltyLoading(false);
    }
  };

  const handleAdjustLoyalty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loyaltyCustomer) return;
    setSavingLoyalty(true);
    try {
      const res = await apiFetch<{ customerId: string; loyaltyPoints: number }>(
        `/api/restaurant/customers/${loyaltyCustomer.id}/loyalty/adjust`,
        {
          method: 'POST',
          body: JSON.stringify(loyaltyForm),
        },
      );
      notify('Solde de points mis à jour.', 'success');
      setLoyaltyCustomer({ ...loyaltyCustomer, loyaltyPoints: res.loyaltyPoints });
      await openLoyalty({ ...loyaltyCustomer, loyaltyPoints: res.loyaltyPoints });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setSavingLoyalty(false);
    }
  };

  return (
    <RestaurantLayout
      title={t('pages.customersTitle')}
      onRealtimeEvent={(eventType) => {
        if (eventType === 'review:created') {
          load();
        }
      }}
      actions={
        activeTab === 'customers' ? (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('pages.newCustomerBtn')}</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="inline-flex flex-wrap p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('customers')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'customers'
                ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Clients & Fidélité ({customers.length})</span>
          </button>
          <button
            type="button"
            data-testid="customers-tab-reviews"
            onClick={() => setActiveTab('reviews')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'reviews'
                ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Avis Clients ({reviewSummary?.total ?? reviews.length})</span>
          </button>
        </div>

        {activeTab === 'customers' && (
          <>
        {showAdd && (
          <form
            onSubmit={handleCreate}
            className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('customers.nameLabel')}
              </label>
              <input
                required
                type="text"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('customers.phoneLabel')}
              </label>
              <input
                required
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('customers.emailLabel')}
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('customers.preferencesLabel')}
              </label>
              <input
                type="text"
                value={form.preferences}
                onChange={(e) =>
                  setForm({ ...form, preferences: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <button
              type="submit"
              className="py-2.5 px-4 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer"
            >
              {t('common.save')}
            </button>
          </form>
        )}

        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--rm-surface-muted)] text-xs text-[var(--rm-ink-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t('customers.colCustomer')}</th>
                  <th className="px-5 py-3 font-semibold">{t('customers.colPhone')}</th>
                  <th className="px-5 py-3 font-semibold">{t('customers.colPreferences')}</th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('customers.colVisits')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('customers.colLoyaltyPoints')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('customers.colTotalSpent')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-[var(--rm-surface-hover)] transition-colors"
                  >
                    <td className="px-5 py-3 font-semibold text-[var(--rm-ink)]">
                      {c.fullName}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-[var(--rm-ink-muted)]">
                      {c.phone}
                    </td>
                    <td className="px-5 py-3 text-xs text-[var(--rm-ink-muted)]">
                      {c.preferences || '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-[var(--rm-ink)] tabular-nums">
                      {c.visitsCount}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-[#FF8738] tabular-nums">
                      {t('customers.pointsUnit', { count: c.loyaltyPoints })}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-[var(--rm-ink)] tabular-nums">
                      {formatFcfa(c.totalSpentXof)}
                    </td>
                    <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        data-testid={`loyalty-btn-${c.id}`}
                        onClick={() => void openLoyalty(c)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF8738] hover:underline cursor-pointer"
                      >
                        <Award className="w-3 h-3" />
                        <span>Fidélité</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--rm-ink)] hover:text-[#FF8738] cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Modifier</span>
                      </button>
                      {confirmDeleteId === c.id ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDelete(c.id)}
                            className="px-2 py-0.5 rounded bg-[#E05252] text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-0.5 rounded border border-[var(--rm-border)] text-[var(--rm-ink-muted)] text-[11px] cursor-pointer"
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(c.id)}
                          aria-label={`Supprimer ${c.fullName}`}
                          className="inline-flex items-center text-[#E05252] hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}

        {activeTab === 'reviews' && (
          <ReviewsSection
            reviews={reviews}
            summary={reviewSummary}
            onReplySuccess={load}
          />
        )}
      </div>

      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdate}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Modifier le client
              </h3>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('customers.nameLabel')}
              </label>
              <input
                required
                type="text"
                value={editForm.fullName}
                onChange={(e) =>
                  setEditForm({ ...editForm, fullName: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('customers.phoneLabel')}
              </label>
              <input
                required
                type="text"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm({ ...editForm, phone: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('customers.emailLabel')}
              </label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('customers.preferencesLabel')}
              </label>
              <input
                type="text"
                value={editForm.preferences}
                onChange={(e) =>
                  setEditForm({ ...editForm, preferences: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="flex-1 py-2.5 rounded-lg border border-[var(--rm-border-input)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer"
              >
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
      {loyaltyCustomer && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--rm-ink)]">
                  Fidélité — {loyaltyCustomer.fullName}
                </h3>
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  Solde actuel :{' '}
                  <strong className="text-[#FF8738] tabular-nums">
                    {loyaltyCustomer.loyaltyPoints} pts
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoyaltyCustomer(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleAdjustLoyalty}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-xl bg-[var(--rm-surface-muted)] border border-[var(--rm-border)]"
            >
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                  Points (+/-)
                </label>
                <input
                  required
                  type="number"
                  value={loyaltyForm.pointsDelta}
                  onChange={(e) =>
                    setLoyaltyForm({
                      ...loyaltyForm,
                      pointsDelta: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                />
              </div>
              <div className="sm:col-span-6">
                <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                  Motif
                </label>
                <input
                  required
                  type="text"
                  value={loyaltyForm.reason}
                  onChange={(e) =>
                    setLoyaltyForm({ ...loyaltyForm, reason: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={savingLoyalty}
                className="sm:col-span-3 py-2 px-3 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Ajuster
              </button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              <p className="text-xs font-semibold text-[var(--rm-ink-muted)]">
                Historique des mouvements de points
              </p>
              {loyaltyLoading ? (
                <p className="text-xs text-[var(--rm-ink-muted)]">Chargement...</p>
              ) : loyaltyHistory.length === 0 ? (
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  Aucune transaction fidélité enregistrée.
                </p>
              ) : (
                <div className="divide-y divide-[var(--rm-border-subtle)] text-xs">
                  {loyaltyHistory.map((tx) => (
                    <div
                      key={tx.id}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="font-medium text-[var(--rm-ink)]">{tx.reason}</p>
                        <p className="text-[11px] text-[var(--rm-ink-muted)]">
                          {formatDateTimeFr(tx.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`font-bold tabular-nums ${
                          tx.pointsDelta >= 0 ? 'text-[#14B8A6]' : 'text-[#E05252]'
                        }`}
                      >
                        {tx.pointsDelta > 0 ? `+${tx.pointsDelta}` : tx.pointsDelta} pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </RestaurantLayout>
  );
}
