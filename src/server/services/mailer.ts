import nodemailer from 'nodemailer';

export interface SmtpRuntimeConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
}

export interface CriticalStockEmailPayload {
  restaurantName: string;
  stockName: string;
  quantity: number;
  minThreshold: number;
  unit: string;
  supplierName: string;
  recipients: string[];
  smtpConfig?: SmtpRuntimeConfig;
}

export interface EmailDispatchResult {
  dispatched: boolean;
  status: 'SENT' | 'QUEUED_NO_SMTP' | 'SKIPPED' | 'FAILED';
  recipients: string[];
  errorMessage?: string;
}

function resolveSmtpTransport(override?: SmtpRuntimeConfig) {
  const host = (override?.host || process.env.SMTP_HOST || '').trim();
  if (!host) return null;

  const port = Number(override?.port || process.env.SMTP_PORT || 587);
  const secure =
    typeof override?.secure === 'boolean'
      ? override.secure
      : process.env.SMTP_SECURE === 'true' || port === 465;
  const user = (override?.user || process.env.SMTP_USER || '').trim();
  const pass = override?.pass || process.env.SMTP_PASS || '';
  const from =
    (override?.from || process.env.SMTP_FROM || '').trim() ||
    'Resto’MAX Alertes <alertes@restomax.ci>';

  return {
    from,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      connectionTimeout: 6000,
      greetingTimeout: 6000,
      auth: user && pass ? { user, pass } : undefined,
    }),
  };
}

export function isEnvSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

export function isSmtpAvailable(override?: SmtpRuntimeConfig): boolean {
  return Boolean((override?.host || process.env.SMTP_HOST || '').trim());
}

export async function sendCriticalStockAlertEmail(
  payload: CriticalStockEmailPayload,
): Promise<EmailDispatchResult> {
  const cleanRecipients = Array.from(
    new Set(
      payload.recipients
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  );

  if (cleanRecipients.length === 0) {
    return {
      dispatched: false,
      status: 'SKIPPED',
      recipients: [],
    };
  }

  const resolved = resolveSmtpTransport(payload.smtpConfig);
  if (!resolved) {
    return {
      dispatched: false,
      status: 'QUEUED_NO_SMTP',
      recipients: cleanRecipients,
    };
  }

  try {
    const subject = `[Resto’MAX] Alerte réapprovisionnement : ${payload.stockName} (${payload.restaurantName})`;
    const text = [
      `Bonjour,`,
      ``,
      `L'ingrédient "${payload.stockName}" de votre établissement "${payload.restaurantName}" a atteint son seuil critique de réapprovisionnement.`,
      `- Stock actuel : ${payload.quantity} ${payload.unit}`,
      `- Seuil minimal configuré : ${payload.minThreshold} ${payload.unit}`,
      `- Fournisseur associé : ${payload.supplierName || 'Non renseigné'}`,
      ``,
      `Veuillez planifier un réapprovisionnement depuis votre module Stocks & Achats Resto’MAX.`,
    ].join('\n');

    const safeRestaurant = escapeHtmlText(payload.restaurantName || '');
    const safeStock = escapeHtmlText(payload.stockName || '');
    const safeUnit = escapeHtmlText(payload.unit || '');
    const safeSupplier = escapeHtmlText(payload.supplierName || 'Non renseigné');

    const html = `
      <div style="font-family: Inter, Arial, sans-serif; color: #182333; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: #182333; color: #ffffff; padding: 18px 24px;">
          <p style="margin: 0; font-size: 12px; color: #FF8738; font-weight: 700;">RESTO’MAX · ALERTE STOCK CRITIQUE</p>
          <h2 style="margin: 6px 0 0; font-size: 18px;">${safeRestaurant}</h2>
        </div>
        <div style="padding: 24px; background: #ffffff;">
          <p style="margin-top: 0; font-size: 14px;">L’ingrédient <strong>${safeStock}</strong> a atteint son seuil critique de réapprovisionnement :</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Stock actuel</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #E05252;">${payload.quantity} ${safeUnit}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B; border-top: 1px solid #f1f5f9;">Seuil minimal</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; border-top: 1px solid #f1f5f9;">${payload.minThreshold} ${safeUnit}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B; border-top: 1px solid #f1f5f9;">Fournisseur</td>
              <td style="padding: 8px 0; text-align: right; border-top: 1px solid #f1f5f9;">${safeSupplier}</td>
            </tr>
          </table>
          <p style="margin-bottom: 0; font-size: 12px; color: #64748B;">Connectez-vous à votre espace Stocks & Achats Resto’MAX pour enregistrer l’approvisionnement.</p>
        </div>
      </div>
    `;

    await resolved.transporter.sendMail({
      from: resolved.from,
      to: cleanRecipients.join(', '),
      subject,
      text,
      html,
    });

    return {
      dispatched: true,
      status: 'SENT',
      recipients: cleanRecipients,
    };
  } catch (err) {
    return {
      dispatched: false,
      status: 'FAILED',
      recipients: cleanRecipients,
      errorMessage: err instanceof Error ? err.message : 'SMTP error',
    };
  }
}

export async function sendSmtpTestEmail(params: {
  restaurantName: string;
  recipients: string[];
  smtpConfig?: SmtpRuntimeConfig;
}): Promise<EmailDispatchResult> {
  const cleanRecipients = Array.from(
    new Set(
      params.recipients
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  );
  if (cleanRecipients.length === 0) {
    return { dispatched: false, status: 'SKIPPED', recipients: [] };
  }
  const resolved = resolveSmtpTransport(params.smtpConfig);
  if (!resolved) {
    return {
      dispatched: false,
      status: 'QUEUED_NO_SMTP',
      recipients: cleanRecipients,
    };
  }

  try {
    await resolved.transporter.sendMail({
      from: resolved.from,
      to: cleanRecipients.join(', '),
      subject: `[Resto’MAX] Test SMTP réussi — ${params.restaurantName}`,
      text: `Votre configuration SMTP de production pour "${params.restaurantName}" est opérationnelle.`,
    });
    return {
      dispatched: true,
      status: 'SENT',
      recipients: cleanRecipients,
    };
  } catch (err) {
    return {
      dispatched: false,
      status: 'FAILED',
      recipients: cleanRecipients,
      errorMessage: err instanceof Error ? err.message : 'SMTP error',
    };
  }
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendAuthTransactionalEmail(params: {
  to: string;
  fullName: string;
  type: 'PASSWORD_RESET' | 'EMAIL_VERIFY';
  actionUrl: string;
  tokenCode: string;
  smtpConfig?: SmtpRuntimeConfig;
}): Promise<EmailDispatchResult> {
  const recipient = params.to.trim().toLowerCase();
  if (!recipient.includes('@')) {
    return { dispatched: false, status: 'SKIPPED', recipients: [] };
  }

  const resolved = resolveSmtpTransport(params.smtpConfig);
  if (!resolved) {
    return {
      dispatched: false,
      status: 'QUEUED_NO_SMTP',
      recipients: [recipient],
    };
  }

  const isReset = params.type === 'PASSWORD_RESET';
  const subject = isReset
    ? '[Resto’MAX] Réinitialisation de votre mot de passe'
    : '[Resto’MAX] Vérifiez votre adresse e-mail';
  const safeName = escapeHtmlText(params.fullName || 'Client');
  const safeUrl = escapeHtmlText(params.actionUrl);
  const safeCode = escapeHtmlText(params.tokenCode);
  const validityLabel = isReset ? '30 minutes' : '24 heures';

  const text = isReset
    ? `Bonjour ${params.fullName},\n\nVous avez demandé la réinitialisation de votre mot de passe Resto’MAX.\nLien sécurisé (valable ${validityLabel}, usage unique) : ${params.actionUrl}\nCode temporaire : ${params.tokenCode}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail.`
    : `Bonjour ${params.fullName},\n\nConfirmez votre adresse e-mail Resto’MAX via ce lien (valable ${validityLabel}) : ${params.actionUrl}\nCode de vérification : ${params.tokenCode}`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #182333; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: #182333; color: #ffffff; padding: 18px 24px;">
        <p style="margin: 0; font-size: 12px; color: #FF8738; font-weight: 700;">RESTO’MAX · SÉCURITÉ COMPTE</p>
        <h2 style="margin: 6px 0 0; font-size: 18px;">${isReset ? 'Réinitialisation du mot de passe' : 'Vérification de votre adresse e-mail'}</h2>
      </div>
      <div style="padding: 24px; background: #ffffff;">
        <p style="margin-top: 0; font-size: 14px;">Bonjour <strong>${safeName}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">${
          isReset
            ? `Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe (lien temporaire valable <strong>${validityLabel}</strong>, usage unique) :`
            : `Merci de confirmer votre adresse e-mail pour sécuriser votre accès Resto’MAX (valable <strong>${validityLabel}</strong>) :`
        }</p>
        <p style="margin: 20px 0;">
          <a href="${safeUrl}" style="display: inline-block; background: #FF8738; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 20px; border-radius: 8px; font-size: 14px;">
            ${isReset ? 'Réinitialiser mon mot de passe' : 'Vérifier mon e-mail'}
          </a>
        </p>
        <p style="font-size: 12px; color: #64748B;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/><span style="word-break: break-all; color: #182333;">${safeUrl}</span></p>
        <p style="font-size: 12px; color: #64748B;">Jeton temporaire : <strong style="font-family: monospace;">${safeCode}</strong></p>
        ${
          isReset
            ? '<p style="font-size: 11px; color: #94A3B8; margin-top: 16px; border-top: 1px solid #f1f5f9; padding-top: 12px;">Si vous n’êtes pas à l’origine de cette demande, aucune modification n’a été effectuée.</p>'
            : ''
        }
      </div>
    </div>
  `;

  try {
    await resolved.transporter.sendMail({
      from: resolved.from,
      to: recipient,
      subject,
      text,
      html,
    });
    return { dispatched: true, status: 'SENT', recipients: [recipient] };
  } catch (err) {
    return {
      dispatched: false,
      status: 'FAILED',
      recipients: [recipient],
      errorMessage: err instanceof Error ? err.message : 'SMTP error',
    };
  }
}
