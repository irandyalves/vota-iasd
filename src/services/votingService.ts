import { doc, onSnapshot, setDoc, getDoc, runTransaction } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import type { VotingSession, VoterBallot } from '../types';
import { sendBallotViaP2P, broadcastSessionP2P } from './peerSyncService';

const STORAGE_SESSION_KEY = 'vota_iasd_active_session';
const STORAGE_DEVICE_KEY = 'vota_iasd_device_id';

let isQuotaExceeded = false;

export function isFirestoreQuotaExceeded(): boolean {
  return isQuotaExceeded;
}

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

export function clearVotedFlag(sessionId: string, round: 'MAIN' | 'TIE_BREAK' = 'MAIN', iteration: number = 1): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`voted_${sessionId}_i${iteration}_${round}`);
}

// Confere no servidor se a cédula deste aparelho existe de fato (fonte da verdade).
// Retorna true/false, ou null se não foi possível verificar (offline / sem Firebase).
export async function verifyBallotOnServer(
  sessionId: string,
  round: 'MAIN' | 'TIE_BREAK' = 'MAIN',
  iteration: number = 1
): Promise<boolean | null> {
  if (!isFirebaseConfigured || !db || isQuotaExceeded) return null;
  try {
    const ballotRef = doc(db, 'sessions', sessionId, 'ballots', `${getDeviceId()}_${round}_i${iteration}`);
    const snap = await getDoc(ballotRef);
    return snap.exists();
  } catch (err: any) {
    if (err?.code === 'resource-exhausted') {
      isQuotaExceeded = true;
    }
    return null;
  }
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

export function setLocalSession(session: VotingSession) {
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

// Timer para debouncing de escrita no Firestore (evita que cada tecla digitada envie 1 write)
let firestoreDebounceTimer: any = null;

// Salva ou atualiza a sessão (Firebase e Local simultâneos para ultra velocidade)
export async function saveSession(session: VotingSession): Promise<void> {
  session.updatedAt = Date.now();

  // Sincroniza automaticamente o evento ativo dentro de session.events com todo o seu estado
  if (Array.isArray(session.events) && session.events.length > 0 && session.activeEventId) {
    session.events = session.events.map((evt) =>
      evt.id === session.activeEventId
        ? {
            ...evt,
            name: session.title || evt.name,
            options: session.options,
            vacancies: session.vacancies,
            maxVotesPerVoter: session.maxVotesPerVoter,
            suplentesCount: session.suplentesCount,
            segundoSuplentesCount: session.segundoSuplentesCount,
            habilitarSuplente1: session.habilitarSuplente1,
            habilitarSuplente2: session.habilitarSuplente2,
            resolverEmpates: session.resolverEmpates,
            status: session.status,
            tieBreak: session.tieBreak || null,
            mainVotersCount: session.mainVotersCount || 0,
            tieBreakVotersCount: session.tieBreakVotersCount || 0,
            votingIteration: session.votingIteration || 1,
            telaoMode: session.telaoMode || 'names',
          }
        : evt
    );
  }

  // Limpa campos undefined para total compatibilidade com Firestore
  const cleanSession = JSON.parse(JSON.stringify(session));
  if (!session.tieBreak) {
    cleanSession.tieBreak = null;
  }

  // 1. Atualiza o estado local imediatamente (0ms de latência para Telão e Admin na mesma máquina)
  setLocalSession(cleanSession);

  // 2. Transmite via P2P WebRTC diretamente a celulares conectados
  broadcastSessionP2P(cleanSession);

  // 3. Transmite para o Firestore com debounce para economizar cota (evita queimar cotas ao digitar)
  if (isFirebaseConfigured && db && !isQuotaExceeded) {
    const database = db;
    if (firestoreDebounceTimer) {
      clearTimeout(firestoreDebounceTimer);
    }
    firestoreDebounceTimer = setTimeout(async () => {
      try {
        const sessionRef = doc(database, 'sessions', session.id);
        await setDoc(sessionRef, cleanSession, { merge: true });
      } catch (error: any) {
        if (error?.code === 'resource-exhausted') {
          isQuotaExceeded = true;
          window.dispatchEvent(new CustomEvent('vota_iasd_quota_exceeded'));
          console.warn('⚠️ Cota diária do Firestore esgotada. Alternativa P2P/Local ativada.');
        } else {
          console.error('Erro ao salvar no Firestore:', error);
        }
      }
    }, 300);
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
          if ((error as any)?.code === 'resource-exhausted') {
            isQuotaExceeded = true;
            window.dispatchEvent(new CustomEvent('vota_iasd_quota_exceeded'));
            console.warn('⚠️ Cota do Firestore esgotada na escuta. Mantendo sincronização local/P2P.');
          } else {
            console.warn('Erro de escuta no Firestore:', error);
          }
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

/**
 * Computa uma cédula de votação em uma sessão (função pura e universal).
 * Usada tanto na gravação local, quanto em contingência P2P quando o Firebase atinge a cota de 50k.
 */
export function applyBallotToSession(
  session: VotingSession,
  selectedOptionIds: string[],
  round: 'MAIN' | 'TIE_BREAK' = 'MAIN'
): VotingSession {
  const updated = JSON.parse(JSON.stringify(session)) as VotingSession;

  if (round === 'MAIN') {
    updated.options = (updated.options || []).map((opt) => {
      if (selectedOptionIds.includes(opt.id)) {
        return { ...opt, votesCount: (opt.votesCount || 0) + 1 };
      }
      return opt;
    });
    updated.mainVotersCount = ((updated as any).mainVotersCount || 0) + 1;
    updated.updatedAt = Date.now();
  } else if (updated.tieBreak) {
    const updatedTieOptions = (updated.tieBreak.options || []).map((opt) => {
      if (selectedOptionIds.includes(opt.id)) {
        return { ...opt, votesCount: (opt.votesCount || 0) + 1 };
      }
      return opt;
    });

    const currentTieVoters = (updated as any).tieBreakVotersCount || 0;
    const newTieVotersCount = currentTieVoters + 1;
    (updated as any).tieBreakVotersCount = newTieVotersCount;
    updated.tieBreak.options = updatedTieOptions;

    const expectedVoters =
      (updated as any).mainVotersCount ||
      Math.max(...(updated.options || []).map((o) => Math.floor(o.votesCount || 0)), 1);

    const isTieBreakFinished = newTieVotersCount >= expectedVoters;

    if (isTieBreakFinished) {
      const sortedTieOptions = [...updatedTieOptions].sort(
        (a, b) => (b.votesCount || 0) - (a.votesCount || 0)
      );
      const vacancies = updated.tieBreak.vacancies || 1;
      const winnerIds: string[] = [];

      if (sortedTieOptions.length > vacancies) {
        const cutoffTieVotes = sortedTieOptions[vacancies - 1]?.votesCount || 0;
        const nextTieVotes = sortedTieOptions[vacancies]?.votesCount || 0;
        if (cutoffTieVotes > nextTieVotes) {
          sortedTieOptions.slice(0, vacancies).forEach((w) => winnerIds.push(w.id));
        }
      } else if (sortedTieOptions.length > 0) {
        sortedTieOptions.slice(0, vacancies).forEach((w) => winnerIds.push(w.id));
      }

      updated.options = (updated.options || []).map((opt) => {
        if (winnerIds.includes(opt.id)) {
          return { ...opt, votesCount: (opt.votesCount || 0) + 0.01 };
        }
        return opt;
      });

      updated.status = 'CLOSED';
      updated.telaoMode = 'voting';
      updated.tieBreak.active = false;
      (updated.tieBreak as any).resolved = true;
    }
  }

  return updated;
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

  // 1. Grava voto no Firestore (se configurado e cota não excedida)
  if (isFirebaseConfigured && db && !isQuotaExceeded) {
    try {
      const sessionRef = doc(db, 'sessions', session.id);
      const ballotDocId = `${voterId}_${round}_i${iteration}`;
      const ballotRef = doc(db, 'sessions', session.id, 'ballots', ballotDocId);
      const ballot: VoterBallot = {
        voterId,
        sessionId: session.id,
        selectedOptionIds,
        timestamp: Date.now(),
        round,
      };

      await runTransaction(db, async (transaction) => {
        const sessionSnap = await transaction.get(sessionRef);
        const existingBallot = await transaction.get(ballotRef);

        if (existingBallot.exists()) {
          throw new Error('ALREADY_VOTED');
        }

        let liveOptions = session.options;
        let liveTieBreak = session.tieBreak;
        let liveData: VotingSession | null = null;

        if (sessionSnap.exists()) {
          liveData = sessionSnap.data() as VotingSession;
          const liveIteration = liveData.votingIteration || 1;
          const expectedStatus = round === 'TIE_BREAK' ? 'TIE_BREAK' : 'VOTING';
          if (liveIteration !== iteration || liveData.status !== expectedStatus) {
            throw new Error('ROUND_CHANGED');
          }
          if (Array.isArray(liveData.options) && liveData.options.length > 0) {
            liveOptions = liveData.options;
          }
          if (liveData.tieBreak) {
            liveTieBreak = liveData.tieBreak;
          }
        }

        // Grava cédula de auditoria
        transaction.set(ballotRef, ballot);

        // Incrementa contagem de votos atomicamente no documento da sessão
        if (round === 'MAIN') {
          const updatedOptions = liveOptions.map((opt) => {
            if (selectedOptionIds.includes(opt.id)) {
              return { ...opt, votesCount: (opt.votesCount || 0) + 1 };
            }
            return opt;
          });
          const newMainVotersCount = ((liveData as any)?.mainVotersCount || 0) + 1;
          transaction.update(sessionRef, {
            options: updatedOptions,
            mainVotersCount: newMainVotersCount,
            updatedAt: Date.now(),
          });
        } else if (liveTieBreak) {
          const updatedTieOptions = (liveTieBreak.options || []).map((opt) => {
            if (selectedOptionIds.includes(opt.id)) {
              return { ...opt, votesCount: (opt.votesCount || 0) + 1 };
            }
            return opt;
          });

          const currentTieVoters = (liveData as any)?.tieBreakVotersCount || 0;
          const newTieVotersCount = currentTieVoters + 1;

          const expectedVoters =
            (liveData as any)?.mainVotersCount ||
            Math.max(...liveOptions.map((o) => Math.floor(o.votesCount || 0)), 1);

          const isTieBreakFinished = newTieVotersCount >= expectedVoters;

          if (isTieBreakFinished) {
            const sortedTieOptions = [...updatedTieOptions].sort(
              (a, b) => (b.votesCount || 0) - (a.votesCount || 0)
            );
            const vacancies = liveTieBreak.vacancies || 1;

            const winnerIds: string[] = [];
            if (sortedTieOptions.length > vacancies) {
              const cutoffTieVotes = sortedTieOptions[vacancies - 1]?.votesCount || 0;
              const nextTieVotes = sortedTieOptions[vacancies]?.votesCount || 0;
              if (cutoffTieVotes > nextTieVotes) {
                sortedTieOptions.slice(0, vacancies).forEach((w) => winnerIds.push(w.id));
              }
            } else if (sortedTieOptions.length > 0) {
              sortedTieOptions.slice(0, vacancies).forEach((w) => winnerIds.push(w.id));
            }

            const updatedMainOptions = liveOptions.map((opt) => {
              if (winnerIds.includes(opt.id)) {
                return { ...opt, votesCount: (opt.votesCount || 0) + 0.01 };
              }
              return opt;
            });

            transaction.update(sessionRef, {
              options: updatedMainOptions,
              status: 'CLOSED',
              telaoMode: 'voting',
              'tieBreak.options': updatedTieOptions,
              'tieBreak.active': false,
              'tieBreak.resolved': true,
              tieBreakVotersCount: newTieVotersCount,
              updatedAt: Date.now(),
            });
          } else {
            transaction.update(sessionRef, {
              'tieBreak.options': updatedTieOptions,
              tieBreakVotersCount: newTieVotersCount,
              updatedAt: Date.now(),
            });
          }
        }
      });

      // Atualiza também o cache local/BroadcastChannel para abas no mesmo PC
      try {
        const currentSession = getLocalSession();
        if (currentSession && currentSession.id === session.id) {
          const updated = applyBallotToSession(currentSession, selectedOptionIds, round);
          setLocalSession(updated);
        }
      } catch (_) {}

      markAsVoted(session.id, round, iteration);
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'ALREADY_VOTED') {
        markAsVoted(session.id, round, iteration);
        return { success: false, message: 'Você já votou nesta rodada com este dispositivo!' };
      }
      if (err instanceof Error && err.message === 'ROUND_CHANGED') {
        return { success: false, message: 'A votação foi alterada pelo líder. Aguarde a tela atualizar e vote novamente.' };
      }

      if ((err as any)?.code === 'resource-exhausted') {
        isQuotaExceeded = true;
        window.dispatchEvent(new CustomEvent('vota_iasd_quota_exceeded'));
        console.warn('⚠️ Cota diária do Firestore excedida durante o voto. Acionando contingência P2P/Local.');
      } else {
        console.warn('Erro Firestore ao computar voto. Tentando contingência P2P/Local:', err);
      }
    }
  }

  // 2. ALTERNATIVA / CONTINGÊNCIA 1: Envio direto via P2P WebRTC ao Admin
  try {
    const p2pSuccess = await sendBallotViaP2P(selectedOptionIds, round, iteration, voterId);
    if (p2pSuccess) {
      markAsVoted(session.id, round, iteration);
      return { success: true };
    }
  } catch (p2pErr) {
    console.warn('Tentativa P2P falhou, aplicando fallback local:', p2pErr);
  }

  // 3. ALTERNATIVA / CONTINGÊNCIA 2: Modo Local / Broadcast / Telão
  try {
    const currentSession = getLocalSession();
    const updated = applyBallotToSession(currentSession, selectedOptionIds, round);
    setLocalSession(updated);
    broadcastSessionP2P(updated);
    markAsVoted(session.id, round, iteration);
    return { success: true };
  } catch (localErr) {
    console.error('Falha ao aplicar voto localmente:', localErr);
    return {
      success: false,
      message: 'Falha ao registrar voto. Por favor, tente novamente.',
    };
  }
}

// Registra a presença de um votante conectado (SOMENTE LOCAL/BROADCAST - sem Firestore para não queimar cota)
export function registerVoterPresence(_sessionId: string): () => void {
  if (typeof window === 'undefined') return () => {};
  const voterId = getDeviceId();

  try {
    const raw = localStorage.getItem('vota_iasd_local_voters');
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(voterId)) {
      list.push(voterId);
      localStorage.setItem('vota_iasd_local_voters', JSON.stringify(list));
    }
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'VOTER_CONNECTED', voterId, list });
    }
    window.dispatchEvent(new CustomEvent('vota_iasd_voter_connected', { detail: { voterId, list } }));
  } catch (_) {}

  return () => {};
}

// Inscrição em tempo real na lista de votantes conectados (SOMENTE LOCAL/BROADCAST)
export function subscribeToConnectedVoters(
  _sessionId: string,
  onUpdate: (voters: string[]) => void
): () => void {
  // Carrega imediatamente do localStorage
  try {
    const raw = localStorage.getItem('vota_iasd_local_voters');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) onUpdate(list);
    }
  } catch (_) {}

  // Listener local de broadcast entre abas
  const handleBroadcast = (e: MessageEvent) => {
    if (e.data && e.data.type === 'VOTER_CONNECTED' && Array.isArray(e.data.list)) {
      onUpdate(e.data.list);
    }
  };

  const handleCustom = (e: Event) => {
    const custom = e as CustomEvent<{ voterId: string; list: string[] }>;
    if (custom.detail?.list) {
      onUpdate(custom.detail.list);
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'vota_iasd_local_voters' && e.newValue) {
      try {
        const list = JSON.parse(e.newValue);
        if (Array.isArray(list)) onUpdate(list);
      } catch (_) {}
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBroadcast);
  }
  window.addEventListener('vota_iasd_voter_connected', handleCustom);
  window.addEventListener('storage', handleStorage);

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBroadcast);
    }
    window.removeEventListener('vota_iasd_voter_connected', handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}
