import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  QrCode,
  Tv,
  Sliders,
  ArrowDownAZ,
  Pencil,
  FolderPlus,
  ChevronsRight,
  X,
  Star,
  MonitorOff,
  ExternalLink,
} from 'lucide-react';
import { detectVotingTies, type TieInfo } from '../utils/tieDetection';
import type { VotingSession, VotingOption, VotingEventItem } from '../types';
import { saveSession } from '../services/votingService';
import { parseImportFile } from '../utils/fileImporter';
import { toggleSecondaryScreen, subscribeSecondaryScreen } from '../utils/screen';

interface AdminViewProps {
  session: VotingSession;
}

export const AdminView: React.FC<AdminViewProps> = ({ session }) => {
  const [activeTab, setActiveTab] = useState<'candidates' | 'control' | 'settings'>('candidates');
  const [isBottomSectionOpen, setIsBottomSectionOpen] = useState<boolean>(true);
  const [isGearOpen, setIsGearOpen] = useState<boolean>(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState<boolean>(false);
  const [eventFormName, setEventFormName] = useState<string>(session.title || 'ESCOLHA DO TESOUREIRO');
  const [eventFormVacancies, setEventFormVacancies] = useState<number>(session.vacancies || 1);
  const [eventFormSuplente1Enabled, setEventFormSuplente1Enabled] = useState<boolean>(session.habilitarSuplente1 !== false);
  const [eventFormSuplente1Count, setEventFormSuplente1Count] = useState<number>(session.suplentesCount ?? 1);
  const [eventFormSuplente2Enabled, setEventFormSuplente2Enabled] = useState<boolean>(session.habilitarSuplente2 === true);
  const [eventFormSuplente2Count, setEventFormSuplente2Count] = useState<number>(session.segundoSuplentesCount ?? 1);
  const [eventFormResolverEmpates, setEventFormResolverEmpates] = useState<boolean>(session.resolverEmpates !== false);
  const [isCreatingNewEvent, setIsCreatingNewEvent] = useState<boolean>(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isTieModalOpen, setIsTieModalOpen] = useState<boolean>(false);
  const [selectedTieCandidateIds, setSelectedTieCandidateIds] = useState<string[]>([]);
  const [isScreen2Open, setIsScreen2Open] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeSecondaryScreen(setIsScreen2Open);
    return unsub;
  }, []);

  const handleToggleTieCandidate = (id: string) => {
    setSelectedTieCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((cId) => cId !== id) : [...prev, id]
    );
  };
  const detectedTies = session.status === 'CLOSED' ? detectVotingTies(session) : [];
  const hasTies = detectedTies.length > 0;

  // Escuta o evento emitido pelo botão branco ("APURAÇÃO") da Navbar
  useEffect(() => {
    const handleOpenTieModal = () => {
      const ties = detectVotingTies(session);
      if (ties.length > 0) {
        setIsTieModalOpen(true);
      }
    };
    window.addEventListener('open-tie-modal', handleOpenTieModal);
    return () => window.removeEventListener('open-tie-modal', handleOpenTieModal);
  }, [session]);

  // Se a votação encerrar e houver empate, abre o modal automaticamente
  const prevStatusRef = useRef(session.status);
  useEffect(() => {
    if (prevStatusRef.current !== 'CLOSED' && session.status === 'CLOSED') {
      const ties = detectVotingTies(session);
      if (ties.length > 0) {
        setIsTieModalOpen(true);
      }
    }
    prevStatusRef.current = session.status;
  }, [session.status, session]);

  const handleStartTieBreak = (tie: TieInfo) => {
    // Critério próprio do admin: se clicou em candidatos (ex: CARLA e SIONEIDE), desempata entre eles
    const candidates =
      selectedTieCandidateIds.length >= 2
        ? tie.tiedCandidates.filter((c) => selectedTieCandidateIds.includes(c.id))
        : tie.tiedCandidates;

    const tieOptions: VotingOption[] = candidates.map((c) => ({
      ...c,
      votesCount: 0,
    }));

    const vacancies = Math.max(1, Math.min(tie.vacanciesInDispute, tieOptions.length - 1));

    saveSession({
      ...session,
      status: 'TIE_BREAK',
      telaoMode: 'voting',
      votingIteration: (session.votingIteration || 1) + 1,
      tieBreakVotersCount: 0,
      tieBreak: {
        active: true,
        title: `Desempate - ${tie.label}`,
        vacancies: vacancies,
        maxVotesPerVoter: Math.min(vacancies, tieOptions.length),
        options: tieOptions,
      },
    });
    setIsTieModalOpen(false);
    setSelectedTieCandidateIds([]);
    showNotification('success', `Votação de desempate iniciada com ${tieOptions.length} candidatos!`);
  };

  
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    highlight?: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const gearPanelRef = useRef<HTMLDivElement>(null);
  const gearButtonRef = useRef<HTMLButtonElement>(null);
  const eventModalRef = useRef<HTMLDivElement>(null);
  const createEventBtnRef = useRef<HTMLButtonElement>(null);

  // Fecha o painel da engrenagem, menu de importar ou o modalzinho de criar/editar evento ao pressionar ESC ou clicar fora
  useEffect(() => {
    if (!isGearOpen && !isCreatingNewEvent && !isImportMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isImportMenuOpen) {
          setIsImportMenuOpen(false);
        } else if (isCreatingNewEvent) {
          setIsCreatingNewEvent(false);
          setEditingEventId(null);
        } else if (isGearOpen) {
          setIsGearOpen(false);
        }
      }
    };

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (isImportMenuOpen) {
        const insideImport = Boolean(el?.closest('[data-import-listbox="true"]'));
        if (!insideImport) {
          setIsImportMenuOpen(false);
        }
      }
      if (isCreatingNewEvent) {
        const insideModal = Boolean(el?.closest('[data-event-modal="true"]'));
        const insideCreateBtn = Boolean(el?.closest('[data-create-event-btn="true"]'));
        const insideEditBtn = Boolean(el?.closest('[data-edit-event-btn="true"]'));
        if (!insideModal && !insideCreateBtn && !insideEditBtn) {
          setIsCreatingNewEvent(false);
          setEditingEventId(null);
        }
      }
      if (isGearOpen) {
        if (
          gearPanelRef.current &&
          el &&
          !gearPanelRef.current.contains(el) &&
          gearButtonRef.current &&
          !gearButtonRef.current.contains(el)
        ) {
          setIsGearOpen(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [isGearOpen, isCreatingNewEvent, isImportMenuOpen, session.title]);

  // Garante lista de eventos (inicializando com o evento atual caso ainda não exista)
  const eventsList: VotingEventItem[] =
    Array.isArray(session.events) && session.events.length > 0
      ? session.events
      : [
          {
            id: session.activeEventId || 'evt_principal',
            name: session.title || 'ESCOLHA DO TESOUREIRO',
            options: session.options || [],
            vacancies: session.vacancies || 1,
            maxVotesPerVoter: session.maxVotesPerVoter || 1,
            suplentesCount: session.suplentesCount ?? 1,
            segundoSuplentesCount: session.segundoSuplentesCount ?? 0,
            habilitarSuplente1: session.habilitarSuplente1 ?? true,
            habilitarSuplente2: session.habilitarSuplente2 ?? false,
            resolverEmpates: session.resolverEmpates !== false,
          },
        ];
  const currentActiveEventId = session.activeEventId || eventsList[0].id;

  // Abrir modal de criação de nova votação (puxa as configurações gerais da engrenagem por padrão)
  const openCreateEventModal = () => {
    setEditingEventId(null);
    setEventFormName('');
    setEventFormVacancies(session.vacancies || 1);
    setEventFormSuplente1Enabled(session.habilitarSuplente1 !== false);
    setEventFormSuplente1Count(session.suplentesCount ?? 1);
    setEventFormSuplente2Enabled(session.habilitarSuplente2 === true);
    setEventFormSuplente2Count(session.segundoSuplentesCount ?? 1);
    setEventFormResolverEmpates(session.resolverEmpates !== false);
    setIsCreatingNewEvent(true);
  };

  // Abrir modal de edição de votação existente (lápis)
  const openEditEventModal = (evt: VotingEventItem) => {
    setEditingEventId(evt.id);
    const isSelected = evt.id === currentActiveEventId;
    const displayName = isSelected ? (session.title || evt.name) : evt.name;
    setEventFormName(displayName);

    const vac = isSelected ? session.vacancies : (evt.vacancies ?? session.vacancies ?? 1);
    const s1Enabled = isSelected
      ? (session.habilitarSuplente1 !== false)
      : (evt.habilitarSuplente1 !== undefined ? evt.habilitarSuplente1 : (session.habilitarSuplente1 !== false));
    const s1Count = isSelected
      ? (session.suplentesCount ?? 1)
      : (evt.suplentesCount ?? session.suplentesCount ?? 1);
    const s2Enabled = isSelected
      ? (session.habilitarSuplente2 === true)
      : (evt.habilitarSuplente2 !== undefined ? evt.habilitarSuplente2 : (session.habilitarSuplente2 === true));
    const s2Count = isSelected
      ? (session.segundoSuplentesCount ?? 1)
      : (evt.segundoSuplentesCount ?? session.segundoSuplentesCount ?? 1);
    const empates = isSelected
      ? (session.resolverEmpates !== false)
      : (evt.resolverEmpates !== undefined ? evt.resolverEmpates : (session.resolverEmpates !== false));

    setEventFormVacancies(vac || 1);
    setEventFormSuplente1Enabled(s1Enabled);
    setEventFormSuplente1Count(s1Count > 0 ? s1Count : 1);
    setEventFormSuplente2Enabled(s2Enabled);
    setEventFormSuplente2Count(s2Count > 0 ? s2Count : 1);
    setEventFormResolverEmpates(empates);
    setIsCreatingNewEvent(true);
  };

  // Selecionar um evento ao clicar no botão do evento no cabeçalho -> abre a parte de baixo (Print 2)
  const handleSelectEventButton = (evt: VotingEventItem) => {
    if (evt.id === currentActiveEventId && activeTab === 'candidates') {
      setIsBottomSectionOpen(true);
      return;
    }

    // Salva o estado do evento atual antes de trocar e carrega o evento clicado
    const updatedEvents = eventsList.map((item) =>
      item.id === currentActiveEventId
        ? {
            ...item,
            name: session.title || item.name,
            options: session.options,
            vacancies: session.vacancies,
            maxVotesPerVoter: session.maxVotesPerVoter,
            suplentesCount: session.suplentesCount,
            segundoSuplentesCount: session.segundoSuplentesCount,
            habilitarSuplente1: session.habilitarSuplente1,
            habilitarSuplente2: session.habilitarSuplente2,
            resolverEmpates: session.resolverEmpates,
          }
        : item
    );

    saveSession({
      ...session,
      activeEventId: evt.id,
      title: evt.name,
      options: evt.options || [],
      vacancies: evt.vacancies || 1,
      maxVotesPerVoter: evt.maxVotesPerVoter || evt.vacancies || 1,
      suplentesCount: evt.suplentesCount ?? 0,
      segundoSuplentesCount: evt.segundoSuplentesCount ?? 0,
      habilitarSuplente1: evt.habilitarSuplente1,
      habilitarSuplente2: evt.habilitarSuplente2,
      resolverEmpates: evt.resolverEmpates !== undefined ? evt.resolverEmpates : (session.resolverEmpates !== false),
      events: updatedEvents,
    });

    setActiveTab('candidates');
    setIsBottomSectionOpen(true);
    showNotification('success', `Evento "${evt.name}" aberto!`);
  };

  // Salvar configurações da votação (cria nova ou edita existente)
  const handleSaveEventModal = () => {
    const cleaned = eventFormName.trim().toUpperCase();
    if (!cleaned) {
      showNotification('error', 'Digite o nome da votação/evento.');
      return;
    }

    const vacancies = Math.max(1, eventFormVacancies || 1);
    const s1Count = eventFormSuplente1Enabled ? Math.max(1, eventFormSuplente1Count || 1) : 0;
    const s2Count = eventFormSuplente2Enabled ? Math.max(1, eventFormSuplente2Count || 1) : 0;
    const resolverEmpates = eventFormResolverEmpates;

    if (editingEventId) {
      const isEditingActive = editingEventId === currentActiveEventId;
      const updatedEvents = eventsList.map((item) =>
        item.id === editingEventId
          ? {
              ...item,
              name: cleaned,
              vacancies,
              maxVotesPerVoter: vacancies,
              habilitarSuplente1: eventFormSuplente1Enabled,
              suplentesCount: s1Count,
              habilitarSuplente2: eventFormSuplente2Enabled,
              segundoSuplentesCount: s2Count,
              resolverEmpates,
            }
          : item
      );

      saveSession({
        ...session,
        title: isEditingActive ? cleaned : session.title,
        vacancies: isEditingActive ? vacancies : session.vacancies,
        maxVotesPerVoter: isEditingActive ? vacancies : session.maxVotesPerVoter,
        habilitarSuplente1: isEditingActive ? eventFormSuplente1Enabled : session.habilitarSuplente1,
        suplentesCount: isEditingActive ? s1Count : session.suplentesCount,
        habilitarSuplente2: isEditingActive ? eventFormSuplente2Enabled : session.habilitarSuplente2,
        segundoSuplentesCount: isEditingActive ? s2Count : session.segundoSuplentesCount,
        resolverEmpates: isEditingActive ? resolverEmpates : session.resolverEmpates,
        events: updatedEvents,
      });

      setIsCreatingNewEvent(false);
      setEditingEventId(null);
      showNotification('success', `Configurações da votação "${cleaned}" salvas com sucesso!`);
    } else {
      const newEvtId = 'evt_' + Date.now();
      const newEvt: VotingEventItem = {
        id: newEvtId,
        name: cleaned,
        options: [],
        vacancies,
        maxVotesPerVoter: vacancies,
        suplentesCount: s1Count,
        segundoSuplentesCount: s2Count,
        habilitarSuplente1: eventFormSuplente1Enabled,
        habilitarSuplente2: eventFormSuplente2Enabled,
        resolverEmpates,
      };

      const syncedCurrentEvents = eventsList.map((item) =>
        item.id === currentActiveEventId
          ? {
              ...item,
              name: session.title || item.name,
              options: session.options,
              vacancies: session.vacancies,
              maxVotesPerVoter: session.maxVotesPerVoter,
              suplentesCount: session.suplentesCount,
              segundoSuplentesCount: session.segundoSuplentesCount,
              habilitarSuplente1: session.habilitarSuplente1,
              habilitarSuplente2: session.habilitarSuplente2,
              resolverEmpates: session.resolverEmpates,
            }
          : item
      );

      saveSession({
        ...session,
        activeEventId: newEvtId,
        title: cleaned,
        options: [],
        status: 'WAITING',
        vacancies,
        maxVotesPerVoter: vacancies,
        habilitarSuplente1: eventFormSuplente1Enabled,
        suplentesCount: s1Count,
        habilitarSuplente2: eventFormSuplente2Enabled,
        segundoSuplentesCount: s2Count,
        resolverEmpates,
        events: [...syncedCurrentEvents, newEvt],
      });

      setIsCreatingNewEvent(false);
      setEditingEventId(null);
      setActiveTab('candidates');
      setIsBottomSectionOpen(true);
      showNotification('success', `Votação "${cleaned}" criada com sucesso!`);
    }
  };

  // Excluir um evento (abre modal bonito de confirmação)
  const handleDeleteEvent = (evtId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (eventsList.length <= 1) {
      showNotification('error', 'É necessário manter pelo menos 1 evento ativo.');
      return;
    }
    const targetEvt = eventsList.find((x) => x.id === evtId);
    setConfirmModal({
      title: 'Excluir Votação / Evento',
      highlight: targetEvt?.name || '',
      description: 'Tem certeza que deseja excluir este evento e a lista de nomes vinculada a ele?',
      confirmLabel: 'Sim, Excluir',
      onConfirm: () => {
        const remaining = eventsList.filter((x) => x.id !== evtId);
        const nextActive = remaining[0];

        saveSession({
          ...session,
          activeEventId: nextActive.id,
          title: nextActive.name,
          options: nextActive.options || [],
          vacancies: nextActive.vacancies || 1,
          maxVotesPerVoter: nextActive.maxVotesPerVoter || nextActive.vacancies || 1,
          suplentesCount: nextActive.suplentesCount ?? 0,
          segundoSuplentesCount: nextActive.segundoSuplentesCount ?? 0,
          habilitarSuplente1: nextActive.habilitarSuplente1,
          habilitarSuplente2: nextActive.habilitarSuplente2,
          resolverEmpates: nextActive.resolverEmpates !== undefined ? nextActive.resolverEmpates : (session.resolverEmpates !== false),
          events: remaining,
        });
        setConfirmModal(null);
        showNotification('success', 'Evento removido com sucesso.');
      },
    });
  };

  // Renderiza o modal de configuração de votação (tanto para criar quanto para editar via lápis)
  const renderEventConfigModal = () => {
    const isEditing = Boolean(editingEventId);
    return (
      <motion.div
        ref={eventModalRef}
        data-event-modal="true"
        initial={{ opacity: 0, scale: 0.94, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: -6 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ transformOrigin: 'top left' }}
        className="absolute top-full left-0 mt-2 z-50 overflow-hidden w-[350px] sm:w-[410px] max-w-[calc(100vw-24px)]"
      >
        <div className="bg-[#001f47] border-2 border-emerald-400 rounded-xl p-3 shadow-[0_0_24px_rgba(52,211,153,0.5),0_14px_34px_rgba(0,0,0,0.85)] space-y-2.5">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between pb-1.5 border-b border-blue-900/80">
            <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
              {isEditing ? 'Configurar Votação' : 'Nova Votação'}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsCreatingNewEvent(false);
                setEditingEventId(null);
              }}
              className="p-0.5 text-slate-400 hover:text-white rounded transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nome da Votação */}
          <div>
            <label className="text-[10px] font-bold text-blue-200 uppercase tracking-wide block mb-1">
              Nome da Votação:
            </label>
            <input
              type="text"
              autoFocus
              placeholder="DIGITE O NOME (EX: ESCOLHA DO TESOUREIRO)..."
              value={eventFormName}
              onChange={(e) => setEventFormName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveEventModal();
                }
              }}
              className="w-full px-2.5 py-1.5 bg-[#07132a] border border-blue-700 focus:border-emerald-400 rounded-lg text-xs font-black text-white uppercase outline-none placeholder-slate-500 shadow-inner"
            />
          </div>

          {/* Vagas Titulares, 1º Suplente e 2º Suplente */}
          <div className="grid grid-cols-3 gap-2">
            {/* Titulares */}
            <div className="bg-[#07132a] border border-blue-800 rounded-lg p-2 flex flex-col justify-between">
              <span className="text-[9.5px] font-black text-white uppercase block mb-1">
                Titulares:
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={eventFormVacancies}
                  onChange={(e) => setEventFormVacancies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-1.5 py-1 bg-[#001f47] border border-blue-600 rounded text-center text-amber-300 font-black text-xs outline-none"
                />
                <span className="text-[9px] text-slate-400 font-bold uppercase">vagas</span>
              </div>
            </div>

            {/* 1º Suplente */}
            <div className="bg-[#07132a] border border-blue-800 rounded-lg p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9.5px] font-black text-white uppercase">
                  1º Supl.:
                </span>
                <input
                  type="checkbox"
                  checked={eventFormSuplente1Enabled}
                  onChange={(e) => setEventFormSuplente1Enabled(e.target.checked)}
                  className="rounded cursor-pointer accent-emerald-500 w-3 h-3"
                />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={99}
                  disabled={!eventFormSuplente1Enabled}
                  value={eventFormSuplente1Enabled ? eventFormSuplente1Count : 0}
                  onChange={(e) => setEventFormSuplente1Count(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-1.5 py-1 bg-[#001f47] border border-blue-600 rounded text-center text-blue-300 font-black text-xs outline-none disabled:opacity-40"
                />
                <span className="text-[9px] text-slate-400 font-bold uppercase">vagas</span>
              </div>
            </div>

            {/* 2º Suplente */}
            <div className="bg-[#07132a] border border-blue-800 rounded-lg p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9.5px] font-black text-white uppercase">
                  2º Supl.:
                </span>
                <input
                  type="checkbox"
                  checked={eventFormSuplente2Enabled}
                  onChange={(e) => setEventFormSuplente2Enabled(e.target.checked)}
                  className="rounded cursor-pointer accent-emerald-500 w-3 h-3"
                />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={99}
                  disabled={!eventFormSuplente2Enabled}
                  value={eventFormSuplente2Enabled ? eventFormSuplente2Count : 0}
                  onChange={(e) => setEventFormSuplente2Count(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-1.5 py-1 bg-[#001f47] border border-blue-600 rounded text-center text-slate-300 font-black text-xs outline-none disabled:opacity-40"
                />
                <span className="text-[9px] text-slate-400 font-bold uppercase">vagas</span>
              </div>
            </div>
          </div>

          {/* Se terá empate (Resolver Empates) */}
          <div className="bg-[#07132a] border border-blue-800 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div>
                <span className="text-[10px] font-black text-white uppercase tracking-wide block">
                  Resolver Empates:
                </span>
                <span className="text-[8.5px] text-blue-200/80 block">
                  {eventFormResolverEmpates
                    ? 'Ativado: rodada para desempate'
                    : 'Desativado: eleição majoritária'}
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={eventFormResolverEmpates}
                onChange={(e) => setEventFormResolverEmpates(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 shadow-inner" />
            </label>
          </div>

          {/* Botões Salvar e Cancelar */}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-blue-900/80">
            <button
              type="button"
              onClick={() => {
                setIsCreatingNewEvent(false);
                setEditingEventId(null);
              }}
              className="px-2.5 py-1.5 bg-[#07132a] hover:bg-[#0c1f44] border border-blue-800 text-slate-300 font-bold text-[10.5px] rounded-lg uppercase tracking-wider transition cursor-pointer active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveEventModal}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-blue-950 font-black text-[11px] rounded-lg uppercase tracking-wider cursor-pointer active:scale-95 transition shadow"
            >
              {isEditing ? 'Salvar' : 'Criar Votação'}
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const [isListening, setIsListening] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [newName, setNewName] = useState('');
  const [backupNamesList, setBackupNamesList] = useState<string[]>([]);

  useEffect(() => {
    if (session.options && session.options.length > 0) {
      setBackupNamesList(session.options.map((o) => o.name));
    }
  }, [session.options]);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editingCandidateName, setEditingCandidateName] = useState('');
  const [glowingIds, setGlowingIds] = useState<Record<string, boolean>>({});
  const knownOptionIdsRef = useRef<Set<string>>(new Set((session.options || []).map((o) => o.id)));
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Ativa o brilho de 1.5s nos novos nomes que entram na lista
  const triggerGlow = (ids: string[]) => {
    if (ids.length === 0) return;
    setGlowingIds((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
    setTimeout(() => {
      setGlowingIds((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });
    }, 1500);
  };

  useEffect(() => {
    const currentIds = (session.options || []).map((o) => o.id);
    const newlyAdded = currentIds.filter((id) => !knownOptionIdsRef.current.has(id));
    knownOptionIdsRef.current = new Set(currentIds);
    if (newlyAdded.length > 0) {
      triggerGlow(newlyAdded);
    }
  }, [session.options]);

  const importFileRef = useRef<HTMLInputElement>(null);
  const fileUploadReplaceRef = useRef<HTMLInputElement>(null);
  const fileUploadAppendRef = useRef<HTMLInputElement>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Processador de Arquivos (.TXT, .CSV, .XLS, .XLSX)
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>, mode: 'append' | 'replace') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseImportFile(file);
      if (result.options.length === 0) {
        showNotification('error', 'Nenhum item válido foi encontrado no arquivo.');
        return;
      }

      const now = Date.now();
      const stampedOptions = result.options.map((o) => ({ ...o, createdAt: now }));
      const newIds = stampedOptions.map((o) => o.id);
      triggerGlow(newIds);

      if (mode === 'replace') {
        const sortedReplace = [...stampedOptions].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        );
        saveSession({
          ...session,
          options: sortedReplace,
        });
        showNotification('success', `Lista substituída por ${result.count} itens de "${result.fileName}" (em ordem A-Z)!`);
      } else {
        const sortedAppend = [...session.options, ...stampedOptions].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        );
        saveSession({
          ...session,
          options: sortedAppend,
        });
        showNotification('success', `Adicionados ${result.count} novos itens de "${result.fileName}" (em ordem A-Z)!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar arquivo.';
      showNotification('error', msg);
    } finally {
      e.target.value = '';
    }
  };

  // Web Speech API - Microfone para adicionar nomes por voz
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition: any }).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSpeechTranscript(transcript);
      setIsListening(false);
      handleVoiceNames(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      showNotification('error', 'Não foi possível capturar o áudio do microfone.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    if (isListening) {
      try {
        recognition.start();
      } catch (_) {}
    } else {
      try {
        recognition.stop();
      } catch (_) {}
    }

    return () => {
      try {
        recognition.abort();
      } catch (_) {}
    };
  }, [isListening]);

  // Processa nomes falados no microfone
  const handleVoiceNames = (text: string) => {
    // Separa por "e", vírgulas ou quebras
    const rawNames = text
      .split(/,| e | E |\n/)
      .map((n) => n.trim())
      .filter((n) => n.length > 2);

    if (rawNames.length === 0) return;

    const now = Date.now();
    const newOptions: VotingOption[] = rawNames.map((name, idx) => ({
      id: 'opt_' + now + '_' + idx,
      name: name.toUpperCase(),
      votesCount: 0,
      createdAt: now,
    }));

    triggerGlow(newOptions.map((o) => o.id));

    const sortedOptions = [...session.options, ...newOptions].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );

    const updated = {
      ...session,
      options: sortedOptions,
    };

    saveSession(updated);
    showNotification('success', `${newOptions.length} candidato(s) adicionado(s) por voz!`);
  };

  // Adicionar Candidato(s) por Texto ou Voz em Tempo Real (Maiúsculo)
  const handleAddCandidateName = (rawText: string) => {
    if (!rawText.trim()) return;
    const names = rawText
      .split(/,|\n/)
      .map((n) => n.trim().toUpperCase())
      .filter((n) => n.length > 0);

    if (names.length === 0) return;

    const now = Date.now();
    const newOptions: VotingOption[] = names.map((name, idx) => ({
      id: 'opt_' + now + '_' + idx,
      name,
      votesCount: 0,
      createdAt: now,
    }));

    triggerGlow(newOptions.map((o) => o.id));

    const sortedOptions = [...session.options, ...newOptions].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );

    saveSession({
      ...session,
      options: sortedOptions,
    });

    setNewName('');
    showNotification(
      'success',
      names.length === 1 ? `"${names[0]}" adicionado!` : `${names.length} nomes adicionados!`
    );
  };

  // Salvar Correção de Nome Inline
  const handleSaveCandidateEdit = (id: string) => {
    const trimmed = editingCandidateName.trim().toUpperCase();
    if (!trimmed) {
      setEditingCandidateId(null);
      return;
    }
    const updated = session.options
      .map((opt) => (opt.id === id ? { ...opt, name: trimmed, createdAt: Date.now() } : opt))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    triggerGlow([id]);
    saveSession({ ...session, options: updated });
    setEditingCandidateId(null);
    showNotification('success', 'Nome corrigido com sucesso!');
  };

  // Remover Candidato
  const handleRemoveCandidate = (id: string) => {
    saveSession({
      ...session,
      options: session.options.filter((o) => o.id !== id),
    });
  };

  // Exportar Backup para Migração (JSON)
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(session, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `vota_iasd_pauta_${session.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showNotification('success', 'Configurações exportadas para migração!');
  };

  // Importar Backup JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (imported && imported.options) {
          saveSession(imported);
          showNotification('success', 'Pauta e membros importados com sucesso!');
        }
      } catch (err) {
        showNotification('error', 'Arquivo JSON inválido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="w-full px-3 sm:px-4 lg:px-5 py-2.5 text-slate-100">
      {/* MODAL DE EMPATES (BORDA VERMELHA FINA, ESTRELA E "EMPATE" BEM CLARO) */}
      <AnimatePresence>
        {isTieModalOpen && hasTies && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsTieModalOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsTieModalOpen(false);
            }}
            tabIndex={-1}
            className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-xl bg-gradient-to-b from-[#002657] to-[#07132a] border border-rose-500/80 rounded-2xl p-4 sm:p-6 shadow-[0_0_35px_rgba(244,63,94,0.35),0_20px_50px_rgba(0,0,0,0.85)] text-white overflow-hidden my-auto"
            >
              {/* Botão Fechar (X) */}
              <button
                type="button"
                onClick={() => setIsTieModalOpen(false)}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header do Modal (CENTRALIZADO) */}
              <div className="text-center mb-4 pb-3 border-b border-rose-500/30">
                <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white">
                  VOTAÇÃO PARA DESEMPATAR
                </h3>
              </div>

              {/* Lista de Grupos de Empate */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {detectedTies.map((tie, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-[#03152d]/90 border border-rose-500/50 space-y-3 shadow-inner"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-rose-500/20 pb-2">
                      <div>
                        <h4 className="font-black text-xs sm:text-sm text-rose-300 uppercase tracking-wide">
                          {tie.label}
                        </h4>
                        <p className="text-[11px] text-slate-300">
                          <strong className="text-white">{tie.vacanciesInDispute}</strong> {tie.vacanciesInDispute === 1 ? 'vaga em disputa' : 'vagas em disputa'} • <strong className="text-white">{tie.votesCount}</strong> {tie.votesCount === 1 ? 'voto cada' : 'votos cada'}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-500/50">
                        {tie.tiedCandidates.length} Candidatos
                      </span>
                    </div>

                    {/* Cards dos Candidatos Empatados (Clicáveis para o admin selecionar quem desempata) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {tie.tiedCandidates.map((c) => {
                        const isSelected = selectedTieCandidateIds.includes(c.id);

                        return (
                          <div
                            key={c.id}
                            onClick={() => handleToggleTieCandidate(c.id)}
                            className={`p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none flex items-center justify-between gap-2 shadow-sm active:scale-95 ${
                              isSelected
                                ? 'bg-emerald-950/60 border-2 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.35)] ring-2 ring-emerald-400/40 text-white'
                                : 'bg-[#07132a] border border-rose-500/80 hover:border-rose-400 text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {c.photoUrl ? (
                                <img
                                  src={c.photoUrl}
                                  alt={c.name}
                                  className="w-8 h-8 rounded-lg object-cover border border-rose-400/50 shrink-0"
                                />
                              ) : (
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                                    isSelected
                                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                                      : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                                  }`}
                                >
                                  <Star className={`w-4 h-4 ${isSelected ? 'fill-emerald-400 text-emerald-400' : 'fill-rose-400 text-rose-400'}`} />
                                </div>
                              )}
                              <div className="min-w-0">
                                <h5 className="font-black text-xs sm:text-sm text-white uppercase truncate">
                                  {c.name}
                                </h5>
                                <span className={`inline-flex items-center gap-1 text-[8.5px] font-black uppercase ${
                                  isSelected ? 'text-emerald-300' : 'text-rose-300'
                                }`}>
                                  <Star className="w-2 h-2 fill-current" />
                                  EMPATE • {tie.votesCount} {tie.votesCount === 1 ? 'voto' : 'votos'}
                                </span>
                              </div>
                            </div>

                            {/* Indicador de Seleção Circular */}
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                isSelected
                                  ? 'border-emerald-400 bg-emerald-400 text-blue-950 scale-105 shadow-sm'
                                  : 'border-slate-600 bg-slate-900/60'
                              }`}
                            >
                              {isSelected && <CheckCircle className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rodapé do Modal: BOTÃO 3D URNA "CONFIRMA" VERDE COM BRAILLE (PRINT) CENTRALIZADO NO RODAPÉ */}
              <div className="mt-4 pt-3 border-t border-slate-700/60 flex flex-col items-center justify-center w-full">
                <button
                  type="button"
                  onClick={() => handleStartTieBreak(detectedTies[0])}
                  title="Iniciar votação para desempate entre os candidatos selecionados"
                  style={{
                    backgroundColor: '#159636',
                    borderColor: '#24b349',
                    boxShadow: '0 6px 0 #09521b, 3px 6px 0 #063b13',
                  }}
                  className="px-10 pt-2.5 pb-3 rounded-[14px] border-[3px] transition-all duration-200 active:translate-y-[4px] cursor-pointer flex flex-col items-center justify-center select-none"
                >
                  <span className="font-black text-lg sm:text-xl tracking-wider uppercase font-sans text-[#1a1a1a] leading-none">
                    CONFIRMA
                  </span>

                  {/* Pontos em Braille 3D idênticos à tecla física da Urna (Print) */}
                  <div className="flex flex-col items-center gap-[2.5px] mt-2 pointer-events-none">
                    {/* Linha 1: 3 pontos à esquerda, espaço, 4 pontos à direita */}
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2.5" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                    </div>
                    {/* Linha 2 */}
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 opacity-0" />
                      <span className="w-2 h-2 opacity-0" />
                      <span className="w-2 h-2 opacity-0" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2 h-2 opacity-0" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2 h-2 opacity-0" />
                    </div>
                    {/* Linha 3 */}
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 opacity-0" />
                      <span className="w-2 h-2 opacity-0" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2.5" />
                      <span className="w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]" />
                      <span className="w-2 h-2 opacity-0" />
                      <span className="w-2 h-2 opacity-0" />
                      <span className="w-2 h-2 opacity-0" />
                    </div>
                  </div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL BONITO DE CONFIRMAÇÃO (SUBSTITUI O CONFIRM NATIVO DO NAVEGADOR) */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setConfirmModal(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setConfirmModal(null);
            }}
            tabIndex={-1}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-gradient-to-b from-[#002657] to-[#07132a] border-2 border-rose-500/70 rounded-2xl p-6 shadow-[0_0_35px_rgba(244,63,94,0.35),0_20px_50px_rgba(0,0,0,0.85)] text-white overflow-hidden"
            >
              {/* Brilho decorativo superior */}
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-56 h-28 bg-rose-500/20 blur-2xl pointer-events-none" />

              {/* Botão Fechar (X) */}
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center">
                {/* Ícone em destaque */}
                <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border-2 border-rose-400/80 shadow-[0_0_20px_rgba(244,63,94,0.4)] flex items-center justify-center mb-3.5">
                  <Trash2 className="w-7 h-7 text-rose-400" />
                </div>

                <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white mb-1.5">
                  {confirmModal.title}
                </h3>

                {confirmModal.highlight && (
                  <div className="px-3.5 py-1 rounded-lg bg-[#07132a] border border-amber-400/70 text-amber-300 font-black text-xs sm:text-sm uppercase tracking-wider mb-3 shadow-inner">
                    "{confirmModal.highlight}"
                  </div>
                )}

                <p className="text-xs sm:text-sm text-blue-100/85 leading-relaxed mb-6">
                  {confirmModal.description}
                </p>

                <div className="flex items-center justify-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setConfirmModal(null)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#07132a] hover:bg-blue-950 border border-blue-700/80 hover:border-blue-500 text-slate-200 hover:text-white font-black text-xs uppercase tracking-wider transition cursor-pointer active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={confirmModal.onConfirm}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 border border-rose-300/80 text-white font-black text-xs uppercase tracking-wider shadow-[0_0_18px_rgba(244,63,94,0.5)] hover:shadow-[0_0_25px_rgba(244,63,94,0.75)] transition cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{confirmModal.confirmLabel || 'Excluir'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notificação Flutuante */}
      {notification && (
        <div
          className={`fixed top-16 right-4 z-50 p-3 rounded-xl shadow-xl flex items-center gap-2 border text-xs font-semibold transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
              : 'bg-rose-950 border-rose-500 text-rose-200'
          }`}
        >
          <CheckCircle className="w-4 h-4 text-current shrink-0" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* MODAL REUTILIZÁVEL DE CONFIGURAR VOTAÇÃO / CRIAR NOVA VOTAÇÃO */}
      {(() => null)()}

      {/* BARRA DE EVENTOS (+10% DE ALTURA): FAIXA LARANJA ESTENDIDA ATÉ DEBAIXO DO "+ CRIAR VOTAÇÃO" COM TRANSPARÊNCIA A PARTIR DOS 35% INICIAIS ATÉ ZERO */}
      <div className="-mx-3 sm:-mx-4 lg:-mx-5 bg-[#001f47] border-y-2 border-blue-800 shadow-xl mb-3 flex items-stretch justify-between min-h-[71px] relative z-30">
        <div className="flex-1 min-w-0 flex items-stretch justify-between pr-4 sm:pr-6 lg:pr-8 gap-3">
          {/* LINHA CENTRALIZADA VERTICALMENTE: FAIXA LARANJA ("EVENTOS" + "+ CRIAR VOTAÇÃO") À ESQUERDA E EVENTOS CRIADOS À DIREITA */}
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            {/* FAIXA LARANJA/AMARELO PASTEL SUAVE (MENOS INTENSO) DE "EVENTOS" ATÉ DEBAIXO DE "+ CRIAR VOTAÇÃO" */}
            <div
              style={{
                background:
                  'linear-gradient(90deg, rgba(235, 195, 115, 0.72) 0%, rgba(225, 185, 100, 0.6) 35%, rgba(225, 185, 100, 0) 100%)',
              }}
              className="self-stretch flex items-center shrink-0 pr-3 sm:pr-4 py-2.5"
            >
              <button
                type="button"
                onClick={() => {
                  setActiveTab('candidates');
                  setIsBottomSectionOpen(true);
                }}
                className="text-blue-950 hover:text-blue-900 font-black text-xs sm:text-sm uppercase tracking-wider px-5 sm:px-6 self-stretch flex items-center justify-center shrink-0 transition cursor-pointer select-none"
                title="Mostrar seção de nomes do evento"
              >
                EVENTOS
              </button>

              {/* CONTAINER RELATIVO DO BOTÃO "+ CRIAR VOTAÇÃO" E DO MODALZINHO QUE REVELA PARA BAIXO */}
              <div className="relative flex items-center shrink-0 pl-1 sm:pl-2">
                <button
                  ref={createEventBtnRef}
                  data-create-event-btn="true"
                  type="button"
                  onClick={() => {
                    if (isCreatingNewEvent && !editingEventId) {
                      setIsCreatingNewEvent(false);
                      setEditingEventId(null);
                    } else {
                      openCreateEventModal();
                    }
                  }}
                  title="Criar nova votação / evento"
                  className="px-3 py-2 min-h-[34px] rounded-[4px] bg-[#001f47]/85 hover:bg-[#07132a]/95 border border-blue-400 hover:border-amber-300 text-blue-100 hover:text-amber-300 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-[0_6px_16px_rgba(0,0,0,0.7),0_2px_5px_rgba(0,0,0,0.5)]"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                  <span>+ Criar Votação</span>
                </button>

                {/* MODAL DE CRIAR VOTAÇÃO */}
                <AnimatePresence>
                  {isCreatingNewEvent && !editingEventId && renderEventConfigModal()}
                </AnimatePresence>
              </div>
            </div>

            {/* 2 SETINHAS JUNTAS E AZUL APÓS O BOTÃO CRIAR VOTAÇÃO */}
            <ChevronsRight
              className="w-5 h-5 text-blue-400 shrink-0 -mx-0.5 drop-shadow-[0_0_6px_rgba(96,165,250,0.6)]"
              strokeWidth={2.75}
            />

            {/* À DIREITA DO BOTÃO "+ CRIAR VOTAÇÃO": EVENTOS CRIADOS (QTD EM AMARELO, SEM SETINHA, APENAS LÁPIS E LIXEIRA CLICÁVEIS) */}
            {eventsList.map((evt) => {
              const isSelected = evt.id === currentActiveEventId;
              const count = isSelected ? session.options.length : (evt.options?.length || 0);
              const displayName = isSelected ? (session.title || evt.name) : evt.name;
              const isEditingThisEvt = isCreatingNewEvent && editingEventId === evt.id;
              return (
                <div key={evt.id} className="relative flex items-center">
                  <div
                    onClick={() => handleSelectEventButton(evt)}
                    title="Selecionar este evento"
                    className={`group relative pl-3.5 pr-2.5 py-1.5 min-h-[34px] rounded-l-lg rounded-r-md text-[10.5px] uppercase tracking-wider flex items-center gap-1.5 transition-all duration-150 cursor-pointer select-none ${
                      isSelected
                        ? 'font-bold text-white bg-gradient-to-r from-emerald-950/80 via-[#041c30]/75 to-[#07132a]/30 shadow-[0_4px_16px_rgba(0,0,0,0.6)]'
                        : 'font-normal text-slate-200 bg-[#07132a]/80 hover:bg-[#0c1f44]/80 shadow-[0_2px_8px_rgba(0,0,0,0.4)]'
                    }`}
                  >
                    {/* Borda desenhada: mais grossa e arredondada à esquerda, sem borda à direita, superior e inferior com transparência gradual a partir dos 30% */}
                    <div
                      className="absolute inset-0 pointer-events-none rounded-l-lg transition-all duration-150"
                      style={{
                        borderTopWidth: isSelected ? '1.5px' : '1px',
                        borderBottomWidth: isSelected ? '1.5px' : '1px',
                        borderLeftWidth: isSelected ? '4.5px' : '3.5px',
                        borderRightWidth: '0px',
                        borderStyle: 'solid',
                        borderColor: isSelected ? '#10b981' : '#3b82f6',
                        borderTopLeftRadius: '8px',
                        borderBottomLeftRadius: '8px',
                        borderTopRightRadius: '0px',
                        borderBottomRightRadius: '0px',
                        WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%)',
                        maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%)',
                        filter: isSelected ? 'drop-shadow(0 0 5px rgba(16,185,129,0.5))' : undefined,
                        opacity: isSelected ? 1 : 0.6,
                      }}
                    />

                    <span className="relative z-10">{displayName}</span>
                    <span
                      className={`relative z-10 px-1.5 py-0.2 rounded-[3px] text-[12px] font-mono font-black ${
                        isSelected
                          ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/40'
                          : 'bg-[#07132a] text-amber-400'
                      }`}
                    >
                      {count}
                    </span>
                    {/* Único ícone clicável 1: Lápis (Editar Nome e Configurações do Evento) */}
                    <button
                      type="button"
                      data-edit-event-btn="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditingThisEvt) {
                          setIsCreatingNewEvent(false);
                          setEditingEventId(null);
                        } else {
                          openEditEventModal(evt);
                        }
                      }}
                      title="Editar configurações desta votação"
                      className={`relative z-10 p-0.5 transition cursor-pointer active:scale-90 ${
                        isSelected ? 'text-emerald-300 hover:text-white' : 'text-slate-400 hover:text-amber-300'
                      }`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {/* Único ícone clicável 2: Lixeira (Excluir Evento) */}
                    {eventsList.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteEvent(evt.id, e)}
                        title="Excluir este evento"
                        className="relative z-10 p-0.5 text-slate-400 hover:text-rose-400 transition cursor-pointer active:scale-90"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* MODALZINHO POSICIONADO ONDE FOI CLICADO NO LÁPIS DESTE EVENTO */}
                  <AnimatePresence>
                    {isEditingThisEvt && renderEventConfigModal()}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* CANTO DIREITO: ENGRENAGEM COLORIDA (AO CLICAR REVELA SUAVEMENTE AS OPÇÕES EMPURRANDO AS DEMAIS PARA BAIXO) */}
          <div className="flex items-center shrink-0">
            <button
              ref={gearButtonRef}
              type="button"
              onClick={() => setIsGearOpen((prev) => !prev)}
              title="Abrir/Recolher Opções (ESC ou clique fora para recolher)"
              className={`group relative p-1.5 rounded-xl border-2 transition-all duration-300 cursor-pointer active:scale-90 flex items-center justify-center ${
                isGearOpen
                  ? 'bg-[#07132a] border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.45)]'
                  : 'bg-[#07132a]/90 hover:bg-[#0c1f44] border-blue-700/80 hover:border-amber-400/70 shadow-md'
              }`}
            >
              <svg
                viewBox="0 0 64 64"
                className="w-7 h-7 transition-transform duration-1000 ease-in-out group-hover:rotate-[360deg] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
              >
                {/* 8 Dentes Cinza Claro (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°) */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                  <g key={angle} transform={`rotate(${angle} 32 32)`}>
                    <rect
                      x="26"
                      y="3"
                      width="12"
                      height="13"
                      rx="2.5"
                      fill="#e2e8f0"
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                    />
                  </g>
                ))}
                {/* Corpo / Anel Metálico Cinza Claro da Engrenagem */}
                <circle
                  cx="32"
                  cy="32"
                  r="21"
                  fill="#cbd5e1"
                  stroke="#94a3b8"
                  strokeWidth="2"
                />
                {/* Anel Interno de Acabamento */}
                <circle
                  cx="32"
                  cy="32"
                  r="15.5"
                  fill="#94a3b8"
                  stroke="#64748b"
                  strokeWidth="1.2"
                />
                {/* Centro Vermelho Escuro */}
                <circle
                  cx="32"
                  cy="32"
                  r="12.5"
                  fill="#7f1d1d"
                  stroke="#450a0a"
                  strokeWidth="2"
                />
                {/* Brilho Sutil no Núcleo Vermelho Escuro */}
                <circle
                  cx="32"
                  cy="32"
                  r="6"
                  fill="#991b1b"
                  stroke="#b91c1c"
                  strokeWidth="1"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* BANNER DE AVISO DE EMPATE (BORDA VERMELHA FINA, ESTRELA E "EMPATE" CLARO) */}
      {hasTies && (
        <div className="mb-3 p-3 rounded-xl bg-rose-950/40 border border-rose-500/80 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/80 flex items-center justify-center shrink-0">
              <Star className="w-5 h-5 text-rose-400 fill-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-black text-xs sm:text-sm text-white uppercase tracking-wide">
                  Empate Detectado na Apuração
                </h4>
                <span className="px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider bg-rose-600/40 text-rose-300 border border-rose-500/60 inline-flex items-center gap-1">
                  <Star className="w-2.5 h-2.5 fill-rose-400 text-rose-400" />
                  EMPATE
                </span>
              </div>
              <p className="text-[11px] text-rose-200/90 font-medium mt-0.5">
                {detectedTies
                  .map(
                    (t) =>
                      `${t.label} (${t.votesCount} ${t.votesCount === 1 ? 'voto' : 'votos'}): ${t.tiedCandidates.map((c) => c.name).join(', ')}`
                  )
                  .join(' • ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsTieModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shadow-[0_0_15px_rgba(244,63,94,0.4)] shrink-0"
          >
            <Star className="w-3.5 h-3.5 fill-white" />
            <span>Resolver Empate</span>
          </button>
        </div>
      )}

      {/* PAINEL REVELADO PELA ENGRENAGEM: DESLIZA SUAVEMENTE EMPURRANDO AS SEÇÕES ABAIXO, RECOLHE COM ESC / CLIQUE FORA / ENGRENAGEM */}
      <AnimatePresence initial={false}>
        {isGearOpen && (
          <motion.div
            ref={gearPanelRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden mb-3"
          >
            <div className="pt-0.5 pb-1">
              {/* PERSONALIZAR LAYOUT E CORES DOS CARDS NO PAINEL / TELÃO (ESPREMIDO EM 50%) */}
              {(() => {
                const layout = session.telaoLayout || {};
                const cols = layout.columns ?? 2;
                const qrPos = layout.qrPosition ?? 'middle';
                const qrSize = layout.qrSize ?? 100;
                const height = layout.cardHeight ?? 38;
                const gap = layout.cardGapV2 ?? 2;
                const winnerColor = layout.winnerColor || '#10b981';
                const suplenteColor = layout.suplenteColor || '#3b82f6';
                const suplente2Color = layout.suplente2Color || '#64748b';
                const unclassifiedColor = layout.unclassifiedColor || '#1e293b';

                const updateLayout = (patch: Partial<typeof layout>) => {
                  saveSession({
                    ...session,
                    telaoLayout: {
                      columns: cols,
                      qrPosition: qrPos,
                      qrSize,
                      cardHeight: height,
                      cardGapV2: gap,
                      winnerColor,
                      suplenteColor,
                      suplente2Color,
                      unclassifiedColor,
                      ...patch,
                    },
                  });
                };

                return (
                  <div className="space-y-3.5 select-none">
                    {/* CARD 1: TELÃO (PROJEÇÃO PRINCIPAL) - Inspirado no estilo estúdio do Print 2 */}
                    <div className="bg-[#141721] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                      {/* Cabeçalho do Card: Ícone em caixa arredondada + Título/Subtítulo + Indicadores e Ação à Direita */}
                      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-200 shrink-0">
                            <Tv className="w-5 h-5 text-slate-300" />
                          </div>
                          <div>
                            <h3 className="font-medium text-slate-100 text-sm sm:text-base tracking-tight flex items-center gap-2">
                              Telão (Projeção Principal)
                            </h3>
                            <p className="text-xs text-slate-400 font-normal">
                              Monitor do público / membros da congregação
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Indicadores de Dimensão estilo Print 2 (Largura/Altura/Card/QR) */}
                          <div className="hidden md:flex items-center gap-2 text-xs">
                            <span className="text-slate-400 text-[11px] uppercase tracking-wider font-medium">Card:</span>
                            <span className="bg-[#0b0d13] border border-white/[0.08] px-2.5 py-1 rounded-md text-slate-200 font-mono text-xs">
                              {height}px
                            </span>
                            <span className="text-slate-400 text-[11px] uppercase tracking-wider font-medium ml-1">QR:</span>
                            <span className="bg-[#0b0d13] border border-white/[0.08] px-2.5 py-1 rounded-md text-slate-200 font-mono text-xs">
                              {qrSize}%
                            </span>
                          </div>

                          {/* Botão de Projetar / Ocultar 2ª Tela */}
                          {isScreen2Open ? (
                            <button
                              type="button"
                              onClick={() => toggleSecondaryScreen()}
                              title="Fechar / Ocultar a janela do Telão no 2º monitor"
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium transition cursor-pointer active:scale-95 shadow-sm"
                            >
                              <MonitorOff className="w-3.5 h-3.5 text-rose-400" />
                              <span>Ocultar 2ª Tela</span>
                              <X className="w-3.5 h-3.5 opacity-70" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleSecondaryScreen()}
                              title="Abrir o Telão em Tela Cheia no 2º monitor ou projetor"
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition cursor-pointer active:scale-95 shadow-sm"
                            >
                              <Tv className="w-3.5 h-3.5" />
                              <span>Projetar 2ª Tela</span>
                              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                            </button>
                          )}

                          <span className="text-[11px] text-slate-500 hidden sm:inline pl-1">
                            ESC fecha
                          </span>
                        </div>
                      </div>

                      {/* Sub-barra de Pílulas / Segmentos (Idêntica à linha CAMADAS do Print 2) */}
                      <div className="flex flex-wrap items-center gap-4 text-xs pt-0.5">
                        {/* Seletor de Colunas */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                            Colunas:
                          </span>
                          <div className="flex items-center gap-1 bg-[#0b0d13] p-1 rounded-lg border border-white/[0.08]">
                            <button
                              type="button"
                              onClick={() => updateLayout({ columns: 1 })}
                              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                cols === 1
                                  ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <div className="w-3 flex flex-col gap-0.5">
                                <span className="h-0.5 w-full rounded-sm bg-current opacity-90" />
                                <span className="h-0.5 w-full rounded-sm bg-current opacity-90" />
                              </div>
                              <span>1 Coluna</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLayout({ columns: 2 })}
                              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                cols === 2
                                  ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <div className="w-3 grid grid-cols-2 gap-0.5">
                                <span className="h-0.5 w-full rounded-sm bg-current opacity-90" />
                                <span className="h-0.5 w-full rounded-sm bg-current opacity-90" />
                                <span className="h-0.5 w-full rounded-sm bg-current opacity-90" />
                                <span className="h-0.5 w-full rounded-sm bg-current opacity-90" />
                              </div>
                              <span>2 Colunas</span>
                            </button>
                          </div>
                        </div>

                        {/* Divisor vertical */}
                        <div className="h-5 w-px bg-white/[0.08] hidden sm:block" />

                        {/* Seletor de Posição do QR Code */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                            Posição QR:
                          </span>
                          <div className="flex items-center gap-1 bg-[#0b0d13] p-1 rounded-lg border border-white/[0.08]">
                            <button
                              type="button"
                              onClick={() => updateLayout({ qrPosition: 'top' })}
                              title="QR Code no topo da tela"
                              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                qrPos === 'top'
                                  ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="4" x2="20" y2="4" />
                                <rect x="7" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
                              </svg>
                              <span>Topo</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => updateLayout({ qrPosition: 'middle' })}
                              title="QR Code no centro da tela"
                              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                qrPos === 'middle'
                                  ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="12" x2="7" y2="12" />
                                <line x1="17" y1="12" x2="20" y2="12" />
                                <rect x="7" y="8.5" width="10" height="7" rx="1.5" fill="currentColor" />
                              </svg>
                              <span>Centro</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => updateLayout({ qrPosition: 'bottom' })}
                              title="QR Code na base da tela"
                              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                qrPos === 'bottom'
                                  ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="7" y="10" width="10" height="7" rx="1.5" fill="currentColor" />
                                <line x1="4" y1="20" x2="20" y2="20" />
                              </svg>
                              <span>Base</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Grade de Controles Deslizantes (Estilo Estúdio Clean) */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                        {/* Slider: Tamanho do QR */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-3 flex flex-col justify-between gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                              Tamanho do QR Code
                            </span>
                            <span className="text-slate-200 font-mono text-xs px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08]">
                              {qrSize}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateLayout({ qrSize: Math.max(50, qrSize - 5) })}
                              className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-semibold text-xs flex items-center justify-center cursor-pointer active:scale-95 transition"
                            >
                              -
                            </button>
                            <input
                              type="range"
                              min={50}
                              max={150}
                              step={5}
                              value={qrSize}
                              onChange={(e) => updateLayout({ qrSize: Number(e.target.value) })}
                              className="flex-1 h-1.5 bg-white/[0.08] rounded-lg appearance-none cursor-pointer accent-emerald-400"
                            />
                            <button
                              type="button"
                              onClick={() => updateLayout({ qrSize: Math.min(150, qrSize + 5) })}
                              className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-semibold text-xs flex items-center justify-center cursor-pointer active:scale-95 transition"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Slider: Altura dos Cards */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-3 flex flex-col justify-between gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                              Altura dos Cards
                            </span>
                            <span className="text-slate-200 font-mono text-xs px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08]">
                              {height}px
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateLayout({ cardHeight: Math.max(26, height - 4) })}
                              className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-semibold text-xs flex items-center justify-center cursor-pointer active:scale-95 transition"
                            >
                              -
                            </button>
                            <input
                              type="range"
                              min={26}
                              max={76}
                              value={height}
                              onChange={(e) => updateLayout({ cardHeight: Number(e.target.value) })}
                              className="flex-1 h-1.5 bg-white/[0.08] rounded-lg appearance-none cursor-pointer accent-emerald-400"
                            />
                            <button
                              type="button"
                              onClick={() => updateLayout({ cardHeight: Math.min(76, height + 4) })}
                              className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-semibold text-xs flex items-center justify-center cursor-pointer active:scale-95 transition"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Slider: Espaçamento */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-3 flex flex-col justify-between gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                              Espaçamento entre Cards
                            </span>
                            <span className="text-slate-200 font-mono text-xs px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08]">
                              {gap}px
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateLayout({ cardGapV2: Math.max(0, gap - 1) })}
                              className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-semibold text-xs flex items-center justify-center cursor-pointer active:scale-95 transition"
                            >
                              -
                            </button>
                            <input
                              type="range"
                              min={0}
                              max={24}
                              step={1}
                              value={gap}
                              onChange={(e) => updateLayout({ cardGapV2: Number(e.target.value) })}
                              className="flex-1 h-1.5 bg-white/[0.08] rounded-lg appearance-none cursor-pointer accent-emerald-400"
                            />
                            <button
                              type="button"
                              onClick={() => updateLayout({ cardGapV2: Math.min(24, gap + 1) })}
                              className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-semibold text-xs flex items-center justify-center cursor-pointer active:scale-95 transition"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Paleta de Cores dos Cards (Estilo Calibração / Módulos de Cor) */}
                      <div className="pt-2 border-t border-white/[0.06]">
                        <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2.5">
                          Paleta de Cores dos Cards
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          {/* Cor: Titulares */}
                          <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-300">
                                Titulares
                              </span>
                              <input
                                type="color"
                                value={winnerColor}
                                onChange={(e) => updateLayout({ winnerColor: e.target.value })}
                                className="w-5 h-4 rounded cursor-pointer bg-transparent border-0"
                                title="Cor personalizada para Titulares"
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {['#10b981', '#059669', '#22c55e', '#eab308', '#3b82f6', '#8b5cf6', '#06b6d4', '#f43f5e'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => updateLayout({ winnerColor: preset })}
                                  style={{ backgroundColor: preset }}
                                  className={`w-3.5 h-3.5 rounded-full cursor-pointer transition transform active:scale-90 ${
                                    winnerColor.toLowerCase() === preset ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                                  }`}
                                  title={`Cor ${preset}`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Cor: 1º Suplente */}
                          <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-300">
                                1º Suplente
                              </span>
                              <input
                                type="color"
                                value={suplenteColor}
                                onChange={(e) => updateLayout({ suplenteColor: e.target.value })}
                                className="w-5 h-4 rounded cursor-pointer bg-transparent border-0"
                                title="Cor personalizada para 1º Suplente"
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {['#3b82f6', '#2563eb', '#06b6d4', '#6366f1', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => updateLayout({ suplenteColor: preset })}
                                  style={{ backgroundColor: preset }}
                                  className={`w-3.5 h-3.5 rounded-full cursor-pointer transition transform active:scale-90 ${
                                    suplenteColor.toLowerCase() === preset ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                                  }`}
                                  title={`Cor ${preset}`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Cor: 2º Suplente */}
                          <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-300">
                                2º Suplente
                              </span>
                              <input
                                type="color"
                                value={suplente2Color}
                                onChange={(e) => updateLayout({ suplente2Color: e.target.value })}
                                className="w-5 h-4 rounded cursor-pointer bg-transparent border-0"
                                title="Cor personalizada para 2º Suplente"
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {['#64748b', '#475569', '#0d9488', '#d97706', '#7c3aed', '#0284c7', '#9333ea', '#e11d48'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => updateLayout({ suplente2Color: preset })}
                                  style={{ backgroundColor: preset }}
                                  className={`w-3.5 h-3.5 rounded-full cursor-pointer transition transform active:scale-90 ${
                                    suplente2Color.toLowerCase() === preset ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                                  }`}
                                  title={`Cor ${preset}`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Cor: Não Classificados */}
                          <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-300">
                                Não Classificados
                              </span>
                              <input
                                type="color"
                                value={unclassifiedColor}
                                onChange={(e) => updateLayout({ unclassifiedColor: e.target.value })}
                                className="w-5 h-4 rounded cursor-pointer bg-transparent border-0"
                                title="Cor personalizada para Não Classificados"
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {['#1e293b', '#0f172a', '#334155', '#1f2937', '#1e1b4b', '#172554', '#27272a', '#3f3f46'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => updateLayout({ unclassifiedColor: preset })}
                                  style={{ backgroundColor: preset }}
                                  className={`w-3.5 h-3.5 rounded-full cursor-pointer transition transform active:scale-90 ${
                                    unclassifiedColor.toLowerCase() === preset ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                                  }`}
                                  title={`Cor ${preset}`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CARD 2: REGRAS GERAIS DA ELEIÇÃO (PADRÕES) - Inspirado no estilo estúdio do Print 2 */}
                    <div className="bg-[#141721] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                      {/* Cabeçalho do Card */}
                      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-200 shrink-0">
                            <Sliders className="w-5 h-5 text-slate-300" />
                          </div>
                          <div>
                            <h3 className="font-medium text-slate-100 text-sm sm:text-base tracking-tight">
                              Regras da Eleição (Padrões do Sistema)
                            </h3>
                            <p className="text-xs text-slate-400 font-normal">
                              Definições pré-carregadas automaticamente ao criar novas votações
                            </p>
                          </div>
                        </div>

                        <span className="text-[11px] text-slate-400 font-normal px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
                          Novas votações puxam estes padrões
                        </span>
                      </div>

                      {/* Grade de 4 Módulos Estúdio */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* 1. Titulares (Geral) */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                          <span className="text-xs font-medium text-slate-300">
                            Titulares (Geral)
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={session.vacancies || 1}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                saveSession({ ...session, vacancies: val, maxVotesPerVoter: val });
                              }}
                              className="w-full px-3 py-1.5 bg-[#141721] border border-white/[0.08] rounded-lg text-center text-amber-300 font-semibold text-sm outline-none focus:border-emerald-500/50"
                            />
                            <span className="text-xs text-slate-400 font-medium">vagas</span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Vagas para eleição direta
                          </span>
                        </div>

                        {/* 2. 1º Suplente */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-300">
                              1º Suplente
                            </span>
                            <input
                              type="checkbox"
                              checked={session.habilitarSuplente1 !== false}
                              onChange={(e) => {
                                saveSession({ ...session, habilitarSuplente1: e.target.checked });
                              }}
                              className="rounded cursor-pointer accent-emerald-500 w-4 h-4"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={99}
                              disabled={session.habilitarSuplente1 === false}
                              value={session.habilitarSuplente1 === false ? 0 : (session.suplentesCount ?? 1)}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                saveSession({ ...session, suplentesCount: val });
                              }}
                              className="w-full px-3 py-1.5 bg-[#141721] border border-white/[0.08] rounded-lg text-center text-blue-300 font-semibold text-sm outline-none focus:border-emerald-500/50 disabled:opacity-30"
                            />
                            <span className="text-xs text-slate-400 font-medium">vagas</span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {session.habilitarSuplente1 !== false ? 'Habilitado' : 'Desabilitado'}
                          </span>
                        </div>

                        {/* 3. 2º Suplente */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-300">
                              2º Suplente
                            </span>
                            <input
                              type="checkbox"
                              checked={session.habilitarSuplente2 === true}
                              onChange={(e) => {
                                saveSession({ ...session, habilitarSuplente2: e.target.checked });
                              }}
                              className="rounded cursor-pointer accent-emerald-500 w-4 h-4"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={99}
                              disabled={session.habilitarSuplente2 !== true}
                              value={session.habilitarSuplente2 !== true ? 0 : (session.segundoSuplentesCount ?? 1)}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                saveSession({ ...session, segundoSuplentesCount: val });
                              }}
                              className="w-full px-3 py-1.5 bg-[#141721] border border-white/[0.08] rounded-lg text-center text-slate-300 font-semibold text-sm outline-none focus:border-emerald-500/50 disabled:opacity-30"
                            />
                            <span className="text-xs text-slate-400 font-medium">vagas</span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {session.habilitarSuplente2 === true ? 'Habilitado' : 'Desabilitado'}
                          </span>
                        </div>

                        {/* 4. Resolver Empates */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                              <Star className="w-3.5 h-3.5 text-amber-400" />
                              Resolver Empates
                            </span>
                            <input
                              type="checkbox"
                              checked={session.resolverEmpates !== false}
                              onChange={(e) => {
                                saveSession({ ...session, resolverEmpates: e.target.checked });
                              }}
                              className="rounded cursor-pointer accent-emerald-500 w-4 h-4"
                            />
                          </div>
                          <div className="text-xs text-slate-300 py-1">
                            {session.resolverEmpates !== false
                              ? 'Ativado: rodada para desempate'
                              : 'Desativado: majoritária direta'}
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {session.resolverEmpates !== false
                              ? 'Abre votação de desempate se houver empate'
                              : 'Define eleitos pela ordem dos mais votados'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ABA: NOMES / CANDIDATOS (ABRE AO CLICAR NO BOTÃO DO EVENTO NO CABEÇALHO) */}
      {activeTab === 'candidates' && isBottomSectionOpen && (
        <div className="space-y-3.5">
          {/* Inputs ocultos para importação de arquivos */}
          <input
            ref={fileUploadAppendRef}
            type="file"
            accept=".txt,.csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) => handleFileImport(e, 'append')}
          />
          <input
            ref={fileUploadReplaceRef}
            type="file"
            accept=".txt,.csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) => handleFileImport(e, 'replace')}
          />

          {/* 1. SEÇÃO DE DIGITAÇÃO / VOZ COM A SEÇÃO DA DIREITA INDO DO TOPO ATÉ EMBAIXO */}
          <div className="bg-[#001f47] border border-blue-800 rounded-2xl p-4 shadow-xl">
            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
              {/* COLUNA DA ESQUERDA: CABEÇALHO + IMPORTAR DADOS + TEXTAREA */}
              <div className="flex-1 flex flex-col justify-between gap-3 min-w-0">
                {/* CABEÇALHO NA MESMA LINHA: TÍTULO + SEÇÃO "IMPORTAR DADOS" LOGO À FRENTE (SEM FUNDO PRETO E SEM ÍCONE ANTES) */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="font-bold text-white text-sm sm:text-base font-sans tracking-tight">
                      Digite ou fale os nomes
                    </label>
                    {isListening && (
                      <span className="text-[10px] font-bold text-rose-400 bg-rose-950/90 px-2 py-0.5 rounded-full border border-rose-600 animate-pulse flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                        Ouvindo...
                      </span>
                    )}
                  </div>

                  {/* SEÇÃO IMPORTAR (LISTBOX COM EXCEL .XLSX, CSV, TXT + ARRASTE O ARQUIVO AQUI, SEM MODELO .CSV) */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        const syntheticEvent = { target: { files: [file] } } as any;
                        handleFileImport(syntheticEvent, 'append');
                      }
                    }}
                    className="flex flex-wrap items-center gap-2 py-1"
                  >
                    {/* Listbox Importar */}
                    <div className="relative" data-import-listbox="true">
                      <button
                        type="button"
                        onClick={() => setIsImportMenuOpen((prev) => !prev)}
                        className="px-3 py-1 bg-[#07132a] hover:bg-[#0c1f44] border border-blue-600/80 hover:border-amber-400 rounded-lg text-[11px] font-extrabold text-amber-300 uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-sm"
                        title="Clique para escolher o formato de arquivo para importar"
                      >
                        <span>Importar</span>
                        <svg
                          className={`w-3.5 h-3.5 text-amber-400 transition-transform duration-200 ${
                            isImportMenuOpen ? 'rotate-180' : ''
                          }`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      <AnimatePresence>
                        {isImportMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.96 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 top-full mt-1.5 w-40 bg-[#07132a] border border-blue-600 rounded-xl shadow-[0_12px_28px_rgba(0,0,0,0.85)] py-1 z-50 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setIsImportMenuOpen(false);
                                if (fileUploadAppendRef.current) {
                                  fileUploadAppendRef.current.accept = '.xls,.xlsx';
                                  fileUploadAppendRef.current.click();
                                }
                              }}
                              className="w-full px-3 py-1.5 text-left text-xs font-bold text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 flex items-center gap-2 transition cursor-pointer"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                              <span>Excel (.xlsx)</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setIsImportMenuOpen(false);
                                if (fileUploadAppendRef.current) {
                                  fileUploadAppendRef.current.accept = '.csv';
                                  fileUploadAppendRef.current.click();
                                }
                              }}
                              className="w-full px-3 py-1.5 text-left text-xs font-bold text-blue-400 hover:bg-blue-500/15 hover:text-blue-300 flex items-center gap-2 transition cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span>CSV</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setIsImportMenuOpen(false);
                                if (fileUploadAppendRef.current) {
                                  fileUploadAppendRef.current.accept = '.txt';
                                  fileUploadAppendRef.current.click();
                                }
                              }}
                              className="w-full px-3 py-1.5 text-left text-xs font-bold text-slate-300 hover:bg-slate-500/15 hover:text-white flex items-center gap-2 transition cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span>TXT</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Arrastar e Soltar */}
                    <div
                      onClick={() => {
                        if (fileUploadAppendRef.current) {
                          fileUploadAppendRef.current.accept = '.txt,.csv,.xls,.xlsx';
                          fileUploadAppendRef.current.click();
                        }
                      }}
                      className="px-2.5 py-1 bg-[#001f47]/70 hover:bg-[#0c1f44] border border-dashed border-blue-500 hover:border-amber-400 rounded-lg text-[10px] text-blue-200 hover:text-amber-300 font-semibold transition cursor-pointer flex items-center gap-1"
                      title="Arraste qualquer arquivo e solte aqui"
                    >
                      <Upload className="w-3 h-3 text-amber-400" />
                      <span>ou arraste o arquivo aqui</span>
                    </div>
                  </div>
                </div>

                {/* Textarea com Microfone Verde no canto direito centralizado (ALTURA REDUZIDA EM 25%) */}
                <div className="flex-1 relative flex flex-col">
                  <textarea
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddCandidateName(newName);
                      }
                    }}
                    placeholder="DIGITE OU COLE OS NOMES AQUI (DÊ ENTER OU SEPARE POR VÍRGULA OU LINHA)..."
                    className="w-full flex-1 min-h-[115px] sm:min-h-[125px] p-3 pr-14 bg-[#07132a] border-2 border-blue-700/80 focus:border-amber-400 rounded-2xl text-white font-bold text-sm sm:text-base placeholder-slate-400 outline-none transition shadow-inner uppercase resize-none leading-relaxed"
                  />

                  {/* Microfone Verde no Canto Direito Centralizado */}
                  <button
                    type="button"
                    onClick={() => setIsListening(!isListening)}
                    title={isListening ? 'Parar microfone' : 'Falar nomes por voz'}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer ${
                      isListening
                        ? 'bg-rose-600/70 border-rose-300 text-white shadow-[0_0_20px_rgba(244,63,94,0.75)] animate-pulse'
                        : 'bg-emerald-600/50 hover:bg-emerald-600/70 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(52,211,153,0.45)] hover:shadow-[0_0_22px_rgba(52,211,153,0.65)]'
                    }`}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>

                {speechTranscript && isListening && (
                  <p className="text-xs text-amber-300 font-mono bg-blue-950/80 p-2 rounded-lg border border-blue-800">
                    Ouvindo: <span className="text-white font-bold">"{speechTranscript}"</span>
                  </p>
                )}
              </div>

              {/* SEÇÃO DA DIREITA: SEM BORDINHA EXTERNA, BOTÕES COM ALTURA REDUZIDA EM 35%, E SEM BOLD EM MOSTRAR TELÃO E QR.CODE TELÃO */}
              <div className="flex flex-col gap-5 shrink-0 w-full lg:w-48 justify-center">
                {/* 1. Botão NOMES NO TELÃO (SEM COR; ATIVO = SÓ A BORDINHA AZUL) */}
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = session.telaoMode === 'names' ? 'voting' : 'names';
                    saveSession({ ...session, telaoMode: nextMode });
                    showNotification(
                      'success',
                      nextMode === 'names'
                        ? 'Exibindo Nomes para Escolha no Telão!'
                        : 'Exibindo Votação/Resultados no Telão!'
                    );
                  }}
                  className={`h-[46px] px-3 py-1.5 bg-transparent border-2 rounded-lg transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center gap-2 font-normal text-xs text-white ${
                    session.telaoMode === 'names'
                      ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.45)]'
                      : 'border-slate-600/70 hover:border-slate-400'
                  }`}
                  title="Abrir o Telão e alternar exibição dos Nomes para Escolha"
                >
                  <Tv className="w-3.5 h-3.5 shrink-0" />
                  <span>Nomes no telão</span>
                </button>

                {/* 2. Botão QR CODE NO TELÃO (SEM COR; ATIVO = SÓ A BORDINHA AZUL) */}
                <button
                  type="button"
                  onClick={() => {
                    saveSession({
                      ...session,
                      showQrOnTelao: session.showQrOnTelao === false ? true : false,
                    });
                  }}
                  title="Mostrar ou ocultar o QR Code no Telão"
                  className={`h-[46px] px-3 py-1.5 bg-transparent border-2 rounded-lg transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center gap-2 font-normal text-xs text-white ${
                    session.showQrOnTelao !== false
                      ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.45)]'
                      : 'border-slate-600/70 hover:border-slate-400'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  <span>QR CODE no telão</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. NOMES CADASTRADOS (CARDS EM LINHA, SEM SUBTITULO, SEM VOTOS) */}
          <div className="bg-[#001f47] border border-blue-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-sm sm:text-base font-sans tracking-tight flex items-center gap-2">
                <span>Nomes para escolha ({session.options.length})</span>
              </h3>
              {(session.options.length > 0 || backupNamesList.length > 0) && (
                <div className="flex items-center gap-2">
                  {/* Botão Recuperar Nomes: joga todos os nomes na seção de cima separados por vírgula */}
                  <button
                    type="button"
                    onClick={() => {
                      const sourceNames =
                        session.options.length > 0
                          ? session.options.map((o) => o.name)
                          : backupNamesList;
                      if (sourceNames.length === 0) return;
                      const commaSeparated = sourceNames.join(', ');
                      setNewName((prev) =>
                        prev.trim() ? `${prev.trim()}, ${commaSeparated}` : commaSeparated
                      );
                      showNotification(
                        'success',
                        `${sourceNames.length} nomes enviados para o campo de digitação acima (separados por vírgula)!`
                      );
                    }}
                    className="px-3 py-1.5 bg-amber-500/30 hover:bg-amber-500/50 border-2 border-amber-400 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.3)] hover:shadow-[0_0_18px_rgba(251,191,36,0.5)] rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all duration-150 active:scale-90 cursor-pointer"
                    title="Jogar todos os nomes na caixa de digitação acima separados por vírgula"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Recuperar nomes</span>
                  </button>

                  {session.options.length > 0 && (
                    <>
                      {/* Botão A-Z */}
                      <button
                        type="button"
                        onClick={() => {
                          const sorted = [...session.options].sort((a, b) =>
                            a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
                          );
                          saveSession({ ...session, options: sorted });
                          showNotification('success', 'Nomes ordenados em ordem alfabética (A-Z).');
                        }}
                        className="px-3 py-1.5 bg-blue-600/40 hover:bg-blue-600/60 border-2 border-blue-400 text-blue-100 shadow-[0_0_12px_rgba(59,130,246,0.35)] hover:shadow-[0_0_18px_rgba(59,130,246,0.55)] rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all duration-150 active:scale-90 cursor-pointer"
                        title="Ordenar nomes em ordem alfabética (A-Z)"
                      >
                        <ArrowDownAZ className="w-3.5 h-3.5" />
                        <span>A-Z</span>
                      </button>

                      {/* Botão Limpar Tudo (Apenas o ícone de lixeira) */}
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            title: 'Limpar Todos os Nomes',
                            highlight: `${session.options.length} NOMES CADASTRADOS`,
                            description: 'Deseja realmente apagar todos os nomes desta lista? (Você poderá recuperá-los depois pelo botão Recuperar nomes).',
                            confirmLabel: 'Sim, Limpar Tudo',
                            onConfirm: () => {
                              setBackupNamesList(session.options.map((o) => o.name));
                              saveSession({ ...session, options: [] });
                              setConfirmModal(null);
                              showNotification('success', 'Todos os nomes foram apagados.');
                            },
                          });
                        }}
                        className="p-2 bg-rose-600/40 hover:bg-rose-600/60 border-2 border-rose-400 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.35)] hover:shadow-[0_0_18px_rgba(244,63,94,0.55)] rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90 active:bg-rose-600/90 cursor-pointer"
                        title="Apagar todos os nomes cadastrados"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {session.options.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-blue-800 rounded-xl bg-[#07132a]/40">
                Nenhum nome cadastrado ainda. Digite ou fale no campo acima para começar!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-[3px]">
                <AnimatePresence mode="popLayout">
                  {[...session.options]
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
                    .map((option) => {
                      const isEditing = editingCandidateId === option.id;
                      const isGlowing = Boolean(
                        glowingIds[option.id] ||
                          (option.createdAt && Date.now() - option.createdAt < 1500)
                      );
                      return (
                        <motion.div
                          layout
                          key={option.id}
                          initial={{ opacity: 0, scale: 0.82, y: -10 }}
                          animate={{
                            opacity: 1,
                            scale: isGlowing ? 1.04 : 1,
                            y: 0,
                          }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          transition={{
                            layout: { type: 'spring', stiffness: 320, damping: 26 },
                            duration: 0.35,
                          }}
                          className={`w-full px-3.5 py-2 rounded-xl flex items-center justify-between gap-2 transition-all duration-500 group min-w-0 ${
                            isGlowing
                              ? 'bg-gradient-to-r from-amber-500/40 via-yellow-400/35 to-amber-500/40 border-2 border-yellow-300 ring-2 ring-amber-300/90 shadow-[0_0_30px_rgba(251,191,36,0.95),inset_0_0_16px_rgba(254,240,138,0.65)] z-10'
                              : 'bg-[#07132a] hover:bg-[#0c1f44] border border-blue-800/80 hover:border-amber-400/80 shadow-sm'
                          }`}
                        >
                          {/* Nome Editável Inline (Largura Fixa na Coluna) */}
                          {isEditing ? (
                            <input
                              type="text"
                              autoFocus
                              value={editingCandidateName}
                              onChange={(e) => setEditingCandidateName(e.target.value)}
                              onBlur={() => handleSaveCandidateEdit(option.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveCandidateEdit(option.id);
                                if (e.key === 'Escape') setEditingCandidateId(null);
                              }}
                              className="w-full min-w-0 px-2 py-0.5 bg-blue-950 border border-amber-400 rounded text-xs text-white font-bold uppercase outline-none"
                            />
                          ) : (
                            <span
                              onClick={() => {
                                setEditingCandidateId(option.id);
                                setEditingCandidateName(option.name);
                              }}
                              className={`flex-1 min-w-0 truncate font-black text-xs uppercase tracking-wide cursor-pointer transition-colors duration-500 ${
                                isGlowing
                                  ? 'text-yellow-100 drop-shadow-[0_0_10px_rgba(254,240,138,1)]'
                                  : 'text-white hover:text-amber-300'
                              }`}
                              title={`${option.name} (Clique para editar)`}
                            >
                              {option.name}
                            </span>
                          )}

                          {/* Botão de Excluir */}
                          <button
                            type="button"
                            onClick={() => handleRemoveCandidate(option.id)}
                            title="Remover nome"
                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ABA 3: CONFIGURAÇÕES E MIGRAÇÃO (REDUZIDO EM 30%) */}
      {activeTab === 'settings' && (
        <div className="space-y-3.5">
          <div className="bg-[#001f47] border border-blue-800 rounded-2xl p-4 shadow-lg">
            <h3 className="font-bold text-white text-sm font-serif mb-3">
              Parâmetros da Sessão de Votação
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-blue-200 block mb-1">Título da Pauta:</label>
                <input
                  type="text"
                  value={session.title}
                  onChange={(e) => saveSession({ ...session, title: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#07132a] border border-blue-700 rounded-lg text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-blue-200 block mb-1">Título Público no Telão:</label>
                <input
                  type="text"
                  placeholder="Ex: VOTAÇÃO ESCOLHA DIÁCONOS"
                  value={session.publicTitle || ''}
                  onChange={(e) => saveSession({ ...session, publicTitle: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#07132a] border border-blue-700 rounded-lg text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-blue-200 block mb-1">Categoria / Departamento:</label>
                <input
                  type="text"
                  value={session.category || ''}
                  onChange={(e) => saveSession({ ...session, category: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#07132a] border border-blue-700 rounded-lg text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-blue-200 block mb-1">Código PIN (Segurança):</label>
                <input
                  type="text"
                  maxLength={6}
                  value={session.pin}
                  onChange={(e) => saveSession({ ...session, pin: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#07132a] border border-blue-700 rounded-lg text-xs text-amber-300 font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-blue-200 block mb-1">Vagas Titulares:</label>
                <input
                  type="number"
                  min={1}
                  value={session.vacancies}
                  onChange={(e) => saveSession({ ...session, vacancies: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 bg-[#07132a] border border-blue-700 rounded-lg text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-blue-200 block mb-1">Suplentes:</label>
                <input
                  type="number"
                  min={0}
                  value={session.suplentesCount}
                  onChange={(e) => saveSession({ ...session, suplentesCount: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 bg-[#07132a] border border-blue-700 rounded-lg text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-blue-200 block mb-1">Limite Votos / Membro:</label>
                <input
                  type="number"
                  min={1}
                  value={session.maxVotesPerVoter}
                  onChange={(e) => saveSession({ ...session, maxVotesPerVoter: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 bg-[#07132a] border border-blue-700 rounded-lg text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* FERRAMENTA DE MIGRAÇÃO: EXPORTAR E IMPORTAR (COMPACTO) */}
          <div className="bg-[#001f47] border border-blue-800 rounded-2xl p-4 shadow-lg">
            <h3 className="font-bold text-white text-sm font-serif mb-1.5 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-[#d4af37]" />
              Migração entre Contas Google / Backup
            </h3>
            <p className="text-[11px] text-blue-200 mb-3 leading-relaxed">
              Exporte todos os dados e cadastros em JSON para migrar para a conta oficial da igreja em segundos.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportJson}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar Pauta e Membros (JSON)
              </button>

              <label className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs rounded-lg shadow transition flex items-center gap-1.5 cursor-pointer active:scale-95">
                <Upload className="w-3.5 h-3.5" />
                Importar Arquivo JSON
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportJson}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
