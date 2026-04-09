"use client";

import { useState, useEffect } from "react";
import { useBuilder } from "./builder-provider";
import { placeLimitOrderClient, placeMarketOrderClient } from "@/lib/polymarket/trading-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function TradePanel() {
  const {
    connected,
    signerKey,
    creds,
    selectedMarket,
    selectedOutcomeIndex,
    setSelectedOutcomeIndex,
    refreshAll,
    allowance,
    balance,
    positions,
    addLocalOrder,
    sellIntent,
    setSellIntent,
    bestBid,
    bestAsk,
  } = useBuilder();

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [feeRateBps, setFeeRateBps] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Pick up sell intent from positions panel (market is already selected via selectMarket)
  useEffect(() => {
    if (!sellIntent) return;
    setSide("SELL");
    setOrderType("limit");
    setSize(String(Math.floor(sellIntent.size)));
    setPrice(sellIntent.price.toFixed(2));
    setResult(null);
    setSellIntent(null);
  }, [sellIntent, setSellIntent]);

  if (!selectedMarket) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-center text-sm text-zinc-500">
          Select a market to start trading
        </p>
      </div>
    );
  }

  const outcomes = selectedMarket.outcomes;
  const tokenId = selectedMarket.clobTokenIds[selectedOutcomeIndex] || "";
  const currentPrice = selectedMarket.outcomePrices[selectedOutcomeIndex] || 0;
  const hasValidToken = tokenId.length > 10; // CLOB token IDs are long hex strings

  // Find token balance from positions for the selected outcome
  const tokenPosition = positions.find((p: any) => String(p.asset) === tokenId);
  const tokenBalance = tokenPosition ? Number(tokenPosition.size || tokenPosition.amount || 0) : 0;

  const marketPrice = side === "BUY" ? bestAsk : bestBid;

  const estimatedCost = (() => {
    if (orderType === "limit" && price && size) {
      return (Number(price) * Number(size)).toFixed(2);
    }
    if (orderType === "market" && size) {
      if (marketPrice > 0) {
        return (Number(size) * marketPrice).toFixed(2);
      }
      return "\u2014";
    }
    return "0.00";
  })();

  async function handleSubmit() {
    if (!connected || !creds || !selectedMarket) return;
    if (!hasValidToken) {
      setResult({ success: false, message: `Invalid tokenID: "${tokenId}". Market may not have CLOB token IDs.` });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      console.log("[trade] Submitting order:", {
        orderType, side, tokenId: tokenId.slice(0, 20) + "...",
        price, size, tickSize: selectedMarket.tickSize, negRisk: selectedMarket.negRisk,
      });

      let res: any;
      if (orderType === "limit") {
        res = await placeLimitOrderClient(signerKey, creds, {
          tokenID: tokenId,
          price: Number(price),
          size: Number(size),
          side,
          tickSize: selectedMarket.tickSize,
          negRisk: selectedMarket.negRisk,
          feeRateBps: feeRateBps !== "" ? Number(feeRateBps) : undefined,
        });
      } else {
        res = await placeMarketOrderClient(signerKey, creds, {
          tokenID: tokenId,
          amount: Number(size),
          side,
          tickSize: selectedMarket.tickSize,
          negRisk: selectedMarket.negRisk,
          feeRateBps: feeRateBps !== "" ? Number(feeRateBps) : undefined,
          price: marketPrice > 0 ? marketPrice : undefined,
        });
      }

      console.log("[trade] CLOB response:", JSON.stringify(res));

      // Detect success: must have an orderID
      if (res?.orderID) {
        setResult({
          success: true,
          message: `${orderType === "limit" ? "Order placed" : "Market order filled"}: ${res.orderID.slice(0, 12)}...`,
        });
        // Add to local orders immediately so it appears in Open Orders tab
        if (orderType === "limit") {
          addLocalOrder({
            id: res.orderID,
            status: "LIVE",
            market: selectedMarket.conditionId,
            asset_id: tokenId,
            side,
            original_size: size,
            size_matched: "0",
            price,
            outcome: outcomes[selectedOutcomeIndex] || "",
            created_at: Math.floor(Date.now() / 1000),
            order_type: "GTC",
          });
        }
      } else {
        // Order failed — show the actual error or full response for debugging
        const errMsg = res?.errorMsg || res?.error || res?.message || JSON.stringify(res);
        setResult({
          success: false,
          message: `Order rejected: ${errMsg}`,
        });
      }

      // Refresh immediately, then again after a short delay to catch propagation
      refreshAll();
      setTimeout(() => refreshAll(), 2000);
    } catch (e: any) {
      console.error("[trade] Order error:", e);
      setResult({ success: false, message: e.message || "Order failed" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col p-3">
      {/* Outcome selector */}
      <div className="mb-3 flex gap-1.5">
        {outcomes.map((outcome, i) => (
          <button
            key={i}
            onClick={() => setSelectedOutcomeIndex(i)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
              selectedOutcomeIndex === i
                ? i === 0
                  ? "bg-emerald-600 text-white"
                  : "bg-red-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            )}
          >
            {outcome} {(selectedMarket.outcomePrices[i] * 100).toFixed(1)}¢
          </button>
        ))}
      </div>

      {/* Side toggle */}
      <div className="mb-3 flex overflow-hidden rounded-lg border border-zinc-800">
        <button
          onClick={() => setSide("BUY")}
          className={cn(
            "flex-1 py-2 text-xs font-semibold transition-colors",
            side === "BUY"
              ? "bg-emerald-600 text-white"
              : "bg-zinc-900 text-zinc-400 hover:text-zinc-300"
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("SELL")}
          className={cn(
            "flex-1 py-2 text-xs font-semibold transition-colors",
            side === "SELL"
              ? "bg-red-600 text-white"
              : "bg-zinc-900 text-zinc-400 hover:text-zinc-300"
          )}
        >
          Sell
        </button>
      </div>

      {/* Balance display */}
      {connected && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-1.5">
          {side === "BUY" ? (
            <>
              <span className="text-[10px] text-zinc-500">USDC Balance</span>
              <span className="font-mono text-xs font-medium text-emerald-400">${balance}</span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-zinc-500">{outcomes[selectedOutcomeIndex]} Shares</span>
              <span className="font-mono text-xs font-medium text-amber-400">
                {tokenBalance > 0 ? tokenBalance.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0"}
              </span>
            </>
          )}
        </div>
      )}

      {/* Order type toggle */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setOrderType("limit")}
          className={cn(
            "text-xs font-medium transition-colors",
            orderType === "limit" ? "text-white" : "text-zinc-500 hover:text-zinc-400"
          )}
        >
          Limit
        </button>
        <button
          onClick={() => setOrderType("market")}
          className={cn(
            "text-xs font-medium transition-colors",
            orderType === "market" ? "text-white" : "text-zinc-500 hover:text-zinc-400"
          )}
        >
          Market
        </button>
      </div>

      {/* Price input (only for limit orders) */}
      {orderType === "limit" && (
        <div className="mb-3">
          <Label className="mb-1 text-xs text-zinc-500">Price</Label>
          <div className="relative">
            <Input
              type="number"
              step={selectedMarket.tickSize}
              min="0.01"
              max="0.99"
              placeholder={currentPrice.toFixed(2)}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-9 border-zinc-700 bg-zinc-800 pr-8 font-mono text-sm text-zinc-200"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
              ¢
            </span>
          </div>
        </div>
      )}

      {/* Size input */}
      <div className="mb-3">
        <Label className="mb-1 text-xs text-zinc-500">Shares</Label>
        <Input
          type="number"
          step="1"
          min="1"
          placeholder="0"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="h-9 border-zinc-700 bg-zinc-800 font-mono text-sm text-zinc-200"
        />
        {orderType === "market" && (
          <div className="mt-1 text-xs text-zinc-500">
            Market price: {(side === "BUY" ? bestAsk : bestBid) > 0
              ? `${(side === "BUY" ? bestAsk : bestBid).toFixed(4)}\u00A2`
              : "No orders available"}
          </div>
        )}
      </div>

      {/* Max Fee (bps) */}
      <div className="mb-3">
        <Label className="mb-1 text-xs text-zinc-500">Max Fee (bps)</Label>
        <div className="relative">
          <Input
            type="number"
            step="1"
            min="0"
            max="10000"
            placeholder="100"
            value={feeRateBps}
            onChange={(e) => setFeeRateBps(e.target.value)}
            className="h-9 border-zinc-700 bg-zinc-800 pr-16 font-mono text-sm text-zinc-200"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
            {feeRateBps ? (Number(feeRateBps) / 100).toFixed(2) : "0.00"}%
          </span>
        </div>
      </div>

      {/* Estimated cost */}
      <div className="mb-4 flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2">
        <span className="text-xs text-zinc-500">Est. Cost</span>
        <span className="font-mono text-sm font-medium text-zinc-300">
          {estimatedCost === "\u2014" ? "\u2014" : `$${estimatedCost}`}
        </span>
      </div>

      {/* Warnings */}
      {!hasValidToken && (
        <div className="mb-2 rounded-lg bg-amber-900/30 px-3 py-1.5 text-[10px] text-amber-400">
          No valid CLOB token ID for this outcome. Raw: &quot;{tokenId || "(empty)"}&quot;
        </div>
      )}
      {connected && allowance === "0" && (
        <div className="mb-2 rounded-lg bg-red-900/30 px-3 py-2 text-[10px] text-red-400">
          <strong>Approvals needed:</strong> Your proxy wallet has not approved the exchange contracts to spend USDC.e.
          Go to the Approvals panel above and click &quot;Approve All&quot; before placing orders.
        </div>
      )}

      {/* Submit button */}
      <Button
        onClick={handleSubmit}
        disabled={!connected || submitting || !size || !hasValidToken || (orderType === "limit" && !price)}
        className={cn(
          "w-full font-semibold",
          side === "BUY"
            ? "bg-emerald-600 hover:bg-emerald-500"
            : "bg-red-600 hover:bg-red-500"
        )}
      >
        {submitting
          ? "Placing order..."
          : !connected
            ? "Connect wallet to trade"
            : `${side === "BUY" ? "Buy" : "Sell"} ${outcomes[selectedOutcomeIndex]}`}
      </Button>

      {/* Result message */}
      {result && (
        <div
          className={cn(
            "mt-3 rounded-lg px-3 py-2 text-xs",
            result.success
              ? "bg-emerald-900/30 text-emerald-400"
              : "bg-red-900/30 text-red-400"
          )}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
