import React from 'react';
import { Vote, Tv, ShieldCheck, Volume2, Database, Wifi, ExternalLink } from 'lucide-react';
import { isFirebaseConfigured } from '../services/firebase';
import { urnaAudio } from '../utils/audio';

interface NavbarProps {
  currentView: 'voter' | 'telao' | 'admin';
  setCurrentView: (view: 'voter' | 'telao' | 'admin') => void;
  title?: string;
  pin?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  title,
  pin,
}) => {
  // Abre o Telão em uma 2ª janela/tela dedicada para projetor ou TV
  const handleOpenSecondaryScreen = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/?view=telao&fullscreen=true`;
    const screenWidth = window.screen.availWidth || 1920;
    const screenHeight = window.screen.availHeight || 1080;
    
    const popup = window.open(
      url,
      'VotaIASDTelaoProjetor',
      `width=${screenWidth},height=${screenHeight},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
    );
    if (popup) {
      popup.focus();
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-[#001f47]/95 backdrop-blur-md border-b border-blue-900/60 shadow-lg px-3 sm:px-6 lg:px-8 py-3 w-full">
      <div className="w-full flex flex-wrap items-center justify-between gap-3">
        {/* Marca / Identidade IASD */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#d4af37] to-amber-300 flex items-center justify-center shadow-md shadow-amber-900/30 shrink-0">
            <Vote className="w-6 h-6 text-[#001f47] font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider text-white text-lg font-serif">
                VOTA <span className="text-[#d4af37]">IASD</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-900/80 text-blue-200 border border-blue-700/50 flex items-center gap-1">
                <Wifi className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                Tempo Real
              </span>
            </div>
            {title && (
              <p className="text-xs text-blue-200/80 truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                {title} {pin && <span className="text-amber-300 font-mono font-bold ml-1">PIN: {pin}</span>}
              </p>
            )}
          </div>
        </div>

        {/* Seletor de Telas (Votante / Telão / Admin) */}
        <div className="flex items-center bg-[#07132a] p-1 rounded-xl border border-blue-900/80 shadow-inner">
          <button
            onClick={() => setCurrentView('voter')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              currentView === 'voter'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/50'
            }`}
          >
            <Vote className="w-4 h-4" />
            <span>Celular (Votante)</span>
          </button>

          <button
            onClick={() => setCurrentView('telao')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              currentView === 'telao'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/50'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Telão (Projetor)</span>
          </button>

          <button
            onClick={() => setCurrentView('admin')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              currentView === 'admin'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Painel Admin</span>
          </button>
        </div>

        {/* Ações Rápidas: 2ª Tela (Telão), Som da Urna e Conexão */}
        <div className="flex items-center gap-2">
          {/* Botão de Destaque: Abrir 2ª Tela (Telão / Projetor) */}
          <button
            onClick={handleOpenSecondaryScreen}
            title="Abrir o Telão em Tela Cheia no 2º monitor ou projetor da igreja"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-blue-950 rounded-lg text-xs font-black shadow-md shadow-amber-900/30 transition cursor-pointer active:scale-95"
          >
            <Tv className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Projetar 2ª Tela</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>

          <button
            onClick={() => urnaAudio.playTseConfirma()}
            title="Ouvir som oficial da urna eletrônica do TSE"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 rounded-lg text-xs font-medium transition cursor-pointer active:scale-95 shadow-sm"
          >
            <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="hidden lg:inline">Som Urna TSE</span>
          </button>

          <div
            title={isFirebaseConfigured ? 'Conectado ao Firebase Cloud' : 'Modo Local / BroadcastChannel ativo'}
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/80 rounded-md border border-slate-700/60 text-[11px] text-slate-300"
          >
            <Database className={`w-3 h-3 ${isFirebaseConfigured ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="hidden md:inline font-mono">
              {isFirebaseConfigured ? 'Firebase' : 'Local'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
