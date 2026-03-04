"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import type { ParsedParam } from "@/lib/contracts/types";
import { isNumericType, isTupleType, isTupleArrayType, isArrayType } from "@/lib/contracts/abi-parser";
import { parseUnits } from "ethers";

interface InputFieldProps {
  param: ParsedParam;
  value: string;
  onChange: (value: string) => void;
  decimals?: number;
}

export function InputField({ param, value, onChange, decimals }: InputFieldProps) {
  const [readable, setReadable] = useState(false);

  if (isTupleArrayType(param.type) && param.components) {
    return <TupleArrayInput param={param} value={value} onChange={onChange} decimals={decimals} />;
  }

  if (isTupleType(param.type) && param.components) {
    return <TupleInput param={param} value={value} onChange={onChange} decimals={decimals} />;
  }

  if (isArrayType(param.type)) {
    return <ArrayInput param={param} value={value} onChange={onChange} />;
  }

  if (param.type === "bool") {
    return (
      <div className="flex items-center gap-2">
        <Label className="text-xs text-zinc-500">{param.name || param.type}</Label>
        <select
          value={value || "false"}
          onChange={(e) => onChange(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
    );
  }

  if (isNumericType(param.type) && decimals !== undefined) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-zinc-500">
            {param.name || param.type}
            <span className="ml-1 text-zinc-400">({param.type})</span>
          </Label>
          <Toggle
            size="sm"
            pressed={readable}
            onPressedChange={setReadable}
            className="h-5 px-2 text-xs"
          >
            {readable ? "readable" : "raw"}
          </Toggle>
        </div>
        <Input
          type="text"
          placeholder={readable ? `e.g. 100.5 (${decimals} decimals)` : `raw ${param.type} value`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
        />
        {readable && value && (
          <span className="text-xs text-zinc-500">
            Raw: {safeParseUnits(value, decimals)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-zinc-500">
        {param.name || param.type}
        <span className="ml-1 text-zinc-400">({param.type})</span>
      </Label>
      <Input
        type="text"
        placeholder={getPlaceholder(param.type)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-sm"
      />
    </div>
  );
}

function TupleInput({
  param,
  value,
  onChange,
  decimals,
}: InputFieldProps & { param: ParsedParam }) {
  const parsed: Record<string, string> = (() => {
    try { return JSON.parse(value || "{}"); }
    catch { return {}; }
  })();

  const updateField = (fieldName: string, fieldValue: string) => {
    const updated = { ...parsed, [fieldName]: fieldValue };
    onChange(JSON.stringify(updated));
  };

  return (
    <div className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
      <Label className="mb-2 block text-xs font-semibold text-zinc-600">
        {param.name || "struct"} ({param.internalType || "tuple"})
      </Label>
      <div className="flex flex-col gap-2">
        {param.components?.map((comp) => (
          <InputField
            key={comp.name}
            param={comp}
            value={parsed[comp.name] || ""}
            onChange={(v) => updateField(comp.name, v)}
            decimals={isNumericType(comp.type) ? decimals : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function TupleArrayInput({
  param,
  value,
  onChange,
  decimals,
}: InputFieldProps & { param: ParsedParam }) {
  const items: Record<string, string>[] = (() => {
    try { return JSON.parse(value || "[]"); }
    catch { return []; }
  })();

  const addItem = () => {
    const empty: Record<string, string> = {};
    param.components?.forEach((c) => { empty[c.name] = ""; });
    onChange(JSON.stringify([...items, empty]));
  };

  const removeItem = (idx: number) => {
    onChange(JSON.stringify(items.filter((_, i) => i !== idx)));
  };

  const updateItem = (idx: number, updated: Record<string, string>) => {
    const copy = [...items];
    copy[idx] = updated;
    onChange(JSON.stringify(copy));
  };

  return (
    <div className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
      <Label className="mb-2 block text-xs font-semibold text-zinc-600">
        {param.name || "struct[]"} ({param.internalType || "tuple[]"})
      </Label>
      {items.map((item, idx) => (
        <div key={idx} className="mb-2 rounded border border-zinc-300 p-2 dark:border-zinc-600">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-zinc-400">[{idx}]</span>
            <Button variant="ghost" size="sm" className="h-5 px-2 text-xs" onClick={() => removeItem(idx)}>
              x
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {param.components?.map((comp) => (
              <InputField
                key={comp.name}
                param={comp}
                value={item[comp.name] || ""}
                onChange={(v) => updateItem(idx, { ...item, [comp.name]: v })}
                decimals={isNumericType(comp.type) ? decimals : undefined}
              />
            ))}
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem} className="mt-1">
        + Add {param.internalType?.replace("[]", "") || "struct"}
      </Button>
    </div>
  );
}

function ArrayInput({ param, value, onChange }: Omit<InputFieldProps, "decimals">) {
  const items: string[] = (() => {
    try { return JSON.parse(value || "[]"); }
    catch { return []; }
  })();

  const baseType = param.type.replace("[]", "");

  const addItem = () => onChange(JSON.stringify([...items, ""]));
  const removeItem = (idx: number) => onChange(JSON.stringify(items.filter((_, i) => i !== idx)));
  const updateItem = (idx: number, val: string) => {
    const updated = [...items];
    updated[idx] = val;
    onChange(JSON.stringify(updated));
  };

  return (
    <div className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
      <Label className="mb-2 block text-xs font-semibold text-zinc-600">
        {param.name || param.type} ({param.type})
      </Label>
      {items.map((item, idx) => (
        <div key={idx} className="mb-1 flex items-center gap-2">
          <Input
            type="text"
            placeholder={`${baseType} [${idx}]`}
            value={item}
            onChange={(e) => updateItem(idx, e.target.value)}
            className="font-mono text-sm"
          />
          <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}>
            x
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem} className="mt-1">
        + Add item
      </Button>
    </div>
  );
}

function getPlaceholder(type: string): string {
  if (type === "address") return "0x...";
  if (type.startsWith("bytes")) return "0x...";
  if (isNumericType(type)) return "0";
  return "";
}

function safeParseUnits(value: string, decimals: number): string {
  try {
    return parseUnits(value, decimals).toString();
  } catch {
    return "invalid";
  }
}
