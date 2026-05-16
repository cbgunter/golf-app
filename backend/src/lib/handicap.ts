import { HandicapEntry, HoleScore, Score } from '../types';

/**
 * Calculates a handicap differential for a single round.
 * Formula: (Adjusted Gross Score - Course Rating) x 113 / Slope Rating
 */
export function calcDifferential(
  adjustedGrossScore: number,
  courseRating: number,
  slopeRating: number
): number {
  return Math.round(((adjustedGrossScore - courseRating) * 113) / slopeRating * 10) / 10;
}

/**
 * Calculates handicap index from an array of differentials (chronological order).
 * Uses USGA World Handicap System rules.
 * Returns { handicapIndex, explanation } for full transparency.
 */
export function calcHandicapIndex(differentials: number[]): {
  handicapIndex: number;
  explanation: string;
  usedDifferentials: number[];
  count: number;
} {
  const n = differentials.length;

  if (n === 0) {
    return { handicapIndex: 0, explanation: 'No rounds recorded yet.', usedDifferentials: [], count: 0 };
  }

  const sorted = [...differentials].sort((a, b) => a - b);

  let usedCount: number;
  let adjustment = 0;
  let note = '';

  if (n <= 3) {
    usedCount = 1;
    adjustment = n === 1 ? -2 : n === 2 ? -1 : 0;
    note = `${n} round(s) recorded — using lowest 1 differential with ${adjustment} adjustment`;
  } else if (n <= 5) {
    usedCount = 1;
    adjustment = n === 4 ? -1 : 0;
    note = `${n} rounds recorded — using lowest 1 differential with ${adjustment} adjustment`;
  } else if (n <= 6) {
    usedCount = 2;
    note = `${n} rounds recorded — using average of lowest 2 differentials`;
  } else if (n <= 8) {
    usedCount = 2;
    note = `${n} rounds recorded — using average of lowest 2 differentials`;
  } else if (n <= 11) {
    usedCount = 3;
    note = `${n} rounds recorded — using average of lowest 3 differentials`;
  } else if (n <= 14) {
    usedCount = 4;
    note = `${n} rounds recorded — using average of lowest 4 differentials`;
  } else if (n <= 16) {
    usedCount = 5;
    note = `${n} rounds recorded — using average of lowest 5 differentials`;
  } else if (n <= 18) {
    usedCount = 6;
    note = `${n} rounds recorded — using average of lowest 6 differentials`;
  } else if (n === 19) {
    usedCount = 7;
    note = `19 rounds recorded — using average of lowest 7 differentials`;
  } else {
    // 20+ rounds: use best 8 of last 20
    const last20 = differentials.slice(-20).sort((a, b) => a - b);
    usedCount = 8;
    const best8 = last20.slice(0, 8);
    const avg = best8.reduce((s, d) => s + d, 0) / 8;
    const hi = Math.floor((avg * 0.96) * 10) / 10;
    return {
      handicapIndex: hi,
      explanation: `20+ rounds — best 8 of last 20: [${best8.join(', ')}], avg ${avg.toFixed(1)} × 0.96 = ${hi}`,
      usedDifferentials: best8,
      count: 20,
    };
  }

  const usedDiffs = sorted.slice(0, usedCount);
  const avg = usedDiffs.reduce((s, d) => s + d, 0) / usedCount;
  const raw = avg + adjustment;
  const hi = Math.floor(raw * 10) / 10;

  const explanation =
    `${note}. Used: [${usedDiffs.join(', ')}]` +
    (usedCount > 1 ? `, avg = ${avg.toFixed(1)}` : '') +
    (adjustment !== 0 ? `, adjustment ${adjustment}` : '') +
    ` → Handicap Index = ${hi}`;

  return { handicapIndex: Math.max(hi, 0), explanation, usedDifferentials: usedDiffs, count: n };
}

/**
 * Calculates course handicap from handicap index, slope, rating, and par.
 * Formula: Handicap Index × (Slope / 113) + (Course Rating − Par)
 */
export function calcCourseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number
): { courseHandicap: number; explanation: string } {
  const raw = handicapIndex * (slopeRating / 113) + (courseRating - par);
  const courseHandicap = Math.round(raw);
  const explanation =
    `Course Handicap = ${handicapIndex} × (${slopeRating} / 113) + (${courseRating} − ${par}) = ${raw.toFixed(2)} → rounded to ${courseHandicap}`;
  return { courseHandicap, explanation };
}

/**
 * Applies Equitable Stroke Control (ESC) to a hole score.
 * Limits maximum score per hole based on course handicap.
 */
export function applyESC(strokes: number, par: number, courseHandicap: number): {
  adjusted: number;
  wasAdjusted: boolean;
  maxAllowed: number;
} {
  let maxAllowed: number;
  if (courseHandicap <= 9) maxAllowed = par + 2;       // double bogey
  else if (courseHandicap <= 19) maxAllowed = 7;
  else if (courseHandicap <= 29) maxAllowed = 8;
  else if (courseHandicap <= 39) maxAllowed = 9;
  else maxAllowed = 10;

  const adjusted = Math.min(strokes, maxAllowed);
  return { adjusted, wasAdjusted: adjusted < strokes, maxAllowed };
}

/**
 * Determines whether a player receives a handicap stroke on a given hole.
 * Allocates strokes by hole handicap (stroke index), lowest first.
 */
export function receivesStroke(holeHandicap: number, courseHandicap: number): boolean {
  return holeHandicap <= courseHandicap;
}

/**
 * Computes full hole-by-hole net scores and returns annotated HoleScore array.
 */
export function computeHoleScores(
  rawHoleScores: { hole: number; par: number; handicap: number; strokes: number }[],
  courseHandicap: number
): HoleScore[] {
  return rawHoleScores.map(h => {
    const getsStroke = receivesStroke(h.handicap, courseHandicap);
    const netStrokes = getsStroke ? h.strokes - 1 : h.strokes;
    return {
      hole: h.hole,
      par: h.par,
      handicap: h.handicap,
      strokes: h.strokes,
      netStrokes,
      receivesStroke: getsStroke,
    };
  });
}
