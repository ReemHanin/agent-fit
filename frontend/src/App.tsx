import { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Contacts } from '@capacitor-community/contacts';
import { Home } from './pages/Home';
import { MissionDetail } from './pages/MissionDetail';

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

// ─── Sync phone contacts to backend ──────────────────────────────────────────
async function syncContacts() {
  try {
    // Request permission
    const perm = await Contacts.requestPermissions();
    if (perm.contacts !== 'granted') return;

    // Read all contacts (name + phones only)
    const result = await Contacts.getContacts({
      projection: { name: true, phones: true },
    });

    // Flatten: one entry per phone number
    const flat: Array<{ name: string; phone: string }> = [];
    for (const c of result.contacts) {
      const name = c.name?.display ?? c.name?.given ?? '';
      if (!name) continue;
      for (const p of c.phones ?? []) {
        if (p.number) flat.push({ name, phone: p.number });
      }
    }

    if (flat.length === 0) return;

    await fetch(`${BASE}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: flat }),
    });

    console.log(`[AgentFit] Synced ${flat.length} contacts to backend`);
  } catch (e) {
    // Contacts not available in browser/simulator — ignore silently
    console.log('[AgentFit] Contacts sync skipped:', e);
  }
}

// ─── App name → URL scheme mapping ────────────────────────────────────────────
const APP_SCHEMES: Record<string, string> = {
  spotify:    'spotify://',
  youtube:    'youtube://',
  instagram:  'instagram://',
  twitter:    'twitter://',
  x:          'twitter://',
  tiktok:     'tiktok://',
  whatsapp:   'whatsapp://',
  telegram:   'tg://',
  facetime:   'facetime://',
  maps:       'maps://',
  gmail:      'googlegmail://co',
  snapchat:   'snapchat://',
  netflix:    'nflx://',
  uber:       'uber://',
  lyft:       'lyft://',
  linkedin:   'linkedin://',
  facebook:   'fb://',
  messenger:  'fb-messenger://',
  reddit:     'reddit://',
  discord:    'discord://',
  airbnb:     'airbnb://',
  amazon:     'com.amazon.mobile.shopping://',
  shazam:     'shazam://',
  clock:      'clock-alarm://',
  calendar:   'calshow://',
  notes:      'mobilenotes://',
  settings:   'App-Prefs:',
};

// ─── Navigate to an iOS URL scheme from WKWebView ─────────────────────────────
function openScheme(url: string) {
  const a = document.createElement('a');
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Handle phone_action commands from the agent ──────────────────────────────
interface PhoneActionCmd {
  type: 'phone_action';
  action: string;
  phone?: string;
  message?: string;
  to?: string;
  subject?: string;
  body?: string;
  destination?: string;
  app?: string;
  url?: string;
}

function handlePhoneAction(cmd: PhoneActionCmd): string {
  const e = encodeURIComponent;
  switch (cmd.action) {
    case 'whatsapp': {
      const phone = (cmd.phone ?? '').replace(/^\+/, '');
      openScheme(`https://wa.me/${phone}?text=${e(cmd.message ?? '')}`);
      return `Opening WhatsApp → ${cmd.phone}`;
    }
    case 'call':
      openScheme(`tel://${cmd.phone ?? ''}`);
      return `Calling ${cmd.phone}`;
    case 'sms':
      openScheme(`sms://${cmd.phone ?? ''}?body=${e(cmd.message ?? '')}`);
      return `Opening Messages → ${cmd.phone}`;
    case 'email':
      openScheme(
        `mailto:${cmd.to ?? ''}?subject=${e(cmd.subject ?? '')}&body=${e(cmd.body ?? '')}`
      );
      return `Opening Mail → ${cmd.to}`;
    case 'maps':
      openScheme(`maps://?q=${e(cmd.destination ?? '')}`);
      return `Opening Maps → ${cmd.destination}`;
    case 'open_app': {
      const key = (cmd.app ?? '').toLowerCase();
      const scheme = APP_SCHEMES[key] ?? `${key}://`;
      openScheme(scheme);
      return `Opening ${cmd.app}`;
    }
    case 'open_url':
      openScheme(cmd.url ?? '');
      return `Opening ${cmd.url}`;
    default:
      return `Unknown action: ${cmd.action}`;
  }
}

// ─── Phone-connected status dot ───────────────────────────────────────────────
function PhoneStatus({ connected }: { connected: boolean }) {
  return (
    <div
      className="fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: 'rgba(15,10,26,0.85)', backdropFilter: 'blur(6px)' }}
    >
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
      <span className={connected ? 'text-emerald-400' : 'text-zinc-500'}>
        {connected ? 'Phone' : 'No phone'}
      </span>
    </div>
  );
}

// ─── Action toast ─────────────────────────────────────────────────────────────
function ActionToast({ message }: { message: string | null }) {
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
      <div className="w-full max-w-[430px] relative flex flex-col min-h-screen bg-[#0f0a1a] overflow-hidden shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setActionToast(msg);
    toastTimerRef.current = setTimeout(() => setActionToast(null), 4000);
  }

  // Sync contacts once on app launch
  useEffect(() => {
    syncContacts();
  }, []);

  // Persistent SSE connection for agent → phone commands
  useEffect(() => {
    function connect() {
      const es = new EventSource(`${BASE}/phone/events`);
      esRef.current = es;

      es.onopen = () => setPhoneConnected(true);

      es.onmessage = (event) => {
        try {
          const cmd = JSON.parse(event.data) as { type: string } & PhoneActionCmd;

          if (cmd.type === 'connected') setPhoneConnected(true);

          if (cmd.type === 'phone_action') {
            const label = handlePhoneAction(cmd);
            showToast(`⚡ ${label}`);
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        setPhoneConnected(false);
        es.close();
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
        <ActionToast message={actionToast} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mission/:id" element={<MissionDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
