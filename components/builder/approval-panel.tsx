"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "./builder-provider";
import {
  checkApprovals,
  approveUSDCForExchange,
  approveUSDCForNegRiskExchange,
  approveUSDCForNegRiskAdapter,
  approveConditionalTokensForExchange,
  approveConditionalTokensForNegRiskExchange,
  approveConditionalTokensForNegRiskAdapter,
  approveAllViaRelayer,
  type ApprovalStatus,
  type TxResult,
} from "@/lib/polymarket/approvals-client";
import { CONTRACTS } from "@/lib/polymarket/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function truncateAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface TxState {
  loading: boolean;
  result: TxResult | null;
}

export function ApprovalPanel({ embedded = false }: { embedded?: boolean }) {
  const { connected, privateKey } = useBuilder();
  const [status, setStatus] = useState<ApprovalStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(embedded);

  const [usdcExchange, setUsdcExchange] = useState<TxState>({ loading: false, result: null });
  const [usdcNegRisk, setUsdcNegRisk] = useState<TxState>({ loading: false, result: null });
  const [usdcNegRiskAdapter, setUsdcNegRiskAdapter] = useState<TxState>({ loading: false, result: null });
  const [ctfExchange, setCtfExchange] = useState<TxState>({ loading: false, result: null });
  const [ctfNegRisk, setCtfNegRisk] = useState<TxState>({ loading: false, result: null });
  const [ctfNegRiskAdapter, setCtfNegRiskAdapter] = useState<TxState>({ loading: false, result: null });
  const [approveAllState, setApproveAllState] = useState<{ loading: boolean; results: TxResult[] }>({
    loading: false,
    results: [],
  });

  const refresh = useCallback(async () => {
    if (!connected || !privateKey) return;
    setChecking(true);
    try {
      const s = await checkApprovals(privateKey);
      setStatus(s);
      if (!s.exchangeApproved || !s.negRiskExchangeApproved || !s.negRiskAdapterApproved || !s.ctfExchangeApproved || !s.ctfNegRiskExchangeApproved || !s.ctfNegRiskAdapterApproved) {
        setExpanded(true);
      }
    } catch {
      // silent
    } finally {
      setChecking(false);
    }
  }, [connected, privateKey]);

  useEffect(() => {
    if (connected) refresh();
  }, [connected, refresh]);

  if (!connected) return null;

  const allApproved = status
    ? status.exchangeApproved &&
      status.negRiskExchangeApproved &&
      status.negRiskAdapterApproved &&
      status.ctfExchangeApproved &&
      status.ctfNegRiskExchangeApproved &&
      status.ctfNegRiskAdapterApproved
    : false;

  const anyLoading =
    usdcExchange.loading ||
    usdcNegRisk.loading ||
    usdcNegRiskAdapter.loading ||
    ctfExchange.loading ||
    ctfNegRisk.loading ||
    ctfNegRiskAdapter.loading ||
    approveAllState.loading;

  async function handleApprove(
    action: (pk: string) => Promise<TxResult>,
    setter: (s: TxState) => void,
  ) {
    setter({ loading: true, result: null });
    try {
      const result = await action(privateKey);
      setter({ loading: false, result });
      if (result.success) refresh();
    } catch (e: any) {
      setter({
        loading: false,
        result: { success: false, error: e?.message || "Transaction failed", method: "direct" },
      });
    }
  }

  async function handleApproveAll() {
    setApproveAllState({ loading: true, results: [] });
    try {
      if (status?.relayerAvailable) {
        const results = await approveAllViaRelayer(privateKey);
        setApproveAllState({ loading: false, results });
        if (results.some((r) => r.success)) refresh();
      } else {
        // Sequential direct approval
        const results: TxResult[] = [];
        if (!status?.exchangeApproved) {
          results.push(await approveUSDCForExchange(privateKey));
        }
        if (!status?.negRiskExchangeApproved) {
          results.push(await approveUSDCForNegRiskExchange(privateKey));
        }
        if (!status?.negRiskAdapterApproved) {
          results.push(await approveUSDCForNegRiskAdapter(privateKey));
        }
        if (!status?.ctfExchangeApproved) {
          results.push(await approveConditionalTokensForExchange(privateKey));
        }
        if (!status?.ctfNegRiskExchangeApproved) {
          results.push(await approveConditionalTokensForNegRiskExchange(privateKey));
        }
        if (!status?.ctfNegRiskAdapterApproved) {
          results.push(await approveConditionalTokensForNegRiskAdapter(privateKey));
        }
        setApproveAllState({ loading: false, results });
        refresh();
      }
    } catch (e: any) {
      setApproveAllState({
        loading: false,
        results: [{ success: false, error: e?.message || "Failed", method: "direct" }],
      });
    }
  }

  const approvalDetails = (
          <div className="space-y-2">
            {checking && !status && (
              <p className="text-xs text-zinc-500">Checking approvals...</p>
            )}

            {status && (
              <>
                {/* Proxy wallet info */}
                <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-500">EOA:</span>
                    <span className="font-mono text-[10px] text-zinc-400">{truncateAddr(status.eoaAddress)}</span>
                  </div>
                  <svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-cyan-500">Proxy:</span>
                    <span className="font-mono text-[10px] text-cyan-400">{status.proxyWalletAddress}</span>
                  </div>
                </div>

                {/* Approve All button */}
                {!allApproved && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-900/50 bg-amber-950/20 p-2.5">
                    <div>
                      <p className="text-xs font-medium text-amber-300">
                        {status.relayerAvailable
                          ? "Approve all via Relayer (gasless, batched)"
                          : "Approve all (requires POL for gas)"}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {status.relayerAvailable
                          ? "Uses proxy wallet — relayer pays gas"
                          : "Sends direct on-chain transactions"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleApproveAll}
                      disabled={anyLoading}
                      className="h-7 bg-amber-600 px-4 text-xs font-semibold hover:bg-amber-500"
                    >
                      {approveAllState.loading ? "Approving..." : "Approve All"}
                    </Button>
                  </div>
                )}

                {/* Batch results */}
                {approveAllState.results.length > 0 && (
                  <div className="space-y-1">
                    {approveAllState.results.map((r, i) => (
                      <TxResultDisplay key={i} result={r} />
                    ))}
                  </div>
                )}

                {/* Individual rows */}
                <ApprovalRow
                  label="USDC.e → CTF Exchange"
                  contract={truncateAddr(CONTRACTS.exchange)}
                  approved={status.exchangeApproved}
                  allowanceDisplay={status.exchangeAllowanceFormatted}
                  txState={usdcExchange}
                  onApprove={() => handleApprove(approveUSDCForExchange, setUsdcExchange)}
                  disabled={anyLoading}
                />
                <ApprovalRow
                  label="USDC.e → NegRisk Exchange"
                  contract={truncateAddr(CONTRACTS.negRiskExchange)}
                  approved={status.negRiskExchangeApproved}
                  allowanceDisplay={status.negRiskExchangeAllowanceFormatted}
                  txState={usdcNegRisk}
                  onApprove={() => handleApprove(approveUSDCForNegRiskExchange, setUsdcNegRisk)}
                  disabled={anyLoading}
                />
                <ApprovalRow
                  label="USDC.e → NegRisk Adapter"
                  contract={truncateAddr(CONTRACTS.negRiskAdapter)}
                  approved={status.negRiskAdapterApproved}
                  allowanceDisplay={status.negRiskAdapterAllowanceFormatted}
                  txState={usdcNegRiskAdapter}
                  onApprove={() => handleApprove(approveUSDCForNegRiskAdapter, setUsdcNegRiskAdapter)}
                  disabled={anyLoading}
                />
                <ApprovalRow
                  label="ConditionalTokens → CTF Exchange"
                  contract={truncateAddr(CONTRACTS.exchange)}
                  approved={status.ctfExchangeApproved}
                  allowanceDisplay={status.ctfExchangeApproved ? "true" : "false"}
                  txState={ctfExchange}
                  onApprove={() => handleApprove(approveConditionalTokensForExchange, setCtfExchange)}
                  isERC1155
                  disabled={anyLoading}
                />
                <ApprovalRow
                  label="ConditionalTokens → NegRisk Exchange"
                  contract={truncateAddr(CONTRACTS.negRiskExchange)}
                  approved={status.ctfNegRiskExchangeApproved}
                  allowanceDisplay={status.ctfNegRiskExchangeApproved ? "true" : "false"}
                  txState={ctfNegRisk}
                  onApprove={() => handleApprove(approveConditionalTokensForNegRiskExchange, setCtfNegRisk)}
                  isERC1155
                  disabled={anyLoading}
                />
                <ApprovalRow
                  label="ConditionalTokens → NegRisk Adapter"
                  contract={truncateAddr(CONTRACTS.negRiskAdapter)}
                  approved={status.ctfNegRiskAdapterApproved}
                  allowanceDisplay={status.ctfNegRiskAdapterApproved ? "true" : "false"}
                  txState={ctfNegRiskAdapter}
                  onApprove={() => handleApprove(approveConditionalTokensForNegRiskAdapter, setCtfNegRiskAdapter)}
                  isERC1155
                  disabled={anyLoading}
                />

                <div className="flex justify-end pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refresh}
                    disabled={checking || anyLoading}
                    className="h-6 text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    {checking ? "Checking..." : "Refresh"}
                  </Button>
                </div>
              </>
            )}
          </div>
  );

  if (embedded) {
    return approvalDetails;
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardContent className="p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          <span className={cn(
            "h-2 w-2 rounded-full",
            !status ? "bg-zinc-600" :
            allApproved ? "bg-emerald-500" : "bg-amber-500"
          )} />
          <span className="text-xs font-medium text-zinc-300">Approvals</span>
          {status && (
            <Badge variant="outline" className={cn("text-[10px]", allApproved ? "border-emerald-800 text-emerald-400" : "border-amber-800 text-amber-400")}>
              {allApproved ? "All Set" : "Action Required"}
            </Badge>
          )}
          <svg className={cn("ml-auto h-3 w-3 text-zinc-500 transition-transform", expanded && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expanded && <div className="mt-3">{approvalDetails}</div>}
      </CardContent>
    </Card>
  );
}

function TxResultDisplay({ result }: { result: TxResult }) {
  return (
    <div
      className={cn(
        "rounded px-2 py-1.5 text-[10px]",
        result.success ? "bg-emerald-950/50 text-emerald-400" : "bg-red-950/50 text-red-400"
      )}
    >
      {result.success ? (
        <span>
          {result.method === "relayer" ? "Relayed" : "Confirmed"}
          {result.relayTxId && (
            <span className="ml-1 text-zinc-500">relay:{result.relayTxId.slice(0, 8)}</span>
          )}
          {result.hash && (
            <>
              {" "}
              <a
                href={`https://polygonscan.com/tx/${result.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline hover:text-emerald-300"
              >
                {result.hash.slice(0, 10)}...{result.hash.slice(-8)}
              </a>
            </>
          )}
        </span>
      ) : (
        <span>{result.error}</span>
      )}
    </div>
  );
}

function ApprovalRow({
  label,
  contract,
  approved,
  allowanceDisplay,
  txState,
  onApprove,
  isERC1155 = false,
  disabled = false,
}: {
  label: string;
  contract: string;
  approved: boolean;
  allowanceDisplay?: string;
  txState: TxState;
  onApprove: () => void;
  isERC1155?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            approved ? "bg-emerald-500" : "bg-amber-500"
          )} />
          <div>
            <span className="text-xs font-medium text-zinc-300">{label}</span>
            <span className="ml-2 font-mono text-[10px] text-zinc-600">{contract}</span>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              isERC1155
                ? "border-blue-800 text-blue-400"
                : "border-violet-800 text-violet-400"
            )}
          >
            {isERC1155 ? "ERC1155" : "ERC20"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {allowanceDisplay && (
            <span className="font-mono text-[10px] text-zinc-500">
              {isERC1155
                ? (approved ? "Approved: true" : "Approved: false")
                : `Allowance: ${allowanceDisplay}`}
            </span>
          )}
          {approved ? (
            <Badge variant="outline" className="border-emerald-800 text-[10px] text-emerald-400">
              Approved
            </Badge>
          ) : (
            <Button
              size="sm"
              onClick={onApprove}
              disabled={txState.loading || disabled}
              className="h-6 bg-amber-600 px-3 text-[10px] hover:bg-amber-500"
            >
              {txState.loading ? "Sending tx..." : isERC1155 ? "setApprovalForAll" : "Approve Max"}
            </Button>
          )}
        </div>
      </div>

      {txState.result && <TxResultDisplay result={txState.result} />}
    </div>
  );
}
