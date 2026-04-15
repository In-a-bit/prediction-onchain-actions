// Client-side API calls
// - Gamma API (via /api/gamma proxy to avoid CORS) for events/markets
// - data-api.polymarket.com (no CORS issues) for positions/trades

import type { GammaEvent, GammaMarket, ParsedMarket } from "./types";
import { parseMarket } from "./types";

const GAMMA_PROXY = "/api/gamma";
const DATA_API = "https://data-api.polymarket.com";

export async function fetchEvents(offset = 0, tag?: string, search?: string): Promise<GammaEvent[]> {
  if (search) {
    // Gamma API filtering is unreliable — cast a wide net with multiple queries,
    // then strictly filter client-side by the search term
    const eventsParams = new URLSearchParams({
      path: "events",
      closed: "false",
      active: "true",
      limit: "50",
      title_like: search,
    });
    if (tag) eventsParams.set("tag_slug", tag);

    // Also fetch top events by volume from related tags (catches price bracket markets)
    const volumeParams = new URLSearchParams({
      path: "events",
      closed: "false",
      active: "true",
      limit: "50",
      order: "volume24hr",
      ascending: "false",
    });
    if (tag) volumeParams.set("tag_slug", tag);

    const marketsParams = new URLSearchParams({
      path: "markets",
      closed: "false",
      active: "true",
      enableOrderBook: "true",
      limit: "50",
      question_like: search,
    });

    const [eventsRes, volumeRes, marketsRes] = await Promise.all([
      fetch(`${GAMMA_PROXY}?${eventsParams}`),
      fetch(`${GAMMA_PROXY}?${volumeParams}`),
      fetch(`${GAMMA_PROXY}?${marketsParams}`),
    ]);

    const events: GammaEvent[] = eventsRes.ok ? await eventsRes.json() : [];
    const volumeEvents: GammaEvent[] = volumeRes.ok ? await volumeRes.json() : [];
    const markets: GammaMarket[] = marketsRes.ok ? await marketsRes.json() : [];

    // Merge events + volumeEvents, dedup by id
    const seenEventIds = new Set<string>();
    const allEvents: GammaEvent[] = [];
    for (const e of [...events, ...volumeEvents]) {
      if (seenEventIds.has(e.id)) continue;
      seenEventIds.add(e.id);
      allEvents.push(e);
    }

    // Strict client-side filter — only keep events/markets actually matching the query
    const q = search.toLowerCase();

    const matchedEvents = allEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.markets?.some((m) => m.question.toLowerCase().includes(q))
    );

    // Wrap matching standalone markets as synthetic events (if not already in an event)
    const seenConditions = new Set<string>();
    for (const e of matchedEvents) {
      for (const m of e.markets || []) seenConditions.add(m.conditionId);
    }

    const syntheticEvents: GammaEvent[] = [];
    for (const m of markets) {
      if (!m.question.toLowerCase().includes(q)) continue;
      if (seenConditions.has(m.conditionId)) continue;
      seenConditions.add(m.conditionId);
      syntheticEvents.push({
        id: `market-${m.id}`,
        title: m.groupItemTitle || m.question,
        slug: m.slug || "",
        volume: Number(m.volume) || 0,
        markets: [m],
      } as GammaEvent);
    }

    return [...matchedEvents, ...syntheticEvents];
  }

  // Default: no search — fetch by volume
  const params = new URLSearchParams({
    path: "events",
    closed: "false",
    active: "true",
    limit: "30",
    order: "volume24hr",
    ascending: "false",
  });
  if (offset > 0) params.set("offset", String(offset));
  if (tag) params.set("tag_slug", tag);

  const res = await fetch(`${GAMMA_PROXY}?${params}`);
  if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
  return res.json();
}

// Gamma filters to open markets by default; passing closed=true returns closed markets only.
// To support trades/positions on resolved markets, probe both and return whichever hits.
async function gammaFetchMarkets(extra: Record<string, string>): Promise<GammaMarket[]> {
  const base = { path: "markets", limit: "1", ...extra };
  const tryFetch = async (params: Record<string, string>) => {
    const res = await fetch(`${GAMMA_PROXY}?${new URLSearchParams(params)}`);
    if (!res.ok) return [] as GammaMarket[];
    const data = await res.json();
    return Array.isArray(data) ? (data as GammaMarket[]) : [];
  };
  const open = await tryFetch(base);
  if (open.length > 0) return open;
  return tryFetch({ ...base, closed: "true" });
}

export async function fetchMarketBySlug(slug: string): Promise<ParsedMarket | null> {
  const arr = await gammaFetchMarkets({ slug });
  if (arr.length === 0) return null;
  return parseMarket(arr[0]);
}

export async function fetchMarketByConditionId(conditionId: string): Promise<ParsedMarket | null> {
  // Gamma API uses `condition_ids` (plural). The singular `condition_id` is silently
  // ignored and returns an unfiltered list, so this must stay plural.
  const arr = await gammaFetchMarkets({ condition_ids: conditionId });
  if (arr.length === 0) return null;
  const hit = arr.find((m) => m.conditionId === conditionId) || arr[0];
  return parseMarket(hit);
}

export async function getPositions(proxyAddress: string): Promise<any[]> {
  const url = `${DATA_API}/positions?user=${proxyAddress.toLowerCase()}&closed=false&limit=100&sizeThreshold=.01`;
  console.log(`[positions] Fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getTrades(proxyAddress: string): Promise<any[]> {
  const url = `${DATA_API}/trades?user=${proxyAddress.toLowerCase()}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getActivity(proxyAddress: string): Promise<any[]> {
  const url = `${DATA_API}/activity?user=${proxyAddress.toLowerCase()}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
