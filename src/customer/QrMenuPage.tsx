import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  Clock,
  Gift,
  Minus,
  Moon,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRestaurantTheme } from '../app/hooks/useRestaurantTheme';
import { apiFetch } from '../services/api';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { ResilientImage } from '../components/ResilientImage';
import { useToast } from '../components/Toast';
import { formatFcfa, getDeliveryStatusLabel } from '../utils/format';
import { ServiceRatingForm, type ServiceRatingPayload } from './ServiceRatingForm';
import type {
  MenuCategory,
  MenuCombo,
  MenuOption,
  MenuOptionGroup,
} from '../types';

interface GuestMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceXof: number;
  effectivePriceXof?: number;
  promoLabel?: string | null;
  imageUrl: string | null;
  station?: 'KITCHEN' | 'BAR';
  options: MenuOption[];
  optionGroups?: MenuOptionGroup[];
}

interface QrPayload {
  sessionId: string;
  restaurant: {
    id: string;
    name: string;
    slug?: string;
    city: string;
    currency: string;
    taxRatePercent?: number;
    openingHours: string;
    loyaltyEnabled?: boolean;
    loyaltyPointsPer1000Xof?: number;
    loyaltyXofPerPoint?: number;
  };
  table: {
    id: string;
    label: string;
    zone: string;
  };
  ratingSummary?: {
    total: number;
    avgRating: number;
    avgServiceRating: number;
  };
  waiters?: string[];
  categories: MenuCategory[];
  items: GuestMenuItem[];
  combos?: MenuCombo[];
}

interface CartEntry {
  key: string;
  kind: 'ITEM' | 'COMBO';
  item?: GuestMenuItem;
  combo?: MenuCombo;
  unitPriceXof: number;
  optionIds: string[];
  optionsLabel: string;
  optionsDelta: number;
  quantity: number;
  notes: string;
}

interface RecentTrackedOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalXof: number;
}

function getStorageKey(token: string): string {
  return `restomax_qr_orders:${token}`;
}

function loadStoredOrderIds(token: string): string[] {
  try {
    const raw = window.localStorage.getItem(getStorageKey(token));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveStoredOrderId(token: string, orderId: string): void {
  try {
    const current = loadStoredOrderIds(token).filter((id) => id !== orderId);
    window.localStorage.setItem(
      getStorageKey(token),
      JSON.stringify([orderId, ...current].slice(0, 5)),
    );
  } catch {
    // Ignore storage errors
  }
}

export function QrMenuPage() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useRestaurantTheme();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [data, setData] = useState<QrPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [selectedItem, setSelectedItem] = useState<GuestMenuItem | null>(null);
  const [chosenOpts, setChosenOpts] = useState<string[]>([]);
  const [itemNote, setItemNote] = useState('');

  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [loyaltyBalance, setLoyaltyBalance] = useState<{
    points: number;
    xofPerPoint: number;
    customerName?: string;
  } | null>(null);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [checkingLoyalty, setCheckingLoyalty] = useState(false);

  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [callingType, setCallingType] = useState<'WAITER' | 'BILL' | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentTrackedOrder[]>([]);
  const [showServiceRating, setShowServiceRating] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);

  const checkoutKeyRef = useRef<string>('');
  const refreshCheckoutKey = () => {
    checkoutKeyRef.current = `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<QrPayload>(`/api/public/qr/${encodeURIComponent(token)}`)
      .then((res) => {
        setData(res);
        setError(null);
        refreshCheckoutKey();
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('customer.invalidQr'));
      })
      .finally(() => setLoading(false));
  }, [token, t]);

  useEffect(() => {
    if (!token) return;
    const ids = loadStoredOrderIds(token);
    if (ids.length === 0) {
      setRecentOrders([]);
      return;
    }
    let active = true;
    Promise.all(
      ids.map((id) =>
        apiFetch<{ order: RecentTrackedOrder }>(
          `/api/public/qr/${encodeURIComponent(token)}/orders/${encodeURIComponent(id)}`,
        )
          .then((r) => r.order)
          .catch(() => null),
      ),
    ).then((results) => {
      if (!active) return;
      const valid = results.filter(
        (o): o is RecentTrackedOrder =>
          o !== null && o.status !== 'CANCELLED',
      );
      setRecentOrders(valid);
    });
    return () => {
      active = false;
    };
  }, [token]);

  const computeOptionsSummaryAndDelta = (
    item: GuestMenuItem,
    selectedIds: string[],
  ) => {
    const groups = item.optionGroups || [];
    const labels: string[] = [];
    const used = new Set<string>();
    let delta = 0;

    for (const g of groups) {
      const picked = g.choices.filter((c) => selectedIds.includes(c.id));
      for (const c of picked) {
        used.add(c.id);
        labels.push(`${g.name}: ${c.label}`);
        delta += Number(c.priceDeltaXof || 0);
      }
    }
    for (const leg of item.options || []) {
      if (selectedIds.includes(leg.id) && !used.has(leg.id)) {
        used.add(leg.id);
        labels.push(leg.label);
        delta += Number(leg.priceDeltaXof || 0);
      }
    }
    return { label: labels.join(' · '), delta };
  };

  const hasCustomizations = (it: GuestMenuItem) =>
    (it.optionGroups && it.optionGroups.length > 0) || it.options.length > 0;

  const openItemModal = (it: GuestMenuItem) => {
    setSelectedItem(it);
    const defaultIds: string[] = [];
    for (const g of it.optionGroups || []) {
      if (g.required && !g.multiple && g.choices[0]) {
        defaultIds.push(g.choices[0].id);
      }
    }
    setChosenOpts(defaultIds);
    setItemNote('');
  };

  const addItemToCart = (
    item: GuestMenuItem,
    optIds: string[],
    note: string,
  ) => {
    for (const g of item.optionGroups || []) {
      if (g.required && !g.choices.some((c) => optIds.includes(c.id))) {
        notify(`Veuillez choisir une option pour « ${g.name} ».`, 'error');
        return;
      }
    }

    const cleanNote = note.trim();
    const sortedIds = [...optIds].sort();
    const { label, delta } = computeOptionsSummaryAndDelta(item, sortedIds);
    const unitPriceXof = Number(item.effectivePriceXof ?? item.priceXof);
    const key = `item::${item.id}::${sortedIds.join(',')}::${cleanNote}`;

    setCart((prev) => {
      const idx = prev.findIndex((c) => c.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          key,
          kind: 'ITEM',
          item,
          unitPriceXof,
          optionIds: sortedIds,
          optionsLabel: label,
          optionsDelta: delta,
          quantity: 1,
          notes: cleanNote,
        },
      ];
    });
    refreshCheckoutKey();
    setSelectedItem(null);
    setChosenOpts([]);
    setItemNote('');
    notify(t('customer.addedToCartToast', { name: item.name }), 'success');
  };

  const addComboToCart = (combo: MenuCombo) => {
    const key = `combo::${combo.id}`;
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          key,
          kind: 'COMBO',
          combo,
          unitPriceXof: combo.priceXof,
          optionIds: [],
          optionsLabel: combo.items
            .map((ci) => `${ci.quantity}× ${ci.label}`)
            .join(' + '),
          optionsDelta: 0,
          quantity: 1,
          notes: '',
        },
      ];
    });
    refreshCheckoutKey();
    notify(`Formule « ${combo.name} » ajoutée au panier.`, 'success');
  };

  const updateCartQty = (key: string, delta: number) => {
    refreshCheckoutKey();
    setCart((prev) =>
      prev
        .map((c) =>
          c.key === key ? { ...c, quantity: c.quantity + delta } : c,
        )
        .filter((c) => c.quantity > 0),
    );
  };

  const removeCartEntry = (key: string) => {
    refreshCheckoutKey();
    setCart((prev) => prev.filter((c) => c.key !== key));
  };

  const totalCount = cart.reduce((a, c) => a + c.quantity, 0);
  const grossTotalXof = cart.reduce(
    (a, c) => a + (c.unitPriceXof + c.optionsDelta) * c.quantity,
    0,
  );
  const redeemablePts =
    useLoyaltyPoints && loyaltyBalance && loyaltyBalance.points > 0
      ? Math.min(
          loyaltyBalance.points,
          Math.floor(grossTotalXof / Math.max(1, loyaltyBalance.xofPerPoint)),
        )
      : 0;
  const loyaltyDiscountPreview =
    redeemablePts * (loyaltyBalance?.xofPerPoint || 25);
  const estimatedTotalXof = Math.max(0, grossTotalXof - loyaltyDiscountPreview);

  const selectedOptsDelta = useMemo(() => {
    if (!selectedItem) return 0;
    return computeOptionsSummaryAndDelta(selectedItem, chosenOpts).delta;
  }, [selectedItem, chosenOpts]);

  const handleCallService = async (callType: 'WAITER' | 'BILL') => {
    if (!token || callingType) return;
    setCallingType(callType);
    try {
      await apiFetch(`/api/public/qr/${encodeURIComponent(token)}/call`, {
        method: 'POST',
        body: JSON.stringify({ callType }),
      });
      notify(
        callType === 'BILL'
          ? 'Votre demande d’addition a été transmise au serveur.'
          : 'Un serveur arrive à votre table dans un instant.',
        'success',
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Impossible d’envoyer l’appel.',
        'error',
      );
    } finally {
      window.setTimeout(() => setCallingType(null), 1500);
    }
  };

  const handleSubmitServiceRating = async (payload: ServiceRatingPayload) => {
    if (!token || submittingRating) return;
    setSubmittingRating(true);
    try {
      const res = await apiFetch<{
        ratingSummary: { total: number; avgRating: number; avgServiceRating: number };
      }>(`/api/public/qr/${encodeURIComponent(token)}/service-rating`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setData((prev) =>
        prev ? { ...prev, ratingSummary: res.ratingSummary } : prev,
      );
      setShowServiceRating(false);
      notify('Merci ! Votre évaluation du service a bien été enregistrée.', 'success');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Impossible d’enregistrer votre note.',
        'error',
      );
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleLookupLoyalty = async () => {
    if (!token || customerPhone.trim().length < 6) {
      notify('Entrez votre numéro de téléphone (6 chiffres min.).', 'error');
      return;
    }
    setCheckingLoyalty(true);
    try {
      const res = await apiFetch<{
        loyaltyEnabled: boolean;
        xofPerPoint: number;
        customer: { fullName: string; loyaltyPoints: number } | null;
      }>(
        `/api/public/qr/${encodeURIComponent(token)}/loyalty?phone=${encodeURIComponent(
          customerPhone.trim(),
        )}`,
      );
      if (res.customer) {
        setLoyaltyBalance({
          points: res.customer.loyaltyPoints,
          xofPerPoint: res.xofPerPoint,
          customerName: res.customer.fullName,
        });
        notify(
          `${res.customer.loyaltyPoints} pts disponibles (${formatFcfa(
            res.customer.loyaltyPoints * res.xofPerPoint,
          )})`,
          'success',
        );
      } else {
        setLoyaltyBalance({
          points: 0,
          xofPerPoint: res.xofPerPoint,
        });
        notify(
          'Nouveau numéro : vous gagnerez des points dès le règlement de cette commande !',
          'info',
        );
      }
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Erreur vérification fidélité.',
        'error',
      );
    } finally {
      setCheckingLoyalty(false);
    }
  };

  const handleCheckout = async () => {
    if (!token || !data || cart.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      if (!checkoutKeyRef.current) {
        refreshCheckoutKey();
      }
      const itemEntries = cart.filter((c) => c.kind === 'ITEM' && c.item);
      const comboEntries = cart.filter((c) => c.kind === 'COMBO' && c.combo);
      const res = await apiFetch<{ order: { id: string } }>(
        `/api/public/qr/${encodeURIComponent(token)}/orders`,
        {
          method: 'POST',
          body: JSON.stringify({
            sessionId: data.sessionId,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim() || undefined,
            promoCode: promoCode.trim() || undefined,
            loyaltyPointsToUse: redeemablePts > 0 ? redeemablePts : undefined,
            notes: orderNotes.trim(),
            idempotencyKey: checkoutKeyRef.current,
            items: itemEntries.map((c) => ({
              menuItemId: c.item!.id,
              optionIds: c.optionIds,
              quantity: c.quantity,
              notes: c.notes,
            })),
            combos: comboEntries.map((c) => ({
              comboId: c.combo!.id,
              quantity: c.quantity,
              notes: c.notes,
            })),
          }),
        },
      );
      saveStoredOrderId(token, res.order.id);
      setCart([]);
      setOrderNotes('');
      setPromoCode('');
      setUseLoyaltyPoints(false);
      setCartOpen(false);
      refreshCheckoutKey();
      navigate(`/q/${encodeURIComponent(token)}/suivi/${res.order.id}`);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t('customer.orderSendError'),
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--rm-canvas)] flex items-center justify-center p-6">
        <p className="text-sm text-[var(--rm-ink-muted)]">
          {t('customer.verifyingTable')}
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[var(--rm-canvas)] flex items-center justify-center p-6">
        <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-7 text-center space-y-3">
          <UtensilsCrossed className="w-8 h-8 text-[#E05252] mx-auto" />
          <h1 className="text-lg font-bold text-[var(--rm-ink)]">
            {t('customer.qrUnavailable')}
          </h1>
          <p className="text-sm text-[var(--rm-ink-muted)]">{error}</p>
        </div>
      </div>
    );
  }

  const query = searchQuery.trim().toLowerCase();
  const visibleItems = data.items.filter((it) => {
    const matchesCat = activeCat === 'ALL' || it.categoryId === activeCat;
    const matchesQuery =
      !query ||
      it.name.toLowerCase().includes(query) ||
      it.description.toLowerCase().includes(query);
    return matchesCat && matchesQuery;
  });

  const activeRecentOrder =
    recentOrders.find((o) => o.status !== 'PAID') || recentOrders[0];

  return (
    <div className="min-h-screen bg-[var(--rm-canvas)] text-[var(--rm-ink)] pb-24 transition-colors">
      {/* Compact Sticky Top Header */}
      <header className="sticky top-0 z-30 bg-[#182333] dark:bg-[#0F172A] border-b border-white/10 text-white px-4 py-3.5 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-extrabold truncate">
              {data.restaurant.name}
            </h1>
            <p className="text-xs text-slate-300 truncate">
              {data.table.label} · {data.table.zone}
              {data.restaurant.openingHours
                ? ` · ${data.restaurant.openingHours}`
                : ''}
              {data.ratingSummary && data.ratingSummary.total > 0
                ? ` · ★ ${data.ratingSummary.avgRating.toFixed(1)} (${data.ratingSummary.total} avis)`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              data-testid="qr-theme-toggle"
              aria-label={
                theme === 'dark'
                  ? t('header.enableLightMode')
                  : t('header.enableDarkMode')
              }
              className="p-2 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-[#FF8738]" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <LanguageSwitcher variant="dark" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-4 space-y-5">
        {/* Table Service Quick Buttons: Appeler serveur, Demander l'addition & Noter le service */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            disabled={callingType !== null}
            onClick={() => handleCallService('WAITER')}
            data-testid="qr-call-waiter-btn"
            className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] hover:border-[#FF8738] text-xs font-bold text-[var(--rm-ink)] flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
          >
            <BellRing className="w-4 h-4 text-[#FF8738] shrink-0" />
            <span>Appeler le serveur</span>
          </button>
          <button
            type="button"
            disabled={callingType !== null}
            onClick={() => handleCallService('BILL')}
            data-testid="qr-request-bill-btn"
            className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] hover:border-[#14B8A6] text-xs font-bold text-[var(--rm-ink)] flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
          >
            <Receipt className="w-4 h-4 text-[#14B8A6] shrink-0" />
            <span>Demander l’addition</span>
          </button>
          <button
            type="button"
            onClick={() => setShowServiceRating(true)}
            data-testid="qr-rate-service-btn"
            className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] hover:border-[#FF8738] text-xs font-bold text-[var(--rm-ink)] flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Star className="w-4 h-4 text-[#FF8738] fill-[#FF8738] shrink-0" />
            <span>Noter le service</span>
          </button>
        </div>

        {/* Active table order tracking shortcut */}
        {activeRecentOrder && token && (
          <Link
            to={`/q/${encodeURIComponent(token)}/suivi/${encodeURIComponent(activeRecentOrder.id)}`}
            className="flex items-center justify-between gap-3 bg-[var(--rm-surface)] rounded-2xl border border-[#14B8A6]/40 p-4 hover:border-[#14B8A6] transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#14B8A6]/10 text-[#14B8A6] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--rm-ink)] truncate">
                  {t('customer.trackingLinkTitle', {
                    orderNumber: activeRecentOrder.orderNumber,
                  })}
                  <span className="text-[#FF8738]">
                    {getDeliveryStatusLabel(activeRecentOrder.status)}
                  </span>
                </p>
                <p className="text-[11px] text-[var(--rm-ink-muted)]">
                  {t('customer.trackingLinkDesc', {
                    amount: formatFcfa(activeRecentOrder.totalXof),
                  })}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[var(--rm-ink)] shrink-0" />
          </Link>
        )}

        {/* Combos / Formules & Menus du jour */}
        {data.combos && data.combos.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FF8738]" />
              <h2 className="text-sm font-extrabold text-[var(--rm-ink)]">
                Formules & Menus du jour
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.combos.map((cmb) => (
                <div
                  key={cmb.id}
                  data-testid={`qr-combo-card-${cmb.id}`}
                  className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--rm-ink)] truncate">
                        {cmb.name}
                      </h3>
                      {cmb.isDailySpecial && (
                        <span className="text-[10px] font-bold uppercase text-[#FF8738]">
                          Menu du jour
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--rm-ink-muted)] mt-0.5 line-clamp-2">
                      {cmb.items.map((ci) => `${ci.quantity}× ${ci.label}`).join(' + ')}
                    </p>
                    <p className="text-sm font-extrabold text-[#14B8A6] tabular-nums mt-1.5">
                      {formatFcfa(cmb.priceXof)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addComboToCart(cmb)}
                    className="min-h-[40px] px-3.5 rounded-xl bg-[#182333] dark:bg-[#FF8738] text-white text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Ajouter
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Search + Category Scroller */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--rm-ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              placeholder={t('customer.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] text-xs text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] focus:outline-none focus:ring-2 focus:ring-[#FF8738]"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCat('ALL')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                activeCat === 'ALL'
                  ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                  : 'bg-[var(--rm-surface)] border border-[var(--rm-border)] text-[var(--rm-ink-muted)]'
              }`}
            >
              {t('customer.allMenuCount', { count: data.items.length })}
            </button>
            {data.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCat === c.id
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                    : 'bg-[var(--rm-surface)] border border-[var(--rm-border)] text-[var(--rm-ink-muted)]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Grid */}
        {visibleItems.length === 0 ? (
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-8 text-center space-y-2">
            <UtensilsCrossed className="w-7 h-7 text-[var(--rm-ink-muted)] mx-auto" />
            <p className="text-sm font-bold text-[var(--rm-ink)]">
              {t('customer.emptyCategoryTitle')}
            </p>
            <p className="text-xs text-[var(--rm-ink-muted)]">
              {data.items.length === 0
                ? t('customer.emptyMenuPublished')
                : t('customer.emptyMenuFilter')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleItems.map((it) => {
              const effPrice = Number(it.effectivePriceXof ?? it.priceXof);
              const hasPromo = effPrice < it.priceXof;
              const customizable = hasCustomizations(it);
              return (
                <div
                  key={it.id}
                  className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] overflow-hidden flex flex-col justify-between"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openItemModal(it)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openItemModal(it);
                      }
                    }}
                    className="text-left cursor-pointer"
                  >
                    <div className="h-44 w-full bg-[#182333] overflow-hidden">
                      <ResilientImage
                        src={it.imageUrl}
                        alt={it.name}
                        className="w-full h-full object-cover"
                        fallbackTitle={it.name}
                      />
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-base font-bold text-[var(--rm-ink)]">
                          {it.name}
                        </h2>
                        <span className="text-[11px] font-semibold text-[var(--rm-ink-muted)] shrink-0">
                          {it.station === 'BAR'
                            ? t('common.bar')
                            : t('common.kitchen')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--rm-ink-muted)] leading-relaxed">
                        {it.description}
                      </p>
                      {it.promoLabel && (
                        <p className="mt-1.5 text-[11px] font-bold text-[#14B8A6]">
                          {it.promoLabel}
                        </p>
                      )}
                      {customizable && (
                        <p className="mt-1.5 text-[11px] font-semibold text-[#FF8738]">
                          Variantes, cuissons ou suppléments disponibles
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="px-4 pb-4 pt-2 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-extrabold text-[var(--rm-ink)] tabular-nums">
                        {formatFcfa(effPrice)}
                      </span>
                      {hasPromo && (
                        <span className="text-xs line-through text-[var(--rm-ink-muted)] tabular-nums">
                          {formatFcfa(it.priceXof)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (customizable) {
                          openItemModal(it);
                        } else {
                          addItemToCart(it, [], '');
                        }
                      }}
                      className="min-h-[44px] px-4 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
                    >
                      {customizable ? t('common.choose') : t('common.add')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Sticky Cart Bar */}
      {totalCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-3 bg-[var(--rm-surface)]/95 backdrop-blur-md border-t border-[var(--rm-border)]">
          <div className="max-w-4xl mx-auto">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="w-full h-12 rounded-xl bg-[#182333] dark:bg-[#FF8738] text-white px-5 flex items-center justify-between text-sm font-bold cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#FF8738] dark:text-white" />
                <span>{t('customer.viewCart', { count: totalCount })}</span>
              </span>
              <span className="tabular-nums">{formatFcfa(estimatedTotalXof)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Item Options, OptionGroups & Note Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="bg-[var(--rm-surface)] border border-[var(--rm-border)] rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--rm-ink)]">
                  {selectedItem.name}
                </h3>
                <p className="text-sm font-bold text-[#FF8738] tabular-nums">
                  {formatFcfa(
                    Number(
                      selectedItem.effectivePriceXof ?? selectedItem.priceXof,
                    ) + selectedOptsDelta,
                  )}
                </p>
              </div>
              <button
                type="button"
                aria-label={t('common.close')}
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-lg text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedItem.description && (
              <p className="text-xs text-[var(--rm-ink-muted)] leading-relaxed">
                {selectedItem.description}
              </p>
            )}

            {/* Structured Option Groups */}
            {(selectedItem.optionGroups || []).map((grp) => (
              <div key={grp.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[var(--rm-ink)]">
                    {grp.name}
                  </p>
                  <span className="text-[11px] font-semibold text-[var(--rm-ink-muted)]">
                    {grp.required ? 'Obligatoire' : 'Facultatif'} ·{' '}
                    {grp.multiple ? 'Choix multiple' : '1 choix'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {grp.choices.map((ch) => {
                    const checked = chosenOpts.includes(ch.id);
                    return (
                      <label
                        key={ch.id}
                        className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer ${
                          checked
                            ? 'border-[#FF8738] bg-[#FF8738]/8'
                            : 'border-[var(--rm-border)]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type={grp.multiple ? 'checkbox' : 'radio'}
                            name={`grp_${grp.id}`}
                            checked={checked}
                            onChange={(e) => {
                              if (grp.multiple) {
                                setChosenOpts((prev) =>
                                  e.target.checked
                                    ? [...prev, ch.id]
                                    : prev.filter((x) => x !== ch.id),
                                );
                              } else {
                                const groupChoiceIds = new Set(
                                  grp.choices.map((x) => x.id),
                                );
                                setChosenOpts((prev) => [
                                  ...prev.filter((x) => !groupChoiceIds.has(x)),
                                  ch.id,
                                ]);
                              }
                            }}
                          />
                          <span className="font-medium text-[var(--rm-ink)]">
                            {ch.label}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums text-[var(--rm-ink-muted)]">
                          {ch.priceDeltaXof > 0
                            ? `+${formatFcfa(ch.priceDeltaXof)}`
                            : t('common.included')}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Legacy Flat Options */}
            {selectedItem.options.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--rm-ink)]">
                  {t('customer.optionsAndExtras')}
                </p>
                {selectedItem.options.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-[var(--rm-border)] text-xs cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={chosenOpts.includes(opt.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChosenOpts((p) => [...p, opt.id]);
                          } else {
                            setChosenOpts((p) =>
                              p.filter((x) => x !== opt.id),
                            );
                          }
                        }}
                      />
                      <span className="font-medium text-[var(--rm-ink)]">
                        {opt.label}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-[var(--rm-ink-muted)]">
                      {opt.priceDeltaXof > 0
                        ? `+${formatFcfa(opt.priceDeltaXof)}`
                        : t('common.included')}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <input
              type="text"
              placeholder={t('customer.specialInstructionPlaceholder')}
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
            />

            <button
              type="button"
              onClick={() => addItemToCart(selectedItem, chosenOpts, itemNote)}
              className="w-full h-12 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-sm font-bold cursor-pointer tabular-nums"
            >
              {t('customer.addToCartBtn', {
                amount: formatFcfa(
                  Number(
                    selectedItem.effectivePriceXof ?? selectedItem.priceXof,
                  ) + selectedOptsDelta,
                ),
              })}
            </button>
          </div>
        </div>
      )}

      {/* Cart Checkout Bottom Sheet */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="bg-[var(--rm-surface)] border border-[var(--rm-border)] rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[var(--rm-ink)]">
                {t('customer.yourOrderTitle', { table: data.table.label })}
              </h3>
              <button
                type="button"
                aria-label={t('common.close')}
                onClick={() => setCartOpen(false)}
                className="p-1.5 rounded-lg text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-[var(--rm-border-subtle)]">
              {cart.map((c) => (
                <div
                  key={c.key}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--rm-ink)]">
                      {c.kind === 'COMBO' ? `Formule · ${c.combo?.name}` : c.item?.name}
                    </p>
                    {c.optionsLabel && (
                      <p className="text-xs text-[var(--rm-ink-muted)]">
                        {c.optionsLabel}
                      </p>
                    )}
                    {c.notes && (
                      <p className="text-[11px] text-[var(--rm-ink-muted)] italic">
                        {t('common.note')} : {c.notes}
                      </p>
                    )}
                    <p className="text-xs font-bold text-[#FF8738] tabular-nums mt-0.5">
                      {formatFcfa((c.unitPriceXof + c.optionsDelta) * c.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label={t('customer.decreaseQty')}
                      onClick={() => updateCartQty(c.key, -1)}
                      className="w-9 h-9 rounded-lg border border-[var(--rm-border)] text-[var(--rm-ink)] flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold text-[var(--rm-ink)] tabular-nums">
                      {c.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={t('customer.increaseQty')}
                      onClick={() => updateCartQty(c.key, 1)}
                      className="w-9 h-9 rounded-lg border border-[var(--rm-border)] text-[var(--rm-ink)] flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      onClick={() => removeCartEntry(c.key)}
                      className="w-8 h-9 rounded-lg text-[var(--rm-ink-muted)] hover:text-[#E05252] flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2.5 pt-2">
              <input
                type="text"
                placeholder={t('customer.firstNamePlaceholder')}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
              />

              {data.restaurant.loyaltyEnabled !== false && (
                <div className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--rm-ink)]">
                    <Gift className="w-3.5 h-3.5 text-[#14B8A6]" />
                    <span>Programme de fidélité</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="Téléphone (cumul / échange pts)"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value);
                        setLoyaltyBalance(null);
                        setUseLoyaltyPoints(false);
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-[var(--rm-ink)]"
                    />
                    <button
                      type="button"
                      disabled={checkingLoyalty}
                      onClick={handleLookupLoyalty}
                      className="px-3 py-2 rounded-lg bg-[#182333] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {checkingLoyalty ? '…' : 'Vérifier'}
                    </button>
                  </div>
                  {loyaltyBalance && loyaltyBalance.points > 0 && (
                    <label className="flex items-center justify-between text-xs pt-1 cursor-pointer">
                      <span className="text-[var(--rm-ink)]">
                        Utiliser {loyaltyBalance.points} pts (-
                        {formatFcfa(
                          loyaltyBalance.points * loyaltyBalance.xofPerPoint,
                        )}
                        )
                      </span>
                      <input
                        type="checkbox"
                        checked={useLoyaltyPoints}
                        onChange={(e) => setUseLoyaltyPoints(e.target.checked)}
                      />
                    </label>
                  )}
                </div>
              )}

              <div className="relative">
                <Tag className="w-3.5 h-3.5 text-[var(--rm-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Code promo (ex: BIENVENUE10)"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs font-mono"
                />
              </div>

              <textarea
                rows={2}
                placeholder={t('customer.kitchenCommentPlaceholder')}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
              />
            </div>

            <div className="pt-2 border-t border-[var(--rm-border)] space-y-1">
              {loyaltyDiscountPreview > 0 && (
                <div className="flex items-center justify-between text-xs text-[#14B8A6] font-semibold">
                  <span>Remise fidélité ({redeemablePts} pts)</span>
                  <span className="tabular-nums">
                    -{formatFcfa(loyaltyDiscountPreview)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-base font-extrabold text-[var(--rm-ink)]">
                <span>{t('customer.totalToPay')}</span>
                <span className="tabular-nums">{formatFcfa(estimatedTotalXof)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleCheckout}
              className="w-full h-12 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-sm font-bold cursor-pointer disabled:opacity-60"
            >
              {submitting
                ? t('customer.sendingToKitchen')
                : t('customer.confirmOrderBtn')}
            </button>
          </div>
        </div>
      )}

      {showServiceRating && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--rm-ink)] flex items-center gap-2">
                  <Star className="w-4 h-4 text-[#FF8738] fill-[#FF8738]" />
                  <span>Noter le service & laisser un avis</span>
                </h3>
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  {data.restaurant.name} · {data.table.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowServiceRating(false)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ServiceRatingForm
              waiters={data.waiters || []}
              askCustomerName
              submitting={submittingRating}
              submitLabel="Envoyer mon évaluation"
              testIdPrefix="qr-service"
              onSubmit={handleSubmitServiceRating}
            />
          </div>
        </div>
      )}
    </div>
  );
}
