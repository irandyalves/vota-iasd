import { doc, onSnapshot, setDoc, getDoc, runTransaction } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import type { VotingSession, VoterBallot, TelaoLayoutConfig, GeneralEventRecord } from '../types';
import { getGlobalElectionRules } from '../utils/globalRules';
import { sendBallotViaP2P, broadcastSessionP2P } from './peerSyncService';

const STORAGE_SESSION_KEY = 'vota_iasd_active_session';
const STORAGE_DEVICE_KEY = 'vota_iasd_device_id';
const STORAGE_TELAO_LAYOUT_KEY = 'vota_iasd_telao_layout';

export function getLocalTelaoLayout(): TelaoLayoutConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_TELAO_LAYOUT_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao ler layout local do telão:', e);
  }
  return null;
}

export function saveLocalTelaoLayout(layout: TelaoLayoutConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_TELAO_LAYOUT_KEY, JSON.stringify(layout));
  } catch (e) {
    console.error('Erro ao salvar layout local do telão:', e);
  }
}

let isQuotaExceeded = false;

const FIREBASE_QUOTA_STORAGE_KEY = 'vota_iasd_firestore_quota_today';
const FIREBASE_DAILY_QUOTA_LIMIT = 50000;

export function getFirestoreQuotaStats(): { count: number; max: number; percent: number } {
  if (typeof window === 'undefined') return { count: 0, max: FIREBASE_DAILY_QUOTA_LIMIT, percent: 0 };
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const raw = localStorage.getItem(FIREBASE_QUOTA_STORAGE_KEY);
    let data = raw ? JSON.parse(raw) : null;
    if (!data || data.date !== todayStr) {
      data = { date: todayStr, count: 0 };
      localStorage.setItem(FIREBASE_QUOTA_STORAGE_KEY, JSON.stringify(data));
    }
    const count = Number(data.count) || 0;
    const percent = Math.min(100, Math.round((count / FIREBASE_DAILY_QUOTA_LIMIT) * 1000) / 10);
    return { count, max: FIREBASE_DAILY_QUOTA_LIMIT, percent };
  } catch {
    return { count: 0, max: FIREBASE_DAILY_QUOTA_LIMIT, percent: 0 };
  }
}

export function recordFirestoreOperation(ops: number = 1): void {
  if (typeof window === 'undefined') return;
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const raw = localStorage.getItem(FIREBASE_QUOTA_STORAGE_KEY);
    let data = raw ? JSON.parse(raw) : null;
    if (!data || data.date !== todayStr) {
      data = { date: todayStr, count: 0 };
    }
    data.count = (Number(data.count) || 0) + ops;
    localStorage.setItem(FIREBASE_QUOTA_STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('vota_iasd_firestore_quota_change', { detail: getFirestoreQuotaStats() }));
  } catch {}
}

export function resetFirestoreQuotaStats(): void {
  if (typeof window === 'undefined') return;
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    localStorage.setItem(FIREBASE_QUOTA_STORAGE_KEY, JSON.stringify({ date: todayStr, count: 0 }));
    window.dispatchEvent(new CustomEvent('vota_iasd_firestore_quota_change', { detail: getFirestoreQuotaStats() }));
  } catch {}
}

export function isFirestoreQuotaExceeded(): boolean {
  return isQuotaExceeded;
}

// Obter ou gerar ID exclusivo deste aparelho/navegador
export function getDeviceId(customId?: string): string {
  if (customId) return customId;
  if (typeof window === 'undefined') return 'server';
  let deviceId = localStorage.getItem(STORAGE_DEVICE_KEY);
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem(STORAGE_DEVICE_KEY, deviceId);
  }
  return deviceId;
}

// Verifica se o dispositivo já votou nesta sessão e rodada
export function hasVoted(
  sessionId: string,
  round: 'MAIN' | 'TIE_BREAK' = 'MAIN',
  iteration: number = 1,
  customDeviceId?: string
): boolean {
  if (typeof window === 'undefined') return false;
  const key = customDeviceId
    ? `voted_${customDeviceId}_${sessionId}_i${iteration}_${round}`
    : `voted_${sessionId}_i${iteration}_${round}`;
  return localStorage.getItem(key) === 'true';
}

export function markAsVoted(
  sessionId: string,
  round: 'MAIN' | 'TIE_BREAK' = 'MAIN',
  iteration: number = 1,
  customDeviceId?: string
): void {
  if (typeof window === 'undefined') return;
  const key = customDeviceId
    ? `voted_${customDeviceId}_${sessionId}_i${iteration}_${round}`
    : `voted_${sessionId}_i${iteration}_${round}`;
  localStorage.setItem(key, 'true');
}

export function clearVotedFlag(
  sessionId: string,
  round: 'MAIN' | 'TIE_BREAK' = 'MAIN',
  iteration: number = 1,
  customDeviceId?: string
): void {
  if (typeof window === 'undefined') return;
  const key = customDeviceId
    ? `voted_${customDeviceId}_${sessionId}_i${iteration}_${round}`
    : `voted_${sessionId}_i${iteration}_${round}`;
  localStorage.removeItem(key);
}

// Confere no servidor se a cédula deste aparelho existe de fato (fonte da verdade).
// Retorna true/false, ou null se não foi possível verificar (offline / sem Firebase).
export async function verifyBallotOnServer(
  sessionId: string,
  round: 'MAIN' | 'TIE_BREAK' = 'MAIN',
  iteration: number = 1,
  customDeviceId?: string
): Promise<boolean | null> {
  // Dispositivos simulados operam localmente e nunca consomem leituras da nuvem
  if (customDeviceId && customDeviceId.startsWith('sim_')) {
    return true;
  }
  if (!isFirebaseConfigured || !db || isQuotaExceeded) return null;
  try {
    const voterId = customDeviceId || getDeviceId();
    const ballotRef = doc(db, 'sessions', sessionId, 'ballots', `${voterId}_${round}_i${iteration}`);
    recordFirestoreOperation(1);
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
  history: [],
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
  const localLayout = getLocalTelaoLayout();
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (localLayout) {
        parsed.telaoLayout = { ...(parsed.telaoLayout || {}), ...localLayout };
      }
      return parsed;
    }
  } catch (e) {
    console.error('Erro ao ler sessão local:', e);
  }
  const rules = getGlobalElectionRules();
  const initial = {
    ...DEFAULT_INITIAL_SESSION,
    totalVotersConnected: rules.totalVotersConnected,
    vacancies: rules.vacancies,
    maxVotesPerVoter: rules.maxVotesPerVoter,
    habilitarSuplente1: rules.habilitarSuplente1,
    suplentesCount: rules.suplentesCount,
    habilitarSuplente2: rules.habilitarSuplente2,
    segundoSuplentesCount: rules.segundoSuplentesCount,
    resolverEmpates: rules.resolverEmpates,
  };
  if (localLayout) {
    initial.telaoLayout = localLayout;
  }
  return initial;
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

  // Sincroniza automaticamente o evento ativo dentro de session.events com todo o seu estado (e remove duplicatas)
  if (Array.isArray(session.events) && session.events.length > 0) {
    const seenIds = new Set<string>();
    session.events = session.events
      .filter((evt) => {
        if (!evt || !evt.id || seenIds.has(evt.id)) return false;
        seenIds.add(evt.id);
        return true;
      })
      .map((evt) =>
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
              labelTitulares: session.labelTitulares || evt.labelTitulares || 'Titulares',
              labelSuplente1: session.labelSuplente1 || evt.labelSuplente1 || '1º suplente',
              labelSuplente2: session.labelSuplente2 || evt.labelSuplente2 || '2º suplente',
            }
          : evt
      );
  }

  // Sincroniza automaticamente o Evento Geral ativo dentro de session.generalEvents (preservando o banco online)
  if (session.generalEventName) {
    const genList: GeneralEventRecord[] = Array.isArray(session.generalEvents) ? [...session.generalEvents] : [];
    const activeGenId = session.activeGeneralEventId || 'gen_' + session.generalEventName.replace(/\s+/g, '_');
    session.activeGeneralEventId = activeGenId;

    const existingIdx = genList.findIndex((g) => g.id === activeGenId || g.name === session.generalEventName);
    const currentSnapshot: GeneralEventRecord = {
      id: activeGenId,
      name: session.generalEventName,
      createdAt: existingIdx >= 0 ? genList[existingIdx].createdAt : Date.now(),
      updatedAt: Date.now(),
      events: session.events || [],
      activeEventId: session.activeEventId,
      title: session.title,
      options: session.options || [],
      history: session.history || [],
      vacancies: session.vacancies,
      maxVotesPerVoter: session.maxVotesPerVoter,
      suplentesCount: session.suplentesCount,
      segundoSuplentesCount: session.segundoSuplentesCount,
      habilitarSuplente1: session.habilitarSuplente1,
      habilitarSuplente2: session.habilitarSuplente2,
      resolverEmpates: session.resolverEmpates,
      rulesConfigured: session.rulesConfigured,
      labelTitulares: session.labelTitulares,
      labelSuplente1: session.labelSuplente1,
      labelSuplente2: session.labelSuplente2,
      status: session.status,
      tieBreak: session.tieBreak || null,
      mainVotersCount: session.mainVotersCount,
      tieBreakVotersCount: session.tieBreakVotersCount,
      votingIteration: session.votingIteration,
      telaoMode: session.telaoMode,
    };

    if (existingIdx >= 0) {
      genList[existingIdx] = currentSnapshot;
    } else {
      genList.push(currentSnapshot);
    }
    session.generalEvents = genList;
  }

  // Preserva localmente configurações de layout do telão (tamanho do qr code, posição na tela, etc.)
  if (session.telaoLayout) {
    saveLocalTelaoLayout(session.telaoLayout);
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
        recordFirestoreOperation(1);
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
          recordFirestoreOperation(1);
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
    updated.updatedAt = Date.now();
  }

  return updated;
}

// Submissão de Cédula de Voto
export async function submitBallot(
  session: VotingSession,
  selectedOptionIds: string[],
  round: 'MAIN' | 'TIE_BREAK' = 'MAIN',
  customDeviceId?: string
): Promise<{ success: boolean; message?: string }> {
  const voterId = customDeviceId || getDeviceId();
  const iteration = session.votingIteration || 1;

  if (hasVoted(session.id, round, iteration, customDeviceId)) {
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

  // 0. CELULARES DO SIMULADOR: Processamento 100% em memória local e broadcast
  // Preserva 100% da cota do Firebase Firestore para a eleição real oficial
  if (customDeviceId && customDeviceId.startsWith('sim_')) {
    try {
      const currentSession = getLocalSession();
      const updated = applyBallotToSession(currentSession, selectedOptionIds, round);
      setLocalSession(updated);
      markAsVoted(session.id, round, iteration, customDeviceId);
      return { success: true };
    } catch (simErr) {
      console.error('Erro ao processar voto simulado local:', simErr);
    }
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
        recordFirestoreOperation(2);
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

          transaction.update(sessionRef, {
            'tieBreak.options': updatedTieOptions,
            tieBreakVotersCount: newTieVotersCount,
            updatedAt: Date.now(),
          });
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

      markAsVoted(session.id, round, iteration, customDeviceId);
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'ALREADY_VOTED') {
        markAsVoted(session.id, round, iteration, customDeviceId);
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
      markAsVoted(session.id, round, iteration, customDeviceId);
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
    markAsVoted(session.id, round, iteration, customDeviceId);
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
export function registerVoterPresence(_sessionId: string, customDeviceId?: string): () => void {
  if (typeof window === 'undefined') return () => {};
  const voterId = customDeviceId || getDeviceId();

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
