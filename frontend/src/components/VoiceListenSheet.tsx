import { useState, useRef, useEffect } from 'react';
import { suggestMission, createMission, MissionSuggestion } from '../api';
import { Mission } from '../types';

// Ambient declarations for the Web Speech API
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
  onLaunch: (mission: Mission) => void;
  onEdit: (description: string) => void;
}

type Phase = 'listening' | 'suggesting' | 'suggested' | 'error';

export function VoiceListenSheet({ onClose, onLaunch, onEdit }: Props) {
  const [phase, setPhase] = useState<Phase>('listening');
  const [transcript, setTranscript] = useState('');
  const [suggestion, setSuggestion] = useState<MissionSuggestion | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [launching, setLaunching] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const latestTranscriptRef = useRef('');
  const isMountedRef = useRef(true);

  useEffect(() => {
    startListening();
    return () => {
      isMountedRef.current = false;
      recognitionRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = () => {
    setPhase('listening');
    setTranscript('');
    setErrorMsg('');
    latestTranscriptRef.current = '';

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      latestTranscriptRef.current = text;
      if (isMountedRef.current) setTranscript(text);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (!isMountedRef.current) return;
      if (event.error === 'not-allowed') {
        setErrorMsg('Microphone access denied. Allow it in your browser settings.');
      } else if (event.error === 'no-speech') {
        setErrorMsg('No speech detected. Tap "Try Again" to retry.');
      } else {
        setErrorMsg(`Voice error: ${event.error}. Please try again.`);
      }
      setPhase('error');
    };

    recognition.onend = () => {
      if (!isMountedRef.current) return;
      const text = latestTranscriptRef.current.trim();
      if (!text) {
        setErrorMsg('Nothing was heard. Try speaking again.');
        setPhase('error');
        return;
      }
      setPhase('suggesting');
      suggestMission(text)
        .then(s => {
          if (!isMountedRef.current) return;
          setSuggestion(s);
          setPhase('suggested');
        })
        .catch(err => {
          if (!isMountedRef.current) return;
          setErrorMsg(err instanceof Error ? err.message : 'Could not refine transcript. Try again.');
          setPhase('error');
        });
    };

    recognition.start();
  };

  const handleLaunch = async () => {
    if (!suggestion) return;
    setLaunching(true);
    try {
      const mission = await createMission(suggestion.description, 'all');
      if (!isMountedRef.current) return;
      onLaunch(mission);
    } catch {
      if (!isMountedRef.current) return;
      setErrorMsg('Failed to create mission. Is the backend running?');
      setPhase('error');
      setLaunching(false);
    }
  };

  const handleEdit = () => {
    if (!suggestion) return;
    onEdit(suggestion.description);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={phase === 'listening' ? onClose : undefined}
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-lg mx-auto animate-slide-up">
        <div className="bg-gray-950 border-t border-white/10 rounded-t-3xl shadow-2xl px-6 pt-5 pb-safe">
          {/* Handle */}
          <div className="flex justify-center mb-6">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          {/* ── Phase: Listening ── */}
          {phase === 'listening' && (
            <div className="flex flex-col items-center pb-8 gap-6">
              {/* Pulsing mic ring */}
              <div className="relative flex items-center justify-center">
                <div className="absolute w-28 h-28 rounded-full bg-violet-500/10 animate-ping" />
                <div className="absolute w-20 h-20 rounded-full bg-violet-500/15 animate-pulse" />
                <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-violet-600/40 to-purple-700/30 border border-violet-500/40 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-300">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
              </div>

              {/* Transcript or prompt */}
              <div className="min-h-[4rem] flex items-center justify-center px-4">
                {transcript ? (
                  <p className="text-white/80 text-center text-base leading-relaxed">
                    "{transcript}"
                  </p>
                ) : (
                  <p className="text-white/35 text-center text-sm leading-relaxed">
                    Speak your mission...
                  </p>
                )}
              </div>

              {/* Listening label */}
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Listening — pause to finish
              </p>

              <button onClick={onClose} className="btn-ghost text-sm px-6">
                Cancel
              </button>
            </div>
          )}

          {/* ── Phase: Suggesting ── */}
          {phase === 'suggesting' && (
            <div className="flex flex-col items-center pb-8 gap-6">
              {/* Spinner ring */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600/20 to-purple-700/10 border border-violet-500/30 flex items-center justify-center">
                <svg className="animate-spin w-7 h-7 text-violet-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>

              <div className="text-center gap-1 flex flex-col">
                <p className="text-white/70 text-sm font-medium">Understanding your mission...</p>
                {transcript && (
                  <p className="text-white/25 text-xs px-6 leading-relaxed line-clamp-2">
                    "{transcript}"
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Phase: Suggested ── */}
          {phase === 'suggested' && suggestion && (
            <div className="flex flex-col pb-6 gap-5">
              {/* Header */}
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Mission Suggestion</p>
              </div>

              {/* Card */}
              <div className="bg-white/4 border border-white/10 rounded-2xl p-4 space-y-2">
                <h3 className="font-semibold text-white text-base leading-snug">
                  {suggestion.title}
                </h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  {suggestion.description}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleEdit}
                  className="flex-1 h-12 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm text-white/70 font-medium transition-all"
                >
                  Edit freely
                </button>
                <button
                  onClick={handleLaunch}
                  disabled={launching}
                  className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {launching ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Launching...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      Launch Agent
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Phase: Error ── */}
          {phase === 'error' && (
            <div className="flex flex-col items-center pb-8 gap-6">
              <div className="w-16 h-16 rounded-full bg-red-950/40 border border-red-500/25 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <p className="text-sm text-red-400 text-center bg-red-950/40 border border-red-500/20 rounded-2xl px-4 py-3 leading-relaxed">
                {errorMsg}
              </p>

              <div className="flex gap-3 w-full">
                <button onClick={onClose} className="flex-1 h-12 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm text-white/70 font-medium transition-all">
                  Cancel
                </button>
                <button onClick={startListening} className="flex-1 btn-primary flex items-center justify-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
