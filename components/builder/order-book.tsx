"use client";

import { useState, useEffect, useCallback } from "react";
import { getOrderBook } from "@/lib/polymarket/actions";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderLevel {
  price: string;
  size: string;
}

interface OrderBookData {
  bids: OrderLevel[];
  asks: OrderLevel[];
  lastTradePrice: string;
  spread: string;
}

const MAX_LEVELS = 10;

export function OrderBook({ tokenId }: { tokenId: string }) {
  const [data, setData] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBook = useCallback(async () => {
    if (!tokenId) return;
    try {
      const book = await getOrderBook(tokenId);
      const bids = (book.bids || [])
        .sort((a, b) => Number(b.price) - Number(a.price))
        .slice(0, MAX_LEVELS);
      const asks = (book.asks || [])
        .sort((a, b) => Number(a.price) - Number(b.price))
        .slice(0, MAX_LEVELS);

      const bestBid = bids[0] ? Number(bids[0].price) : 0;
      const bestAsk = asks[0] ? Number(asks[0].price) : 0;
      const spread =
        bestAsk > 0 && bestBid > 0
          ? (bestAsk - bestBid).toFixed(4)
          : "—";

      setData({
        bids,
        asks,
        lastTradePrice: book.last_trade_price || "—",
        spread,
      });
    } catch {
      // silent — stale data is preferable to a broken UI on transient failures
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetchBook();
    const interval = setInterval(fetchBook, 5000);
    return () => clearInterval(interval);
  }, [fetchBook]);

  if (!tokenId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-zinc-500">
          Select an outcome to view order book
        </p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-1 p-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full bg-zinc-800" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const maxBidSize = Math.max(...data.bids.map((b) => Number(b.size)), 1);
  const maxAskSize = Math.max(...data.asks.map((a) => Number(a.size)), 1);

  // Display asks in reverse order (highest at top, lowest near spread)
  const displayedAsks = [...data.asks].reverse();

  return (
    <div className="flex h-full flex-col text-xs">
      {/* Header */}
      <div className="flex items-center border-b border-zinc-800 px-3 py-2">
        <span className="flex-1 text-zinc-500">Price</span>
        <span className="w-20 text-right text-zinc-500">Size</span>
        <span className="w-20 text-right text-zinc-500">Total</span>
      </div>

      {/* Asks */}
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col justify-end">
          {displayedAsks.map((ask, i) => {
            const pct = (Number(ask.size) / maxAskSize) * 100;
            return (
              <div
                key={`ask-${i}`}
                className="relative flex items-center px-3 py-[3px] font-mono"
              >
                <div
                  className="absolute inset-y-0 right-0 bg-red-500/10"
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex-1 text-red-400">
                  {Number(ask.price).toFixed(4)}
                </span>
                <span className="relative w-20 text-right text-zinc-400">
                  {Number(ask.size).toLocaleString()}
                </span>
                <span className="relative w-20 text-right text-zinc-500">
                  {(Number(ask.price) * Number(ask.size)).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spread / Last Price */}
      <div className="flex items-center justify-between border-y border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
        <span className="font-mono font-semibold text-white">
          {data.lastTradePrice !== "—"
            ? Number(data.lastTradePrice).toFixed(4)
            : "—"}
        </span>
        <span className="text-zinc-500">Spread: {data.spread}</span>
      </div>

      {/* Bids */}
      <div className="flex-1 overflow-hidden">
        {data.bids.map((bid, i) => {
          const pct = (Number(bid.size) / maxBidSize) * 100;
          return (
            <div
              key={`bid-${i}`}
              className="relative flex items-center px-3 py-[3px] font-mono"
            >
              <div
                className="absolute inset-y-0 right-0 bg-emerald-500/10"
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex-1 text-emerald-400">
                {Number(bid.price).toFixed(4)}
              </span>
              <span className="relative w-20 text-right text-zinc-400">
                {Number(bid.size).toLocaleString()}
              </span>
              <span className="relative w-20 text-right text-zinc-500">
                {(Number(bid.price) * Number(bid.size)).toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
