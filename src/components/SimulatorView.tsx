import React, { useState, useEffect, useMemo } from 'react';
import {
  Smartphone,
  RotateCcw,
  CheckCircle2,
  Users,
  KeyRound,
  PlayCircle,
  Loader2,
  Shuffle,
  Maximize2,
} from 'lucide-react';
import type { VotingSession } from '../types';
import { VoterView } from './VoterView';
import {
  submitBallot,
  clearVotedFlag,
  hasVoted,
  saveSession,
  getLocalSession,
} from '../services/votingService';

interface SimulatorViewProps {
  session: VotingSession;
  onReturnToAdmin?: () => void;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({ session }) => {
  const [deviceCount, setDeviceCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = Number(localStorage.getItem('vota_sim_device_count'));
      if (saved && !isNaN(saved) && saved >= 1 && saved <= 60) return saved;
    }
    return 8;
  });

  const [deviceInputStr, setDeviceInputStr] = useState<string>(() => String(deviceCount));
  const [autoAuthPin, setAutoAuthPin] = useState<boolean>(true);
  const [isAutoVoting, setIsAutoVoting] = useState<boolean>(false);
  const [votingProgress, setVotingProgress] = useState<{ current: number; total: number } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Seleções de candidatos por aparelho simulado
  const [deviceSelections, setDeviceSelections] = useState<Record<string, string[]>>({});

  // Monitora altura da janela do navegador para cálculo do Auto-Fit (caber na tela)
  const [windowHeight, setWindowHeight] = useState<number>(() => {
    return typeof window !== 'undefined' ? window.innerHeight : 900;
  });

  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSetDeviceCount = (count: number) => {
    const clamped = Math.max(1, Math.min(60, count));
    setDeviceCount(clamped);
    setDeviceInputStr(String(clamped));
    if (typeof window !== 'undefined') {
      localStorage.setItem('vota_sim_device_count', String(clamped));
    }

    // Sincroniza imediatamente o total de votantes da sessão para que Telão e Admin reconheçam a quantidade simulada
    const current = getLocalSession();
    if (current) {
      const updatedEvents = (current.events || []).map((evt) => {
        if (evt.id === current.activeEventId) {
          return {
            ...evt,
            totalVotersConnected: clamped,
            ...(current.status === 'TIE_BREAK'
              ? { mainVotersCount: Math.max(evt.mainVotersCount || 0, clamped) }
              : {}),
          };
        }
        return evt;
      });

      const updatedSession: VotingSession = {
        ...current,
        totalVotersConnected: clamped,
        ...(current.status === 'TIE_BREAK'
          ? { mainVotersCount: Math.max(current.mainVotersCount || 0, clamped) }
          : {}),
        events: updatedEvents,
        updatedAt: Date.now(),
      };
      saveSession(updatedSession);
    }
  };

  const isTieBreak = session.status === 'TIE_BREAK' && Boolean(session.tieBreak?.active);
  const currentRound = isTieBreak ? 'TIE_BREAK' : 'MAIN';
  const iteration = session.votingIteration || 1;
  const isVotingActive = session.status === 'VOTING' || session.status === 'TIE_BREAK';

  const options = isTieBreak ? session.tieBreak?.options || [] : session.options || [];
  const maxVotesAllowed = isTieBreak
    ? session.tieBreak?.maxVotesPerVoter || 1
    : session.maxVotesPerVoter || 1;

  // Lista dos IDs simulados
  const deviceIds = useMemo(() => {
    return Array.from({ length: deviceCount }, (_, i) => `sim_celular_${i + 1}`);
  }, [deviceCount]);

  // Função para verificar se um celular específico já votou
  const checkDeviceVoted = (id: string) => {
    return hasVoted(session.id, currentRound, iteration, id);
  };

  // Resetar todos os celulares simulados
  const handleResetAllDevices = () => {
    deviceIds.forEach((id) => {
      clearVotedFlag(session.id, currentRound, iteration, id);
    });
    setDeviceSelections({});
    setRefreshTrigger((prev) => prev + 1);
  };

  // Resetar um único celular
  const handleResetSingleDevice = (id: string) => {
    clearVotedFlag(session.id, currentRound, iteration, id);
    setDeviceSelections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRefreshTrigger((prev) => prev + 1);
  };

  // ESCOLHER ALEATÓRIO: O sistema escolhe em todos os celulares que ainda não votaram
  const handlePickRandomForAll = () => {
    if (!isVotingActive || options.length === 0) return;

    const newSelections: Record<string, string[]> = {};
    deviceIds.forEach((devId) => {
      if (!checkDeviceVoted(devId)) {
        const shuffled = [...options].sort(() => 0.5 - Math.random());
        const countToPick = Math.min(shuffled.length, maxVotesAllowed);
        newSelections[devId] = shuffled.slice(0, countToPick).map((o) => o.id);
      }
    });

    setDeviceSelections((prev) => ({ ...prev, ...newSelections }));
  };

  // Voto individual em um celular
  const handleRandomVoteSingle = async (deviceId: string) => {
    if (!isVotingActive || options.length === 0) return;
    if (checkDeviceVoted(deviceId)) return;

    let selectedIds = deviceSelections[deviceId];
    if (!selectedIds || selectedIds.length === 0) {
      const shuffled = [...options].sort(() => 0.5 - Math.random());
      const countToPick = Math.min(shuffled.length, maxVotesAllowed);
      selectedIds = shuffled.slice(0, countToPick).map((o) => o.id);
    }

    await submitBallot(session, selectedIds, currentRound, deviceId);
    setRefreshTrigger((prev) => prev + 1);
  };

  // AO CLICAR NO BOTÃO CONFIRMAR: Dispara para todos com intervalo de 0,5 segundo entre um e outro
  const handleConfirmAll = async () => {
    if (!isVotingActive || options.length === 0 || isAutoVoting) return;
    setIsAutoVoting(true);

    // Garante que o total de votantes da sessão acompanhe o número de aparelhos simulados
    const current = getLocalSession();
    if (current) {
      const needsSync =
        (current.totalVotersConnected || 0) < deviceCount ||
        (current.status === 'TIE_BREAK' && (current.mainVotersCount || 0) < deviceCount);

      if (needsSync) {
        const updatedEvents = (current.events || []).map((evt) => {
          if (evt.id === current.activeEventId) {
            return {
              ...evt,
              totalVotersConnected: Math.max(evt.totalVotersConnected || 0, deviceCount),
              ...(current.status === 'TIE_BREAK'
                ? { mainVotersCount: Math.max(evt.mainVotersCount || 0, deviceCount) }
                : {}),
            };
          }
          return evt;
        });

        const syncedSession: VotingSession = {
          ...current,
          totalVotersConnected: Math.max(current.totalVotersConnected || 0, deviceCount),
          ...(current.status === 'TIE_BREAK'
            ? { mainVotersCount: Math.max(current.mainVotersCount || 0, deviceCount) }
            : {}),
          events: updatedEvents,
          updatedAt: Date.now(),
        };
        saveSession(syncedSession);
      }
    }

    const pendingDevices = deviceIds.filter((id) => !checkDeviceVoted(id));
    setVotingProgress({ current: 0, total: pendingDevices.length });

    for (let i = 0; i < pendingDevices.length; i++) {
      const devId = pendingDevices[i];
      setVotingProgress({ current: i + 1, total: pendingDevices.length });

      let selectedIds = deviceSelections[devId];
      if (!selectedIds || selectedIds.length === 0) {
        const shuffled = [...options].sort(() => 0.5 - Math.random());
        const countToPick = Math.min(shuffled.length, maxVotesAllowed);
        selectedIds = shuffled.slice(0, countToPick).map((o) => o.id);
        setDeviceSelections((prev) => ({ ...prev, [devId]: selectedIds }));
      }

      await submitBallot(session, selectedIds, currentRound, devId);
      setRefreshTrigger((prev) => prev + 1);

      // Intervalo de exatamente 250ms (0,25 segundo) entre cada confirmação
      if (i < pendingDevices.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    // Ao concluir todos os celulares simulados, salva a sessão completa para garantir sincronia com Telão e Admin
    const finalSession = getLocalSession();
    if (finalSession) {
      saveSession(finalSession);
    }

    setVotingProgress(null);
    setIsAutoVoting(false);
  };

  const votedCount = deviceIds.filter((id) => checkDeviceVoted(id)).length;

  // Layout de Colunas e Linhas baseado na regra:
  // - Até 6: 1 linha
  // - A partir de 8 celulares: 2 linhas (4 em cima, 4 em baixo)
  // - 10: 2 linhas (5 em cima, 5 em baixo)
  // - 12: 2 linhas (6 em cima, 6 em baixo)
  // - 16: 2 linhas (8 em cima, 8 em baixo)
  // - A partir de 17: 3 linhas
  const gridConfig = useMemo(() => {
    if (deviceCount <= 4) return { cols: Math.max(1, deviceCount), rows: 1 };
    if (deviceCount <= 6) return { cols: deviceCount, rows: 1 };
    if (deviceCount <= 8) return { cols: 4, rows: 2 };
    if (deviceCount <= 10) return { cols: 5, rows: 2 };
    if (deviceCount <= 12) return { cols: 6, rows: 2 };
    if (deviceCount <= 16) return { cols: 8, rows: 2 };
    if (deviceCount <= 21) return { cols: 7, rows: 3 };
    if (deviceCount <= 24) return { cols: 8, rows: 3 };
    const cols = Math.min(10, Math.ceil(deviceCount / 3));
    const rows = Math.ceil(deviceCount / cols);
    return { cols, rows };
  }, [deviceCount]);

  // CÁLCULO DE AUTO-FIT: Garante que TODAS as linhas de celulares caibam 100% na janela sem rolagem
  // Top Header: ~46px, Barra de Ajuste: ~34px, Rodapé: ~58px, Padding/Gaps: ~16px + (rows - 1)*8px
  const fittedRowHeight = useMemo(() => {
    const overhead = 46 + 34 + 58 + 20 + (gridConfig.rows - 1) * 8;
    const available = windowHeight - overhead;
    const calculated = Math.floor(available / gridConfig.rows);
    return Math.max(150, Math.min(580, calculated));
  }, [windowHeight, gridConfig.rows]);

  const [isAutoFit, setIsAutoFit] = useState<boolean>(true);
  const [manualHeight, setManualHeight] = useState<number>(300);

  const currentTotalCardHeight = isAutoFit ? fittedRowHeight : manualHeight;
  const currentInnerBodyHeight = Math.max(110, currentTotalCardHeight - 28);

  // Zoom proporcional à altura interna para o conteúdo do celular encolher sem distorcer
  const dynamicZoom = useMemo(() => {
    const ratio = currentInnerBodyHeight / 460;
    const z = ratio * 0.75;
    return Math.max(0.42, Math.min(0.85, Number(z.toFixed(2))));
  }, [currentInnerBodyHeight]);

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-[#060a12] text-slate-100 flex flex-col font-sans select-none w-full">
      {/* 1. BARRA SUPERIOR SLIM E MINIMALISTA */}
      <header className="bg-[#0b1322]/95 backdrop-blur border-b border-blue-900/40 px-3 sm:px-4 py-2 shrink-0 z-50 shadow-md">
        <div className="w-full flex flex-wrap items-center justify-between gap-2.5">
          {/* Lado Esquerdo: Título e Status */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/20 shrink-0">
              <Smartphone className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-sm sm:text-base font-black text-white tracking-wider uppercase">
                  SIMULADOR
                </h1>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#070e1b] border border-blue-800/60 shadow-inner">
                  <span className="font-mono font-black text-sm sm:text-base text-amber-300">
                    {votedCount} / {deviceCount}
                  </span>
                  <span className="text-[11px] font-bold text-slate-300 lowercase">
                    votaram
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                {session.title || 'Votação Ativa'} • Status:{' '}
                <span
                  className={`font-semibold ${
                    session.status === 'VOTING'
                      ? 'text-emerald-400'
                      : session.status === 'TIE_BREAK'
                      ? 'text-amber-400'
                      : 'text-slate-400'
                  }`}
                >
                  {session.status === 'VOTING'
                    ? 'EM VOTAÇÃO'
                    : session.status === 'TIE_BREAK'
                    ? 'DESEMPATE'
                    : session.status === 'CLOSED'
                    ? 'CONCLUÍDA'
                    : 'AGUARDANDO'}
                </span>
              </p>
            </div>
          </div>

          {/* Centro: Campo para digitar ou clicar para mudar a Qtde de Telas + Barra Esmagar na Frente */}
          <div className="flex items-center gap-2.5 flex-wrap justify-center">
            {/* Seção Qtde de telas */}
            <div className="flex items-center gap-1.5 bg-[#070e1b] border border-blue-900/60 rounded-lg px-2.5 py-1 shadow-inner shrink-0">
              <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-[11px] font-semibold text-slate-300 shrink-0">
                Qtde de telas:
              </span>
              <button
                type="button"
                onClick={() => handleSetDeviceCount(Math.max(1, deviceCount - (deviceCount > 10 ? 2 : 1)))}
                disabled={deviceCount <= 1}
                className="w-5 h-5 rounded bg-blue-950/90 hover:bg-blue-800 text-blue-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-bold text-xs transition cursor-pointer"
                title="Diminuir telas"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={60}
                value={deviceInputStr}
                onChange={(e) => {
                  setDeviceInputStr(e.target.value);
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 60) {
                    handleSetDeviceCount(val);
                  }
                }}
                onBlur={() => {
                  const val = parseInt(deviceInputStr, 10);
                  if (isNaN(val) || val < 1) {
                    handleSetDeviceCount(8);
                  } else if (val > 60) {
                    handleSetDeviceCount(60);
                  } else {
                    handleSetDeviceCount(val);
                  }
                }}
                className="w-11 px-1 py-0.5 text-center bg-[#050a14] border border-blue-800 rounded text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400"
                title="Digite ou clique nos botões para alterar a quantidade de telas"
              />
              <button
                type="button"
                onClick={() => handleSetDeviceCount(Math.min(60, deviceCount + (deviceCount >= 10 ? 2 : 1)))}
                disabled={deviceCount >= 60}
                className="w-5 h-5 rounded bg-blue-950/90 hover:bg-blue-800 text-blue-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-bold text-xs transition cursor-pointer"
                title="Aumentar telas"
              >
                +
              </button>
            </div>

            {/* Barra Esmagar / Expandir na frente da seção Qtde de Telas */}
            <div className="flex items-center gap-2 bg-[#070e1b] border border-blue-900/60 rounded-lg px-2.5 py-1 shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsAutoFit(false);
                  setManualHeight((prev) => Math.max(140, prev - 20));
                }}
                title="Esmagar / diminuir altura"
                className="text-[10px] uppercase font-bold text-slate-300 hover:text-amber-300 bg-blue-950/80 hover:bg-blue-900 px-2 py-0.5 rounded transition cursor-pointer shrink-0 border border-blue-900/50"
              >
                - ESMAGAR
              </button>

              <div className="relative w-28 sm:w-36 md:w-44 flex items-center">
                <input
                  type="range"
                  min={140}
                  max={550}
                  step={5}
                  value={currentTotalCardHeight}
                  onChange={(e) => {
                    setIsAutoFit(false);
                    setManualHeight(Number(e.target.value));
                  }}
                  className="w-full h-1.5 bg-blue-950/90 border border-blue-900/60 rounded-lg appearance-none cursor-pointer accent-amber-400 hover:accent-amber-300 transition"
                  title="Arraste para esmagar ou expandir a altura das telas"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsAutoFit(false);
                  setManualHeight((prev) => Math.min(550, prev + 20));
                }}
                title="Expandir / aumentar altura"
                className="text-[10px] uppercase font-bold text-slate-300 hover:text-blue-300 bg-blue-950/80 hover:bg-blue-900 px-2 py-0.5 rounded transition cursor-pointer shrink-0 border border-blue-900/50"
              >
                + EXPANDIR
              </button>

              <span className="font-mono text-[10px] text-amber-300 font-bold px-1 bg-[#040812] rounded border border-blue-900/60">
                {currentTotalCardHeight}px
              </span>

              <button
                type="button"
                onClick={() => setIsAutoFit(true)}
                className={`ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer flex items-center gap-1 border ${
                  isAutoFit
                    ? 'bg-blue-600/30 border-blue-400/80 text-blue-200 shadow-sm'
                    : 'bg-slate-900/60 border-slate-700/80 text-slate-400 hover:text-white'
                }`}
                title="Caber 100% na janela sem barra de rolagem"
              >
                <Maximize2 className="w-2.5 h-2.5 text-amber-300" />
                <span>Auto</span>
              </button>
            </div>
          </div>

          {/* Lado Direito: BOTÃO ESCOLHER ALEATÓRIO e CONFIRMAR TODOS OS VOTOS */}
          <div className="flex items-center gap-2">
            {/* BOTÃO ESCOLHER ALEATÓRIO */}
            <button
              type="button"
              disabled={!isVotingActive || votedCount === deviceCount}
              onClick={handlePickRandomForAll}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition cursor-pointer shadow-md ${
                isVotingActive && votedCount < deviceCount
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-300 active:scale-95 shadow-amber-500/10'
                  : 'bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed opacity-50'
              }`}
              title="O sistema escolhe os candidatos aleatoriamente em todos os celulares que ainda não votaram"
            >
              <Shuffle className="w-3.5 h-3.5 text-amber-400" />
              <span>Escolher Aleatório</span>
            </button>

            {/* BOTÃO CONFIRMAR TODOS OS VOTOS (LADO DIREITO DO BOTÃO ESCOLHER ALEATÓRIO) */}
            <button
              type="button"
              disabled={!isVotingActive || isAutoVoting || votedCount === deviceCount}
              onClick={handleConfirmAll}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-md ${
                isVotingActive && votedCount < deviceCount
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 active:scale-95 shadow-emerald-500/20 ring-1 ring-emerald-400/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-40 shadow-none'
              }`}
              title="Disparar confirmação para todos os aparelhos a cada 250ms (0,25s)"
            >
              {isAutoVoting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                  <span>
                    CONFIRMANDO {votingProgress ? `${votingProgress.current}/${votingProgress.total}` : '...'}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                  <span>CONFIRMAR TODOS OS VOTOS</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 2. GRID PRINCIPAL DE SMARTPHONES - ORGANIZADOS DENTRO DA JANELA */}
      <main className="flex-1 min-h-0 p-2 overflow-y-auto overflow-x-hidden flex flex-col justify-center">
        <div
          className="grid gap-2 w-full mx-auto"
          style={{
            gridTemplateColumns: `repeat(${gridConfig.cols}, minmax(0, 1fr))`,
          }}
        >
          {deviceIds.map((deviceId, index) => {
            const hasVotedThis = checkDeviceVoted(deviceId);
            const phoneNum = index + 1;

            return (
              <div
                key={`${deviceId}_${iteration}_${refreshTrigger}`}
                style={{
                  height: `${currentTotalCardHeight}px`,
                  transform: 'translateZ(0)',
                }}
                className="flex flex-col w-full rounded-xl border border-blue-900/50 bg-[#07132a] overflow-hidden shadow-lg transition-all"
              >
                {/* CABEÇALHO SLIM E DISCRETO DO CELULAR (28px) */}
                <div className="w-full h-7 px-2 bg-[#0b1322] border-b border-blue-900/40 text-[11px] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-slate-300 text-[10.5px]">#{phoneNum}</span>
                    {hasVotedThis ? (
                      <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        VOTOU ✓
                      </span>
                    ) : (
                      <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-slate-800 text-slate-400">
                        PENDENTE
                      </span>
                    )}
                  </div>

                  {/* Ações rápidas */}
                  <div className="flex items-center gap-0.5">
                    {!hasVotedThis && isVotingActive && (
                      <button
                        type="button"
                        onClick={() => handleRandomVoteSingle(deviceId)}
                        title="Votar/confirmar individualmente apenas neste aparelho"
                        className="p-0.5 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition cursor-pointer"
                      >
                        <PlayCircle className="w-3 h-3" />
                      </button>
                    )}
                    {hasVotedThis && (
                      <button
                        type="button"
                        onClick={() => handleResetSingleDevice(deviceId)}
                        title="Resetar voto deste aparelho"
                        className="p-0.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* TELA INTERNA DO CELULAR COM ZOOM PROPORCIONAL E BINDING DE SELEÇÃO */}
                <div
                  style={{
                    height: `${currentInnerBodyHeight}px`,
                  }}
                  className="flex-1 w-full overflow-y-auto overflow-x-hidden bg-[#07132a] relative scrollbar-thin [scrollbar-color:rgba(255,255,255,0.15)_transparent]"
                >
                  <div style={{ zoom: dynamicZoom, width: '100%' }}>
                    <VoterView
                      session={session}
                      deviceId={deviceId}
                      autoAuthPin={autoAuthPin}
                      externalSelectedIds={deviceSelections[deviceId]}
                      onSelectedIdsChange={(ids) => {
                        setDeviceSelections((prev) => ({ ...prev, [deviceId]: ids }));
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* 4. RODAPÉ FIXO DO SIMULADOR COM O BOTÃO CONFIRMAR CENTRALIZADO */}
      <footer className="bg-[#0b1322]/95 backdrop-blur border-t border-blue-900/60 px-4 py-2 shrink-0 flex items-center justify-between gap-4 z-40 shadow-2xl">
        {/* Lado Esquerdo do Rodapé: Progresso */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-slate-300">
              Status da Votação:
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-emerald-400 font-bold">{votedCount}</span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-300">{deviceCount} votaram</span>
            <span className="text-[11px] text-amber-300 font-bold ml-1">
              ({Math.round((votedCount / Math.max(1, deviceCount)) * 100)}%)
            </span>
          </div>
        </div>

        {/* Espaçador central */}
        <div className="flex-1" />

        {/* Lado Direito do Rodapé: Resetar Todos e PIN Ativado */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetAllDevices}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-xs font-semibold text-rose-300 hover:text-white transition cursor-pointer"
            title="Limpar todos os votos dos celulares simulados"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Resetar Todos</span>
          </button>

          {/* PIN Ativado / Desativado movido para a direita de Resetar Todos */}
          <button
            type="button"
            onClick={() => setAutoAuthPin(!autoAuthPin)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
              autoAuthPin
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
                : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800'
            }`}
            title="Auto-preencher e autenticar o PIN em todos os aparelhos"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>PIN {autoAuthPin ? 'Ativado' : 'Desativado'}</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
