"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  id,
  getAddress,
  keccak256,
  solidityPacked,
  isAddress,
} from "ethers";

function deriveProxyWalletAddress(
  factoryAddress: string,
  implementation: string,
  userAddress: string
): string {
  // consData = abi.encodeWithSignature("cloneConstructor(bytes)", new bytes(0))
  const selector = id("cloneConstructor(bytes)").slice(0, 10);
  const consData =
    selector +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    "0000000000000000000000000000000000000000000000000000000000000000";

  const factory = getAddress(factoryAddress).slice(2).toLowerCase();
  const target = getAddress(implementation).slice(2).toLowerCase();

  // Reconstruct the 99-byte clone bytecode
  const bytecode =
    "3d3d606380380380913d393d73" +
    factory +
    "5af4602a57600080fd5b602d8060366000396000f3363d3d373d3d3d363d73" +
    target +
    "5af43d82803e903d91602b57fd5bf3" +
    consData.slice(2);

  const initCodeHash = keccak256("0x" + bytecode);

  // salt = keccak256(abi.encodePacked(msgSender))
  const salt = keccak256(solidityPacked(["address"], [userAddress]));

  // CREATE2: keccak256(0xff ++ factory ++ salt ++ initCodeHash)[12:]
  const hash = keccak256(
    solidityPacked(
      ["bytes1", "address", "bytes32", "bytes32"],
      ["0xff", factoryAddress, salt, initCodeHash]
    )
  );

  return getAddress("0x" + hash.slice(26));
}

export default function UtilsPage() {
  const [factoryAddress, setFactoryAddress] = useState("");
  const [implementation, setImplementation] = useState("");
  const [userAddress, setUserAddress] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const allValid =
    isAddress(factoryAddress) &&
    isAddress(implementation) &&
    isAddress(userAddress);

  function handleCalculate() {
    setError(null);
    setResult(null);
    try {
      const addr = deriveProxyWalletAddress(
        factoryAddress,
        implementation,
        userAddress
      );
      setResult(addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calculation failed");
    }
  }

  function handleCopy() {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-2xl font-bold">Utils</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Utility tools for Polymarket infrastructure
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  ProxyWallet CREATE2 Calculator
                </h3>
                <Badge
                  variant="secondary"
                  className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                >
                  CREATE2
                </Badge>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Derive a ProxyWallet address from the factory, implementation,
                and user address using CREATE2.
              </p>
            </div>

            <div className="space-y-4 p-6">
              <div>
                <Label className="text-sm font-medium">Factory Address</Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  ProxyWalletFactory deployed address
                </p>
                <Input
                  placeholder="0x..."
                  value={factoryAddress}
                  onChange={(e) => setFactoryAddress(e.target.value.trim())}
                  className="font-mono text-sm"
                />
                {factoryAddress && !isAddress(factoryAddress) && (
                  <p className="mt-1 text-xs text-red-500">Invalid address</p>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium">
                  Implementation Address
                </Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  From getImplementation() on the factory
                </p>
                <Input
                  placeholder="0x..."
                  value={implementation}
                  onChange={(e) => setImplementation(e.target.value.trim())}
                  className="font-mono text-sm"
                />
                {implementation && !isAddress(implementation) && (
                  <p className="mt-1 text-xs text-red-500">Invalid address</p>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium">User Address</Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  The wallet owner (msg.sender)
                </p>
                <Input
                  placeholder="0x..."
                  value={userAddress}
                  onChange={(e) => setUserAddress(e.target.value.trim())}
                  className="font-mono text-sm"
                />
                {userAddress && !isAddress(userAddress) && (
                  <p className="mt-1 text-xs text-red-500">Invalid address</p>
                )}
              </div>

              <Button
                onClick={handleCalculate}
                disabled={!allValid}
                className="w-full"
              >
                Calculate ProxyWallet Address
              </Button>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {error}
                </div>
              )}

              {result && (
                <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                  <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                    Derived ProxyWallet Address
                  </Label>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900">
                      {result}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="shrink-0"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
