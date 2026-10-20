import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Plus,
  Trash2,
  Play,
  StopCircle,
  RotateCcw,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  Flame,
  FileSpreadsheet,
  FileText,
  Pause,
  QrCode,
  Tv,
  Sliders,
  ArrowDownAZ,
} from 'lucide-react';
import type { VotingSession, VotingOption } from '../types';
import { saveSession } from '../services/votingService';
import { parseImportFile } from '../utils/fileImporter';
import { openTelaoOnSecondMonitor } from '../utils/screen';
import { detectVotingTies, getEffectiveSuplentes } from '../utils/tieDetection';

interface AdminViewProps {
  session: VotingSession;
}

export const AdminView: React.FC<AdminViewProps> = ({ session }) => {
  const [activeTab, setActiveTab] = useState<'candidates' | 'control' | 'settings'>('candidates');
  const [isListening, setIsListening] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [newName, setNewName] = useState('');
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editingCandidateName, setEditingCandidateName] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados de Desempate
  const [selectedTieCandidateIds, setSelectedTieCandidateIds] = useState<string[]>([]);
  const [tieVacancies, setTieVacancies] = useState(1);

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

      if (mode === 'replace') {
        saveSession({
          ...session,
          options: result.options,
        });
        showNotification('success', `Lista substituída por ${result.count} itens de "${result.fileName}"!`);
      } else {
        saveSession({
          ...session,
          options: [...session.options, ...result.options],
        });
        showNotification('success', `Adicionados ${result.count} novos itens de "${result.fileName}"!`);
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

    const newOptions: VotingOption[] = rawNames.map((name, idx) => ({
      id: 'opt_' + Date.now() + '_' + idx,
      name: name.toUpperCase(),
      votesCount: 0,
    }));

    const updated = {
      ...session,
      options: [...session.options, ...newOptions],
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

  // Disparo: "PAUSAR / SALA DE ESPERA"
  const handlePauseVoting = () => {
    saveSession({
      ...session,
      status: 'WAITING',
    });
    showNotification('success', 'Votação colocada em espera.');
  };

  // Disparo: "ENCERRAR VOTAÇÃO"
  const handleCloseVoting = () => {
    saveSession({
      ...session,
      status: 'CLOSED',
    });
    showNotification('success', 'Votação encerrada! Resultados consolidados no telão.');
  };

  // Zerar Votos e Reiniciar Votação mantendo os MESMOS nomes cadastrados
  const handleResetVotes = () => {
    if (
      window.confirm(
        'Deseja zerar os votos e reiniciar a votação? Todos os nomes atualmente cadastrados serão mantidos!'
      )
    ) {
      // Preserva a lista de nomes cadastrados, zerando a apuração e ordenando alfabeticamente
      const resetOptions = [...session.options]
        .map((o) => ({ ...o, votesCount: 0 }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
      const nextIteration = (session.votingIteration || 1) + 1;
      saveSession({
        ...session,
        status: 'WAITING',
        options: resetOptions,
        tieBreak: undefined,
        votingIteration: nextIteration,
      });

      // Limpa APENAS as travas locais de voto ('voted_*'), PRESERVANDO a sessão e todos os nomes!
      try {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('voted_')) {
            localStorage.removeItem(key);
          }
        });
      } catch (_) {}

      showNotification('success', 'Votação reiniciada! Nomes mantidos e votos zerados.');
    }
  };

  // Adicionar Candidato(s) por Texto ou Voz em Tempo Real (Maiúsculo)
  const handleAddCandidateName = (rawText: string) => {
    if (!rawText.trim()) return;
    const names = rawText
      .split(/,|\n/)
      .map((n) => n.trim().toUpperCase())
      .filter((n) => n.length > 0);

    if (names.length === 0) return;

    const newOptions: VotingOption[] = names.map((name, idx) => ({
      id: 'opt_' + Date.now() + '_' + idx,
      name,
      votesCount: 0,
    }));

    saveSession({
      ...session,
      options: [...session.options, ...newOptions],
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
    const updated = session.options.map((opt) =>
      opt.id === id ? { ...opt, name: trimmed } : opt
    );
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

  // Iniciar Rodada de Desempate
  const handleStartTieBreak = () => {
    if (selectedTieCandidateIds.length < 2) {
      showNotification('error', 'Selecione pelo menos 2 candidatos empatados.');
      return;
    }

    const tieOptions = session.options
      .filter((o) => selectedTieCandidateIds.includes(o.id))
      .map((o) => ({ ...o, votesCount: 0 }));

    const nextIteration = (session.votingIteration || 1) + 1;

    saveSession({
      ...session,
      status: 'TIE_BREAK',
      votingIteration: nextIteration,
      telaoMode: 'voting',
      tieBreak: {
        active: true,
        title: `Desempate: ${tieVacancies} ${tieVacancies === 1 ? 'Vaga' : 'Vagas'}`,
        vacancies: tieVacancies,
        maxVotesPerVoter: tieVacancies,
        options: tieOptions,
      },
    });

    showNotification('success', 'Rodada de desempate iniciada nos celulares!');
  };

  // Cancelar Desempate
  const handleCancelTieBreak = () => {
    saveSession({
      ...session,
      status: 'VOTING',
      tieBreak: undefined,
    });
    showNotification('success', 'Rodada de desempate finalizada.');
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

      {/* BANNER DE ALERTA DE EMPATE PARA O LÍDER (SOMENTE PARA ADMIN) */}
      {session.status === 'CLOSED' && detectVotingTies(session).length > 0 && (
        <div className="mb-3.5 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-950/90 to-red-950/90 border-2 border-amber-400 text-white shadow-xl flex flex-wrap items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <h4 className="font-black text-sm sm:text-base text-amber-300 uppercase tracking-wide">
                Atenção: Empate Detectado na Apuração!
              </h4>
              <p className="text-xs text-slate-200">
                Há empate em: <strong className="text-white">{detectVotingTies(session).map((t) => t.label).join(', ')}</strong>.
                Configure e inicie a rodada de desempate abaixo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('control');
              const firstTie = detectVotingTies(session)[0];
              if (firstTie) {
                setSelectedTieCandidateIds(firstTie.tiedCandidates.map((c) => c.id));
                setTieVacancies(firstTie.vacanciesInDispute);
              }
            }}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-blue-950 font-black text-xs uppercase tracking-wider rounded-xl shadow transition cursor-pointer active:scale-95 flex items-center gap-1.5"
          >
            <Flame className="w-4 h-4" />
            Configurar Desempate
          </button>
        </div>
      )}

      {/* BARRA DE ABAS E COMANDOS RÁPIDOS DO ADMIN */}
      <div className="bg-[#001f47] border border-blue-800 rounded-2xl px-4 py-3 shadow-lg mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* ESQUERDA: Abas (Nomes, Configurar Evento, Migração esmaecido) */}
          <div className="inline-flex items-center bg-[#07132a] p-1 rounded-xl border border-blue-900">
            <button
              onClick={() => setActiveTab('candidates')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'candidates' ? 'bg-amber-500 text-blue-950 font-black shadow-md' : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>Nomes ({session.options.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('control')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'control' ? 'bg-blue-600 text-white font-black shadow-md' : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>Configurar Evento</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-slate-700 text-slate-200 font-bold shadow-md'
                  : 'text-slate-500/60 hover:text-slate-300 opacity-60 hover:opacity-90'
              }`}
            >
              <span>Migração</span>
            </button>
          </div>

          {/* DIREITA: Botões Retangulares (PAUSAR VOTAÇÃO, ENCERRAR VOTAÇÃO, EXIBIR QR.CODE NO TELÃO) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={session.status === 'VOTING' ? handlePauseVoting : handleStartVoting}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all duration-150 active:scale-95 cursor-pointer ${
                session.status === 'VOTING'
                  ? 'bg-transparent border-2 border-amber-500 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 active:bg-amber-500/25'
                  : 'bg-transparent border-2 border-emerald-500 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 active:bg-emerald-500/25'
              }`}
            >
              {session.status === 'VOTING' ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>{session.status === 'VOTING' ? 'PAUSAR VOTAÇÃO' : 'INICIAR VOTAÇÃO'}</span>
            </button>

            <button
              onClick={handleCloseVoting}
              disabled={session.status === 'CLOSED'}
              className="px-4 py-2 bg-transparent hover:bg-purple-500/10 border-2 border-purple-500 text-purple-400 hover:text-purple-300 disabled:opacity-40 disabled:pointer-events-none rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow transition-all duration-150 active:scale-95 active:bg-purple-500/25 cursor-pointer"
            >
              <StopCircle className="w-4 h-4 fill-current" />
              <span>ENCERRAR VOTAÇÃO</span>
            </button>

            {/* Botão de Controle do QR Code no Telão */}
            <button
              onClick={() => {
                saveSession({
                  ...session,
                  showQrOnTelao: session.showQrOnTelao === false ? true : false,
                });
              }}
              title="Mostrar ou ocultar o QR Code no Telão"
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow transition-all duration-150 active:scale-95 cursor-pointer ${
                session.showQrOnTelao !== false
                  ? 'bg-amber-500/15 hover:bg-amber-400/25 border-2 border-amber-400 text-amber-300 hover:text-amber-200'
                  : 'bg-transparent hover:bg-slate-500/10 border-2 border-slate-600 text-slate-400 hover:text-slate-300'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>EXIBIR QR.CODE NO TELÃO</span>
            </button>
          </div>
        </div>
      </div>

      {/* ABA 1: CONFIGURAR (VAGAS, SUPLENTES E DESEMPATE) */}
      {activeTab === 'control' && (
        <div className="space-y-3.5">
          {/* PAINEL DE CONFIGURAÇÃO DE VAGAS E SUPLENTES */}
          <div className="bg-[#001f47] border border-blue-800 rounded-2xl p-4 shadow-lg space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-blue-900/80">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white font-sans tracking-tight">
                  Configuração de Vagas & Suplentes
                </h3>
              </div>
              <span className="text-[11px] text-blue-300">
                Digite o número diretamente ou use os botões / slider
              </span>
            </div>

            {/* 3 COLUNAS NA MESMA LINHA: TITULARES, 1º SUPLENTE, 2º SUPLENTE */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
              {/* 1. TITULARES */}
              <div className="bg-[#07132a]/90 border border-emerald-500/50 rounded-2xl p-3.5 flex flex-col justify-between shadow-inner">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">
                      Titulares (Eleitos)
                    </h4>
                  </div>
                  <p className="text-[10px] text-blue-200/80 mb-3">
                    Candidatos que assumirão o cargo
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  {/* Seletor Numérico Centralizado com Input Digitável */}
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const newVac = Math.max(1, session.vacancies - 1);
                        saveSession({ ...session, vacancies: newVac, maxVotesPerVoter: newVac });
                      }}
                      disabled={session.vacancies <= 1}
                      className="w-10 h-10 rounded-xl bg-transparent hover:bg-emerald-500/10 border-2 border-emerald-500/80 disabled:opacity-30 disabled:pointer-events-none text-emerald-400 font-black text-xl flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer shadow-md select-none"
                    >
                      -
                    </button>

                    <div className="min-w-[76px] h-12 bg-[#001f47] border-2 border-emerald-400 focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-400/40 rounded-xl flex flex-col items-center justify-center shadow-lg px-2 transition">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={session.vacancies}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            const safeVal = Math.max(1, Math.min(50, val));
                            saveSession({ ...session, vacancies: safeVal, maxVotesPerVoter: safeVal });
                          }
                        }}
                        className="w-full text-center bg-transparent text-2xl font-black font-mono text-emerald-300 outline-none p-0 leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-text"
                      />
                      <span className="text-[8.5px] font-bold text-emerald-200/90 uppercase pointer-events-none -mt-0.5 select-none">
                        {session.vacancies === 1 ? 'Vaga' : 'Vagas'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const newVac = Math.min(50, session.vacancies + 1);
                        saveSession({ ...session, vacancies: newVac, maxVotesPerVoter: newVac });
                      }}
                      disabled={session.vacancies >= 50}
                      className="w-10 h-10 rounded-xl bg-transparent hover:bg-emerald-500/10 border-2 border-emerald-500/80 disabled:opacity-30 disabled:pointer-events-none text-emerald-400 font-black text-xl flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer shadow-md select-none"
                    >
                      +
                    </button>
                  </div>

                  {/* Slider */}
                  <div className="flex flex-col gap-1 px-1">
                    <div className="flex justify-between text-[10px] font-bold text-blue-200">
                      <span>1 vaga</span>
                      <span className="text-emerald-300 font-mono">
                        Deslize: <strong className="text-white bg-blue-950 px-1 rounded border border-blue-800">{session.vacancies}</strong>
                      </span>
                      <span>20 vagas</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={session.vacancies}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        saveSession({ ...session, vacancies: val, maxVotesPerVoter: val });
                      }}
                      className="w-full h-2.5 bg-blue-950 rounded-lg appearance-none cursor-pointer accent-emerald-400 border border-blue-700"
                    />
                  </div>
                </div>
              </div>

              {/* 2. 1º SUPLENTE */}
              {(() => {
                const { s1Enabled, s2Enabled } = getEffectiveSuplentes(session);
                return (
                  <>
                    <div className={`bg-[#07132a]/90 border rounded-2xl p-3.5 flex flex-col justify-between shadow-inner transition-all ${
                      s1Enabled ? 'border-red-600/50' : 'border-slate-800 opacity-75'
                    }`}>
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s1Enabled ? 'bg-red-400 animate-pulse' : 'bg-slate-600'}`} />
                            <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wide ${s1Enabled ? 'text-white' : 'text-slate-400'}`}>
                              1º Suplente
                            </h4>
                          </div>

                          {/* BOTÃO HABILITAR / DESABILITAR 1º SUPLENTE */}
                          <button
                            type="button"
                            onClick={() => {
                              const nextState = !s1Enabled;
                              if (!nextState) {
                                // Se desabilitado 1º, automaticamente desabilita o 2º!
                                saveSession({
                                  ...session,
                                  habilitarSuplente1: false,
                                  habilitarSuplente2: false,
                                  suplentesCount: 0,
                                  segundoSuplentesCount: 0,
                                });
                                showNotification('success', '1º e 2º Suplentes desabilitados.');
                              } else {
                                saveSession({
                                  ...session,
                                  habilitarSuplente1: true,
                                  suplentesCount: (session.suplentesCount && session.suplentesCount > 0) ? session.suplentesCount : 2,
                                });
                                showNotification('success', '1º Suplente habilitado.');
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-150 cursor-pointer active:scale-95 border shadow-sm ${
                              s1Enabled
                                ? 'bg-red-500/20 text-red-300 border-red-500 hover:bg-red-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {s1Enabled ? '● Habilitado' : '○ Desabilitado'}
                          </button>
                        </div>
                        <p className="text-[10px] text-blue-200/80 mb-3">
                          {s1Enabled ? 'Substitutos imediatos' : 'Desabilitado (não aparecerá no telão)'}
                        </p>
                      </div>

                      <div className={`flex flex-col gap-2.5 transition-opacity ${!s1Enabled ? 'opacity-30 pointer-events-none select-none' : ''}`}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveSession({ ...session, suplentesCount: Math.max(0, (session.suplentesCount || 0) - 1) })}
                            disabled={!s1Enabled || (session.suplentesCount || 0) <= 0}
                            className="w-10 h-10 rounded-xl bg-transparent hover:bg-red-500/10 border-2 border-red-500/80 disabled:opacity-30 disabled:pointer-events-none text-red-400 font-black text-xl flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer shadow-md select-none"
                          >
                            -
                          </button>

                          <div className="min-w-[76px] h-12 bg-[#001f47] border-2 border-red-400 focus-within:border-red-300 focus-within:ring-2 focus-within:ring-red-400/40 rounded-xl flex flex-col items-center justify-center shadow-lg px-2 transition">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              disabled={!s1Enabled}
                              value={s1Enabled ? (session.suplentesCount || 0) : 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) saveSession({ ...session, suplentesCount: Math.max(0, Math.min(20, val)) });
                              }}
                              className="w-full text-center bg-transparent text-2xl font-black font-mono text-red-300 outline-none p-0 leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-text"
                            />
                            <span className="text-[8.5px] font-bold text-red-200/90 uppercase pointer-events-none -mt-0.5 select-none">
                              {(session.suplentesCount || 0) === 1 ? 'Suplente' : 'Suplentes'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => saveSession({ ...session, suplentesCount: Math.min(20, (session.suplentesCount || 0) + 1) })}
                            disabled={!s1Enabled || (session.suplentesCount || 0) >= 20}
                            className="w-10 h-10 rounded-xl bg-transparent hover:bg-red-500/10 border-2 border-red-500/80 disabled:opacity-30 disabled:pointer-events-none text-red-400 font-black text-xl flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer shadow-md select-none"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex flex-col gap-1 px-1">
                          <div className="flex justify-between text-[10px] font-bold text-blue-200">
                            <span>0 suplentes</span>
                            <span className="text-red-300 font-mono">
                              Deslize: <strong className="text-white bg-blue-950 px-1 rounded border border-blue-800">{s1Enabled ? (session.suplentesCount || 0) : 0}</strong>
                            </span>
                            <span>10 suplentes</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={10}
                            disabled={!s1Enabled}
                            value={s1Enabled ? (session.suplentesCount || 0) : 0}
                            onChange={(e) => saveSession({ ...session, suplentesCount: Number(e.target.value) })}
                            className="w-full h-2.5 bg-blue-950 rounded-lg appearance-none cursor-pointer accent-red-400 border border-blue-700"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 3. 2º SUPLENTE */}
                    <div className={`bg-[#07132a]/90 border rounded-2xl p-3.5 flex flex-col justify-between shadow-inner transition-all ${
                      s2Enabled ? 'border-amber-600/50' : 'border-slate-800 opacity-75'
                    }`}>
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s2Enabled ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
                            <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wide ${s2Enabled ? 'text-white' : 'text-slate-400'}`}>
                              2º Suplente
                            </h4>
                          </div>

                          {/* BOTÃO HABILITAR / DESABILITAR 2º SUPLENTE */}
                          <button
                            type="button"
                            disabled={!s1Enabled}
                            onClick={() => {
                              if (!s1Enabled) {
                                showNotification('error', 'Para habilitar o 2º Suplente, habilite primeiro o 1º Suplente.');
                                return;
                              }
                              const nextState = !s2Enabled;
                              saveSession({
                                ...session,
                                habilitarSuplente2: nextState,
                                segundoSuplentesCount: nextState
                                  ? ((session.segundoSuplentesCount && session.segundoSuplentesCount > 0) ? session.segundoSuplentesCount : 1)
                                  : 0,
                              });
                              showNotification('success', nextState ? '2º Suplente habilitado.' : '2º Suplente desabilitado.');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-150 border shadow-sm ${
                              !s1Enabled
                                ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-500 border-slate-800'
                                : s2Enabled
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500 hover:bg-amber-500/30 cursor-pointer active:scale-95'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 cursor-pointer active:scale-95'
                            }`}
                          >
                            {!s1Enabled ? 'Bloqueado' : s2Enabled ? '● Habilitado' : '○ Desabilitado'}
                          </button>
                        </div>
                        <p className="text-[10px] text-blue-200/80 mb-3">
                          {!s1Enabled
                            ? 'Requer 1º Suplente habilitado'
                            : s2Enabled
                            ? 'Segunda linha de suplência'
                            : 'Desabilitado (não aparecerá no telão)'}
                        </p>
                      </div>

                      <div className={`flex flex-col gap-2.5 transition-opacity ${!s2Enabled ? 'opacity-30 pointer-events-none select-none' : ''}`}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveSession({ ...session, segundoSuplentesCount: Math.max(0, (session.segundoSuplentesCount || 0) - 1) })}
                            disabled={!s2Enabled || (session.segundoSuplentesCount || 0) <= 0}
                            className="w-10 h-10 rounded-xl bg-transparent hover:bg-amber-500/10 border-2 border-amber-500/80 disabled:opacity-30 disabled:pointer-events-none text-amber-400 font-black text-xl flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer shadow-md select-none"
                          >
                            -
                          </button>

                          <div className="min-w-[76px] h-12 bg-[#001f47] border-2 border-amber-400 focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-400/40 rounded-xl flex flex-col items-center justify-center shadow-lg px-2 transition">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              disabled={!s2Enabled}
                              value={s2Enabled ? (session.segundoSuplentesCount || 0) : 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) saveSession({ ...session, segundoSuplentesCount: Math.max(0, Math.min(20, val)) });
                              }}
                              className="w-full text-center bg-transparent text-2xl font-black font-mono text-amber-300 outline-none p-0 leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-text"
                            />
                            <span className="text-[8.5px] font-bold text-amber-200/90 uppercase pointer-events-none -mt-0.5 select-none">
                              {(session.segundoSuplentesCount || 0) === 1 ? '2º Suplente' : '2º Suplentes'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => saveSession({ ...session, segundoSuplentesCount: Math.min(20, (session.segundoSuplentesCount || 0) + 1) })}
                            disabled={!s2Enabled || (session.segundoSuplentesCount || 0) >= 20}
                            className="w-10 h-10 rounded-xl bg-transparent hover:bg-amber-500/10 border-2 border-amber-500/80 disabled:opacity-30 disabled:pointer-events-none text-amber-400 font-black text-xl flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer shadow-md select-none"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex flex-col gap-1 px-1">
                          <div className="flex justify-between text-[10px] font-bold text-blue-200">
                            <span>0 suplentes</span>
                            <span className="text-amber-300 font-mono">
                              Deslize: <strong className="text-white bg-blue-950 px-1 rounded border border-blue-800">{s2Enabled ? (session.segundoSuplentesCount || 0) : 0}</strong>
                            </span>
                            <span>10 suplentes</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={10}
                            disabled={!s2Enabled}
                            value={s2Enabled ? (session.segundoSuplentesCount || 0) : 0}
                            onChange={(e) => saveSession({ ...session, segundoSuplentesCount: Number(e.target.value) })}
                            className="w-full h-2.5 bg-blue-950 rounded-lg appearance-none cursor-pointer accent-amber-400 border border-blue-700"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Seção de Desempate (somente exibida após encerrar a votação ou durante rodada de desempate) */}
          {(session.status === 'CLOSED' || session.status === 'TIE_BREAK') && (
          <div className="bg-[#001f47] border border-blue-800 rounded-2xl p-4 shadow-lg">
            {/* Cabeçalho do Motor de Desempate */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white font-serif">
                  Motor de Desempate Inteligente
                </h3>
              </div>
              {session.status === 'TIE_BREAK' && (
                <button
                  onClick={handleCancelTieBreak}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer shadow"
                >
                  Finalizar Desempate
                </button>
              )}
            </div>

            {/* CASOS DE EMPATE DETECTADOS AUTOMATICAMENTE */}
            {(() => {
              const detected = detectVotingTies(session);
              if (detected.length === 0) return null;
              return (
                <div className="mb-4 p-3.5 bg-amber-950/80 border-2 border-amber-400 rounded-2xl shadow-xl">
                  <div className="flex items-center gap-2 mb-2.5 text-amber-300 font-bold text-xs sm:text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce shrink-0" />
                    <span>Empates Identificados na Apuração Oficial ({detected.length}):</span>
                  </div>
                  <div className="space-y-2">
                    {detected.map((tie, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-[#07132a] rounded-xl border border-amber-600/50 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-amber-300 uppercase">{tie.label}</span>
                            <span className="text-[10px] font-mono bg-amber-400 text-blue-950 px-1.5 py-0.2 rounded font-black">
                              {tie.votesCount} {tie.votesCount === 1 ? 'voto' : 'votos'} cada
                            </span>
                          </div>
                          <p className="text-white font-semibold mt-1">
                            Candidatos: {tie.tiedCandidates.map((c) => c.name).join(', ')}
                          </p>
                          <p className="text-[11px] text-blue-200 mt-0.5">
                            Vagas restantes em disputa nesta categoria: <strong className="text-amber-300 font-bold">{tie.vacanciesInDispute}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTieCandidateIds(tie.tiedCandidates.map((c) => c.id));
                            setTieVacancies(tie.vacanciesInDispute);
                            showNotification('success', `Candidatos empatados para ${tie.label} carregados no motor!`);
                          }}
                          className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-blue-950 font-black rounded-xl text-xs transition cursor-pointer active:scale-95 shadow-md flex items-center gap-1.5"
                        >
                          <Flame className="w-3.5 h-3.5" />
                          Carregar este Desempate
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* SEÇÃO DE VAGAS EM DISPUTA DO DESEMPATE (COM NÚMERO DIGITÁVEL) */}
            <div className="bg-[#07132a]/90 border border-amber-500/40 rounded-2xl p-4 mb-4 shadow-inner">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <h4 className="text-base font-bold text-white font-serif uppercase tracking-wide">
                  Vagas em Disputa (Desempate)
                </h4>
                <span className="text-xs text-blue-300 font-normal ml-1">
                  (quantos candidatos serão eleitos nesta rodada de desempate)
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Seletor Numérico 2.5x Maior com Botões + e - e Input Digitável */}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTieVacancies(Math.max(1, tieVacancies - 1))}
                    disabled={tieVacancies <= 1}
                    title="Diminuir vagas em disputa"
                    className="w-12 h-12 rounded-xl bg-transparent hover:bg-blue-900/40 border-2 border-blue-600 hover:border-amber-400 disabled:opacity-30 disabled:pointer-events-none text-amber-300 font-black text-2xl flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer shadow-md select-none"
                  >
                    -
                  </button>

                  <div className="min-w-[80px] h-14 bg-[#001f47] border-2 border-amber-400 focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-400/40 rounded-2xl flex flex-col items-center justify-center shadow-lg shadow-amber-500/10 px-2 transition">
                    <input
                      type="number"
                      min={1}
                      max={Math.max(selectedTieCandidateIds.length > 1 ? selectedTieCandidateIds.length - 1 : 1, 10)}
                      value={tieVacancies}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          const maxLimit = Math.max(selectedTieCandidateIds.length > 1 ? selectedTieCandidateIds.length - 1 : 1, 10);
                          setTieVacancies(Math.max(1, Math.min(maxLimit, val)));
                        }
                      }}
                      className="w-full text-center bg-transparent text-2xl sm:text-3xl font-black font-mono text-amber-300 outline-none p-0 leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-text"
                    />
                    <span className="text-[9px] font-bold text-amber-200/90 uppercase pointer-events-none -mt-0.5 select-none">
                      {tieVacancies === 1 ? 'Vaga' : 'Vagas'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const maxLimit = Math.max(selectedTieCandidateIds.length > 1 ? selectedTieCandidateIds.length - 1 : 1, 10);
                      setTieVacancies(Math.min(maxLimit, tieVacancies + 1));
                    }}
                    title="Aumentar vagas em disputa"
                    className="w-12 h-12 rounded-xl bg-transparent hover:bg-blue-900/40 border-2 border-blue-600 hover:border-amber-400 disabled:opacity-30 disabled:pointer-events-none text-amber-300 font-black text-2xl flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer shadow-md select-none"
                  >
                    +
                  </button>
                </div>

                {/* Slider Elegante e Intuitivo */}
                <div className="flex-1 min-w-[220px] max-w-sm flex flex-col gap-1.5 px-2">
                  <div className="flex justify-between text-[11px] font-bold text-blue-200">
                    <span>1 vaga</span>
                    <span className="text-amber-300 flex items-center gap-1 font-mono">
                      <span>Deslize para regular:</span>
                      <strong className="text-white bg-blue-950 px-1.5 py-0.2 rounded border border-blue-800">
                        {tieVacancies}
                      </strong>
                    </span>
                    <span>
                      {Math.max(selectedTieCandidateIds.length > 1 ? selectedTieCandidateIds.length - 1 : 1, 10)} vagas
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(selectedTieCandidateIds.length > 1 ? selectedTieCandidateIds.length - 1 : 1, 10)}
                    value={tieVacancies}
                    onChange={(e) => setTieVacancies(Number(e.target.value))}
                    className="w-full h-3.5 bg-blue-950 rounded-lg appearance-none cursor-pointer accent-amber-400 border border-blue-700 hover:border-amber-400 transition"
                  />
                </div>

                {/* Botão de Disparo do Desempate (2.5x maior, alinhado e destacado) */}
                <button
                  onClick={handleStartTieBreak}
                  disabled={selectedTieCandidateIds.length < 2}
                  className="h-14 px-5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:pointer-events-none text-blue-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-950/40 transition active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0 border border-amber-300/60"
                >
                  <Flame className="w-5 h-5 text-blue-950 fill-current animate-pulse" />
                  <span>Iniciar Rodada de Desempate nos Celulares</span>
                </button>
              </div>
            </div>

            {/* SEÇÃO DOS NOMES / CANDIDATOS EM DISPUTA */}
            <div className="pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <p className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Candidatos Participantes do Desempate:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-950 text-amber-300 border border-blue-800 text-[11px] font-mono font-bold">
                    {selectedTieCandidateIds.length} selecionados
                  </span>
                </p>
                <span className="text-[11px] text-blue-300">
                  Clique nos nomes para selecionar ou desmarcar
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                {session.options.map((opt) => {
                  const isSelected = selectedTieCandidateIds.includes(opt.id);
                  return (
                    <div
                      key={opt.id}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedTieCandidateIds(selectedTieCandidateIds.filter((id) => id !== opt.id));
                        } else {
                          setSelectedTieCandidateIds([...selectedTieCandidateIds, opt.id]);
                        }
                      }}
                      className={`p-2.5 rounded-xl border-2 cursor-pointer select-none text-[11px] font-bold flex items-center justify-between transition-all duration-150 ${
                        isSelected
                          ? 'bg-amber-950/90 border-amber-400 text-amber-200 shadow-md shadow-amber-950/40 scale-[1.02]'
                          : 'bg-[#07132a] border-blue-900/80 hover:border-blue-700 text-slate-300'
                      }`}
                    >
                      <span className="truncate">{opt.name}</span>
                      <span className="font-mono ml-1.5 text-blue-300 text-[10px] bg-blue-950 px-1.5 py-0.5 rounded border border-blue-800">
                        {opt.votesCount || 0}v
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {/* Ações de Gestão */}
          <div className="bg-[#001f47] border border-blue-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-white text-sm">Zerar Apuração / Reiniciar Votação</h4>
              <p className="text-[11px] text-blue-200">
                Zera a apuração dos votos mantendo <strong>intactos todos os nomes cadastrados na tela</strong> e libera os celulares para votar novamente.
              </p>
            </div>
            <button
              onClick={handleResetVotes}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reiniciar com os Nomes Atuais
            </button>
          </div>
        </div>
      )}

      {/* ABA: NOMES / CANDIDATOS (AGORA EM PRIMEIRO) */}
      {activeTab === 'candidates' && (
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

          {/* 1. SEÇÃO DE DIGITAÇÃO / VOZ (3X MAIS ALTA, COM BOTÕES DE IMPORTAR NA MESMA LINHA DO CABEÇALHO) */}
          <div className="bg-[#001f47] border border-blue-800 rounded-2xl p-4 shadow-xl">
            {/* CABEÇALHO NA MESMA LINHA: TÍTULO + SEÇÃO "IMPORTAR DADOS" LOGO À FRENTE */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-3">
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <label className="text-xs sm:text-sm font-black text-white font-serif uppercase tracking-wide">
                  Digite ou Fale os Nomes
                </label>
                {isListening && (
                  <span className="text-[10px] font-bold text-rose-400 bg-rose-950/90 px-2 py-0.5 rounded-full border border-rose-600 animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    Ouvindo...
                  </span>
                )}
              </div>

              {/* SEÇÃO IMPORTAR DADOS (NA FRENTE DE DIGITE OU FALE OS NOMES) */}
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
                className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#07132a]/90 border border-blue-700/80 shadow-inner"
              >
                <span className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wider flex items-center gap-1.5 pr-2 mr-0.5 border-r border-blue-800">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
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

            {/* CAMPO DE DIGITAÇÃO COM MICROFONE VERDE CENTRALIZADO À DIREITA + COLUNA DE BOTÕES NA PONTA */}
            <div className="flex flex-col lg:flex-row gap-3 items-stretch">
              {/* Textarea com Microfone Verde no canto direito centralizado */}
              <div className="flex-1 relative">
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
                  className="w-full h-32 sm:h-36 p-3.5 pr-16 bg-[#07132a] border-2 border-blue-700/80 focus:border-amber-400 rounded-2xl text-white font-bold text-sm sm:text-base placeholder-slate-400 outline-none transition shadow-inner uppercase resize-none leading-relaxed"
                />

                {/* Microfone Verde no Canto Direito Centralizado */}
                <button
                  type="button"
                  onClick={() => setIsListening(!isListening)}
                  title={isListening ? 'Parar microfone' : 'Falar nomes por voz'}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer ${
                    isListening
                      ? 'bg-rose-600/70 border-rose-300 text-white shadow-[0_0_20px_rgba(244,63,94,0.75)] animate-pulse'
                      : 'bg-emerald-600/50 hover:bg-emerald-600/70 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(52,211,153,0.45)] hover:shadow-[0_0_22px_rgba(52,211,153,0.65)]'
                  }`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </div>

              {/* COLUNA DE BOTÕES NA PONTA: ADICIONAR, MOSTRAR NO TELÃO E LIMPAR */}
              <div className="flex flex-col gap-2 shrink-0 w-36 sm:w-44 justify-between">
                {/* Botão ADICIONAR (verde 50% transparente, borda brilho, efeito clique, caption 20% menor) */}
                <button
                  type="button"
                  onClick={() => handleAddCandidateName(newName)}
                  className="flex-1 min-h-[42px] px-3 bg-emerald-600/50 hover:bg-emerald-600/70 border-2 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(52,211,153,0.35)] hover:shadow-[0_0_20px_rgba(52,211,153,0.55)] font-black text-[10.5px] rounded-xl transition-all duration-150 active:scale-90 active:bg-emerald-600/90 cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>ADICIONAR</span>
                </button>

                {/* Botão MOSTRAR NO TELÃO (azul 50% transparente, borda brilho, efeito clique, caption 20% menor) */}
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
                  className={`flex-1 min-h-[38px] px-2.5 border-2 rounded-xl transition-all duration-150 active:scale-90 cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider font-bold text-[10px] ${
                    session.telaoMode === 'names'
                      ? 'bg-emerald-600/50 hover:bg-emerald-600/70 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(52,211,153,0.4)]'
                      : 'bg-blue-600/50 hover:bg-blue-600/70 border-blue-400 text-blue-100 shadow-[0_0_15px_rgba(96,165,250,0.35)] hover:shadow-[0_0_20px_rgba(96,165,250,0.55)]'
                  }`}
                  title="Abrir o Telão e alternar exibição dos Nomes para Escolha"
                >
                  <Tv className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {session.telaoMode === 'names' ? 'NOMES NO TELÃO (ATIVO)' : 'MOSTRAR NO TELÃO'}
                  </span>
                </button>

                {/* Botão lixeirinha LIMPAR (vermelho 50% transparente, borda brilho, efeito clique, caption 20% menor) */}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Atenção: deseja realmente limpar todos os nomes cadastrados?')) {
                      saveSession({ ...session, options: [] });
                      showNotification('success', 'Todos os nomes foram apagados.');
                    }
                  }}
                  className="min-h-[36px] px-2.5 bg-rose-600/40 hover:bg-rose-600/60 border-2 border-rose-400 text-rose-100 shadow-[0_0_15px_rgba(244,63,94,0.35)] hover:shadow-[0_0_20px_rgba(244,63,94,0.55)] font-bold text-[10px] rounded-xl transition-all duration-150 active:scale-90 active:bg-rose-600/90 cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider"
                  title="Apagar todos os nomes cadastrados"
                >
                  <Trash2 className="w-3 h-3 shrink-0" />
                  <span>LIMPAR</span>
                </button>
              </div>
            </div>

            {speechTranscript && isListening && (
              <p className="text-xs text-amber-300 font-mono mt-2 bg-blue-950/80 p-2 rounded-lg border border-blue-800">
                Ouvindo: <span className="text-white font-bold">"{speechTranscript}"</span>
              </p>
            )}
          </div>

          {/* 3. NOMES CADASTRADOS (CARDS EM LINHA, SEM SUBTITULO, SEM VOTOS) */}
          <div className="bg-[#001f47] border border-blue-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-sm sm:text-base font-sans tracking-tight flex items-center gap-2">
                <span>Nomes para escolha ({session.options.length})</span>
              </h3>
              {session.options.length > 0 && (
                <div className="flex items-center gap-2">
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
                  title="Ordenar nomes em ordem alfabética"
                >
                  <ArrowDownAZ className="w-3.5 h-3.5" />
                  <span>Ordenar A-Z</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Atenção: deseja realmente limpar todos os nomes cadastrados?')) {
                      saveSession({ ...session, options: [] });
                      showNotification('success', 'Todos os nomes foram apagados.');
                    }
                  }}
                  className="px-3 py-1.5 bg-rose-600/40 hover:bg-rose-600/60 border-2 border-rose-400 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.35)] hover:shadow-[0_0_18px_rgba(244,63,94,0.55)] rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all duration-150 active:scale-90 active:bg-rose-600/90 cursor-pointer"
                  title="Apagar todos os nomes cadastrados"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar tudo</span>
                </button>
                </div>
              )}
            </div>

            {session.options.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-blue-800 rounded-xl bg-[#07132a]/40">
                Nenhum nome cadastrado ainda. Digite ou fale no campo acima para começar!
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                {session.options.map((option) => {
                  const isEditing = editingCandidateId === option.id;
                  return (
                    <div
                      key={option.id}
                      className="px-3 py-2 bg-[#07132a] hover:bg-[#0c1f44] border border-blue-800/80 hover:border-amber-400/80 rounded-xl flex items-center gap-2 shadow-sm transition group"
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
                          className="px-2 py-0.5 bg-blue-950 border border-amber-400 rounded text-xs text-white font-bold uppercase outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditingCandidateId(option.id);
                            setEditingCandidateName(option.name);
                          }}
                          className="font-black text-xs text-white uppercase tracking-wide cursor-pointer hover:text-amber-300 transition"
                          title="Clique para editar este nome"
                        >
                          {option.name}
                        </span>
                      )}

                      {/* Botão de Excluir */}
                      <button
                        type="button"
                        onClick={() => handleRemoveCandidate(option.id)}
                        title="Remover nome"
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
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
