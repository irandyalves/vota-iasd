import React, { useState } from 'react';
import {
  Smartphone,
  RotateCcw,
  Sparkles,
  Users,
  KeyRound,
  PlayCircle
} from 'lucide-react';
import type { VotingSession } from '../types';
import { VoterView } from './VoterView';
import {
  submitBallot,
  clearVotedFlag,
  hasVoted,
} from '../services/votingService';

interface SimulatorViewProps {
  session: VotingSession;
  onReturnToAdmin?: () => void;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({ session }) => {
  const [deviceCount, setDeviceCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = Number(localStorage.getItem('vota_sim_device_count'));
      if ([4, 6, 8, 10].includes(saved)) return saved;
    }
    return 6;
  });

  const [autoAuthPin, setAutoAuthPin] = useState<boolean>(true);
  const [isAutoVoting, setIsAutoVoting] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const handleSetDeviceCount = (count: number) => {
    setDeviceCount(count);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vota_sim_device_count', String(count));
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
  const deviceIds = React.useMemo(() => {
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
    setRefreshTrigger((prev) => prev + 1);
  };

  // Resetar um único celular
  const handleResetSingleDevice = (id: string) => {
    clearVotedFlag(session.id, currentRound, iteration, id);
    setRefreshTrigger((prev) => prev + 1);
  };

  // Voto individual aleatório em um celular
  const handleRandomVoteSingle = async (deviceId: string) => {
    if (!isVotingActive || options.length === 0) return;
    if (checkDeviceVoted(deviceId)) return;

    // Sorteia entre 1 e maxVotesAllowed opções
    const shuffled = [...options].sort(() => 0.5 - Math.random());
    const countToPick = Math.min(
      shuffled.length,
      Math.max(1, Math.floor(Math.random() * maxVotesAllowed) + 1)
    );
    const selectedIds = shuffled.slice(0, countToPick).map((o) => o.id);

    await submitBallot(session, selectedIds, currentRound, deviceId);
    setRefreshTrigger((prev) => prev + 1);
  };

  // Auto-voto em lote para todos os celulares que ainda não votaram
  const handleAutoVoteAll = async () => {
    if (!isVotingActive || options.length === 0 || isAutoVoting) return;
    setIsAutoVoting(true);

    for (const devId of deviceIds) {
      if (!checkDeviceVoted(devId)) {
        const shuffled = [...options].sort(() => 0.5 - Math.random());
        const countToPick = Math.min(
          shuffled.length,
          Math.max(1, Math.floor(Math.random() * maxVotesAllowed) + 1)
        );
        const selectedIds = shuffled.slice(0, countToPick).map((o) => o.id);

        await submitBallot(session, selectedIds, currentRound, devId);
        await new Promise((resolve) => setTimeout(resolve, 160));
        setRefreshTrigger((prev) => prev + 1);
      }
    }

    setIsAutoVoting(false);
  };

  const votedCount = deviceIds.filter((id) => checkDeviceVoted(id)).length;

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 flex flex-col font-sans select-none w-full">
      {/* BARRA SUPERIOR MINIMALISTA */}
      <header className="bg-[#0b1322]/95 backdrop-blur border-b border-blue-900/40 px-3 sm:px-4 py-2 sticky top-0 z-50 shadow-md">
        <div className="w-full flex flex-wrap items-center justify-between gap-2.5">
          {/* Lado Esquerdo: Título diretamente alinhado à esquerda (sem botão voltar e sem badge) */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/20 shrink-0">
              <Smartphone className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-bold text-white tracking-wide uppercase">
                  Simulador Multi-Aparelhos
                </h1>
                <span className="text-[10.5px] font-mono text-slate-400">
                  ({votedCount}/{deviceCount} votaram)
                </span>
              </div>
              <p className="text-[10px] sm:text-[10.5px] text-slate-400 leading-tight">
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

          {/* Centro: Seletor de Telas (4, 6, 8, 10) */}
          <div className="flex items-center gap-1 bg-[#070e1b] border border-blue-900/50 rounded-lg p-0.5">
            <span className="text-[10px] font-semibold text-slate-400 px-1.5 flex items-center gap-1">
              <Users className="w-3 h-3 text-blue-400" />
              Telas:
            </span>
            {[4, 6, 8, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleSetDeviceCount(num)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                  deviceCount === num
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-blue-950/40'
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          {/* Lado Direito: Ações Rápidas (Auto-voto, Reset, PIN) */}
          <div className="flex items-center gap-1.5">
            {/* Auto-PIN */}
            <button
              type="button"
              onClick={() => setAutoAuthPin(!autoAuthPin)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                autoAuthPin
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900/50 border-slate-700 text-slate-400'
              }`}
              title="Auto-preencher e autenticar o PIN em todos os aparelhos"
            >
              <KeyRound className="w-3 h-3" />
              <span>PIN {autoAuthPin ? 'Ativado' : 'Desativado'}</span>
            </button>

            {/* Votar em Todos Aleatoriamente */}
            <button
              type="button"
              disabled={!isVotingActive || isAutoVoting || votedCount === deviceCount}
              onClick={handleAutoVoteAll}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition cursor-pointer shadow-sm ${
                isVotingActive && votedCount < deviceCount
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 active:scale-95'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
              }`}
              title="Computar votos válidos aleatórios em todos os aparelhos pendentes"
            >
              {isAutoVoting ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                  <span>Votando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>Auto-Votar</span>
                </>
              )}
            </button>

            {/* Resetar Aparelhos */}
            <button
              type="button"
              onClick={handleResetAllDevices}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 border border-rose-800 text-[11px] font-semibold text-rose-300 hover:text-white transition cursor-pointer"
              title="Limpar votos apenas desses celulares simulados"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Resetar</span>
            </button>
          </div>
        </div>
      </header>

      {/* GRID DE SMARTPHONES MINIMALISTAS COM FONTE REDUZIDA EM 25% */}
      <main className="flex-1 p-2 sm:p-3 overflow-x-auto">
        <div
          className={`grid gap-2 sm:gap-3 justify-center w-full max-w-[1920px] mx-auto ${
            deviceCount === 4
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              : deviceCount === 6
              ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
              : deviceCount === 8
              ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8'
              : 'grid-cols-2 sm:grid-cols-5 lg:grid-cols-10'
          }`}
        >
          {deviceIds.map((deviceId, index) => {
            const hasVotedThis = checkDeviceVoted(deviceId);
            const phoneNum = index + 1;

            return (
              <div
                key={`${deviceId}_${iteration}_${refreshTrigger}`}
                className="flex flex-col min-w-[180px] max-w-[320px] w-full rounded-xl border border-blue-900/40 bg-[#07132a] overflow-hidden shadow-lg transition-all"
              >
                {/* CABEÇALHO SLIM E DISCRETO DO CELULAR */}
                <div className="w-full flex items-center justify-between px-2 py-1 bg-[#0b1322] border-b border-blue-900/40 text-[11px] shrink-0">
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
                        title="Votar aleatoriamente apenas neste aparelho"
                        className="p-0.5 rounded text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition cursor-pointer"
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

                {/* TELA INTERNA DO CELULAR COM ESCALA DE FONTE REDUZIDA EM 25% (zoom: 0.75) */}
                <div className="flex-1 w-full h-[580px] overflow-y-auto overflow-x-hidden bg-[#07132a] relative scrollbar-thin [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
                  <div style={{ zoom: 0.75, width: '100%' }}>
                    <VoterView
                      session={session}
                      deviceId={deviceId}
                      autoAuthPin={autoAuthPin}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};
