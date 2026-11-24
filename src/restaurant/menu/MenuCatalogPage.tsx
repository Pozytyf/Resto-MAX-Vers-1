import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Flame, Pencil, Plus, Tag, Trash2, UtensilsCrossed, X } from 'lucide-react';
import { RestaurantLayout } from '../RestaurantLayout';
import { ResilientImage } from '../../components/ResilientImage';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatFcfa } from '../../utils/format';
import {
  MenuItemSheetModal,
  type MenuItemSheetSubmitPayload,
} from './MenuItemSheetModal';
import type {
  MenuCategory,
  MenuCombo,
  MenuItem,
  MenuItemRecipeLine,
  Promotion,
  StockItem,
} from '../../types';

type MenuTab = 'catalog' | 'combos' | 'promotions';

interface DraftRecipeLine {
  stockId: string;
  stockName: string;
  unit: string;
  quantityPerUnit: number;
  unitCostXof: number;
  currentStockQty: number;
}

export function MenuCatalogPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<MenuTab>('catalog');
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [combos, setCombos] = useState<MenuCombo[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>('ALL');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showCatForm, setShowCatForm] = useState(false);

  const [catForm, setCatForm] = useState({ name: '', station: 'KITCHEN' });
  const [editingCat, setEditingCat] = useState<MenuCategory | null>(null);
  const [editCatForm, setEditCatForm] = useState({ name: '', station: 'KITCHEN' });
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);

  const [recipeModalItem, setRecipeModalItem] = useState<MenuItem | null>(null);
  const [draftLines, setDraftLines] = useState<DraftRecipeLine[]>([]);
  const [addStockId, setAddStockId] = useState('');
  const [addQty, setAddQty] = useState<number>(0.2);
  const [savingRecipe, setSavingRecipe] = useState(false);

  const [showComboForm, setShowComboForm] = useState(false);
  const [comboForm, setComboForm] = useState({
    name: '',
    description: '',
    priceXof: 9500,
    isDailySpecial: true,
    items: [
      { label: 'Plat du jour', quantity: 1, menuItemId: '' },
      { label: 'Boisson fraîche', quantity: 1, menuItemId: '' },
    ],
  });
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoForm, setPromoForm] = useState({
    name: '',
    promoType: 'HAPPY_HOUR' as 'HAPPY_HOUR' | 'PROMO_CODE',
    code: '',
    discountType: 'PERCENT' as 'PERCENT' | 'FIXED_XOF',
    discountValue: 20,
    minOrderXof: 0,
    startTime: '17:00',
    endTime: '20:00',
    categoryId: '',
    maxUses: '',
  });

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ categories: MenuCategory[]; items: MenuItem[] }>(
        '/api/restaurant/menu',
      ),
      apiFetch<{ stocks: StockItem[] }>('/api/restaurant/stocks').catch(() => ({
        stocks: [] as StockItem[],
      })),
      apiFetch<{ combos: MenuCombo[] }>('/api/restaurant/combos').catch(() => ({
        combos: [] as MenuCombo[],
      })),
      apiFetch<{ promotions: Promotion[] }>('/api/restaurant/promotions').catch(
        () => ({ promotions: [] as Promotion[] }),
      ),
    ])
      .then(([res, sRes, cRes, pRes]) => {
        setCategories(res.categories);
        setItems(res.items);
        setStocks(sRes.stocks);
        setCombos(cRes.combos);
        setPromotions(pRes.promotions);
        if (sRes.stocks.length > 0 && !addStockId) {
          setAddStockId(sRes.stocks[0].id);
        }
      })
      .catch(() => {});
  }, [addStockId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateCat = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/restaurant/menu/categories', {
        method: 'POST',
        body: JSON.stringify(catForm),
      });
      notify(t('menu.catAdded'), 'success');
      setCatForm({ name: '', station: 'KITCHEN' });
      setShowCatForm(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleUpdateCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat) return;
    try {
      await apiFetch(`/api/restaurant/menu/categories/${editingCat.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editCatForm),
      });
      notify('Catégorie mise à jour.', 'success');
      setEditingCat(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleDeleteCat = async (catId: string) => {
    try {
      await apiFetch(`/api/restaurant/menu/categories/${catId}`, {
        method: 'DELETE',
      });
      notify('Catégorie supprimée.', 'info');
      setConfirmDeleteCatId(null);
      if (selectedCategoryFilter === catId) {
        setSelectedCategoryFilter('ALL');
      }
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await apiFetch(`/api/restaurant/menu/items/${itemId}`, {
        method: 'DELETE',
      });
      notify('Article supprimé du catalogue.', 'info');
      setConfirmDeleteItemId(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleSaveItemSheet = async (
    payload: MenuItemSheetSubmitPayload,
    editingItemId?: string,
  ) => {
    try {
      const { recipeLines, ...itemPayload } = payload;
      let targetItemId = editingItemId;

      if (editingItemId) {
        await apiFetch(`/api/restaurant/menu/items/${editingItemId}`, {
          method: 'PATCH',
          body: JSON.stringify(itemPayload),
        });
      } else {
        const created = await apiFetch<{ id: string }>(
          '/api/restaurant/menu/items',
          {
            method: 'POST',
            body: JSON.stringify(itemPayload),
          },
        );
        targetItemId = created.id;
      }

      if (targetItemId && (editingItemId || recipeLines.length > 0)) {
        await apiFetch(`/api/restaurant/menu/items/${targetItemId}/recipe`, {
          method: 'PUT',
          body: JSON.stringify({ lines: recipeLines }),
        });
      }

      notify(
        editingItemId
          ? t('menu.itemUpdated', { name: payload.name })
          : t('menu.itemAdded'),
        'success',
      );
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
      throw err;
    }
  };

  const filteredItems = useMemo(
    () =>
      selectedCategoryFilter === 'ALL'
        ? items
        : items.filter((it) => it.categoryId === selectedCategoryFilter),
    [items, selectedCategoryFilter],
  );

  const toggleAvailable = async (item: MenuItem) => {
    try {
      await apiFetch(`/api/restaurant/menu/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ available: !item.available }),
      });
      notify(
        !item.available
          ? t('menu.markedAvailable', { name: item.name })
          : t('menu.markedUnavailable', { name: item.name }),
        'info',
      );
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const openRecipeModal = (item: MenuItem) => {
    setRecipeModalItem(item);
    const existing: DraftRecipeLine[] = (item.recipeLines || []).map(
      (l: MenuItemRecipeLine) => ({
        stockId: l.stockId,
        stockName: l.stockName,
        unit: l.unit,
        quantityPerUnit: l.quantityPerUnit,
        unitCostXof: l.unitCostXof,
        currentStockQty: l.currentStockQty,
      }),
    );
    setDraftLines(existing);
    if (stocks.length > 0) {
      const unused = stocks.find(
        (s) => !existing.some((line) => line.stockId === s.id),
      );
      setAddStockId((unused || stocks[0]).id);
    }
    setAddQty(0.2);
  };

  const handleAddDraftLine = () => {
    const stock = stocks.find((s) => s.id === addStockId);
    if (!stock || addQty <= 0) return;
    setDraftLines((prev) => {
      const idx = prev.findIndex((l) => l.stockId === stock.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantityPerUnit: Number(addQty),
        };
        return next;
      }
      return [
        ...prev,
        {
          stockId: stock.id,
          stockName: stock.name,
          unit: stock.unit,
          quantityPerUnit: Number(addQty),
          unitCostXof: stock.unitCostXof,
          currentStockQty: stock.quantity,
        },
      ];
    });
  };

  const handleSaveRecipe = async () => {
    if (!recipeModalItem) return;
    setSavingRecipe(true);
    try {
      await apiFetch(`/api/restaurant/menu/items/${recipeModalItem.id}/recipe`, {
        method: 'PUT',
        body: JSON.stringify({
          lines: draftLines.map((l) => ({
            stockId: l.stockId,
            quantityPerUnit: l.quantityPerUnit,
          })),
        }),
      });
      notify(t('menu.recipeSavedToast'), 'success');
      setRecipeModalItem(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setSavingRecipe(false);
    }
  };

  const computedFoodCost = Math.round(
    draftLines.reduce(
      (sum, l) => sum + l.quantityPerUnit * (l.unitCostXof || 0),
      0,
    ),
  );

  const handleCreateCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/restaurant/combos', {
        method: 'POST',
        body: JSON.stringify({
          name: comboForm.name,
          description: comboForm.description,
          priceXof: comboForm.priceXof,
          isDailySpecial: comboForm.isDailySpecial,
          items: comboForm.items
            .filter((i) => i.label.trim())
            .map((i) => ({
              label: i.label.trim(),
              quantity: Math.max(1, i.quantity),
              ...(i.menuItemId ? { menuItemId: i.menuItemId } : {}),
            })),
        }),
      });
      notify('Formule créée et publiée sur la carte.', 'success');
      setShowComboForm(false);
      setComboForm({
        name: '',
        description: '',
        priceXof: 9500,
        isDailySpecial: true,
        items: [
          { label: 'Plat du jour', quantity: 1, menuItemId: '' },
          { label: 'Boisson fraîche', quantity: 1, menuItemId: '' },
        ],
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const toggleComboActive = async (c: MenuCombo) => {
    try {
      await apiFetch(`/api/restaurant/combos/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !c.active }),
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const deleteCombo = async (id: string) => {
    try {
      await apiFetch(`/api/restaurant/combos/${id}`, { method: 'DELETE' });
      notify('Formule supprimée.', 'info');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleCreatePromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/restaurant/promotions', {
        method: 'POST',
        body: JSON.stringify({
          name: promoForm.name,
          promoType: promoForm.promoType,
          code: promoForm.promoType === 'PROMO_CODE' ? promoForm.code : undefined,
          discountType: promoForm.discountType,
          discountValue: promoForm.discountValue,
          minOrderXof: promoForm.minOrderXof,
          startTime: promoForm.startTime,
          endTime: promoForm.endTime,
          categoryId: promoForm.categoryId || null,
          maxUses: promoForm.maxUses ? Number(promoForm.maxUses) : null,
        }),
      });
      notify('Promotion enregistrée.', 'success');
      setShowPromoForm(false);
      setPromoForm({
        name: '',
        promoType: 'HAPPY_HOUR',
        code: '',
        discountType: 'PERCENT',
        discountValue: 20,
        minOrderXof: 0,
        startTime: '17:00',
        endTime: '20:00',
        categoryId: '',
        maxUses: '',
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const togglePromoActive = async (p: Promotion) => {
    try {
      await apiFetch(`/api/restaurant/promotions/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !p.active }),
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const deletePromo = async (id: string) => {
    try {
      await apiFetch(`/api/restaurant/promotions/${id}`, { method: 'DELETE' });
      notify('Promotion supprimée.', 'info');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  return (
    <RestaurantLayout
      title={t('pages.menuTitle')}
      actions={
        <div className="flex items-center gap-2">
          {activeTab === 'catalog' && (
            <>
              <button
                type="button"
                onClick={() => setShowCatForm((v) => !v)}
                className="px-3 py-2 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface)] hover:bg-[var(--rm-surface-hover)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer transition-colors"
              >
                {t('pages.newCategory')}
              </button>
              <button
                type="button"
                data-testid="menu-new-item-btn"
                onClick={() => {
                  setEditingItem(null);
                  setSheetOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('pages.newItem')}</span>
              </button>
            </>
          )}
          {activeTab === 'combos' && (
            <button
              type="button"
              data-testid="new-combo-btn"
              onClick={() => setShowComboForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvelle formule / Menu du jour</span>
            </button>
          )}
          {activeTab === 'promotions' && (
            <button
              type="button"
              data-testid="new-promo-btn"
              onClick={() => setShowPromoForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Happy Hour / Code Promo</span>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Sub-tabs */}
        <div className="inline-flex flex-wrap p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'catalog'
                ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Carte & Articles ({items.length})</span>
          </button>
          <button
            type="button"
            data-testid="menu-tab-combos"
            onClick={() => setActiveTab('combos')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'combos'
                ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Formules & Menus du jour ({combos.length})</span>
          </button>
          <button
            type="button"
            data-testid="menu-tab-promotions"
            onClick={() => setActiveTab('promotions')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'promotions'
                ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Happy Hour & Codes Promo ({promotions.length})</span>
          </button>
        </div>

        {activeTab === 'combos' && (
          <div className="space-y-5" data-testid="combos-panel">
            {showComboForm && (
              <form
                onSubmit={handleCreateCombo}
                className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-4"
              >
                <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                  Créer une formule ou un menu du jour
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Nom *</label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: Formule Midi Express"
                      value={comboForm.name}
                      onChange={(e) => setComboForm({ ...comboForm, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Prix forfait (FCFA) *</label>
                    <input
                      required
                      type="number"
                      min={0}
                      value={comboForm.priceXof}
                      onChange={(e) =>
                        setComboForm({ ...comboForm, priceXof: Number(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm tabular-nums"
                    />
                  </div>
                  <label className="flex items-center gap-2 pt-5 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={comboForm.isDailySpecial}
                      onChange={(e) =>
                        setComboForm({ ...comboForm, isDailySpecial: e.target.checked })
                      }
                    />
                    <span>Mettre en avant comme Menu du jour</span>
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Description courte (Entrée + Plat + Boisson…)"
                  value={comboForm.description}
                  onChange={(e) =>
                    setComboForm({ ...comboForm, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Éléments inclus</span>
                    <button
                      type="button"
                      onClick={() =>
                        setComboForm((prev) => ({
                          ...prev,
                          items: [...prev.items, { label: '', quantity: 1, menuItemId: '' }],
                        }))
                      }
                      className="text-xs font-semibold text-[#FF8738] hover:underline cursor-pointer"
                    >
                      + Ajouter un élément
                    </button>
                  </div>
                  {comboForm.items.map((ci, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Libellé (ex: Poulet Braisé)"
                        value={ci.label}
                        onChange={(e) =>
                          setComboForm((prev) => ({
                            ...prev,
                            items: prev.items.map((row, i) =>
                              i === idx ? { ...row, label: e.target.value } : row,
                            ),
                          }))
                        }
                        className="sm:col-span-5 px-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                      />
                      <select
                        value={ci.menuItemId}
                        onChange={(e) => {
                          const found = items.find((it) => it.id === e.target.value);
                          setComboForm((prev) => ({
                            ...prev,
                            items: prev.items.map((row, i) =>
                              i === idx
                                ? {
                                    ...row,
                                    menuItemId: e.target.value,
                                    label: row.label || found?.name || '',
                                  }
                                : row,
                            ),
                          }));
                        }}
                        className="sm:col-span-4 px-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                      >
                        <option value="">(Lien recette stock optionnel)</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={ci.quantity}
                        onChange={(e) =>
                          setComboForm((prev) => ({
                            ...prev,
                            items: prev.items.map((row, i) =>
                              i === idx
                                ? { ...row, quantity: Math.max(1, Number(e.target.value) || 1) }
                                : row,
                            ),
                          }))
                        }
                        className="sm:col-span-2 px-2 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setComboForm((prev) => ({
                            ...prev,
                            items: prev.items.filter((_, i) => i !== idx),
                          }))
                        }
                        className="sm:col-span-1 p-1.5 text-[#E05252] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#FF8738] text-white text-xs font-bold cursor-pointer"
                >
                  Enregistrer la formule
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {combos.map((c) => (
                <div
                  key={c.id}
                  className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#FF8738]">
                        {c.isDailySpecial ? 'Menu du jour' : 'Formule'}
                      </span>
                      <span className={c.active ? 'text-[#14B8A6] font-semibold' : 'text-[#E05252] font-semibold'}>
                        {c.active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-bold text-[var(--rm-ink)]">{c.name}</h3>
                    {c.description && (
                      <p className="text-xs text-[var(--rm-ink-muted)] mt-1">{c.description}</p>
                    )}
                    <ul className="mt-2 space-y-0.5 text-xs text-[var(--rm-ink-muted)]">
                      {c.items.map((ci, idx) => (
                        <li key={idx}>• {ci.quantity}× {ci.label}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="pt-3 border-t border-[var(--rm-border-subtle)] flex items-center justify-between gap-2">
                    <span className="font-extrabold text-sm tabular-nums text-[var(--rm-ink)]">
                      {formatFcfa(c.priceXof)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleComboActive(c)}
                        className="px-2.5 py-1 rounded-lg border border-[var(--rm-border)] text-xs font-semibold cursor-pointer"
                      >
                        {c.active ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCombo(c.id)}
                        className="p-1.5 text-[#E05252] cursor-pointer"
                        aria-label={`Supprimer ${c.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'promotions' && (
          <div className="space-y-5" data-testid="promotions-panel">
            {showPromoForm && (
              <form
                onSubmit={handleCreatePromotion}
                className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-4"
              >
                <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                  Créer une règle Happy Hour ou un code promotionnel
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Libellé *</label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: Happy Hour Cocktails"
                      value={promoForm.name}
                      onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Type</label>
                    <select
                      value={promoForm.promoType}
                      onChange={(e) =>
                        setPromoForm({
                          ...promoForm,
                          promoType: e.target.value as 'HAPPY_HOUR' | 'PROMO_CODE',
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm"
                    >
                      <option value="HAPPY_HOUR">Happy Hour (plage horaire)</option>
                      <option value="PROMO_CODE">Code Promo client</option>
                    </select>
                  </div>
                  {promoForm.promoType === 'PROMO_CODE' ? (
                    <div>
                      <label className="block text-xs font-semibold mb-1">Code Promo *</label>
                      <input
                        required
                        type="text"
                        placeholder="EX: WEEKEND15"
                        value={promoForm.code}
                        onChange={(e) =>
                          setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm font-mono uppercase"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold mb-1">Catégorie ciblée</label>
                      <select
                        value={promoForm.categoryId}
                        onChange={(e) => setPromoForm({ ...promoForm, categoryId: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-sm"
                      >
                        <option value="">Toute la carte</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Mode remise</label>
                    <select
                      value={promoForm.discountType}
                      onChange={(e) =>
                        setPromoForm({
                          ...promoForm,
                          discountType: e.target.value as 'PERCENT' | 'FIXED_XOF',
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                    >
                      <option value="PERCENT">Pourcentage (%)</option>
                      <option value="FIXED_XOF">Montant fixe (FCFA)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Valeur *</label>
                    <input
                      required
                      type="number"
                      min={1}
                      value={promoForm.discountValue}
                      onChange={(e) =>
                        setPromoForm({ ...promoForm, discountValue: Number(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Début</label>
                    <input
                      type="time"
                      value={promoForm.startTime}
                      onChange={(e) => setPromoForm({ ...promoForm, startTime: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Fin</label>
                    <input
                      type="time"
                      value={promoForm.endTime}
                      onChange={(e) => setPromoForm({ ...promoForm, endTime: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#FF8738] text-white text-xs font-bold cursor-pointer"
                >
                  Créer la promotion
                </button>
              </form>
            )}

            <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] divide-y divide-[var(--rm-border-subtle)]">
              {promotions.length === 0 ? (
                <p className="p-6 text-center text-xs text-[var(--rm-ink-muted)]">
                  Aucune promotion configurée.
                </p>
              ) : (
                promotions.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-bold text-sm text-[var(--rm-ink)]">
                        {p.name}{' '}
                        {p.code && (
                          <span className="ml-1.5 font-mono px-2 py-0.5 rounded bg-[#FF8738]/15 text-[#FF8738] text-xs">
                            {p.code}
                          </span>
                        )}
                      </p>
                      <p className="text-[var(--rm-ink-muted)] mt-0.5">
                        {p.promoType === 'HAPPY_HOUR'
                          ? `Happy Hour ${p.startTime}–${p.endTime}`
                          : `Code promo (${p.usesCount} utilisation(s))`}{' '}
                        · Remise :{' '}
                        <strong>
                          -{p.discountValue}
                          {p.discountType === 'PERCENT' ? '%' : ' FCFA'}
                        </strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void togglePromoActive(p)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                          p.active
                            ? 'bg-[#14B8A6]/15 text-[#14B8A6]'
                            : 'border border-[var(--rm-border)] text-[var(--rm-ink-muted)]'
                        }`}
                      >
                        {p.active ? 'Actif' : 'En pause'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deletePromo(p.id)}
                        className="p-1.5 text-[#E05252] cursor-pointer"
                        aria-label={`Supprimer ${p.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'catalog' && showCatForm && (
          <form
            onSubmit={handleCreateCat}
            className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 flex flex-wrap gap-4 items-end"
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('menu.catNameLabel')}
              </label>
              <input
                required
                type="text"
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('menu.kdsStationLabel')}
              </label>
              <select
                value={catForm.station}
                onChange={(e) =>
                  setCatForm({ ...catForm, station: e.target.value })
                }
                className="px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-sm bg-[var(--rm-surface)] text-[var(--rm-ink)]"
              >
                <option value="KITCHEN">{t('common.kitchen')}</option>
                <option value="BAR">{t('common.bar')}</option>
              </select>
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer"
            >
              {t('common.save')}
            </button>
          </form>
        )}

        {activeTab === 'catalog' && categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategoryFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                selectedCategoryFilter === 'ALL'
                  ? 'bg-[#182333] dark:bg-[#FF8738] text-white border-[#182333] dark:border-[#FF8738]'
                  : 'bg-[var(--rm-surface)] text-[var(--rm-ink-muted)] border-[var(--rm-border)] hover:text-[var(--rm-ink)]'
              }`}
            >
              {t('menu.allCategoriesFilter')} ({items.length})
            </button>
            {categories.map((c) => {
              const count = items.filter((it) => it.categoryId === c.id).length;
              const active = selectedCategoryFilter === c.id;
              return (
                <div
                  key={c.id}
                  className={`inline-flex items-center rounded-lg border transition-colors ${
                    active
                      ? 'bg-[#182333] dark:bg-[#FF8738] text-white border-[#182333] dark:border-[#FF8738]'
                      : 'bg-[var(--rm-surface)] text-[var(--rm-ink-muted)] border-[var(--rm-border)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryFilter(c.id)}
                    className={`px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      active ? 'text-white' : 'hover:text-[var(--rm-ink)]'
                    }`}
                  >
                    {c.name} ({count})
                  </button>
                  <button
                    type="button"
                    aria-label={`Modifier catégorie ${c.name}`}
                    onClick={() => {
                      setEditingCat(c);
                      setEditCatForm({ name: c.name, station: c.station });
                    }}
                    className={`p-1.5 cursor-pointer ${
                      active
                        ? 'text-white/80 hover:text-white'
                        : 'text-[var(--rm-ink-muted)] hover:text-[#FF8738]'
                    }`}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  {confirmDeleteCatId === c.id ? (
                    <div className="inline-flex items-center gap-1 pr-2">
                      <button
                        type="button"
                        onClick={() => void handleDeleteCat(c.id)}
                        className="px-1.5 py-0.5 rounded bg-[#E05252] text-white text-[10px] font-bold cursor-pointer"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCatId(null)}
                        className="px-1.5 py-0.5 rounded bg-[var(--rm-surface-muted)] text-[var(--rm-ink)] text-[10px] cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Supprimer catégorie ${c.name}`}
                      onClick={() => setConfirmDeleteCatId(c.id)}
                      className={`p-1.5 pr-2 cursor-pointer ${
                        active
                          ? 'text-white/80 hover:text-white'
                          : 'text-[var(--rm-ink-muted)] hover:text-[#E05252]'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'catalog' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((item) => {
            const recipeCount = item.recipeLines?.length ?? 0;
            return (
              <div
                key={item.id}
                className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="h-40 w-full overflow-hidden bg-[#182333]">
                    <ResilientImage
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      fallbackTitle={item.name}
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between text-xs text-[var(--rm-ink-muted)]">
                      <span>
                        {item.categoryName} ·{' '}
                        {item.station === 'BAR'
                          ? t('common.bar')
                          : t('common.kitchen')}
                      </span>
                      <span
                        className={`font-semibold ${
                          item.available ? 'text-[#14B8A6]' : 'text-[#E05252]'
                        }`}
                      >
                        {item.available
                          ? t('menu.availableStatus')
                          : t('menu.unavailableStatus')}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-base font-bold text-[var(--rm-ink)]">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--rm-ink-muted)] line-clamp-2">
                      {item.description || t('menu.noDescription')}
                    </p>
                    <p className="mt-2.5 text-[11px] font-medium text-[var(--rm-ink-muted)]">
                      {recipeCount > 0 ? (
                        <span className="text-[#14B8A6] font-semibold">
                          {t('menu.recipeCountBadge', { count: recipeCount })}
                        </span>
                      ) : (
                        t('menu.recipeUnlinkedBadge')
                      )}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3.5 border-t border-[var(--rm-border-subtle)] flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-[var(--rm-ink)] text-sm tabular-nums">
                    {formatFcfa(item.priceXof)}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      data-testid={`edit-item-btn-${item.id}`}
                      onClick={() => {
                        setEditingItem(item);
                        setSheetOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border)] text-[var(--rm-ink)] hover:border-[#FF8738] text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[var(--rm-ink-muted)]" />
                      <span>{t('menu.editItemBtn')}</span>
                    </button>
                    <button
                      type="button"
                      data-testid={`recipe-btn-${item.id}`}
                      onClick={() => openRecipeModal(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border)] text-[var(--rm-ink)] hover:border-[#FF8738] text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#FF8738]" />
                      <span>{t('menu.recipeBtn')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleAvailable(item)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        item.available
                          ? 'border border-[var(--rm-border)] text-[var(--rm-ink-muted)] hover:text-[#E05252]'
                          : 'bg-[#14B8A6] text-white'
                      }`}
                    >
                      {item.available
                        ? t('menu.setOutBtn')
                        : t('menu.setAvailableBtn')}
                    </button>
                    {confirmDeleteItemId === item.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDeleteItem(item.id)}
                          className="px-2 py-1 rounded bg-[#E05252] text-white text-[11px] font-semibold cursor-pointer"
                        >
                          Confirmer
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteItemId(null)}
                          className="px-2 py-1 rounded border border-[var(--rm-border)] text-[var(--rm-ink-muted)] text-[11px] cursor-pointer"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid={`delete-item-btn-${item.id}`}
                        onClick={() => setConfirmDeleteItemId(item.id)}
                        aria-label={`Supprimer ${item.name}`}
                        className="p-1.5 rounded-lg border border-[var(--rm-border)] text-[#E05252] hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      {/* Edit Category Modal */}
      {editingCat && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateCat}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-sm w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Modifier la catégorie
              </h3>
              <button
                type="button"
                onClick={() => setEditingCat(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('menu.catNameLabel')}
              </label>
              <input
                required
                type="text"
                value={editCatForm.name}
                onChange={(e) =>
                  setEditCatForm({ ...editCatForm, name: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('menu.kdsStationLabel')}
              </label>
              <select
                value={editCatForm.station}
                onChange={(e) =>
                  setEditCatForm({ ...editCatForm, station: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] text-sm bg-[var(--rm-surface)] text-[var(--rm-ink)]"
              >
                <option value="KITCHEN">{t('common.kitchen')}</option>
                <option value="BAR">{t('common.bar')}</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingCat(null)}
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

      {recipeModalItem && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-xl w-full p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--rm-ink)]">
                  {t('menu.recipeModalTitle', { name: recipeModalItem.name })}
                </h3>
                <p className="text-xs text-[var(--rm-ink-muted)] mt-0.5">
                  {t('menu.recipeModalSubtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRecipeModalItem(null)}
                className="p-1.5 rounded-lg text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {stocks.length > 0 && (
              <div className="flex flex-wrap gap-2 items-end p-3.5 rounded-xl bg-[var(--rm-surface-muted)] border border-[var(--rm-border)]">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                    {t('stocks.colIngredient')}
                  </label>
                  <select
                    value={addStockId}
                    onChange={(e) => setAddStockId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                  >
                    <option value="">
                      {t('menu.selectIngredientPlaceholder')}
                    </option>
                    {stocks.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.quantity} {st.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <label className="block text-[11px] font-semibold text-[var(--rm-ink)] mb-1">
                    {t('menu.qtyPerPortionLabel')}
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={addQty}
                    onChange={(e) => setAddQty(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddDraftLine}
                  className="px-3.5 py-2 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#FF8738] text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  {t('menu.addIngredientLineBtn')}
                </button>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto space-y-2">
              {draftLines.length === 0 ? (
                <p className="text-xs text-[var(--rm-ink-muted)] py-4 text-center">
                  {t('menu.noRecipeLinesYet')}
                </p>
              ) : (
                draftLines.map((line) => (
                  <div
                    key={line.stockId}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--rm-border-subtle)] bg-[var(--rm-surface)] text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--rm-ink)]">
                        {line.stockName}
                      </p>
                      <p className="text-[11px] text-[var(--rm-ink-muted)] tabular-nums">
                        {t('menu.currentStockUnit', {
                          qty: line.currentStockQty,
                          unit: line.unit,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min={0.01}
                        step="any"
                        value={line.quantityPerUnit}
                        onChange={(e) => {
                          const val = Math.max(0.01, Number(e.target.value) || 0);
                          setDraftLines((prev) =>
                            prev.map((p) =>
                              p.stockId === line.stockId
                                ? { ...p, quantityPerUnit: val }
                                : p,
                            ),
                          );
                        }}
                        className="w-20 px-2 py-1 rounded border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-right tabular-nums"
                      />
                      <span className="text-[var(--rm-ink-muted)] w-10">
                        {line.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftLines((prev) =>
                            prev.filter((p) => p.stockId !== line.stockId),
                          )
                        }
                        className="p-1 text-[#E05252] hover:bg-red-50 dark:hover:bg-red-950/30 rounded cursor-pointer"
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-[var(--rm-ink-muted)]">
                  {t('menu.estimatedFoodCost')}{' '}
                </span>
                <strong className="text-[var(--rm-ink)] tabular-nums">
                  {formatFcfa(computedFoodCost)}
                </strong>
              </div>
              <div>
                <span className="text-[var(--rm-ink-muted)]">
                  {t('menu.marginEstimate')}{' '}
                </span>
                <strong className="text-[#14B8A6] tabular-nums">
                  {formatFcfa(
                    Math.max(0, recipeModalItem.priceXof - computedFoodCost),
                  )}
                </strong>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRecipeModalItem(null)}
                className="flex-1 py-2.5 rounded-lg border border-[var(--rm-border-input)] text-[var(--rm-ink)] hover:bg-[var(--rm-surface-hover)] text-xs font-semibold cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={savingRecipe}
                onClick={() => void handleSaveRecipe()}
                className="flex-1 py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {t('menu.saveRecipeBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      <MenuItemSheetModal
        open={sheetOpen}
        editingItem={editingItem}
        categories={categories}
        stocks={stocks}
        onClose={() => {
          setSheetOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSaveItemSheet}
      />
    </RestaurantLayout>
  );
}
