"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getRelayerWalletBalances,
  withdrawFromRelayerWallet,
  type AssetBalance,
  type WalletBalances,
  type WithdrawAsset,
  type WithdrawResult,
} from "@/lib/admin/actions";

type Props = {
  dpmUrl: string;
  walletId: number | null;
  walletAddress?: string;
  isActive: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after a successful withdraw so the parent can refresh its table.
  onWithdrawSuccess?: () => void;
};

const statusColor: Record<WithdrawResult["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  MINED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  REVERTED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function RelayerWalletWithdrawDialog({
  dpmUrl,
  walletId,
  walletAddress,
  isActive,
  open,
  onOpenChange,
  onWithdrawSuccess,
}: Props) {
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [asset, setAsset] = useState<WithdrawAsset>("POL");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(""); // human-readable input
  const [useMax, setUseMax] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [result, setResult] = useState<WithdrawResult | null>(null);

  const refresh = useCallback(async () => {
    if (walletId == null) return;
    setLoadingBalances(true);
    setBalanceError(null);
    const res = await getRelayerWalletBalances(dpmUrl, walletId);
    setLoadingBalances(false);
    if (res.success) {
      setBalances(res.data);
    } else {
      setBalanceError(res.error);
    }
  }, [dpmUrl, walletId]);

  // Refresh balances when the dialog opens on a new wallet.
  useEffect(() => {
    if (open && walletId != null) {
      setResult(null);
      setWithdrawError(null);
      setTo("");
      setAmount("");
      setUseMax(false);
      setAsset("POL");
      refresh();
    }
  }, [open, walletId, refresh]);

  const selected: AssetBalance | undefined =
    asset === "POL" ? balances?.pol : balances?.collateral;

  function formatMaxHuman(b: AssetBalance | undefined): string {
    if (!b) return "—";
    return normalizeBigIntToHuman(b.max_withdrawable_raw, b.decimals);
  }

  async function handleSubmit() {
    if (walletId == null) return;
    if (!to.trim()) {
      setWithdrawError("destination address is required");
      return;
    }
    setSubmitting(true);
    setWithdrawError(null);
    setResult(null);

    const payload: { asset: WithdrawAsset; to: string; amount_raw?: string; max?: boolean } = {
      asset,
      to: to.trim(),
    };
    if (useMax) {
      payload.max = true;
    } else {
      if (!selected) {
        setWithdrawError("balances not loaded");
        setSubmitting(false);
        return;
      }
      const raw = humanToRaw(amount, selected.decimals);
      if (raw == null) {
        setWithdrawError(`invalid amount; use decimals up to ${selected.decimals} places`);
        setSubmitting(false);
        return;
      }
      payload.amount_raw = raw;
    }

    const res = await withdrawFromRelayerWallet(dpmUrl, walletId, payload);
    setSubmitting(false);
    if (res.success) {
      setResult(res.data);
      refresh();
      onWithdrawSuccess?.();
    } else {
      setWithdrawError(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Withdraw from relayer wallet</DialogTitle>
          <DialogDescription>
            {walletAddress ? (
              <span className="font-mono text-xs break-all">{walletAddress}</span>
            ) : (
              "Select a wallet"
            )}
          </DialogDescription>
        </DialogHeader>

        {isActive && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            This wallet is currently <strong>active</strong>. Deactivate it first — the relayer pool
            manages its nonce, and a manual withdraw will race the broadcast pipeline.
          </div>
        )}

        {/* Balances */}
        <div className="space-y-2 rounded-md border border-zinc-200 p-3 text-xs dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="font-medium">Balances</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={refresh}
              disabled={loadingBalances || walletId == null}
            >
              {loadingBalances ? "…" : "Refresh"}
            </Button>
          </div>
          {balanceError && (
            <p className="rounded-md bg-red-50 p-2 text-red-700 dark:bg-red-950 dark:text-red-300">
              {balanceError}
            </p>
          )}
          {balances ? (
            <dl className="grid grid-cols-[100px_1fr] gap-y-1 font-mono">
              <dt className="text-zinc-500">POL</dt>
              <dd>
                {balances.pol.balance_normalized}{" "}
                <span className="text-zinc-400">(max withdraw: {formatMaxHuman(balances.pol)})</span>
              </dd>
              <dt className="text-zinc-500">USDC.e</dt>
              <dd>
                {balances.collateral.balance_normalized}{" "}
                <span className="text-zinc-400">
                  (max: {formatMaxHuman(balances.collateral)})
                </span>
              </dd>
              <dt className="text-zinc-500">Gas reserve</dt>
              <dd className="text-zinc-500">
                {weiToHuman(balances.gas.pol_gas_reservation_wei, 18)} POL @{" "}
                {balances.gas.pol_transfer_gas_limit} gas ·{" "}
                {gweiFromWei(balances.gas.max_fee_per_gas)} gwei max fee
              </dd>
            </dl>
          ) : (
            <p className="text-zinc-400">{loadingBalances ? "Loading…" : "—"}</p>
          )}
        </div>

        {/* Asset selector */}
        <div className="space-y-2">
          <Label className="text-xs">Asset</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["POL", "COLLATERAL"] as WithdrawAsset[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAsset(a);
                  setUseMax(false);
                  setAmount("");
                }}
                className={`rounded-md border p-2 text-left text-xs transition-colors ${
                  asset === a
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="font-medium">{a === "POL" ? "POL (native)" : "USDC.e (collateral)"}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="withdraw-to" className="text-xs">
            Destination address
          </Label>
          <Input
            id="withdraw-to"
            value={to}
            onChange={(e) => setTo(e.target.value.trim())}
            placeholder="0x…"
            className="h-8 font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Amount</Label>
          <div className="flex gap-2">
            <Input
              value={useMax ? `MAX — ${formatMaxHuman(selected)}` : amount}
              onChange={(e) => {
                setUseMax(false);
                setAmount(e.target.value.trim());
              }}
              placeholder={selected ? `up to ${formatMaxHuman(selected)}` : ""}
              className="h-8 font-mono text-xs"
              disabled={useMax}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setUseMax((v) => !v);
                if (!useMax) setAmount("");
              }}
              disabled={!selected}
            >
              {useMax ? "Clear" : "Max"}
            </Button>
          </div>
          {asset === "COLLATERAL" && (
            <p className="text-xs text-zinc-500">
              Gas for the ERC-20 transfer is paid in POL — the wallet needs at least the gas reserve
              in POL above.
            </p>
          )}
          {asset === "POL" && (
            <p className="text-xs text-zinc-500">
              Max nets a {balances ? gweiFromWei(balances.gas.max_fee_per_gas) : "—"} gwei × 21k gas
              reserve so the broadcast won't fail on a base-fee bump.
            </p>
          )}
        </div>

        {withdrawError && (
          <p className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {withdrawError}
          </p>
        )}

        {result && (
          <div className="space-y-1 rounded-md border border-zinc-200 p-3 text-xs dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="font-medium">Withdraw broadcast</span>
              <Badge className={statusColor[result.status]}>{result.status}</Badge>
            </div>
            <dl className="grid grid-cols-[80px_1fr] gap-y-1 font-mono">
              <dt className="text-zinc-500">Tx</dt>
              <dd className="break-all">{result.tx_hash}</dd>
              <dt className="text-zinc-500">Nonce</dt>
              <dd>{result.nonce}</dd>
              <dt className="text-zinc-500">Amount</dt>
              <dd>{result.amount_raw}</dd>
              {result.block_number && (
                <>
                  <dt className="text-zinc-500">Block</dt>
                  <dd>{result.block_number}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting || isActive || !balances || !to || (!useMax && !amount)
            }
          >
            {submitting ? "Broadcasting…" : "Withdraw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- helpers ---

function normalizeBigIntToHuman(raw: string, decimals: number): string {
  if (!raw) return "0";
  try {
    const ZERO = BigInt(0);
    const TEN = BigInt(10);
    const bi = BigInt(raw);
    if (bi === ZERO) return "0";
    const neg = bi < ZERO;
    const abs = neg ? -bi : bi;
    const base = TEN ** BigInt(decimals);
    const whole = abs / base;
    const frac = abs % base;
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    const out = fracStr ? `${whole}.${fracStr}` : whole.toString();
    return neg ? `-${out}` : out;
  } catch {
    return raw;
  }
}

function weiToHuman(wei: string, decimals: number): string {
  return normalizeBigIntToHuman(wei, decimals);
}

function gweiFromWei(wei: string): string {
  try {
    const bi = BigInt(wei);
    const gwei = bi / BigInt(1_000_000_000);
    return gwei.toString();
  } catch {
    return "?";
  }
}

// humanToRaw converts a decimal string like "1.25" into the integer base-units
// string ("1250000000000000000" for 18 decimals). Returns null on bad input
// or when the fraction has more digits than `decimals` (caller can show msg).
function humanToRaw(s: string, decimals: number): string | null {
  const t = s.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  if (frac.length > decimals) return null;
  const fracPadded = frac.padEnd(decimals, "0");
  const combined = (whole + fracPadded).replace(/^0+/, "") || "0";
  try {
    return BigInt(combined).toString();
  } catch {
    return null;
  }
}
