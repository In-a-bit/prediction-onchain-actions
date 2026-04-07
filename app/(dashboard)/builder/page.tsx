"use client";

import { BuilderProvider } from "@/components/builder/builder-provider";
import { WalletPanel } from "@/components/builder/wallet-panel";
import { EventsList } from "@/components/builder/events-list";
import { MarketView } from "@/components/builder/market-view";
import { PositionsPanel } from "@/components/builder/positions-panel";

export default function BuilderPage() {
  return (
    <BuilderProvider>
      <div className="flex h-full flex-col bg-zinc-950">
        {/* Top bar: Wallet */}
        <div className="shrink-0 border-b border-zinc-800 p-3">
          <WalletPanel />
        </div>

        {/* Main content — fills remaining height */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Markets browser */}
          <div className="w-72 shrink-0 border-r border-zinc-800 overflow-hidden">
            <EventsList />
          </div>

          {/* Right: Market + Orders split vertically */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Market detail + Order book + Trade */}
            <div className="flex-1 overflow-hidden">
              <MarketView />
            </div>

            {/* Positions, Open Orders & Trades — 40% of right panel */}
            <div className="h-[40%] min-h-[200px] shrink-0 border-t border-zinc-800 overflow-hidden">
              <PositionsPanel />
            </div>
          </div>
        </div>
      </div>
    </BuilderProvider>
  );
}
