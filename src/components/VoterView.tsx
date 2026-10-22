import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Lock,
  Sparkles,
  AlertCircle,
  Flame,
  Trophy,
  Star,
} from 'lucide-react';
import type { VotingSession } from '../types';
import {
  submitBallot,
  hasVoted,
  verifyBallotOnServer,
  clearVotedFlag,
  getDeviceId,
  registerVoterPresence,
  setLocalSession,
} from '../services/votingService';
import { connectVoterToHost } from '../services/peerSyncService';
import { urnaAudio } from '../utils/audio';
import { IasdLogo } from './IasdLogo';
import { detectVotingTies, getEffectiveSuplentes } from '../utils/tieDetection';

interface VoterViewProps {
  session: VotingSession;
}

export const VoterView: React.FC<VoterViewProps> = ({ session }) => {
  const [enteredPin, setEnteredPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinError, setPinError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorTrigger, setErrorTrigger] = useState(0);
  const [isButtonPressed, setIsButtonPressed] = useState(false);
  const [isButtonShining, setIsButtonShining] = useState(false);
  // Controle de escala da fonte dos cards: mín 0% (+0%), passos de 8% e 8% limitado a 24% (0%, 8%, 16%, 24%)
  const [fontScalePercent, setFontScalePercent] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = Number(localStorage.getItem('vota_font_scale_pct'));
      if ([0, 8, 16, 24].includes(saved)) return saved;
    }
    return 0; // tamanho mínimo por padrão
  });

  const decreaseFont = () => {
    setFontScalePercent((prev) => {
      const next = Math.max(0, prev - 8);
      if (typeof window !== 'undefined') {
        localStorage.setItem('vota_font_scale_pct', String(next));
      }
      return next;
    });
  };

  const increaseFont = () => {
    setFontScalePercent((prev) => {
      const next = Math.min(24, prev + 8);
      if (typeof window !== 'undefined') {
        localStorage.setItem('vota_font_scale_pct', String(next));
      }
      return next;
    });
  };

  const fontMultiplier = 1 + fontScalePercent / 100;

  // Aviso: some sozinho após alguns segundos
  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(() => setErrorMessage(''), 3500);
    return () => clearTimeout(t);
  }, [errorMessage, errorTrigger]);

  // Identifica a rodada atual
  const isTieBreak = session.status === 'TIE_BREAK' && Boolean(session.tieBreak?.active);
  const currentRound = isTieBreak ? 'TIE_BREAK' : 'MAIN';

  // Opções e regras de acordo com a rodada
  const options = isTieBreak
    ? (session.tieBreak?.options || [])
    : session.options;

  const maxVotes = isTieBreak
    ? (session.tieBreak?.maxVotesPerVoter || 1)
    : session.maxVotesPerVoter;


  // Verifica se o dispositivo já votou nesta iteração específica (trava rígida: nunca permite votar 2x)
  // Cada início/reinício/desempate gera nova iteração, liberando o aparelho somente para a nova rodada
  const alreadyVoted =
    session.status !== 'WAITING' &&
    session.status !== 'CLOSED' &&
    hasVoted(session.id, currentRound, session.votingIteration || 1);

  // Após votar, mostra "SEU VOTO FOI COMPUTADO" por 5s e depois os resultados em tempo real
  const [showLiveResults, setShowLiveResults] = useState(false);
  const hasVotedNow = alreadyVoted || submitSuccess;

  // Confere no servidor se a trava local corresponde a uma cédula real.
  // Se a trava existir só no aparelho (voto nunca chegou ao servidor), libera para votar de verdade.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    if (!alreadyVoted) return;
    let cancelled = false;
    const iteration = session.votingIteration || 1;
    verifyBallotOnServer(session.id, currentRound, iteration).then((exists) => {
      if (!cancelled && exists === false) {
        clearVotedFlag(session.id, currentRound, iteration);
        setSubmitSuccess(false);
        forceRerender((n) => n + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [alreadyVoted, session.id, currentRound, session.votingIteration]);
  useEffect(() => {
    if (!hasVotedNow) {
      setShowLiveResults(false);
      return;
    }
    const timer = setTimeout(() => setShowLiveResults(true), 5000);
    return () => clearTimeout(timer);
  }, [hasVotedNow]);

  const myDeviceId = getDeviceId();
  const isLocked = Boolean(session.accessLocked);
  const isAlreadyAllowed =
    (Array.isArray(session.allowedVoterIds) && session.allowedVoterIds.includes(myDeviceId)) ||
    (typeof window !== 'undefined' && Boolean(sessionStorage.getItem(`auth_pin_${session.id}`)));
  const isBlockedByLock = isLocked && !isAlreadyAllowed;

  // Registra presença do votante assim que acessa a página (via QR Code ou link direto)
  useEffect(() => {
    if (isBlockedByLock) return;
    const unsub = registerVoterPresence(session.id);
    return unsub;
  }, [session.id, isBlockedByLock]);

  // Conecta ao Host P2P WebRTC do Admin (alternativa direta se Firebase atingir cota)
  useEffect(() => {
    if (isBlockedByLock || !session.id) return;
    const unsub = connectVoterToHost(session.id, (p2pSession) => {
      setLocalSession(p2pSession);
    });
    return unsub;
  }, [session.id, isBlockedByLock]);

  // Auto-login se já autenticado antes nesta sessão ou se o QR Code já trouxe o PIN na URL
  useEffect(() => {
    if (isBlockedByLock) return;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlPin = params.get('pin');
      if (urlPin && urlPin === session.pin) {
        setIsAuthenticated(true);
        sessionStorage.setItem(`auth_pin_${session.id}`, session.pin);
        return;
      }
    }
    const savedPin = sessionStorage.getItem(`auth_pin_${session.id}`);
    if (savedPin === session.pin) {
      setIsAuthenticated(true);
    }
  }, [session.id, session.pin, isBlockedByLock]);

  // Limpa seleções e reseta trava de sucesso se a rodada, iteração ou status mudar
  useEffect(() => {
    setSelectedIds([]);
    setErrorMessage('');
    setSubmitSuccess(false);
  }, [session.status, currentRound, session.votingIteration]);

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlockedByLock) {
      setPinError('Acesso trancado: A entrada de novos votantes foi encerrada pela liderança.');
      return;
    }
    if (enteredPin.trim() === session.pin) {
      setIsAuthenticated(true);
      sessionStorage.setItem(`auth_pin_${session.id}`, session.pin);
      setPinError('');
      urnaAudio.playKeyBeep();
    } else {
      setPinError('Código PIN incorreto. Verifique o número exibido no telão.');
    }
  };

  const handleToggleCandidate = (id: string) => {
    urnaAudio.playKeyBeep();
    setErrorMessage('');

    // Feedback tátil sutil no celular ao selecionar/desmarcar candidato
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(35);
      } catch (_) {}
    }

    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
      setErrorMessage('');
    } else {
      if (selectedIds.length >= maxVotes) {
        setErrorTrigger(Date.now());
        setErrorMessage('LIMIT_EXCEEDED');
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate([70, 40, 70]);
          } catch (_) {}
        }
        return;
      }
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleConfirmVote = async () => {
    // 📳 Vibração tátil IMEDIATA ao clicar no BOTÃO VOTAR / CONFIRMA
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([160, 60, 160]);
      } catch (_) {}
    }

    // Efeito visual de clique físico e raio de brilho reluzente
    setIsButtonPressed(true);
    setIsButtonShining(true);
    setTimeout(() => {
      setIsButtonPressed(false);
      setIsButtonShining(false);
    }, 450);

    // Bloqueia duplo toque / reenvio
    if (isSubmitting || submitSuccess || alreadyVoted) return;
    // Só permite confirmar se atingiu exatamente a quantidade definida
    if (selectedIds.length !== maxVotes) {
      setErrorTrigger(Date.now());
      setErrorMessage('LIMIT_EXCEEDED');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const res = await submitBallot(session, selectedIds, currentRound);

    if (res.success) {
      // 🔔 Toca o som oficial da Urna Eletrônica do TSE!
      urnaAudio.playTseConfirma();

      // Vibração tátil no celular ao concluir a gravação do voto
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate([100, 50, 200]);
        } catch (_) {}
      }

      setSubmitSuccess(true);
    } else {
      setErrorMessage(res.message || 'Erro ao registrar voto.');
    }

    setIsSubmitting(false);
  };

  // RENDERIZAÇÃO DA TELA DE RESULTADOS (oficial ao encerrar OU parcial em tempo real após votar)
  const renderResults = (live: boolean) => {
    const liveTie = live && isTieBreak;
    const resultOptions = liveTie ? (session.tieBreak?.options || []) : session.options;
    const { s1Count, s2Count } = getEffectiveSuplentes(session);
    const vacancies = liveTie ? (session.tieBreak?.vacancies || 1) : (session.vacancies || 1);
    const suplentesCount = liveTie ? 0 : s1Count;
    const segundoSuplentesCount = liveTie ? 0 : s2Count;
    const detectedTies = live ? [] : detectVotingTies(session);
    const hasTies = detectedTies.length > 0;

    const sortedOptions = [...resultOptions].sort((a, b) => {
      const diff = (b.votesCount || 0) - (a.votesCount || 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
    });
    const maxVotesRecorded = Math.max(...resultOptions.map((o) => o.votesCount || 0), 1);
    const totalVotesCast = resultOptions.reduce((acc, curr) => acc + (curr.votesCount || 0), 0);

    return (
      <div className="max-w-xl mx-auto px-3 py-3 pb-12 min-h-[90vh]">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#001f47] border border-blue-800 rounded-2xl p-3 sm:p-4 shadow-2xl space-y-2.5"
        >
          {/* Cabeçalho de Resultados (compacto) */}
          <div className="text-center pb-1.5 pt-0.5 border-b border-blue-900/80 relative min-h-[44px] flex flex-col justify-center overflow-hidden">
            {/* A(menor) e A(maior) separados e sem borda com espaço de 2 caracteres (z-30 sempre clicáveis) */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 z-30 flex items-center gap-2 select-none">
              <button
                type="button"
                onClick={decreaseFont}
                disabled={fontScalePercent === 0}
                title="Reduzir fonte dos cards (mínimo)"
                className={`min-w-[32px] min-h-[32px] p-1 flex items-center justify-center border-none bg-transparent outline-none transition-all active:scale-90 cursor-pointer ${
                  fontScalePercent === 0
                    ? 'opacity-25 cursor-not-allowed text-slate-400'
                    : 'text-white hover:text-amber-300'
                }`}
              >
                <span className="text-xs font-bold leading-none pointer-events-none">A</span>
              </button>
              <button
                type="button"
                onClick={increaseFont}
                disabled={fontScalePercent === 24}
                title="Aumentar fonte dos cards (limite +24%)"
                className={`min-w-[32px] min-h-[32px] p-1 flex items-center justify-center border-none bg-transparent outline-none transition-all active:scale-90 cursor-pointer ${
                  fontScalePercent === 24
                    ? 'opacity-25 cursor-not-allowed text-slate-400'
                    : 'text-white hover:text-amber-300'
                }`}
              >
                <span className="text-lg font-black leading-none pointer-events-none">A</span>
              </button>
            </div>

            {/* CABEÇALHO APÓS VOTAÇÃO: . bolinha RESULT. PARCIAL | MULHERES (negrito fonte branca) | VOTO (ICONE CHECK) SEM FUNDO, TUDO SEM BORDAS E FUNDO */}
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap text-center select-none pr-14 pl-1 py-0.5">
              {/* 1. . bolinha RESULT. PARCIAL (sem fundo, sem bordas) */}
              <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-sky-300 shrink-0">
                {live ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse drop-shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
                    <span>{liveTie ? 'DESEMPATE PARCIAL' : 'RESULT. PARCIAL'}</span>
                  </>
                ) : (
                  <>
                    <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>RESULTADO OFICIAL</span>
                  </>
                )}
              </div>

              {/* SEPARADOR VERTICAL */}
              <span className="text-white/30 font-light text-xs shrink-0 select-none">|</span>

              {/* 2. MULHERES (negrito fonte branca) */}
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-tight shrink-0 drop-shadow-sm">
                {session.title}
              </h2>

              {/* SEPARADOR VERTICAL + 3. VOTO (ICONE CHECK) SEM FUNDO */}
              {live && (
                <>
                  <span className="text-white/30 font-light text-xs shrink-0 select-none">|</span>
                  <div className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-emerald-400 font-black uppercase tracking-wider shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.75] text-emerald-400" />
                    <span>VOTO</span>
                  </div>
                </>
              )}
            </div>

            {/* SE HOUVER EMPATE: MODALZINHO DESCE SUAVE EM 1.5s COBRINDO O CABEÇALHO */}
            {hasTies && (
              <motion.div
                initial={{ y: '-100%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 z-20 bg-rose-950 border border-rose-500/90 rounded-xl flex items-center justify-center p-2.5 shadow-2xl backdrop-blur-sm"
              >
                <div className="flex items-center justify-center gap-2 text-center w-full pr-14 pl-2">
                  <Star className="w-4 h-4 text-rose-400 fill-rose-400 shrink-0" />
                  <h4 className="font-black text-xs sm:text-sm uppercase tracking-wider text-white text-center">
                    EMPATE DETECTADO ENTRE CANDIDATOS.
                  </h4>
                </div>
              </motion.div>
            )}
          </div>

          {/* Lista de Candidatos (cards 30% menores em altura e fonte) */}
          <div className="space-y-1">
            {sortedOptions.map((option, index) => {
              const rank = index + 1;
              const isElected = rank <= vacancies;
              const isSuplente = !isElected && rank <= vacancies + suplentesCount;
              const isSegundoSuplente =
                !isElected && !isSuplente && rank <= vacancies + suplentesCount + segundoSuplentesCount;
              const barPercentage = Math.round(((option.votesCount || 0) / maxVotesRecorded) * 100);
              const sharePercentage =
                totalVotesCast > 0 ? Math.round(((option.votesCount || 0) / totalVotesCast) * 100) : 0;

              const tiedGroup = detectedTies.find((t) => t.tiedCandidates.some((c) => c.id === option.id));

              const isFirstSuplente1 = suplentesCount > 0 && rank === vacancies + 1;
              const isFirstSuplente2 =
                segundoSuplentesCount > 0 && rank === vacancies + suplentesCount + 1;
              const isFirstNaoClassificado =
                rank > 1 && rank === vacancies + suplentesCount + segundoSuplentesCount + 1;
              const hasCategorySeparator =
                isFirstSuplente1 || isFirstSuplente2 || isFirstNaoClassificado;

              return (
                <motion.div
                  layout
                  transition={{ type: 'spring', damping: 25, stiffness: 180 }}
                  key={option.id}
                  style={{
                    gridTemplateColumns: `${Math.round(20 * fontMultiplier)}ch minmax(0,1fr) auto ${Math.round(5.5 * fontMultiplier)}ch`,
                    minHeight: `${Math.round(28 * fontMultiplier)}px`,
                    paddingTop: `${Math.round(4 * fontMultiplier)}px`,
                    paddingBottom: `${Math.round(4 * fontMultiplier)}px`,
                  }}
                  className={`${hasCategorySeparator ? 'mt-3' : ''} px-2 rounded-lg border relative overflow-hidden grid items-center ${
                    tiedGroup
                      ? 'bg-[#18080c]/90 border border-rose-500/80 text-white'
                      : isElected
                      ? 'bg-[#052e1c] border-emerald-500/80 text-white'
                      : isSuplente
                      ? 'bg-[#092350]/95 border-blue-500/80 text-blue-100'
                      : isSegundoSuplente
                      ? 'bg-slate-800/85 border-slate-600/80 text-slate-200'
                      : 'bg-[#07132a]/70 border-blue-900/40 text-slate-400'
                  }`}
                >
                  {/* Barra de Progresso no Fundo: Vidro Transparente com Pontinha Dourada Brilhosa */}
                  {isElected && !tiedGroup ? (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(barPercentage, 2)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="absolute top-0 bottom-0 left-0 pointer-events-none rounded-lg overflow-visible z-0"
                    >
                      {/* Efeito Vidro Transparente Cristalino */}
                      <div className="absolute inset-0 bg-gradient-to-r from-white/[0.08] via-white/[0.18] to-white/[0.28] backdrop-blur-md border-t border-white/40 border-b border-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.7),inset_0_-1px_1px_rgba(255,255,255,0.2)] rounded-l-lg overflow-hidden">
                        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent pointer-events-none" />
                      </div>

                      {/* Pontinha Dourada Brilhosa na ponta indicando onde ele está (Reduzida em 40%) */}
                      {(option.votesCount || 0) > 0 && (
                        <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center pointer-events-none z-20">
                          <div className="absolute -inset-y-1 sm:-inset-y-1.5 w-2 sm:w-3 -right-0.5 sm:-right-1 bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 opacity-80 blur-[2px] sm:blur-[3.5px]" />
                          <div className="relative w-[1.5px] sm:w-[2.4px] h-full bg-gradient-to-b from-[#fffbe6] via-[#fbbf24] to-[#f59e0b] shadow-[0_0_4px_#fbbf24,0_0_8px_rgba(245,158,11,0.7)] sm:shadow-[0_0_6px_#fbbf24,0_0_12px_rgba(245,158,11,0.8),0_0_2px_#ffffff] rounded-r-xs" />
                          <div className="absolute right-[-2.5px] sm:right-[-4px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gradient-to-tr from-amber-300 via-yellow-100 to-white shadow-[0_0_4px_1px_#f59e0b,0_0_7px_2px_rgba(251,191,36,0.7)] sm:shadow-[0_0_6px_2px_#f59e0b,0_0_12px_3px_rgba(251,191,36,0.8),0_0_2px_#ffffff] ring-1 ring-white/80" />
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(barPercentage, 2)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`absolute top-0 bottom-0 left-0 opacity-20 pointer-events-none ${
                        tiedGroup
                          ? 'bg-rose-600'
                          : isSuplente
                          ? 'bg-blue-500'
                          : isSegundoSuplente
                          ? 'bg-slate-500'
                          : 'bg-slate-600'
                      }`}
                    />
                  )}

                  {/* COLUNA 1 (20 caracteres fixos): Posição + Nome */}
                  <div className="z-10 min-w-0 flex items-center gap-1 overflow-hidden">
                  <div
                    style={{
                      width: `${Math.round(18 * fontMultiplier)}px`,
                      height: `${Math.round(18 * fontMultiplier)}px`,
                      fontSize: `${(9 * fontMultiplier).toFixed(1)}px`,
                    }}
                    className={`rounded font-black flex items-center justify-center shrink-0 z-10 ${
                      tiedGroup
                        ? 'bg-rose-600 text-white border border-rose-400'
                        : isElected
                        ? 'bg-emerald-500 text-blue-950'
                        : isSuplente
                        ? 'bg-blue-900 text-blue-200 border border-blue-500/60'
                        : isSegundoSuplente
                        ? 'bg-slate-700 text-slate-200 border border-slate-500/60'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {rank}º
                  </div>

                    <h4
                      style={{
                        fontSize: `${(11.5 * fontMultiplier).toFixed(1)}px`,
                      }}
                      className={`font-bold truncate uppercase leading-tight min-w-0 ${
                        tiedGroup
                          ? 'text-white font-black'
                          : isElected
                          ? 'text-white'
                          : isSuplente
                          ? 'text-blue-100'
                          : isSegundoSuplente
                          ? 'text-slate-200'
                          : 'text-slate-300'
                      }`}
                    >
                      {option.name}
                    </h4>
                  </div>

                  {/* COLUNA 2: Badge (coluna própria) */}
                  <div className="z-10 min-w-0 flex items-center pl-1">
                    {tiedGroup ? (
                      <span className="text-[7.5px] px-1.5 py-0.2 rounded font-black bg-rose-600/80 border border-rose-400 text-white uppercase shrink-0 inline-flex items-center gap-0.5 shadow">
                        <Star className="w-2 h-2 fill-current" /> EMPATE
                      </span>
                    ) : isElected ? (
                      <span className="text-[7px] px-1 rounded-full font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50 shrink-0">
                        {live ? 'Titular' : 'Eleito'}
                      </span>
                    ) : isSuplente ? (
                      <span className="text-[7px] px-1 rounded-full font-bold bg-blue-950 text-blue-200 border border-blue-500/50 shrink-0">
                        {segundoSuplentesCount > 0 ? '1º Supl.' : 'Supl.'}
                      </span>
                    ) : isSegundoSuplente ? (
                      <span className="text-[7px] px-1 rounded-full font-bold bg-slate-900 text-slate-300 border border-slate-600/50 shrink-0">
                        2º Supl.
                      </span>
                    ) : null}
                  </div>

                  {/* COLUNA 3: Votos (puxado para a esquerda, 2 caracteres antes da %) */}
                  <div className="z-10 font-mono flex items-center justify-end gap-1 whitespace-nowrap" style={{ marginRight: '2ch' }}>
                    <span className="font-mono font-black text-xs text-amber-300 leading-none">{option.votesCount || 0}</span>
                  </div>

                  {/* COLUNA 4: % (5 caracteres fixos, alinhado à direita) */}
                  <div className="z-10 font-mono text-right text-[10px] font-black text-amber-300 whitespace-nowrap">
                    {sharePercentage}%
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="pt-1.5 text-center text-[9px] text-blue-300/70 border-t border-blue-900/60 flex items-center justify-center gap-1">
            <Lock className="w-2.5 h-2.5" />
            {live
              ? 'Aparelho travado • Parcial atualizada em tempo real'
              : 'Apuração Oficial Sincronizada em Tempo Real'}
          </div>
        </motion.div>
      </div>
    );
  };

  // 0. TELA DE ACESSO TRANCADO PELO ADMINISTRADOR (CADEADO ATIVO)
  if (isBlockedByLock) {
    return (
      <div className="min-h-[90vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-[#001f47] border-2 border-rose-500 rounded-3xl p-6 sm:p-8 shadow-[0_0_35px_rgba(244,63,94,0.35)] text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/20 border-2 border-rose-500/60 flex items-center justify-center shadow-lg">
            <Lock className="w-8 h-8 text-rose-400" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider mb-2 font-serif">
            Acesso Trancado
          </h2>
          <p className="text-sm text-blue-200 leading-relaxed mb-5">
            A entrada de novos votantes foi encerrada pela liderança da eleição. Novos aparelhos não podem acessar esta votação no momento.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-950/70 border border-rose-500/60 text-xs font-bold text-rose-300">
            <Lock className="w-3.5 h-3.5" />
            <span>SALA TRANCADA</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // 1. TELA DE AUTENTICAÇÃO POR PIN
  if (!isAuthenticated) {
    return (
      <div className="min-h-[90vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-[#001f47] border border-blue-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center"
        >
          <div className="flex justify-center mb-5">
            <IasdLogo className="w-20 h-20 shadow-2xl" customUrl={session.logoUrl} />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2 font-serif">VOTA IASD</h1>
          <p className="text-sm text-blue-200 mb-6">
            Digite a <strong className="text-amber-300">SENHA de 4 dígitos</strong> informada pelo líder ou exibida no telão:
          </p>

          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={enteredPin}
                onChange={(e) => {
                  setEnteredPin(e.target.value);
                  setPinError('');
                }}
                placeholder="Ex: 1844"
                className="w-full text-center text-3xl font-mono tracking-widest font-extrabold py-4 px-4 bg-[#07132a] border-2 border-blue-700 focus:border-[#d4af37] rounded-2xl text-white outline-none transition shadow-inner"
                autoFocus
              />
            </div>

            {pinError && (
              <p className="text-xs text-rose-400 font-medium flex items-center justify-center gap-1.5 bg-rose-950/40 py-2 rounded-lg border border-rose-800/40">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {pinError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-[#d4af37] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-blue-950 font-black text-base rounded-2xl shadow-lg transition active:scale-98 cursor-pointer uppercase tracking-wider"
            >
              Entrar na Votação
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-blue-900/60 text-xs text-blue-300/70 flex items-center justify-center gap-2">
            <Lock className="w-3.5 h-3.5" />
            Conexão Segura e Voto Secreto
          </div>
        </motion.div>
      </div>
    );
  }

  // 2. VOTAÇÃO ENCERRADA -> MOSTRA OS RESULTADOS COMPLETOS NO MOBILE!
  if (session.status === 'CLOSED') {
    return renderResults(false);
  }

  // 3. SALA DE ESPERA (Aguardando Admin Iniciar)
  if (session.status === 'WAITING') {
    return (
      <div className="min-h-[90vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md w-full bg-[#001f47]/90 border border-blue-800 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden"
        >
          <div className="relative w-36 h-36 mx-auto mb-8 flex items-center justify-center">
            <motion.div
              animate={{
                scale: [1, 1.25, 1],
                opacity: [0.3, 0.7, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute inset-0 rounded-full border-2 border-[#d4af37]/40 bg-[#d4af37]/10"
            />
            <motion.div
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: 12,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-2 rounded-full border-2 border-dashed border-blue-400/40"
            />
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl z-10 overflow-hidden">
              <IasdLogo className="w-20 h-20" customUrl={session.logoUrl} />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-600/40 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            Conectado • Aguarde o Início
          </span>

          <h2 className="text-2xl font-bold text-white mb-3 font-serif">
            A votação já irá começar
          </h2>

          <p className="text-sm text-blue-200/90 mb-6 leading-relaxed">
            Em instantes o coordenador irá iniciar a votação.
          </p>
        </motion.div>
      </div>
    );
  }

  // 4. VOTO JÁ COMPUTADO NESTA RODADA -> CÍRCULO GIRANDO + MENSAGEM, E APÓS 5s ENTRA NOS RESULTADOS
  if (alreadyVoted || submitSuccess) {
    if (showLiveResults) {
      return renderResults(true);
    }

    return (
      <div className="min-h-[90vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="max-w-md w-full bg-[#001f47] border border-emerald-500/40 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden"
        >
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Círculo com efeito de giro */}
          <div className="relative w-28 h-28 mx-auto mb-6 flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-4 border-emerald-400/20 border-t-emerald-400 border-r-emerald-300"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-3 rounded-full border-2 border-dashed border-[#d4af37]/60"
            />
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 12, stiffness: 160, delay: 0.2 }}
              className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-400 rounded-full flex items-center justify-center shadow-xl"
            >
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </motion.div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3 font-serif uppercase tracking-wide">
            SEU VOTO FOI COMPUTADO
          </h2>

          <p className="text-xs text-blue-300/80 mt-4 italic">
            Abrindo os resultados em tempo real...
          </p>

          {/* Barra de progresso de 5 segundos */}
          <div className="mt-3 h-1.5 w-full bg-blue-950 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 5, ease: 'linear' }}
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300"
            />
          </div>
        </motion.div>
      </div>
    );
  }

  // 5. TELA DE VOTAÇÃO ATIVA (Cards grandes para toques precisos)
  const isReadyToConfirm = selectedIds.length === maxVotes;
  const remainingVotes = Math.max(0, maxVotes - selectedIds.length);

  return (
    <div className="max-w-xl mx-auto px-4 py-5 pb-36">
      {/* Alerta de Desempate (se aplicável) */}
      {isTieBreak && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-4 rounded-2xl bg-amber-950/80 border-2 border-amber-500 shadow-lg text-amber-100 flex items-center gap-3"
        >
          <Flame className="w-7 h-7 text-amber-400 shrink-0 animate-bounce" />
          <div>
            <h3 className="font-bold text-sm text-amber-300 uppercase tracking-wide">
              Rodada de Desempate!
            </h3>
            <p className="text-xs text-amber-200/90">
              Escolha apenas <strong className="text-white underline">{maxVotes} {maxVotes === 1 ? 'nome' : 'nomes'}</strong> entre os candidatos abaixo.
            </p>
          </div>
        </motion.div>
      )}

      {/* CABEÇALHO: FONTE BONITA E MENOR, FUNDO VERDE PETRÓLEO TEXTURIZADO, LINHA BEGE NO RODAPÉ */}
      {/* Formato: Escolha xx nomes (decrescente) | eleição do tesoureiro | A A */}
      <div
        className={`${isTieBreak ? 'rounded-xl' : '-mx-4 -mt-5'} mb-4 px-3.5 py-2.5 border-b-[3px] border-[#e6d3a8] shadow-lg`}
        style={{
          fontFamily: '"Plus Jakarta Sans", "Inter", "Segoe UI", system-ui, sans-serif',
          backgroundColor: '#0b4a4a',
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 2px, transparent 2px, transparent 6px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 5px), linear-gradient(180deg, #0f5c5a 0%, #083b3c 100%)',
        }}
      >
        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm text-white">
          {/* Esquerda: Escolha xx nomes (diminui conforme vai escolhendo) */}
          <div className="flex items-center gap-1.5 font-semibold shrink-0">
            <span>Escolha</span>
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-[#064e3b] border border-amber-400 text-amber-300 font-mono font-black text-xs shadow-sm leading-none">
              <motion.span
                key={remainingVotes}
                initial={{ scale: 1.3, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {String(remainingVotes).padStart(2, '0')}
              </motion.span>
            </span>
            <span>{remainingVotes === 1 ? 'nome' : 'nomes'}</span>
          </div>

          <span className="text-[#e6d3a8]/50 font-light select-none">|</span>

          {/* Centro: Título da eleição */}
          <div className="flex-1 min-w-0 text-center font-medium text-[#f4ead2] truncate px-1">
            {session.title}
          </div>

          <span className="text-[#e6d3a8]/50 font-light select-none">|</span>

          {/* Direita: Botões A(menor) e A(maior) bem mais juntos (espaço de apenas 1 caractere) */}
          <div className="flex items-center gap-0.5 select-none shrink-0">
            <button
              type="button"
              onClick={decreaseFont}
              disabled={fontScalePercent === 0}
              title="Reduzir fonte dos cards (mínimo)"
              className={`w-5 h-7 p-0 flex items-center justify-center border-none bg-transparent outline-none transition-all active:scale-90 cursor-pointer ${
                fontScalePercent === 0
                  ? 'opacity-25 cursor-not-allowed text-[#e6d3a8]/40'
                  : 'text-[#f4ead2] hover:text-amber-300'
              }`}
            >
              <span className="text-xs font-bold leading-none pointer-events-none">A</span>
            </button>
            <button
              type="button"
              onClick={increaseFont}
              disabled={fontScalePercent === 24}
              title="Aumentar fonte dos cards (limite +24%)"
              className={`w-5 h-7 p-0 flex items-center justify-center border-none bg-transparent outline-none transition-all active:scale-90 cursor-pointer ${
                fontScalePercent === 24
                  ? 'opacity-25 cursor-not-allowed text-[#e6d3a8]/40'
                  : 'text-[#f4ead2] hover:text-amber-300'
              }`}
            >
              <span className="text-lg font-black leading-none pointer-events-none">A</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODALZINHO LARANJA: FIXO NA TELA VISÍVEL DO CELULAR (SEMPRE VISÍVEL MESMO ROLADO ATÉ O FIM) */}
      <AnimatePresence mode="wait">
        {errorMessage && (
          <motion.div
            key={`aviso-quica-${errorTrigger}-${errorMessage}`}
            onClick={() => setErrorMessage('')}
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
            <div className="flex-1">
              {errorMessage === 'LIMIT_EXCEEDED' ? (
                <div className="flex flex-col items-center text-center gap-1">
                  <span className="font-black text-sm sm:text-base tracking-wide uppercase text-white drop-shadow">
                    VOCÊ JÁ ESCOLHEU {String(maxVotes).padStart(2, '0')}
                  </span>
                  <span className="text-[13px] sm:text-[14px] text-emerald-100 font-bold tracking-normal normal-case leading-snug">
                    Para escolher outro, desmarque algum.
                  </span>
                </div>
              ) : (
                <span className="text-xs sm:text-sm font-black uppercase text-center block drop-shadow text-white">
                  {errorMessage}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de Cards Compactos (Touch Acessível - 2 colunas no mobile ou 1 centralizada se poucos) */}
      {(() => {
        const isFewCandidates = options.length <= 3;
        return (
          <div
            className={
              isFewCandidates
                ? 'grid grid-cols-1 max-w-sm mx-auto gap-2.5 w-full'
                : 'grid grid-cols-2 gap-2 sm:gap-2.5 w-full'
            }
          >
            {options.map((option) => {
              const isSelected = selectedIds.includes(option.id);

              return (
                <motion.div
                  key={option.id}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleToggleCandidate(option.id)}
                  style={{
                    minHeight: `${Math.round(42 * fontMultiplier)}px`,
                  }}
                  className={`py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-xl border-2 transition-all duration-150 cursor-pointer select-none flex items-center justify-between gap-2 shadow-sm relative overflow-hidden active:scale-95 ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-900/90 to-[#002f6c] border-[#d4af37] ring-2 ring-[#d4af37]/40 shadow-amber-900/20'
                      : 'bg-[#001f47]/70 hover:bg-[#001f47] border-blue-900/80 text-slate-200'
                  }`}
                >
                  {/* Informações do Candidato (Sem letra à esquerda) */}
                  <div className="flex-1 min-w-0 pr-1">
                    <h4
                      className={`font-black leading-tight uppercase truncate ${
                        isSelected ? 'text-white' : 'text-slate-100'
                      }`}
                      style={{
                        fontSize: `${(13 * fontMultiplier).toFixed(1)}px`,
                      }}
                    >
                      {option.name}
                    </h4>
                    {option.subtitle && (
                      <p className="text-[10px] text-blue-200/75 mt-0.5 truncate">
                        {option.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Indicador Touch Circular */}
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      isSelected
                        ? 'border-[#d4af37] bg-[#d4af37] text-blue-950 scale-105'
                        : 'border-blue-700 bg-blue-950/60'
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 font-black stroke-[3]" />}
                  </div>
                </motion.div>
              );
            })}
          </div>
        );
      })()}

      {/* BARRA FLUTUANTE INFERIOR COM O BOTÃO CONFIRMA (20% MENOR NA LARGURA, EFEITO 3D DE PRESSIONAR E BRILHO RELUZENTE) */}
      <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-[#00132b]/95 backdrop-blur-lg border-t border-blue-900/80 z-40">
        <div className="max-w-xl mx-auto flex items-center justify-center">
          {/* BOTÃO CONFIRMA - RÉPLICA 3D DA TECLA VERDE DA URNA COM ANIMAÇÃO DE CLIQUE, PRESSIONAR E BRILHO */}
          <motion.button
            type="button"
            onClick={handleConfirmVote}
            onTouchStart={() => {
              if (isReadyToConfirm && !isSubmitting) setIsButtonPressed(true);
            }}
            onTouchEnd={() => setIsButtonPressed(false)}
            onTouchCancel={() => setIsButtonPressed(false)}
            onMouseDown={() => {
              if (isReadyToConfirm && !isSubmitting) setIsButtonPressed(true);
            }}
            onMouseUp={() => setIsButtonPressed(false)}
            onMouseLeave={() => setIsButtonPressed(false)}
            whileTap={isReadyToConfirm && !isSubmitting ? { scale: 0.94, y: 5 } : undefined}
            disabled={!isReadyToConfirm || isSubmitting}
            style={
              isReadyToConfirm
                ? isButtonPressed || isButtonShining
                  ? {
                      backgroundColor: '#1eb843',
                      borderColor: '#42e86e',
                      boxShadow: '0 2px 0 #074215, 0 0 25px rgba(52, 211, 153, 0.85)',
                      transform: 'translateY(5px)',
                    }
                  : {
                      backgroundColor: '#159636',
                      borderColor: '#24b349',
                      boxShadow: '0 8px 0 #09521b, 4px 8px 0 #063b13',
                    }
                : {
                    backgroundColor: '#1b3d2b',
                    borderColor: '#234d37',
                    boxShadow: '0 5px 0 #0f2419',
                  }
            }
            className={`w-[80%] max-w-sm pt-2.5 pb-3 px-5 rounded-[18px] border-[3.5px] flex flex-col items-center justify-center transition-all duration-100 select-none relative overflow-hidden ${
              isReadyToConfirm
                ? 'cursor-pointer active:scale-95'
                : 'opacity-45 cursor-not-allowed'
            } ${isButtonShining ? 'ring-4 ring-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.95)]' : ''}`}
          >
            {/* Efeito de Raio de Brilho Reluzente passando pelo botão no clique */}
            <AnimatePresence>
              {isButtonShining && (
                <motion.div
                  key="shine-flash"
                  initial={{ x: '-120%', opacity: 0 }}
                  animate={{ x: '220%', opacity: [0, 0.9, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/85 to-transparent skew-x-[-25deg] pointer-events-none z-20"
                />
              )}
            </AnimatePresence>

            {/* Texto CONFIRMA em preto e negrito oficial */}
            <span
              className={`font-black text-2xl sm:text-3xl tracking-wider uppercase font-sans leading-none z-10 ${
                isReadyToConfirm ? 'text-[#1a1a1a]' : 'text-slate-400'
              }`}
            >
              CONFIRMA
            </span>

            {/* Pontos em Braille 3D idênticos à imagem enviada */}
            <div className="flex flex-col items-center gap-1 mt-2 pointer-events-none z-10">
              {/* Linha 1 */}
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className="w-3" />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
              </div>
              {/* Linha 2 */}
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 opacity-0" />
                <span className="w-2.5 h-2.5 opacity-0" />
                <span className="w-2.5 h-2.5 opacity-0" />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className="w-2.5 h-2.5 opacity-0" />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className="w-2.5 h-2.5 opacity-0" />
              </div>
              {/* Linha 3 */}
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 opacity-0" />
                <span className="w-2.5 h-2.5 opacity-0" />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className="w-3" />
                <span className={`w-2.5 h-2.5 rounded-full ${isReadyToConfirm ? 'bg-[#24b84b] shadow-[1.5px_2px_0_#074215]' : 'bg-[#12281c]'}`} />
                <span className="w-2.5 h-2.5 opacity-0" />
                <span className="w-2.5 h-2.5 opacity-0" />
                <span className="w-2.5 h-2.5 opacity-0" />
              </div>
            </div>
          </motion.button>
        </div>
      </div>
    </div>
  );
};