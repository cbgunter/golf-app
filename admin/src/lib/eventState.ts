import type { DraftScorecard } from '@shared/client';

interface Tournament {
  status: 'upcoming' | 'active' | 'completed' | 'archived';
  format: string;
  playerIds: string[];
  hasClosestToPin: boolean;
  hasLongestDrive: boolean;
}

interface Round {
  status: 'scheduled' | 'in_progress' | 'completed';
  closestToPinWinnerId?: string;
  longestDriveWinnerId?: string;
  teeTimeGroups?: { groupNumber: number; playerIds: string[] }[];
}

export type EventStateKey =
  | 'incomplete'
  | 'needs-players'
  | 'ready'
  | 'scoring-open'
  | 'pending-confirmation'
  | 'validate-leaderboard'
  | 'ready-to-complete'
  | 'completed';

export interface EventStateInfo {
  key: EventStateKey;
  label: string;
  description: string;
  cta: string;
  ctaTarget: 'details' | 'players' | 'rounds' | 'confirm' | 'complete' | 'results' | null;
  urgent: boolean;
}

export function computeEventState(
  tournament: Tournament,
  rounds: Round[],
  drafts: DraftScorecard[]
): EventStateInfo {
  if (tournament.status === 'completed') {
    return {
      key: 'completed',
      label: 'Event Complete',
      description: 'All scores are in and the event is finalized.',
      cta: 'View public results',
      ctaTarget: 'results',
      urgent: false,
    };
  }

  const submittedDrafts = drafts.filter(d => d.status === 'submitted');
  if (submittedDrafts.length > 0) {
    return {
      key: 'pending-confirmation',
      label: 'Scores Pending Confirmation',
      description: `${submittedDrafts.length} group${submittedDrafts.length > 1 ? 's have' : ' has'} submitted scorecards waiting for your review.`,
      cta: 'Review & confirm scorecards',
      ctaTarget: 'confirm',
      urgent: true,
    };
  }

  const allRoundsComplete = rounds.length > 0 && rounds.every(r => r.status === 'completed');

  if (allRoundsComplete) {
    const ctpResolved = !tournament.hasClosestToPin || rounds.every(r => r.closestToPinWinnerId);
    const ldResolved = !tournament.hasLongestDrive || rounds.every(r => r.longestDriveWinnerId);

    if (ctpResolved && ldResolved) {
      return {
        key: 'ready-to-complete',
        label: 'Ready to Complete',
        description: 'All scores confirmed and side contests resolved. Mark the event complete to publish final results.',
        cta: 'Mark event complete',
        ctaTarget: 'complete',
        urgent: false,
      };
    }

    const missing: string[] = [];
    if (!ctpResolved) missing.push('Closest to Pin winner');
    if (!ldResolved) missing.push('Longest Drive winner');
    return {
      key: 'validate-leaderboard',
      label: 'Assign Contest Winners',
      description: `All scores are confirmed. Assign the ${missing.join(' and ')} before completing the event.`,
      cta: 'Assign winners',
      ctaTarget: 'rounds',
      urgent: false,
    };
  }

  const hasActiveRound = rounds.some(r => r.status === 'in_progress');
  const hasGroupsSetUp = rounds.some(r => r.teeTimeGroups && r.teeTimeGroups.length > 0);

  if (hasActiveRound || hasGroupsSetUp) {
    return {
      key: 'scoring-open',
      label: 'Scoring in Progress',
      description: 'Players are out on the course. Scorecards will appear here once groups submit their scores.',
      cta: 'View rounds & tee sheet',
      ctaTarget: 'rounds',
      urgent: false,
    };
  }

  if (rounds.length > 0 && tournament.playerIds.length > 0) {
    return {
      key: 'ready',
      label: 'Ready to Go',
      description: 'Players enrolled and rounds set up. Share group PINs when scoring opens.',
      cta: 'View rounds & tee sheet',
      ctaTarget: 'rounds',
      urgent: false,
    };
  }

  if (rounds.length > 0 && tournament.format && tournament.playerIds.length === 0) {
    return {
      key: 'needs-players',
      label: 'Add Players',
      description: 'Rounds are set up. Add the players who will be competing.',
      cta: 'Add players',
      ctaTarget: 'players',
      urgent: false,
    };
  }

  return {
    key: 'incomplete',
    label: 'Setup Incomplete',
    description: rounds.length === 0
      ? 'Add at least one round to get started.'
      : 'Set a game format to continue setup.',
    cta: rounds.length === 0 ? 'Add a round' : 'Edit event details',
    ctaTarget: rounds.length === 0 ? 'rounds' : 'details',
    urgent: false,
  };
}
