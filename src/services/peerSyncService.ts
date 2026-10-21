import { Peer, type DataConnection } from 'peerjs';
import type { VotingSession } from '../types';

let adminPeer: Peer | null = null;
let voterPeer: Peer | null = null;
let activeVoterConn: DataConnection | null = null;
const adminConnections = new Set<DataConnection>();

/**
 * Inicia o host P2P no painel de Administração / Telão.
 * Ele escuta conexões diretas via WebRTC de celulares e outras abas.
 * Isso permite votação em tempo real mesmo se o Firestore estiver com cota esgotada (50k).
 */
export function startAdminPeerHost(
  sessionId: string,
  onVoteReceived: (ballot: { selectedOptionIds: string[]; round: 'MAIN' | 'TIE_BREAK'; voterId: string }) => boolean,
  getCurrentSession: () => VotingSession
): () => void {
  const hostId = `vota-iasd-host-${sessionId}`;

  try {
    if (adminPeer && !adminPeer.destroyed) {
      adminPeer.destroy();
    }

    adminPeer = new Peer(hostId, {
      debug: 1,
    });

    adminPeer.on('open', (id) => {
      console.log('📡 Host P2P WebRTC ativo com ID:', id);
    });

    adminPeer.on('connection', (conn) => {
      adminConnections.add(conn);

      conn.on('data', (data: any) => {
        if (!data || typeof data !== 'object') return;

        if (data.type === 'SUBMIT_VOTE') {
          const success = onVoteReceived(data);
          conn.send({
            type: 'VOTE_ACK',
            success,
            message: success ? 'Voto computado com sucesso via P2P!' : 'Não foi possível computar voto.',
            iteration: data.iteration,
          });

          // Transmite a sessão atualizada para todos os peers conectados
          broadcastSessionP2P(getCurrentSession());
        } else if (data.type === 'REQUEST_SESSION') {
          conn.send({
            type: 'SESSION_UPDATE',
            session: getCurrentSession(),
          });
        }
      });

      conn.on('close', () => {
        adminConnections.delete(conn);
      });

      conn.on('error', () => {
        adminConnections.delete(conn);
      });
    });

    adminPeer.on('error', (err) => {
      // ID já em uso se outra aba de admin já abriu como host no mesmo PC
      if (err.type === 'unavailable-id') {
        console.log('ℹ️ Outra aba já está atuando como Host P2P principal.');
      } else {
        console.warn('⚠️ Erro no Host P2P:', err);
      }
    });
  } catch (e) {
    console.warn('Não foi possível iniciar Host P2P:', e);
  }

  return () => {
    adminConnections.clear();
    if (adminPeer && !adminPeer.destroyed) {
      adminPeer.destroy();
      adminPeer = null;
    }
  };
}

/**
 * Transmite a sessão atualizada via WebRTC para todos os celulares conectados ao Host P2P.
 */
export function broadcastSessionP2P(session: VotingSession) {
  if (adminConnections.size === 0) return;
  const payload = { type: 'SESSION_UPDATE', session };
  adminConnections.forEach((conn) => {
    if (conn.open) {
      try {
        conn.send(payload);
      } catch (_) {}
    }
  });
}

/**
 * Conecta o eleitor (celular / aba) ao Host P2P do Admin.
 */
export function connectVoterToHost(
  sessionId: string,
  onSessionUpdate?: (session: VotingSession) => void
): () => void {
  const hostId = `vota-iasd-host-${sessionId}`;

  try {
    if (voterPeer && !voterPeer.destroyed) {
      voterPeer.destroy();
    }

    voterPeer = new Peer({ debug: 1 });

    voterPeer.on('open', () => {
      const conn = voterPeer!.connect(hostId, { reliable: true });
      activeVoterConn = conn;

      conn.on('open', () => {
        console.log('🔗 Conectado diretamente ao Admin via P2P WebRTC!');
        conn.send({ type: 'REQUEST_SESSION' });
      });

      conn.on('data', (data: any) => {
        if (data && data.type === 'SESSION_UPDATE' && data.session && onSessionUpdate) {
          onSessionUpdate(data.session);
        }
      });

      conn.on('close', () => {
        if (activeVoterConn === conn) activeVoterConn = null;
      });
    });

    voterPeer.on('error', (err) => {
      console.warn('Aviso P2P Eleitor:', err);
    });
  } catch (e) {
    console.warn('Erro ao conectar P2P Eleitor:', e);
  }

  return () => {
    if (activeVoterConn) {
      activeVoterConn.close();
      activeVoterConn = null;
    }
    if (voterPeer && !voterPeer.destroyed) {
      voterPeer.destroy();
      voterPeer = null;
    }
  };
}

/**
 * Envia uma cédula de voto diretamente ao Admin via P2P WebRTC
 * Retorna true se foi aceito pelo Admin, false caso contrário.
 */
export function sendBallotViaP2P(
  selectedOptionIds: string[],
  round: 'MAIN' | 'TIE_BREAK',
  iteration: number,
  voterId: string
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!activeVoterConn || !activeVoterConn.open) {
      resolve(false);
      return;
    }

    const timer = setTimeout(() => {
      resolve(false);
    }, 4000);

    const onDataHandler = (data: any) => {
      if (data && data.type === 'VOTE_ACK' && data.iteration === iteration) {
        clearTimeout(timer);
        activeVoterConn?.off('data', onDataHandler);
        resolve(Boolean(data.success));
      }
    };

    activeVoterConn.on('data', onDataHandler);

    try {
      activeVoterConn.send({
        type: 'SUBMIT_VOTE',
        selectedOptionIds,
        round,
        iteration,
        voterId,
      });
    } catch (_) {
      clearTimeout(timer);
      resolve(false);
    }
  });
}
