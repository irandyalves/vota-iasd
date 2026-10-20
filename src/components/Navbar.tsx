import React from 'react';
import { Vote, Tv, ShieldCheck, Volume2, Database, Wifi } from 'lucide-react';
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
  return (
    <header className="sticky top-0 z-50 bg-[#001f47]/95 backdrop-blur-md border-b border-blue-900/60 shadow-lg px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Marca / Identidade IASD */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#d4af37] to-amber-300 flex items-center justify-center shadow-md shadow-amber-900/30">
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
              <p className="text-xs text-blue-200/80 truncate max-w-[200px] sm:max-w-xs">
                {title} {pin && <span className="text-amber-300 font-mono font-bold ml-1">PIN: {pin}</span>}
              </p>
            )}
          </div>
        </div>

        {/* Seletor de Telas (Votante / Telão / Admin) */}
        <div className="flex items-center bg-[#07132a] p-1 rounded-xl border border-blue-900/80 shadow-inner">
          <button
            onClick={() => setCurrentView('voter')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              currentView === 'admin'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Painel Admin</span>
          </button>
        </div>

        {/* Teste do Som da Urna e Status da Conexão */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => urnaAudio.playTseConfirma()}
            title="Ouvir som oficial da urna eletrônica do TSE"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 rounded-lg text-xs font-medium transition cursor-pointer active:scale-95 shadow-sm"
          >
            <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">Som Urna TSE</span>
          </button>

          <div
            title={isFirebaseConfigured ? 'Conectado ao Firebase Cloud' : 'Modo Local / BroadcastChannel ativo'}
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/80 rounded-md border border-slate-700/60 text-[11px] text-slate-300"
          >
            <Database className={`w-3 h-3 ${isFirebaseConfigured ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="hidden md:inline font-mono">
              {isFirebaseConfigured ? 'Firebase Nuvem' : 'Modo Local'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
