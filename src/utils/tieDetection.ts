import type { VotingSession, VotingOption } from '../types';

export interface TieInfo {
  type: 'TITULAR' | 'SUPLENTE_1' | 'SUPLENTE_2';
  label: string;
  votesCount: number;
  tiedCandidates: VotingOption[];
  vacanciesInDispute: number;
}

export function getEffectiveSuplentes(session: VotingSession) {
  const s1Enabled = session.habilitarSuplente1 !== false;
  const s2Enabled = s1Enabled && session.habilitarSuplente2 !== false;
  const s1Count = s1Enabled ? (session.suplentesCount || 0) : 0;
  const s2Count = s2Enabled ? (session.segundoSuplentesCount || 0) : 0;
  return { s1Enabled, s2Enabled, s1Count, s2Count };
}

/**
 * Detecta empates que impedem a definição clara de Titulares, 1º Suplentes ou 2º Suplentes.
 * Um empate só é relevante quando ocorre no limiar (fronteira) entre eleito e não-eleito.
 */
export function detectVotingTies(session: VotingSession): TieInfo[] {
  if (session.resolverEmpates === false) {
    return [];
  }
  const ties: TieInfo[] = [];
  const options = [...session.options].sort((a, b) => (b.votesCount || 0) - (a.votesCount || 0));

  const V = session.vacancies || 1;
  const { s1Count, s2Count } = getEffectiveSuplentes(session);

  // 1. Empate na fronteira de Titulares
  if (options.length > V && V > 0) {
    const lastTitular = options[V - 1];
    const firstNonTitular = options[V];
    const cutoffVotes = lastTitular?.votesCount || 0;

    if (cutoffVotes > 0 && cutoffVotes === (firstNonTitular?.votesCount || 0)) {
      const candidatesWithHigherVotes = options.filter((o) => (o.votesCount || 0) > cutoffVotes);
      const tiedCandidates = options.filter((o) => (o.votesCount || 0) === cutoffVotes);
      const vacanciesInDispute = Math.max(1, V - candidatesWithHigherVotes.length);

      ties.push({
        type: 'TITULAR',
        label: 'Empate para Vaga de Titular',
        votesCount: Math.floor(cutoffVotes),
        tiedCandidates,
        vacanciesInDispute,
      });
    }
  }

  // 2. Empate na fronteira de 1º Suplente
  const boundaryS1 = V + s1Count;
  if (s1Count > 0 && options.length > boundaryS1) {
    const lastS1 = options[boundaryS1 - 1];
    const firstNonS1 = options[boundaryS1];
    const cutoffVotes = lastS1?.votesCount || 0;

    const titularTie = ties.find((t) => t.type === 'TITULAR');
    if (
      cutoffVotes > 0 &&
      cutoffVotes === (firstNonS1?.votesCount || 0) &&
      (!titularTie || titularTie.votesCount !== cutoffVotes)
    ) {
      const candidatesWithHigherVotes = options.filter((o) => (o.votesCount || 0) > cutoffVotes);
      const tiedCandidates = options.filter((o) => (o.votesCount || 0) === cutoffVotes);
      const vacanciesInDispute = Math.max(1, boundaryS1 - candidatesWithHigherVotes.length);

      ties.push({
        type: 'SUPLENTE_1',
        label: 'Empate para 1º Suplente',
        votesCount: cutoffVotes,
        tiedCandidates,
        vacanciesInDispute,
      });
    }
  }

  // 3. Empate na fronteira de 2º Suplente
  const boundaryS2 = V + s1Count + s2Count;
  if (s2Count > 0 && options.length > boundaryS2) {
    const lastS2 = options[boundaryS2 - 1];
    const firstNonS2 = options[boundaryS2];
    const cutoffVotes = lastS2?.votesCount || 0;

    const priorTie = ties.find((t) => t.votesCount === cutoffVotes);
    if (cutoffVotes > 0 && cutoffVotes === (firstNonS2?.votesCount || 0) && !priorTie) {
      const candidatesWithHigherVotes = options.filter((o) => (o.votesCount || 0) > cutoffVotes);
      const tiedCandidates = options.filter((o) => (o.votesCount || 0) === cutoffVotes);
      const vacanciesInDispute = Math.max(1, boundaryS2 - candidatesWithHigherVotes.length);

      ties.push({
        type: 'SUPLENTE_2',
        label: 'Empate para 2º Suplente',
        votesCount: cutoffVotes,
        tiedCandidates,
        vacanciesInDispute,
      });
    }
  }

  return ties;
}
