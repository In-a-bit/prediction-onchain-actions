"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InputField } from "./input-field";
import { OutputDisplay } from "./output-display";
import { callReadFunction, callWriteFunction } from "@/lib/contracts/actions";
import { isNumericType } from "@/lib/contracts/abi-parser";
import type { ParsedFunction, FunctionResult } from "@/lib/contracts/types";

interface FunctionCardProps {
  contractSlug: string;
  fn: ParsedFunction;
  overrideKey: string;
  decimals?: number;
}

export function FunctionCard({ contractSlug, fn, overrideKey, decimals }: FunctionCardProps) {
  const [open, setOpen] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<FunctionResult>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  const updateInput = (paramName: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [paramName]: value }));
  };

  const buildArgs = (): any[] => {
    return fn.inputs.map((input) => {
      const raw = inputValues[input.name] || "";

      if (input.type === "tuple" && input.components) {
        try {
          const obj = JSON.parse(raw);
          return input.components.map((c) => obj[c.name] || "");
        } catch {
          return raw;
        }
      }

      if (input.type.endsWith("[]")) {
        try {
          return JSON.parse(raw);
        } catch {
          return [];
        }
      }

      return raw;
    });
  };

  const execute = () => {
    setResult({ status: "loading" });
    startTransition(async () => {
      const args = buildArgs();
      if (fn.isRead) {
        const res = await callReadFunction(contractSlug, fn.name, args);
        if (res.success) {
          setResult({ status: "success", data: res.result });
        } else {
          setResult({ status: "error", error: res.error });
        }
      } else {
        const key = overrideKey || undefined;
        const res = await callWriteFunction(contractSlug, fn.name, args, key);
        if (res.success) {
          setResult({ status: "success", data: res.result, txHash: res.txHash });
        } else {
          setResult({ status: "error", error: res.error });
        }
      }
    });
  };

  const mutabilityColor = fn.isRead
    ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
    : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{fn.name}</span>
          <span className="text-xs text-zinc-500">
            ({fn.inputs.map((i) => `${i.name}: ${i.type}`).join(", ")})
          </span>
        </div>
        <Badge variant="secondary" className={mutabilityColor}>
          {fn.stateMutability}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        <div className="mt-2 flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
          {fn.inputs.map((input) => (
            <InputField
              key={input.name}
              param={input}
              value={inputValues[input.name] || ""}
              onChange={(v) => updateInput(input.name, v)}
              decimals={isNumericType(input.type) ? decimals : undefined}
            />
          ))}

          <Button
            size="sm"
            onClick={execute}
            disabled={isPending}
            className="mt-2 w-fit"
            variant={fn.isRead ? "secondary" : "default"}
          >
            {isPending ? "Executing..." : fn.isRead ? "Query" : "Send Transaction"}
          </Button>

          <OutputDisplay result={result} decimals={decimals} />

          {fn.outputs.length > 0 && result.status === "idle" && (
            <div className="text-xs text-zinc-400">
              Returns: {fn.outputs.map((o) => `${o.name || "_"}: ${o.type}`).join(", ")}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
