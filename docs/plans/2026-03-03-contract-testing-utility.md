# Contract Testing Utility — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web utility to test Polymarket contract infrastructure — each contract gets a page where all read/write functions can be invoked with human-readable inputs/outputs and admin or override private key signing.

**Architecture:** Next.js App Router with Server Actions for all blockchain calls (keeps private keys server-side). A generic `ContractPage` component parses any TypeChain factory ABI and renders all functions dynamically. Contract registry maps routes to factories, addresses, and admin keys.

**Tech Stack:** Next.js 16, React 19, TypeScript, ethers.js v6, TypeChain, shadcn/ui + Radix, Tailwind CSS v4

---

## Phase 0: Project Setup

### Task 0.1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install shadcn/ui and runtime dependencies**

```bash
# Move ethers to dependencies (it's runtime, not dev-only)
npm install ethers@^6.16.0

# Install shadcn/ui dependencies
npx shadcn@latest init
# Choose: New York style, Zinc base color, CSS variables: yes

# Install core shadcn components we'll need
npx shadcn@latest add button input label card collapsible badge separator scroll-area toggle tooltip
```

**Step 2: Verify build works**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: install shadcn/ui and move ethers to dependencies"
```

---

## Phase 1: Shared Infrastructure

### Task 1.1: Contract Registry

**Files:**
- Create: `lib/contracts/registry.ts`
- Create: `lib/contracts/types.ts`

**Step 1: Create contract types**

```typescript
// lib/contracts/types.ts
import type { InterfaceAbi } from "ethers";

export interface ContractConfig {
  name: string;
  slug: string;
  factory: { abi: InterfaceAbi; connect: (address: string, runner?: any) => any };
  addressEnv: string;
  adminKeyEnv: string | null;
  adminAddressEnv: string | null;
  description: string;
}

// ABI function parsed for UI rendering
export interface ParsedFunction {
  name: string;
  inputs: ParsedParam[];
  outputs: ParsedParam[];
  stateMutability: "view" | "pure" | "nonpayable" | "payable";
  isRead: boolean;
}

export interface ParsedParam {
  name: string;
  type: string;             // e.g. "uint256", "address", "tuple", "bytes32"
  internalType?: string;
  components?: ParsedParam[]; // for tuple/struct types
  indexed?: boolean;
}

export type FunctionResult =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: string; txHash?: string }
  | { status: "error"; error: string };
```

**Step 2: Create contract registry**

```typescript
// lib/contracts/registry.ts
import { Erc20Abi__factory } from "@/types/contracts/factories/Erc20Abi__factory";
import { CTFExchange__factory } from "@/types/contracts/factories/CTFExchange__factory";
import { ConditionalTokens__factory } from "@/types/contracts/factories/ConditionalTokens__factory";
import { FeeModule__factory } from "@/types/contracts/factories/FeeModule__factory";
import { ManagedOptimisticOracleV2Abi__factory } from "@/types/contracts/factories/ManagedOptimisticOracleV2Abi__factory";
import { OracleWhitelistAbi__factory } from "@/types/contracts/factories/OracleWhitelistAbi__factory";
import { ProxyWalletFactoryAbi__factory } from "@/types/contracts/factories/ProxyWalletFactoryAbi__factory";
import type { ContractConfig } from "./types";

export const contracts: Record<string, ContractConfig> = {
  collateral: {
    name: "ERC20 (Collateral)",
    slug: "collateral",
    factory: Erc20Abi__factory,
    addressEnv: "COLLATERAL_ADDRESS",
    adminKeyEnv: null,
    adminAddressEnv: null,
    description: "ERC20 collateral token used for trading",
  },
  "ctf-exchange": {
    name: "CTF Exchange",
    slug: "ctf-exchange",
    factory: CTFExchange__factory,
    addressEnv: "CTF_EXCHANGE_ADDRESS",
    adminKeyEnv: "CTF_EXCHANGE_ADMIN_PRIVATE_KEY",
    adminAddressEnv: "CTF_EXCHANGE_ADMIN_ADDRESS",
    description: "Conditional Token Framework exchange for order matching",
  },
  "conditional-tokens": {
    name: "Conditional Tokens",
    slug: "conditional-tokens",
    factory: ConditionalTokens__factory,
    addressEnv: "CONDITIONAL_TOKENS_ADDRESS",
    adminKeyEnv: null,
    adminAddressEnv: null,
    description: "ERC1155 conditional tokens for prediction market positions",
  },
  "fee-module": {
    name: "Fee Module",
    slug: "fee-module",
    factory: FeeModule__factory,
    addressEnv: "FEE_MODULE_ADDRESS",
    adminKeyEnv: "FEE_MODULE_ADMIN_PRIVATE_KEY",
    adminAddressEnv: "FEE_MODULE_ADMIN_ADDRESS",
    description: "Trading fee collection and management",
  },
  oracle: {
    name: "Managed Optimistic Oracle",
    slug: "oracle",
    factory: ManagedOptimisticOracleV2Abi__factory,
    addressEnv: "MANAGED_OPTIMISTIC_ORACLE_PROXY_ADDRESS",
    adminKeyEnv: "MANAGED_OPTIMISTIC_ORACLE_PROXY_OWNER_PRIVATE_KEY",
    adminAddressEnv: "MANAGED_OPTIMISTIC_ORACLE_PROXY_OWNER_ADDRESS",
    description: "UMA optimistic oracle for outcome resolution",
  },
  "oracle-whitelist": {
    name: "Oracle Whitelist",
    slug: "oracle-whitelist",
    factory: OracleWhitelistAbi__factory,
    addressEnv: "ORACLE_WHITELIST_ADDRESS",
    adminKeyEnv: "ORACLE_WHITELIST_OWNER_PRIVATE_KEY",
    adminAddressEnv: "ORACLE_WHITELIST_OWNER_ADDRESS",
    description: "Access control for oracle operations",
  },
  "proxy-wallet-factory": {
    name: "Proxy Wallet Factory",
    slug: "proxy-wallet-factory",
    factory: ProxyWalletFactoryAbi__factory,
    addressEnv: "PROXY_WALLET_FACTORY_ADDRESS",
    adminKeyEnv: null,
    adminAddressEnv: null,
    description: "Factory for creating proxy wallets",
  },
};

export const contractSlugs = Object.keys(contracts);
```

**Step 3: Commit**

```bash
git add lib/contracts/
git commit -m "feat: add contract registry and types"
```

### Task 1.2: ABI Parser Utility

**Files:**
- Create: `lib/contracts/abi-parser.ts`

**Step 1: Create ABI parser that extracts functions from any factory ABI**

```typescript
// lib/contracts/abi-parser.ts
import type { ParsedFunction, ParsedParam } from "./types";

interface AbiItem {
  type: string;
  name?: string;
  inputs?: AbiParam[];
  outputs?: AbiParam[];
  stateMutability?: string;
}

interface AbiParam {
  name: string;
  type: string;
  internalType?: string;
  components?: AbiParam[];
  indexed?: boolean;
}

export function parseAbi(abi: readonly any[]): {
  readFunctions: ParsedFunction[];
  writeFunctions: ParsedFunction[];
} {
  const functions: ParsedFunction[] = [];

  for (const item of abi as AbiItem[]) {
    if (item.type !== "function") continue;

    const isRead = item.stateMutability === "view" || item.stateMutability === "pure";

    functions.push({
      name: item.name!,
      inputs: (item.inputs || []).map(parseParam),
      outputs: (item.outputs || []).map(parseParam),
      stateMutability: item.stateMutability as ParsedFunction["stateMutability"],
      isRead,
    });
  }

  // Sort alphabetically within each group
  const readFunctions = functions.filter((f) => f.isRead).sort((a, b) => a.name.localeCompare(b.name));
  const writeFunctions = functions.filter((f) => !f.isRead).sort((a, b) => a.name.localeCompare(b.name));

  return { readFunctions, writeFunctions };
}

function parseParam(param: AbiParam): ParsedParam {
  return {
    name: param.name || "",
    type: param.type,
    internalType: param.internalType,
    components: param.components?.map(parseParam),
    indexed: param.indexed,
  };
}

/**
 * Check if a type is numeric (uint/int variants) — used for decimal toggle
 */
export function isNumericType(type: string): boolean {
  return /^u?int\d*$/.test(type);
}

/**
 * Check if a type is an address
 */
export function isAddressType(type: string): boolean {
  return type === "address";
}

/**
 * Check if a type is bytes
 */
export function isBytesType(type: string): boolean {
  return type === "bytes" || /^bytes\d+$/.test(type);
}

/**
 * Check if a type is a tuple (struct)
 */
export function isTupleType(type: string): boolean {
  return type === "tuple" || type === "tuple[]";
}

/**
 * Check if a type is an array
 */
export function isArrayType(type: string): boolean {
  return type.endsWith("[]") && type !== "tuple[]";
}
```

**Step 2: Commit**

```bash
git add lib/contracts/abi-parser.ts
git commit -m "feat: add ABI parser utility"
```

### Task 1.3: Contract Interaction Server Actions

**Files:**
- Create: `lib/contracts/actions.ts`

**Step 1: Create server actions for read/write calls**

```typescript
// lib/contracts/actions.ts
"use server";

import { JsonRpcProvider, Wallet, formatUnits } from "ethers";
import { contracts } from "./registry";

function getProvider() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL not configured");
  return new JsonRpcProvider(rpcUrl);
}

function getSigner(privateKey: string) {
  return new Wallet(privateKey, getProvider());
}

function getAdminKey(contractSlug: string): string | null {
  const config = contracts[contractSlug];
  if (!config?.adminKeyEnv) return null;
  return process.env[config.adminKeyEnv] || null;
}

function getContractAddress(contractSlug: string): string {
  const config = contracts[contractSlug];
  if (!config) throw new Error(`Unknown contract: ${contractSlug}`);
  const address = process.env[config.addressEnv];
  if (!address) throw new Error(`Address not configured: ${config.addressEnv}`);
  return address;
}

export async function callReadFunction(
  contractSlug: string,
  functionName: string,
  args: any[]
): Promise<{ success: true; result: string } | { success: false; error: string }> {
  try {
    const config = contracts[contractSlug];
    if (!config) return { success: false, error: `Unknown contract: ${contractSlug}` };

    const address = getContractAddress(contractSlug);
    const provider = getProvider();
    const contract = config.factory.connect(address, provider);

    const result = await (contract as any)[functionName](...args);
    return { success: true, result: formatResult(result) };
  } catch (error: any) {
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function callWriteFunction(
  contractSlug: string,
  functionName: string,
  args: any[],
  overrideKey?: string
): Promise<
  | { success: true; txHash: string; result: string }
  | { success: false; error: string }
> {
  try {
    const config = contracts[contractSlug];
    if (!config) return { success: false, error: `Unknown contract: ${contractSlug}` };

    const privateKey = overrideKey || getAdminKey(contractSlug);
    if (!privateKey) {
      return {
        success: false,
        error: "No private key available. Provide an override key or configure admin key in .env",
      };
    }

    const address = getContractAddress(contractSlug);
    const signer = getSigner(privateKey);
    const contract = config.factory.connect(address, signer);

    const tx = await (contract as any)[functionName](...args);
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
      result: `Transaction confirmed in block ${receipt.blockNumber}`,
    };
  } catch (error: any) {
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function getContractInfo(contractSlug: string): Promise<{
  address: string;
  adminAddress: string | null;
  hasAdminKey: boolean;
}> {
  const config = contracts[contractSlug];
  if (!config) throw new Error(`Unknown contract: ${contractSlug}`);

  return {
    address: process.env[config.addressEnv] || "Not configured",
    adminAddress: config.adminAddressEnv ? process.env[config.adminAddressEnv] || null : null,
    hasAdminKey: config.adminKeyEnv ? !!process.env[config.adminKeyEnv] : false,
  };
}

function formatResult(result: any): string {
  if (typeof result === "bigint") return result.toString();
  if (typeof result === "boolean") return result.toString();
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    // Handle tuple/struct outputs — ethers returns Result objects with named properties
    if (result.toObject) {
      return JSON.stringify(result.toObject(), bigintReplacer, 2);
    }
    return JSON.stringify(result, bigintReplacer, 2);
  }
  if (typeof result === "object" && result !== null) {
    return JSON.stringify(result, bigintReplacer, 2);
  }
  return String(result);
}

function bigintReplacer(_key: string, value: any): any {
  return typeof value === "bigint" ? value.toString() : value;
}

function extractErrorMessage(error: any): string {
  // Try to get revert reason
  if (error.reason) return `Revert: ${error.reason}`;
  if (error.shortMessage) return error.shortMessage;
  if (error.message) {
    // Truncate very long error messages
    return error.message.length > 500 ? error.message.slice(0, 500) + "..." : error.message;
  }
  return "Unknown error";
}
```

**Step 2: Commit**

```bash
git add lib/contracts/actions.ts
git commit -m "feat: add server actions for contract read/write calls"
```

### Task 1.4: Sidebar Component

**Files:**
- Create: `components/layout/sidebar.tsx`

**Step 1: Create sidebar navigation**

```typescript
// components/layout/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { contracts } from "@/lib/contracts/registry";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">Contract Tester</h1>
        <p className="text-sm text-zinc-500">Polymarket Infrastructure</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {Object.values(contracts).map((contract) => {
          const href = `/${contract.slug}`;
          const isActive = pathname === href;
          return (
            <Link
              key={contract.slug}
              href={href}
              className={cn(
                "mb-1 flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
              )}
            >
              <span
                className={cn(
                  "mr-2 h-2 w-2 rounded-full",
                  isActive ? "bg-green-400" : "bg-zinc-400"
                )}
              />
              {contract.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-200 p-4 text-xs text-zinc-500 dark:border-zinc-800">
        Polygon Amoy Testnet
      </div>
    </aside>
  );
}
```

**Step 2: Commit**

```bash
git add components/layout/sidebar.tsx
git commit -m "feat: add sidebar navigation component"
```

### Task 1.5: Shared UI Components — InputField, OutputDisplay, ReadableToggle

**Files:**
- Create: `components/contract/input-field.tsx`
- Create: `components/contract/output-display.tsx`
- Create: `components/contract/readable-toggle.tsx`

**Step 1: Create InputField — renders the right input for each ABI type**

```typescript
// components/contract/input-field.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import type { ParsedParam } from "@/lib/contracts/types";
import { isNumericType, isTupleType, isArrayType, isBytesType } from "@/lib/contracts/abi-parser";
import { parseUnits } from "ethers";

interface InputFieldProps {
  param: ParsedParam;
  value: string;
  onChange: (value: string) => void;
  decimals?: number; // for readable toggle on numeric fields
}

export function InputField({ param, value, onChange, decimals }: InputFieldProps) {
  const [readable, setReadable] = useState(false);

  // Tuple/struct: render sub-fields
  if (isTupleType(param.type) && param.components) {
    return <TupleInput param={param} value={value} onChange={onChange} decimals={decimals} />;
  }

  // Array: dynamic list of inputs
  if (isArrayType(param.type)) {
    return <ArrayInput param={param} value={value} onChange={onChange} />;
  }

  // Bool
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

  // Numeric with optional readable toggle
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

  // Default: text input
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
            ×
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
```

**Step 2: Create OutputDisplay**

```typescript
// components/contract/output-display.tsx
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

  // Success
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
```

**Step 3: Commit**

```bash
git add components/contract/
git commit -m "feat: add InputField, OutputDisplay, and ReadableToggle components"
```

### Task 1.6: FunctionCard Component

**Files:**
- Create: `components/contract/function-card.tsx`

**Step 1: Create the expandable function card**

```typescript
// components/contract/function-card.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InputField } from "./input-field";
import { OutputDisplay } from "./output-display";
import { callReadFunction, callWriteFunction } from "@/lib/contracts/actions";
import { isNumericType } from "@/lib/contracts/abi-parser";
import { parseUnits } from "ethers";
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

      // Handle tuple: parse JSON object into array of values in component order
      if (input.type === "tuple" && input.components) {
        try {
          const obj = JSON.parse(raw);
          return input.components.map((c) => obj[c.name] || "");
        } catch {
          return raw;
        }
      }

      // Handle arrays: parse JSON array
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

  const hasInputs = fn.inputs.length > 0;
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
```

**Step 2: Commit**

```bash
git add components/contract/function-card.tsx
git commit -m "feat: add FunctionCard component with read/write execution"
```

### Task 1.7: Generic ContractPage Component

**Files:**
- Create: `components/contract/contract-page.tsx`

**Step 1: Create the generic contract page that assembles everything**

```typescript
// components/contract/contract-page.tsx
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FunctionCard } from "./function-card";
import { parseAbi } from "@/lib/contracts/abi-parser";
import { getContractInfo } from "@/lib/contracts/actions";
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

  // Try to fetch decimals for this contract (works for ERC20)
  useEffect(() => {
    const hasDecimalsFunc = readFunctions.some((f) => f.name === "decimals");
    if (hasDecimalsFunc) {
      import("@/lib/contracts/actions").then(({ callReadFunction }) => {
        callReadFunction(config.slug, "decimals", []).then((res) => {
          if (res.success) {
            setDecimals(Number(res.result));
          }
        });
      });
    }
  }, [config.slug, readFunctions]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
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

        {/* Override key input */}
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

      {/* Functions */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Read functions */}
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

        {/* Write functions */}
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
```

**Step 2: Commit**

```bash
git add components/contract/contract-page.tsx
git commit -m "feat: add generic ContractPage component"
```

### Task 1.8: App Layout with Sidebar

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Step 1: Update root layout to include sidebar**

```typescript
// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Contract Tester — Polymarket Infrastructure",
  description: "Test and interact with Polymarket smart contracts on Polygon Amoy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

**Step 2: Update home page to redirect or show overview**

```typescript
// app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/collateral");
}
```

**Step 3: Commit**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "feat: add sidebar layout and redirect home to collateral"
```

---

## Phase 2: ERC20 Collateral Page

### Task 2.1: Create Collateral Route

**Files:**
- Create: `app/collateral/page.tsx`

**Step 1: Create the collateral page using generic ContractPage**

```typescript
// app/collateral/page.tsx
import { contracts } from "@/lib/contracts/registry";
import { ContractPage } from "@/components/contract/contract-page";

export default function CollateralPage() {
  return <ContractPage config={contracts.collateral} />;
}
```

**Step 2: Run dev server and verify**

Run: `npm run dev`
Expected: App loads at localhost:3000, redirects to /collateral, sidebar shows all contracts, ERC20 page renders with:
- Read functions: name, symbol, decimals, totalSupply, balanceOf, allowance
- Write functions: transfer, approve, transferFrom, allocateTo, increaseAllowance, decreaseAllowance
- Private key override field
- Clicking "Query" on name() returns the token name

**Step 3: Commit**

```bash
git add app/collateral/
git commit -m "feat: add ERC20 collateral contract page"
```

---

## Phase 3: CTF Exchange Page

### Task 3.1: Create CTF Exchange Route

**Files:**
- Create: `app/ctf-exchange/page.tsx`

```typescript
// app/ctf-exchange/page.tsx
import { contracts } from "@/lib/contracts/registry";
import { ContractPage } from "@/components/contract/contract-page";

export default function CTFExchangePage() {
  return <ContractPage config={contracts["ctf-exchange"]} />;
}
```

**Verify:** OrderStruct inputs render as expandable fieldsets with named fields (salt, maker, signer, taker, tokenId, etc.)

**Commit:**
```bash
git add app/ctf-exchange/
git commit -m "feat: add CTF Exchange contract page"
```

---

## Phase 4: Conditional Tokens Page

### Task 4.1: Create Conditional Tokens Route

**Files:**
- Create: `app/conditional-tokens/page.tsx`

**Note:** Requires adding `CONDITIONAL_TOKENS_ADDRESS` to `.env` and `.env.example`

```typescript
// app/conditional-tokens/page.tsx
import { contracts } from "@/lib/contracts/registry";
import { ContractPage } from "@/components/contract/contract-page";

export default function ConditionalTokensPage() {
  return <ContractPage config={contracts["conditional-tokens"]} />;
}
```

**Commit:**
```bash
git add app/conditional-tokens/
git commit -m "feat: add Conditional Tokens contract page"
```

---

## Phase 5: Fee Module Page

### Task 5.1: Create Fee Module Route

**Files:**
- Create: `app/fee-module/page.tsx`

```typescript
// app/fee-module/page.tsx
import { contracts } from "@/lib/contracts/registry";
import { ContractPage } from "@/components/contract/contract-page";

export default function FeeModulePage() {
  return <ContractPage config={contracts["fee-module"]} />;
}
```

**Commit:**
```bash
git add app/fee-module/
git commit -m "feat: add Fee Module contract page"
```

---

## Phase 6: Managed Optimistic Oracle Page

### Task 6.1: Create Oracle Route

**Files:**
- Create: `app/oracle/page.tsx`

```typescript
// app/oracle/page.tsx
import { contracts } from "@/lib/contracts/registry";
import { ContractPage } from "@/components/contract/contract-page";

export default function OraclePage() {
  return <ContractPage config={contracts.oracle} />;
}
```

**Commit:**
```bash
git add app/oracle/
git commit -m "feat: add Managed Optimistic Oracle contract page"
```

---

## Phase 7: Oracle Whitelist Page

### Task 7.1: Create Oracle Whitelist Route

**Files:**
- Create: `app/oracle-whitelist/page.tsx`

```typescript
// app/oracle-whitelist/page.tsx
import { contracts } from "@/lib/contracts/registry";
import { ContractPage } from "@/components/contract/contract-page";

export default function OracleWhitelistPage() {
  return <ContractPage config={contracts["oracle-whitelist"]} />;
}
```

**Commit:**
```bash
git add app/oracle-whitelist/
git commit -m "feat: add Oracle Whitelist contract page"
```

---

## Phase 8: Proxy Wallet Factory Page

### Task 8.1: Create Proxy Wallet Factory Route

**Files:**
- Create: `app/proxy-wallet-factory/page.tsx`

```typescript
// app/proxy-wallet-factory/page.tsx
import { contracts } from "@/lib/contracts/registry";
import { ContractPage } from "@/components/contract/contract-page";

export default function ProxyWalletFactoryPage() {
  return <ContractPage config={contracts["proxy-wallet-factory"]} />;
}
```

**Commit:**
```bash
git add app/proxy-wallet-factory/
git commit -m "feat: add Proxy Wallet Factory contract page"
```

---

## Implementation Notes

- **Execution order:** Phase 0 → Phase 1 (all tasks) → Phase 2 → verify → Phase 3-8 (one at a time, verify between each)
- **Each phase after 2 is trivial** — just a one-file route that uses the generic ContractPage. The heavy lifting is all in Phase 1.
- **shadcn/ui `cn` utility** — created automatically by `npx shadcn@latest init` at `lib/utils.ts`
- **The `parseAbi` function reads `factory.abi`** which is the embedded ABI from each TypeChain factory — this is the source of truth for rendering
- **The `factory.connect()` method** creates typed contract instances for actual calls
