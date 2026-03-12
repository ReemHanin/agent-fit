import { Mission } from '../types';

const configs = {
  pending:   { label: 'Pending',   dot: 'bg-yellow-400', text: 'text-yellow-300', ring: 'ring-yellow-400/30' },
  running:   { label: 'Running',   dot: 'bg-violet-400 animate-pulse', text: 'text-violet-300', ring: 'ring-violet-400/30' },
  completed: { label: 'Completed', dot: 'bg-green-400',  text: 'text-green-300',  ring: 'ring-green-400/30' },
  failed:    { label: 'Failed',    dot: 'bg-red-400',    text: 'text-red-300',    ring: 'ring-red-400/30' },
};

export function StatusBadge({ status }: { status: Mission['status'] }) {
  const cfg = configs[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white/5 ring-1 ${cfg.ring} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
