"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseEther, formatEther } from "ethers";
import { getWalletInfo, sendNative } from "@/lib/contracts/actions";

export default function SendPage() {
  const [privateKey, setPrivateKey] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [balance, setBalance] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [sendError, setSendError] = useState("");

  async function handleLoadWallet() {
    setWalletLoading(true);
    setWalletError("");
    setWalletAddress("");
    setBalance("");
    const res = await getWalletInfo(privateKey);
    if (res.success) {
      setWalletAddress(res.address);
      setBalance(res.balance);
    } else {
      setWalletError(res.error);
    }
    setWalletLoading(false);
  }

  async function handleRefreshBalance() {
    const res = await getWalletInfo(privateKey);
    if (res.success) {
      setBalance(res.balance);
    }
  }

  async function handleSend() {
    setSending(true);
    setSendError("");
    setTxHash("");
    try {
      const amountWei = parseEther(amount).toString();
      const res = await sendNative(privateKey, destination, amountWei);
      if (res.success) {
        setTxHash(res.txHash);
        handleRefreshBalance();
      } else {
        setSendError(res.error);
      }
    } catch (e: any) {
      setSendError(e.message || "Failed to parse amount");
    }
    setSending(false);
  }

  const formattedBalance = balance ? formatEther(balance) : "";
  const canSend = walletAddress && destination && amount && !sending;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-2xl font-bold">Send POL</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Send native POL on Polygon Amoy testnet
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Wallet */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h3 className="text-lg font-semibold">Wallet</h3>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <Label className="text-sm font-medium">Private Key</Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  Your wallet private key (never sent to any external service)
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="0x..."
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value.trim())}
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    onClick={handleLoadWallet}
                    disabled={!privateKey || walletLoading}
                    className="shrink-0"
                  >
                    {walletLoading ? "Loading..." : "Load"}
                  </Button>
                </div>
              </div>

              {walletError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {walletError}
                </div>
              )}

              {walletAddress && (
                <div className="space-y-3 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                  <div>
                    <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                      Address
                    </Label>
                    <code className="mt-1 block break-all rounded bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900">
                      {walletAddress}
                    </code>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                        Balance
                      </Label>
                      <button
                        onClick={handleRefreshBalance}
                        className="text-xs text-green-700 underline dark:text-green-300"
                      >
                        Refresh
                      </button>
                    </div>
                    <code className="mt-1 block rounded bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900">
                      {formattedBalance} POL
                    </code>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Send */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Send Transaction</h3>
                {!walletAddress && (
                  <Badge variant="secondary">Load wallet first</Badge>
                )}
              </div>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <Label className="text-sm font-medium">Destination</Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  Recipient address
                </p>
                <Input
                  placeholder="0x..."
                  value={destination}
                  onChange={(e) => setDestination(e.target.value.trim())}
                  className="font-mono text-sm"
                  disabled={!walletAddress}
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Amount (POL)</Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  Amount in POL (e.g. 0.1)
                </p>
                <Input
                  type="text"
                  placeholder="0.1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.trim())}
                  className="font-mono text-sm"
                  disabled={!walletAddress}
                />
              </div>

              <Button
                onClick={handleSend}
                disabled={!canSend}
                className="w-full"
              >
                {sending ? "Sending..." : "Send POL"}
              </Button>

              {sendError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {sendError}
                </div>
              )}

              {txHash && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                  <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                    Transaction Hash
                  </Label>
                  <a
                    href={`https://amoy.polygonscan.com/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all font-mono text-xs text-green-700 underline dark:text-green-300"
                  >
                    {txHash}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
