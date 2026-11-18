import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { Player, Round, Tournament } from '@shared/client';
import { CupStandingsEntry, ROUND_FORMAT_LABELS, formatPoints } from '@shared/formats';

export default function CupStandingsCard({
  standings,
  rounds,
  prevRank,
  players,
  tournament,
  totalPot,
  subtitle,
  title = 'Cup Standings',
  live = false,
}: {
  standings: CupStandingsEntry[];
  rounds: Round[];
  prevRank?: Map<string, number>;
  players: Player[];
  tournament: Tournament;
  totalPot: number;
  subtitle?: string;
  title?: string;
  live?: boolean;
}) {
  const ordered = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const leader = standings[0]?.total ?? 0;
  return (
    <div className="card mb-6">
      <div className="px-5 py-3.5 border-b border-ep-silver/20 flex items-center justify-between">
        <div>
          <h2 className="font-heading font-semibold text-ep-green flex items-center gap-2">
            <Trophy size={15} className="text-ep-orange" />
            {title}
          </h2>
          <p className="text-xs text-ep-muted mt-0.5">
            {subtitle ? `${subtitle} · ` : ''}Points for each round's finish, most points wins
          </p>
        </div>
        {live && (
          <span className="flex items-center gap-1 text-xs text-ep-orange">
            <span className="w-1.5 h-1.5 bg-ep-orange rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ep-sand text-ep-muted text-xs">
              <th className="text-left px-4 py-2 font-medium">Rank</th>
              <th className="text-left px-3 py-2 font-medium">Player</th>
              {ordered.map((r, i) => (
                <th key={r.id} className="text-center px-2 py-2 font-medium" title={ROUND_FORMAT_LABELS[r.format ?? 'stroke_play']}>
                  R{i + 1}
                  <div className="font-normal text-xs leading-tight hidden sm:block">
                    {ROUND_FORMAT_LABELS[r.format ?? 'stroke_play'].replace('Two-Man ', '')}
                    {r.pointsMultiplier && r.pointsMultiplier !== 1 ? ` ${r.pointsMultiplier}×` : ''}
                  </div>
                </th>
              ))}
              <th className="text-center px-3 py-2 font-medium">Pts</th>
              <th className="text-center px-3 py-2 font-medium hidden sm:table-cell">Back</th>
              {totalPot > 0 && <th className="text-center px-3 py-2 font-medium">$</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-ep-silver/10">
            {standings.map((e, idx) => {
              const prev = prevRank?.get(e.playerId);
              const movement = prev !== undefined ? prev - e.rank : null;
              const payout = tournament.payoutStructure[idx];
              const projected = payout
                ? payout.payoutType === 'flat' ? (payout.amount ?? 0) : Math.round((payout.percentage / 100) * totalPot)
                : null;
              const player = players.find(p => p.id === e.playerId);
              const back = Math.round((leader - e.total) * 100) / 100;
              return (
                <tr key={e.playerId} className={e.rank === 1 ? 'bg-ep-orange/10' : ''}>
                  <td className="px-4 py-2.5 font-bold text-ep-muted">
                    <span className="flex items-center gap-1">
                      {e.rank === 1 && !e.tied ? '🏆' : `${e.tied ? 'T' : ''}${e.rank}`}
                      {movement !== null && (
                        movement > 0
                          ? <span className="text-xs text-ep-green font-normal">▲</span>
                          : movement < 0
                          ? <span className="text-xs text-red-500 font-normal">▼</span>
                          : <span className="text-xs text-ep-muted/80 font-normal">—</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-ep-green">
                    {player
                      ? <Link to={`/players/${player.id}`} className="hover:text-ep-orange hover:underline">{e.playerName}</Link>
                      : e.playerName}
                  </td>
                  {ordered.map(r => (
                    <td key={r.id} className="px-2 py-2.5 text-center text-ep-green/80">
                      {e.byRound[r.id] !== undefined ? formatPoints(e.byRound[r.id]!) : '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center font-bold text-ep-green">{formatPoints(e.total)}</td>
                  <td className="px-3 py-2.5 text-center text-xs hidden sm:table-cell">
                    {idx === 0
                      ? <span className="text-ep-orange font-medium">Leader</span>
                      : <span className="text-ep-muted">{back === 0 ? 'Tied' : `−${formatPoints(back)}`}</span>}
                  </td>
                  {totalPot > 0 && (
                    <td className="px-3 py-2.5 text-center font-semibold text-ep-orange">{projected ? `$${projected}` : '—'}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-2.5 text-xs text-ep-muted border-t border-ep-silver/20">
        Ties split the points. In team rounds both partners share their team's finish.
        Tied totals are broken by the most recent round.
      </p>
    </div>
  );
}
