import { phoneBridge } from './phone-bridge';
import { contactsStore } from './contacts-store';

// ─── Web Search ────────────────────────────────────────────────────────────────

export async function webSearch(query: string): Promise<string> {
  try {
    // 1) Try DuckDuckGo instant-answers API (great for facts, calculations, etc.)
    const ddgUrl =
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentFit/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    const ddg = await ddgRes.json() as {
      AbstractText?: string;
      Answer?: string;
      RelatedTopics?: Array<{ Text?: string }>;
    };

    const parts: string[] = [];
    if (ddg.Answer) parts.push(`Answer: ${ddg.Answer}`);
    if (ddg.AbstractText) parts.push(ddg.AbstractText);
    if (ddg.RelatedTopics && ddg.RelatedTopics.length > 0) {
      const topics = ddg.RelatedTopics
        .filter(t => t.Text)
        .slice(0, 4)
        .map(t => `• ${t.Text}`);
      if (topics.length > 0) parts.push(topics.join('\n'));
    }

    if (parts.length > 0) return `Search: "${query}"\n\n${parts.join('\n\n')}`;

    // 2) Fall back to scraping DuckDuckGo HTML results
    return await scrapeDDG(query);
  } catch (e) {
    return `Search error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function scrapeDDG(query: string): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(12000),
  });
  const html = await res.text();

  const snippets: string[] = [];
  const re = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && snippets.length < 5) {
    const t = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    if (t) snippets.push(t);
  }

  if (snippets.length === 0) return `No results found for: "${query}"`;
  return `Search results for "${query}":\n${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

// ─── Fetch URL ─────────────────────────────────────────────────────────────────

export async function fetchUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    });

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = await res.text();
      return json.slice(0, 4000);
    }

    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 4000);

    return text || 'Page appears to be empty or JavaScript-only.';
  } catch (e) {
    return `Fetch error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─── Contact lookup ────────────────────────────────────────────────────────────

/**
 * Search the user's synced contacts by name.
 * Returns matching contacts with their phone numbers.
 */
export function lookupContact(name: string): string {
  if (contactsStore.count() === 0) {
    return (
      '⚠️ No contacts synced yet. ' +
      'Open the Agent Fit app on the iPhone to sync contacts, then try again.'
    );
  }

  const matches = contactsStore.lookup(name);
  if (matches.length === 0) {
    return `No contact found for "${name}". Ask the user for the phone number directly.`;
  }

  const lines = matches
    .slice(0, 5) // top 5 matches
    .map(c => `• ${c.name}: ${c.phone}`);
  return `Found ${matches.length} match(es) for "${name}":\n${lines.join('\n')}`;
}

// ─── Phone Actions (direct URL scheme — no Shortcuts needed) ──────────────────

/**
 * Sends a phone_action command to the iPhone app via SSE.
 * The app converts it into a native iOS URL scheme call.
 */
function sendPhoneAction(payload: Record<string, string>): string {
  const connected = phoneBridge.send({ type: 'phone_action', ...payload });
  if (!connected) {
    return '⚠️ Phone not connected — open the Agent Fit app on your iPhone first.';
  }
  return null as unknown as string; // caller returns its own success message
}

/**
 * Open WhatsApp with a pre-filled message to a phone number.
 * The user just taps Send — no Shortcuts needed.
 * @param phoneNumber  International format, e.g. +972501234567 or 972501234567
 * @param message      Message text
 */
export function openWhatsApp(phoneNumber: string, message: string): string {
  // Strip non-digits except leading +
  const phone = phoneNumber.replace(/[^\d+]/g, '').replace(/^\+/, '');
  const err = sendPhoneAction({ action: 'whatsapp', phone, message });
  if (err) return err;
  return `✅ Opening WhatsApp on your iPhone → message to ${phoneNumber} pre-filled. Tap Send to deliver it.`;
}

/**
 * Initiate a phone call (shows call confirmation dialog on iPhone).
 */
export function makeCall(phoneNumber: string): string {
  const phone = phoneNumber.replace(/\s/g, '');
  const err = sendPhoneAction({ action: 'call', phone });
  if (err) return err;
  return `✅ Initiating call to ${phoneNumber} on your iPhone.`;
}

/**
 * Open iMessage/SMS with a pre-filled message.
 */
export function sendSms(phoneNumber: string, message: string): string {
  const phone = phoneNumber.replace(/\s/g, '');
  const err = sendPhoneAction({ action: 'sms', phone, message });
  if (err) return err;
  return `✅ Opening Messages on your iPhone → SMS to ${phoneNumber} pre-filled. Tap Send to deliver it.`;
}

/**
 * Open the Mail app with a pre-filled email.
 */
export function openEmail(to: string, subject: string, body: string): string {
  const err = sendPhoneAction({ action: 'email', to, subject, body });
  if (err) return err;
  return `✅ Opening Mail on your iPhone → email to ${to} pre-filled. Tap Send to deliver it.`;
}

/**
 * Open Apple Maps with directions to a destination.
 */
export function openMaps(destination: string): string {
  const err = sendPhoneAction({ action: 'maps', destination });
  if (err) return err;
  return `✅ Opening Maps on your iPhone → directions to "${destination}".`;
}

/**
 * Open any installed app by name.
 * Supports: Spotify, YouTube, Instagram, Twitter/X, TikTok, Telegram,
 *           WhatsApp, FaceTime, Gmail, Snapchat, Netflix, Uber, and more.
 */
export function openApp(appName: string): string {
  const err = sendPhoneAction({ action: 'open_app', app: appName });
  if (err) return err;
  return `✅ Opening ${appName} on your iPhone.`;
}

/**
 * Open any URL in Safari.
 */
export function openUrl(url: string): string {
  const err = sendPhoneAction({ action: 'open_url', url });
  if (err) return err;
  return `✅ Opening ${url} in Safari on your iPhone.`;
}
