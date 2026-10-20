import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { VoterView } from './components/VoterView';
import { TelaoView } from './components/TelaoView';
import { AdminView } from './components/AdminView';
import type { VotingSession } from './types';
import { subscribeToSession, DEFAULT_INITIAL_SESSION } from './services/votingService';

export function App() {
  const [session, setSession] = useState<VotingSession>(DEFAULT_INITIAL_SESSION);
  const [currentView, setCurrentView] = useState<'voter' | 'telao' | 'admin'>('voter');

  // Detecta parâmetro de URL (ex: ?view=telao ou ?view=admin)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      if (viewParam === 'telao' || viewParam === 'admin' || viewParam === 'voter') {
        setCurrentView(viewParam);
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
    <div className="min-h-screen bg-[#07132a] text-slate-100 flex flex-col font-sans selection:bg-[#d4af37] selection:text-blue-950">
      {/* Navbar com seleção rápida de tela */}
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
        title={session?.title}
        pin={session?.pin}
      />

      {/* Conteúdo da Tela Selecionada */}
      <main className="flex-1">
        {currentView === 'voter' && <VoterView session={session} />}
        {currentView === 'telao' && <TelaoView session={session} />}
        {currentView === 'admin' && <AdminView session={session} />}
      </main>

      {/* Rodapé discreto da igreja */}
      <footer className="py-4 text-center text-xs text-blue-300/40 border-t border-blue-900/40">
        <p>Sistema VOTA IASD • Desenvolvido para Votações Transparentes e Seguras</p>
      </footer>
    </div>
  );
}

export default App;
