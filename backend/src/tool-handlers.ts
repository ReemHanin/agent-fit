import { phoneBridge } from './phone-bridge';

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

// ─── Run iOS Shortcut ──────────────────────────────────────────────────────────

/**
 * Sends a command to the iPhone app via SSE to trigger an iOS Shortcut.
 * The app translates this into a `shortcuts://run-shortcut?name=...` URL.
 *
 * @param shortcutName  Exact name of the iOS Shortcut (e.g. "AgentSendWhatsApp")
 * @param input         Text passed as the shortcut's input (e.g. "Mom: I'll be late")
 */
export function runIosShortcut(shortcutName: string, input: string): string {
  const connected = phoneBridge.send({
    type: 'run_shortcut',
    shortcut: shortcutName,
    input: input ?? '',
  });

  if (!connected) {
    return (
      '⚠️ Phone is not connected. ' +
      'The Agent Fit app must be open on your iPhone to receive shortcut commands.'
    );
  }

  return `✅ Shortcut "${shortcutName}" triggered on your iPhone` +
    (input ? ` with input: "${input}"` : '') + '.';
}
