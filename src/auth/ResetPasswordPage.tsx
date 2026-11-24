import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { apiFetch } from '../services/api';
import { useToast } from '../components/Toast';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const initialToken = params.get('token') || '';

  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [tokenCheck, setTokenCheck] = useState<{
    checking: boolean;
    valid: boolean | null;
    reason?: string;
    expiresAt?: string;
  }>({
    checking: Boolean(initialToken),
    valid: null,
  });

  useEffect(() => {
    if (!initialToken.trim()) {
      setTokenCheck({ checking: false, valid: null });
      return;
    }
    let active = true;
    setTokenCheck({ checking: true, valid: null });
    apiFetch<{ valid: boolean; reason?: string; expiresAt?: string }>(
      `/api/auth/reset-password/validate?token=${encodeURIComponent(initialToken.trim())}`,
    )
      .then((res) => {
        if (!active) return;
        setTokenCheck({
          checking: false,
          valid: res.valid,
          reason: res.reason,
          expiresAt: res.expiresAt,
        });
      })
      .catch(() => {
        if (!active) return;
        setTokenCheck({ checking: false, valid: null });
      });
    return () => {
      active = false;
    };
  }, [initialToken]);

  const hasMinLen = newPassword.length >= 8;
  const hasLetterAndDigit = /[a-zA-Z]/.test(newPassword) && /\d/.test(newPassword);
  const passwordsMatch = Boolean(newPassword && newPassword === confirmPassword);

  const expiresMinutes =
    tokenCheck.valid && tokenCheck.expiresAt
      ? Math.max(
          1,
          Math.ceil(
            (new Date(tokenCheck.expiresAt).getTime() - Date.now()) / 60000,
          ),
        )
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasMinLen) {
      notify('Le mot de passe doit contenir au moins 8 caractères.', 'error');
      return;
    }
    if (!passwordsMatch) {
      notify('Les mots de passe ne correspondent pas.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: token.trim(), newPassword }),
      });
      setDone(true);
      notify('Mot de passe réinitialisé avec succès.', 'success');
      setTimeout(() => navigate('/connexion'), 1800);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Lien invalide ou expiré.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto">
        <div className="mb-6">
          <Link
            to="/connexion"
            className="inline-flex items-center gap-2 text-xs font-medium text-[#64748B] hover:text-[#182333]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour à la connexion</span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
          <div>
            <BrandLogo theme="light" />
            <h1 className="mt-4 text-2xl font-extrabold text-[#182333]">
              Nouveau mot de passe
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">
              Choisissez un nouveau mot de passe d’au moins 8 caractères pour votre compte.
            </p>
          </div>

          {done ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">Mot de passe mis à jour !</p>
                <p>Vos sessions précédentes ont été révoquées par sécurité. Redirection vers la connexion...</p>
              </div>
            </div>
          ) : tokenCheck.checking ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#64748B]">
              Vérification du lien de réinitialisation sécurisé...
            </div>
          ) : tokenCheck.valid === false ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    {tokenCheck.reason === 'EXPIRED'
                      ? 'Ce lien de réinitialisation a expiré.'
                      : tokenCheck.reason === 'USED'
                        ? 'Ce lien de réinitialisation a déjà été utilisé.'
                        : 'Ce lien de réinitialisation est invalide.'}
                  </p>
                  <p className="text-rose-700">
                    Par sécurité, les liens temporaires expirent après 30 minutes et sont à usage unique.
                  </p>
                </div>
              </div>
              <Link
                to="/mot-de-passe-oublie"
                className="block w-full text-center py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-bold"
              >
                Demander un nouveau lien
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {tokenCheck.valid && expiresMinutes && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Jeton temporaire valide · Expire dans environ{' '}
                    <strong>{expiresMinutes} min</strong>
                  </span>
                </div>
              )}

              {!initialToken && (
                <div>
                  <label className="block text-xs font-semibold text-[#182333] mb-1">
                    Jeton de réinitialisation
                  </label>
                  <input
                    required
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Collez le code reçu par e-mail"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF8738]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#182333] mb-1">
                  Nouveau mot de passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    required
                    minLength={8}
                    type={showPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 caractères"
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8738]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label="Afficher le mot de passe"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#182333] cursor-pointer"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182333] mb-1">
                  Confirmer le mot de passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    required
                    minLength={8}
                    type={showConfirmPwd ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8738]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd((v) => !v)}
                    aria-label="Afficher la confirmation"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#182333] cursor-pointer"
                  >
                    {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                <p className={hasMinLen ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                  {hasMinLen ? '✓' : '•'} Au moins 8 caractères
                </p>
                <p className={hasLetterAndDigit ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                  {hasLetterAndDigit ? '✓' : '•'} Contient lettres et chiffres (recommandé)
                </p>
                <p className={passwordsMatch ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                  {passwordsMatch ? '✓' : '•'} Confirmation identique
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Validation...' : 'Enregistrer le mot de passe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
