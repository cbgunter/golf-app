import type { CtpContest, RoundFormat, RoundTeam, StandingsMode } from '../../../shared/src/formats';
export type { CtpContest, RoundFormat, RoundTeam, StandingsMode };

export interface Player {
  id: string;
  name: string;
  email?: string;
  handicapIndex: number;
  handicapHistory: HandicapEntry[];
  /** GHIN number when linked to an official USGA handicap record. */
  ghinNumber?: string;
  /** Last official Handicap Index pulled from GHIN. */
  ghinHandicapIndex?: number;
  ghinSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Normalized GHIN golfer search result. */
export interface GhinGolfer {
  ghinNumber: string;
  firstName: string;
  lastName: string;
  /** Null when the golfer has no established index ("NH"). Plus handicaps are negative. */
  handicapIndex: number | null;
  handicapDisplay: string;
  clubName: string | null;
  state: string | null;
  status: string;
}

export interface HandicapEntry {
  date: string;
  handicapIndex: number;
  differential: number;
  roundId: string;
  courseRating: number;
  slopeRating: number;
  adjustedGrossScore: number;
  notes?: string;
}

export interface Course {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  holes: Hole[];
  tees: Tee[];
  savedAt: string;
}

export interface Tee {
  name: string;
  color?: string;
  courseRating: number;
  slopeRating: number;
  par: number;
  yardage?: number;
}

export interface Hole {
  number: number;
  par: number;
  handicap: number; // stroke index
  yardage?: number;
}

export type TournamentStatus = 'upcoming' | 'active' | 'completed' | 'archived';
export type TournamentFormat = 'stroke_play' | 'stableford' | 'match_play';

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  status: TournamentStatus;
  /** Legacy, no longer set or read — each Round has its own format. */
  format?: TournamentFormat;
  isNet: boolean;
  isGross: boolean;
  /** 'cumulative' (default): lowest total net/gross. 'points': cup points by per-round finish. */
  standingsMode?: StandingsMode;
  /** Cup points for 1st, 2nd, … in each round. Defaults to N…1. */
  pointsTable?: number[];
  hasClosestToPin: boolean;
  hasLongestDrive: boolean;
  closestToPinFee?: number;
  longestDriveFee?: number;
  entryFee: number;
  payoutStructure: PayoutEntry[];
  playerIds: string[];
  withdrawnPlayerIds?: string[];
  roundIds: string[];
  startDate: string;
  endDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutEntry {
  place: number;
  label: string;
  payoutType?: 'percentage' | 'flat';
  percentage: number;
  amount?: number;
}

export interface TeeTimeGroup {
  groupNumber: number;
  teeTime: string;
  playerIds: string[];
  startingHole?: number;
  pin?: string;
}

export interface DraftScorecard {
  id: string;            // `${roundId}#${groupNumber}`
  pin: string;
  roundId: string;
  tournamentId: string;
  groupNumber: number;
  status: 'draft' | 'submitted' | 'confirmed';
  // holes[playerId][holeNumber] = strokes
  holes: Record<string, Record<string, number>>;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Round {
  id: string;
  tournamentId: string;
  courseId: string;
  courseName: string;
  tee: string;
  courseRating: number;
  slopeRating: number;
  par: number;
  date: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  /** CTP contests (hole + winner). Supersedes the legacy single-hole fields below. */
  closestToPinContests?: CtpContest[];
  /** @deprecated legacy single CTP hole — read via ctpContests(). */
  closestToPinHole?: number;
  /** @deprecated legacy single CTP winner — read via ctpContests(). */
  closestToPinWinnerId?: string;
  longestDriveHole?: number;
  longestDriveWinnerId?: string;
  holes?: Hole[];
  startFormat?: 'sequential' | 'shotgun';
  teeTimeGroups?: TeeTimeGroup[];
  isPracticeRound?: boolean;
  /** Scoring format for this round (defaults to stroke play). */
  format?: RoundFormat;
  /** Teams for best-ball rounds. */
  teams?: RoundTeam[];
  /** Multiplies cup points earned in this round (e.g. 2 for a championship round). */
  pointsMultiplier?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Score {
  id: string;
  roundId: string;
  tournamentId: string;
  playerId: string;
  playerName: string;
  holeScores: HoleScore[];
  grossTotal: number;
  netTotal: number;
  courseHandicap: number;
  handicapDifferential?: number;
  adjustments: ScoreAdjustment[];
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HoleScore {
  hole: number;
  par: number;
  handicap: number; // stroke index
  strokes: number;
  netStrokes: number;
  receivesStroke: boolean;
  /** Handicap strokes received on this hole (2+ for course handicaps over 18; negative for plus handicaps). */
  strokesReceived?: number;
  adjustedScore?: number; // ESC adjusted
}

export interface ScoreAdjustment {
  type: 'ESC' | 'handicap_stroke' | 'manual';
  hole?: number;
  originalValue: number;
  adjustedValue: number;
  reason: string;
}

export interface TournamentResults {
  tournament: Tournament;
  rounds: Round[];
  leaderboard: LeaderboardEntry[];
  closestToPin?: CtpResult[];
  longestDrive?: LdResult[];
  payouts: PayoutResult[];
  totalPot: number;
  ctpPot: number;
  ldPot: number;
}

export interface LeaderboardEntry {
  rank: number;
  player: Player;
  scores: Score[];
  totalGross: number;
  totalNet: number;
  roundDifferentials: number[];
  /** Present when tournament.standingsMode === 'points'. */
  cupPoints?: number;
  pointsByRound?: Record<string, number | undefined>;
  payout?: number;
}

export interface CtpResult {
  hole: number;
  roundId: string;
  player?: Player;
  /** This contest's share of the CTP pot (pot split evenly across all CTP holes). */
  amount?: number;
}

export interface LdResult {
  hole: number;
  roundId: string;
  player?: Player;
}

export interface PayoutResult {
  place: number;
  label: string;
  player?: Player;
  amount: number;
  percentage: number;
}
