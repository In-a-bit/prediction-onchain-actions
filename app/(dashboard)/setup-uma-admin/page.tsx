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

type FlagStatus = "unknown" | "yes" | "no";

export default function SetupUmaAdminPage() {
  // Existing caller keys
  const [umaAdapterAdminKey, setUmaAdapterAdminKey] = useState("");
  const [whitelistOwnerKey, setWhitelistOwnerKey] = useState("");
  const [umaAdapterCallerAddress, setUmaAdapterCallerAddress] = useState("");
  const [whitelistCallerAddress, setWhitelistCallerAddress] = useState("");
  const [useSameKey, setUseSameKey] = useState(true);

  // New admin to grant
  const [newAdminAddress, setNewAdminAddress] = useState("");

  // Contract addresses (display-only)
  const [umaAdapterAddress, setUmaAdapterAddress] = useState("");
  const [whitelistAddress, setWhitelistAddress] = useState("");

  // On-chain ownership info
  const [whitelistOwner, setWhitelistOwner] = useState("");

  // Steps
  const [step1, setStep1] = useState<StepState>({ status: "idle" });
  const [step2, setStep2] = useState<StepState>({ status: "idle" });

  // Status of the new admin address
  const [umaAdapterStatus, setUmaAdapterStatus] =
    useState<FlagStatus>("unknown");
  const [whitelistStatus, setWhitelistStatus] = useState<FlagStatus>("unknown");

  // Caller status (sanity check)
  const [umaAdapterCallerIsAdmin, setUmaAdapterCallerIsAdmin] =
    useState<FlagStatus>("unknown");

  useEffect(() => {
    fetchContractAddress("uma-ctf-adapter")
      .then(setUmaAdapterAddress)
      .catch(() => {});
    fetchContractAddress("oracle-whitelist")
      .then(setWhitelistAddress)
      .catch(() => {});
    callReadFunction("oracle-whitelist", "owner", []).then((res) => {
      if (res.success) setWhitelistOwner(res.result);
    });
  }, []);

  // Derive caller addresses from private keys
  useEffect(() => {
    if (umaAdapterAdminKey && umaAdapterAdminKey.length === 66) {
      try {
        setUmaAdapterCallerAddress(computeAddress(umaAdapterAdminKey));
      } catch {
        setUmaAdapterCallerAddress("");
      }
    } else {
      setUmaAdapterCallerAddress("");
    }
  }, [umaAdapterAdminKey]);

  useEffect(() => {
    const key = useSameKey ? umaAdapterAdminKey : whitelistOwnerKey;
    if (key && key.length === 66) {
      try {
        setWhitelistCallerAddress(computeAddress(key));
      } catch {
        setWhitelistCallerAddress("");
      }
    } else {
      setWhitelistCallerAddress("");
    }
  }, [umaAdapterAdminKey, whitelistOwnerKey, useSameKey]);

  const newAdminValid = newAdminAddress.length > 0 && isAddress(newAdminAddress);
  const normalizedNewAdmin = newAdminValid ? getAddress(newAdminAddress) : "";

  const whitelistCallerIsOwner =
    !!whitelistCallerAddress &&
    !!whitelistOwner &&
    getAddress(whitelistCallerAddress) === getAddress(whitelistOwner);

  const refreshStatus = useCallback(async () => {
    const tasks: Promise<void>[] = [];

    if (newAdminValid) {
      tasks.push(
        callReadFunction("uma-ctf-adapter", "isAdmin", [
          normalizedNewAdmin,
        ]).then((res) => {
          if (res.success) {
            setUmaAdapterStatus(res.result === "true" ? "yes" : "no");
          } else {
            setUmaAdapterStatus("unknown");
          }
        })
      );
      tasks.push(
        callReadFunction("oracle-whitelist", "isOnWhitelist", [
          normalizedNewAdmin,
        ]).then((res) => {
          if (res.success) {
            setWhitelistStatus(res.result === "true" ? "yes" : "no");
          } else {
            setWhitelistStatus("unknown");
          }
        })
      );
    }

    if (umaAdapterCallerAddress) {
      tasks.push(
        callReadFunction("uma-ctf-adapter", "isAdmin", [
          umaAdapterCallerAddress,
        ]).then((res) => {
          if (res.success) {
            setUmaAdapterCallerIsAdmin(res.result === "true" ? "yes" : "no");
          } else {
            setUmaAdapterCallerIsAdmin("unknown");
          }
        })
      );
    }

    await Promise.all(tasks);
  }, [newAdminValid, normalizedNewAdmin, umaAdapterCallerAddress]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const canStep1 =
    umaAdapterAdminKey &&
    newAdminValid &&
    step1.status !== "loading" &&
    umaAdapterStatus !== "yes";

  const canStep2 =
    (useSameKey ? umaAdapterAdminKey : whitelistOwnerKey) &&
    newAdminValid &&
    step2.status !== "loading" &&
    whitelistStatus !== "yes";

  async function handleAddUmaAdmin() {
    setStep1({ status: "loading" });
    try {
      const result = await callWriteFunction(
        "uma-ctf-adapter",
        "addAdmin",
        [normalizedNewAdmin],
        umaAdapterAdminKey
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

  async function handleAddToWhitelist() {
    setStep2({ status: "loading" });
    try {
      const key = useSameKey ? umaAdapterAdminKey : whitelistOwnerKey;
      const result = await callWriteFunction(
        "oracle-whitelist",
        "addToWhitelist",
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

  function flagBadge(status: FlagStatus, yesLabel: string, noLabel: string) {
    if (status === "yes")
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          {yesLabel}
        </Badge>
      );
    if (status === "no")
      return (
        <Badge className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {noLabel}
        </Badge>
      );
    return <Badge variant="secondary">Unknown</Badge>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-2xl font-bold">Setup UMA Admin</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Grant a new address admin role on the UMA CTF Adapter and add it to
          the Oracle Whitelist. The UMA CTF Adapter caller must be an existing
          admin; the Oracle Whitelist caller must be the contract&apos;s owner.
        </p>
        <div className="mt-2 space-y-0.5 font-mono text-xs text-zinc-400">
          {umaAdapterAddress && <p>UMA CTF Adapter: {umaAdapterAddress}</p>}
          {whitelistAddress && <p>Oracle Whitelist: {whitelistAddress}</p>}
          {whitelistOwner && <p>Oracle Whitelist Owner: {whitelistOwner}</p>}
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
                  The address that will be granted UMA admin and whitelisted on
                  the oracle.
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
                    ? "Existing Admin / Owner Private Key"
                    : "UMA CTF Adapter Admin Private Key"}
                </Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  {useSameKey
                    ? "Must already be an admin on the UMA CTF Adapter and the owner of the Oracle Whitelist."
                    : "An address that is currently an admin on the UMA CTF Adapter."}
                </p>
                <Input
                  type="password"
                  placeholder="0x..."
                  value={umaAdapterAdminKey}
                  onChange={(e) =>
                    setUmaAdapterAdminKey(e.target.value.trim())
                  }
                  className="font-mono text-sm"
                />
                {umaAdapterCallerAddress && (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="font-mono text-xs text-zinc-500">
                      Caller: {umaAdapterCallerAddress}
                    </p>
                    {flagBadge(
                      umaAdapterCallerIsAdmin,
                      "UMA admin",
                      "Not UMA admin"
                    )}
                  </div>
                )}
                {useSameKey && whitelistCallerAddress && whitelistOwner && (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="font-mono text-xs text-zinc-500">
                      Owner check:
                    </p>
                    {whitelistCallerIsOwner ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Whitelist owner
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        Not whitelist owner
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {!useSameKey && (
                <div>
                  <Label className="text-sm font-medium">
                    Oracle Whitelist Owner Private Key
                  </Label>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    The Oracle Whitelist is Ownable — caller must match{" "}
                    <code className="text-xs">owner()</code>.
                  </p>
                  <Input
                    type="password"
                    placeholder="0x..."
                    value={whitelistOwnerKey}
                    onChange={(e) =>
                      setWhitelistOwnerKey(e.target.value.trim())
                    }
                    className="font-mono text-sm"
                  />
                  {whitelistCallerAddress && (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="font-mono text-xs text-zinc-500">
                        Caller: {whitelistCallerAddress}
                      </p>
                      {whitelistOwner ? (
                        whitelistCallerIsOwner ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Whitelist owner
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            Not whitelist owner
                          </Badge>
                        )
                      ) : (
                        <Badge variant="secondary">Unknown</Badge>
                      )}
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
                    Target Address Status
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
                  <span className="text-sm">UMA CTF Adapter</span>
                  {flagBadge(umaAdapterStatus, "Admin", "Not admin")}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Oracle Whitelist</span>
                  {flagBadge(whitelistStatus, "Whitelisted", "Not whitelisted")}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: UMA CTF Adapter */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Step 1: UMA CTF Adapter addAdmin
                </h3>
                {statusBadge(step1.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Calls{" "}
                <code className="text-xs">
                  UmaCtfAdapter.addAdmin(newAdmin)
                </code>{" "}
                — must be sent by an existing UMA CTF Adapter admin.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <Button
                onClick={handleAddUmaAdmin}
                disabled={!canStep1}
                className="w-full"
              >
                {step1.status === "loading"
                  ? "Adding..."
                  : umaAdapterStatus === "yes"
                    ? "Already Admin on UMA CTF Adapter"
                    : "Add Admin on UMA CTF Adapter"}
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

          {/* Step 2: Oracle Whitelist */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Step 2: Oracle Whitelist addToWhitelist
                </h3>
                {statusBadge(step2.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Calls{" "}
                <code className="text-xs">
                  OracleWhitelist.addToWhitelist(newAdmin)
                </code>{" "}
                — must be sent by the contract&apos;s owner.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <Button
                onClick={handleAddToWhitelist}
                disabled={!canStep2}
                className="w-full"
              >
                {step2.status === "loading"
                  ? "Adding..."
                  : whitelistStatus === "yes"
                    ? "Already on Whitelist"
                    : "Add to Oracle Whitelist"}
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
