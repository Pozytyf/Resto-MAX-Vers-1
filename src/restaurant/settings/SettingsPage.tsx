import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Gift,
  MessageCircle,
  Plus,
  Printer,
  Receipt,
  Store,
  Trash2,
} from 'lucide-react';
import { RestaurantLayout } from '../RestaurantLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateFr, formatDateTimeFr, formatFcfa } from '../../utils/format';
import type { ThermalPrintResponse } from '../../utils/thermalPrint';
import type {
  DeliveryZone,
  PaymentMethod,
  Plan,
  PlatformInvoice,
  PrinterSettings,
  Restaurant,
} from '../../types';

const DEFAULT_PRINTER: PrinterSettings = {
  paperWidth: '80mm',
  connectionType: 'BROWSER',
  printerHost: '',
  printerPort: 9100,
  autoPrintReceipt: false,
  autoPrintKitchenTicket: false,
};

interface WhatsappLogRow {
  id: string;
  recipientPhone: string;
  messageType: string;
  body: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface SubscriptionPortalData {
  currentSubscription: {
    id: string;
    planId: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    status: string;
    currentPeriodEnd: string;
    planName: string;
    planCode: string;
    priceMonthlyXof: number;
    priceYearlyXof: number;
  } | null;
  plans: Plan[];
  invoices: PlatformInvoice[];
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [resto, setResto] = useState<Restaurant | null>(null);
  const [printer, setPrinter] = useState<PrinterSettings>(DEFAULT_PRINTER);
  const [sub, setSub] = useState<{
    planName: string;
    status: string;
    priceMonthlyXof: number;
    currentPeriodEnd: string;
  } | null>(null);
  const [subPortal, setSubPortal] = useState<SubscriptionPortalData | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [subPayMethod, setSubPayMethod] =
    useState<Exclude<PaymentMethod, 'CASH'>>('WAVE');
  const [checkingOutSub, setCheckingOutSub] = useState(false);

  const [tickets, setTickets] = useState<
    Array<{ id: string; subject: string; status: string; priority: string }>
  >([]);
  const [whatsappTokenInput, setWhatsappTokenInput] = useState('');
  const [whatsappLogs, setWhatsappLogs] = useState<WhatsappLogRow[]>([]);

  const [paydunyaKeys, setPaydunyaKeys] = useState({
    paydunyaPublicKey: '',
    paydunyaPrivateKey: '',
    paydunyaToken: '',
  });
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'Technique',
    priority: 'MEDIUM',
    message: '',
  });
  const [testingPrint, setTestingPrint] = useState(false);
  const [testPreview, setTestPreview] = useState<string | null>(null);
  const [newPickupSlot, setNewPickupSlot] = useState('');

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ restaurant: Restaurant; subscription: typeof sub }>(
        '/api/restaurant/settings',
      ),
      apiFetch<{ tickets: typeof tickets }>('/api/restaurant/tickets'),
      apiFetch<SubscriptionPortalData>('/api/restaurant/subscription').catch(
        () => null,
      ),
      apiFetch<{ logs: WhatsappLogRow[] }>('/api/restaurant/whatsapp/logs').catch(
        () => ({ logs: [] as WhatsappLogRow[] }),
      ),
    ])
      .then(([s, tk, portal, wa]) => {
        setResto(s.restaurant);
        setPrinter({
          ...DEFAULT_PRINTER,
          ...(s.restaurant.printerSettings || {}),
        });
        setSub(s.subscription);
        setTickets(tk.tickets);
        setWhatsappLogs(wa.logs);
        if (portal) {
          setSubPortal(portal);
          setBillingCycle(portal.currentSubscription?.billingCycle || 'MONTHLY');
          setSelectedPlanId((prev) =>
            prev || portal.currentSubscription?.planId || portal.plans[0]?.id || '',
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resto) return;
    try {
      await apiFetch('/api/restaurant/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          name: resto.name,
          phone: resto.phone,
          address: resto.address,
          city: resto.city,
          openingHours: resto.openingHours,
          taxRatePercent: resto.taxRatePercent,
          paydunyaMode: resto.paydunyaMode,
          printerSettings: printer,
          whatsappEnabled: Boolean(resto.whatsappEnabled),
          whatsappPhoneNumberId: resto.whatsappPhoneNumberId || '',
          ...(whatsappTokenInput.trim()
            ? { whatsappAccessToken: whatsappTokenInput.trim() }
            : {}),
          storefrontEnabled: resto.storefrontEnabled ?? true,
          deliveryEnabled: resto.deliveryEnabled ?? true,
          deliveryZones: resto.deliveryZones || [],
          pickupSlots: resto.pickupSlots || [],
          loyaltyEnabled: resto.loyaltyEnabled ?? true,
          loyaltyPointsPer1000Xof: Number(resto.loyaltyPointsPer1000Xof ?? 10),
          loyaltyXofPerPoint: Number(resto.loyaltyXofPerPoint ?? 25),
          ...paydunyaKeys,
        }),
      });
      notify(t('settings.savedToast'), 'success');
      setPaydunyaKeys({
        paydunyaPublicKey: '',
        paydunyaPrivateKey: '',
        paydunyaToken: '',
      });
      setWhatsappTokenInput('');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleCheckoutSubscription = async () => {
    if (!selectedPlanId) return;
    setCheckingOutSub(true);
    try {
      const res = await apiFetch<{
        invoiceNumber: string;
        planName: string;
        amountXof: number;
      }>('/api/restaurant/subscription/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planId: selectedPlanId,
          billingCycle,
          paymentMethod: subPayMethod,
        }),
      });
      notify(
        `Abonnement ${res.planName} activé — Facture ${res.invoiceNumber} (${formatFcfa(res.amountXof)}) réglée.`,
        'success',
      );
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setCheckingOutSub(false);
    }
  };

  const handleTestPrinter = async () => {
    if (!resto) return;
    setTestingPrint(true);
    try {
      await apiFetch('/api/restaurant/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          printerSettings: printer,
        }),
      });
      const res = await apiFetch<ThermalPrintResponse>(
        '/api/restaurant/print/escpos',
        {
          method: 'POST',
          body: JSON.stringify({
            kind: 'RECEIPT',
            orderNumber: 'TEST-ESCPOS',
            totalXof: 12500,
            paidAmountXof: 12500,
            paymentMethod: 'WAVE',
            paymentReference: 'TEST-PRINTER-OK',
            items: [
              {
                name: 'Poisson Braisé Lagune',
                quantity: 1,
                lineTotalXof: 9500,
              },
              {
                name: 'Bissap Frais',
                quantity: 2,
                lineTotalXof: 3000,
              },
            ],
          }),
        },
      );
      setTestPreview(res.previewText);
      if (res.mode === 'NETWORK_ESCPOS' && res.networkResult && !res.networkResult.ok) {
        notify(
          res.networkResult.error || t('pos.thermalPrintError'),
          'info',
        );
      } else {
        notify(t('settings.testPrinterOk', { mode: res.mode }), 'success');
      }
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t('pos.thermalPrintError'),
        'error',
      );
    } finally {
      setTestingPrint(false);
    }
  };

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/restaurant/tickets', {
        method: 'POST',
        body: JSON.stringify(ticketForm),
      });
      notify(t('settings.ticketSentToast'), 'success');
      setTicketForm({
        subject: '',
        category: 'Technique',
        priority: 'MEDIUM',
        message: '',
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const selectedPlanObj =
    subPortal?.plans.find((p) => p.id === selectedPlanId) || null;
  const checkoutAmountXof = selectedPlanObj
    ? billingCycle === 'YEARLY'
      ? selectedPlanObj.priceYearlyXof
      : selectedPlanObj.priceMonthlyXof
    : 0;

  return (
    <RestaurantLayout title={t('pages.settingsTitle')}>
      {resto && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={saveSettings}
            className="lg:col-span-7 bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6 space-y-5"
          >
            <h2 className="text-base font-bold text-[var(--rm-ink)]">
              {t('settings.profileSectionTitle')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('settings.nameLabel')}
                </label>
                <input
                  type="text"
                  value={resto.name}
                  onChange={(e) => setResto({ ...resto, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('settings.phoneLabel')}
                </label>
                <input
                  type="text"
                  value={resto.phone}
                  onChange={(e) => setResto({ ...resto, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('settings.hoursLabel')}
                </label>
                <input
                  type="text"
                  value={resto.openingHours}
                  onChange={(e) =>
                    setResto({ ...resto, openingHours: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('settings.vatRateLabel')}
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={resto.taxRatePercent}
                  onChange={(e) =>
                    setResto({
                      ...resto,
                      taxRatePercent: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--rm-border)] space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--rm-ink)]">
                    {t('settings.paydunyaTitle')}
                  </h3>
                  <p className="text-xs text-[var(--rm-ink-muted)]">
                    {t('settings.paydunyaDesc')}
                  </p>
                </div>
                <select
                  value={resto.paydunyaMode}
                  onChange={(e) =>
                    setResto({
                      ...resto,
                      paydunyaMode: e.target.value as 'TEST' | 'LIVE',
                    })
                  }
                  className="px-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] text-xs font-semibold bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                >
                  <option value="TEST">{t('settings.testMode')}</option>
                  <option value="LIVE">{t('settings.liveMode')}</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="password"
                  placeholder={t('settings.paydunyaPublicPlaceholder')}
                  value={paydunyaKeys.paydunyaPublicKey}
                  onChange={(e) =>
                    setPaydunyaKeys({
                      ...paydunyaKeys,
                      paydunyaPublicKey: e.target.value,
                    })
                  }
                  className="px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
                />
                <input
                  type="password"
                  placeholder={t('settings.paydunyaPrivatePlaceholder')}
                  value={paydunyaKeys.paydunyaPrivateKey}
                  onChange={(e) =>
                    setPaydunyaKeys({
                      ...paydunyaKeys,
                      paydunyaPrivateKey: e.target.value,
                    })
                  }
                  className="px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
                />
                <input
                  type="password"
                  placeholder={t('settings.paydunyaTokenPlaceholder')}
                  value={paydunyaKeys.paydunyaToken}
                  onChange={(e) =>
                    setPaydunyaKeys({
                      ...paydunyaKeys,
                      paydunyaToken: e.target.value,
                    })
                  }
                  className="px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
                />
              </div>
            </div>

            {/* WhatsApp Cloud API Connector */}
            <div className="pt-4 border-t border-[var(--rm-border)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-[#25D366]" />
                  <div>
                    <h3 className="text-sm font-bold text-[var(--rm-ink)]">
                      Connecteur WhatsApp Cloud API (Meta)
                    </h3>
                    <p className="text-xs text-[var(--rm-ink-muted)]">
                      Confirmations de réservations et reçus digitaux clients. Sans clé API, un lien direct wa.me reste généré.
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--rm-ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(resto.whatsappEnabled)}
                    onChange={(e) =>
                      setResto({ ...resto, whatsappEnabled: e.target.checked })
                    }
                  />
                  <span>Actif</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                    Phone Number ID (Meta)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 109283746510293"
                    value={resto.whatsappPhoneNumberId || ''}
                    onChange={(e) =>
                      setResto({
                        ...resto,
                        whatsappPhoneNumberId: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                    Access Token Meta ({resto.whatsappConfigured ? 'Configuré' : 'Non configuré'})
                  </label>
                  <input
                    type="password"
                    placeholder={
                      resto.whatsappConfigured ? '•••••••••••• (laisser vide pour conserver)' : 'EAA...'
                    }
                    value={whatsappTokenInput}
                    onChange={(e) => setWhatsappTokenInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Dedicated ESC/POS Thermal Printer Section */}
            <div className="pt-4 border-t border-[var(--rm-border)] space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--rm-ink)]">
                  {t('settings.printerSectionTitle')}
                </h3>
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  {t('settings.printerSectionDesc')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('settings.printerModeLabel')}
                  </label>
                  <select
                    value={printer.connectionType}
                    onChange={(e) =>
                      setPrinter({
                        ...printer,
                        connectionType: e.target
                          .value as PrinterSettings['connectionType'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-xs bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                  >
                    <option value="BROWSER">
                      {t('settings.printerModeBrowser')}
                    </option>
                    <option value="NETWORK_ESCPOS">
                      {t('settings.printerModeNetwork')}
                    </option>
                    <option value="WEB_SERIAL">
                      {t('settings.printerModeUsb')}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('settings.paperWidthLabel')}
                  </label>
                  <select
                    value={printer.paperWidth}
                    onChange={(e) =>
                      setPrinter({
                        ...printer,
                        paperWidth: e.target.value as '58mm' | '80mm',
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-xs bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                  >
                    <option value="80mm">80mm (42 col.)</option>
                    <option value="58mm">58mm (32 col.)</option>
                  </select>
                </div>

                {printer.connectionType === 'NETWORK_ESCPOS' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                        {t('settings.printerHostLabel')}
                      </label>
                      <input
                        type="text"
                        placeholder="192.168.1.100"
                        value={printer.printerHost}
                        onChange={(e) =>
                          setPrinter({
                            ...printer,
                            printerHost: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                        {t('settings.printerPortLabel')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={printer.printerPort}
                        onChange={(e) =>
                          setPrinter({
                            ...printer,
                            printerPort: Number(e.target.value) || 9100,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs font-mono tabular-nums"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-[var(--rm-ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printer.autoPrintReceipt}
                    onChange={(e) =>
                      setPrinter({
                        ...printer,
                        autoPrintReceipt: e.target.checked,
                      })
                    }
                  />
                  <span>{t('settings.autoPrintReceiptLabel')}</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--rm-ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printer.autoPrintKitchenTicket}
                    onChange={(e) =>
                      setPrinter({
                        ...printer,
                        autoPrintKitchenTicket: e.target.checked,
                      })
                    }
                  />
                  <span>{t('settings.autoPrintKitchenLabel')}</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={testingPrint}
                  onClick={() => void handleTestPrinter()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--rm-border)] text-[var(--rm-ink)] hover:border-[#FF8738] text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-3.5 h-3.5 text-[#FF8738]" />
                  <span>
                    {testingPrint
                      ? t('settings.testingPrinterBtn')
                      : t('settings.testPrinterBtn')}
                  </span>
                </button>
              </div>

              {testPreview && (
                <div className="p-3.5 rounded-xl bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] space-y-1.5">
                  <p className="text-[11px] font-semibold text-[var(--rm-ink-muted)]">
                    {t('settings.testPrinterPreviewTitle', {
                      width: printer.paperWidth,
                    })}
                  </p>
                  <pre className="text-[11px] font-mono text-[var(--rm-ink)] whitespace-pre-wrap leading-relaxed overflow-x-auto">
                    {testPreview}
                  </pre>
                </div>
              )}
            </div>

            {/* Click & Collect & Delivery Storefront Section */}
            <div className="pt-4 border-t border-[var(--rm-border)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-[#FF8738]" />
                  <div>
                    <h3 className="text-sm font-bold text-[var(--rm-ink)]">
                      Vitrine Click & Collect & Livraison en ligne
                    </h3>
                    <p className="text-xs text-[var(--rm-ink-muted)]">
                      Permet aux clients hors-salle de commander sans QR de table avec paiement en ligne.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/c/${resto.slug}`;
                      void navigator.clipboard?.writeText(url);
                      notify('Lien vitrine copié.', 'success');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copier le lien</span>
                  </button>
                  <Link
                    to={`/c/${resto.slug}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FF8738]/10 text-[#FF8738] text-xs font-semibold"
                  >
                    <span>Ouvrir /c/{resto.slug}</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--rm-ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resto.storefrontEnabled ?? true}
                    onChange={(e) =>
                      setResto({ ...resto, storefrontEnabled: e.target.checked })
                    }
                  />
                  <span>Vitrine publique Click & Collect active</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--rm-ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resto.deliveryEnabled ?? true}
                    onChange={(e) =>
                      setResto({ ...resto, deliveryEnabled: e.target.checked })
                    }
                  />
                  <span>Livraison activée</span>
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--rm-ink)]">
                    Zones & tarifs de livraison
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextZone: DeliveryZone = {
                        id: `zone_${Date.now()}`,
                        name: 'Nouvelle zone',
                        feeXof: 1500,
                        minOrderXof: 5000,
                      };
                      setResto({
                        ...resto,
                        deliveryZones: [...(resto.deliveryZones || []), nextZone],
                      });
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF8738] hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Ajouter une zone</span>
                  </button>
                </div>
                {(resto.deliveryZones || []).map((z, idx) => (
                  <div key={z.id} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={z.name}
                      onChange={(e) =>
                        setResto({
                          ...resto,
                          deliveryZones: (resto.deliveryZones || []).map((row, i) =>
                            i === idx ? { ...row, name: e.target.value } : row,
                          ),
                        })
                      }
                      placeholder="Nom zone"
                      className="col-span-5 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      value={z.feeXof}
                      onChange={(e) =>
                        setResto({
                          ...resto,
                          deliveryZones: (resto.deliveryZones || []).map((row, i) =>
                            i === idx
                              ? { ...row, feeXof: Number(e.target.value) || 0 }
                              : row,
                          ),
                        })
                      }
                      placeholder="Frais (FCFA)"
                      className="col-span-3 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                    />
                    <input
                      type="number"
                      min={0}
                      value={z.minOrderXof}
                      onChange={(e) =>
                        setResto({
                          ...resto,
                          deliveryZones: (resto.deliveryZones || []).map((row, i) =>
                            i === idx
                              ? { ...row, minOrderXof: Number(e.target.value) || 0 }
                              : row,
                          ),
                        })
                      }
                      placeholder="Min (FCFA)"
                      className="col-span-3 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setResto({
                          ...resto,
                          deliveryZones: (resto.deliveryZones || []).filter(
                            (_, i) => i !== idx,
                          ),
                        })
                      }
                      className="col-span-1 p-1.5 text-[#E05252] cursor-pointer"
                      aria-label="Supprimer zone"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[var(--rm-ink)]">
                  Créneaux de retrait Click & Collect
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(resto.pickupSlots || []).map((slot, idx) => (
                    <span
                      key={`${slot}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] text-xs text-[var(--rm-ink)]"
                    >
                      <span>{slot}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setResto({
                            ...resto,
                            pickupSlots: (resto.pickupSlots || []).filter(
                              (_, i) => i !== idx,
                            ),
                          })
                        }
                        className="text-[#E05252] cursor-pointer"
                        aria-label="Retirer créneau"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: 19:30 - 20:00"
                    value={newPickupSlot}
                    onChange={(e) => setNewPickupSlot(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = newPickupSlot.trim();
                      if (!trimmed) return;
                      setResto({
                        ...resto,
                        pickupSlots: [...(resto.pickupSlots || []), trimmed],
                      });
                      setNewPickupSlot('');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
                  >
                    Ajouter créneau
                  </button>
                </div>
              </div>
            </div>

            {/* Loyalty Program Section */}
            <div className="pt-4 border-t border-[var(--rm-border)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-[#14B8A6]" />
                  <div>
                    <h3 className="text-sm font-bold text-[var(--rm-ink)]">
                      Programme de fidélité clients
                    </h3>
                    <p className="text-xs text-[var(--rm-ink-muted)]">
                      Cumul automatique sur le numéro de téléphone et conversion en remise.
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--rm-ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resto.loyaltyEnabled ?? true}
                    onChange={(e) =>
                      setResto({ ...resto, loyaltyEnabled: e.target.checked })
                    }
                  />
                  <span>Actif</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                    Points gagnés par tranche de 1 000 FCFA
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={resto.loyaltyPointsPer1000Xof ?? 10}
                    onChange={(e) =>
                      setResto({
                        ...resto,
                        loyaltyPointsPer1000Xof: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                    Valeur d’un point à l’échange (FCFA)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={resto.loyaltyXofPerPoint ?? 25}
                    onChange={(e) =>
                      setResto({
                        ...resto,
                        loyaltyXofPerPoint: Number(e.target.value) || 1,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
            >
              {t('settings.saveSettingsBtn')}
            </button>
          </form>

          <div className="lg:col-span-5 space-y-6">
            {/* Self-Service SaaS Subscription & Billing Portal */}
            <div
              className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6 space-y-4"
              data-testid="saas-subscription-portal"
            >
              {sub && (
                <div className="bg-[#182333] dark:bg-[var(--rm-surface-muted)] text-white dark:text-[var(--rm-ink)] rounded-xl p-4 space-y-1">
                  <p className="text-xs text-[#FF8738] font-semibold">
                    {t('settings.saasSubTitle')}
                  </p>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-lg font-bold">{sub.planName}</h3>
                    <span className="text-xs font-semibold text-[#14B8A6]">
                      {sub.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 dark:text-[var(--rm-ink-muted)] tabular-nums">
                    {t('settings.perMonthStatus', {
                      amount: formatFcfa(sub.priceMonthlyXof),
                      status: sub.status,
                    })}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-[var(--rm-ink-muted)]">
                    {t('settings.currentPeriodEnd', {
                      date: formatDateFr(sub.currentPeriodEnd),
                    })}
                  </p>
                </div>
              )}

              {subPortal && (
                <div className="space-y-3">
                  <Link
                    to="/app/subscription"
                    className="w-full py-2 px-3 rounded-lg border border-[#FF8738]/40 bg-[#FF8738]/10 hover:bg-[#FF8738]/20 text-[#FF8738] text-xs font-bold inline-flex items-center justify-between gap-2 transition-colors"
                  >
                    <span>Ouvrir la page dédiée « Mon Abonnement »</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-[var(--rm-ink)] flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-[#FF8738]" />
                      <span>Renouveler ou changer de forfait</span>
                    </h4>
                    <div className="inline-flex rounded-lg border border-[var(--rm-border)] p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setBillingCycle('MONTHLY')}
                        className={`px-2 py-1 rounded font-semibold cursor-pointer ${
                          billingCycle === 'MONTHLY'
                            ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                            : 'text-[var(--rm-ink-muted)]'
                        }`}
                      >
                        Mensuel
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingCycle('YEARLY')}
                        className={`px-2 py-1 rounded font-semibold cursor-pointer ${
                          billingCycle === 'YEARLY'
                            ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                            : 'text-[var(--rm-ink-muted)]'
                        }`}
                      >
                        Annuel
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {subPortal.plans.map((pl) => {
                      const active = selectedPlanId === pl.id;
                      const price =
                        billingCycle === 'YEARLY'
                          ? pl.priceYearlyXof
                          : pl.priceMonthlyXof;
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => setSelectedPlanId(pl.id)}
                          className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            active
                              ? 'border-[#FF8738] bg-[#FF8738]/10'
                              : 'border-[var(--rm-border)] hover:border-[#FF8738]/50'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-bold text-[var(--rm-ink)] flex items-center gap-1.5">
                              {active && <Check className="w-3.5 h-3.5 text-[#FF8738]" />}
                              <span>{pl.name}</span>
                            </p>
                            <p className="text-[11px] text-[var(--rm-ink-muted)]">
                              {pl.maxTables} tables · {pl.maxStaff} équipiers
                            </p>
                          </div>
                          <span className="text-xs font-extrabold text-[var(--rm-ink)] tabular-nums">
                            {formatFcfa(price)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'WAVE', label: 'Wave' },
                        { id: 'ORANGE_MONEY', label: 'Orange Money' },
                        { id: 'MTN_MOMO', label: 'MTN MoMo' },
                        { id: 'CARD', label: 'Carte Bancaire' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSubPayMethod(m.id)}
                        className={`py-2 px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                          subPayMethod === m.id
                            ? 'bg-[#182333] dark:bg-[#FF8738] text-white border-transparent'
                            : 'border-[var(--rm-border)] text-[var(--rm-ink)]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    data-testid="saas-checkout-btn"
                    disabled={checkingOutSub || !selectedPlanId}
                    onClick={() => void handleCheckoutSubscription()}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {checkingOutSub
                      ? 'Validation du paiement...'
                      : `Régler ${formatFcfa(checkoutAmountXof)} & Activer`}
                  </button>

                  {subPortal.invoices.length > 0 && (
                    <div className="pt-3 border-t border-[var(--rm-border-subtle)] space-y-2">
                      <p className="text-xs font-semibold text-[var(--rm-ink-muted)] flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Factures SaaS récentes</span>
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
                        {subPortal.invoices.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between py-1 border-b border-[var(--rm-border-subtle)] last:border-0"
                          >
                            <div>
                              <span className="font-mono font-bold text-[var(--rm-ink)]">
                                {inv.invoiceNumber}
                              </span>
                              <span className="text-[11px] text-[var(--rm-ink-muted)] ml-2">
                                {inv.paymentMethod}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 tabular-nums">
                              <span className="font-semibold text-[var(--rm-ink)]">
                                {formatFcfa(inv.amountXof)}
                              </span>
                              <span className="text-[10px] font-bold text-[#14B8A6]">
                                {inv.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* WhatsApp recent logs */}
            {whatsappLogs.length > 0 && (
              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-3">
                <h3 className="text-sm font-bold text-[var(--rm-ink)] flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-[#25D366]" />
                  <span>Journal des envois WhatsApp</span>
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto text-xs">
                  {whatsappLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-lg bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-[var(--rm-ink)]">
                          +{log.recipientPhone} · {log.messageType}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
                            log.status === 'SENT'
                              ? 'text-[#14B8A6]'
                              : log.status === 'FAILED'
                                ? 'text-[#E05252]'
                                : 'text-[#FF8738]'
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--rm-ink-muted)]">
                        {formatDateTimeFr(log.createdAt)}
                        {log.errorMessage ? ` · ${log.errorMessage}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6 space-y-4">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                {t('settings.supportSectionTitle')}
              </h3>
              <form onSubmit={createTicket} className="space-y-3">
                <input
                  required
                  type="text"
                  placeholder={t('settings.ticketSubjectPlaceholder')}
                  value={ticketForm.subject}
                  onChange={(e) =>
                    setTicketForm({ ...ticketForm, subject: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
                />
                <textarea
                  required
                  rows={3}
                  placeholder={t('settings.ticketMessagePlaceholder')}
                  value={ticketForm.message}
                  onChange={(e) =>
                    setTicketForm({ ...ticketForm, message: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer"
                >
                  {t('settings.openTicketBtn')}
                </button>
              </form>

              {tickets.length > 0 && (
                <div className="pt-3 border-t border-[var(--rm-border-subtle)] space-y-2">
                  <p className="text-xs font-semibold text-[var(--rm-ink-muted)]">
                    {t('settings.recentTicketsTitle')}
                  </p>
                  {tickets.map((tk) => (
                    <div
                      key={tk.id}
                      className="text-xs flex justify-between py-1"
                    >
                      <span className="truncate font-medium text-[var(--rm-ink)]">
                        {tk.subject}
                      </span>
                      <span className="text-[#FF8738] font-semibold shrink-0 ml-2">
                        {tk.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </RestaurantLayout>
  );
}
