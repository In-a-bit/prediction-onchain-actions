"use client";

import { useState, useCallback } from "react";
import { useBuilder } from "./builder-provider";
import { depositToProxy } from "@/lib/polymarket/actions";
import { ApprovalPanel } from "./approval-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function truncateAddress(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUSDC(raw: string) {
  const num = Number(raw) / 1e6;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPOL(raw: string) {
  const num = Number(raw) / 1e18;
  return num.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

function CopyableBadge({
  address,
  label,
  className,
}: {
  address: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [address]);

  return (
    <Badge
      variant="outline"
      onClick={handleCopy}
      className={cn(
        "cursor-pointer font-mono text-[10px] transition-colors hover:bg-zinc-800",
        className
      )}
      title={`Click to copy: ${address}`}
    >
      {copied ? "Copied!" : `${label ? `${label}: ` : ""}${truncateAddress(address)}`}
    </Badge>
  );
}

export function WalletPanel() {
  const {
    connected,
    address,
    privateKey,
    isMetaMask,
    balance,
    allowance,
    polBalance,
    walletBalances,
    connecting,
    error,
    connect,
    connectMM,
    disconnect,
    refreshBalance,
  } = useBuilder();
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshBalance();
    } finally {
      setRefreshing(false);
    }
  }, [refreshBalance]);

  if (connected) {
    const wb = walletBalances;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
        {/* Status + Addresses */}
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
        {isMetaMask && (
          <Badge variant="outline" className="border-orange-800 text-[10px] text-orange-400">MM</Badge>
        )}
        <CopyableBadge address={address} className="border-zinc-700 text-zinc-300" />
        {wb && (
          <CopyableBadge address={wb.proxyAddress} label="Proxy" className="border-cyan-800 text-cyan-400" />
        )}

        <div className="h-4 w-px bg-zinc-700" />

        {/* Inline balances */}
        {wb && (
          <>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-500">EOA:</span>
              <span className="text-xs font-semibold text-white">${formatUSDC(wb.eoaUsdcBalance)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-cyan-500">Proxy:</span>
              <span className="text-xs font-semibold text-white">${formatUSDC(wb.proxyUsdcBalance)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-500">CLOB:</span>
              <span className="text-xs font-semibold text-emerald-400">${balance}</span>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-7 text-[10px] text-zinc-400 hover:text-white"
          >
            {refreshing ? "..." : "Refresh"}
          </Button>

          {/* Manage drawer — deposit + approvals */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 hover:bg-zinc-700"
              >
                Manage
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[420px] overflow-y-auto border-zinc-800 bg-zinc-950 sm:max-w-[420px]">
              <SheetHeader>
                <SheetTitle className="text-sm text-zinc-200">Wallet Management</SheetTitle>
                <SheetDescription className="text-xs text-zinc-500">
                  Deposit USDC.e, manage approvals, and view detailed balances.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-4">
                {/* Detailed balances */}
                {wb && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-zinc-400">Balances</h3>
                    <div className="space-y-1.5">
                      <BalanceRow
                        label="EOA"
                        usdc={formatUSDC(wb.eoaUsdcBalance)}
                        pol={formatPOL(wb.eoaPolBalance)}
                      />
                      <BalanceRow
                        label="Proxy"
                        usdc={formatUSDC(wb.proxyUsdcBalance)}
                        pol={formatPOL(wb.proxyPolBalance)}
                        highlight
                      />
                      <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                        <span className="text-[10px] font-medium text-zinc-500">CLOB Balance</span>
                        <span className="text-sm font-semibold text-emerald-400">${balance} USDC</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Deposit */}
                {wb && !isMetaMask && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-zinc-400">Deposit to Proxy</h3>
                    <DepositSection
                      privateKey={privateKey}
                      eoaUsdcBalance={wb.eoaUsdcBalance}
                      proxyAddress={wb.proxyAddress}
                      proxyUsdcBalance={wb.proxyUsdcBalance}
                      onDeposited={handleRefresh}
                    />
                  </div>
                )}

                {/* Approvals */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-400">Contract Approvals</h3>
                  <ApprovalPanel embedded />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="sm"
            onClick={disconnect}
            className="h-7 text-[10px] text-red-400 hover:text-red-300"
          >
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-600" />
          <span className="text-xs text-zinc-400">Not connected</span>
        </div>
        <div className="h-4 w-px bg-zinc-700" />
        <div className="flex flex-1 items-center gap-2">
          <Input
            type={showKey ? "text" : "password"}
            placeholder="Enter private key (0x...)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && key.trim()) connect(key.trim());
            }}
            className="h-7 flex-1 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-300 placeholder:text-zinc-600"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowKey(!showKey)}
            className="h-7 text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            {showKey ? "Hide" : "Show"}
          </Button>
          <Button
            size="sm"
            onClick={() => connect(key.trim())}
            disabled={connecting || !key.trim()}
            className="h-7 bg-emerald-600 text-xs hover:bg-emerald-500"
          >
            {connecting ? "..." : "Connect"}
          </Button>
          <div className="h-4 w-px bg-zinc-700" />
          <Button
            variant="outline"
            size="sm"
            onClick={connectMM}
            disabled={connecting}
            className="h-7 border-zinc-700 bg-zinc-800 text-xs text-orange-400 hover:bg-zinc-700 hover:text-orange-300"
          >
            {connecting ? "..." : "MetaMask"}
          </Button>
        </div>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

function BalanceRow({
  label,
  usdc,
  pol,
  highlight,
}: {
  label: string;
  usdc: string;
  pol: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border px-3 py-2",
        highlight
          ? "border-cyan-900/50 bg-cyan-950/20"
          : "border-zinc-800 bg-zinc-950"
      )}
    >
      <span
        className={cn(
          "text-[10px] font-medium",
          highlight ? "text-cyan-500" : "text-zinc-500"
        )}
      >
        {label}
      </span>
      <div className="flex items-center gap-3">
        <div>
          <span className="text-sm font-semibold text-white">${usdc}</span>
          <span className="ml-1 text-[10px] text-zinc-500">USDC</span>
        </div>
        <div className="h-3 w-px bg-zinc-700" />
        <div>
          <span className="text-xs text-purple-300">{pol}</span>
          <span className="ml-1 text-[10px] text-zinc-500">POL</span>
        </div>
      </div>
    </div>
  );
}

function DepositSection({
  privateKey,
  eoaUsdcBalance,
  proxyAddress,
  proxyUsdcBalance,
  onDeposited,
}: {
  privateKey: string;
  eoaUsdcBalance: string;
  proxyAddress: string;
  proxyUsdcBalance: string;
  onDeposited: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const eoaUsdc = Number(eoaUsdcBalance) / 1e6;
  const hasEoaBalance = eoaUsdc > 0;

  async function handleDeposit() {
    if (!amount || Number(amount) <= 0) return;
    setDepositing(true);
    setResult(null);
    try {
      const res = await depositToProxy(privateKey, amount);
      if (res.success) {
        setResult({
          success: true,
          message: `Deposited ${amount} USDC.e → Proxy. Tx: ${res.hash?.slice(0, 10)}...`,
        });
        setAmount("");
        onDeposited();
      } else {
        setResult({ success: false, message: res.error || "Deposit failed" });
      }
    } catch (e: any) {
      setResult({ success: false, message: e?.message || "Deposit failed" });
    } finally {
      setDepositing(false);
    }
  }

  return (
    <div className="rounded-lg border border-cyan-900/50 bg-cyan-950/10 p-2.5">
      <p className="text-[10px] text-zinc-500">
        Transfer USDC.e from EOA to proxy ({proxyAddress.slice(0, 6)}...{proxyAddress.slice(-4)})
      </p>
      <div className="mt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={depositing || !hasEoaBalance}
            className="h-8 border-zinc-700 bg-zinc-800 pr-16 font-mono text-xs text-zinc-200"
          />
          <button
            onClick={() => setAmount(eoaUsdc.toFixed(2))}
            disabled={!hasEoaBalance}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-600 hover:text-zinc-300"
          >
            MAX
          </button>
        </div>
        <span className="text-[10px] text-zinc-500">
          Avail: {eoaUsdc.toFixed(2)}
        </span>
        <Button
          size="sm"
          onClick={handleDeposit}
          disabled={depositing || !amount || Number(amount) <= 0 || !hasEoaBalance}
          className="h-8 bg-cyan-600 px-4 text-xs font-semibold hover:bg-cyan-500"
        >
          {depositing ? "Sending..." : "Deposit"}
        </Button>
      </div>
      {!hasEoaBalance && (
        <p className="mt-1.5 text-[10px] text-amber-400">
          No USDC.e in EOA wallet. Send USDC.e to your EOA first.
        </p>
      )}
      {result && (
        <div
          className={cn(
            "mt-2 rounded px-2 py-1.5 text-[10px]",
            result.success ? "bg-emerald-950/50 text-emerald-400" : "bg-red-950/50 text-red-400"
          )}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
