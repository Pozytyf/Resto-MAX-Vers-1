import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ImagePlus,
  Link2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ResilientImage } from '../../components/ResilientImage';
import { formatFcfa } from '../../utils/format';
import {
  PRESET_DISH_IMAGES,
  optimizeImageFileToDataUrl,
  validateMenuImageUrl,
} from './imageUpload';
import type {
  MenuCategory,
  MenuItem,
  MenuOption,
  MenuOptionGroup,
  StockItem,
} from '../../types';

export interface MenuItemSheetSubmitPayload {
  categoryId: string;
  name: string;
  description: string;
  priceXof: number;
  costPriceXof: number;
  imageUrl: string | null;
  available: boolean;
  sortOrder: number;
  options: Array<{ id?: string; label: string; priceDeltaXof: number }>;
  optionGroups: MenuOptionGroup[];
  recipeLines: Array<{ stockId: string; quantityPerUnit: number }>;
}

interface DraftOptionRow {
  localId: string;
  id?: string;
  label: string;
  priceDeltaXof: number;
}

interface DraftOptionGroupRow {
  localId: string;
  id: string;
  name: string;
  required: boolean;
  multiple: boolean;
  choices: DraftOptionRow[];
}

interface DraftRecipeRow {
  stockId: string;
  stockName: string;
  unit: string;
  quantityPerUnit: number;
  unitCostXof: number;
}

interface MenuItemSheetModalProps {
  open: boolean;
  editingItem: MenuItem | null;
  categories: MenuCategory[];
  stocks: StockItem[];
  onClose: () => void;
  onSubmit: (
    payload: MenuItemSheetSubmitPayload,
    editingItemId?: string,
  ) => Promise<void>;
}

export function MenuItemSheetModal({
  open,
  editingItem,
  categories,
  stocks,
  onClose,
  onSubmit,
}: MenuItemSheetModalProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceXof, setPriceXof] = useState<number>(5000);
  const [costPriceXof, setCostPriceXof] = useState<number>(2000);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [available, setAvailable] = useState<boolean>(true);
  const [sortOrder, setSortOrder] = useState<number>(10);
  const [options, setOptions] = useState<DraftOptionRow[]>([]);
  const [optionGroups, setOptionGroups] = useState<DraftOptionGroupRow[]>([]);
  const [recipeLines, setRecipeLines] = useState<DraftRecipeRow[]>([]);

  const [addStockId, setAddStockId] = useState<string>('');
  const [addStockQty, setAddStockQty] = useState<number>(0.2);

  const [dragActive, setDragActive] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (editingItem) {
      setCategoryId(editingItem.categoryId || categories[0]?.id || '');
      setName(editingItem.name);
      setDescription(editingItem.description || '');
      setPriceXof(editingItem.priceXof);
      setCostPriceXof(editingItem.costPriceXof);
      setImageUrl(editingItem.imageUrl || '');
      setAvailable(editingItem.available);
      setSortOrder(editingItem.sortOrder ?? 10);
      setOptions(
        (editingItem.options || []).map((opt: MenuOption, idx) => ({
          localId: `${opt.id}-${idx}`,
          id: opt.id,
          label: opt.label,
          priceDeltaXof: opt.priceDeltaXof,
        })),
      );
      setOptionGroups(
        (editingItem.optionGroups || []).map((grp, idx) => ({
          localId: `${grp.id}-${idx}`,
          id: grp.id,
          name: grp.name,
          required: Boolean(grp.required),
          multiple: Boolean(grp.multiple),
          choices: (grp.choices || []).map((ch, cIdx) => ({
            localId: `${ch.id}-${cIdx}`,
            id: ch.id,
            label: ch.label,
            priceDeltaXof: ch.priceDeltaXof,
          })),
        })),
      );
      setRecipeLines(
        (editingItem.recipeLines || []).map((line) => ({
          stockId: line.stockId,
          stockName: line.stockName,
          unit: line.unit,
          quantityPerUnit: line.quantityPerUnit,
          unitCostXof: line.unitCostXof,
        })),
      );
    } else {
      setCategoryId(categories[0]?.id || '');
      setName('');
      setDescription('');
      setPriceXof(5000);
      setCostPriceXof(1800);
      setImageUrl('');
      setAvailable(true);
      setSortOrder(10);
      setOptions([]);
      setOptionGroups([]);
      setRecipeLines([]);
    }

    setPhotoError(null);
    setDragActive(false);
    setAddStockId(stocks[0]?.id || '');
    setAddStockQty(0.2);
  }, [categories, editingItem, open, stocks]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || null,
    [categories, categoryId],
  );

  const unitMarginXof = priceXof - costPriceXof;
  const marginPct =
    priceXof > 0 ? Math.round((unitMarginXof / priceXof) * 100) : 0;

  const computedRecipeCostXof = useMemo(
    () =>
      Math.round(
        recipeLines.reduce(
          (sum, line) => sum + line.quantityPerUnit * (line.unitCostXof || 0),
          0,
        ),
      ),
    [recipeLines],
  );

  if (!open) return null;

  const processPhotoFile = async (file: File | undefined | null) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const optimizedDataUrl = await optimizeImageFileToDataUrl(file);
      setImageUrl(optimizedDataUrl);
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : t('menu.photoInvalidError'),
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    void processPhotoFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    void processPhotoFile(file);
  };

  const handleAddOption = () => {
    setOptions((prev) => [
      ...prev,
      {
        localId: `opt-${Date.now()}-${Math.random()}`,
        label: '',
        priceDeltaXof: 0,
      },
    ]);
  };

  const handleAddRecipeLine = () => {
    const stock = stocks.find((s) => s.id === addStockId);
    if (!stock || addStockQty <= 0) return;

    setRecipeLines((prev) => {
      const idx = prev.findIndex((r) => r.stockId === stock.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantityPerUnit: Number(addStockQty),
        };
        return next;
      }
      return [
        ...prev,
        {
          stockId: stock.id,
          stockName: stock.name,
          unit: stock.unit,
          quantityPerUnit: Number(addStockQty),
          unitCostXof: stock.unitCostXof,
        },
      ];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = imageUrl.trim();
    if (trimmedUrl && !validateMenuImageUrl(trimmedUrl)) {
      setPhotoError(t('menu.photoInvalidError'));
      return;
    }

    setSaving(true);
    try {
      await onSubmit(
        {
          categoryId,
          name: name.trim(),
          description: description.trim(),
          priceXof: Math.max(0, Math.round(Number(priceXof) || 0)),
          costPriceXof: Math.max(0, Math.round(Number(costPriceXof) || 0)),
          imageUrl: trimmedUrl || null,
          available,
          sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)),
          options: options
            .filter((o) => o.label.trim().length > 0)
            .map((o) => ({
              id: o.id,
              label: o.label.trim(),
              priceDeltaXof: Math.max(0, Math.round(Number(o.priceDeltaXof) || 0)),
            })),
          optionGroups: optionGroups
            .filter((g) => g.name.trim().length > 0)
            .map((g) => ({
              id: g.id,
              name: g.name.trim(),
              required: g.required,
              multiple: g.multiple,
              choices: g.choices
                .filter((ch) => ch.label.trim().length > 0)
                .map((ch, idx) => ({
                  id: ch.id || `opt_${Date.now()}_${idx}`,
                  label: ch.label.trim(),
                  priceDeltaXof: Math.max(
                    0,
                    Math.round(Number(ch.priceDeltaXof) || 0),
                  ),
                })),
            }))
            .filter((g) => g.choices.length > 0),
          recipeLines: recipeLines.map((r) => ({
            stockId: r.stockId,
            quantityPerUnit: r.quantityPerUnit,
          })),
        },
        editingItem?.id,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="menu-item-sheet-modal"
      className="fixed inset-0 z-50 bg-[#0B1220]/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--rm-border)] flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-extrabold text-[var(--rm-ink)]">
                {editingItem
                  ? t('menu.sheetEditTitle', { name: editingItem.name })
                  : t('menu.sheetCreateTitle')}
              </h2>
              {selectedCategory && (
                <span className="px-2 py-0.5 rounded-md bg-[var(--rm-surface-muted)] border border-[var(--rm-border)] text-[11px] font-semibold text-[var(--rm-ink-muted)]">
                  {selectedCategory.station === 'BAR'
                    ? t('common.bar')
                    : t('common.kitchen')}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--rm-ink-muted)] mt-0.5">
              {t('menu.sheetSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2 rounded-lg text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] hover:bg-[var(--rm-surface-hover)] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Photo Upload & Preview */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--rm-ink-muted)] flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-[#FF8738]" />
                  <span>{t('menu.photoSectionTitle')}</span>
                </label>
                {imageUrl && (
                  <button
                    type="button"
                    data-testid="item-photo-clear-btn"
                    onClick={() => {
                      setImageUrl('');
                      setPhotoError(null);
                    }}
                    className="text-[11px] font-semibold text-[#E05252] hover:underline cursor-pointer"
                  >
                    {t('menu.removePhotoBtn')}
                  </button>
                )}
              </div>

              {/* Card Preview */}
              <div className="relative h-48 w-full rounded-xl overflow-hidden border border-[var(--rm-border)] bg-[#182333]">
                <ResilientImage
                  src={imageUrl || null}
                  alt={name || t('menu.photoPreviewAlt')}
                  className="w-full h-full object-cover"
                  fallbackTitle={name || t('menu.photoEmptyPreview')}
                />
                {photoBusy && (
                  <div className="absolute inset-0 bg-[#0B1220]/70 flex items-center justify-center text-xs font-semibold text-white">
                    {t('menu.photoOptimizing')}
                  </div>
                )}
              </div>
            </div>

            {/* Drag & Drop / File Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                dragActive
                  ? 'border-[#FF8738] bg-[#FF8738]/10'
                  : 'border-[var(--rm-border-input)] bg-[var(--rm-surface-muted)]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                data-testid="item-photo-file-input"
                className="sr-only"
              />
              <Upload className="w-5 h-5 text-[#FF8738] mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-[var(--rm-ink)]">
                {t('menu.photoDropTitle')}
              </p>
              <p className="text-[11px] text-[var(--rm-ink-muted)] mt-0.5">
                {t('menu.photoDropHint')}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#FF8738] text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>{t('menu.choosePhotoBtn')}</span>
              </button>
            </div>

            {photoError && (
              <p className="text-xs font-medium text-[#E05252]">{photoError}</p>
            )}

            {/* External / Path URL Input */}
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-[var(--rm-ink-muted)]" />
                  <span>{t('menu.photoUrlLabel')}</span>
                </span>
              </label>
              <input
                type="text"
                data-testid="item-photo-url-input"
                value={imageUrl.startsWith('data:') ? '' : imageUrl}
                onChange={(e) => {
                  setPhotoError(null);
                  setImageUrl(e.target.value);
                }}
                placeholder={
                  imageUrl.startsWith('data:')
                    ? t('menu.photoUploadedLocalPlaceholder')
                    : 'https://…'
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
              />
            </div>

            {/* Starter Dish Photo Gallery */}
            <div>
              <p className="text-[11px] font-semibold text-[var(--rm-ink-muted)] mb-2">
                {t('menu.photoGalleryLabel')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_DISH_IMAGES.map((preset) => {
                  const selected = imageUrl === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`item-photo-preset-${preset.id}`}
                      onClick={() => {
                        setPhotoError(null);
                        setImageUrl(preset.url);
                      }}
                      className={`group relative rounded-lg overflow-hidden border text-left cursor-pointer transition-all ${
                        selected
                          ? 'border-[#FF8738] ring-2 ring-[#FF8738]/40'
                          : 'border-[var(--rm-border)] hover:border-[#FF8738]/60'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={t(preset.labelKey)}
                        className="w-full h-14 object-cover"
                      />
                      {selected && (
                        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#FF8738] text-white flex items-center justify-center">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                      <span className="block px-1.5 py-1 text-[10px] font-medium text-[var(--rm-ink)] truncate bg-[var(--rm-surface)]">
                        {t(preset.labelKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Details, Pricing, Options & Recipe */}
          <div className="lg:col-span-7 space-y-5">
            {/* General Information */}
            <div className="space-y-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--rm-ink-muted)]">
                {t('menu.generalSectionTitle')}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('menu.itemNameLabel')} *
                  </label>
                  <input
                    required
                    minLength={2}
                    type="text"
                    data-testid="item-name-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('menu.itemNamePlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('menu.categoryLabel')} *
                  </label>
                  <select
                    required
                    data-testid="item-category-select"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (
                        {c.station === 'BAR'
                          ? t('common.bar')
                          : t('common.kitchen')}
                        )
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('menu.descriptionLabel')}
                </label>
                <textarea
                  rows={3}
                  data-testid="item-description-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('menu.descriptionPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-center">
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={available}
                    onChange={(e) => setAvailable(e.target.checked)}
                    data-testid="item-available-checkbox"
                    className="accent-[#14B8A6] rounded cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-[var(--rm-ink)]">
                    {t('menu.availableImmediatelyLabel')}
                  </span>
                </label>

                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('menu.sortOrderLabel')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={sortOrder}
                    onChange={(e) =>
                      setSortOrder(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Pricing & Margin */}
            <div className="pt-4 border-t border-[var(--rm-border-subtle)] space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--rm-ink-muted)]">
                {t('menu.pricingSectionTitle')}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-end">
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('menu.salePriceLabel')} *
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    data-testid="item-price-input"
                    value={priceXof}
                    onChange={(e) =>
                      setPriceXof(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('menu.costPriceLabel')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    data-testid="item-cost-input"
                    value={costPriceXof}
                    onChange={(e) =>
                      setCostPriceXof(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-[var(--rm-surface-muted)] border border-[var(--rm-border)]">
                  <p className="text-[11px] text-[var(--rm-ink-muted)]">
                    {t('menu.unitMarginLabel')}
                  </p>
                  <p
                    className={`text-xs font-extrabold tabular-nums mt-0.5 ${
                      unitMarginXof < 0
                        ? 'text-[#E05252]'
                        : marginPct >= 50
                          ? 'text-[#14B8A6]'
                          : 'text-[#FF8738]'
                    }`}
                  >
                    {formatFcfa(unitMarginXof)} ({marginPct}%)
                  </p>
                </div>
              </div>
            </div>

            {/* Client Options & Supplements */}
            <div className="pt-4 border-t border-[var(--rm-border-subtle)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--rm-ink-muted)]">
                    {t('menu.optionsSectionTitle')}
                  </h3>
                  <p className="text-[11px] text-[var(--rm-ink-muted)]">
                    {t('menu.optionsSectionSubtitle')}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="item-add-option-btn"
                  onClick={handleAddOption}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border)] hover:border-[#FF8738] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-[#FF8738]" />
                  <span>{t('menu.addOptionBtn')}</span>
                </button>
              </div>

              {options.length > 0 && (
                <div className="space-y-2">
                  {options.map((opt) => (
                    <div
                      key={opt.localId}
                      className="flex items-center gap-2 bg-[var(--rm-surface-muted)] p-2 rounded-lg border border-[var(--rm-border-subtle)]"
                    >
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) =>
                          setOptions((prev) =>
                            prev.map((row) =>
                              row.localId === opt.localId
                                ? { ...row, label: e.target.value }
                                : row,
                            ),
                          )
                        }
                        placeholder={t('menu.optionLabelPlaceholder')}
                        className="flex-1 px-2.5 py-1.5 rounded-md border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min={0}
                          value={opt.priceDeltaXof}
                          onChange={(e) => {
                            const val = Math.max(
                              0,
                              Number(e.target.value) || 0,
                            );
                            setOptions((prev) =>
                              prev.map((row) =>
                                row.localId === opt.localId
                                  ? { ...row, priceDeltaXof: val }
                                  : row,
                              ),
                            );
                          }}
                          className="w-24 px-2.5 py-1.5 rounded-md border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs text-right tabular-nums"
                        />
                        <span className="text-[11px] text-[var(--rm-ink-muted)]">
                          FCFA
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setOptions((prev) =>
                            prev.filter((row) => row.localId !== opt.localId),
                          )
                        }
                        aria-label={t('common.delete')}
                        className="p-1.5 text-[#E05252] hover:bg-red-50 dark:hover:bg-red-950/30 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Structured Option Groups: Variantes, Cuissons & Accompagnements */}
              <div className="pt-3 border-t border-[var(--rm-border-subtle)] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--rm-ink)]">
                      Groupes de variantes & cuissons (obligatoires / choix multiples)
                    </h4>
                    <p className="text-[11px] text-[var(--rm-ink-muted)]">
                      Ex : Cuisson (À point / Bien cuit), Accompagnement (Alloco / Attiéké), Taille…
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="item-add-option-group-btn"
                    onClick={() =>
                      setOptionGroups((prev) => [
                        ...prev,
                        {
                          localId: `grp-${Date.now()}-${Math.random()}`,
                          id: `grp_${Date.now().toString(36)}`,
                          name: '',
                          required: true,
                          multiple: false,
                          choices: [
                            {
                              localId: `ch-${Date.now()}-1`,
                              id: `opt_${Date.now().toString(36)}_1`,
                              label: '',
                              priceDeltaXof: 0,
                            },
                          ],
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border)] hover:border-[#14B8A6] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#14B8A6]" />
                    <span>Ajouter un groupe</span>
                  </button>
                </div>

                {optionGroups.map((grp) => (
                  <div
                    key={grp.localId}
                    className="p-3 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nom du groupe (ex: Cuisson)"
                        value={grp.name}
                        onChange={(e) =>
                          setOptionGroups((prev) =>
                            prev.map((g) =>
                              g.localId === grp.localId
                                ? { ...g, name: e.target.value }
                                : g,
                            ),
                          )
                        }
                        className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded-md border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs font-semibold"
                      />
                      <label className="inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={grp.required}
                          onChange={(e) =>
                            setOptionGroups((prev) =>
                              prev.map((g) =>
                                g.localId === grp.localId
                                  ? { ...g, required: e.target.checked }
                                  : g,
                              ),
                            )
                          }
                        />
                        <span>Obligatoire</span>
                      </label>
                      <label className="inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={grp.multiple}
                          onChange={(e) =>
                            setOptionGroups((prev) =>
                              prev.map((g) =>
                                g.localId === grp.localId
                                  ? { ...g, multiple: e.target.checked }
                                  : g,
                              ),
                            )
                          }
                        />
                        <span>Multiple</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setOptionGroups((prev) =>
                            prev.filter((g) => g.localId !== grp.localId),
                          )
                        }
                        className="p-1 text-[#E05252] cursor-pointer"
                        aria-label="Supprimer groupe"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1.5 pl-2 border-l-2 border-[var(--rm-border)]">
                      {grp.choices.map((ch) => (
                        <div key={ch.localId} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Choix (ex: Bien cuit)"
                            value={ch.label}
                            onChange={(e) =>
                              setOptionGroups((prev) =>
                                prev.map((g) =>
                                  g.localId === grp.localId
                                    ? {
                                        ...g,
                                        choices: g.choices.map((c) =>
                                          c.localId === ch.localId
                                            ? { ...c, label: e.target.value }
                                            : c,
                                        ),
                                      }
                                    : g,
                                ),
                              )
                            }
                            className="flex-1 px-2.5 py-1 rounded border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs"
                          />
                          <input
                            type="number"
                            min={0}
                            value={ch.priceDeltaXof}
                            onChange={(e) =>
                              setOptionGroups((prev) =>
                                prev.map((g) =>
                                  g.localId === grp.localId
                                    ? {
                                        ...g,
                                        choices: g.choices.map((c) =>
                                          c.localId === ch.localId
                                            ? {
                                                ...c,
                                                priceDeltaXof: Math.max(
                                                  0,
                                                  Number(e.target.value) || 0,
                                                ),
                                              }
                                            : c,
                                        ),
                                      }
                                    : g,
                                ),
                              )
                            }
                            className="w-20 px-2 py-1 rounded border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-right tabular-nums"
                          />
                          <span className="text-[10px] text-[var(--rm-ink-muted)]">
                            FCFA
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setOptionGroups((prev) =>
                                prev.map((g) =>
                                  g.localId === grp.localId
                                    ? {
                                        ...g,
                                        choices: g.choices.filter(
                                          (c) => c.localId !== ch.localId,
                                        ),
                                      }
                                    : g,
                                ),
                              )
                            }
                            className="p-1 text-[#E05252] cursor-pointer"
                            aria-label="Retirer choix"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setOptionGroups((prev) =>
                            prev.map((g) =>
                              g.localId === grp.localId
                                ? {
                                    ...g,
                                    choices: [
                                      ...g.choices,
                                      {
                                        localId: `ch-${Date.now()}-${Math.random()}`,
                                        id: `opt_${Date.now().toString(36)}`,
                                        label: '',
                                        priceDeltaXof: 0,
                                      },
                                    ],
                                  }
                                : g,
                            ),
                          )
                        }
                        className="text-[11px] font-semibold text-[#FF8738] hover:underline cursor-pointer"
                      >
                        + Ajouter un choix
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional Stock Recipe Linking */}
            {stocks.length > 0 && (
              <div className="pt-4 border-t border-[var(--rm-border-subtle)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--rm-ink-muted)]">
                      {t('menu.recipeSectionTitle')}
                    </h3>
                    <p className="text-[11px] text-[var(--rm-ink-muted)]">
                      {t('menu.recipeModalSubtitle')}
                    </p>
                  </div>
                  {computedRecipeCostXof > 0 && (
                    <button
                      type="button"
                      onClick={() => setCostPriceXof(computedRecipeCostXof)}
                      className="text-[11px] font-semibold text-[#14B8A6] hover:underline cursor-pointer"
                    >
                      {t('menu.applyRecipeCostBtn', {
                        amount: formatFcfa(computedRecipeCostXof),
                      })}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 items-end p-3 rounded-xl bg-[var(--rm-surface-muted)] border border-[var(--rm-border)]">
                  <div className="flex-1 min-w-[160px]">
                    <select
                      value={addStockId}
                      onChange={(e) => setAddStockId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                    >
                      {stocks.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.quantity} {st.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={addStockQty}
                    onChange={(e) =>
                      setAddStockQty(Number(e.target.value) || 0)
                    }
                    className="w-24 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={handleAddRecipeLine}
                    className="px-3 py-1.5 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#FF8738] text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    {t('menu.addIngredientLineBtn')}
                  </button>
                </div>

                {recipeLines.length > 0 && (
                  <div className="space-y-1.5">
                    {recipeLines.map((line) => (
                      <div
                        key={line.stockId}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--rm-border-subtle)] bg-[var(--rm-surface)] text-xs"
                      >
                        <span className="font-medium text-[var(--rm-ink)] truncate">
                          {line.stockName}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold tabular-nums text-[var(--rm-ink-muted)]">
                            {line.quantityPerUnit} {line.unit}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRecipeLines((prev) =>
                                prev.filter((r) => r.stockId !== line.stockId),
                              )
                            }
                            aria-label={t('common.delete')}
                            className="p-1 text-[#E05252] hover:bg-red-50 dark:hover:bg-red-950/30 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-4 border-t border-[var(--rm-border)] bg-[var(--rm-surface-muted)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] hover:bg-[var(--rm-surface-hover)] text-xs font-semibold cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || photoBusy || !categoryId}
            data-testid="item-sheet-submit-btn"
            className="px-5 py-2.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
          >
            {saving
              ? t('menu.savingItemBtn')
              : editingItem
                ? t('menu.saveItemChangesBtn')
                : t('menu.addToMenuBtn')}
          </button>
        </div>
      </form>
    </div>
  );
}
