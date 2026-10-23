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
  const options = [...session.options].sort((a, b) => {
    const diff = Math.floor(b.votesCount || 0) - Math.floor(a.votesCount || 0);
    if (diff !== 0) return diff;
    const tieDiff = Math.floor(b.tieBreakVotes || 0) - Math.floor(a.tieBreakVotes || 0);
    if (tieDiff !== 0) return tieDiff;
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });

  const V = session.vacancies || 1;
  const { s1Count, s2Count } = getEffectiveSuplentes(session);

  // 1. Empate na fronteira de Titulares
  if (options.length > V && V > 0) {
    const lastTitular = options[V - 1];
    const firstNonTitular = options[V];
    const cutoffVotes = Math.floor(lastTitular?.votesCount || 0);
    const firstNonTitularVotes = Math.floor(firstNonTitular?.votesCount || 0);

    const isTieResolvedByTieBreak =
      (lastTitular?.tieBreakVotes !== undefined || firstNonTitular?.tieBreakVotes !== undefined) &&
      Math.floor(lastTitular?.tieBreakVotes || 0) !== Math.floor(firstNonTitular?.tieBreakVotes || 0);

    if (cutoffVotes > 0 && cutoffVotes === firstNonTitularVotes && !isTieResolvedByTieBreak) {
      const candidatesWithHigherVotes = options.filter((o) => Math.floor(o.votesCount || 0) > cutoffVotes);
      const tiedCandidates = options.filter(
        (o) =>
          Math.floor(o.votesCount || 0) === cutoffVotes &&
          (o.tieBreakVotes === undefined || o.tieBreakVotes === lastTitular.tieBreakVotes)
      );
      const vacanciesInDispute = Math.max(1, V - candidatesWithHigherVotes.length);

      ties.push({
        type: 'TITULAR',
        label: 'Empate para Vaga de Titular',
        votesCount: cutoffVotes,
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
    const cutoffVotes = Math.floor(lastS1?.votesCount || 0);
    const firstNonS1Votes = Math.floor(firstNonS1?.votesCount || 0);

    const isTieResolvedByTieBreak =
      (lastS1?.tieBreakVotes !== undefined || firstNonS1?.tieBreakVotes !== undefined) &&
      Math.floor(lastS1?.tieBreakVotes || 0) !== Math.floor(firstNonS1?.tieBreakVotes || 0);

    const titularTie = ties.find((t) => t.type === 'TITULAR');
    if (
      cutoffVotes > 0 &&
      cutoffVotes === firstNonS1Votes &&
      !isTieResolvedByTieBreak &&
      (!titularTie || titularTie.votesCount !== cutoffVotes)
    ) {
      const candidatesWithHigherVotes = options.filter((o) => Math.floor(o.votesCount || 0) > cutoffVotes);
      const tiedCandidates = options.filter(
        (o) =>
          Math.floor(o.votesCount || 0) === cutoffVotes &&
          (o.tieBreakVotes === undefined || o.tieBreakVotes === lastS1.tieBreakVotes)
      );
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
    const cutoffVotes = Math.floor(lastS2?.votesCount || 0);
    const firstNonS2Votes = Math.floor(firstNonS2?.votesCount || 0);

    const isTieResolvedByTieBreak =
      (lastS2?.tieBreakVotes !== undefined || firstNonS2?.tieBreakVotes !== undefined) &&
      Math.floor(lastS2?.tieBreakVotes || 0) !== Math.floor(firstNonS2?.tieBreakVotes || 0);

    const priorTie = ties.find((t) => t.votesCount === cutoffVotes);
    if (cutoffVotes > 0 && cutoffVotes === firstNonS2Votes && !isTieResolvedByTieBreak && !priorTie) {
      const candidatesWithHigherVotes = options.filter((o) => Math.floor(o.votesCount || 0) > cutoffVotes);
      const tiedCandidates = options.filter(
        (o) =>
          Math.floor(o.votesCount || 0) === cutoffVotes &&
          (o.tieBreakVotes === undefined || o.tieBreakVotes === lastS2.tieBreakVotes)
      );
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
