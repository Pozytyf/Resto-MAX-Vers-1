import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Clock,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { RestaurantLayout } from '../RestaurantLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateFr, formatDateTimeFr, getRoleLabel } from '../../utils/format';
import type {
  Permission,
  Role,
  StaffMember,
  StaffShift,
  StaffTimeClock,
} from '../../types';

type StaffTab = 'team' | 'shifts' | 'clocks';

interface HoursSummaryRow {
  userId: string;
  staffName: string;
  role: string;
  totalMinutes: number;
  sessionsCount: number;
  totalHours: number;
}

export function StaffPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<StaffTab>('team');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [ceilings, setCeilings] = useState<Record<string, Permission[]>>({});
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [clocks, setClocks] = useState<StaffTimeClock[]>([]);
  const [activeClocks, setActiveClocks] = useState<StaffTimeClock[]>([]);
  const [hoursSummary, setHoursSummary] = useState<HoursSummaryRow[]>([]);

  const [shiftForm, setShiftForm] = useState({
    userId: '',
    shiftDate: new Date().toISOString().slice(0, 10),
    startTime: '09:00',
    endTime: '17:00',
    notes: '',
  });
  const [clockForm, setClockForm] = useState({
    userId: '',
    pin: '',
    notes: '',
  });
  const [clockLoading, setClockLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'WAITER' as Role,
    password: '',
    pin: '',
  });
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>([]);

  const [editingProfileMember, setEditingProfileMember] =
    useState<StaffMember | null>(null);
  const [editProfileForm, setEditProfileForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'WAITER' as Role,
    newPassword: '',
    pin: '',
  });
  const [confirmDeleteMemberId, setConfirmDeleteMemberId] = useState<string | null>(
    null,
  );

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{
        staff: StaffMember[];
        roleCeilings: Record<string, Permission[]>;
      }>('/api/restaurant/staff'),
      apiFetch<{
        shifts: StaffShift[];
        clocks: StaffTimeClock[];
        activeClocks: StaffTimeClock[];
        hoursSummary: HoursSummaryRow[];
      }>('/api/restaurant/shifts').catch(() => null),
    ])
      .then(([res, sc]) => {
        setStaff(res.staff);
        setCeilings(res.roleCeilings);
        if (res.staff.length > 0) {
          setShiftForm((prev) =>
            prev.userId ? prev : { ...prev, userId: res.staff[0].userId },
          );
          const withPin = res.staff.find((s) => s.hasPin) || res.staff[0];
          setClockForm((prev) =>
            prev.userId ? prev : { ...prev, userId: withPin.userId },
          );
        }
        if (sc) {
          setShifts(sc.shifts);
          setClocks(sc.clocks);
          setActiveClocks(sc.activeClocks);
          setHoursSummary(sc.hoursSummary);
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
      await apiFetch('/api/restaurant/staff', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      notify(t('staff.createdToast'), 'success');
      setShowAdd(false);
      setForm({
        fullName: '',
        email: '',
        phone: '',
        role: 'WAITER',
        password: '',
        pin: '',
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const openEditProfile = (m: StaffMember) => {
    setEditingProfileMember(m);
    setEditProfileForm({
      fullName: m.fullName,
      email: m.email,
      phone: m.phone || '',
      role: m.role,
      newPassword: '',
      pin: '',
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfileMember) return;
    try {
      const payload: Record<string, unknown> = {
        fullName: editProfileForm.fullName,
        email: editProfileForm.email,
        phone: editProfileForm.phone,
      };
      if (editingProfileMember.role !== 'OWNER') {
        payload.role = editProfileForm.role;
      }
      if (editProfileForm.newPassword.trim()) {
        payload.newPassword = editProfileForm.newPassword;
      }
      if (editProfileForm.pin.trim()) {
        payload.pin = editProfileForm.pin.trim();
      }
      await apiFetch(`/api/restaurant/staff/${editingProfileMember.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      notify('Profil employé mis à jour.', 'success');
      setEditingProfileMember(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    try {
      await apiFetch(`/api/restaurant/staff/${memberId}`, {
        method: 'DELETE',
      });
      notify('Compte employé supprimé.', 'info');
      setConfirmDeleteMemberId(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const toggleStatus = async (m: StaffMember) => {
    const next = m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await apiFetch(`/api/restaurant/staff/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      notify(
        next === 'SUSPENDED'
          ? t('staff.suspendedToast', { name: m.fullName })
          : t('staff.reactivatedToast', { name: m.fullName }),
        'info',
      );
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const savePermissions = async () => {
    if (!editingMember) return;
    try {
      await apiFetch(`/api/restaurant/staff/${editingMember.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ customPermissions: selectedPerms }),
      });
      notify(t('staff.permsUpdatedToast'), 'success');
      setEditingMember(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/restaurant/shifts', {
        method: 'POST',
        body: JSON.stringify(shiftForm),
      });
      notify('Créneau planifié.', 'success');
      setShiftForm((prev) => ({ ...prev, notes: '' }));
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    try {
      await apiFetch(`/api/restaurant/shifts/${shiftId}`, { method: 'DELETE' });
      notify('Créneau supprimé.', 'info');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleClockWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clockForm.userId || !clockForm.pin) return;
    setClockLoading(true);
    try {
      const res = await apiFetch<{
        action: 'CLOCK_IN' | 'CLOCK_OUT';
        staffName: string;
        durationMinutes: number;
      }>('/api/restaurant/shifts/clock', {
        method: 'POST',
        body: JSON.stringify(clockForm),
      });
      notify(
        res.action === 'CLOCK_IN'
          ? `Entrée pointée pour ${res.staffName}.`
          : `Sortie pointée pour ${res.staffName} (${res.durationMinutes} min).`,
        'success',
      );
      setClockForm((prev) => ({ ...prev, pin: '', notes: '' }));
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setClockLoading(false);
    }
  };

  return (
    <RestaurantLayout
      title={t('pages.staffTitle')}
      actions={
        activeTab === 'team' ? (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('pages.addEmployeeBtn')}</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="inline-flex flex-wrap p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'team'
                ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Équipe & Rôles ({staff.length})</span>
          </button>
          <button
            type="button"
            data-testid="staff-tab-shifts"
            onClick={() => setActiveTab('shifts')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'shifts'
                ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Planning des shifts ({shifts.length})</span>
          </button>
          <button
            type="button"
            data-testid="staff-tab-clocks"
            onClick={() => setActiveTab('clocks')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'clocks'
                ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pointage PIN & Heures ({activeClocks.length} en service)</span>
          </button>
        </div>

        {activeTab === 'team' && (
          <>
        {showAdd && (
          <form
            onSubmit={handleCreate}
            className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
          >
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('staff.fullNameLabel')}
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
                {t('staff.emailLabel')}
              </label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('staff.roleLabel')}
              </label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as Role })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-sm bg-[var(--rm-surface)] text-[var(--rm-ink)]"
              >
                <option value="MANAGER">{getRoleLabel('MANAGER')}</option>
                <option value="CASHIER">{getRoleLabel('CASHIER')}</option>
                <option value="WAITER">{getRoleLabel('WAITER')}</option>
                <option value="KITCHEN_BAR">{getRoleLabel('KITCHEN_BAR')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('staff.initialPasswordLabel')}
              </label>
              <input
                type="password"
                minLength={8}
                placeholder="RestoMax2026!"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                Code PIN POS (optionnel)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                placeholder="4 à 6 chiffres"
                value={form.pin}
                onChange={(e) =>
                  setForm({ ...form, pin: e.target.value.replace(/[^\d]/g, '') })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-sm font-mono"
              />
            </div>
            <button
              type="submit"
              className="py-2.5 px-4 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer"
            >
              {t('staff.createAccountBtn')}
            </button>
          </form>
        )}

        <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--rm-surface-muted)] text-xs text-[var(--rm-ink-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t('staff.colEmployee')}</th>
                  <th className="px-5 py-3 font-semibold">{t('staff.colEmail')}</th>
                  <th className="px-5 py-3 font-semibold">{t('staff.colRole')}</th>
                  <th className="px-5 py-3 font-semibold">{t('staff.colStatus')}</th>
                  <th className="px-5 py-3 font-semibold text-right">
                    {t('staff.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                {staff.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-[var(--rm-surface-hover)] transition-colors"
                  >
                    <td className="px-5 py-3 font-semibold text-[var(--rm-ink)]">
                      <div className="flex items-center gap-2">
                        <span>{m.fullName}</span>
                        {m.hasPin && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#14B8A6]/15 text-[#14B8A6]">
                            <KeyRound className="w-2.5 h-2.5" /> PIN
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-[var(--rm-ink-muted)]">
                      {m.email}
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold text-[var(--rm-ink)]">
                      {getRoleLabel(m.role)}
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold">
                      <span
                        className={
                          m.status === 'ACTIVE'
                            ? 'text-[#14B8A6]'
                            : 'text-[#E05252]'
                        }
                      >
                        {m.status === 'ACTIVE'
                          ? t('staff.activeStatus')
                          : t('staff.suspendedStatus')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditProfile(m)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--rm-ink)] hover:text-[#FF8738] cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Modifier</span>
                      </button>
                      {m.role !== 'OWNER' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMember(m);
                              const maxPerms = ceilings[m.role] || [];
                              setSelectedPerms(
                                m.customPermissions.length > 0
                                  ? m.customPermissions
                                  : maxPerms,
                              );
                            }}
                            className="text-xs font-semibold text-[var(--rm-ink)] hover:text-[#FF8738] cursor-pointer"
                          >
                            {t('staff.permissionsBtn')}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(m)}
                            className="text-xs font-semibold text-[#E5A32A] hover:underline cursor-pointer"
                          >
                            {m.status === 'ACTIVE'
                              ? t('staff.suspendBtn')
                              : t('staff.reactivateBtn')}
                          </button>
                          {confirmDeleteMemberId === m.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void handleDeleteMember(m.id)}
                                className="px-2 py-0.5 rounded bg-[#E05252] text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Confirmer
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMemberId(null)}
                                className="px-2 py-0.5 rounded border border-[var(--rm-border)] text-[var(--rm-ink-muted)] text-[11px] cursor-pointer"
                              >
                                Annuler
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMemberId(m.id)}
                              aria-label={`Supprimer ${m.fullName}`}
                              className="inline-flex items-center text-xs font-semibold text-[#E05252] hover:underline cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
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

        {activeTab === 'shifts' && (
          <div className="space-y-5" data-testid="staff-shifts-panel">
            <form
              onSubmit={handleCreateShift}
              className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Employé *
                </label>
                <select
                  required
                  value={shiftForm.userId}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, userId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                >
                  {staff.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName} ({getRoleLabel(m.role)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Date *
                </label>
                <input
                  required
                  type="date"
                  value={shiftForm.shiftDate}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, shiftDate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Début *
                </label>
                <input
                  required
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, startTime: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Fin *
                </label>
                <input
                  required
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, endTime: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Poste / Note
                </label>
                <input
                  type="text"
                  placeholder="Service soir, Terrasse..."
                  value={shiftForm.notes}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
              <button
                type="submit"
                className="py-2.5 px-4 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer"
              >
                Planifier le shift
              </button>
            </form>

            <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
              {shifts.length === 0 ? (
                <p className="p-8 text-center text-xs text-[var(--rm-ink-muted)]">
                  Aucun créneau planifié pour le moment.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)]">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Date</th>
                      <th className="px-5 py-3 font-semibold">Employé</th>
                      <th className="px-5 py-3 font-semibold">Rôle</th>
                      <th className="px-5 py-3 font-semibold">Horaires</th>
                      <th className="px-5 py-3 font-semibold">Notes</th>
                      <th className="px-5 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                    {shifts.map((sh) => (
                      <tr key={sh.id}>
                        <td className="px-5 py-3 font-semibold text-[var(--rm-ink)]">
                          {formatDateFr(sh.shiftDate)}
                        </td>
                        <td className="px-5 py-3 font-semibold text-[var(--rm-ink)]">
                          {sh.staffName}
                        </td>
                        <td className="px-5 py-3 text-[var(--rm-ink-muted)]">
                          {getRoleLabel(sh.role)}
                        </td>
                        <td className="px-5 py-3 font-mono font-bold text-[#FF8738] tabular-nums">
                          {sh.startTime} — {sh.endTime}
                        </td>
                        <td className="px-5 py-3 text-[var(--rm-ink-muted)]">
                          {sh.notes || '—'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void handleDeleteShift(sh.id)}
                            className="inline-flex items-center text-[#E05252] hover:underline cursor-pointer"
                            aria-label="Supprimer créneau"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'clocks' && (
          <div className="space-y-6" data-testid="staff-clocks-panel">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleClockWithPin}
                className="lg:col-span-5 bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#FF8738]" />
                  <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                    Badgeuse PIN Entrée / Sortie
                  </h2>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    Collaborateur
                  </label>
                  <select
                    required
                    value={clockForm.userId}
                    onChange={(e) =>
                      setClockForm({ ...clockForm, userId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                  >
                    {staff.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.fullName} ({getRoleLabel(m.role)})
                        {activeClocks.some((c) => c.userId === m.userId)
                          ? ' · EN SERVICE'
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    Code PIN personnel (4 à 6 chiffres)
                  </label>
                  <input
                    required
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••"
                    value={clockForm.pin}
                    onChange={(e) =>
                      setClockForm({
                        ...clockForm,
                        pin: e.target.value.replace(/[^\d]/g, ''),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm font-mono tracking-widest"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    Note (optionnel)
                  </label>
                  <input
                    type="text"
                    placeholder="Prise de poste matin..."
                    value={clockForm.notes}
                    onChange={(e) =>
                      setClockForm({ ...clockForm, notes: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={clockLoading}
                  data-testid="clock-pin-submit-btn"
                  className="w-full py-2.5 px-4 rounded-lg bg-[#FF8738] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {clockLoading
                    ? 'Vérification PIN...'
                    : activeClocks.some((c) => c.userId === clockForm.userId)
                      ? 'Pointer la sortie'
                      : 'Pointer l’entrée'}
                </button>
              </form>

              <div className="lg:col-span-7 bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-4">
                <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                  Récapitulatif des heures travaillées
                </h2>
                {hoursSummary.length === 0 ? (
                  <p className="text-xs text-[var(--rm-ink-muted)]">
                    Aucun pointage enregistré pour le moment.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)]">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Employé</th>
                          <th className="px-4 py-2 font-semibold">Rôle</th>
                          <th className="px-4 py-2 font-semibold text-right">Pointages</th>
                          <th className="px-4 py-2 font-semibold text-right">Total heures</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                        {hoursSummary.map((h) => (
                          <tr key={h.userId}>
                            <td className="px-4 py-2.5 font-semibold text-[var(--rm-ink)]">
                              {h.staffName}
                            </td>
                            <td className="px-4 py-2.5 text-[var(--rm-ink-muted)]">
                              {getRoleLabel(h.role)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[var(--rm-ink)]">
                              {h.sessionsCount}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#14B8A6]">
                              {h.totalHours} h ({h.totalMinutes} min)
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-3">
              <h3 className="text-sm font-bold text-[var(--rm-ink)]">
                Journal des pointages récents
              </h3>
              {clocks.length === 0 ? (
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  Aucun historique de pointage.
                </p>
              ) : (
                <div className="divide-y divide-[var(--rm-border-subtle)] text-xs">
                  {clocks.map((c) => (
                    <div
                      key={c.id}
                      className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-semibold text-[var(--rm-ink)]">
                          {c.staffName}
                        </span>
                        <span className="text-[var(--rm-ink-muted)] ml-2">
                          Entrée : {formatDateTimeFr(c.clockInAt)}
                          {c.clockOutAt
                            ? ` · Sortie : ${formatDateTimeFr(c.clockOutAt)}`
                            : ' · En cours'}
                        </span>
                      </div>
                      <span
                        className={`font-bold tabular-nums ${
                          c.clockOutAt ? 'text-[#14B8A6]' : 'text-[#FF8738]'
                        }`}
                      >
                        {c.clockOutAt ? `${c.durationMinutes} min` : 'En service'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Staff Profile / Role / Password / PIN Modal */}
      {editingProfileMember && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProfile}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Modifier {editingProfileMember.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProfileMember(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('staff.fullNameLabel')}
              </label>
              <input
                required
                type="text"
                value={editProfileForm.fullName}
                onChange={(e) =>
                  setEditProfileForm({ ...editProfileForm, fullName: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('staff.emailLabel')}
              </label>
              <input
                required
                type="email"
                value={editProfileForm.email}
                onChange={(e) =>
                  setEditProfileForm({ ...editProfileForm, email: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Téléphone
                </label>
                <input
                  type="text"
                  value={editProfileForm.phone}
                  onChange={(e) =>
                    setEditProfileForm({ ...editProfileForm, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
              {editingProfileMember.role !== 'OWNER' && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('staff.roleLabel')}
                  </label>
                  <select
                    value={editProfileForm.role}
                    onChange={(e) =>
                      setEditProfileForm({
                        ...editProfileForm,
                        role: e.target.value as Role,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-sm bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                  >
                    <option value="MANAGER">{getRoleLabel('MANAGER')}</option>
                    <option value="CASHIER">{getRoleLabel('CASHIER')}</option>
                    <option value="WAITER">{getRoleLabel('WAITER')}</option>
                    <option value="KITCHEN_BAR">{getRoleLabel('KITCHEN_BAR')}</option>
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  minLength={8}
                  placeholder="Laisser vide"
                  value={editProfileForm.newPassword}
                  onChange={(e) =>
                    setEditProfileForm({
                      ...editProfileForm,
                      newPassword: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Nouveau PIN POS
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  placeholder="4-6 chiffres"
                  value={editProfileForm.pin}
                  onChange={(e) =>
                    setEditProfileForm({
                      ...editProfileForm,
                      pin: e.target.value.replace(/[^\d]/g, ''),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingProfileMember(null)}
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

      {editingMember && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#FF8738]" />
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                {t('staff.delegatedTitle', { name: editingMember.fullName })}
              </h3>
            </div>
            <p className="text-xs text-[var(--rm-ink-muted)]">
              {t('staff.ceilingDesc', { role: getRoleLabel(editingMember.role) })}
            </p>
            <div className="max-h-64 overflow-y-auto space-y-2 border-t border-b border-[var(--rm-border-subtle)] py-3">
              {(ceilings[editingMember.role] || []).map((perm) => (
                <label
                  key={perm}
                  className="flex items-center gap-2.5 text-xs text-[var(--rm-ink)] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(perm)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPerms((p) => [...p, perm]);
                      } else {
                        setSelectedPerms((p) => p.filter((x) => x !== perm));
                      }
                    }}
                  />
                  <span className="font-mono">{perm}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="flex-1 py-2 rounded-lg border border-[var(--rm-border-input)] text-[var(--rm-ink)] hover:bg-[var(--rm-surface-hover)] text-xs font-semibold cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={savePermissions}
                className="flex-1 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </RestaurantLayout>
  );
}
