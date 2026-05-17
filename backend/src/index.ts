import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { verifyToken, verifyAdminLogin } from './lib/auth';
import { ok, error, unauthorized } from './lib/response';

import { listPlayers, getPlayer, createPlayer, updatePlayer, deletePlayer } from './handlers/players';
import { listTournaments, getTournament, createTournament, updateTournament, deleteTournament, getTournamentResults } from './handlers/tournaments';
import { listRoundsForTournament, getRound, createRound, updateRound, completeRound } from './handlers/rounds';
import { listScoresForRound, getScore, submitScore, updateScore } from './handlers/scores';
import { listCourses, getCourse, searchCourses, getCourseFromApi, saveCourse } from './handlers/courses';

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
      if (method === 'GET' && segments[1] && segments[2] === 'scores') return listScoresForRound(segments[1]);
      if (method === 'GET' && segments[1]) return getRound(segments[1]);
      if (method === 'PUT' && segments[1]) return adminOnly(() => updateRound(segments[1], body));
      if (method === 'POST' && segments[1] && segments[2] === 'complete') return adminOnly(() => completeRound(segments[1]));
      if (method === 'POST' && segments[1] && segments[2] === 'scores') return adminOnly(() => submitScore(segments[1], body));
    }

    // ── Scores ─────────────────────────────────────────────────────────────
    if (segments[0] === 'scores') {
      if (method === 'GET' && segments[1]) return getScore(segments[1]);
      if (method === 'PUT' && segments[1]) return adminOnly(() => updateScore(segments[1], body));
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
