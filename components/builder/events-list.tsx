"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useBuilder } from "./builder-provider";
import type { GammaEvent } from "@/lib/polymarket/types";
import { parseMarket } from "@/lib/polymarket/types";
import { fetchEvents as fetchEventsClient } from "@/lib/polymarket/gamma-client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { label: "All", tag: "" },
  { label: "Crypto", tag: "crypto" },
  { label: "Politics", tag: "politics" },
  { label: "Sports", tag: "sports" },
  { label: "Pop Culture", tag: "pop-culture" },
  { label: "Business", tag: "business" },
  { label: "Science", tag: "science" },
] as const;

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPercent(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function EventsList() {
  const { selectMarket, selectedMarket } = useBuilder();
  const [events, setEvents] = useState<GammaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load initial events when tag changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEvents([]);
    setHasMore(true);

    const tag = activeTag || undefined;
    console.log(`[events-list] Loading events, tag="${activeTag}", passing=${tag}`);
    fetchEventsClient(0, tag)
      .then((data) => {
        if (cancelled) return;
        console.log(`[events-list] Received ${data.length} events for tag="${activeTag}"`);
        setEvents(data);
        setHasMore(data.length === 30);
      })
      .catch((err) => {
        console.error("[events-list] fetchEvents error:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    return () => { cancelled = true; };
  }, [activeTag]);

  function handleLoadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    const tag = activeTag || undefined;
    fetchEventsClient(events.length, tag)
      .then((data) => {
        setEvents((prev) => [...prev, ...data]);
        setHasMore(data.length === 30);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  function handleCategoryClick(tag: string) {
    if (tag === activeTag) return;
    setSearch("");
    setActiveTag(tag);
  }

  // Filter: only show events with active, non-closed markets accepting orders
  const filtered = useMemo(() => {
    const withActiveMarkets = events
      .map((e) => ({
        ...e,
        markets: (e.markets || []).filter(
          (m) => m.active && !m.closed && m.enableOrderBook
        ),
      }))
      .filter((e) => e.markets.length > 0);

    if (!search.trim()) return withActiveMarkets;
    const q = search.toLowerCase();
    return withActiveMarkets.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.markets.some((m) => m.question.toLowerCase().includes(q))
    );
  }, [events, search]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 p-3">
        <h2 className="mb-2 text-sm font-semibold text-zinc-300">Markets</h2>
        <Input
          placeholder="Search loaded markets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 border-zinc-700 bg-zinc-800 text-xs text-zinc-300 placeholder:text-zinc-600"
        />
      </div>

      {/* Category tabs */}
      <div className="shrink-0 border-b border-zinc-800">
        <div className="flex gap-1 overflow-x-auto p-2 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.tag}
              onClick={() => handleCategoryClick(cat.tag)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                activeTag === cat.tag
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable events list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="p-2">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="mb-2 rounded-lg border border-zinc-800 p-3">
                <Skeleton className="mb-2 h-4 w-3/4 bg-zinc-800" />
                <Skeleton className="h-3 w-1/2 bg-zinc-800" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">No markets found</p>
          ) : (
            filtered.map((event) => (
              <div key={event.id} className="mb-2">
                <div className="mb-1 flex items-center gap-2 px-1">
                  {event.image && (
                    <img
                      src={event.image}
                      alt=""
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  )}
                  <span className="truncate text-xs font-medium text-zinc-400">
                    {event.title}
                  </span>
                  {event.tags && event.tags.length > 0 && (
                    <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500">
                      {event.tags[0].label}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[10px] text-zinc-600">
                    {formatVolume(event.volume || 0)} vol
                  </span>
                </div>
                {event.markets?.map((m) => {
                  const parsed = parseMarket(m);
                  const isSelected = selectedMarket?.conditionId === parsed.conditionId;
                  const yesPrice = parsed.outcomePrices[0] || 0;
                  const noPrice = parsed.outcomePrices[1] || 0;

                  return (
                    <button
                      key={m.id}
                      onClick={() => selectMarket(parsed)}
                      className={cn(
                        "mb-1 w-full rounded-lg border p-2.5 text-left transition-all",
                        isSelected
                          ? "border-emerald-600/50 bg-emerald-950/30"
                          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900"
                      )}
                    >
                      <p className="mb-1.5 text-xs font-medium leading-tight text-zinc-200">
                        {m.question || event.title}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                          Yes {formatPercent(yesPrice)}
                        </span>
                        <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                          No {formatPercent(noPrice)}
                        </span>
                        {parsed.oneDayPriceChange !== 0 && (
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              parsed.oneDayPriceChange > 0
                                ? "text-emerald-400"
                                : "text-red-400"
                            )}
                          >
                            {parsed.oneDayPriceChange > 0 ? "+" : ""}
                            {(parsed.oneDayPriceChange * 100).toFixed(1)}%
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-zinc-600">
                          {formatVolume(parsed.volume)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
          {hasMore && !loading && events.length > 0 && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full rounded-lg border border-zinc-800 p-2 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
