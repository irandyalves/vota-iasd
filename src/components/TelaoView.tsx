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
  Users,
  AlertTriangle,
} from 'lucide-react';
import type { VotingSession } from '../types';
import { IasdLogo } from './IasdLogo';
import { detectVotingTies, getEffectiveSuplentes } from '../utils/tieDetection';

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

  const { s1Count, s2Count } = getEffectiveSuplentes(session);
  const suplentesCount = isTieBreak ? 0 : s1Count;
  const segundoSuplentesCount = isTieBreak ? 0 : s2Count;

  // Detecção de empates que afetam a classificação
  const detectedTies = detectVotingTies(session);
  const hasTies = session.status === 'CLOSED' && detectedTies.length > 0;

  // Lógica do QR Code: Sempre visível na coluna da esquerda por padrão no Telão
  const showQrCode = session.showQrOnTelao !== false;

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
      setVoterUrl(`${window.location.origin}/?view=voter&pin=${session.pin}`);
      const params = new URLSearchParams(window.location.search);
      if (params.get('fullscreen') === 'true' && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
  }, [session.pin]);

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

      {/* ÁREA SUPERIOR: CABEÇALHO EM UMA LINHA, COR BRANCA, FONTE MODERNA */}
      <div className="mb-3.5 pt-1 px-1 flex flex-wrap items-center justify-between gap-3 text-white">
        {/* Lado Esquerdo: Logo + Título Digitado + 'Escolha X Nomes' + 'X já votaram' próximos na mesma linha */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Logo 15% maior e sem fundo branco */}
          <IasdLogo className="w-10 h-10 shrink-0" customUrl={session.logoUrl} />

          {/* Título: O que foi digitado (sem 'Votação Escolha'), 35% menor, fonte moderna redonda */}
          <h1 className="text-base sm:text-lg lg:text-xl font-extrabold text-white font-sans tracking-tight">
            {session.title.toUpperCase()}
          </h1>

          {/* Card: Escolha X Nomes (Cantos com arredondamento reduzido: rounded-lg) */}
          <span className="px-3 py-1 rounded-lg bg-blue-900 border border-blue-600/80 text-white font-bold text-xs sm:text-sm tracking-wide uppercase flex items-center gap-1.5 shadow-md">
            <span>ESCOLHA</span>
            <span className="text-amber-400 font-black text-sm sm:text-base">
              {session.maxVotesPerVoter}
            </span>
            <span>{session.maxVotesPerVoter === 1 ? 'NOME' : 'NOMES'}</span>
          </span>

          {/* Card: X já votaram (Movido para próximo de 'Escolha de Nomes', cantos rounded-lg - oculto na tela de Nomes para Escolha) */}
          {session.telaoMode !== 'names' && (
            <span className="px-3 py-1 rounded-lg bg-[#001f47] border border-blue-700/80 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-inner">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                <strong className="text-amber-300 font-mono text-sm sm:text-base font-black">
                  {totalVotesCast}
                </strong>{' '}
                {totalVotesCast === 1 ? 'já votou' : 'já votaram'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* ÁREA CENTRAL: QR CODE À ESQUERDA E NOMES NA COLUNA DA DIREITA */}
      <div className="flex-1 w-full">
        <div className={`grid gap-4 items-start ${showQrCode ? 'grid-cols-1 md:grid-cols-12' : 'grid-cols-1'}`}>
          {/* COLUNA DA ESQUERDA: PAINEL DO QR CODE E SENHA */}
          {showQrCode && (
            <div className="md:col-span-4 lg:col-span-3 xl:col-span-3 bg-[#001f47]/95 border-2 border-amber-500/40 rounded-2xl p-4 shadow-2xl flex flex-col items-center text-center sticky top-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] mb-2 shadow-inner">
                <QrIcon className="w-5 h-5" />
              </div>

              <h3 className="font-extrabold text-white text-sm font-serif tracking-tight mb-0.5">
                VOTE PELO CELULAR
              </h3>
              <p className="text-[11px] text-blue-200/90 mb-3">
                Aponte a câmera para o QR Code:
              </p>

              {/* QR Code Nítido e Limpo */}
              <div className="p-2.5 bg-white rounded-2xl shadow-xl mb-3 border-2 border-[#d4af37]">
                <QRCodeSVG
                  value={voterUrl || `https://vota-iasd-central.web.app/?view=voter&pin=${session.pin}`}
                  size={135}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Caixa da Senha em Grande Destaque */}
              <div className="w-full bg-[#07132a] border border-[#d4af37] rounded-xl p-2 shadow-inner mb-2">
                <span className="text-[10px] uppercase font-bold text-blue-300 block tracking-wider">
                  SENHA DE ACESSO
                </span>
                <span className="text-2xl font-mono font-black text-[#d4af37] tracking-widest">
                  {session.pin}
                </span>
              </div>

              <p className="text-[10px] text-blue-300/70 font-mono">
                vota-iasd-central.web.app
              </p>
            </div>
          )}

          {/* COLUNA DA DIREITA: LISTA DE CANDIDATOS / CORRIDA DE BARRAS OU VOTO SECRETO */}
          <div className={`${showQrCode ? 'md:col-span-8 lg:col-span-9 xl:col-span-9' : 'w-full'}`}>
            {session.telaoMode === 'names' ? (
              /* MODO: NOMES PARA ESCOLHA (PRINT 2 REDIMENSIONADO PARA O TELÃO) */
              <div className="bg-[#001f47]/90 border border-blue-700/70 rounded-2xl p-4 sm:p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-blue-800/80">
                  <div className="flex items-center gap-2.5">
                    <Users className="w-5 h-5 text-amber-400" />
                    <h3 className="font-extrabold text-base sm:text-lg lg:text-xl text-white font-sans tracking-tight">
                      NOMES PARA ESCOLHA ({optionsToDisplay.length})
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-lg bg-blue-900 border border-blue-600/80 text-white font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 shadow">
                      <span>ESCOLHA</span>
                      <span className="text-amber-400 font-black">
                        {session.maxVotesPerVoter}
                      </span>
                      <span>{session.maxVotesPerVoter === 1 ? 'NOME' : 'NOMES'}</span>
                    </span>
                  </div>
                </div>

                {optionsToDisplay.length === 0 ? (
                  <div className="p-12 text-center text-slate-300 text-sm border-2 border-dashed border-blue-800 rounded-2xl bg-[#07132a]/60">
                    Aguardando cadastro dos nomes no painel...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    <AnimatePresence>
                      {optionsToDisplay.map((option) => (
                        <motion.div
                          key={option.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                          className="px-3.5 py-1.5 sm:py-2 bg-[#07132a] hover:bg-[#0c1f44] border-2 border-blue-700/80 rounded-lg flex items-center shadow-md transition"
                        >
                          {/* Nome do Candidato em Destaque Maiúsculo (Sem iniciais CE..) */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-extrabold text-xs sm:text-sm lg:text-[15px] text-white uppercase tracking-wide truncate">
                              {option.name}
                            </h4>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ) : !session.showResultsLive && session.status === 'VOTING' ? (
              <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-6 bg-[#001f47]/80 rounded-2xl border border-blue-800/60 shadow-xl">
                <div className="w-16 h-16 rounded-full bg-blue-900/40 border-2 border-blue-500/40 flex items-center justify-center mb-4">
                  <Trophy className="w-8 h-8 text-amber-300 animate-pulse" />
                </div>
                <h2 className="text-2xl font-extrabold text-white mb-2 font-serif">
                  Votação em Andamento (Voto Secreto)
                </h2>
                <p className="text-xs text-blue-200 max-w-md mb-4 leading-relaxed">
                  Os votos estão sendo computados com total sigilo. A apuração oficial será revelada nesta tela assim que o líder encerrar a votação.
                </p>
                <div className="flex items-center gap-2 px-4 py-2 bg-[#07132a] rounded-xl border border-blue-800 font-mono text-emerald-400 font-bold text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  {totalVotesCast} votos já registrados
                </div>
              </div>
            ) : (
              <div className="bg-[#001f47]/80 border border-blue-800/60 rounded-2xl p-3 sm:p-4 shadow-xl">
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-blue-900/80">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-[#d4af37]" />
                    <h3 className="font-extrabold text-sm sm:text-base text-white font-sans tracking-tight">
                      Tempo real
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-semibold">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-400 inline-block" />
                      Titulares ({vacancies})
                    </span>
                    {suplentesCount > 0 && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#0a2352] border border-blue-400 inline-block" />
                        {segundoSuplentesCount > 0 ? `1º Suplentes (${suplentesCount})` : `Suplentes (${suplentesCount})`}
                      </span>
                    )}
                    {segundoSuplentesCount > 0 && (
                      <span className="flex items-center gap-1 text-sky-400">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#0a2e4c] border border-sky-400 inline-block" />
                        2º Suplentes ({segundoSuplentesCount})
                      </span>
                    )}
                  </div>
                </div>

                {/* ALERTA DE EMPATE NO TELÃO AO ENCERRAR VOTAÇÃO */}
                {hasTies && (
                  <div className="mb-3 p-2.5 sm:p-3 rounded-xl bg-amber-950/90 border-2 border-amber-400 text-amber-200 shadow-2xl flex items-center justify-between gap-3 animate-pulse">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 shrink-0 animate-bounce" />
                      <div>
                        <h4 className="font-black text-xs sm:text-sm lg:text-base text-white uppercase tracking-wide">
                          EMPATE DETECTADO: {detectedTies.map((t) => t.label).join(' • ')}
                        </h4>
                        <p className="text-[11px] sm:text-xs text-amber-200/90 font-medium">
                          {detectedTies
                            .map(
                              (t) =>
                                `${t.label} (${t.votesCount} ${t.votesCount === 1 ? 'voto' : 'votos'}): ${t.tiedCandidates.map((c) => c.name).join(', ')}`
                            )
                            .join(' | ')}
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-amber-400 text-blue-950 font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-lg shrink-0 shadow">
                      Aguardando Desempate
                    </span>
                  </div>
                )}

                {/* ESTRUTURA DOS CARDS DE VOTAÇÃO (ALTURA REDUZIDA EM 30%, ANIMAÇÃO FLUIDA LAYOUT) */}
                {(() => {
                  const titulares = sortedOptions.slice(0, vacancies);
                  const suplentes1 = sortedOptions.slice(vacancies, vacancies + suplentesCount);
                  const suplentes2 = sortedOptions.slice(
                    vacancies + suplentesCount,
                    vacancies + suplentesCount + segundoSuplentesCount
                  );
                  const naoClassificados = sortedOptions.slice(
                    vacancies + suplentesCount + segundoSuplentesCount
                  );

                  const renderCandidateCard = (
                    option: typeof sortedOptions[0],
                    rank: number,
                    category: 'titular' | 'suplente1' | 'suplente2' | 'naoClassificado'
                  ) => {
                    const isClosed = session.status === 'CLOSED';
                    const percentage = Math.round(((option.votesCount || 0) / maxVotesRecorded) * 100);
                    const tiedGroup = isClosed
                      ? detectedTies.find((t) => t.tiedCandidates.some((c) => c.id === option.id))
                      : undefined;

                    const isElected = category === 'titular';
                    const isSuplente1 = category === 'suplente1';
                    const isSuplente2 = category === 'suplente2';

                    return (
                      <motion.div
                        key={option.id}
                        layout
                        transition={{
                          type: 'spring',
                          damping: 25,
                          stiffness: 180,
                        }}
                        className={`border transition-all duration-300 relative overflow-hidden flex items-center py-1 px-2.5 sm:py-1.5 sm:px-3 rounded-lg gap-2 min-h-[36px] sm:min-h-[38px] shadow-sm ${
                          tiedGroup
                            ? 'bg-[#3b2105]/95 border-2 border-amber-400 text-amber-100 shadow-md ring-2 ring-amber-400/50'
                            : isElected
                            ? 'bg-[#052e1c] border-emerald-500/80 shadow-md shadow-emerald-950/40 text-white'
                            : isSuplente1
                            ? 'bg-[#092350]/95 border-blue-500/80 text-blue-100 ring-1 ring-blue-500/30'
                            : isSuplente2
                            ? 'bg-[#0a2e4c]/95 border-sky-500/80 text-sky-100 ring-1 ring-sky-500/30'
                            : 'bg-[#07132a]/70 border-blue-900/40 text-slate-400 py-0.5 px-2 rounded-md'
                        }`}
                      >
                        {/* Barra de Progresso Animada no Fundo */}
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(percentage, 2)}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className={`absolute top-0 bottom-0 left-0 opacity-25 pointer-events-none rounded-lg ${
                            tiedGroup
                              ? 'bg-gradient-to-r from-amber-600 to-amber-400'
                              : isElected
                              ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                              : isSuplente1
                              ? 'bg-gradient-to-r from-blue-600 to-blue-400'
                              : isSuplente2
                              ? 'bg-gradient-to-r from-sky-600 to-sky-400'
                              : 'bg-slate-700'
                          }`}
                        />

                        {/* Posição / Rank (1º, 2º, 3º...) */}
                        <div
                          className={`flex items-center justify-center font-black shrink-0 shadow-sm ${
                            tiedGroup
                              ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-amber-400 text-blue-950 ring-2 ring-amber-300'
                              : isElected
                              ? rank === 1
                                ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-gradient-to-tr from-amber-400 to-[#d4af37] text-blue-950 ring-1 ring-amber-300'
                                : rank === 2
                                ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-slate-300 text-slate-900'
                                : rank === 3
                                ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-amber-700 text-white'
                                : 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-emerald-900 text-emerald-200 border border-emerald-600/50'
                              : isSuplente1
                              ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-blue-900 text-blue-200 border border-blue-500/60'
                              : isSuplente2
                              ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-sky-900 text-sky-200 border border-sky-500/60'
                              : 'w-5 h-5 sm:w-5.5 sm:h-5.5 rounded text-[9.5px] bg-slate-800 text-slate-400 border border-slate-700/50'
                          }`}
                        >
                          {rank}º
                        </div>

                        {/* Foto (se houver) */}
                        {option.photoUrl && (
                          <div className="shrink-0">
                            <img
                              src={option.photoUrl}
                              alt={option.name}
                              className="w-6.5 h-6.5 rounded-md object-cover border border-blue-500/50 shadow"
                            />
                          </div>
                        )}

                        {/* Nome do Candidato em Destaque */}
                        <div className="flex-1 min-w-0 z-10">
                          <div className="flex items-center gap-1.5">
                            <h4
                              className={`leading-tight truncate uppercase tracking-wide ${
                                tiedGroup
                                  ? 'font-black text-xs sm:text-sm text-amber-200'
                                  : isElected
                                  ? 'font-black text-xs sm:text-sm text-white'
                                  : isSuplente1
                                  ? 'font-bold text-[11px] sm:text-xs text-blue-100'
                                  : isSuplente2
                                  ? 'font-bold text-[11px] sm:text-xs text-sky-100'
                                  : 'font-semibold text-[10px] sm:text-[11px] text-slate-300'
                              }`}
                            >
                              {option.name}
                            </h4>

                            {tiedGroup ? (
                              <span className="inline-flex items-center gap-1 text-[8.5px] px-1.5 py-0.2 rounded-full font-black bg-amber-400 text-blue-950 animate-pulse uppercase shadow">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Empate ({tiedGroup.label})
                              </span>
                            ) : (
                              <>
                                {isElected && (
                                  <span className="inline-flex items-center gap-0.5 text-[8.5px] px-1.5 py-0.2 rounded-full font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50">
                                    <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                                    {isClosed ? 'Eleito Titular' : 'Titular'}
                                  </span>
                                )}
                                {isSuplente1 && (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.2 rounded-full font-bold bg-blue-950 text-blue-200 border border-blue-500/60">
                                    {isClosed
                                      ? segundoSuplentesCount > 0
                                        ? '1º Suplente Eleito'
                                        : 'Suplente Eleito'
                                      : segundoSuplentesCount > 0
                                      ? '1º Suplente'
                                      : 'Suplente'}
                                  </span>
                                )}
                                {isSuplente2 && (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.2 rounded-full font-bold bg-sky-950 text-sky-200 border border-sky-500/60">
                                    {isClosed ? '2º Suplente Eleito' : '2º Suplente'}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* CONTADOR NUMÉRICO: "votos" ANTES DO NÚMERO, SEM "v", E "% EM AMARELO BOLD" */}
                        <div className="text-right z-10 shrink-0 flex items-center gap-1.5 font-mono">
                          <span className="text-[10px] sm:text-[11px] font-bold text-slate-300/80 uppercase">
                            votos
                          </span>
                          <span className="text-sm sm:text-base font-black text-white">
                            {option.votesCount || 0}
                          </span>
                          <span className="text-xs sm:text-sm font-black text-amber-300 ml-1">
                            {percentage}%
                          </span>
                        </div>
                      </motion.div>
                    );
                  };

                  return (
                    <div className="space-y-2">
                      {/* 1. SEÇÃO DE TITULARES */}
                      <div className={`gap-1.5 ${!showQrCode ? 'grid grid-cols-1 md:grid-cols-2 space-y-0' : 'space-y-1'}`}>
                        <AnimatePresence>
                          {titulares.map((option, idx) => renderCandidateCard(option, idx + 1, 'titular'))}
                        </AnimatePresence>
                      </div>

                      {/* 2. SEÇÃO DE SUPLENTES (1º E 2º SUPLENTE LADO A LADO EM 2 COLUNAS) */}
                      {suplentesCount > 0 && (
                        <div className="w-full pt-1">
                          {segundoSuplentesCount > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-start">
                              {/* COLUNA 1: 1º SUPLENTE */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 py-0.5">
                                  <div className="flex-1 border-t-2 border-dashed border-blue-500/70" />
                                  <span className="text-blue-400 font-black text-xs uppercase tracking-widest px-2 select-none shrink-0">
                                    1º SUPLENTES ({suplentesCount})
                                  </span>
                                  <div className="flex-1 border-t-2 border-dashed border-blue-500/70" />
                                </div>
                                <div className="space-y-1">
                                  <AnimatePresence>
                                    {suplentes1.map((option, idx) =>
                                      renderCandidateCard(option, vacancies + idx + 1, 'suplente1')
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>

                              {/* COLUNA 2: 2º SUPLENTE (MESMO TAMANHO DO 1º) */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 py-0.5">
                                  <div className="flex-1 border-t-2 border-dashed border-sky-500/70" />
                                  <span className="text-sky-400 font-black text-xs uppercase tracking-widest px-2 select-none shrink-0">
                                    2º SUPLENTES ({segundoSuplentesCount})
                                  </span>
                                  <div className="flex-1 border-t-2 border-dashed border-sky-500/70" />
                                </div>
                                <div className="space-y-1">
                                  <AnimatePresence>
                                    {suplentes2.map((option, idx) =>
                                      renderCandidateCard(option, vacancies + suplentesCount + idx + 1, 'suplente2')
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-3 py-0.5">
                                <div className="flex-1 border-t-2 border-dashed border-blue-500/70" />
                                <span className="text-blue-400 font-black text-xs uppercase tracking-widest px-2 select-none shrink-0">
                                  SUPLENTES ({suplentesCount})
                                </span>
                                <div className="flex-1 border-t-2 border-dashed border-blue-500/70" />
                              </div>
                              <div className={`gap-1.5 ${!showQrCode ? 'grid grid-cols-1 md:grid-cols-2' : 'space-y-1'}`}>
                                <AnimatePresence>
                                  {suplentes1.map((option, idx) =>
                                    renderCandidateCard(option, vacancies + idx + 1, 'suplente1')
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. SEÇÃO DE NÃO CLASSIFICADOS */}
                      {naoClassificados.length > 0 && (
                        <div className="w-full space-y-1 pt-1">
                          <div className="flex items-center gap-3 py-0.5">
                            <div className="flex-1 border-t-2 border-dashed border-slate-600/60" />
                            <span className="text-slate-400 font-bold text-xs uppercase tracking-widest px-2 select-none shrink-0">
                              NÃO CLASSIFICADOS
                            </span>
                            <div className="flex-1 border-t-2 border-dashed border-slate-600/60" />
                          </div>
                          <div className={`gap-1.5 ${!showQrCode ? 'grid grid-cols-1 md:grid-cols-2' : 'space-y-1'}`}>
                            <AnimatePresence>
                              {naoClassificados.map((option, idx) =>
                                renderCandidateCard(
                                  option,
                                  vacancies + suplentesCount + segundoSuplentesCount + idx + 1,
                                  'naoClassificado'
                                )
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
