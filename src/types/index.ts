export interface VotingOption {
  id: string;
  name: string;
  subtitle?: string;
  photoUrl?: string;
  votesCount: number;
  createdAt?: number;
  tieBreakVotes?: number;
  tieBreakDisputeWith?: string;
}

export type SessionStatus = 'WAITING' | 'VOTING' | 'CLOSED' | 'TIE_BREAK';

export interface TelaoLayoutConfig {
  columns?: 1 | 2; // 1 coluna ou 2 colunas (padrão: 2)
  qrPosition?: 'top' | 'middle' | 'bottom'; // Posição vertical do QR Code no Telão (padrão: 'middle')
  qrSize?: number; // Escala/tamanho do QR Code em % (padrão: 100, de 50 a 150)
  cardHeight?: number; // Altura mínima do card em px (padrão: 38)
  cardGap?: number; // Legado
  cardGapV2?: number; // Espaçamento entre os cards em px (padrão: 0, encostados)
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
  totalVotersConnected?: number;
  rulesConfigured?: boolean;
  labelTitulares?: string;
  labelSuplente1?: string;
  labelSuplente2?: string;
  // Estado completo preservado por votação/evento:
  status?: SessionStatus;
  tieBreak?: {
    active: boolean;
    resolved?: boolean;
    title: string;
    vacancies: number;
    maxVotesPerVoter: number;
    options: VotingOption[];
  } | null;
  mainVotersCount?: number;
  tieBreakVotersCount?: number;
  votingIteration?: number;
  telaoMode?: 'names' | 'voting';
}

export interface GeneralEventRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  events?: VotingEventItem[];
  activeEventId?: string;
  title?: string;
  options?: VotingOption[];
  history?: VotingHistoryRecord[];
  vacancies?: number;
  maxVotesPerVoter?: number;
  suplentesCount?: number;
  segundoSuplentesCount?: number;
  habilitarSuplente1?: boolean;
  habilitarSuplente2?: boolean;
  resolverEmpates?: boolean;
  rulesConfigured?: boolean;
  labelTitulares?: string;
  labelSuplente1?: string;
  labelSuplente2?: string;
  status?: SessionStatus;
  tieBreak?: {
    active: boolean;
    resolved?: boolean;
    title: string;
    vacancies: number;
    maxVotesPerVoter: number;
    options: VotingOption[];
  } | null;
  mainVotersCount?: number;
  tieBreakVotersCount?: number;
  votingIteration?: number;
  telaoMode?: 'names' | 'voting';
}

export interface VotingSession {
  id: string;
  title: string;
  generalEventName?: string; // Nome do Evento Geral / Assembleia (Ex: "Comissão da Igreja Adventista da Asa Norte")
  generalEvents?: GeneralEventRecord[]; // Lista de todos os Eventos Gerais salvos online no banco
  activeGeneralEventId?: string; // ID do Evento Geral atualmente ativo
  labelTitulares?: string; // Rótulo customizado para Titulares (padrão: "Titulares")
  labelSuplente1?: string; // Rótulo customizado para 1º Suplente (padrão: "1º suplente")
  labelSuplente2?: string; // Rótulo customizado para 2º Suplente (padrão: "2º suplente")
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
  showLiveResultsOnMobile?: boolean; // Controlar se os votantes podem ver resultados em tempo real no celular (Privilégio do Admin)
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
    resolved?: boolean;
    title: string;
    vacancies: number;
    maxVotesPerVoter: number;
    options: VotingOption[];
  } | null;
  totalVotersConnected?: number;
  resolverEmpates?: boolean;
  mainVotersCount?: number;
  tieBreakVotersCount?: number;
  accessLocked?: boolean;
  allowedVoterIds?: string[];
  history?: VotingHistoryRecord[];
  rulesConfigured?: boolean; // Se as regras da eleição foram salvas para a votação ativa
  createdAt?: number;
  updatedAt?: number;
}

export interface HistoryCandidateResult {
  id: string;
  name: string;
  votesCount: number;
  percentage: number;
  photoUrl?: string;
  tieBreakDisputeWith?: string;
}

export interface VotingHistoryRecord {
  id: string;
  timestamp: number;
  dateFormatted: string; // Ex: "dia 22/10/2026"
  timeFormatted: string; // Ex: "01:15"
  headerTitle: string; // Ex: "dia 22/10/2026 ELEIÇÃO MULHERES"
  sessionTitle: string; // Ex: "MULHERES"
  category?: string;
  totalVotes: number;
  totalVoters: number;
  vacancies: number;
  suplentesCount?: number;
  segundoSuplentesCount?: number;
  eleitos: HistoryCandidateResult[];
  suplentes: HistoryCandidateResult[];
  segundoSuplentes?: HistoryCandidateResult[];
  naoClassificados: HistoryCandidateResult[];
}

export interface VoterBallot {
  voterId: string;
  sessionId: string;
  selectedOptionIds: string[];
  timestamp: number;
  round: 'MAIN' | 'TIE_BREAK';
}
