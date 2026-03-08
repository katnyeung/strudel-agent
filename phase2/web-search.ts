/**
 * Web Search — lightweight search for the vibe pipeline.
 *
 * Uses a simple approach: fetch from a search API or scrape.
 * In production, swap this for a proper search API (Brave, Serper, Tavily, etc.)
 *
 * For now, supports:
 *   - Direct URL fetching (for known music resources)
 *   - LLM-powered "virtual search" (uses the LLM's training knowledge as fallback)
 */

// ═══════════════════════════════════════════════════
// Search via external API (configure your preferred provider)
// ═══════════════════════════════════════════════════

const SEARCH_API_KEY = process.env.SEARCH_API_KEY ?? '';
const SEARCH_PROVIDER = process.env.SEARCH_PROVIDER ?? 'none'; // 'brave', 'serper', 'tavily', 'none'

export async function webSearch(query: string): Promise<string> {
  console.log(`[web-search] query: "${query}"`);

  switch (SEARCH_PROVIDER) {
    case 'brave':
      return braveSearch(query);
    case 'serper':
      return serperSearch(query);
    case 'tavily':
      return tavilySearch(query);
    default:
      console.log('[web-search] no search provider configured — using LLM knowledge only');
      return '';
  }
}

export async function webFetch(url: string): Promise<string> {
  console.log(`[web-fetch] url: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'StrudelAgent/1.0 (music research)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return '';
    const text = await res.text();
    // Strip HTML tags for plain text extraction
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  } catch (e: any) {
    console.log(`[web-fetch] failed: ${e.message}`);
    return '';
  }
}

// ═══════════════════════════════════════════════════
// Provider implementations
// ═══════════════════════════════════════════════════

async function braveSearch(query: string): Promise<string> {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': SEARCH_API_KEY,
    },
  });
  if (!res.ok) return '';
  const data = await res.json() as any;
  return (data.web?.results ?? [])
    .map((r: any) => `${r.title}: ${r.description}`)
    .join('\n');
}

async function serperSearch(query: string): Promise<string> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': SEARCH_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!res.ok) return '';
  const data = await res.json() as any;
  return (data.organic ?? [])
    .map((r: any) => `${r.title}: ${r.snippet}`)
    .join('\n');
}

async function tavilySearch(query: string): Promise<string> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: SEARCH_API_KEY,
      query,
      max_results: 5,
      search_depth: 'basic',
    }),
  });
  if (!res.ok) return '';
  const data = await res.json() as any;
  return (data.results ?? [])
    .map((r: any) => `${r.title}: ${r.content?.slice(0, 300)}`)
    .join('\n');
}
