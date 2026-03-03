"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FunctionCard } from "./function-card";
import { parseAbi } from "@/lib/contracts/abi-parser";
import { getContractInfo, callReadFunction } from "@/lib/contracts/actions";
import type { ContractConfig } from "@/lib/contracts/types";

interface ContractPageProps {
  config: ContractConfig;
}

export function ContractPage({ config }: ContractPageProps) {
  const [overrideKey, setOverrideKey] = useState("");
  const [info, setInfo] = useState<{
    address: string;
    adminAddress: string | null;
    hasAdminKey: boolean;
  } | null>(null);
  const [decimals, setDecimals] = useState<number | undefined>(undefined);

  const { readFunctions, writeFunctions } = parseAbi(config.factory.abi);

  useEffect(() => {
    getContractInfo(config.slug).then(setInfo);
  }, [config.slug]);

  useEffect(() => {
    const hasDecimalsFunc = readFunctions.some((f) => f.name === "decimals");
    if (hasDecimalsFunc) {
      callReadFunction(config.slug, "decimals", []).then((res) => {
        if (res.success) {
          setDecimals(Number(res.result));
        }
      });
    }
  }, [config.slug, readFunctions]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-2xl font-bold">{config.name}</h2>
        <p className="mt-1 text-sm text-zinc-500">{config.description}</p>

        {info && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-1">
              <span className="text-zinc-500">Address:</span>
              <code className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs dark:bg-zinc-800">
                {info.address}
              </code>
            </div>
            {info.adminAddress && (
              <div className="flex items-center gap-1">
                <span className="text-zinc-500">Admin:</span>
                <code className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs dark:bg-zinc-800">
                  {info.adminAddress.slice(0, 6)}...{info.adminAddress.slice(-4)}
                </code>
                <Badge variant={info.hasAdminKey ? "default" : "destructive"} className="text-xs">
                  {info.hasAdminKey ? "Key available" : "No key"}
                </Badge>
              </div>
            )}
            {decimals !== undefined && (
              <Badge variant="outline" className="text-xs">
                {decimals} decimals
              </Badge>
            )}
          </div>
        )}

        <div className="mt-4 max-w-md">
          <Label className="text-xs text-zinc-500">Private Key Override (optional)</Label>
          <Input
            type="password"
            placeholder="0x... (leave empty to use admin key from .env)"
            value={overrideKey}
            onChange={(e) => setOverrideKey(e.target.value)}
            className="mt-1 font-mono text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {readFunctions.length > 0 && (
          <div className="mb-8">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              Read Functions
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {readFunctions.length}
              </Badge>
            </h3>
            <div className="flex flex-col gap-1">
              {readFunctions.map((fn) => (
                <FunctionCard
                  key={fn.name}
                  contractSlug={config.slug}
                  fn={fn}
                  overrideKey={overrideKey}
                  decimals={decimals}
                />
              ))}
            </div>
          </div>
        )}

        <Separator className="my-4" />

        {writeFunctions.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              Write Functions
              <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                {writeFunctions.length}
              </Badge>
            </h3>
            <div className="flex flex-col gap-1">
              {writeFunctions.map((fn) => (
                <FunctionCard
                  key={fn.name}
                  contractSlug={config.slug}
                  fn={fn}
                  overrideKey={overrideKey}
                  decimals={decimals}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
