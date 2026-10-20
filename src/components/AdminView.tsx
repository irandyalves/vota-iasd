import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Trash2,
  Play,
  StopCircle,
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
  ChevronDown,
} from 'lucide-react';
import type { VotingSession, VotingOption, VotingEventItem } from '../types';
import { saveSession } from '../services/votingService';
import { parseImportFile } from '../utils/fileImporter';
import { openTelaoOnSecondMonitor } from '../utils/screen';

interface AdminViewProps {
  session: VotingSession;
}

export const AdminView: React.FC<AdminViewProps> = ({ session }) => {
  const [activeTab, setActiveTab] = useState<'candidates' | 'control' | 'settings'>('candidates');
  const [isBottomSectionOpen, setIsBottomSectionOpen] = useState<boolean>(true);
  const [isGearOpen, setIsGearOpen] = useState<boolean>(false);
  const [eventNameInput, setEventNameInput] = useState<string>(session.title || 'ESCOLHA DO TESOUREIRO');
  const [isCreatingNewEvent, setIsCreatingNewEvent] = useState<boolean>(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const gearPanelRef = useRef<HTMLDivElement>(null);
  const gearButtonRef = useRef<HTMLButtonElement>(null);
  const eventModalRef = useRef<HTMLDivElement>(null);
  const createEventBtnRef = useRef<HTMLButtonElement>(null);

  // Fecha o painel da engrenagem ou o modalzinho de criar/editar evento ao pressionar ESC ou clicar fora
  useEffect(() => {
    if (!isGearOpen && !isCreatingNewEvent) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreatingNewEvent) {
          setIsCreatingNewEvent(false);
          setEditingEventId(null);
          setEventNameInput(session.title || '');
        } else if (isGearOpen) {
          setIsGearOpen(false);
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isCreatingNewEvent) {
        const clickedEditBtn = target.closest?.('[data-edit-event-btn="true"]');
        if (
          eventModalRef.current &&
          !eventModalRef.current.contains(target) &&
          (!createEventBtnRef.current || !createEventBtnRef.current.contains(target)) &&
          !clickedEditBtn
        ) {
          setIsCreatingNewEvent(false);
          setEditingEventId(null);
          setEventNameInput(session.title || '');
        }
      }
      if (isGearOpen) {
        if (
          gearPanelRef.current &&
          !gearPanelRef.current.contains(target) &&
          gearButtonRef.current &&
          !gearButtonRef.current.contains(target)
        ) {
          setIsGearOpen(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isGearOpen, isCreatingNewEvent, session.title]);

  // Garante lista de eventos (inicializando com o evento atual caso ainda não exista)
  const eventsList: VotingEventItem[] =
    Array.isArray(session.events) && session.events.length > 0
      ? session.events
      : [
          {
            id: session.activeEventId || 'evt_principal',
            name: session.title || 'ESCOLHA DO TESOUREIRO',
            options: session.options || [],
            vacancies: session.vacancies || 6,
            maxVotesPerVoter: session.maxVotesPerVoter || 6,
            suplentesCount: session.suplentesCount ?? 2,
            segundoSuplentesCount: session.segundoSuplentesCount ?? 0,
            habilitarSuplente1: session.habilitarSuplente1 ?? true,
            habilitarSuplente2: session.habilitarSuplente2 ?? false,
          },
        ];
  const currentActiveEventId = session.activeEventId || eventsList[0].id;

  useEffect(() => {
    setEventNameInput(session.title || '');
  }, [session.title, session.activeEventId]);

  // Selecionar um evento ao clicar no botão do evento no cabeçalho -> abre a parte de baixo (Print 2)
  const handleSelectEventButton = (evt: VotingEventItem) => {
    if (evt.id === currentActiveEventId && activeTab === 'candidates') {
      // Se já está selecionado na aba de nomes, alterna abrir/fechar a parte de baixo ou garante aberto
      setIsBottomSectionOpen((prev) => !prev);
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
      events: updatedEvents,
    });

    setActiveTab('candidates');
    setIsBottomSectionOpen(true);
    showNotification('success', `Evento "${evt.name}" aberto!`);
  };

  // Criar um novo evento com nome
  const handleCreateEvent = (customName?: string) => {
    const cleaned = (customName ?? eventNameInput).trim().toUpperCase();
    if (!cleaned) {
      showNotification('error', 'Digite o nome do evento (ex: Escolha do Tesoureiro).');
      return;
    }

    const newEvtId = 'evt_' + Date.now();
    const newEvt: VotingEventItem = {
      id: newEvtId,
      name: cleaned,
      options: [],
      vacancies: session.vacancies || 1,
      maxVotesPerVoter: session.vacancies || 1,
      suplentesCount: session.suplentesCount ?? 2,
      segundoSuplentesCount: session.segundoSuplentesCount ?? 0,
      habilitarSuplente1: session.habilitarSuplente1 ?? true,
      habilitarSuplente2: session.habilitarSuplente2 ?? false,
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
          }
        : item
    );

    saveSession({
      ...session,
      activeEventId: newEvtId,
      title: cleaned,
      options: [],
      status: 'WAITING',
      events: [...syncedCurrentEvents, newEvt],
    });

    setIsCreatingNewEvent(false);
    setActiveTab('candidates');
    setIsBottomSectionOpen(true);
    showNotification('success', `Evento "${cleaned}" criado! Clique nele ou adicione os nomes abaixo.`);
  };

  // Salvar nome no modalzinho (cria novo ou edita existente)
  const handleSaveEventModal = () => {
    const cleaned = eventNameInput.trim().toUpperCase();
    if (!cleaned) {
      showNotification('error', 'Digite o nome da votação/evento.');
      return;
    }

    if (editingEventId) {
      const updatedEvents = eventsList.map((item) =>
        item.id === editingEventId ? { ...item, name: cleaned } : item
      );
      const isEditingActive = editingEventId === currentActiveEventId;
      saveSession({
        ...session,
        title: isEditingActive ? cleaned : session.title,
        events: updatedEvents,
      });
      setIsCreatingNewEvent(false);
      setEditingEventId(null);
      showNotification('success', `Evento atualizado para "${cleaned}"!`);
    } else {
      handleCreateEvent(cleaned);
      setEditingEventId(null);
    }
  };

  // Excluir um evento
  const handleDeleteEvent = (evtId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (eventsList.length <= 1) {
      showNotification('error', 'É necessário manter pelo menos 1 evento ativo.');
      return;
    }
    const targetEvt = eventsList.find((x) => x.id === evtId);
    if (!window.confirm(`Deseja excluir o evento "${targetEvt?.name}"?`)) return;

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
      events: remaining,
    });
    showNotification('success', 'Evento removido.');
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

  // Download do Modelo de Exemplo (Compatível com Excel e Bloco de Notas)
  const handleDownloadSampleTemplate = () => {
    const sampleContent =
`Nome / Tema / Brinde,Subtítulo / Descrição,Foto URL
Carlos Eduardo Silva,Ministério Diaconal,
Marcos Vinícius Santos,Sonoplastia e Mídia,
Débora Rodrigues Lima,Líder de Pequenos Grupos,
Tema 1: Conectados com Deus,Acampamento de Jovens 2026,
Tema 2: Servir com Propósito,Semana de Oração,
Bíblia de Estudo Luxo,Brinde de Boas-Vindas 01,
Kit Lição da Escola Sabatina,Brinde de Boas-Vindas 02,`;

    const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_vota_iasd.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showNotification('success', 'Modelo de exemplo (.CSV compatível com Excel) baixado!');
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

  // Disparo: "VOTAR AGORA / INICIAR VOTAÇÃO"
  const handleStartVoting = () => {
    // Ao iniciar nova votação, zera a apuração e ordena alfabeticamente mantendo os nomes cadastrados
    const freshOptions = [...session.options]
      .map((o) => ({ ...o, votesCount: 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    const nextIteration = (session.votingIteration || 1) + 1;

    saveSession({
      ...session,
      status: 'VOTING',
      options: freshOptions,
      tieBreak: undefined,
      telaoMode: 'voting',
      votingIteration: nextIteration,
    });
    showNotification('success', 'Votação iniciada! Telão em tempo real e celulares liberados.');
  };

  // Disparo: "ENCERRAR VOTAÇÃO"
  const handleCloseVoting = () => {
    saveSession({
      ...session,
      status: 'CLOSED',
    });
    showNotification('success', 'Votação encerrada! Resultados consolidados no telão.');
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

      {/* BARRA DE EVENTOS (+10% DE ALTURA): BLOCO AMARELO VERTICAL ESQUERDO, BOTÃO "+ CRIAR VOTAÇÃO" CENTRALIZADO VERTICALMENTE COM MODALZINHO SUAVE, E EVENTOS À DIREITA (+20% MAIS ALTOS COM BOTÃO EDITAR) */}
      <div className="-mx-3 sm:-mx-4 lg:-mx-5 bg-[#001f47] border-y-2 border-blue-800 shadow-xl mb-3 flex items-stretch justify-between min-h-[71px] relative z-30">
        {/* LADO ESQUERDO: AMARELO DE CIMA EMBAIXO ONDE ESTÁ "EVENTOS" */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('candidates');
            setIsBottomSectionOpen(true);
          }}
          className="bg-amber-500 hover:bg-amber-400 text-blue-950 font-black text-xs sm:text-sm uppercase tracking-wider px-5 sm:px-6 flex items-center justify-center shrink-0 border-r-2 border-amber-300 transition cursor-pointer select-none"
          title="Mostrar seção de nomes do evento"
        >
          EVENTOS
        </button>

        {/* LADO DIREITO AZUL: BOTÃO "+ CRIAR VOTAÇÃO" CENTRALIZADO VERTICALMENTE + EVENTOS À DIREITA (+20% MAIS ALTOS) + ENGRENAGEM */}
        <div className="flex-1 min-w-0 flex items-center justify-between pl-3 sm:pl-4 pr-4 sm:pr-6 lg:pr-8 py-2.5 gap-3">
          {/* LINHA CENTRALIZADA VERTICALMENTE: "+ CRIAR VOTAÇÃO" À ESQUERDA E EVENTOS CRIADOS À DIREITA */}
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            {/* CONTAINER RELATIVO DO BOTÃO "+ CRIAR VOTAÇÃO" E DO MODALZINHO QUE REVELA PARA BAIXO */}
            <div className="relative flex items-center shrink-0">
              <button
                ref={createEventBtnRef}
                type="button"
                onClick={() => {
                  if (isCreatingNewEvent && !editingEventId) {
                    setIsCreatingNewEvent(false);
                    setEditingEventId(null);
                  } else {
                    setEditingEventId(null);
                    setEventNameInput('');
                    setIsCreatingNewEvent(true);
                  }
                }}
                title="Criar nova votação / evento"
                className="px-3 py-1.5 rounded-[4px] bg-blue-600/35 hover:bg-blue-600/55 border border-blue-400 hover:border-amber-400 text-blue-100 hover:text-amber-300 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
              >
                <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>+ Criar Votação</span>
              </button>

              {/* MODALZINHO DE CRIAR VOTAÇÃO (EMBAIXO DO BOTÃO + CRIAR VOTAÇÃO) */}
              <AnimatePresence>
                {isCreatingNewEvent && !editingEventId && (
                  <motion.div
                    ref={eventModalRef}
                    initial={{ opacity: 0, height: 0, y: -8, scaleY: 0.92 }}
                    animate={{ opacity: 1, height: 'auto', y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, height: 0, y: -8, scaleY: 0.92 }}
                    transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                    style={{ transformOrigin: 'top left' }}
                    className="absolute top-full left-0 mt-2 z-50 overflow-hidden"
                  >
                    <div className="bg-[#001f47] border-2 border-emerald-400 rounded-xl px-3.5 py-3.5 shadow-[0_0_20px_rgba(52,211,153,0.55),0_14px_34px_rgba(0,0,0,0.85)] w-72 sm:w-80">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          placeholder="DIGITE O NOME DO EVENTO..."
                          value={eventNameInput}
                          onChange={(e) => setEventNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveEventModal();
                            }
                          }}
                          className="flex-1 min-w-0 px-3 py-2 bg-[#07132a] border-0 rounded-lg text-xs font-black text-white uppercase outline-none placeholder-slate-500 shadow-inner"
                        />
                        <button
                          type="button"
                          onClick={handleSaveEventModal}
                          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-blue-950 font-black text-[11px] rounded-lg uppercase tracking-wider cursor-pointer active:scale-95 transition shadow shrink-0"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* À DIREITA DO BOTÃO "+ CRIAR VOTAÇÃO": EVENTOS CRIADOS (20% MAIS ALTOS + BOTÃO EDITAR COM MODALZINHO NO LÁPIS) */}
            {eventsList.map((evt) => {
              const isSelected = evt.id === currentActiveEventId;
              const count = isSelected ? session.options.length : (evt.options?.length || 0);
              const displayName = isSelected ? (session.title || evt.name) : evt.name;
              const isEditingThisEvt = isCreatingNewEvent && editingEventId === evt.id;
              return (
                <div key={evt.id} className="relative flex items-center">
                  <div
                    onClick={() => handleSelectEventButton(evt)}
                    title="Clique para abrir/recolher os nomes deste evento"
                    className={`group px-2.5 py-1.5 rounded-[4px] font-black text-[10.5px] uppercase tracking-wider flex items-center gap-1.5 transition-all duration-150 cursor-pointer active:scale-95 select-none border shadow-sm ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-500/25 to-blue-900/80 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.2)]'
                        : 'bg-[#07132a]/90 hover:bg-[#0c1f44] border-blue-700/80 text-slate-200 hover:border-amber-400/60'
                    }`}
                  >
                    <span>{displayName}</span>
                    <span className="px-1.5 py-0.2 rounded-[3px] bg-[#07132a] border border-blue-700 text-[10px] font-mono text-white">
                      {count}
                    </span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${
                        isSelected && activeTab === 'candidates' && isBottomSectionOpen ? 'rotate-180 text-amber-400' : 'opacity-60'
                      }`}
                    />
                    {/* Botão Editar Nome do Evento (abre o modalzinho exatamente embaixo deste evento/lápis) */}
                    <button
                      type="button"
                      data-edit-event-btn="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditingThisEvt) {
                          setIsCreatingNewEvent(false);
                          setEditingEventId(null);
                        } else {
                          setEditingEventId(evt.id);
                          setEventNameInput(displayName);
                          setIsCreatingNewEvent(true);
                        }
                      }}
                      title="Editar nome deste evento"
                      className="p-0.5 text-slate-400 hover:text-amber-300 transition cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {eventsList.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteEvent(evt.id, e)}
                        title="Excluir este evento"
                        className="p-0.5 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* MODALZINHO POSICIONADO ONDE FOI CLICADO NO LÁPIS DESTE EVENTO */}
                  <AnimatePresence>
                    {isEditingThisEvt && (
                      <motion.div
                        ref={eventModalRef}
                        initial={{ opacity: 0, height: 0, y: -8, scaleY: 0.92 }}
                        animate={{ opacity: 1, height: 'auto', y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, height: 0, y: -8, scaleY: 0.92 }}
                        transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                        style={{ transformOrigin: 'top left' }}
                        className="absolute top-full left-0 mt-2 z-50 overflow-hidden"
                      >
                        <div className="bg-[#001f47] border-2 border-emerald-400 rounded-xl px-3.5 py-3.5 shadow-[0_0_20px_rgba(52,211,153,0.55),0_14px_34px_rgba(0,0,0,0.85)] w-72 sm:w-80">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              autoFocus
                              placeholder="DIGITE O NOME DO EVENTO..."
                              value={eventNameInput}
                              onChange={(e) => setEventNameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveEventModal();
                                }
                              }}
                              className="flex-1 min-w-0 px-3 py-2 bg-[#07132a] border-0 rounded-lg text-xs font-black text-white uppercase outline-none placeholder-slate-500 shadow-inner"
                            />
                            <button
                              type="button"
                              onClick={handleSaveEventModal}
                              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-blue-950 font-black text-[11px] rounded-lg uppercase tracking-wider cursor-pointer active:scale-95 transition shadow shrink-0"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
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
                const height = layout.cardHeight ?? 38;
                const gap = layout.cardGap ?? 8;
                const winnerColor = layout.winnerColor || '#10b981';
                const suplenteColor = layout.suplenteColor || '#3b82f6';
                const suplente2Color = layout.suplente2Color || '#64748b';
                const unclassifiedColor = layout.unclassifiedColor || '#1e293b';

                const updateLayout = (patch: Partial<typeof layout>) => {
                  saveSession({
                    ...session,
                    telaoLayout: {
                      columns: cols,
                      cardHeight: height,
                      cardGap: gap,
                      winnerColor,
                      suplenteColor,
                      suplente2Color,
                      unclassifiedColor,
                      ...patch,
                    },
                  });
                };

                return (
                  <div className="bg-[#001f47] border border-blue-800 rounded-xl p-2.5 shadow-md space-y-2">
                    {/* Cabeçalho Compacto (Sem os botões Mudar Layout e Restaurar Padrão) */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-blue-900/80">
                      <div className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-amber-400" />
                        <h3 className="font-bold text-white text-xs sm:text-sm font-sans tracking-tight">
                          Layout e Cores dos Cards no Painel (Telão)
                        </h3>
                      </div>
                      <span className="text-[10px] text-blue-300/80">
                        ESC ou clique fora para recolher
                      </span>
                    </div>

                    {/* LINHA 1 COMPACTA: COLUNAS (1 OU 2), ALTURA DOS CARDS E ESPAÇO ENTRE ELES */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {/* 1. QUANTIDADE DE COLUNAS */}
                      <div className="bg-[#07132a]/90 border border-blue-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-black text-white uppercase tracking-wide shrink-0">
                          Colunas:
                        </span>

                        <div className="grid grid-cols-2 gap-1.5 flex-1 max-w-[210px]">
                          <button
                            type="button"
                            onClick={() => updateLayout({ columns: 1 })}
                            className={`py-1 px-2 rounded-md font-black text-[10px] uppercase tracking-wider border transition cursor-pointer active:scale-95 flex items-center justify-center gap-1 ${
                              cols === 1
                                ? 'bg-amber-500 text-blue-950 border-amber-300 shadow'
                                : 'bg-[#001f47] text-slate-300 border-blue-800 hover:border-blue-600'
                            }`}
                          >
                            <div className="w-3.5 flex flex-col gap-0.5">
                              <span className="h-1 w-full rounded-sm bg-current opacity-85" />
                              <span className="h-1 w-full rounded-sm bg-current opacity-85" />
                            </div>
                            <span>1 Col</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => updateLayout({ columns: 2 })}
                            className={`py-1 px-2 rounded-md font-black text-[10px] uppercase tracking-wider border transition cursor-pointer active:scale-95 flex items-center justify-center gap-1 ${
                              cols === 2
                                ? 'bg-amber-500 text-blue-950 border-amber-300 shadow'
                                : 'bg-[#001f47] text-slate-300 border-blue-800 hover:border-blue-600'
                            }`}
                          >
                            <div className="w-3.5 grid grid-cols-2 gap-0.5">
                              <span className="h-1 w-full rounded-sm bg-current opacity-85" />
                              <span className="h-1 w-full rounded-sm bg-current opacity-85" />
                              <span className="h-1 w-full rounded-sm bg-current opacity-85" />
                              <span className="h-1 w-full rounded-sm bg-current opacity-85" />
                            </div>
                            <span>2 Cols</span>
                          </button>
                        </div>
                      </div>

                      {/* 2. ALTURA DOS CARDS */}
                      <div className="bg-[#07132a]/90 border border-blue-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-black text-white uppercase tracking-wide shrink-0">
                          Altura:
                        </span>

                        <div className="flex items-center gap-1.5 flex-1">
                          <button
                            type="button"
                            onClick={() => updateLayout({ cardHeight: Math.max(26, height - 4) })}
                            className="w-6 h-6 rounded bg-[#001f47] hover:bg-blue-900 border border-blue-600 text-amber-300 font-black text-xs flex items-center justify-center cursor-pointer active:scale-90 shrink-0"
                          >
                            -
                          </button>
                          <input
                            type="range"
                            min={26}
                            max={76}
                            value={height}
                            onChange={(e) => updateLayout({ cardHeight: Number(e.target.value) })}
                            className="flex-1 h-1.5 bg-blue-950 rounded-lg appearance-none cursor-pointer accent-amber-400 border border-blue-800"
                          />
                          <button
                            type="button"
                            onClick={() => updateLayout({ cardHeight: Math.min(76, height + 4) })}
                            className="w-6 h-6 rounded bg-[#001f47] hover:bg-blue-900 border border-blue-600 text-amber-300 font-black text-xs flex items-center justify-center cursor-pointer active:scale-90 shrink-0"
                          >
                            +
                          </button>
                        </div>

                        <span className="px-1.5 py-0.5 rounded bg-[#001f47] border border-amber-400/60 text-amber-300 font-mono font-black text-[10px] shrink-0">
                          {height}px
                        </span>
                      </div>

                      {/* 3. ESPAÇO ENTRE OS CARDS */}
                      <div className="bg-[#07132a]/90 border border-blue-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-black text-white uppercase tracking-wide shrink-0">
                          Espaço:
                        </span>

                        <div className="flex items-center gap-1.5 flex-1">
                          <button
                            type="button"
                            onClick={() => updateLayout({ cardGap: Math.max(2, gap - 2) })}
                            className="w-6 h-6 rounded bg-[#001f47] hover:bg-blue-900 border border-blue-600 text-amber-300 font-black text-xs flex items-center justify-center cursor-pointer active:scale-90 shrink-0"
                          >
                            -
                          </button>
                          <input
                            type="range"
                            min={2}
                            max={28}
                            value={gap}
                            onChange={(e) => updateLayout({ cardGap: Number(e.target.value) })}
                            className="flex-1 h-1.5 bg-blue-950 rounded-lg appearance-none cursor-pointer accent-amber-400 border border-blue-800"
                          />
                          <button
                            type="button"
                            onClick={() => updateLayout({ cardGap: Math.min(28, gap + 2) })}
                            className="w-6 h-6 rounded bg-[#001f47] hover:bg-blue-900 border border-blue-600 text-amber-300 font-black text-xs flex items-center justify-center cursor-pointer active:scale-90 shrink-0"
                          >
                            +
                          </button>
                        </div>

                        <span className="px-1.5 py-0.5 rounded bg-[#001f47] border border-amber-400/60 text-amber-300 font-mono font-black text-[10px] shrink-0">
                          {gap}px
                        </span>
                      </div>
                    </div>

                    {/* LINHA 2 COMPACTA: CORES DOS CARDS (BOLINHAS 50% MENORES) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {/* COR VENCEDORES / TITULARES */}
                      <div className="bg-[#07132a]/90 border border-blue-800/80 rounded-lg px-2.5 py-1.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-white uppercase tracking-wide">
                            Cor: Vencedores
                          </span>
                          <input
                            type="color"
                            value={winnerColor}
                            onChange={(e) => updateLayout({ winnerColor: e.target.value })}
                            className="w-5 h-4 rounded cursor-pointer bg-transparent border border-white/30"
                            title="Escolher cor personalizada para os Vencedores (Titulares)"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {['#10b981', '#059669', '#22c55e', '#eab308', '#3b82f6', '#8b5cf6', '#06b6d4', '#f43f5e'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => updateLayout({ winnerColor: preset })}
                              style={{ backgroundColor: preset }}
                              className={`w-3.5 h-3.5 rounded-full cursor-pointer transition transform active:scale-90 ${
                                winnerColor.toLowerCase() === preset ? 'ring-1 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                              }`}
                              title={`Cor ${preset}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* COR 1º SUPLENTES */}
                      <div className="bg-[#07132a]/90 border border-blue-800/80 rounded-lg px-2.5 py-1.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-white uppercase tracking-wide">
                            Cor: 1º Suplentes
                          </span>
                          <input
                            type="color"
                            value={suplenteColor}
                            onChange={(e) => updateLayout({ suplenteColor: e.target.value })}
                            className="w-5 h-4 rounded cursor-pointer bg-transparent border border-white/30"
                            title="Escolher cor personalizada para 1º Suplentes"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {['#3b82f6', '#2563eb', '#06b6d4', '#6366f1', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => updateLayout({ suplenteColor: preset })}
                              style={{ backgroundColor: preset }}
                              className={`w-3.5 h-3.5 rounded-full cursor-pointer transition transform active:scale-90 ${
                                suplenteColor.toLowerCase() === preset ? 'ring-1 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                              }`}
                              title={`Cor ${preset}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* COR 2º SUPLENTES */}
                      <div className="bg-[#07132a]/90 border border-blue-800/80 rounded-lg px-2.5 py-1.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-white uppercase tracking-wide">
                            Cor: 2º Suplentes
                          </span>
                          <input
                            type="color"
                            value={suplente2Color}
                            onChange={(e) => updateLayout({ suplente2Color: e.target.value })}
                            className="w-5 h-4 rounded cursor-pointer bg-transparent border border-white/30"
                            title="Escolher cor personalizada para 2º Suplentes"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {['#64748b', '#475569', '#0d9488', '#d97706', '#7c3aed', '#0284c7', '#9333ea', '#e11d48'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => updateLayout({ suplente2Color: preset })}
                              style={{ backgroundColor: preset }}
                              className={`w-3.5 h-3.5 rounded-full cursor-pointer transition transform active:scale-90 ${
                                suplente2Color.toLowerCase() === preset ? 'ring-1 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                              }`}
                              title={`Cor ${preset}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* COR NÃO CLASSIFICADOS */}
                      <div className="bg-[#07132a]/90 border border-blue-800/80 rounded-lg px-2.5 py-1.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-white uppercase tracking-wide">
                            Cor: Não Classif.
                          </span>
                          <input
                            type="color"
                            value={unclassifiedColor}
                            onChange={(e) => updateLayout({ unclassifiedColor: e.target.value })}
                            className="w-5 h-4 rounded cursor-pointer bg-transparent border border-white/30"
                            title="Escolher cor personalizada para Não Classificados"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {['#1e293b', '#0f172a', '#334155', '#1f2937', '#1e1b4b', '#172554', '#27272a', '#3f3f46'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => updateLayout({ unclassifiedColor: preset })}
                              style={{ backgroundColor: preset }}
                              className={`w-3.5 h-3.5 rounded-full cursor-pointer transition transform active:scale-90 ${
                                unclassifiedColor.toLowerCase() === preset ? 'ring-1 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                              }`}
                              title={`Cor ${preset}`}
                            />
                          ))}
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

                  {/* SEÇÃO IMPORTAR DADOS (SEM FUNDO PRETO E SEM ÍCONE ANTES DE IMPORTAR DADOS) */}
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
                    className="flex flex-wrap items-center gap-1.5 py-1"
                  >
                    <span className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wider flex items-center pr-2 mr-0.5 border-r border-blue-800">
                      <span>Importar dados:</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => fileUploadAppendRef.current?.click()}
                      className="px-2.5 py-1 bg-transparent hover:bg-emerald-500/15 border border-emerald-500/80 text-emerald-400 hover:text-emerald-300 rounded-lg text-[11px] font-bold transition-all duration-150 flex items-center gap-1 cursor-pointer active:scale-90 active:bg-emerald-500/30 shadow-sm"
                      title="Importar de arquivo Excel (.xlsx, .xls)"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Excel (.xlsx)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileUploadAppendRef.current?.click()}
                      className="px-2.5 py-1 bg-transparent hover:bg-blue-500/15 border border-blue-500/80 text-blue-400 hover:text-blue-300 rounded-lg text-[11px] font-bold transition-all duration-150 flex items-center gap-1 cursor-pointer active:scale-90 active:bg-blue-500/30 shadow-sm"
                      title="Importar de arquivo CSV"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileUploadAppendRef.current?.click()}
                      className="px-2.5 py-1 bg-transparent hover:bg-slate-400/15 border border-slate-500/80 text-slate-300 hover:text-white rounded-lg text-[11px] font-bold transition-all duration-150 flex items-center gap-1 cursor-pointer active:scale-90 active:bg-slate-500/30 shadow-sm"
                      title="Importar de arquivo TXT"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>TXT</span>
                    </button>

                    {/* Arrastar e Soltar */}
                    <div
                      onClick={() => fileUploadAppendRef.current?.click()}
                      className="px-2.5 py-1 bg-[#001f47]/70 hover:bg-[#0c1f44] border border-dashed border-blue-500 hover:border-amber-400 rounded-lg text-[10px] text-blue-200 hover:text-amber-300 font-semibold transition cursor-pointer flex items-center gap-1"
                      title="Arraste qualquer arquivo e solte aqui"
                    >
                      <Upload className="w-3 h-3 text-amber-400" />
                      <span>ou arraste o arquivo aqui</span>
                    </div>

                    {/* Baixar Modelo */}
                    <button
                      type="button"
                      onClick={handleDownloadSampleTemplate}
                      className="px-2 py-1 text-blue-300/80 hover:text-white rounded-lg text-[10px] font-semibold transition flex items-center gap-0.5 cursor-pointer"
                      title="Baixar arquivo modelo de exemplo"
                    >
                      <Download className="w-3 h-3" />
                      <span>Modelo (.csv)</span>
                    </button>
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

              {/* SEÇÃO DA DIREITA: SEM BORDINHA EXTERNA, BOTÕES 25% MENORES, E SEM BOLD EM MOSTRAR TELÃO E QR.CODE TELÃO */}
              <div className="flex flex-col gap-2 shrink-0 w-full lg:w-48 justify-between">
                {/* 1. Botão NOVA VOTAÇÃO (EM VERDE) */}
                <button
                  type="button"
                  onClick={handleStartVoting}
                  className="flex-1 min-h-[30px] px-2.5 py-1.5 bg-emerald-600/50 hover:bg-emerald-600/70 border-2 border-emerald-400 text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.3)] hover:shadow-[0_0_16px_rgba(52,211,153,0.5)] font-black text-[9.5px] rounded-lg transition-all duration-150 active:scale-95 active:bg-emerald-600/90 cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider"
                  title="Iniciar Nova Votação mantendo os nomes em ordem A-Z"
                >
                  <Play className="w-3 h-3 shrink-0 fill-current" />
                  <span>NOVA VOTAÇÃO</span>
                </button>

                {/* 2. Botão ENCERRAR VOTAÇÃO (EM VERMELHO) */}
                <button
                  type="button"
                  onClick={handleCloseVoting}
                  className="flex-1 min-h-[30px] px-2.5 py-1.5 bg-rose-600/50 hover:bg-rose-600/70 border-2 border-rose-400 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.3)] hover:shadow-[0_0_16px_rgba(244,63,94,0.5)] font-black text-[9.5px] rounded-lg transition-all duration-150 active:scale-95 active:bg-rose-600/90 cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider"
                  title="Encerrar Votação e consolidar resultados no Telão"
                >
                  <StopCircle className="w-3 h-3 shrink-0" />
                  <span>ENCERRAR VOTAÇÃO</span>
                </button>

                {/* 3. Botão MOSTRAR NO TELÃO (SEM BOLD) */}
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = session.telaoMode === 'names' ? 'voting' : 'names';
                    saveSession({ ...session, telaoMode: nextMode });
                    openTelaoOnSecondMonitor();
                    showNotification(
                      'success',
                      nextMode === 'names'
                        ? 'Exibindo Nomes para Escolha no Telão!'
                        : 'Exibindo Votação/Resultados no Telão!'
                    );
                  }}
                  className={`flex-1 min-h-[30px] px-2.5 py-1.5 border-2 rounded-lg transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider font-normal text-[9.5px] ${
                    session.telaoMode === 'names'
                      ? 'bg-amber-500/50 hover:bg-amber-500/70 border-amber-300 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                      : 'bg-blue-600/50 hover:bg-blue-600/70 border-blue-400 text-blue-100 shadow-[0_0_12px_rgba(96,165,250,0.3)] hover:shadow-[0_0_16px_rgba(96,165,250,0.5)]'
                  }`}
                  title="Abrir o Telão e alternar exibição dos Nomes para Escolha"
                >
                  <Tv className="w-3 h-3 shrink-0" />
                  <span>
                    {session.telaoMode === 'names' ? 'NOMES NO TELÃO (ATIVO)' : 'MOSTRAR NO TELÃO'}
                  </span>
                </button>

                {/* 4. Botão EXIBIR QR.CODE NO TELÃO (SEM BOLD) */}
                <button
                  type="button"
                  onClick={() => {
                    saveSession({
                      ...session,
                      showQrOnTelao: session.showQrOnTelao === false ? true : false,
                    });
                  }}
                  title="Mostrar ou ocultar o QR Code no Telão"
                  className={`flex-1 min-h-[30px] px-2.5 py-1.5 border-2 rounded-lg transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider font-normal text-[9.5px] ${
                    session.showQrOnTelao !== false
                      ? 'bg-amber-500/25 hover:bg-amber-400/35 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                      : 'bg-[#1e293b]/80 hover:bg-amber-500/20 border-amber-400/80 text-amber-300'
                  }`}
                >
                  <QrCode className="w-3 h-3 shrink-0" />
                  <span>EXIBIR QR.CODE NO TELÃO</span>
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
                          if (window.confirm('Atenção: deseja realmente limpar todos os nomes cadastrados?')) {
                            setBackupNamesList(session.options.map((o) => o.name));
                            saveSession({ ...session, options: [] });
                            showNotification('success', 'Todos os nomes foram apagados.');
                          }
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
