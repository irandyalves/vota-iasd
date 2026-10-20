import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Users,
  EyeOff,
  QrCode,
  CheckCircle,
} from 'lucide-react';
import type { VotingSession } from '../types';

interface TelaoViewProps {
  session: VotingSession;
}

export const TelaoView: React.FC<TelaoViewProps> = ({ session }) => {
  const [currentUrl, setCurrentUrl] = useState('');

  // Identifica se estamos em rodada de desempate
  const isTieBreak = session.status === 'TIE_BREAK' && Boolean(session.tieBreak?.active);
  const optionsToDisplay = isTieBreak
    ? (session.tieBreak?.options || [])
    : session.options;

  const vacancies = isTieBreak
    ? (session.tieBreak?.vacancies || 1)
    : session.vacancies;

  const suplentesCount = isTieBreak ? 0 : session.suplentesCount;

  // Ordena opções por contagem de votos (decrescente)
  const sortedOptions = [...optionsToDisplay].sort((a, b) => (b.votesCount || 0) - (a.votesCount || 0));

  // Voto máximo atual para calcular porcentagem da barra
  const maxVotesRecorded = Math.max(...optionsToDisplay.map((o) => o.votesCount || 0), 1);
  const totalVotesCast = optionsToDisplay.reduce((acc, curr) => acc + (curr.votesCount || 0), 0);

  // Pega a URL do navegador para o QR Code
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentUrl(window.location.origin);
    }
  }, []);

  // Disparo de confetes se o status mudar para CLOSED (Resultado Final)
  useEffect(() => {
    if (session.status === 'CLOSED') {
      // Disparo inicial
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#d4af37', '#002f6c', '#10b981', '#ffffff'],
      });

      // Segundo disparo sequencial para efeito cinematográfico
      const timer = setTimeout(() => {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 60,
          origin: { x: 0 },
          colors: ['#d4af37', '#3b82f6', '#10b981'],
        });
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 60,
          origin: { x: 1 },
          colors: ['#d4af37', '#3b82f6', '#10b981'],
        });
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [session.status]);

  return (
    <div className="min-h-screen bg-[#07132a] text-white p-4 sm:p-8 flex flex-col justify-between">
      {/* CABEÇALHO DO TELÃO */}
      <div className="bg-[#001f47]/90 border border-blue-800/80 rounded-3xl p-6 shadow-2xl backdrop-blur-md mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="px-3 py-1 bg-[#d4af37] text-blue-950 font-black rounded-lg text-xs uppercase tracking-wider">
                {session.category || 'VOTAÇÃO OFICIAL IASD'}
              </span>
              <span
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  session.status === 'VOTING'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-600 animate-pulse'
                    : session.status === 'TIE_BREAK'
                    ? 'bg-amber-950 text-amber-300 border border-amber-600 animate-pulse'
                    : session.status === 'CLOSED'
                    ? 'bg-purple-950 text-purple-300 border border-purple-600'
                    : 'bg-blue-950 text-blue-300 border border-blue-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current" />
                {session.status === 'VOTING' && 'Votação em Andamento'}
                {session.status === 'TIE_BREAK' && 'Rodada de Desempate'}
                {session.status === 'CLOSED' && 'Resultado Final Consolidado'}
                {session.status === 'WAITING' && 'Aguardando Início'}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-white font-serif tracking-tight">
              {session.title}
            </h1>
          </div>

          {/* Cards de Métricas Rápidas */}
          <div className="flex items-center gap-3">
            <div className="bg-[#07132a] border border-blue-900 rounded-2xl px-5 py-3 text-center">
              <span className="text-[11px] font-medium text-blue-300 block">Vagas Disponíveis</span>
              <span className="text-xl font-black text-amber-300">
                {vacancies} {suplentesCount > 0 && <span className="text-xs text-blue-300 font-normal">(+{suplentesCount} suplentes)</span>}
              </span>
            </div>

            <div className="bg-[#07132a] border border-blue-900 rounded-2xl px-5 py-3 text-center">
              <span className="text-[11px] font-medium text-blue-300 block">Votos Computados</span>
              <span className="text-xl font-black text-emerald-400 font-mono">
                {totalVotesCast}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ÁREA CENTRAL: CORRIDA DE BARRAS OU TELA DE SUSPENSE */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* COLUNA ESQUERDA: QR CODE & INSTRUÇÕES DE VOTO */}
        <div className="lg:col-span-1 bg-[#001f47]/80 border border-blue-800/60 rounded-3xl p-6 shadow-xl flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] mb-3">
            <QrCode className="w-6 h-6" />
          </div>

          <h3 className="font-bold text-white text-lg font-serif mb-1">Aponte a Câmera</h3>
          <p className="text-xs text-blue-200 mb-4">
            Abra a câmera do celular no QR Code abaixo para votar diretamente pelo navegador:
          </p>

          {/* QR Code Gigante */}
          <div className="p-4 bg-white rounded-2xl shadow-2xl mb-4 border-4 border-[#d4af37]">
            <QRCodeSVG
              value={currentUrl || 'https://voto.iasd.org'}
              size={180}
              level="M"
              includeMargin={false}
            />
          </div>

          {/* PIN de Segurança em Destaque */}
          <div className="w-full bg-[#07132a] border-2 border-[#d4af37] rounded-2xl p-3 shadow-inner">
            <span className="text-[10px] uppercase font-bold text-blue-300 block">Código PIN da Sessão</span>
            <span className="text-3xl font-mono font-black text-[#d4af37] tracking-widest">
              {session.pin}
            </span>
          </div>

          <div className="mt-4 text-[11px] text-blue-300/80 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span>Permitido até {session.maxVotesPerVoter} votos por membro</span>
          </div>
        </div>

        {/* COLUNA DIREITA: CORRIDA DE BARRAS EM TEMPO REAL OU MODO OCULTO */}
        <div className="lg:col-span-3 bg-[#001f47]/80 border border-blue-800/60 rounded-3xl p-6 shadow-xl min-h-[500px]">
          {/* Se os resultados estiverem ocultos e a votação estiver ocorrendo */}
          {!session.showResultsLive && session.status === 'VOTING' ? (
            <div className="h-full min-h-[440px] flex flex-col items-center justify-center text-center p-8">
              <div className="w-24 h-24 rounded-full bg-blue-900/40 border-2 border-blue-500/40 flex items-center justify-center mb-6">
                <EyeOff className="w-12 h-12 text-amber-300 animate-pulse" />
              </div>
              <h2 className="text-3xl font-extrabold text-white mb-3 font-serif">
                Apuração em Sigilo
              </h2>
              <p className="text-base text-blue-200 max-w-lg mb-6 leading-relaxed">
                Os votos estão sendo computados em tempo real na nuvem com criptografia. Os resultados e a corrida oficial serão revelados pelo administrador no encerramento!
              </p>
              <div className="flex items-center gap-3 px-6 py-3 bg-[#07132a] rounded-2xl border border-blue-800 font-mono text-emerald-400 font-bold text-lg">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                {totalVotesCast} votos já registrados
              </div>
            </div>
          ) : (
            <div>
              {/* Título da Apuração */}
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-blue-900/80">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[#d4af37]" />
                  <h3 className="font-extrabold text-lg text-white font-serif">
                    {session.status === 'CLOSED' ? 'Resultado Final Oficial' : 'Classificação em Tempo Real'}
                  </h3>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-3 h-3 rounded-md bg-emerald-500/30 border border-emerald-400 inline-block" />
                    Zona de Titulares ({vacancies})
                  </span>
                  {suplentesCount > 0 && (
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-3 h-3 rounded-md bg-cyan-500/30 border border-cyan-400 inline-block" />
                      Suplentes ({suplentesCount})
                    </span>
                  )}
                </div>
              </div>

              {/* LISTA ANIMADA DE CANDIDATOS (Troca de posições fluida estilo Bar Race) */}
              <div className="space-y-3">
                <AnimatePresence>
                  {sortedOptions.map((option, index) => {
                    const rank = index + 1;
                    const isElected = rank <= vacancies;
                    const isSuplente = !isElected && rank <= (vacancies + suplentesCount);
                    const percentage = Math.round(((option.votesCount || 0) / maxVotesRecorded) * 100);

                    return (
                      <React.Fragment key={option.id}>
                        {/* Linha de Corte dos Eleitos */}
                        {rank === vacancies + 1 && (
                          <div className="py-1 flex items-center gap-3 text-xs font-bold text-emerald-400/90 my-2">
                            <div className="flex-1 border-t-2 border-dashed border-emerald-500/50" />
                            <span className="px-3 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/60 uppercase text-[10px] tracking-wider">
                              ▲ Zona dos Eleitos ({vacancies} Vagas) ▲
                            </span>
                            <div className="flex-1 border-t-2 border-dashed border-emerald-500/50" />
                          </div>
                        )}

                        {/* Linha de Corte dos Suplentes */}
                        {suplentesCount > 0 && rank === vacancies + suplentesCount + 1 && (
                          <div className="py-1 flex items-center gap-3 text-xs font-bold text-cyan-400/90 my-2">
                            <div className="flex-1 border-t-2 border-dashed border-cyan-500/40" />
                            <span className="px-3 py-0.5 rounded-full bg-cyan-950 border border-cyan-700/50 uppercase text-[10px] tracking-wider">
                              ▲ Limite dos Suplentes ({suplentesCount} Vagas) ▲
                            </span>
                            <div className="flex-1 border-t-2 border-dashed border-cyan-500/40" />
                          </div>
                        )}

                        {/* Card Animado de Corrida de Barras */}
                        <motion.div
                          layout
                          transition={{
                            type: 'spring',
                            damping: 25,
                            stiffness: 180,
                          }}
                          className={`p-3 rounded-2xl border transition-all duration-300 relative overflow-hidden flex items-center gap-4 ${
                            isElected
                              ? 'bg-[#002855] border-emerald-500/60 shadow-lg shadow-emerald-950/20'
                              : isSuplente
                              ? 'bg-[#002244] border-cyan-500/50 shadow-md'
                              : 'bg-[#07132a]/60 border-blue-900/40 text-slate-400'
                          }`}
                        >
                          {/* Barra de Progresso Animada no Fundo */}
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(percentage, 2)}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className={`absolute top-0 bottom-0 left-0 opacity-20 pointer-events-none rounded-2xl ${
                              isElected
                                ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                                : isSuplente
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-400'
                                : 'bg-slate-600'
                            }`}
                          />

                          {/* Posição / Rank */}
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-md ${
                              rank === 1
                                ? 'bg-gradient-to-tr from-amber-400 to-[#d4af37] text-blue-950 ring-2 ring-amber-300'
                                : rank === 2
                                ? 'bg-slate-300 text-slate-900'
                                : rank === 3
                                ? 'bg-amber-700 text-white'
                                : isElected
                                ? 'bg-emerald-900 text-emerald-200 border border-emerald-600/50'
                                : isSuplente
                                ? 'bg-cyan-950 text-cyan-200 border border-cyan-600/50'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            #{rank}
                          </div>

                          {/* Foto ou Iniciais */}
                          <div className="shrink-0">
                            {option.photoUrl ? (
                              <img
                                src={option.photoUrl}
                                alt={option.name}
                                className="w-11 h-11 rounded-xl object-cover border border-blue-500/50 shadow"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-blue-900 border border-blue-600/40 flex items-center justify-center text-amber-300 font-black text-sm">
                                {option.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join('')}
                              </div>
                            )}
                          </div>

                          {/* Nome e Cargo */}
                          <div className="flex-1 min-w-0 z-10">
                            <div className="flex items-center gap-2">
                              <h4
                                className={`font-extrabold text-base leading-tight truncate ${
                                  isElected ? 'text-white' : 'text-slate-200'
                                }`}
                              >
                                {option.name}
                              </h4>
                              {isElected && (
                                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50">
                                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                                  Titular
                                </span>
                              )}
                              {isSuplente && (
                                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-cyan-950 text-cyan-300 border border-cyan-600/50">
                                  Suplente
                                </span>
                              )}
                            </div>
                            {option.subtitle && (
                              <p className="text-xs text-blue-200/70 truncate">{option.subtitle}</p>
                            )}
                          </div>

                          {/* Contador Numérico de Votos */}
                          <div className="text-right z-10 shrink-0">
                            <div className="text-xl font-mono font-black text-white leading-none">
                              {option.votesCount || 0}
                              <span className="text-[11px] text-blue-300 font-normal ml-1">votos</span>
                            </div>
                            <span className="text-[11px] font-mono text-blue-300/80">
                              {totalVotesCast > 0
                                ? `${Math.round(((option.votesCount || 0) / totalVotesCast) * 100)}%`
                                : '0%'}
                            </span>
                          </div>
                        </motion.div>
                      </React.Fragment>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
