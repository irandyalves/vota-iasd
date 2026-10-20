import React, { useRef } from 'react';
import { Tv, ShieldCheck, Volume2, Database, Wifi, ExternalLink, RefreshCw, Camera } from 'lucide-react';
import { isFirebaseConfigured } from '../services/firebase';
import { urnaAudio } from '../utils/audio';
import { IasdLogo } from './IasdLogo';

import { openTelaoOnSecondMonitor } from '../utils/screen';

interface NavbarProps {
  currentView: 'voter' | 'telao' | 'admin';
  setCurrentView: (view: 'voter' | 'telao' | 'admin') => void;
  pin?: string;
  onRegeneratePin?: (newPin: string) => void;
  logoUrl?: string;
  onUpdateLogo?: (url: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  pin = '1844',
  onRegeneratePin,
  logoUrl,
  onUpdateLogo,
}) => {
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Gera novo PIN de 4 dígitos aleatório
  const handleRegenerate = () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
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

  // Abre o Telão no 2º monitor ou projetor da igreja
  const handleOpenSecondaryScreen = () => {
    openTelaoOnSecondMonitor();
  };

  return (
    <header className="sticky top-0 z-50 bg-[#001f47]/95 backdrop-blur-md border-b border-blue-900/60 shadow-lg px-3 sm:px-6 lg:px-8 py-2.5 w-full">
      <div className="w-full flex flex-wrap items-center justify-between gap-3">
        {/* Marca / Identidade IASD com Logo Clicável */}
        <div className="flex items-center gap-3">
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
            <IasdLogo className="w-11 h-11" customUrl={logoUrl} />
            <div className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-amber-300 transition-opacity">
              <Camera className="w-4 h-4" />
            </div>
          </button>

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

            {/* SENHA 1844 com Botão de Regenerar */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-blue-300 font-medium">SENHA:</span>
              <span className="text-amber-300 font-mono font-black text-sm tracking-widest bg-[#07132a] px-2 py-0.5 rounded-md border border-amber-500/30">
                {pin}
              </span>
              <button
                type="button"
                onClick={handleRegenerate}
                title="Regenerar Senha da Votação"
                className="p-1 text-blue-300 hover:text-amber-300 hover:bg-blue-900/60 rounded-md transition cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Seletor de Telas (Apenas no Admin) */}
        <div className="flex items-center bg-[#07132a] p-1 rounded-xl border border-blue-900/80 shadow-inner">
          <button
            onClick={() => setCurrentView('voter')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              currentView === 'voter'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/50'
            }`}
          >
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

        {/* Ações Rápidas: 2ª Tela, Som da Urna e Conexão */}
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
