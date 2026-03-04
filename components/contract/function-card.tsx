"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InputField } from "./input-field";
import { OutputDisplay } from "./output-display";
import { callReadFunction, callWriteFunction, encodeFunctionData } from "@/lib/contracts/actions";
import { isNumericType, convertInputToArg } from "@/lib/contracts/abi-parser";
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
  const [encodedData, setEncodedData] = useState<string | null>(null);
  const [encodeError, setEncodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const updateInput = (paramName: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [paramName]: value }));
  };

  const buildArgs = (): any[] => {
    return fn.inputs.map((input) => {
      const raw = inputValues[input.name] || "";
      return convertInputToArg(raw, input);
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

  const encode = () => {
    setEncodedData(null);
    setEncodeError(null);
    setCopied(false);
    startTransition(async () => {
      const args = buildArgs();
      const res = await encodeFunctionData(contractSlug, fn.name, args);
      if (res.success) {
        setEncodedData(res.data);
      } else {
        setEncodeError(res.error);
      }
    });
  };

  const copyToClipboard = async () => {
    if (!encodedData) return;
    await navigator.clipboard.writeText(encodedData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              onClick={execute}
              disabled={isPending}
              variant={fn.isRead ? "secondary" : "default"}
            >
              {isPending ? "Executing..." : fn.isRead ? "Query" : "Send Transaction"}
            </Button>

            {!fn.isRead && (
              <Button
                size="sm"
                variant="outline"
                onClick={encode}
                disabled={isPending}
              >
                Encode
              </Button>
            )}
          </div>

          {/* Encoded calldata display */}
          {encodedData && (
            <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500">Calldata</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={copyToClipboard}
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <pre className="max-h-24 overflow-auto break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {encodedData}
              </pre>
            </div>
          )}

          {encodeError && (
            <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              Encode error: {encodeError}
            </div>
          )}

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
