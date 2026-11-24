import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRightLeft,
  Circle,
  GitMerge,
  LayoutGrid,
  Map as MapIcon,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RestaurantLayout } from '../RestaurantLayout';
import { useAuth } from '../../app/providers/AuthProvider';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { CardsGridSkeleton } from '../../components/LoadingSkeletons';
import { QrCodesPanel } from '../qr/QrCodesPage';
import { formatFcfa } from '../../utils/format';
import type { DiningTable } from '../../types';

type FloorTab = 'tables' | 'qr';
type TablesViewMode = 'grid' | 'map';

const MAP_WIDTH = 820;
const MAP_HEIGHT = 460;

export function FloorTablesPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const { can } = useAuth();
  const canReadQr = can('qr:read');
  const canManageQr = can('qr:manage');
  const canWriteFloor = can('floor:write');

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: FloorTab =
    requestedTab === 'qr' && canReadQr ? 'qr' : 'tables';

  const setActiveTab = (next: FloorTab) => {
    if (next === 'qr') {
      setSearchParams({ tab: 'qr' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<TablesViewMode>('grid');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    zone: 'Terrasse Lagune',
    label: '',
    capacity: 4,
    shape: 'ROUND' as 'ROUND' | 'RECT',
  });

  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [editForm, setEditForm] = useState({
    zone: '',
    label: '',
    capacity: 4,
    shape: 'ROUND' as 'ROUND' | 'RECT',
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [transferModal, setTransferModal] = useState<{
    source: DiningTable;
    mode: 'transfer' | 'merge';
    targetTableId: string;
  } | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const load = useCallback(() => {
    apiFetch<{ tables: DiningTable[] }>('/api/restaurant/tables')
      .then((res) => setTables(res.tables))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const idx = tables.length;
      const posX = 40 + (idx % 5) * 145;
      const posY = 40 + Math.floor(idx / 5) * 125;
      await apiFetch('/api/restaurant/tables', {
        method: 'POST',
        body: JSON.stringify({ ...form, posX, posY }),
      });
      notify(t('floor.tableCreatedToast'), 'success');
      setForm({ zone: 'Terrasse Lagune', label: '', capacity: 4, shape: 'ROUND' });
      setShowAdd(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/restaurant/tables/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const openEditModal = (tbl: DiningTable) => {
    setEditingTable(tbl);
    setEditForm({
      zone: tbl.zone,
      label: tbl.label,
      capacity: tbl.capacity,
      shape: tbl.shape === 'RECT' ? 'RECT' : 'ROUND',
    });
  };

  const handleUpdateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable) return;
    try {
      await apiFetch(`/api/restaurant/tables/${editingTable.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      notify('Table mise à jour.', 'success');
      setEditingTable(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleDeleteTable = async (id: string) => {
    try {
      await apiFetch(`/api/restaurant/tables/${id}`, { method: 'DELETE' });
      notify('Table supprimée.', 'info');
      setConfirmDeleteId(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleTransferOrMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModal || !transferModal.targetTableId) return;
    setTransferBusy(true);
    try {
      if (transferModal.mode === 'transfer') {
        await apiFetch(`/api/restaurant/tables/${transferModal.source.id}/transfer`, {
          method: 'POST',
          body: JSON.stringify({ targetTableId: transferModal.targetTableId }),
        });
        notify('Commande transférée vers la nouvelle table.', 'success');
      } else {
        await apiFetch(
          `/api/restaurant/tables/${transferModal.targetTableId}/merge`,
          {
            method: 'POST',
            body: JSON.stringify({ sourceTableId: transferModal.source.id }),
          },
        );
        notify('Tables fusionnées avec succès.', 'success');
      }
      setTransferModal(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setTransferBusy(false);
    }
  };

  const getTableCoords = (tbl: DiningTable, index: number) => ({
    x: typeof tbl.posX === 'number' ? tbl.posX : 40 + (index % 5) * 145,
    y: typeof tbl.posY === 'number' ? tbl.posY : 40 + Math.floor(index / 5) * 125,
  });

  const handlePointerDownTable = (
    e: React.PointerEvent<HTMLDivElement>,
    tbl: DiningTable,
    index: number,
  ) => {
    if (!canWriteFloor || !mapContainerRef.current) return;
    if ((e.target as HTMLElement).closest('button, a')) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const coords = getTableCoords(tbl, index);
    dragOffsetRef.current = {
      dx: e.clientX - rect.left + mapContainerRef.current.scrollLeft - coords.x,
      dy: e.clientY - rect.top + mapContainerRef.current.scrollTop - coords.y,
    };
    setDraggingId(tbl.id);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMoveMap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingId || !mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const nextX = Math.max(
      12,
      Math.min(
        MAP_WIDTH - 120,
        Math.round(
          e.clientX - rect.left + mapContainerRef.current.scrollLeft - dragOffsetRef.current.dx,
        ),
      ),
    );
    const nextY = Math.max(
      12,
      Math.min(
        MAP_HEIGHT - 105,
        Math.round(
          e.clientY - rect.top + mapContainerRef.current.scrollTop - dragOffsetRef.current.dy,
        ),
      ),
    );
    setTables((prev) =>
      prev.map((item) =>
        item.id === draggingId ? { ...item, posX: nextX, posY: nextY } : item,
      ),
    );
  };

  const handlePointerUpMap = async () => {
    if (!draggingId) return;
    const moved = tables.find((tbl) => tbl.id === draggingId);
    setDraggingId(null);
    if (!moved) return;
    try {
      await apiFetch(`/api/restaurant/tables/${moved.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ posX: moved.posX, posY: moved.posY }),
      });
    } catch {
      load();
    }
  };

  const zones = Array.from(new Set(tables.map((tbl) => tbl.zone)));

  return (
    <RestaurantLayout
      title={t('floor.title')}
      onRealtimeEvent={load}
      actions={
        activeTab === 'qr' ? (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer no-print"
          >
            <Printer className="w-4 h-4" />
            <span>{t('pages.printQrSheetBtn')}</span>
          </button>
        ) : canWriteFloor ? (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('floor.newTable')}</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
          {canReadQr && (
            <div
              role="tablist"
              aria-label={t('floor.title')}
              className="inline-flex p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'tables'}
                data-testid="floor-tab-tables"
                onClick={() => setActiveTab('tables')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'tables'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                    : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{t('floor.tabs.tables')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'qr'}
                data-testid="floor-tab-qr"
                onClick={() => setActiveTab('qr')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'qr'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                    : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{t('floor.tabs.qrCodes')}</span>
              </button>
            </div>
          )}

          {activeTab === 'tables' && (
            <div className="inline-flex p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1">
              <button
                type="button"
                data-testid="floor-view-grid"
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                    : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grille</span>
              </button>
              <button
                type="button"
                data-testid="floor-view-map"
                onClick={() => setViewMode('map')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  viewMode === 'map'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                    : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Plan visuel 2D</span>
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <CardsGridSkeleton
            cards={6}
            columnsClass="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            cardHeightClass="h-44"
            testId="floor-loading-skeleton"
          />
        ) : activeTab === 'qr' && canReadQr ? (
          <QrCodesPanel
            tables={tables}
            onReload={load}
            canManageQr={canManageQr}
            onConfigureTables={() => {
              setActiveTab('tables');
              setShowAdd(true);
            }}
          />
        ) : (
          <div className="space-y-6" data-testid="floor-tables-panel">
            {showAdd && canWriteFloor && (
              <form
                onSubmit={handleCreate}
                className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 grid grid-cols-1 sm:grid-cols-5 gap-4 items-end"
              >
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('floor.zoneLabel')}
                  </label>
                  <input
                    required
                    type="text"
                    value={form.zone}
                    onChange={(e) => setForm({ ...form, zone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('floor.tableNameLabel')}
                  </label>
                  <input
                    required
                    type="text"
                    placeholder={t('floor.tablePlaceholder')}
                    value={form.label}
                    onChange={(e) =>
                      setForm({ ...form, label: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('floor.capacityLabel')}
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={24}
                    value={form.capacity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        capacity: Number(e.target.value) || 4,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    Forme (plan)
                  </label>
                  <select
                    value={form.shape}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        shape: e.target.value === 'RECT' ? 'RECT' : 'ROUND',
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                  >
                    <option value="ROUND">Ronde</option>
                    <option value="RECT">Rectangulaire</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="py-2.5 px-4 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer"
                >
                  {t('common.add')}
                </button>
              </form>
            )}

            {viewMode === 'map' ? (
              <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--rm-ink-muted)]">
                  <span>
                    Glissez-déposez les tables pour organiser votre salle. Les positions sont sauvegardées automatiquement.
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#14B8A6]" /> Libre
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FF8738]" /> Occupée
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#E5A32A]" /> Réservée
                    </span>
                  </div>
                </div>

                <div
                  ref={mapContainerRef}
                  data-testid="floor-2d-canvas"
                  onPointerMove={handlePointerMoveMap}
                  onPointerUp={() => void handlePointerUpMap()}
                  className="relative overflow-auto rounded-xl border border-dashed border-[var(--rm-border-input)] bg-[var(--rm-surface-muted)]"
                  style={{ height: `${MAP_HEIGHT}px` }}
                >
                  <div
                    className="relative"
                    style={{ width: `${MAP_WIDTH}px`, height: `${MAP_HEIGHT - 12}px` }}
                  >
                    {tables.map((tbl, index) => {
                      const coords = getTableCoords(tbl, index);
                      const isRound = tbl.shape !== 'RECT';
                      const statusRing =
                        tbl.status === 'OCCUPIED'
                          ? 'border-[#FF8738] bg-[#FF8738]/12'
                          : tbl.status === 'RESERVED'
                            ? 'border-[#E5A32A] bg-[#E5A32A]/12'
                            : 'border-[#14B8A6] bg-[var(--rm-surface)]';
                      return (
                        <div
                          key={tbl.id}
                          onPointerDown={(e) => handlePointerDownTable(e, tbl, index)}
                          style={{
                            left: `${coords.x}px`,
                            top: `${coords.y}px`,
                            width: isRound ? '112px' : '136px',
                            height: isRound ? '112px' : '96px',
                          }}
                          className={`absolute select-none border-2 shadow-sm p-2 flex flex-col items-center justify-center text-center transition-shadow ${
                            isRound ? 'rounded-full' : 'rounded-xl'
                          } ${statusRing} ${
                            canWriteFloor ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${draggingId === tbl.id ? 'ring-2 ring-[#FF8738] z-20' : 'z-10'}`}
                        >
                          <p className="text-xs font-extrabold text-[var(--rm-ink)] leading-tight truncate max-w-full">
                            {tbl.label}
                          </p>
                          <p className="text-[10px] text-[var(--rm-ink-muted)] mt-0.5">
                            {tbl.capacity} pl. · {tbl.zone.split(' ')[0]}
                          </p>
                          {tbl.activeOrderTotalXof ? (
                            <p className="text-[10px] font-bold text-[#FF8738] tabular-nums mt-0.5">
                              {formatFcfa(tbl.activeOrderTotalXof)}
                            </p>
                          ) : null}
                          {canWriteFloor && (
                            <div className="flex items-center gap-1 mt-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(tbl)}
                                title="Modifier la table"
                                className="p-1 rounded bg-[var(--rm-surface)] border border-[var(--rm-border)] text-[var(--rm-ink-muted)] hover:text-[#FF8738] cursor-pointer"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              {Boolean(tbl.activeOrderTotalXof) && tables.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const other = tables.find((o) => o.id !== tbl.id);
                                    setTransferModal({
                                      source: tbl,
                                      mode: 'transfer',
                                      targetTableId: other?.id || '',
                                    });
                                  }}
                                  title="Transférer / Fusionner"
                                  className="p-1 rounded bg-[var(--rm-surface)] border border-[var(--rm-border)] text-[#FF8738] cursor-pointer"
                                >
                                  <ArrowRightLeft className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              zones.map((zone) => (
                <div key={zone} className="space-y-3">
                  <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                    {zone}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tables
                      .filter((tbl) => tbl.zone === zone)
                      .map((tbl) => (
                        <div
                          key={tbl.id}
                          className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 flex flex-col justify-between gap-4"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-[var(--rm-ink)]">
                                  {tbl.label}
                                </h3>
                                {tbl.shape === 'RECT' ? (
                                  <Square className="w-3 h-3 text-[var(--rm-ink-muted)]" />
                                ) : (
                                  <Circle className="w-3 h-3 text-[var(--rm-ink-muted)]" />
                                )}
                              </div>
                              <p className="text-xs text-[var(--rm-ink-muted)] flex items-center gap-1 mt-1">
                                <Users className="w-3.5 h-3.5" />
                                <span>
                                  {t('floor.seatsCount', { count: tbl.capacity })}
                                </span>
                              </p>
                            </div>
                            <span
                              className={`text-xs font-bold ${
                                tbl.status === 'OCCUPIED'
                                  ? 'text-[#FF8738]'
                                  : tbl.status === 'RESERVED'
                                    ? 'text-[#E5A32A]'
                                    : 'text-[#14B8A6]'
                              }`}
                            >
                              {t(`floor.statuses.${tbl.status}`)}
                            </span>
                          </div>

                          {tbl.activeOrderTotalXof ? (
                            <div className="p-3 rounded-lg bg-[var(--rm-surface-muted)] text-xs flex justify-between items-center gap-2">
                              <span className="text-[var(--rm-ink-muted)]">
                                {t('floor.activeTab')}
                              </span>
                              <span className="font-bold text-[var(--rm-ink)] tabular-nums">
                                {formatFcfa(tbl.activeOrderTotalXof)}
                              </span>
                            </div>
                          ) : null}

                          {tbl.qrToken && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-[var(--rm-ink-muted)] font-mono truncate">
                                QR v{tbl.qrVersion || 1}
                              </span>
                              <Link
                                to={`/q/${encodeURIComponent(tbl.qrToken)}`}
                                target="_blank"
                                className="inline-flex items-center gap-1 font-semibold text-[#FF8738] hover:underline"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                <span>{t('floor.openQrMenu')}</span>
                              </Link>
                            </div>
                          )}

                          {canWriteFloor && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => openEditModal(tbl)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border)] text-[var(--rm-ink)] hover:border-[#FF8738] font-semibold cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Modifier</span>
                              </button>

                              {Boolean(tbl.activeOrderTotalXof) && tables.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const free = tables.find(
                                        (o) => o.id !== tbl.id && !o.activeOrderTotalXof,
                                      ) || tables.find((o) => o.id !== tbl.id);
                                      setTransferModal({
                                        source: tbl,
                                        mode: 'transfer',
                                        targetTableId: free?.id || '',
                                      });
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border)] text-[var(--rm-ink)] hover:border-[#FF8738] font-semibold cursor-pointer"
                                  >
                                    <ArrowRightLeft className="w-3 h-3 text-[#FF8738]" />
                                    <span>Transférer</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const other = tables.find((o) => o.id !== tbl.id);
                                      setTransferModal({
                                        source: tbl,
                                        mode: 'merge',
                                        targetTableId: other?.id || '',
                                      });
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border)] text-[var(--rm-ink)] hover:border-[#14B8A6] font-semibold cursor-pointer"
                                  >
                                    <GitMerge className="w-3 h-3 text-[#14B8A6]" />
                                    <span>Fusionner</span>
                                  </button>
                                </>
                              )}

                              {confirmDeleteId === tbl.id ? (
                                <div className="inline-flex items-center gap-1 ml-auto">
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteTable(tbl.id)}
                                    className="px-2 py-1 rounded bg-[#E05252] text-white font-semibold cursor-pointer"
                                  >
                                    Confirmer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2 py-1 rounded border border-[var(--rm-border)] text-[var(--rm-ink-muted)] cursor-pointer"
                                  >
                                    Annuler
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(tbl.id)}
                                  aria-label={`Supprimer ${tbl.label}`}
                                  className="ml-auto p-1.5 rounded-lg border border-[var(--rm-border)] text-[#E05252] hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2 pt-2 border-t border-[var(--rm-border-subtle)]">
                            {(['AVAILABLE', 'OCCUPIED', 'RESERVED'] as const).map(
                              (st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => setStatus(tbl.id, st)}
                                  className={`flex-1 py-1.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                                    tbl.status === st
                                      ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                                      : 'bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                                  }`}
                                >
                                  {t(`floor.statuses.${st}`)}
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Edit Table Modal */}
      {editingTable && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateTable}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Modifier {editingTable.label}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTable(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('floor.zoneLabel')}
              </label>
              <input
                required
                type="text"
                value={editForm.zone}
                onChange={(e) => setEditForm({ ...editForm, zone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('floor.tableNameLabel')}
              </label>
              <input
                required
                type="text"
                value={editForm.label}
                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('floor.capacityLabel')}
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  max={24}
                  value={editForm.capacity}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      capacity: Number(e.target.value) || 4,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Forme (plan)
                </label>
                <select
                  value={editForm.shape}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      shape: e.target.value === 'RECT' ? 'RECT' : 'ROUND',
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                >
                  <option value="ROUND">Ronde</option>
                  <option value="RECT">Rectangulaire</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingTable(null)}
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

      {/* Transfer / Merge Modal */}
      {transferModal && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleTransferOrMerge}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                {transferModal.mode === 'transfer'
                  ? `Transférer ${transferModal.source.label}`
                  : `Fusionner ${transferModal.source.label}`}
              </h3>
              <button
                type="button"
                onClick={() => setTransferModal(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTransferModal({ ...transferModal, mode: 'transfer' })}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                  transferModal.mode === 'transfer'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white border-transparent'
                    : 'border-[var(--rm-border)] text-[var(--rm-ink-muted)]'
                }`}
              >
                Transférer (table libre)
              </button>
              <button
                type="button"
                onClick={() => setTransferModal({ ...transferModal, mode: 'merge' })}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                  transferModal.mode === 'merge'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white border-transparent'
                    : 'border-[var(--rm-border)] text-[var(--rm-ink-muted)]'
                }`}
              >
                Fusionner les additions
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                Table de destination
              </label>
              <select
                required
                value={transferModal.targetTableId}
                onChange={(e) =>
                  setTransferModal({
                    ...transferModal,
                    targetTableId: e.target.value,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              >
                {tables
                  .filter((tbl) => tbl.id !== transferModal.source.id)
                  .map((tbl) => (
                    <option key={tbl.id} value={tbl.id}>
                      {tbl.label} ({tbl.zone}) —{' '}
                      {tbl.activeOrderTotalXof
                        ? `Addition ${formatFcfa(tbl.activeOrderTotalXof)}`
                        : t(`floor.statuses.${tbl.status}`)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTransferModal(null)}
                className="flex-1 py-2.5 rounded-lg border border-[var(--rm-border-input)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={transferBusy || !transferModal.targetTableId}
                className="flex-1 py-2.5 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {transferBusy
                  ? 'Traitement...'
                  : transferModal.mode === 'transfer'
                    ? 'Confirmer le transfert'
                    : 'Confirmer la fusion'}
              </button>
            </div>
          </form>
        </div>
      )}
    </RestaurantLayout>
  );
}
