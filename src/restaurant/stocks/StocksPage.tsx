import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Mail,
  Package,
  Pencil,
  Plus,
  Printer,
  Scale,
  Send,
  Settings2,
  Trash2,
  Truck,
  Wine,
  X,
} from 'lucide-react';
import { RestaurantLayout } from '../RestaurantLayout';
import { useAuth } from '../../app/providers/AuthProvider';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { TableSkeleton } from '../../components/LoadingSkeletons';
import {
  formatDateFr,
  formatDateTimeFr,
  formatFcfa,
  formatTimeFr,
} from '../../utils/format';
import type {
  InventoryCount,
  PurchaseOrder,
  RestaurantNotification,
  StockAlertSettings,
  StockItem,
  StockSection,
} from '../../types';

interface MovementRow {
  id: string;
  stockName: string;
  stockSection?: StockSection;
  stockUnit?: string;
  movementType: string;
  wasteCategory?: string;
  quantityDelta: number;
  reason: string;
  createdAt: string;
}

const STOCK_UNIT_GROUPS: Array<{
  label: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    label: 'Poids',
    options: [
      { value: 'kg', label: 'Kilogramme (kg)' },
      { value: 'g', label: 'Gramme (g)' },
    ],
  },
  {
    label: 'Volume & Liquides',
    options: [
      { value: 'L', label: 'Litre (L)' },
      { value: 'cl', label: 'Centilitre (cl)' },
      { value: 'ml', label: 'Millilitre (ml)' },
    ],
  },
  {
    label: 'Contenants & Bar',
    options: [
      { value: 'bouteille', label: 'Bouteille' },
      { value: 'canette', label: 'Canette' },
      { value: 'fût', label: 'Fût' },
      { value: 'verre', label: 'Verre' },
      { value: 'pack', label: 'Pack' },
      { value: 'carton', label: 'Carton' },
      { value: 'caisse', label: 'Caisse' },
    ],
  },
  {
    label: 'Cuisine & Unités',
    options: [
      { value: 'pièce', label: 'Pièce' },
      { value: 'portion', label: 'Portion' },
      { value: 'boîte', label: 'Boîte' },
      { value: 'sachet', label: 'Sachet' },
      { value: 'botte', label: 'Botte' },
      { value: 'régime', label: 'Régime' },
      { value: 'plateau', label: 'Plateau' },
    ],
  },
];

const ALL_PRESET_UNITS = new Set(
  STOCK_UNIT_GROUPS.flatMap((g) => g.options.map((o) => o.value)),
);

function StockUnitField({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (next: string) => void;
  testId?: string;
}) {
  const isPreset = ALL_PRESET_UNITS.has(value);
  const [customMode, setCustomMode] = useState(!isPreset && value.length > 0);

  useEffect(() => {
    setCustomMode(!ALL_PRESET_UNITS.has(value) && value.length > 0);
  }, [value]);

  return (
    <div className="space-y-1.5">
      <select
        data-testid={testId}
        value={customMode ? '__CUSTOM__' : value}
        onChange={(e) => {
          const picked = e.target.value;
          if (picked === '__CUSTOM__') {
            setCustomMode(true);
            if (ALL_PRESET_UNITS.has(value)) onChange('');
          } else {
            setCustomMode(false);
            onChange(picked);
          }
        }}
        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
      >
        {STOCK_UNIT_GROUPS.map((grp) => (
          <optgroup key={grp.label} label={grp.label}>
            {grp.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="__CUSTOM__">Autre unité personnalisée…</option>
      </select>
      {customMode && (
        <input
          required
          type="text"
          maxLength={24}
          placeholder="Ex: bidon, pot, douzaine..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
        />
      )}
    </div>
  );
}

type StocksTab = 'inventory' | 'counts' | 'purchase-orders';

interface PoDraftLine {
  stockId: string;
  quantity: number;
  unitCostXof: number;
}

export function StocksPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const { can } = useAuth();
  const canWriteStocks = can('stocks:write');

  const [activeTab, setActiveTab] = useState<StocksTab>('inventory');
  const [sectionFilter, setSectionFilter] = useState<'ALL' | StockSection>('ALL');
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertSettings, setAlertSettings] = useState<StockAlertSettings | null>(
    null,
  );
  const [smtpPassInput, setSmtpPassInput] = useState('');
  const [recentAlerts, setRecentAlerts] = useState<RestaurantNotification[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  const [newStock, setNewStock] = useState<{
    name: string;
    unit: string;
    stockSection: StockSection;
    quantity: number;
    minThreshold: number;
    unitCostXof: number;
    supplierName: string;
  }>({
    name: '',
    unit: 'kg',
    stockSection: 'KITCHEN',
    quantity: 10,
    minThreshold: 5,
    unitCostXof: 2000,
    supplierName: '',
  });
  const [editingStock, setEditingStock] = useState<StockItem | null>(null);
  const [editStockForm, setEditStockForm] = useState<{
    name: string;
    unit: string;
    stockSection: StockSection;
    minThreshold: number;
    unitCostXof: number;
    supplierName: string;
  }>({
    name: '',
    unit: 'kg',
    stockSection: 'KITCHEN',
    minThreshold: 5,
    unitCostXof: 2000,
    supplierName: '',
  });
  const [confirmDeleteStockId, setConfirmDeleteStockId] = useState<string | null>(
    null,
  );

  const [moveTarget, setMoveTarget] = useState<StockItem | null>(null);
  const [moveForm, setMoveForm] = useState({
    movementType: 'IN',
    quantity: 5,
    reason: '',
  });

  const [showPoForm, setShowPoForm] = useState(false);
  const [poForm, setPoForm] = useState({
    supplierName: '',
    expectedDate: '',
    notes: '',
    markOrdered: true,
  });
  const [poLines, setPoLines] = useState<PoDraftLine[]>([]);
  const [savingPo, setSavingPo] = useState(false);

  const [inventoryCounts, setInventoryCounts] = useState<InventoryCount[]>([]);
  const [showCountForm, setShowCountForm] = useState(false);
  const [countSection, setCountSection] = useState<'ALL' | StockSection>('ALL');
  const [countHistoryFilter, setCountHistoryFilter] = useState<'ALL' | StockSection>('ALL');
  const [countTitle, setCountTitle] = useState('');
  const [countNotes, setCountNotes] = useState('');
  const [countDraftQty, setCountDraftQty] = useState<Record<string, string>>({});
  const [savingCount, setSavingCount] = useState(false);
  const [expandedCountId, setExpandedCountId] = useState<string | null>(null);

  const [wasteTarget, setWasteTarget] = useState<StockItem | null>(null);
  const [wasteForm, setWasteForm] = useState<{
    wasteCategory: 'EXPIRED' | 'BROKEN' | 'COMPLIMENTARY';
    quantity: number;
    reason: string;
  }>({
    wasteCategory: 'EXPIRED',
    quantity: 1,
    reason: '',
  });
  const [savingWaste, setSavingWaste] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ stocks: StockItem[]; movements: MovementRow[] }>(
        '/api/restaurant/stocks',
      ),
      apiFetch<{
        settings: StockAlertSettings;
        recentAlerts: RestaurantNotification[];
      }>('/api/restaurant/stocks/alerts/config'),
      apiFetch<{ purchaseOrders: PurchaseOrder[] }>(
        '/api/restaurant/purchase-orders',
      ).catch(() => ({ purchaseOrders: [] as PurchaseOrder[] })),
      apiFetch<{ counts: InventoryCount[] }>(
        '/api/restaurant/inventory-counts',
      ).catch(() => ({ counts: [] as InventoryCount[] })),
    ])
      .then(([s, a, po, cnt]) => {
        setStocks(s.stocks);
        setMovements(s.movements);
        setAlertSettings(a.settings);
        setRecentAlerts(a.recentAlerts);
        setPurchaseOrders(po.purchaseOrders);
        setInventoryCounts(cnt.counts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/restaurant/stocks', {
        method: 'POST',
        body: JSON.stringify(newStock),
      });
      notify(
        newStock.quantity <= newStock.minThreshold
          ? t('stocks.createdCriticalToast')
          : t('stocks.createdSuccessToast'),
        newStock.quantity <= newStock.minThreshold ? 'info' : 'success',
      );
      setShowAdd(false);
      setNewStock({
        name: '',
        unit: sectionFilter === 'BEVERAGE' ? 'bouteille' : 'kg',
        stockSection: sectionFilter === 'BEVERAGE' ? 'BEVERAGE' : 'KITCHEN',
        quantity: 10,
        minThreshold: 5,
        unitCostXof: 2000,
        supplierName: '',
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const openEditStock = (st: StockItem) => {
    setEditingStock(st);
    setEditStockForm({
      name: st.name,
      unit: st.unit,
      stockSection: st.stockSection || 'KITCHEN',
      minThreshold: st.minThreshold,
      unitCostXof: st.unitCostXof,
      supplierName: st.supplierName || '',
    });
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock) return;
    try {
      await apiFetch(`/api/restaurant/stocks/${editingStock.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editStockForm),
      });
      notify('Ingrédient mis à jour.', 'success');
      setEditingStock(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleDeleteStock = async (stockId: string) => {
    try {
      await apiFetch(`/api/restaurant/stocks/${stockId}`, {
        method: 'DELETE',
      });
      notify('Ingrédient supprimé.', 'info');
      setConfirmDeleteStockId(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleOpenCreatePo = () => {
    setShowPoForm((v) => !v);
    if (!showPoForm && poLines.length === 0 && stocks.length > 0) {
      const first = stocks[0];
      setPoLines([
        {
          stockId: first.id,
          quantity: 10,
          unitCostXof: first.unitCostXof || 1000,
        },
      ]);
      if (!poForm.supplierName && first.supplierName) {
        setPoForm((p) => ({ ...p, supplierName: first.supplierName }));
      }
    }
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (poLines.length === 0) {
      notify('Ajoutez au moins un ingrédient au bon de commande.', 'error');
      return;
    }
    setSavingPo(true);
    try {
      await apiFetch('/api/restaurant/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          ...poForm,
          items: poLines,
        }),
      });
      notify('Bon de commande fournisseur créé.', 'success');
      setShowPoForm(false);
      setPoForm({ supplierName: '', expectedDate: '', notes: '', markOrdered: true });
      setPoLines([]);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setSavingPo(false);
    }
  };

  const handlePoStatus = async (
    poId: string,
    status: 'ORDERED' | 'RECEIVED' | 'CANCELLED',
  ) => {
    try {
      await apiFetch(`/api/restaurant/purchase-orders/${poId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify(
        status === 'RECEIVED'
          ? 'Livraison réceptionnée : les stocks ont été incrémentés.'
          : status === 'ORDERED'
            ? 'Bon marqué comme commandé.'
            : 'Bon de commande annulé.',
        status === 'RECEIVED' ? 'success' : 'info',
      );
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveTarget) return;
    try {
      const res = await apiFetch<{ quantity: number; alertTriggered?: boolean }>(
        `/api/restaurant/stocks/${moveTarget.id}/move`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...moveForm,
            reason: moveForm.reason || t('stocks.moveDefaultReason'),
          }),
        },
      );
      notify(
        res.alertTriggered
          ? t('stocks.moveCriticalToast', { name: moveTarget.name })
          : t('stocks.moveSuccessToast'),
        res.alertTriggered ? 'info' : 'success',
      );
      setMoveTarget(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const buildCountTitleForSection = (sec: 'ALL' | StockSection) => {
    const d = new Date().toLocaleDateString('fr-FR');
    if (sec === 'KITCHEN') return `Inventaire Cuisine — ${d}`;
    if (sec === 'BEVERAGE') return `Inventaire Boissons & Bar — ${d}`;
    return `Inventaire complet — ${d}`;
  };

  const handleOpenCountForm = () => {
    setShowCountForm((prev) => {
      const next = !prev;
      if (next) {
        const defaultSection: 'ALL' | StockSection =
          sectionFilter !== 'ALL' ? sectionFilter : 'ALL';
        setCountSection(defaultSection);
        const init: Record<string, string> = {};
        for (const st of stocks) {
          init[st.id] = String(st.quantity);
        }
        setCountDraftQty(init);
        setCountTitle(buildCountTitleForSection(defaultSection));
        setCountNotes('');
      }
      return next;
    });
  };

  const handleSelectCountSection = (sec: 'ALL' | StockSection) => {
    setCountSection(sec);
    setCountTitle(buildCountTitleForSection(sec));
  };

  const scopedCountStocks =
    countSection === 'ALL'
      ? stocks
      : stocks.filter((st) => (st.stockSection || 'KITCHEN') === countSection);

  const handleSubmitInventoryCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scopedCountStocks.length === 0) {
      notify('Aucun article dans cette section à inventorier.', 'error');
      return;
    }
    setSavingCount(true);
    try {
      const lines = scopedCountStocks.map((st) => ({
        stockId: st.id,
        countedQty: Math.max(0, Number(countDraftQty[st.id] ?? st.quantity) || 0),
      }));
      await apiFetch('/api/restaurant/inventory-counts', {
        method: 'POST',
        body: JSON.stringify({
          title: countTitle.trim() || buildCountTitleForSection(countSection),
          stockSection: countSection,
          notes: countNotes.trim(),
          lines,
        }),
      });
      notify('Session d’inventaire validée : stocks théoriques réajustés.', 'success');
      setShowCountForm(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setSavingCount(false);
    }
  };

  const handleRecordWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteTarget) return;
    setSavingWaste(true);
    try {
      await apiFetch(`/api/restaurant/stocks/${wasteTarget.id}/waste`, {
        method: 'POST',
        body: JSON.stringify(wasteForm),
      });
      notify(`Perte enregistrée sur ${wasteTarget.name}.`, 'info');
      setWasteTarget(null);
      setWasteForm({ wasteCategory: 'EXPIRED', quantity: 1, reason: '' });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setSavingWaste(false);
    }
  };

  const persistAlertSettings = async () => {
    if (!alertSettings) return null;
    const payload: Record<string, unknown> = {
      inAppEnabled: alertSettings.inAppEnabled,
      emailEnabled: alertSettings.emailEnabled,
      recipientEmails: alertSettings.recipientEmails,
      smtpHost: alertSettings.smtpHost || '',
      smtpPort: alertSettings.smtpPort || 587,
      smtpSecure: Boolean(alertSettings.smtpSecure),
      smtpUser: alertSettings.smtpUser || '',
      smtpFrom: alertSettings.smtpFrom || '',
    };
    if (smtpPassInput.trim().length > 0) {
      payload.smtpPass = smtpPassInput;
    }
    const res = await apiFetch<{ settings: StockAlertSettings }>(
      '/api/restaurant/stocks/alerts/config',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
    setAlertSettings(res.settings);
    setSmtpPassInput('');
    return res.settings;
  };

  const handleSaveAlertConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertSettings) return;
    setSavingAlerts(true);
    try {
      await persistAlertSettings();
      notify(t('stocks.alertsSavedToast'), 'success');
      setShowAlertConfig(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setSavingAlerts(false);
    }
  };

  const handleTestSmtpEmail = async () => {
    if (!alertSettings) return;
    setTestingSmtp(true);
    try {
      await persistAlertSettings();
      const res = await apiFetch<{
        dispatched: boolean;
        status: string;
        recipients: string[];
      }>('/api/restaurant/stocks/alerts/test-email', {
        method: 'POST',
      });
      if (res.dispatched) {
        notify(
          t('stocks.testEmailSentToast', {
            recipients: res.recipients.join(', '),
          }),
          'success',
        );
      } else if (res.status === 'QUEUED_NO_SMTP') {
        notify(t('stocks.testEmailQueuedToast'), 'info');
      } else {
        notify(t('stocks.testEmailErrorToast'), 'error');
      }
      load();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t('stocks.testEmailErrorToast'),
        'error',
      );
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleManualAlert = async (st: StockItem) => {
    try {
      const res = await apiFetch<{
        emailStatus: string;
        recipients: string[];
      }>(`/api/restaurant/stocks/${st.id}/alert-test`, {
        method: 'POST',
      });
      const translatedStatus = t(`stocks.emailStatuses.${res.emailStatus}`, {
        defaultValue: res.emailStatus,
      });
      notify(
        t('stocks.manualAlertToast', {
          name: st.name,
          status: translatedStatus,
        }),
        'success',
      );
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const criticalItems = stocks.filter((st) => st.quantity <= st.minThreshold);

  return (
    <RestaurantLayout
      title={t('pages.stocksTitle')}
      onRealtimeEvent={load}
      actions={
        <div className="flex items-center gap-2">
          {canWriteStocks && activeTab === 'inventory' && (
            <>
              <button
                type="button"
                onClick={() => setShowAlertConfig((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface)] text-xs font-semibold text-[var(--rm-ink)] hover:bg-[var(--rm-surface-hover)] cursor-pointer transition-colors"
              >
                <Settings2 className="w-4 h-4 text-[#FF8738]" />
                <span>{t('pages.autoAlertsBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('pages.newIngredientBtn')}</span>
              </button>
            </>
          )}
          {canWriteStocks && activeTab === 'counts' && (
            <button
              type="button"
              data-testid="new-inventory-count-btn"
              onClick={handleOpenCountForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvelle session de comptage</span>
            </button>
          )}
          {canWriteStocks && activeTab === 'purchase-orders' && (
            <button
              type="button"
              data-testid="new-po-btn"
              onClick={handleOpenCreatePo}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau bon de commande</span>
            </button>
          )}
        </div>
      }
    >
      {loading ? (
        <TableSkeleton
          rows={6}
          columns={6}
          testId="stocks-loading-skeleton"
        />
      ) : (
        <div className="space-y-6">
          {/* Sub-tabs */}
          <div className="inline-flex flex-wrap p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                activeTab === 'inventory'
                  ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                  : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Inventaire & Mouvements ({stocks.length})</span>
            </button>
            <button
              type="button"
              data-testid="stocks-tab-counts"
              onClick={() => setActiveTab('counts')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                activeTab === 'counts'
                  ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                  : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Inventaires physiques ({inventoryCounts.length})</span>
            </button>
            <button
              type="button"
              data-testid="stocks-tab-po"
              onClick={() => setActiveTab('purchase-orders')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                activeTab === 'purchase-orders'
                  ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                  : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Bons de commande fournisseurs ({purchaseOrders.length})</span>
            </button>
          </div>

          {activeTab === 'counts' ? (
            <div className="space-y-5" data-testid="inventory-counts-panel">
              {showCountForm && canWriteStocks && (
                <form
                  onSubmit={handleSubmitInventoryCount}
                  className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                        Comptage d’inventaire physique vs stock théorique
                      </h2>
                      <p className="text-xs text-[var(--rm-ink-muted)]">
                        Sélectionnez Cuisine, Boissons ou Complet pour réaliser des inventaires ciblés plus rapides.
                      </p>
                    </div>
                    <div className="inline-flex p-1 rounded-lg bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] gap-1">
                      {(
                        [
                          { id: 'ALL', label: `Complet (${stocks.length})` },
                          {
                            id: 'KITCHEN',
                            label: `Cuisine (${stocks.filter((s) => (s.stockSection || 'KITCHEN') === 'KITCHEN').length})`,
                          },
                          {
                            id: 'BEVERAGE',
                            label: `Boissons (${stocks.filter((s) => s.stockSection === 'BEVERAGE').length})`,
                          },
                        ] as const
                      ).map((sec) => (
                        <button
                          key={sec.id}
                          type="button"
                          data-testid={`count-section-${sec.id}`}
                          onClick={() => handleSelectCountSection(sec.id)}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                            countSection === sec.id
                              ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                              : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                          }`}
                        >
                          {sec.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                        Intitulé de session *
                      </label>
                      <input
                        required
                        type="text"
                        value={countTitle}
                        onChange={(e) => setCountTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                        Observations
                      </label>
                      <input
                        type="text"
                        placeholder="Fin de service, contrôle bar / cuisine..."
                        value={countNotes}
                        onChange={(e) => setCountNotes(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-[var(--rm-border)] rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)]">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Article</th>
                          <th className="px-4 py-2.5 font-semibold">Section</th>
                          <th className="px-4 py-2.5 font-semibold text-right">Stock théorique</th>
                          <th className="px-4 py-2.5 font-semibold text-right">Stock physique compté</th>
                          <th className="px-4 py-2.5 font-semibold text-right">Écart qté</th>
                          <th className="px-4 py-2.5 font-semibold text-right">Écart valorisé</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                        {scopedCountStocks.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-6 text-center text-xs text-[var(--rm-ink-muted)]"
                            >
                              Aucun article enregistré dans cette section.
                            </td>
                          </tr>
                        ) : (
                          scopedCountStocks.map((st) => {
                            const rawVal = countDraftQty[st.id] ?? String(st.quantity);
                            const counted = Math.max(0, Number(rawVal) || 0);
                            const varianceQty =
                              Math.round((counted - st.quantity) * 1000) / 1000;
                            const varianceXof = Math.round(varianceQty * st.unitCostXof);
                            const isBev = st.stockSection === 'BEVERAGE';
                            return (
                              <tr key={st.id}>
                                <td className="px-4 py-2 font-semibold text-[var(--rm-ink)]">
                                  {st.name}
                                </td>
                                <td className="px-4 py-2 text-[var(--rm-ink-muted)]">
                                  {isBev ? 'Boissons' : 'Cuisine'}
                                </td>
                                <td className="px-4 py-2 text-right text-[var(--rm-ink-muted)] tabular-nums">
                                  {st.quantity} {st.unit}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                    value={rawVal}
                                    onChange={(e) =>
                                      setCountDraftQty((prev) => ({
                                        ...prev,
                                        [st.id]: e.target.value,
                                      }))
                                    }
                                    className="w-28 px-2.5 py-1 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-right tabular-nums"
                                  />
                                </td>
                                <td
                                  className={`px-4 py-2 text-right font-bold tabular-nums ${
                                    varianceQty < 0
                                      ? 'text-[#E05252]'
                                      : varianceQty > 0
                                        ? 'text-[#14B8A6]'
                                        : 'text-[var(--rm-ink-muted)]'
                                  }`}
                                >
                                  {varianceQty > 0 ? `+${varianceQty}` : varianceQty} {st.unit}
                                </td>
                                <td
                                  className={`px-4 py-2 text-right font-bold tabular-nums ${
                                    varianceXof < 0
                                      ? 'text-[#E05252]'
                                      : varianceXof > 0
                                        ? 'text-[#14B8A6]'
                                        : 'text-[var(--rm-ink-muted)]'
                                  }`}
                                >
                                  {formatFcfa(varianceXof)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <span className="text-xs font-bold text-[var(--rm-ink)] tabular-nums">
                      Impact total estimé :{' '}
                      {formatFcfa(
                        scopedCountStocks.reduce((sum, st) => {
                          const counted = Math.max(
                            0,
                            Number(countDraftQty[st.id] ?? st.quantity) || 0,
                          );
                          return (
                            sum +
                            Math.round((counted - st.quantity) * st.unitCostXof)
                          );
                        }, 0),
                      )}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCountForm(false)}
                        className="px-4 py-2 rounded-lg border border-[var(--rm-border-input)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={savingCount || scopedCountStocks.length === 0}
                        data-testid="submit-inventory-count-btn"
                        className="px-4 py-2 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {savingCount ? 'Validation...' : 'Valider l’inventaire'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--rm-surface)] border border-[var(--rm-border)] w-fit">
                {(
                  [
                    { id: 'ALL', label: 'Tous les inventaires' },
                    { id: 'KITCHEN', label: 'Cuisine' },
                    { id: 'BEVERAGE', label: 'Boissons & Bar' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setCountHistoryFilter(f.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                      countHistoryFilter === f.id
                        ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                        : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
                {inventoryCounts.filter(
                  (c) =>
                    countHistoryFilter === 'ALL' ||
                    c.stockSection === countHistoryFilter,
                ).length === 0 ? (
                  <p className="p-8 text-center text-xs text-[var(--rm-ink-muted)]">
                    Aucune session d’inventaire physique enregistrée pour ce filtre.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--rm-border-subtle)]">
                    {inventoryCounts
                      .filter(
                        (c) =>
                          countHistoryFilter === 'ALL' ||
                          c.stockSection === countHistoryFilter,
                      )
                      .map((cnt) => {
                      const expanded = expandedCountId === cnt.id;
                      const secLabel =
                        cnt.stockSection === 'BEVERAGE'
                          ? 'Boissons & Bar'
                          : cnt.stockSection === 'KITCHEN'
                            ? 'Cuisine'
                            : 'Complet';
                      return (
                        <div key={cnt.id} className="p-5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-[var(--rm-ink)]">
                                  {cnt.title}
                                </span>
                                <span className="text-[11px] text-[var(--rm-ink-muted)]">
                                  · {secLabel} ·{' '}
                                  <span className="font-semibold text-[#14B8A6]">
                                    Validé
                                  </span>
                                </span>
                              </div>
                              <p className="text-xs text-[var(--rm-ink-muted)]">
                                Par {cnt.createdByName} ·{' '}
                                {formatDateTimeFr(cnt.validatedAt || cnt.createdAt)} ·{' '}
                                {cnt.lines.length} ligne(s)
                                {cnt.notes ? ` · ${cnt.notes}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className={`font-extrabold text-sm tabular-nums ${
                                  cnt.totalVarianceXof < 0
                                    ? 'text-[#E05252]'
                                    : cnt.totalVarianceXof > 0
                                      ? 'text-[#14B8A6]'
                                      : 'text-[var(--rm-ink)]'
                                }`}
                              >
                                Écart : {formatFcfa(cnt.totalVarianceXof)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedCountId(expanded ? null : cnt.id)
                                }
                                className="px-3 py-1.5 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
                              >
                                {expanded ? 'Masquer' : 'Détails'}
                              </button>
                              <button
                                type="button"
                                onClick={() => window.print()}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Imprimer</span>
                              </button>
                            </div>
                          </div>
                          {expanded && (
                            <div className="overflow-x-auto border border-[var(--rm-border)] rounded-lg">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)]">
                                  <tr>
                                    <th className="px-3 py-2 font-semibold">Article</th>
                                    <th className="px-3 py-2 font-semibold text-right">Théorique</th>
                                    <th className="px-3 py-2 font-semibold text-right">Compté</th>
                                    <th className="px-3 py-2 font-semibold text-right">Écart</th>
                                    <th className="px-3 py-2 font-semibold text-right">Valeur</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                                  {cnt.lines.map((ln) => (
                                    <tr key={ln.id}>
                                      <td className="px-3 py-1.5 font-medium text-[var(--rm-ink)]">
                                        {ln.stockName}
                                      </td>
                                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--rm-ink-muted)]">
                                        {ln.expectedQty} {ln.unit}
                                      </td>
                                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--rm-ink)]">
                                        {ln.countedQty} {ln.unit}
                                      </td>
                                      <td
                                        className={`px-3 py-1.5 text-right tabular-nums font-bold ${
                                          ln.varianceQty < 0
                                            ? 'text-[#E05252]'
                                            : ln.varianceQty > 0
                                              ? 'text-[#14B8A6]'
                                              : 'text-[var(--rm-ink-muted)]'
                                        }`}
                                      >
                                        {ln.varianceQty > 0 ? `+${ln.varianceQty}` : ln.varianceQty}{' '}
                                        {ln.unit}
                                      </td>
                                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[var(--rm-ink)]">
                                        {formatFcfa(ln.varianceXof)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'purchase-orders' ? (
            <div className="space-y-5" data-testid="purchase-orders-panel">
              {showPoForm && canWriteStocks && (
                <form
                  onSubmit={handleCreatePo}
                  className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-4"
                >
                  <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                    Créer un bon de commande fournisseur
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                        Fournisseur *
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="Ex: Marché Port-Bouët"
                        value={poForm.supplierName}
                        onChange={(e) =>
                          setPoForm({ ...poForm, supplierName: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                        Date prévue
                      </label>
                      <input
                        type="date"
                        value={poForm.expectedDate}
                        onChange={(e) =>
                          setPoForm({ ...poForm, expectedDate: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                        Notes
                      </label>
                      <input
                        type="text"
                        placeholder="Livraison matin..."
                        value={poForm.notes}
                        onChange={(e) =>
                          setPoForm({ ...poForm, notes: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--rm-ink)]">
                        Lignes d’approvisionnement
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (stocks.length === 0) return;
                          const st = stocks[0];
                          setPoLines((prev) => [
                            ...prev,
                            {
                              stockId: st.id,
                              quantity: 5,
                              unitCostXof: st.unitCostXof || 1000,
                            },
                          ]);
                        }}
                        className="text-xs font-semibold text-[#FF8738] hover:underline cursor-pointer"
                      >
                        + Ajouter une ligne
                      </button>
                    </div>
                    {poLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                      >
                        <select
                          value={line.stockId}
                          onChange={(e) => {
                            const st = stocks.find((s) => s.id === e.target.value);
                            setPoLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? {
                                      ...l,
                                      stockId: e.target.value,
                                      unitCostXof: st?.unitCostXof || l.unitCostXof,
                                    }
                                  : l,
                              ),
                            );
                          }}
                          className="sm:col-span-5 px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        >
                          {stocks.map((s) => (
                            <option key={s.id} value={s.id}>
                              [{s.stockSection === 'BEVERAGE' ? 'Boissons' : 'Cuisine'}] {s.name} ({s.unit})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0.1}
                          step="any"
                          value={line.quantity}
                          onChange={(e) =>
                            setPoLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? { ...l, quantity: Number(e.target.value) || 0 }
                                  : l,
                              ),
                            )
                          }
                          placeholder="Qté"
                          className="sm:col-span-3 px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                        />
                        <input
                          type="number"
                          min={0}
                          value={line.unitCostXof}
                          onChange={(e) =>
                            setPoLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? {
                                      ...l,
                                      unitCostXof: Number(e.target.value) || 0,
                                    }
                                  : l,
                              ),
                            )
                          }
                          placeholder="Coût unitaire"
                          className="sm:col-span-3 px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPoLines((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="sm:col-span-1 p-2 text-[#E05252] cursor-pointer"
                          aria-label="Retirer ligne"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--rm-border-subtle)]">
                    <label className="inline-flex items-center gap-2 text-xs text-[var(--rm-ink)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={poForm.markOrdered}
                        onChange={(e) =>
                          setPoForm({ ...poForm, markOrdered: e.target.checked })
                        }
                      />
                      <span>Envoyer directement (statut Commandé)</span>
                    </label>
                    <button
                      type="submit"
                      disabled={savingPo}
                      className="px-4 py-2 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {savingPo ? 'Enregistrement...' : 'Enregistrer le bon'}
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
                {purchaseOrders.length === 0 ? (
                  <p className="p-8 text-center text-xs text-[var(--rm-ink-muted)]">
                    Aucun bon de commande fournisseur enregistré.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--rm-border-subtle)]">
                    {purchaseOrders.map((po) => (
                      <div
                        key={po.id}
                        className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-[var(--rm-ink)]">
                              {po.poNumber}
                            </span>
                            <span className="text-xs font-semibold text-[var(--rm-ink)]">
                              · {po.supplierName}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                                po.status === 'RECEIVED'
                                  ? 'bg-[#14B8A6]/15 text-[#14B8A6]'
                                  : po.status === 'CANCELLED'
                                    ? 'bg-[#E05252]/15 text-[#E05252]'
                                    : po.status === 'ORDERED'
                                      ? 'bg-[#FF8738]/15 text-[#FF8738]'
                                      : 'bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)]'
                              }`}
                            >
                              {po.status === 'RECEIVED'
                                ? 'Réceptionné'
                                : po.status === 'ORDERED'
                                  ? 'Commandé'
                                  : po.status === 'CANCELLED'
                                    ? 'Annulé'
                                    : 'Brouillon'}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--rm-ink-muted)]">
                            {po.items
                              .map((it) => `${it.quantity} ${it.unit} ${it.stockName}`)
                              .join(' · ')}
                          </p>
                          <p className="text-[11px] text-[var(--rm-ink-muted)]">
                            Créé le {formatDateFr(po.createdAt)}
                            {po.expectedDate ? ` · Prévu le ${formatDateFr(po.expectedDate)}` : ''}
                            {po.notes ? ` · ${po.notes}` : ''}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <span className="font-extrabold text-sm text-[var(--rm-ink)] tabular-nums mr-2">
                            {formatFcfa(po.totalCostXof)}
                          </span>
                          {canWriteStocks &&
                            po.status !== 'RECEIVED' &&
                            po.status !== 'CANCELLED' && (
                              <>
                                {po.status === 'DRAFT' && (
                                  <button
                                    type="button"
                                    onClick={() => void handlePoStatus(po.id, 'ORDERED')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] hover:border-[#FF8738] cursor-pointer"
                                  >
                                    <Truck className="w-3.5 h-3.5 text-[#FF8738]" />
                                    <span>Commander</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  data-testid={`receive-po-${po.id}`}
                                  onClick={() => void handlePoStatus(po.id, 'RECEIVED')}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#14B8A6] text-white text-xs font-semibold cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Réceptionner (+ Stock)</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handlePoStatus(po.id, 'CANCELLED')}
                                  className="px-2.5 py-1.5 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[#E05252] cursor-pointer"
                                >
                                  Annuler
                                </button>
                              </>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {criticalItems.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-[#E05252] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-[var(--rm-ink)]">
                        {t('stocks.criticalBannerTitle', {
                          count: criticalItems.length,
                        })}
                      </p>
                      <p className="text-xs text-[var(--rm-ink-muted)] mt-0.5">
                        {criticalItems
                          .map((c) => `${c.name} (${c.quantity} ${c.unit})`)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                  {alertSettings && (
                    <div className="flex items-center gap-3 text-xs text-[var(--rm-ink)] shrink-0">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <BellRing className="w-3.5 h-3.5 text-[#FF8738]" />
                        {t('stocks.inAppStatus', {
                          state: alertSettings.inAppEnabled
                            ? t('stocks.activeState')
                            : t('stocks.inactiveState'),
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Mail className="w-3.5 h-3.5 text-[#14B8A6]" />
                        {t('stocks.emailStatus', {
                          state: alertSettings.emailEnabled
                            ? t('stocks.activeState')
                            : t('stocks.inactiveState'),
                        })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {showAlertConfig && alertSettings && canWriteStocks && (
                <form
                  onSubmit={handleSaveAlertConfig}
                  className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                        {t('stocks.configTitle')}
                      </h2>
                      <p className="text-xs text-[var(--rm-ink-muted)] mt-0.5">
                        {t('stocks.configSubtitle')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <label className="flex items-start gap-3 p-3.5 rounded-lg border border-[var(--rm-border)] cursor-pointer hover:bg-[var(--rm-surface-hover)] transition-colors">
                      <input
                        type="checkbox"
                        checked={alertSettings.inAppEnabled}
                        onChange={(e) =>
                          setAlertSettings({
                            ...alertSettings,
                            inAppEnabled: e.target.checked,
                          })
                        }
                        className="mt-0.5"
                      />
                      <div className="text-xs">
                        <p className="font-bold text-[var(--rm-ink)]">
                          {t('stocks.inAppLabel')}
                        </p>
                        <p className="text-[var(--rm-ink-muted)] mt-0.5">
                          {t('stocks.inAppDesc')}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3.5 rounded-lg border border-[var(--rm-border)] cursor-pointer hover:bg-[var(--rm-surface-hover)] transition-colors">
                      <input
                        type="checkbox"
                        checked={alertSettings.emailEnabled}
                        onChange={(e) =>
                          setAlertSettings({
                            ...alertSettings,
                            emailEnabled: e.target.checked,
                          })
                        }
                        className="mt-0.5"
                      />
                      <div className="text-xs">
                        <p className="font-bold text-[var(--rm-ink)]">
                          {t('stocks.emailLabel')}
                        </p>
                        <p className="text-[var(--rm-ink-muted)] mt-0.5">
                          {t('stocks.emailDesc')}
                        </p>
                      </div>
                    </label>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                        {t('stocks.recipientsLabel')}
                      </label>
                      <input
                        type="text"
                        placeholder={
                          alertSettings.resolvedRecipients.join(', ') ||
                          'gestionnaire@restaurant.ci'
                        }
                        value={alertSettings.recipientEmails}
                        onChange={(e) =>
                          setAlertSettings({
                            ...alertSettings,
                            recipientEmails: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
                      />
                      <p className="text-[11px] text-[var(--rm-ink-muted)] mt-1">
                        {t('stocks.defaultRecipientsHint', {
                          list:
                            alertSettings.resolvedRecipients.length > 0
                              ? alertSettings.resolvedRecipients.join(', ')
                              : t('stocks.defaultManagersFallback'),
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Production SMTP Settings */}
                  <div className="pt-4 border-t border-[var(--rm-border-subtle)] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-[var(--rm-ink)]">
                        {t('stocks.smtpSectionTitle')}
                      </h3>
                      <span
                        className={`text-[11px] font-semibold ${
                          alertSettings.envSmtpConfigured
                            ? 'text-[#14B8A6]'
                            : 'text-[var(--rm-ink-muted)]'
                        }`}
                      >
                        {alertSettings.envSmtpConfigured
                          ? t('stocks.smtpEnvActiveChip')
                          : t('stocks.smtpEnvMissingChip')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                      <div className="lg:col-span-2">
                        <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                          {t('stocks.smtpHostLabel')}
                        </label>
                        <input
                          type="text"
                          value={alertSettings.smtpHost || ''}
                          onChange={(e) =>
                            setAlertSettings({
                              ...alertSettings,
                              smtpHost: e.target.value,
                            })
                          }
                          placeholder="smtp.example.com"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                          {t('stocks.smtpPortLabel')}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={65535}
                          value={alertSettings.smtpPort ?? 587}
                          onChange={(e) =>
                            setAlertSettings({
                              ...alertSettings,
                              smtpPort: Number(e.target.value) || 587,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                          {t('stocks.smtpUserLabel')}
                        </label>
                        <input
                          type="text"
                          value={alertSettings.smtpUser || ''}
                          onChange={(e) =>
                            setAlertSettings({
                              ...alertSettings,
                              smtpUser: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                          {t('stocks.smtpPassLabel')}
                        </label>
                        <input
                          type="password"
                          value={smtpPassInput}
                          onChange={(e) => setSmtpPassInput(e.target.value)}
                          placeholder={
                            alertSettings.smtpPassConfigured
                              ? t('stocks.smtpPassConfiguredPlaceholder')
                              : '••••••••'
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                          {t('stocks.smtpFromLabel')}
                        </label>
                        <input
                          type="text"
                          value={alertSettings.smtpFrom || ''}
                          onChange={(e) =>
                            setAlertSettings({
                              ...alertSettings,
                              smtpFrom: e.target.value,
                            })
                          }
                          placeholder="Resto’MAX <alerts@restaurant.ci>"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        />
                      </div>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs text-[var(--rm-ink)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(alertSettings.smtpSecure)}
                        onChange={(e) =>
                          setAlertSettings({
                            ...alertSettings,
                            smtpSecure: e.target.checked,
                          })
                        }
                      />
                      <span>{t('stocks.smtpSecureLabel')}</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={testingSmtp}
                      onClick={() => void handleTestSmtpEmail()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--rm-border)] text-[var(--rm-ink)] hover:border-[#FF8738] text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5 text-[#FF8738]" />
                      <span>
                        {testingSmtp
                          ? t('stocks.testingSmtpBtn')
                          : t('stocks.testSmtpBtn')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAlertConfig(false)}
                      className="px-4 py-2 rounded-lg border border-[var(--rm-border-input)] text-[var(--rm-ink)] hover:bg-[var(--rm-surface-hover)] text-xs font-semibold cursor-pointer"
                    >
                      {t('common.close')}
                    </button>
                    <button
                      type="submit"
                      disabled={savingAlerts}
                      className="px-4 py-2 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {t('stocks.saveConfigBtn')}
                    </button>
                  </div>
                </form>
              )}

              {/* Section Split: Tous / Cuisine / Boissons & Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1">
                  <button
                    type="button"
                    data-testid="stocks-section-all"
                    onClick={() => setSectionFilter('ALL')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                      sectionFilter === 'ALL'
                        ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                        : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>{t('stocks.sectionAll')} ({stocks.length})</span>
                  </button>
                  <button
                    type="button"
                    data-testid="stocks-section-kitchen"
                    onClick={() => {
                      setSectionFilter('KITCHEN');
                      setNewStock((prev) => ({
                        ...prev,
                        stockSection: 'KITCHEN',
                        unit: prev.unit === 'bouteille' ? 'kg' : prev.unit,
                      }));
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                      sectionFilter === 'KITCHEN'
                        ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                        : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                    }`}
                  >
                    <ChefHat className="w-3.5 h-3.5" />
                    <span>
                      {t('stocks.sectionKitchen')} (
                      {stocks.filter((s) => (s.stockSection || 'KITCHEN') === 'KITCHEN').length}
                      )
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid="stocks-section-beverage"
                    onClick={() => {
                      setSectionFilter('BEVERAGE');
                      setNewStock((prev) => ({
                        ...prev,
                        stockSection: 'BEVERAGE',
                        unit: prev.unit === 'kg' ? 'bouteille' : prev.unit,
                      }));
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                      sectionFilter === 'BEVERAGE'
                        ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                        : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                    }`}
                  >
                    <Wine className="w-3.5 h-3.5" />
                    <span>
                      {t('stocks.sectionBeverage')} (
                      {stocks.filter((s) => s.stockSection === 'BEVERAGE').length}
                      )
                    </span>
                  </button>
                </div>
                <span className="text-xs text-[var(--rm-ink-muted)] tabular-nums">
                  Cuisine : {stocks.filter((s) => (s.stockSection || 'KITCHEN') === 'KITCHEN' && s.quantity <= s.minThreshold).length} alerte(s) · Boissons : {stocks.filter((s) => s.stockSection === 'BEVERAGE' && s.quantity <= s.minThreshold).length} alerte(s)
                </span>
              </div>

              {showAdd && canWriteStocks && (
                <form
                  onSubmit={handleCreate}
                  className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end"
                >
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                      {t('stocks.nameLabel')}
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: Jus de mangue, Huile d'arachide..."
                      value={newStock.name}
                      onChange={(e) =>
                        setNewStock({ ...newStock, name: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                      {t('stocks.sectionLabel')}
                    </label>
                    <select
                      data-testid="new-stock-section"
                      value={newStock.stockSection}
                      onChange={(e) =>
                        setNewStock({
                          ...newStock,
                          stockSection: e.target.value as StockSection,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                    >
                      <option value="KITCHEN">{t('stocks.sectionKitchen')}</option>
                      <option value="BEVERAGE">{t('stocks.sectionBeverage')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                      {t('stocks.unitLabel')}
                    </label>
                    <StockUnitField
                      testId="new-stock-unit"
                      value={newStock.unit}
                      onChange={(unit) => setNewStock({ ...newStock, unit })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                      {t('stocks.initQtyLabel')}
                    </label>
                    <input
                      required
                      type="number"
                      step="0.1"
                      value={newStock.quantity}
                      onChange={(e) =>
                        setNewStock({ ...newStock, quantity: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                      {t('stocks.thresholdLabel')}
                    </label>
                    <input
                      required
                      type="number"
                      step="0.1"
                      value={newStock.minThreshold}
                      onChange={(e) =>
                        setNewStock({
                          ...newStock,
                          minThreshold: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                    />
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                        {t('stocks.supplierLabel')}
                      </label>
                      <input
                        type="text"
                        value={newStock.supplierName}
                        onChange={(e) =>
                          setNewStock({ ...newStock, supplierName: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      data-testid="submit-new-stock-btn"
                      className="py-2.5 px-4 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer shrink-0"
                    >
                      {t('common.add')}
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--rm-surface-muted)] text-xs text-[var(--rm-ink-muted)]">
                      <tr>
                        <th className="px-5 py-3 font-semibold">
                          {t('stocks.colIngredient')}
                        </th>
                        <th className="px-5 py-3 font-semibold">
                          {t('stocks.colSection')}
                        </th>
                        <th className="px-5 py-3 font-semibold">
                          {t('stocks.colSupplier')}
                        </th>
                        <th className="px-5 py-3 font-semibold text-right">
                          {t('stocks.colCurrentStock')}
                        </th>
                        <th className="px-5 py-3 font-semibold text-right">
                          {t('stocks.colMinThreshold')}
                        </th>
                        <th className="px-5 py-3 font-semibold text-right">
                          {t('stocks.colUnitCost')}
                        </th>
                        <th className="px-5 py-3 font-semibold text-right">
                          {t('stocks.colActions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--rm-border-subtle)]">
                      {stocks
                        .filter(
                          (st) =>
                            sectionFilter === 'ALL' ||
                            (st.stockSection || 'KITCHEN') === sectionFilter,
                        )
                        .map((st) => {
                        const critical = st.quantity <= st.minThreshold;
                        const isBeverage = st.stockSection === 'BEVERAGE';
                        return (
                          <tr
                            key={st.id}
                            className="hover:bg-[var(--rm-surface-hover)] transition-colors"
                          >
                            <td className="px-5 py-3 font-semibold text-[var(--rm-ink)]">
                              <div className="flex items-center gap-2 flex-wrap">
                                {critical && (
                                  <AlertTriangle className="w-4 h-4 text-[#E05252] shrink-0" />
                                )}
                                <span>{st.name}</span>
                                {(st.usedInRecipesCount ?? 0) > 0 && (
                                  <span className="text-[11px] font-semibold text-[#14B8A6]">
                                    ·{' '}
                                    {t('stocks.recipesBadge', {
                                      count: st.usedInRecipesCount,
                                    })}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs text-[var(--rm-ink-muted)] whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 font-medium text-[var(--rm-ink)]">
                                {isBeverage ? (
                                  <Wine className="w-3.5 h-3.5 text-[#14B8A6]" />
                                ) : (
                                  <ChefHat className="w-3.5 h-3.5 text-[#FF8738]" />
                                )}
                                <span>
                                  {isBeverage
                                    ? t('stocks.sectionBeverage')
                                    : t('stocks.sectionKitchen')}
                                </span>
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-[var(--rm-ink-muted)]">
                              {st.supplierName || '—'}
                            </td>
                            <td
                              className={`px-5 py-3 text-right font-bold tabular-nums ${
                                critical ? 'text-[#E05252]' : 'text-[var(--rm-ink)]'
                              }`}
                            >
                              {st.quantity} {st.unit}
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-[var(--rm-ink-muted)] tabular-nums">
                              {st.minThreshold} {st.unit}
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-[var(--rm-ink)] tabular-nums">
                              {formatFcfa(st.unitCostXof)}
                            </td>
                            <td className="px-5 py-3 text-right space-x-2.5 whitespace-nowrap">
                              {canWriteStocks && critical && (
                                <button
                                  type="button"
                                  onClick={() => handleManualAlert(st)}
                                  className="text-xs font-semibold text-[var(--rm-ink)] hover:text-[#FF8738] cursor-pointer"
                                >
                                  {t('stocks.notifyBtn')}
                                </button>
                              )}
                              {canWriteStocks && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setMoveTarget(st)}
                                    className="text-xs font-semibold text-[#FF8738] hover:underline cursor-pointer"
                                  >
                                    {t('stocks.moveBtn')}
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`waste-stock-${st.id}`}
                                    onClick={() => {
                                      setWasteTarget(st);
                                      setWasteForm({
                                        wasteCategory: 'EXPIRED',
                                        quantity: 1,
                                        reason: '',
                                      });
                                    }}
                                    className="text-xs font-semibold text-[#E5A32A] hover:underline cursor-pointer"
                                  >
                                    Perte
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditStock(st)}
                                    aria-label={`Modifier ${st.name}`}
                                    className="inline-flex items-center text-xs font-semibold text-[var(--rm-ink-muted)] hover:text-[#FF8738] cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  {confirmDeleteStockId === st.id ? (
                                    <span className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteStock(st.id)}
                                        className="px-2 py-0.5 rounded bg-[#E05252] text-white text-[11px] font-semibold cursor-pointer"
                                      >
                                        Confirmer
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteStockId(null)}
                                        className="px-2 py-0.5 rounded border border-[var(--rm-border)] text-[var(--rm-ink-muted)] text-[11px] cursor-pointer"
                                      >
                                        Annuler
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteStockId(st.id)}
                                      aria-label={`Supprimer ${st.name}`}
                                      className="inline-flex items-center text-xs font-semibold text-[#E05252] hover:underline cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Stock Movements */}
                <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6">
                  <h2 className="text-base font-bold text-[var(--rm-ink)] mb-4">
                    {t('stocks.recentMovementsTitle')}
                  </h2>
                  {movements.filter(
                    (m) =>
                      sectionFilter === 'ALL' ||
                      (m.stockSection || 'KITCHEN') === sectionFilter,
                  ).length === 0 ? (
                    <p className="text-xs text-[var(--rm-ink-muted)]">
                      {t('stocks.noMovementsYet')}
                    </p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {movements
                        .filter(
                          (m) =>
                            sectionFilter === 'ALL' ||
                            (m.stockSection || 'KITCHEN') === sectionFilter,
                        )
                        .map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between py-2 border-b border-[var(--rm-border-subtle)] last:border-0 gap-2"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-[var(--rm-ink)]">
                              {m.stockName}
                            </span>
                            <span className="ml-1.5 text-[11px] text-[var(--rm-ink-muted)]">
                              · {m.stockSection === 'BEVERAGE' ? 'Boissons' : 'Cuisine'}
                            </span>
                            {m.movementType === 'AUTO_ORDER' && (
                              <span className="ml-2 text-[11px] font-semibold text-[#FF8738]">
                                [{t('stocks.autoOrderBadge')}]
                              </span>
                            )}
                            {m.movementType === 'WASTE' && m.wasteCategory && (
                              <span className="ml-2 text-[11px] font-semibold text-[#E05252]">
                                [
                                {m.wasteCategory === 'EXPIRED'
                                  ? 'Péremption'
                                  : m.wasteCategory === 'COMPLIMENTARY'
                                    ? 'Offert'
                                    : 'Casse'}
                                ]
                              </span>
                            )}{' '}
                            ·{' '}
                            <span className="text-[var(--rm-ink-muted)]">
                              {m.reason}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 tabular-nums shrink-0">
                            <span
                              className={`font-bold ${
                                m.quantityDelta >= 0
                                  ? 'text-[#14B8A6]'
                                  : 'text-[#E05252]'
                              }`}
                            >
                              {m.quantityDelta >= 0
                                ? `+${m.quantityDelta}`
                                : m.quantityDelta}
                              {m.stockUnit ? ` ${m.stockUnit}` : ''}
                            </span>
                            <span className="text-[var(--rm-ink-muted)]">
                              {formatTimeFr(m.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Automated Stock Alerts History */}
                <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6">
                  <h2 className="text-base font-bold text-[var(--rm-ink)] mb-4">
                    {t('stocks.recentAlertsTitle')}
                  </h2>
                  {recentAlerts.length === 0 ? (
                    <p className="text-xs text-[var(--rm-ink-muted)]">
                      {t('stocks.noAlertsYet')}
                    </p>
                  ) : (
                    <div className="space-y-2.5 text-xs">
                      {recentAlerts.map((al) => (
                        <div
                          key={al.id}
                          className="p-3 rounded-lg bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[var(--rm-ink)]">
                              {al.title}
                            </span>
                            <span className="text-[11px] text-[var(--rm-ink-muted)] tabular-nums shrink-0">
                              {formatDateTimeFr(al.createdAt)}
                            </span>
                          </div>
                          <p className="text-[var(--rm-ink-muted)]">{al.message}</p>
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                            <span className="text-[var(--rm-ink)] font-medium">
                              {t(`stocks.emailStatuses.${al.emailStatus}`, {
                                defaultValue: al.emailStatus,
                              })}
                              {al.emailRecipients ? ` → ${al.emailRecipients}` : ''}
                            </span>
                            <span
                              className={
                                al.isRead
                                  ? 'text-[var(--rm-ink-muted)]'
                                  : 'font-semibold text-[#FF8738]'
                              }
                            >
                              {al.isRead
                                ? t('stocks.readState')
                                : t('stocks.unreadState')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Stock Item Modal */}
      {editingStock && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateStock}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Modifier {editingStock.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStock(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('stocks.nameLabel')}
              </label>
              <input
                required
                type="text"
                value={editStockForm.name}
                onChange={(e) =>
                  setEditStockForm({ ...editStockForm, name: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('stocks.sectionLabel')}
              </label>
              <select
                value={editStockForm.stockSection}
                onChange={(e) =>
                  setEditStockForm({
                    ...editStockForm,
                    stockSection: e.target.value as StockSection,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              >
                <option value="KITCHEN">{t('stocks.sectionKitchen')}</option>
                <option value="BEVERAGE">{t('stocks.sectionBeverage')}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('stocks.unitLabel')}
                </label>
                <StockUnitField
                  testId="edit-stock-unit"
                  value={editStockForm.unit}
                  onChange={(unit) =>
                    setEditStockForm({ ...editStockForm, unit })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('stocks.thresholdLabel')}
                </label>
                <input
                  required
                  type="number"
                  step="0.1"
                  value={editStockForm.minThreshold}
                  onChange={(e) =>
                    setEditStockForm({
                      ...editStockForm,
                      minThreshold: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Coût unitaire (FCFA)
                </label>
                <input
                  type="number"
                  min={0}
                  value={editStockForm.unitCostXof}
                  onChange={(e) =>
                    setEditStockForm({
                      ...editStockForm,
                      unitCostXof: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('stocks.supplierLabel')}
                </label>
                <input
                  type="text"
                  value={editStockForm.supplierName}
                  onChange={(e) =>
                    setEditStockForm({
                      ...editStockForm,
                      supplierName: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingStock(null)}
                className="flex-1 py-2.5 rounded-lg border border-[var(--rm-border-input)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer"
              >
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {moveTarget && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleMove}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-[var(--rm-ink)]">
              {t('stocks.moveModalTitle', { name: moveTarget.name })}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('stocks.moveTypeLabel')}
              </label>
              <select
                value={moveForm.movementType}
                onChange={(e) =>
                  setMoveForm({ ...moveForm, movementType: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-sm bg-[var(--rm-surface)] text-[var(--rm-ink)]"
              >
                <option value="IN">{t('stocks.moveTypes.IN')}</option>
                <option value="OUT">{t('stocks.moveTypes.OUT')}</option>
                <option value="LOSS">{t('stocks.moveTypes.LOSS')}</option>
                <option value="INVENTORY">
                  {t('stocks.moveTypes.INVENTORY')}
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('stocks.moveQtyLabel', { unit: moveTarget.unit })}
              </label>
              <input
                required
                type="number"
                min={0}
                step="0.1"
                value={moveForm.quantity}
                onChange={(e) =>
                  setMoveForm({ ...moveForm, quantity: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('stocks.moveReasonLabel')}
              </label>
              <input
                type="text"
                placeholder={t('stocks.moveDefaultReason')}
                value={moveForm.reason}
                onChange={(e) =>
                  setMoveForm({ ...moveForm, reason: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                className="flex-1 py-2.5 rounded-lg border border-[var(--rm-border-input)] text-[var(--rm-ink)] hover:bg-[var(--rm-surface-hover)] text-xs font-semibold cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
              >
                {t('stocks.validateBtn')}
              </button>
            </div>
          </form>
        </div>
      )}
      {wasteTarget && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordWaste}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Déclarer une perte — {wasteTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setWasteTarget(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                Nature de la perte
              </label>
              <select
                value={wasteForm.wasteCategory}
                onChange={(e) =>
                  setWasteForm({
                    ...wasteForm,
                    wasteCategory: e.target.value as
                      | 'EXPIRED'
                      | 'BROKEN'
                      | 'COMPLIMENTARY',
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-sm bg-[var(--rm-surface)] text-[var(--rm-ink)]"
              >
                <option value="EXPIRED">Péremption / Date dépassée</option>
                <option value="BROKEN">Casse / Erreur cuisine</option>
                <option value="COMPLIMENTARY">Offert client / Dégustation</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                Quantité perdue ({wasteTarget.unit})
              </label>
              <input
                required
                type="number"
                min={0.1}
                step="0.1"
                value={wasteForm.quantity}
                onChange={(e) =>
                  setWasteForm({
                    ...wasteForm,
                    quantity: Number(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                Commentaire / Motif
              </label>
              <input
                type="text"
                placeholder="Ex: Lot périmé chambre froide"
                value={wasteForm.reason}
                onChange={(e) =>
                  setWasteForm({ ...wasteForm, reason: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setWasteTarget(null)}
                className="flex-1 py-2.5 rounded-lg border border-[var(--rm-border-input)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={savingWaste}
                className="flex-1 py-2.5 rounded-lg bg-[#E05252] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingWaste ? 'Enregistrement...' : 'Valider la perte'}
              </button>
            </div>
          </form>
        </div>
      )}
    </RestaurantLayout>
  );
}
