import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMission, subscribeToMission } from '../api';
import { Mission, AgentMessage } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { MessageBubble } from '../components/MessageBubble';
import { notifyMissionComplete, notifyMissionProgress } from '../notifications';

function TypingIndicator() {
  return (
    <div className="mx-2 mb-3 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-sm">
          🤖
        </div>
        <div className="bg-white/6 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 typing-dot" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 typing-dot" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 typing-dot" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MissionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mission, setMission] = useState<Mission | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isRunning = mission?.status === 'running' || mission?.status === 'pending';

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRunning]);

  useEffect(() => {
    if (!id) return;

    // Load initial state
    getMission(id)
      .then(m => {
        setMission(m);
        // For "completion" mode, only show result and status messages initially
        if (m.notifyMode === 'completion') {
          setMessages(m.messages.filter(msg => msg.type !== 'progress'));
        } else {
          setMessages(m.messages);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    // Subscribe to real-time updates
    const unsubscribe = subscribeToMission(id, event => {
      if (event.type === 'init') {
        const m = event.mission as Mission;
        setMission(m);
        if (m.notifyMode === 'completion') {
          setMessages(m.messages.filter(msg => msg.type !== 'progress'));
        } else {
          setMessages(m.messages);
        }
        setLoading(false);
      } else if (event.type === 'message') {
        const msg = event.message as AgentMessage;
        setMission(prev => {
          if (!prev) return prev;

          // Fire notifications based on message type
          if (msg.type === 'result') {
            // Always notify on completion — works even when phone is locked
            notifyMissionComplete(prev.id, prev.title);
          } else if (msg.type === 'progress' && prev.notifyMode === 'all' && document.hidden) {
            // Only background-notify progress updates when app is not visible
            notifyMissionProgress(prev.id, msg.content);
          }

          // For completion mode, skip progress messages in display
          if (prev.notifyMode === 'completion' && msg.type === 'progress') return prev;
          setMessages(cur => [...cur, msg]);
          return prev;
        });
      } else if (event.type === 'mission_updated') {
        setMission(event.mission as Mission);
      }
    });

    return unsubscribe;
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 rounded-full border-2 border-brand-500/30 border-t-brand-400 animate-spin" />
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-white/40">Mission not found</p>
        <button onClick={() => navigate('/')} className="btn-ghost text-sm">
          Go back
        </button>
      </div>
    );
  }

  const isCompletionMode = mission.notifyMode === 'completion';
  const hasResult = messages.some(m => m.type === 'result');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pt-safe flex-shrink-0">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/6">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-white text-sm truncate">{mission.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={mission.status} />
              {isCompletionMode && (
                <span className="text-xs text-white/25">• Done only</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pt-4">
        {/* Mission description bubble */}
        <div className="mx-2 mb-4">
          <div className="flex justify-end">
            <div className="max-w-[80%] bg-brand-600/30 border border-brand-500/30 rounded-2xl rounded-tr-sm px-4 py-3">
              <p className="text-sm text-white/85 leading-relaxed">{mission.description}</p>
            </div>
          </div>
          <p className="text-xs text-white/20 text-right mt-1 mr-1">
            {new Date(mission.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Completion mode: show waiting state */}
        {isCompletionMode && !hasResult && isRunning && (
          <div className="mx-2 mb-4 animate-fade-in">
            <div className="bg-white/4 border border-white/8 rounded-2xl p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600/30 to-purple-700/20 border border-violet-500/20 flex items-center justify-center mx-auto mb-3">
                <div className="w-5 h-5 rounded-full border-2 border-violet-400/50 border-t-violet-300 animate-spin" />
              </div>
              <p className="text-sm font-medium text-white/60">Agent is working...</p>
              <p className="text-xs text-white/30 mt-1">You'll be notified when it's done</p>
            </div>
          </div>
        )}

        {/* All messages */}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Typing indicator while running */}
        {isRunning && (!isCompletionMode || messages.length === 0) && <TypingIndicator />}

        <div ref={bottomRef} className="h-6" />
      </div>

      {/* Footer info */}
      {!isRunning && (
        <div className="flex-shrink-0 px-4 py-3 pb-safe border-t border-white/6">
          <p className="text-xs text-center text-white/20">
            {mission.status === 'completed'
              ? `Completed ${mission.completedAt ? new Date(mission.completedAt).toLocaleString() : ''}`
              : mission.status === 'failed'
              ? 'Mission failed'
              : ''}
          </p>
        </div>
      )}
    </div>
  );
}
