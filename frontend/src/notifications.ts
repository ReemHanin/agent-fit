// ── Service Worker registration ──────────────────────────────────────────────
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[SW] registered', reg.scope);
    return reg;
  } catch (err) {
    console.warn('[SW] registration failed', err);
    return null;
  }
}

// ── Notification permission ──────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// ── Send notification via Service Worker ────────────────────────────────────
async function getSW(): Promise<ServiceWorker | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.active;
}

export async function notifyMissionComplete(missionId: string, title: string) {
  if (Notification.permission !== 'granted') return;
  const sw = await getSW();
  if (sw) {
    sw.postMessage({ type: 'MISSION_COMPLETE', missionId, title });
  } else {
    // Fallback: direct notification (works when app is open)
    new Notification('Mission Complete ✅', {
      body: title,
      icon: '/icon.svg',
      tag: `mission-${missionId}`,
    });
  }
}

export async function notifyMissionProgress(missionId: string, message: string) {
  if (Notification.permission !== 'granted') return;
  const sw = await getSW();
  if (sw) {
    sw.postMessage({ type: 'MISSION_PROGRESS', missionId, message });
  }
}
