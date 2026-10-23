import React, { useRef, useState, useEffect } from 'react';
import { RefreshCw, Camera, Lock, Unlock, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { IasdLogo } from './IasdLogo';
import { removeEasyBackground } from '../utils/imageUtils';
import { detectVotingTies, compareCandidatesRanking } from '../utils/tieDetection';
import type { VotingSession, VotingHistoryRecord } from '../types';
import { subscribeToConnectedVoters, getFirestoreQuotaStats, resetFirestoreQuotaStats } from '../services/votingService';

interface NavbarProps {
  currentView: 'voter' | 'telao' | 'admin' | 'simulator';
  setCurrentView: (view: 'voter' | 'telao' | 'admin' | 'simulator') => void;
  pin?: string;
  onRegeneratePin?: (newPin: string) => void;
  logoUrl?: string;
  onUpdateLogo?: (url: string) => void;
  title?: string;
  onUpdateTitle?: (newTitle: string) => void;
  session?: VotingSession;
  onSaveSession?: (session: VotingSession) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  pin = '1844',
  onRegeneratePin,
  logoUrl,
  onUpdateLogo,
  session,
  onSaveSession,
}) => {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [localPin, setLocalPin] = useState(pin);
  const [connectedVoters, setConnectedVoters] = useState<string[]>([]);
  const [quotaStats, setQuotaStats] = useState(() => getFirestoreQuotaStats());

  useEffect(() => {
    const handleQuotaChange = (e: any) => {
      if (e?.detail) {
        setQuotaStats(e.detail);
      } else {
        setQuotaStats(getFirestoreQuotaStats());
      }
    };
    window.addEventListener('vota_iasd_firestore_quota_change', handleQuotaChange as EventListener);
    return () => {
      window.removeEventListener('vota_iasd_firestore_quota_change', handleQuotaChange as EventListener);
    };
  }, []);

  // Escuta os votantes que conectaram pelo QR Code ou endereço
  useEffect(() => {
    if (!session?.id) return;
    const unsub = subscribeToConnectedVoters(session.id, (voters) => {
      setConnectedVoters(voters);
    });
    return unsub;
  }, [session?.id]);

  const isLocked = Boolean(session?.accessLocked);

  // Clicou no cadeado: tranca ou destranca novos acessos
  const handleToggleLock = () => {
    if (!session || !onSaveSession) return;
    const willLock = !session.accessLocked;
    onSaveSession({
      ...session,
      accessLocked: willLock,
      allowedVoterIds: willLock
        ? (connectedVoters.length > 0 ? connectedVoters : session.allowedVoterIds || [])
        : undefined,
    });
  };

  // Sincroniza estado de senha caso venha externamente
  useEffect(() => {
    setLocalPin(pin);
  }, [pin]);

  // Salva o PIN digitado pelo usuário
  const handleSavePin = () => {
    const cleaned = localPin.trim().toUpperCase();
    if (cleaned && cleaned !== pin) {
      onRegeneratePin?.(cleaned);
    } else if (!cleaned) {
      setLocalPin(pin);
    }
  };

  // Gera novo PIN de 4 dígitos aleatório
  const handleRegenerate = () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setLocalPin(newPin);
    if (onRegeneratePin) {
      onRegeneratePin(newPin);
    }
  };

  // Upload de Logo personalizado com remoção automática de fundo ("fundo fácil")
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateLogo) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      if (rawDataUrl) {
        // GARANTIA: Se o fundo for fácil (branco, sólido, etc.), remove automaticamente!
        const { resultUrl } = await removeEasyBackground(rawDataUrl);
        onUpdateLogo(resultUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Remoção de fundo sob demanda para a logo atualmente carregada
  const handleManualRemoveBg = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!logoUrl || !onUpdateLogo) return;
    const { resultUrl, removed } = await removeEasyBackground(logoUrl, { tolerance: 52 });
    if (removed) {
      onUpdateLogo(resultUrl);
    }
  };

  // Garante que se houver uma logo salva com fundo fácil/sólido, remove automaticamente
  useEffect(() => {
    if (logoUrl && logoUrl.startsWith('data:image') && onUpdateLogo) {
      removeEasyBackground(logoUrl).then(({ resultUrl, removed }) => {
        if (removed && resultUrl !== logoUrl) {
          onUpdateLogo(resultUrl);
        }
      });
    }
  }, [logoUrl]);

  const isVotingActive =
    session?.status === 'VOTING' || session?.status === 'TIE_BREAK';

  // Um card está definido se possui nome/título válido e regras configuradas
  const hasCardDefined = Boolean(session?.rulesConfigured && session?.title?.trim());
  // Deve haver nomes cadastrados na lista de candidatos para poder votar
  const hasNames = Boolean(session?.options && session.options.length > 0);
  // O botão só fica verde e pronto se tiver card definido E nomes para votar (ou se a votação já estiver em andamento)
  const isReadyToVote = hasCardDefined && hasNames;
  const isGreen = isVotingActive || isReadyToVote;

  // Limite configurado pelo Admin (totalVotersConnected) é o limite oficial e soberano da votação.
  // Durante TIE_BREAK: o limite é soberanamente a quantidade de votantes que participaram da rodada principal.
  const totalLimit =
    session?.status === 'TIE_BREAK' && session?.mainVotersCount && session.mainVotersCount > 0
      ? session.mainVotersCount
      : session?.totalVotersConnected && session.totalVotersConnected > 0
      ? session.totalVotersConnected
      : Math.max(
          connectedVoters.length,
          session?.allowedVoterIds?.length || 0
        );

  const totalVotersVoted =
    session?.status === 'TIE_BREAK'
      ? session?.tieBreakVotersCount || 0
      : session?.mainVotersCount || 0;

  // APURAÇÃO só é exibido quando TODOS os votantes atingirem o limite (ou quando a votação for encerrada)
  const allHaveVoted = totalLimit > 0 && totalVotersVoted >= totalLimit;
  const showApuracaoCaption = (isVotingActive && allHaveVoted) || session?.status === 'CLOSED';

  // Detecção de empates que afetam a classificação oficial
  const detectedTies = session ? detectVotingTies(session) : [];
  const hasTies = detectedTies.length > 0;

  const handleCancelVoting = () => {
    if (!session || !onSaveSession) return;
    const freshOptions = [...session.options].map((o) => ({
      ...o,
      votesCount: 0,
      tieBreakVotes: 0,
      tieBreakRank: undefined,
      tieBreakDisputeWith: undefined,
      acceptStatus: undefined,
      declinedOriginalRank: undefined,
    }));
    const nextIteration = (session.votingIteration || 1) + 1;
    onSaveSession({
      ...session,
      status: 'WAITING',
      options: freshOptions,
      tieBreak: null,
      telaoMode: 'names',
      votingIteration: nextIteration,
      mainVotersCount: 0,
      tieBreakVotersCount: 0,
    });
  };

  const handleCenterVotingButtonClick = () => {
    if (!session || !onSaveSession) return;

    // Se ainda não definiu o card / regras da eleição, abre o modal de regras
    if (!isVotingActive && !hasCardDefined) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-event-rules-modal'));
      }
      return;
    }

    // Se o card está definido mas ainda não há nomes para votar, avisa e foca no campo de nomes
    if (!isVotingActive && !hasNames) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vota_iasd_notification', {
            detail: {
              type: 'error',
              message: 'Cadastre os nomes para votar antes de iniciar a votação.',
            },
          })
        );
        window.dispatchEvent(new CustomEvent('focus-names-input'));
      }
      return;
    }

    if (isVotingActive) {
      // Se estamos em rodada de desempate, encerra e consolida os vencedores do desempate
      if (session.status === 'TIE_BREAK') {
        const tieOptions = session.tieBreak?.options || [];
        const tieSorted = [...tieOptions].sort((a, b) => Math.floor(b.votesCount || 0) - Math.floor(a.votesCount || 0));
        const vacanciesInDispute = session.tieBreak?.vacancies || 1;

        const winnerIds = new Set<string>();
        if (tieSorted.length >= 2) {
          for (let i = 0; i < vacanciesInDispute && i < tieSorted.length; i++) {
            const candidate = tieSorted[i];
            const nextCandidate = tieSorted[i + 1];
            if (candidate && Math.floor(candidate.votesCount || 0) > Math.floor(nextCandidate?.votesCount || 0)) {
              winnerIds.add(candidate.id);
            } else if (candidate && Math.floor(candidate.votesCount || 0) > 0 && !nextCandidate) {
              winnerIds.add(candidate.id);
            }
          }
        }

        const baseStartRank = session.tieBreak?.startRank ?? 1;
        const tieRankMap = new Map<string, number>();
        tieSorted.forEach((c, idx) => {
          tieRankMap.set(c.id, baseStartRank + idx);
        });

        const opponentsNames = tieOptions
          .filter((c) => !winnerIds.has(c.id))
          .map((c) => c.name)
          .join(', ');

        const updatedOptions = session.options.map((opt) => {
          const achievedRank = tieRankMap.get(opt.id);
          if (achievedRank !== undefined) {
            const isWinner = winnerIds.has(opt.id);
            return {
              ...opt,
              votesCount: Math.floor(opt.votesCount || 0), // ZERO pontos extras adicionados!
              tieBreakRank: achievedRank,
              tieBreakDisputeWith: isWinner ? opponentsNames || undefined : undefined,
            };
          }
          return opt;
        });

        onSaveSession({
          ...session,
          options: updatedOptions,
          status: 'CLOSED',
          telaoMode: 'voting',
          tieBreak: {
            ...(session.tieBreak as any),
            active: false,
          },
          tieBreakVotersCount: 0,
        });
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('open-tie-modal'));
          }, 150);
        }
        return;
      }

      // Se já está em votação normal (ou com caption APURAÇÃO), clicar encerra e abre a APURAÇÃO no Telão
      onSaveSession({
        ...session,
        status: 'CLOSED',
        telaoMode: 'voting',
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-tie-modal'));
      }
    } else if (session.status === 'CLOSED') {
      // Se a votação está encerrada/em apuração: NUNCA zera sozinho!
      // Votação só é zerada quando o administrador clicar em "ENCERRAR VOTAÇÃO"
      const ties = detectVotingTies(session);
      if (ties.length > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-tie-modal'));
      }
      return;
    } else {
      // Inicia NOVA VOTAÇÃO a partir do estado inicial WAITING mantendo os nomes em ordem A-Z
      const freshOptions = [...session.options]
        .map((o) => ({
          ...o,
          votesCount: 0,
          tieBreakVotes: 0,
          tieBreakRank: undefined,
          tieBreakDisputeWith: undefined,
          acceptStatus: undefined,
          declinedOriginalRank: undefined,
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        );
      const nextIteration = (session.votingIteration || 1) + 1;

      onSaveSession({
        ...session,
        status: 'VOTING',
        options: freshOptions,
        tieBreak: undefined,
        telaoMode: 'voting',
        votingIteration: nextIteration,
        mainVotersCount: 0,
        tieBreakVotersCount: 0,
      });
    }
  };

  const handleEndVoting = () => {
    if (!session || !onSaveSession) return;

    // Se estiver em rodada de desempate, consolida os vencedores sem adicionar pontos
    let optionsToClassify = [...session.options];
    if (session.status === 'TIE_BREAK' && session.tieBreak?.options) {
      const tieOptions = session.tieBreak.options;
      const tieSorted = [...tieOptions].sort((a, b) => Math.floor(b.votesCount || 0) - Math.floor(a.votesCount || 0));
      const vacanciesInDispute = session.tieBreak.vacancies || 1;

      const winnerIds = new Set<string>();
      if (tieSorted.length >= 2) {
        for (let i = 0; i < vacanciesInDispute && i < tieSorted.length; i++) {
          const candidate = tieSorted[i];
          const nextCandidate = tieSorted[i + 1];
          if (candidate && Math.floor(candidate.votesCount || 0) > Math.floor(nextCandidate?.votesCount || 0)) {
            winnerIds.add(candidate.id);
          } else if (candidate && Math.floor(candidate.votesCount || 0) > 0 && !nextCandidate) {
            winnerIds.add(candidate.id);
          }
        }
      }

      const baseStartRank = session.tieBreak.startRank ?? 1;
      const tieRankMap = new Map<string, number>();
      tieSorted.forEach((c, idx) => {
        tieRankMap.set(c.id, baseStartRank + idx);
      });

      const opponentsNames = tieOptions
        .filter((c) => !winnerIds.has(c.id))
        .map((c) => c.name)
        .join(', ');

      optionsToClassify = session.options.map((opt) => {
        const achievedRank = tieRankMap.get(opt.id);
        if (achievedRank !== undefined) {
          const isWinner = winnerIds.has(opt.id);
          return {
            ...opt,
            votesCount: Math.floor(opt.votesCount || 0), // ZERO pontos extras adicionados!
            tieBreakRank: achievedRank,
            tieBreakDisputeWith: isWinner ? opponentsNames || undefined : undefined,
          };
        }
        return opt;
      });
    }

    // 1. Calcular apuração final: Eleitos, Suplentes, Não Classificados
    const sortedOptions = [...optionsToClassify].sort(compareCandidatesRanking);

    const totalVotes = optionsToClassify.reduce(
      (sum, o) => sum + Math.floor(o.votesCount || 0),
      0
    );
    const totalVoters = totalVotersVoted || totalLimit || 0;

    const V = session.vacancies || 1;
    const s1Count = session.habilitarSuplente1 !== false ? (session.suplentesCount || 0) : 0;
    const s2Count =
      session.habilitarSuplente1 !== false && session.habilitarSuplente2 !== false
        ? (session.segundoSuplentesCount || 0)
        : 0;

    const toCandidateResult = (opt: typeof sortedOptions[0]) => {
      const realVotes = Math.floor(opt.votesCount || 0);
      return {
        id: opt.id,
        name: opt.name,
        votesCount: realVotes,
        percentage: totalVotes > 0 ? Number(((realVotes / totalVotes) * 100).toFixed(1)) : 0,
        photoUrl: opt.photoUrl,
        tieBreakDisputeWith: opt.tieBreakDisputeWith,
        acceptStatus: opt.acceptStatus,
        declinedOriginalRank: opt.declinedOriginalRank,
      };
    };

    const eleitos = sortedOptions.slice(0, V).map(toCandidateResult);
    const suplentes = sortedOptions.slice(V, V + s1Count).map(toCandidateResult);
    const segundoSuplentes = sortedOptions
      .slice(V + s1Count, V + s1Count + s2Count)
      .map(toCandidateResult);
    const naoClassificados = sortedOptions
      .slice(V + s1Count + s2Count)
      .map(toCandidateResult);

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const rawTitle = (session.title || 'MULHERES').trim();
    const titleUpper = rawTitle.toUpperCase();
    const electionTitle = titleUpper.startsWith('ELEIÇÃO') || titleUpper.startsWith('ELEICAO')
      ? titleUpper
      : `ELEIÇÃO ${titleUpper}`;

    const dateFormatted = `dia ${day}/${month}/${year}`;
    const headerTitle = `${dateFormatted} ${electionTitle}`;

    const newHistoryRecord: VotingHistoryRecord = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      dateFormatted,
      timeFormatted: `${hours}:${minutes}`,
      headerTitle,
      sessionTitle: rawTitle,
      category: session.category || '',
      totalVotes,
      totalVoters,
      vacancies: V,
      suplentesCount: s1Count,
      segundoSuplentesCount: s2Count,
      eleitos,
      suplentes,
      segundoSuplentes,
      naoClassificados,
    };

    // Redundância no localStorage
    try {
      const existingRaw = localStorage.getItem('vota_iasd_voting_history');
      const existingList = existingRaw ? JSON.parse(existingRaw) : [];
      localStorage.setItem(
        'vota_iasd_voting_history',
        JSON.stringify([newHistoryRecord, ...existingList])
      );
    } catch (err) {
      console.error('Erro ao gravar histórico no localStorage:', err);
    }

    // 2. Fica pronto para outra: zera votos e reordena A-Z
    const freshOptions = [...session.options]
      .map((o) => ({
        ...o,
        votesCount: 0,
        tieBreakVotes: 0,
        tieBreakRank: undefined,
        tieBreakDisputeWith: undefined,
        acceptStatus: undefined,
        declinedOriginalRank: undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    const nextIteration = (session.votingIteration || 1) + 1;
    const updatedHistory = [newHistoryRecord, ...(session.history || [])];

    onSaveSession({
      ...session,
      status: 'WAITING',
      options: freshOptions,
      tieBreak: null,
      telaoMode: 'names',
      votingIteration: nextIteration,
      mainVotersCount: 0,
      tieBreakVotersCount: 0,
      history: updatedHistory,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vota_iasd_notification', {
          detail: {
            type: 'success',
            message: `Votação "${electionTitle}" encerrada com sucesso! Histórico salvo em Configurações. Pronto para nova votação.`,
          },
        })
      );
    }
  };

  const btnBg = isGreen ? '#159636' : '#334155';
  const btnBorder = isGreen ? '#24b349' : '#64748b';
  const btnShadow = isGreen
    ? '0 6px 0 #09521b, 3px 6px 0 #063b13'
    : '0 6px 0 #1e293b, 3px 6px 0 #0f172a';
  const brailleBg = isGreen ? '#24b84b' : '#94a3b8';
  const brailleShadow = isGreen ? '1px 1.5px 0 #074215' : '1px 1.5px 0 #0f172a';
  const textColor = isGreen ? '#1a1a1a' : '#f1f5f9';

  return (
    <header className="sticky top-0 z-50 bg-[#001f47]/95 backdrop-blur-md border-b border-blue-900/60 shadow-lg px-3 sm:px-6 lg:px-8 py-4 min-h-[76px] flex items-center w-full">
      <div className="w-full grid grid-cols-1 md:grid-cols-3 items-center gap-3">
        {/* ESQUERDA: Logo (aumentada em 20%) + VOTA IASD + VOTANTES */}
        <div className="flex items-center gap-3 justify-self-start">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <div className="relative group shrink-0">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              title="Clique para trocar a logo (remoção automática de fundo ativada)"
              className="relative block rounded-xl focus:outline-none transition p-0.5 hover:bg-white/10 cursor-pointer"
            >
              <IasdLogo className="w-[58px] h-[58px]" customUrl={logoUrl} />
              <div className="absolute inset-0 bg-black/45 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-amber-300 transition-opacity">
                <Camera className="w-4 h-4 drop-shadow" />
              </div>
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={handleManualRemoveBg}
                title="Remover fundo desta logo agora"
                className="absolute -bottom-1 -right-1 bg-amber-400 hover:bg-amber-300 text-slate-900 p-1 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
              >
                <Wand2 className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="leading-tight flex flex-col justify-center">
            {/* LINHA 1: VOTA IASD • SISTEMA ELEITORAL */}
            <div className="flex items-center gap-1.5 select-none">
              <span
                className="font-extrabold tracking-wider text-white text-xs sm:text-sm select-none"
                style={{
                  fontFamily:
                    '"Varela Round", "Nunito", "Quicksand", ui-rounded, "Segoe UI", system-ui, sans-serif',
                }}
              >
                {(() => {
                  const configuredSystemName = session?.systemName?.trim() || 'VOTA IASD';
                  if (configuredSystemName === 'VOTA IASD') {
                    return (
                      <>
                        VOTA <span className="text-[#d4af37]">IASD</span>
                      </>
                    );
                  }
                  const parts = configuredSystemName.split(' ');
                  if (parts.length > 1 && parts[parts.length - 1].toUpperCase() === 'IASD') {
                    return (
                      <>
                        {parts.slice(0, -1).join(' ')} <span className="text-[#d4af37]">{parts[parts.length - 1]}</span>
                      </>
                    );
                  }
                  return configuredSystemName;
                })()}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                title="Sistema Conectado"
              />
              <span className="text-[9px] sm:text-[10px] text-blue-200/90 font-bold tracking-wider uppercase">
                SISTEMA ELEITORAL
              </span>
            </div>

            {/* LINHA DE BAIXO: consumo   xxx % embaixo a barra de progresso */}
            <div
              className="mt-0.5 flex flex-col gap-0.5 select-none w-full max-w-[170px] cursor-pointer"
              title={`Consumo na Nuvem hoje: ${quotaStats.count.toLocaleString('pt-BR')} de ${quotaStats.max.toLocaleString('pt-BR')} gratuitas/dia (${quotaStats.percent}%). Dê 2 cliques para zerar o contador de testes.`}
              onDoubleClick={() => {
                if (window.confirm('Deseja zerar o contador de testes de hoje?')) {
                  resetFirestoreQuotaStats();
                }
              }}
            >
              <div className="flex items-center justify-between text-[9px] font-mono text-blue-200/70 leading-none">
                <span className="lowercase">consumo</span>
                <span className="font-semibold text-white/90">{quotaStats.percent}%</span>
              </div>
              <div className="w-full h-[3.5px] bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    quotaStats.percent > 90
                      ? 'bg-gradient-to-r from-amber-500 to-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                      : quotaStats.percent > 70
                      ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
                      : 'bg-gradient-to-r from-teal-400 to-emerald-400'
                  }`}
                  style={{ width: `${Math.max(2, Math.min(100, quotaStats.percent))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* CENTRO: BOTÃO DA URNA TOTALMENTE TRAVADO NO CENTRO (ÂNCORA IMÓVEL, NUNCA SE MEXE) */}
        <div className="relative flex items-center justify-center justify-self-center">
          {/* SLOT ESQUERDO: BOTÃO CANCELAR VOTAÇÃO (Ancorado à esquerda do botão central) */}
          <div className="absolute right-full mr-3 flex items-center justify-end pointer-events-none">
            <AnimatePresence>
              {isVotingActive && (
                <motion.div
                  key="btn-cancelar"
                  initial={{ opacity: 0, x: 30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30, scale: 0.95 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-auto flex items-center shrink-0"
                >
                  <button
                    type="button"
                    onClick={handleCancelVoting}
                    title="Cancelar votação ativa e zerar todos os votos"
                    style={{
                      backgroundColor: '#b91c1c',
                      borderColor: '#ef4444',
                      boxShadow: '0 4px 0 #7f1d1d, 2px 4px 0 #450a0a',
                    }}
                    className="px-3.5 py-1.5 min-h-[38px] rounded-[10px] border-[2.5px] transition-all duration-200 active:translate-y-[2px] cursor-pointer flex flex-col items-center justify-center select-none shrink-0"
                  >
                    <span className="font-black text-[10px] sm:text-[11px] tracking-wider uppercase font-sans text-white leading-none whitespace-nowrap">
                      CANCELAR VOTAÇÃO
                    </span>
                    {/* Braille 50% menor */}
                    <div className="flex items-center gap-1 mt-1 pointer-events-none">
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                      <span className="w-1.5" />
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CENTRO: BADGE APURANDO O RESULTADO / RESOLVENDO EMPATE OU BOTÃO DA URNA */}
          {showApuracaoCaption ? (
            /* O BAGGER DA ANIMAÇÃO: RESOLVENDO EMPATE (QUANDO HOUVER EMPATE) OU APURANDO O RESULTADO (NORMAL) */
            <div
              title={
                hasTies
                  ? 'Empate detectado: resolução de empate necessária'
                  : 'Apuração em andamento: calculando resultados da votação'
              }
              style={{
                backgroundColor: '#09152b',
                borderColor: hasTies ? 'rgba(244, 63, 94, 0.75)' : 'rgba(251, 191, 36, 0.65)',
                boxShadow: hasTies
                  ? '0 0 20px rgba(244, 63, 94, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.1)'
                  : '0 0 18px rgba(251, 191, 36, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.1)',
              }}
              className="w-[220px] min-w-[220px] max-w-[220px] min-h-[76px] h-[76px] rounded-[16px] border-[2px] flex items-center justify-center gap-3 px-3.5 py-2 select-none shrink-0"
            >
              {/* Prancheta com linhas de apuração animadas preenchendo */}
              <div className="relative w-6 h-7.5 bg-[#0f172a] rounded-[4px] border border-amber-300/70 p-0.5 flex flex-col justify-around shadow-inner overflow-hidden shrink-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-[2px] bg-amber-400 rounded-b-xs" />
                <motion.div
                  className="h-[2px] bg-amber-300 rounded-full"
                  animate={{ width: ['20%', '90%', '45%', '100%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="h-[2px] bg-amber-300 rounded-full"
                  animate={{ width: ['45%', '100%', '30%', '90%'] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
                />
                <motion.div
                  className={`h-[2px] rounded-full ${hasTies ? 'bg-rose-400' : 'bg-emerald-400'}`}
                  animate={{ width: ['10%', '75%', '40%', '100%'] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                />
              </div>

              {/* Mãozinha segurando a caneta escrevendo com ritmo caligráfico */}
              <motion.div
                className="relative w-7 h-7 flex items-center justify-center text-amber-300 origin-bottom-left shrink-0"
                animate={{
                  x: [0, 4, 1.5, 5, 2, 0],
                  y: [0, -2.5, 1.5, -1.5, 1.5, 0],
                  rotate: [-10, 8, -6, 10, -4, -10],
                }}
                transition={{
                  duration: 0.85,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <svg viewBox="0 0 28 28" fill="none" className="w-7 h-7 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]">
                  {/* Corpo da Caneta */}
                  <path
                    d="M6 22l3-1 12-12-3-3L6 18l-1 4 1 0z"
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  {/* Ponta da Caneta */}
                  <polygon points="5,22 8,21 6,19" fill="#0f172a" />
                  <circle cx="5" cy="22" r="1.2" fill="#ffffff" />
                  {/* Dedos da mão segurando */}
                  <path
                    d="M10 17c0-2 1.5-3 3-2s2 2 1 4-3 1-4-2z"
                    fill="#fed7aa"
                    stroke="#ea580c"
                    strokeWidth="1"
                  />
                  <circle cx="12" cy="16" r="2.2" fill="#fed7aa" stroke="#ea580c" strokeWidth="0.8" />
                </svg>
              </motion.div>

              {/* Texto informativo: RESOLVENDO EMPATE (se empate) ou APURANDO O RESULTADO (se normal) */}
              {hasTies ? (
                <div className="flex flex-col leading-tight select-none">
                  <span className="font-mono font-black text-[12px] sm:text-[13px] text-amber-300 tracking-wider uppercase animate-pulse">
                    RESOLVENDO
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-rose-400 font-extrabold tracking-wider uppercase whitespace-nowrap">
                    EMPATE
                  </span>
                </div>
              ) : (
                <div className="flex flex-col leading-tight select-none">
                  <span className="font-mono font-black text-[12px] sm:text-[13px] text-amber-300 tracking-wider uppercase animate-pulse">
                    APURANDO
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-emerald-300 font-extrabold tracking-wider uppercase whitespace-nowrap">
                    O RESULTADO
                  </span>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCenterVotingButtonClick}
              title={
                isVotingActive
                  ? 'Votação em andamento (clique para abrir a Apuração)'
                  : !hasCardDefined
                  ? 'Clique para definir o card e preencher as Regras da Eleição'
                  : !hasNames
                  ? 'Cadastre os nomes para votar antes de iniciar a votação'
                  : 'Iniciar Votação mantendo os nomes em ordem A-Z'
              }
              style={{
                backgroundColor: btnBg,
                borderColor: btnBorder,
                boxShadow: btnShadow,
              }}
              className={`w-[215px] min-w-[215px] max-w-[215px] pt-2 pb-2.5 min-h-[54px] rounded-[14px] border-[3px] transition-all duration-300 active:translate-y-[4px] cursor-pointer flex flex-col items-center justify-center select-none shrink-0 ${
                !isGreen ? 'opacity-90 hover:opacity-100' : ''
              }`}
            >
              <div className="flex items-center justify-center w-full">
                <span
                  style={{ color: textColor }}
                  className="font-black text-xs sm:text-sm tracking-wider uppercase font-sans leading-none whitespace-nowrap text-center"
                >
                  {isVotingActive ? 'EM VOTAÇÃO' : 'INICIAR VOTAÇÃO'}
                </span>
              </div>

              {/* Pontos em Braille 3D idênticos à tecla física da Urna */}
              <div className="flex flex-col items-center gap-[2.5px] mt-1.5 pointer-events-none">
                {/* Linha 1: 3 pontos à esquerda, espaço, 4 pontos à direita */}
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2.5" />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                </div>
                {/* Linha 2 */}
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 opacity-0" />
                  <span className="w-2 h-2 opacity-0" />
                  <span className="w-2 h-2 opacity-0" />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2 h-2 opacity-0" />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2 h-2 opacity-0" />
                </div>
                {/* Linha 3 */}
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 opacity-0" />
                  <span className="w-2 h-2 opacity-0" />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2.5" />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brailleBg, boxShadow: brailleShadow }} />
                  <span className="w-2 h-2 opacity-0" />
                  <span className="w-2 h-2 opacity-0" />
                  <span className="w-2 h-2 opacity-0" />
                </div>
              </div>
            </button>
          )}

          {/* SLOT DIREITO: BOTÃO ENCERRAR VOTAÇÃO (EM APURAÇÃO SEM EMPATE) OU VU METER (EM VOTAÇÃO OU SE HOUVER EMPATES) */}
          <div className="absolute left-full ml-3 flex items-center justify-start pointer-events-none">
            <AnimatePresence mode="wait">
              {showApuracaoCaption && !hasTies ? (
                /* BOTÃO À DIREITA: ENCERRAR VOTAÇÃO (NORMAL SEM EMPATE) */
                <motion.div
                  key="btn-encerrar-apuracao"
                  initial={{ opacity: 0, x: -20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20, scale: 0.95 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-auto flex items-center shrink-0 pl-1 select-none"
                >
                  <button
                    type="button"
                    onClick={handleEndVoting}
                    title="Encerrar votação, registrar histórico em configurações e ficar pronto para outra"
                    style={{
                      backgroundColor: '#ffffff',
                      borderColor: '#e2e8f0',
                      boxShadow: '0 4px 0 #94a3b8, 2px 4px 0 #64748b',
                    }}
                    className="px-3.5 py-1.5 min-h-[38px] rounded-[10px] border-[2.5px] transition-all duration-200 active:translate-y-[2px] cursor-pointer flex flex-col items-center justify-center select-none shrink-0"
                  >
                    <span className="font-black text-[10px] sm:text-[11px] tracking-wider uppercase font-sans text-[#1a1a1a] leading-none whitespace-nowrap">
                      ENCERRAR VOTAÇÃO
                    </span>
                    {/* Braille 50% menor em cinza/prata */}
                    <div className="flex items-center gap-1 mt-1 pointer-events-none">
                      <span className="w-1 h-1 rounded-full bg-[#cbd5e1] shadow-[0.5px_0.5px_0_#94a3b8]" />
                      <span className="w-1 h-1 rounded-full bg-[#cbd5e1] shadow-[0.5px_0.5px_0_#94a3b8]" />
                      <span className="w-1 h-1 rounded-full bg-[#cbd5e1] shadow-[0.5px_0.5px_0_#94a3b8]" />
                      <span className="w-1.5" />
                      <span className="w-1 h-1 rounded-full bg-[#cbd5e1] shadow-[0.5px_0.5px_0_#94a3b8]" />
                      <span className="w-1 h-1 rounded-full bg-[#cbd5e1] shadow-[0.5px_0.5px_0_#94a3b8]" />
                    </div>
                  </button>
                </motion.div>
              ) : isVotingActive || hasTies ? (
                /* VU METER NORMAL DURANTE A VOTAÇÃO OU QUANDO HÁ EMPATES */
                <motion.div
                  key="vumeter-navbar"
                  initial={{ opacity: 0, x: -30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -30, scale: 0.95 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-auto flex items-center shrink-0 pl-1"
                >
                  <div
                    title="VU Meter de Atividade em Tempo Real"
                    className="flex items-end gap-[3px] h-6 px-1 select-none shrink-0"
                  >
                    {[
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['35%', '85%', '50%', '95%', '35%'], duration: 1.1, delay: 0 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['50%', '30%', '90%', '45%', '50%'], duration: 0.9, delay: 0.15 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['25%', '95%', '60%', '40%', '25%'], duration: 1.3, delay: 0.05 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['60%', '40%', '100%', '70%', '60%'], duration: 0.85, delay: 0.2 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['40%', '90%', '35%', '85%', '40%'], duration: 1.15, delay: 0.1 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['70%', '45%', '95%', '50%', '70%'], duration: 0.95, delay: 0.25 },
                      { color: 'from-amber-600 to-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.8)]', heights: ['30%', '80%', '45%', '90%', '30%'], duration: 1.25, delay: 0.18 },
                      { color: 'from-amber-600 to-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.8)]', heights: ['55%', '35%', '85%', '60%', '55%'], duration: 1.05, delay: 0.08 },
                      { color: 'from-rose-600 to-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]', heights: ['20%', '75%', '30%', '85%', '20%'], duration: 1.35, delay: 0.22 },
                      { color: 'from-rose-600 to-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]', heights: ['15%', '65%', '25%', '80%', '15%'], duration: 1.0, delay: 0.12 },
                    ].map((bar, idx) => (
                      <motion.div
                        key={idx}
                        animate={{ height: bar.heights }}
                        transition={{
                          duration: bar.duration,
                          delay: bar.delay,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                        className={`w-[3px] rounded-t-[1.5px] bg-gradient-to-t ${bar.color}`}
                      />
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {/* DIREITA: CADEADO (com Hint Bonito) ACIMA DE "VISÃO DE:" + "SENHA: XXX" */}
        <div className="flex flex-col items-end gap-1.5 justify-self-end">
          {/* 1. CADEADINHO ACIMA DE VISÃO DE (Com Hint Bonito Personalizado) */}
          <div className="relative group flex items-center justify-end">
            <button
              type="button"
              onClick={handleToggleLock}
              className={`px-2.5 py-0.5 rounded-lg transition-all duration-200 cursor-pointer active:scale-95 flex items-center gap-1.5 hover:brightness-110 shadow-sm ${
                isLocked ? 'text-rose-300' : 'text-emerald-300'
              }`}
              style={{
                border: '1px solid transparent',
                background: isLocked
                  ? `linear-gradient(to left, rgba(76, 5, 25, 0.9) 0%, rgba(76, 5, 25, 0.45) 55%, transparent 100%) padding-box,
                     linear-gradient(to left, rgba(244, 63, 94, 0.85) 0%, rgba(244, 63, 94, 0.35) 65%, transparent 100%) border-box`
                  : `linear-gradient(to left, rgba(6, 78, 59, 0.8) 0%, rgba(6, 78, 59, 0.35) 55%, transparent 100%) padding-box,
                     linear-gradient(to left, rgba(16, 185, 129, 0.85) 0%, rgba(16, 185, 129, 0.35) 65%, transparent 100%) border-box`,
              }}
            >
              {isLocked ? (
                <>
                  <Lock className="w-3.5 h-3.5 stroke-[2.75] text-rose-400 drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                    Fechada
                  </span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 stroke-[2.5] text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    Aberta
                  </span>
                </>
              )}
            </button>

            {/* HINT BONITO FLUTUANTE (Substitui o tooltip feio do navegador) */}
            <div
              className={`pointer-events-none absolute right-full mr-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out z-50 flex items-center gap-2 px-3 py-1.5 rounded-xl shadow-2xl backdrop-blur-md border whitespace-nowrap ${
                isLocked
                  ? 'bg-[#120407]/95 border-rose-500/70 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.4)]'
                  : 'bg-[#02140b]/95 border-emerald-500/70 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isLocked ? 'bg-rose-500 animate-ping' : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <span className="text-xs font-black tracking-wide uppercase">
                {isLocked ? 'Sessão fechada' : 'Sessão aberta'}
              </span>
              <span className="text-[10px] text-slate-300 font-medium pl-1.5 border-l border-white/20">
                {isLocked
                  ? 'Quem tentar entrar receberá aviso de bloqueio'
                  : 'Novos eleitores podem se conectar'}
              </span>
              {/* Seta indicadora para o botão */}
              <div
                className={`absolute left-full top-1/2 -translate-y-1/2 -ml-px border-4 border-transparent ${
                  isLocked ? 'border-l-rose-500/70' : 'border-l-emerald-500/70'
                }`}
              />
            </div>
          </div>

          {/* 2. VISÃO DE: */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{
              border: '1px solid transparent',
              background: `
                linear-gradient(to left, rgba(7, 19, 42, 0.95) 0%, rgba(7, 19, 42, 0.45) 55%, transparent 100%) padding-box,
                linear-gradient(to left, rgba(59, 130, 246, 0.85) 0%, rgba(37, 99, 235, 0.35) 65%, transparent 100%) border-box
              `,
            }}
          >
            <label
              htmlFor="navbar-view-select"
              className="text-[10px] font-bold text-blue-300 uppercase tracking-wider whitespace-nowrap select-none"
            >
              VISÃO DE:
            </label>
            <select
              id="navbar-view-select"
              value={currentView === 'simulator' ? 'admin' : currentView}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'simulator') {
                  const width = Math.min(1560, window.screen.availWidth - 40);
                  const height = Math.min(940, window.screen.availHeight - 60);
                  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
                  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
                  window.open(
                    '?view=simulator',
                    'VotaIasdSimulador',
                    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes`
                  );
                  return;
                }
                setCurrentView(val as 'admin' | 'voter' | 'telao');
              }}
              className="bg-transparent text-xs font-black text-amber-300 outline-none cursor-pointer pr-1"
            >
              <option value="admin" className="bg-[#07132a] text-white font-bold">
                Admin
              </option>
              <option value="voter" className="bg-[#07132a] text-white font-bold">
                Celular
              </option>
              <option value="telao" className="bg-[#07132a] text-white font-bold">
                Público
              </option>
              <option value="simulator" className="bg-[#07132a] text-purple-300 font-bold">
                🧪 Nova Janela: Simulador ↗
              </option>
            </select>
          </div>

          {/* 3. SENHA: XXX (DEBAIXO DE VISÃO DE) */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg"
            style={{
              border: '1px solid transparent',
              background: `
                linear-gradient(to left, rgba(7, 19, 42, 0.92) 0%, rgba(7, 19, 42, 0.4) 55%, transparent 100%) padding-box,
                linear-gradient(to left, rgba(59, 130, 246, 0.8) 0%, rgba(37, 99, 235, 0.3) 65%, transparent 100%) border-box
              `,
            }}
          >
            <label
              htmlFor="navbar-pin-input"
              className="text-[10px] text-blue-300 font-bold uppercase tracking-wider cursor-pointer select-none"
            >
              SENHA:
            </label>
            <input
              id="navbar-pin-input"
              type="text"
              value={localPin}
              maxLength={8}
              onChange={(e) => setLocalPin(e.target.value.replace(/\s+/g, ''))}
              onBlur={handleSavePin}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              title="Clique para editar a senha (Enter para salvar)"
              className="w-14 px-0.5 py-0 font-mono font-black text-xs text-amber-300 bg-transparent border-none focus:ring-0 tracking-widest outline-none transition cursor-text select-all text-center"
            />
            <button
              type="button"
              onClick={handleRegenerate}
              title="Gerar nova senha aleatória"
              className="p-0.5 text-blue-300 hover:text-amber-300 rounded transition cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
