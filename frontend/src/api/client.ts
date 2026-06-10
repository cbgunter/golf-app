const BASE = '/api';

function getToken() {
  return localStorage.getItem('golf_admin_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (res.status === 401) {
    localStorage.removeItem('golf_admin_token');
    window.location.href = '/admin/login';
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// Auth
export const authApi = {
  login: (password: string) => api.post<{ token: string }>('/auth/login', { password }),
  verify: () => api.get<{ valid: boolean }>('/auth/verify'),
};

// Players
export const playersApi = {
  list: () => api.get<Player[]>('/players'),
  get: (id: string) => api.get<Player>(`/players/${id}`),
  profile: (id: string) => api.get<PlayerProfile>(`/players/${id}/profile`),
  create: (data: Partial<Player>) => api.post<Player>('/players', data),
  update: (id: string, data: Partial<Player>) => api.put<Player>(`/players/${id}`, data),
  delete: (id: string) => api.delete(`/players/${id}`),
};

// Tournaments
export const tournamentsApi = {
  list: (status?: string) => api.get<Tournament[]>(`/tournaments${status ? `?status=${status}` : ''}`),
  get: (id: string) => api.get<Tournament>(`/tournaments/${id}`),
  create: (data: Partial<Tournament>) => api.post<Tournament>('/tournaments', data),
  update: (id: string, data: Partial<Tournament>) => api.put<Tournament>(`/tournaments/${id}`, data),
  delete: (id: string) => api.delete(`/tournaments/${id}`),
  results: (id: string) => api.get<TournamentResults>(`/tournaments/${id}/results`),
  rounds: (id: string) => api.get<Round[]>(`/tournaments/${id}/rounds`),
};

// Rounds
export const roundsApi = {
  get: (id: string) => api.get<Round>(`/rounds/${id}`),
  create: (tournamentId: string, data: Partial<Round>) =>
    api.post<Round>(`/tournaments/${tournamentId}/rounds`, data),
  update: (id: string, data: Partial<Round>) => api.put<Round>(`/rounds/${id}`, data),
  delete: (id: string) => api.delete(`/rounds/${id}`),
  complete: (id: string) => api.post(`/rounds/${id}/complete`),
  reopen: (id: string) => api.post(`/rounds/${id}/reopen`),
  scores: (id: string) => api.get<Score[]>(`/rounds/${id}/scores`),
  submitScore: (roundId: string, data: unknown) => api.post(`/rounds/${roundId}/scores`, data),
};

// Scores
export const scoresApi = {
  get: (id: string) => api.get<Score>(`/scores/${id}`),
  update: (id: string, data: unknown) => api.put(`/scores/${id}`, data),
};

// Courses
export const coursesApi = {
  list: () => api.get<Course[]>('/courses'),
  get: (id: string) => api.get<Course>(`/courses/${id}`),
  search: (q: string) => api.get<any>(`/courses/search?q=${encodeURIComponent(q)}`),
  getFromApi: (apiId: string) => api.get<any>(`/courses/api/${apiId}`),
  save: (data: Partial<Course>) => api.post<Course>('/courses', data),
};

// Scoring (PIN-based group entry)
export const scoringApi = {
  activeRounds: (tournamentId?: string) => api.get<ActiveRoundsForScoring[]>(tournamentId ? `/score/rounds?tournamentId=${tournamentId}` : '/score/rounds'),
  lookupByPin: (pin: string) => api.get<PinLookupResult>(`/score/lookup?pin=${encodeURIComponent(pin)}`),
  saveDraftHole: (pin: string, holeNumber: number, scores: Record<string, number>) =>
    api.put<DraftScorecard>('/score/draft', { pin, holeNumber, scores }),
  submitDraft: (pin: string) => api.post<DraftScorecard>('/score/submit', { pin }),
  getDrafts: (roundId: string) => api.get<DraftScorecard[]>(`/rounds/${roundId}/drafts`),
  confirmDraft: (roundId: string, groupNumber: number, body?: { overrides?: Record<string, Record<string, number>>; manualHandicaps?: Record<string, number> }) =>
    api.post(`/rounds/${roundId}/drafts/${groupNumber}/confirm`, body ?? {}),
};

// Re-export types for convenience
export type { Player, Tournament, Round, Score, Course, TournamentResults, PlayerProfile };

interface PlayerRoundScore {
  scoreId: string;
  roundId: string;
  tournamentId: string;
  tournamentName: string;
  courseName: string;
  date: string;
  par: number;
  grossTotal: number;
  netTotal: number;
  courseHandicap: number;
  handicapDifferential: number;
}

interface PlayerProfile {
  player: Player;
  roundScores: PlayerRoundScore[];
}

// Local type definitions mirroring the backend
interface Player {
  id: string;
  name: string;
  email?: string;
  handicapIndex: number;
  handicapHistory: HandicapEntry[];
  createdAt: string;
  updatedAt: string;
}

interface HandicapEntry {
  date: string;
  handicapIndex: number;
  differential: number;
  roundId: string;
  courseRating: number;
  slopeRating: number;
  adjustedGrossScore: number;
  notes?: string;
}

interface Tournament {
  id: string;
  name: string;
  description?: string;
  status: 'upcoming' | 'active' | 'completed' | 'archived';
  format: 'stroke_play' | 'stableford' | 'match_play';
  isNet: boolean;
  isGross: boolean;
  hasClosestToPin: boolean;
  hasLongestDrive: boolean;
  closestToPinFee?: number;
  longestDriveFee?: number;
  entryFee: number;
  payoutStructure: { place: number; label: string; payoutType?: 'percentage' | 'flat'; percentage: number; amount?: number }[];
  playerIds: string[];
  withdrawnPlayerIds?: string[];
  roundIds: string[];
  startDate: string;
  endDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface Round {
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
  closestToPinHole?: number;
  closestToPinWinnerId?: string;
  longestDriveHole?: number;
  longestDriveWinnerId?: string;
  holes?: { number: number; par: number; handicap: number; yardage?: number }[];
  startFormat?: 'sequential' | 'shotgun';
  teeTimeGroups?: { groupNumber: number; teeTime: string; playerIds: string[]; startingHole?: number; pin?: string }[];
  isPracticeRound?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface HoleScore {
  hole: number;
  par: number;
  handicap: number;
  strokes: number;
  netStrokes: number;
  receivesStroke: boolean;
}

interface ScoreAdjustment {
  type: string;
  hole?: number;
  originalValue: number;
  adjustedValue: number;
  reason: string;
}

interface Score {
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

interface Course {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  holes: { number: number; par: number; handicap: number; yardage?: number }[];
  tees: { name: string; color?: string; courseRating: number; slopeRating: number; par: number; yardage?: number }[];
  savedAt: string;
}

interface TournamentResults {
  tournament: Tournament;
  rounds: Round[];
  leaderboard: LeaderboardEntry[];
  closestToPin?: { hole: number; roundId: string; player?: Player }[];
  longestDrive?: { hole: number; roundId: string; player?: Player }[];
  payouts: { place: number; label: string; amount: number; percentage: number; payoutType?: 'percentage' | 'flat'; player?: Player }[];
  totalPot: number;
  ctpPot: number;
  ldPot: number;
}

interface LeaderboardEntry {
  rank: number;
  player: Player;
  scores: Score[];
  totalGross: number;
  totalNet: number;
  roundDifferentials: number[];
  payout?: number;
}

export interface DraftScorecard {
  id: string;
  pin: string;
  roundId: string;
  tournamentId: string;
  groupNumber: number;
  status: 'draft' | 'submitted' | 'confirmed';
  holes: Record<string, Record<string, number>>; // holes[playerId][holeNum] = strokes
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PinLookupResult {
  pin: string;
  roundId: string;
  tournamentId: string;
  tournamentName: string;
  courseName: string;
  date: string;
  par: number;
  tee: string;
  courseRating: number;
  slopeRating: number;
  holes: { number: number; par: number; handicap: number; yardage?: number }[];
  groupNumber: number;
  teeTime: string;
  startingHole?: number;
  players: { id: string; name: string; handicapIndex: number }[];
  draft: DraftScorecard | null;
}

export interface ActiveRoundsForScoring {
  tournamentId: string;
  tournamentName: string;
  rounds: {
    roundId: string;
    courseName: string;
    date: string;
    status: string;
    groups: {
      groupNumber: number;
      teeTime: string;
      startingHole?: number;
      pin?: string;
      playerIds: string[];
    }[];
  }[];
}
