export interface GlobalElectionRules {
  totalVotersConnected: number;
  vacancies: number;
  maxVotesPerVoter: number;
  habilitarSuplente1: boolean;
  suplentesCount: number;
  habilitarSuplente2: boolean;
  segundoSuplentesCount: number;
  resolverEmpates: boolean;
}

export const GLOBAL_RULES_KEY = 'vota_iasd_global_rules';

export const DEFAULT_GLOBAL_RULES: GlobalElectionRules = {
  totalVotersConnected: 1,
  vacancies: 6,
  maxVotesPerVoter: 6,
  habilitarSuplente1: true,
  suplentesCount: 3,
  habilitarSuplente2: true,
  segundoSuplentesCount: 5,
  resolverEmpates: true,
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
      return {
        ...DEFAULT_GLOBAL_RULES,
        ...parsed,
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
