import React, { useState } from 'react';
import {
  Smartphone,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Users,
  KeyRound,
  PlayCircle,
  HelpCircle
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

export const SimulatorView: React.FC<SimulatorViewProps> = ({ session, onReturnToAdmin }) => {
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
        // Pequena pausa para animação e realismo
        await new Promise((resolve) => setTimeout(resolve, 180));
        setRefreshTrigger((prev) => prev + 1);
      }
    }

    setIsAutoVoting(false);
  };

  const votedCount = deviceIds.filter((id) => checkDeviceVoted(id)).length;

  return (
    <div className="min-h-screen bg-[#070d18] text-slate-100 flex flex-col font-sans select-none">
      {/* BARRA SUPERIOR DE CONTROLE DO SIMULADOR */}
      <header className="bg-[#0b172a]/95 backdrop-blur border-b border-blue-900/60 px-4 py-3 sticky top-0 z-50 shadow-xl">
        <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Lado Esquerdo: Voltar + Título do Simulador */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (onReturnToAdmin) {
                  onReturnToAdmin();
                } else if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href);
                  url.searchParams.set('view', 'admin');
                  window.location.href = url.toString();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-800 text-xs font-semibold text-blue-200 hover:text-white transition cursor-pointer"
              title="Voltar ao Painel Administrativo (ou pressione ESC)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao Admin</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Smartphone className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-white tracking-wide uppercase">
                    Simulador Multi-Aparelhos
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 font-mono">
                    TESTE EM TEMPO REAL
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
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
          </div>

          {/* Centro: Seletor de Telas (4, 6, 8, 10) */}
          <div className="flex items-center gap-1.5 bg-[#07132a] border border-blue-900/60 rounded-xl p-1">
            <span className="text-[11px] font-semibold text-slate-400 px-2 flex items-center gap-1">
              <Users className="w-3 h-3 text-blue-400" />
              Telas:
            </span>
            {[4, 6, 8, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleSetDeviceCount(num)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  deviceCount === num
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-blue-950/50'
                }`}
              >
                {num} Celulares
              </button>
            ))}
          </div>

          {/* Lado Direito: Ações Rápidas (Auto-voto, Reset, PIN) */}
          <div className="flex items-center gap-2">
            {/* Auto-PIN */}
            <button
              type="button"
              onClick={() => setAutoAuthPin(!autoAuthPin)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                autoAuthPin
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-900/60 border-slate-700 text-slate-400'
              }`}
              title="Auto-preencher e autenticar o PIN em todos os aparelhos"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Auto-PIN {autoAuthPin ? 'Ativado' : 'Desativado'}</span>
            </button>

            {/* Votar em Todos Aleatoriamente */}
            <button
              type="button"
              disabled={!isVotingActive || isAutoVoting || votedCount === deviceCount}
              onClick={handleAutoVoteAll}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg ${
                isVotingActive && votedCount < deviceCount
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20 active:scale-95'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
              title="Computar votos válidos aleatórios em todos os aparelhos pendentes"
            >
              {isAutoVoting ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                  <span>Votando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Votar em Todos</span>
                </>
              )}
            </button>

            {/* Resetar Aparelhos */}
            <button
              type="button"
              onClick={handleResetAllDevices}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800 text-xs font-semibold text-rose-300 hover:text-white transition cursor-pointer"
              title="Limpar votos apenas desses celulares simulados para poder testar de novo"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resetar Celulares</span>
            </button>
          </div>
        </div>
      </header>

      {/* PAINEL DE STATUS RÁPIDO */}
      <div className="bg-[#0b1220] border-b border-blue-900/40 px-4 py-2">
        <div className="max-w-[1920px] mx-auto flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>
                Celulares Prontos: <strong className="text-white">{deviceCount}</strong>
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Votaram nesta rodada:{' '}
                <strong className="text-emerald-400 font-mono">
                  {votedCount} / {deviceCount}
                </strong>
              </span>
            </span>
            <span className="text-slate-500">•</span>
            <span>
              Rodada:{' '}
              <strong className="text-white font-mono">
                {currentRound} (iteração {iteration})
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <HelpCircle className="w-3 h-3 text-blue-400" />
            <span>
              Cada celular possui ID e cédula 100% isolados. Role a tela e vote como em um smartphone real!
            </span>
          </div>
        </div>
      </div>

      {/* GRID DE SMARTPHONES */}
      <main className="flex-1 p-4 sm:p-6 overflow-x-auto">
        <div
          className={`grid gap-4 sm:gap-6 justify-center max-w-[1920px] mx-auto ${
            deviceCount === 4
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              : deviceCount === 6
              ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
              : deviceCount === 8
              ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8'
              : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
          }`}
        >
          {deviceIds.map((deviceId, index) => {
            const hasVotedThis = checkDeviceVoted(deviceId);
            const phoneNum = index + 1;

            return (
              <div
                key={`${deviceId}_${iteration}_${refreshTrigger}`}
                className="flex flex-col items-center min-w-[260px] max-w-[340px] w-full"
              >
                {/* CABEÇALHO DO CELULAR */}
                <div className="w-full flex items-center justify-between px-3 py-1.5 bg-[#0e1726] border border-blue-900/60 rounded-t-2xl text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-200">📱 Celular #{phoneNum}</span>
                    {hasVotedThis ? (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        VOTOU ✓
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                        PENDENTE
                      </span>
                    )}
                  </div>

                  {/* Ações individuais deste celular */}
                  <div className="flex items-center gap-1">
                    {!hasVotedThis && isVotingActive && (
                      <button
                        type="button"
                        onClick={() => handleRandomVoteSingle(deviceId)}
                        title="Votar aleatoriamente apenas neste aparelho"
                        className="p-1 rounded text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition cursor-pointer"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {hasVotedThis && (
                      <button
                        type="button"
                        onClick={() => handleResetSingleDevice(deviceId)}
                        title="Resetar voto deste aparelho"
                        className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* MOLDURA FÍSICA DO SMARTPHONE */}
                <div className="w-full bg-[#030712] border-4 border-slate-800 rounded-b-[32px] shadow-2xl overflow-hidden relative flex flex-col h-[600px]">
                  {/* Speaker Notch / Dynamic Island */}
                  <div className="w-full py-1.5 bg-[#030712] flex items-center justify-center shrink-0 border-b border-white/[0.04]">
                    <div className="w-16 h-3 bg-slate-900 rounded-full flex items-center justify-end px-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                    </div>
                  </div>

                  {/* TELA TOUCH SCREEN ROLÁVEL */}
                  <div className="flex-1 w-full overflow-y-auto overflow-x-hidden bg-[#07132a] relative">
                    <VoterView
                      session={session}
                      deviceId={deviceId}
                      autoAuthPin={autoAuthPin}
                    />
                  </div>

                  {/* Barra inferior Home Indicator (estilo iOS/Android moderno) */}
                  <div className="w-full py-1.5 bg-[#030712] flex items-center justify-center shrink-0 border-t border-white/[0.04]">
                    <div className="w-24 h-1 bg-slate-700/80 rounded-full" />
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
