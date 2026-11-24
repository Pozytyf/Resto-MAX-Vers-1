import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Delete,
  KeyRound,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../components/Toast';
import { getRoleLabel } from '../../utils/format';
import type { AuthUser, Role } from '../../types';

export interface PosPinOperator {
  userId: string;
  fullName: string;
  role: Role;
  hasPin: boolean;
}

type RoleFilter = 'SERVICE' | 'CASHIER' | 'WAITER' | 'ALL';

export function PosPinEntryModal({
  open,
  onClose,
  onSwitched,
}: {
  open: boolean;
  onClose: () => void;
  onSwitched?: (nextUser: AuthUser) => void;
}) {
  const { user, posPinSwitch } = useAuth();
  const { notify } = useToast();

  const [operators, setOperators] = useState<PosPinOperator[]>([]);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('SERVICE');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [loadingOps, setLoadingOps] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user?.restaurantId) return;
    setLoadingOps(true);
    setPin('');
    setInlineError(null);

    apiFetch<{ operators: PosPinOperator[] }>('/api/restaurant/pos/operators')
      .then((res) => {
        const list = res.operators || [];
        setOperators(list);

        const serviceWithPin = list.filter(
          (o) => (o.role === 'CASHIER' || o.role === 'WAITER') && o.hasPin,
        );
        const initialFilter: RoleFilter =
          serviceWithPin.length > 0 ? 'SERVICE' : 'ALL';
        setRoleFilter(initialFilter);

        const pool =
          initialFilter === 'SERVICE'
            ? list.filter((o) => o.role === 'CASHIER' || o.role === 'WAITER')
            : list;
        const preferred =
          pool.find((o) => o.hasPin && o.userId !== user.id) ||
          pool.find((o) => o.hasPin) ||
          list.find((o) => o.hasPin && o.userId !== user.id) ||
          list[0];
        setSelectedUserId(preferred?.userId || '');
      })
      .catch(() => {
        setOperators([]);
      })
      .finally(() => setLoadingOps(false));
  }, [open, user?.restaurantId, user?.id]);

  const filteredOperators = useMemo(() => {
    if (roleFilter === 'CASHIER') {
      return operators.filter((o) => o.role === 'CASHIER');
    }
    if (roleFilter === 'WAITER') {
      return operators.filter((o) => o.role === 'WAITER');
    }
    if (roleFilter === 'SERVICE') {
      return operators.filter(
        (o) => o.role === 'CASHIER' || o.role === 'WAITER',
      );
    }
    return operators;
  }, [operators, roleFilter]);

  useEffect(() => {
    if (!open) return;
    if (
      filteredOperators.length > 0 &&
      !filteredOperators.some((o) => o.userId === selectedUserId)
    ) {
      const next =
        filteredOperators.find((o) => o.hasPin && o.userId !== user?.id) ||
        filteredOperators.find((o) => o.hasPin) ||
        filteredOperators[0];
      setSelectedUserId(next?.userId || '');
      setPin('');
      setInlineError(null);
    }
  }, [open, filteredOperators, selectedUserId, user?.id]);

  const selectedOperator =
    operators.find((o) => o.userId === selectedUserId) || null;

  const handleSubmit = useCallback(
    async (candidatePin = pin) => {
      if (!selectedUserId || candidatePin.length < 4 || submitting) return;
      setSubmitting(true);
      setInlineError(null);
      try {
        const nextUser = await posPinSwitch(selectedUserId, candidatePin);
        notify(
          `Opérateur POS actif : ${nextUser.fullName} (${getRoleLabel(nextUser.role)})`,
          'success',
        );
        setPin('');
        onSwitched?.(nextUser);
        onClose();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Code PIN incorrect.';
        setInlineError(msg);
        notify(msg, 'error');
        setPin('');
      } finally {
        setSubmitting(false);
      }
    },
    [pin, selectedUserId, submitting, posPinSwitch, notify, onSwitched, onClose],
  );

  const appendDigit = useCallback(
    (digit: string) => {
      if (pin.length >= 6 || submitting || !selectedOperator?.hasPin) return;
      setInlineError(null);
      setPin((prev) => (prev.length < 6 ? `${prev}${digit}` : prev));
    },
    [pin.length, submitting, selectedOperator?.hasPin],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        appendDigit(e.key);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setInlineError(null);
        setPin((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key === 'Enter' && pin.length >= 4) {
        e.preventDefault();
        void handleSubmit(pin);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, pin, appendDigit, handleSubmit, onClose]);

  if (!open || !user?.restaurantId) return null;

  const filterTabs: Array<{ id: RoleFilter; label: string }> = [
    { id: 'SERVICE', label: 'Serveurs & Caissiers' },
    { id: 'CASHIER', label: 'Caissiers' },
    { id: 'WAITER', label: 'Serveurs' },
    { id: 'ALL', label: 'Tous POS' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B1220]/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--rm-surface)] border border-[var(--rm-border)] rounded-2xl max-w-lg w-full p-6 space-y-4 text-[var(--rm-ink)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="pos-pin-entry-modal"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#14B8A6]/15 text-[#14B8A6] flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold">
                Bascule opérateur POS par PIN
              </h2>
              <p className="text-xs text-[var(--rm-ink-muted)]">
                Session actuelle :{' '}
                <strong className="text-[var(--rm-ink)]">{user.fullName}</strong>{' '}
                ({getRoleLabel(user.role)})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-lg text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role Filter Tabs */}
        <div className="flex flex-wrap gap-1.5" data-testid="pos-pin-role-filters">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                roleFilter === tab.id
                  ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                  : 'bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Operators List */}
        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {loadingOps ? (
            <p className="text-xs text-[var(--rm-ink-muted)] py-4 text-center">
              Chargement des profils POS…
            </p>
          ) : filteredOperators.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-[var(--rm-border)] text-center space-y-1">
              <Users className="w-5 h-5 text-[var(--rm-ink-muted)] mx-auto" />
              <p className="text-xs text-[var(--rm-ink-muted)]">
                Aucun opérateur dans cette catégorie.
              </p>
            </div>
          ) : (
            filteredOperators.map((op) => {
              const isSelected = op.userId === selectedUserId;
              const isCurrent = op.userId === user.id;
              return (
                <button
                  key={op.userId}
                  type="button"
                  disabled={!op.hasPin}
                  data-testid={`pos-pin-operator-${op.userId}`}
                  onClick={() => {
                    setSelectedUserId(op.userId);
                    setPin('');
                    setInlineError(null);
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'border-[#FF8738] bg-[#FF8738]/10'
                      : 'border-[var(--rm-border)] bg-[var(--rm-surface-muted)] hover:border-[#FF8738]/50'
                  } ${!op.hasPin ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#182333] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      {op.fullName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold truncate">{op.fullName}</p>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#14B8A6]">
                            <CheckCircle2 className="w-3 h-3" />
                            Actif
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--rm-ink-muted)]">
                        {getRoleLabel(op.role)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${
                      op.hasPin
                        ? 'bg-[#14B8A6]/15 text-[#14B8A6]'
                        : 'bg-[var(--rm-surface)] text-[var(--rm-ink-muted)]'
                    }`}
                  >
                    {op.hasPin ? 'PIN prêt' : 'Sans PIN'}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Numeric Keypad */}
        {selectedOperator && (
          <div className="space-y-3 pt-3 border-t border-[var(--rm-border)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-[var(--rm-ink-muted)] min-w-0">
                <UserCheck className="w-3.5 h-3.5 text-[#FF8738] shrink-0" />
                <span className="truncate">
                  PIN pour{' '}
                  <strong className="text-[var(--rm-ink)]">
                    {selectedOperator.fullName}
                  </strong>
                </span>
              </div>

              {/* 6-slot Masked PIN Dots */}
              <div
                className="flex items-center gap-1.5"
                data-testid="pos-pin-dots"
                aria-label={`${pin.length} chiffre(s) saisi(s)`}
              >
                {[0, 1, 2, 3, 4, 5].map((slot) => {
                  const filled = slot < pin.length;
                  return (
                    <span
                      key={slot}
                      className={`w-3 h-3 rounded-full border transition-all ${
                        filled
                          ? 'bg-[#FF8738] border-[#FF8738] scale-110'
                          : slot < 4
                            ? 'border-[var(--rm-border-input)] bg-transparent'
                            : 'border-[var(--rm-border)]/60 bg-transparent'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {inlineError && (
              <div
                data-testid="pos-pin-error"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#E05252]/10 border border-[#E05252]/30 text-xs text-[#E05252] font-medium"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{inlineError}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={!selectedOperator.hasPin || submitting}
                  data-testid={`pos-pin-digit-${digit}`}
                  onClick={() => appendDigit(digit)}
                  className="h-12 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] hover:bg-[var(--rm-surface-hover)] active:scale-[0.98] text-base font-bold cursor-pointer transition-all disabled:opacity-40"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                disabled={submitting || pin.length === 0}
                onClick={() => {
                  setPin('');
                  setInlineError(null);
                }}
                className="h-12 rounded-xl border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer disabled:opacity-40"
              >
                Effacer
              </button>
              <button
                type="button"
                disabled={!selectedOperator.hasPin || submitting}
                data-testid="pos-pin-digit-0"
                onClick={() => appendDigit('0')}
                className="h-12 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] hover:bg-[var(--rm-surface-hover)] active:scale-[0.98] text-base font-bold cursor-pointer transition-all disabled:opacity-40"
              >
                0
              </button>
              <button
                type="button"
                disabled={submitting || pin.length === 0}
                onClick={() => {
                  setInlineError(null);
                  setPin((p) => p.slice(0, -1));
                }}
                aria-label="Corriger"
                className="h-12 rounded-xl border border-[var(--rm-border)] flex items-center justify-center text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer disabled:opacity-40"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={!selectedOperator.hasPin || pin.length < 4 || submitting}
              data-testid="pos-pin-submit"
              onClick={() => void handleSubmit(pin)}
              className="w-full h-11 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-sm font-bold cursor-pointer transition-colors disabled:opacity-50"
            >
              {submitting
                ? 'Changement de session…'
                : `Basculer sur ${selectedOperator.fullName}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
