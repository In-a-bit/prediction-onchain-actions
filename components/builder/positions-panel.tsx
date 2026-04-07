"use client";

import { useState, useEffect, useRef } from "react";
import { useBuilder } from "./builder-provider";
import { cancelOrderClient, placeMarketOrderClient } from "@/lib/polymarket/trading-client";
import { fetchMarketBySlug } from "@/lib/polymarket/gamma-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatTime(ts: number | string) {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateId(id: string) {
  if (!id) return "";
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function formatUsd(v: string | number) {
  const n = Number(v);
  if (isNaN(n)) return "$0.00";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PositionsPanel() {
  const {
    connected,
    privateKey,
    creds,
    walletBalances,
    orders,
    trades,
    positions,
    refreshOrders,
    refreshTrades,
    refreshPositions,
    refreshAll,
    selectMarket,
    setSelectedOutcomeIndex,
    setSellIntent,
  } = useBuilder();

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [sellingAsset, setSellingAsset] = useState<string | null>(null);
  const [sellResult, setSellResult] = useState<{ asset: string; success: boolean; message: string } | null>(null);
  const [loadingMarket, setLoadingMarket] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh every 3s (only starts once walletBalances is available)
  useEffect(() => {
    if (!connected || !walletBalances) return;
    const poll = () => {
      refreshOrders();
      refreshTrades();
      refreshPositions();
    };
    intervalRef.current = setInterval(poll, 3_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [connected, !!walletBalances]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([refreshOrders(), refreshTrades(), refreshPositions()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCancel(orderId: string) {
    if (!creds) return;
    setCancellingId(orderId);
    try {
      await cancelOrderClient(privateKey, creds, orderId);
      await refreshOrders();
    } catch {
      // silent
    } finally {
      setCancellingId(null);
    }
  }

  async function handleLimitSell(pos: any) {
    const slug = String(pos.slug || "");
    if (!slug) return;
    const asset = String(pos.asset);
    setLoadingMarket(asset);
    try {
      const market = await fetchMarketBySlug(slug);
      if (!market) {
        setSellResult({ asset, success: false, message: "Could not load market data" });
        return;
      }
      selectMarket(market);
      // Find the outcome index matching this position's token
      const idx = market.clobTokenIds.indexOf(asset);
      if (idx >= 0) setSelectedOutcomeIndex(idx);
      // Signal the trade panel to pre-fill SELL
      setSellIntent({
        tokenID: asset,
        size: Number(pos.size || pos.amount || 0),
        price: Number(pos.currentPrice || pos.curPrice || pos.avgPrice || pos.price || 0),
        outcome: String(pos.outcome || ""),
        conditionId: String(pos.conditionId || ""),
        negRisk: Boolean(pos.negativeRisk ?? pos.negRisk ?? false),
        title: String(pos.title || pos.question || pos.market || ""),
      });
    } catch (e: any) {
      setSellResult({ asset, success: false, message: e?.message || "Failed to load market" });
    } finally {
      setLoadingMarket(null);
    }
  }

  async function handleMarketSell(pos: any) {
    if (!creds) return;
    const asset = String(pos.asset);
    setSellingAsset(asset);
    setSellResult(null);
    try {
      const size = Number(pos.size || pos.amount || 0);
      const negRisk = Boolean(pos.negativeRisk ?? pos.negRisk ?? false);
      const res = await placeMarketOrderClient(privateKey, creds, {
        tokenID: asset,
        amount: size,
        side: "SELL",
        negRisk,
        price: 0.01, // floor price to avoid "invalid price" for cheap shares
      });
      console.log("[positions] market sell response:", JSON.stringify(res));
      if (res?.orderID) {
        setSellResult({ asset, success: true, message: `Sold: ${res.orderID.slice(0, 12)}...` });
        refreshAll();
        setTimeout(() => refreshAll(), 2000);
      } else {
        const errMsg = res?.errorMsg || res?.error || res?.message || JSON.stringify(res);
        setSellResult({ asset, success: false, message: `Sell failed: ${errMsg}` });
      }
    } catch (e: any) {
      console.error("[positions] market sell error:", e);
      setSellResult({ asset, success: false, message: e?.message || "Market sell failed" });
    } finally {
      setSellingAsset(null);
    }
  }

  if (!connected) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-zinc-500">Connect wallet to view positions</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="positions" className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3">
        <TabsList className="h-9 bg-transparent">
          <TabsTrigger
            value="positions"
            className="text-xs text-zinc-400 hover:text-zinc-200 data-[state=active]:bg-zinc-800 data-[state=active]:text-white"
          >
            Positions ({positions.length})
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="text-xs text-zinc-400 hover:text-zinc-200 data-[state=active]:bg-zinc-800 data-[state=active]:text-white"
          >
            Open Orders ({orders.length})
          </TabsTrigger>
          <TabsTrigger
            value="trades"
            className="text-xs text-zinc-400 hover:text-zinc-200 data-[state=active]:bg-zinc-800 data-[state=active]:text-white"
          >
            Trades ({trades.length})
          </TabsTrigger>
        </TabsList>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-7 text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Positions tab */}
      <TabsContent value="positions" className="mt-0 flex-1 overflow-auto">
        {positions.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-xs text-zinc-500">No open positions</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-3 py-2 text-left font-medium">Market</th>
                <th className="px-3 py-2 text-left font-medium">Outcome</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">Avg Price</th>
                <th className="px-3 py-2 text-right font-medium">Current</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-right font-medium">P&L</th>
                <th className="px-3 py-2 text-right font-medium">Sell</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => {
                const size = Number(pos.size || (pos as any).amount || 0);
                const avgPrice = Number(pos.avgPrice || (pos as any).price || 0);
                const curPrice = Number(pos.currentPrice || (pos as any).curPrice || avgPrice);
                const value = size * curPrice;
                const cost = size * avgPrice;
                const pnl = value - cost;
                const pnlPct = cost > 0 ? ((pnl / cost) * 100) : 0;
                const title = String(pos.title || (pos as any).question || pos.market || pos.conditionId || "—");

                return (
                  <tr key={String(pos.asset || pos.conditionId || i)} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                    <td className="max-w-[200px] truncate px-3 py-2 text-zinc-300" title={title}>
                      {title.length > 40 ? title.slice(0, 40) + "..." : title}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          (pos.outcome || pos.side || "").toLowerCase().includes("yes") || pos.side === "LONG"
                            ? "border-emerald-800 text-emerald-400"
                            : "border-red-800 text-red-400"
                        )}
                      >
                        {pos.outcome || pos.side || "—"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300" title={`${size} shares`}>
                      {size.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400" title={`${avgPrice}`}>
                      {avgPrice.toFixed(2)}¢
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300" title={`${curPrice}`}>
                      {curPrice.toFixed(2)}¢
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300" title={`${value}`}>
                      {formatUsd(value)}
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-right font-mono",
                      pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    )} title={`PnL: ${pnl} (${pnlPct.toFixed(4)}%)`}>
                      {pnl >= 0 ? "+" : ""}{formatUsd(pnl)}
                      <span className="ml-1 text-[10px] text-zinc-500">
                        ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleLimitSell(pos)}
                          disabled={loadingMarket === String(pos.asset)}
                          className="h-6 px-2 text-[10px] text-amber-400 hover:bg-amber-900/30 hover:text-amber-300"
                        >
                          {loadingMarket === String(pos.asset) ? "..." : "Limit"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarketSell(pos)}
                          disabled={sellingAsset === String(pos.asset)}
                          className="h-6 px-2 text-[10px] text-red-400 hover:bg-red-900/30 hover:text-red-300"
                          title={`Market sell all ${size} shares at best available price (min 0.01)`}
                        >
                          {sellingAsset === String(pos.asset) ? "Selling..." : "Max Sell"}
                        </Button>
                      </div>
                      {sellResult && sellResult.asset === String(pos.asset) && (
                        <div className={cn(
                          "mt-1 rounded px-1.5 py-0.5 text-[10px]",
                          sellResult.success ? "bg-emerald-950/50 text-emerald-400" : "bg-red-950/50 text-red-400"
                        )}>
                          {sellResult.message}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TabsContent>

      {/* Orders tab */}
      <TabsContent value="orders" className="mt-0 flex-1 overflow-auto">
        {orders.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-xs text-zinc-500">No open orders</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-3 py-2 text-left font-medium">Side</th>
                <th className="px-3 py-2 text-left font-medium">Outcome</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">Filled</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        order.side === "BUY"
                          ? "border-emerald-800 text-emerald-400"
                          : "border-red-800 text-red-400"
                      )}
                    >
                      {order.side}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{order.outcome || "\u2014"}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-300">
                    {Number(order.price).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-300">
                    {Number(order.original_size).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {Number(order.size_matched).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{order.order_type}</td>
                  <td className="px-3 py-2 text-zinc-500">
                    {formatTime(order.created_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(order.id)}
                      disabled={cancellingId === order.id}
                      className="h-6 px-2 text-[10px] text-red-400 hover:bg-red-900/30 hover:text-red-300"
                    >
                      {cancellingId === order.id ? "..." : "Cancel"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TabsContent>

      {/* Trades tab */}
      <TabsContent value="trades" className="mt-0 flex-1 overflow-auto">
        {trades.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-xs text-zinc-500">No trades yet</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-3 py-2 text-left font-medium">Side</th>
                <th className="px-3 py-2 text-left font-medium">Outcome</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Tx</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        trade.side === "BUY"
                          ? "border-emerald-800 text-emerald-400"
                          : "border-red-800 text-red-400"
                      )}
                    >
                      {trade.side}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{trade.outcome || "\u2014"}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-300">
                    {Number(trade.price).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-300">
                    {Number(trade.size).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      "text-[10px]",
                      trade.trader_side === "MAKER" ? "text-blue-400" : "text-amber-400"
                    )}>
                      {trade.trader_side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {formatTime(trade.match_time || trade.timestamp || 0)}
                  </td>
                  <td className="px-3 py-2">
                    {(trade.transaction_hash || trade.transactionHash) && (
                      <a
                        href={`https://polygonscan.com/tx/${trade.transaction_hash || trade.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-blue-400 hover:text-blue-300"
                      >
                        {truncateId((trade.transaction_hash || trade.transactionHash)!)}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TabsContent>
    </Tabs>
  );
}
