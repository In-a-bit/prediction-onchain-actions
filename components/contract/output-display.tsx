"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { formatUnits } from "ethers";
import type { FunctionResult } from "@/lib/contracts/types";

interface OutputDisplayProps {
  result: FunctionResult;
  decimals?: number;
}

export function OutputDisplay({ result, decimals }: OutputDisplayProps) {
  const [readable, setReadable] = useState(false);

  if (result.status === "idle") return null;

  if (result.status === "loading") {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        Executing...
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        {result.error}
      </div>
    );
  }

  const isNumeric = /^\d+$/.test(result.data);
  const showReadableToggle = isNumeric && decimals !== undefined && decimals > 0;

  return (
    <div className="mt-2 rounded bg-green-50 p-2 dark:bg-green-950">
      {result.txHash && (
        <div className="mb-1 flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            TX
          </Badge>
          <a
            href={`https://amoy.polygonscan.com/tx/${result.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {result.txHash.slice(0, 10)}...{result.txHash.slice(-8)}
          </a>
        </div>
      )}
      <div className="flex items-center gap-2">
        <pre className="whitespace-pre-wrap text-sm text-green-800 dark:text-green-200">
          {showReadableToggle && readable
            ? formatReadable(result.data, decimals!)
            : result.data}
        </pre>
        {showReadableToggle && (
          <Toggle
            size="sm"
            pressed={readable}
            onPressedChange={setReadable}
            className="h-5 px-2 text-xs"
          >
            {readable ? "readable" : "raw"}
          </Toggle>
        )}
      </div>
    </div>
  );
}

function formatReadable(value: string, decimals: number): string {
  try {
    return formatUnits(BigInt(value), decimals);
  } catch {
    return value;
  }
}
