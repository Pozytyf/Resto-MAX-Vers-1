import { useEffect, useState } from 'react';
import { Delete, KeyRound, UserCheck, X } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../app/providers/AuthProvider';
import { useToast } from './Toast';
import { getRoleLabel } from '../utils/format';
import type { Role } from '../types';

interface PinDirectoryEntry {
  userId: string;
  fullName: string;
  role: Role;
  hasPin: boolean;
}

export function PinSwitchModal({
  open,
  onClose,
  onSwitched,
}: {
  open: boolean;
  onClose: () => void;
  onSwitched?: () => void;
}) {
  const { user, pinLogin } = useAuth();
  const { notify } = useToast();
  const [directory, setDirectory] = useState<PinDirectoryEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [loadingDir, setLoadingDir] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user?.restaurantId) return;
    setLoadingDir(true);
    setPin('');
    apiFetch<{ directory: PinDirectoryEntry[] }>('/api/restaurant/staff/pin-directory')
      .then((res) => {
        setDirectory(res.directory);
        const firstWithPin = res.directory.find((d) => d.hasPin && d.userId !== user.id)
          || res.directory.find((d) => d.hasPin)
          || res.directory[0];
        if (firstWithPin) setSelectedUserId(firstWithPin.userId);
      })
      .catch(() => setDirectory([]))
      .finally(() => setLoadingDir(false));
  }, [open, user?.restaurantId, user?.id]);

  if (!open || !user?.restaurantId) return null;

  const selectedEntry = directory.find((d) => d.userId === selectedUserId) || null;

  const handleSubmit = async (candidatePin = pin) => {
    if (!selectedUserId || candidatePin.length < 4 || submitting) return;
    setSubmitting(true);
    try {
      const nextUser = await pinLogin(user.restaurantId!, selectedUserId, candidatePin);
      notify(`Session basculée sur ${nextUser.fullName} (${getRoleLabel(nextUser.role)})`, 'success');
      setPin('');
      onSwitched?.();
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Code PIN incorrect.', 'error');
      setPin('');
    } finally {
      setSubmitting(false);
    }
  };

  const appendDigit = (digit: string) => {
    if (pin.length >= 6 || submitting) return;
    const next = `${pin}${digit}`;
    setPin(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B1220]/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--rm-surface)] border border-[var(--rm-border)] rounded-2xl max-w-md w-full p-6 space-y-5 text-[var(--rm-ink)]"
        onClick={(e) => e.stopPropagation()}
        data-testid="pin-switch-modal"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#14B8A6]/15 text-[#14B8A6] flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold">Bascule rapide par code PIN</h2>
              <p className="text-xs text-[var(--rm-ink-muted)]">
                Terminal partagé POS · Sélectionnez un équipier
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

        {/* Staff Directory Picker */}
        <div className="space-y-2 max-h-44 overflow-y-auto">
          {loadingDir ? (
            <p className="text-xs text-[var(--rm-ink-muted)] py-3 text-center">
              Chargement de l’équipe...
            </p>
          ) : (
            directory.map((member) => {
              const active = member.userId === selectedUserId;
              return (
                <button
                  key={member.userId}
                  type="button"
                  disabled={!member.hasPin}
                  onClick={() => {
                    setSelectedUserId(member.userId);
                    setPin('');
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                    active
                      ? 'border-[#FF8738] bg-[#FF8738]/10'
                      : 'border-[var(--rm-border)] bg-[var(--rm-surface-muted)] hover:border-[#FF8738]/50'
                  } ${!member.hasPin ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserCheck className="w-4 h-4 text-[#FF8738] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{member.fullName}</p>
                      <p className="text-[11px] text-[var(--rm-ink-muted)]">
                        {getRoleLabel(member.role)}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-[var(--rm-ink-muted)]">
                    {member.hasPin ? 'PIN actif' : 'Sans PIN'}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {selectedEntry && (
          <div className="space-y-3 pt-2 border-t border-[var(--rm-border)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--rm-ink-muted)]">
                Code PIN pour <strong className="text-[var(--rm-ink)]">{selectedEntry.fullName}</strong>
              </span>
              <span className="font-mono font-bold tracking-[0.35em] text-base text-[#FF8738]">
                {pin ? '•'.repeat(pin.length) : '----'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => appendDigit(digit)}
                  className="h-11 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] hover:bg-[var(--rm-surface-hover)] text-sm font-bold cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin('')}
                className="h-11 rounded-xl border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink-muted)] cursor-pointer"
              >
                Effacer
              </button>
              <button
                type="button"
                onClick={() => appendDigit('0')}
                className="h-11 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] hover:bg-[var(--rm-surface-hover)] text-sm font-bold cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPin((p) => p.slice(0, -1))}
                aria-label="Corriger"
                className="h-11 rounded-xl border border-[var(--rm-border)] flex items-center justify-center text-[var(--rm-ink-muted)] cursor-pointer"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={pin.length < 4 || submitting}
              onClick={() => handleSubmit(pin)}
              className="w-full h-11 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Connexion...' : 'Valider le code PIN'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
