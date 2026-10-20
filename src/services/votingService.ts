import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import type { VotingSession, VoterBallot } from '../types';

const STORAGE_SESSION_KEY = 'vota_iasd_active_session';
const STORAGE_DEVICE_KEY = 'vota_iasd_device_id';

// Obter ou gerar ID exclusivo deste aparelho/navegador
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let deviceId = localStorage.getItem(STORAGE_DEVICE_KEY);
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem(STORAGE_DEVICE_KEY, deviceId);
  }
  return deviceId;
}

// Verifica se o dispositivo já votou nesta sessão e rodada
export function hasVoted(sessionId: string, round: 'MAIN' | 'TIE_BREAK' = 'MAIN', iteration: number = 1): boolean {
  if (typeof window === 'undefined') return false;
  const key = `voted_${sessionId}_i${iteration}_${round}`;
  return localStorage.getItem(key) === 'true';
}

export function markAsVoted(sessionId: string, round: 'MAIN' | 'TIE_BREAK' = 'MAIN', iteration: number = 1): void {
  if (typeof window === 'undefined') return;
  const key = `voted_${sessionId}_i${iteration}_${round}`;
  localStorage.setItem(key, 'true');
}

// Sessão Padrão Inicial para demonstração imediata
export const DEFAULT_INITIAL_SESSION: VotingSession = {
  id: 'iasd-central-01',
  title: 'Comissão de Diáconos 2026/2027',
  category: 'Ministério Diaconal',
  pin: '1844',
  status: 'WAITING',
  maxVotesPerVoter: 4,
  vacancies: 6,
  suplentesCount: 2,
  showResultsLive: true,
  options: [
    { id: '1', name: 'Carlos Eduardo Silva', subtitle: 'Membro há 12 anos', votesCount: 0, photoUrl: '' },
    { id: '2', name: 'Marcos Vinícius Santos', subtitle: 'Atuação na Sonoplastia', votesCount: 0, photoUrl: '' },
    { id: '3', name: 'Débora Rodrigues Lima', subtitle: 'Líder Pequenos Grupos', votesCount: 0, photoUrl: '' },
    { id: '4', name: 'Samuel Alves Pereira', subtitle: 'Ministério de Recepção', votesCount: 0, photoUrl: '' },
    { id: '5', name: 'Renato Oliveira Costa', subtitle: 'Tesoureiro Assistente', votesCount: 0, photoUrl: '' },
    { id: '6', name: 'Patrícia Soares Mendes', subtitle: 'Clube de Desbravadores', votesCount: 0, photoUrl: '' },
    { id: '7', name: 'Fernando Dias Ferreira', subtitle: 'Ministério Pessoal', votesCount: 0, photoUrl: '' },
    { id: '8', name: 'Juliana Barbosa Castro', subtitle: 'Escola Sabatina', votesCount: 0, photoUrl: '' },
    { id: '9', name: 'Roberto de Paula Souza', subtitle: 'Patrimônio e Zeladoria', votesCount: 0, photoUrl: '' },
    { id: '10', name: 'André Luiz Martins', subtitle: 'Comunicação e Mídia', votesCount: 0, photoUrl: '' },
  ],
  totalVotersConnected: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Canal de broadcast local para sincronização em tempo real entre abas/telas locais
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  broadcastChannel = new BroadcastChannel('vota_iasd_sync_channel');
}

// Armazena sessão localmente
export function getLocalSession(): VotingSession {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao ler sessão local:', e);
  }
  return DEFAULT_INITIAL_SESSION;
}

function setLocalSession(session: VotingSession) {
  try {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'SESSION_UPDATE', session });
    }
    window.dispatchEvent(new CustomEvent('vota_iasd_session_update', { detail: session }));
  } catch (e) {
    console.error('Erro ao salvar sessão local:', e);
  }
}

// Salva ou atualiza a sessão (Firebase e Local simultâneos para ultra velocidade)
export async function saveSession(session: VotingSession): Promise<void> {
  session.updatedAt = Date.now();

  // Limpa campos undefined para total compatibilidade com Firestore
  const cleanSession = JSON.parse(JSON.stringify(session));

  // 1. Atualiza o estado local imediatamente (0ms de latência para Telão e Admin na mesma máquina)
  setLocalSession(cleanSession);

  // 2. Transmite em tempo real para o Firestore para todos os celulares conectados
  if (isFirebaseConfigured && db) {
    try {
      const sessionRef = doc(db, 'sessions', session.id);
      await setDoc(sessionRef, cleanSession, { merge: true });
    } catch (error) {
      console.error('Erro ao salvar no Firestore:', error);
    }
  }
}

// Inscrição em tempo real aos dados da sessão (Firestore Cloud + Local Broadcast simultâneos)
export function subscribeToSession(
  sessionId: string,
  onUpdate: (session: VotingSession | null) => void
): () => void {
  // Inicializa imediatamente com a cópia local mais recente para não haver tela em branco
  onUpdate(getLocalSession());

  let unsubFirestore: (() => void) | null = null;

  // 1. Inscrição Nuvem Firestore (para celulares e múltiplos dispositivos)
  if (isFirebaseConfigured && db) {
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      unsubFirestore = onSnapshot(
        sessionRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const remoteData = docSnap.data() as VotingSession;
            onUpdate(remoteData);
            try {
              localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(remoteData));
            } catch (_) {}
          } else {
            // Inicializa a sessão inicial no Firestore caso ainda não exista
            saveSession({ ...DEFAULT_INITIAL_SESSION, id: sessionId });
            onUpdate(DEFAULT_INITIAL_SESSION);
          }
        },
        (error) => {
          console.warn('Erro de escuta no Firestore:', error);
        }
      );
    } catch (err) {
      console.warn('Falha ao conectar listener Firestore:', err);
    }
  }

  // 2. Inscrição Local (BroadcastChannel + CustomEvents para abas e 2ª tela no mesmo PC com latência zero)
  const handleBroadcast = (e: MessageEvent) => {
    if (e.data && e.data.type === 'SESSION_UPDATE' && e.data.session) {
      onUpdate(e.data.session);
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_SESSION_KEY && e.newValue) {
      try {
        onUpdate(JSON.parse(e.newValue));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleCustom = (e: Event) => {
    const custom = e as CustomEvent<VotingSession>;
    if (custom.detail) {
      onUpdate(custom.detail);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBroadcast);
  }
  window.addEventListener('storage', handleStorage);
  window.addEventListener('vota_iasd_session_update', handleCustom);

  return () => {
    if (unsubFirestore) {
      unsubFirestore();
    }
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBroadcast);
    }
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('vota_iasd_session_update', handleCustom);
  };
}

// Submissão de Cédula de Voto
export async function submitBallot(
  session: VotingSession,
  selectedOptionIds: string[],
  round: 'MAIN' | 'TIE_BREAK' = 'MAIN'
): Promise<{ success: boolean; message?: string }> {
  const voterId = getDeviceId();

  const iteration = session.votingIteration || 1;

  if (hasVoted(session.id, round, iteration)) {
    return { success: false, message: 'Você já votou nesta rodada com este dispositivo!' };
  }

  if (selectedOptionIds.length === 0) {
    return { success: false, message: 'Selecione pelo menos um candidato!' };
  }

  const maxAllowed = round === 'TIE_BREAK'
    ? (session.tieBreak?.maxVotesPerVoter || 1)
    : session.maxVotesPerVoter;

  if (selectedOptionIds.length > maxAllowed) {
    return { success: false, message: `O limite máximo é de ${maxAllowed} votos!` };
  }

  // Grava voto
  if (isFirebaseConfigured && db) {
    try {
      // 1. Grava a cédula na subcoleção para auditoria e trava
      const ballotRef = doc(db, 'sessions', session.id, 'ballots', `${voterId}_${round}`);
      const ballot: VoterBallot = {
        voterId,
        sessionId: session.id,
        selectedOptionIds,
        timestamp: Date.now(),
        round,
      };
      await setDoc(ballotRef, ballot);

      // 2. Incrementa a contagem dos candidatos selecionados
      const sessionRef = doc(db, 'sessions', session.id);
      
      if (round === 'MAIN') {
        const updatedOptions = session.options.map((opt) => {
          if (selectedOptionIds.includes(opt.id)) {
            return { ...opt, votesCount: (opt.votesCount || 0) + 1 };
          }
          return opt;
        });
        await updateDoc(sessionRef, {
          options: updatedOptions,
          updatedAt: Date.now(),
        });
      } else if (session.tieBreak) {
        const updatedTieOptions = session.tieBreak.options.map((opt) => {
          if (selectedOptionIds.includes(opt.id)) {
            return { ...opt, votesCount: (opt.votesCount || 0) + 1 };
          }
          return opt;
        });
        await updateDoc(sessionRef, {
          'tieBreak.options': updatedTieOptions,
          updatedAt: Date.now(),
        });
      }

      markAsVoted(session.id, round, iteration);
      return { success: true };
    } catch (err: unknown) {
      console.error('Erro ao enviar voto via Firebase:', err);
      // fallback local
    }
  }

  // Salva no modo Local/Demonstração
  const currentSession = getLocalSession();
  if (round === 'MAIN') {
    currentSession.options = currentSession.options.map((opt) => {
      if (selectedOptionIds.includes(opt.id)) {
        return { ...opt, votesCount: (opt.votesCount || 0) + 1 };
      }
      return opt;
    });
  } else if (currentSession.tieBreak) {
    currentSession.tieBreak.options = currentSession.tieBreak.options.map((opt) => {
      if (selectedOptionIds.includes(opt.id)) {
        return { ...opt, votesCount: (opt.votesCount || 0) + 1 };
      }
      return opt;
    });
  }
  setLocalSession(currentSession);
  markAsVoted(session.id, round, iteration);

  return { success: true };
}
