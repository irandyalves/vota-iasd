import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { VoterView } from './components/VoterView';
import { TelaoView } from './components/TelaoView';
import { AdminView } from './components/AdminView';
import type { VotingSession } from './types';
import { subscribeToSession, saveSession, DEFAULT_INITIAL_SESSION } from './services/votingService';
import { openTelaoOnSecondMonitor, subscribeSecondaryScreen } from './utils/screen';
import { ExternalLink, X, MonitorPlay, ArrowLeft } from 'lucide-react';

export function App() {
  const [session, setSession] = useState<VotingSession>(DEFAULT_INITIAL_SESSION);
  const [currentView, setCurrentView] = useState<'voter' | 'telao' | 'admin'>('admin');
  const [showPopupBlockedToast, setShowPopupBlockedToast] = useState(false);

  // Navegar de volta ao Admin
  const handleReturnToAdmin = () => {
    setCurrentView('admin');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'admin');
      window.history.pushState({}, '', url.toString());
    }
  };

  // Tecla ESC global: volta instantaneamente para o Admin
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleReturnToAdmin();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Monitora se o Telão na 2ª tela está ativo
  useEffect(() => {
    const unsub = subscribeSecondaryScreen((isOpen) => {
      if (isOpen) {
        setShowPopupBlockedToast(false);
      }
    });
    return unsub;
  }, []);

  // Função para abrir o Telão na 2ª Tela (Projetor/TV)
  const handleOpenTelaoSecondScreen = async () => {
    const opened = await openTelaoOnSecondMonitor();
    if (opened) {
      setShowPopupBlockedToast(false);
    } else {
      setShowPopupBlockedToast(true);
    }
  };

  // Detecta parâmetro de URL (ex: ?view=voter ou ?view=telao ou ?view=admin)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      const isMobile = window.innerWidth <= 768;

      let effectiveView: 'voter' | 'telao' | 'admin' = 'admin';
      if (viewParam === 'telao' || viewParam === 'admin' || viewParam === 'voter') {
        effectiveView = viewParam;
      } else if (isMobile) {
        effectiveView = 'voter';
      }
      setCurrentView(effectiveView);

      // Se for Admin no Desktop/Notebook, inicializa abertura automática no 2º monitor
      if (effectiveView === 'admin') {
        // Tenta abrir imediatamente
        openTelaoOnSecondMonitor().then((opened) => {
          if (!opened) {
            setShowPopupBlockedToast(true);

            // Adiciona gatilho no primeiro clique do usuário para contornar bloqueador de popups do navegador
            const handleFirstUserGesture = () => {
              openTelaoOnSecondMonitor().then((res) => {
                if (res) {
                  setShowPopupBlockedToast(false);
                }
              });
            };
            window.addEventListener('click', handleFirstUserGesture, { once: true });
          }
        });
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
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-blue-950 px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-bold shadow-xl border-b border-amber-300">
          <div className="flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 shrink-0 text-blue-950 animate-bounce" />
            <span>
              2 Telas Detectadas: Clique para projetar o <strong>Telão no 2º Monitor (Projetor / TV)</strong>:
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenTelaoSecondScreen}
              className="px-4 py-1.5 bg-blue-950 text-amber-300 hover:text-white rounded-lg text-xs font-black shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-1.5 border border-amber-400/40"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              ABRIR NO MONITOR 2 AGORA
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

      {/* Botão de retorno superior direito (apenas para tela de votante/teste, NUNCA exibido no Telão) */}
      {currentView === 'voter' && (
        <div className="fixed top-2.5 right-24 sm:right-28 z-50">
          <button
            onClick={handleReturnToAdmin}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#001f47]/95 hover:bg-blue-900 border border-amber-400/80 hover:border-amber-400 text-amber-300 font-bold text-xs rounded-xl shadow-2xl backdrop-blur-md transition active:scale-95 cursor-pointer"
            title="Pressione ESC ou clique para voltar ao Painel Admin"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Admin (ESC)</span>
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
