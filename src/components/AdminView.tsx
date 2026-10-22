import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  Mic,
  MicOff,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  CheckCircle,
  Check,
  FileSpreadsheet,
  FileText,
  QrCode,
  Tv,
  Sliders,
  ArrowDownAZ,
  Pencil,
  FolderPlus,
  Building2,
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
  ArrowLeft,
  History,
  Calendar,
  Copy,
  FileDown,
  ChevronDown,
} from 'lucide-react';
import { detectVotingTies, type TieInfo } from '../utils/tieDetection';
import { getGlobalElectionRules, saveGlobalElectionRules } from '../utils/globalRules';
import { generateAtaPdf } from '../utils/ataPdfGenerator';
import type { VotingSession, VotingOption, VotingEventItem, VotingHistoryRecord, GeneralEventRecord } from '../types';
import { saveSession, subscribeToConnectedVoters, applyBallotToSession, getLocalSession, isFirestoreQuotaExceeded, getLocalTelaoLayout } from '../services/votingService';
import { startAdminPeerHost } from '../services/peerSyncService';
import { parseImportFile } from '../utils/fileImporter';
import { toggleSecondaryScreen, subscribeSecondaryScreen } from '../utils/screen';

interface AdminViewProps {
  session: VotingSession;
}

// Animação Cortina / Esmagamento suave (Morph) entre Novo (Dashboard) e Antigo (Nomes)
const morphCurtainVariants = {
  enter: (direction: 'down' | 'up') => ({
    y: direction === 'down' ? -45 : 45,
    scaleY: 0.82,
    opacity: 0,
    transformOrigin: direction === 'down' ? 'top center' : 'bottom center',
    transition: {
      duration: 0.48,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  }),
  center: {
    y: 0,
    scaleY: 1,
    opacity: 1,
    transformOrigin: 'center center',
    transition: {
      duration: 0.48,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: (direction: 'down' | 'up') => ({
    y: direction === 'down' ? 45 : -45,
    scaleY: 0.55,
    opacity: 0,
    transformOrigin: direction === 'down' ? 'bottom center' : 'top center',
    transition: {
      duration: 0.38,
      ease: [0.32, 0, 0.67, 0] as const,
    },
  }),
};

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
  const [eventFormTotalVoters, setEventFormTotalVoters] = useState<number>(session.totalVotersConnected || 0);
  const [eventFormLabelTitulares, setEventFormLabelTitulares] = useState<string>(session.labelTitulares || 'Titulares');
  const [eventFormLabelSuplente1, setEventFormLabelSuplente1] = useState<string>(session.labelSuplente1 || '1º suplente');
  const [eventFormLabelSuplente2, setEventFormLabelSuplente2] = useState<string>(session.labelSuplente2 || '2º suplente');
  const [isEditingLabelTitulares, setIsEditingLabelTitulares] = useState<boolean>(false);
  const [isEditingLabelSuplente1, setIsEditingLabelSuplente1] = useState<boolean>(false);
  const [isEditingLabelSuplente2, setIsEditingLabelSuplente2] = useState<boolean>(false);
  const [isNewGeneralModalOpen, setIsNewGeneralModalOpen] = useState<boolean>(false);
  const [newGeneralEventNameInput, setNewGeneralEventNameInput] = useState<string>('');
  const [isEditingGeneralModalOpen, setIsEditingGeneralModalOpen] = useState<boolean>(false);
  const [editingGeneralEventName, setEditingGeneralEventName] = useState<string>('');
  const [deleteConfirmGeneralEvent, setDeleteConfirmGeneralEvent] = useState<{ id: string; name: string } | null>(null);
  const [votacoesTitle, setVotacoesTitle] = useState<string>(() => {
    return localStorage.getItem('vota_iasd_custom_votacoes_title') || 'Votação';
  });
  const [isEditingVotacoesTitle, setIsEditingVotacoesTitle] = useState<boolean>(false);
  const [tempVotacoesTitle, setTempVotacoesTitle] = useState<string>(() => {
    return localStorage.getItem('vota_iasd_custom_votacoes_title') || 'Votação';
  });

  const handleSaveVotacoesTitle = () => {
    const val = tempVotacoesTitle.trim() || 'Votação';
    setVotacoesTitle(val);
    localStorage.setItem('vota_iasd_custom_votacoes_title', val);
    setIsEditingVotacoesTitle(false);
  };
  const [isCreatingNewEvent, setIsCreatingNewEvent] = useState<boolean>(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isTieModalOpen, setIsTieModalOpen] = useState<boolean>(false);
  const [selectedTieCandidateIds, setSelectedTieCandidateIds] = useState<string[]>([]);
  const [tieWarningModal, setTieWarningModal] = useState<string | null>(null);
  const [tieWarningTrigger, setTieWarningTrigger] = useState<number>(0);
  const [isScreen2Open, setIsScreen2Open] = useState<boolean>(false);
  const [showVuMeter, setShowVuMeter] = useState<boolean>(() => {
    const saved = localStorage.getItem('vota_iasd_show_vu_meter');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleVuMeter = (val: boolean) => {
    setShowVuMeter(val);
    localStorage.setItem('vota_iasd_show_vu_meter', String(val));
  };

  const [vuMeterModel, setVuMeterModel] = useState<string>(() => {
    return localStorage.getItem('vota_iasd_vu_meter_model') || 'estudio';
  });

  const handleSelectVuModel = (model: string) => {
    setVuMeterModel(model);
    localStorage.setItem('vota_iasd_vu_meter_model', model);
  };

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
        setTieWarningModal(`VOCÊ JÁ ESCOLHEU ${String(maxAllowed).padStart(2, '0')}`);
        return;
      }
      setSelectedTieCandidateIds((prev) => [...prev, id]);
    }
  };
  const detectedTies = session.resolverEmpates !== false ? detectVotingTies(session) : [];
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
  const cutoffSuplente1 = s1Count > 0 ? (rankedCandidates[vacancies + s1Count - 1]?.votesCount || 0) : 0;

  const [quotaWarning, setQuotaWarning] = useState<boolean>(isFirestoreQuotaExceeded());

  useEffect(() => {
    const handleQuotaExceeded = () => setQuotaWarning(true);
    window.addEventListener('vota_iasd_quota_exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('vota_iasd_quota_exceeded', handleQuotaExceeded);
  }, []);

  // Inicia o Host P2P WebRTC (alternativa direta caso Firebase atinja cota de 50.000 gravações)
  useEffect(() => {
    if (!session?.id) return;
    const unsubPeer = startAdminPeerHost(
      session.id,
      (ballot) => {
        const current = getLocalSession();
        const updated = applyBallotToSession(current, ballot.selectedOptionIds, ballot.round);
        saveSession(updated);
        return true;
      },
      () => getLocalSession()
    );
    return unsubPeer;
  }, [session?.id]);

  const [connectedVotersCount, setConnectedVotersCount] = useState<number>(0);

  useEffect(() => {
    if (!session?.id) return;
    const unsub = subscribeToConnectedVoters(session.id, (voters) => {
      setConnectedVotersCount(voters.length);
    });
    return unsub;
  }, [session?.id]);

  const isSessionLocked = Boolean(session.accessLocked);
  const currentVotersVoted = session.status === 'TIE_BREAK' ? (session.tieBreakVotersCount || 0) : (session.mainVotersCount || 0);
  const displayVotersCount = Math.max(session.mainVotersCount || 0, connectedVotersCount);
  const totalVotersLimit =
    session?.totalVotersConnected && session.totalVotersConnected > 0
      ? session.totalVotersConnected
      : Math.max(connectedVotersCount, session?.allowedVoterIds?.length || 0);
  const allHaveVoted = (totalVotersLimit > 0 && currentVotersVoted >= totalVotersLimit) || session.status === 'CLOSED';

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

  // Se todos tiverem votado (ou a votação encerrar) e houver empate, abre o modal automaticamente
  const prevAllVotedRef = useRef(false);
  const prevStatusRef = useRef(session.status);
  useEffect(() => {
    const ties = detectVotingTies(session);
    const totalLimit =
      session?.totalVotersConnected && session.totalVotersConnected > 0
        ? session.totalVotersConnected
        : Math.max(connectedVotersCount, session?.allowedVoterIds?.length || 0);
    const totalVoted =
      session.status === 'TIE_BREAK'
        ? session.tieBreakVotersCount || 0
        : session.mainVotersCount || 0;
    const allVotedNow = totalLimit > 0 && totalVoted >= totalLimit;

    if (ties.length > 0) {
      const justAllVoted = !prevAllVotedRef.current && allVotedNow;
      const justClosed = prevStatusRef.current !== 'CLOSED' && session.status === 'CLOSED';
      const justTieBreakEnded = prevStatusRef.current === 'TIE_BREAK' && session.status === 'CLOSED';
      if (justAllVoted || justClosed || justTieBreakEnded) {
        setIsTieModalOpen(true);
      }
    } else if (session.status === 'CLOSED') {
      // Quando todos os empates foram solucionados, fecha o modal
      setIsTieModalOpen(false);
    }
    prevAllVotedRef.current = allVotedNow;
    prevStatusRef.current = session.status;
  }, [session, connectedVotersCount]);

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
  const eventTitleInputRef = useRef<HTMLInputElement>(null);
  const newGeneralInputRef = useRef<HTMLInputElement>(null);
  const editingGeneralInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNewGeneralModalOpen) {
      setTimeout(() => {
        newGeneralInputRef.current?.focus();
        newGeneralInputRef.current?.select();
      }, 50);
    }
  }, [isNewGeneralModalOpen]);

  useEffect(() => {
    if (isEditingGeneralModalOpen) {
      setTimeout(() => {
        editingGeneralInputRef.current?.focus();
        editingGeneralInputRef.current?.select();
      }, 50);
    }
  }, [isEditingGeneralModalOpen]);

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

  function hexToRgba(hex: string, alpha: number): string {
  const safeHex = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#10b981';
  const r = parseInt(safeHex.slice(1, 3), 16);
  const g = parseInt(safeHex.slice(3, 5), 16);
  const b = parseInt(safeHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Garante lista de eventos (inicializando com o evento atual caso ainda não exista e eliminando duplicatas)
  const rawEventsList: VotingEventItem[] =
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
            status: session.status,
            tieBreak: session.tieBreak || null,
            mainVotersCount: session.mainVotersCount || 0,
            tieBreakVotersCount: session.tieBreakVotersCount || 0,
            votingIteration: session.votingIteration || 1,
            telaoMode: session.telaoMode || 'names',
            labelTitulares: session.labelTitulares || 'Titulares',
            labelSuplente1: session.labelSuplente1 || '1º suplente',
            labelSuplente2: session.labelSuplente2 || '2º suplente',
          },
        ];

  // Garante que cada evento tenha ID exclusivo e não existam modais duplicados
  const eventsList: VotingEventItem[] = rawEventsList.reduce<VotingEventItem[]>((acc, item) => {
    if (!item) return acc;
    const safeId = item.id || `evt_${acc.length + 1}`;
    if (!acc.some((x) => x.id === safeId)) {
      acc.push({ ...item, id: safeId });
    }
    return acc;
  }, []);

  const currentActiveEventId = session.activeEventId || eventsList[0]?.id || 'evt_principal';

  // Abrir modal de criação de nova votação (puxa as regras globais salvas localmente no PC por padrão)
  const openCreateEventModal = () => {
    const currentGlobal = getGlobalElectionRules();
    setEditingEventId(null);
    setEventFormName('');
    setEventFormVacancies(currentGlobal.vacancies);
    setEventFormSuplente1Enabled(currentGlobal.habilitarSuplente1 !== false);
    setEventFormSuplente1Count(currentGlobal.suplentesCount ?? 1);
    setEventFormSuplente2Enabled(currentGlobal.habilitarSuplente2 === true);
    setEventFormSuplente2Count(currentGlobal.segundoSuplentesCount ?? 1);
    setEventFormResolverEmpates(true); // Padrão: sempre marcado
    setEventFormTotalVoters(currentGlobal.totalVotersConnected || 1);
    setEventFormLabelTitulares(currentGlobal.labelTitulares || 'Titulares');
    setEventFormLabelSuplente1(currentGlobal.labelSuplente1 || '1º suplente');
    setEventFormLabelSuplente2(currentGlobal.labelSuplente2 || '2º suplente');
    setIsEditingLabelTitulares(false);
    setIsEditingLabelSuplente1(false);
    setIsEditingLabelSuplente2(false);
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
      : (evt.resolverEmpates !== undefined ? evt.resolverEmpates : true);
    const totVoters = isSelected
      ? (session.totalVotersConnected || 0)
      : (evt.totalVotersConnected ?? session.totalVotersConnected ?? 0);

    const lTitulares = isSelected
      ? (session.labelTitulares || evt.labelTitulares || 'Titulares')
      : (evt.labelTitulares || 'Titulares');
    const lSuplente1 = isSelected
      ? (session.labelSuplente1 || evt.labelSuplente1 || '1º suplente')
      : (evt.labelSuplente1 || '1º suplente');
    const lSuplente2 = isSelected
      ? (session.labelSuplente2 || evt.labelSuplente2 || '2º suplente')
      : (evt.labelSuplente2 || '2º suplente');

    setEventFormVacancies(vac || 1);
    setEventFormSuplente1Enabled(s1Enabled);
    setEventFormSuplente1Count(s1Count > 0 ? s1Count : 1);
    setEventFormSuplente2Enabled(s2Enabled);
    setEventFormSuplente2Count(s2Count > 0 ? s2Count : 1);
    setEventFormResolverEmpates(empates !== false);
    setEventFormTotalVoters(totVoters);
    setEventFormLabelTitulares(lTitulares);
    setEventFormLabelSuplente1(lSuplente1);
    setEventFormLabelSuplente2(lSuplente2);
    setIsEditingLabelTitulares(false);
    setIsEditingLabelSuplente1(false);
    setIsEditingLabelSuplente2(false);
    setIsCreatingNewEvent(true);
  };

  // Lista de Eventos Gerais disponíveis no banco online
  const generalEventsList: GeneralEventRecord[] = React.useMemo(() => {
    const currentName = (session.generalEventName || 'COMISSÃO IASD - MEMBRESIA 2026').trim();
    const currentId = session.activeGeneralEventId || 'gen_' + currentName.replace(/\s+/g, '_');
    const list = Array.isArray(session.generalEvents) && session.generalEvents.length > 0
      ? [...session.generalEvents]
      : [];

    if (!list.some((g) => g.id === currentId || g.name.toUpperCase() === currentName.toUpperCase())) {
      list.unshift({
        id: currentId,
        name: currentName,
        createdAt: session.createdAt || Date.now(),
        events: session.events,
        activeEventId: session.activeEventId,
        title: session.title,
        options: session.options,
        history: session.history,
      });
    }
    return list;
  }, [
    session.generalEvents,
    session.generalEventName,
    session.activeGeneralEventId,
    session.events,
    session.activeEventId,
    session.title,
    session.options,
    session.history,
    session.createdAt,
  ]);

  const currentGeneralEventId =
    session.activeGeneralEventId ||
    generalEventsList.find((g) => g.name.toUpperCase() === (session.generalEventName || '').toUpperCase())?.id ||
    generalEventsList[0]?.id ||
    'gen_default';

  // Alterna entre Eventos Gerais existentes salvos no banco online
  const handleSwitchGeneralEvent = (targetId: string) => {
    if (targetId === currentGeneralEventId) return;
    const target = generalEventsList.find((g) => g.id === targetId);
    if (!target) return;

    const localLayout = getLocalTelaoLayout() || session.telaoLayout;
    const defaultRules = getGlobalElectionRules();

    const targetEvents = target.events && target.events.length > 0 ? target.events : [
      {
        id: 'evt_' + Date.now(),
        name: target.title || 'TESOUREIRO',
        options: target.options || [],
        vacancies: target.vacancies ?? defaultRules.vacancies ?? 1,
        maxVotesPerVoter: target.maxVotesPerVoter ?? defaultRules.vacancies ?? 1,
        suplentesCount: target.suplentesCount ?? defaultRules.suplentesCount ?? 1,
        segundoSuplentesCount: target.segundoSuplentesCount ?? defaultRules.segundoSuplentesCount ?? 0,
        habilitarSuplente1: target.habilitarSuplente1 ?? defaultRules.habilitarSuplente1 ?? true,
        habilitarSuplente2: target.habilitarSuplente2 ?? defaultRules.habilitarSuplente2 ?? false,
        resolverEmpates: target.resolverEmpates ?? true,
        totalVotersConnected: defaultRules.totalVotersConnected || 1,
        rulesConfigured: target.rulesConfigured ?? false,
        labelTitulares: target.labelTitulares || defaultRules.labelTitulares || 'Titulares',
        labelSuplente1: target.labelSuplente1 || defaultRules.labelSuplente1 || '1º suplente',
        labelSuplente2: target.labelSuplente2 || defaultRules.labelSuplente2 || '2º suplente',
        status: target.status || 'WAITING',
        tieBreak: target.tieBreak || null,
        mainVotersCount: target.mainVotersCount || 0,
        tieBreakVotersCount: target.tieBreakVotersCount || 0,
        votingIteration: (session.votingIteration || 1) + 1,
        telaoMode: target.telaoMode || 'names',
      }
    ];

    const firstEvent = targetEvents.find((e) => e.id === target.activeEventId) || targetEvents[0];

    const updatedSession: VotingSession = {
      ...session,
      activeGeneralEventId: target.id,
      generalEventName: target.name,
      title: firstEvent?.name || target.title || 'TESOUREIRO',
      activeEventId: firstEvent?.id,
      events: targetEvents,
      options: firstEvent?.options || target.options || [],
      history: target.history || [],
      vacancies: firstEvent?.vacancies ?? target.vacancies ?? 1,
      maxVotesPerVoter: firstEvent?.maxVotesPerVoter ?? target.maxVotesPerVoter ?? 1,
      suplentesCount: firstEvent?.suplentesCount ?? target.suplentesCount ?? 1,
      segundoSuplentesCount: firstEvent?.segundoSuplentesCount ?? target.segundoSuplentesCount ?? 0,
      habilitarSuplente1: firstEvent?.habilitarSuplente1 ?? target.habilitarSuplente1 ?? true,
      habilitarSuplente2: firstEvent?.habilitarSuplente2 ?? target.habilitarSuplente2 ?? false,
      resolverEmpates: firstEvent?.resolverEmpates ?? target.resolverEmpates ?? true,
      rulesConfigured: firstEvent?.rulesConfigured ?? target.rulesConfigured ?? false,
      labelTitulares: firstEvent?.labelTitulares || target.labelTitulares || 'Titulares',
      labelSuplente1: firstEvent?.labelSuplente1 || target.labelSuplente1 || '1º suplente',
      labelSuplente2: firstEvent?.labelSuplente2 || target.labelSuplente2 || '2º suplente',
      status: firstEvent?.status || target.status || 'WAITING',
      tieBreak: firstEvent?.tieBreak || target.tieBreak || null,
      mainVotersCount: firstEvent?.mainVotersCount ?? target.mainVotersCount ?? 0,
      tieBreakVotersCount: firstEvent?.tieBreakVotersCount ?? target.tieBreakVotersCount ?? 0,
      votingIteration: (session.votingIteration || 1) + 1,
      telaoMode: firstEvent?.telaoMode || target.telaoMode || 'names',
      telaoLayout: localLayout, // Mantém tamanho do QR code, posicionamento na tela, etc.
    };

    saveSession(updatedSession);
    showNotification('success', `Alternado para o Evento Geral: "${target.name}".`);
  };

  // Cria um novo Evento Geral (Assembleia Mãe) e inicia novo ambiente mantendo banco online
  const handleHardResetGeneralEvent = (name: string) => {
    const cleaned = name.trim().toUpperCase() || 'COMISSÃO DA IGREJA ADVENTISTA DA ASA NORTE';
    const newGenId = 'gen_' + Date.now();
    const initialId = 'evt_' + Date.now();
    const defaultRules = getGlobalElectionRules();
    const localLayout = getLocalTelaoLayout() || session.telaoLayout;

    const initialEvent: VotingEventItem = {
      id: initialId,
      name: 'TESOUREIRO',
      options: [],
      vacancies: defaultRules.vacancies || 1,
      maxVotesPerVoter: defaultRules.vacancies || 1,
      suplentesCount: defaultRules.suplentesCount ?? 1,
      segundoSuplentesCount: defaultRules.segundoSuplentesCount ?? 0,
      habilitarSuplente1: defaultRules.habilitarSuplente1 ?? true,
      habilitarSuplente2: defaultRules.habilitarSuplente2 ?? false,
      resolverEmpates: true,
      totalVotersConnected: defaultRules.totalVotersConnected || 1,
      rulesConfigured: false,
      labelTitulares: defaultRules.labelTitulares || 'Titulares',
      labelSuplente1: defaultRules.labelSuplente1 || '1º suplente',
      labelSuplente2: defaultRules.labelSuplente2 || '2º suplente',
      status: 'WAITING',
      tieBreak: null,
      mainVotersCount: 0,
      tieBreakVotersCount: 0,
      votingIteration: (session.votingIteration || 1) + 10,
      telaoMode: 'names',
    };

    const newGenRecord: GeneralEventRecord = {
      id: newGenId,
      name: cleaned,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      events: [initialEvent],
      activeEventId: initialId,
      title: 'TESOUREIRO',
      options: [],
      history: [],
      vacancies: defaultRules.vacancies || 1,
      maxVotesPerVoter: defaultRules.vacancies || 1,
      suplentesCount: defaultRules.suplentesCount ?? 1,
      segundoSuplentesCount: defaultRules.segundoSuplentesCount ?? 0,
      habilitarSuplente1: defaultRules.habilitarSuplente1 ?? true,
      habilitarSuplente2: defaultRules.habilitarSuplente2 ?? false,
      resolverEmpates: true,
      rulesConfigured: false,
      labelTitulares: defaultRules.labelTitulares || 'Titulares',
      labelSuplente1: defaultRules.labelSuplente1 || '1º suplente',
      labelSuplente2: defaultRules.labelSuplente2 || '2º suplente',
      status: 'WAITING',
      tieBreak: null,
      mainVotersCount: 0,
      tieBreakVotersCount: 0,
      votingIteration: (session.votingIteration || 1) + 10,
      telaoMode: 'names',
    };

    const updatedGeneralEvents = [...generalEventsList, newGenRecord];

    const newSession: VotingSession = {
      ...session,
      activeGeneralEventId: newGenId,
      generalEventName: cleaned,
      generalEvents: updatedGeneralEvents,
      title: 'TESOUREIRO',
      activeEventId: initialId,
      status: 'WAITING',
      options: [],
      events: [initialEvent],
      history: [],
      tieBreak: null,
      mainVotersCount: 0,
      tieBreakVotersCount: 0,
      votingIteration: (session.votingIteration || 1) + 10,
      vacancies: defaultRules.vacancies || 1,
      maxVotesPerVoter: defaultRules.vacancies || 1,
      suplentesCount: defaultRules.suplentesCount ?? 1,
      segundoSuplentesCount: defaultRules.segundoSuplentesCount ?? 0,
      habilitarSuplente1: defaultRules.habilitarSuplente1 ?? true,
      habilitarSuplente2: defaultRules.habilitarSuplente2 ?? false,
      resolverEmpates: true,
      totalVotersConnected: defaultRules.totalVotersConnected || 1,
      rulesConfigured: false,
      labelTitulares: defaultRules.labelTitulares || 'Titulares',
      labelSuplente1: defaultRules.labelSuplente1 || '1º suplente',
      labelSuplente2: defaultRules.labelSuplente2 || '2º suplente',
      telaoLayout: localLayout,
    };

    saveSession(newSession);
    localStorage.removeItem('vota_iasd_backup_names');
    setBackupNamesList([]);
    setNewName('');
    setEditingCandidateId(null);
    setIsNewGeneralModalOpen(false);
    setNewGeneralEventNameInput('');
    showNotification('success', `Novo Evento Geral "${cleaned}" criado e salvo online!`);
  };

  // Renomeia o Evento Geral existente
  const handleRenameGeneralEvent = (name: string) => {
    const cleaned = name.trim().toUpperCase();
    if (!cleaned) return;
    const currentId = session.activeGeneralEventId || 'gen_' + (session.generalEventName || '').replace(/\s+/g, '_');
    const updatedGenList = generalEventsList.map((g) =>
      g.id === currentId || g.name.toUpperCase() === (session.generalEventName || '').toUpperCase()
        ? { ...g, name: cleaned, updatedAt: Date.now() }
        : g
    );
    saveSession({
      ...session,
      generalEventName: cleaned,
      generalEvents: updatedGenList,
    });
    setIsEditingGeneralModalOpen(false);
    showNotification('success', `Nome do Evento Geral atualizado para "${cleaned}"!`);
  };

  // Exclui um Evento Geral com confirmação
  const handleDeleteGeneralEvent = (idToDelete: string) => {
    const targetToDelete = generalEventsList.find((g) => g.id === idToDelete);
    const targetName = targetToDelete?.name || session.generalEventName || 'Evento Geral';
    const remainingGenList = generalEventsList.filter((g) => g.id !== idToDelete);

    if (remainingGenList.length > 0) {
      // Se o evento apagado for o ativo, migra para o primeiro restante
      const isDeletingActive =
        idToDelete === currentGeneralEventId ||
        targetName.toUpperCase() === (session.generalEventName || '').toUpperCase();

      if (isDeletingActive) {
        const nextEvent = remainingGenList[0];
        const defaultRules = getGlobalElectionRules();
        const localLayout = getLocalTelaoLayout() || session.telaoLayout;
        const targetEvents =
          nextEvent.events && nextEvent.events.length > 0
            ? nextEvent.events
            : [
                {
                  id: 'evt_' + Date.now(),
                  name: nextEvent.title || 'TESOUREIRO',
                  options: nextEvent.options || [],
                  vacancies: nextEvent.vacancies ?? defaultRules.vacancies ?? 1,
                  maxVotesPerVoter: nextEvent.maxVotesPerVoter ?? defaultRules.vacancies ?? 1,
                  suplentesCount: nextEvent.suplentesCount ?? defaultRules.suplentesCount ?? 1,
                  segundoSuplentesCount: nextEvent.segundoSuplentesCount ?? defaultRules.segundoSuplentesCount ?? 0,
                  habilitarSuplente1: nextEvent.habilitarSuplente1 ?? defaultRules.habilitarSuplente1 ?? true,
                  habilitarSuplente2: nextEvent.habilitarSuplente2 ?? defaultRules.habilitarSuplente2 ?? false,
                  resolverEmpates: nextEvent.resolverEmpates ?? true,
                  totalVotersConnected: defaultRules.totalVotersConnected || 1,
                  rulesConfigured: nextEvent.rulesConfigured ?? false,
                  labelTitulares: nextEvent.labelTitulares || defaultRules.labelTitulares || 'Titulares',
                  labelSuplente1: nextEvent.labelSuplente1 || defaultRules.labelSuplente1 || '1º suplente',
                  labelSuplente2: nextEvent.labelSuplente2 || defaultRules.labelSuplente2 || '2º suplente',
                  status: nextEvent.status || ('WAITING' as const),
                  tieBreak: nextEvent.tieBreak || null,
                  mainVotersCount: nextEvent.mainVotersCount || 0,
                  tieBreakVotersCount: nextEvent.tieBreakVotersCount || 0,
                  votingIteration: (session.votingIteration || 1) + 1,
                  telaoMode: nextEvent.telaoMode || ('names' as const),
                },
              ];
        const firstEvent = targetEvents.find((e) => e.id === nextEvent.activeEventId) || targetEvents[0];

        const updatedSession: VotingSession = {
          ...session,
          activeGeneralEventId: nextEvent.id,
          generalEventName: nextEvent.name,
          generalEvents: remainingGenList,
          title: firstEvent?.name || nextEvent.title || 'TESOUREIRO',
          activeEventId: firstEvent?.id,
          events: targetEvents,
          options: firstEvent?.options || nextEvent.options || [],
          history: nextEvent.history || [],
          vacancies: firstEvent?.vacancies ?? nextEvent.vacancies ?? 1,
          maxVotesPerVoter: firstEvent?.maxVotesPerVoter ?? nextEvent.maxVotesPerVoter ?? 1,
          suplentesCount: firstEvent?.suplentesCount ?? nextEvent.suplentesCount ?? 1,
          segundoSuplentesCount: firstEvent?.segundoSuplentesCount ?? nextEvent.segundoSuplentesCount ?? 0,
          habilitarSuplente1: firstEvent?.habilitarSuplente1 ?? nextEvent.habilitarSuplente1 ?? true,
          habilitarSuplente2: firstEvent?.habilitarSuplente2 ?? nextEvent.habilitarSuplente2 ?? false,
          resolverEmpates: firstEvent?.resolverEmpates ?? nextEvent.resolverEmpates ?? true,
          rulesConfigured: firstEvent?.rulesConfigured ?? nextEvent.rulesConfigured ?? false,
          labelTitulares: firstEvent?.labelTitulares || nextEvent.labelTitulares || 'Titulares',
          labelSuplente1: firstEvent?.labelSuplente1 || nextEvent.labelSuplente1 || '1º suplente',
          labelSuplente2: firstEvent?.labelSuplente2 || nextEvent.labelSuplente2 || '2º suplente',
          status: firstEvent?.status || nextEvent.status || 'WAITING',
          tieBreak: firstEvent?.tieBreak || nextEvent.tieBreak || null,
          mainVotersCount: firstEvent?.mainVotersCount ?? nextEvent.mainVotersCount ?? 0,
          tieBreakVotersCount: firstEvent?.tieBreakVotersCount ?? nextEvent.tieBreakVotersCount ?? 0,
          votingIteration: (session.votingIteration || 1) + 1,
          telaoMode: firstEvent?.telaoMode || nextEvent.telaoMode || 'names',
          telaoLayout: localLayout,
        };
        saveSession(updatedSession);
      } else {
        saveSession({
          ...session,
          generalEvents: remainingGenList,
        });
      }
    } else {
      // Se não sobrou nenhum evento na lista, cria um evento limpo inicial
      const newGenId = 'gen_' + Date.now();
      const initialId = 'evt_' + Date.now();
      const defaultRules = getGlobalElectionRules();
      const localLayout = getLocalTelaoLayout() || session.telaoLayout;
      const initialEvent: VotingEventItem = {
        id: initialId,
        name: 'TESOUREIRO',
        options: [],
        vacancies: defaultRules.vacancies || 1,
        maxVotesPerVoter: defaultRules.vacancies || 1,
        suplentesCount: defaultRules.suplentesCount ?? 1,
        segundoSuplentesCount: defaultRules.segundoSuplentesCount ?? 0,
        habilitarSuplente1: defaultRules.habilitarSuplente1 ?? true,
        habilitarSuplente2: defaultRules.habilitarSuplente2 ?? false,
        resolverEmpates: true,
        totalVotersConnected: defaultRules.totalVotersConnected || 1,
        rulesConfigured: false,
        labelTitulares: defaultRules.labelTitulares || 'Titulares',
        labelSuplente1: defaultRules.labelSuplente1 || '1º suplente',
        labelSuplente2: defaultRules.labelSuplente2 || '2º suplente',
        status: 'WAITING',
        tieBreak: null,
        mainVotersCount: 0,
        tieBreakVotersCount: 0,
        votingIteration: (session.votingIteration || 1) + 10,
        telaoMode: 'names',
      };
      const newGenRecord: GeneralEventRecord = {
        id: newGenId,
        name: 'COMISSÃO DA IGREJA ADVENTISTA DA ASA NORTE',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: [initialEvent],
        activeEventId: initialId,
        title: 'TESOUREIRO',
        options: [],
        history: [],
        vacancies: defaultRules.vacancies || 1,
        maxVotesPerVoter: defaultRules.vacancies || 1,
        suplentesCount: defaultRules.suplentesCount ?? 1,
        segundoSuplentesCount: defaultRules.segundoSuplentesCount ?? 0,
        habilitarSuplente1: defaultRules.habilitarSuplente1 ?? true,
        habilitarSuplente2: defaultRules.habilitarSuplente2 ?? false,
        resolverEmpates: true,
        rulesConfigured: false,
        labelTitulares: defaultRules.labelTitulares || 'Titulares',
        labelSuplente1: defaultRules.labelSuplente1 || '1º suplente',
        labelSuplente2: defaultRules.labelSuplente2 || '2º suplente',
        status: 'WAITING',
        tieBreak: null,
        mainVotersCount: 0,
        tieBreakVotersCount: 0,
        votingIteration: (session.votingIteration || 1) + 10,
        telaoMode: 'names',
      };
      saveSession({
        ...session,
        activeGeneralEventId: newGenId,
        generalEventName: 'COMISSÃO DA IGREJA ADVENTISTA DA ASA NORTE',
        generalEvents: [newGenRecord],
        title: 'TESOUREIRO',
        activeEventId: initialId,
        status: 'WAITING',
        options: [],
        events: [initialEvent],
        history: [],
        tieBreak: null,
        mainVotersCount: 0,
        tieBreakVotersCount: 0,
        votingIteration: (session.votingIteration || 1) + 10,
        vacancies: defaultRules.vacancies || 1,
        maxVotesPerVoter: defaultRules.vacancies || 1,
        suplentesCount: defaultRules.suplentesCount ?? 1,
        segundoSuplentesCount: defaultRules.segundoSuplentesCount ?? 0,
        habilitarSuplente1: defaultRules.habilitarSuplente1 ?? true,
        habilitarSuplente2: defaultRules.habilitarSuplente2 ?? false,
        resolverEmpates: true,
        totalVotersConnected: defaultRules.totalVotersConnected || 1,
        rulesConfigured: false,
        labelTitulares: defaultRules.labelTitulares || 'Titulares',
        labelSuplente1: defaultRules.labelSuplente1 || '1º suplente',
        labelSuplente2: defaultRules.labelSuplente2 || '2º suplente',
        telaoLayout: localLayout,
      });
    }

    setIsEditingGeneralModalOpen(false);
    setDeleteConfirmGeneralEvent(null);
    showNotification('success', `Evento "${targetName}" excluído com sucesso!`);
  };

  // Escuta o evento emitido pelo botão de votação cinza da Navbar para abrir as regras da eleição
  useEffect(() => {
    const handleOpenRulesModal = () => {
      const activeEvt = eventsList.find((e) => e.id === currentActiveEventId) || eventsList[0];
      if (activeEvt) {
        openEditEventModal(activeEvt);
      }
    };
    window.addEventListener('open-event-rules-modal', handleOpenRulesModal);
    return () => window.removeEventListener('open-event-rules-modal', handleOpenRulesModal);
  }, [eventsList, currentActiveEventId]);

  // Escuta o evento para abrir a gaveta e focar no campo de nomes para votar
  useEffect(() => {
    const handleFocusNames = () => {
      setActiveTab('candidates');
      setIsBottomSectionOpen(true);
      setTimeout(() => {
        namesTextareaRef.current?.focus();
        namesTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };
    window.addEventListener('focus-names-input', handleFocusNames);
    return () => window.removeEventListener('focus-names-input', handleFocusNames);
  }, []);

  // Selecionar um evento ao clicar no botão do evento no cabeçalho -> abre modal de regras (Print 2)
  const handleSelectEventButton = (evt: VotingEventItem) => {
    // Se clicou no evento já ativo, alterna ou abre o modal
    if (evt.id === currentActiveEventId) {
      if (isCreatingNewEvent && editingEventId === evt.id) {
        setIsCreatingNewEvent(false);
        setEditingEventId(null);
      } else {
        openEditEventModal(evt);
      }
      return;
    }

    // Salva o estado completo do evento atual antes de trocar e carrega o evento clicado
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
            status: session.status,
            tieBreak: session.tieBreak || null,
            mainVotersCount: session.mainVotersCount || 0,
            tieBreakVotersCount: session.tieBreakVotersCount || 0,
            votingIteration: session.votingIteration || 1,
            telaoMode: session.telaoMode || 'names',
            totalVotersConnected: session.totalVotersConnected,
            rulesConfigured: session.rulesConfigured,
            labelTitulares: session.labelTitulares || 'Titulares',
            labelSuplente1: session.labelSuplente1 || '1º suplente',
            labelSuplente2: session.labelSuplente2 || '2º suplente',
          }
        : item
    );

    const targetEvt = updatedEvents.find((item) => item.id === evt.id) || evt;
    const targetStatus = targetEvt.status || 'WAITING';
    const targetTieBreak = targetEvt.tieBreak !== undefined ? targetEvt.tieBreak : null;
    const targetMainVoters = targetEvt.mainVotersCount ?? 0;
    const targetTieBreakVoters = targetEvt.tieBreakVotersCount ?? 0;
    const targetTelaoMode = targetEvt.telaoMode || (targetStatus === 'CLOSED' ? 'voting' : 'names');
    const targetOptions = (targetEvt.options || []).map((o) => ({
      ...o,
      votesCount: o.votesCount ?? 0,
    }));
    const nextIteration = targetEvt.votingIteration || (session.votingIteration || 1) + 1;

    saveSession({
      ...session,
      activeEventId: targetEvt.id,
      title: targetEvt.name,
      options: targetOptions,
      status: targetStatus,
      tieBreak: targetTieBreak,
      mainVotersCount: targetMainVoters,
      tieBreakVotersCount: targetTieBreakVoters,
      telaoMode: targetTelaoMode,
      votingIteration: nextIteration,
      vacancies: targetEvt.vacancies || 1,
      maxVotesPerVoter: targetEvt.maxVotesPerVoter || targetEvt.vacancies || 1,
      suplentesCount: targetEvt.suplentesCount ?? 0,
      segundoSuplentesCount: targetEvt.segundoSuplentesCount ?? 0,
      habilitarSuplente1: targetEvt.habilitarSuplente1,
      habilitarSuplente2: targetEvt.habilitarSuplente2,
      resolverEmpates: targetEvt.resolverEmpates !== undefined ? targetEvt.resolverEmpates : (session.resolverEmpates !== false),
      totalVotersConnected: targetEvt.totalVotersConnected,
      rulesConfigured: targetEvt.rulesConfigured ?? false,
      labelTitulares: targetEvt.labelTitulares || 'Titulares',
      labelSuplente1: targetEvt.labelSuplente1 || '1º suplente',
      labelSuplente2: targetEvt.labelSuplente2 || '2º suplente',
      events: updatedEvents,
    });

    setActiveTab('candidates');
    setIsBottomSectionOpen(true);
    // Revela suave para baixo o modal de REGRAS DA ELEIÇÃO para o card clicado
    openEditEventModal(targetEvt);
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
    const totalVoters = eventFormTotalVoters > 0 ? eventFormTotalVoters : undefined;
    const labelTitulares = eventFormLabelTitulares.trim() || 'Titulares';
    const labelSuplente1 = eventFormLabelSuplente1.trim() || '1º suplente';
    const labelSuplente2 = eventFormLabelSuplente2.trim() || '2º suplente';

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
              totalVotersConnected: totalVoters,
              rulesConfigured: true,
              labelTitulares,
              labelSuplente1,
              labelSuplente2,
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
        totalVotersConnected: isEditingActive ? totalVoters : session.totalVotersConnected,
        rulesConfigured: true,
        labelTitulares: isEditingActive ? labelTitulares : session.labelTitulares,
        labelSuplente1: isEditingActive ? labelSuplente1 : session.labelSuplente1,
        labelSuplente2: isEditingActive ? labelSuplente2 : session.labelSuplente2,
        events: updatedEvents,
      });

      saveGlobalElectionRules({
        totalVotersConnected: totalVoters,
        vacancies,
        habilitarSuplente1: eventFormSuplente1Enabled,
        suplentesCount: s1Count,
        habilitarSuplente2: eventFormSuplente2Enabled,
        segundoSuplentesCount: s2Count,
        resolverEmpates,
        labelTitulares,
        labelSuplente1,
        labelSuplente2,
      });

      setIsCreatingNewEvent(false);
      setEditingEventId(null);
      showNotification('success', `Regras salvas para "${cleaned}"! Votação liberada.`);
    } else {
      const newEvtId = 'evt_' + Date.now();

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
              status: session.status,
              tieBreak: session.tieBreak || null,
              mainVotersCount: session.mainVotersCount || 0,
              tieBreakVotersCount: session.tieBreakVotersCount || 0,
              votingIteration: session.votingIteration || 1,
              telaoMode: session.telaoMode || 'names',
              labelTitulares: session.labelTitulares || 'Titulares',
              labelSuplente1: session.labelSuplente1 || '1º suplente',
              labelSuplente2: session.labelSuplente2 || '2º suplente',
            }
          : item
      );

      const newIteration = (session.votingIteration || 1) + 1;
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
        totalVotersConnected: totalVoters,
        rulesConfigured: true,
        labelTitulares,
        labelSuplente1,
        labelSuplente2,
        status: 'WAITING',
        tieBreak: null,
        mainVotersCount: 0,
        tieBreakVotersCount: 0,
        votingIteration: newIteration,
        telaoMode: 'names',
      };

      saveSession({
        ...session,
        activeEventId: newEvtId,
        title: cleaned,
        options: [],
        status: 'WAITING',
        tieBreak: null,
        mainVotersCount: 0,
        tieBreakVotersCount: 0,
        telaoMode: 'names',
        votingIteration: newIteration,
        vacancies,
        maxVotesPerVoter: vacancies,
        habilitarSuplente1: eventFormSuplente1Enabled,
        suplentesCount: s1Count,
        habilitarSuplente2: eventFormSuplente2Enabled,
        segundoSuplentesCount: s2Count,
        resolverEmpates,
        totalVotersConnected: totalVoters,
        rulesConfigured: true,
        labelTitulares,
        labelSuplente1,
        labelSuplente2,
        events: [...syncedCurrentEvents, newEvt],
      });

      saveGlobalElectionRules({
        totalVotersConnected: totalVoters,
        vacancies,
        habilitarSuplente1: eventFormSuplente1Enabled,
        suplentesCount: s1Count,
        habilitarSuplente2: eventFormSuplente2Enabled,
        segundoSuplentesCount: s2Count,
        resolverEmpates,
        labelTitulares,
        labelSuplente1,
        labelSuplente2,
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
        const nextStatus = nextActive.status || 'WAITING';
        const nextTieBreak = nextActive.tieBreak !== undefined ? nextActive.tieBreak : null;
        const nextMainVoters = nextActive.mainVotersCount ?? 0;
        const nextTieBreakVoters = nextActive.tieBreakVotersCount ?? 0;
        const nextTelaoMode = nextActive.telaoMode || (nextStatus === 'CLOSED' ? 'voting' : 'names');

        saveSession({
          ...session,
          activeEventId: nextActive.id,
          title: nextActive.name,
          options: nextActive.options || [],
          status: nextStatus,
          tieBreak: nextTieBreak,
          mainVotersCount: nextMainVoters,
          tieBreakVotersCount: nextTieBreakVoters,
          telaoMode: nextTelaoMode,
          votingIteration: nextActive.votingIteration || (session.votingIteration || 1) + 1,
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

  // Renderiza o modal de configuração de votação (REGRAS DA ELEIÇÃO)
  const renderEventConfigModal = () => {
    const isEditing = Boolean(editingEventId);
    return (
      <motion.div
        ref={eventModalRef}
        data-event-modal="true"
        initial={{ opacity: 0, scale: 0.95, y: -14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: 'top left' }}
        className="absolute top-full left-0 mt-2 z-50 w-[360px] sm:w-[440px] max-w-[calc(100vw-24px)]"
      >
        <div className="relative bg-[#141721] rounded-xl p-4 shadow-[0_0_30px_rgba(16,185,129,0.22),0_18px_40px_rgba(0,0,0,0.9)] space-y-3.5 border border-emerald-500/40">
          {/* Borda Designer com brilho suave (linhas superiores e laterais limpas, sem borda dupla no fundo) */}
          <div className="absolute inset-0 pointer-events-none rounded-xl" style={{ filter: 'drop-shadow(0 0 6px rgba(16,185,129,0.35))' }}>
            <div
              className="absolute top-0 left-0 w-4 h-4 rounded-tl-xl pointer-events-none"
              style={{ borderTop: '1.5px solid #10b981', borderLeft: '1.5px solid #10b981' }}
            />
            <div
              className="absolute top-0 left-4 right-0 pointer-events-none"
              style={{ height: '1.5px', background: 'linear-gradient(to right, #10b981 0%, rgba(16,185,129,0) 100%)' }}
            />
            <div
              className="absolute top-4 bottom-2 left-0 pointer-events-none"
              style={{ width: '1.5px', background: 'linear-gradient(to bottom, #10b981 0%, rgba(16,185,129,0) 100%)' }}
            />
          </div>

          {/* Cabeçalho: REGRAS DA ELEIÇÃO na frente de 'Configurar votação' */}
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-emerald-400">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>REGRAS DA ELEIÇÃO</span>
              <span className="text-slate-500 font-normal">•</span>
              <span className="text-slate-200 font-bold normal-case text-xs">
                {isEditing ? 'Configurar votação' : 'Nova votação'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsCreatingNewEvent(false);
                setEditingEventId(null);
              }}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Linha 1: Título da Votação (editável duplo clique + lapizinho verde) + Qdte de votantes (desabilitado e vazio) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div className="sm:col-span-3">
              <div className="flex items-center gap-1.5 mb-1">
                <label
                  onDoubleClick={() => eventTitleInputRef.current?.focus()}
                  className="text-xs font-semibold text-slate-200 cursor-pointer select-none"
                  title="Duplo clique ou clique no lápis para focar"
                >
                  Título da votação: <span className="text-emerald-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => eventTitleInputRef.current?.focus()}
                  className="p-0.5 text-emerald-400 hover:text-emerald-300 rounded transition cursor-pointer"
                  title="Editar título da votação"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
              <input
                ref={eventTitleInputRef}
                type="text"
                autoFocus
                placeholder="Ex: JOVENS..."
                value={eventFormName}
                onChange={(e) => setEventFormName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveEventModal();
                  }
                }}
                className="w-full px-3 py-1.5 bg-[#0b0d13] border border-white/[0.12] focus:border-emerald-500/80 rounded-lg text-xs font-bold text-slate-100 outline-none placeholder-slate-500 shadow-sm transition-colors"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="text-xs font-semibold text-slate-400 block mb-1 whitespace-nowrap">
                Qdte votantes:
              </label>
              <input
                type="text"
                disabled
                readOnly
                placeholder="—"
                value=""
                className="w-full px-2 py-1.5 bg-[#0b0d13]/50 border border-white/[0.08] rounded-lg text-xs font-mono text-slate-500 outline-none text-center shadow-sm cursor-not-allowed select-none"
                title="Configuração automática de quórum (em breve)"
              />
            </div>
          </div>

          {/* Linha 2: Vagas Titulares, 1º Suplente e 2º Suplente (Rótulos editáveis via lapizinho verde e duplo clique) */}
          <div className="grid grid-cols-3 gap-2">
            {/* Titulares (Obrigatório) */}
            <div className="bg-[#0b0d13] border border-white/[0.1] rounded-lg p-2.5 flex flex-col justify-between gap-1.5">
              {isEditingLabelTitulares ? (
                <input
                  autoFocus
                  type="text"
                  value={eventFormLabelTitulares}
                  onChange={(e) => setEventFormLabelTitulares(e.target.value)}
                  onBlur={() => setIsEditingLabelTitulares(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingLabelTitulares(false);
                  }}
                  className="w-full text-[11px] font-semibold text-emerald-300 bg-[#141721] border border-emerald-500/60 rounded px-1 py-0.5 outline-none"
                />
              ) : (
                <div
                  className="flex items-center gap-1 group cursor-pointer min-w-0"
                  onDoubleClick={() => setIsEditingLabelTitulares(true)}
                  title="Duplo clique ou clique no lápis para editar rótulo"
                >
                  <span className="text-[11px] font-semibold text-slate-200 truncate">
                    {eventFormLabelTitulares || 'Titulares'}: <span className="text-emerald-400">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingLabelTitulares(true);
                    }}
                    className="p-0.5 text-emerald-400 hover:text-emerald-300 rounded transition shrink-0"
                    title="Editar nome deste cargo"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={eventFormVacancies}
                  onChange={(e) => setEventFormVacancies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-1.5 py-1 bg-[#141721] border border-white/[0.1] focus:border-emerald-500/60 rounded text-center text-slate-100 font-bold text-xs outline-none"
                />
                <span className="text-[10px] text-slate-400 font-normal">vagas</span>
              </div>
            </div>

            {/* 1º Suplente */}
            <div className="bg-[#0b0d13] border border-white/[0.1] rounded-lg p-2.5 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between gap-1">
                {isEditingLabelSuplente1 ? (
                  <input
                    autoFocus
                    type="text"
                    value={eventFormLabelSuplente1}
                    onChange={(e) => setEventFormLabelSuplente1(e.target.value)}
                    onBlur={() => setIsEditingLabelSuplente1(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setIsEditingLabelSuplente1(false);
                    }}
                    className="w-20 text-[11px] font-semibold text-emerald-300 bg-[#141721] border border-emerald-500/60 rounded px-1 py-0.5 outline-none"
                  />
                ) : (
                  <div
                    className="flex items-center gap-1 group cursor-pointer min-w-0"
                    onDoubleClick={() => setIsEditingLabelSuplente1(true)}
                    title="Duplo clique ou clique no lápis para editar rótulo"
                  >
                    <span className="text-[11px] font-semibold text-slate-200 truncate">
                      {eventFormLabelSuplente1 || '1º suplente'}:
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsEditingLabelSuplente1(true);
                      }}
                      className="p-0.5 text-emerald-400 hover:text-emerald-300 rounded transition shrink-0"
                      title="Editar nome deste cargo"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
                <input
                  type="checkbox"
                  checked={eventFormSuplente1Enabled}
                  onChange={(e) => setEventFormSuplente1Enabled(e.target.checked)}
                  className="rounded cursor-pointer accent-emerald-500 w-3.5 h-3.5 shrink-0"
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
                  className="w-full px-1.5 py-1 bg-[#141721] border border-white/[0.1] focus:border-emerald-500/60 rounded text-center text-slate-100 font-bold text-xs outline-none disabled:opacity-30"
                />
                <span className="text-[10px] text-slate-400 font-normal">vagas</span>
              </div>
            </div>

            {/* 2º Suplente */}
            <div className="bg-[#0b0d13] border border-white/[0.1] rounded-lg p-2.5 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between gap-1">
                {isEditingLabelSuplente2 ? (
                  <input
                    autoFocus
                    type="text"
                    value={eventFormLabelSuplente2}
                    onChange={(e) => setEventFormLabelSuplente2(e.target.value)}
                    onBlur={() => setIsEditingLabelSuplente2(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setIsEditingLabelSuplente2(false);
                    }}
                    className="w-20 text-[11px] font-semibold text-emerald-300 bg-[#141721] border border-emerald-500/60 rounded px-1 py-0.5 outline-none"
                  />
                ) : (
                  <div
                    className="flex items-center gap-1 group cursor-pointer min-w-0"
                    onDoubleClick={() => setIsEditingLabelSuplente2(true)}
                    title="Duplo clique ou clique no lápis para editar rótulo"
                  >
                    <span className="text-[11px] font-semibold text-slate-200 truncate">
                      {eventFormLabelSuplente2 || '2º suplente'}:
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsEditingLabelSuplente2(true);
                      }}
                      className="p-0.5 text-emerald-400 hover:text-emerald-300 rounded transition shrink-0"
                      title="Editar nome deste cargo"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
                <input
                  type="checkbox"
                  checked={eventFormSuplente2Enabled}
                  onChange={(e) => setEventFormSuplente2Enabled(e.target.checked)}
                  className="rounded cursor-pointer accent-emerald-500 w-3.5 h-3.5 shrink-0"
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
                  className="w-full px-1.5 py-1 bg-[#141721] border border-white/[0.1] focus:border-emerald-500/60 rounded text-center text-slate-100 font-bold text-xs outline-none disabled:opacity-30"
                />
                <span className="text-[10px] text-slate-400 font-normal">vagas</span>
              </div>
            </div>
          </div>

          {/* Linha 3: Critério de desempate (padrão sempre marcado) */}
          <div className="bg-[#0b0d13] border border-white/[0.1] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Critério de desempate:
                </span>
                <span className="text-[10.5px] text-slate-400 block font-normal">
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
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 shadow-inner" />
            </label>
          </div>

          {/* Linha 4: Botão Salvar (Fica verde e libera a votação) */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={handleSaveEventModal}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs tracking-wider uppercase rounded-lg border border-emerald-400 cursor-pointer active:scale-95 transition-all shadow-[0_0_15px_rgba(16,185,129,0.35)]"
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

  const prevAdminEventIdRef = useRef<string | undefined>(session.activeEventId);

  useEffect(() => {
    const currentIds = (session.options || []).map((o) => o.id);
    if (prevAdminEventIdRef.current !== session.activeEventId) {
      prevAdminEventIdRef.current = session.activeEventId;
      knownOptionIdsRef.current = new Set(currentIds);
      return;
    }
    const newlyAdded = currentIds.filter((id) => !knownOptionIdsRef.current.has(id));
    knownOptionIdsRef.current = new Set(currentIds);
    if (newlyAdded.length > 0) {
      triggerGlow(newlyAdded);
    }
  }, [session.options, session.activeEventId]);

  const importFileRef = useRef<HTMLInputElement>(null);
  const fileUploadReplaceRef = useRef<HTMLInputElement>(null);
  const fileUploadAppendRef = useRef<HTMLInputElement>(null);
  const namesTextareaRef = useRef<HTMLTextAreaElement>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    const handleCustomNotify = (e: any) => {
      if (e.detail?.type && e.detail?.message) {
        showNotification(e.detail.type, e.detail.message);
      }
    };
    window.addEventListener('vota_iasd_notification', handleCustomNotify);
    return () => window.removeEventListener('vota_iasd_notification', handleCustomNotify);
  }, []);

  const handleDeleteHistoryItem = (historyId: string) => {
    if (!window.confirm('Excluir este registro do histórico de votações?')) return;
    const updatedHistory = (session.history || []).filter((h) => h.id !== historyId);
    saveSession({ ...session, history: updatedHistory });
    try {
      localStorage.setItem('vota_iasd_voting_history', JSON.stringify(updatedHistory));
    } catch (e) {
      console.error(e);
    }
    showNotification('success', 'Registro removido do histórico com sucesso.');
  };

  const handleClearHistory = () => {
    if (!window.confirm('Tem certeza que deseja apagar TODO o histórico de votações arquivado?')) return;
    saveSession({ ...session, history: [] });
    try {
      localStorage.removeItem('vota_iasd_voting_history');
    } catch (e) {
      console.error(e);
    }
    showNotification('success', 'Histórico de votações limpo com sucesso.');
  };

  const handleDownloadAtaPdf = (record: VotingHistoryRecord) => {
    try {
      generateAtaPdf(record);
      showNotification('success', `Ata em PDF de "${record.headerTitle}" gerada com sucesso!`);
    } catch (err) {
      console.error(err);
      showNotification('error', 'Erro ao gerar o arquivo PDF da Ata.');
    }
  };

  const handleCopyHistoryAta = (record: VotingHistoryRecord) => {
    const eleitosText = record.eleitos && record.eleitos.length > 0
      ? record.eleitos.map((c, i) => `${i + 1}. ${c.name} - ${c.votesCount} votos (${c.percentage}%)`).join('\n')
      : 'Nenhum';

    const suplentesAll = [...(record.suplentes || []), ...(record.segundoSuplentes || [])];
    const suplentesText = suplentesAll.length > 0
      ? suplentesAll.map((c, i) => `${i + 1}. ${c.name} - ${c.votesCount} votos (${c.percentage}%)`).join('\n')
      : 'Nenhum';

    const naoClassificadosText = record.naoClassificados && record.naoClassificados.length > 0
      ? record.naoClassificados.map((c, i) => `${i + 1}. ${c.name} - ${c.votesCount} votos (${c.percentage}%)`).join('\n')
      : 'Nenhum';

    const text = [
      '==================================================',
      'IASD - ATA OFICIAL DE ELEIÇÃO',
      `${record.headerTitle} (${record.timeFormatted})`,
      `Total de Votantes: ${record.totalVoters} | Total de Votos: ${record.totalVotes}`,
      '==================================================',
      '',
      '🏆 ELEITOS (TITULARES):',
      eleitosText,
      '',
      '🥈 SUPLENTES:',
      suplentesText,
      '',
      '⚪ NÃO CLASSIFICADOS:',
      naoClassificadosText,
      '==================================================',
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      showNotification('success', `Ata de "${record.headerTitle}" copiada com sucesso!`);
    }).catch(() => {
      showNotification('error', 'Não foi possível copiar para a área de transferência.');
    });
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
        const existingNames = new Set((session.options || []).map((o) => o.name.trim().toUpperCase()));
        const uniqueStamped = stampedOptions.filter((o) => !existingNames.has(o.name.trim().toUpperCase()));
        const sortedAppend = [...session.options, ...uniqueStamped].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        );
        saveSession({
          ...session,
          options: sortedAppend,
        });
        showNotification('success', `Adicionados ${uniqueStamped.length} novos itens de "${result.fileName}" (em ordem A-Z)!`);
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

    const existingNames = new Set((session.options || []).map((o) => o.name.trim().toUpperCase()));
    const uniqueNames = names.filter((n) => !existingNames.has(n));
    if (uniqueNames.length === 0) {
      setNewName('');
      showNotification('error', 'O(s) nome(s) digitado(s) já está(ão) cadastrado(s) neste evento.');
      return;
    }

    const now = Date.now();
    const newOptions: VotingOption[] = uniqueNames.map((name, idx) => ({
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
      uniqueNames.length === 1 ? `"${uniqueNames[0]}" adicionado!` : `${uniqueNames.length} nomes adicionados!`
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
    <div className="w-full flex-1 flex flex-col px-3 sm:px-4 lg:px-5 py-2.5 text-slate-100 min-h-0">
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
            className="fixed top-5 inset-x-4 max-w-sm mx-auto p-3.5 rounded-2xl bg-[#064e3b] border-2 border-white text-white flex items-center justify-center gap-2.5 shadow-[0_16px_36px_rgba(0,0,0,0.8),0_0_16px_rgba(255,255,255,0.3)] cursor-pointer select-none z-[9999]"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-white drop-shadow self-center" />
            <div className="flex flex-col items-center text-center gap-1">
              <span className="font-black text-sm sm:text-base tracking-wide uppercase text-white drop-shadow flex items-center justify-center gap-1.5 flex-wrap">
                <span>VOCÊ JÁ ESCOLHEU</span>
                <span className="inline-flex items-center justify-center px-1 text-yellow-300 font-mono font-black text-xl sm:text-2xl leading-none">
                  {tieWarningModal.replace('VOCÊ JÁ ESCOLHEU ', '')}
                </span>
              </span>
              <span className="text-[13px] sm:text-[14px] text-emerald-100 font-bold tracking-normal normal-case leading-snug">
                Para escolher outro, desmarque algum.
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
              className="relative w-full max-w-xl bg-gradient-to-b from-[#002657] to-[#07132a] border-2 border-emerald-500 rounded-2xl p-4 sm:p-6 shadow-[0_0_35px_rgba(16,185,129,0.35),0_20px_50px_rgba(0,0,0,0.85)] text-white overflow-hidden my-auto"
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
              <div className="text-center mb-4 pb-3 border-b border-emerald-500/30">
                <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white">
                  VOTAÇÃO PARA DESEMPATAR
                </h3>
              </div>

              {/* Lista de Grupos de Empate */}
              <div className="space-y-3.5 max-h-[65vh] overflow-y-auto pr-1">
                {detectedTies.map((tie, idx) => {
                  const maxAllowed = tie.vacanciesInDispute + 1;

                  // Cores e estilos específicos para cada categoria (TITULAR, 1º SUPLENTE, 2º SUPLENTE)
                  const getTieCategoryStyles = (type: string, label: string) => {
                    if (type === 'TITULAR' || /titular/i.test(label)) {
                      return {
                        title: 'TITULAR',
                        container: 'bg-[#031d15]/95 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.18)]',
                        headerBorder: 'border-emerald-500/30',
                        badgeText: 'text-emerald-400',
                        dot: 'bg-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.9)]',
                        cardBase: 'bg-[#06241a] border border-emerald-500/50 hover:border-emerald-400 text-white',
                        cardSelected: 'bg-emerald-950/90 border-2 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.35)] ring-2 ring-emerald-400/40 text-white',
                        iconBoxBase: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
                        iconBoxSelected: 'bg-emerald-500/25 border-emerald-400 text-emerald-300',
                        starBase: 'fill-emerald-400 text-emerald-400',
                        starSelected: 'fill-emerald-300 text-emerald-300',
                        subTextBase: 'text-emerald-300/80',
                        subTextSelected: 'text-emerald-200 font-bold',
                        circleSelected: 'border-emerald-400 bg-emerald-400 text-emerald-950',
                        btnEnviar: 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.45)] text-white',
                      };
                    }
                    if (type === 'SUPLENTE_1' || /1[ºªo]?\s*suplente/i.test(label)) {
                      return {
                        title: '1º SUPLENTE',
                        container: 'bg-[#06152d]/95 border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.18)]',
                        headerBorder: 'border-blue-500/30',
                        badgeText: 'text-blue-400',
                        dot: 'bg-blue-400 drop-shadow-[0_0_6px_rgba(96,165,250,0.9)]',
                        cardBase: 'bg-[#081c3b] border border-blue-500/50 hover:border-blue-400 text-white',
                        cardSelected: 'bg-blue-950/90 border-2 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.35)] ring-2 ring-blue-400/40 text-white',
                        iconBoxBase: 'bg-blue-500/15 border-blue-500/40 text-blue-400',
                        iconBoxSelected: 'bg-blue-500/25 border-blue-400 text-blue-300',
                        starBase: 'fill-blue-400 text-blue-400',
                        starSelected: 'fill-blue-300 text-blue-300',
                        subTextBase: 'text-blue-300/80',
                        subTextSelected: 'text-blue-200 font-bold',
                        circleSelected: 'border-blue-400 bg-blue-400 text-blue-950',
                        btnEnviar: 'bg-blue-600 hover:bg-blue-500 border border-blue-400 shadow-[0_0_14px_rgba(59,130,246,0.45)] text-white',
                      };
                    }
                    if (type === 'SUPLENTE_2' || /2[ºªo]?\s*suplente/i.test(label)) {
                      return {
                        title: '2º SUPLENTE',
                        container: 'bg-[#0e1726]/95 border-slate-500/60 shadow-[0_0_20px_rgba(100,116,139,0.18)]',
                        headerBorder: 'border-slate-500/30',
                        badgeText: 'text-slate-300',
                        dot: 'bg-slate-400 drop-shadow-[0_0_6px_rgba(148,163,184,0.9)]',
                        cardBase: 'bg-[#131d2e] border border-slate-500/50 hover:border-slate-400 text-white',
                        cardSelected: 'bg-slate-900/90 border-2 border-slate-300 shadow-[0_0_12px_rgba(148,163,184,0.35)] ring-2 ring-slate-400/40 text-white',
                        iconBoxBase: 'bg-slate-500/15 border-slate-500/40 text-slate-400',
                        iconBoxSelected: 'bg-slate-500/25 border-slate-300 text-slate-200',
                        starBase: 'fill-slate-400 text-slate-400',
                        starSelected: 'fill-slate-300 text-slate-300',
                        subTextBase: 'text-slate-300/80',
                        subTextSelected: 'text-slate-200 font-bold',
                        circleSelected: 'border-slate-300 bg-slate-300 text-slate-950',
                        btnEnviar: 'bg-slate-600 hover:bg-slate-500 border border-slate-400 shadow-[0_0_14px_rgba(100,116,139,0.45)] text-white',
                      };
                    }
                    return {
                      title: tie.label.replace(/^Empate para (vaga de )?/i, '').toUpperCase() || 'DESEMPATE',
                      container: 'bg-[#1a0a10]/95 border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.18)]',
                      headerBorder: 'border-rose-500/30',
                      badgeText: 'text-rose-400',
                      dot: 'bg-rose-400 drop-shadow-[0_0_6px_rgba(251,113,133,0.9)]',
                      cardBase: 'bg-[#220d16] border border-rose-500/50 hover:border-rose-400 text-white',
                      cardSelected: 'bg-rose-950/90 border-2 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.35)] ring-2 ring-rose-400/40 text-white',
                      iconBoxBase: 'bg-rose-500/15 border-rose-500/40 text-rose-400',
                      iconBoxSelected: 'bg-rose-500/25 border-rose-400 text-rose-300',
                      starBase: 'fill-rose-400 text-rose-400',
                      starSelected: 'fill-rose-300 text-rose-300',
                      subTextBase: 'text-rose-300/80',
                      subTextSelected: 'text-rose-200 font-bold',
                      circleSelected: 'border-rose-400 bg-rose-400 text-rose-950',
                      btnEnviar: 'bg-rose-600 hover:bg-rose-500 border border-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.45)] text-white',
                    };
                  };

                  const styles = getTieCategoryStyles(tie.type, tie.label);

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border space-y-2.5 shadow-inner transition-colors ${styles.container}`}
                    >
                      {/* Header do Grupo com Título, Vagas e BOTÃO ENVIAR à direita (sem linha debaixo) */}
                      <div className="flex items-center justify-between gap-3 pb-1">
                        <div className="min-w-0 flex-1 flex items-center flex-wrap gap-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10.5px] sm:text-[11px] font-black uppercase tracking-wider ${styles.badgeText} bg-white/10 border border-white/15 shrink-0`}>
                            {styles.title}
                          </span>
                          <h4 className="font-black text-xs sm:text-sm tracking-wide flex items-center flex-wrap gap-1 text-white uppercase select-none leading-tight">
                            <span>ESCOLHA</span>
                            <span className="inline-flex items-center justify-center px-1 text-yellow-300 font-mono font-black text-base sm:text-lg leading-none mx-0.5">
                              {String(tie.vacanciesInDispute + 1).padStart(2, '0')}
                            </span>
                            <span>{tie.vacanciesInDispute + 1 === 1 ? 'NOME PARA DISPUTA' : 'NOMES PARA DISPUTA'}</span>
                            <span className="inline-flex items-center justify-center px-1 text-yellow-300 font-mono font-black text-base sm:text-lg leading-none mx-0.5">
                              {String(tie.vacanciesInDispute).padStart(2, '0')}
                            </span>
                            <span>{tie.vacanciesInDispute === 1 ? 'VAGA' : 'VAGAS'}</span>
                          </h4>
                        </div>

                        {/* Botão ENVIAR no lado direito com a cor da categoria */}
                        <button
                          type="button"
                          onClick={() => handleStartTieBreak(tie)}
                          title={`Iniciar votação de desempate para ${styles.title}`}
                          className={`shrink-0 px-3.5 py-1.5 rounded-lg font-black text-xs sm:text-sm tracking-wider uppercase flex items-center gap-1.5 transition-all duration-150 active:scale-95 cursor-pointer shadow-md select-none ${styles.btnEnviar}`}
                        >
                          <span>ENVIAR</span>
                          <ChevronsRight className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      </div>

                      {/* Cards dos Candidatos Empatados (Reduzidos em ~30%) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {tie.tiedCandidates.map((c) => {
                          const isSelected = selectedTieCandidateIds.includes(c.id);

                          return (
                            <div
                              key={c.id}
                              onClick={() => handleToggleTieCandidate(c.id, maxAllowed)}
                              className={`py-1.5 px-2.5 rounded-lg border transition-all duration-150 cursor-pointer select-none flex items-center justify-between gap-2 shadow-sm active:scale-95 ${
                                isSelected ? styles.cardSelected : styles.cardBase
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {c.photoUrl ? (
                                  <img
                                    src={c.photoUrl}
                                    alt={c.name}
                                    className="w-6 h-6 rounded-md object-cover border border-white/20 shrink-0"
                                  />
                                ) : (
                                  <div
                                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${
                                      isSelected ? styles.iconBoxSelected : styles.iconBoxBase
                                    }`}
                                  >
                                    <Star className={`w-3 h-3 ${isSelected ? styles.starSelected : styles.starBase}`} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <h5 className="font-black text-[11px] sm:text-xs text-white uppercase truncate leading-tight">
                                    {c.name}
                                  </h5>
                                  <span className={`inline-flex items-center gap-1 text-[7.5px] font-black uppercase leading-tight ${
                                    isSelected ? styles.subTextSelected : styles.subTextBase
                                  }`}>
                                    <Star className="w-2 h-2 fill-current" />
                                    EMPATE • {tie.votesCount} {tie.votesCount === 1 ? 'voto' : 'votos'}
                                  </span>
                                </div>
                              </div>

                              {/* Indicador de Seleção Circular Compacto */}
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                  isSelected
                                    ? styles.circleSelected
                                    : 'border-slate-600 bg-slate-900/60'
                                }`}
                              >
                                {isSelected && <CheckCircle className="w-3 h-3 stroke-[3]" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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

      {/* MODAL PARA CRIAR NOVO EVENTO GERAL (COM AVISO DE HARD RESET) */}
      <AnimatePresence>
        {isNewGeneralModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsNewGeneralModalOpen(false)}
            className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg bg-[#141721] border-2 border-amber-500/60 rounded-2xl p-6 shadow-[0_0_35px_rgba(245,158,11,0.25),0_20px_50px_rgba(0,0,0,0.85)] text-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setIsNewGeneralModalOpen(false)}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border-2 border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.35)] flex items-center justify-center mb-3.5">
                  <Building2 className="w-7 h-7 text-amber-400" />
                </div>

                <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white mb-3">
                  Criar Novo Evento Geral
                </h3>

                <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 text-left flex items-start gap-2.5 text-xs text-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Banco Online:</strong> O evento geral atual e todo o seu histórico ficam preservados online na lista de Eventos Gerais. O novo evento iniciará um ambiente limpo para novas votações.
                  </span>
                </div>

                <div className="w-full text-left mb-5">
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Nome do Evento Geral:
                  </label>
                  <input
                    ref={newGeneralInputRef}
                    type="text"
                    autoFocus
                    placeholder="Ex: COMISSÃO DA IGREJA ADVENTISTA DA ASA NORTE 2026"
                    value={newGeneralEventNameInput}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewGeneralEventNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newGeneralEventNameInput.trim()) {
                          handleHardResetGeneralEvent(newGeneralEventNameInput);
                        }
                      }
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#0b0d13] border border-white/15 focus:border-amber-500 rounded-xl text-sm font-bold text-white outline-none placeholder-slate-500 shadow-inner"
                  />
                </div>

                <div className="flex items-center justify-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setIsNewGeneralModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 uppercase tracking-wider transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (newGeneralEventNameInput.trim()) {
                        handleHardResetGeneralEvent(newGeneralEventNameInput);
                      }
                    }}
                    disabled={!newGeneralEventNameInput.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_15px_rgba(245,158,11,0.35)] border border-amber-400/40 transition cursor-pointer"
                  >
                    Criar Novo Evento
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL PARA RENOMEAR EVENTO GERAL EXISTENTE (SEM RESET) */}
      <AnimatePresence>
        {isEditingGeneralModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsEditingGeneralModalOpen(false)}
            className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-[#141721] border-2 border-amber-500/60 rounded-2xl p-6 shadow-[0_0_35px_rgba(245,158,11,0.25),0_20px_50px_rgba(0,0,0,0.85)] text-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setIsEditingGeneralModalOpen(false)}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border-2 border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.35)] flex items-center justify-center mb-3">
                  <Pencil className="w-6 h-6 text-amber-400" />
                </div>

                <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white mb-1.5">
                  Renomear Evento Geral
                </h3>

                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  Altere o nome do evento geral. A alteração é salva no banco online e sincronizada com todos os dispositivos.
                </p>

                <div className="w-full text-left mb-5">
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Nome do Evento Geral:
                  </label>
                  <input
                    ref={editingGeneralInputRef}
                    type="text"
                    autoFocus
                    value={editingGeneralEventName}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEditingGeneralEventName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (editingGeneralEventName.trim()) {
                          handleRenameGeneralEvent(editingGeneralEventName);
                        }
                      }
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#0b0d13] border border-white/15 focus:border-amber-500 rounded-xl text-sm font-bold text-white outline-none placeholder-slate-500 shadow-inner"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full pt-4 border-t border-white/10">
                  {/* Botão Excluir no rodapé em vermelho */}
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirmGeneralEvent({
                        id: currentGeneralEventId,
                        name: session.generalEventName || editingGeneralEventName,
                      });
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 hover:text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
                    title="Excluir este Evento Geral"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Excluir Evento</span>
                  </button>

                  {/* Botão apenas SALVAR */}
                  <button
                    type="button"
                    onClick={() => {
                      if (editingGeneralEventName.trim()) {
                        handleRenameGeneralEvent(editingGeneralEventName);
                      }
                    }}
                    disabled={!editingGeneralEventName.trim()}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_15px_rgba(245,158,11,0.35)] border border-amber-400/40 transition cursor-pointer active:scale-95"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE CONFIRMAÇÃO / DUPLO CHECK PARA EXCLUIR EVENTO */}
      <AnimatePresence>
        {deleteConfirmGeneralEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setDeleteConfirmGeneralEvent(null)}
            className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-[#141721] border-2 border-rose-500/80 rounded-2xl p-6 shadow-[0_0_40px_rgba(244,63,94,0.35),0_20px_50px_rgba(0,0,0,0.9)] text-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setDeleteConfirmGeneralEvent(null)}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border-2 border-rose-400/80 shadow-[0_0_20px_rgba(244,63,94,0.4)] flex items-center justify-center mb-3 text-rose-400">
                  <Trash2 className="w-7 h-7" />
                </div>

                <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-rose-400 mb-1.5">
                  Excluir Evento Geral
                </h3>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3">
                  Tem certeza absoluta que deseja excluir o evento:
                </p>

                <div className="w-full p-3 rounded-xl bg-black/40 border border-rose-500/30 text-amber-300 font-semibold text-xs sm:text-sm mb-4 truncate text-center">
                  {deleteConfirmGeneralEvent.name}
                </div>

                <p className="text-[11px] text-rose-300/90 leading-tight mb-5 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">
                  ⚠️ <span className="font-bold">Atenção:</span> Esta ação é irreversível. Todas as votações, candidatos e histórico deste evento serão apagados do banco online.
                </p>

                <div className="flex items-center justify-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmGeneralEvent(null)}
                    className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 uppercase tracking-wider transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteGeneralEvent(deleteConfirmGeneralEvent.id)}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_15px_rgba(244,63,94,0.4)] border border-rose-400/50 transition cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sim, Excluir</span>
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

      {quotaWarning && (
        <div className="mb-2.5 px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between gap-3 shadow-md select-none">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Cota diária de gravações do Firebase atingida (50.000).</strong> O sistema ativou automaticamente a contingência <strong>P2P / Rede Local</strong>. A votação continua funcionando normalmente! Para reabilitar a nuvem, ative o plano Blaze no Firebase Console (continua grátis nas primeiras 20k/dia).
            </span>
          </div>
          <button
            onClick={() => setQuotaWarning(false)}
            className="text-amber-300 hover:text-white px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-[11px] font-bold shrink-0"
          >
            Entendi
          </button>
        </div>
      )}

      {/* CARD: EVENTOS GERAIS ONLINE (LISTBOX + NOVO EVENTO À ESQUERDA, HISTÓRICO + ENGRENAGEM SEM FUNDO À DIREITA) */}
      <div className="-mx-3 sm:-mx-4 lg:-mx-5 mb-2.5 px-3.5 sm:px-5 py-2 bg-gradient-to-r from-[#0a1829] via-[#091b33] to-[#0d2238] border-y border-amber-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.6)] flex items-center justify-between gap-3 relative z-30">
        {/* Esquerda: Ícone do Prédio (sem borda) + Listbox dos Eventos + Lapizinho (sem borda) + Lixeira (sem borda) + Botão Novo Evento */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-wrap">
          <div className="flex items-center justify-center shrink-0 p-1">
            <Building2 className="w-5 h-5 text-amber-400" />
          </div>

          {/* Listbox dos Eventos Existentes (substitui o título comissão para evitar duplicidade) */}
          <div className="relative shrink-0">
            <select
              value={currentGeneralEventId}
              onChange={(e) => handleSwitchGeneralEvent(e.target.value)}
              className="bg-[#0b172a] hover:bg-[#0f1f38] text-amber-300 text-xs sm:text-sm font-normal pl-3 pr-8 py-1.5 sm:py-2 rounded-lg border border-amber-500/40 hover:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 shadow-inner cursor-pointer appearance-none min-w-[200px] max-w-[260px] sm:max-w-[340px] truncate transition-colors"
              title="Selecione o Evento Geral"
            >
              {generalEventsList.map((gev) => (
                <option key={gev.id} value={gev.id} className="bg-[#0b172a] text-slate-100 py-1">
                  {gev.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-amber-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Botão de Renomear o Evento Geral Selecionado (sem borda) */}
          <button
            type="button"
            onClick={() => {
              setEditingGeneralEventName(session.generalEventName || 'Comissão da Igreja Adventista da Asa Norte');
              setIsEditingGeneralModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-white/10 transition cursor-pointer shrink-0 border-0 shadow-none focus:outline-none"
            title="Renomear este Evento Geral"
          >
            <Pencil className="w-4 h-4" />
          </button>

          {/* Botão de Excluir o Evento Geral Selecionado (sem borda) */}
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmGeneralEvent({
                id: currentGeneralEventId,
                name: session.generalEventName || 'Evento Geral',
              });
            }}
            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-white/10 transition cursor-pointer shrink-0 border-0 shadow-none focus:outline-none"
            title="Excluir este Evento Geral"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Botão "+ Novo evento" na frente */}
          <button
            type="button"
            onClick={() => {
              setNewGeneralEventNameInput('');
              setIsNewGeneralModalOpen(true);
            }}
            className="px-3 py-1.5 min-h-[32px] sm:min-h-[34px] rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-medium text-xs tracking-normal flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm shrink-0"
            title="Criar novo Evento"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>+ Novo evento</span>
          </button>
        </div>

        {/* Direita: Histórico (sem borda) à esquerda da Engrenagem, e Engrenagem (sem borda) lá na ponta */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
          {/* Atalho para Histórico de Votações (sem borda) */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => {
                setIsGearOpen(true);
                setTimeout(() => {
                  document.getElementById('historico-votacoes-card')?.scrollIntoView({ behavior: 'smooth' });
                }, 200);
              }}
              className="p-1.5 sm:p-2 rounded-xl transition-all duration-200 cursor-pointer active:scale-90 flex items-center justify-center gap-1.5 bg-transparent hover:bg-white/10 text-slate-300 hover:text-white border-0 shadow-none focus:outline-none"
              title="Ver Histórico de Votações Encerradas"
              aria-label="Ver Histórico de Votações Encerradas"
            >
              <History className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" />
              {session.history && session.history.length > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.2 bg-amber-400 text-slate-950 rounded-full font-mono leading-none">
                  {session.history.length}
                </span>
              )}
            </button>
            <div className="absolute top-full right-0 mt-2 hidden group-hover:flex items-center px-2.5 py-1 bg-[#141721] border border-white/[0.12] text-slate-200 text-[11px] font-medium rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
              Histórico de Votações
            </div>
          </div>

          {/* Engrenagem sem borda e sem fundo lá na ponta direita */}
          <button
            ref={gearButtonRef}
            type="button"
            onClick={() => setIsGearOpen((prev) => !prev)}
            title="Abrir/Recolher Opções (ESC ou clique fora para recolher)"
            className="group relative p-1.5 sm:p-2 rounded-xl transition-all duration-300 cursor-pointer active:scale-90 flex items-center justify-center bg-transparent hover:bg-white/10 border-0 shadow-none outline-none focus:outline-none"
          >
            <svg
              viewBox="0 0 64 64"
              className="w-7 h-7 sm:w-8 sm:h-8 transition-transform duration-1000 ease-in-out group-hover:rotate-[360deg] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
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

      {/* BARRA DE EVENTOS: LAYOUT ESTÚDIO MODERNO COM CORES SUAVES E SEM CAIXA ALTA */}
      <div className="-mx-3 sm:-mx-4 lg:-mx-5 bg-[#141721] border-y border-white/[0.08] shadow-lg mb-3 flex items-stretch justify-between min-h-[58px] relative z-30">
        <div className="flex-1 min-w-0 flex items-stretch justify-between pr-4 sm:pr-6 lg:pr-8 gap-3">
          {/* LINHA CENTRALIZADA VERTICALMENTE: "EVENTOS" + "+ CRIAR VOTAÇÃO" À ESQUERDA E EVENTOS CRIADOS À DIREITA */}
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            {/* FAIXA SUTIL DE "VOTAÇÕES" (EDITÁVEL COM LAPIZINHO, SALVO NA MÁQUINA) ATÉ O BOTÃO "+ CRIAR VOTAÇÃO" */}
            <div className="self-stretch flex items-center shrink-0 pr-1.5 sm:pr-2.5 py-2">
              {isEditingVotacoesTitle ? (
                <div className="flex items-center gap-1 px-2.5">
                  <input
                    type="text"
                    autoFocus
                    value={tempVotacoesTitle}
                    onChange={(e) => setTempVotacoesTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveVotacoesTitle();
                      if (e.key === 'Escape') setIsEditingVotacoesTitle(false);
                    }}
                    onBlur={handleSaveVotacoesTitle}
                    className="bg-[#0b172a] text-slate-100 border border-amber-500/60 rounded px-2 py-1 text-xs sm:text-sm font-medium outline-none max-w-[130px] shadow-inner"
                    title="Pressione Enter para salvar"
                  />
                  <button
                    type="button"
                    onClick={handleSaveVotacoesTitle}
                    className="p-1 rounded text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
                    title="Salvar título"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-3 sm:px-4">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('candidates');
                      setIsBottomSectionOpen(true);
                    }}
                    onDoubleClick={() => {
                      setTempVotacoesTitle(votacoesTitle);
                      setIsEditingVotacoesTitle(true);
                    }}
                    className="text-slate-300 hover:text-white font-medium text-xs sm:text-sm tracking-wide transition cursor-pointer select-none"
                    title="Mostrar seção de nomes (duplo clique ou clique no lápis para renomear)"
                  >
                    {votacoesTitle}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempVotacoesTitle(votacoesTitle);
                      setIsEditingVotacoesTitle(true);
                    }}
                    className="p-1 text-slate-500 hover:text-amber-400 transition cursor-pointer shrink-0"
                    title="Renomear título (salvo somente neste computador)"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}

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
            {eventsList.map((evt, index) => {
              const isSelected = evt.id === currentActiveEventId;
              const count = isSelected ? session.options.length : (evt.options?.length || 0);
              const displayName = isSelected ? (session.title || evt.name) : evt.name;
              // Garante que o modal só abra em exatamente 1 card, sem sobreposição
              const isEditingThisEvt =
                isCreatingNewEvent &&
                editingEventId === evt.id &&
                index === eventsList.findIndex((e) => e.id === editingEventId);
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
          </div>
        </div>
      </div>

      {/* BANNER DE AVISO DE EMPATE (50% MAIS ESTREITO, CENTRALIZADO, COM CAPTION E BOTÃO À DIREITA) */}
      {hasTies && allHaveVoted && (
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
                const gap = (layout.cardGapV2 !== undefined && layout.cardGapV2 !== 2) ? layout.cardGapV2 : 0;
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
                          <span className="font-medium text-slate-100 text-xs sm:text-sm tracking-tight flex items-center gap-1.5 flex-wrap">
                            <span>Configuração de como será exibido os elementos no Telão</span>
                            <span className="font-bold text-sky-400 uppercase tracking-wide">PÚBLICO</span>
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

                          {/* 6. Switch VU Meter no Dashboard (Chavinha Slide) + Seletor de 4 Modelos */}
                          <div className="flex items-center gap-2 bg-[#0b0d13] px-3 py-2 rounded-lg border border-white/[0.08] min-h-[38px] flex-wrap">
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">VU Meter:</span>
                            <button
                              type="button"
                              onClick={() => handleToggleVuMeter(!showVuMeter)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                showVuMeter ? 'bg-emerald-500' : 'bg-slate-700'
                              }`}
                              title={showVuMeter ? 'Ocultar VU Meter' : 'Exibir VU Meter'}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  showVuMeter ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <span className="text-[10px] font-semibold text-slate-300 mr-1">
                              {showVuMeter ? 'ON' : 'OFF'}
                            </span>

                            {/* 4 Modelos de VU Meter para Escolha */}
                            {showVuMeter && (
                              <div className="flex items-center gap-1 pl-2 border-l border-white/[0.08]">
                                {[
                                  { id: 'estudio', label: 'Estúdio' },
                                  { id: 'neon-wave', label: 'Neon' },
                                  { id: 'led-matrix', label: 'LED Matrix' },
                                  { id: 'gold-pulse', label: 'Dourado' },
                                ].map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleSelectVuModel(m.id)}
                                    className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition cursor-pointer ${
                                      vuMeterModel === m.id
                                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200 bg-white/[0.04]'
                                    }`}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                            )}
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


                    {/* CARD 3: HISTÓRICO DE VOTAÇÕES ENCERRADAS (EXIBIDO APENAS SE HOUVER HISTÓRICO) */}
                    {Boolean(session.history && session.history.length > 0) && (
                      <div
                        id="historico-votacoes-card"
                        className="bg-[#141721] border border-white/[0.08] rounded-xl px-3.5 py-3.5 space-y-3 shadow-lg"
                      >
                        {/* Cabeçalho do Card */}
                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                              <History className="w-3.5 h-3.5 text-amber-400" />
                            </div>
                            <span className="font-medium text-slate-100 text-xs sm:text-sm tracking-tight flex items-center gap-2">
                              Histórico de Votações Encerradas
                              {session.history && session.history.length > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                                  {session.history.length} {session.history.length === 1 ? 'eleição' : 'eleições'}
                                </span>
                              )}
                            </span>
                          </div>

                          {session.history && session.history.length > 0 && (
                            <button
                              type="button"
                              onClick={handleClearHistory}
                              title="Limpar todos os registros arquivados"
                              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-medium transition cursor-pointer active:scale-95 flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3 h-3 text-rose-400" />
                              <span>Limpar Histórico</span>
                            </button>
                          )}
                        </div>

                        {/* Lista de Registros do Histórico */}
                        <div className="space-y-3">
                          {(session.history || []).map((record, rIdx) => (
                            <div
                              key={record.id || rIdx}
                              className="bg-[#0b0d13] border border-white/[0.08] hover:border-amber-400/30 rounded-xl p-3 sm:p-3.5 space-y-3 transition shadow-sm"
                            >
                              {/* Header da Eleição: Data e Título no formato oficial (dia xx/xx/xxxx ELEIÇÃO MULHERES) */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="p-1 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
                                    <Calendar className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="font-extrabold text-amber-300 text-xs sm:text-sm tracking-wide">
                                    {record.headerTitle}
                                  </span>
                                  <span className="text-[10.5px] font-mono text-slate-400 bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.06]">
                                    {record.timeFormatted}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[10.5px] text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
                                    {record.totalVoters} Votantes • {record.totalVotes} Votos
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadAtaPdf(record)}
                                    title="Baixar Ata Oficial em PDF (A4 / ABNT)"
                                    className="px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] hover:border-amber-400/40 text-slate-200 hover:text-white text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-sm"
                                  >
                                    <FileDown className="w-3.5 h-3.5 text-amber-300" />
                                    <span>Baixar Ata</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyHistoryAta(record)}
                                    title="Copiar texto da ata"
                                    className="p-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-slate-200 text-[11px] transition cursor-pointer flex items-center active:scale-95"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteHistoryItem(record.id)}
                                    title="Excluir este registro"
                                    className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition cursor-pointer active:scale-95"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {/* As 3 Seções: Eleitos, Suplentes e Não Classificados */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                {/* 1. ELEITOS */}
                                <div className="bg-[#141721] border border-emerald-500/30 rounded-lg p-2.5 space-y-1.5">
                                  <div className="flex items-center justify-between pb-1 border-b border-emerald-500/20">
                                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                                      <Award className="w-3.5 h-3.5" />
                                      ELEITOS ({record.eleitos?.length || 0})
                                    </span>
                                    <span className="text-[9.5px] font-bold text-emerald-300/80 uppercase">
                                      Titulares
                                    </span>
                                  </div>
                                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {record.eleitos && record.eleitos.length > 0 ? (
                                      record.eleitos.map((c, cIdx) => (
                                        <div
                                          key={c.id || cIdx}
                                          className="flex items-center justify-between gap-1.5 bg-[#0b0d13]/80 px-2 py-1 rounded text-xs"
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="font-mono text-[10px] text-emerald-400 font-bold shrink-0">
                                              #{cIdx + 1}
                                            </span>
                                            <span className="text-slate-100 font-medium truncate">
                                              {c.name}
                                            </span>
                                          </div>
                                          <span className="text-emerald-300 font-bold text-[10.5px] shrink-0 font-mono">
                                            {c.votesCount} {c.votesCount === 1 ? 'voto' : 'votos'} ({c.percentage}%)
                                          </span>
                                        </div>
                                      ))
                                    ) : (
                                      <span className="text-[11px] text-slate-500 italic block py-1">Nenhum eleito</span>
                                    )}
                                  </div>
                                </div>

                                {/* 2. SUPLENTES */}
                                <div className="bg-[#141721] border border-blue-500/30 rounded-lg p-2.5 space-y-1.5">
                                  <div className="flex items-center justify-between pb-1 border-b border-blue-500/20">
                                    <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                                      <Users className="w-3.5 h-3.5" />
                                      SUPLENTES ({(record.suplentes?.length || 0) + (record.segundoSuplentes?.length || 0)})
                                    </span>
                                    <span className="text-[9.5px] font-bold text-blue-300/80 uppercase">
                                      Reserva
                                    </span>
                                  </div>
                                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {((record.suplentes?.length || 0) + (record.segundoSuplentes?.length || 0)) > 0 ? (
                                      <>
                                        {record.suplentes?.map((c, cIdx) => (
                                          <div
                                            key={c.id || cIdx}
                                            className="flex items-center justify-between gap-1.5 bg-[#0b0d13]/80 px-2 py-1 rounded text-xs"
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <span className="font-mono text-[9px] text-blue-300 font-bold px-1 rounded bg-blue-500/20 shrink-0">
                                                1º Sup
                                              </span>
                                              <span className="text-slate-100 font-medium truncate">
                                                {c.name}
                                              </span>
                                            </div>
                                            <span className="text-blue-300 font-bold text-[10.5px] shrink-0 font-mono">
                                              {c.votesCount} {c.votesCount === 1 ? 'voto' : 'votos'} ({c.percentage}%)
                                            </span>
                                          </div>
                                        ))}
                                        {record.segundoSuplentes?.map((c, cIdx) => (
                                          <div
                                            key={c.id || cIdx}
                                            className="flex items-center justify-between gap-1.5 bg-[#0b0d13]/80 px-2 py-1 rounded text-xs"
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <span className="font-mono text-[9px] text-indigo-300 font-bold px-1 rounded bg-indigo-500/20 shrink-0">
                                                2º Sup
                                              </span>
                                              <span className="text-slate-100 font-medium truncate">
                                                {c.name}
                                              </span>
                                            </div>
                                            <span className="text-indigo-300 font-bold text-[10.5px] shrink-0 font-mono">
                                              {c.votesCount} {c.votesCount === 1 ? 'voto' : 'votos'} ({c.percentage}%)
                                            </span>
                                          </div>
                                        ))}
                                      </>
                                    ) : (
                                      <span className="text-[11px] text-slate-500 italic block py-1">Sem suplentes</span>
                                    )}
                                  </div>
                                </div>

                                {/* 3. NÃO CLASSIFICADOS */}
                                <div className="bg-[#141721] border border-white/[0.08] rounded-lg p-2.5 space-y-1.5">
                                  <div className="flex items-center justify-between pb-1 border-b border-white/[0.08]">
                                    <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                                      <Activity className="w-3.5 h-3.5 text-slate-400" />
                                      NÃO CLASSIFICADOS ({record.naoClassificados?.length || 0})
                                    </span>
                                    <span className="text-[9.5px] font-bold text-slate-500 uppercase">
                                      Demais
                                    </span>
                                  </div>
                                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {record.naoClassificados && record.naoClassificados.length > 0 ? (
                                      record.naoClassificados.map((c, cIdx) => (
                                        <div
                                          key={c.id || cIdx}
                                          className="flex items-center justify-between gap-1.5 bg-[#0b0d13]/80 px-2 py-1 rounded text-xs"
                                        >
                                          <span className="text-slate-400 font-medium truncate">
                                            {c.name}
                                          </span>
                                          <span className="text-slate-400 font-mono text-[10.5px] shrink-0">
                                            {c.votesCount} {c.votesCount === 1 ? 'voto' : 'votos'} ({c.percentage}%)
                                          </span>
                                        </div>
                                      ))
                                    ) : (
                                      <span className="text-[11px] text-slate-500 italic block py-1">Nenhum</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ABA: NOMES / CANDIDATOS (ABRE AO CLICAR NO BOTÃO DO EVENTO NO CABEÇALHO) - ENCOSTA NAS BORDAS DIR E ESQ DA PÁGINA */}
      {activeTab === 'candidates' && isBottomSectionOpen && (
        <div className="space-y-3.5 flex-1 flex flex-col min-h-0 -mx-3 sm:-mx-4 lg:-mx-5">
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

          {/* SE A VOTAÇÃO ESTIVER EM ANDAMENTO E O ADMIN QUISER O DASHBOARD: MOSTRA O DASHBOARD DE EVOLUÇÃO (ANIMAÇÃO CORTINA / MORPH SUAVE) */}
          <AnimatePresence mode="wait" custom={isVotingActive && adminVotingView === 'dashboard' ? 'down' : 'up'}>
            {isVotingActive && adminVotingView === 'dashboard' ? (
              <motion.div
                key="layout-novo-dashboard"
                custom="down"
                variants={morphCurtainVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="bg-[#141721] border-y border-white/[0.08] border-x-0 rounded-none px-4 sm:px-6 py-4 sm:py-5 shadow-xl space-y-4 flex-1 flex flex-col min-h-0"
              >
                {/* Header do Dashboard */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <Activity className="w-4 h-4 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                      <h3 className="font-normal text-slate-100 text-sm sm:text-base tracking-wide whitespace-nowrap">
                        Escolha de
                      </h3>

                      {/* Card Escolhido (ex: MULHERES): linhas estendidas em mais 15% para dir/esq (-30% total), cobrindo o final de Escolha de */}
                      <div className="relative px-4 py-1 flex items-center justify-center select-none">
                        {/* Linha superior com platô no centro e transparência cobrindo o final de Escolha de */}
                        <span
                          className="absolute top-0 h-[1.5px] pointer-events-none"
                          style={{
                            left: '-30%',
                            right: '-30%',
                            background: 'linear-gradient(to right, rgba(251,191,36,0) 0%, rgba(251,191,36,0.70) 30%, rgba(251,191,36,0.70) 70%, rgba(251,191,36,0) 100%)',
                            boxShadow: '0 0 5px rgba(251,191,36,0.30)',
                          }}
                        />
                        {/* Linha inferior com platô no centro e transparência cobrindo o final de Escolha de */}
                        <span
                          className="absolute bottom-0 h-[1.5px] pointer-events-none"
                          style={{
                            left: '-30%',
                            right: '-30%',
                            background: 'linear-gradient(to right, rgba(251,191,36,0) 0%, rgba(251,191,36,0.70) 30%, rgba(251,191,36,0.70) 70%, rgba(251,191,36,0) 100%)',
                            boxShadow: '0 0 5px rgba(251,191,36,0.30)',
                          }}
                        />

                        <span className="text-xs sm:text-sm font-normal text-white uppercase tracking-wider whitespace-nowrap">
                          {session.title || 'ELEIÇÃO'}
                        </span>
                      </div>

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

              {/* 4 Cards de KPI / Telemetria com Fonte Grande */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* 1. Votantes (quantidade em fonte grande e controle em tempo real) */}
                <div className="bg-[#0b0d13] border border-white/[0.08] rounded-xl p-3 sm:p-3.5 flex items-center justify-between gap-2 shadow-sm hover:border-blue-500/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-slate-400 block truncate uppercase tracking-wider">
                          Votantes
                        </span>
                        {isVotingActive && (
                          <span
                            className={`text-[8.5px] font-bold px-1 py-0.5 rounded uppercase leading-none ${
                              isSessionLocked
                                ? 'text-rose-300 bg-rose-950/80 border border-rose-500/30'
                                : 'text-emerald-300 bg-emerald-950/80 border border-emerald-500/30'
                            }`}
                            title={isSessionLocked ? 'Sessão Fechada no cadeado' : 'Sessão Aberta'}
                          >
                            {isSessionLocked ? '🔒 Fechada' : '🔓 Aberta'}
                          </span>
                        )}
                      </div>
                      <span className="text-2xl sm:text-3xl font-black text-slate-100 font-mono leading-none tracking-tight block mt-0.5">
                        {currentVotersVoted}
                        {session.totalVotersConnected && session.totalVotersConnected > 0 ? (
                          <span className="text-sm sm:text-base font-normal text-slate-400 font-mono ml-1" title="Meta / Limite total de votantes">
                            / {session.totalVotersConnected}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>

                  {/* Controle rápido de ajuste de votantes em tempo real (para votantes atrasados com sessão aberta) */}
                  {isVotingActive && (
                    <div className="flex flex-col items-end shrink-0 gap-1 select-none">
                      <div className="flex items-center gap-1 bg-[#141721] p-0.5 rounded-lg border border-white/[0.08]">
                        <button
                          type="button"
                          disabled={isSessionLocked || (session.totalVotersConnected || 0) <= currentVotersVoted}
                          onClick={() => {
                            const cur = session.totalVotersConnected || Math.max(displayVotersCount, currentVotersVoted);
                            const next = Math.max(currentVotersVoted, cur - 1);
                            saveSession({ ...session, totalVotersConnected: next });
                          }}
                          title={isSessionLocked ? 'Abra a sessão no cadeado para alterar' : 'Diminuir limite (-1)'}
                          className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          -
                        </button>
                        <span className="font-mono text-xs font-bold text-amber-300 px-1 min-w-[20px] text-center" title="Limite de votantes ativo">
                          {session.totalVotersConnected || currentVotersVoted}
                        </span>
                        <button
                          type="button"
                          disabled={isSessionLocked}
                          onClick={() => {
                            const cur = session.totalVotersConnected || Math.max(displayVotersCount, currentVotersVoted);
                            const next = cur + 1;
                            saveSession({ ...session, totalVotersConnected: next });
                          }}
                          title={isSessionLocked ? 'Abra a sessão no cadeado para alterar (votante atrasado)' : 'Adicionar votante atrasado (+1)'}
                          className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[8.5px] text-slate-400 font-medium">
                        {isSessionLocked ? 'Travada' : 'Ajustar limite'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Total de Votos (quantidade em fonte grande) */}
                <div className="bg-[#0b0d13] border border-white/[0.08] rounded-xl p-3 sm:p-3.5 flex items-center gap-3 shadow-sm hover:border-emerald-500/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                    <Activity className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-slate-400 block truncate uppercase tracking-wider">
                      Total de votos
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-emerald-300 font-mono leading-none tracking-tight block mt-0.5">
                      {totalVotesCast}
                    </span>
                  </div>
                </div>

                {/* 3. Corte Titulares (quantidade em fonte grande) */}
                <div className="bg-[#0b0d13] border border-white/[0.08] rounded-xl p-3 sm:p-3.5 flex items-center gap-3 shadow-sm hover:border-purple-500/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 shadow-inner">
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-slate-400 block truncate uppercase tracking-wider">
                      Corte Titulares
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-purple-300 font-mono leading-none tracking-tight block mt-0.5">
                      {cutoffVotes}
                    </span>
                  </div>
                </div>

                {/* 4. Corte 1º Suplente (quantidade em fonte grande) */}
                <div className="bg-[#0b0d13] border border-white/[0.08] rounded-xl p-3 sm:p-3.5 flex items-center gap-3 shadow-sm hover:border-sky-500/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-slate-400 block truncate uppercase tracking-wider">
                      Corte 1º Suplente
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-sky-300 font-mono leading-none tracking-tight block mt-0.5">
                      {cutoffSuplente1}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ranking Dinâmico com Barras de Progresso */}
              <div className="space-y-2 pt-1 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1 pb-1 shrink-0">
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
                  <div className="flex flex-col -space-y-px flex-1 overflow-y-auto pr-1 min-h-[320px] max-h-[calc(100vh-360px)] scrollbar-thin [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/35">
                    {/* Cabeçalho de Colunas Alinhadas (sem a coluna % separada) */}
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1 bg-white/[0.03] rounded-md border border-white/[0.05] gap-2 mb-0.5">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="w-6 text-center shrink-0">#</span>
                        <span className="w-[20ch] min-w-[20ch] max-w-[20ch] shrink-0 text-left">Nome (20 carac.)</span>
                        <span className="w-[85px] min-w-[85px] max-w-[85px] shrink-0 text-left">Titular</span>
                      </div>
                      <div className="flex-1 flex items-center justify-between mx-1.5 text-slate-400">
                        <span>Progressão (%)</span>
                        <span className="text-[10px] text-slate-400 font-mono">100% |</span>
                      </div>
                      <div className="flex items-center shrink-0">
                        <span className="min-w-[62px] text-center">Votos</span>
                      </div>
                    </div>

                    <LayoutGroup id="admin-ranking-list">
                    {rankedCandidates.map((candidate, idx) => {
                      const votes = Math.floor(candidate.votesCount || 0);
                      const percent = totalVotesCast > 0 ? Math.round((votes / totalVotesCast) * 100) : 0;
                      const barWidth = maxVotesRecorded > 0 ? Math.max(3, Math.round((votes / maxVotesRecorded) * 100)) : 0;
                      const isTitular = idx < vacancies;
                      const isSuplente1 = idx >= vacancies && idx < vacancies + s1Count;
                      const isSuplente2 = idx >= vacancies + s1Count && idx < totalVacancies;
                      const isFirstAfterTitulares = idx === vacancies && s1Count > 0;

                      // Cores configuradas em config (winnerColor = verde esmeralda por padrão)
                      const winnerColor = session.telaoLayout?.winnerColor || '#10b981';
                      const suplenteColor = session.telaoLayout?.suplenteColor || '#3b82f6';
                      const suplente2Color = session.telaoLayout?.suplente2Color || '#64748b';
                      const unclassifiedColor = session.telaoLayout?.unclassifiedColor || '#1e293b';

                      const activeColor = isTitular
                        ? winnerColor
                        : isSuplente1
                        ? suplenteColor
                        : isSuplente2
                        ? suplente2Color
                        : unclassifiedColor;

                      return (
                        <React.Fragment key={candidate.id}>
                          {isFirstAfterTitulares && (
                            <div className="flex items-center gap-2 py-0.5 my-0.5">
                              <div className="flex-1 h-px bg-emerald-500/30" />
                              <span className="text-[10px] font-medium text-emerald-400/80 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                ▲ Linha de corte dos Titulares ({vacancies} vagas)
                              </span>
                              <div className="flex-1 h-px bg-emerald-500/30" />
                            </div>
                          )}

                          <motion.div
                            layout
                            key={candidate.id}
                            transition={{
                              layout: { type: 'spring', stiffness: 240, damping: 28 },
                            }}
                            style={{
                              borderColor: hexToRgba(activeColor, isTitular ? 0.45 : isSuplente1 ? 0.35 : 0.2),
                            }}
                            className={`relative overflow-hidden p-2 sm:p-2.5 bg-[#0b0d13] border transition-colors duration-200 flex items-center justify-between gap-2 shadow-sm ${
                              idx === 0
                                ? 'rounded-t-lg'
                                : idx === rankedCandidates.length - 1
                                ? 'rounded-b-lg'
                                : 'rounded-none'
                            } -mt-px hover:z-20 hover:border-opacity-100`}
                          >
                            {/* COLUNA 1: POSIÇÃO / RANK */}
                            <span className="w-6 text-center font-mono font-bold text-xs text-slate-400 shrink-0">
                              #{idx + 1}
                            </span>

                            {/* COLUNA 2: NOME COM 20 CARACTERES */}
                            <div className="w-[20ch] min-w-[20ch] max-w-[20ch] shrink-0" title={candidate.name}>
                              <span className="font-bold text-xs sm:text-sm text-slate-100 uppercase truncate block">
                                {candidate.name.length > 20 ? `${candidate.name.slice(0, 20)}...` : candidate.name}
                              </span>
                            </div>

                            {/* COLUNA 3: COLUNA DEDICADA PARA TITULAR / CARGO */}
                            <div className="w-[85px] min-w-[85px] max-w-[85px] shrink-0 flex items-center">
                              {isTitular ? (
                                <span
                                  style={{
                                    backgroundColor: hexToRgba(winnerColor, 0.2),
                                    borderColor: hexToRgba(winnerColor, 0.5),
                                    color: winnerColor.toLowerCase() === '#10b981' ? '#6ee7b7' : '#ffffff',
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border inline-flex items-center gap-1 shadow-xs"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: winnerColor }} />
                                  Titular
                                </span>
                              ) : isSuplente1 ? (
                                <span
                                  style={{
                                    backgroundColor: hexToRgba(suplenteColor, 0.2),
                                    borderColor: hexToRgba(suplenteColor, 0.5),
                                    color: '#93c5fd',
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border inline-flex items-center gap-1 shadow-xs"
                                >
                                  {s2Count > 0 ? '1º Supl.' : 'Suplente'}
                                </span>
                              ) : isSuplente2 ? (
                                <span
                                  style={{
                                    backgroundColor: hexToRgba(suplente2Color, 0.2),
                                    borderColor: hexToRgba(suplente2Color, 0.5),
                                    color: '#cbd5e1',
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border inline-flex items-center gap-1 shadow-xs"
                                >
                                  2º Supl.
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-slate-600 px-2">-</span>
                              )}
                            </div>

                            {/* COLUNA 4: ÁREA DA BARRA DE PROGRESSÃO (O 100% PARA ANTES DOS VOTOS) */}
                            <div className="flex-1 relative h-6 sm:h-7 mx-1.5 min-w-[80px] bg-black/40 rounded border border-white/[0.08] overflow-hidden flex items-center shadow-inner">
                              {/* Barra de Progresso Fluída, Suave e sem Solavancos */}
                              {votes > 0 ? (
                                <motion.div
                                  initial={false}
                                  animate={{ width: `${barWidth}%` }}
                                  transition={{
                                    duration: 0.85,
                                    ease: [0.16, 1, 0.3, 1],
                                  }}
                                  className="absolute left-0 top-0 bottom-0 pointer-events-none rounded-l overflow-visible z-10 will-change-[width] flex items-center justify-end"
                                  style={{
                                    background: `linear-gradient(90deg, ${hexToRgba(activeColor, 0.20)} 0%, ${hexToRgba(activeColor, 0.38)} 60%, ${hexToRgba(activeColor, 0.58)} 100%)`,
                                    backdropFilter: 'blur(8px)',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.45)',
                                    borderBottom: `1px solid ${hexToRgba(activeColor, 0.3)}`,
                                    boxShadow: `inset 0 1px 2px rgba(255, 255, 255, 0.6), 0 0 10px ${hexToRgba(activeColor, 0.35)}`,
                                  }}
                                >
                                  {/* Brilho especular superior do vidro */}
                                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent pointer-events-none" />

                                  {/* % puxada 1 caracter para a esq (mr-[14px]), bold, fonte 15% maior (text-[12px] sm:text-[13px]) + Faixinha laranja */}
                                  <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pointer-events-none z-20 pr-0.5">
                                    <span className="text-[12px] sm:text-[13px] font-mono font-black text-amber-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] mr-[14px] select-none leading-none">
                                      {percent}%
                                    </span>
                                    <div className="absolute -inset-y-1 w-2 sm:w-3 -right-0.5 bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 opacity-85 blur-[1.5px] sm:blur-[3px]" />
                                    <div className="relative w-[2.8px] sm:w-[4.8px] h-full bg-gradient-to-b from-[#fffbe6] via-[#fbbf24] to-[#f59e0b] shadow-[0_0_5px_#fbbf24,0_0_8px_rgba(245,158,11,0.6)] sm:shadow-[0_0_8px_#fbbf24,0_0_14px_rgba(245,158,11,0.9),0_0_2px_#ffffff] rounded-r-xs" />
                                  </div>
                                </motion.div>
                              ) : (
                                <span className="text-[11px] font-mono font-semibold text-slate-500 pl-2">
                                  0%
                                </span>
                              )}
                            </div>

                            {/* LINHA VERTICAL FINAL (MARCANDO O LIMITE 100%) */}
                            <div className="w-[2px] h-5 sm:h-6 bg-white/25 border-r border-white/40 shrink-0 self-center" title="Limite 100%" />

                            {/* COLUNA: VOTOS (Sem badge, só o número 80% maior, sem borda, amarelo e bold) */}
                            <div className="min-w-[52px] text-center shrink-0 ml-1 flex items-center justify-center">
                              <span
                                className={`font-mono font-black text-[22px] select-none leading-none ${
                                  votes > 0 ? 'text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-slate-600'
                                }`}
                              >
                                {votes}
                              </span>
                            </div>
                          </motion.div>
                        </React.Fragment>
                      );
                    })}
                    </LayoutGroup>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="layout-antigo-nomes"
              custom="up"
              variants={morphCurtainVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-3.5 flex-1 flex flex-col min-h-0"
            >
              {/* 1. SEÇÃO DE DIGITAÇÃO / VOZ NO TOPO */}
              <div className="bg-[#141721] border-y border-white/[0.08] border-x-0 rounded-none px-4 sm:px-6 py-4 shadow-lg">
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
                        className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 hover:text-white rounded-lg text-xs font-medium cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Voltar à Evolução da Votação</span>
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
                      ref={namesTextareaRef}
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
                      className="w-full flex-1 min-h-[115px] sm:min-h-[125px] p-3 pr-16 pb-11 bg-[#0b0d13] border border-white/[0.1] focus:border-emerald-500/60 rounded-xl text-slate-100 font-normal text-xs sm:text-sm placeholder-slate-500 outline-none transition shadow-sm resize-none leading-relaxed"
                    />

                    {/* Microfone centralizado verticalmente e 25% maior */}
                    <button
                      type="button"
                      onClick={toggleListening}
                      title={isListening ? 'Parar digitação por voz' : 'Iniciar digitação por voz'}
                      className={`absolute right-3.5 top-1/2 -translate-y-1/2 w-[45px] h-[45px] rounded-full border flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer ${
                        isListening
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-[0_0_16px_rgba(244,63,94,0.4)] animate-pulse'
                          : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                      }`}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
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

              {/* 2. NOMES PARA ESCOLHA (EXIBIDO APENAS QUANDO HÁ NOMES CADASTRADOS) */}
              {session.options.length > 0 && (
                <div className="bg-[#141721] border-y border-white/[0.08] border-x-0 rounded-none px-4 sm:px-6 py-4 shadow-lg flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-slate-200 text-sm tracking-normal flex items-center gap-2">
                      <span>
                        Nomes para escolha (<span className="font-bold text-blue-400">{session.options.length}</span>)
                      </span>
                    </h3>
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
                    </div>
                  </div>

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
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
