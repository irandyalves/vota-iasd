import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Lock,
  Sparkles,
  AlertCircle,
  ShieldAlert,
  Flame,
} from 'lucide-react';
import type { VotingSession } from '../types';
import { submitBallot, hasVoted } from '../services/votingService';
import { urnaAudio } from '../utils/audio';
import { IasdLogo } from './IasdLogo';

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
  // Se a apuração estiver zerada (totalVotesRecorded === 0), o celular é liberado imediatamente
  const alreadyVoted = totalVotesRecorded > 0 && hasVoted(session.id, currentRound, session.votingIteration || 1);

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

  // Limpa seleções se a rodada, iteração ou status mudar
  useEffect(() => {
    setSelectedIds([]);
    setErrorMessage('');
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

  // 2. TELA DE SUCESSO / VOTO JÁ COMPUTADO
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

  // 4. VOTAÇÃO ENCERRADA
  if (session.status === 'CLOSED') {
    return (
      <div className="min-h-[90vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#001f47] border border-blue-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-20 h-20 bg-blue-900/40 border border-blue-600/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-10 h-10 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 font-serif">Votação Encerrada</h2>
          <p className="text-sm text-blue-200 mb-6">
            O período de votação desta sessão foi finalizado. Confira a apuração e o resultado final no telão da igreja!
          </p>
        </div>
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

      {/* Lista de Cards Grandes (Touch Acessível) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((option) => {
          const isSelected = selectedIds.includes(option.id);

          return (
            <motion.div
              key={option.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleToggleCandidate(option.id)}
              className={`p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer select-none flex items-center gap-3.5 shadow-md relative overflow-hidden ${
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
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-blue-600/50 shadow"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-800 to-indigo-900 border-2 border-blue-500/40 flex items-center justify-center text-amber-300 font-extrabold text-lg shadow">
                    {option.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                )}

                {/* Badge de Selecionado */}
                {isSelected && (
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-[#d4af37] text-blue-950 rounded-full flex items-center justify-center shadow-lg border border-white">
                    <CheckCircle2 className="w-4 h-4 font-bold" />
                  </div>
                )}
              </div>

              {/* Informações do Candidato */}
              <div className="flex-1 min-w-0">
                <h4
                  className={`font-bold text-base leading-tight truncate ${
                    isSelected ? 'text-white' : 'text-slate-100'
                  }`}
                >
                  {option.name}
                </h4>
                {option.subtitle && (
                  <p className="text-xs text-blue-200/75 mt-0.5 truncate">
                    {option.subtitle}
                  </p>
                )}
              </div>

              {/* Indicador Touch */}
              <div
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? 'border-[#d4af37] bg-[#d4af37] text-blue-950'
                    : 'border-blue-700 bg-blue-950/60'
                }`}
              >
                {isSelected && <CheckCircle2 className="w-4 h-4 font-extrabold" />}
              </div>
            </motion.div>
          );
        })}
      </div>

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
