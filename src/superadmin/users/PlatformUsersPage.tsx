import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  KeyRound,
  LogOut,
  MailCheck,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { SuperAdminLayout } from '../SuperAdminLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateFr, getRoleLabel } from '../../utils/format';

interface PlatformUserRow {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  globalRole: string;
  status: string;
  emailVerified?: boolean;
  activeSessionsCount?: number;
  lastLoginAt?: string | null;
  restaurantName: string | null;
  restaurantRole: string | null;
}

type RoleFilter = 'ALL' | 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'STAFF';

export function PlatformUsersPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [users, setUsers] = useState<PlatformUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [previewReset, setPreviewReset] = useState<{
    email: string;
    token: string;
  } | null>(null);

  const load = useCallback(() => {
    apiFetch<{ users: PlatformUserRow[] }>('/api/superadmin/users')
      .then((res) => setUsers(res.users))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (roleFilter === 'SUPER_ADMIN' && u.globalRole !== 'SUPER_ADMIN') {
        return false;
      }
      if (roleFilter === 'OWNER' && u.restaurantRole !== 'OWNER') return false;
      if (roleFilter === 'MANAGER' && u.restaurantRole !== 'MANAGER') {
        return false;
      }
      if (
        roleFilter === 'STAFF' &&
        (u.globalRole === 'SUPER_ADMIN' ||
          u.restaurantRole === 'OWNER' ||
          u.restaurantRole === 'MANAGER')
      ) {
        return false;
      }
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.restaurantName || '').toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  const toggleUser = async (id: string, currentStatus: string) => {
    const next = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await apiFetch(`/api/superadmin/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      notify(
        next === 'SUSPENDED'
          ? t('superadminPages.users.suspendedToast')
          : t('superadminPages.users.reactivatedToast'),
        'info',
      );
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const revokeSessions = async (id: string) => {
    try {
      await apiFetch(`/api/superadmin/users/${id}/revoke-sessions`, {
        method: 'POST',
      });
      notify('Toutes les sessions actives de ce compte ont été révoquées.', 'info');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const verifyEmail = async (id: string) => {
    try {
      await apiFetch(`/api/superadmin/users/${id}/verify-email`, {
        method: 'POST',
      });
      notify('Adresse e-mail marquée vérifiée.', 'success');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const sendReset = async (u: PlatformUserRow) => {
    try {
      const res = await apiFetch<{ previewResetToken?: string }>(
        `/api/superadmin/users/${u.id}/reset-password`,
        { method: 'POST' },
      );
      notify(`Lien de réinitialisation généré pour ${u.email}.`, 'success');
      if (res.previewResetToken) {
        setPreviewReset({ email: u.email, token: res.previewResetToken });
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/superadmin/users/superadmin', {
        method: 'POST',
        body: JSON.stringify(adminForm),
      });
      notify('Compte Super-Admin créé avec succès.', 'success');
      setShowCreateAdmin(false);
      setAdminForm({ fullName: '', email: '', phone: '', password: '' });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  return (
    <SuperAdminLayout
      title={t('superadmin.usersTitle')}
      onRealtimeEvent={load}
      actions={
        <button
          type="button"
          onClick={() => setShowCreateAdmin(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Nouvel administrateur</span>
        </button>
      }
    >
      <div className="space-y-4">
        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-[var(--rm-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, e-mail ou restaurant..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[var(--rm-surface-muted)] rounded-lg">
              {(['ALL', 'SUPER_ADMIN', 'OWNER', 'MANAGER', 'STAFF'] as RoleFilter[]).map(
                (r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      roleFilter === r
                        ? 'bg-[var(--rm-surface)] text-[var(--rm-ink)] shadow-sm'
                        : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                    }`}
                  >
                    {r === 'ALL'
                      ? `Tous (${users.length})`
                      : r === 'STAFF'
                        ? 'Équipe POS/KDS'
                        : r}
                  </button>
                ),
              )}
            </div>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'SUSPENDED')
              }
              className="px-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs font-semibold text-[var(--rm-ink)]"
            >
              <option value="ALL">Tous statuts</option>
              <option value="ACTIVE">Actifs</option>
              <option value="SUSPENDED">Suspendus</option>
            </select>
          </div>
        </div>

        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--rm-surface-muted)] text-xs text-[var(--rm-ink-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.users.colName')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.users.colEmail')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.users.colVenue')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.users.colRole')}
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    {t('superadminPages.users.colStatus')}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('superadminPages.users.colAction')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-xs text-[var(--rm-ink-muted)]"
                    >
                      Aucun utilisateur ne correspond aux filtres.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-[var(--rm-surface-hover)] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <p className="font-semibold text-[var(--rm-ink)]">
                          {u.fullName}
                        </p>
                        <p className="text-[11px] text-[var(--rm-ink-muted)] tabular-nums">
                          {u.activeSessionsCount ?? 0} session(s) ·{' '}
                          {u.lastLoginAt
                            ? `Dernière co. ${formatDateFr(u.lastLoginAt)}`
                            : 'Jamais connecté'}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-xs">
                        <p className="font-mono text-[var(--rm-ink)]">{u.email}</p>
                        <p
                          className={`text-[11px] font-semibold ${
                            u.emailVerified ? 'text-[#14B8A6]' : 'text-[#E5A32A]'
                          }`}
                        >
                          {u.emailVerified ? 'E-mail vérifié' : 'E-mail non vérifié'}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--rm-ink)]">
                        {u.restaurantName || t('superadminPages.users.adminFallback')}
                      </td>
                      <td className="px-5 py-3 text-xs font-medium text-[var(--rm-ink)]">
                        {u.globalRole === 'SUPER_ADMIN'
                          ? getRoleLabel('SUPER_ADMIN')
                          : getRoleLabel(u.restaurantRole || '')}
                      </td>
                      <td className="px-5 py-3 text-xs font-bold">
                        <span
                          className={
                            u.status === 'ACTIVE'
                              ? 'text-[#14B8A6]'
                              : 'text-[#E05252]'
                          }
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-2.5 text-xs">
                          {!u.emailVerified && (
                            <button
                              type="button"
                              onClick={() => void verifyEmail(u.id)}
                              title="Valider l’e-mail manuellement"
                              className="inline-flex items-center gap-1 font-semibold text-[#14B8A6] hover:underline cursor-pointer whitespace-nowrap"
                            >
                              <MailCheck className="w-3.5 h-3.5" />
                              <span>Vérifier</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void sendReset(u)}
                            title="Envoyer un lien de réinitialisation"
                            className="inline-flex items-center gap-1 font-semibold text-[var(--rm-ink)] hover:text-[#FF8738] cursor-pointer whitespace-nowrap"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Réinit. MDP</span>
                          </button>
                          {u.globalRole !== 'SUPER_ADMIN' && (
                            <>
                              {(u.activeSessionsCount ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => void revokeSessions(u.id)}
                                  title="Révoquer toutes les sessions"
                                  className="inline-flex items-center gap-1 font-semibold text-[#E5A32A] hover:underline cursor-pointer whitespace-nowrap"
                                >
                                  <LogOut className="w-3.5 h-3.5" />
                                  <span>Déconnecter</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void toggleUser(u.id, u.status)}
                                className="font-semibold text-[#E05252] hover:underline cursor-pointer whitespace-nowrap"
                              >
                                {u.status === 'ACTIVE'
                                  ? t('superadminPages.users.suspendBtn')
                                  : t('superadminPages.users.reactivateBtn')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Preview Reset Token Modal */}
      {previewReset && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-3 text-xs">
            <div className="flex items-center gap-2 font-bold text-sm text-[var(--rm-ink)]">
              <CheckCircle2 className="w-4 h-4 text-[#14B8A6]" />
              <span>Jeton de réinitialisation (aperçu sans SMTP)</span>
            </div>
            <p className="text-[var(--rm-ink-muted)]">
              Destinataire : <strong>{previewReset.email}</strong>
            </p>
            <p className="font-mono break-all bg-[var(--rm-surface-muted)] p-3 rounded-lg border border-[var(--rm-border)]">
              {previewReset.token}
            </p>
            <button
              type="button"
              onClick={() => setPreviewReset(null)}
              className="w-full py-2 rounded-lg bg-[#FF8738] text-white font-semibold cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Create Super-Admin Modal */}
      {showCreateAdmin && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateAdmin}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Ajouter un Super-Admin plateforme
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateAdmin(false)}
                className="text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Nom complet</label>
                <input
                  required
                  type="text"
                  value={adminForm.fullName}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, fullName: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">E-mail</label>
                <input
                  required
                  type="email"
                  value={adminForm.email}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, email: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Téléphone</label>
                <input
                  type="text"
                  value={adminForm.phone}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  Mot de passe initial (min. 8 car.)
                </label>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={adminForm.password}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, password: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateAdmin(false)}
                className="flex-1 py-2 rounded-lg border border-[var(--rm-border-input)] font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white font-semibold cursor-pointer"
              >
                Créer le compte
              </button>
            </div>
          </form>
        </div>
      )}
    </SuperAdminLayout>
  );
}
