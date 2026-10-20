import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { VoterView } from './components/VoterView';
import { TelaoView } from './components/TelaoView';
import { AdminView } from './components/AdminView';
import type { VotingSession } from './types';
import { subscribeToSession, saveSession, getLocalSession } from './services/votingService';
import { openTelaoOnSecondMonitor, isSecondaryScreenOpen } from './utils/screen';

export function App() {
  const [session, setSession] = useState<VotingSession>(getLocalSession);
  const [currentView, setCurrentView] = useState<'voter' | 'telao' | 'admin'>('admin');

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

      // Se for Admin no Desktop/Notebook, abre automaticamente em todos os monitores extras sem perguntar
      if (effectiveView === 'admin') {
        openTelaoOnSecondMonitor();

        // Caso o navegador exija um primeiro gesto antes de liberar múltiplas janelas, abre automaticamente no 1º toque/clique sem exibir barra amarela
        const autoOpenOnGesture = (e: Event) => {
          const target = e.target instanceof Element ? e.target : null;
          // Não interfere se o usuário estiver clicando explicitamente no botão de ocultar 2ª tela
          if (target?.closest('[data-toggle-screen-btn="true"]')) return;
          if (!isSecondaryScreenOpen()) {
            openTelaoOnSecondMonitor();
          }
          window.removeEventListener('click', autoOpenOnGesture, true);
          window.removeEventListener('keydown', autoOpenOnGesture, true);
        };

        window.addEventListener('click', autoOpenOnGesture, true);
        window.addEventListener('keydown', autoOpenOnGesture, true);
        return () => {
          window.removeEventListener('click', autoOpenOnGesture, true);
          window.removeEventListener('keydown', autoOpenOnGesture, true);
        };
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
          title={session?.title}
          onUpdateTitle={(newTitle) => {
            saveSession({ ...session, title: newTitle });
          }}
          session={session}
          onSaveSession={saveSession}
        />
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
