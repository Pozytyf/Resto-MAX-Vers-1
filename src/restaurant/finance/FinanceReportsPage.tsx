import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightLeft,
  Download,
  FileText,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { RestaurantLayout } from '../RestaurantLayout';
import { apiFetch, getStoredToken } from '../../services/api';
import { useToast } from '../../components/Toast';
import {
  CardsGridSkeleton,
  TableSkeleton,
} from '../../components/LoadingSkeletons';
import {
  formatDateFr,
  formatDateTimeFr,
  formatFcfa,
  getPaymentMethodLabel,
} from '../../utils/format';
import type {
  B2bInvoice,
  CashRegisterSession,
  PaymentRecord,
} from '../../types';

type FinanceTab = 'overview' | 'b2b' | 'z-reports';

interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amountXof: number;
  expenseDate: string;
}

interface FinanceData {
  summary: {
    grossSalesXof: number;
    collectedXof: number;
    taxCollectedXof: number;
    cogsXof: number;
    expensesXof: number;
    netEstimatedMarginXof: number;
  };
  expenses: ExpenseRow[];
  byMethod: Array<{ method: string; amountXof: number; count: number }>;
}

export function FinanceReportsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<FinanceTab>('overview');
  const [data, setData] = useState<FinanceData | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [b2bDocs, setB2bDocs] = useState<B2bInvoice[]>([]);
  const [registerState, setRegisterState] = useState<{
    activeSession: CashRegisterSession | null;
    zReports: CashRegisterSession[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExp, setShowExp] = useState(false);
  const [expForm, setExpForm] = useState({
    category: t('finance.defaultCategory'),
    description: '',
    amountXof: 10000,
  });

  const [showB2bForm, setShowB2bForm] = useState(false);
  const [savingB2b, setSavingB2b] = useState(false);
  const [b2bForm, setB2bForm] = useState({
    docType: 'PROFORMA' as 'PROFORMA' | 'INVOICE',
    clientName: '',
    clientCompany: '',
    clientTaxId: '',
    clientEmail: '',
    clientPhone: '',
    clientAddress: '',
    taxRatePercent: 18,
    dueDate: '',
    notes: '',
  });
  const [b2bLines, setB2bLines] = useState([
    { description: 'Forfait cocktail / buffet entreprise', quantity: 1, unitPriceXof: 150000 },
  ]);
  const [previewB2b, setPreviewB2b] = useState<B2bInvoice | null>(null);

  const [editingExp, setEditingExp] = useState<ExpenseRow | null>(null);
  const [editExpForm, setEditExpForm] = useState({
    category: '',
    description: '',
    amountXof: 0,
    expenseDate: '',
  });
  const [confirmDeleteExpId, setConfirmDeleteExpId] = useState<string | null>(
    null,
  );

  const load = useCallback(() => {
    Promise.all([
      apiFetch<FinanceData>('/api/restaurant/finance'),
      apiFetch<{ payments: PaymentRecord[] }>('/api/restaurant/payments'),
      apiFetch<{ documents: B2bInvoice[] }>('/api/restaurant/b2b-invoices').catch(
        () => ({ documents: [] as B2bInvoice[] }),
      ),
      apiFetch<{
        activeSession: CashRegisterSession | null;
        zReports: CashRegisterSession[];
      }>('/api/restaurant/pos/register').catch(() => null),
    ])
      .then(([f, p, b2b, reg]) => {
        setData(f);
        setPayments(p.payments);
        setB2bDocs(b2b.documents);
        if (reg) {
          setRegisterState({
            activeSession: reg.activeSession,
            zReports: reg.zReports || [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/restaurant/expenses', {
        method: 'POST',
        body: JSON.stringify(expForm),
      });
      notify(t('finance.expenseAddedToast'), 'success');
      setShowExp(false);
      setExpForm({
        category: t('finance.defaultCategory'),
        description: '',
        amountXof: 10000,
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const openEditExp = (ex: ExpenseRow) => {
    setEditingExp(ex);
    setEditExpForm({
      category: ex.category,
      description: ex.description,
      amountXof: ex.amountXof,
      expenseDate: ex.expenseDate.slice(0, 10),
    });
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExp) return;
    try {
      await apiFetch(`/api/restaurant/expenses/${editingExp.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editExpForm),
      });
      notify('Dépense mise à jour.', 'success');
      setEditingExp(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await apiFetch(`/api/restaurant/expenses/${id}`, {
        method: 'DELETE',
      });
      notify('Dépense supprimée.', 'info');
      setConfirmDeleteExpId(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const refundPayment = async (id: string) => {
    try {
      await apiFetch(`/api/restaurant/payments/${id}/refund`, {
        method: 'POST',
      });
      notify(t('finance.paymentRefundedToast'), 'info');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const downloadCsv = async () => {
    const token = getStoredToken();
    const res = await fetch('/api/restaurant/reports/export', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rapport-ventes-restomax.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateB2b = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingB2b(true);
    try {
      await apiFetch('/api/restaurant/b2b-invoices', {
        method: 'POST',
        body: JSON.stringify({
          ...b2bForm,
          items: b2bLines,
        }),
      });
      notify(
        b2bForm.docType === 'PROFORMA'
          ? 'Devis proforma B2B créé.'
          : 'Facture B2B créée.',
        'success',
      );
      setShowB2bForm(false);
      setB2bForm({
        docType: 'PROFORMA',
        clientName: '',
        clientCompany: '',
        clientTaxId: '',
        clientEmail: '',
        clientPhone: '',
        clientAddress: '',
        taxRatePercent: 18,
        dueDate: '',
        notes: '',
      });
      setB2bLines([
        { description: 'Forfait cocktail / buffet entreprise', quantity: 1, unitPriceXof: 150000 },
      ]);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setSavingB2b(false);
    }
  };

  const handleUpdateB2bStatus = async (
    docId: string,
    status: B2bInvoice['status'],
  ) => {
    try {
      await apiFetch(`/api/restaurant/b2b-invoices/${docId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify('Statut B2B mis à jour.', 'success');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleConvertProforma = async (docId: string) => {
    try {
      await apiFetch(`/api/restaurant/b2b-invoices/${docId}/convert`, {
        method: 'POST',
      });
      notify('Proforma convertie en facture définitive.', 'success');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  return (
    <RestaurantLayout
      title={t('pages.financeTitle')}
      actions={
        <div className="flex gap-2">
          {activeTab === 'overview' && (
            <button
              type="button"
              onClick={() => setShowExp((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface)] hover:bg-[var(--rm-surface-hover)] text-[var(--rm-ink)] text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('pages.expenseBtn')}</span>
            </button>
          )}
          {activeTab === 'b2b' && (
            <button
              type="button"
              data-testid="new-b2b-btn"
              onClick={() => setShowB2bForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouveau devis / facture B2B</span>
            </button>
          )}
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('pages.exportCsvBtn')}</span>
          </button>
        </div>
      }
    >
      {loading && !data ? (
        <div className="space-y-6" data-testid="finance-loading-skeleton">
          <CardsGridSkeleton cards={4} />
          <TableSkeleton rows={5} columns={5} />
        </div>
      ) : (
        data && (
          <div className="space-y-6">
            <div className="inline-flex flex-wrap p-1 rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'overview'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                    : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Synthèse & Dépenses</span>
              </button>
              <button
                type="button"
                data-testid="finance-tab-b2b"
                onClick={() => setActiveTab('b2b')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'b2b'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                    : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Devis & Factures B2B ({b2bDocs.length})</span>
              </button>
              <button
                type="button"
                data-testid="finance-tab-z"
                onClick={() => setActiveTab('z-reports')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'z-reports'
                    ? 'bg-[#182333] dark:bg-[#FF8738] text-white'
                    : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>
                  Clôtures & Rapports Z ({registerState?.zReports.length ?? 0})
                </span>
              </button>
            </div>

            {activeTab === 'overview' && (
              <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5">
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  {t('finance.grossSalesLabel')}
                </p>
                <p className="mt-1 text-xl font-extrabold text-[var(--rm-ink)] tabular-nums">
                  {formatFcfa(data.summary.grossSalesXof)}
                </p>
                <p className="text-xs text-[var(--rm-ink-muted)] mt-1 tabular-nums">
                  {t('finance.vatIncludedLabel', {
                    amount: formatFcfa(data.summary.taxCollectedXof),
                  })}
                </p>
              </div>
              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5">
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  {t('finance.collectedLabel')}
                </p>
                <p className="mt-1 text-xl font-extrabold text-[#14B8A6] tabular-nums">
                  {formatFcfa(data.summary.collectedXof)}
                </p>
              </div>
              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5">
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  {t('finance.cogsAndExpensesLabel')}
                </p>
                <p className="mt-1 text-xl font-extrabold text-[#E05252] tabular-nums">
                  {formatFcfa(data.summary.cogsXof + data.summary.expensesXof)}
                </p>
              </div>
              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5">
                <p className="text-xs text-[var(--rm-ink-muted)]">
                  {t('finance.netMarginLabel')}
                </p>
                <p className="mt-1 text-xl font-extrabold text-[var(--rm-ink)] tabular-nums">
                  {formatFcfa(data.summary.netEstimatedMarginXof)}
                </p>
              </div>
            </div>

            {showExp && (
              <form
                onSubmit={addExpense}
                className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('finance.categoryLabel')}
                  </label>
                  <input
                    required
                    type="text"
                    value={expForm.category}
                    onChange={(e) =>
                      setExpForm({ ...expForm, category: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('finance.descriptionLabel')}
                  </label>
                  <input
                    required
                    type="text"
                    value={expForm.description}
                    onChange={(e) =>
                      setExpForm({ ...expForm, description: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                    {t('finance.amountLabel')}
                  </label>
                  <input
                    required
                    type="number"
                    min={100}
                    value={expForm.amountXof}
                    onChange={(e) =>
                      setExpForm({
                        ...expForm,
                        amountXof: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                  />
                </div>
                <button
                  type="submit"
                  className="py-2.5 px-4 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer"
                >
                  {t('finance.addExpenseBtn')}
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6">
                <h2 className="text-base font-bold text-[var(--rm-ink)] mb-4">
                  {t('finance.transactionsTitle')}
                </h2>
                <div className="space-y-2.5 max-h-80 overflow-y-auto text-xs">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2 border-b border-[var(--rm-border-subtle)] last:border-0"
                    >
                      <div>
                        <p className="font-mono font-bold text-[var(--rm-ink)]">
                          {p.orderNumber} · {getPaymentMethodLabel(p.method)}
                        </p>
                        <p className="text-[var(--rm-ink-muted)]">
                          {p.reference} · {p.mode}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums">
                        <span
                          className={`font-bold ${
                            p.status === 'REFUNDED'
                              ? 'line-through text-[#E05252]'
                              : 'text-[var(--rm-ink)]'
                          }`}
                        >
                          {formatFcfa(p.amountXof)}
                        </span>
                        {p.status === 'PAID' && (
                          <button
                            type="button"
                            onClick={() => refundPayment(p.id)}
                            className="text-[#E05252] hover:underline font-semibold cursor-pointer"
                          >
                            {t('finance.refundBtn')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6">
                <h2 className="text-base font-bold text-[var(--rm-ink)] mb-4">
                  {t('finance.expensesJournalTitle')}
                </h2>
                <div className="space-y-2.5 max-h-80 overflow-y-auto text-xs">
                  {data.expenses.map((ex) => (
                    <div
                      key={ex.id}
                      className="flex items-center justify-between py-2 border-b border-[var(--rm-border-subtle)] last:border-0 gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--rm-ink)] truncate">
                          {ex.description}
                        </p>
                        <p className="text-[var(--rm-ink-muted)]">
                          {ex.category} · {formatDateFr(ex.expenseDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="font-bold text-[#E05252] tabular-nums">
                          -{formatFcfa(ex.amountXof)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditExp(ex)}
                          aria-label={`Modifier ${ex.description}`}
                          className="p-1 text-[var(--rm-ink-muted)] hover:text-[#FF8738] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteExpId === ex.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDeleteExpense(ex.id)}
                              className="px-1.5 py-0.5 rounded bg-[#E05252] text-white text-[10px] font-semibold cursor-pointer"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteExpId(null)}
                              className="px-1.5 py-0.5 rounded border border-[var(--rm-border)] text-[var(--rm-ink-muted)] text-[10px] cursor-pointer"
                            >
                              ×
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteExpId(ex.id)}
                            aria-label={`Supprimer ${ex.description}`}
                            className="p-1 text-[#E05252] hover:opacity-80 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
              </>
            )}

            {activeTab === 'b2b' && (
              <div className="space-y-5" data-testid="finance-b2b-panel">
                {showB2bForm && (
                  <form
                    onSubmit={handleCreateB2b}
                    className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-4"
                  >
                    <h2 className="text-sm font-bold text-[var(--rm-ink)]">
                      Émettre un devis proforma ou une facture B2B
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                          Type de document
                        </label>
                        <select
                          value={b2bForm.docType}
                          onChange={(e) =>
                            setB2bForm({
                              ...b2bForm,
                              docType: e.target.value as 'PROFORMA' | 'INVOICE',
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        >
                          <option value="PROFORMA">Devis Proforma</option>
                          <option value="INVOICE">Facture B2B définitive</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                          Contact / Client *
                        </label>
                        <input
                          required
                          type="text"
                          placeholder="M. Konan"
                          value={b2bForm.clientName}
                          onChange={(e) =>
                            setB2bForm({ ...b2bForm, clientName: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                          Entreprise / Organisme
                        </label>
                        <input
                          type="text"
                          placeholder="Groupe Lagune SA"
                          value={b2bForm.clientCompany}
                          onChange={(e) =>
                            setB2bForm({ ...b2bForm, clientCompany: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                          NCC / RCCM
                        </label>
                        <input
                          type="text"
                          placeholder="CI-ABJ-..."
                          value={b2bForm.clientTaxId}
                          onChange={(e) =>
                            setB2bForm({ ...b2bForm, clientTaxId: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                          Téléphone / E-mail
                        </label>
                        <input
                          type="text"
                          placeholder="+225 07 ... / facturation@..."
                          value={b2bForm.clientEmail || b2bForm.clientPhone}
                          onChange={(e) =>
                            setB2bForm({ ...b2bForm, clientEmail: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                            TVA (%)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={b2bForm.taxRatePercent}
                            onChange={(e) =>
                              setB2bForm({
                                ...b2bForm,
                                taxRatePercent: Number(e.target.value) || 0,
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                            Échéance
                          </label>
                          <input
                            type="date"
                            value={b2bForm.dueDate}
                            onChange={(e) =>
                              setB2bForm({ ...b2bForm, dueDate: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--rm-ink)]">
                          Lignes de prestation
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setB2bLines((prev) => [
                              ...prev,
                              { description: '', quantity: 1, unitPriceXof: 10000 },
                            ])
                          }
                          className="text-xs font-semibold text-[#FF8738] hover:underline cursor-pointer"
                        >
                          + Ajouter une ligne
                        </button>
                      </div>
                      {b2bLines.map((ln, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                        >
                          <input
                            required
                            type="text"
                            placeholder="Description de prestation..."
                            value={ln.description}
                            onChange={(e) =>
                              setB2bLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, description: e.target.value } : r,
                                ),
                              )
                            }
                            className="sm:col-span-6 px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                          />
                          <input
                            type="number"
                            min={1}
                            value={ln.quantity}
                            onChange={(e) =>
                              setB2bLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, quantity: Number(e.target.value) || 1 }
                                    : r,
                                ),
                              )
                            }
                            className="sm:col-span-2 px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                          />
                          <input
                            type="number"
                            min={0}
                            value={ln.unitPriceXof}
                            onChange={(e) =>
                              setB2bLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, unitPriceXof: Number(e.target.value) || 0 }
                                    : r,
                                ),
                              )
                            }
                            className="sm:col-span-3 px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs tabular-nums"
                          />
                          {b2bLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setB2bLines((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="sm:col-span-1 p-2 text-[#E05252] cursor-pointer"
                              aria-label="Supprimer ligne"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowB2bForm(false)}
                        className="px-4 py-2 rounded-lg border border-[var(--rm-border-input)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={savingB2b}
                        className="px-4 py-2 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {savingB2b ? 'Enregistrement...' : 'Émettre le document'}
                      </button>
                    </div>
                  </form>
                )}

                <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
                  {b2bDocs.length === 0 ? (
                    <p className="p-8 text-center text-xs text-[var(--rm-ink-muted)]">
                      Aucun devis proforma ou facture B2B émis pour le moment.
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--rm-border-subtle)]">
                      {b2bDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold text-[var(--rm-ink)]">
                                {doc.invoiceNumber}
                              </span>
                              <span className="text-[11px] font-bold text-[#FF8738]">
                                {doc.docType === 'PROFORMA' ? 'PROFORMA' : 'FACTURE'}
                              </span>
                              <span className="text-xs font-semibold text-[var(--rm-ink)]">
                                · {doc.clientCompany || doc.clientName}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--rm-ink-muted)]">
                              {doc.items.length} prestation(s) · HT{' '}
                              {formatFcfa(doc.subtotalHtXof)} · TVA {doc.taxRatePercent}% · Émis le{' '}
                              {formatDateFr(doc.createdAt)}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <span className="font-extrabold text-sm text-[var(--rm-ink)] tabular-nums mr-2">
                              {formatFcfa(doc.totalTtcXof)} TTC
                            </span>
                            <select
                              value={doc.status}
                              onChange={(e) =>
                                void handleUpdateB2bStatus(
                                  doc.id,
                                  e.target.value as B2bInvoice['status'],
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs font-semibold"
                            >
                              <option value="DRAFT">Brouillon</option>
                              <option value="SENT">Envoyé</option>
                              <option value="ACCEPTED">Accepté</option>
                              <option value="PAID">Payé</option>
                              <option value="CANCELLED">Annulé</option>
                            </select>
                            {doc.docType === 'PROFORMA' && doc.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                data-testid={`convert-proforma-${doc.id}`}
                                onClick={() => void handleConvertProforma(doc.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#14B8A6] text-white text-xs font-semibold cursor-pointer"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>Convertir en facture</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setPreviewB2b(doc)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Aperçu</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'z-reports' && (
              <div className="space-y-5" data-testid="finance-z-reports-panel">
                <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[var(--rm-ink-muted)]">
                      État de la caisse en cours
                    </p>
                    {registerState?.activeSession ? (
                      <p className="text-sm font-bold text-[#14B8A6] mt-0.5">
                        Ouverte par {registerState.activeSession.openedByName} · Fond initial{' '}
                        {formatFcfa(registerState.activeSession.openingFloatXof)} (depuis le{' '}
                        {formatDateTimeFr(registerState.activeSession.openedAt)})
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-[var(--rm-ink)] mt-0.5">
                        Aucune session ouverte actuellement (ouverture depuis le POS).
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rm-border)] text-xs font-semibold text-[var(--rm-ink)] cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimer l’archive Z</span>
                  </button>
                </div>

                <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] overflow-hidden">
                  {!registerState || registerState.zReports.length === 0 ? (
                    <p className="p-8 text-center text-xs text-[var(--rm-ink-muted)]">
                      Aucune clôture Z archivée pour le moment.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[var(--rm-surface-muted)] text-[var(--rm-ink-muted)]">
                          <tr>
                            <th className="px-4 py-3 font-semibold">N° Clôture Z</th>
                            <th className="px-4 py-3 font-semibold">Clôturée par</th>
                            <th className="px-4 py-3 font-semibold text-right">Ventes</th>
                            <th className="px-4 py-3 font-semibold text-right">Espèces comptées</th>
                            <th className="px-4 py-3 font-semibold text-right">Mobile Money</th>
                            <th className="px-4 py-3 font-semibold text-right">Carte</th>
                            <th className="px-4 py-3 font-semibold text-right">Écart</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--rm-border-subtle)] tabular-nums">
                          {registerState.zReports.map((z) => (
                            <tr key={z.id}>
                              <td className="px-4 py-3 font-mono font-bold text-[var(--rm-ink)]">
                                <div>{z.zNumber}</div>
                                <div className="text-[10px] font-sans font-normal text-[var(--rm-ink-muted)]">
                                  {z.closedAt ? formatDateTimeFr(z.closedAt) : '—'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[var(--rm-ink)]">
                                {z.closedByName || z.openedByName}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-[var(--rm-ink)]">
                                {formatFcfa(z.totalSalesXof)}
                              </td>
                              <td className="px-4 py-3 text-right text-[var(--rm-ink)]">
                                {formatFcfa(z.countedCashXof)}
                                <span className="block text-[10px] text-[var(--rm-ink-muted)]">
                                  att. {formatFcfa(z.expectedCashXof)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-[var(--rm-ink)]">
                                {formatFcfa(z.countedMobileXof)}
                              </td>
                              <td className="px-4 py-3 text-right text-[var(--rm-ink)]">
                                {formatFcfa(z.countedCardXof)}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-bold ${
                                  z.varianceXof < 0
                                    ? 'text-[#E05252]'
                                    : z.varianceXof > 0
                                      ? 'text-[#14B8A6]'
                                      : 'text-[var(--rm-ink)]'
                                }`}
                              >
                                {formatFcfa(z.varianceXof)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {editingExp && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateExpense}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Modifier la dépense
              </h3>
              <button
                type="button"
                onClick={() => setEditingExp(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('finance.categoryLabel')}
              </label>
              <input
                required
                type="text"
                value={editExpForm.category}
                onChange={(e) =>
                  setEditExpForm({ ...editExpForm, category: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                {t('finance.descriptionLabel')}
              </label>
              <input
                required
                type="text"
                value={editExpForm.description}
                onChange={(e) =>
                  setEditExpForm({ ...editExpForm, description: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  {t('finance.amountLabel')}
                </label>
                <input
                  required
                  type="number"
                  min={100}
                  value={editExpForm.amountXof}
                  onChange={(e) =>
                    setEditExpForm({
                      ...editExpForm,
                      amountXof: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--rm-ink)] mb-1">
                  Date
                </label>
                <input
                  required
                  type="date"
                  value={editExpForm.expenseDate}
                  onChange={(e) =>
                    setEditExpForm({
                      ...editExpForm,
                      expenseDate: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingExp(null)}
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
      {previewB2b && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <div className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-[#FF8738]">
                  {previewB2b.docType === 'PROFORMA' ? 'DEVIS PROFORMA B2B' : 'FACTURE B2B'}
                </p>
                <h3 className="text-lg font-extrabold text-[var(--rm-ink)] font-mono">
                  {previewB2b.invoiceNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewB2b(null)}
                className="p-1 text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-[var(--rm-ink)] space-y-0.5 bg-[var(--rm-surface-muted)] p-3 rounded-xl">
              <p className="font-bold">
                {previewB2b.clientCompany || previewB2b.clientName}
              </p>
              {previewB2b.clientCompany && <p>À l’attention de : {previewB2b.clientName}</p>}
              {previewB2b.clientTaxId && <p>NCC / RCCM : {previewB2b.clientTaxId}</p>}
              {(previewB2b.clientEmail || previewB2b.clientPhone) && (
                <p>{[previewB2b.clientEmail, previewB2b.clientPhone].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <table className="w-full text-left text-xs border-t border-b border-[var(--rm-border)]">
              <thead className="text-[var(--rm-ink-muted)]">
                <tr>
                  <th className="py-2">Désignation</th>
                  <th className="py-2 text-right">Qté</th>
                  <th className="py-2 text-right">P.U. HT</th>
                  <th className="py-2 text-right">Total HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rm-border-subtle)] tabular-nums">
                {previewB2b.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-2 text-[var(--rm-ink)]">{it.description}</td>
                    <td className="py-2 text-right">{it.quantity}</td>
                    <td className="py-2 text-right">{formatFcfa(it.unitPriceXof)}</td>
                    <td className="py-2 text-right font-semibold">
                      {formatFcfa(it.lineTotalXof)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-right space-y-1 tabular-nums">
              <p className="text-[var(--rm-ink-muted)]">
                Sous-total HT : <strong>{formatFcfa(previewB2b.subtotalHtXof)}</strong>
              </p>
              <p className="text-[var(--rm-ink-muted)]">
                TVA ({previewB2b.taxRatePercent}%) : <strong>{formatFcfa(previewB2b.taxXof)}</strong>
              </p>
              <p className="text-base font-extrabold text-[var(--rm-ink)]">
                Total TTC : {formatFcfa(previewB2b.totalTtcXof)}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#182333] dark:bg-[#FF8738] text-white text-xs font-semibold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer / PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </RestaurantLayout>
  );
}
