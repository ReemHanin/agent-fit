import { Mission } from './types';

// In dev, VITE_API_URL is empty so BASE = '/api' (handled by Vite proxy).
// In production (Vercel/Capacitor), set VITE_API_URL to the Railway backend URL.
const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

export async function getMissions(): Promise<Mission[]> {
  const res = await fetch(`${BASE}/missions`);
  if (!res.ok) throw new Error('Failed to fetch missions');
  return res.json();
}

export async function getMission(id: string): Promise<Mission> {
  const res = await fetch(`${BASE}/missions/${id}`);
  if (!res.ok) throw new Error('Mission not found');
  return res.json();
}

export async function createMission(
  description: string,
  notifyMode: 'all' | 'completion'
): Promise<Mission> {
  const res = await fetch(`${BASE}/missions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, notifyMode })
  });
  if (!res.ok) throw new Error('Failed to create mission');
  return res.json();
}

export function subscribeToMission(
  missionId: string,
  onEvent: (event: { type: string; [key: string]: unknown }) => void
): () => void {
  const es = new EventSource(`${BASE}/missions/${missionId}/events`);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
    } catch { /* ignore parse errors */ }
  };

  es.onerror = () => {
    // Reconnect is handled automatically by EventSource
  };

  return () => es.close();
}

export interface MissionSuggestion {
  title: string;
  description: string;
}

export async function suggestMission(transcript: string): Promise<MissionSuggestion> {
  const res = await fetch(`${BASE}/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Failed to get suggestion');
  }
  return res.json() as Promise<MissionSuggestion>;
}
