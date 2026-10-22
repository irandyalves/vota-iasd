export interface GlobalElectionRules {
  totalVotersConnected: number;
  vacancies: number;
  maxVotesPerVoter: number;
  habilitarSuplente1: boolean;
  suplentesCount: number;
  habilitarSuplente2: boolean;
  segundoSuplentesCount: number;
  resolverEmpates: boolean;
  labelTitulares?: string;
  labelSuplente1?: string;
  labelSuplente2?: string;
}

export const GLOBAL_RULES_KEY = 'vota_iasd_global_rules';

export const DEFAULT_GLOBAL_RULES: GlobalElectionRules = {
  totalVotersConnected: 1,
  vacancies: 1,
  maxVotesPerVoter: 1,
  habilitarSuplente1: true,
  suplentesCount: 1,
  habilitarSuplente2: false,
  segundoSuplentesCount: 1,
  resolverEmpates: true,
  labelTitulares: 'Titulares',
  labelSuplente1: '1º suplente',
  labelSuplente2: '2º suplente',
};

/**
 * Lê as regras globais da eleição salvas localmente no computador do administrador.
 */
export function getGlobalElectionRules(): GlobalElectionRules {
  if (typeof window === 'undefined') return DEFAULT_GLOBAL_RULES;
  try {
    const raw = localStorage.getItem(GLOBAL_RULES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Garante titular 1 por padrão se herdou o antigo 6 padrão
      const vacancies = parsed.vacancies === 6 ? 1 : (parsed.vacancies ?? 1);
      const maxVotes = parsed.maxVotesPerVoter === 6 ? 1 : (parsed.maxVotesPerVoter ?? vacancies);
      return {
        ...DEFAULT_GLOBAL_RULES,
        ...parsed,
        vacancies,
        maxVotesPerVoter: maxVotes,
      };
    }
  } catch (e) {
    console.error('Erro ao ler regras globais do localStorage:', e);
  }
  return DEFAULT_GLOBAL_RULES;
}

/**
 * Salva as regras da eleição como padrão GLOBAL localmente no PC (localStorage).
 * Novas votações e qualquer reinício herdam estes valores automaticamente.
 */
export function saveGlobalElectionRules(patch: Partial<GlobalElectionRules>): GlobalElectionRules {
  const current = getGlobalElectionRules();
  const updated: GlobalElectionRules = {
    ...current,
    ...patch,
  };
  if (patch.vacancies !== undefined && patch.maxVotesPerVoter === undefined) {
    updated.maxVotesPerVoter = patch.vacancies;
  }
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(GLOBAL_RULES_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('vota_iasd_global_rules_updated', { detail: updated }));
    }
  } catch (e) {
    console.error('Erro ao salvar regras globais no localStorage:', e);
  }
  return updated;
}
