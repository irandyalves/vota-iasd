import type { VotingSession, VotingOption } from '../types';

export interface TieInfo {
  type: 'TITULAR' | 'SUPLENTE_1' | 'SUPLENTE_2';
  label: string;
  votesCount: number;
  tiedCandidates: VotingOption[];
  vacanciesInDispute: number;
  priority: number; // Menor número = resolve primeiro
  startRank?: number;
  endRank?: number;
}

export function getEffectiveSuplentes(session: VotingSession) {
  const s1Enabled = session.habilitarSuplente1 !== false;
  const s2Enabled = s1Enabled && session.habilitarSuplente2 !== false;
  const s1Count = s1Enabled ? (session.suplentesCount || 0) : 0;
  const s2Count = s2Enabled ? (session.segundoSuplentesCount || 0) : 0;
  return { s1Enabled, s2Enabled, s1Count, s2Count };
}

/**
 * Ordena candidatos da eleição com regras consistentes e oficiais:
 * 1. Candidatos que declinaram convite vão para o final da lista (preservando ordem original).
 * 2. Votos gerais da eleição (decrescente). Não é alterado por desempates!
 * 3. Se empatados em votos gerais, posição de desempate já conquistada (tieBreakRank crescente: 4º antes de 5º).
 * 4. Vencedor direto de desempate (tieBreakDisputeWith preenchido).
 * 5. tieBreakVotes (se aplicável).
 * 6. Ordem alfabética A-Z (critério desempate padrão).
 */
export function compareCandidatesRanking(a: VotingOption, b: VotingOption): number {
  const aDeclined = a.acceptStatus === 'Declinou';
  const bDeclined = b.acceptStatus === 'Declinou';
  if (aDeclined && !bDeclined) return 1;
  if (!aDeclined && bDeclined) return -1;
  if (aDeclined && bDeclined) {
    const aOrig = a.declinedOriginalRank ?? 9999;
    const bOrig = b.declinedOriginalRank ?? 9999;
    if (aOrig !== bOrig) return aOrig - bOrig;
  }

  const diff = Math.floor(b.votesCount || 0) - Math.floor(a.votesCount || 0);
  if (diff !== 0) return diff;

  const rankA = a.tieBreakRank;
  const rankB = b.tieBreakRank;
  if (rankA !== undefined && rankB !== undefined && rankA !== rankB) {
    return rankA - rankB;
  }
  if (rankA !== undefined && rankB === undefined) return -1;
  if (rankA === undefined && rankB !== undefined) return 1;

  if (a.tieBreakDisputeWith && !b.tieBreakDisputeWith) return -1;
  if (!a.tieBreakDisputeWith && b.tieBreakDisputeWith) return 1;

  const tieDiff = Math.floor(b.tieBreakVotes || 0) - Math.floor(a.tieBreakVotes || 0);
  if (tieDiff !== 0) return tieDiff;

  return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Determina se dois candidatos com mesma pontuação ainda precisam de desempate.
 * Retorna false se o desempate entre eles já foi resolvido.
 */
export function areCandidatesTied(a: VotingOption, b: VotingOption): boolean {
  const votesA = Math.floor(a.votesCount || 0);
  const votesB = Math.floor(b.votesCount || 0);
  if (votesA <= 0 || votesB <= 0 || votesA !== votesB) {
    return false;
  }
  // Se ambos possuem ranks de desempate distintos e definidos, já desempataram entre si
  if (a.tieBreakRank !== undefined && b.tieBreakRank !== undefined && a.tieBreakRank !== b.tieBreakRank) {
    return false;
  }
  // Se um deles venceu o desempate citando o outro oponente
  if (a.tieBreakDisputeWith && a.tieBreakDisputeWith.toLowerCase().includes(b.name.toLowerCase())) {
    return false;
  }
  if (b.tieBreakDisputeWith && b.tieBreakDisputeWith.toLowerCase().includes(a.name.toLowerCase())) {
    return false;
  }
  // Se um tem tieBreakRank definido e o outro não tem, foram diferenciados
  if ((a.tieBreakRank !== undefined && b.tieBreakRank === undefined) || (a.tieBreakRank === undefined && b.tieBreakRank !== undefined)) {
    return false;
  }
  return true;
}

/**
 * Detecta todos os empates da eleição com rankeamento completo e priorização:
 * 1. Empate no corte entre Titulares e Suplentes (resolve PRIMEIRO quem entra como titular)
 * 2. Empate no corte de Suplentes e Demais
 * 3. Empates internos dentro dos Titulares (ex: 4º vs 5º lugar, 7º vs 8º lugar)
 * 4. Empates internos dentro dos Suplentes (ex: 1º vs 2º suplente)
 */
export function detectVotingTies(session: VotingSession): TieInfo[] {
  if (session.resolverEmpates === false) {
    return [];
  }

  // Candidatos que recusaram/declinaram vão para o fim da lista e não disputam desempates
  const activeOptions = [...session.options]
    .filter((o) => o.acceptStatus !== 'Declinou')
    .sort(compareCandidatesRanking);

  const V = session.vacancies || 1;
  const { s1Count, s2Count } = getEffectiveSuplentes(session);
  const totalSuplentes = s1Count + s2Count;
  const cutoffTitularIndex = V - 1; // Último titular
  const cutoffSuplenteIndex = V + totalSuplentes - 1; // Último suplente

  const ties: TieInfo[] = [];

  let i = 0;
  while (i < activeOptions.length) {
    const currentOpt = activeOptions[i];
    const votes = Math.floor(currentOpt.votesCount || 0);

    if (votes <= 0) {
      i++;
      continue;
    }

    const startIdx = i;

    // Encontra todos os empatados consecutivos que ainda não resolveram desempate entre si
    while (
      i + 1 < activeOptions.length &&
      areCandidatesTied(activeOptions[i], activeOptions[i + 1])
    ) {
      i++;
    }
    const endIdx = i;
    const groupCount = endIdx - startIdx + 1;

    // Se há 2 ou mais empatados com votos computados (> 0)
    if (groupCount > 1 && votes > 0) {
      const tiedCandidates = activeOptions.slice(startIdx, endIdx + 1);
      const startRank = startIdx + 1;
      const endRank = endIdx + 1;

      // 1. O bloco cruza a fronteira do corte de Titulares (ex: 8º e 9º/1º suplente)?
      // Esse empate tem PRIORIDADE MÁXIMA (resolve primeiro quem é titular!)
      const crossesTitularCutoff = startIdx <= cutoffTitularIndex && endIdx > cutoffTitularIndex;

      // 2. O bloco cruza a fronteira do corte de Suplentes?
      const crossesSuplenteCutoff =
        totalSuplentes > 0 &&
        startIdx <= cutoffSuplenteIndex &&
        endIdx > cutoffSuplenteIndex &&
        !crossesTitularCutoff;

      if (crossesTitularCutoff) {
        const vacanciesInDispute = Math.max(1, cutoffTitularIndex - startIdx + 1);
        ties.push({
          type: 'TITULAR',
          label: `Empate no Corte: Vaga de Titular (${startRank}º ao ${endRank}º)`,
          votesCount: votes,
          tiedCandidates,
          vacanciesInDispute,
          priority: 1, // Prioridade máxima
          startRank,
          endRank,
        });
      } else if (crossesSuplenteCutoff) {
        const vacanciesInDispute = Math.max(1, cutoffSuplenteIndex - startIdx + 1);
        ties.push({
          type: 'SUPLENTE_1',
          label: `Empate no Corte: Vaga de Suplente (${startRank}º ao ${endRank}º)`,
          votesCount: votes,
          tiedCandidates,
          vacanciesInDispute,
          priority: 2, // Segunda maior prioridade
          startRank,
          endRank,
        });
      } else if (endIdx < V) {
        // Empate INTERNO entre Titulares (ex: 4º e 5º lugar, ou 7º e 8º lugar)
        ties.push({
          type: 'TITULAR',
          label: `Desempate para ${startRank}º e ${endRank}º Lugar`,
          votesCount: votes,
          tiedCandidates,
          vacanciesInDispute: 1,
          priority: 10 + startRank, // Ranks menores (mais acima) vêm primeiro: 4º/5º antes de 7º/8º
          startRank,
          endRank,
        });
      } else if (startIdx >= V && endIdx < V + totalSuplentes) {
        // Empate INTERNO entre Suplentes (ex: ordem dos suplentes)
        ties.push({
          type: 'SUPLENTE_1',
          label: `Desempate para Posição de Suplente (${startRank}º e ${endRank}º)`,
          votesCount: votes,
          tiedCandidates,
          vacanciesInDispute: 1,
          priority: 50 + startRank,
          startRank,
          endRank,
        });
      }
    }

    i++;
  }

  // Ordena os empates estritamente por prioridade:
  // Corte de Titular (1) -> Corte de Suplente (2) -> Ranks de Titulares (14, 17...) -> Suplentes (59...)
  return ties.sort((a, b) => a.priority - b.priority);
}
