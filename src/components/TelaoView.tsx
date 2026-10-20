import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import {
  Trophy,
  CheckCircle,
  Maximize,
  Minimize,
  QrCode as QrIcon,
} from 'lucide-react';
import type { VotingSession } from '../types';
import { IasdLogo } from './IasdLogo';

interface TelaoViewProps {
  session: VotingSession;
}

export const TelaoView: React.FC<TelaoViewProps> = ({ session }) => {
  const [voterUrl, setVoterUrl] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Identifica se estamos em rodada de desempate
  const isTieBreak = session.status === 'TIE_BREAK' && Boolean(session.tieBreak?.active);
  const optionsToDisplay = isTieBreak
    ? (session.tieBreak?.options || [])
    : session.options;

  const vacancies = isTieBreak
    ? (session.tieBreak?.vacancies || 1)
    : session.vacancies;

  const suplentesCount = isTieBreak ? 0 : session.suplentesCount;

  // Lógica do QR Code:
  const showQrCode = session.showQrOnTelao !== undefined
    ? session.showQrOnTelao
    : session.status === 'WAITING';

  // Ordena opções por contagem de votos (decrescente)
  const sortedOptions = [...optionsToDisplay].sort((a, b) => (b.votesCount || 0) - (a.votesCount || 0));

  const maxVotesRecorded = Math.max(...optionsToDisplay.map((o) => o.votesCount || 0), 1);
  const totalVotesCast = optionsToDisplay.reduce((acc, curr) => acc + (curr.votesCount || 0), 0);

  // Alterna Modo Tela Cheia (Fullscreen)
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVoterUrl(`${window.location.origin}/?view=voter`);
      const params = new URLSearchParams(window.location.search);
      if (params.get('fullscreen') === 'true' && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
  }, []);

  // Disparo de confetes se o status mudar para CLOSED (Resultado Final)
  useEffect(() => {
    if (session.status === 'CLOSED') {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#d4af37', '#002f6c', '#10b981', '#ffffff'],
      });

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

  // Título e subtítulo públicos configuráveis
  const displayTitle = session.publicTitle || `VOTAÇÃO ESCOLHA ${session.title.toUpperCase()}`;
  const instructionText = `ESCOLHA ${session.maxVotesPerVoter === 1 ? '1 NOME' : `ATÉ ${session.maxVotesPerVoter} NOMES`} • ${vacancies} ${vacancies === 1 ? 'VAGA TITULAR' : 'VAGAS TITULARES'}${suplentesCount > 0 ? ` (+ ${suplentesCount} SUPLENTES)` : ''}`;

  return (
    <div className="min-h-screen bg-[#07132a] text-white p-2.5 sm:p-3.5 lg:p-4 flex flex-col justify-between select-none">
      {/* BOTÃO DISCRETO DE TELA CHEIA NO TOPO DIREITO */}
      <div className="fixed top-2.5 right-2.5 z-50 flex items-center gap-1.5">
        <button
          onClick={toggleFullscreen}
          title="Alternar Tela Cheia para o Projetor / TV (F11)"
          className="bg-[#001f47]/80 hover:bg-[#002f6c] border border-blue-700/60 text-amber-300 font-bold p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg flex items-center gap-1 shadow-lg backdrop-blur-md transition cursor-pointer text-[11px] active:scale-95"
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isFullscreen ? 'Sair' : 'Tela Cheia'}</span>
        </button>
      </div>

      {/* ÁREA SUPERIOR CENTRAL: TÍTULO LIMPO DO PÚBLICO (REDUZIDO EM 35%) */}
      <div className="text-center mb-3 pt-1">
        <div className="flex items-center justify-center gap-2 mb-1">
          <IasdLogo className="w-8 h-8 shadow-md" customUrl={session.logoUrl} />
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white font-serif tracking-tight drop-shadow-sm">
            {displayTitle}
          </h1>
        </div>

        {/* INFORMAÇÃO ABAIXO: ESCOLHA 1 OU X NOMES (COMPACTO) */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
          <span className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-[#d4af37] text-blue-950 font-black text-[11px] sm:text-xs tracking-wider uppercase shadow-sm">
            {instructionText}
          </span>

          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              session.status === 'VOTING'
                ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500 animate-pulse'
                : session.status === 'TIE_BREAK'
                ? 'bg-amber-950/90 text-amber-300 border border-amber-500 animate-pulse'
                : session.status === 'CLOSED'
                ? 'bg-purple-950/90 text-purple-300 border border-purple-500'
                : 'bg-blue-950/90 text-blue-300 border border-blue-600'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {session.status === 'VOTING' && 'Votação em Andamento'}
            {session.status === 'TIE_BREAK' && 'Rodada de Desempate'}
            {session.status === 'CLOSED' && 'Resultado Final'}
            {session.status === 'WAITING' && 'Aguardando Início'}
          </span>

          <span className="px-2.5 py-0.5 rounded-full bg-[#07132a] text-blue-200 border border-blue-800 text-[10px] sm:text-[11px] font-mono font-bold">
            SENHA: <strong className="text-amber-300 text-xs tracking-widest ml-1">{session.pin}</strong>
          </span>

          <span className="px-2.5 py-0.5 rounded-full bg-[#07132a] text-emerald-400 border border-blue-800 text-[10px] sm:text-[11px] font-mono font-bold">
            {totalVotesCast} votos
          </span>
        </div>
      </div>

      {/* ÁREA CENTRAL: CORRIDA DE BARRAS (REDUZIDA EM 35%) */}
      <div className="flex-1 w-full">
        {!session.showResultsLive && session.status === 'VOTING' ? (
          <div className="h-full min-h-[340px] flex flex-col items-center justify-center text-center p-6 bg-[#001f47]/80 rounded-2xl border border-blue-800/60 shadow-xl">
            <div className="w-16 h-16 rounded-full bg-blue-900/40 border-2 border-blue-500/40 flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8 text-amber-300 animate-pulse" />
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 font-serif">
              Votação em Andamento (Voto Secreto)
            </h2>
            <p className="text-xs text-blue-200 max-w-md mb-4 leading-relaxed">
              Os votos estão sendo registrados com segurança. Os resultados oficiais serão revelados no telão após o encerramento da votação.
            </p>
            <div className="flex items-center gap-2 px-4 py-2 bg-[#07132a] rounded-xl border border-blue-800 font-mono text-emerald-400 font-bold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              {totalVotesCast} votos já computados
            </div>
          </div>
        ) : (
          <div className={`grid gap-4 items-start ${showQrCode ? 'grid-cols-1 lg:grid-cols-4' : 'grid-cols-1'}`}>
            {/* PAINEL DO QR CODE (COMPACTO) */}
            {showQrCode && (
              <div className="lg:col-span-1 bg-[#001f47]/90 border border-blue-800/80 rounded-2xl p-3.5 shadow-xl flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] mb-1.5">
                  <QrIcon className="w-4 h-4" />
                </div>

                <h3 className="font-bold text-white text-xs font-serif mb-0.5">Aponte a Câmera</h3>
                <p className="text-[10px] text-blue-200 mb-2">
                  Escaneie para votar pelo celular:
                </p>

                {/* QR Code Reduzido em 35% */}
                <div className="p-2 bg-white rounded-xl shadow-lg mb-2 border-2 border-[#d4af37]">
                  <QRCodeSVG
                    value={voterUrl || 'https://vota-iasd-central.web.app/?view=voter'}
                    size={110}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <div className="w-full bg-[#07132a] border border-[#d4af37] rounded-xl p-1.5 shadow-inner">
                  <span className="text-[9px] uppercase font-bold text-blue-300 block">SENHA DE ACESSO</span>
                  <span className="text-xl font-mono font-black text-[#d4af37] tracking-widest">
                    {session.pin}
                  </span>
                </div>
              </div>
            )}

            {/* LISTA DE CANDIDATOS / CORRIDA DE BARRAS (35% MAIS COMPACTA) */}
            <div className={`${showQrCode ? 'lg:col-span-3' : 'w-full'} bg-[#001f47]/80 border border-blue-800/60 rounded-2xl p-3 sm:p-4 shadow-xl`}>
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-blue-900/80">
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-[#d4af37]" />
                  <h3 className="font-bold text-sm text-white font-serif">
                    {session.status === 'CLOSED' ? 'Resultado Final Oficial' : 'Classificação em Tempo Real'}
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-semibold">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-400 inline-block" />
                    Titulares ({vacancies})
                  </span>
                  {suplentesCount > 0 && (
                    <span className="flex items-center gap-1 text-cyan-400">
                      <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/30 border border-cyan-400 inline-block" />
                      Suplentes ({suplentesCount})
                    </span>
                  )}
                </div>
              </div>

              {/* LISTA ANIMADA DE CANDIDATOS COM ESPAÇAMENTOS REDUZIDOS */}
              <div className={`gap-2 ${!showQrCode ? 'grid grid-cols-1 md:grid-cols-2 space-y-0' : 'space-y-1.5'}`}>
                <AnimatePresence>
                  {sortedOptions.map((option, index) => {
                    const rank = index + 1;
                    const isElected = rank <= vacancies;
                    const isSuplente = !isElected && rank <= (vacancies + suplentesCount);
                    const percentage = Math.round(((option.votesCount || 0) / maxVotesRecorded) * 100);

                    return (
                      <React.Fragment key={option.id}>
                        {/* Linha de Corte dos Eleitos */}
                        {showQrCode && rank === vacancies + 1 && (
                          <div className="py-0.5 flex items-center gap-2 text-[10px] font-bold text-emerald-400/90 my-1">
                            <div className="flex-1 border-t border-dashed border-emerald-500/50" />
                            <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/60 uppercase text-[9px] tracking-wider">
                              ▲ Limite dos Eleitos ({vacancies} Vagas) ▲
                            </span>
                            <div className="flex-1 border-t border-dashed border-emerald-500/50" />
                          </div>
                        )}

                        {/* Card Animado de Corrida de Barras (Compacto) */}
                        <motion.div
                          layout
                          transition={{
                            type: 'spring',
                            damping: 25,
                            stiffness: 180,
                          }}
                          className={`p-2 sm:p-2.5 rounded-xl border transition-all duration-300 relative overflow-hidden flex items-center gap-2.5 ${
                            isElected
                              ? 'bg-[#002855] border-emerald-500/70 shadow-md shadow-emerald-950/20'
                              : isSuplente
                              ? 'bg-[#002244] border-cyan-500/50 shadow-sm'
                              : 'bg-[#07132a]/70 border-blue-900/40 text-slate-400'
                          }`}
                        >
                          {/* Barra de Progresso Animada no Fundo */}
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(percentage, 2)}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className={`absolute top-0 bottom-0 left-0 opacity-25 pointer-events-none rounded-xl ${
                              isElected
                                ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                                : isSuplente
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-400'
                                : 'bg-slate-600'
                            }`}
                          />

                          {/* Posição / Rank Reduzido */}
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 shadow-sm ${
                              rank === 1
                                ? 'bg-gradient-to-tr from-amber-400 to-[#d4af37] text-blue-950 ring-1 ring-amber-300'
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

                          {/* Foto ou Iniciais Reduzido */}
                          <div className="shrink-0">
                            {option.photoUrl ? (
                              <img
                                src={option.photoUrl}
                                alt={option.name}
                                className="w-9 h-9 rounded-lg object-cover border border-blue-500/50 shadow"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-blue-900 border border-blue-600/40 flex items-center justify-center text-amber-300 font-black text-xs">
                                {option.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join('')}
                              </div>
                            )}
                          </div>

                          {/* Nome e Cargo / Descrição */}
                          <div className="flex-1 min-w-0 z-10">
                            <div className="flex items-center gap-1.5">
                              <h4
                                className={`font-bold text-xs sm:text-sm leading-tight truncate ${
                                  isElected ? 'text-white' : 'text-slate-200'
                                }`}
                              >
                                {option.name}
                              </h4>
                              {isElected && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50">
                                  <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                                  Titular
                                </span>
                              )}
                              {isSuplente && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-cyan-950 text-cyan-300 border border-cyan-600/50">
                                  Suplente
                                </span>
                              )}
                            </div>
                            {option.subtitle && (
                              <p className="text-[10px] text-blue-200/70 truncate">{option.subtitle}</p>
                            )}
                          </div>

                          {/* Contador Numérico de Votos Reduzido */}
                          <div className="text-right z-10 shrink-0">
                            <div className="text-lg font-mono font-black text-white leading-none">
                              {option.votesCount || 0}
                              <span className="text-[9px] text-blue-300 font-normal ml-0.5">v</span>
                            </div>
                            <span className="text-[10px] font-mono text-blue-300/80">
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
          </div>
        )}
      </div>
    </div>
  );
};
