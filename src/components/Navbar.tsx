import React, { useRef, useState, useEffect } from 'react';
import { RefreshCw, Camera, Lock, Unlock, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { IasdLogo } from './IasdLogo';
import { removeEasyBackground } from '../utils/imageUtils';
import type { VotingSession } from '../types';
import { subscribeToConnectedVoters } from '../services/votingService';

interface NavbarProps {
  currentView: 'voter' | 'telao' | 'admin';
  setCurrentView: (view: 'voter' | 'telao' | 'admin') => void;
  pin?: string;
  onRegeneratePin?: (newPin: string) => void;
  logoUrl?: string;
  onUpdateLogo?: (url: string) => void;
  title?: string;
  onUpdateTitle?: (newTitle: string) => void;
  session?: VotingSession;
  onSaveSession?: (session: VotingSession) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  pin = '1844',
  onRegeneratePin,
  logoUrl,
  onUpdateLogo,
  session,
  onSaveSession,
}) => {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [localPin, setLocalPin] = useState(pin);
  const [connectedVoters, setConnectedVoters] = useState<string[]>([]);

  // Escuta os votantes que conectaram pelo QR Code ou endereço
  useEffect(() => {
    if (!session?.id) return;
    const unsub = subscribeToConnectedVoters(session.id, (voters) => {
      setConnectedVoters(voters);
    });
    return unsub;
  }, [session?.id]);

  const isLocked = Boolean(session?.accessLocked);

  // Clicou no cadeado: tranca ou destranca novos acessos
  const handleToggleLock = () => {
    if (!session || !onSaveSession) return;
    const willLock = !session.accessLocked;
    onSaveSession({
      ...session,
      accessLocked: willLock,
      allowedVoterIds: willLock
        ? (connectedVoters.length > 0 ? connectedVoters : session.allowedVoterIds || [])
        : undefined,
    });
  };

  // Sincroniza estado de senha caso venha externamente
  useEffect(() => {
    setLocalPin(pin);
  }, [pin]);

  // Salva o PIN digitado pelo usuário
  const handleSavePin = () => {
    const cleaned = localPin.trim().toUpperCase();
    if (cleaned && cleaned !== pin) {
      onRegeneratePin?.(cleaned);
    } else if (!cleaned) {
      setLocalPin(pin);
    }
  };

  // Gera novo PIN de 4 dígitos aleatório
  const handleRegenerate = () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setLocalPin(newPin);
    if (onRegeneratePin) {
      onRegeneratePin(newPin);
    }
  };

  // Upload de Logo personalizado com remoção automática de fundo ("fundo fácil")
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateLogo) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      if (rawDataUrl) {
        // GARANTIA: Se o fundo for fácil (branco, sólido, etc.), remove automaticamente!
        const { resultUrl } = await removeEasyBackground(rawDataUrl);
        onUpdateLogo(resultUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Remoção de fundo sob demanda para a logo atualmente carregada
  const handleManualRemoveBg = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!logoUrl || !onUpdateLogo) return;
    const { resultUrl, removed } = await removeEasyBackground(logoUrl, { tolerance: 52 });
    if (removed) {
      onUpdateLogo(resultUrl);
    }
  };

  // Garante que se houver uma logo salva com fundo fácil/sólido, remove automaticamente
  useEffect(() => {
    if (logoUrl && logoUrl.startsWith('data:image') && onUpdateLogo) {
      removeEasyBackground(logoUrl).then(({ resultUrl, removed }) => {
        if (removed && resultUrl !== logoUrl) {
          onUpdateLogo(resultUrl);
        }
      });
    }
  }, [logoUrl]);

  const isVotingActive =
    session?.status === 'VOTING' || session?.status === 'TIE_BREAK';

  const totalExpectedVoters = Math.max(
    connectedVoters.length,
    session?.allowedVoterIds?.length || 0,
    session?.totalVotersConnected || 0
  );

  const totalVotersVoted =
    session?.status === 'TIE_BREAK'
      ? session?.tieBreakVotersCount || 0
      : session?.mainVotersCount || 0;

  // APURAÇÃO só é exibido quando TODOS os votantes conectados tiverem votado, ou quando a votação for encerrada
  const allHaveVoted = totalExpectedVoters > 0 && totalVotersVoted >= totalExpectedVoters;
  const showApuracaoCaption = (isVotingActive && allHaveVoted) || session?.status === 'CLOSED';

  const handleCancelVoting = () => {
    if (!session || !onSaveSession) return;
    const freshOptions = [...session.options].map((o) => ({
      ...o,
      votesCount: 0,
    }));
    const nextIteration = (session.votingIteration || 1) + 1;
    onSaveSession({
      ...session,
      status: 'WAITING',
      options: freshOptions,
      tieBreak: null,
      telaoMode: 'names',
      votingIteration: nextIteration,
      mainVotersCount: 0,
      tieBreakVotersCount: 0,
    });
  };

  const handleCenterVotingButtonClick = () => {
    if (!session || !onSaveSession) return;

    if (isVotingActive) {
      // Se estamos em rodada de desempate, encerra e consolida os vencedores do desempate
      if (session.status === 'TIE_BREAK') {
        const tieOptions = session.tieBreak?.options || [];
        const sortedTie = [...tieOptions].sort((a, b) => (b.votesCount || 0) - (a.votesCount || 0));
        const vacancies = session.tieBreak?.vacancies || 1;
        const winnerIds: string[] = [];

        if (sortedTie.length > vacancies) {
          const cutoff = sortedTie[vacancies - 1]?.votesCount || 0;
          const next = sortedTie[vacancies]?.votesCount || 0;
          if (cutoff > next) {
            sortedTie.slice(0, vacancies).forEach((w) => winnerIds.push(w.id));
          }
        } else if (sortedTie.length > 0) {
          sortedTie.slice(0, vacancies).forEach((w) => winnerIds.push(w.id));
        }

        const updatedOptions = session.options.map((opt) => {
          const tieOptIndex = sortedTie.findIndex((t) => t.id === opt.id);
          if (tieOptIndex !== -1) {
            const tieVotes = sortedTie[tieOptIndex].votesCount || 0;
            const isWinner = winnerIds.includes(opt.id);
            const bonus = (tieVotes * 0.01) + (isWinner ? 0.005 : 0) + ((sortedTie.length - tieOptIndex) * 0.0001);
            return { ...opt, votesCount: Math.floor(opt.votesCount || 0) + bonus };
          }
          return opt;
        });

        onSaveSession({
          ...session,
          options: updatedOptions,
          status: 'CLOSED',
          telaoMode: 'voting',
          tieBreak: {
            ...(session.tieBreak as any),
            active: false,
            resolved: true,
          },
        });
        return;
      }

      // Se já está em votação normal (ou com caption APURAÇÃO), clicar encerra e abre a APURAÇÃO no Telão
      onSaveSession({
        ...session,
        status: 'CLOSED',
        telaoMode: 'voting',
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-tie-modal'));
      }
    } else {
      // Inicia NOVA VOTAÇÃO zerando os votos e ordenando A-Z
      const freshOptions = [...session.options]
        .map((o) => ({ ...o, votesCount: 0 }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        );
      const nextIteration = (session.votingIteration || 1) + 1;

      onSaveSession({
        ...session,
        status: 'VOTING',
        options: freshOptions,
        tieBreak: undefined,
        telaoMode: 'voting',
        votingIteration: nextIteration,
        mainVotersCount: 0,
        tieBreakVotersCount: 0,
      });
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-[#001f47]/95 backdrop-blur-md border-b border-blue-900/60 shadow-lg px-3 sm:px-6 lg:px-8 py-4 min-h-[76px] flex items-center w-full">
      <div className="w-full grid grid-cols-1 md:grid-cols-3 items-center gap-3">
        {/* ESQUERDA: Logo (aumentada em 20%) + VOTA IASD + VOTANTES */}
        <div className="flex items-center gap-3 justify-self-start">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <div className="relative group shrink-0">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              title="Clique para trocar a logo (remoção automática de fundo ativada)"
              className="relative block rounded-xl focus:outline-none transition p-0.5 hover:bg-white/10 cursor-pointer"
            >
              <IasdLogo className="w-[58px] h-[58px]" customUrl={logoUrl} />
              <div className="absolute inset-0 bg-black/45 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-amber-300 transition-opacity">
                <Camera className="w-4 h-4 drop-shadow" />
              </div>
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={handleManualRemoveBg}
                title="Remover fundo desta logo agora"
                className="absolute -bottom-1 -right-1 bg-amber-400 hover:bg-amber-300 text-slate-900 p-1 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
              >
                <Wand2 className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="leading-tight">
            <span
              className="font-extrabold tracking-wider text-white text-sm sm:text-base block select-none"
              style={{
                fontFamily:
                  '"Varela Round", "Nunito", "Quicksand", ui-rounded, "Segoe UI", system-ui, sans-serif',
              }}
            >
              VOTA <span className="text-[#d4af37]">IASD</span>
            </span>
            <span className="text-[10px] text-blue-300/80 font-semibold tracking-wider uppercase block mt-0.5 select-none">
              SISTEMA ELEITORAL
            </span>
          </div>
        </div>

        {/* CENTRO: BOTÃO DA URNA TOTALMENTE TRAVADO NO CENTRO (ÂNCORA IMÓVEL, NUNCA SE MEXE) */}
        <div className="relative flex items-center justify-center justify-self-center">
          {/* SLOT ESQUERDO: BOTÃO CANCELAR VOTAÇÃO (Ancorado à esquerda do botão central) */}
          <div className="absolute right-full mr-3 flex items-center justify-end pointer-events-none">
            <AnimatePresence>
              {isVotingActive && (
                <motion.div
                  key="btn-cancelar"
                  initial={{ opacity: 0, x: 30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30, scale: 0.95 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-auto flex items-center shrink-0"
                >
                  <button
                    type="button"
                    onClick={handleCancelVoting}
                    title="Cancelar votação ativa e zerar todos os votos"
                    style={{
                      backgroundColor: '#b91c1c',
                      borderColor: '#ef4444',
                      boxShadow: '0 4px 0 #7f1d1d, 2px 4px 0 #450a0a',
                    }}
                    className="px-3.5 py-1.5 min-h-[38px] rounded-[10px] border-[2.5px] transition-all duration-200 active:translate-y-[2px] cursor-pointer flex flex-col items-center justify-center select-none shrink-0"
                  >
                    <span className="font-black text-[10px] sm:text-[11px] tracking-wider uppercase font-sans text-white leading-none whitespace-nowrap">
                      CANCELAR VOTAÇÃO
                    </span>
                    {/* Braille 50% menor */}
                    <div className="flex items-center gap-1 mt-1 pointer-events-none">
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                      <span className="w-1.5" />
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                      <span className="w-1 h-1 rounded-full bg-[#fca5a5] shadow-[0.5px_0.5px_0_#7f1d1d]" />
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* BOTÃO PRINCIPAL DA URNA: TAMANHO FIXO E POSIÇÃO TOTALMENTE TRAVADA NO CENTRO */}
          <button
            type="button"
            onClick={handleCenterVotingButtonClick}
            title={
              showApuracaoCaption
                ? 'Clique para encerrar a votação e exibir a Apuração no Telão'
                : isVotingActive
                ? 'Votação em andamento (clique para abrir a Apuração)'
                : 'Iniciar Votação mantendo os nomes em ordem A-Z'
            }
            style={{
              backgroundColor: showApuracaoCaption ? '#ffffff' : '#159636',
              borderColor: showApuracaoCaption ? '#e2e8f0' : '#24b349',
              boxShadow: showApuracaoCaption
                ? '0 6px 0 #94a3b8, 3px 6px 0 #64748b'
                : '0 6px 0 #09521b, 3px 6px 0 #063b13',
            }}
            className="w-[215px] min-w-[215px] max-w-[215px] pt-2 pb-2.5 min-h-[54px] rounded-[14px] border-[3px] transition-all duration-300 active:translate-y-[4px] cursor-pointer flex flex-col items-center justify-center select-none shrink-0"
          >
            <div className="flex items-center justify-center w-full">
              <span className="font-black text-xs sm:text-sm tracking-wider uppercase font-sans text-[#1a1a1a] leading-none whitespace-nowrap text-center">
                {showApuracaoCaption ? 'APURAÇÃO' : isVotingActive ? 'EM VOTAÇÃO' : 'INICIAR VOTAÇÃO'}
              </span>
            </div>

            {/* Pontos em Braille 3D idênticos à tecla física da Urna */}
            {(() => {
              const dot = showApuracaoCaption
                ? 'w-2 h-2 rounded-full bg-[#cbd5e1] shadow-[1px_1.5px_0_#94a3b8]'
                : 'w-2 h-2 rounded-full bg-[#24b84b] shadow-[1px_1.5px_0_#074215]';
              return (
                <div className="flex flex-col items-center gap-[2.5px] mt-1.5 pointer-events-none">
                  {/* Linha 1: 3 pontos à esquerda, espaço, 4 pontos à direita */}
                  <div className="flex items-center gap-2">
                    <span className={dot} />
                    <span className={dot} />
                    <span className={dot} />
                    <span className="w-2.5" />
                    <span className={dot} />
                    <span className={dot} />
                    <span className={dot} />
                    <span className={dot} />
                  </div>
                  {/* Linha 2 */}
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 opacity-0" />
                    <span className="w-2 h-2 opacity-0" />
                    <span className="w-2 h-2 opacity-0" />
                    <span className={dot} />
                    <span className="w-2 h-2 opacity-0" />
                    <span className={dot} />
                    <span className={dot} />
                    <span className="w-2 h-2 opacity-0" />
                  </div>
                  {/* Linha 3 */}
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 opacity-0" />
                    <span className="w-2 h-2 opacity-0" />
                    <span className={dot} />
                    <span className="w-2.5" />
                    <span className={dot} />
                    <span className="w-2 h-2 opacity-0" />
                    <span className="w-2 h-2 opacity-0" />
                    <span className="w-2 h-2 opacity-0" />
                  </div>
                </div>
              );
            })()}
          </button>

          {/* SLOT DIREITO: VU METER (EM VOTAÇÃO) OU MÃOZINHA ESCREVENDO/CONTANDO (EM APURAÇÃO) */}
          <div className="absolute left-full ml-3 flex items-center justify-start pointer-events-none">
            <AnimatePresence mode="wait">
              {showApuracaoCaption ? (
                /* MÃOZINHA ESCREVENDO / APURANDO CÉDULA */
                <motion.div
                  key="apuracao-writing-hand"
                  initial={{ opacity: 0, x: -20, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20, scale: 0.9 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-auto flex items-center shrink-0 pl-1 select-none"
                >
                  <div
                    title="Apuração em andamento: mãozinha registrando os votos na ata"
                    className="flex items-center gap-2 px-2.5 py-1 bg-[#09152b]/95 border border-amber-400/50 rounded-xl shadow-[0_0_14px_rgba(251,191,36,0.35)] shrink-0"
                  >
                    {/* Prancheta com linhas de apuração preenchendo */}
                    <div className="relative w-5 h-6 bg-[#0f172a] rounded-[3px] border border-amber-300/70 p-0.5 flex flex-col justify-around shadow-inner overflow-hidden shrink-0">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-[2px] bg-amber-400 rounded-b-xs" />
                      <motion.div
                        className="h-[1.5px] bg-amber-300 rounded-full"
                        animate={{ width: ['20%', '90%', '45%', '100%'] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <motion.div
                        className="h-[1.5px] bg-amber-300 rounded-full"
                        animate={{ width: ['45%', '100%', '30%', '90%'] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
                      />
                      <motion.div
                        className="h-[1.5px] bg-emerald-400 rounded-full"
                        animate={{ width: ['10%', '75%', '40%', '100%'] }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                      />
                    </div>

                    {/* Mãozinha segurando a caneta escrevendo com ritmo caligráfico */}
                    <motion.div
                      className="relative w-6 h-6 flex items-center justify-center text-amber-300 origin-bottom-left shrink-0"
                      animate={{
                        x: [0, 3.5, 1, 4.5, 1.5, 0],
                        y: [0, -2, 1, -1, 1, 0],
                        rotate: [-10, 8, -6, 10, -4, -10],
                      }}
                      transition={{
                        duration: 0.85,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    >
                      <svg viewBox="0 0 28 28" fill="none" className="w-6 h-6 drop-shadow-[0_0_5px_rgba(251,191,36,0.9)]">
                        {/* Corpo da Caneta */}
                        <path
                          d="M6 22l3-1 12-12-3-3L6 18l-1 4 1 0z"
                          fill="#f59e0b"
                          stroke="#ffffff"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                        {/* Ponta da Caneta */}
                        <polygon points="5,22 8,21 6,19" fill="#0f172a" />
                        <circle cx="5" cy="22" r="1.2" fill="#ffffff" />
                        {/* Dedos da mão segurando */}
                        <path
                          d="M10 17c0-2 1.5-3 3-2s2 2 1 4-3 1-4-2z"
                          fill="#fed7aa"
                          stroke="#ea580c"
                          strokeWidth="1"
                        />
                        <circle cx="12" cy="16" r="2.2" fill="#fed7aa" stroke="#ea580c" strokeWidth="0.8" />
                      </svg>
                    </motion.div>

                    {/* Texto informativo com contagem */}
                    <div className="flex flex-col leading-tight select-none">
                      <span className="font-mono font-black text-[10px] text-amber-300 tracking-wider uppercase animate-pulse">
                        APURANDO
                      </span>
                      <span className="text-[8.5px] text-emerald-300 font-bold tracking-tight uppercase whitespace-nowrap">
                        {totalVotersVoted} {totalVotersVoted === 1 ? 'VOTO' : 'VOTOS'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : isVotingActive ? (
                /* VU METER NORMAL DURANTE A VOTAÇÃO */
                <motion.div
                  key="vumeter-navbar"
                  initial={{ opacity: 0, x: -30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -30, scale: 0.95 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-auto flex items-center shrink-0 pl-1"
                >
                  <div
                    title="VU Meter de Atividade em Tempo Real"
                    className="flex items-end gap-[3px] h-6 px-1 select-none shrink-0"
                  >
                    {[
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['35%', '85%', '50%', '95%', '35%'], duration: 1.1, delay: 0 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['50%', '30%', '90%', '45%', '50%'], duration: 0.9, delay: 0.15 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['25%', '95%', '60%', '40%', '25%'], duration: 1.3, delay: 0.05 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['60%', '40%', '100%', '70%', '60%'], duration: 0.85, delay: 0.2 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['40%', '90%', '35%', '85%', '40%'], duration: 1.15, delay: 0.1 },
                      { color: 'from-emerald-600 to-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]', heights: ['70%', '45%', '95%', '50%', '70%'], duration: 0.95, delay: 0.25 },
                      { color: 'from-amber-600 to-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.8)]', heights: ['30%', '80%', '45%', '90%', '30%'], duration: 1.25, delay: 0.18 },
                      { color: 'from-amber-600 to-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.8)]', heights: ['55%', '35%', '85%', '60%', '55%'], duration: 1.05, delay: 0.08 },
                      { color: 'from-rose-600 to-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]', heights: ['20%', '75%', '30%', '85%', '20%'], duration: 1.35, delay: 0.22 },
                      { color: 'from-rose-600 to-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]', heights: ['15%', '65%', '25%', '80%', '15%'], duration: 1.0, delay: 0.12 },
                    ].map((bar, idx) => (
                      <motion.div
                        key={idx}
                        animate={{ height: bar.heights }}
                        transition={{
                          duration: bar.duration,
                          delay: bar.delay,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                        className={`w-[3px] rounded-t-[1.5px] bg-gradient-to-t ${bar.color}`}
                      />
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {/* DIREITA: CADEADO (com Hint Bonito) ACIMA DE "VISÃO DE:" + "SENHA: XXX" */}
        <div className="flex flex-col items-end gap-1.5 justify-self-end">
          {/* 1. CADEADINHO ACIMA DE VISÃO DE (Com Hint Bonito Personalizado) */}
          <div className="relative group flex items-center justify-end">
            <button
              type="button"
              onClick={handleToggleLock}
              className={`px-2 py-0.5 rounded-lg transition-all duration-200 cursor-pointer active:scale-95 flex items-center gap-1.5 border shadow-sm ${
                isLocked
                  ? 'bg-rose-950/80 border-rose-500/70 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.35)] hover:bg-rose-900/90'
                  : 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.25)] hover:bg-emerald-900/80'
              }`}
            >
              {isLocked ? (
                <>
                  <Lock className="w-3.5 h-3.5 stroke-[2.75] text-rose-400 drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                    Fechada
                  </span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 stroke-[2.5] text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    Aberta
                  </span>
                </>
              )}
            </button>

            {/* HINT BONITO FLUTUANTE (Substitui o tooltip feio do navegador) */}
            <div
              className={`pointer-events-none absolute right-full mr-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out z-50 flex items-center gap-2 px-3 py-1.5 rounded-xl shadow-2xl backdrop-blur-md border whitespace-nowrap ${
                isLocked
                  ? 'bg-[#120407]/95 border-rose-500/70 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.4)]'
                  : 'bg-[#02140b]/95 border-emerald-500/70 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isLocked ? 'bg-rose-500 animate-ping' : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <span className="text-xs font-black tracking-wide uppercase">
                {isLocked ? 'Sessão fechada' : 'Sessão aberta'}
              </span>
              <span className="text-[10px] text-slate-300 font-medium pl-1.5 border-l border-white/20">
                {isLocked
                  ? 'Quem tentar entrar receberá aviso de bloqueio'
                  : 'Novos eleitores podem se conectar'}
              </span>
              {/* Seta indicadora para o botão */}
              <div
                className={`absolute left-full top-1/2 -translate-y-1/2 -ml-px border-4 border-transparent ${
                  isLocked ? 'border-l-rose-500/70' : 'border-l-emerald-500/70'
                }`}
              />
            </div>
          </div>

          {/* 2. VISÃO DE: */}
          <div className="flex items-center gap-1.5 bg-[#07132a] px-2.5 py-1 rounded-lg border border-blue-800/80 shadow-inner">
            <label
              htmlFor="navbar-view-select"
              className="text-[10px] font-bold text-blue-300 uppercase tracking-wider whitespace-nowrap select-none"
            >
              VISÃO DE:
            </label>
            <select
              id="navbar-view-select"
              value={currentView}
              onChange={(e) =>
                setCurrentView(e.target.value as 'admin' | 'voter' | 'telao')
              }
              className="bg-transparent text-xs font-black text-amber-300 outline-none cursor-pointer pr-1"
            >
              <option value="admin" className="bg-[#07132a] text-white font-bold">
                Admin
              </option>
              <option value="voter" className="bg-[#07132a] text-white font-bold">
                Celular
              </option>
              <option value="telao" className="bg-[#07132a] text-white font-bold">
                Público
              </option>
            </select>
          </div>

          {/* 3. SENHA: XXX (DEBAIXO DE VISÃO DE) */}
          <div className="flex items-center gap-1 bg-[#07132a]/90 px-2 py-0.5 rounded-lg border border-blue-800/60 shadow-inner">
            <label
              htmlFor="navbar-pin-input"
              className="text-[10px] text-blue-300 font-bold uppercase tracking-wider cursor-pointer select-none"
            >
              SENHA:
            </label>
            <input
              id="navbar-pin-input"
              type="text"
              value={localPin}
              maxLength={8}
              onChange={(e) => setLocalPin(e.target.value.replace(/\s+/g, ''))}
              onBlur={handleSavePin}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              title="Clique para editar a senha (Enter para salvar)"
              className="w-14 px-0.5 py-0 font-mono font-black text-xs text-amber-300 bg-transparent border-none focus:ring-0 tracking-widest outline-none transition cursor-text select-all text-center"
            />
            <button
              type="button"
              onClick={handleRegenerate}
              title="Gerar nova senha aleatória"
              className="p-0.5 text-blue-300 hover:text-amber-300 rounded transition cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
