import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Copy,
  CreditCard,
  Mail,
  Megaphone,
  Send,
} from 'lucide-react';
import { SuperAdminLayout } from '../SuperAdminLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';

export function PlatformSettingsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState({
    smtp_pass: '',
    paydunya_master_key: '',
    paydunya_private_key: '',
    paydunya_token: '',
  });
  const [smtpTestRecipient, setSmtpTestRecipient] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const loadSettings = useCallback(() => {
    apiFetch<{ settings: Record<string, string> }>('/api/superadmin/settings')
      .then((res) => {
        setSettings(res.settings);
        setSmtpTestRecipient(
          (prev) => prev || res.settings.contact_email || '',
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/public/webhooks/paydunya`
      : '/api/public/webhooks/paydunya';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, string> = { ...settings };
      if (secrets.smtp_pass.trim()) payload.smtp_pass = secrets.smtp_pass.trim();
      if (secrets.paydunya_master_key.trim()) {
        payload.paydunya_master_key = secrets.paydunya_master_key.trim();
      }
      if (secrets.paydunya_private_key.trim()) {
        payload.paydunya_private_key = secrets.paydunya_private_key.trim();
      }
      if (secrets.paydunya_token.trim()) {
        payload.paydunya_token = secrets.paydunya_token.trim();
      }

      await apiFetch('/api/superadmin/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setSecrets({
        smtp_pass: '',
        paydunya_master_key: '',
        paydunya_private_key: '',
        paydunya_token: '',
      });
      notify(t('superadminPages.settings.savedToast'), 'success');
      loadSettings();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      const res = await apiFetch<{
        status: string;
        dispatched: boolean;
        errorMessage?: string;
      }>('/api/superadmin/settings/test-smtp', {
        method: 'POST',
        body: JSON.stringify({
          recipient: smtpTestRecipient || settings.contact_email || '',
        }),
      });
      if (res.dispatched) {
        notify('E-mail de test SMTP envoyé avec succès.', 'success');
      } else {
        notify(
          res.errorMessage ||
            `Statut SMTP : ${res.status}. Vérifiez l’hôte et les identifiants SMTP.`,
          'info',
        );
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur test SMTP', 'error');
    } finally {
      setTestingSmtp(false);
    }
  };

  return (
    <SuperAdminLayout title={t('superadmin.settingsTitle')}>
      <form
        onSubmit={handleSave}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl"
      >
        <div className="space-y-6">
          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6 space-y-4">
            <h2 className="text-base font-bold text-[var(--rm-ink)]">
              {t('superadminPages.settings.title')}
            </h2>
            <p className="text-xs text-[var(--rm-ink-muted)]">
              {t('superadminPages.settings.subtitle')}
            </p>

            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('superadminPages.settings.contactEmailLabel')}
              </label>
              <input
                type="email"
                value={settings.contact_email || ''}
                onChange={(e) =>
                  setSettings({ ...settings, contact_email: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('superadminPages.settings.contactPhoneLabel')}
              </label>
              <input
                type="text"
                value={settings.contact_phone || ''}
                onChange={(e) =>
                  setSettings({ ...settings, contact_phone: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('superadminPages.settings.regionLabel')}
              </label>
              <input
                type="text"
                value={settings.commercial_region || ''}
                onChange={(e) =>
                  setSettings({ ...settings, commercial_region: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('superadminPages.settings.trialDaysLabel')}
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={settings.default_trial_days || '14'}
                onChange={(e) =>
                  setSettings({ ...settings, default_trial_days: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6 space-y-4">
            <h3 className="text-sm font-bold text-[var(--rm-ink)] flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#FF8738]" />
              <span>Exploitation, Maintenance &amp; Annonce globale</span>
            </h3>
            <label className="flex items-center gap-2.5 text-xs font-semibold text-[var(--rm-ink)] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.maintenance_mode === 'true'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maintenance_mode: e.target.checked ? 'true' : 'false',
                  })
                }
              />
              <span>Activer le bandeau de maintenance plateforme</span>
            </label>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                Message d’annonce globale
              </label>
              <input
                type="text"
                placeholder="Ex. Mise à jour planifiée dimanche de 02h à 03h GMT."
                value={settings.platform_announcement || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    platform_announcement: e.target.value,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6 space-y-4">
            <h3 className="text-sm font-bold text-[var(--rm-ink)] flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#FF8738]" />
              <span>Serveur SMTP Plateforme (Réinitialisation &amp; Vérification)</span>
            </h3>
            <p className="text-xs text-[var(--rm-ink-muted)]">
              Utilisé pour envoyer les liens de réinitialisation et vérifications e-mail (en complément des variables d’environnement).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Hôte SMTP
                </label>
                <input
                  type="text"
                  placeholder="smtp.resend.com / smtp.gmail.com"
                  value={settings.smtp_host || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, smtp_host: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Port
                </label>
                <input
                  type="number"
                  placeholder="587"
                  value={settings.smtp_port || '587'}
                  onChange={(e) =>
                    setSettings({ ...settings, smtp_port: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--rm-ink)] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.smtp_secure === 'true'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    smtp_secure: e.target.checked ? 'true' : 'false',
                  })
                }
              />
              <span>Connexion chiffrée directe TLS/SSL (port 465)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Utilisateur SMTP
                </label>
                <input
                  type="text"
                  value={settings.smtp_user || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, smtp_user: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Mot de passe SMTP{' '}
                  {settings.smtp_pass_configured === 'true' ? '(Configuré)' : ''}
                </label>
                <input
                  type="password"
                  placeholder="Laisser vide pour conserver"
                  value={secrets.smtp_pass}
                  onChange={(e) =>
                    setSecrets({ ...secrets, smtp_pass: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                Expéditeur (From)
              </label>
              <input
                type="text"
                placeholder="Resto'MAX Sécurité <no-reply@restomax.ci>"
                value={settings.smtp_from || ''}
                onChange={(e) =>
                  setSettings({ ...settings, smtp_from: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
              />
            </div>

            <div className="pt-2 border-t border-[var(--rm-border-subtle)] flex flex-wrap gap-2 items-center">
              <input
                type="email"
                value={smtpTestRecipient}
                onChange={(e) => setSmtpTestRecipient(e.target.value)}
                placeholder="Destinataire du test SMTP"
                className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
              />
              <button
                type="button"
                disabled={testingSmtp}
                onClick={() => void handleTestSmtp()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] hover:bg-[var(--rm-surface-muted)] cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{testingSmtp ? 'Envoi...' : 'Tester SMTP'}</span>
              </button>
            </div>
          </div>

          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6 space-y-4">
            <h3 className="text-sm font-bold text-[var(--rm-ink)] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#FF8738]" />
              <span>Passerelle SaaS PayDunya (Abonnements restaurants)</span>
            </h3>
            <div className="p-3 rounded-lg bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] text-xs space-y-1.5">
              <p className="font-semibold text-[var(--rm-ink)]">
                URL de notification IPN (Webhook PayDunya)
              </p>
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-[11px] text-[var(--rm-ink-muted)] truncate">
                  {webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(webhookUrl);
                    setCopiedWebhook(true);
                    window.setTimeout(() => setCopiedWebhook(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--rm-border)] text-[11px] font-semibold cursor-pointer shrink-0"
                >
                  {copiedWebhook ? (
                    <Check className="w-3 h-3 text-[#14B8A6]" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedWebhook ? 'Copié' : 'Copier'}</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Mode PayDunya
                </label>
                <select
                  value={settings.paydunya_mode || 'TEST'}
                  onChange={(e) =>
                    setSettings({ ...settings, paydunya_mode: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                >
                  <option value="TEST">TEST (Sandbox)</option>
                  <option value="LIVE">LIVE (Production)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Master Key{' '}
                  {settings.paydunya_master_key_configured === 'true'
                    ? '(Configurée)'
                    : ''}
                </label>
                <input
                  type="password"
                  placeholder="Laisser vide pour conserver"
                  value={secrets.paydunya_master_key}
                  onChange={(e) =>
                    setSecrets({ ...secrets, paydunya_master_key: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Private Key{' '}
                  {settings.paydunya_private_key_configured === 'true'
                    ? '(Configurée)'
                    : ''}
                </label>
                <input
                  type="password"
                  placeholder="Laisser vide pour conserver"
                  value={secrets.paydunya_private_key}
                  onChange={(e) =>
                    setSecrets({ ...secrets, paydunya_private_key: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Token PayDunya{' '}
                  {settings.paydunya_token_configured === 'true'
                    ? '(Configuré)'
                    : ''}
                </label>
                <input
                  type="password"
                  placeholder="Laisser vide pour conserver"
                  value={secrets.paydunya_token}
                  onChange={(e) =>
                    setSecrets({ ...secrets, paydunya_token: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
            >
              {t('superadminPages.settings.saveBtn')}
            </button>
          </div>
        </div>
      </form>
    </SuperAdminLayout>
  );
}
