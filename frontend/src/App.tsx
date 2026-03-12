import { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { MissionDetail } from './pages/MissionDetail';

// Same base URL used by api.ts
const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

// ─── Open an iOS Shortcut via URL scheme ──────────────────────────────────────
function triggerShortcut(name: string, input: string) {
  const url =
    `shortcuts://run-shortcut?name=${encodeURIComponent(name)}` +
    (input ? `&input=text&text=${encodeURIComponent(input)}` : '');

  // Create a temporary <a> and click it so WKWebView hands the URL to iOS.
  // iOS intercepts the custom scheme and opens Shortcuts.app automatically.
  const a = document.createElement('a');
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Phone-connected status dot ───────────────────────────────────────────────
function PhoneStatus({ connected }: { connected: boolean }) {
  return (
    <div
      className="fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: 'rgba(15,10,26,0.85)', backdropFilter: 'blur(6px)' }}
    >
      <span
        className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`}
      />
      <span className={connected ? 'text-emerald-400' : 'text-zinc-500'}>
        {connected ? 'Phone' : 'No phone'}
      </span>
    </div>
  );
}

// ─── Shortcut toast notification ──────────────────────────────────────────────
function ShortcutToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-sm text-white shadow-lg whitespace-nowrap">
      <span>⚡</span>
      <span>{message}</span>
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center min-h-screen bg-gray-950">
      {/* Phone frame on desktop */}
      <div className="w-full max-w-[430px] relative flex flex-col min-h-screen bg-[#0f0a1a] overflow-hidden shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setShortcutToast(msg);
    toastTimerRef.current = setTimeout(() => setShortcutToast(null), 3500);
  }

  useEffect(() => {
    function connect() {
      const es = new EventSource(`${BASE}/phone/events`);
      esRef.current = es;

      es.onopen = () => setPhoneConnected(true);

      es.onmessage = (event) => {
        try {
          const cmd = JSON.parse(event.data) as {
            type: string;
            shortcut?: string;
            input?: string;
          };

          if (cmd.type === 'connected') {
            setPhoneConnected(true);
          }

          if (cmd.type === 'run_shortcut' && cmd.shortcut) {
            const name = cmd.shortcut;
            const input = cmd.input ?? '';
            triggerShortcut(name, input);
            showToast(`Running "${name}" on iPhone…`);
          }
        } catch { /* ignore malformed events */ }
      };

      es.onerror = () => {
        setPhoneConnected(false);
        es.close();
        // Auto-reconnect after 4 s
        setTimeout(connect, 4000);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  return (
    <BrowserRouter>
      <AppShell>
        <PhoneStatus connected={phoneConnected} />
        <ShortcutToast message={shortcutToast} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mission/:id" element={<MissionDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
