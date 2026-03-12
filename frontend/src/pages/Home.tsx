import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMissions } from '../api';
import { Mission } from '../types';
import { MissionCard } from '../components/MissionCard';
import { CreateMissionModal } from '../components/CreateMissionModal';
import { VoiceListenSheet } from '../components/VoiceListenSheet';
import { requestNotificationPermission, notificationPermission } from '../notifications';

const speechSupported =
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

function NotificationBanner() {
  const [perm, setPerm] = useState(notificationPermission());

  if (perm === 'granted' || perm === 'unsupported') return null;

  const handleAllow = async () => {
    const granted = await requestNotificationPermission();
    setPerm(granted ? 'granted' : 'denied');
  };

  if (perm === 'denied') {
    return (
      <div className="mx-4 mb-2 px-4 py-3 rounded-2xl bg-white/4 border border-white/8 flex items-center gap-3">
        <span className="text-lg">🔕</span>
        <p className="text-xs text-white/40 flex-1 leading-relaxed">
          Notifications blocked. Enable them in your browser settings to get alerted when missions finish.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-2 px-4 py-3 rounded-2xl bg-violet-950/60 border border-violet-500/25 flex items-center gap-3">
      <span className="text-lg">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-violet-200">Allow notifications</p>
        <p className="text-xs text-white/40 leading-snug">Get alerted when your agent finishes — even with the app closed</p>
      </div>
      <button
        onClick={handleAllow}
        className="flex-shrink-0 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
      >
        Allow
      </button>
    </div>
  );
}

export function Home() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [voicePreFill, setVoicePreFill] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchMissions = useCallback(async () => {
    try {
      const data = await getMissions();
      setMissions(data);
    } catch {
      // Backend not ready yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMissions();
    // Refresh missions list every 5s to pick up status changes
    const interval = setInterval(fetchMissions, 5000);
    return () => clearInterval(interval);
  }, [fetchMissions]);

  const handleMissionCreated = (mission: Mission) => {
    setShowCreate(false);
    setVoicePreFill('');
    setMissions(prev => [mission, ...prev]);
    navigate(`/mission/${mission.id}`);
  };

  const handleVoiceLaunch = (mission: Mission) => {
    setShowVoice(false);
    setMissions(prev => [mission, ...prev]);
    navigate(`/mission/${mission.id}`);
  };

  const handleVoiceEdit = (description: string) => {
    setShowVoice(false);
    setVoicePreFill(description);
    setShowCreate(true);
  };

  const running = missions.filter(m => m.status === 'running' || m.status === 'pending');
  const done = missions.filter(m => m.status === 'completed' || m.status === 'failed');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pt-safe">
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Agent Fit</h1>
              <p className="text-xs text-white/35 mt-0.5">AI agents that work for you</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-900/40">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Notification permission banner */}
      <NotificationBanner />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 space-y-6 pb-32">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-2 border-brand-500/30 border-t-brand-400 animate-spin mb-4" />
            <p className="text-white/30 text-sm">Connecting to backend...</p>
          </div>
        ) : missions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-5">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <h2 className="text-white/70 font-semibold text-lg mb-2">No missions yet</h2>
            <p className="text-white/30 text-sm max-w-xs leading-relaxed">
              Launch your first AI agent by describing a mission below
            </p>
          </div>
        ) : (
          <>
            {running.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  Active
                </h2>
                <div className="space-y-3">
                  {running.map(m => <MissionCard key={m.id} mission={m} />)}
                </div>
              </section>
            )}

            {done.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">
                  Completed
                </h2>
                <div className="space-y-3">
                  {done.map(m => <MissionCard key={m.id} mission={m} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-safe">
        <div className="w-full max-w-lg px-4 pb-6">
          <div className="flex items-center gap-3">
            {/* Voice / Speak button */}
            {speechSupported && (
              <button
                onClick={() => setShowVoice(true)}
                className="w-14 h-14 rounded-2xl bg-white/8 border border-white/12 hover:bg-white/15 active:bg-white/20 flex items-center justify-center transition-all flex-shrink-0 shadow-lg shadow-black/30"
                aria-label="Speak a mission"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}

            {/* New Mission button */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex-1 btn-primary flex items-center justify-center gap-2 shadow-lg shadow-brand-900/50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Mission
            </button>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateMissionModal
          onClose={() => { setShowCreate(false); setVoicePreFill(''); }}
          onCreate={handleMissionCreated}
          initialDescription={voicePreFill}
        />
      )}

      {showVoice && (
        <VoiceListenSheet
          onClose={() => setShowVoice(false)}
          onLaunch={handleVoiceLaunch}
          onEdit={handleVoiceEdit}
        />
      )}
    </div>
  );
}
