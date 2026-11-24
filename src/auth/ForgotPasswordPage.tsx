import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { apiFetch } from '../services/api';
import { useToast } from '../components/Toast';

export function ForgotPasswordPage() {
  const { notify } = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean>(false);
  const [previewResetUrl, setPreviewResetUrl] = useState<string | null>(null);
  const [previewResetToken, setPreviewResetToken] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  const sendResetRequest = async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        message: string;
        emailStatus?: string;
        smtpConfigured?: boolean;
        previewResetToken?: string;
      }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setSentMessage(res.message);
      setEmailStatus(res.emailStatus || null);
      setSmtpConfigured(Boolean(res.smtpConfigured));
      setCooldownSec(30);
      if (res.previewResetToken) {
        setPreviewResetToken(res.previewResetToken);
        setPreviewResetUrl(
          `/reinitialiser-mot-de-passe?token=${encodeURIComponent(res.previewResetToken)}`,
        );
      } else {
        setPreviewResetToken(null);
        setPreviewResetUrl(null);
      }
      notify('Demande traitée avec succès.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur lors de la demande.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendResetRequest();
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link
            to="/connexion"
            className="inline-flex items-center gap-2 text-xs font-medium text-[#64748B] hover:text-[#182333]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour à la connexion</span>
          </Link>
          <LanguageSwitcher variant="light" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
          <div>
            <BrandLogo theme="light" />
            <h1 className="mt-4 text-2xl font-extrabold text-[#182333]">
              Mot de passe oublié
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">
              Saisissez votre adresse e-mail professionnelle pour recevoir un lien temporaire sécurisé via SMTP.
            </p>
          </div>

          {sentMessage ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-semibold">{sentMessage}</p>
                  <p className="text-emerald-700">
                    {emailStatus === 'SENT' && smtpConfigured
                      ? 'L’e-mail sécurisé vient d’être expédié via notre serveur SMTP. Vérifiez votre boîte de réception et vos courriers indésirables.'
                      : 'Le jeton temporaire a été généré (valable 30 minutes, usage unique).'}
                  </p>
                </div>
              </div>

              {previewResetUrl && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2.5">
                  <p className="font-bold">Mode aperçu développement (SMTP non configuré) :</p>
                  <p>
                    Jeton temporaire généré :{' '}
                    <code className="font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                      {previewResetToken}
                    </code>
                  </p>
                  <Link
                    to={previewResetUrl}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#FF8738] text-white font-semibold hover:bg-[#F07322]"
                  >
                    Ouvrir le formulaire de réinitialisation
                  </Link>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={submitting || cooldownSec > 0}
                  onClick={() => void sendResetRequest()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-[#182333] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    {cooldownSec > 0
                      ? `Renvoyer (${cooldownSec}s)`
                      : 'Renvoyer un nouveau lien'}
                  </span>
                </button>
                <Link
                  to="/reinitialiser-mot-de-passe"
                  className="flex-1 text-center py-2.5 px-3 rounded-lg bg-[#182333] text-xs font-semibold text-white hover:bg-[#223044]"
                >
                  Saisir un code reçu
                </Link>
              </div>

              <Link
                to="/connexion"
                className="block w-full text-center py-2 text-xs font-medium text-[#64748B] hover:text-[#182333]"
              >
                Revenir à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#182333] mb-1">
                  Adresse e-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@restaurant.ci"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8738]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
              </button>

              <div className="pt-2 flex items-center justify-between text-xs text-[#64748B]">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#14B8A6]" />
                  <span>Jeton chiffré SHA-256 · 30 min</span>
                </span>
                <Link
                  to="/reinitialiser-mot-de-passe"
                  className="font-semibold text-[#FF8738] hover:underline"
                >
                  J’ai déjà un code
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
