import React, { useRef, useState, useEffect } from 'react';
import { Tv, MonitorOff, ShieldCheck, Wifi, ExternalLink, RefreshCw, Camera, X } from 'lucide-react';
import { IasdLogo } from './IasdLogo';
import { toggleSecondaryScreen, subscribeSecondaryScreen } from '../utils/screen';

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

            {/* SENHA EDITÁVEL: DIGITAR OU REGENERAR */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <label htmlFor="navbar-pin-input" className="text-xs text-blue-300 font-medium cursor-pointer">
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
                title="Clique para digitar sua própria senha (pressione Enter para salvar)"
                className="w-20 px-1.5 py-0.5 font-mono font-black text-sm text-center text-amber-300 bg-[#07132a] border border-amber-500/40 hover:border-amber-400 focus:border-amber-300 rounded-md tracking-widest shadow-inner outline-none transition cursor-text select-all"
              />
              <button
                type="button"
                onClick={handleRegenerate}
                title="Regenerar Senha Aleatória da Votação"
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

        {/* Ações Rápidas: Botão Alternador de Projetar / Ocultar 2ª Tela */}
        <div className="flex items-center gap-2">
          {isScreen2Open ? (
            <button
              onClick={() => toggleSecondaryScreen()}
              title="Fechar / Ocultar a janela do Telão no 2º monitor"
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-500/50 rounded-lg text-xs font-black shadow-md shadow-rose-950/40 transition cursor-pointer active:scale-95"
            >
              <MonitorOff className="w-3.5 h-3.5 text-rose-400" />
              <span>Ocultar 2ª Tela</span>
              <X className="w-3.5 h-3.5 opacity-80" />
            </button>
          ) : (
            <button
              onClick={() => toggleSecondaryScreen()}
              title="Abrir o Telão em Tela Cheia no 2º monitor ou projetor da igreja"
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-blue-950 rounded-lg text-xs font-black shadow-md shadow-amber-900/30 transition cursor-pointer active:scale-95"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Projetar 2ª Tela</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
