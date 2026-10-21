export interface VotingOption {
  id: string;
  name: string;
  subtitle?: string;
  photoUrl?: string;
  votesCount: number;
  createdAt?: number;
}

export type SessionStatus = 'WAITING' | 'VOTING' | 'CLOSED' | 'TIE_BREAK';

export interface TelaoLayoutConfig {
  columns?: 1 | 2; // 1 coluna ou 2 colunas (padrão: 2)
  qrPosition?: 'top' | 'middle' | 'bottom'; // Posição vertical do QR Code no Telão (padrão: 'middle')
  qrSize?: number; // Escala/tamanho do QR Code em % (padrão: 100, de 50 a 150)
  cardHeight?: number; // Altura mínima do card em px (padrão: 38)
  cardGap?: number; // Legado
  cardGapV2?: number; // Espaçamento entre os cards em px reduzido em 80% (padrão: 2)
  winnerColor?: string; // Cor dos cards Vencedores/Titulares (padrão: '#10b981')
  suplenteColor?: string; // Cor dos cards 1º Suplentes (padrão: '#3b82f6')
  suplente2Color?: string; // Cor dos cards 2º Suplentes (padrão: '#64748b')
  unclassifiedColor?: string; // Cor dos cards Não Classificados (padrão: '#1e293b')
}

export interface VotingEventItem {
  id: string;
  name: string; // Ex: "Escolha do Tesoureiro"
  options: VotingOption[];
  vacancies: number;
  maxVotesPerVoter: number;
  suplentesCount: number;
  segundoSuplentesCount?: number;
  habilitarSuplente1?: boolean;
  habilitarSuplente2?: boolean;
  resolverEmpates?: boolean;
}

export interface VotingSession {
  id: string;
  title: string;
  category?: string; // Ex: "Anciãos", "Diáconos", "Ministério Jovem"
  pin: string; // 4-digit safety code
  status: SessionStatus;
  maxVotesPerVoter: number;
  vacancies: number; // Quantidade de vagas principais
  suplentesCount: number; // Quantidade de 1º suplentes
  segundoSuplentesCount?: number; // Quantidade de 2º suplentes
  habilitarSuplente1?: boolean; // Habilitar/Desabilitar 1º Suplente
  habilitarSuplente2?: boolean; // Habilitar/Desabilitar 2º Suplente
  votingIteration?: number; // Contador incremental de versão da votação (invalida cache dos celulares em nova votação)
  showResultsLive: boolean; // Mostrar corrida ao vivo no telão ou ocultar até o fim
  showQrOnTelao?: boolean; // Controlar exibição do QR Code no Telão
  telaoMode?: 'names' | 'voting'; // Modo de exibição no Telão: 'names' (Nomes para escolha - Print 2) ou 'voting' (Apuração / Tempo real)
  telaoLayout?: TelaoLayoutConfig; // Personalização de layout, altura, espaçamento, colunas e cores dos cards no Telão
  events?: VotingEventItem[]; // Lista de eventos criados (ex: "Escolha do Tesoureiro", "Diáconos", etc.)
  activeEventId?: string; // ID do evento atualmente selecionado
  logoUrl?: string; // Logo customizado da IASD ou do evento
  publicTitle?: string; // Título exibido no Telão (Ex: "VOTAÇÃO ESCOLHA DIÁCONOS")
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
  resolverEmpates?: boolean;
  mainVotersCount?: number;
  tieBreakVotersCount?: number;
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
