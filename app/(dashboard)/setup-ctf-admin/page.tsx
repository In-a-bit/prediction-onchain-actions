"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { computeAddress, isAddress, getAddress } from "ethers";
import {
  fetchContractAddress,
  callWriteFunction,
  callReadFunction,
} from "@/lib/contracts/actions";

type StepStatus = "idle" | "loading" | "success" | "error";

interface StepState {
  status: StepStatus;
  result?: string;
  error?: string;
}

type AdminStatus = "unknown" | "yes" | "no";

export default function SetupCtfAdminPage() {
  // Existing admin keys (callers)
  const [feeModuleAdminKey, setFeeModuleAdminKey] = useState("");
  const [ctfExchangeAdminKey, setCtfExchangeAdminKey] = useState("");
  const [feeModuleCallerAddress, setFeeModuleCallerAddress] = useState("");
  const [ctfExchangeCallerAddress, setCtfExchangeCallerAddress] = useState("");
  const [useSameKey, setUseSameKey] = useState(true);

  // New admin to grant
  const [newAdminAddress, setNewAdminAddress] = useState("");

  // Contract addresses (display-only)
  const [feeModuleAddress, setFeeModuleAddress] = useState("");
  const [ctfExchangeAddress, setCtfExchangeAddress] = useState("");

  // Steps
  const [step1, setStep1] = useState<StepState>({ status: "idle" });
  const [step2, setStep2] = useState<StepState>({ status: "idle" });

  // Current admin status of the new admin address
  const [feeModuleStatus, setFeeModuleStatus] = useState<AdminStatus>("unknown");
  const [ctfExchangeStatus, setCtfExchangeStatus] =
    useState<AdminStatus>("unknown");

  // Caller admin status (sanity check)
  const [feeModuleCallerStatus, setFeeModuleCallerStatus] =
    useState<AdminStatus>("unknown");
  const [ctfExchangeCallerStatus, setCtfExchangeCallerStatus] =
    useState<AdminStatus>("unknown");

  useEffect(() => {
    fetchContractAddress("fee-module").then(setFeeModuleAddress).catch(() => {});
    fetchContractAddress("ctf-exchange")
      .then(setCtfExchangeAddress)
      .catch(() => {});
  }, []);

  // Derive caller addresses from private keys
  useEffect(() => {
    if (feeModuleAdminKey && feeModuleAdminKey.length === 66) {
      try {
        setFeeModuleCallerAddress(computeAddress(feeModuleAdminKey));
      } catch {
        setFeeModuleCallerAddress("");
      }
    } else {
      setFeeModuleCallerAddress("");
    }
  }, [feeModuleAdminKey]);

  useEffect(() => {
    const key = useSameKey ? feeModuleAdminKey : ctfExchangeAdminKey;
    if (key && key.length === 66) {
      try {
        setCtfExchangeCallerAddress(computeAddress(key));
      } catch {
        setCtfExchangeCallerAddress("");
      }
    } else {
      setCtfExchangeCallerAddress("");
    }
  }, [feeModuleAdminKey, ctfExchangeAdminKey, useSameKey]);

  const newAdminValid = newAdminAddress.length > 0 && isAddress(newAdminAddress);
  const normalizedNewAdmin = newAdminValid ? getAddress(newAdminAddress) : "";

  const refreshStatus = useCallback(async () => {
    const tasks: Promise<void>[] = [];

    if (newAdminValid) {
      tasks.push(
        callReadFunction("fee-module", "isAdmin", [normalizedNewAdmin]).then(
          (res) => {
            if (res.success) {
              setFeeModuleStatus(res.result === "true" ? "yes" : "no");
            } else {
              setFeeModuleStatus("unknown");
            }
          }
        )
      );
      tasks.push(
        callReadFunction("ctf-exchange", "isAdmin", [normalizedNewAdmin]).then(
          (res) => {
            if (res.success) {
              setCtfExchangeStatus(res.result === "true" ? "yes" : "no");
            } else {
              setCtfExchangeStatus("unknown");
            }
          }
        )
      );
    }

    if (feeModuleCallerAddress) {
      tasks.push(
        callReadFunction("fee-module", "isAdmin", [feeModuleCallerAddress]).then(
          (res) => {
            if (res.success) {
              setFeeModuleCallerStatus(res.result === "true" ? "yes" : "no");
            } else {
              setFeeModuleCallerStatus("unknown");
            }
          }
        )
      );
    }
    if (ctfExchangeCallerAddress) {
      tasks.push(
        callReadFunction("ctf-exchange", "isAdmin", [
          ctfExchangeCallerAddress,
        ]).then((res) => {
          if (res.success) {
            setCtfExchangeCallerStatus(res.result === "true" ? "yes" : "no");
          } else {
            setCtfExchangeCallerStatus("unknown");
          }
        })
      );
    }

    await Promise.all(tasks);
  }, [
    newAdminValid,
    normalizedNewAdmin,
    feeModuleCallerAddress,
    ctfExchangeCallerAddress,
  ]);

  // Auto-refresh when inputs change
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const canStep1 =
    feeModuleAdminKey &&
    newAdminValid &&
    step1.status !== "loading" &&
    feeModuleStatus !== "yes";

  const canStep2 =
    (useSameKey ? feeModuleAdminKey : ctfExchangeAdminKey) &&
    newAdminValid &&
    step2.status !== "loading" &&
    ctfExchangeStatus !== "yes";

  async function handleAddFeeModuleAdmin() {
    setStep1({ status: "loading" });
    try {
      const result = await callWriteFunction(
        "fee-module",
        "addAdmin",
        [normalizedNewAdmin],
        feeModuleAdminKey
      );
      if (result.success) {
        setStep1({ status: "success", result: result.txHash });
        refreshStatus();
      } else {
        setStep1({ status: "error", error: result.error });
      }
    } catch (e: any) {
      setStep1({ status: "error", error: e.message || "Unknown error" });
    }
  }

  async function handleAddCtfExchangeAdmin() {
    setStep2({ status: "loading" });
    try {
      const key = useSameKey ? feeModuleAdminKey : ctfExchangeAdminKey;
      const result = await callWriteFunction(
        "ctf-exchange",
        "addAdmin",
        [normalizedNewAdmin],
        key
      );
      if (result.success) {
        setStep2({ status: "success", result: result.txHash });
        refreshStatus();
      } else {
        setStep2({ status: "error", error: result.error });
      }
    } catch (e: any) {
      setStep2({ status: "error", error: e.message || "Unknown error" });
    }
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

  function adminBadge(status: AdminStatus) {
    if (status === "yes")
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          Admin
        </Badge>
      );
    if (status === "no")
      return (
        <Badge className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Not admin
        </Badge>
      );
    return <Badge variant="secondary">Unknown</Badge>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-2xl font-bold">Setup CTF Exchange Admin</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Grant a new address admin role on both the Fee Module and CTF Exchange
          contracts. The caller must already be an admin on each contract.
        </p>
        <div className="mt-2 space-y-0.5 font-mono text-xs text-zinc-400">
          {feeModuleAddress && <p>Fee Module: {feeModuleAddress}</p>}
          {ctfExchangeAddress && <p>CTF Exchange: {ctfExchangeAddress}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Inputs */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h3 className="text-lg font-semibold">Inputs</h3>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <Label className="text-sm font-medium">
                  New Admin Address
                </Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  The address that will be granted admin on both contracts.
                </p>
                <Input
                  placeholder="0x..."
                  value={newAdminAddress}
                  onChange={(e) => setNewAdminAddress(e.target.value.trim())}
                  className="font-mono text-sm"
                />
                {newAdminAddress && !newAdminValid && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    Invalid address
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="same-key"
                  type="checkbox"
                  checked={useSameKey}
                  onChange={(e) => setUseSameKey(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="same-key" className="text-sm font-medium">
                  Use the same private key for both contracts
                </Label>
              </div>

              <div>
                <Label className="text-sm font-medium">
                  {useSameKey
                    ? "Existing Admin Private Key"
                    : "Fee Module Admin Private Key"}
                </Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  An address that is currently an admin on
                  {useSameKey ? " both contracts." : " the Fee Module."}
                </p>
                <Input
                  type="password"
                  placeholder="0x..."
                  value={feeModuleAdminKey}
                  onChange={(e) => setFeeModuleAdminKey(e.target.value.trim())}
                  className="font-mono text-sm"
                />
                {feeModuleCallerAddress && (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="font-mono text-xs text-zinc-500">
                      Caller: {feeModuleCallerAddress}
                    </p>
                    {adminBadge(feeModuleCallerStatus)}
                  </div>
                )}
              </div>

              {!useSameKey && (
                <div>
                  <Label className="text-sm font-medium">
                    CTF Exchange Admin Private Key
                  </Label>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    An address that is currently an admin on the CTF Exchange.
                  </p>
                  <Input
                    type="password"
                    placeholder="0x..."
                    value={ctfExchangeAdminKey}
                    onChange={(e) =>
                      setCtfExchangeAdminKey(e.target.value.trim())
                    }
                    className="font-mono text-sm"
                  />
                  {ctfExchangeCallerAddress && (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="font-mono text-xs text-zinc-500">
                        Caller: {ctfExchangeCallerAddress}
                      </p>
                      {adminBadge(ctfExchangeCallerStatus)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Current Status */}
          {newAdminValid && (
            <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    Target Admin Status
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshStatus}
                  >
                    Refresh
                  </Button>
                </div>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  {normalizedNewAdmin}
                </p>
              </div>
              <div className="space-y-2 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Fee Module</span>
                  {adminBadge(feeModuleStatus)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">CTF Exchange</span>
                  {adminBadge(ctfExchangeStatus)}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Fee Module */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Step 1: Fee Module addAdmin
                </h3>
                {statusBadge(step1.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Calls{" "}
                <code className="text-xs">
                  FeeModule.addAdmin(newAdmin)
                </code>{" "}
                — must be sent by an existing Fee Module admin.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <Button
                onClick={handleAddFeeModuleAdmin}
                disabled={!canStep1}
                className="w-full"
              >
                {step1.status === "loading"
                  ? "Adding..."
                  : feeModuleStatus === "yes"
                    ? "Already Admin on Fee Module"
                    : "Add Admin on Fee Module"}
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

          {/* Step 2: CTF Exchange */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Step 2: CTF Exchange addAdmin
                </h3>
                {statusBadge(step2.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Calls{" "}
                <code className="text-xs">
                  CTFExchange.addAdmin(newAdmin)
                </code>{" "}
                — must be sent by an existing CTF Exchange admin.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <Button
                onClick={handleAddCtfExchangeAdmin}
                disabled={!canStep2}
                className="w-full"
              >
                {step2.status === "loading"
                  ? "Adding..."
                  : ctfExchangeStatus === "yes"
                    ? "Already Admin on CTF Exchange"
                    : "Add Admin on CTF Exchange"}
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
        </div>
      </div>
    </div>
  );
}
