import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Plus,
  Trash2,
  Play,
  Pause,
  StopCircle,
  Eye,
  EyeOff,
  RotateCcw,
  Download,
  Upload,
  AlertTriangle,
  Camera,
  CheckCircle,
  Flame,
  FileSpreadsheet,
  FileText,
  Tv,
  ExternalLink,
  Pencil,
  QrCode,
} from 'lucide-react';
import type { VotingSession, VotingOption } from '../types';
import { saveSession } from '../services/votingService';
import { parseImportFile } from '../utils/fileImporter';

interface AdminViewProps {
  session: VotingSession;
}

export const AdminView: React.FC<AdminViewProps> = ({ session }) => {
  const [activeTab, setActiveTab] = useState<'control' | 'candidates' | 'settings'>('control');
  const [isListening, setIsListening] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [newName, setNewName] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
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

  // Detector Automático de Empate no Ponto de Corte
  const detectTieAtCutoff = (): { hasTie: boolean; tiedCandidates: VotingOption[]; cutoffRank: number } => {
    if (session.status === 'WAITING' || session.options.length === 0) {
      return { hasTie: false, tiedCandidates: [], cutoffRank: 0 };
    }

    const sorted = [...session.options].sort((a, b) => (b.votesCount || 0) - (a.votesCount || 0));
    const cutoffIndex = session.vacancies - 1;

    if (cutoffIndex < 0 || cutoffIndex >= sorted.length - 1) {
      return { hasTie: false, tiedCandidates: [], cutoffRank: 0 };
    }

    const cutoffCandidate = sorted[cutoffIndex];
    const nextCandidate = sorted[cutoffIndex + 1];

    // Se ambos têm votos > 0 e a mesma quantidade de votos no limite da vaga
    if (
      cutoffCandidate.votesCount > 0 &&
      cutoffCandidate.votesCount === nextCandidate.votesCount
    ) {
      const tiedVotes = cutoffCandidate.votesCount;
      const tied = sorted.filter((c) => c.votesCount === tiedVotes);
      return {
        hasTie: true,
        tiedCandidates: tied,
        cutoffRank: session.vacancies,
      };
    }

    return { hasTie: false, tiedCandidates: [], cutoffRank: 0 };
  };

  const tieInfo = detectTieAtCutoff();

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
      name: name.charAt(0).toUpperCase() + name.slice(1),
      subtitle: 'Adicionado por voz',
      votesCount: 0,
    }));

    const updated = {
      ...session,
      options: [...session.options, ...newOptions],
    };

    saveSession(updated);
    showNotification('success', `${newOptions.length} candidato(s) adicionado(s) por voz!`);
  };

  // Disparo: "VOTAR AGORA"
  const handleStartVoting = () => {
    saveSession({
      ...session,
      status: 'VOTING',
    });
    showNotification('success', 'Votação iniciada! Celulares liberados para votar.');
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

  // Alternar Telão: Oculto vs Ao Vivo
  const handleToggleLiveResults = () => {
    saveSession({
      ...session,
      showResultsLive: !session.showResultsLive,
    });
  };

  // Zerar Votos
  const handleResetVotes = () => {
    if (window.confirm('Tem certeza que deseja zerar a contagem de votos desta sessão?')) {
      const resetOptions = session.options.map((o) => ({ ...o, votesCount: 0 }));
      saveSession({
        ...session,
        status: 'WAITING',
        options: resetOptions,
        tieBreak: undefined,
      });
      // Limpa os registros de votos do navegador atual
      localStorage.removeItem(`voted_${session.id}_MAIN`);
      localStorage.removeItem(`voted_${session.id}_TIE_BREAK`);
      showNotification('success', 'Votos zerados com sucesso!');
    }
  };

  // Adicionar Candidato Manualmente
  const handleAddCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newCandidate: VotingOption = {
      id: 'opt_' + Date.now(),
      name: newName.trim(),
      subtitle: newSubtitle.trim() || undefined,
      votesCount: 0,
    };

    saveSession({
      ...session,
      options: [...session.options, newCandidate],
    });

    setNewName('');
    setNewSubtitle('');
    showNotification('success', `Candidato ${newCandidate.name} adicionado!`);
  };

  // Importar Lista em Lote (Texto colado)
  const handleBulkImport = () => {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    const imported: VotingOption[] = lines.map((line, idx) => {
      // Suporta formato "Nome - Subtítulo" ou só "Nome"
      const parts = line.split('-');
      return {
        id: 'opt_' + Date.now() + '_' + idx,
        name: parts[0].trim(),
        subtitle: parts[1]?.trim() || undefined,
        votesCount: 0,
      };
    });

    saveSession({
      ...session,
      options: [...session.options, ...imported],
    });

    setBulkText('');
    showNotification('success', `${imported.length} candidatos importados com sucesso!`);
  };

  // Remover Candidato
  const handleRemoveCandidate = (id: string) => {
    saveSession({
      ...session,
      options: session.options.filter((o) => o.id !== id),
    });
  };

  // Upload de Foto de Candidato (Converte para imagem leve WebP/Base64)
  const handlePhotoUpload = (candidateId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        // Redimensiona para miniatura leve (160x160)
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 160, 160);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

          const updatedOptions = session.options.map((opt) =>
            opt.id === candidateId ? { ...opt, photoUrl: compressedDataUrl } : opt
          );

          saveSession({
            ...session,
            options: updatedOptions,
          });
          showNotification('success', 'Foto atualizada com sucesso!');
        }
      };
    };
    reader.readAsDataURL(file);
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

    saveSession({
      ...session,
      status: 'TIE_BREAK',
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
    <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-10 py-5">
      {/* Notificação Flutuante */}
      {notification && (
        <div
          className={`fixed top-20 right-4 z-50 p-4 rounded-2xl shadow-2xl flex items-center gap-3 border text-sm font-semibold transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
              : 'bg-rose-950 border-rose-500 text-rose-200'
          }`}
        >
          <CheckCircle className="w-5 h-5 text-current shrink-0" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* BANNER DE ALERTA DE EMPATE NO PONTO DE CORTE */}
      {tieInfo.hasTie && (
        <div className="mb-6 p-5 rounded-3xl bg-amber-950/80 border-2 border-amber-500 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-amber-300 uppercase tracking-wide flex items-center gap-2">
                Empate no Limite de Vagas!
              </h3>
              <p className="text-xs text-amber-100">
                Há um empate entre {tieInfo.tiedCandidates.map((c) => c.name).join(' e ')} com {tieInfo.tiedCandidates[0].votesCount} votos na linha de corte da vaga #{tieInfo.cutoffRank}.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setSelectedTieCandidateIds(tieInfo.tiedCandidates.map((c) => c.id));
              setTieVacancies(1);
              setActiveTab('control');
            }}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-blue-950 font-bold rounded-xl text-xs shadow-md transition active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Flame className="w-4 h-4 text-blue-950" />
            Configurar Desempate
          </button>
        </div>
      )}

      {/* CABEÇALHO DO ADMIN COM CONTROLES RÁPIDOS */}
      <div className="bg-[#001f47] border border-blue-800 rounded-3xl p-6 shadow-xl mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex-1 max-w-2xl">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-900 text-blue-200 uppercase tracking-wider">
              Painel de Controle do Líder
            </span>
            {isEditingTitle ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={() => {
                  if (editedTitle.trim()) {
                    saveSession({ ...session, title: editedTitle.trim() });
                  }
                  setIsEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editedTitle.trim()) {
                      saveSession({ ...session, title: editedTitle.trim() });
                    }
                    setIsEditingTitle(false);
                  } else if (e.key === 'Escape') {
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                className="text-2xl sm:text-3xl font-black text-white font-serif mt-1 bg-[#07132a] border-2 border-[#d4af37] px-3 py-1 rounded-xl outline-none shadow-inner w-full"
              />
            ) : (
              <div
                className="flex items-center gap-2 group cursor-pointer"
                onDoubleClick={() => {
                  setEditedTitle(session.title);
                  setIsEditingTitle(true);
                }}
                title="Dê um duplo clique para editar o nome da pauta diretamente"
              >
                <h1 className="text-2xl sm:text-3xl font-black text-white font-serif mt-1 group-hover:text-amber-300 transition-colors">
                  {session.title}
                </h1>
                <span className="text-[11px] text-blue-300 opacity-60 group-hover:opacity-100 bg-blue-900/60 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                  <Pencil className="w-3 h-3 text-amber-300" />
                  Duplo clique edita
                </span>
              </div>
            )}
            <p className="text-xs text-blue-200 mt-0.5">
              PIN de Acesso dos Membros: <strong className="text-amber-300 font-mono text-sm">{session.pin}</strong>
            </p>
          </div>

          {/* Abas */}
          <div className="flex items-center bg-[#07132a] p-1 rounded-2xl border border-blue-900">
            <button
              onClick={() => setActiveTab('control')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'control' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              Comandos & Votação
            </button>
            <button
              onClick={() => setActiveTab('candidates')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'candidates' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              Candidatos ({session.options.length})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'settings' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              Configuração & Migração
            </button>
          </div>
        </div>

        {/* BARRA DE GATILHOS DA ELEIÇÃO */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 border-t border-blue-900/80">
          <button
            onClick={handleStartVoting}
            disabled={session.status === 'VOTING'}
            className="p-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            INICIAR VOTAÇÃO
          </button>

          <button
            onClick={handlePauseVoting}
            disabled={session.status === 'WAITING'}
            className="p-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer"
          >
            <Pause className="w-5 h-5 fill-current" />
            SALA DE ESPERA
          </button>

          <button
            onClick={handleCloseVoting}
            disabled={session.status === 'CLOSED'}
            className="p-3.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer"
          >
            <StopCircle className="w-5 h-5 fill-current" />
            ENCERRAR
          </button>

          <button
            onClick={handleToggleLiveResults}
            className={`p-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer ${
              session.showResultsLive
                ? 'bg-blue-700 hover:bg-blue-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
            }`}
          >
            {session.showResultsLive ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            {session.showResultsLive ? 'Telão: Ao Vivo' : 'Telão: Oculto'}
          </button>

          {/* Botão de Controle do QR Code no Telão */}
          <button
            onClick={() => {
              saveSession({
                ...session,
                showQrOnTelao: session.showQrOnTelao === false ? true : false,
              });
            }}
            title="Mostrar ou ocultar o QR Code no Telão a qualquer momento"
            className={`p-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer ${
              session.showQrOnTelao !== false
                ? 'bg-blue-900/90 hover:bg-blue-800 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
            }`}
          >
            <QrCode className="w-5 h-5" />
            {session.showQrOnTelao !== false ? 'QR Telão: Sim' : 'QR Telão: Não'}
          </button>

          {/* Botão de 2ª Tela para o Projetor / TV */}
          <button
            onClick={() => {
              const url = `${window.location.origin}/?view=telao&fullscreen=true`;
              const screenWidth = window.screen.availWidth || 1920;
              const screenHeight = window.screen.availHeight || 1080;
              const popup = window.open(
                url,
                'VotaIASDTelaoProjetor',
                `width=${screenWidth},height=${screenHeight},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
              );
              if (popup) popup.focus();
            }}
            className="p-3.5 bg-gradient-to-r from-[#d4af37] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-blue-950 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-900/30 transition active:scale-95 cursor-pointer"
          >
            <Tv className="w-5 h-5" />
            <span>2ª TELA (TELÃO)</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>
        </div>
      </div>

      {/* ABA 1: COMANDOS E DESEMPATE */}
      {activeTab === 'control' && (
        <div className="space-y-6">
          {/* Seção de Desempate */}
          <div className="bg-[#001f47] border border-blue-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Flame className="w-6 h-6 text-amber-400" />
                <h3 className="text-lg font-bold text-white font-serif">
                  Motor de Desempate Inteligente
                </h3>
              </div>
              {session.status === 'TIE_BREAK' && (
                <button
                  onClick={handleCancelTieBreak}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
                >
                  Finalizar Desempate
                </button>
              )}
            </div>

            <p className="text-xs text-blue-200 mb-4">
              Selecione quais candidatos participarão da rodada de desempate e quantas vagas estão em disputa:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 mb-4">
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
                    className={`p-3 rounded-xl border cursor-pointer select-none text-xs font-semibold flex items-center justify-between ${
                      isSelected
                        ? 'bg-amber-950 border-amber-400 text-amber-200'
                        : 'bg-[#07132a] border-blue-900 text-slate-300'
                    }`}
                  >
                    <span className="truncate">{opt.name}</span>
                    <span className="font-mono ml-2 text-blue-300">{opt.votesCount || 0}v</span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-blue-900/60">
              <div className="flex items-center gap-2 text-xs text-white">
                <span>Vagas em Disputa:</span>
                <input
                  type="number"
                  min={1}
                  max={selectedTieCandidateIds.length || 1}
                  value={tieVacancies}
                  onChange={(e) => setTieVacancies(Number(e.target.value))}
                  className="w-16 px-2 py-1 bg-[#07132a] border border-blue-700 rounded-lg text-white font-mono text-center font-bold"
                />
              </div>

              <button
                onClick={handleStartTieBreak}
                disabled={selectedTieCandidateIds.length < 2}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-blue-950 font-black text-xs rounded-xl shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Flame className="w-4 h-4 text-blue-950" />
                Iniciar Rodada de Desempate nos Celulares
              </button>
            </div>
          </div>

          {/* Ações de Gestão */}
          <div className="bg-[#001f47] border border-blue-800 rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-white text-base">Zerar Apuração / Reiniciar Votação</h4>
              <p className="text-xs text-blue-200">Zera todos os votos registrados e redefine o status para Sala de Espera.</p>
            </div>
            <button
              onClick={handleResetVotes}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              Zerar Todos os Votos
            </button>
          </div>
        </div>
      )}

      {/* ABA 2: CANDIDATOS / TEMAS / BRINDES (Arquivos .XLS, .CSV, .TXT, Voz, Lote) */}
      {activeTab === 'candidates' && (
        <div className="space-y-6">
          {/* Card Especial de Importação por Arquivos (.XLS, .XLSX, .CSV, .TXT) */}
          <div className="bg-[#001f47] border-2 border-[#d4af37]/60 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-[#d4af37] flex items-center justify-center text-[#d4af37]">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-lg font-serif flex items-center gap-2">
                    Importar Arquivos (.XLS, .XLSX, .CSV, .TXT)
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-600/50 uppercase font-sans">
                      Excel • Bloco de Notas • Planilhas
                    </span>
                  </h3>
                  <p className="text-xs text-blue-200">
                    Importe listas de <strong>Nomes, Temas de Votação, Brindes de Sorteio ou Enquetes</strong> direto do seu computador.
                  </p>
                </div>
              </div>

              {/* Botão Baixar Modelo */}
              <button
                type="button"
                onClick={handleDownloadSampleTemplate}
                className="px-4 py-2 bg-blue-900/80 hover:bg-blue-800 text-blue-200 hover:text-white border border-blue-700/60 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 shadow-sm"
              >
                <Download className="w-4 h-4 text-amber-400" />
                Baixar Planilha Modelo (.CSV / Excel)
              </button>
            </div>

            {/* Inputs de Upload Ocultos com Gatilhos Visuais */}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => fileUploadAppendRef.current?.click()}
                className="p-4 bg-[#07132a] hover:bg-[#0c1f44] border-2 border-dashed border-blue-600/80 hover:border-[#d4af37] rounded-2xl flex items-center gap-4 text-left transition cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-900/60 flex items-center justify-center text-blue-300 group-hover:text-amber-300 shrink-0">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm group-hover:text-amber-300">
                    Adicionar aos Itens Existentes
                  </h4>
                  <p className="text-[11px] text-blue-300/80">
                    Mantém a lista atual e acrescenta os itens do arquivo .xls, .xlsx, .csv ou .txt
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Atenção: isso substituirá todos os candidatos/temas atuais pelos do arquivo. Deseja continuar?')) {
                    fileUploadReplaceRef.current?.click();
                  }
                }}
                className="p-4 bg-[#07132a] hover:bg-[#0c1f44] border-2 border-dashed border-amber-600/80 hover:border-amber-400 rounded-2xl flex items-center gap-4 text-left transition cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-950/60 flex items-center justify-center text-amber-400 shrink-0">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm group-hover:text-amber-300">
                    Substituir Lista Completa
                  </h4>
                  <p className="text-[11px] text-blue-300/80">
                    Limpa a lista atual e preenche com os itens da nova planilha
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Adicionar por Voz ou Texto Colado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Adição por Voz (Microfone) */}
            <div className="bg-[#001f47] border border-blue-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="w-5 h-5 text-[#d4af37]" />
                  <h3 className="font-bold text-white text-base font-serif">
                    Adicionar Itens por Voz
                  </h3>
                </div>
                <p className="text-xs text-blue-200 mb-4 leading-relaxed">
                  Clique no microfone e fale nomes, temas ou brindes em sequência (ex: <em>"Carlos Eduardo, Tema 1 Conectados, Bíblia de Estudo"</em>).
                </p>
              </div>

              <div className="text-center py-4">
                <button
                  type="button"
                  onClick={() => setIsListening(!isListening)}
                  className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-xl transition-all cursor-pointer ${
                    isListening
                      ? 'bg-rose-600 text-white ring-4 ring-rose-400 animate-pulse'
                      : 'bg-gradient-to-tr from-[#d4af37] to-amber-400 text-blue-950 hover:scale-105'
                  }`}
                >
                  {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                </button>
                <span className="block text-xs font-semibold text-blue-300 mt-2">
                  {isListening ? 'Ouvindo... Fale agora!' : 'Clique para falar'}
                </span>
                {speechTranscript && (
                  <p className="text-xs text-amber-300 mt-2 italic font-mono">
                    "{speechTranscript}"
                  </p>
                )}
              </div>
            </div>

            {/* Importação em Lote (Texto) */}
            <div className="bg-[#001f47] border border-blue-800 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-5 h-5 text-blue-300" />
                <h3 className="font-bold text-white text-base font-serif">
                  Colar Lista de Texto (WhatsApp / Bloco)
                </h3>
              </div>
              <p className="text-xs text-blue-200 mb-3">
                Cole itens, um por linha (opcional: Nome - Descrição/Cargo):
              </p>
              <textarea
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"Carlos Eduardo - Ministério Diaconal\nTema 1: Conectados com Cristo\nBíblia Missionária - Brinde de Sorteio"}
                className="w-full p-3 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-white placeholder-slate-500 font-mono outline-none focus:border-[#d4af37] mb-3"
              />
              <button
                type="button"
                onClick={handleBulkImport}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow transition"
              >
                Importar Lista Colada
              </button>
            </div>
          </div>

          {/* Adicionar Individualmente */}
          <div className="bg-[#001f47] border border-blue-800 rounded-3xl p-6 shadow-xl">
            <h3 className="font-bold text-white text-base font-serif mb-3">
              Adicionar Item Individualmente
            </h3>
            <form onSubmit={handleAddCandidate} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Nome / Tema / Brinde (Ex: Carlos Silva ou Tema 1)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="px-3.5 py-2.5 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-white outline-none focus:border-[#d4af37]"
              />
              <input
                type="text"
                placeholder="Subtítulo / Descrição (Ex: Diácono ou Sorteio #1)"
                value={newSubtitle}
                onChange={(e) => setNewSubtitle(e.target.value)}
                className="px-3.5 py-2.5 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-white outline-none focus:border-[#d4af37]"
              />
              <button
                type="submit"
                className="py-2.5 bg-[#d4af37] hover:bg-amber-400 text-blue-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Adicionar Item
              </button>
            </form>
          </div>

          {/* Lista de Itens Cadastrados */}
          <div className="bg-[#001f47] border border-blue-800 rounded-3xl p-6 shadow-xl">
            <h3 className="font-bold text-white text-base font-serif mb-4 flex items-center justify-between">
              <span>Itens Cadastrados ({session.options.length})</span>
              <span className="text-xs font-normal text-blue-300">Toque na câmera para carregar foto</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5">
              {session.options.map((option) => (
                <div
                  key={option.id}
                  className="p-3.5 bg-[#07132a] border border-blue-900 rounded-2xl flex items-center gap-3 relative group"
                >
                  {/* Foto com botão de upload */}
                  <label className="relative shrink-0 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(option.id, e)}
                    />
                    {option.photoUrl ? (
                      <img
                        src={option.photoUrl}
                        alt={option.name}
                        className="w-12 h-12 rounded-xl object-cover border border-blue-600"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-blue-900 border border-blue-600/40 flex items-center justify-center text-amber-300 font-black text-sm">
                        {option.name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 rounded-xl opacity-0 hover:opacity-100 flex items-center justify-center text-white transition">
                      <Camera className="w-4 h-4" />
                    </div>
                  </label>

                  {/* Nome e Votos */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm text-white truncate">{option.name}</h4>
                    {option.subtitle && (
                      <p className="text-[11px] text-blue-300/80 truncate">{option.subtitle}</p>
                    )}
                    <span className="text-[11px] font-mono text-emerald-400 font-bold">
                      {option.votesCount || 0} votos
                    </span>
                  </div>

                  {/* Botão de Excluir */}
                  <button
                    onClick={() => handleRemoveCandidate(option.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: CONFIGURAÇÕES E MIGRAÇÃO */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-[#001f47] border border-blue-800 rounded-3xl p-6 shadow-xl">
            <h3 className="font-bold text-white text-base font-serif mb-4">
              Parâmetros da Sessão de Votação
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="text-xs font-semibold text-blue-200 block mb-1">Título da Pauta:</label>
                <input
                  type="text"
                  value={session.title}
                  onChange={(e) => saveSession({ ...session, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-blue-200 block mb-1">Título Público no Telão:</label>
                <input
                  type="text"
                  placeholder="Ex: VOTAÇÃO ESCOLHA DIÁCONOS"
                  value={session.publicTitle || ''}
                  onChange={(e) => saveSession({ ...session, publicTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-blue-200 block mb-1">Categoria / Departamento:</label>
                <input
                  type="text"
                  value={session.category || ''}
                  onChange={(e) => saveSession({ ...session, category: e.target.value })}
                  className="w-full px-3 py-2 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-blue-200 block mb-1">Código PIN (Segurança):</label>
                <input
                  type="text"
                  maxLength={6}
                  value={session.pin}
                  onChange={(e) => saveSession({ ...session, pin: e.target.value })}
                  className="w-full px-3 py-2 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-amber-300 font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-blue-200 block mb-1">Quantidade de Vagas Principais (Titulares):</label>
                <input
                  type="number"
                  min={1}
                  value={session.vacancies}
                  onChange={(e) => saveSession({ ...session, vacancies: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-blue-200 block mb-1">Quantidade de Suplentes:</label>
                <input
                  type="number"
                  min={0}
                  value={session.suplentesCount}
                  onChange={(e) => saveSession({ ...session, suplentesCount: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-blue-200 block mb-1">Limite de Votos por Membro:</label>
                <input
                  type="number"
                  min={1}
                  value={session.maxVotesPerVoter}
                  onChange={(e) => saveSession({ ...session, maxVotesPerVoter: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-[#07132a] border border-blue-700 rounded-xl text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* FERRAMENTA DE MIGRAÇÃO: EXPORTAR E IMPORTAR PARA CONTA DA IGREJA */}
          <div className="bg-[#001f47] border border-blue-800 rounded-3xl p-6 shadow-xl">
            <h3 className="font-bold text-white text-base font-serif mb-2 flex items-center gap-2">
              <Download className="w-5 h-5 text-[#d4af37]" />
              Migração entre Contas Google / Backup
            </h3>
            <p className="text-xs text-blue-200 mb-5 leading-relaxed">
              Você pode montar todas as pautas e membros agora no seu computador. Quando for migrar para a conta oficial da igreja (Google Free/Spark), basta exportar o arquivo JSON e importá-lo no outro ambiente com um clique!
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleExportJson}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Download className="w-4 h-4" />
                Exportar Pauta e Membros (JSON)
              </button>

              <label className="px-5 py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer active:scale-95">
                <Upload className="w-4 h-4" />
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
