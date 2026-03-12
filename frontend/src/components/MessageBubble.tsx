import { AgentMessage } from '../types';

const stageIcons: Record<string, string> = {
  starting: '🚀',
  analyzing: '🧠',
  researching: '🔍',
  planning: '📋',
  executing: '⚡',
  reviewing: '🔎',
  completing: '✅',
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message }: { message: AgentMessage }) {
  if (message.type === 'status') {
    return (
      <div className="flex justify-center my-3 animate-fade-in">
        <span className="text-xs text-white/30 bg-white/5 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.type === 'error') {
    return (
      <div className="animate-slide-up mx-2 mb-3">
        <div className="bg-red-950/60 border border-red-500/30 rounded-2xl rounded-tl-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">⚠️</span>
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">Error</span>
          </div>
          <p className="text-sm text-red-200/90 leading-relaxed">{message.content}</p>
          <p className="text-xs text-red-400/50 mt-2">{formatTime(message.timestamp)}</p>
        </div>
      </div>
    );
  }

  if (message.type === 'result') {
    return (
      <div className="animate-slide-up mx-2 mb-4">
        <div className="bg-gradient-to-br from-violet-950/80 to-purple-950/60 border border-violet-400/30 rounded-2xl p-4 shadow-lg shadow-violet-900/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm shadow-sm">
              ✓
            </div>
            <span className="text-xs font-semibold text-violet-300 uppercase tracking-wide">Mission Complete</span>
          </div>
          <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{message.content}</p>
          <p className="text-xs text-violet-400/50 mt-3">{formatTime(message.timestamp)}</p>
        </div>
      </div>
    );
  }

  // Progress message
  const icon = message.stage ? (stageIcons[message.stage] ?? '💬') : '💬';

  return (
    <div className="animate-slide-up mx-2 mb-3">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-white/6 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
            <p className="text-sm text-white/85 leading-relaxed">{message.content}</p>
          </div>
          <p className="text-xs text-white/25 mt-1 ml-1">{formatTime(message.timestamp)}</p>
        </div>
      </div>
    </div>
  );
}
