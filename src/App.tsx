import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { VoterView } from './components/VoterView';
import { TelaoView } from './components/TelaoView';
import { AdminView } from './components/AdminView';
import { SimulatorView } from './components/SimulatorView';
import type { VotingSession } from './types';
import { subscribeToSession, saveSession, getLocalSession } from './services/votingService';

const CURRENT_BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION || '';

export function App() {
  const [session, setSession] = useState<VotingSession>(getLocalSession);
  const [currentView, setCurrentView] = useState<'voter' | 'telao' | 'admin' | 'simulator'>('admin');

  // Auto-atualização em tempo real no GitHub Pages / Firebase Hosting sem precisar dar Ctrl+F5 manual
  useEffect(() => {
    if (typeof window === 'undefined' || !CURRENT_BUILD_VERSION) return;
    const isLocal =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) return;

    const checkNewVersion = async () => {
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.version && String(data.version) !== String(CURRENT_BUILD_VERSION)) {
          const url = new URL(window.location.href);
          url.searchParams.set('_v', String(data.version));
          window.location.replace(url.toString());
        }
      } catch (_) {}
    };

    const interval = setInterval(checkNewVersion, 6000);
    window.addEventListener('focus', checkNewVersion);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkNewVersion);
    };
  }, []);

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

      let effectiveView: 'voter' | 'telao' | 'admin' | 'simulator' = 'admin';
      if (viewParam === 'telao' || viewParam === 'admin' || viewParam === 'voter' || viewParam === 'simulator') {
        effectiveView = viewParam;
      } else if (isMobile) {
        effectiveView = 'voter';
      }
      setCurrentView(effectiveView);
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
      <main className="flex-1 w-full flex flex-col min-h-0">
        {currentView === 'voter' && <VoterView session={session} />}
        {currentView === 'telao' && <TelaoView session={session} />}
        {currentView === 'admin' && <AdminView session={session} />}
        {currentView === 'simulator' && <SimulatorView session={session} onReturnToAdmin={handleReturnToAdmin} />}
      </main>

      {/* Rodapé discreto da igreja (exibido apenas no Admin) */}
      {currentView === 'admin' && (
        <footer className="py-2.5 text-center text-xs text-blue-300/40 border-t border-blue-900/40 w-full shrink-0">
          <p>Sistema VOTA IASD • Desenvolvido para Votações Transparentes e Seguras</p>
        </footer>
      )}
    </div>
  );
}

export default App;
