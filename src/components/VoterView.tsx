import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Lock,
  Vote,
  Sparkles,
  AlertCircle,
  KeyRound,
  ShieldAlert,
  Flame,
} from 'lucide-react';
import type { VotingSession } from '../types';
import { submitBallot, hasVoted } from '../services/votingService';
import { urnaAudio } from '../utils/audio';

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

  // Verifica se o dispositivo já votou
  const alreadyVoted = hasVoted(session.id, currentRound);

  // Auto-login se já autenticado antes nesta sessão
  useEffect(() => {
    const savedPin = sessionStorage.getItem(`auth_pin_${session.id}`);
    if (savedPin === session.pin) {
      setIsAuthenticated(true);
    }
  }, [session.id, session.pin]);

  // Limpa seleções se a rodada mudar
  useEffect(() => {
    setSelectedIds([]);
    setErrorMessage('');
  }, [session.status, currentRound]);

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
        setErrorMessage(`Você já selecionou o limite máximo de ${maxVotes} ${maxVotes === 1 ? 'voto' : 'votos'}.`);
        return;
      }
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleConfirmVote = async () => {
    if (selectedIds.length === 0) {
      setErrorMessage('Por favor, selecione pelo menos um candidato antes de confirmar.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const res = await submitBallot(session, selectedIds, currentRound);

    if (res.success) {
      // 🔔 Toca o som oficial da Urna Eletrônica do TSE!
      urnaAudio.playTseConfirma();

      // Vibração tátil no celular (se suportado pelo navegador)
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
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-[#001f47] border border-blue-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-amber-500/10 border-2 border-[#d4af37] rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg">
            <KeyRound className="w-10 h-10 text-[#d4af37]" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2 font-serif">Acesso ao VOTO IASD</h1>
          <p className="text-sm text-blue-200 mb-6">
            Digite o <strong className="text-amber-300">PIN de 4 dígitos</strong> informado pelo líder ou exibido no telão da igreja:
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
              className="w-full py-4 bg-gradient-to-r from-[#d4af37] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-blue-950 font-extrabold text-base rounded-2xl shadow-lg transition active:scale-98 cursor-pointer"
            >
              Entrar na Votação
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-blue-900/60 text-xs text-blue-300/70 flex items-center justify-center gap-2">
            <Lock className="w-3.5 h-3.5" />
            Conexão Segura e Anônima
          </div>
        </motion.div>
      </div>
    );
  }

  // 2. TELA DE SUCESSO / VOTO JÁ COMPUTADO
  if (alreadyVoted || submitSuccess) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="max-w-md w-full bg-[#001f47] border border-emerald-500/40 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden"
        >
          {/* Efeito de luz verde de fundo */}
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="w-24 h-24 bg-emerald-500/20 border-2 border-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
            <CheckCircle2 className="w-14 h-14 text-emerald-400" />
          </div>

          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 mb-3">
            Urna Eletrônica • FIM
          </span>

          <h2 className="text-2xl font-bold text-white mb-2 font-serif">
            Voto Computado com Sucesso!
          </h2>

          <p className="text-sm text-blue-200 mb-6 leading-relaxed">
            Seu voto foi registrado com sigilo e segurança. Seu dispositivo foi travado para garantir a legitimidade da apuração.
          </p>

          <div className="bg-[#07132a]/80 rounded-2xl p-4 border border-blue-900/80 text-left mb-6 space-y-2">
            <div className="flex items-center justify-between text-xs text-blue-300">
              <span>Pauta:</span>
              <span className="font-semibold text-white truncate max-w-[200px]">{session.title}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-blue-300">
              <span>Status da Apuração:</span>
              <span className="text-amber-400 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                Em andamento no Telão
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-blue-300/60">
            <Lock className="w-4 h-4 text-emerald-400" />
            Aguarde as orientações do administrador no púlpito.
          </div>
        </motion.div>
      </div>
    );
  }

  // 3. SALA DE ESPERA (Aguardando Admin Iniciar)
  if (session.status === 'WAITING') {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md w-full bg-[#001f47]/90 border border-blue-800 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden"
        >
          {/* Efeitos visuais animados fluidos contínuos (pulso e giros) */}
          <div className="relative w-36 h-36 mx-auto mb-8 flex items-center justify-center">
            {/* Anéis pulsantes */}
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
            <div className="w-20 h-20 bg-gradient-to-tr from-[#002f6c] to-blue-900 rounded-full flex items-center justify-center shadow-xl border border-blue-400/30 z-10">
              <Vote className="w-10 h-10 text-[#d4af37] animate-pulse" />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-600/40 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            Sala de Espera Conectada
          </span>

          <h2 className="text-2xl font-bold text-white mb-3 font-serif">
            Aguardando o início da votação...
          </h2>

          <p className="text-sm text-blue-200/90 mb-6 leading-relaxed">
            Você está conectado à pauta <strong className="text-white">"{session.title}"</strong>. Assim que o líder autorizar, as opções aparecerão automaticamente nesta tela.
          </p>

          <div className="p-4 bg-[#07132a] rounded-2xl border border-blue-900/60 flex items-center justify-between text-xs text-blue-300">
            <span>Vagas para esta pauta:</span>
            <span className="font-bold text-amber-300 text-sm">
              {session.vacancies} Vagas {session.suplentesCount > 0 && `(+ ${session.suplentesCount} Suplentes)`}
            </span>
          </div>
        </motion.div>
      </div>
    );
  }

  // 4. VOTAÇÃO ENCERRADA
  if (session.status === 'CLOSED') {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#001f47] border border-blue-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-20 h-20 bg-blue-900/40 border border-blue-600/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-10 h-10 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 font-serif">Votação Encerrada</h2>
          <p className="text-sm text-blue-200 mb-6">
            O período de votação desta sessão foi finalizado. Confira a apuração e o resultado final no telão principal!
          </p>
        </div>
      </div>
    );
  }

  // 5. TELA DE VOTAÇÃO ATIVA (Cards grandes para toques precisos)
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
      {/* Alerta de Desempate (se aplicável) */}
      {isTieBreak && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-4 rounded-2xl bg-amber-950/80 border-2 border-amber-500 shadow-lg text-amber-100 flex items-center gap-3"
        >
          <Flame className="w-7 h-7 text-amber-400 shrink-0 animate-bounce" />
          <div>
            <h3 className="font-bold text-base text-amber-300 uppercase tracking-wide">
              Rodada de Desempate!
            </h3>
            <p className="text-xs text-amber-200/90">
              Escolha apenas <strong className="text-white underline">{maxVotes} {maxVotes === 1 ? 'nome' : 'nomes'}</strong> entre os candidatos abaixo para desempatar a vaga.
            </p>
          </div>
        </motion.div>
      )}

      {/* Cabeçalho da Pauta */}
      <div className="bg-[#001f47] rounded-3xl p-5 border border-blue-800 shadow-xl mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-900/70 text-blue-200 uppercase tracking-wider">
            {session.category || 'Votação IASD'}
          </span>
          <span className="text-xs text-amber-300 font-bold bg-amber-950/80 px-2.5 py-1 rounded-md border border-amber-700/40">
            {session.vacancies} Vagas {session.suplentesCount > 0 && `+ ${session.suplentesCount} Suplentes`}
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-extrabold text-white font-serif mb-1">
          {session.title}
        </h1>

        {/* Indicador de Seleção de Votos */}
        <div className="mt-4 pt-3 border-t border-blue-900/80 flex items-center justify-between">
          <span className="text-xs text-blue-200 font-medium">
            Selecione até <strong className="text-amber-300">{maxVotes}</strong> {maxVotes === 1 ? 'candidato' : 'candidatos'}:
          </span>
          <span
            className={`text-xs font-extrabold px-3 py-1 rounded-full transition-all ${
              selectedIds.length === maxVotes
                ? 'bg-amber-400 text-blue-950 shadow-md scale-105'
                : 'bg-blue-900 text-blue-100'
            }`}
          >
            {selectedIds.length} de {maxVotes} selecionados
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

      {/* Barra Flutuante Inferior com o Botão CONFIRMAR (Estilo Urna TSE) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#00132b]/95 backdrop-blur-lg border-t border-blue-900/80 z-40">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            disabled={selectedIds.length === 0 || isSubmitting}
            className="px-4 py-3.5 rounded-xl border border-rose-800/60 text-rose-300 hover:bg-rose-950/40 text-xs font-bold transition disabled:opacity-40 disabled:pointer-events-none"
          >
            Limpar
          </button>

          <button
            type="button"
            onClick={handleConfirmVote}
            disabled={selectedIds.length === 0 || isSubmitting}
            className={`flex-1 py-4 px-6 rounded-2xl font-black text-lg uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition-all active:scale-98 cursor-pointer ${
              selectedIds.length > 0
                ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-emerald-900/40 ring-2 ring-emerald-400/40 animate-pulse'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
            }`}
          >
            <CheckCircle2 className="w-6 h-6" />
            {isSubmitting ? 'Registrando...' : 'CONFIRMAR VOTO'}
          </button>
        </div>
      </div>
    </div>
  );
};
