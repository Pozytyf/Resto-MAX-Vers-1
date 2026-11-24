import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { SuperAdminLayout } from '../SuperAdminLayout';
import { apiFetch } from '../../services/api';
import { downloadCsv } from '../csvExport';
import { formatDateTimeFr } from '../../utils/format';
import type { AuditLog } from '../../types';

const PAGE_SIZE = 50;

export function AuditLogPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    if (q.trim()) params.set('q', q.trim());
    if (targetType) params.set('targetType', targetType);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    apiFetch<{ logs: AuditLog[]; total?: number }>(
      `/api/superadmin/audit?${params.toString()}`,
    )
      .then((res) => {
        setLogs(res.logs);
        setTotal(Number(res.total ?? res.logs.length));
      })
      .catch(() => {});
  }, [offset, q, targetType, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExportCsv = () => {
    downloadCsv(
      `restomax-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Acteur', 'Rôle', 'Action', 'Cible', 'Restaurant', 'Détails'],
      logs.map((l) => [
        l.createdAt,
        l.actorEmail,
        l.actorRole,
        l.action,
        `${l.targetType}:${l.targetId}`,
        l.restaurantId || '',
        l.details || '',
      ]),
    );
  };

  return (
    <SuperAdminLayout
      title={t('superadmin.auditTitle')}
      onRealtimeEvent={load}
      actions={
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] hover:bg-[var(--rm-surface-muted)] cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      }
    >
      <div className="space-y-4">
        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end text-xs">
          <div className="lg:col-span-2">
            <label className="block font-semibold text-[var(--rm-ink)] mb-1">
              Recherche (acteur, action, cible, détails)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--rm-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
                placeholder="Ex. LOGIN, INVOICE, email..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[var(--rm-ink)] mb-1">
              Type de cible
            </label>
            <select
              value={targetType}
              onChange={(e) => {
                setOffset(0);
                setTargetType(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
            >
              <option value="">Tous</option>
              <option value="RESTAURANT">RESTAURANT</option>
              <option value="USER">USER</option>
              <option value="SESSION">SESSION</option>
              <option value="INVOICE">INVOICE</option>
              <option value="SUBSCRIPTION">SUBSCRIPTION</option>
              <option value="PLAN">PLAN</option>
              <option value="LEAD">LEAD</option>
              <option value="SETTINGS">SETTINGS</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[var(--rm-ink)] mb-1">
              Du
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setOffset(0);
                setFrom(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--rm-ink)] mb-1">
              Au
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setOffset(0);
                setTo(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
            />
          </div>
        </div>

        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.audit.colDate')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.audit.colActor')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.audit.colRole')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.audit.colAction')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.audit.colTarget')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.audit.colDetails')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                {logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-[var(--rm-ink-muted)]"
                    >
                      Aucun événement d’audit pour ces critères.
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr
                      key={l.id}
                      className="hover:bg-[var(--rm-surface-hover)] transition-colors"
                    >
                      <td className="px-5 py-3 text-[var(--rm-ink-muted)] tabular-nums whitespace-nowrap">
                        {formatDateTimeFr(l.createdAt)}
                      </td>
                      <td className="px-5 py-3 font-mono text-[var(--rm-ink)]">
                        {l.actorEmail}
                      </td>
                      <td className="px-5 py-3 font-semibold text-[var(--rm-ink)]">
                        {l.actorRole}
                      </td>
                      <td className="px-5 py-3 font-mono font-bold text-[#FF8738]">
                        {l.action}
                      </td>
                      <td className="px-5 py-3 font-mono text-[var(--rm-ink-muted)]">
                        {l.targetType}:{l.targetId}
                      </td>
                      <td className="px-5 py-3 text-[var(--rm-ink)]">
                        {l.details || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-[var(--rm-border)] flex items-center justify-between text-xs text-[var(--rm-ink-muted)] tabular-nums">
            <span>
              Affichage {logs.length === 0 ? 0 : offset + 1}–
              {offset + logs.length} sur {total} événement(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--rm-border)] disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Précédent</span>
              </button>
              <button
                type="button"
                disabled={offset + logs.length >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--rm-border)] disabled:opacity-40 cursor-pointer"
              >
                <span>Suivant</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
