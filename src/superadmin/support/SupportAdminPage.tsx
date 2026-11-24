import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  CheckCircle2,
  Plus,
  Save,
  Search,
  X,
} from 'lucide-react';
import { SuperAdminLayout } from '../SuperAdminLayout';
import { apiFetch } from '../../services/api';
import { useToast } from '../../components/Toast';
import { formatDateTimeFr } from '../../utils/format';
import type { ContactLead, Restaurant, SupportTicket } from '../../types';

type TicketFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type LeadFilter = 'ALL' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'ARCHIVED';

export function SupportAdminPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [leads, setLeads] = useState<ContactLead[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('ALL');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('ALL');

  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [leadEdits, setLeadEdits] = useState<
    Record<string, { status: ContactLead['status']; adminNotes: string }>
  >({});
  const [leadPlanChoice, setLeadPlanChoice] = useState<Record<string, string>>({});
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [newTicket, setNewTicket] = useState({
    restaurantId: '',
    subject: '',
    category: 'Support & Opérations',
    priority: 'MEDIUM',
    body: '',
  });

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ tickets: SupportTicket[]; leads: ContactLead[] }>(
        '/api/superadmin/tickets',
      ),
      apiFetch<{ restaurants: Restaurant[] }>('/api/superadmin/restaurants'),
    ])
      .then(([res, restRes]) => {
        setTickets(res.tickets);
        setLeads(res.leads);
        setRestaurants(restRes.restaurants);
        const edits: Record<
          string,
          { status: ContactLead['status']; adminNotes: string }
        > = {};
        for (const l of res.leads) {
          edits[l.id] = {
            status: l.status || 'NEW',
            adminNotes: l.adminNotes || '',
          };
        }
        setLeadEdits(edits);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTickets = useMemo(() => {
    const q = ticketSearch.trim().toLowerCase();
    return tickets.filter((tkt) => {
      if (ticketFilter !== 'ALL' && tkt.status !== ticketFilter) return false;
      if (!q) return true;
      return (
        tkt.subject.toLowerCase().includes(q) ||
        tkt.createdByEmail.toLowerCase().includes(q) ||
        (tkt.restaurantName || '').toLowerCase().includes(q)
      );
    });
  }, [tickets, ticketSearch, ticketFilter]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    return leads.filter((l) => {
      const st = l.status || 'NEW';
      if (leadFilter !== 'ALL' && st !== leadFilter) return false;
      if (!q) return true;
      return (
        l.fullName.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.restaurantName || '').toLowerCase().includes(q) ||
        (l.city || '').toLowerCase().includes(q)
      );
    });
  }, [leads, leadSearch, leadFilter]);

  const sendReply = async (ticketId: string, status: string) => {
    try {
      await apiFetch(`/api/superadmin/tickets/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          body: replyText[ticketId] || '',
          status,
        }),
      });
      notify(t('superadminPages.support.updatedToast'), 'success');
      setReplyText((r) => ({ ...r, [ticketId]: '' }));
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/superadmin/tickets', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: newTicket.restaurantId || null,
          subject: newTicket.subject,
          category: newTicket.category,
          priority: newTicket.priority,
          body: newTicket.body,
        }),
      });
      notify('Ticket créé et transmis.', 'success');
      setShowCreateTicket(false);
      setNewTicket({
        restaurantId: '',
        subject: '',
        category: 'Support & Opérations',
        priority: 'MEDIUM',
        body: '',
      });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleSaveLead = async (leadId: string) => {
    const edit = leadEdits[leadId];
    if (!edit) return;
    try {
      await apiFetch(`/api/superadmin/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify(edit),
      });
      notify('Suivi du prospect enregistré.', 'success');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    }
  };

  const handleConvertLead = async (lead: ContactLead) => {
    const chosenPlan = leadPlanChoice[lead.id] || 'PROFESSIONNEL';
    setConvertingId(lead.id);
    try {
      const res = await apiFetch<{
        restaurantId: string;
        alreadyConverted?: boolean;
        tempPassword?: string;
        planCode?: string;
      }>(`/api/superadmin/leads/${lead.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          planCode: chosenPlan,
        }),
      });
      notify(
        res.alreadyConverted
          ? 'Ce prospect est déjà converti.'
          : `Restaurant créé (${res.planCode || chosenPlan})${res.tempPassword ? ` · MDP temporaire : ${res.tempPassword}` : ''}`,
        'success',
      );
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('menu.errorGeneric'), 'error');
    } finally {
      setConvertingId(null);
    }
  };

  return (
    <SuperAdminLayout
      title={t('superadmin.supportTitle')}
      onRealtimeEvent={load}
      actions={
        <button
          type="button"
          onClick={() => setShowCreateTicket(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nouveau ticket</span>
        </button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Support Tickets Column */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--rm-ink)]">
              {t('superadminPages.support.ticketsTitle', {
                count: filteredTickets.length,
              })}
            </h2>
          </div>

          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-3 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--rm-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ticketSearch}
                onChange={(e) => setTicketSearch(e.target.value)}
                placeholder="Rechercher un ticket (sujet, restaurant, email)..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-[var(--rm-ink)]"
              />
            </div>
            <div className="flex flex-wrap gap-1 p-1 bg-[var(--rm-surface-muted)] rounded-lg">
              {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as TicketFilter[]).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTicketFilter(st)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                      ticketFilter === st
                        ? 'bg-[var(--rm-surface)] text-[var(--rm-ink)] shadow-sm'
                        : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                    }`}
                  >
                    {st === 'ALL' ? 'Tous' : st}
                  </button>
                ),
              )}
            </div>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-6 text-center text-xs text-[var(--rm-ink-muted)]">
              Aucun ticket dans cette vue.
            </div>
          ) : (
            filteredTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[var(--rm-ink)] text-sm">
                      {ticket.subject}
                    </h3>
                    <p className="text-xs text-[var(--rm-ink-muted)]">
                      {ticket.restaurantName ||
                        t('superadminPages.support.platformFallback')}{' '}
                      · {ticket.createdByEmail} · {ticket.priority}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold shrink-0 ${
                      ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
                        ? 'text-[#14B8A6]'
                        : ticket.status === 'IN_PROGRESS'
                          ? 'text-[#E5A32A]'
                          : 'text-[#FF8738]'
                    }`}
                  >
                    {ticket.status}
                  </span>
                </div>

                <div className="space-y-2 border-t border-b border-[var(--rm-border-subtle)] py-3">
                  {ticket.messages.map((m) => (
                    <div key={m.id} className="text-xs">
                      <span className="font-semibold text-[var(--rm-ink)]">
                        {m.author} ({m.role}) :
                      </span>{' '}
                      <span className="text-[var(--rm-ink-muted)]">{m.body}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t('superadminPages.support.replyPlaceholder')}
                    value={replyText[ticket.id] || ''}
                    onChange={(e) =>
                      setReplyText({ ...replyText, [ticket.id]: e.target.value })
                    }
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] placeholder:text-[var(--rm-ink-muted)] text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => sendReply(ticket.id, 'IN_PROGRESS')}
                    className="px-3 py-2 rounded-lg bg-[#182333] dark:bg-[#223044] hover:bg-[#223044] dark:hover:bg-[#2D4059] dark:border dark:border-[var(--rm-border)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {t('superadminPages.support.replyBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => sendReply(ticket.id, 'RESOLVED')}
                    className="px-3 py-2 rounded-lg bg-[#14B8A6] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {t('superadminPages.support.resolvedBtn')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* CRM Leads Column */}
        <div className="lg:col-span-6 space-y-4">
          <h2 className="text-base font-bold text-[var(--rm-ink)]">
            {t('superadminPages.support.leadsTitle', {
              count: filteredLeads.length,
            })}
          </h2>

          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] p-3 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--rm-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Rechercher un prospect (nom, ville, email, restaurant)..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-xs text-[var(--rm-ink)]"
              />
            </div>
            <div className="flex flex-wrap gap-1 p-1 bg-[var(--rm-surface-muted)] rounded-lg">
              {(['ALL', 'NEW', 'CONTACTED', 'CONVERTED', 'ARCHIVED'] as LeadFilter[]).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setLeadFilter(st)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                      leadFilter === st
                        ? 'bg-[var(--rm-surface)] text-[var(--rm-ink)] shadow-sm'
                        : 'text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)]'
                    }`}
                  >
                    {st === 'ALL' ? 'Tous' : st}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="bg-[var(--rm-surface)] rounded-xl border border-[var(--rm-border)] divide-y divide-[var(--rm-border-subtle)]">
            {filteredLeads.length === 0 ? (
              <p className="p-6 text-xs text-[var(--rm-ink-muted)] text-center">
                {t('superadminPages.support.noLeadsYet')}
              </p>
            ) : (
              filteredLeads.map((l) => {
                const edit = leadEdits[l.id] || {
                  status: l.status || 'NEW',
                  adminNotes: l.adminNotes || '',
                };
                const targetPlan = leadPlanChoice[l.id] || 'PROFESSIONNEL';
                return (
                  <div key={l.id} className="p-4 text-xs space-y-2.5">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-bold text-sm text-[var(--rm-ink)]">
                          {l.fullName}
                        </span>
                        <p className="text-[var(--rm-ink-muted)]">
                          {l.email} {l.phone ? `· ${l.phone}` : ''} ·{' '}
                          {l.restaurantName || 'N/A'} ({l.city || '—'})
                        </p>
                      </div>
                      <span className="text-[#FF8738] font-semibold shrink-0">
                        {l.leadType}
                      </span>
                    </div>

                    {l.message && (
                      <p className="text-[var(--rm-ink)] bg-[var(--rm-surface-muted)] p-2.5 rounded-lg">
                        {l.message}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center pt-1">
                      <select
                        value={edit.status}
                        onChange={(e) =>
                          setLeadEdits((prev) => ({
                            ...prev,
                            [l.id]: {
                              ...edit,
                              status: e.target.value as ContactLead['status'],
                            },
                          }))
                        }
                        className="sm:col-span-4 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs font-semibold"
                      >
                        <option value="NEW">Nouveau</option>
                        <option value="CONTACTED">À contacter / En cours</option>
                        <option value="CONVERTED">Converti</option>
                        <option value="ARCHIVED">Archivé</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Notes internes CRM..."
                        value={edit.adminNotes}
                        onChange={(e) =>
                          setLeadEdits((prev) => ({
                            ...prev,
                            [l.id]: { ...edit, adminNotes: e.target.value },
                          }))
                        }
                        className="sm:col-span-6 px-2.5 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveLead(l.id)}
                        className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#182333] dark:bg-[#223044] text-white font-semibold cursor-pointer"
                      >
                        <Save className="w-3 h-3" />
                        <span>OK</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-[var(--rm-ink-muted)] tabular-nums">
                        {formatDateTimeFr(l.createdAt)}
                      </span>
                      {l.convertedRestaurantId ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#14B8A6]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Compte créé ({l.convertedRestaurantId})</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={targetPlan}
                            onChange={(e) =>
                              setLeadPlanChoice((prev) => ({
                                ...prev,
                                [l.id]: e.target.value,
                              }))
                            }
                            className="px-2 py-1.5 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)] text-xs font-semibold"
                          >
                            <option value="ESSENTIEL">Essentiel</option>
                            <option value="PROFESSIONNEL">Professionnel</option>
                            <option value="PREMIUM">Premium</option>
                          </select>
                          <button
                            type="button"
                            disabled={convertingId === l.id}
                            onClick={() => void handleConvertLead(l)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                            <span>
                              {convertingId === l.id
                                ? 'Conversion...'
                                : 'Convertir en restaurant'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Create Proactive Ticket Modal */}
      {showCreateTicket && (
        <div className="fixed inset-0 z-50 bg-[#0B1220]/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTicket}
            className="bg-[var(--rm-surface)] rounded-2xl border border-[var(--rm-border)] max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--rm-ink)]">
                Ouvrir un ticket support
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateTicket(false)}
                className="text-[var(--rm-ink-muted)] hover:text-[var(--rm-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">
                  Établissement concerné (optionnel)
                </label>
                <select
                  value={newTicket.restaurantId}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, restaurantId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                >
                  <option value="">Plateforme (général)</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.city})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Catégorie</label>
                  <input
                    type="text"
                    value={newTicket.category}
                    onChange={(e) =>
                      setNewTicket({ ...newTicket, category: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Priorité</label>
                  <select
                    value={newTicket.priority}
                    onChange={(e) =>
                      setNewTicket({ ...newTicket, priority: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                  >
                    <option value="LOW">Basse</option>
                    <option value="MEDIUM">Moyenne</option>
                    <option value="HIGH">Haute</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">Sujet</label>
                <input
                  required
                  type="text"
                  value={newTicket.subject}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, subject: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Message initial</label>
                <textarea
                  required
                  rows={3}
                  value={newTicket.body}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, body: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rm-border-input)] bg-[var(--rm-surface)] text-[var(--rm-ink)]"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateTicket(false)}
                className="flex-1 py-2 rounded-lg border border-[var(--rm-border-input)] font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-[#FF8738] hover:bg-[#F07322] text-white font-semibold cursor-pointer"
              >
                Envoyer le ticket
              </button>
            </div>
          </form>
        </div>
      )}
    </SuperAdminLayout>
  );
}
