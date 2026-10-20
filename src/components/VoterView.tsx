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
  CheckCircle,
} from 'lucide-react';
import type { VotingSession } from '../types';
import { submitBallot, hasVoted } from '../services/votingService';
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

  // Total de votos registrados na rodada atual
  const totalVotesRecorded = options.reduce((acc, curr) => acc + (curr.votesCount || 0), 0);

  // Verifica se o dispositivo já votou nesta iteração específica:
  // Se estiver em WAITING ou CLOSED, ou apuração zerada, não trava como "já votou"
  const alreadyVoted =
    session.status !== 'WAITING' &&
    session.status !== 'CLOSED' &&
    totalVotesRecorded > 0 &&
    hasVoted(session.id, currentRound, session.votingIteration || 1);

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

  // Se a apuração for zerada pelo líder, destrava o aparelho imediatamente
  useEffect(() => {
    if (totalVotesRecorded === 0) {
      setSubmitSuccess(false);
    }
  }, [totalVotesRecorded]);

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
    const { s1Count, s2Count } = getEffectiveSuplentes(session);
    const vacancies = session.vacancies || 1;
    const suplentesCount = s1Count;
    const segundoSuplentesCount = s2Count;
    const detectedTies = detectVotingTies(session);
    const hasTies = detectedTies.length > 0;

    const sortedOptions = [...session.options].sort((a, b) => (b.votesCount || 0) - (a.votesCount || 0));
    const maxVotesRecorded = Math.max(...session.options.map((o) => o.votesCount || 0), 1);
    const totalVotesCast = session.options.reduce((acc, curr) => acc + (curr.votesCount || 0), 0);

    return (
      <div className="max-w-xl mx-auto px-3.5 py-4 pb-16 min-h-[90vh]">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#001f47] border border-blue-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4"
        >
          {/* Cabeçalho de Resultados */}
          <div className="text-center pb-3 border-b border-blue-900/80">
            <div className="flex justify-center mb-2">
              <IasdLogo className="w-14 h-14" customUrl={session.logoUrl} />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/60 mb-2 shadow-sm">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Resultado Oficial da Votação
            </span>
            <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
              {session.title}
            </h2>
            <p className="text-xs text-blue-200 mt-1">
              Total de Votos Registrados: <strong className="text-amber-300 font-mono font-bold">{totalVotesCast}</strong>
            </p>
          </div>

          {/* Banner de Empate (se houver empate na fronteira) */}
          {hasTies && (
            <div className="p-3 rounded-2xl bg-amber-950/90 border-2 border-amber-400 text-amber-200 shadow-xl space-y-1.5 animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <h4 className="font-extrabold text-xs uppercase tracking-wide text-white">
                  Empate Detectado na Apuração!
                </h4>
              </div>
              <p className="text-[11px] leading-snug text-amber-100">
                Há empate em: <strong>{detectedTies.map((t) => t.label).join(' • ')}</strong>.
              </p>
              <div className="text-[10px] text-amber-200/90 space-y-1 pt-1 border-t border-amber-700/60 font-mono">
                {detectedTies.map((t, idx) => (
                  <div key={idx}>
                    • <strong>{t.label}</strong> ({t.votesCount} {t.votesCount === 1 ? 'voto' : 'votos'}): {t.tiedCandidates.map((c) => c.name).join(', ')}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-amber-300 font-bold italic pt-0.5">
                Aguarde o líder iniciar a rodada de desempate neste aparelho.
              </p>
            </div>
          )}

          {/* Lista de Candidatos e Contagem de Votos */}
          <div className="space-y-1.5">
            {sortedOptions.map((option, index) => {
              const rank = index + 1;
              const isElected = rank <= vacancies;
              const isSuplente = !isElected && rank <= vacancies + suplentesCount;
              const isSegundoSuplente =
                !isElected && !isSuplente && rank <= vacancies + suplentesCount + segundoSuplentesCount;
              const percentage = Math.round(((option.votesCount || 0) / maxVotesRecorded) * 100);

              const tiedGroup = detectedTies.find((t) => t.tiedCandidates.some((c) => c.id === option.id));

              return (
                <div
                  key={option.id}
                  className={`p-2.5 rounded-xl border relative overflow-hidden flex items-center gap-2.5 transition-all ${
                    tiedGroup
                      ? 'bg-[#351e06] border-amber-400 shadow-md ring-1 ring-amber-400/50'
                      : isElected
                      ? 'bg-[#052e1c] border-emerald-500/80 text-white shadow-sm'
                      : isSuplente
                      ? 'bg-[#2b0c10] border-red-700/70 text-red-100'
                      : isSegundoSuplente
                      ? 'bg-[#2b180a] border-amber-700/70 text-amber-100'
                      : 'bg-[#07132a]/70 border-blue-900/40 text-slate-400'
                  }`}
                >
                  {/* Barra de Progresso Animada no Fundo */}
                  <div
                    style={{ width: `${Math.max(percentage, 2)}%` }}
                    className={`absolute top-0 bottom-0 left-0 opacity-20 pointer-events-none ${
                      tiedGroup
                        ? 'bg-amber-400'
                        : isElected
                        ? 'bg-emerald-400'
                        : isSuplente
                        ? 'bg-red-500'
                        : isSegundoSuplente
                        ? 'bg-amber-500'
                        : 'bg-slate-600'
                    }`}
                  />

                  {/* Posição */}
                  <div
                    className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 z-10 ${
                      tiedGroup
                        ? 'bg-amber-400 text-blue-950 ring-1 ring-amber-300'
                        : isElected
                        ? 'bg-emerald-500 text-blue-950 font-bold'
                        : isSuplente
                        ? 'bg-red-900 text-red-200 border border-red-700'
                        : isSegundoSuplente
                        ? 'bg-amber-900 text-amber-200 border border-amber-700'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {rank}º
                  </div>

                  {/* Nome do Candidato e Badge */}
                  <div className="flex-1 min-w-0 z-10">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4
                        className={`font-bold text-xs truncate uppercase leading-snug ${
                          tiedGroup
                            ? 'text-amber-200 font-black'
                            : isElected
                            ? 'text-white'
                            : isSuplente
                            ? 'text-red-100'
                            : isSegundoSuplente
                            ? 'text-amber-100'
                            : 'text-slate-300'
                        }`}
                      >
                        {option.name}
                      </h4>

                      {tiedGroup ? (
                        <span className="text-[8.5px] px-1.5 py-0.2 rounded-full font-black bg-amber-400 text-blue-950 uppercase animate-pulse">
                          Empate ({tiedGroup.label})
                        </span>
                      ) : isElected ? (
                        <span className="text-[8.5px] px-1.5 py-0.2 rounded-full font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50 flex items-center gap-0.5">
                          <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                          Eleito Titular
                        </span>
                      ) : isSuplente ? (
                        <span className="text-[8.5px] px-1.5 py-0.2 rounded-full font-bold bg-red-950 text-red-300 border border-red-700/50">
                          {segundoSuplentesCount > 0 ? '1º Suplente' : 'Suplente'}
                        </span>
                      ) : isSegundoSuplente ? (
                        <span className="text-[8.5px] px-1.5 py-0.2 rounded-full font-bold bg-amber-950 text-amber-300 border border-amber-700/50">
                          2º Suplente
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Quantidade de Votos */}
                  <div className="text-right z-10 shrink-0 font-mono">
                    <span className="font-extrabold text-xs text-white">
                      {option.votesCount || 0}
                    </span>
                    <span className="text-[9.5px] text-blue-200 ml-0.5">
                      {option.votesCount === 1 ? 'voto' : 'votos'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 text-center text-[10px] text-blue-300/70 border-t border-blue-900/60 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3" />
            Apuração Oficial Sincronizada em Tempo Real
          </div>
        </motion.div>
      </div>
    );
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

  // 4. TELA DE SUCESSO / VOTO JÁ COMPUTADO NESTA RODADA
  if (alreadyVoted || submitSuccess) {
    return (
      <div className="min-h-[90vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="max-w-md w-full bg-[#001f47] border border-emerald-500/40 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden"
        >
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="w-24 h-24 bg-emerald-500/20 border-2 border-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
            <CheckCircle2 className="w-14 h-14 text-emerald-400" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3 font-serif uppercase tracking-wide">
            SEU VOTO FOI COMPUTADO!
          </h2>

          <p className="text-sm text-blue-200 mb-6 leading-relaxed">
            Seu voto foi registrado com sigilo e segurança. Seu aparelho foi travado para garantir a legitimidade da apuração.
          </p>

          <div className="bg-[#07132a]/80 rounded-2xl p-4 border border-blue-900/80 text-left space-y-2">
            <div className="flex items-center justify-between text-xs text-blue-300">
              <span>Pauta:</span>
              <span className="font-semibold text-white truncate max-w-[200px]">{session.title}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-blue-300">
              <span>Status:</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Voto Registrado
              </span>
            </div>
          </div>

          <p className="text-xs text-blue-300/80 mt-6 italic">
            Aguarde o encerramento da votação pelo líder para conferir os resultados oficiais nesta tela.
          </p>
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

      {/* TÍTULO LIMPO CONFORME SOLICITADO PELO USUÁRIO (SEM O BOX ANTERIOR) */}
      <div className="mb-5 text-center pt-1">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white font-serif tracking-tight flex flex-wrap items-center justify-center gap-2">
          <span>VOTA IASD</span>
          <span className="text-slate-500 font-light">|</span>
          <span>
            Escolha <span className="text-amber-400 font-black text-2xl sm:text-3xl underline decoration-amber-500 underline-offset-4">{maxVotes}</span> {maxVotes === 1 ? 'nome' : 'nomes'}
          </span>
        </h1>

        {/* Indicador de Status dos Votos */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <span
            className={`text-xs px-3.5 py-1 rounded-full font-bold transition-all ${
              isReadyToConfirm
                ? 'bg-emerald-950 text-emerald-300 border-2 border-emerald-500 shadow-md animate-pulse'
                : 'bg-blue-950 text-blue-200 border border-blue-800'
            }`}
          >
            {isReadyToConfirm ? (
              <span className="flex items-center gap-1.5 font-extrabold text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Meta atingida ({selectedIds.length} de {maxVotes}) • Clique em CONFIRMA abaixo
              </span>
            ) : (
              <span>
                Selecionados: <strong className="text-amber-300 font-bold">{selectedIds.length}</strong> de <strong className="text-white">{maxVotes}</strong>
                <span className="text-slate-300 ml-1.5">
                  (Marque mais {maxVotes - selectedIds.length} {maxVotes - selectedIds.length === 1 ? 'nome' : 'nomes'} para liberar o CONFIRMA)
                </span>
              </span>
            )}
          </span>
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
                  className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer select-none flex items-center gap-2 sm:gap-2.5 shadow-md relative overflow-hidden active:scale-95 ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-900/90 to-[#002f6c] border-[#d4af37] ring-2 ring-[#d4af37]/40 shadow-amber-900/20'
                      : 'bg-[#001f47]/70 hover:bg-[#001f47] border-blue-900/80 text-slate-200'
                  }`}
                >
                  {/* Foto ou Avatar com Iniciais */}
                  <div className="relative shrink-0">
                    {option.photoUrl ? (
                      <img
                        src={option.photoUrl}
                        alt={option.name}
                        className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover border-2 border-blue-600/50 shadow"
                      />
                    ) : (
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-800 to-indigo-900 border-2 border-blue-500/40 flex items-center justify-center text-amber-300 font-extrabold text-xs sm:text-sm shadow">
                        {option.name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </div>
                    )}

                    {/* Badge de Selecionado */}
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-[#d4af37] text-blue-950 rounded-full flex items-center justify-center shadow-lg border border-white">
                        <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 font-bold" />
                      </div>
                    )}
                  </div>

                  {/* Informações do Candidato */}
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`font-bold text-xs sm:text-sm leading-snug line-clamp-2 ${
                        isSelected ? 'text-white' : 'text-slate-100'
                      }`}
                    >
                      {option.name}
                    </h4>
                    {option.subtitle && (
                      <p className="text-[10px] sm:text-xs text-blue-200/75 mt-0.5 truncate">
                        {option.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Indicador Touch */}
                  <div
                    className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'border-[#d4af37] bg-[#d4af37] text-blue-950'
                        : 'border-blue-700 bg-blue-950/60'
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 font-extrabold" />}
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
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            disabled={selectedIds.length === 0 || isSubmitting}
            className="px-4 py-3.5 rounded-xl border border-rose-800/60 text-rose-300 hover:bg-rose-950/40 text-xs font-bold transition disabled:opacity-30 disabled:pointer-events-none active:scale-95 cursor-pointer uppercase"
          >
            CORRIGE
          </button>

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
