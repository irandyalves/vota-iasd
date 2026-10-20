import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { VoterView } from './components/VoterView';
import { TelaoView } from './components/TelaoView';
import { AdminView } from './components/AdminView';
import type { VotingSession } from './types';
import { subscribeToSession, saveSession, DEFAULT_INITIAL_SESSION } from './services/votingService';
import { Tv, ExternalLink, X } from 'lucide-react';

export function App() {
  const [session, setSession] = useState<VotingSession>(DEFAULT_INITIAL_SESSION);
  const [currentView, setCurrentView] = useState<'voter' | 'telao' | 'admin'>('admin');
  const [showPopupBlockedToast, setShowPopupBlockedToast] = useState(false);

  // Função para abrir o Telão na 2ª Tela (Projetor/TV)
  const openSecondaryScreen = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/?view=telao&fullscreen=true`;
    const screenWidth = window.screen.availWidth || 1920;
    const screenHeight = window.screen.availHeight || 1080;
    const popup = window.open(
      url,
      'VotaIASDTelaoProjetor',
      `width=${screenWidth},height=${screenHeight},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
    );
    if (!popup) {
      setShowPopupBlockedToast(true);
    } else {
      setShowPopupBlockedToast(false);
      popup.focus();
    }
  };

  // Detecta parâmetro de URL (ex: ?view=voter ou ?view=telao ou ?view=admin)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      if (viewParam === 'telao' || viewParam === 'admin' || viewParam === 'voter') {
        setCurrentView(viewParam);
      } else {
        // Se acessado diretamente sem parâmetro num celular/tablet, abre a visão de votante
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
          setCurrentView('voter');
        }
      }

      // Ao abrir o admin no notebook pela primeira vez, tenta abrir a 2ª tela automaticamente
      const hasAttempted = sessionStorage.getItem('vota_iasd_telao_auto_launched');
      if (viewParam === 'admin' && !hasAttempted) {
        sessionStorage.setItem('vota_iasd_telao_auto_launched', 'true');
        setTimeout(() => {
          openSecondaryScreen();
        }, 500);
      }
    }
  }, []);

  // Escuta em tempo real a sessão ativa
  useEffect(() => {
    const unsubscribe = subscribeToSession('iasd-central-01', (updated) => {
      if (updated) {
        setSession(updated);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#07132a] text-slate-100 flex flex-col font-sans selection:bg-[#d4af37] selection:text-blue-950 w-full overflow-x-hidden">
      {/* Notificação Flutuante caso o navegador bloqueie popup automático (apenas no Admin) */}
      {showPopupBlockedToast && currentView === 'admin' && (
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-blue-950 px-4 py-3 flex items-center justify-between text-xs sm:text-sm font-bold shadow-xl border-b border-amber-400">
          <div className="flex items-center gap-2">
            <Tv className="w-5 h-5 shrink-0" />
            <span>
              O navegador solicitou permissão de tela. Clique para projetar o <strong>Telão em 2ª Tela (Tela Cheia)</strong>:
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openSecondaryScreen}
              className="px-3 py-1.5 bg-blue-950 text-amber-300 hover:text-white rounded-lg text-xs font-black shadow transition active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir Telão Agora
            </button>
            <button
              onClick={() => setShowPopupBlockedToast(false)}
              className="p-1 hover:bg-black/10 rounded-md transition text-blue-950 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* NAVBAR: EXIBIDA EXCLUSIVAMENTE NO MODO ADMIN! */}
      {/* Nos celulares dos votantes (QR Code) e no Telão de projeção, o cabeçalho administrativo NÃO aparece */}
      {currentView === 'admin' && (
        <Navbar
          currentView={currentView}
          setCurrentView={(view) => {
            setCurrentView(view);
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('view', view);
              window.history.pushState({}, '', url.toString());
            }
          }}
          pin={session?.pin}
          onRegeneratePin={(newPin) => {
            saveSession({ ...session, pin: newPin });
          }}
          logoUrl={session?.logoUrl}
          onUpdateLogo={(url) => {
            saveSession({ ...session, logoUrl: url });
          }}
        />
      )}

      {/* Botão de retorno discreto exclusivo no Telão */}
      {currentView === 'telao' && (
        <div className="fixed top-4 left-4 z-50 opacity-10 hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              setCurrentView('admin');
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('view', 'admin');
                window.history.pushState({}, '', url.toString());
              }
            }}
            className="px-3 py-1.5 bg-[#001f47]/80 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-blue-800 shadow-md backdrop-blur-md cursor-pointer"
          >
            ← Painel Admin
          </button>
        </div>
      )}

      {/* Conteúdo da Tela Selecionada - 100% Fluido e Responsivo */}
      <main className="flex-1 w-full">
        {currentView === 'voter' && <VoterView session={session} />}
        {currentView === 'telao' && <TelaoView session={session} />}
        {currentView === 'admin' && <AdminView session={session} />}
      </main>

      {/* Rodapé discreto da igreja (exibido apenas no Admin) */}
      {currentView === 'admin' && (
        <footer className="py-4 text-center text-xs text-blue-300/40 border-t border-blue-900/40 w-full">
          <p>Sistema VOTA IASD • Desenvolvido para Votações Transparentes e Seguras</p>
        </footer>
      )}
    </div>
  );
}

export default App;
