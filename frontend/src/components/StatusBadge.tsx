type Status = 'upcoming' | 'active' | 'completed' | 'archived' | 'scheduled' | 'in_progress';

const config: Record<Status, string> = {
  upcoming: 'badge-blue',
  active: 'badge-green',
  in_progress: 'badge-green',
  scheduled: 'badge-gray',
  completed: 'badge-gold',
  archived: 'badge-gray',
};

const labels: Record<Status, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  in_progress: 'In Progress',
  scheduled: 'Scheduled',
  completed: 'Completed',
  archived: 'Archived',
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = config[status as Status] ?? 'badge-gray';
  const label = labels[status as Status] ?? status;
  return <span className={cls}>{label}</span>;
}
