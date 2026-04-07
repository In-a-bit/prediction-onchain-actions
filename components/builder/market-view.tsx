"use client";

import { useBuilder } from "./builder-provider";
import { OrderBook } from "./order-book";
import { TradePanel } from "./trade-panel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function MarketView() {
  const { selectedMarket, selectedOutcomeIndex } = useBuilder();

  if (!selectedMarket) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
        <svg
          className="h-12 w-12 text-zinc-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </svg>
        <p className="text-sm">Select a market from the left panel</p>
      </div>
    );
  }

  const tokenId = selectedMarket.clobTokenIds[selectedOutcomeIndex] || "";
  const endDate = selectedMarket.endDate
    ? new Date(selectedMarket.endDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Market header */}
      <div className="border-b border-zinc-800 p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-zinc-100">
              {selectedMarket.question}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {selectedMarket.outcomes.map((outcome, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1",
                    i === 0 ? "bg-emerald-900/30" : "bg-red-900/30"
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-medium",
                      i === 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {outcome}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      i === 0 ? "text-emerald-300" : "text-red-300"
                    )}
                  >
                    {(selectedMarket.outcomePrices[i] * 100).toFixed(1)}¢
                  </span>
                </div>
              ))}
              <div className="h-4 w-px bg-zinc-700" />
              <span className="text-xs text-zinc-500">
                Vol: {formatVolume(selectedMarket.volume)}
              </span>
              <span className="text-xs text-zinc-500">
                Liq: {formatVolume(selectedMarket.liquidity)}
              </span>
              {selectedMarket.spread > 0 && (
                <span className="text-xs text-zinc-500">
                  Spread: {(selectedMarket.spread * 100).toFixed(1)}¢
                </span>
              )}
              {endDate && (
                <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-500">
                  Ends {endDate}
                </Badge>
              )}
              {selectedMarket.negRisk && (
                <Badge variant="outline" className="border-amber-800 text-[10px] text-amber-400">
                  Neg Risk
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Order book + Trade panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 border-r border-zinc-800">
          <div className="border-b border-zinc-800 px-3 py-2">
            <h3 className="text-xs font-semibold text-zinc-400">Order Book</h3>
          </div>
          <div className="h-[calc(100%-33px)]">
            <OrderBook tokenId={tokenId} />
          </div>
        </div>
        <div className="w-72 shrink-0">
          <div className="border-b border-zinc-800 px-3 py-2">
            <h3 className="text-xs font-semibold text-zinc-400">Trade</h3>
          </div>
          <TradePanel />
        </div>
      </div>
    </div>
  );
}
