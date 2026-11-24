import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Lock, MailCheck, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../services/api';
import { useAuth } from '../app/providers/AuthProvider';
import { useToast } from './Toast';
import { getRoleLabel } from '../utils/format';

export function ProfileSecurityModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, refreshUser, sendVerificationEmail } = useAuth();
  const { notify } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const [pin, setPin] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const [sendingVerify, setSendingVerify] = useState(false);
  const [previewVerifyUrl, setPreviewVerifyUrl] = useState<string | null>(null);

  if (!open || !user) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      notify('Le nouveau mot de passe doit contenir au moins 8 caractères.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify('La confirmation ne correspond pas.', 'error');
      return;
    }
    setSavingPwd(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      notify('Mot de passe modifié avec succès.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur modification mot de passe.', 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin.trim())) {
      notify('Le code PIN doit contenir entre 4 et 6 chiffres.', 'error');
      return;
    }
    setSavingPin(true);
    try {
      await apiFetch('/api/auth/pin', {
        method: 'POST',
        body: JSON.stringify({ pin: pin.trim(), currentPassword: pinPassword }),
      });
      notify('Code PIN caisse enregistré.', 'success');
      setPin('');
      setPinPassword('');
      await refreshUser();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur enregistrement PIN.', 'error');
    } finally {
      setSavingPin(false);
    }
  };

  const handleSendVerification = async () => {
    setSendingVerify(true);
    try {
      const res = await sendVerificationEmail();
      if (res.alreadyVerified) {
        notify('Votre e-mail est déjà vérifié.', 'info');
      } else {
        notify('E-mail de vérification envoyé.', 'success');
        if (res.previewVerifyToken) {
          setPreviewVerifyUrl(
            `/verifier-email?token=${encodeURIComponent(res.previewVerifyToken)}`,
          );
        }
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur envoi vérification.', 'error');
    } finally {
      setSendingVerify(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--rm-surface)] border border-[var(--rm-border)] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 text-[var(--rm-ink)]"
        onClick={(e) => e.stopPropagation()}
        data-testid="profile-security-modal"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FF8738]/15 text-[#FF8738] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold">Mon profil & Sécurité</h2>
              <p className="text-xs text-[var(--rm-ink-muted)]">
                {user.fullName} · {getRoleLabel(user.role)}
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

        {/* Account & Email Verification Status */}
        <div className="p-4 rounded-xl bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[var(--rm-ink)]">{user.email}</span>
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1 text-[#14B8A6] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                E-mail vérifié
              </span>
            ) : (
              <button
                type="button"
                disabled={sendingVerify}
                onClick={handleSendVerification}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF8738] text-white font-semibold hover:bg-[#F07322] cursor-pointer disabled:opacity-60"
              >
                <MailCheck className="w-3.5 h-3.5" />
                <span>{sendingVerify ? 'Envoi...' : 'Vérifier mon e-mail'}</span>
              </button>
            )}
          </div>
          {previewVerifyUrl && (
            <div className="pt-1">
              <Link
                to={previewVerifyUrl}
                onClick={onClose}
                className="text-[#FF8738] font-semibold hover:underline"
              >
                Ouvrir le lien de vérification e-mail généré →
              </Link>
            </div>
          )}
        </div>

        {/* Change Password */}
        <form onSubmit={handleChangePassword} className="space-y-3 border-t border-[var(--rm-border)] pt-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--rm-ink-muted)]">
            <Lock className="w-3.5 h-3.5 text-[#FF8738]" />
            <span>Changer mon mot de passe</span>
          </div>
          <input
            required
            type="password"
            placeholder="Mot de passe actuel"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              required
              minLength={8}
              type="password"
              placeholder="Nouveau (8+ car.)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
            />
            <input
              required
              minLength={8}
              type="password"
              placeholder="Confirmer"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={savingPwd}
            className="px-4 py-2 rounded-lg bg-[#182333] dark:bg-[#FF8738] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
          >
            {savingPwd ? 'Enregistrement...' : 'Mettre à jour le mot de passe'}
          </button>
        </form>

        {/* POS Quick PIN */}
        {user.role !== 'SUPER_ADMIN' && (
          <form onSubmit={handleSavePin} className="space-y-3 border-t border-[var(--rm-border)] pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--rm-ink-muted)]">
                <KeyRound className="w-3.5 h-3.5 text-[#14B8A6]" />
                <span>Code PIN caisse / bascule rapide</span>
              </div>
              <span className="text-[11px] font-semibold text-[#14B8A6]">
                {user.hasPin ? 'PIN configuré' : 'Non défini'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                required
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                placeholder="Code PIN (4 à 6 chiffres)"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs font-mono"
              />
              <input
                required
                type="password"
                placeholder="Mot de passe actuel"
                value={pinPassword}
                onChange={(e) => setPinPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={savingPin}
              className="px-4 py-2 rounded-lg bg-[#14B8A6] hover:bg-[#0D9488] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {savingPin ? 'Validation...' : user.hasPin ? 'Modifier mon PIN' : 'Activer mon PIN'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
