export interface VotingOption {
  id: string;
  name: string;
  subtitle?: string;
  photoUrl?: string;
  votesCount: number;
}

export type SessionStatus = 'WAITING' | 'VOTING' | 'CLOSED' | 'TIE_BREAK';

export interface VotingSession {
  id: string;
  title: string;
  category?: string; // Ex: "Anciãos", "Diáconos", "Ministério Jovem"
  pin: string; // 4-digit safety code
  status: SessionStatus;
  maxVotesPerVoter: number;
  vacancies: number; // Quantidade de vagas principais
  suplentesCount: number; // Quantidade de suplentes
  showResultsLive: boolean; // Mostrar corrida ao vivo no telão ou ocultar até o fim
  options: VotingOption[];
  // Dados da rodada de desempate (se houver)
  tieBreak?: {
    active: boolean;
    title: string;
    vacancies: number;
    maxVotesPerVoter: number;
    options: VotingOption[];
  };
  totalVotersConnected?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface VoterBallot {
  voterId: string;
  sessionId: string;
  selectedOptionIds: string[];
  timestamp: number;
  round: 'MAIN' | 'TIE_BREAK';
}
