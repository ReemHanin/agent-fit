import { useNavigate } from 'react-router-dom';
import { Mission } from '../types';
import { StatusBadge } from './StatusBadge';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MissionCard({ mission }: { mission: Mission }) {
  const navigate = useNavigate();
  const lastMsg = mission.messages.filter(m => m.type !== 'status').slice(-1)[0];
  const msgCount = mission.messages.filter(m => m.type === 'progress').length;

  return (
    <button
      className="w-full text-left glass rounded-2xl p-4 active:scale-98 transition-all duration-150 hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
      onClick={() => navigate(`/mission/${mission.id}`)}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-white/90 text-sm leading-snug flex-1 min-w-0 line-clamp-2">
          {mission.title}
        </h3>
        <StatusBadge status={mission.status} />
      </div>

      {lastMsg && (
        <p className="text-xs text-white/45 line-clamp-2 leading-relaxed mb-3">
          {lastMsg.content}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-white/25">{timeAgo(mission.createdAt)}</span>
        <div className="flex items-center gap-3">
          {msgCount > 0 && (
            <span className="text-xs text-white/30">{msgCount} update{msgCount !== 1 ? 's' : ''}</span>
          )}
          <div className="text-white/20">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </div>
      </div>
    </button>
  );
}
