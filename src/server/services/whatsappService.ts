import { getDb, generateId } from '../db.ts';

export interface WhatsappConfig {
  enabled: boolean;
  phoneNumberId?: string;
  accessToken?: string;
}

export interface WhatsappSendResult {
  dispatched: boolean;
  status: 'SENT' | 'QUEUED_NO_WHATSAPP' | 'FAILED';
  recipientPhone: string;
  externalMessageId: string | null;
  waMeLink: string;
  errorMessage?: string;
}

/**
 * Normalise un numéro de téléphone vers le format international sans `+` (E.164 digits).
 * Si numéro local ivoirien (10 chiffres commençant par 0), préfixe `225`.
 */
export function normalizeWhatsappPhone(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.length === 10 && digits.startsWith('0')) {
    return `225${digits}`;
  }
  return digits;
}

export function buildWaMeLink(phone: string, body: string): string {
  const normalized = normalizeWhatsappPhone(phone);
  const encodedText = encodeURIComponent(body);
  return normalized
    ? `https://wa.me/${normalized}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}

export async function sendWhatsappMessage(params: {
  restaurantId: string;
  recipientPhone: string;
  messageType: 'RESERVATION_CONFIRM' | 'RECEIPT' | 'CUSTOM';
  body: string;
  config?: WhatsappConfig;
}): Promise<WhatsappSendResult> {
  const normalizedPhone = normalizeWhatsappPhone(params.recipientPhone);
  const waMeLink = buildWaMeLink(params.recipientPhone, params.body);
  const phoneNumberId = (
    params.config?.phoneNumberId ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    ''
  ).trim();
  const accessToken = (
    params.config?.accessToken ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    ''
  ).trim();
  const enabled =
    params.config?.enabled ?? Boolean(phoneNumberId && accessToken);

  const db = getDb();
  const logId = generateId('walog');
  const now = new Date().toISOString();

  if (!normalizedPhone || !enabled || !phoneNumberId || !accessToken) {
    db.prepare(
      `INSERT INTO whatsapp_logs (
        id, restaurant_id, recipient_phone, message_type, body, status, external_message_id, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, 'QUEUED_NO_WHATSAPP', NULL, ?, ?)`,
    ).run(
      logId,
      params.restaurantId,
      normalizedPhone || params.recipientPhone,
      params.messageType,
      params.body,
      !normalizedPhone
        ? 'Numéro destinataire manquant'
        : 'Connecteur WhatsApp Cloud API non configuré',
      now,
    );

    return {
      dispatched: false,
      status: 'QUEUED_NO_WHATSAPP',
      recipientPhone: normalizedPhone || params.recipientPhone,
      externalMessageId: null,
      waMeLink,
    };
  }

  // Strictement borné à l'API officielle Meta Graph (anti-SSRF)
  const cleanId = phoneNumberId.replace(/[^\d]/g, '');
  if (!cleanId) {
    return {
      dispatched: false,
      status: 'FAILED',
      recipientPhone: normalizedPhone,
      externalMessageId: null,
      waMeLink,
      errorMessage: 'Identifiant Phone Number ID WhatsApp invalide.',
    };
  }

  try {
    const endpoint = `https://graph.facebook.com/v20.0/${cleanId}/messages`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: params.body.slice(0, 4096),
        },
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      const errMsg = data?.error?.message || `HTTP ${response.status}`;
      db.prepare(
        `INSERT INTO whatsapp_logs (
          id, restaurant_id, recipient_phone, message_type, body, status, external_message_id, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, 'FAILED', NULL, ?, ?)`,
      ).run(
        logId,
        params.restaurantId,
        normalizedPhone,
        params.messageType,
        params.body,
        errMsg,
        now,
      );
      return {
        dispatched: false,
        status: 'FAILED',
        recipientPhone: normalizedPhone,
        externalMessageId: null,
        waMeLink,
        errorMessage: errMsg,
      };
    }

    const externalId = data?.messages?.[0]?.id || null;
    db.prepare(
      `INSERT INTO whatsapp_logs (
        id, restaurant_id, recipient_phone, message_type, body, status, external_message_id, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, 'SENT', ?, NULL, ?)`,
    ).run(
      logId,
      params.restaurantId,
      normalizedPhone,
      params.messageType,
      params.body,
      externalId,
      now,
    );

    return {
      dispatched: true,
      status: 'SENT',
      recipientPhone: normalizedPhone,
      externalMessageId: externalId,
      waMeLink,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Erreur réseau WhatsApp';
    db.prepare(
      `INSERT INTO whatsapp_logs (
        id, restaurant_id, recipient_phone, message_type, body, status, external_message_id, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, 'FAILED', NULL, ?, ?)`,
    ).run(
      logId,
      params.restaurantId,
      normalizedPhone,
      params.messageType,
      params.body,
      errMsg,
      now,
    );
    return {
      dispatched: false,
      status: 'FAILED',
      recipientPhone: normalizedPhone,
      externalMessageId: null,
      waMeLink,
      errorMessage: errMsg,
    };
  }
}
