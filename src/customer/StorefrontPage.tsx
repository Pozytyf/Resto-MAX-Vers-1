import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Clock,
  CreditCard,
  Gift,
  MapPin,
  Minus,
  Moon,
  Plus,
  Search,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Sun,
  Tag,
  Trash2,
  Truck,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useRestaurantTheme } from '../app/hooks/useRestaurantTheme';
import { apiFetch } from '../services/api';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { ResilientImage } from '../components/ResilientImage';
import { useToast } from '../components/Toast';
import { formatFcfa } from '../utils/format';
import { ServiceRatingForm, type ServiceRatingPayload } from './ServiceRatingForm';
import type {
  DeliveryZone,
  MenuCategory,
  MenuCombo,
  MenuOption,
  MenuOptionGroup,
} from '../types';

interface StorefrontMenuItem {
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

interface StorefrontPayload {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    city: string;
    address: string;
    phone: string;
    currency: string;
    taxRatePercent: number;
    openingHours: string;
    storefrontEnabled: boolean;
    deliveryEnabled: boolean;
    deliveryZones: DeliveryZone[];
    pickupSlots: string[];
    loyaltyEnabled: boolean;
    loyaltyPointsPer1000Xof: number;
    loyaltyXofPerPoint: number;
  };
  ratingSummary?: {
    total: number;
    avgRating: number;
    avgServiceRating: number;
  };
  categories: MenuCategory[];
  items: StorefrontMenuItem[];
  combos: MenuCombo[];
}

interface CartEntry {
  key: string;
  kind: 'ITEM' | 'COMBO';
  item?: StorefrontMenuItem;
  combo?: MenuCombo;
  unitPriceXof: number;
  optionIds: string[];
  optionsLabel: string;
  optionsDelta: number;
  quantity: number;
  notes: string;
}

export function StorefrontPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useRestaurantTheme();
  const { notify } = useToast();

  const [data, setData] = useState<StorefrontPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orderType, setOrderType] = useState<'CLICK_COLLECT' | 'DELIVERY'>('CLICK_COLLECT');
  const [activeCat, setActiveCat] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [selectedItem, setSelectedItem] = useState<StorefrontMenuItem | null>(null);
  const [chosenOpts, setChosenOpts] = useState<string[]>([]);
  const [itemNote, setItemNote] = useState('');

  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [scheduledSlot, setScheduledSlot] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  const [loyaltyBalance, setLoyaltyBalance] = useState<{
    points: number;
    xofPerPoint: number;
  } | null>(null);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [checkingLoyalty, setCheckingLoyalty] = useState(false);

  const [payNow, setPayNow] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<
    'WAVE' | 'ORANGE_MONEY' | 'MTN_MOMO' | 'CARD'
  >('WAVE');
  const [submitting, setSubmitting] = useState(false);
  const [showServiceRating, setShowServiceRating] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);
  const checkoutKeyRef = useRef(
    `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    apiFetch<StorefrontPayload>(`/api/public/store/${encodeURIComponent(slug)}`)
      .then((res) => {
        setData(res);
        setScheduledSlot(res.restaurant.pickupSlots[0] || 'Dès que possible (20 min)');
        setSelectedZoneId(res.restaurant.deliveryZones[0]?.id || '');
        setError(null);
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Boutique en ligne indisponible.',
        );
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSubmitServiceRating = async (payload: ServiceRatingPayload) => {
    if (!slug || submittingRating) return;
    setSubmittingRating(true);
    try {
      const res = await apiFetch<{
        ratingSummary: { total: number; avgRating: number; avgServiceRating: number };
      }>(`/api/public/store/${encodeURIComponent(slug)}/service-rating`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setData((prev) =>
        prev ? { ...prev, ratingSummary: res.ratingSummary } : prev,
      );
      setShowServiceRating(false);
      notify('Merci ! Votre avis a bien été enregistré.', 'success');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Impossible d’enregistrer votre avis.',
        'error',
      );
    } finally {
      setSubmittingRating(false);
    }
  };

  const computeOptionsSummaryAndDelta = (
    item: StorefrontMenuItem,
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

  const hasCustomizations = (it: StorefrontMenuItem) =>
    (it.optionGroups && it.optionGroups.length > 0) || it.options.length > 0;

  const openItemModal = (it: StorefrontMenuItem) => {
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
    item: StorefrontMenuItem,
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
    setSelectedItem(null);
    setChosenOpts([]);
    setItemNote('');
    notify(`${item.name} ajouté au panier.`, 'success');
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
    notify(`Formule « ${combo.name} » ajoutée au panier.`, 'success');
  };

  const selectedZone = useMemo(
    () =>
      data?.restaurant.deliveryZones.find((z) => z.id === selectedZoneId) ||
      null,
    [data, selectedZoneId],
  );

  const selectedOptsDelta = useMemo(() => {
    if (!selectedItem) return 0;
    return computeOptionsSummaryAndDelta(selectedItem, chosenOpts).delta;
  }, [selectedItem, chosenOpts]);

  const totalCount = cart.reduce((a, c) => a + c.quantity, 0);
  const grossFoodXof = cart.reduce(
    (a, c) => a + (c.unitPriceXof + c.optionsDelta) * c.quantity,
    0,
  );
  const deliveryFeeXof =
    orderType === 'DELIVERY' ? Number(selectedZone?.feeXof || 0) : 0;
  const redeemablePts =
    useLoyaltyPoints && loyaltyBalance && loyaltyBalance.points > 0
      ? Math.min(
          loyaltyBalance.points,
          Math.floor(grossFoodXof / Math.max(1, loyaltyBalance.xofPerPoint)),
        )
      : 0;
  const loyaltyDiscountPreview =
    redeemablePts * (loyaltyBalance?.xofPerPoint || 25);
  const estimatedTotalXof =
    Math.max(0, grossFoodXof - loyaltyDiscountPreview) + deliveryFeeXof;

  const handleLookupLoyalty = async () => {
    if (!slug || customerPhone.trim().length < 6) {
      notify('Entrez votre numéro de téléphone (6 chiffres min.).', 'error');
      return;
    }
    setCheckingLoyalty(true);
    try {
      const res = await apiFetch<{
        xofPerPoint: number;
        customer: { loyaltyPoints: number } | null;
      }>(
        `/api/public/store/${encodeURIComponent(slug)}/loyalty?phone=${encodeURIComponent(
          customerPhone.trim(),
        )}`,
      );
      setLoyaltyBalance({
        points: res.customer?.loyaltyPoints || 0,
        xofPerPoint: res.xofPerPoint,
      });
      notify(
        res.customer
          ? `${res.customer.loyaltyPoints} pts disponibles !`
          : 'Nouveau numéro : cumul automatique après paiement.',
        'info',
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur fidélité.', 'error');
    } finally {
      setCheckingLoyalty(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !data || cart.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const itemEntries = cart.filter((c) => c.kind === 'ITEM' && c.item);
      const comboEntries = cart.filter((c) => c.kind === 'COMBO' && c.combo);
      const res = await apiFetch<{ order: { id: string } }>(
        `/api/public/store/${encodeURIComponent(slug)}/orders`,
        {
          method: 'POST',
          body: JSON.stringify({
            orderType,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            scheduledSlot: orderType === 'CLICK_COLLECT' ? scheduledSlot : undefined,
            deliveryZoneId: orderType === 'DELIVERY' ? selectedZoneId : undefined,
            deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress.trim() : undefined,
            promoCode: promoCode.trim() || undefined,
            loyaltyPointsToUse: redeemablePts > 0 ? redeemablePts : undefined,
            notes: orderNotes.trim(),
            payNow,
            paymentMethod: payNow ? paymentMethod : undefined,
            paymentPhone: payNow ? customerPhone.trim() : undefined,
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
      setCart([]);
      setCartOpen(false);
      navigate(`/c/${encodeURIComponent(slug)}/suivi/${res.order.id}`);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Impossible d’envoyer la commande.',
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--rm-canvas)] flex items-center justify-center p-6 text-sm text-[var(--rm-ink-muted)]">
        Chargement de la vitrine…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[var(--rm-canvas)] flex items-center justify-center p-6">
        <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-7 text-center space-y-3">
          <UtensilsCrossed className="w-8 h-8 text-[#E05252] mx-auto" />
          <h1 className="text-lg font-bold text-[var(--rm-ink)]">
            Vitrine indisponible
          </h1>
          <p className="text-sm text-[var(--rm-ink-muted)]">{error}</p>
          <Link
            to="/"
            className="inline-flex px-4 py-2 rounded-xl bg-[#182333] text-white text-xs font-semibold"
          >
            Retour à l’accueil
          </Link>
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

  return (
    <div className="min-h-screen bg-[var(--rm-canvas)] text-[var(--rm-ink)] pb-24 transition-colors">
      <header className="sticky top-0 z-30 bg-[#182333] dark:bg-[#0F172A] border-b border-white/10 text-white px-4 py-3.5 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-extrabold truncate">
              {data.restaurant.name}
            </h1>
            <p className="text-xs text-slate-300 truncate flex items-center gap-2">
              <MapPin className="w-3 h-3 text-[#FF8738] shrink-0" />
              <span>
                {data.restaurant.address || data.restaurant.city} ·{' '}
                {data.restaurant.openingHours}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer"
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

      <div className="max-w-5xl mx-auto px-4 pt-5 space-y-5">
        {/* Channel Selector: Click & Collect vs Delivery */}
        <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOrderType('CLICK_COLLECT')}
              data-testid="channel-click-collect-btn"
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                orderType === 'CLICK_COLLECT'
                  ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                  : 'bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)]'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>Click & Collect (À emporter)</span>
            </button>
            {data.restaurant.deliveryEnabled && (
              <button
                type="button"
                onClick={() => setOrderType('DELIVERY')}
                data-testid="channel-delivery-btn"
                className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  orderType === 'DELIVERY'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                    : 'bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)]'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>Livraison</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-[var(--rm-ink-muted)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#14B8A6]" />
              {orderType === 'CLICK_COLLECT' ? (
                <span>Retrait express sur créneau horaire</span>
              ) : (
                <span>
                  Livraison dès{' '}
                  {selectedZone ? formatFcfa(selectedZone.feeXof) : '—'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowServiceRating(true)}
              data-testid="storefront-rate-service-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--rm-border)] hover:border-[#FF8738] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
            >
              <Star className="w-3.5 h-3.5 text-[#FF8738] fill-[#FF8738]" />
              <span>
                {data.ratingSummary && data.ratingSummary.total > 0
                  ? `★ ${data.ratingSummary.avgRating.toFixed(1)} (${data.ratingSummary.total}) · Noter`
                  : 'Noter le service'}
              </span>
            </button>
          </div>
        </div>

        {/* Formules / Combos */}
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
                  className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[var(--rm-ink)] truncate">
                      {cmb.name}
                    </h3>
                    <p className="text-[11px] text-[var(--rm-ink-muted)] mt-0.5">
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

        {/* Search + Categories */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--rm-ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              placeholder="Rechercher un plat, une boisson…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] text-xs text-[var(--rm-ink)]"
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
              Toute la carte ({data.items.length})
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

        {/* Catalog Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  className="cursor-pointer"
                >
                  <div className="h-40 w-full bg-[#182333] overflow-hidden">
                    <ResilientImage
                      src={it.imageUrl}
                      alt={it.name}
                      className="w-full h-full object-cover"
                      fallbackTitle={it.name}
                    />
                  </div>
                  <div className="p-4">
                    <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                      {it.name}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--rm-ink-muted)] line-clamp-2">
                      {it.description}
                    </p>
                    {it.promoLabel && (
                      <p className="mt-1.5 text-[11px] font-bold text-[#14B8A6]">
                        {it.promoLabel}
                      </p>
                    )}
                  </div>
                </div>
                <div className="px-4 pb-4 pt-1 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-extrabold text-[var(--rm-ink)] tabular-nums">
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
                      if (customizable) openItemModal(it);
                      else addItemToCart(it, [], '');
                    }}
                    className="min-h-[38px] px-3.5 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
                  >
                    {customizable ? 'Choisir' : 'Ajouter'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {totalCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-3 bg-[var(--rm-surface)]/95 backdrop-blur-md border-t border-[var(--rm-border)]">
          <div className="max-w-5xl mx-auto">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              data-testid="storefront-open-cart-btn"
              className="w-full h-12 rounded-xl bg-[#182333] dark:bg-[#FF8738] text-white px-5 flex items-center justify-between text-sm font-bold cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#FF8738] dark:text-white" />
                <span>Voir mon panier ({totalCount})</span>
              </span>
              <span className="tabular-nums">{formatFcfa(estimatedTotalXof)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Item Variant / Supplement Modal */}
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
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-lg text-[var(--rm-ink-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(selectedItem.optionGroups || []).map((grp) => (
              <div key={grp.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[var(--rm-ink)]">
                    {grp.name}
                  </p>
                  <span className="text-[11px] text-[var(--rm-ink-muted)]">
                    {grp.required ? 'Obligatoire' : 'Facultatif'}
                  </span>
                </div>
                {grp.choices.map((ch) => {
                  const checked = chosenOpts.includes(ch.id);
                  return (
                    <label
                      key={ch.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-[var(--rm-border)] text-xs cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type={grp.multiple ? 'checkbox' : 'radio'}
                          name={`sf_grp_${grp.id}`}
                          checked={checked}
                          onChange={(e) => {
                            if (grp.multiple) {
                              setChosenOpts((prev) =>
                                e.target.checked
                                  ? [...prev, ch.id]
                                  : prev.filter((x) => x !== ch.id),
                              );
                            } else {
                              const ids = new Set(grp.choices.map((x) => x.id));
                              setChosenOpts((prev) => [
                                ...prev.filter((x) => !ids.has(x)),
                                ch.id,
                              ]);
                            }
                          }}
                        />
                        <span>{ch.label}</span>
                      </span>
                      <span className="tabular-nums text-[var(--rm-ink-muted)]">
                        {ch.priceDeltaXof > 0
                          ? `+${formatFcfa(ch.priceDeltaXof)}`
                          : 'Inclus'}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}

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
                      if (e.target.checked) setChosenOpts((p) => [...p, opt.id]);
                      else setChosenOpts((p) => p.filter((x) => x !== opt.id));
                    }}
                  />
                  <span>{opt.label}</span>
                </span>
                <span className="tabular-nums text-[var(--rm-ink-muted)]">
                  {opt.priceDeltaXof > 0
                    ? `+${formatFcfa(opt.priceDeltaXof)}`
                    : 'Inclus'}
                </span>
              </label>
            ))}

            <input
              type="text"
              placeholder="Précision (ex: sans oignons, bien cuit)…"
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
            />

            <button
              type="button"
              onClick={() => addItemToCart(selectedItem, chosenOpts, itemNote)}
              className="w-full h-11 rounded-xl bg-[#FF8738] text-white text-sm font-bold cursor-pointer tabular-nums"
            >
              Ajouter au panier (
              {formatFcfa(
                Number(
                  selectedItem.effectivePriceXof ?? selectedItem.priceXof,
                ) + selectedOptsDelta,
              )}
              )
            </button>
          </div>
        </div>
      )}

      {/* Checkout Drawer */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setCartOpen(false)}
        >
          <form
            onSubmit={handleSubmitOrder}
            className="bg-[var(--rm-surface)] border border-[var(--rm-border)] rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--rm-ink)]">
                Finaliser ma commande ({orderType === 'DELIVERY' ? 'Livraison' : 'Click & Collect'})
              </h3>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="p-1.5 rounded-lg text-[var(--rm-ink-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-[var(--rm-border-subtle)]">
              {cart.map((c) => (
                <div
                  key={c.key}
                  className="py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--rm-ink)]">
                      {c.kind === 'COMBO' ? `Formule · ${c.combo?.name}` : c.item?.name}
                    </p>
                    {c.optionsLabel && (
                      <p className="text-[var(--rm-ink-muted)]">{c.optionsLabel}</p>
                    )}
                    <p className="font-bold text-[#FF8738] tabular-nums">
                      {formatFcfa((c.unitPriceXof + c.optionsDelta) * c.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) =>
                          prev
                            .map((x) =>
                              x.key === c.key
                                ? { ...x, quantity: x.quantity - 1 }
                                : x,
                            )
                            .filter((x) => x.quantity > 0),
                        )
                      }
                      className="w-8 h-8 rounded-lg border border-[var(--rm-border)] flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center font-bold tabular-nums">
                      {c.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) =>
                          prev.map((x) =>
                            x.key === c.key
                              ? { ...x, quantity: x.quantity + 1 }
                              : x,
                          ),
                        )
                      }
                      className="w-8 h-8 rounded-lg border border-[var(--rm-border)] flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) => prev.filter((x) => x.key !== c.key))
                      }
                      className="w-7 h-8 text-[var(--rm-ink-muted)] hover:text-[#E05252] flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                placeholder="Nom complet *"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
              />
              <input
                type="tel"
                required
                placeholder="Téléphone * (ex. 0700000000)"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  setLoyaltyBalance(null);
                  setUseLoyaltyPoints(false);
                }}
                className="px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
              />
            </div>

            {orderType === 'CLICK_COLLECT' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--rm-ink)]">
                  Créneau de retrait
                </label>
                <select
                  value={scheduledSlot}
                  onChange={(e) => setScheduledSlot(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                >
                  {data.restaurant.pickupSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.restaurant.deliveryZones.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--rm-ink)]">
                      Zone de livraison
                    </label>
                    <select
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                    >
                      {data.restaurant.deliveryZones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} (+{formatFcfa(z.feeXof)} · min {formatFcfa(z.minOrderXof)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <input
                  type="text"
                  required
                  placeholder="Adresse précise / repère de livraison *"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                />
              </div>
            )}

            {/* Loyalty + Promo Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="relative">
                <Tag className="w-3.5 h-3.5 text-[var(--rm-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Code promo"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs font-mono"
                />
              </div>
              {data.restaurant.loyaltyEnabled && (
                <button
                  type="button"
                  disabled={checkingLoyalty}
                  onClick={handleLookupLoyalty}
                  className="px-3 py-2 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Gift className="w-3.5 h-3.5 text-[#14B8A6]" />
                  <span>
                    {checkingLoyalty ? 'Vérification…' : 'Vérifier mes points'}
                  </span>
                </button>
              )}
            </div>

            {loyaltyBalance && loyaltyBalance.points > 0 && (
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#14B8A6]/10 border border-[#14B8A6]/30 text-xs cursor-pointer">
                <span className="font-semibold text-[var(--rm-ink)]">
                  Utiliser {loyaltyBalance.points} pts (-
                  {formatFcfa(loyaltyBalance.points * loyaltyBalance.xofPerPoint)})
                </span>
                <input
                  type="checkbox"
                  checked={useLoyaltyPoints}
                  onChange={(e) => setUseLoyaltyPoints(e.target.checked)}
                />
              </label>
            )}

            <textarea
              rows={2}
              placeholder="Instructions (interphone, allergies, couverts…)"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
            />

            {/* Pre-Payment Before Preparation */}
            <div className="rounded-xl border border-[var(--rm-border)] p-3.5 space-y-3 bg-[var(--rm-surface-muted)]">
              <label className="flex items-center justify-between text-xs font-bold cursor-pointer">
                <span>Régler en ligne avant préparation</span>
                <input
                  type="checkbox"
                  checked={payNow}
                  onChange={(e) => setPayNow(e.target.checked)}
                />
              </label>
              {payNow && (
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'WAVE', label: 'Wave' },
                      { id: 'ORANGE_MONEY', label: 'Orange Money' },
                      { id: 'MTN_MOMO', label: 'MTN MoMo' },
                      { id: 'CARD', label: 'Carte bancaire' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                        paymentMethod === m.id
                          ? 'border-[#FF8738] bg-[#FF8738]/12 text-[#FF8738]'
                          : 'border-[var(--rm-border)] bg-[var(--rm-surface)]'
                      }`}
                    >
                      {m.id === 'CARD' ? (
                        <CreditCard className="w-3.5 h-3.5" />
                      ) : (
                        <Smartphone className="w-3.5 h-3.5" />
                      )}
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1 pt-2 border-t border-[var(--rm-border)] text-xs">
              {deliveryFeeXof > 0 && (
                <div className="flex justify-between text-[var(--rm-ink-muted)]">
                  <span>Frais de livraison ({selectedZone?.name})</span>
                  <span className="tabular-nums">{formatFcfa(deliveryFeeXof)}</span>
                </div>
              )}
              {loyaltyDiscountPreview > 0 && (
                <div className="flex justify-between text-[#14B8A6] font-semibold">
                  <span>Remise fidélité</span>
                  <span className="tabular-nums">
                    -{formatFcfa(loyaltyDiscountPreview)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-[var(--rm-ink)] pt-1">
                <span>Total à régler</span>
                <span className="tabular-nums">{formatFcfa(estimatedTotalXof)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              data-testid="storefront-submit-order-btn"
              className="w-full h-12 rounded-xl bg-[#FF8738] hover:bg-[#F07322] text-white text-sm font-bold cursor-pointer disabled:opacity-60"
            >
              {submitting
                ? 'Validation en cours…'
                : payNow
                  ? `Payer et commander (${formatFcfa(estimatedTotalXof)})`
                  : `Confirmer la commande (${formatFcfa(estimatedTotalXof)})`}
            </button>
          </form>
        </div>
      )}

      {showServiceRating && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--rm-ink)] flex items-center gap-2">
                  <Star className="w-4 h-4 text-[#FF8738] fill-[#FF8738]" />
                  <span>Noter notre service</span>
                </h3>
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  {data.restaurant.name}
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
              askCustomerName
              submitting={submittingRating}
              submitLabel="Envoyer mon évaluation"
              testIdPrefix="storefront-service"
              onSubmit={handleSubmitServiceRating}
            />
          </div>
        </div>
      )}
    </div>
  );
}
