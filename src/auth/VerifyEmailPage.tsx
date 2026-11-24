import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../app/providers/AuthProvider';
import { useToast } from '../components/Toast';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const urlToken = (params.get('token') || '').trim();
  const {
    user,
    loading: authLoading,
    pendingVerifyToken,
    verifyEmail,
    sendVerificationEmail,
    logout,
  } = useAuth();
  const { notify } = useToast();

  const [status, setStatus] = useState<
    'verifying' | 'pending' | 'success' | 'error'
  >(urlToken ? 'verifying' : 'pending');
  const [message, setMessage] = useState<string>('');
  const [manualCode, setManualCode] = useState<string>(urlToken);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  // Guard against React StrictMode double invocation consuming a single-use token twice
  const attemptedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSec]);

  useEffect(() => {
    if (urlToken) {
      if (attemptedTokenRef.current === urlToken) return;
      attemptedTokenRef.current = urlToken;
      setStatus('verifying');
      setMessage('');
      verifyEmail(urlToken)
        .then((res) => {
          setStatus('success');
          setMessage(
            res.email
              ? `L’adresse ${res.email} a été validée. Votre compte Resto’MAX est désormais actif.`
              : 'Votre adresse e-mail est validée et votre compte est activé.',
          );
        })
        .catch((err) => {
          setStatus('error');
          setMessage(
            err instanceof Error
              ? err.message
              : 'Lien ou code de vérification invalide ou expiré.',
          );
        });
      return;
    }

    if (!authLoading && user?.emailVerified) {
      setStatus('success');
      setMessage(
        `L’adresse ${user.email} est déjà vérifiée. Votre établissement est actif.`,
      );
      return;
    }

    if (!authLoading) {
      setStatus('pending');
    }
  }, [urlToken, authLoading, user?.emailVerified, user?.email, verifyEmail]);

  const handleManualVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) {
      notify('Veuillez saisir le code de vérification reçu par e-mail.', 'error');
      return;
    }
    setSubmittingCode(true);
    try {
      const res = await verifyEmail(code);
      setStatus('success');
      setMessage(
        res.email
          ? `L’adresse ${res.email} a été validée. Votre compte Resto’MAX est activé.`
          : 'Adresse e-mail vérifiée et compte activé.',
      );
      notify('Adresse e-mail vérifiée ! Compte activé.', 'success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Code de vérification invalide ou expiré.';
      setStatus('error');
      setMessage(msg);
      notify(msg, 'error');
    } finally {
      setSubmittingCode(false);
    }
  };

  const handleQuickActivatePreview = async () => {
    if (!pendingVerifyToken) return;
    setManualCode(pendingVerifyToken);
    setSubmittingCode(true);
    try {
      const res = await verifyEmail(pendingVerifyToken);
      setStatus('success');
      setMessage(
        res.email
          ? `L’adresse ${res.email} a été validée. Votre compte Resto’MAX est activé.`
          : 'Adresse e-mail vérifiée et compte activé.',
      );
      notify('Compte activé avec succès.', 'success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Code de vérification invalide ou expiré.';
      setStatus('error');
      setMessage(msg);
      notify(msg, 'error');
    } finally {
      setSubmittingCode(false);
    }
  };

  const handleResend = async () => {
    if (!user || resending || cooldownSec > 0) return;
    setResending(true);
    try {
      const res = await sendVerificationEmail();
      if (res.alreadyVerified) {
        setStatus('success');
        setMessage('Votre adresse e-mail est déjà vérifiée.');
        notify('Votre adresse e-mail est déjà vérifiée.', 'info');
      } else {
        setCooldownSec(30);
        setStatus('pending');
        setMessage('');
        notify('Nouvel e-mail de vérification généré.', 'success');
      }
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : 'Impossible d’envoyer l’e-mail de vérification.',
        'error',
      );
    } finally {
      setResending(false);
    }
  };

  const handleSwitchAccount = async () => {
    await logout();
    navigate('/connexion');
  };

  const targetAfterActivation = user
    ? user.role === 'SUPER_ADMIN'
      ? '/superadmin'
      : '/app'
    : '/connexion';

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div
        className="max-w-md w-full mx-auto bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6"
        data-testid="verify-email-page"
      >
        <div className="flex justify-center">
          <BrandLogo theme="light" />
        </div>

        {status === 'verifying' && (
          <div className="space-y-3 py-6 text-center">
            <Loader2 className="w-9 h-9 text-[#FF8738] animate-spin mx-auto" />
            <h1 className="text-lg font-extrabold text-[#182333]">
              Validation de votre e-mail…
            </h1>
            <p className="text-xs text-[#64748B]">
              Activation sécurisée de votre espace Resto’MAX en cours.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4 py-2 text-center" data-testid="verify-email-success">
            <CheckCircle2 className="w-11 h-11 text-[#14B8A6] mx-auto" />
            <h1 className="text-xl font-extrabold text-[#182333]">
              Compte activé
            </h1>
            <p className="text-xs text-[#64748B] leading-relaxed">{message}</p>
            <Link
              to={targetAfterActivation}
              data-testid="verify-email-continue-btn"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-sm font-semibold transition-colors"
            >
              <span>
                {user ? 'Accéder à mon établissement' : 'Se connecter'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {(status === 'pending' || status === 'error') && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              {status === 'error' ? (
                <XCircle className="w-10 h-10 text-[#E05252] mx-auto" />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-[#FF8738]/12 text-[#FF8738] flex items-center justify-center mx-auto">
                  <MailCheck className="w-6 h-6" />
                </div>
              )}
              <h1 className="text-xl font-extrabold text-[#182333]">
                {status === 'error'
                  ? 'Vérification requise'
                  : 'Vérifiez votre adresse e-mail'}
              </h1>
              {status === 'error' && message ? (
                <p
                  className="text-xs text-[#E05252] bg-[#E05252]/10 border border-[#E05252]/25 rounded-lg px-3 py-2"
                  data-testid="verify-email-error"
                >
                  {message}
                </p>
              ) : (
                <p className="text-xs text-[#64748B] leading-relaxed">
                  {user
                    ? `Un lien et un code de validation ont été envoyés à `
                    : 'Saisissez le code de vérification reçu par e-mail pour activer votre compte.'}
                  {user && (
                    <strong className="text-[#182333]">{user.email}</strong>
                  )}
                  {user ? ' avant l’activation de votre restaurant.' : ''}
                </p>
              )}
            </div>

            {pendingVerifyToken && (
              <div
                className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5 text-xs"
                data-testid="verify-email-preview-box"
              >
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <ShieldCheck className="w-4 h-4 text-[#FF8738] shrink-0" />
                  <span>Aperçu de vérification (SMTP non configuré)</span>
                </div>
                <p className="text-amber-800 font-mono break-all text-[11px] bg-white/80 px-2.5 py-1.5 rounded border border-amber-200">
                  {pendingVerifyToken}
                </p>
                <button
                  type="button"
                  disabled={submittingCode}
                  onClick={handleQuickActivatePreview}
                  data-testid="verify-email-quick-activate-btn"
                  className="w-full py-2 rounded-lg bg-[#14B8A6] hover:bg-[#0D9488] text-white font-semibold cursor-pointer disabled:opacity-60"
                >
                  {submittingCode
                    ? 'Activation…'
                    : 'Valider et activer mon compte'}
                </button>
              </div>
            )}

            <form onSubmit={handleManualVerify} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#182333] mb-1">
                  Code de vérification
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Collez le code reçu par e-mail"
                    data-testid="verify-email-code-input"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-xs font-mono text-[#182333] focus:outline-none focus:ring-2 focus:ring-[#FF8738]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submittingCode || !manualCode.trim()}
                data-testid="verify-email-submit-btn"
                className="w-full py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {submittingCode
                  ? 'Vérification…'
                  : 'Valider mon adresse e-mail'}
              </button>
            </form>

            {user ? (
              <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={resending || cooldownSec > 0}
                  onClick={handleResend}
                  data-testid="verify-email-resend-btn"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-[#182333] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {resending
                      ? 'Envoi…'
                      : cooldownSec > 0
                        ? `Renvoyer (${cooldownSec}s)`
                        : 'Renvoyer l’e-mail'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 text-xs font-medium text-[#64748B] hover:text-[#182333] hover:bg-slate-50 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Changer de compte</span>
                </button>
              </div>
            ) : (
              <div className="pt-3 border-t border-slate-200 text-center">
                <Link
                  to="/connexion"
                  className="text-xs font-semibold text-[#FF8738] hover:underline"
                >
                  Se connecter pour demander un nouveau lien
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
