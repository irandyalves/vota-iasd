import React, { useRef, useState, useEffect } from 'react';
import { Tv, MonitorOff, ExternalLink, RefreshCw, Camera, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { IasdLogo } from './IasdLogo';
import { toggleSecondaryScreen, subscribeSecondaryScreen, openTelaoOnSecondMonitor } from '../utils/screen';
import type { VotingSession } from '../types';

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
  const [isScreen2Open, setIsScreen2Open] = useState(false);

  // Sincroniza estado de senha caso venha externamente
  useEffect(() => {
    setLocalPin(pin);
  }, [pin]);

  // Monitora se o Telão na 2ª tela está aberto ou fechado
  useEffect(() => {
    const unsub = subscribeSecondaryScreen(setIsScreen2Open);
    return unsub;
  }, []);

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

  // Upload de Logo personalizado
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateLogo) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        onUpdateLogo(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const isVotingActive =
    session?.status === 'VOTING' || session?.status === 'TIE_BREAK';

  const activeOptions =
    session?.status === 'TIE_BREAK' && session?.tieBreak?.active
      ? session.tieBreak.options || []
      : session?.options || [];

  const totalVotesCast = activeOptions.reduce(
    (acc, curr) => acc + (curr.votesCount || 0),
    0
  );

  // Enquanto estiver girando (votação em andamento) e já houver voto(s) registrado(s), muda o caption para APURAÇÃO
  const showApuracaoCaption = isVotingActive && totalVotesCast > 0;

  const handleCenterVotingButtonClick = () => {
    if (!session || !onSaveSession) return;
    openTelaoOnSecondMonitor();

    if (isVotingActive) {
      // Se já está em votação (ou com caption APURAÇÃO), clicar encerra e abre a APURAÇÃO no Telão
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
        {/* ESQUERDA: Logo + VOTA IASD + SENHA sem borda */}
        <div className="flex items-center gap-2.5 justify-self-start">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            title="Clique para trocar o logo da igreja"
            className="relative group shrink-0 cursor-pointer rounded-2xl overflow-hidden focus:outline-none"
          >
            <IasdLogo className="w-10 h-10" customUrl={logoUrl} />
            <div className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-amber-300 transition-opacity">
              <Camera className="w-3.5 h-3.5" />
            </div>
          </button>

          <div className="leading-tight">
            <span
              className="font-extrabold tracking-wider text-white text-[11px] block select-none"
              style={{
                fontFamily:
                  '"Varela Round", "Nunito", "Quicksand", ui-rounded, "Segoe UI", system-ui, sans-serif',
              }}
            >
              VOTA <span className="text-[#d4af37]">IASD</span>
            </span>

            {/* SENHA EDITÁVEL SEM BORDA */}
            <div className="flex items-center gap-1 mt-0.5">
              <label
                htmlFor="navbar-pin-input"
                className="text-[11px] text-blue-300 font-semibold cursor-pointer"
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
                className="w-14 px-0.5 py-0 font-mono font-black text-sm text-amber-300 bg-transparent border-none focus:ring-0 tracking-widest outline-none transition cursor-text select-all"
              />
              <button
                type="button"
                onClick={handleRegenerate}
                title="Gerar nova senha aleatória"
                className="p-0.5 text-blue-300 hover:text-amber-300 rounded transition cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* CENTRO: BOTÃO DA URNA (3D COM RELEVO E BRAILLE). EM APURAÇÃO FICA BRANCO, COM A RODA SUAVE (PULSAR + GIRO) À ESQUERDA DO BOTÃO */}
        <div className="flex items-center justify-center justify-self-center gap-3">
          {isVotingActive && (
            /* Roda à esquerda do botão: giro lento + pulsar suave */
            <div className="relative w-10 h-10 sm:w-11 sm:h-11 shrink-0 pointer-events-none" aria-hidden="true">
              {/* Halo pulsante suave */}
              <motion.div
                className="absolute inset-0 rounded-full bg-white/20"
                animate={{ scale: [0.85, 1.25, 0.85], opacity: [0.45, 0, 0.45] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              {/* Anel externo girando devagar (horário) */}
              <motion.div
                className="absolute inset-1 rounded-full border-[3px] border-white/15 border-t-white border-r-amber-300/90"
                animate={{ rotate: 360 }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
              />
              {/* Anel interno tracejado girando ao contrário */}
              <motion.div
                className="absolute inset-[11px] rounded-full border-2 border-dashed border-white/60"
                animate={{ rotate: -360 }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              />
              {/* Núcleo pulsando */}
              <motion.div
                className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.9)]"
                animate={{ scale: [1, 1.5, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          )}

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
            className="px-7 pt-2 pb-2.5 min-h-[54px] rounded-[14px] border-[3px] transition-all duration-300 active:translate-y-[4px] cursor-pointer flex flex-col items-center justify-center select-none"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="font-black text-sm sm:text-base tracking-wider uppercase font-sans text-[#1a1a1a] leading-none">
                {showApuracaoCaption ? 'APURAÇÃO' : 'INICIAR VOTAÇÃO'}
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
        </div>

        {/* DIREITA: Botão 2ª Tela + Listbox "VISÃO DE:" (Admin, Celular, Público) */}
        <div className="flex items-center gap-2.5 justify-self-end">
          {isScreen2Open ? (
            <button
              data-toggle-screen-btn="true"
              onClick={() => toggleSecondaryScreen()}
              title="Fechar / Ocultar a janela do Telão no 2º monitor"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-500/50 rounded-lg text-xs font-black shadow-md transition cursor-pointer active:scale-95"
            >
              <MonitorOff className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Ocultar 2ª Tela</span>
              <X className="w-3.5 h-3.5 opacity-80" />
            </button>
          ) : (
            <button
              data-toggle-screen-btn="true"
              onClick={() => toggleSecondaryScreen()}
              title="Abrir o Telão em Tela Cheia no 2º monitor ou projetor da igreja"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-blue-950 rounded-lg text-xs font-black shadow-md transition cursor-pointer active:scale-95"
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Projetar 2ª Tela</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-[#07132a] px-2.5 py-1.5 rounded-xl border border-blue-800/80 shadow-inner">
            <label
              htmlFor="navbar-view-select"
              className="text-[10px] font-bold text-blue-300 uppercase tracking-wider whitespace-nowrap"
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
        </div>
      </div>
    </header>
  );
};
