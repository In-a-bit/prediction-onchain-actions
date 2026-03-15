"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { computeAddress, formatEther, parseEther } from "ethers";
import {
  fetchContractAddress,
  callWriteFunctionPayable,
  callWriteFunction,
  callReadFunction,
  getWalletInfo,
} from "@/lib/contracts/actions";

type StepStatus = "idle" | "loading" | "success" | "error";

interface StepState {
  status: StepStatus;
  result?: string;
  error?: string;
}

export default function RegisterRelayPage() {
  const [relayPrivateKey, setRelayPrivateKey] = useState("");
  const [ownerPrivateKey, setOwnerPrivateKey] = useState("");
  const [relayAddress, setRelayAddress] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [relayHubAddress, setRelayHubAddress] = useState("");

  // Stake params
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeDelay, setUnstakeDelay] = useState("604800"); // 1 week default

  // Deposit params
  const [depositAmount, setDepositAmount] = useState("");

  // Register params
  const [transactionFee, setTransactionFee] = useState("70");
  const [relayUrl, setRelayUrl] = useState("");

  // Steps
  const [step1, setStep1] = useState<StepState>({ status: "idle" });
  const [step2, setStep2] = useState<StepState>({ status: "idle" });
  const [step3, setStep3] = useState<StepState>({ status: "idle" });

  // Relay info
  const [relayInfo, setRelayInfo] = useState<string | null>(null);
  const [relayBalance, setRelayBalance] = useState<string | null>(null);
  const [ownerBalance, setOwnerBalance] = useState<string | null>(null);

  useEffect(() => {
    fetchContractAddress("relay-hub")
      .then(setRelayHubAddress)
      .catch(() => {});
  }, []);

  // Derive relay address from private key
  useEffect(() => {
    if (relayPrivateKey && relayPrivateKey.length === 66) {
      try {
        setRelayAddress(computeAddress(relayPrivateKey));
      } catch {
        setRelayAddress("");
      }
    } else {
      setRelayAddress("");
    }
  }, [relayPrivateKey]);

  // Derive owner address from private key
  useEffect(() => {
    if (ownerPrivateKey && ownerPrivateKey.length === 66) {
      try {
        setOwnerAddress(computeAddress(ownerPrivateKey));
      } catch {
        setOwnerAddress("");
      }
    } else {
      setOwnerAddress("");
    }
  }, [ownerPrivateKey]);

  const canStep1 =
    ownerPrivateKey &&
    relayAddress &&
    stakeAmount &&
    unstakeDelay &&
    step1.status !== "loading";

  const canStep2 =
    ownerPrivateKey &&
    relayAddress &&
    depositAmount &&
    step2.status !== "loading";

  const canStep3 =
    relayPrivateKey &&
    transactionFee &&
    relayUrl &&
    step3.status !== "loading";

  async function handleStake() {
    setStep1({ status: "loading" });
    try {
      const valueWei = parseEther(stakeAmount).toString();
      const result = await callWriteFunctionPayable(
        "relay-hub",
        "stake",
        [relayAddress, unstakeDelay],
        valueWei,
        ownerPrivateKey
      );
      if (result.success) {
        setStep1({ status: "success", result: result.txHash });
        refreshRelayInfo();
      } else {
        setStep1({ status: "error", error: result.error });
      }
    } catch (e: any) {
      setStep1({ status: "error", error: e.message || "Unknown error" });
    }
  }

  async function handleDeposit() {
    setStep2({ status: "loading" });
    try {
      const valueWei = parseEther(depositAmount).toString();
      const result = await callWriteFunctionPayable(
        "relay-hub",
        "depositFor",
        [relayAddress],
        valueWei,
        ownerPrivateKey
      );
      if (result.success) {
        setStep2({ status: "success", result: result.txHash });
        refreshRelayInfo();
      } else {
        setStep2({ status: "error", error: result.error });
      }
    } catch (e: any) {
      setStep2({ status: "error", error: e.message || "Unknown error" });
    }
  }

  async function handleRegister() {
    setStep3({ status: "loading" });
    try {
      const result = await callWriteFunction(
        "relay-hub",
        "registerRelay",
        [BigInt(transactionFee).toString(), relayUrl],
        relayPrivateKey
      );
      if (result.success) {
        setStep3({ status: "success", result: result.txHash });
        refreshRelayInfo();
      } else {
        setStep3({ status: "error", error: result.error });
      }
    } catch (e: any) {
      setStep3({ status: "error", error: e.message || "Unknown error" });
    }
  }

  async function refreshRelayInfo() {
    if (!relayAddress) return;
    try {
      const [info, balance] = await Promise.all([
        callReadFunction("relay-hub", "getRelay", [relayAddress]),
        callReadFunction("relay-hub", "balanceOf", [relayAddress]),
      ]);
      if (info.success) setRelayInfo(info.result);
      if (balance.success) setRelayBalance(balance.result);
    } catch {}
  }

  async function loadWalletBalances() {
    const promises: Promise<void>[] = [];
    if (ownerPrivateKey) {
      promises.push(
        getWalletInfo(ownerPrivateKey).then((res) => {
          if (res.success) setOwnerBalance(formatEther(BigInt(res.balance)));
        })
      );
    }
    if (relayPrivateKey) {
      promises.push(
        getWalletInfo(relayPrivateKey).then((res) => {
          if (res.success) {
            // Also refresh relay info when loading balances
            refreshRelayInfo();
          }
        })
      );
    }
    await Promise.all(promises);
  }

  function statusBadge(status: StepStatus) {
    switch (status) {
      case "idle":
        return <Badge variant="secondary">Pending</Badge>;
      case "loading":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            Loading...
          </Badge>
        );
      case "success":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            Success
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            Error
          </Badge>
        );
    }
  }

  const relayStates = ["Unknown", "Staked", "Registered", "Removed"];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-2xl font-bold">Register Relay</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Register a relay address on the GSN RelayHub — stake, deposit, and
          register in sequence
        </p>
        {relayHubAddress && (
          <p className="mt-1 font-mono text-xs text-zinc-400">
            RelayHub: {relayHubAddress}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Keys & Addresses */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h3 className="text-lg font-semibold">Keys & Addresses</h3>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <Label className="text-sm font-medium">
                  Relay Private Key
                </Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  The relay&apos;s own key — used in Step 3 to call{" "}
                  <code className="text-xs">registerRelay()</code>. The derived
                  address becomes the relay address.
                </p>
                <Input
                  type="password"
                  placeholder="0x..."
                  value={relayPrivateKey}
                  onChange={(e) => setRelayPrivateKey(e.target.value.trim())}
                  className="font-mono text-sm"
                />
                {relayAddress && (
                  <p className="mt-1 font-mono text-xs text-zinc-500">
                    Relay Address: {relayAddress}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium">
                  Owner Private Key
                </Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  The owner who stakes for the relay — used in Steps 1 & 2.
                  Can be the same as the relay key.
                </p>
                <Input
                  type="password"
                  placeholder="0x..."
                  value={ownerPrivateKey}
                  onChange={(e) => setOwnerPrivateKey(e.target.value.trim())}
                  className="font-mono text-sm"
                />
                {ownerAddress && (
                  <p className="mt-1 font-mono text-xs text-zinc-500">
                    Owner Address: {ownerAddress}
                  </p>
                )}
              </div>

              <Button
                variant="outline"
                onClick={loadWalletBalances}
                disabled={!relayPrivateKey && !ownerPrivateKey}
                className="w-full"
              >
                Load Wallet Info
              </Button>

              {ownerBalance !== null && (
                <p className="text-xs text-zinc-500">
                  Owner Balance: {ownerBalance} POL
                </p>
              )}
            </div>
          </div>

          {/* Relay Status */}
          {relayInfo && (
            <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Relay Status</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshRelayInfo}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
              <div className="space-y-2 p-6">
                <code className="block whitespace-pre-wrap break-all rounded bg-zinc-100 px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                  {relayInfo}
                </code>
                {relayBalance && (
                  <p className="text-xs text-zinc-500">
                    Relay Hub Balance: {formatEther(BigInt(relayBalance))} POL
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 1: Stake */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Step 1: Stake</h3>
                {statusBadge(step1.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Owner stakes POL for the relay address. Calls{" "}
                <code className="text-xs">stake(relay, unstakeDelay)</code> with
                msg.value.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">
                    Stake Amount (POL)
                  </Label>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    Native POL to stake
                  </p>
                  <Input
                    placeholder="1.0"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value.trim())}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">
                    Unstake Delay (seconds)
                  </Label>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    Default: 604800 (1 week)
                  </p>
                  <Input
                    placeholder="604800"
                    value={unstakeDelay}
                    onChange={(e) => setUnstakeDelay(e.target.value.trim())}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <Button
                onClick={handleStake}
                disabled={!canStep1}
                className="w-full"
              >
                {step1.status === "loading" ? "Staking..." : "Stake for Relay"}
              </Button>

              {step1.status === "error" && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {step1.error}
                </div>
              )}
              {step1.status === "success" && step1.result && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                  <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                    Transaction Hash
                  </Label>
                  <a
                    href={`https://amoy.polygonscan.com/tx/${step1.result}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all font-mono text-xs text-green-700 underline dark:text-green-300"
                  >
                    {step1.result}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Deposit */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Step 2: Deposit for Relay
                </h3>
                {statusBadge(step2.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Deposit POL to the relay&apos;s hub balance. Calls{" "}
                <code className="text-xs">depositFor(target)</code> with
                msg.value.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <Label className="text-sm font-medium">
                  Deposit Amount (POL)
                </Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  Native POL to deposit into the relay&apos;s hub balance
                </p>
                <Input
                  placeholder="1.0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value.trim())}
                  className="font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleDeposit}
                disabled={!canStep2}
                className="w-full"
              >
                {step2.status === "loading"
                  ? "Depositing..."
                  : "Deposit for Relay"}
              </Button>

              {step2.status === "error" && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {step2.error}
                </div>
              )}
              {step2.status === "success" && step2.result && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                  <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                    Transaction Hash
                  </Label>
                  <a
                    href={`https://amoy.polygonscan.com/tx/${step2.result}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all font-mono text-xs text-green-700 underline dark:text-green-300"
                  >
                    {step2.result}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Register */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Step 3: Register Relay
                </h3>
                {statusBadge(step3.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                The relay itself calls{" "}
                <code className="text-xs">
                  registerRelay(transactionFee, url)
                </code>{" "}
                — must be sent from the relay address.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">
                    Transaction Fee (%)
                  </Label>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    Fee percentage charged by the relay (e.g. 70)
                  </p>
                  <Input
                    placeholder="70"
                    value={transactionFee}
                    onChange={(e) => setTransactionFee(e.target.value.trim())}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Relay URL</Label>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    Public URL of the relay server
                  </p>
                  <Input
                    placeholder="https://relay.example.com"
                    value={relayUrl}
                    onChange={(e) => setRelayUrl(e.target.value.trim())}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <Button
                onClick={handleRegister}
                disabled={!canStep3}
                className="w-full"
              >
                {step3.status === "loading"
                  ? "Registering..."
                  : "Register Relay"}
              </Button>

              {step3.status === "error" && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {step3.error}
                </div>
              )}
              {step3.status === "success" && step3.result && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                  <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                    Transaction Hash
                  </Label>
                  <a
                    href={`https://amoy.polygonscan.com/tx/${step3.result}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all font-mono text-xs text-green-700 underline dark:text-green-300"
                  >
                    {step3.result}
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
