import { useState, useRef, useEffect } from 'react';
import { createMission, suggestMission, MissionSuggestion } from '../api';
import { Mission } from '../types';

// Ambient declarations for the Web Speech API (webkit-prefixed constructor
// is not in lib.dom.d.ts but is available in Chrome/Edge/Safari).
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface Props {
  onClose: () => void;
  onCreate: (mission: Mission) => void;
  initialDescription?: string;
}

export function CreateMissionModal({ onClose, onCreate, initialDescription }: Props) {
  const [description, setDescription] = useState(initialDescription ?? '');
  const [notifyMode, setNotifyMode] = useState<'all' | 'completion'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice / suggestion state
  const [isRecording, setIsRecording] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  // Pre-fill suggestion label if opened from voice sheet
  const [suggestion, setSuggestion] = useState<MissionSuggestion | null>(
    initialDescription ? { title: '', description: initialDescription } : null
  );
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const latestTranscriptRef = useRef('');
  const isMountedRef = useRef(true);

  const speechSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    textareaRef.current?.focus();
    return () => {
      isMountedRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  const handleMicClick = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    setVoiceError('');
    setSuggestion(null);
    latestTranscriptRef.current = '';

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    setIsRecording(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      latestTranscriptRef.current = text;
      setDescription(text);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsRecording(false);
      if (event.error === 'not-allowed') {
        setVoiceError('Microphone access denied. Allow it in browser settings.');
      } else if (event.error === 'no-speech') {
        setVoiceError('No speech detected. Please try again.');
      } else {
        setVoiceError(`Voice error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      const transcript = latestTranscriptRef.current.trim();
      if (!transcript) return;
      setIsSuggesting(true);
      suggestMission(transcript)
        .then(s => {
          if (!isMountedRef.current) return;
          setSuggestion(s);
          setDescription(s.description);
        })
        .catch(() => {
          if (!isMountedRef.current) return;
          setVoiceError('Could not refine transcript. Edit and submit as-is.');
        })
        .finally(() => {
          if (!isMountedRef.current) return;
          setIsSuggesting(false);
        });
    };

    recognition.start();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please describe the mission.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const mission = await createMission(description.trim(), notifyMode);
      onCreate(mission);
    } catch {
      setError('Failed to create mission. Is the backend running?');
      setLoading(false);
    }
  };

  const placeholders = [
    'Research the top 5 AI tools for designers and summarize their features...',
    'Create a weekly workout plan for building strength at home...',
    'Analyze the pros and cons of React vs Vue for a new project...',
    'Write a blog post outline about the future of remote work...',
    'Plan a 7-day trip to Japan with budget tips...',
  ];

  const [placeholder] = useState(
    () => placeholders[Math.floor(Math.random() * placeholders.length)]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg mx-auto animate-slide-up">
        <div className="bg-gray-950 border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl">
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">New Mission</h2>
                <p className="text-xs text-white/40 mt-0.5">Describe what the agent should do</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Mission description */}
              <div>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={description}
                    onChange={e => {
                      setDescription(e.target.value);
                      if (suggestion) setSuggestion(null);
                    }}
                    placeholder={isRecording ? 'Listening...' : placeholder}
                    rows={4}
                    maxLength={1000}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/25 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/60 focus:border-transparent transition-all pr-12"
                  />

                  {/* Mic button */}
                  {speechSupported && (
                    <button
                      type="button"
                      onClick={handleMicClick}
                      disabled={isSuggesting}
                      aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                      className={`absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all
                        ${isRecording
                          ? 'bg-red-500/20 border border-red-500/50 hover:bg-red-500/30'
                          : 'bg-white/8 border border-white/10 hover:bg-white/15'
                        }
                        disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {isRecording ? (
                        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      ) : isSuggesting ? (
                        <svg className="animate-spin w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                          <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>

                {/* AI suggestion label */}
                {suggestion && (
                  <p className="text-xs text-violet-400 mt-1.5 flex items-center gap-1">
                    ✨ Suggested from voice — edit freely before launching
                  </p>
                )}

                {/* Recording status */}
                {isRecording && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Listening... tap mic to stop
                  </p>
                )}

                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${description.length > 800 ? 'text-red-400' : 'text-white/25'}`}>
                    {description.length}/1000
                  </span>
                </div>
              </div>

              {/* Notification mode */}
              <div>
                <p className="text-xs font-medium text-white/50 mb-3 uppercase tracking-wider">
                  Notifications
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifyMode('all')}
                    className={`flex flex-col items-start p-3.5 rounded-2xl border transition-all text-left ${
                      notifyMode === 'all'
                        ? 'border-brand-500/60 bg-brand-600/15'
                        : 'border-white/8 bg-white/3 hover:bg-white/6'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        notifyMode === 'all' ? 'border-brand-400' : 'border-white/30'
                      }`}>
                        {notifyMode === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
                      </div>
                      <span className="text-sm font-medium text-white/80">All updates</span>
                    </div>
                    <span className="text-xs text-white/35 ml-5.5">Follow every step live</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNotifyMode('completion')}
                    className={`flex flex-col items-start p-3.5 rounded-2xl border transition-all text-left ${
                      notifyMode === 'completion'
                        ? 'border-brand-500/60 bg-brand-600/15'
                        : 'border-white/8 bg-white/3 hover:bg-white/6'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        notifyMode === 'completion' ? 'border-brand-400' : 'border-white/30'
                      }`}>
                        {notifyMode === 'completion' && <div className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
                      </div>
                      <span className="text-sm font-medium text-white/80">Done only</span>
                    </div>
                    <span className="text-xs text-white/35 ml-5.5">Alert when finished</span>
                  </button>
                </div>
              </div>

              {(error || voiceError) && (
                <p className="text-sm text-red-400 bg-red-950/40 rounded-xl px-3 py-2 border border-red-500/20">
                  {error || voiceError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !description.trim()}
                className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating agent...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Launch Agent
                  </>
                )}
              </button>
            </form>
          </div>
          {/* Safe area padding */}
          <div className="pb-safe" />
        </div>
      </div>
    </div>
  );
}
