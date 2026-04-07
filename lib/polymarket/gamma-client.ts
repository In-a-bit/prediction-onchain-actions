// Client-side API calls
// - Gamma API (via /api/gamma proxy to avoid CORS) for events/markets
// - data-api.polymarket.com (no CORS issues) for positions/trades

import type { GammaEvent, GammaMarket, ParsedMarket } from "./types";
import { parseMarket } from "./types";

const GAMMA_PROXY = "/api/gamma";
const DATA_API = "https://data-api.polymarket.com";

export async function fetchEvents(offset = 0, tag?: string): Promise<GammaEvent[]> {
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

export async function fetchMarketBySlug(slug: string): Promise<ParsedMarket | null> {
  const params = new URLSearchParams({ path: "markets", slug, limit: "1" });
  const res = await fetch(`${GAMMA_PROXY}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [];
  if (arr.length === 0) return null;
  return parseMarket(arr[0] as GammaMarket);
}

export async function fetchMarketByConditionId(conditionId: string): Promise<ParsedMarket | null> {
  const params = new URLSearchParams({ path: "markets", condition_id: conditionId, limit: "1" });
  const res = await fetch(`${GAMMA_PROXY}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [];
  if (arr.length === 0) return null;
  return parseMarket(arr[0] as GammaMarket);
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
