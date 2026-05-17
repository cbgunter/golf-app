import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { playersApi, PlayerProfile } from '../api/client';
import { parseLocalDate } from '../lib/dates';
import { ArrowLeft, TrendingDown, TrendingUp, Minus } from 'lucide-react';

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    playersApi.profile(id)
      .then(setProfile)
      .catch(e => setError(e.message ?? 'Failed to load player'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8 text-stone-500">Loading...</div>;
  if (error) return <div className="max-w-3xl mx-auto px-4 py-8 text-red-500">{error}</div>;
  if (!profile) return null;

  const { player, roundScores } = profile;
  const history = player.handicapHistory;

  // Trend: compare first recorded HCP to current
  const firstHcp = history.length > 0 ? history[0].handicapIndex : null;
  const hcpChange = firstHcp !== null ? player.handicapIndex - firstHcp : null;

  const avgGross = roundScores.length
    ? Math.round(roundScores.reduce((s, r) => s + r.grossTotal, 0) / roundScores.length * 10) / 10
    : null;
  const bestDiff = roundScores.length
    ? Math.min(...roundScores.map(r => r.handicapDifferential))
    : null;
  const bestGross = roundScores.length
    ? Math.min(...roundScores.map(r => r.grossTotal))
    : null;

  // Handicap history points (chronological) for chart
  const chartPoints = history.map((h, i) => ({ index: i + 1, hcp: h.handicapIndex, date: h.date }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/players" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 mb-6">
        <ArrowLeft size={14} /> All Players
      </Link>

      {/* Header */}
      <div className="card p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-sage-100 text-sage-700 flex items-center justify-center font-bold text-2xl shrink-0">
            {player.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-stone-900">{player.name}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-sage-700">{player.handicapIndex.toFixed(1)}</span>
                <span className="text-sm text-stone-400">current HCP</span>
              </div>
              {hcpChange !== null && (
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  hcpChange < 0 ? 'text-green-600' : hcpChange > 0 ? 'text-red-500' : 'text-stone-400'
                }`}>
                  {hcpChange < 0 ? <TrendingDown size={15} /> : hcpChange > 0 ? <TrendingUp size={15} /> : <Minus size={15} />}
                  {hcpChange < 0 ? `${Math.abs(hcpChange).toFixed(1)} pts improved` : hcpChange > 0 ? `${hcpChange.toFixed(1)} pts higher` : 'No change'}
                  <span className="text-stone-400 font-normal">since first round</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-stone-100">
          <Stat label="Rounds Played" value={roundScores.length} />
          <Stat label="Avg Gross" value={avgGross ?? '—'} />
          <Stat label="Best Gross" value={bestGross ?? '—'} />
          <Stat label="Best Diff" value={bestDiff !== null ? bestDiff.toFixed(1) : '—'} />
        </div>
      </div>

      {/* Handicap trend chart */}
      {chartPoints.length >= 2 && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-stone-800 mb-1">Handicap Trend</h2>
          <p className="text-xs text-stone-400 mb-4">Index after each recorded round — lower is better</p>
          <HcpChart points={chartPoints} />
          <div className="flex justify-between text-xs text-stone-400 mt-1 px-1">
            <span>Round 1</span>
            <span>Round {chartPoints.length}</span>
          </div>
        </div>
      )}

      {/* Round history */}
      {roundScores.length > 0 ? (
        <div className="card">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="font-semibold text-stone-800">Round History</h2>
            <p className="text-xs text-stone-400 mt-0.5">Most recent first</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 text-stone-500 text-xs">
                  <th className="text-left px-5 py-2.5 font-medium">Date</th>
                  <th className="text-left px-3 py-2.5 font-medium">Course</th>
                  <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">Tournament</th>
                  <th className="text-center px-3 py-2.5 font-medium">Gross</th>
                  <th className="text-center px-3 py-2.5 font-medium">Net</th>
                  <th className="text-center px-3 py-2.5 font-medium">Diff</th>
                  <th className="text-center px-3 py-2.5 font-medium">HCP After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {[...roundScores].reverse().map((r, i) => {
                  const toPar = r.grossTotal - r.par;
                  // Find matching HCP entry (by roundId)
                  const hcpEntry = history.find(h => h.roundId === r.roundId);
                  return (
                    <tr key={r.scoreId} className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50/40'}>
                      <td className="px-5 py-3 text-stone-600 whitespace-nowrap">
                        {parseLocalDate(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-3 text-stone-800 font-medium max-w-[160px] truncate">{r.courseName}</td>
                      <td className="px-3 py-3 text-stone-500 hidden sm:table-cell max-w-[140px] truncate">
                        <Link to={`/tournament/${r.tournamentId}`} className="hover:text-sage-600 hover:underline">
                          {r.tournamentName}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-semibold text-stone-900">{r.grossTotal}</span>
                        <span className={`ml-1 text-xs ${toPar < 0 ? 'text-red-500' : toPar === 0 ? 'text-green-600' : 'text-stone-400'}`}>
                          {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-stone-600">{r.netTotal}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-medium ${r.handicapDifferential < 0 ? 'text-green-600' : 'text-stone-600'}`}>
                          {r.handicapDifferential.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-sage-700">
                        {hcpEntry ? hcpEntry.handicapIndex.toFixed(1) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-10 text-center text-stone-400 text-sm">
          No rounds recorded yet.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold text-stone-900">{value}</div>
      <div className="text-xs text-stone-400 mt-0.5">{label}</div>
    </div>
  );
}

function HcpChart({ points }: { points: { index: number; hcp: number; date: string }[] }) {
  const W = 500, H = 100;
  const PL = 38, PR = 10, PT = 8, PB = 8;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;

  const values = points.map(p => p.hcp);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.15 || 0.5;
  const minVal = rawMin - pad;
  const maxVal = rawMax + pad;
  const range = maxVal - minVal;

  const toX = (i: number) => PL + (i / (values.length - 1)) * plotW;
  const toY = (v: number) => PT + ((maxVal - v) / range) * plotH;

  const polylinePoints = values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  // Y-axis grid: ~3 labels
  const step = (rawMax - rawMin) < 2 ? 0.5 : 1;
  const gridStart = Math.ceil(rawMin / step) * step;
  const gridVals: number[] = [];
  for (let v = gridStart; v <= rawMax + 0.01; v = Math.round((v + step) * 10) / 10) {
    gridVals.push(v);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
      {/* Grid lines */}
      {gridVals.map(v => (
        <g key={v}>
          <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="#e7e5e4" strokeWidth="1" />
          <text x={PL - 5} y={toY(v)} fontSize="9" fill="#a8a29e" textAnchor="end" dominantBaseline="middle">
            {v % 1 === 0 ? v : v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Filled area */}
      <polygon
        points={`${toX(0)},${PT + plotH} ${polylinePoints} ${toX(values.length - 1)},${PT + plotH}`}
        fill="#5a7a59"
        fillOpacity="0.08"
      />

      {/* Line */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="#5a7a59"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {values.map((v, i) => (
        <circle key={i} cx={toX(i)} cy={toY(v)} r="3.5" fill="#5a7a59" stroke="white" strokeWidth="1.5" />
      ))}

      {/* First & last HCP labels */}
      <text x={toX(0)} y={toY(values[0]) - 8} fontSize="9" fill="#5a7a59" textAnchor="middle" fontWeight="600">
        {values[0].toFixed(1)}
      </text>
      {values.length > 1 && (
        <text x={toX(values.length - 1)} y={toY(values[values.length - 1]) - 8} fontSize="9" fill="#5a7a59" textAnchor="middle" fontWeight="600">
          {values[values.length - 1].toFixed(1)}
        </text>
      )}
    </svg>
  );
}
