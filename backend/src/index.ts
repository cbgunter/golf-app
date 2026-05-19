import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { verifyToken, verifyAdminLogin } from './lib/auth';
import { ok, error, unauthorized } from './lib/response';

import { listPlayers, getPlayer, createPlayer, updatePlayer, deletePlayer, getPlayerProfile } from './handlers/players';
import { listTournaments, getTournament, createTournament, updateTournament, deleteTournament, getTournamentResults } from './handlers/tournaments';
import { listRoundsForTournament, getRound, createRound, updateRound, completeRound, reopenRound, deleteRound } from './handlers/rounds';
import { listScoresForRound, getScore, submitScore, updateScore } from './handlers/scores';
import { listCourses, getCourse, searchCourses, getCourseFromApi, saveCourse } from './handlers/courses';
import { getActiveRoundsForScoring, lookupByPin, saveDraftHole, submitDraft, getDraftsForRound, confirmDraft } from './handlers/scoring';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath.replace(/^\/api/, '');
  const segments = rawPath.split('/').filter(Boolean);
  const body = event.body ? JSON.parse(event.body) : {};
  const query = event.queryStringParameters ?? {};
  const authHeader = event.headers?.authorization;

  const isAdmin = await verifyToken(authHeader);

  // Helper: require admin
  function adminOnly(fn: () => Promise<any>) {
    if (!isAdmin) return Promise.resolve(unauthorized());
    return fn();
  }

  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    if (segments[0] === 'auth' && segments[1] === 'login' && method === 'POST') {
      const token = await verifyAdminLogin(body.password);
      if (!token) return unauthorized();
      return ok({ token });
    }

    if (segments[0] === 'auth' && segments[1] === 'verify' && method === 'GET') {
      return ok({ valid: isAdmin });
    }

    // ── Players ────────────────────────────────────────────────────────────
    if (segments[0] === 'players') {
      if (method === 'GET' && !segments[1]) return listPlayers();
      if (method === 'GET' && segments[1] && segments[2] === 'profile') return getPlayerProfile(segments[1]);
      if (method === 'GET' && segments[1]) return getPlayer(segments[1]);
      if (method === 'POST') return adminOnly(() => createPlayer(body));
      if (method === 'PUT' && segments[1]) return adminOnly(() => updatePlayer(segments[1], body));
      if (method === 'DELETE' && segments[1]) return adminOnly(() => deletePlayer(segments[1]));
    }

    // ── Tournaments ────────────────────────────────────────────────────────
    if (segments[0] === 'tournaments') {
      if (method === 'GET' && !segments[1]) return listTournaments(query.status);
      if (method === 'GET' && segments[1] && segments[2] === 'results') return getTournamentResults(segments[1]);
      if (method === 'GET' && segments[1] && segments[2] === 'rounds') return listRoundsForTournament(segments[1]);
      if (method === 'GET' && segments[1]) return getTournament(segments[1]);
      if (method === 'POST' && !segments[1]) return adminOnly(() => createTournament(body));
      if (method === 'PUT' && segments[1]) return adminOnly(() => updateTournament(segments[1], body));
      if (method === 'DELETE' && segments[1]) return adminOnly(() => deleteTournament(segments[1]));
      if (method === 'POST' && segments[1] && segments[2] === 'rounds') return adminOnly(() => createRound(segments[1], body));
    }

    // ── Rounds ─────────────────────────────────────────────────────────────
    if (segments[0] === 'rounds') {
      // specific sub-routes first, catch-all GET last
      if (method === 'GET' && segments[1] && segments[2] === 'scores') return listScoresForRound(segments[1]);
      if (method === 'GET' && segments[1] && segments[2] === 'drafts') return adminOnly(() => getDraftsForRound(segments[1]));
      if (method === 'GET' && segments[1] && !segments[2]) return getRound(segments[1]);
      if (method === 'PUT' && segments[1]) return adminOnly(() => updateRound(segments[1], body));
      if (method === 'DELETE' && segments[1]) return adminOnly(() => deleteRound(segments[1]));
      if (method === 'POST' && segments[1] && segments[2] === 'complete') return adminOnly(() => completeRound(segments[1]));
      if (method === 'POST' && segments[1] && segments[2] === 'reopen') return adminOnly(() => reopenRound(segments[1]));
      if (method === 'POST' && segments[1] && segments[2] === 'scores') return adminOnly(() => submitScore(segments[1], body));
      if (method === 'POST' && segments[1] && segments[2] === 'drafts' && segments[3] && segments[4] === 'confirm') return adminOnly(() => confirmDraft(segments[1], Number(segments[3]), body));
    }

    // ── Scores ─────────────────────────────────────────────────────────────
    if (segments[0] === 'scores') {
      if (method === 'GET' && segments[1]) return getScore(segments[1]);
      if (method === 'PUT' && segments[1]) return adminOnly(() => updateScore(segments[1], body));
    }

    // ── Scoring (public PIN-based entry) ───────────────────────────────────
    if (segments[0] === 'score') {
      if (method === 'GET' && segments[1] === 'rounds') return getActiveRoundsForScoring();
      if (method === 'GET' && segments[1] === 'lookup') return lookupByPin(query.pin ?? '');
      if (method === 'PUT' && segments[1] === 'draft') return saveDraftHole(body);
      if (method === 'POST' && segments[1] === 'submit') return submitDraft(body);
    }

    // ── Courses ────────────────────────────────────────────────────────────
    if (segments[0] === 'courses') {
      if (method === 'GET' && segments[1] === 'search') return searchCourses(query.q ?? '');
      if (method === 'GET' && segments[1] === 'api' && segments[2]) return getCourseFromApi(segments[2]);
      if (method === 'GET' && !segments[1]) return listCourses();
      if (method === 'GET' && segments[1]) return getCourse(segments[1]);
      if (method === 'POST') return adminOnly(() => saveCourse(body));
    }

    return error('Not found', 404);
  } catch (e: any) {
    console.error('Unhandled error:', e);
    return error(e.message ?? 'Internal server error', 500);
  }
}
