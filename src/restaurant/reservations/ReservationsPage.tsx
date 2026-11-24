import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, MessageCircle, Plus, X } from 'lucide-react';
import { RestaurantLayout } from '../RestaurantLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateTimeFr } from '../../utils/format';
import type { DiningTable, Reservation } from '../../types';

interface WhatsappDispatchResponse {
  dispatched: boolean;
  status: 'SENT' | 'QUEUED_NO_WHATSAPP' | 'FAILED';
  recipientPhone: string;
  waMeLink: string;
  body: string;
  errorMessage?: string;
}

export function ReservationsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    partySize: 4,
    reservedAt: new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 16),
    tableId: '',
    notes: '',
    notifyWhatsapp: true,
  });
  const [whatsappFallback, setWhatsappFallback] =
    useState<WhatsappDispatchResponse | null>(null);
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ reservations: Reservation[] }>('/api/restaurant/reservations'),
      apiFetch<{ tables: DiningTable[] }>('/api/restaurant/tables'),
    ])
      .then(([r, tbls]) => {
        setReservations(r.reservations);
        setTables(tbls.tables);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{
        id: string;
        whatsappResult?: WhatsappDispatchResponse | null;
      }>('/api/restaurant/reservations', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          reservedAt: new Date(form.reservedAt).toISOString(),
        }),
      });
      notify(t('reservations.createdToast'), 'success');
      if (res.whatsappResult) {
        if (res.whatsappResult.dispatched) {
          notify('Confirmation WhatsApp envoyée via API Cloud.', 'success');
        } else {
          setWhatsappFallback(res.whatsappResult);
        }
      }
      setShowAdd(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/restaurant/reservations/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleSendWhatsapp = async (id: string) => {
    setSendingWaId(id);
    try {
      const res = await apiFetch<WhatsappDispatchResponse>(
        `/api/restaurant/reservations/${id}/whatsapp`,
        { method: 'POST' },
      );
      if (res.dispatched) {
        notify(`Message WhatsApp envoyé à ${res.recipientPhone}.`, 'success');
      } else {
        setWhatsappFallback(res);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setSendingWaId(null);
    }
  };

  return (
    <RestaurantLayout
      title={t('pages.reservationsTitle')}
      actions={
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t('pages.newReservationBtn')}</span>
        </button>
      }
    >
      <div className="space-y-6">
        {whatsappFallback && (
          <div className="bg-[var(--rm-surface)] border border-[#25D366]/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-bold text-[var(--rm-ink)] flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                <span>
                  {whatsappFallback.status === 'FAILED'
                    ? `Envoi API WhatsApp échoué (${whatsappFallback.errorMessage || 'erreur'}).`
                    : 'Connecteur WhatsApp Cloud API non configuré — utilisez le lien direct ci-contre.'}
                </span>
              </p>
              <p className="text-[11px] text-[var(--rm-ink-muted)] line-clamp-2 whitespace-pre-line">
                {whatsappFallback.body}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={whatsappFallback.waMeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#25D366] hover:opacity-90 text-white text-xs font-bold"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ouvrir WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => setWhatsappFallback(null)}
                aria-label="Fermer"
                className="p-1.5 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {showAdd && (
          <form
            onSubmit={handleCreate}
            className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('reservations.customerLabel')}
                </label>
                <input
                  required
                  type="text"
                  value={form.customerName}
                  onChange={(e) =>
                    setForm({ ...form, customerName: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('reservations.phoneLabel')}
                </label>
                <input
                  required
                  type="text"
                  value={form.customerPhone}
                  onChange={(e) =>
                    setForm({ ...form, customerPhone: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('reservations.partySizeLabel')}
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  value={form.partySize}
                  onChange={(e) =>
                    setForm({ ...form, partySize: Number(e.target.value) || 2 })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('reservations.dateTimeLabel')}
                </label>
                <input
                  required
                  type="datetime-local"
                  value={form.reservedAt}
                  onChange={(e) =>
                    setForm({ ...form, reservedAt: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('reservations.tableLabel')}
                </label>
                <select
                  value={form.tableId}
                  onChange={(e) => setForm({ ...form, tableId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-sm bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                >
                  <option value="">{t('reservations.toAssign')}</option>
                  {tables.map((tbl) => (
                    <option key={tbl.id} value={tbl.id}>
                      {tbl.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="py-2.5 px-4 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer"
              >
                {t('common.save')}
              </button>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--rm-ink)] cursor-pointer">
              <input
                type="checkbox"
                checked={form.notifyWhatsapp}
                onChange={(e) =>
                  setForm({ ...form, notifyWhatsapp: e.target.checked })
                }
              />
              <span>Envoyer une confirmation WhatsApp automatique au client</span>
            </label>
          </form>
        )}

        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--rm-surface-muted)] text-xs text-[var(--rm-ink-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t('reservations.customerLabel')}</th>
                  <th className="px-5 py-3 font-semibold">{t('reservations.dateTimeLabel')}</th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('reservations.partySizeLabel')}
                  </th>
                  <th className="px-5 py-3 font-semibold">{t('reservations.tableLabel')}</th>
                  <th className="px-5 py-3 font-semibold">{t('reservations.colStatus')}</th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('reservations.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                {reservations.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-[var(--rm-surface-hover)] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="font-semibold text-[var(--rm-ink)]">
                        {r.customerName}
                      </p>
                      <p className="text-xs text-[var(--rm-ink-muted)] font-mono">
                        {r.customerPhone}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-xs text-[var(--rm-ink)] tabular-nums">
                      {formatDateTimeFr(r.reservedAt)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-[var(--rm-ink)] tabular-nums">
                      {r.partySize}
                    </td>
                    <td className="px-5 py-3 text-xs text-[var(--rm-ink)]">
                      {r.tableLabel || t('reservations.unassigned')}
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold">
                      <span
                        className={
                          r.status === 'CONFIRMED'
                            ? 'text-[#14B8A6]'
                            : r.status === 'CANCELLED'
                              ? 'text-[#E05252]'
                              : 'text-[#FF8738]'
                        }
                      >
                        {t(`reservations.statuses.${r.status}`, { defaultValue: r.status })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-2.5 text-xs whitespace-nowrap">
                      <button
                        type="button"
                        disabled={sendingWaId === r.id}
                        onClick={() => void handleSendWhatsapp(r.id)}
                        className="inline-flex items-center gap-1 font-semibold text-[#25D366] hover:underline cursor-pointer disabled:opacity-50"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{sendingWaId === r.id ? 'Envoi...' : 'WhatsApp'}</span>
                      </button>
                      {r.status !== 'SEATED' && r.status !== 'CANCELLED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setStatus(r.id, 'SEATED')}
                            className="font-semibold text-[#14B8A6] hover:underline cursor-pointer"
                          >
                            {t('reservations.seatBtn')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatus(r.id, 'CANCELLED')}
                            className="font-semibold text-[#E05252] hover:underline cursor-pointer"
                          >
                            {t('common.cancel')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </RestaurantLayout>
  );
}
