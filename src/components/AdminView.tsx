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
  BarChart3,
  TrendingUp,
  Users,
  Activity,
  Award,
  AlertCircle,
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
  const [adminVotingView, setAdminVotingView] = useState<'dashboard' | 'names'>('dashboard');
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
  const [tieWarningModal, setTieWarningModal] = useState<string | null>(null);
  const [tieWarningTrigger, setTieWarningTrigger] = useState<number>(0);
  const [isScreen2Open, setIsScreen2Open] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeSecondaryScreen(setIsScreen2Open);
    return unsub;
  }, []);

  // Auto-dismiss do modalzinho laranja após 3.5 segundos
  useEffect(() => {
    if (!tieWarningModal) return;
    const t = setTimeout(() => setTieWarningModal(null), 3500);
    return () => clearTimeout(t);
  }, [tieWarningModal, tieWarningTrigger]);

  const handleToggleTieCandidate = (id: string, maxAllowed: number) => {
    if (selectedTieCandidateIds.includes(id)) {
      setSelectedTieCandidateIds((prev) => prev.filter((cId) => cId !== id));
      setTieWarningModal(null);
    } else {
      if (selectedTieCandidateIds.length >= maxAllowed) {
        setTieWarningTrigger(Date.now());
        setTieWarningModal(`VOCÊ JÁ ESCOLHEU ${maxAllowed} ${maxAllowed === 1 ? 'NOME' : 'NOMES'}`);
        return;
      }
      setSelectedTieCandidateIds((prev) => [...prev, id]);
    }
  };
  const detectedTies = session.status === 'CLOSED' ? detectVotingTies(session) : [];
  const hasTies = detectedTies.length > 0;

  const isVotingActive = session.status === 'VOTING' || session.status === 'TIE_BREAK';
  const activeOptions =
    session.status === 'TIE_BREAK' && session.tieBreak?.active
      ? session.tieBreak.options || []
      : session.options || [];

  const rankedCandidates = [...activeOptions].sort((a, b) => {
    const diff = (b.votesCount || 0) - (a.votesCount || 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });

  const totalVotesCast = activeOptions.reduce((acc, curr) => acc + (curr.votesCount || 0), 0);
  const maxVotesRecorded = Math.max(...activeOptions.map((o) => o.votesCount || 0), 1);
  const vacancies = session.vacancies || 1;
  const s1Count = session.habilitarSuplente1 !== false ? (session.suplentesCount ?? 1) : 0;
  const s2Count = session.habilitarSuplente2 === true ? (session.segundoSuplentesCount ?? 1) : 0;
  const totalVacancies = vacancies + s1Count + s2Count;
  const cutoffVotes = rankedCandidates[vacancies - 1]?.votesCount || 0;

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
        className="absolute top-full left-0 mt-2 z-50 w-[350px] sm:w-[410px] max-w-[calc(100vw-24px)]"
      >
        <div className="relative bg-[#141721] rounded-xl p-3.5 shadow-[0_0_24px_rgba(52,211,153,0.18),0_14px_34px_rgba(0,0,0,0.85)] space-y-3">
          {/* Borda Designer: espessura reduzida em 30% (1.4px) com gradientes direcionais solicitados */}
          <div className="absolute inset-0 pointer-events-none rounded-xl" style={{ filter: 'drop-shadow(0 0 5px rgba(16,185,129,0.3))' }}>
            {/* Canto superior esquerdo arredondado */}
            <div
              className="absolute top-0 left-0 w-4 h-4 rounded-tl-xl pointer-events-none"
              style={{ borderTop: '1.4px solid #10b981', borderLeft: '1.4px solid #10b981' }}
            />
            {/* Linha superior: no sentido da esquerda para a direita ficando transparente */}
            <div
              className="absolute top-0 left-4 right-0 pointer-events-none"
              style={{ height: '1.4px', background: 'linear-gradient(to right, #10b981 0%, rgba(16,185,129,0) 100%)' }}
            />
            {/* Linha esquerda: no sentido descendo ficando transparente até 100% */}
            <div
              className="absolute top-4 bottom-0 left-0 pointer-events-none"
              style={{ width: '1.4px', background: 'linear-gradient(to bottom, #10b981 0%, rgba(16,185,129,0) 100%)' }}
            />

            {/* Canto inferior direito arredondado */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 rounded-br-xl pointer-events-none"
              style={{ borderBottom: '1.4px solid #10b981', borderRight: '1.4px solid #10b981' }}
            />
            {/* Linha inferior: da direita para a esquerda ficando transparente */}
            <div
              className="absolute bottom-0 right-4 left-0 pointer-events-none"
              style={{ height: '1.4px', background: 'linear-gradient(to left, #10b981 0%, rgba(16,185,129,0) 100%)' }}
            />
            {/* Linha direita: no sentido subindo ficando transparente até 100% */}
            <div
              className="absolute bottom-4 top-0 right-0 pointer-events-none"
              style={{ width: '1.4px', background: 'linear-gradient(to top, #10b981 0%, rgba(16,185,129,0) 100%)' }}
            />
          </div>

          {/* Cabeçalho */}
          <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08]">
            <span className="text-xs font-medium text-slate-200 tracking-wide flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-slate-400" />
              {isEditing ? 'Configurar votação' : 'Nova votação'}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsCreatingNewEvent(false);
                setEditingEventId(null);
              }}
              className="p-0.5 text-slate-400 hover:text-slate-100 rounded transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nome da Votação */}
          <div>
            <label className="text-xs font-normal text-slate-300 block mb-1">
              Nome da votação:
            </label>
            <input
              type="text"
              autoFocus
              placeholder="Digite o nome (ex: Eleição do Tesoureiro)..."
              value={eventFormName}
              onChange={(e) => setEventFormName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveEventModal();
                }
              }}
              className="w-full px-3 py-1.5 bg-[#0b0d13] border border-white/[0.1] focus:border-emerald-500/60 rounded-lg text-xs font-normal text-slate-100 outline-none placeholder-slate-500 shadow-sm"
            />
          </div>

          {/* Vagas Titulares, 1º Suplente e 2º Suplente */}
          <div className="grid grid-cols-3 gap-2">
            {/* Titulares */}
            <div className="bg-[#0b0d13] border border-white/[0.08] rounded-lg p-2.5 flex flex-col justify-between gap-1.5">
              <span className="text-[11px] font-normal text-slate-300 block">
                Titulares:
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={eventFormVacancies}
                  onChange={(e) => setEventFormVacancies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-1.5 py-1 bg-[#141721] border border-white/[0.08] focus:border-emerald-500/50 rounded text-center text-slate-200 font-medium text-xs outline-none"
                />
                <span className="text-[10px] text-slate-400 font-normal">vagas</span>
              </div>
            </div>

            {/* 1º Suplente */}
            <div className="bg-[#0b0d13] border border-white/[0.08] rounded-lg p-2.5 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-normal text-slate-300">
                  1º suplente:
                </span>
                <input
                  type="checkbox"
                  checked={eventFormSuplente1Enabled}
                  onChange={(e) => setEventFormSuplente1Enabled(e.target.checked)}
                  className="rounded cursor-pointer accent-emerald-500 w-3.5 h-3.5"
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
                  className="w-full px-1.5 py-1 bg-[#141721] border border-white/[0.08] focus:border-emerald-500/50 rounded text-center text-slate-200 font-medium text-xs outline-none disabled:opacity-30"
                />
                <span className="text-[10px] text-slate-400 font-normal">vagas</span>
              </div>
            </div>

            {/* 2º Suplente */}
            <div className="bg-[#0b0d13] border border-white/[0.08] rounded-lg p-2.5 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-normal text-slate-300">
                  2º suplente:
                </span>
                <input
                  type="checkbox"
                  checked={eventFormSuplente2Enabled}
                  onChange={(e) => setEventFormSuplente2Enabled(e.target.checked)}
                  className="rounded cursor-pointer accent-emerald-500 w-3.5 h-3.5"
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
                  className="w-full px-1.5 py-1 bg-[#141721] border border-white/[0.08] focus:border-emerald-500/50 rounded text-center text-slate-200 font-medium text-xs outline-none disabled:opacity-30"
                />
                <span className="text-[10px] text-slate-400 font-normal">vagas</span>
              </div>
            </div>
          </div>

          {/* Se terá empate (Resolver Empates) */}
          <div className="bg-[#0b0d13] border border-white/[0.08] rounded-lg px-2.5 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
              <div>
                <span className="text-xs font-normal text-slate-300 block">
                  Resolver empates:
                </span>
                <span className="text-[10px] text-slate-400 block">
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

          {/* Botão Salvar */}
          <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={handleSaveEventModal}
              className="px-4 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-medium text-xs rounded-lg cursor-pointer active:scale-95 transition shadow-sm"
            >
              {isEditing ? 'Salvar' : 'Criar votação'}
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

  // Web Speech API - Digitação por voz robusta em tempo real
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef<boolean>(false);
  const baseSpeechTextRef = useRef<string>('');

  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {
        try {
          recognitionRef.current.abort();
        } catch (__) {}
      }
      recognitionRef.current = null;
    }
  };

  const startListening = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition: any }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showNotification(
        'error',
        'Seu navegador não suporta digitação por voz. Por favor, utilize o Google Chrome ou Microsoft Edge.'
      );
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      baseSpeechTextRef.current = newName.trim();

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
        setSpeechTranscript('');
        showNotification('success', 'Microfone ativo! Fale os nomes que eles serão digitados...');
      };

      recognition.onresult = (event: any) => {
        let finalStr = '';
        let interimStr = '';

        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || '';
          if (item.isFinal) {
            finalStr += transcript + ' ';
          } else {
            interimStr += transcript;
          }
        }

        const currentSpeech = (finalStr + interimStr).trim();
        setSpeechTranscript(currentSpeech);

        if (currentSpeech) {
          const prefix = baseSpeechTextRef.current
            ? baseSpeechTextRef.current +
              (baseSpeechTextRef.current.endsWith(',') || baseSpeechTextRef.current.endsWith('\n')
                ? ' '
                : ', ')
            : '';
          setNewName(prefix + currentSpeech);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'no-speech') {
          // Silêncio breve não encerra o microfone
          return;
        }
        isListeningRef.current = false;
        setIsListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          showNotification(
            'error',
            'Permissão de microfone negada. Clique no ícone de cadeado na barra de endereço do navegador e permita o microfone.'
          );
        } else if (event.error === 'network') {
          showNotification('error', 'Falha de conexão com o serviço de voz do navegador.');
        } else {
          showNotification('error', `Aviso do microfone: ${event.error || 'não reconhecido'}`);
        }
      };

      recognition.onend = () => {
        // Se ainda deve continuar ouvindo (ex: reinício automático do Chrome após pausa), reinicia
        if (isListeningRef.current) {
          try {
            recognition.start();
            return;
          } catch (_) {}
        }
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Erro ao iniciar reconhecimento de voz:', err);
      isListeningRef.current = false;
      setIsListening(false);
      showNotification('error', 'Não foi possível ligar o microfone. Verifique as permissões do navegador.');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
      showNotification('success', 'Microfone pausado. Nomes digitados no campo!');
    } else {
      startListening();
    }
  };

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, []);

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
      {/* AVISO QUICANDO: VOCÊ JÁ ESCOLHEU XX NOMES (MODALZINHO LARANJA COM ALTA VISIBILIDADE) */}
      <AnimatePresence>
        {tieWarningModal && (
          <motion.div
            key={`tie-warning-${tieWarningTrigger}`}
            onClick={() => setTieWarningModal(null)}
            initial={{ y: -50, opacity: 0, scale: 0.88 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0, scale: 0.88 }}
            transition={{
              type: 'spring',
              stiffness: 550,
              damping: 18,
              mass: 0.85,
            }}
            className="fixed top-5 inset-x-4 max-w-sm mx-auto p-3.5 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 border-2 border-amber-200 text-white flex items-center justify-center gap-2.5 shadow-[0_16px_36px_rgba(249,115,22,0.7),0_6px_14px_rgba(0,0,0,0.6)] cursor-pointer select-none z-[9999]"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-white drop-shadow self-center" />
            <div className="flex flex-col items-center text-center gap-0.5">
              <span className="font-black text-xs sm:text-sm tracking-wide uppercase drop-shadow">
                {tieWarningModal}
              </span>
              <span className="text-[10.5px] text-amber-100 font-medium tracking-normal normal-case">
                Para escolher outro candidato, desmarque um nome primeiro.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE EMPATES (BORDA VERMELHA FINA, ESTRELA E "EMPATE" BEM CLARO) */}
      <AnimatePresence>
        {isTieModalOpen && hasTies && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              setIsTieModalOpen(false);
              setTieWarningModal(null);
              setSelectedTieCandidateIds([]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsTieModalOpen(false);
                setTieWarningModal(null);
                setSelectedTieCandidateIds([]);
              }
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
                onClick={() => {
                  setIsTieModalOpen(false);
                  setTieWarningModal(null);
                  setSelectedTieCandidateIds([]);
                }}
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
                {detectedTies.map((tie, idx) => {
                  const maxAllowed = tie.vacanciesInDispute + 1;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#03152d]/90 border border-rose-500/50 space-y-3 shadow-inner"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-rose-500/20 pb-2">
                        <div>
                          <h4 className="font-black text-sm sm:text-base text-amber-300 tracking-wide">
                            {tie.vacanciesInDispute === 1
                              ? 'É 1 vaga, escolha 2 nomes'
                              : `São ${tie.vacanciesInDispute} vagas, escolha ${tie.vacanciesInDispute + 1} nomes`}
                          </h4>
                          <p className="text-[11px] text-slate-300">
                            {tie.label} • <strong className="text-white">{tie.votesCount}</strong> {tie.votesCount === 1 ? 'voto cada' : 'votos cada'}
                          </p>
                        </div>
                      </div>

                      {/* Cards dos Candidatos Empatados (Clicáveis para o admin selecionar quem desempata) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {tie.tiedCandidates.map((c) => {
                          const isSelected = selectedTieCandidateIds.includes(c.id);

                          return (
                            <div
                              key={c.id}
                              onClick={() => handleToggleTieCandidate(c.id, maxAllowed)}
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
                );
              })}
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

      {/* BARRA DE EVENTOS: LAYOUT ESTÚDIO MODERNO COM CORES SUAVES E SEM CAIXA ALTA */}
      <div className="-mx-3 sm:-mx-4 lg:-mx-5 bg-[#141721] border-y border-white/[0.08] shadow-lg mb-3 flex items-stretch justify-between min-h-[58px] relative z-30">
        <div className="flex-1 min-w-0 flex items-stretch justify-between pr-4 sm:pr-6 lg:pr-8 gap-3">
          {/* LINHA CENTRALIZADA VERTICALMENTE: "EVENTOS" + "+ CRIAR VOTAÇÃO" À ESQUERDA E EVENTOS CRIADOS À DIREITA */}
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            {/* FAIXA SUTIL DE "EVENTOS" ATÉ O BOTÃO "+ CRIAR VOTAÇÃO" */}
            <div className="self-stretch flex items-center shrink-0 pr-3 sm:pr-4 py-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('candidates');
                  setIsBottomSectionOpen(true);
                }}
                className="text-slate-300 hover:text-white font-medium text-xs sm:text-sm tracking-wide px-4 sm:px-5 self-stretch flex items-center justify-center shrink-0 transition cursor-pointer select-none"
                title="Mostrar seção de nomes do evento"
              >
                Eventos
              </button>

              {/* CONTAINER RELATIVO DO BOTÃO "+ CRIAR VOTAÇÃO" E DO MODALZINHO */}
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
                  className="px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-medium text-xs tracking-normal flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>+ Criar votação</span>
                </button>

                {/* MODAL DE CRIAR VOTAÇÃO */}
                <AnimatePresence>
                  {isCreatingNewEvent && !editingEventId && renderEventConfigModal()}
                </AnimatePresence>
              </div>
            </div>

            {/* SETINHAS DISCRETAS APÓS O BOTÃO CRIAR VOTAÇÃO */}
            <ChevronsRight
              className="w-4 h-4 text-slate-500 shrink-0 -mx-0.5"
              strokeWidth={2}
            />

            {/* EVENTOS CRIADOS COM BORDA DESIGNER DIRECIONAL */}
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
                    className={`group relative pl-3.5 pr-2.5 py-1.5 min-h-[34px] rounded-l-lg rounded-r-md text-xs tracking-normal flex items-center gap-1.5 transition-all duration-150 cursor-pointer select-none ${
                      isSelected
                        ? 'font-medium text-slate-100 bg-[#0b0d13] shadow-md'
                        : 'font-normal text-slate-400 bg-[#0b0d13]/60 hover:bg-[#0b0d13] hover:text-slate-200'
                    }`}
                  >
                    {/* Borda desenhada com gradientes suaves */}
                    <div
                      className="absolute inset-0 pointer-events-none rounded-l-lg transition-all duration-150"
                      style={{
                        borderTopWidth: isSelected ? '1.5px' : '1px',
                        borderBottomWidth: isSelected ? '1.5px' : '1px',
                        borderLeftWidth: isSelected ? '4.5px' : '3.5px',
                        borderRightWidth: '0px',
                        borderStyle: 'solid',
                        borderColor: isSelected ? '#10b981' : 'rgba(255,255,255,0.18)',
                        borderTopLeftRadius: '8px',
                        borderBottomLeftRadius: '8px',
                        borderTopRightRadius: '0px',
                        borderBottomRightRadius: '0px',
                        WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%)',
                        maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%)',
                        filter: isSelected ? 'drop-shadow(0 0 5px rgba(16,185,129,0.35))' : undefined,
                        opacity: isSelected ? 1 : 0.6,
                      }}
                    />

                    <span className="relative z-10">{displayName}</span>
                    <span
                      className={`relative z-10 px-1.5 py-0.5 rounded-[4px] text-xs font-mono font-medium ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-white/[0.06] text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                    {/* Lápis */}
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
                        isSelected ? 'text-emerald-300 hover:text-white' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {/* Lixeira */}
                    {eventsList.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteEvent(evt.id, e)}
                        title="Excluir este evento"
                        className="relative z-10 p-0.5 text-slate-500 hover:text-rose-400 transition cursor-pointer active:scale-90"
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

          {/* CANTO DIREITO: TELÃO (NOMES & QR) + ENGRENAGEM */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 1. Botão Ícone: Exibir NOMES no Telão */}
            <div className="relative group">
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
                className={`p-2 rounded-xl border transition-all duration-200 cursor-pointer active:scale-90 flex items-center justify-center ${
                  session.telaoMode === 'names'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.35)]'
                    : 'bg-[#0b0d13] hover:bg-[#141721] border-white/[0.1] text-slate-400 hover:text-slate-200 hover:border-white/[0.2] shadow-sm'
                }`}
                title="Exibir NOMES no Telão"
                aria-label="Exibir NOMES no Telão"
              >
                <Tv className="w-4 h-4" />
              </button>

              {/* Hint ao passar o mouse */}
              <div className="absolute top-full right-0 mt-2 hidden group-hover:flex items-center px-2.5 py-1 bg-[#141721] border border-white/[0.12] text-slate-200 text-[11px] font-medium rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                Exibir NOMES no Telão
              </div>
            </div>

            {/* 2. Botão Ícone: Exibir o QR CODE no telão */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  saveSession({
                    ...session,
                    showQrOnTelao: session.showQrOnTelao === false ? true : false,
                  });
                }}
                className={`p-2 rounded-xl border transition-all duration-200 cursor-pointer active:scale-90 flex items-center justify-center ${
                  session.showQrOnTelao !== false
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.35)]'
                    : 'bg-[#0b0d13] hover:bg-[#141721] border-white/[0.1] text-slate-400 hover:text-slate-200 hover:border-white/[0.2] shadow-sm'
                }`}
                title="Exibir o QR CODE no telão"
                aria-label="Exibir o QR CODE no telão"
              >
                <QrCode className="w-4 h-4" />
              </button>

              {/* Hint ao passar o mouse */}
              <div className="absolute top-full right-0 mt-2 hidden group-hover:flex items-center px-2.5 py-1 bg-[#141721] border border-white/[0.12] text-slate-200 text-[11px] font-medium rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                Exibir o QR CODE no telão
              </div>
            </div>

            {/* Divisor sutil */}
            <div className="h-5 w-px bg-white/[0.1] mx-0.5" />

            {/* 3. Engrenagem */}
            <button
              ref={gearButtonRef}
              type="button"
              onClick={() => setIsGearOpen((prev) => !prev)}
              title="Abrir/Recolher Opções (ESC ou clique fora para recolher)"
              className={`group relative p-2 rounded-xl border transition-all duration-300 cursor-pointer active:scale-90 flex items-center justify-center ${
                isGearOpen
                  ? 'bg-[#0b0d13] border-emerald-500/60 shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                  : 'bg-[#0b0d13] hover:bg-[#141721] border-white/[0.1] hover:border-white/[0.2] shadow-sm'
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

      {/* BANNER DE AVISO DE EMPATE (50% MAIS ESTREITO, CENTRALIZADO, COM CAPTION E BOTÃO À DIREITA) */}
      {hasTies && (
        <div className="mb-3 px-4 py-2.5 rounded-xl bg-[#141721] border border-rose-500/80 shadow-[0_0_20px_rgba(244,63,94,0.25)] flex items-center justify-between gap-3 w-full sm:w-[50%] min-w-[340px] max-w-[620px] mx-auto backdrop-blur-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-400/80 flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 text-rose-400 fill-rose-400" />
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-white uppercase tracking-wide truncate">
              TEMOS EMPATES PARA RESOLVER
            </h4>
          </div>
          <button
            type="button"
            onClick={() => setIsTieModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shadow-[0_0_15px_rgba(244,63,94,0.4)] shrink-0"
          >
            <Star className="w-3.5 h-3.5 fill-white" />
            <span>RESOLVER EMPATE</span>
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
                  <div className="space-y-2.5 select-none">
                    {/* CARD 1: TELÃO (PROJEÇÃO PRINCIPAL) - ESMAGADO EM LINHA ÚNICA COM CORES À DIREITA */}
                    <div className="bg-[#141721] border border-white/[0.08] rounded-xl px-3.5 py-3.5 space-y-2.5 shadow-lg">
                      {/* Cabeçalho Compacto: Configuração de como será exibido os elementos no Telão [público] + Botão Projetar 2ª Tela */}
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-200 shrink-0">
                            <Tv className="w-3.5 h-3.5 text-slate-300" />
                          </div>
                          <span className="font-medium text-slate-100 text-xs sm:text-sm tracking-tight">
                            Configuração de como será exibido os elementos no Telão [público]
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
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
                          <span className="text-[10px] text-slate-500 hidden sm:inline pl-1">
                            ESC fecha
                          </span>
                        </div>
                      </div>

                      {/* TUDO NA MESMA LINHA (ESMAGADO): Colunas, Posição QR, Sliders e Cores à Direita */}
                      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2 text-xs">
                        {/* GRUPO ESQUERDA: Colunas + Posição QR + 3 Sliders Compactos */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* 1. Colunas */}
                          <div className="flex items-center gap-1.5 bg-[#0b0d13] px-3 py-2.5 rounded-lg border border-white/[0.08] min-h-[38px]">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Colunas:</span>
                            <button
                              type="button"
                              onClick={() => updateLayout({ columns: 1 })}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                                cols === 1 ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              1 Col
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLayout({ columns: 2 })}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                                cols === 2 ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              2 Cols
                            </button>
                          </div>

                          {/* 2. Disposição QR Code */}
                          <div className="flex items-center gap-1 bg-[#0b0d13] px-3 py-2.5 rounded-lg border border-white/[0.08] min-h-[38px]">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mr-0.5">DISP. QR CODE:</span>
                            <button
                              type="button"
                              onClick={() => updateLayout({ qrPosition: 'top' })}
                              title="QR no topo"
                              className={`px-2 py-1 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                qrPos === 'top' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="4" y1="4" x2="20" y2="4" /><rect x="7" y="7" width="10" height="7" rx="1.5" fill="currentColor" /></svg>
                              <span>Topo</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLayout({ qrPosition: 'middle' })}
                              title="QR no centro"
                              className={`px-2 py-1 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                qrPos === 'middle' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="4" y1="12" x2="7" y2="12" /><line x1="17" y1="12" x2="20" y2="12" /><rect x="7" y="8.5" width="10" height="7" rx="1.5" fill="currentColor" /></svg>
                              <span>Centro</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLayout({ qrPosition: 'bottom' })}
                              title="QR na base"
                              className={`px-2 py-1 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                qrPos === 'bottom' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="7" y="10" width="10" height="7" rx="1.5" fill="currentColor" /><line x1="4" y1="20" x2="20" y2="20" /></svg>
                              <span>Base</span>
                            </button>
                          </div>

                          {/* 3. Slider Tamanho QR Code */}
                          <div className="flex items-center gap-1.5 bg-[#0b0d13] px-3 py-2.5 rounded-lg border border-white/[0.08] min-h-[38px]">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">TAM. QR CODE:</span>
                            <button
                              type="button"
                              onClick={() => updateLayout({ qrSize: Math.max(50, qrSize - 5) })}
                              className="w-5 h-5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer active:scale-90"
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
                              className="w-16 h-2 bg-white/[0.08] rounded appearance-none cursor-pointer accent-emerald-400"
                            />
                            <button
                              type="button"
                              onClick={() => updateLayout({ qrSize: Math.min(150, qrSize + 5) })}
                              className="w-5 h-5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer active:scale-90"
                            >
                              +
                            </button>
                            <span className="text-slate-200 font-mono text-xs px-1.5 py-0.5 rounded bg-white/[0.05]">
                              {qrSize}%
                            </span>
                          </div>

                          {/* 4. Slider Altura dos Cards */}
                          <div className="flex items-center gap-1.5 bg-[#0b0d13] px-3 py-2.5 rounded-lg border border-white/[0.08] min-h-[38px]">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Altura:</span>
                            <button
                              type="button"
                              onClick={() => updateLayout({ cardHeight: Math.max(26, height - 4) })}
                              className="w-5 h-5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer active:scale-90"
                            >
                              -
                            </button>
                            <input
                              type="range"
                              min={26}
                              max={76}
                              value={height}
                              onChange={(e) => updateLayout({ cardHeight: Number(e.target.value) })}
                              className="w-16 h-2 bg-white/[0.08] rounded appearance-none cursor-pointer accent-emerald-400"
                            />
                            <button
                              type="button"
                              onClick={() => updateLayout({ cardHeight: Math.min(76, height + 4) })}
                              className="w-5 h-5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer active:scale-90"
                            >
                              +
                            </button>
                            <span className="text-slate-200 font-mono text-xs px-1.5 py-0.5 rounded bg-white/[0.05]">
                              {height}px
                            </span>
                          </div>

                          {/* 5. Slider Espaçamento */}
                          <div className="flex items-center gap-1.5 bg-[#0b0d13] px-3 py-2.5 rounded-lg border border-white/[0.08] min-h-[38px]">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Espaço:</span>
                            <button
                              type="button"
                              onClick={() => updateLayout({ cardGapV2: Math.max(0, gap - 1) })}
                              className="w-5 h-5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer active:scale-90"
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
                              className="w-12 h-2 bg-white/[0.08] rounded appearance-none cursor-pointer accent-emerald-400"
                            />
                            <button
                              type="button"
                              onClick={() => updateLayout({ cardGapV2: Math.min(24, gap + 1) })}
                              className="w-5 h-5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer active:scale-90"
                            >
                              +
                            </button>
                            <span className="text-slate-200 font-mono text-xs px-1.5 py-0.5 rounded bg-white/[0.05]">
                              {gap}px
                            </span>
                          </div>
                        </div>

                        {/* GRUPO DIREITA: CORES ESMAGADAS (Titulares, 1º Supl, 2º Supl, Não Classif) */}
                        <div className="flex items-center gap-2.5 bg-[#0b0d13] px-3 py-2.5 rounded-lg border border-white/[0.08] ml-auto min-h-[38px]">
                          {/* Cor: Titulares */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Titular:</span>
                            <input
                              type="color"
                              value={winnerColor}
                              onChange={(e) => updateLayout({ winnerColor: e.target.value })}
                              className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 shrink-0"
                              title="Cor dos Titulares"
                            />
                            <div className="flex items-center gap-1">
                              {['#10b981', '#059669', '#22c55e', '#eab308', '#3b82f6'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => updateLayout({ winnerColor: preset })}
                                  style={{ backgroundColor: preset }}
                                  className={`w-3 h-3 rounded-full cursor-pointer transition transform active:scale-90 ${
                                    winnerColor.toLowerCase() === preset ? 'ring-1 ring-white scale-125' : 'opacity-70 hover:opacity-100'
                                  }`}
                                  title={`Cor ${preset}`}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="h-4.5 w-px bg-white/[0.08]" />

                          {/* Cor: 1º Suplente */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">1º Supl:</span>
                            <input
                              type="color"
                              value={suplenteColor}
                              onChange={(e) => updateLayout({ suplenteColor: e.target.value })}
                              className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 shrink-0"
                              title="Cor do 1º Suplente"
                            />
                            <div className="flex items-center gap-1">
                              {['#3b82f6', '#2563eb', '#06b6d4', '#6366f1', '#f59e0b'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => updateLayout({ suplenteColor: preset })}
                                  style={{ backgroundColor: preset }}
                                  className={`w-3 h-3 rounded-full cursor-pointer transition transform active:scale-90 ${
                                    suplenteColor.toLowerCase() === preset ? 'ring-1 ring-white scale-125' : 'opacity-70 hover:opacity-100'
                                  }`}
                                  title={`Cor ${preset}`}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="h-4.5 w-px bg-white/[0.08]" />

                          {/* Cor: 2º Suplente */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">2º Supl:</span>
                            <input
                              type="color"
                              value={suplente2Color}
                              onChange={(e) => updateLayout({ suplente2Color: e.target.value })}
                              className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 shrink-0"
                              title="Cor do 2º Suplente"
                            />
                            <div className="flex items-center gap-1">
                              {['#64748b', '#475569', '#0d9488', '#d97706', '#7c3aed'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => updateLayout({ suplente2Color: preset })}
                                  style={{ backgroundColor: preset }}
                                  className={`w-3 h-3 rounded-full cursor-pointer transition transform active:scale-90 ${
                                    suplente2Color.toLowerCase() === preset ? 'ring-1 ring-white scale-125' : 'opacity-70 hover:opacity-100'
                                  }`}
                                  title={`Cor ${preset}`}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="h-4.5 w-px bg-white/[0.08]" />

                          {/* Cor: Não Classificados */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Outros:</span>
                            <input
                              type="color"
                              value={unclassifiedColor}
                              onChange={(e) => updateLayout({ unclassifiedColor: e.target.value })}
                              className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 shrink-0"
                              title="Cor Não Classificados"
                            />
                            <div className="flex items-center gap-1">
                              {['#1e293b', '#0f172a', '#334155', '#1f2937', '#27272a'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => updateLayout({ unclassifiedColor: preset })}
                                  style={{ backgroundColor: preset }}
                                  className={`w-3 h-3 rounded-full cursor-pointer transition transform active:scale-90 ${
                                    unclassifiedColor.toLowerCase() === preset ? 'ring-1 ring-white scale-125' : 'opacity-70 hover:opacity-100'
                                  }`}
                                  title={`Cor ${preset}`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CARD 2: REGRAS GERAIS DA ELEIÇÃO (PADRÕES) - COMPACTO / ESMAGADO */}
                    <div className="bg-[#141721] border border-white/[0.08] rounded-xl px-3.5 py-3 space-y-2.5 shadow-lg">
                      {/* Cabeçalho Compacto */}
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-200 shrink-0">
                            <Sliders className="w-3.5 h-3.5 text-slate-300" />
                          </div>
                          <span className="font-medium text-slate-100 text-xs tracking-tight">
                            Regras da Eleição (Padrões do Sistema)
                          </span>
                        </div>

                        <span className="text-[10px] text-slate-400 font-normal px-2.5 py-1 rounded bg-white/[0.03] border border-white/[0.06]">
                          Novas votações herdam estes padrões
                        </span>
                      </div>

                      {/* Grade Compacta de 4 Módulos Estúdio em 1 Linha */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        {/* 1. Titulares (Geral) */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-300 shrink-0">
                            Titulares:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={session.vacancies || 1}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                saveSession({ ...session, vacancies: val, maxVotesPerVoter: val });
                              }}
                              className="w-16 px-2 py-1 bg-[#141721] border border-white/[0.08] rounded text-center text-amber-300 font-semibold text-xs outline-none focus:border-emerald-500/50"
                            />
                            <span className="text-[11px] text-slate-400 font-medium">vagas</span>
                          </div>
                        </div>

                        {/* 2. 1º Suplente */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={session.habilitarSuplente1 !== false}
                              onChange={(e) => {
                                saveSession({ ...session, habilitarSuplente1: e.target.checked });
                              }}
                              className="rounded cursor-pointer accent-emerald-500 w-3.5 h-3.5"
                            />
                            <span className="text-xs font-medium text-slate-300">
                              1º Suplente:
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
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
                              className="w-16 px-2 py-1 bg-[#141721] border border-white/[0.08] rounded text-center text-blue-300 font-semibold text-xs outline-none focus:border-emerald-500/50 disabled:opacity-30"
                            />
                            <span className="text-[11px] text-slate-400 font-medium">vagas</span>
                          </div>
                        </div>

                        {/* 3. 2º Suplente */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={session.habilitarSuplente2 === true}
                              onChange={(e) => {
                                saveSession({ ...session, habilitarSuplente2: e.target.checked });
                              }}
                              className="rounded cursor-pointer accent-emerald-500 w-3.5 h-3.5"
                            />
                            <span className="text-xs font-medium text-slate-300">
                              2º Suplente:
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
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
                              className="w-16 px-2 py-1 bg-[#141721] border border-white/[0.08] rounded text-center text-slate-300 font-semibold text-xs outline-none focus:border-emerald-500/50 disabled:opacity-30"
                            />
                            <span className="text-[11px] text-slate-400 font-medium">vagas</span>
                          </div>
                        </div>

                        {/* 4. Resolver Empates */}
                        <div className="bg-[#0b0d13] border border-white/[0.06] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={session.resolverEmpates !== false}
                              onChange={(e) => {
                                saveSession({ ...session, resolverEmpates: e.target.checked });
                              }}
                              className="rounded cursor-pointer accent-emerald-500 w-3.5 h-3.5"
                            />
                            <span className="text-xs font-medium text-slate-300 flex items-center gap-1">
                              <Star className="w-3 h-3 text-amber-400" />
                              Desempate
                            </span>
                          </div>
                          <span className="text-[10.5px] text-slate-400">
                            {session.resolverEmpates !== false ? 'Rodada ativa' : 'Majoritária'}
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

          {/* SE A VOTAÇÃO ESTIVER EM ANDAMENTO E O ADMIN QUISER O DASHBOARD: MOSTRA O DASHBOARD DE EVOLUÇÃO */}
          {isVotingActive && adminVotingView === 'dashboard' ? (
            <div className="bg-[#141721] border border-white/[0.08] rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
              {/* Header do Dashboard */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Activity className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-slate-100 text-sm sm:text-base tracking-tight">
                        Evolução da Votação em Tempo Real
                      </h3>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Ao vivo
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {session.title || 'Votação em Andamento'} • {vacancies} {vacancies === 1 ? 'Titular' : 'Titulares'}
                      {s1Count > 0 && ` • ${s1Count} 1º Supl.`}
                      {s2Count > 0 && ` • ${s2Count} 2º Supl.`}
                    </p>
                  </div>
                </div>

                {/* Alternar entre Dashboard e Nomes Cadastrados */}
                <div className="flex items-center gap-1 bg-[#0b0d13] p-1 rounded-lg border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setAdminVotingView('dashboard')}
                    className="px-3 py-1 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Evolução</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminVotingView('names')}
                    className="px-3 py-1 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 text-slate-400 hover:text-slate-200"
                  >
                    <span>Gerenciar nomes</span>
                  </button>
                </div>
              </div>

              {/* 4 Cards de KPI / Telemetria */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Votantes */}
                <div className="bg-[#0b0d13] border border-white/[0.08] rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-400 block truncate">Votantes confirmados</span>
                    <span className="text-base sm:text-lg font-semibold text-slate-100 font-mono">
                      {session.mainVotersCount || 0}
                    </span>
                  </div>
                </div>

                {/* Total de Votos */}
                <div className="bg-[#0b0d13] border border-white/[0.08] rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-400 block truncate">Votos computados</span>
                    <span className="text-base sm:text-lg font-semibold text-emerald-300 font-mono">
                      {totalVotesCast}
                    </span>
                  </div>
                </div>

                {/* Líder Atual */}
                <div className="bg-[#0b0d13] border border-white/[0.08] rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-400 block truncate">Líder provisório</span>
                    <span className="text-xs sm:text-sm font-semibold text-amber-300 block truncate capitalize">
                      {rankedCandidates[0]?.votesCount ? rankedCandidates[0].name : 'Aguardando votos'}
                    </span>
                  </div>
                </div>

                {/* Linha de Corte Titular */}
                <div className="bg-[#0b0d13] border border-white/[0.08] rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-400 block truncate">Corte Titulares</span>
                    <span className="text-base sm:text-lg font-semibold text-purple-300 font-mono">
                      {cutoffVotes} <span className="text-xs font-normal text-slate-400">votos</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Ranking Dinâmico com Barras de Progresso */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1 pb-1">
                  <span>Classificação em tempo real</span>
                  <span>{activeOptions.length} candidatos na disputa</span>
                </div>

                {totalVotesCast === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-white/[0.1] rounded-xl bg-[#0b0d13]/50 flex flex-col items-center justify-center gap-2">
                    <Activity className="w-6 h-6 text-slate-500 animate-pulse" />
                    <p className="font-medium text-slate-300">Votação aberta! Aguardando os primeiros votos...</p>
                    <p className="text-[11px] text-slate-500">Conforme os eleitores votarem no celular, o ranking e as barras atualizarão automaticamente aqui.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                    {rankedCandidates.map((candidate, idx) => {
                      const votes = candidate.votesCount || 0;
                      const percent = totalVotesCast > 0 ? Math.round((votes / totalVotesCast) * 100) : 0;
                      const barWidth = maxVotesRecorded > 0 ? Math.max(3, Math.round((votes / maxVotesRecorded) * 100)) : 0;
                      const isTitular = idx < vacancies;
                      const isSuplente1 = idx >= vacancies && idx < vacancies + s1Count;
                      const isSuplente2 = idx >= vacancies + s1Count && idx < totalVacancies;
                      const isFirstAfterTitulares = idx === vacancies && s1Count > 0;

                      return (
                        <React.Fragment key={candidate.id}>
                          {isFirstAfterTitulares && (
                            <div className="flex items-center gap-2 py-1 my-1">
                              <div className="flex-1 h-px bg-emerald-500/30" />
                              <span className="text-[10px] font-medium text-emerald-400/80 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                ▲ Linha de corte dos Titulares ({vacancies} vagas)
                              </span>
                              <div className="flex-1 h-px bg-emerald-500/30" />
                            </div>
                          )}

                          <div
                            className={`relative overflow-hidden rounded-lg p-2.5 border transition-all duration-300 ${
                              isTitular
                                ? 'bg-[#0b0d13] border-emerald-500/30 hover:border-emerald-500/50'
                                : isSuplente1
                                ? 'bg-[#0b0d13] border-blue-500/30 hover:border-blue-500/50'
                                : isSuplente2
                                ? 'bg-[#0b0d13] border-slate-500/30 hover:border-slate-500/50'
                                : 'bg-[#0b0d13]/70 border-white/[0.06] hover:border-white/[0.12]'
                            }`}
                          >
                            {/* Barra de progresso ao fundo */}
                            {isTitular ? (
                              <div
                                className="absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-500 z-0 overflow-visible"
                                style={{ width: `${barWidth}%` }}
                              >
                                {/* Efeito Vidro Transparente */}
                                <div className="absolute inset-0 bg-gradient-to-r from-white/[0.05] via-white/[0.12] to-white/[0.22] backdrop-blur-[2px] border-y border-white/[0.20] shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),inset_0_-1px_1px_rgba(255,255,255,0.12)] rounded-l-lg" />

                                {/* Traço laranja dourado brilhoso na ponta indicando onde ele está */}
                                {votes > 0 && (
                                  <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center pointer-events-none">
                                    {/* Glow difuso */}
                                    <div className="absolute -inset-y-1 w-3 -right-1 bg-gradient-to-b from-amber-300 via-amber-500 to-orange-500 opacity-80 blur-[4px]" />
                                    {/* Traço vertical laranja dourado brilhoso */}
                                    <div className="relative w-[3.5px] h-full bg-gradient-to-b from-[#fff3b0] via-[#f59e0b] to-[#ea580c] shadow-[0_0_8px_#f59e0b,0_0_16px_rgba(245,158,11,0.9),0_0_24px_rgba(234,88,12,0.7),0_0_2px_#ffffff] rounded-r-xs" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div
                                className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-500 opacity-20 ${
                                  isSuplente1
                                    ? 'bg-blue-500'
                                    : isSuplente2
                                    ? 'bg-slate-500'
                                    : 'bg-slate-700'
                                }`}
                                style={{ width: `${barWidth}%` }}
                              />
                            )}

                            <div className="relative z-10 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-6 text-center font-mono font-medium text-xs text-slate-400 shrink-0">
                                  #{idx + 1}
                                </span>
                                <span className="font-medium text-xs sm:text-sm text-slate-100 truncate capitalize">
                                  {candidate.name}
                                </span>
                                {isTitular && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                    Titular
                                  </span>
                                )}
                                {isSuplente1 && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                                    1º Suplente
                                  </span>
                                )}
                                {isSuplente2 && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-500/20 text-slate-300 border border-slate-500/30 shrink-0">
                                    2º Suplente
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {percent}%
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded font-mono font-semibold text-xs min-w-[54px] text-center ${
                                    votes > 0
                                      ? isTitular
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-white/[0.08] text-slate-200 border border-white/[0.1]'
                                      : 'bg-white/[0.04] text-slate-500'
                                  }`}
                                >
                                  {votes} {votes === 1 ? 'voto' : 'votos'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 1. SEÇÃO DE DIGITAÇÃO / VOZ - LAYOUT ESTÚDIO MODERNO E SUAVE */}
              <div className="bg-[#141721] border border-white/[0.08] rounded-xl p-4 shadow-lg">
                <div className="flex flex-col justify-between gap-3 min-w-0">
                  {/* CABEÇALHO NA MESMA LINHA: TÍTULO + IMPORTAR */}
                  <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="font-medium text-slate-200 text-sm tracking-normal">
                        Digite ou fale os nomes
                      </label>
                      {isListening && (
                        <span className="text-[10px] font-medium text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-500/40 animate-pulse flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                          Ouvindo...
                        </span>
                      )}
                    </div>

                    {isVotingActive && (
                      <button
                        type="button"
                        onClick={() => setAdminVotingView('dashboard')}
                        className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-medium cursor-pointer transition flex items-center gap-1.5"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>Ver Evolução da Votação</span>
                      </button>
                    )}

                    {/* SEÇÃO IMPORTAR */}
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
                          className="px-3 py-1.5 bg-[#0b0d13] hover:bg-[#181c28] border border-white/[0.1] hover:border-emerald-500/40 rounded-lg text-xs font-medium text-slate-300 hover:text-emerald-300 flex items-center gap-2 transition cursor-pointer shadow-sm"
                          title="Clique para escolher o formato de arquivo para importar"
                        >
                          <span>Importar</span>
                          <svg
                            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
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
                              className="absolute left-0 top-full mt-1.5 w-40 bg-[#141721] border border-white/[0.1] rounded-xl shadow-2xl py-1 z-50 overflow-hidden"
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
                                className="w-full px-3 py-1.5 text-left text-xs font-normal text-slate-300 hover:bg-white/[0.06] hover:text-white flex items-center gap-2 transition cursor-pointer"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
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
                                className="w-full px-3 py-1.5 text-left text-xs font-normal text-slate-300 hover:bg-white/[0.06] hover:text-white flex items-center gap-2 transition cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 shrink-0 text-blue-400" />
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
                                className="w-full px-3 py-1.5 text-left text-xs font-normal text-slate-300 hover:bg-white/[0.06] hover:text-white flex items-center gap-2 transition cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
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
                        className="px-2.5 py-1.5 bg-[#0b0d13] hover:bg-[#181c28] border border-dashed border-white/[0.12] hover:border-emerald-500/40 rounded-lg text-xs text-slate-400 hover:text-slate-200 font-normal transition cursor-pointer flex items-center gap-1.5"
                        title="Arraste qualquer arquivo e solte aqui"
                      >
                        <Upload className="w-3 h-3 text-slate-400" />
                        <span>ou arraste o arquivo aqui</span>
                      </div>
                    </div>
                  </div>

                  {/* Textarea com Microfone e Botão Adicionar */}
                  <div className="flex-1 relative flex flex-col">
                    <textarea
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (isListening) stopListening();
                          handleAddCandidateName(newName);
                        }
                      }}
                      placeholder="Digite ou fale os nomes (dê Enter ou separe por vírgula ou linha)..."
                      className="w-full flex-1 min-h-[115px] sm:min-h-[125px] p-3 pr-14 pb-11 bg-[#0b0d13] border border-white/[0.1] focus:border-emerald-500/60 rounded-xl text-slate-100 font-normal text-xs sm:text-sm placeholder-slate-500 outline-none transition shadow-sm resize-none leading-relaxed"
                    />

                    {/* Microfone no canto superior direito */}
                    <button
                      type="button"
                      onClick={toggleListening}
                      title={isListening ? 'Parar digitação por voz' : 'Iniciar digitação por voz'}
                      className={`absolute right-3 top-3 w-9 h-9 rounded-full border flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer ${
                        isListening
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-[0_0_16px_rgba(244,63,94,0.4)] animate-pulse'
                          : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                      }`}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>

                    {/* Botão Adicionar no canto inferior direito quando houver texto */}
                    {newName.trim().length > 0 && (
                      <div className="absolute right-3 bottom-2.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (isListening) stopListening();
                            handleAddCandidateName(newName);
                          }}
                          className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-medium cursor-pointer transition active:scale-95 shadow-sm flex items-center gap-1"
                          title="Adicionar nomes digitados/falados à lista"
                        >
                          <span>Adicionar</span>
                          <span className="text-[10px] text-emerald-400/70">(Enter)</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {isListening && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs">
                      <span className="text-emerald-300 flex items-center gap-2 font-normal">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>{speechTranscript ? `Ouvindo: "${speechTranscript}"` : 'Fale os nomes agora...'}</span>
                      </span>
                      <button
                        type="button"
                        onClick={stopListening}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-medium text-[11px] transition cursor-pointer"
                      >
                        Pausar fala
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. NOMES CADASTRADOS - CARDS ESTÚDIO DISCRETOS */}
              <div className="bg-[#141721] border border-white/[0.08] rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-slate-200 text-sm tracking-normal flex items-center gap-2">
                <span>Nomes para escolha ({session.options.length})</span>
              </h3>
              {(session.options.length > 0 || backupNamesList.length > 0) && (
                <div className="flex items-center gap-2">
                  {/* Botão Recuperar Nomes */}
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
                    className="px-3 py-1.5 bg-[#0b0d13] hover:bg-[#181c28] border border-white/[0.1] hover:border-amber-400/40 text-slate-300 hover:text-amber-300 rounded-lg font-medium text-xs tracking-normal flex items-center gap-1.5 transition cursor-pointer shadow-sm"
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
                        className="px-3 py-1.5 bg-[#0b0d13] hover:bg-[#181c28] border border-white/[0.1] hover:border-emerald-500/40 text-slate-300 hover:text-emerald-300 rounded-lg font-medium text-xs tracking-normal flex items-center gap-1.5 transition cursor-pointer shadow-sm"
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
                            highlight: `${session.options.length} nomes cadastrados`,
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
                        className="p-2 bg-[#0b0d13] hover:bg-rose-500/20 border border-white/[0.1] hover:border-rose-500/40 text-slate-400 hover:text-rose-300 rounded-lg flex items-center justify-center transition cursor-pointer shadow-sm"
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
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-white/[0.1] rounded-xl bg-[#0b0d13]/60">
                Nenhum nome cadastrado ainda. Digite ou fale no campo acima para começar!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
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
                          className={`w-full px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-all duration-300 group min-w-0 ${
                            isGlowing
                              ? 'bg-emerald-500/20 border border-emerald-400 ring-1 ring-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.35)] z-10'
                              : 'bg-[#0b0d13] hover:bg-[#181c28] border border-white/[0.08] hover:border-white/[0.16] shadow-sm'
                          }`}
                        >
                          {/* Nome Editável Inline */}
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
                              className="w-full min-w-0 px-2 py-0.5 bg-[#141721] border border-emerald-500/50 rounded text-xs text-slate-100 font-normal outline-none"
                            />
                          ) : (
                            <span
                              onClick={() => {
                                setEditingCandidateId(option.id);
                                setEditingCandidateName(option.name);
                              }}
                              className={`flex-1 min-w-0 truncate font-normal text-xs tracking-normal capitalize cursor-pointer transition-colors duration-200 ${
                                isGlowing
                                  ? 'text-emerald-200'
                                  : 'text-slate-200 hover:text-white'
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
        </>
      )}
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
