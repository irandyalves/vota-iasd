import React, { useRef, useState, useEffect } from 'react';
import { Tv, MonitorOff, ExternalLink, RefreshCw, Camera, X, Pencil } from 'lucide-react';
import { IasdLogo } from './IasdLogo';
import { toggleSecondaryScreen, subscribeSecondaryScreen } from '../utils/screen';

interface NavbarProps {
  currentView: 'voter' | 'telao' | 'admin';
  setCurrentView: (view: 'voter' | 'telao' | 'admin') => void;
  pin?: string;
  onRegeneratePin?: (newPin: string) => void;
  logoUrl?: string;
  onUpdateLogo?: (url: string) => void;
  title?: string;
  onUpdateTitle?: (newTitle: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  pin = '1844',
  onRegeneratePin,
  logoUrl,
  onUpdateLogo,
  title = 'COMISSÃO 2026',
  onUpdateTitle,
}) => {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [localPin, setLocalPin] = useState(pin);
  const [isScreen2Open, setIsScreen2Open] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);

  // Sincroniza estado de senha e título caso venham externamente
  useEffect(() => {
    setLocalPin(pin);
  }, [pin]);

  useEffect(() => {
    setEditedTitle(title);
  }, [title]);

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

  // Salva o título da comissão
  const handleSaveTitle = () => {
    const cleaned = editedTitle.trim();
    if (cleaned && cleaned !== title) {
      onUpdateTitle?.(cleaned);
    } else if (!cleaned) {
      setEditedTitle(title);
    }
    setIsEditingTitle(false);
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
    <header className="sticky top-0 z-50 bg-[#001f47]/95 backdrop-blur-md border-b border-blue-900/60 shadow-lg px-3 sm:px-6 lg:px-8 py-2 w-full">
      <div className="w-full grid grid-cols-1 md:grid-cols-3 items-center gap-3">
        {/* ESQUERDA: Logo + VOTA IASD (50% menor, fonte redonda, sem Tempo Real) + SENHA sem borda */}
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
                fontFamily: '"Varela Round", "Nunito", "Quicksand", ui-rounded, "Segoe UI", system-ui, sans-serif',
              }}
            >
              VOTA <span className="text-[#d4af37]">IASD</span>
            </span>

            {/* SENHA EDITÁVEL SEM BORDA */}
            <div className="flex items-center gap-1 mt-0.5">
              <label htmlFor="navbar-pin-input" className="text-[11px] text-blue-300 font-semibold cursor-pointer">
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

        {/* CENTRO: TÍTULO DO EVENTO EDITÁVEL (Ex: COMISSÃO 2026) */}
        <div className="flex items-center justify-center justify-self-center">
          {isEditingTitle ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setEditedTitle(title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              className="text-base sm:text-lg font-black text-white uppercase tracking-wide bg-[#07132a] border border-[#d4af37] px-3 py-1 rounded-xl outline-none text-center shadow-inner min-w-[220px]"
            />
          ) : (
            <div
              onClick={() => {
                setEditedTitle(title);
                setIsEditingTitle(true);
              }}
              title="Clique para editar o título do evento"
              className="group flex items-center gap-2 px-3 py-1 rounded-xl hover:bg-blue-900/40 cursor-pointer transition"
            >
              <h1 className="text-base sm:text-xl font-black text-white uppercase tracking-wide group-hover:text-amber-300 transition-colors">
                {title}
              </h1>
              <Pencil className="w-3.5 h-3.5 text-amber-300/60 group-hover:text-amber-300 transition-opacity" />
            </div>
          )}
        </div>

        {/* DIREITA: Botão 2ª Tela + Listbox "VISÃO DE:" (Admin, Celular, Público) */}
        <div className="flex items-center gap-2.5 justify-self-end">
          {isScreen2Open ? (
            <button
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
            <label htmlFor="navbar-view-select" className="text-[10px] font-bold text-blue-300 uppercase tracking-wider whitespace-nowrap">
              VISÃO DE:
            </label>
            <select
              id="navbar-view-select"
              value={currentView}
              onChange={(e) => setCurrentView(e.target.value as 'admin' | 'voter' | 'telao')}
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
