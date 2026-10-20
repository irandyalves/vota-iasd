import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Lock,
  Sparkles,
  AlertCircle,
  Flame,
  Trophy,
  AlertTriangle,
} from 'lucide-react';
import type { VotingSession } from '../types';
import { submitBallot, hasVoted, verifyBallotOnServer, clearVotedFlag } from '../services/votingService';
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

  // Auto-login se já autenticado antes nesta sessão ou se o QR Code já trouxe o PIN na URL
  useEffect(() => {
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
  }, [session.id, session.pin]);

  // Limpa seleções e reseta trava de sucesso se a rodada, iteração ou status mudar
  useEffect(() => {
    setSelectedIds([]);
    setErrorMessage('');
    setSubmitSuccess(false);
  }, [session.status, currentRound, session.votingIteration]);

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
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

    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      if (selectedIds.length >= maxVotes) {
        setErrorMessage(`Você já selecionou a quantidade de ${maxVotes} ${maxVotes === 1 ? 'nome' : 'nomes'}. Desmarque um para trocar.`);
        return;
      }
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleConfirmVote = async () => {
    // Bloqueia duplo toque / reenvio
    if (isSubmitting || submitSuccess || alreadyVoted) return;
    // Só permite confirmar se atingiu exatamente a quantidade definida
    if (selectedIds.length !== maxVotes) {
      setErrorMessage(`É obrigatório selecionar exatamente ${maxVotes} ${maxVotes === 1 ? 'nome' : 'nomes'} para confirmar.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const res = await submitBallot(session, selectedIds, currentRound);

    if (res.success) {
      // 🔔 Toca o som oficial da Urna Eletrônica do TSE!
      urnaAudio.playTseConfirma();

      // Vibração tátil no celular
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
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
          <div className="text-center pb-2 border-b border-blue-900/80">
            <span
              className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border mb-1 shadow-sm ${
                live
                  ? 'bg-blue-950 text-sky-300 border-sky-500/60'
                  : 'bg-emerald-950 text-emerald-300 border-emerald-500/60'
              }`}
            >
              {live ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {liveTie ? 'Desempate • Parcial em Tempo Real' : 'Parcial em Tempo Real'}
                </>
              ) : (
                <>
                  <Trophy className="w-3 h-3 text-amber-400" />
                  Resultado Oficial da Votação
                </>
              )}
            </span>
            <h2 className="text-sm font-black text-white uppercase tracking-tight leading-tight">
              {session.title}
            </h2>
            <p className="text-[10px] text-blue-200 mt-0.5">
              Total de votos: <strong className="text-amber-300 font-mono font-bold">{totalVotesCast}</strong>
              {live && (
                <span className="ml-2 text-emerald-400 font-bold inline-flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Seu voto foi computado
                </span>
              )}
            </p>
          </div>

          {/* Banner de Empate (somente no resultado oficial) */}
          {hasTies && (
            <div className="p-2 rounded-xl bg-amber-950/90 border-2 border-amber-400 text-amber-200 shadow-xl space-y-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <h4 className="font-extrabold text-[10px] uppercase tracking-wide text-white">
                  Empate Detectado na Apuração!
                </h4>
              </div>
              <div className="text-[9px] text-amber-200/90 space-y-0.5 font-mono">
                {detectedTies.map((t, idx) => (
                  <div key={idx}>
                    • <strong>{t.label}</strong> ({t.votesCount} {t.votesCount === 1 ? 'voto' : 'votos'}): {t.tiedCandidates.map((c) => c.name).join(', ')}
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-amber-300 font-bold italic">
                Aguarde o líder iniciar a rodada de desempate neste aparelho.
              </p>
            </div>
          )}

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
                  style={{ gridTemplateColumns: '20ch minmax(0,1fr) auto 5ch' }}
                  className={`${hasCategorySeparator ? 'mt-3' : ''} py-1 px-2 rounded-lg border relative overflow-hidden grid items-center text-[10px] min-h-[26px] ${
                    tiedGroup
                      ? 'bg-[#351e06] border-amber-400 ring-1 ring-amber-400/50'
                      : isElected
                      ? 'bg-[#052e1c] border-emerald-500/80 text-white'
                      : isSuplente
                      ? 'bg-[#092350]/95 border-blue-500/80 text-blue-100'
                      : isSegundoSuplente
                      ? 'bg-slate-800/85 border-slate-600/80 text-slate-200'
                      : 'bg-[#07132a]/70 border-blue-900/40 text-slate-400'
                  }`}
                >
                  {/* Barra de Progresso no Fundo */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(barPercentage, 2)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={`absolute top-0 bottom-0 left-0 opacity-20 pointer-events-none ${
                      tiedGroup
                        ? 'bg-amber-400'
                        : isElected
                        ? 'bg-emerald-400'
                        : isSuplente
                        ? 'bg-blue-500'
                        : isSegundoSuplente
                        ? 'bg-slate-500'
                        : 'bg-slate-600'
                    }`}
                  />

                  {/* COLUNA 1 (20 caracteres fixos): Posição + Nome */}
                  <div className="z-10 min-w-0 flex items-center gap-1 overflow-hidden">
                  <div
                    className={`w-[18px] h-[18px] rounded text-[9px] font-black flex items-center justify-center shrink-0 z-10 ${
                      tiedGroup
                        ? 'bg-amber-400 text-blue-950'
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
                      className={`font-bold text-[10px] truncate uppercase leading-tight min-w-0 ${
                        tiedGroup
                          ? 'text-amber-200 font-black'
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
                      <span className="text-[7px] px-1 rounded-full font-black bg-amber-400 text-blue-950 uppercase shrink-0">
                        Empate
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
                    <span className="text-[8px] text-slate-300/80 uppercase font-bold">votos</span>
                    <span className="font-extrabold text-[10px] text-white">{option.votesCount || 0}</span>
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
            Aguardando liberação do líder...
          </h2>

          <p className="text-sm text-blue-200/90 mb-6 leading-relaxed">
            Você está conectado. Assim que o líder clicar em <strong>"INICIAR VOTAÇÃO"</strong>, as opções aparecerão automaticamente nesta tela.
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

      {/* CABEÇALHO: ARIAL NARROW, FUNDO VERDE PETRÓLEO TEXTURIZADO, LINHA BEGE NO RODAPÉ */}
      <div
        className={`${isTieBreak ? 'rounded-xl' : '-mx-4 -mt-5'} mb-4 px-4 py-3 border-b-[3px] border-[#e6d3a8] shadow-lg`}
        style={{
          fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue Condensed", Arial, sans-serif',
          backgroundColor: '#0b4a4a',
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 2px, transparent 2px, transparent 6px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 5px), linear-gradient(180deg, #0f5c5a 0%, #083b3c 100%)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-white uppercase tracking-wide text-xl sm:text-2xl leading-none flex items-baseline gap-2">
            <span>Escolha</span>
            <span className="font-black text-amber-300" style={{ fontSize: '1.15em' }}>
              {maxVotes}
            </span>
            <span>{maxVotes === 1 ? 'nome' : 'nomes'}</span>
          </h1>

          {/* Contador de selecionados: o número da esquerda aumenta a cada clique */}
          <div
            className={`text-sm font-bold tabular-nums flex items-baseline shrink-0 ${
              isReadyToConfirm ? 'text-emerald-300' : 'text-[#e6d3a8]'
            }`}
          >
            <motion.span
              key={selectedIds.length}
              initial={{ scale: 1.6, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 12, stiffness: 300 }}
              className="inline-block font-black text-base"
            >
              {selectedIds.length}
            </motion.span>
            <span className="opacity-80">/{maxVotes}</span>
          </div>
        </div>
      </div>

      {/* Mensagem de Erro ou Validação */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-700/60 text-rose-200 text-xs font-semibold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            {errorMessage}
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
                  className={`py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-xl border-2 transition-all duration-150 cursor-pointer select-none flex items-center justify-between gap-2 shadow-sm relative overflow-hidden active:scale-95 min-h-[42px] ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-900/90 to-[#002f6c] border-[#d4af37] ring-2 ring-[#d4af37]/40 shadow-amber-900/20'
                      : 'bg-[#001f47]/70 hover:bg-[#001f47] border-blue-900/80 text-slate-200'
                  }`}
                >
                  {/* Informações do Candidato (Sem letra à esquerda) */}
                  <div className="flex-1 min-w-0 pr-1">
                    <h4
                      className={`font-black text-xs sm:text-[13px] leading-tight uppercase truncate ${
                        isSelected ? 'text-white' : 'text-slate-100'
                      }`}
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

      {/* BARRA FLUTUANTE INFERIOR COM O BOTÃO CONFIRMA (RÉPLICA DA TECLA VERDE DA URNA DO TSE) */}
      <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-[#00132b]/95 backdrop-blur-lg border-t border-blue-900/80 z-40">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          {/* BOTÃO CONFIRMA - RÉPLICA OFICIAL DA URNA TSE (COM BRAILLE) */}
          <button
            type="button"
            onClick={handleConfirmVote}
            disabled={!isReadyToConfirm || isSubmitting}
            className={`flex-1 py-3 px-6 rounded-2xl flex flex-col items-center justify-center transition-all duration-200 select-none shadow-2xl relative ${
              isReadyToConfirm
                ? 'bg-[#00a859] hover:bg-[#00964f] active:translate-y-1 active:shadow-md border-b-4 border-[#006837] cursor-pointer ring-4 ring-[#00a859]/30 animate-pulse'
                : 'bg-[#1b3d2b] border-b-4 border-[#12281c] opacity-40 cursor-not-allowed text-slate-500'
            }`}
          >
            {/* Texto CONFIRMA em preto e negrito oficial */}
            <span
              className={`font-black text-2xl sm:text-3xl tracking-widest uppercase font-sans ${
                isReadyToConfirm ? 'text-[#111111]' : 'text-slate-400'
              }`}
            >
              CONFIRMA
            </span>

            {/* Pontos em Braille da Urna Eletrônica (como na imagem 3 enviada pelo usuário) */}
            <div className="flex items-center gap-1 mt-1 opacity-70 pointer-events-none">
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className="w-1" />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className="w-1" />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isReadyToConfirm ? 'bg-[#005c2e]' : 'bg-[#12281c]'}`} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
