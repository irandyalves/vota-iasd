import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import {
  CheckCircle,
  Maximize,
  Users,
  Star,
} from 'lucide-react';
import type { VotingSession } from '../types';
import { detectVotingTies, getEffectiveSuplentes } from '../utils/tieDetection';

interface TelaoViewProps {
  session: VotingSession;
}

// Converte cor hexadecimal para estilos ricos de fundo, borda, barra e badge
function getCardColorStyles(hexColor: string, isUnclassified = false) {
  const safeHex = /^#[0-9A-Fa-f]{6}$/.test(hexColor) ? hexColor : '#10b981';
  const r = parseInt(safeHex.slice(1, 3), 16);
  const g = parseInt(safeHex.slice(3, 5), 16);
  const b = parseInt(safeHex.slice(5, 7), 16);

  return {
    r,
    g,
    b,
    cardStyle: {
      backgroundColor: isUnclassified
        ? `rgba(${r}, ${g}, ${b}, 0.45)`
        : `rgba(${Math.round(r * 0.22)}, ${Math.round(g * 0.25)}, ${Math.round(b * 0.28)}, 0.94)`,
      borderColor: isUnclassified
        ? `rgba(${r}, ${g}, ${b}, 0.55)`
        : `rgba(${r}, ${g}, ${b}, 0.85)`,
      boxShadow: isUnclassified
        ? 'none'
        : `0 4px 14px -2px rgba(${r}, ${g}, ${b}, 0.25)`,
    } as React.CSSProperties,
    barStyle: {
      background: `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0.65), rgba(${r}, ${g}, ${b}, 0.30))`,
    } as React.CSSProperties,
    badgeStyle: {
      backgroundColor: `rgba(${Math.round(r * 0.18)}, ${Math.round(g * 0.2)}, ${Math.round(b * 0.24)}, 0.95)`,
      borderColor: `rgba(${r}, ${g}, ${b}, 0.7)`,
      color: '#ffffff',
    } as React.CSSProperties,
    rankStyle: {
      backgroundColor: `rgba(${r}, ${g}, ${b}, 0.28)`,
      borderColor: `rgba(${r}, ${g}, ${b}, 0.75)`,
      color: '#ffffff',
    } as React.CSSProperties,
    dotStyle: {
      backgroundColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
      borderColor: safeHex,
    } as React.CSSProperties,
    textColor: safeHex,
  };
}

export const TelaoView: React.FC<TelaoViewProps> = ({ session }) => {
  // Heartbeat do Telão para evitar que o Admin abra janelas duplicadas
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sendPing = () => {
      localStorage.setItem('vota_iasd_telao_ping', Date.now().toString());
    };
    sendPing();
    const interval = setInterval(sendPing, 2000);
    const onUnload = () => {
      localStorage.removeItem('vota_iasd_telao_ping');
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', onUnload);
      localStorage.removeItem('vota_iasd_telao_ping');
    };
  }, []);


  const [voterUrl, setVoterUrl] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [glowingIds, setGlowingIds] = useState<Record<string, boolean>>({});
  const knownOptionIdsRef = useRef<Set<string>>(new Set((session.options || []).map((o) => o.id)));
  const prevEventIdRef = useRef<string | undefined>(session.activeEventId);

  // Detecta novos nomes que entram no Telão e ativa brilho intenso por 1.5s (sem piscar na troca de evento)
  useEffect(() => {
    const currentOptions = session.options || [];
    const currentIds = currentOptions.map((o) => o.id);

    // Se houve troca de evento, sincroniza os IDs conhecidos sem disparar o brilho geral
    if (prevEventIdRef.current !== session.activeEventId) {
      prevEventIdRef.current = session.activeEventId;
      knownOptionIdsRef.current = new Set(currentIds);
      setGlowingIds({});
      return;
    }

    const now = Date.now();
    const newlyAdded = currentOptions
      .filter((o) => !knownOptionIdsRef.current.has(o.id) || (o.createdAt && now - o.createdAt < 1500))
      .map((o) => o.id);
    knownOptionIdsRef.current = new Set(currentIds);

    if (newlyAdded.length > 0) {
      setGlowingIds((prev) => {
        const next = { ...prev };
        newlyAdded.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
      const timer = setTimeout(() => {
        setGlowingIds((prev) => {
          const next = { ...prev };
          newlyAdded.forEach((id) => {
            delete next[id];
          });
          return next;
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [session.options, session.activeEventId]);

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

  // Configurações personalizáveis de layout dos cards no Telão
  const layoutColumns = session.telaoLayout?.columns ?? 2;
  const qrPosition = session.telaoLayout?.qrPosition ?? 'middle';
  const qrSize = session.telaoLayout?.qrSize ?? 100;
  const qrScaleFactor = Math.max(0.5, Math.min(1.5, qrSize / 100));
  const qrPanelWidth = Math.round(378 * qrScaleFactor);
  const qrSvgSize = Math.round(330 * qrScaleFactor);
  const qrAlignClass =
    qrPosition === 'top'
      ? 'self-start'
      : qrPosition === 'bottom'
      ? 'self-end'
      : 'self-center';
  const cardHeight = session.telaoLayout?.cardHeight ?? 38;
  const cardGap = (session.telaoLayout?.cardGapV2 !== undefined && session.telaoLayout.cardGapV2 !== 2) ? session.telaoLayout.cardGapV2 : 0;
  const winnerColor = session.telaoLayout?.winnerColor || '#10b981';
  const suplenteColor = session.telaoLayout?.suplenteColor || '#3b82f6';
  const suplente2Color = session.telaoLayout?.suplente2Color || '#64748b';
  const unclassifiedColor = session.telaoLayout?.unclassifiedColor || '#1e293b';

  const winnerStyles = getCardColorStyles(winnerColor);
  const suplente1Styles = getCardColorStyles(suplenteColor);
  const suplente2Styles = getCardColorStyles(suplente2Color);
  const unclassifiedStyles = getCardColorStyles(unclassifiedColor, true);

  // Ordena opções por contagem de votos (decrescente) e, quando zerados/empatados, por ordem alfabética (A-Z)
  const sortedOptions = [...optionsToDisplay].sort((a, b) => {
    const diff = (b.votesCount || 0) - (a.votesCount || 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });

  const maxVotesRecorded = Math.max(...optionsToDisplay.map((o) => o.votesCount || 0), 1);
  const totalVotesCast = optionsToDisplay.reduce((acc, curr) => acc + (curr.votesCount || 0), 0);
  const maxVotesPerBallot = isTieBreak
    ? (session.tieBreak?.maxVotesPerVoter || 1)
    : (session.maxVotesPerVoter || 1);
  const totalVotersVoted =
    totalVotesCast > 0 ? Math.max(1, Math.round(totalVotesCast / maxVotesPerBallot)) : 0;

  // Força Modo Tela Cheia (Fullscreen) contínuo
  const enterFullscreen = () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(document.fullscreenElement);
      setIsFullscreen(isFs);
      // Se saiu de tela cheia por algum motivo, tenta reentrar
      if (!isFs) {
        enterFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Monitoramento contínuo para garantir que a 2ª tela fique SEMPRE em tela cheia
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Tenta tela cheia imediatamente
    enterFullscreen();

    // 2. Qualquer gesto, clique, tecla ou foco na tela ativa tela cheia imediatamente
    const handleForceFs = () => {
      enterFullscreen();
    };

    window.addEventListener('click', handleForceFs);
    window.addEventListener('touchstart', handleForceFs);
    window.addEventListener('keydown', handleForceFs);
    window.addEventListener('focus', handleForceFs);
    window.addEventListener('mousemove', handleForceFs, { once: true });

    const handleVisibility = () => {
      if (!document.hidden) {
        enterFullscreen();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('click', handleForceFs);
      window.removeEventListener('touchstart', handleForceFs);
      window.removeEventListener('keydown', handleForceFs);
      window.removeEventListener('focus', handleForceFs);
      window.removeEventListener('mousemove', handleForceFs);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const baseOrigin = isLocal
        ? 'https://vota-iasd-central.web.app/'
        : `${window.location.origin}${window.location.pathname}`;
      setVoterUrl(`${baseOrigin}?view=voter&pin=${session.pin}`);
      enterFullscreen();
    }
  }, [session.pin]);

  const prevStatusRef = useRef<string>(session.status);
  const prevEventConfettiRef = useRef<string | undefined>(session.activeEventId);

  // Disparo de confetes se o status mudar para CLOSED (Resultado Final apenas no momento do encerramento)
  useEffect(() => {
    const isSameEvent = prevEventConfettiRef.current === session.activeEventId;
    const justClosed = prevStatusRef.current !== 'CLOSED' && session.status === 'CLOSED';
    prevStatusRef.current = session.status;
    prevEventConfettiRef.current = session.activeEventId;

    if (isSameEvent && justClosed) {
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
  }, [session.status, session.activeEventId]);

  return (
    <div className="min-h-screen bg-[#07132a] text-white p-2 sm:p-3 lg:p-3.5 flex flex-col justify-between select-none">
      {/* AVISO / BOTÃO DE TELA CHEIA PERSISTENTE (GARANTE TELA CHEIA SEMPRE) */}
      {!isFullscreen && (
        <div
          onClick={enterFullscreen}
          className="fixed top-2.5 right-4 z-50 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-blue-950 font-black px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 cursor-pointer animate-pulse text-xs uppercase tracking-wider border-2 border-amber-300"
          title="Clique para ativar Tela Cheia"
        >
          <Maximize className="w-4 h-4" />
          <span>Ativar Tela Cheia (Telão)</span>
        </div>
      )}

      {/* ÁREA CENTRAL: QR CODE CENTRALIZADO EM RELAÇÃO À SEÇÃO DE CARDS (items-center) */}
      <div className="flex-1 w-full">
        <div className="flex flex-col md:flex-row items-center w-full">
          {/* COLUNA DA ESQUERDA: PAINEL DO QR CODE E SENHA (TAMANHO REGULÁVEL POR SLIDE EM CONFIGURAÇÕES) */}
          <div
            style={{
              width: showQrCode ? `${qrPanelWidth}px` : '0px',
              marginRight: showQrCode ? '16px' : '0px',
              opacity: showQrCode ? 1 : 0,
              transition:
                'width 350ms cubic-bezier(0.25, 0.1, 0.25, 1), margin-right 350ms cubic-bezier(0.25, 0.1, 0.25, 1), opacity 350ms ease-in-out',
              pointerEvents: showQrCode ? 'auto' : 'none',
              willChange: 'width, margin-right, opacity',
            }}
            className={`overflow-hidden shrink-0 ${qrAlignClass} flex items-center transition-all duration-300`}
          >
            <div
              style={{
                width: `${qrPanelWidth}px`,
                transform: showQrCode ? 'translateX(0px)' : `translateX(-${qrPanelWidth}px)`,
                transition: 'width 350ms cubic-bezier(0.25, 0.1, 0.25, 1), transform 350ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                willChange: 'width, transform',
              }}
              className="shrink-0 bg-[#001f47]/95 border-2 border-amber-500/40 rounded-2xl px-3 py-3 shadow-2xl flex flex-col items-center text-center"
            >
              <h3 className="font-black text-white text-base sm:text-lg font-serif tracking-wider uppercase mb-2">
                LEIA O QR CODE
              </h3>

              {/* QR Code redimensionável pelo slider de Configurações */}
              <div className="w-full p-2.5 bg-white rounded-2xl shadow-xl mb-2.5 border-2 border-[#d4af37] flex items-center justify-center">
                <QRCodeSVG
                  value={voterUrl || `https://vota-iasd-central.web.app/?view=voter&pin=${session.pin}`}
                  size={qrSvgSize}
                  level="M"
                  includeMargin={false}
                  style={{ width: '100%', height: 'auto', maxWidth: `${qrSvgSize}px` }}
                />
              </div>

              {/* Caixa da Senha em Linha Única: SENHA XXXX */}
              <div className="w-full bg-[#07132a] border border-[#d4af37] rounded-xl py-2 px-3 shadow-inner flex items-center justify-center gap-2.5">
                <span className="text-sm sm:text-base uppercase font-black text-blue-300 tracking-wider">
                  SENHA
                </span>
                <span className="text-xl sm:text-2xl font-mono font-black text-[#d4af37] tracking-widest">
                  {session.pin}
                </span>
              </div>
            </div>
          </div>

          {/* COLUNA DA DIREITA: LISTA DE CANDIDATOS / CORRIDA DE BARRAS OU VOTO SECRETO */}
          <div className="flex-1 min-w-0 w-full">
            {session.telaoMode === 'names' || session.status === 'WAITING' ? (
              /* MODO: NOMES PARA ESCOLHA (PRINT 2 REDIMENSIONADO PARA O TELÃO) */
              <div className="bg-[#001f47]/90 border border-blue-700/70 rounded-2xl p-4 sm:p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-blue-800/80">
                  {/* CABEÇALHO: ESCOLHA XX NOMES - Eleição do tesoureiro (título menor e sem caixa alta) */}
                  <div className="flex items-baseline gap-2 min-w-0">
                    <Users className="w-5 h-5 text-amber-400 self-center shrink-0" />
                    <h3 className="font-extrabold text-base sm:text-lg lg:text-xl text-white font-sans tracking-tight uppercase shrink-0">
                      ESCOLHA <span className="text-amber-400">{session.maxVotesPerVoter}</span>{' '}
                      {session.maxVotesPerVoter === 1 ? 'NOME' : 'NOMES'}
                    </h3>
                    {session.title && (
                      <span className="text-sm sm:text-base font-medium text-emerald-400 truncate">
                        - {(() => {
                          const t = session.title.trim().toLocaleLowerCase('pt-BR');
                          return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
                        })()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* BOTÃO TELA CHEIA (GARANTIA DE TELA CHEIA SEMPRE) */}
                    <button
                      type="button"
                      onClick={enterFullscreen}
                      title="Garantir modo Tela Cheia no Projetor / TV (F11)"
                      className="bg-[#07132a] hover:bg-[#002f6c] border border-blue-700/80 text-amber-300 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow transition cursor-pointer text-xs active:scale-95"
                    >
                      <Maximize className="w-3.5 h-3.5" />
                      <span>{isFullscreen ? 'Tela Cheia Ativa' : 'Tela Cheia'}</span>
                    </button>
                  </div>
                </div>

                {optionsToDisplay.length === 0 ? (
                  <div className="p-12 text-center text-slate-300 text-sm border-2 border-dashed border-blue-800 rounded-2xl bg-[#07132a]/60">
                    Aguardando cadastro dos nomes no painel...
                  </div>
                ) : (
                  <div
                    style={{ gap: `${cardGap}px` }}
                    className={`grid ${
                      layoutColumns === 1
                        ? 'grid-cols-1'
                        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    }`}
                  >
                    <AnimatePresence mode="popLayout">
                      {[...optionsToDisplay]
                        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
                        .map((option) => {
                          const isGlowing = Boolean(
                            glowingIds[option.id] ||
                              (option.createdAt && Date.now() - option.createdAt < 1500)
                          );
                          return (
                            <motion.div
                              layout
                              key={option.id}
                              initial={{ opacity: 0, scale: 0.82, y: -10 }}
                              animate={{
                                opacity: 1,
                                scale: isGlowing ? 1.04 : 1,
                                y: 0,
                              }}
                              exit={{ opacity: 0, scale: 0.85 }}
                              transition={{
                                layout: { type: 'spring', stiffness: 320, damping: 26 },
                                duration: 0.35,
                              }}
                              style={{ minHeight: `${cardHeight}px` }}
                              className={`px-3.5 py-1.5 sm:py-2 rounded-lg flex items-center transition-all duration-500 ${
                                isGlowing
                                  ? 'bg-gradient-to-r from-amber-500/45 via-yellow-400/40 to-amber-500/45 border-2 border-yellow-300 ring-2 ring-amber-300/90 shadow-[0_0_32px_rgba(251,191,36,0.98),inset_0_0_18px_rgba(254,240,138,0.7)] z-10'
                                  : 'bg-[#07132a] hover:bg-[#0c1f44] border-2 border-blue-700/80 shadow-md'
                              }`}
                            >
                              {/* Nome do Candidato em Destaque Maiúsculo (Sem iniciais CE..) */}
                              <div className="flex-1 min-w-0">
                                <h4
                                  className={`font-extrabold text-xs sm:text-sm lg:text-[15px] uppercase tracking-wide truncate transition-colors duration-500 ${
                                    isGlowing
                                      ? 'text-yellow-100 drop-shadow-[0_0_10px_rgba(254,240,138,1)]'
                                      : 'text-white'
                                  }`}
                                >
                                  {option.name}
                                </h4>
                              </div>
                            </motion.div>
                          );
                        })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ) : session.status === 'VOTING' || session.status === 'TIE_BREAK' ? (
              <div className="h-full min-h-[460px] flex flex-col justify-between p-4 sm:p-6 bg-[#001f47]/85 rounded-2xl border border-blue-800/60 shadow-2xl relative overflow-hidden">
                {/* Brilho suave de fundo */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-80 h-80 rounded-full bg-blue-500/10 blur-3xl" />
                </div>

                {/* Cabeçalho no topo: Título da votação centralizado em laranja (sem o card 1 JÁ VOTOU no topo esq) */}
                <div className="flex items-center justify-center border-b border-blue-800/70 pb-3 z-10">
                  <span className="text-sm sm:text-base lg:text-lg font-black uppercase tracking-widest text-orange-400 text-center">
                    {isTieBreak ? 'Rodada de Desempate' : session.title}
                  </span>
                </div>

                {/* Centro: Roda pulsante suave e girando + Contador de quantas pessoas já votaram */}
                <div className="flex-1 flex flex-col items-center justify-center text-center py-8 z-10">
                  <div className="relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center mb-6">
                    {/* Halo externo pulsante suave */}
                    <motion.div
                      animate={{
                        scale: [1, 1.18, 1],
                        opacity: [0.2, 0.5, 0.2],
                      }}
                      transition={{
                        duration: 3.2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#d4af37]/20 via-blue-400/20 to-emerald-400/20 border-2 border-[#d4af37]/40"
                    />

                    {/* Anel girando em sentido horário */}
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="absolute inset-2 rounded-full border-4 border-blue-800/40 border-t-[#d4af37] border-r-emerald-400/80"
                    />

                    {/* Segundo anel tracejado girando suavemente no sentido oposto */}
                    <motion.div
                      animate={{ rotate: -360 }}
                      transition={{
                        duration: 14,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="absolute inset-6 rounded-full border-2 border-dashed border-blue-400/50"
                    />

                    {/* Núcleo central com contador em destaque */}
                    <motion.div
                      animate={{ scale: [1, 1.04, 1] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#07132a]/95 border-2 border-blue-600/60 shadow-[0_0_30px_rgba(16,185,129,0.2)] flex flex-col items-center justify-center px-2"
                    >
                      <motion.span
                        key={totalVotersVoted}
                        initial={{ scale: 1.35, opacity: 0.5 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 14, stiffness: 240 }}
                        className="font-mono font-black text-3xl sm:text-4xl text-amber-300 leading-none"
                      >
                        {totalVotersVoted}
                      </motion.span>
                      <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-300 mt-1">
                        {totalVotersVoted === 1 ? 'pessoa votou' : 'já votaram'}
                      </span>
                    </motion.div>
                  </div>

                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-white uppercase tracking-wide">
                    Aguardando o resultado...
                  </h2>
                </div>

                <div className="h-2" />
              </div>
            ) : (
              <div className="bg-[#001f47]/80 border border-blue-800/60 rounded-2xl p-3 sm:p-4 shadow-xl">
                {/* CABEÇALHO DO PAINEL TELÃO: XX JÁ VOTARAM (SEM O ÍCONE [ ] DE TELA CHEIA) */}
                <div className="flex flex-wrap items-center justify-between mb-3 pb-2.5 border-b border-blue-800/80 gap-2">
                  <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-xl bg-[#07132a]/90 border border-blue-700/80 shadow-md">
                    <div className="flex items-center gap-1.5 text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                      <strong className="text-amber-300 font-mono text-sm sm:text-base font-black">
                        {totalVotersVoted}
                      </strong>
                      <span>{totalVotersVoted === 1 ? 'JÁ VOTOU' : 'JÁ VOTARAM'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-semibold">
                    <span className="flex items-center gap-1" style={{ color: winnerStyles.textColor }}>
                      <span
                        className="w-2.5 h-2.5 rounded-sm border inline-block"
                        style={winnerStyles.dotStyle}
                      />
                      Titulares ({vacancies})
                    </span>
                    {suplentesCount > 0 && (
                      <span className="flex items-center gap-1" style={{ color: suplente1Styles.textColor }}>
                        <span
                          className="w-2.5 h-2.5 rounded-sm border inline-block"
                          style={suplente1Styles.dotStyle}
                        />
                        {segundoSuplentesCount > 0 ? `1º Suplentes (${suplentesCount})` : `Suplentes (${suplentesCount})`}
                      </span>
                    )}
                    {segundoSuplentesCount > 0 && (
                      <span className="flex items-center gap-1" style={{ color: suplente2Styles.textColor }}>
                        <span
                          className="w-2.5 h-2.5 rounded-sm border inline-block"
                          style={suplente2Styles.dotStyle}
                        />
                        2º Suplentes ({segundoSuplentesCount})
                      </span>
                    )}
                  </div>
                </div>

                {/* ALERTA DE EMPATE NO TELÃO AO ENCERRAR VOTAÇÃO (BORDA VERMELHA FINA, ESTRELA E "EMPATE" CLARO) */}
                {hasTies && (
                  <div className="mb-3 p-2.5 sm:p-3 rounded-xl bg-rose-950/90 border border-rose-500/80 text-rose-200 shadow-2xl flex items-center justify-between gap-3 animate-pulse">
                    <div className="flex items-center gap-2.5">
                      <Star className="w-5 h-5 sm:w-6 sm:h-6 text-rose-400 fill-rose-400 shrink-0" />
                      <div>
                        <h4 className="font-black text-xs sm:text-sm lg:text-base text-white uppercase tracking-wide flex items-center gap-2">
                          EMPATE DETECTADO: {detectedTies.map((t) => t.label).join(' • ')}
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-600/40 text-rose-300 border border-rose-500/60 inline-flex items-center gap-1">
                            <Star className="w-2.5 h-2.5 fill-rose-400 text-rose-400" />
                            EMPATE
                          </span>
                        </h4>
                        <p className="text-[11px] sm:text-xs text-rose-200/90 font-medium">
                          {detectedTies
                            .map(
                              (t) =>
                                `${t.label} (${t.votesCount} ${t.votesCount === 1 ? 'voto' : 'votos'}): ${t.tiedCandidates.map((c) => c.name).join(', ')}`
                            )
                            .join(' | ')}
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-rose-600 border border-rose-400 text-white font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-lg shrink-0 shadow">
                      Aguardando Desempate
                    </span>
                  </div>
                )}

                {/* ESTRUTURA DOS CARDS DE VOTAÇÃO COM ALTURA, ESPAÇAMENTO, COLUNAS E CORES PERSONALIZÁVEIS */}
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

                  const gridColsClass =
                    layoutColumns === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2';

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

                    const categoryStyles = isElected
                      ? winnerStyles
                      : isSuplente1
                      ? suplente1Styles
                      : isSuplente2
                      ? suplente2Styles
                      : unclassifiedStyles;

                    return (
                      <motion.div
                        layout
                        key={option.id}
                        transition={{
                          layout: { type: 'spring', stiffness: 240, damping: 28 },
                        }}
                        style={{
                          minHeight: `${cardHeight}px`,
                          ...(tiedGroup ? {} : categoryStyles.cardStyle),
                        }}
                        className={`border transition-colors duration-200 relative overflow-hidden flex items-center py-1 px-2.5 sm:py-1.5 sm:px-3 rounded-none first:rounded-t-lg last:rounded-b-lg -mt-px gap-2 shadow-sm hover:z-20 ${
                          tiedGroup
                            ? 'bg-[#18080c]/90 border border-rose-500/80 text-white shadow-md'
                            : isElected
                            ? 'text-white'
                            : isSuplente1
                            ? 'text-blue-100'
                            : isSuplente2
                            ? 'text-slate-200'
                            : 'text-slate-300 py-0.5 px-2 rounded-md'
                        }`}
                      >
                        {/* 1. POSIÇÃO / RANK */}
                        <div
                          style={
                            !tiedGroup && (!isElected || rank > 3)
                              ? categoryStyles.rankStyle
                              : undefined
                          }
                          className={`flex items-center justify-center font-black shrink-0 shadow-sm ${
                            tiedGroup
                              ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-rose-600 text-white border border-rose-400'
                              : isElected
                              ? rank === 1
                                ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-gradient-to-tr from-amber-400 to-[#d4af37] text-blue-950 ring-1 ring-amber-300'
                                : rank === 2
                                ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-slate-300 text-slate-900'
                                : rank === 3
                                ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs bg-amber-700 text-white'
                                : 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs border'
                              : isSuplente1
                              ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs border'
                              : isSuplente2
                              ? 'w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md text-[10px] sm:text-xs border'
                              : 'w-5 h-5 sm:w-5.5 sm:h-5.5 rounded text-[9.5px] border'
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

                        {/* 2. COLUNA DE NOME DO CANDIDATO (20 CARACTERES) */}
                        <div className="w-[20ch] min-w-[20ch] max-w-[20ch] z-10 shrink-0" title={option.name}>
                          <h4
                            className={`leading-tight uppercase tracking-wide truncate ${
                              tiedGroup
                                ? 'font-black text-xs sm:text-sm text-white'
                                : isElected
                                ? 'font-black text-xs sm:text-sm text-white'
                                : isSuplente1
                                ? 'font-bold text-[11px] sm:text-xs text-white'
                                : isSuplente2
                                ? 'font-bold text-[11px] sm:text-xs text-slate-100'
                                : 'font-semibold text-[10px] sm:text-[11px] text-slate-200'
                            }`}
                          >
                            {option.name && option.name.length > 20
                              ? `${option.name.slice(0, 20)}...`
                              : option.name}
                          </h4>
                        </div>

                        {/* 3. COLUNA PARA TITULAR / CARGO DEDICADA */}
                        <div className="w-[85px] min-w-[85px] max-w-[85px] z-10 shrink-0 flex items-center">
                          {tiedGroup ? (
                            <span className="inline-flex items-center gap-1 text-[8.5px] px-2 py-0.5 rounded-full font-black bg-rose-600/80 border border-rose-400 text-white uppercase shadow whitespace-nowrap">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              EMPATE
                            </span>
                          ) : (
                            <>
                              {isElected && (
                                <span
                                  style={winnerStyles.badgeStyle}
                                  className="inline-flex items-center gap-1 text-[8.5px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap shadow-xs"
                                >
                                  <CheckCircle className="w-2.5 h-2.5" style={{ color: winnerStyles.textColor }} />
                                  Titular
                                </span>
                              )}
                              {isSuplente1 && (
                                <span
                                  style={suplente1Styles.badgeStyle}
                                  className="inline-flex items-center gap-1 text-[8px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap shadow-xs"
                                >
                                  {segundoSuplentesCount > 0 ? '1º Suplente' : 'Suplente'}
                                </span>
                              )}
                              {isSuplente2 && (
                                <span
                                  style={suplente2Styles.badgeStyle}
                                  className="inline-flex items-center gap-1 text-[8px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap shadow-xs"
                                >
                                  2º Suplente
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* 4. ÁREA DA BARRA DE PROGRESSÃO (O 100% PARA ANTES DOS VOTOS) */}
                        <div className="flex-1 relative h-6 sm:h-7 mx-1.5 min-w-[60px] bg-black/40 rounded border border-white/[0.08] overflow-hidden flex items-center shadow-inner z-10">
                          {(option.votesCount || 0) > 0 ? (
                            <motion.div
                              initial={false}
                              animate={{ width: `${Math.max(percentage, 2)}%` }}
                              transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                              className="absolute top-0 bottom-0 left-0 pointer-events-none rounded-l overflow-visible z-10 will-change-[width]"
                              style={{
                                background: tiedGroup
                                  ? 'linear-gradient(90deg, rgba(225, 29, 72, 0.22) 0%, rgba(225, 29, 72, 0.40) 60%, rgba(225, 29, 72, 0.60) 100%)'
                                  : `linear-gradient(90deg, rgba(${categoryStyles.r}, ${categoryStyles.g}, ${categoryStyles.b}, 0.22) 0%, rgba(${categoryStyles.r}, ${categoryStyles.g}, ${categoryStyles.b}, 0.40) 60%, rgba(${categoryStyles.r}, ${categoryStyles.g}, ${categoryStyles.b}, 0.60) 100%)`,
                                backdropFilter: 'blur(8px)',
                                borderTop: '1px solid rgba(255, 255, 255, 0.45)',
                                borderBottom: `1px solid rgba(${categoryStyles.r}, ${categoryStyles.g}, ${categoryStyles.b}, 0.3)`,
                                boxShadow: `inset 0 1px 2px rgba(255, 255, 255, 0.6), 0 0 10px rgba(${categoryStyles.r}, ${categoryStyles.g}, ${categoryStyles.b}, 0.35)`,
                              }}
                            >
                              {/* Brilho especular superior do vidro */}
                              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent pointer-events-none" />

                              {/* % puxada 1 caracter para a esq (mr-[14px]), bold, fonte 15% maior (text-[12px] sm:text-[13px]) + Faixinha laranja */}
                              <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pointer-events-none z-20 pr-0.5">
                                <span className="text-[12px] sm:text-[13px] font-mono font-black text-amber-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] mr-[14px] select-none leading-none">
                                  {percentage}%
                                </span>
                                <div className="absolute -inset-y-1 w-2 sm:w-3.5 -right-0.5 bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 opacity-85 blur-[1.5px] sm:blur-[3px]" />
                                <div className="relative w-[2.8px] sm:w-[4.8px] h-full bg-gradient-to-b from-[#fffbe6] via-[#fbbf24] to-[#f59e0b] shadow-[0_0_5px_#fbbf24,0_0_8px_rgba(245,158,11,0.6)] sm:shadow-[0_0_8px_#fbbf24,0_0_14px_rgba(245,158,11,0.9),0_0_2px_#ffffff] rounded-r-xs" />
                              </div>
                            </motion.div>
                          ) : (
                            <span className="text-[11px] font-mono font-semibold text-slate-500 pl-2">
                              0%
                            </span>
                          )}
                        </div>

                        {/* LINHA VERTICAL FINAL (MARCANDO O LIMITE 100%) */}
                        <div className="w-[2px] h-5 sm:h-6 bg-white/25 border-r border-white/40 shrink-0 self-center z-10" title="Limite 100%" />

                        {/* 5. CONTADOR NUMÉRICO DE VOTOS (Sem badge, só o número 80% maior, sem borda, amarelo e bold) */}
                        <div className="text-right z-10 shrink-0 flex items-center justify-end min-w-[42px] font-mono ml-1.5">
                          <span className="text-[22px] font-black text-amber-300 select-none leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                            {Math.floor(option.votesCount || 0)}
                          </span>
                        </div>
                      </motion.div>
                    );
                  };

                  return (
                    <LayoutGroup>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: `${cardGap}px` }}>
                      {/* 1. SEÇÃO DE TITULARES */}
                      <div className={`grid ${gridColsClass}`} style={{ gap: `${cardGap}px` }}>
                        <AnimatePresence>
                          {titulares.map((option, idx) => renderCandidateCard(option, idx + 1, 'titular'))}
                        </AnimatePresence>
                      </div>

                      {/* 2. SEÇÃO DE SUPLENTES */}
                      {suplentesCount > 0 && (
                        <div className="w-full pt-0.5">
                          {segundoSuplentesCount > 0 ? (
                            <div
                              className={`grid ${gridColsClass} items-start`}
                              style={{ gap: `${cardGap}px` }}
                            >
                              {/* COLUNA 1: 1º SUPLENTE */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: `${cardGap}px` }}>
                                <div className="flex items-center gap-2 py-0.5">
                                  <div
                                    className="flex-1 border-t-2 border-dashed"
                                    style={{ borderColor: suplente1Styles.textColor }}
                                  />
                                  <span
                                    className="font-black text-xs uppercase tracking-widest px-2 select-none shrink-0"
                                    style={{ color: suplente1Styles.textColor }}
                                  >
                                    1º SUPLENTES ({suplentesCount})
                                  </span>
                                  <div
                                    className="flex-1 border-t-2 border-dashed"
                                    style={{ borderColor: suplente1Styles.textColor }}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: `${cardGap}px` }}>
                                  <AnimatePresence>
                                    {suplentes1.map((option, idx) =>
                                      renderCandidateCard(option, vacancies + idx + 1, 'suplente1')
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>

                              {/* COLUNA 2: 2º SUPLENTE */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: `${cardGap}px` }}>
                                <div className="flex items-center gap-2 py-0.5">
                                  <div
                                    className="flex-1 border-t-2 border-dashed"
                                    style={{ borderColor: suplente2Styles.textColor }}
                                  />
                                  <span
                                    className="font-black text-xs uppercase tracking-widest px-2 select-none shrink-0"
                                    style={{ color: suplente2Styles.textColor }}
                                  >
                                    2º SUPLENTES ({segundoSuplentesCount})
                                  </span>
                                  <div
                                    className="flex-1 border-t-2 border-dashed"
                                    style={{ borderColor: suplente2Styles.textColor }}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: `${cardGap}px` }}>
                                  <AnimatePresence>
                                    {suplentes2.map((option, idx) =>
                                      renderCandidateCard(option, vacancies + suplentesCount + idx + 1, 'suplente2')
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: `${cardGap}px` }}>
                              <div className="flex items-center gap-3 py-0.5">
                                <div
                                  className="flex-1 border-t-2 border-dashed"
                                  style={{ borderColor: suplente1Styles.textColor }}
                                />
                                <span
                                  className="font-black text-xs uppercase tracking-widest px-2 select-none shrink-0"
                                  style={{ color: suplente1Styles.textColor }}
                                >
                                  SUPLENTES ({suplentesCount})
                                </span>
                                <div
                                  className="flex-1 border-t-2 border-dashed"
                                  style={{ borderColor: suplente1Styles.textColor }}
                                />
                              </div>
                              <div className={`grid ${gridColsClass}`} style={{ gap: `${cardGap}px` }}>
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
                        <div className="w-full pt-1" style={{ display: 'flex', flexDirection: 'column', gap: `${cardGap}px` }}>
                          <div className="flex items-center gap-3 py-0.5">
                            <div className="flex-1 border-t-2 border-dashed border-slate-600/60" />
                            <span className="text-slate-400 font-bold text-xs uppercase tracking-widest px-2 select-none shrink-0">
                              NÃO CLASSIFICADOS
                            </span>
                            <div className="flex-1 border-t-2 border-dashed border-slate-600/60" />
                          </div>
                          <div className={`grid ${gridColsClass}`} style={{ gap: `${cardGap}px` }}>
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
                    </LayoutGroup>
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
